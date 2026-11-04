import type { Answers, Caps } from './types.ts';
type Node = Map<string, Node>;
/** main(argv): args → answers → ctx → plan → write → post → summary. */
import { readFile } from 'node:fs/promises';
import { basename, resolve, relative } from 'node:path';
import { parseArgv, optionalUi, renderHelp } from './args.ts';
import { resolveAnswers } from './presets.ts';
import { buildContext, validateName } from './context.ts';
import { buildPlan } from './engine/plan.ts';
import { writePlan } from './engine/write.ts';
import { initRepo } from './post/git.ts';
import { cargoCheck } from './post/cargo.ts';
import { openEditor } from './post/open.ts';
import { TEMPLATES } from './engine/plan.ts';
import { join } from 'node:path';
import type { PlanEntry } from './types.ts';

/** @typedef {{ tier: string, unicode: boolean, tty: boolean, columns: number, animate: boolean }} Caps */

/** Fallback when src/ui/tty.js is absent. @param {{ noColor?: boolean }} [o] @returns {Caps} */
function fallbackCaps({ noColor = false }: { noColor?: boolean; } | undefined = {}): Caps {
  const tty = Boolean(process.stdout.isTTY);
  const color = tty && !noColor && process.env.NO_COLOR === undefined && !process.env.CI;
  return {
    tier: color ? 'ansi16' : 'none',
    unicode: process.platform !== 'win32' || Boolean(process.env.WT_SESSION),
    tty, columns: process.stdout.columns || 80, animate: false,
  };
}

/**
 * Render dests as a tree, limited to `depth` levels (directories first).
 * @param {string[]} dests @param {number} [depth] @param {boolean} [unicode]
 */
export function fileTree(dests: string[], depth: number | undefined = Infinity, unicode: boolean | undefined = true) {
  /** @typedef {Map<string, any>} Node */
  /** @type {Node} */
  const root: Node = new Map();
  /** @type {WeakSet<Node>} */
  const dirs: WeakSet<Node> = new WeakSet();
  for (const d of dests) {
    const parts = d.split('/');
    let node = root;
    parts.slice(0, depth).forEach((part: string, i: number) => {
      let child = node.get(part);
      if (!child) { child = new Map(); node.set(part, child); }
      node = child;
      if (i < parts.length - 1) dirs.add(node);
    });
  }
  const [tee, elbow, pipe] = unicode ? ['├── ', '└── ', '│   '] : ['|-- ', '`-- ', '|   '];
  /** @type {string[]} */
  const out: string[] = [];
  /** @param {Node} node @param {string} prefix */
  const walk = (node: Node, prefix: string) => {
    const entries = [...node.entries()].sort(([a, x], [b, y]) =>
      Number(dirs.has(y)) - Number(dirs.has(x)) || a.localeCompare(b));
    entries.forEach(([name, child], i: number) => {
      const last = i === entries.length - 1;
      out.push(prefix + (last ? elbow : tee) + name + (dirs.has(child) ? '/' : ''));
      if (child.size) walk(child, prefix + (last ? '    ' : pipe));
    });
  };
  walk(root, '');
  return out.join('\n');
}

/** The commands to run next, for this kind of project. */
export function nextCommands(a: Answers, shown: string): [string, string][] {
  const out: [string, string][] = [];
  if (shown !== '.') out.push([`cd ${shown}`, '']);
  if (a.kind === 'lib') out.push(['cargo test', 'unit + doc tests']);
  else out.push(['cargo run', a.kind === 'gui' || a.kind === 'workspace' ? 'first build takes a minute' : '']);
  if (a.kind === 'workspace') out.push(['cargo xtask ci', 'the same gate CI runs']);
  else out.push(['cargo clippy --all-targets -- -D warnings', 'the lint gate CI runs']);
  return out;
}

