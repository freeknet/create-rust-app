#!/usr/bin/env node
type Task = { id: string, title: string, owns: string[], depends: string[], gate?: string | undefined, model?: string | undefined, effort?: string | undefined, body: string };
type Row = { id: string, title: string, state: 'waiting'|'running'|'gating'|'merged'|'failed'|'skipped',
  started?: number, ended?: number, events: number, commands: number, files: number,
  tokens: number, last: string, error?: string, thread?: string, limited?: boolean, run: string };
/**
 * swarm — fan tasks out to parallel Codex workers, one git worktree each.
 *
 *   node tools/swarm/swarm.mjs run [ids...] [-j 3] [--model M] [--effort medium] [--base main]
 *                                  [--repairs 2] [--max-used 85] [--force] [--dry]
 *   node tools/swarm/swarm.mjs status            last run's table
 *   node tools/swarm/swarm.mjs log <id>          worker's final report
 *   node tools/swarm/swarm.mjs retry <id> "<feedback>"   resume that worker's thread with feedback
 *   node tools/swarm/swarm.mjs clean             remove worktrees (keeps branches)
 *   node tools/swarm/swarm.mjs quota             plan usage windows (reads the account; spends nothing)
 *   node tools/swarm/swarm.mjs prepare <id>      create the task's worktree (for a non-Codex worker)
 *   node tools/swarm/swarm.mjs finish <id>       ownership check + gate + commit + merge a worktree
 *
 * Task files: tools/swarm/tasks/<id>.md with frontmatter
 *   ---
 *   title: Short title
 *   model: gpt-6.1-sol                             # optional (default: workhorse tier)
 *   effort: medium                                 # optional: low|medium|high|xhigh
 *   owns: [templates/gui/**, test/gui.test.js]    # globs the worker may change
 *   depends: [engine]                              # wait for these; branch from integration
 *   gate: node scripts/scaffold-check.mjs rustaman # run by the orchestrator after the worker
 *   ---
 *   <prompt body>
 *
 * Flow per task: worktree `.swarm/wt/<id>` on branch `swarm/<id>` from the integration branch
 * (`swarm/integration`, created from --base) → `codex exec` (workspace-write, network on, JSONL
 * events + last message captured) → orchestrator checks the diff stays inside `owns` → runs the
 * gate → commits → merges into `swarm/integration`. Dependents start once their deps merged.
 * Nothing touches the base branch: review `swarm/integration` and merge it yourself.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, unlinkSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { readQuota, describeQuota, usedPercent } from './quota.ts';
import type { Quota } from './quota.ts';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TASKS = join(ROOT, 'tools', 'swarm', 'tasks');
const STATE = join(ROOT, '.swarm');
const INTEGRATION = 'swarm/integration';

// ─── colour ────────────────────────────────────────────────────────────────
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
/** @param {number} h */
function hsl(h: number, s: number = 0.95, l: number = 0.66) {
  const k = (/** @type {number} */ n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n: number) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
/** @param {string} s @param {number} h */
const hue = (s: string, h: number) => (COLOR ? `\x1b[38;2;${hsl(h % 360).join(';')}m${s}\x1b[0m` : s);
/** @param {string} s @param {number} [off] */
const rainbow = (s: string, off: number | undefined = 0) => (COLOR ? [...s].map((c: string, i: number) => hue(c, i * 9 + off)).join('') : s);
const dim = (/** @type {string} */ s: string) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (/** @type {string} */ s: string) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const SPIN = '⣾⣽⣻⢿⡿⣟⣯⣷';

// ─── tasks ─────────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string, title: string, owns: string[], depends: string[], gate?: string, model?: string, effort?: string, body: string }} Task
 * @returns {Task[]}
 */
function loadTasks() {
  if (!existsSync(TASKS)) return [];
  return readdirSync(TASKS).filter((f: string) => f.endsWith('.md')).sort().map((f: string) => {
    const raw = readFileSync(join(TASKS, f), 'utf8').replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`${f}: missing frontmatter`);
    /** @type {Record<string, any>} */
    const fm: Record<string, string | string[]> = {};
    for (const line of (m[1] ?? '').split('\n')) {
      const kv = /^(\w+):\s*(.*)$/.exec(line);
      if (!kv || kv[1] === undefined || kv[2] === undefined) continue;
      const v = kv[2].trim();
      fm[kv[1]] = v.startsWith('[') ? v.slice(1, -1).split(',').map((s: string) => s.trim()).filter(Boolean) : v;
    }
    return { id: f.replace(/^\d+-/, '').replace(/\.md$/, ''), title: typeof fm.title === 'string' ? fm.title : f, owns: Array.isArray(fm.owns) ? fm.owns : [], depends: Array.isArray(fm.depends) ? fm.depends : [], gate: typeof fm.gate === 'string' ? fm.gate : undefined, model: typeof fm.model === 'string' ? fm.model : undefined, effort: typeof fm.effort === 'string' ? fm.effort : undefined, body: (m[2] ?? '').trim() };
  });
}

