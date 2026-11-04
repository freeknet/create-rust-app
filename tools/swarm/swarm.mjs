#!/usr/bin/env node
// @ts-check
/**
 * swarm — fan tasks out to parallel Codex workers, one git worktree each.
 *
 *   node tools/swarm/swarm.mjs run [ids...] [-j 4] [--model M] [--effort high] [--base main] [--dry]
 *   node tools/swarm/swarm.mjs status            last run's table
 *   node tools/swarm/swarm.mjs log <id>          worker's final report
 *   node tools/swarm/swarm.mjs retry <id> "<feedback>"   resume that worker's thread with feedback
 *   node tools/swarm/swarm.mjs clean             remove worktrees (keeps branches)
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
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, createWriteStream } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TASKS = join(ROOT, 'tools', 'swarm', 'tasks');
const STATE = join(ROOT, '.swarm');
const INTEGRATION = 'swarm/integration';

// ─── colour ────────────────────────────────────────────────────────────────
const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
/** @param {number} h */
function hsl(h, s = 0.95, l = 0.66) {
  const k = (/** @type {number} */ n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (/** @type {number} */ n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return [f(0), f(8), f(4)];
}
/** @param {string} s @param {number} h */
const hue = (s, h) => (COLOR ? `\x1b[38;2;${hsl(h % 360).join(';')}m${s}\x1b[0m` : s);
/** @param {string} s @param {number} [off] */
const rainbow = (s, off = 0) => (COLOR ? [...s].map((c, i) => hue(c, i * 9 + off)).join('') : s);
const dim = (/** @type {string} */ s) => (COLOR ? `\x1b[2m${s}\x1b[0m` : s);
const bold = (/** @type {string} */ s) => (COLOR ? `\x1b[1m${s}\x1b[0m` : s);
const SPIN = '⣾⣽⣻⢿⡿⣟⣯⣷';

// ─── tasks ─────────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string, title: string, owns: string[], depends: string[], gate?: string, model?: string, effort?: string, body: string }} Task
 * @returns {Task[]}
 */
function loadTasks() {
  if (!existsSync(TASKS)) return [];
  return readdirSync(TASKS).filter((f) => f.endsWith('.md')).sort().map((f) => {
    const raw = readFileSync(join(TASKS, f), 'utf8').replace(/\r\n/g, '\n');
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!m) throw new Error(`${f}: missing frontmatter`);
    /** @type {Record<string, any>} */
    const fm = {};
    for (const line of m[1].split('\n')) {
      const kv = /^(\w+):\s*(.*)$/.exec(line);
      if (!kv) continue;
      const v = kv[2].trim();
      fm[kv[1]] = v.startsWith('[') ? v.slice(1, -1).split(',').map((s) => s.trim()).filter(Boolean) : v;
    }
    return { id: f.replace(/^\d+-/, '').replace(/\.md$/, ''), title: fm.title ?? f, owns: fm.owns ?? [], depends: fm.depends ?? [], gate: fm.gate, model: fm.model, effort: fm.effort, body: m[2].trim() };
  });
}

/** @param {string} glob */
function globRe(glob) {
  const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*');
  return new RegExp(`^${re}$`);
}

// ─── git ───────────────────────────────────────────────────────────────────
/** @param {string[]} args @param {string} [cwd] */
function git(args, cwd = ROOT) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} (in ${cwd}): ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
const gitOk = (/** @type {string[]} */ args, cwd = ROOT) => spawnSync('git', args, { cwd, encoding: 'utf8' }).status === 0;

/** @param {Task} t */
function prepareWorktree(t) {
  const wt = join(STATE, 'wt', t.id);
  const branch = `swarm/${t.id}`;
  if (existsSync(wt)) git(['worktree', 'remove', '--force', wt]);
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
function changedPaths(/** @type {string} */ wt) {
  const out = git(['status', '--porcelain', '-uall', '--no-renames'], wt);
  return out.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, '')).filter((p) => p !== 'node_modules');
}

