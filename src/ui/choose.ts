/**
 * Select / multiselect with our own rendering on clack's core state machines (keys, cancel, cursor).
 *
 * Why not @clack/prompts' select/multiselect: they show an option's description only on the focused
 * row, and echo the full label after submit. We want every description visible while choosing and a
 * short, clean echo afterwards, grouped headers without selectable group rows, and our palette.
 */
import { MultiSelectPrompt, SelectPrompt, isCancel } from '@clack/core';
import type { Readable, Writable } from 'node:stream';
import { glyphs } from './glyphs.ts';
import { live, shimmer } from './motion.ts';
import { bold, dim, hex } from './rainbow.ts';
import { STOPS } from './theme.ts';
import { clip, liveColumns, liveRows, width, wrap } from './tty.ts';
import type { Caps } from '../types.ts';

export interface Item<V> { value: V; label: string; hint?: string; tag?: string; group?: string }

const CYAN = '#7cf7ff';
const GREEN = '#b6ff6e';
const GRAY = '#6f6a85';
const AMBER = '#ffd36e';
const RED = '#ff6b7c';

function chrome(caps: Caps) {
  const g = glyphs(caps);
  return {
    g,
    bar: (s = g.bar) => hex(caps, GRAY, s),
    live: (s = g.bar) => hex(caps, CYAN, s),
    done: (s = g.done) => hex(caps, GREEN, s),
  };
}

/** `text` clipped to `max` cells, ending in an ellipsis when anything was cut. */
export function clipEllipsis(caps: Caps, text: string, max: number) {
  if (width(text) <= max) return text;
  const ell = glyphs(caps).ellipsis;
  return max <= width(ell) ? clip(text, Math.max(0, max)) : `${clip(text, max - width(ell))}${ell}`;
}

/**
 * Lay out `label  tag   description` rows so descriptions share a column, fitted to `columns`.
 * `prefix` is the width drawn before the label (rail, marks). Where the description column has its
 * usual room the rows are as they always were; on a narrow terminal the description is shortened,
 * then dropped, then the tag, and only then is the label cut, so no row wraps.
 */
export function layout<V>(caps: Caps, items: Item<V>[], indent: number, columns: number, prefix: number) {
  const tagW = (i: Item<V>) => (i.tag ? width(i.tag) + 2 : 0);
  const labelW = Math.max(...items.map((i) => width(i.label) + tagW(i)));
  const room = columns - indent - labelW - 6;
  const tag = (i: Item<V>) => (i.tag ? `  ${hex(caps, AMBER, i.tag)}` : '');
  const gap = (i: Item<V>) => ' '.repeat(labelW - width(i.label) - tagW(i) + 3);
  if (room >= 10) {
    return items.map((i) => {
      const hint = i.hint && width(i.hint) > room ? `${i.hint.slice(0, room - 1)}${glyphs(caps).ellipsis}` : (i.hint ?? '');
      return { label: i.label, tag: tag(i), gap: gap(i), hint };
    });
  }
  // One spare column: a line exactly as wide as the terminal wraps in some terminals.
  const avail = Math.max(1, columns - prefix - 1);
  const hintRoom = avail - labelW - 3;
  return items.map((i) => {
    if (i.hint && hintRoom >= 8) return { label: i.label, tag: tag(i), gap: gap(i), hint: clipEllipsis(caps, i.hint, hintRoom) };
    if (width(i.label) + tagW(i) <= avail) return { label: i.label, tag: tag(i), gap: '', hint: '' };
    return { label: clipEllipsis(caps, i.label, avail), tag: '', gap: '', hint: '' };
  });
}

/**
 * A footer's `a · b · c` parts fitted to `room` cells: parts are dropped in `dropOrder` (indexes)
 * until the rest fits; a single part that still doesn't fit is cut with an ellipsis.
 */
export function fitFooter(caps: Caps, parts: string[], dropOrder: number[], room: number) {
  const keep = parts.map(() => true);
  const line = () => parts.filter((_, i) => keep[i]).join(' · ');
  for (const i of dropOrder) {
    if (width(line()) <= room) break;
    if (keep.filter(Boolean).length > 1) keep[i] = false;
  }
  return clipEllipsis(caps, line(), room);
}

/**
 * The first visible line of a list window of `room` lines over `total`, scrolled as little as
 * possible from `prev` so that lines `top`..`bottom` (the focused row, and its group header when
 * there is one) are on screen.
 */
export function windowStart(total: number, top: number, bottom: number, room: number, prev: number) {
  const last = Math.max(0, total - room);
  let start = Math.min(Math.max(0, prev), last);
  if (bottom >= start + room) start = bottom - room + 1;
  if (top < start) start = top;
  return Math.max(0, Math.min(start, last));
}