/** @param {string} glob */
function globRe(glob: string) {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*');
  return new RegExp(`^${re}$`);
}

// ─── git ───────────────────────────────────────────────────────────────────
/** @param {string[]} args @param {string} [cwd] */
function git(args: string[], cwd: string | undefined = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} (in ${cwd}): ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const gitOk = (/** @type {string[]} */ args: string[], cwd: string = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8' }).status === 0;

/**
 * Remove a worktree dir under .swarm/wt. The node_modules link points at the MAIN checkout's
 * node_modules, so it is unlinked first and nothing here ever recursively deletes through it.
 */
function removeWorktreeDir(wt: string): void {
  if (!existsSync(wt)) return;
  const nm = join(wt, 'node_modules');
  try {
    if (lstatSync(nm).isSymbolicLink()) {
      try { unlinkSync(nm); } catch { rmdirSync(nm); } // junctions need rmdir on some Windows builds
    }
  } catch { /* no link */ }
  gitOk(['worktree', 'remove', '--force', wt]);
  if (existsSync(nm)) throw new Error(`refusing to delete ${wt}: ${nm} is still present`);
  if (existsSync(wt)) rmSync(wt, { recursive: true, force: true });
  git(['worktree', 'prune']);
}

/** @param {Task} t */
function prepareWorktree(t: Task) {
  const wt = join(STATE, 'wt', t.id);
  const branch = `swarm/${t.id}`;
  removeWorktreeDir(wt);
  git(['worktree', 'prune']);
  git(['branch', '-f', branch, INTEGRATION]);
  git(['worktree', 'add', wt, branch]);
  if (existsSync(join(ROOT, 'node_modules'))) {
    // Share installed deps with the worktree (junction works without admin on Windows).
    spawnSync(process.platform === 'win32' ? 'cmd' : 'ln',
      process.platform === 'win32' ? ['/c', 'mklink', '/J', join(wt, 'node_modules'), join(ROOT, 'node_modules')] : ['-s', join(ROOT, 'node_modules'), join(wt, 'node_modules')],
      { stdio: 'ignore' });
  }
  return { wt, branch };
}

/** Changed paths in a worktree vs its branch tip (tracked + untracked, excluding ignored). */
function changedPaths(wt: string): string[] {
  // Not via git(): it trims, which eats the leading status column of the first line (" M x" → "M x").
  const r = spawnSync('git', ['status', '--porcelain', '-uall', '--no-renames'], { cwd: wt, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git status in ${wt}: ${r.stderr}`);
  return r.stdout.split('\n').filter((l) => l.length > 3).map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .filter((p) => p !== 'node_modules' && !p.startsWith('.npm-cache/'));
}

// ─── prompt ────────────────────────────────────────────────────────────────
// The preamble is byte-identical for every worker and comes first, so Codex's prompt cache serves it
// to workers 2..N at ~10% of the input price. Everything task-specific goes after it.
const PREAMBLE = `You are one of several Codex workers building \`create-rust-app\` in parallel. Each worker owns a
disjoint set of paths in its own git worktree (your working directory), and an orchestrator verifies
and merges the results.

Ground rules:
- Read AGENTS.md, docs/PLAN.md and docs/CONTRACTS.md first. The core engine (src/engine, src/context,
  src/presets, src/gen) exists and is tested; read it to see exactly how templates render.
- Reference repos (read-only): C:\\Users\\ADUPU\\Documents\\Development\\rustaman and
  C:\\Users\\ADUPU\\Documents\\Development\\strobe.
- Create or modify ONLY the paths your task owns. Never commit, switch branches or merge (.git is
  read-only for you anyway); the orchestrator commits after checking ownership and running the gate.
- Run what checks you can. The Windows sandbox may refuse to let Node spawn child processes
  (\`spawn EPERM\`), which blocks \`node --test\` and the cargo-driven gate scripts: don't fight it or try
  to escape it. Verify what you can directly (e.g. \`cargo check\` in a scaffolded dir), then finish.
  The orchestrator runs the real gate outside the sandbox and resumes you with any failure log.
- Be economical: read what you need, don't re-read large files, don't narrate.
- Your final message must be the JSON report the output schema asks for.

──────────────────────────────── task ────────────────────────────────
`;

/** @param {Task} t */
function promptFor(t: Task) {
  return `${PREAMBLE}
Task: ${t.title} (id: ${t.id})
Owned paths: ${t.owns.map((o: string) => '`' + o + '`').join(', ')}
Gate: ${t.gate ?? '(none)'}

${t.body}
`;
}

const SCHEMA = join(ROOT, 'tools', 'swarm', 'report.schema.json');

/** The worker's structured final report, if it wrote one. */
function readReport(file: string): { status?: string; summary?: string } | null {
  try { return JSON.parse(readFileSync(file, 'utf8')) as { status?: string; summary?: string }; } catch { return null; }
}

// ─── run ───────────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string, title: string, state: 'waiting'|'running'|'gating'|'merged'|'failed'|'skipped',
 *   started?: number, ended?: number, events: number, commands: number, files: number,
 *   tokens: number, last: string, error?: string, thread?: string, run: string }} Row
 */

/** @param {Task} t @param {Row} row @param {{ model?: string, effort: string, runDir: string, resume?: { thread: string, feedback: string } }} o */
function runCodex(t: Task, row: Row, o: { model?: string; effort: string; runDir: string; resume?: { thread: string; feedback: string; }; }) {
  return new Promise<number>((resolveP) => {
    const wt = join(STATE, 'wt', t.id);
    const home = homedir();
    const args = ['exec'];
    // ~/.cargo and ~/.rustup: cargo writes its registry cache and toolchains there (outside the
    // workspace). .git is deliberately NOT writable: workers don't commit.
    const roots = [join(home, '.cargo'), join(home, '.rustup')];
    if (o.resume) {
      // `exec resume` takes no -C/-s/--add-dir: cwd comes from the spawn, sandbox from config keys.
      args.push('resume', o.resume.thread, '-c', 'sandbox_mode="workspace-write"',
        '-c', `sandbox_workspace_write.writable_roots=${JSON.stringify(roots)}`);
    } else {
      args.push('-C', wt, '-s', 'workspace-write', '--add-dir', roots[0] ?? '', '--add-dir', roots[1] ?? '');
    }
    args.push('--json', '-o', join(o.runDir, `${t.id}.last.md`),
      '-c', 'approval_policy="never"',
      '-c', 'sandbox_workspace_write.network_access=true',
      '-c', `model_reasoning_effort="${t.effort ?? o.effort}"`);
    // Windows: the elevated sandbox needs a one-time provisioning step that can break (codex doctor:
    // "elevated Windows sandbox provisioning recorded a structured failure"), after which every shell
    // call fails with "setup refresh had errors". The unelevated backend needs no provisioning;
    // its network isolation is weaker, which doesn't matter here (workers get network anyway).
    if (process.platform === 'win32') args.push('-c', `windows.sandbox="${process.env['SWARM_WINDOWS_SANDBOX'] ?? 'unelevated'}"`);
    if (!o.resume) args.push('--output-schema', SCHEMA);
    const model = t.model ?? o.model;
    if (model !== undefined) args.push('-m', model);
    args.push('-');
    const log = createWriteStream(join(o.runDir, `${t.id}.jsonl`), { flags: 'a' });
    const child = spawn('codex', args, { cwd: wt, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(o.resume ? o.resume.feedback : promptFor(t));
    let buf = '';
    child.stdout.on('data', (d: Buffer) => {
      log.write(d);
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('{')) continue;
        try {
          const ev = JSON.parse(line);
          row.events++;
          if (ev.type === 'thread.started') row.thread = ev.thread_id;
          if (ev.type === 'turn.completed' && ev.usage) row.tokens += (ev.usage.input_tokens ?? 0) + (ev.usage.output_tokens ?? 0);
          const it = ev.item;
          if (it && (ev.type === 'item.started' || ev.type === 'item.completed')) {
            if (it.type === 'command_execution') {
              if (ev.type === 'item.started') row.commands++;
              row.last = `$ ${String(it.command ?? '').replace(/\s+/g, ' ')}`;
            } else if (it.type === 'file_change') {
              row.files += ev.type === 'item.completed' ? (it.changes?.length ?? 1) : 0;
              row.last = `✎ ${(it.changes ?? []).map((c: { path: string }) => c.path).join(', ')}`;
            } else if (it.type === 'agent_message' || it.type === 'reasoning') {
              row.last = String(it.text ?? '').split('\n').find(Boolean) ?? row.last;
            }
          }
          if (ev.type === 'error' || ev.type === 'turn.failed') {
            row.last = `! ${ev.message ?? ev.error?.message ?? 'error'}`;
            if (/usage limit|rate limit/i.test(row.last)) row.limited = true;
          }
        } catch { /* partial or non-JSON line */ }
      }
    });
    child.stderr.on('data', (d: unknown) => log.write(d));
    child.on('close', (code: number | null) => { log.end(); resolveP(code ?? 1); });
  });
}

/** @param {string} cmd @param {string} cwd @param {string} logFile */
function runGate(cmd: string, cwd: string, logFile: string) {
  return new Promise<number>((res) => {
    const log = createWriteStream(logFile);
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, NO_COLOR: '1', CARGO_TERM_COLOR: 'never' } });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('close', (code: number | null) => { log.end(); res(code ?? 1); });
  });
}

