type Caps = import('./tty.ts').Caps;
type Rgb = [number, number, number];
import { graphemes } from './tty.ts';

/** @typedef {import('./tty.ts').Caps} Caps */
/** @typedef {[number, number, number]} Rgb */

const RESET_FG = '\x1b[39m';

/** HSL (h degrees, s/l 0..1) to RGB 0..255. @param {number} h @param {number} s @param {number} l @returns {Rgb} */
export function hsl(h: number, s: number, l: number) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  /** @type {[number, number, number]} */
  let rgb: [number, number, number];
  if (hue < 60) rgb = [c, x, 0];
  else if (hue < 120) rgb = [x, c, 0];
  else if (hue < 180) rgb = [0, c, x];
  else if (hue < 240) rgb = [0, x, c];
  else if (hue < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];
  return /** @type {Rgb} */ (rgb.map((v: number) => Math.round((v + m) * 255)) as Rgb);
}

/** @param {string} value e.g. '#ff6ec7' or 'f6c' @returns {Rgb} */
export function parseHex(value: string): Rgb {
  let h = value.replace(/^#/, '');
  if (h.length === 3) h = h.replace(/./g, '$&$&');
  const n = Number.parseInt(h, 16);
  if (!/^[0-9a-f]{6}$/i.test(h) || Number.isNaN(n)) return [255, 255, 255];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue (degrees) and saturation (0..1) of an RGB colour. @param {Rgb} rgb */
function hueSat([r, g, b]: Rgb) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return { hue: 0, sat: 0, light: max / 255 };
  let hue;
  if (max === r) hue = ((g - b) / d) % 6;
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return { hue: (hue * 60 + 360) % 360, sat: d / Math.max(1, max), light: max / 255 };
}

const CUBE = [0, 95, 135, 175, 215, 255];
/** @param {number} v */
function cubeIndex(v: number) {
  let best = 0;
  for (let i = 1; i < CUBE.length; i++) if (Math.abs((CUBE[i] ?? 0) - v) < Math.abs((CUBE[best] ?? 0) - v)) best = i;
  return best;
}

/** Nearest xterm-256 colour-cube entry. @param {Rgb} rgb */
export function toAnsi256([r, g, b]: Rgb) {
  return 16 + 36 * cubeIndex(r) + 6 * cubeIndex(g) + cubeIndex(b);
}

/** One of the six bright ANSI colours by hue (grey / white for unsaturated). @param {Rgb} rgb */
export function toAnsi16(rgb: Rgb) {
  const { hue, sat, light } = hueSat(rgb);
  if (sat < 0.2) return light > 0.75 ? 97 : 90;
  if (hue < 30 || hue >= 330) return 91; // red
  if (hue < 90) return 93; // yellow
  if (hue < 150) return 92; // green
  if (hue < 210) return 96; // cyan
  if (hue < 270) return 94; // blue
  return 95; // magenta
}

/** Opening escape for an RGB foreground in this tier ('' for none). @param {Caps} caps @param {Rgb} rgb */
export function fgCode(caps: Caps, rgb: Rgb) {
  switch (caps.tier) {
    case 'truecolor': return `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m`;
    case 'ansi256': return `\x1b[38;5;${toAnsi256(rgb)}m`;
    case 'ansi16': return `\x1b[${toAnsi16(rgb)}m`;
    default: return '';
  }
}

/** Colour text with an RGB foreground. @param {Caps} caps @param {Rgb} rgb @param {string} text */
export function rgbText(caps: Caps, rgb: Rgb, text: string) {
  if (caps.tier === 'none' || !text) return text;
  return `${fgCode(caps, rgb)}${text}${RESET_FG}`;
}

/**
 * Per-grapheme hue sweep. Visible text is never altered; whitespace is left uncoloured.
 * @param {Caps} caps @param {string} text
 * @param {{ offset?: number, step?: number, sat?: number, light?: number }} [opts]
 */
export function paint(caps: Caps, text: string, { offset = 0, step = 9, sat = 0.95, light = 0.68 }: { offset?: number; step?: number; sat?: number; light?: number; } | undefined = {}) {
  if (caps.tier === 'none' || !text) return text;
  let out = '';
  let i = 0;
  for (const ch of graphemes(text)) {
    out += /^\s+$/u.test(ch) ? ch : fgCode(caps, hsl(offset + i * step, sat, light)) + ch;
    i++;
  }
  return out + RESET_FG;
}

/** @param {Caps} caps @param {string} color hex like '#ff6ec7' @param {string} text */
export function hex(caps: Caps, color: string, text: string) {
  return rgbText(caps, parseHex(color), text);
}

export const DIM = '#9aa8bc';

/** Chrome dim colour (SGR 2 on 16-colour terminals). @param {Caps} caps @param {string} text */
export function dim(caps: Caps, text: string) {
  if (caps.tier === 'none' || !text) return text;
  if (caps.tier === 'ansi16') return `\x1b[2m${text}\x1b[22m`;
  return hex(caps, DIM, text);
}

/** @param {Caps} caps @param {string} text */
export function bold(caps: Caps, text: string) {
  if (caps.tier === 'none' || !text) return text;
  return `\x1b[1m${text}\x1b[22m`;
}
