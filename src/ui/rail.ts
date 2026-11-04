/**
 * The "rail" every screen hangs off (│ … ◆ … ◇ … └), plus the text prompt, the review note, the
 * next-steps box, ticked tasks and the closing line. Drawn here rather than by @clack/prompts so one
 * glyph set (ui/glyphs.ts) applies everywhere — clack decides Unicode once at import time with no
 * override, which is what made the classic Windows console fall back to `*` and `|`.
 */
import { TextPrompt } from '@clack/core';
import { bold, dim, hex } from './rainbow.ts';
import { glyphs } from './glyphs.ts';
import { width } from './tty.ts';
import { cascade, live, marker, sparkle, wave } from './motion.ts';
import type { Caps } from '../types.ts';

export const COLORS = { live: '#7cf7ff', done: '#b6ff6e', rail: '#6f6a85', warn: '#ffd36e', error: '#ff6b7c' };

const write = (s: string) => process.stdout.write(s);

export function rail(caps: Caps) {
  const g = glyphs(caps);
  return {
    g,
    bar: (s = g.bar) => hex(caps, COLORS.rail, s),
    live: (s = g.bar) => hex(caps, COLORS.live, s),
    done: (s = g.done) => hex(caps, COLORS.done, s),
    error: (s: string) => hex(caps, COLORS.error, s),
  };
}

/** Free-text prompt. Resolves to the value or the cancel symbol. */
export function text(caps: Caps, o: {
  message: string; placeholder?: string; defaultValue?: string; initialValue?: string;
  validate?: (v: string) => string | undefined;
  io?: import('./choose.ts').Io;
}) {
  const r = rail(caps);
  const anim = { t: 0 };
  const prompt = new TextPrompt({
    ...(o.io ?? {}),
    ...(o.initialValue !== undefined ? { initialValue: o.initialValue } : {}),
    ...(o.defaultValue !== undefined ? { defaultValue: o.defaultValue } : {}),
    ...(o.validate ? { validate: (v: string | undefined) => o.validate?.(v ?? o.defaultValue ?? '') } : {}),
    render() {
      const head = `${r.bar()}\n`;
      if (this.state === 'submit') return `${head}${r.done()}  ${o.message}\n${r.bar()}  ${dim(caps, this.value ?? '')}`;
      if (this.state === 'cancel') return `${head}${r.error(r.g.cancel)}  ${o.message}\n${r.bar()}`;
      // Only one line may change per animation tick (see motion.ts): here that's the marker, so the
      // cursor in front of the placeholder stays steady.
      const input = this.userInput
        ? this.userInputWithCursor
        : `${hex(caps, COLORS.live, r.g.cursor)}${dim(caps, o.placeholder ?? '')}`;
      const err = this.state === 'error';
      const color = err ? COLORS.warn : COLORS.live;
      const step = err ? hex(caps, color, r.g.step) : marker(caps, r.g.step, anim.t);
      const foot = err ? hex(caps, COLORS.warn, this.error) : dim(caps, 'enter confirm · esc cancel');
      return `${head}${step}  ${o.message}\n${hex(caps, color, r.g.bar)}  ${input}\n${hex(caps, color, r.g.barEnd)}  ${foot}`;
    },
  });
  live(caps, prompt, anim);
  return prompt.prompt() as Promise<string | symbol>;
}

/** A titled panel on the rail: `◇  title ───╮`, body lines, `├───╯`. */
export async function note(caps: Caps, title: string, body: string) {
  const r = rail(caps);
  const lines = body.split('\n');
  const inner = Math.max(width(title) + 2, ...lines.map((l) => width(l))) + 2;
  const top = `${r.done()}  ${title} ${r.bar(r.g.h.repeat(Math.max(1, inner - width(title) - 1)) + r.g.tr)}`;
  const mid = ['', ...lines, ''].map((l) => `${r.bar()}  ${l}${' '.repeat(Math.max(0, inner - width(l)))}${r.bar()}`);
  const bottom = r.bar(`${r.g.tee}${r.g.h.repeat(inner + 2)}${r.g.br}`);
  await cascade(caps, [r.bar(), top, ...mid, bottom]);
}