/**
 * Fit a list's body lines to the terminal height. The frame (rail, message, body, footer: `chrome`
 * is everything but the body) stays below `rows` lines, so @clack/core can always erase the whole
 * previous frame; a taller one leaves its top lines in the scrollback. When the body doesn't fit, a
 * window of it is shown between "more above" / "more below" lines. Returns the lines and the start.
 */
export function windowBody(caps: Caps, body: string[], top: number, bottom: number, rows: number, chrome: number, prev: number) {
  if (body.length + chrome <= rows - 1) return { lines: body, start: 0 };
  const g = glyphs(caps);
  const rail = hex(caps, CYAN, g.bar);
  const room = Math.max(1, rows - 1 - chrome - 2);
  const start = windowStart(body.length, top, bottom, room, prev);
  const below = Math.max(0, body.length - start - room);
  const more = (arrow: string, n: number) => (n ? `${rail}  ${dim(caps, `${arrow} ${n} more`)}` : rail);
  return { lines: [more(g.up, start), ...body.slice(start, start + room), more(g.down, below)], start };
}

/** The prompt's message after its mark, wrapped onto rail lines when it is wider than the terminal. */
function messageLines(caps: Caps, mark: string, message: string, columns: number) {
  if (width(message) + 3 <= columns) return [`${mark}  ${message}`];
  const c = chrome(caps);
  return wrap(message, Math.max(1, columns - 4)).map((l, i) => `${i === 0 ? mark : c.live()}  ${l}`);
}

/**
 * What a prompt opened with `back: true` resolves to when Esc is pressed. Ctrl-C still resolves to
 * clack's cancel symbol. @clack/core maps both keys to one cancel action, but it emits the `key`
 * event before acting on it, so the prompt can tell them apart.
 */
export const BACK: unique symbol = Symbol('create-rust-app:back');

/** Remember whether the key that ended a prompt was Esc. */
export function escWatch(prompt: { on(event: 'key', cb: (key: string | undefined, info: { name?: string | undefined }) => void): void }) {
  const seen = { esc: false };
  prompt.on('key', (_key, info) => { seen.esc = info?.name === 'escape'; });
  return seen;
}

/** Resolve Esc to BACK on a `back` prompt; everything else (Ctrl-C included) passes through. */
export function settle<T>(result: Promise<T | symbol>, seen: { esc: boolean }, back: boolean | undefined): Promise<T | symbol> {
  return back ? result.then((v) => (isCancel(v) && seen.esc ? BACK : v)) : result;
}

/** The frame a `back` prompt leaves behind on Esc: a dim, closed step rather than a red cancel. */
export function backFrame(caps: Caps, message: string) {
  const c = chrome(caps);
  return `${c.bar()}\n${dim(caps, c.g.done)}  ${dim(caps, message)}\n${c.bar()}`;
}

/** The Esc part of a footer: Esc steps back inside Customize, and cancels the run elsewhere. */
export const escHint = (back: boolean | undefined) => (back ? 'esc back' : 'esc cancel');

const echo = (caps: Caps, lines: string[]) => {
  const c = chrome(caps);
  return lines.map((l) => `${c.bar()}  ${dim(caps, l)}`).join('\n');
};

/** Single choice. Resolves to the value, or clack's cancel symbol. */
/** Optional streams (tests drive prompts in-process with these). */
export type Io = { input?: Readable; output?: Writable };

export function pick<V>(caps: Caps, o: { message: string; options: Item<V>[]; initialValue?: V; footer?: string; back?: boolean; io?: Io }) {
  const c = chrome(caps);
  const out = o.io?.output ?? process.stdout;
  const prefix = width(`${c.g.bar}  ${c.g.radioOn} `);
  const anim = { t: 0 };
  let start = 0;
  const prompt = new SelectPrompt<Item<V>>({
    ...(o.io ?? {}),
    options: o.options,
    ...(o.initialValue !== undefined ? { initialValue: o.initialValue } : {}),
    render() {
      // The size is read on every frame, so a resize is honoured.
      const columns = liveColumns(out, caps.columns);
      const head = `${c.bar()}\n`;
      const chosen = this.options[this.cursor];
      if (this.state === 'submit') return `${head}${messageLines(caps, c.done(), o.message, columns).join('\n')}\n${echo(caps, [clipEllipsis(caps, chosen?.label ?? '', Math.max(1, columns - 4))])}`;
      if (this.state === 'cancel') return o.back && seen.esc ? backFrame(caps, o.message) : `${head}${messageLines(caps, hex(caps, RED, c.g.cancel), o.message, columns).join('\n')}\n${c.bar()}`;
      const rows = layout(caps, o.options, 6, columns, prefix);
      const body = rows.map((r, i) => {
        const on = i === this.cursor;
        const dot = on ? hex(caps, GREEN, c.g.radioOn) : dim(caps, c.g.radioOff);
        const label = on ? shimmer(caps, r.label, anim.t) : r.label;
        return `${c.live()}  ${dot} ${label}${r.tag}${r.gap}${on ? r.hint : dim(caps, r.hint)}`;
      });
      const parts = o.footer ? [o.footer] : [`${c.g.up}${c.g.down} move`, 'enter select', escHint(o.back)];
      const footer = `${c.live(c.g.barEnd)}  ${dim(caps, fitFooter(caps, parts, [1, 0], Math.max(1, columns - 4)))}`;
      const message = messageLines(caps, c.live(c.g.step), o.message, columns);
      const win = windowBody(caps, body, this.cursor, this.cursor, liveRows(out), message.length + 2, start);
      start = win.start;
      return `${head}${message.join('\n')}\n${win.lines.join('\n')}\n${footer}`;
    },
  });
  const seen = escWatch(prompt);
  live(caps, prompt, anim);
  return settle(prompt.prompt() as Promise<V | symbol>, seen, o.back);
}

