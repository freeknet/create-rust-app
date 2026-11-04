// @ts-check
/** main(argv): args → answers → ctx → plan → write → post → summary. */
import { readFile } from 'node:fs/promises';
import { basename, resolve, relative } from 'node:path';
import { parseArgv, optionalUi, renderHelp } from './args.js';
import { resolveAnswers } from './presets.js';
import { buildContext, validateName } from './context.js';
import { buildPlan } from './engine/plan.js';
import { writePlan } from './engine/write.js';
import { initRepo } from './post/git.js';
import { cargoCheck } from './post/cargo.js';
import { openEditor } from './post/open.js';

/** @typedef {{ tier: string, unicode: boolean, tty: boolean, columns: number, animate: boolean }} Caps */

/** Fallback when src/ui/tty.js is absent. @param {{ noColor?: boolean }} [o] @returns {Caps} */
function fallbackCaps({ noColor = false } = {}) {
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
export function fileTree(dests, depth = Infinity, unicode = true) {
  /** @typedef {Map<string, any>} Node */
  /** @type {Node} */
  const root = new Map();
  /** @type {WeakSet<Node>} */
  const dirs = new WeakSet();
  for (const d of dests) {
    const parts = d.split('/');
    let node = root;
    parts.slice(0, depth).forEach((part, i) => {
      if (!node.has(part)) node.set(part, new Map());
      node = node.get(part);
      if (i < parts.length - 1) dirs.add(node);
    });
  }
  const [tee, elbow, pipe] = unicode ? ['├── ', '└── ', '│   '] : ['|-- ', '`-- ', '|   '];
  /** @type {string[]} */
  const out = [];
  /** @param {Node} node @param {string} prefix */
  const walk = (node, prefix) => {
    const entries = [...node.entries()].sort(([a, x], [b, y]) =>
      Number(dirs.has(y)) - Number(dirs.has(x)) || a.localeCompare(b));
    entries.forEach(([name, child], i) => {
      const last = i === entries.length - 1;
      out.push(prefix + (last ? elbow : tee) + name + (dirs.has(child) ? '/' : ''));
      if (child.size) walk(child, prefix + (last ? '    ' : pipe));
    });
  };
  walk(root, '');
  return out.join('\n');
}

/** An error that maps to a specific exit code (2 = bad arguments). */
class Exit extends Error {
  /** @param {number} code @param {string} msg */
  constructor(code, msg) { super(msg); this.code = code; }
}

/**
 * @param {string[]} argv
 * @returns {Promise<number>} exit code
 */
export async function main(argv) {
  /** @type {Caps} */
  let caps = fallbackCaps();
  /** @param {string} s */
  const red = (s) => (caps.tier === 'none' ? s : `\x1b[31m${s}\x1b[39m`);
  try {
    /** @type {ReturnType<typeof parseArgv>} */
    let parsed;
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
      const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
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
    const log = (s) => { if (!quiet) console.log(s); };

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
    let answers;
    if (interactive) {
      const { ask } = await import('./prompts.js');
      answers = await ask(overrides, caps);
    } else {
      answers = resolveAnswers(overrides.preset, overrides);
    }

    const ctx = buildContext(answers);
    const plan = await buildPlan(ctx);
    const dests = plan.map((e) => e.dest);
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
      const p = await import('@clack/prompts');
      p.note(fileTree(dests, 2, caps.unicode), `${shown}/ · ${dests.length} files`);
      const ok = await p.confirm({ message: `Write ${dests.length} files to ${shown}?`, initialValue: true });
      if (p.isCancel(ok) || !ok) {
        p.cancel('Nothing written.');
        return 130;
      }
    }

    await writePlan(plan, target, { force: Boolean(flags.force) });

    // Post-steps.
    const spinMod = await optionalUi('spinner');
    const spinner = quiet
      ? { start() {}, message() {}, stop() {} }
      : spinMod.createSpinner?.(caps) ?? {
        start: (/** @type {string} */ m) => console.log(m),
        message() {},
        stop: (/** @type {string} */ m) => console.log(m),
      };
    /** @type {boolean | undefined} */
    let gitDone;
    if (answers.post.git) {
      const r = initRepo(target, answers);
      gitDone = r.ok === true;
      if (r.ok === false) log(`warning: ${r.reason}`);
      else if (r.ok === null) log(`git skipped: ${r.reason}`);
    }
    /** @type {boolean | null} */
    let cargoChecked = null;
    if (answers.post.cargoCheck) {
      /** @type {string | undefined} */
      let hint;
      spinner.start('cargo check --all-targets');
      cargoChecked = await cargoCheck(target, {
        toolchain: answers.toolchain,
        onLine: (line) => spinner.message(line.slice(0, Math.max(20, caps.columns - 10))),
        onHint: (h) => { hint = h; },
      });
      if (cargoChecked === null) spinner.stop(`cargo check skipped${hint ? ` (${hint})` : ''}`, true);
      else spinner.stop(cargoChecked ? 'cargo check passed' : 'cargo check failed (run it in the project for details)', cargoChecked);
    }
    if (answers.post.open !== 'none') openEditor(target, answers.post.open);

    if (!quiet) {
      const summary = await optionalUi('summary');
      if (summary.renderSummary) {
        console.log(summary.renderSummary(caps, ctx, dests, { dir: shown, cargoChecked, git: gitDone }));
      } else {
        console.log(`\n${caps.unicode ? '✔' : '[ok]'} create-rust-app scaffolded ${answers.name} (${dests.length} files)`);
        console.log(`\nNext:\n  cd ${shown}\n  cargo run\n  cargo test\n  cargo clippy --all-targets --all-features -- -D warnings`);
      }
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
