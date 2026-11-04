// @ts-check
/*
 * Post-scaffold summary.
 *
 *   import { detect } from './tty.js';
 *   import { renderSummary } from './summary.js';
 *
 *   const caps = detect({ noColor: flags.noColor });
 *   const dests = plan.map((entry) => entry.dest);       // POSIX-relative paths
 *   process.stdout.write(renderSummary(caps, ctx, dests, { dir: 'my-app', cargoChecked: true, git: true }));
 *
 * Every line fits within caps.columns (content is laid out for at most 80 columns).
 * With caps.tier === 'none' the output has no escape codes; with caps.unicode === false it is pure ASCII.
 */
import { paint, hex, dim, bold } from './rainbow.js';
import { CHROME, stop, glyph } from './theme.js';
import { plain, clip, wrap, width } from './tty.js';

/** @typedef {import('./tty.js').Caps} Caps */

const MAX_WIDTH = 80;
const ROOT_FILE_CAP = 10;
const CHILD_CAP = 6;

/** @param {Record<string, unknown> | undefined} obj */
function onKeys(obj) {
  return Object.entries(obj || {}).filter(([, v]) => v === true).map(([k]) => k);
}

/** @param {any} ctx */
function stackOf(ctx) {
  switch (ctx.kind) {
    case 'gui':
    case 'workspace':
      return ctx.guiStack === 'winit-glow' ? 'winit + glutin + egui_glow' : 'eframe + wgpu';
    case 'tui': return 'ratatui + crossterm';
    case 'cli': return ctx.crates?.clap ? 'clap' : 'std';
    case 'lib': return 'library (no binary)';
    default: return String(ctx.kind ?? '');
  }
}

/** @param {any} ctx */
function cratesOf(ctx) {
  const c = ctx.crates || {};
  const out = [];
  if (c.errors) out.push(c.errors);
  if (c.thiserror) out.push('thiserror');
  if (c.logging) out.push(c.logging === 'env_logger' ? 'log + env_logger' : c.logging);
  if (c.serde) out.push('serde + toml');
  if (c.async && c.async !== 'none') out.push(c.async);
  if (c.http && c.http !== 'none') out.push(c.http);
  if (c.sqlite) out.push('rusqlite');
  if (c.clap) out.push('clap');
  return out;
}

/**
 * Rows for the key/value table.
 * @param {any} ctx @param {{ cargoChecked?: boolean|null, git?: boolean }} opts
 * @returns {[string, string][]}
 */
function rows(ctx, opts) {
  const list = (/** @type {string[]} */ xs) => (xs.length ? xs.join(', ') : 'none');
  const kind = ctx.kind === 'workspace' ? 'workspace (app + xtask)' : String(ctx.kind ?? '');
  /** @type {[string, string][]} */
  const out = [
    ['kind', kind],
    ['stack', stackOf(ctx)],
    ['edition', `${ctx.edition ?? '?'} · MSRV ${ctx.msrv ?? '?'} · toolchain ${ctx.toolchain ?? '?'}`],
    ['licence', String(ctx.license ?? '')],
    ['crates', list(cratesOf(ctx))],
  ];
  const features = onKeys(ctx.features);
  if (features.length || ctx.kind === 'gui' || ctx.kind === 'workspace') out.push(['features', list(features)]);
  out.push(['tooling', list(onKeys(ctx.tooling))]);
  const checks = [];
  if (opts.cargoChecked === true) checks.push('cargo check ✔');
  else if (opts.cargoChecked === false) checks.push('cargo check failed');
  if (opts.git) checks.push('git initialised');
  if (checks.length) out.push(['checks', checks.join(' · ')]);
  return out;
}

/**
 * @typedef {{ name: string, dirs: Map<string, Node>, files: string[] }} Node
 */

