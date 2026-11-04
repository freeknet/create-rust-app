/**
 * Small, purposeful motion. Everything here degrades to a static frame when `caps.animate` is false
 * (no TTY, CI, NO_COLOR, 16-colour terminals), so pipes and logs stay clean.
 *
 * - live(prompt):   re-renders an open @clack/core prompt on a timer so it can breathe while idle
 *                   (core only redraws on keypress; its render() diffs lines, so this is cheap).
 * - marker/shimmer: the active ◆ cycles through the brand hues; the focused label sweeps a gradient.
 * - wave:           a 3-cell spinner (braille dots, or ░▒▓ in the Windows console) in moving colour.
 * - cascade:        prints a block line by line, quickly, so a screen "assembles" instead of popping.
 * - sparkle:        the closing line shimmers once, then settles.
 */
import { hsl, rgbText, paint, bold } from './rainbow.ts';
import { glyphs } from './glyphs.ts';
import type { Caps } from '../types.ts';

export const TICK_MS = 80;
const BRAND_START = 140; // green → cyan → violet, same as the banner and brand assets
const BRAND_SPAN = 140;

/** A hue that drifts back and forth across the brand range. */
export function brandHue(t: number) {
  return BRAND_START + (BRAND_SPAN / 2) * (1 + Math.sin(t / 7));
}

/** The active step marker for frame t. */
export function marker(caps: Caps, glyph: string, t: number) {
  return rgbText(caps, hsl(brandHue(t), 0.95, 0.66), glyph);
}

/** A bold label with a gradient sweeping through it. */
export function shimmer(caps: Caps, text: string, t: number) {
  if (!caps.animate) return bold(caps, text);
  return bold(caps, paint(caps, text, { offset: BRAND_START + t * 9, step: 11, light: 0.72 }));
}

/** Keep an open prompt redrawing while it waits for input. Returns the frame counter. */
/** Advances `state.t` every tick (the renderer reads it), and redraws the prompt. */
export function live(caps: Caps, target: object, state: { t: number } = { t: 0 }) {
  if (!caps.animate) return state;
  // @clack/core types render() as private, but it is the method core itself calls on resize; it
  // diffs against the previous frame and repaints only changed lines.
  const prompt = target as { render(): void; once(ev: string, fn: () => void): unknown };
  const timer = setInterval(() => { state.t++; prompt.render(); }, TICK_MS);
  timer.unref();
  const stop = () => clearInterval(timer);
  prompt.once('finalize', stop);
  prompt.once('submit', stop);
  prompt.once('cancel', stop);
  return state;
}

const BRAILLE = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SHADE = ['░', '▒', '▓', '█', '▓', '▒'];

/** A three-cell spinner whose cells are out of phase and coloured along a moving gradient. */
export function wave(caps: Caps, frame: number) {
  const g = glyphs(caps);
  if (caps.glyphs === 'ascii') return g.spinner[frame % g.spinner.length] ?? '*';
  const cells = caps.glyphs === 'full' ? BRAILLE : SHADE;
  let out = '';
  for (let i = 0; i < 3; i++) {
    const cell = cells[(frame + i * 2) % cells.length] ?? '';
    out += rgbText(caps, hsl(BRAND_START + frame * 14 + i * 40, 0.95, 0.66), cell);
  }
  return out;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Write lines one by one (fast) when animating; all at once otherwise. */
export async function cascade(caps: Caps, lines: string[], ms = 14) {
  if (!caps.animate) { process.stdout.write(`${lines.join('\n')}\n`); return; }
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
    await sleep(ms);
  }
}

/** The closing line: a short shimmer with sparkles either side, then the settled colours. */
export async function sparkle(caps: Caps, prefix: string, text: string) {
  const sparks = caps.glyphs === 'full' ? ['✦', '✧', '⋆', '·'] : caps.glyphs === 'console' ? ['*', '+', '·', ' '] : ['*', '+', '.', ' '];
  const frame = (t: number, settled: boolean) => {
    const body = paint(caps, text, { offset: BRAND_START + (settled ? 0 : t * 12), step: 7 });
    if (settled) return `${prefix}${body}`;
    const s = (i: number) => rgbText(caps, hsl(BRAND_START + t * 20 + i * 60, 0.95, 0.7), sparks[(t + i) % sparks.length] ?? ' ');
    return `${prefix}${body} ${s(0)}${s(1)}${s(2)}`;
  };
  if (!caps.animate || !caps.tty) { process.stdout.write(`${frame(0, true)}\n`); return; }
  process.stdout.write('\x1b[?25l');
  try {
    for (let t = 0; t < 14; t++) {
      process.stdout.write(`\r\x1b[2K${frame(t, false)}`);
      await sleep(60);
    }
    process.stdout.write(`\r\x1b[2K${frame(0, true)}\n`);
  } finally {
    process.stdout.write('\x1b[?25h');
  }
}