// ─── prompt ────────────────────────────────────────────────────────────────
/** @param {Task} t */
function promptFor(t) {
  return `You are one of several Codex workers building \`create-rust-app\` in parallel. Each worker owns a
disjoint set of paths in its own git worktree (your working directory).

Your task: **${t.title}** (id: ${t.id})

Paths you own (you may create/modify ONLY these): ${t.owns.map((o) => '`' + o + '`').join(', ')}

First read AGENTS.md, docs/PLAN.md and docs/CONTRACTS.md. The core engine in src/engine, src/context.js,
src/presets.js and src/gen/header.js already exists and is tested; read it to see exactly how
templates are rendered. Reference repos (read-only): C:\\Users\\ADUPU\\Documents\\Development\\rustaman and
C:\\Users\\ADUPU\\Documents\\Development\\strobe.

Do not commit, switch branches or merge — the orchestrator commits your work after checking that you
stayed inside your paths${t.gate ? ` and that this gate passes:\n\n    ${t.gate}\n\nRun that gate yourself before finishing and iterate until it passes` : ''}.

${t.body}

End with a short report: files created, commands you ran to verify and their results, and anything
unfinished or any contract you think should change.`;
}

// ─── run ───────────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string, title: string, state: 'waiting'|'running'|'gating'|'merged'|'failed'|'skipped',
 *   started?: number, ended?: number, events: number, commands: number, files: number,
 *   tokens: number, last: string, error?: string, thread?: string, run: string }} Row
 */

