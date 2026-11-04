/**
 * Every character the UI draws, in three sets.
 *
 * - full:    modern terminals (Windows Terminal, VS Code, macOS/Linux).
 * - console: the classic Windows console with Consolas. It has no font fallback, so a glyph the font
 *            lacks prints as a box. Consolas has block elements, box drawing (incl. rounded corners),
 *            ━ ● ○ ■ □ ♦ ◊ √ × ░▒▓ but not ◆ ◇ ◼ ◻ ✔ ✖ or braille — checked against consola.ttf's cmap.
 * - ascii:   everything else (raster fonts, Lucida Console, TERM=dumb, pipes to old tools).
 */
import type { Caps } from '../types.ts';

export type GlyphLevel = Caps['glyphs'];

export interface Glyphs {
  step: string; done: string; cancel: string; bar: string; barEnd: string; barStart: string;
  radioOn: string; radioOff: string; boxOn: string; boxOff: string; ok: string; fail: string;
  tl: string; tr: string; bl: string; br: string; h: string; v: string; tee: string;
  rule: string; spinner: string[]; sep: string; ellipsis: string; up: string; down: string; cursor: string;
}

const FULL: Glyphs = {
  step: '◆', done: '◇', cancel: '■', bar: '│', barEnd: '└', barStart: '┌',
  radioOn: '●', radioOff: '○', boxOn: '◼', boxOff: '◻', ok: '✔', fail: '✖',
  tl: '╭', tr: '╮', bl: '╰', br: '╯', h: '─', v: '│', tee: '├',
  rule: '━', spinner: ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'], sep: ' · ', ellipsis: '…', up: '↑', down: '↓', cursor: '█',
};

const CONSOLE: Glyphs = {
  ...FULL,
  step: '♦', done: '◊', boxOn: '■', boxOff: '□', ok: '√', fail: '×',
  spinner: ['░', '▒', '▓', '█', '▓', '▒'],
};

const ASCII: Glyphs = {
  step: '*', done: 'o', cancel: 'x', bar: '|', barEnd: '`', barStart: '.',
  radioOn: '>', radioOff: ' ', boxOn: '[x]', boxOff: '[ ]', ok: '[ok]', fail: '[x]',
  tl: '+', tr: '+', bl: '+', br: '+', h: '-', v: '|', tee: '+',
  rule: '=', spinner: ['-', '\\', '|', '/'], sep: ' / ', ellipsis: '...', up: 'up', down: 'down', cursor: '_',
};

export function glyphs(caps: Pick<Caps, 'glyphs'>): Glyphs {
  return caps.glyphs === 'full' ? FULL : caps.glyphs === 'console' ? CONSOLE : ASCII;
}