/** Interactive run: ticked steps with timings, then the next-steps box and a sign-off. */
async function runInteractive({ caps, answers, plan, target, shown, force }: {
  caps: Caps; answers: Answers; plan: PlanEntry[]; target: string; shown: string; force: boolean;
}) {
  const p = await import('@clack/prompts');
  const { dim, hex, paint } = await import('./ui/rainbow.ts');
  const { cargoFetch } = await import('./post/cargo.ts');
  const { reproduceCommand } = await import('./reproduce.ts');
  const timed = async (fn: () => Promise<string>) => {
    const t0 = performance.now();
    const msg = await fn();
    return `${msg}  ${dim(caps, `${((performance.now() - t0) / 1000).toFixed(1)}s`)}`;
  };
  const cargoTask = (label: string, run: typeof cargoFetch) => async (message: (s: string) => void) => timed(async () => {
    let hint = '';
    const ok = await run(target, {
      toolchain: answers.toolchain,
      onLine: (line) => message(`${label}  ${dim(caps, line.slice(0, Math.max(20, caps.columns - 30)))}`),
      onHint: (h) => { hint = h; },
    });
    return ok === null ? `${label} skipped ${dim(caps, `(${hint})`)}` : ok ? `${label} done` : `${label} failed ${dim(caps, '(run it in the project for details)')}`;
  });

  await p.tasks([
    { title: `Writing ${plan.length} files`, task: () => timed(async () => { await writePlan(plan, target, { force }); return `Wrote ${plan.length} files to ${shown}`; }) },
    {
      title: 'git init', enabled: answers.post.git, task: () => timed(async () => {
        const r = initRepo(target, answers);
        return r.ok === true ? 'Initialised git · first commit on main' : `git ${r.ok === false ? 'failed' : 'skipped'} ${dim(caps, `(${r.reason ?? ''})`)}`;
      }),
    },
    { title: 'cargo fetch', enabled: answers.post.fetch, task: cargoTask('cargo fetch', cargoFetch) },
    { title: 'cargo check', enabled: answers.post.cargoCheck, task: cargoTask('cargo check', cargoCheck) },
  ]);
  if (answers.post.open !== 'none') openEditor(target, answers.post.open);

  const cmds = nextCommands(answers, shown);
  const pad = Math.max(...cmds.map(([c]) => c.length)) + 3;
  const lines = cmds.map(([c, note]) => (note ? `${c.padEnd(pad)}${dim(caps, `# ${note}`)}` : c));
  // clack's `width` is a fraction of the terminal; 'auto' fits the content instead of stretching.
  p.box(lines.join('\n'), ` ${hex(caps, '#7cf7ff', 'next')} `, {
    contentPadding: 2, titlePadding: 1, rounded: true, width: 'auto',
  });
  p.log.message(`${dim(caps, 'again without prompts:')}\n${dim(caps, reproduceCommand(answers, shown === '.' ? '.' : undefined))}`);
  p.outro(paint(caps, `${caps.unicode ? '◆' : '*'} build something luminous`, { offset: 140, step: 7 }));
}

/** An error that maps to a specific exit code (2 = bad arguments). */
class Exit extends Error {
  code: number;
  /** @param {number} code @param {string} msg */
  constructor(code: number, msg: string) { super(msg); this.code = code; }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function main(argv: string[]) {
  /** @type {Caps} */
  let caps: Caps = fallbackCaps();
  /** @param {string} s */
  const red = (s: string) => (caps.tier === 'none' ? s : `\x1b[31m${s}\x1b[39m`);
  try {
    /** @type {ReturnType<typeof parseArgv>} */
    let parsed: ReturnType<typeof parseArgv>;
    try {
      parsed = parseArgv(argv);
    } catch (e) {
      throw new Exit(2, e instanceof Error ? e.message : String(e));
    }
    const { dir, flags, overrides } = parsed;
    const noColor = Boolean(flags['no-color']);
    const tty = await optionalUi('tty');
    caps = tty.detect?.({ noColor }) ?? fallbackCaps({ noColor });

    if (flags.version) {
      const pkg: unknown = JSON.parse(await readFile(join(TEMPLATES, '..', 'package.json'), 'utf8'));
      if (!pkg || typeof pkg !== 'object' || !('version' in pkg) || typeof pkg.version !== 'string') throw new Error('Invalid package version');
      console.log(pkg.version);
      return 0;
    }
    if (flags.help) {
      console.log(await renderHelp(caps));
      return 0;
    }

    const json = Boolean(flags.json);
    const quiet = Boolean(flags.quiet) || json;
    const interactive = !flags.yes && !json && Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY);
    /** @param {string} s */
    const log = (s: string) => { if (!quiet) console.log(s); };

    // A positional dir with no --name supplies the name when it is a valid crate name.
    if (dir && overrides.name === undefined) {
      const base = basename(resolve(dir));
      if (!validateName(base)) overrides.name = base;
    }

    if (!quiet) {
      const banner = await optionalUi('banner');
      if (banner.showBanner) await banner.showBanner(caps);
      else console.log('CREATE-RUST-APP\nscaffold rust projects at the speed of light\n');
    }

    /** @type {any} */
    let answers: Answers;
    if (interactive) {
      const { ask } = await import('./prompts.ts');
      answers = await ask(overrides, caps);
    } else {
      answers = resolveAnswers(overrides.preset, overrides);
    }

    const ctx = buildContext(answers);
    const plan = await buildPlan(ctx);
    const dests = plan.map((e: PlanEntry) => e.dest);
    const target = resolve(dir ?? answers.name);
    const rel = relative(process.cwd(), target);
    const shown = rel.startsWith('..') ? target : rel || '.';

    if (json) {
      if (!flags['dry-run']) await writePlan(plan, target, { force: Boolean(flags.force) });
      console.log(JSON.stringify({ answers, files: dests }, null, 2));
      return 0;
    }
    if (flags['dry-run']) {
      console.log(`${shown}/\n${fileTree(dests, Infinity, caps.unicode)}`);
      console.log(`\n${dests.length} files (dry run, nothing written)`);
      return 0;
    }

    if (interactive) {
      // The review screen already confirmed; this is the run + finish.
      await runInteractive({ caps, answers, plan, target, shown, force: Boolean(flags.force) });
      return 0;
    }

    await writePlan(plan, target, { force: Boolean(flags.force) });

    // Post-steps.
    const spinMod = await optionalUi('spinner');
    const spinner = quiet
      ? { start() {}, message() {}, stop() {} }
      : spinMod.createSpinner?.(caps) ?? {
        start: (/** @type {string} */ m: string) => console.log(m),
        message() {},
        stop: (/** @type {string} */ m: string) => console.log(m),
      };
    /** @type {boolean | undefined} */
    let gitDone: boolean | undefined;
    if (answers.post.git) {
      const r = initRepo(target, answers);
      gitDone = r.ok === true;
      if (r.ok === false) log(`warning: ${r.reason}`);
      else if (r.ok === null) log(`git skipped: ${r.reason}`);
    }
    if (answers.post.fetch) {
      let hint = '';
      spinner.start('cargo fetch');
      const { cargoFetch } = await import('./post/cargo.ts');
      const fetched = await cargoFetch(target, {
        toolchain: answers.toolchain,
        onLine: (line: string) => spinner.message(line.slice(0, Math.max(20, caps.columns - 10))),
        onHint: (h: string) => { hint = h; },
      });
      if (fetched === null) spinner.stop(`cargo fetch skipped${hint ? ` (${hint})` : ''}`, true);
      else spinner.stop(fetched ? 'cargo fetch done' : 'cargo fetch failed (run it in the project for details)', fetched);
    }
    /** @type {boolean | null} */
    let cargoChecked: boolean | null = null;
    if (answers.post.cargoCheck) {
      /** @type {string | undefined} */
      let hint: string | undefined;
      spinner.start('cargo check --all-targets');
      cargoChecked = await cargoCheck(target, {
        toolchain: answers.toolchain,
        onLine: (line: string) => spinner.message(line.slice(0, Math.max(20, caps.columns - 10))),
        onHint: (h: string) => { hint = h; },
      });
      if (cargoChecked === null) spinner.stop(`cargo check skipped${hint ? ` (${hint})` : ''}`, true);
      else spinner.stop(cargoChecked ? 'cargo check passed' : 'cargo check failed (run it in the project for details)', cargoChecked);
    }
    if (answers.post.open !== 'none') openEditor(target, answers.post.open);

    if (!quiet) {
      // Same words as the interactive review, without prompts or a file dump (--dry-run lists files).
      const { reviewLines } = await import('./prompts.ts');
      const { dim } = await import('./ui/rainbow.ts');
      const { title, body } = reviewLines(caps, answers);
      const ok = caps.unicode ? '✔' : '[ok]';
      const checks = [gitDone && 'git', cargoChecked === true && 'cargo check'].filter(Boolean).join(' · ');
      console.log(`\n${ok} ${title}  ${dim(caps, `${dests.length} files${checks ? ` · ${checks}` : ''}`)}\n`);
      console.log(body.split('\n').map((l) => `  ${l}`).join('\n'));
      console.log(`\n${dim(caps, 'next')}`);
      for (const [cmd, note] of nextCommands(answers, shown)) console.log(`  ${cmd}${note ? `   ${dim(caps, `# ${note}`)}` : ''}`);
      console.log('');
    }
    return 0;
  } catch (e) {
    if (e && typeof e === 'object' && 'exitCode' in e && e.exitCode === 130) return 130;
    const code = e instanceof Exit ? e.code : 1;
    const msg = e instanceof Error ? e.message : String(e);
    console.error(red(`${caps.unicode ? '✖' : 'error:'} ${msg}`));
    if (process.env.DEBUG && e instanceof Error && !(e instanceof Exit)) console.error(e.stack);
    return code;
  }
}