/** @param {string[]} dests @returns {Node} */
function buildTree(dests) {
  /** @type {Node} */
  const root = { name: '', dirs: new Map(), files: [] };
  for (const dest of dests) {
    const parts = dest.replace(/\\/g, '/').split('/').filter((p) => p && p !== '.');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = node.dirs.get(parts[i]);
      if (!next) {
        next = { name: parts[i], dirs: new Map(), files: [] };
        node.dirs.set(parts[i], next);
      }
      node = next;
    }
    if (parts.length) node.files.push(parts[parts.length - 1]);
  }
  return root;
}

/** @param {string} a @param {string} b */
const byName = (a, b) => a.localeCompare(b, 'en');

/**
 * File tree, depth 2. Directories are tinted; each directory lists at most a few entries.
 * @param {Caps} caps @param {string[]} dests @param {number} max
 */
function renderTree(caps, dests, max) {
  const root = buildTree(dests);
  const g = (/** @type {string} */ s) => glyph(caps, s);
  /** @type {string[]} */
  const lines = [];

  /** @param {string} prefix @param {string} name @param {boolean} isDir @param {number} tint */
  const entry = (prefix, name, isDir, tint) => {
    const shownPrefix = g(prefix);
    const label = clip(plain(caps, isDir ? `${name}/` : name), Math.max(1, max - width(shownPrefix)));
    const body = isDir ? hex(caps, stop(tint), bold(caps, label)) : label;
    lines.push(dim(caps, shownPrefix) + body);
  };
  /** @param {string} prefix @param {number} n */
  const more = (prefix, n) => {
    const shownPrefix = g(prefix);
    lines.push(dim(caps, shownPrefix + clip(g(`… ${n} more`), Math.max(1, max - width(shownPrefix)))));
  };

  const topDirs = [...root.dirs.values()].sort((a, b) => byName(a.name, b.name));
  const topFiles = [...root.files].sort(byName);
  const shownFiles = topFiles.slice(0, ROOT_FILE_CAP);
  const hidden = topFiles.length - shownFiles.length;
  const total = topDirs.length + shownFiles.length + (hidden > 0 ? 1 : 0);
  let idx = 0;

  topDirs.forEach((dir, d) => {
    const last = ++idx === total;
    entry(last ? '└─ ' : '├─ ', dir.name, true, d);
    const pad = last ? '   ' : '│  ';
    const kids = [
      ...[...dir.dirs.keys()].sort(byName).map((name) => ({ name, isDir: true })),
      ...[...dir.files].sort(byName).map((name) => ({ name, isDir: false })),
    ];
    const shown = kids.length > CHILD_CAP ? kids.slice(0, CHILD_CAP - 1) : kids;
    const rest = kids.length - shown.length;
    shown.forEach((kid, k) => {
      const kidLast = k === shown.length - 1 && rest === 0;
      entry(pad + (kidLast ? '└─ ' : '├─ '), kid.name, kid.isDir, d + 1);
    });
    if (rest > 0) more(`${pad}└─ `, rest);
  });
  for (const file of shownFiles) entry(++idx === total ? '└─ ' : '├─ ', file, false, 0);
  if (hidden > 0) more('└─ ', hidden);
  return lines;
}

/**
 * Rounded "Next" box.
 * @param {Caps} caps @param {string} title @param {string[]} commands @param {number} max
 */
function renderBox(caps, title, commands, max) {
  const g = (/** @type {string} */ s) => glyph(caps, s);
  const inner = Math.max(4, max - 4); // "│ " + text + " │"
  const body = commands.flatMap((cmd) => {
    const [first, ...rest] = wrap(`$ ${cmd}`, inner);
    return [{ text: first, cmd: true }, ...rest.map((t) => ({ text: `  ${t}`, cmd: true }))]
      .map((l) => ({ ...l, text: clip(l.text, inner) }));
  });
  const contentWidth = Math.min(inner, Math.max(width(title) + 2, ...body.map((l) => width(l.text))));
  const bar = (/** @type {string} */ s) => hex(caps, CHROME.bar, s);
  const head = ` ${clip(title, Math.max(1, contentWidth - 1))} `;
  const top = bar(g('╭─')) + bold(caps, head) + bar(g('─'.repeat(Math.max(0, contentWidth + 1 - width(head))) + '╮'));
  const lines = [top];
  for (const l of body) {
    const pad = ' '.repeat(Math.max(0, contentWidth - width(l.text)));
    const text = l.text.startsWith('$ ')
      ? dim(caps, '$') + ' ' + l.text.slice(2)
      : l.text;
    lines.push(`${bar(g('│'))} ${text}${pad} ${bar(g('│'))}`);
  }
  lines.push(bar(g(`╰${'─'.repeat(contentWidth + 2)}╯`)));
  return lines;
}

