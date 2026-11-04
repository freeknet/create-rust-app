// @ts-check
import { hsl, rgbText, hex } from './rainbow.js';
import { CHROME } from './theme.js';
import { plain, clip } from './tty.js';

/** @typedef {import('./tty.js').Caps} Caps */

const BRAILLE = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'];
const ASCII = ['-', '\\', '|', '/'];

/**
 * A single-line spinner. Animates on capable TTYs; otherwise prints one line on start and one on stop.
 * @param {Caps} caps
 * @param {{ out?: { write(s: string): unknown }, interval?: number }} [opts]
 */
export function createSpinner(caps, { out = process.stdout, interval = 80 } = {}) {
  const frames = caps.unicode ? BRAILLE : ASCII;
  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;
  let text = '';
  let tick = 0;
  const max = Math.max(1, caps.columns - 3);
  const fit = (/** @type {string} */ msg) => clip(plain(caps, msg), max);

  const draw = () => {
    const frame = rgbText(caps, hsl(tick * 24, 0.95, 0.68), frames[tick % frames.length]);
    out.write(`\r${frame} ${text}\x1b[K`);
    tick++;
  };
  const restore = () => out.write('\x1b[?25h');
  const onSigint = () => {
    if (timer) clearInterval(timer);
    restore();
    out.write('\n');
    process.exit(130);
  };

  return {
    /** @param {string} msg */
    start(msg) {
      text = fit(msg);
      if (!caps.animate) {
        out.write(`${caps.unicode ? '…' : '...'} ${text}\n`);
        return;
      }
      if (timer) return;
      process.once('SIGINT', onSigint);
      out.write('\x1b[?25l');
      draw();
      timer = setInterval(draw, interval);
    },
    /** @param {string} msg */
    message(msg) {
      text = fit(msg);
      if (timer) draw();
    },
    /** @param {string} [msg] @param {boolean} [ok] */
    stop(msg = text, ok = true) {
      const mark = ok
        ? hex(caps, CHROME.success, caps.unicode ? '✔' : '[ok]')
        : hex(caps, CHROME.danger, caps.unicode ? '✖' : '[x]');
      const line = `${mark} ${fit(msg)}`;
      if (timer) {
        clearInterval(timer);
        timer = null;
        out.write(`\r${line}\x1b[K\n`);
        restore();
        process.removeListener('SIGINT', onSigint);
      } else {
        out.write(`${line}\n`);
      }
    },
  };
}