/** @param {Task} t @param {Row} row */
async function finish(t: Task, row: Row) {
  const wt = join(STATE, 'wt', t.id);
  const changed = changedPaths(wt);
  if (!changed.length) throw new Error('worker changed nothing');
  const res = t.owns.map(globRe);
  const outside = changed.filter((p: string) => !res.some((r: RegExp) => r.test(p)));
  if (outside.length) throw new Error(`edited outside owned paths: ${outside.slice(0, 6).join(', ')}${outside.length > 6 ? ' …' : ''}`);
  if (t.gate) {
    row.state = 'gating';
    row.last = `gate: ${t.gate}`;
    const logFile = join(STATE, 'runs', row.run, `${t.id}.gate.log`);
    const code = await runGate(t.gate, wt, logFile);
    if (code !== 0) throw Object.assign(new Error(`gate failed (see .swarm/runs/${row.run}/${t.id}.gate.log)`), { gateLog: logFile });
  }
  git(['add', '-A', '--', ...changed], wt);
  // Commits use the repo owner's own git identity: workers are tools, not authors.
  git(['commit', '-qm', `feat(${t.id}): ${t.title}`], wt);
  // Merge into integration from the main checkout's perspective without touching its working tree.
  const integWt = join(STATE, 'wt', '_integration');
  if (!existsSync(integWt)) git(['worktree', 'add', integWt, INTEGRATION]);
  if (!gitOk(['merge', '--no-ff', '-qm', `merge swarm/${t.id}`, `swarm/${t.id}`], integWt)) {
    git(['merge', '--abort'], integWt);
    throw new Error('merge conflict into swarm/integration');
  }
}