/** Shell-quote a directory for `cd` when it needs it. @param {string} dir */
function quoteDir(dir) {
  return /^[\w./\\:-]+$/.test(dir) ? dir : `"${dir.replace(/"/g, '\\"')}"`;
}

/**
 * @param {Caps} caps
 * @param {any} ctx  the Ctx from buildContext
 * @param {string[]} dests  POSIX-relative paths that were written
 * @param {{ dir: string, cargoChecked?: boolean|null, git?: boolean }} opts
 * @returns {string}
 */
export function renderSummary(caps, ctx, dests, opts) {
  const max = Math.max(10, Math.min(caps.columns, MAX_WIDTH));
  const g = (/** @type {string} */ s) => glyph(caps, s);
  const name = plain(caps, String(ctx.name ?? ''));
  /** @type {string[]} */
  const lines = [];

  // Gradient rule + headline.
  lines.push(paint(caps, g('━').repeat(max), { step: 360 / max }));
  const okMark = g('✔');
  const head = clip(`create-rust-app scaffolded ${name}`, Math.max(1, max - width(okMark) - 1));
  const prefix = 'create-rust-app scaffolded ';
  const headText = head.startsWith(prefix)
    ? bold(caps, paint(caps, 'create-rust-app', { step: 12 })) + dim(caps, ' scaffolded ')
      + bold(caps, head.slice(prefix.length))
    : head;
  lines.push(`${hex(caps, CHROME.success, okMark)} ${headText}`);
  lines.push('');

  // Two-column table.
  const table = rows(ctx, opts);
  const keyWidth = Math.max(...table.map(([k]) => k.length)) + 2;
  const indent = 2;
  const valueWidth = Math.max(1, max - indent - keyWidth);
  table.forEach(([key, value], i) => {
    const wrapped = wrap(plain(caps, value), valueWidth);
    wrapped.forEach((part, j) => {
      const keyCell = j === 0 ? hex(caps, stop(i), key) + ' '.repeat(keyWidth - key.length) : ' '.repeat(keyWidth);
      lines.push(' '.repeat(indent) + keyCell + clip(part, valueWidth));
    });
  });
  lines.push('');

  // Tree.
  const dirName = plain(caps, opts.dir || name || '.');
  lines.push(hex(caps, CHROME.bar, bold(caps, clip(`${dirName.replace(/[\\/]+$/, '')}/`, max))));
  lines.push(...renderTree(caps, dests, max));
  lines.push('');

  // Next box.
  const commands = [];
  if (opts.dir && opts.dir !== '.') commands.push(`cd ${quoteDir(plain(caps, opts.dir))}`);
  commands.push(ctx.kind === 'lib' ? 'cargo test' : 'cargo run');
  commands.push('cargo clippy --all-targets --all-features -- -D warnings');
  lines.push(...renderBox(caps, 'Next', commands, max));
  lines.push('');

  // Sign-off.
  const long = g('Happy hacking ─ go build something luminous.');
  const signoff = clip(width(long) <= max ? long : 'Happy hacking!', max);
  lines.push(paint(caps, signoff, { step: 360 / Math.max(1, signoff.length), offset: 300 }));

  return `${lines.join('\n')}\n`;
}
