type Tier = 'truecolor'|'ansi256'|'ansi16'|'none';
export type { Caps } from '../types.ts';
import type { Caps } from '../types.ts';
import { stripVTControlCharacters } from 'node:util';
import { spawnSync } from 'node:child_process';
import { release } from 'node:os';

/**
 * @typedef {'truecolor'|'ansi256'|'ansi16'|'none'} Tier
 * @typedef {{ tier: Tier, unicode: boolean, tty: boolean, columns: number, animate: boolean }} Caps
 */

/** Windows build number from os.release() ("10.0.19045" → 19045), or 0 elsewhere. */
function windowsBuild(): number {
  if (process.platform !== 'win32') return 0;
  return Number(release().split('.')[2] ?? 0) || 0;
}

/**
 * The classic Windows console has no font fallback, so what it can draw depends on its font.
 * HKCU\Console FaceName: "__DefaultTTFont__" is Consolas on Western locales; raster fonts and
 * Lucida Console lack most of what we draw.
 */
function consoleFont(): string {
  try {
    const r = spawnSync('reg', ['query', 'HKCU\\Console', '/v', 'FaceName'], { encoding: 'utf8', windowsHide: true, timeout: 1500 });
    return /FaceName\s+REG_SZ\s+(.+)/.exec(r.stdout ?? '')?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
}

/** Is this a modern terminal on Windows (full Unicode with font fallback)? */
function modernWindowsTerminal(env: NodeJS.ProcessEnv): boolean {
  return Boolean(env.WT_SESSION || env.TERM_PROGRAM === 'vscode' || env.VSCODE_PID || env.ConEmuANSI === 'ON'
    || env.TERMINAL_EMULATOR === 'JetBrains-JediTerm' || /xterm|alacritty|wezterm/i.test(env.TERM ?? ''));
}

/** @param {{ noColor?: boolean }} [options] @returns {Caps} */
export function detect({ noColor = false }: { noColor?: boolean; } | undefined = {}): Caps {
  const env = process.env;
  const tty = Boolean(process.stdout.isTTY);
  const build = windowsBuild();
  const winConsole = process.platform === 'win32' && !modernWindowsTerminal(env);

  let glyphs: Caps['glyphs'] = 'full';
  if (env.TERM === 'dumb' || env.TERM === 'linux') glyphs = 'ascii';
  else if (winConsole) glyphs = /^(__DefaultTTFont__|Consolas|Cascadia)/i.test(consoleFont()) ? 'console' : 'ascii';

  let tier: Caps['tier'] = 'none';
  if (tty && !noColor && env.NO_COLOR === undefined && !env.CI && env.TERM !== 'dumb') {
    if (/^(truecolor|24bit)$/i.test(env.COLORTERM || '') || env.WT_SESSION
      || ['vscode', 'iTerm.app', 'WezTerm'].includes(env.TERM_PROGRAM || '')) tier = 'truecolor';
    // Windows 10 1607 (build 14931) and later render 24-bit colour in the classic console too.
    else if (build >= 14931) tier = 'truecolor';
    else if (build >= 10586 || /256color/i.test(env.TERM || '')) tier = 'ansi256';
    else tier = 'ansi16';
  }
  return { tier, glyphs, unicode: glyphs !== 'ascii', tty, columns: columns(process.stdout.columns),
    animate: tty && (tier === 'truecolor' || tier === 'ansi256') && !env.CI };
}

/** Normalize missing or invalid terminal dimensions. @param {number} [value] */
export function columns(value: number | undefined) {
  return Number.isFinite(value) && Number(value) > 0 ? Math.max(1, Math.floor(Number(value))) : 80;
}

/** Presentation-only ASCII conversion; colour helpers never alter input text. @param {string} text */
export function ascii(text: string) {
  return text.replace(/[◆◇━─│╭╮╰╯┌┐└┘├┤┬┴┼✔✖…·›●○⣾⣽⣻⢿⡿⣟⣯⣷]/gu, (char: string) => {
    if (char === '◆') return '*';
    if (char === '◇') return '-';
    if (char === '━') return '=';
    if (char === '─') return '-';
    if (char === '│') return '|';
    if (char === '✔') return '[ok]';
    if (char === '✖') return '[x]';
    if (char === '…') return '...';
    if (char === '·') return '.';
    if (char === '›') return '>';
    if (char === '●') return '*';
    if (char === '○') return 'o';
    const spinner = '⣾⣽⣻⢿⡿⣟⣯⣷'.indexOf(char);
    return spinner >= 0 ? '-\\|/'[spinner % 4] ?? '+' : '+';
  }).normalize('NFKD').replace(/\p{Mark}/gu, '').replace(/[^\x00-\x7f]/g, '?');
}

/** Remove terminal controls from user-facing values. @param {Caps} caps @param {string} text */
export function plain(caps: Caps, text: string) {
  const clean = stripVTControlCharacters(text).replace(/[\x00-\x1f\x7f-\x9f]/g, ' ');
  return caps.unicode ? clean : ascii(clean);
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
/** @param {string} text */
export function graphemes(text: string) {
  return Array.from(segmenter.segment(text), (part: Intl.SegmentData) => part.segment);
}

/** Terminal cell width for a grapheme (combining marks, emoji and wide CJK). @param {string} char */
function cellWidth(char: string) {
  if (/^[\p{Mark}\p{Cf}\x00-\x1f\x7f-\x9f]+$/u.test(char)) return 0;
  if (/\p{Emoji_Presentation}|\uFE0F|\u20E3/u.test(char)) return 2;
  const cp = char.codePointAt(0) || 0;
  return cp >= 0x1100 && (cp <= 0x115f || cp === 0x2329 || cp === 0x232a
    || (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f)
    || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff)
    || (cp >= 0xfe10 && cp <= 0xfe19) || (cp >= 0xfe30 && cp <= 0xfe6f)
    || (cp >= 0xff00 && cp <= 0xff60) || (cp >= 0xffe0 && cp <= 0xffe6)
    || (cp >= 0x20000 && cp <= 0x3fffd)) ? 2 : 1;
}

/** @param {string} text */
export function width(text: string) {
  return graphemes(stripVTControlCharacters(text)).reduce((sum: number, char: string) => sum + cellWidth(char), 0);
}

/** Clip plain text before applying colour. @param {string} text @param {number} max */
export function clip(text: string, max: number) {
  let out = '';
  let used = 0;
  for (const char of graphemes(text)) {
    const cells = cellWidth(char);
    if (used + cells > max) break;
    out += char;
    used += cells;
  }
  return out;
}

/** Wrap plain text, preferring word boundaries. @param {string} text @param {number} max */
export function wrap(text: string, max: number) {
  const limit = Math.max(1, max);
  const lines = [];
  let rest = text;
  while (width(rest) > limit) {
    let head = clip(rest, limit);
    // A wide grapheme cannot fit in a one-cell terminal.
    if (!head) { lines.push('?'); rest = rest.slice((graphemes(rest)[0] ?? '').length); continue; }
    const space = head.lastIndexOf(' ');
    if (space > 0 && rest[head.length] !== ' ') head = head.slice(0, space);
    lines.push(head);
    rest = rest.slice(head.length).trimStart();
  }
  lines.push(rest);
  return lines;
}