/** @param {Row[]} rows @param {number} frame */
let swarmQuota: Quota | null = null;
function render(rows: Row[], frame: number) {
  const w = Math.max(60, process.stdout.columns ?? 100);
  const now = Date.now();
  const q = swarmQuota;
  const lines = [rainbow('◆ swarm', frame * 6) + dim(` · ${rows.filter((r: Row) => r.state === 'merged').length}/${rows.length} merged · codex × ${rows.filter((r: Row) => r.state === 'running').length} live${q ? ` · ${Math.round(usedPercent(q))}% of plan window used` : ''}`), ''];
  for (const [i, r] of rows.entries()) {
    const secs = r.started ? Math.round(((r.ended ?? now) - r.started) / 1000) : 0;
    const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const icon = { waiting: dim('○'), running: hue(SPIN[(frame + i) % SPIN.length] ?? '-', frame * 8 + i * 50), gating: hue('◐', 50), merged: hue('✔', 140), failed: hue('✖', 350), skipped: dim('⊘') }[r.state];
    const stats = dim(`${t.padStart(5)} ${String(r.commands).padStart(3)}$ ${String(r.files).padStart(3)}✎ ${(r.tokens / 1000).toFixed(0).padStart(5)}k`);
    const head = `${icon} ${hue(r.id.padEnd(14), i * 47)} ${stats} `;
    const note = (r.error ?? r.last ?? '').replace(/\s+/g, ' ');
    lines.push(head + dim(note.slice(0, Math.max(10, w - 48))));
  }
  return lines;
}