/** A boxed block, fitted to its content: `╭─ title ──╮ │ … │ ╰──╯`. */
export function box(caps: Caps, title: string, lines: string[]) {
  const r = rail(caps);
  const edge = (s: string) => hex(caps, COLORS.live, s);
  // inner = content width + 2 spaces of padding each side.
  const inner = Math.max(width(title) + 4, ...lines.map((l) => width(l))) + 4;
  const top = `${edge(`${r.g.tl}${r.g.h}`)} ${title} ${edge(`${r.g.h.repeat(Math.max(1, inner - width(title) - 3))}${r.g.tr}`)}`;
  const body = lines.map((l) => `${edge(r.g.v)}  ${l}${' '.repeat(Math.max(0, inner - 2 - width(l)))}${edge(r.g.v)}`);
  const bottom = edge(`${r.g.bl}${r.g.h.repeat(inner)}${r.g.br}`);
  write(`${r.bar()}\n${[top, ...body, bottom].map((l) => `${r.bar()} ${l}`).join('\n')}\n`);
}

/** A paragraph on the rail. */
export function log(caps: Caps, lines: string[]) {
  const r = rail(caps);
  write(`${r.bar()}\n${lines.map((l) => `${r.bar()}  ${l}`).join('\n')}\n`);
}

/** Closing line: `└  ◆ message` with a brief shimmer + sparkles when animating. */
export async function outro(caps: Caps, message: string) {
  const r = rail(caps);
  write(`${r.bar()}\n`);
  await sparkle(caps, `${r.bar(r.g.barEnd)}  ${marker(caps, r.g.step, 0)} `, message);
  write('\n');
}

export function cancel(caps: Caps, message: string) {
  const r = rail(caps);
  write(`${r.bar()}\n${r.bar(r.g.barEnd)}  ${r.error(message)}\n\n`);
}

export interface Task { title: string; enabled?: boolean; run: (update: (msg: string) => void) => Promise<{ ok: boolean | null; message: string }> }

/**
 * Run tasks one after another. Each shows a spinner line while running and settles into
 * `◇  message  0.4s` (or a warning mark when it failed or was skipped).
 */
export async function tasks(caps: Caps, list: Task[]) {
  const r = rail(caps);
  for (const t of list) {
    if (t.enabled === false) continue;
    const t0 = performance.now();
    let msg = t.title;
    let frame = 0;
    const draw = () => {
      const spin = wave(caps, frame++);
      const line = `${spin}  ${msg}`;
      const max = Math.max(10, caps.columns - 1);
      write(`\r\x1b[2K${width(line) > max ? `${line.slice(0, max - 1)}${r.g.ellipsis}` : line}`);
    };
    write(`${r.bar()}\n`);
    const timer = caps.tty && caps.animate ? setInterval(draw, 90) : null;
    if (caps.tty) { write('\x1b[?25l'); draw(); }
    let result: { ok: boolean | null; message: string };
    try {
      result = await t.run((m) => { msg = `${t.title}  ${dim(caps, m)}`; });
    } catch (e) {
      result = { ok: false, message: `${t.title} failed: ${e instanceof Error ? e.message : String(e)}` };
    } finally {
      if (timer) clearInterval(timer);
      if (caps.tty) write('\x1b[?25h');
    }
    const secs = dim(caps, `${((performance.now() - t0) / 1000).toFixed(1)}s`);
    const mark = result.ok === true ? r.done() : hex(caps, COLORS.warn, result.ok === null ? r.g.done : r.g.fail);
    write(`${caps.tty ? '\r\x1b[2K' : ''}${mark}  ${result.message}  ${secs}\n`);
  }
}

export { bold };