/**
 * Multiple choice, optionally grouped (`item.group`). Group names render as coloured headers; only
 * items are selectable. Resolves to the selected values, or clack's cancel symbol.
 */
export function pickMany<V>(caps: Caps, o: { message: string; options: Item<V>[]; initialValues?: V[]; back?: boolean; io?: Io }) {
  const c = chrome(caps);
  const out = o.io?.output ?? process.stdout;
  const grouped = o.options.some((i) => i.group);
  const prefix = width(`${c.g.bar}  ${grouped ? '  ' : ''}${c.g.boxOn} `);
  const groupColor = new Map<string, string>();
  for (const i of o.options) if (i.group && !groupColor.has(i.group)) groupColor.set(i.group, STOPS[(groupColor.size * 2 + 1) % STOPS.length] ?? CYAN);
  const anim = { t: 0 };
  let start = 0;
  const prompt = new MultiSelectPrompt<Item<V>>({
    ...(o.io ?? {}),
    options: o.options,
    initialValues: o.initialValues ?? [],
    required: false,
    render() {
      const columns = liveColumns(out, caps.columns);
      const head = `${c.bar()}\n`;
      const selected = new Set(this.value ?? []);
      if (this.state === 'submit') {
        const names = o.options.filter((i) => selected.has(i.value)).map((i) => i.label);
        const lines = names.length ? wrap(names.join(c.g.sep.trim() ? c.g.sep : ' '), columns >= 26 ? columns - 6 : Math.max(1, columns - 4)) : ['none'];
        return `${head}${messageLines(caps, c.done(), o.message, columns).join('\n')}\n${echo(caps, lines)}`;
      }
      if (this.state === 'cancel') return o.back && seen.esc ? backFrame(caps, o.message) : `${head}${messageLines(caps, hex(caps, RED, c.g.cancel), o.message, columns).join('\n')}\n${c.bar()}`;
      const rows = layout(caps, o.options, grouped ? 8 : 6, columns, prefix);
      const body: string[] = [];
      let lastGroup: string | undefined;
      let top = 0;
      let focus = 0;
      o.options.forEach((item, i) => {
        const on = i === this.cursor;
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          // Scrolling up to the first row of a group brings its header along.
          if (on) top = body.length;
          body.push(`${c.live()}  ${hex(caps, groupColor.get(item.group) ?? CYAN, clipEllipsis(caps, item.group, Math.max(1, columns - 4)))}`);
        } else if (on) top = body.length;
        const r = rows[i];
        if (!r) return;
        if (on) focus = body.length;
        const box = selected.has(item.value) ? hex(caps, GREEN, c.g.boxOn) : dim(caps, c.g.boxOff);
        const label = on ? shimmer(caps, r.label, anim.t) : r.label;
        body.push(`${c.live()}  ${grouped ? '  ' : ''}${box} ${label}${r.gap}${on ? r.hint : dim(caps, r.hint)}`);
      });
      const parts = ['space toggle', 'a all', 'enter confirm', escHint(o.back)];
      const footer = `${c.live(c.g.barEnd)}  ${dim(caps, fitFooter(caps, parts, [1, 2, 0], Math.max(1, columns - 4)))}`;
      const message = messageLines(caps, c.live(c.g.step), o.message, columns);
      const win = windowBody(caps, body, top, focus, liveRows(out), message.length + 2, start);
      start = win.start;
      return `${head}${message.join('\n')}\n${win.lines.join('\n')}\n${footer}`;
    },
  });
  const seen = escWatch(prompt);
  live(caps, prompt, anim);
  return settle(prompt.prompt() as Promise<V[] | symbol>, seen, o.back);
}