async function cmdRun(/** @type {string[]} */ argv: string[]) {
  const ids = argv.filter((a: string, i: number) => !a.startsWith('-') && !['-j', '--model', '--effort', '--base'].includes(argv[i - 1] ?? ''));
  const opt = (/** @type {string} */ f: string, /** @type {string} */ d: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] ?? d : d; };
  const jobs = Number(opt('-j', '3'));
  // Defaults are the workhorse tier, not the frontier model in ~/.codex/config.toml:
  // parallel workers multiply cost, so tasks opt up per-task via `model:` / `effort:` frontmatter.
  const effort = opt('--effort', 'medium');
  const model = opt('--model', 'gpt-6.1-sol');
  const base = opt('--base', 'main');
  const repairs = Number(opt('--repairs', '2'));
  const maxUsed = Number(opt('--max-used', '85'));
  let tasks = loadTasks();
  if (ids.length) tasks = tasks.filter((t: Task) => ids.includes(t.id));
  if (!tasks.length) { console.error('no tasks'); process.exit(2); }
  if (argv.includes('--dry')) {
    for (const t of tasks) console.log(`${t.id.padEnd(14)} ${t.model ?? model}/${t.effort ?? effort} deps=[${t.depends}] owns=[${t.owns}] gate=${t.gate ?? '-'}`);
    return;
  }
  if (git(['status', '--porcelain', '--untracked-files=no'])) console.warn(dim('note: uncommitted changes in the main checkout are not visible to workers'));
  // Preflight: never start a run that the plan's usage windows can't carry.
  let quota = await readQuota();
  swarmQuota = quota;
  console.log(dim(describeQuota(quota)));
  if (quota && (!quota.allowed || usedPercent(quota) >= maxUsed) && !argv.includes('--force')) {
    console.error(`usage is at ${Math.round(usedPercent(quota))}% (limit --max-used ${maxUsed}); not starting. Pass --force to override.`);
    process.exit(3);
  }
  let throttled = false;
  const quotaTimer = setInterval(async () => {
    quota = await readQuota();
    swarmQuota = quota;
    throttled = !!quota && (!quota.allowed || usedPercent(quota) >= maxUsed);
  }, 90_000);
  if (!gitOk(['rev-parse', '--verify', INTEGRATION])) git(['branch', INTEGRATION, base]);
  const run = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = join(STATE, 'runs', run);
  mkdirSync(runDir, { recursive: true });

  /** @type {Row[]} */
  const rows: Row[] = tasks.map((t: Task) => ({ id: t.id, title: t.title, state: 'waiting', events: 0, commands: 0, files: 0, tokens: 0, last: t.depends.length ? `after ${t.depends.join(', ')}` : 'queued', run }));
  const byId = new Map(rows.map((r: Row) => [r.id, r]));
  const save = () => writeFileSync(join(STATE, 'last-run.json'), JSON.stringify({ run, rows }, null, 2));

  let frame = 0;
  let drawn = 0;
  const draw = () => {
    if (!process.stdout.isTTY) return;
    const lines = render(rows, frame++);
    process.stdout.write((drawn ? `\x1b[${drawn}A` : '') + lines.map((l: string) => `\x1b[2K${l}`).join('\n') + '\n');
    drawn = lines.length;
  };
  const timer = setInterval(() => { draw(); save(); }, 120);

  /** @type {Promise<void>[]} */
  const live: Promise<void>[] = [];
  const ready = (/** @type {Task} */ t: Task) => t.depends.every((d: string) => !byId.has(d) || byId.get(d)?.state === 'merged');
  const doomed = (/** @type {Task} */ t: Task) => t.depends.some((d: string) => ['failed', 'skipped'].includes(byId.get(d)?.state ?? ''));
  await new Promise<void>((done) => {
    const pump = () => {
      for (const t of tasks) {
        const row = /** @type {Row} */ (byId.get(t.id) as Row);
        if (row.state !== 'waiting') continue;
        if (doomed(t)) { row.state = 'skipped'; row.last = 'a dependency failed'; continue; }
        if (!ready(t) || live.length >= jobs || throttled) continue;
        row.state = 'running';
        row.started = Date.now();
        row.last = 'preparing worktree';
        let p: Promise<void> | undefined;
        p = (async () => {
          // Yield first: a synchronous throw below would otherwise reach `finally` before `p` is
          // assigned, and splice(indexOf(undefined)) would drop a different worker from `live`.
          await null;
          try {
            prepareWorktree(t);
            const code = await runCodex(t, row, { model, effort, runDir });
            if (code !== 0) throw new Error(row.limited ? `usage limit hit — partial work kept in .swarm/wt/${t.id}; resume with: swarm retry ${t.id} "continue"` : `codex exited ${code}`);
            const report = readReport(join(runDir, `${t.id}.last.md`));
            if (report?.status === 'blocked') throw new Error(`worker blocked: ${report.summary ?? 'no summary'}`);
            for (let attempt = 0; ; attempt++) {
              try {
                await finish(t, row);
                break;
              } catch (e) {
                const gateLog = e instanceof Error && 'gateLog' in e && typeof e.gateLog === 'string' ? e.gateLog : undefined;
                if (!gateLog || attempt >= repairs || !row.thread) throw e;
                // Repair turn: resume the same thread (cached context — cheap) with the gate's tail.
                row.state = 'running';
                row.last = `repair ${attempt + 1}/${repairs}: gate failed`;
                const tail = readFileSync(gateLog, 'utf8').split('\n').slice(-80).join('\n');
                const rc = await runCodex(t, row, { model, effort, runDir, resume: { thread: row.thread, feedback: `The orchestrator ran your gate and it FAILED. Last 80 lines:\n\n${tail}\n\nFix the cause (stay inside your owned paths), re-run the gate until it passes, then reply with the JSON report again.` } });
                if (rc !== 0) throw new Error(row.limited ? 'usage limit hit during repair' : `codex exited ${rc} during repair`);
              }
            }
            row.state = 'merged';
            row.last = 'merged into swarm/integration';
          } catch (e) {
            row.state = 'failed';
            row.error = e instanceof Error ? e.message : String(e);
          } finally {
            row.ended = Date.now();
            if (p) live.splice(live.indexOf(p), 1);
            pump();
          }
        })();
        live.push(p);
      }
      if (!live.length && rows.every((r: Row) => r.state !== 'waiting' && r.state !== 'running')) done(undefined);
    };
    pump();
  });
  clearInterval(timer);
  clearInterval(quotaTimer);
  draw();
  save();
  if (!process.stdout.isTTY) for (const r of rows) console.log(`${r.state.padEnd(8)} ${r.id} ${r.error ?? ''}`);
  console.log(`\n${dim('reports:')} .swarm/runs/${run}/<id>.last.md   ${dim('review:')} git log --oneline main..${INTEGRATION}`);
  process.exitCode = rows.some((r: Row) => r.state !== 'merged') ? 1 : 0;
}