/** @param {Task} t @param {Row} row @param {{ model?: string, effort: string, runDir: string, resume?: { thread: string, feedback: string } }} o */
function runCodex(t, row, o) {
  return new Promise((resolveP) => {
    const wt = join(STATE, 'wt', t.id);
    const home = homedir();
    const args = ['exec'];
    if (o.resume) args.push('resume', o.resume.thread);
    args.push('-C', wt, '-s', 'workspace-write', '--json',
      '-o', join(o.runDir, `${t.id}.last.md`),
      '-c', 'sandbox_workspace_write.network_access=true',
      '-c', `model_reasoning_effort="${t.effort ?? o.effort}"`,
      '--add-dir', join(home, '.cargo'), '--add-dir', join(home, '.rustup'),
      '--add-dir', join(ROOT, '.git'));
    args.push('-m', t.model ?? o.model);
    args.push('-');
    const log = createWriteStream(join(o.runDir, `${t.id}.jsonl`), { flags: 'a' });
    const child = spawn('codex', args, { cwd: wt, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(o.resume ? o.resume.feedback : promptFor(t));
    let buf = '';
    child.stdout.on('data', (d) => {
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
              row.last = `✎ ${(it.changes ?? []).map((c) => c.path).join(', ')}`;
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
    child.stderr.on('data', (d) => log.write(d));
    child.on('close', (code) => { log.end(); resolveP(code ?? 1); });
  });
}

/** @param {string} cmd @param {string} cwd @param {string} logFile */
function runGate(cmd, cwd, logFile) {
  return new Promise((res) => {
    const log = createWriteStream(logFile);
    const child = spawn(cmd, { cwd, shell: true, env: { ...process.env, NO_COLOR: '1', CARGO_TERM_COLOR: 'never' } });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    child.on('close', (code) => { log.end(); res(code ?? 1); });
  });
}

/** @param {Task} t @param {Row} row */
async function finish(t, row) {
  const wt = join(STATE, 'wt', t.id);
  const changed = changedPaths(wt);
  if (!changed.length) throw new Error('worker changed nothing');
  const res = t.owns.map(globRe);
  const outside = changed.filter((p) => !res.some((r) => r.test(p)));
  if (outside.length) throw new Error(`edited outside owned paths: ${outside.slice(0, 6).join(', ')}${outside.length > 6 ? ' …' : ''}`);
  if (t.gate) {
    row.state = 'gating';
    row.last = `gate: ${t.gate}`;
    const code = await runGate(t.gate, wt, join(STATE, 'runs', row.run, `${t.id}.gate.log`));
    if (code !== 0) throw new Error(`gate failed (see .swarm/runs/${row.run}/${t.id}.gate.log)`);
  }
  git(['add', '-A', '--', ...changed], wt);
  git(['-c', 'user.name=swarm', '-c', 'user.email=swarm@localhost', 'commit', '-qm', `feat(${t.id}): ${t.title}\n\nBuilt by a Codex worker via tools/swarm.`], wt);
  // Merge into integration from the main checkout's perspective without touching its working tree.
  const integWt = join(STATE, 'wt', '_integration');
  if (!existsSync(integWt)) git(['worktree', 'add', integWt, INTEGRATION]);
  if (!gitOk(['-c', 'user.name=swarm', '-c', 'user.email=swarm@localhost', 'merge', '--no-ff', '-qm', `merge swarm/${t.id}`, `swarm/${t.id}`], integWt)) {
    git(['merge', '--abort'], integWt);
    throw new Error('merge conflict into swarm/integration');
  }
}

/** @param {Row[]} rows @param {number} frame */
function render(rows, frame) {
  const w = Math.max(60, process.stdout.columns ?? 100);
  const now = Date.now();
  const lines = [rainbow('◆ swarm', frame * 6) + dim(` · ${rows.filter((r) => r.state === 'merged').length}/${rows.length} merged · codex × ${rows.filter((r) => r.state === 'running').length} live`), ''];
  for (const [i, r] of rows.entries()) {
    const secs = r.started ? Math.round(((r.ended ?? now) - r.started) / 1000) : 0;
    const t = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    const icon = { waiting: dim('○'), running: hue(SPIN[(frame + i) % SPIN.length], frame * 8 + i * 50), gating: hue('◐', 50), merged: hue('✔', 140), failed: hue('✖', 350), skipped: dim('⊘') }[r.state];
    const stats = dim(`${t.padStart(5)} ${String(r.commands).padStart(3)}$ ${String(r.files).padStart(3)}✎ ${(r.tokens / 1000).toFixed(0).padStart(5)}k`);
    const head = `${icon} ${hue(r.id.padEnd(14), i * 47)} ${stats} `;
    const note = (r.error ?? r.last ?? '').replace(/\s+/g, ' ');
    lines.push(head + dim(note.slice(0, Math.max(10, w - 48))));
  }
  return lines;
}

async function cmdRun(/** @type {string[]} */ argv) {
  const ids = argv.filter((a, i) => !a.startsWith('-') && !['-j', '--model', '--effort', '--base'].includes(argv[i - 1]));
  const opt = (/** @type {string} */ f, /** @type {string} */ d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
  const jobs = Number(opt('-j', '3'));
  // Defaults are the workhorse tier, not the frontier model in ~/.codex/config.toml:
  // parallel workers multiply cost, so tasks opt up per-task via `model:` / `effort:` frontmatter.
  const effort = opt('--effort', 'medium');
  const model = opt('--model', 'gpt-6.1-sol');
  const base = opt('--base', 'main');
  let tasks = loadTasks();
  if (ids.length) tasks = tasks.filter((t) => ids.includes(t.id));
  if (!tasks.length) { console.error('no tasks'); process.exit(2); }
  if (argv.includes('--dry')) {
    for (const t of tasks) console.log(`${t.id.padEnd(14)} ${t.model ?? model}/${t.effort ?? effort} deps=[${t.depends}] owns=[${t.owns}] gate=${t.gate ?? '-'}`);
    return;
  }
  if (git(['status', '--porcelain', '--untracked-files=no'])) console.warn(dim('note: uncommitted changes in the main checkout are not visible to workers'));
  if (!gitOk(['rev-parse', '--verify', INTEGRATION])) git(['branch', INTEGRATION, base]);
  const run = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const runDir = join(STATE, 'runs', run);
  mkdirSync(runDir, { recursive: true });

  /** @type {Row[]} */
  const rows = tasks.map((t) => ({ id: t.id, title: t.title, state: 'waiting', events: 0, commands: 0, files: 0, tokens: 0, last: t.depends.length ? `after ${t.depends.join(', ')}` : 'queued', run }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const save = () => writeFileSync(join(STATE, 'last-run.json'), JSON.stringify({ run, rows }, null, 2));

  let frame = 0;
  let drawn = 0;
  const draw = () => {
    if (!process.stdout.isTTY) return;
    const lines = render(rows, frame++);
    process.stdout.write((drawn ? `\x1b[${drawn}A` : '') + lines.map((l) => `\x1b[2K${l}`).join('\n') + '\n');
    drawn = lines.length;
  };
  const timer = setInterval(() => { draw(); save(); }, 120);

  /** @type {Promise<void>[]} */
  const live = [];
  const ready = (/** @type {Task} */ t) => t.depends.every((d) => !byId.has(d) || byId.get(d)?.state === 'merged');
  const doomed = (/** @type {Task} */ t) => t.depends.some((d) => ['failed', 'skipped'].includes(byId.get(d)?.state ?? ''));
  await new Promise((done) => {
    const pump = () => {
      for (const t of tasks) {
        const row = /** @type {Row} */ (byId.get(t.id));
        if (row.state !== 'waiting') continue;
        if (doomed(t)) { row.state = 'skipped'; row.last = 'a dependency failed'; continue; }
        if (!ready(t) || live.length >= jobs) continue;
        row.state = 'running';
        row.started = Date.now();
        row.last = 'preparing worktree';
        const p = (async () => {
          try {
            prepareWorktree(t);
            const code = await runCodex(t, row, { model, effort, runDir });
            if (code !== 0) throw new Error(row.limited ? `usage limit hit — partial work kept in .swarm/wt/${t.id}; resume with: swarm retry ${t.id} "continue"` : `codex exited ${code}`);
            await finish(t, row);
            row.state = 'merged';
            row.last = 'merged into swarm/integration';
          } catch (e) {
            row.state = 'failed';
            row.error = e instanceof Error ? e.message : String(e);
          } finally {
            row.ended = Date.now();
            live.splice(live.indexOf(p), 1);
            pump();
          }
        })();
        live.push(p);
      }
      if (!live.length && rows.every((r) => r.state !== 'waiting' && r.state !== 'running')) done(undefined);
    };
    pump();
  });
  clearInterval(timer);
  draw();
  save();
  if (!process.stdout.isTTY) for (const r of rows) console.log(`${r.state.padEnd(8)} ${r.id} ${r.error ?? ''}`);
  console.log(`\n${dim('reports:')} .swarm/runs/${run}/<id>.last.md   ${dim('review:')} git log --oneline main..${INTEGRATION}`);
  process.exitCode = rows.some((r) => r.state !== 'merged') ? 1 : 0;
}

function cmdStatus() {
  const f = join(STATE, 'last-run.json');
  if (!existsSync(f)) return console.log('no runs yet');
  const { rows } = JSON.parse(readFileSync(f, 'utf8'));
  console.log(render(rows, 0).join('\n'));
}

function cmdLog(/** @type {string} */ id) {
  const { run } = JSON.parse(readFileSync(join(STATE, 'last-run.json'), 'utf8'));
  const f = join(STATE, 'runs', run, `${id}.last.md`);
  console.log(existsSync(f) ? readFileSync(f, 'utf8') : `no report for ${id}`);
}

async function cmdRetry(/** @type {string} */ id, /** @type {string} */ feedback, /** @type {string[]} */ argv) {
  const t = loadTasks().find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  const state = JSON.parse(readFileSync(join(STATE, 'last-run.json'), 'utf8'));
  const row = state.rows.find((/** @type {Row} */ r) => r.id === id);
  if (!row?.thread) throw new Error(`no codex thread recorded for ${id}`);
  if (!existsSync(join(STATE, 'wt', id))) throw new Error(`worktree for ${id} is gone; rerun it instead`);
  const opt = (/** @type {string} */ f, /** @type {string} */ d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
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
  if (existsSync(dir)) for (const d of readdirSync(dir)) gitOk(['worktree', 'remove', '--force', join(dir, d)]);
  git(['worktree', 'prune']);
  console.log('worktrees removed (branches kept)');
}

/** Engine-agnostic hooks: any agent (Codex, Claude, a human) can work a worktree. */
function cmdPrepare(/** @type {string} */ id) {
  const t = loadTasks().find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  if (!gitOk(['rev-parse', '--verify', INTEGRATION])) git(['branch', INTEGRATION, 'main']);
  const { wt } = prepareWorktree(t);
  console.log(wt);
}

async function cmdFinish(/** @type {string} */ id) {
  const t = loadTasks().find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id}`);
  const run = `manual-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
  mkdirSync(join(STATE, 'runs', run), { recursive: true });
  /** @type {Row} */
  const row = { id, title: t.title, state: 'running', events: 0, commands: 0, files: 0, tokens: 0, last: '', run };
  await finish(t, row);
  console.log(`merged ${id} into ${INTEGRATION}`);
}

const [cmd, ...rest] = process.argv.slice(2);
try {
  if (cmd === 'run') await cmdRun(rest);
  else if (cmd === 'prepare') cmdPrepare(rest[0]);
  else if (cmd === 'finish') await cmdFinish(rest[0]);
  else if (cmd === 'status') cmdStatus();
  else if (cmd === 'log') cmdLog(rest[0]);
  else if (cmd === 'retry') await cmdRetry(rest[0], rest[1] ?? '', rest.slice(2));
  else if (cmd === 'clean') cmdClean();
  else console.log(readFileSync(import.meta.filename, 'utf8').split('*/')[0].replace(/^[\s\S]*?\/\*\*/, '').replace(/^ \* ?/gm, ''));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
