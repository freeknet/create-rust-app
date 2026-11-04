type Caps = import('./tty.ts').Caps;
import { paint, hsl, fgCode, bold, dim } from './rainbow.ts';
import { clip } from './tty.ts';
import { glyphs } from './glyphs.ts';

/** @typedef {import('./tty.ts').Caps} Caps */

const WORDMARK = 'CREATE-RUST-APP';
const TAGLINE = 'scaffold rust projects at the speed of light';
const RULE = 20;
export const FRAMES = 30;
export const INTERVAL_MS = 33;

/**
 * 3-row block glyphs (half blocks) for the wordmark. Every glyph is 3 columns wide; one space
 * between glyphs gives a 59-column logo.
 */
const GLYPHS: Record<string, [string, string, string]> = {
  C: ['▄▀▀', '█  ', '▀▀▀'], R: ['█▀▄', '█▀▄', '▀ ▀'], E: ['█▀▀', '█▀ ', '▀▀▀'], A: ['▄▀▄', '█▀█', '▀ ▀'],
  T: ['▀█▀', ' █ ', ' ▀ '], U: ['█ █', '█ █', '▀▀▀'], S: ['▄▀▀', '▀▀▄', '▀▀ '], P: ['█▀▄', '█▀ ', '▀  '],
  '-': ['   ', '▀▀▀', '   '],
};
/** Green → cyan → violet, matching the brand assets (assets/brand, scripts/brand.mjs). */
const HUE_START = 140;
const HUE_PER_COLUMN = 2.1;
export const BLOCK_WIDTH = WORDMARK.length * 4 - 1;

/** The wordmark rows for one frame: block letters when they fit and render, else one bold line. */
function wordmark(caps: Caps, frame: number, max: number): string[] {
  // The sweep travels toward the brand hues and lands on them on the last frame.
  const drift = Math.max(0, FRAMES - 1 - frame) * 6;
  // Block elements (▀▄█) are in Consolas too, so the classic Windows console gets the block logo.
  if (caps.glyphs !== 'ascii' && max >= BLOCK_WIDTH) {
    return [0, 1, 2].map((row) => {
      let out = '';
      let col = 0;
      for (const ch of WORDMARK) {
        const glyph = GLYPHS[ch]?.[row] ?? '   ';
        for (const cell of glyph) {
          out += cell === ' ' ? ' ' : fgCode(caps, hsl(HUE_START + col * HUE_PER_COLUMN + drift, 0.95, 0.66)) + cell;
          col++;
        }
        out += ' ';
        col++;
      }
      return `${out.trimEnd()}\x1b[39m`;
    });
  }
  let word = '';
  [...clip(WORDMARK, max)].forEach((ch, i) => {
    word += fgCode(caps, hsl(HUE_START + i * 9 + drift, 0.95, 0.68)) + ch;
  });
  return [bold(caps, `${word}\x1b[39m`)];
}

/**
 * The "Prism" lines for one animation frame: the wordmark rows, then tagline + rainbow rule.
 * @param {Caps} caps @param {number} frame
 * @returns {string[]}
 */
export function bannerFrame(caps: Caps, frame: number) {
  const max = Math.max(1, caps.columns);
  if (caps.tier === 'none') return [clip(WORDMARK, max), clip(TAGLINE, max)];
  const rows = wordmark(caps, frame, max);

  const g = glyphs(caps);
  const diamond = caps.glyphs === 'ascii' ? '-' : g.done;
  const ruleChar = g.rule;
  const lead = `${diamond} ${TAGLINE} `;
  // The rule runs out to the wordmark's right edge so the two lines read as one block.
  const ruleLen = rows.length > 1 ? Math.max(8, BLOCK_WIDTH - lead.length) : RULE;
  let line2;
  if (lead.length + ruleLen <= max) {
    const rule = paint(caps, ruleChar.repeat(ruleLen), { offset: frame * 12, step: 360 / ruleLen });
    line2 = dim(caps, lead) + rule;
  } else {
    line2 = dim(caps, clip(lead.trimEnd(), max));
  }
  return [...rows, line2];
}

/** @param {number} ms */
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Print the banner, animating when caps.animate; always ends with one blank line.
 * @param {Caps} caps
 * @param {{ out?: { write(s: string): unknown }, frames?: number, interval?: number }} [opts]
 */
export async function showBanner(caps: Caps, { out = process.stdout, frames = FRAMES, interval = INTERVAL_MS }: { out?: { write(s: string): unknown; }; frames?: number; interval?: number; } | undefined = {}) {
  const last = Math.max(0, frames - 1);
  if (!caps.animate) {
    out.write(`${bannerFrame(caps, last).join('\n')}\n\n`);
    return;
  }
  const restore = () => out.write('\x1b[?25h');
  const onSigint = () => {
    restore();
    out.write('\n');
    process.exit(130);
  };
  process.once('SIGINT', onSigint);
  out.write('\x1b[?25l');
  try {
    out.write(`${bannerFrame(caps, 0).join('\n')}\n`);
    for (let f = 1; f <= last; f++) {
      await sleep(interval);
      const lines = bannerFrame(caps, f);
      out.write(`\x1b[${lines.length}A\r${lines.map((l) => `${l}\x1b[K`).join('\n')}\n`);
    }
    out.write('\n');
  } finally {
    restore();
    process.removeListener('SIGINT', onSigint);
  }
}