function cmdStatus() {
  const f = join(STATE, 'last-run.json');
  if (!existsSync(f)) return console.log('no runs yet');
  const { rows } = JSON.parse(readFileSync(f, 'utf8'));
  console.log(render(rows, 0).join('\n'));
}

function cmdLog(/** @type {string} */ id: string) {
  const { run } = JSON.parse(readFileSync(join(STATE, 'last-run.json'), 'utf8'));
  const f = join(STATE, 'runs', run, `${id}.last.md`);
  console.log(existsSync(f) ? readFileSync(f, 'utf8') : `no report for ${id}`);
}

async function cmdRetry(/** @type {string} */ id: string, /** @type {string} */ feedback: string, /** @type {string[]} */ argv: string[]) {
  const t = loadTasks().find((x: Task) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  const state = JSON.parse(readFileSync(join(STATE, 'last-run.json'), 'utf8'));
  const row = state.rows.find((/** @type {Row} */ r: Row) => r.id === id);
  if (!row?.thread) throw new Error(`no codex thread recorded for ${id}`);
  if (!existsSync(join(STATE, 'wt', id))) throw new Error(`worktree for ${id} is gone; rerun it instead`);
  const opt = (/** @type {string} */ f: string, /** @type {string} */ d: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] ?? d : d; };
  Object.assign(row, { state: 'running', started: Date.now(), ended: undefined, error: undefined });
  const code = await runCodex(t, row, { effort: opt('--effort', 'medium'), model: opt('--model', 'gpt-6.1-sol'), runDir: join(STATE, 'runs', state.run), resume: { thread: row.thread, feedback } });
  try {
    if (code !== 0) throw new Error(`codex exited ${code}`);
    await finish(t, row);
    row.state = 'merged';
  } catch (e) {
    row.state = 'failed';
    row.error = e instanceof Error ? e.message : String(e);
  }
  row.ended = Date.now();
  writeFileSync(join(STATE, 'last-run.json'), JSON.stringify(state, null, 2));
  console.log(`${row.state} ${id} ${row.error ?? ''}`);
}

