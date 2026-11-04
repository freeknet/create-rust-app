type Caps = import('./tty.ts').Caps;
import { paint, hsl, fgCode, bold, dim } from './rainbow.ts';
import { clip } from './tty.ts';

/** @typedef {import('./tty.ts').Caps} Caps */

const WORDMARK = 'CREATE-RUST-APP';
const TAGLINE = 'scaffold rust projects at the speed of light';
const RULE = 20;
export const FRAMES = 30;
export const INTERVAL_MS = 33;

/**
 * The two "Prism" lines for one animation frame.
 * @param {Caps} caps @param {number} frame
 * @returns {string[]}
 */
export function bannerFrame(caps: Caps, frame: number) {
  const max = Math.max(1, caps.columns);
  if (caps.tier === 'none') return [clip(WORDMARK, max), clip(TAGLINE, max)];

  // Wordmark: char i of CREATE-RUST-APP has hue (i*9 + frame*8), letter-spaced, bold.
  let spaced = WORDMARK.split('').join(' ');
  const shown = clip(spaced, max);
  let word = '';
  let i = 0;
  for (const ch of shown) {
    if (ch === ' ') { word += ' '; continue; }
    word += fgCode(caps, hsl(i * 9 + frame * 8, 0.95, 0.68)) + ch;
    i++;
  }
  spaced = bold(caps, word + '\x1b[39m');

  const diamond = caps.unicode ? '◇' : '-';
  const ruleChar = caps.unicode ? '━' : '=';
  const lead = `${diamond} ${TAGLINE} `;
  let line2;
  if (lead.length + RULE <= max) {
    const rule = paint(caps, ruleChar.repeat(RULE), { offset: frame * 12, step: 40 });
    line2 = dim(caps, lead) + rule;
  } else {
    line2 = dim(caps, clip(lead.trimEnd(), max));
  }
  return [spaced, line2];
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
      const [a, b] = bannerFrame(caps, f);
      out.write(`\x1b[2A\r${a}\x1b[K\n${b}\x1b[K\n`);
    }
    out.write('\n');
  } finally {
    restore();
    process.removeListener('SIGINT', onSigint);
  }
}