function cmdClean() {
  const dir = join(STATE, 'wt');
  if (existsSync(dir)) for (const d of readdirSync(dir)) removeWorktreeDir(join(dir, d));
  git(['worktree', 'prune']);
  console.log('worktrees removed (branches kept)');
}

/** Engine-agnostic hooks: any agent (Codex, Claude, a human) can work a worktree. */
function cmdPrepare(/** @type {string} */ id: string) {
  const t = loadTasks().find((x: Task) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  if (!gitOk(['rev-parse', '--verify', INTEGRATION])) git(['branch', INTEGRATION, 'main']);
  const { wt } = prepareWorktree(t);
  console.log(wt);
}

async function cmdFinish(/** @type {string} */ id: string, /** @type {string[]} */ argv: string[] = []) {
  const found = loadTasks().find((x: Task) => x.id === id);
  if (!found) throw new Error(`no task ${id}`);
  // --gate "<cmd>" overrides the task's gate (e.g. when something it needs lands in a later task).
  const gi = argv.indexOf('--gate');
  const t = gi >= 0 ? { ...found, gate: argv[gi + 1] } : found;
  const run = `manual-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  mkdirSync(join(STATE, 'runs', run), { recursive: true });
  /** @type {Row} */
  const row: Row = { id, title: t.title, state: 'running', events: 0, commands: 0, files: 0, tokens: 0, last: '', run };
  await finish(t, row);
  console.log(`merged ${id} into ${INTEGRATION}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'run') await cmdRun(rest);
  else if (cmd === 'prepare') cmdPrepare(rest[0] ?? '');
  else if (cmd === 'quota') console.log(describeQuota(await readQuota()));
  else if (cmd === 'finish') await cmdFinish(rest[0] ?? '', rest.slice(1));
  else if (cmd === 'status') cmdStatus();
  else if (cmd === 'log') cmdLog(rest[0] ?? '');
  else if (cmd === 'retry') await cmdRetry(rest[0] ?? '', rest[1] ?? '', rest.slice(2));
  else if (cmd === 'clean') cmdClean();
  else console.log((readFileSync(import.meta.filename, 'utf8').split('*/')[0] ?? '').replace(/^[\s\S]*?\/\*\*/, '').replace(/^ \* ?/gm, ''));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
