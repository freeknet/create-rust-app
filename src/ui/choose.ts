/**
 * Select / multiselect with our own rendering on clack's core state machines (keys, cancel, cursor).
 *
 * Why not @clack/prompts' select/multiselect: they show an option's description only on the focused
 * row, and echo the full label after submit. We want every description visible while choosing and a
 * short, clean echo afterwards, grouped headers without selectable group rows, and our palette.
 */
import { MultiSelectPrompt, SelectPrompt } from '@clack/core';
import { glyphs } from './glyphs.ts';
import { live, marker, shimmer } from './motion.ts';
import { bold, dim, hex } from './rainbow.ts';
import { STOPS } from './theme.ts';
import { width, wrap } from './tty.ts';
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

/** Lay out `label  tag   description` rows so descriptions share a column, clipped to the terminal. */
function layout<V>(caps: Caps, items: Item<V>[], indent: number) {
  const labelW = Math.max(...items.map((i) => width(i.label) + (i.tag ? width(i.tag) + 2 : 0)));
  const room = Math.max(10, caps.columns - indent - labelW - 6);
  return items.map((i) => {
    const used = width(i.label) + (i.tag ? width(i.tag) + 2 : 0);
    const hint = i.hint && width(i.hint) > room ? `${i.hint.slice(0, room - 1)}${glyphs(caps).ellipsis}` : (i.hint ?? '');
    return { label: i.label, tag: i.tag ? `  ${hex(caps, AMBER, i.tag)}` : '', gap: ' '.repeat(labelW - used + 3), hint };
  });
}

const echo = (caps: Caps, lines: string[]) => {
  const c = chrome(caps);
  return lines.map((l) => `${c.bar()}  ${dim(caps, l)}`).join('\n');
};

/** Single choice. Resolves to the value, or clack's cancel symbol. */
export function pick<V>(caps: Caps, o: { message: string; options: Item<V>[]; initialValue?: V; footer?: string }) {
  const c = chrome(caps);
  const rows = layout(caps, o.options, 6);
  const anim = { t: 0 };
  const prompt = new SelectPrompt<Item<V>>({
    options: o.options,
    ...(o.initialValue !== undefined ? { initialValue: o.initialValue } : {}),
    render() {
      const head = `${c.bar()}\n`;
      const chosen = this.options[this.cursor];
      if (this.state === 'submit') return `${head}${c.done()}  ${o.message}\n${echo(caps, [chosen?.label ?? ''])}`;
      if (this.state === 'cancel') return `${head}${hex(caps, RED, c.g.cancel)}  ${o.message}\n${c.bar()}`;
      const body = rows.map((r, i) => {
        const on = i === this.cursor;
        const dot = on ? hex(caps, GREEN, c.g.radioOn) : dim(caps, c.g.radioOff);
        const label = on ? shimmer(caps, r.label, anim.t) : r.label;
        return `${c.live()}  ${dot} ${label}${r.tag}${r.gap}${on ? r.hint : dim(caps, r.hint)}`;
      });
      const footer = `${c.live(c.g.barEnd)}  ${dim(caps, o.footer ?? `${c.g.up}${c.g.down} move · enter select · esc cancel`)}`;
      return `${head}${marker(caps, c.g.step, anim.t)}  ${o.message}\n${body.join('\n')}\n${footer}`;
    },
  });
  live(caps, prompt, anim);
  return prompt.prompt() as Promise<V | symbol>;
}

/**
 * Multiple choice, optionally grouped (`item.group`). Group names render as coloured headers; only
 * items are selectable. Resolves to the selected values, or clack's cancel symbol.
 */
export function pickMany<V>(caps: Caps, o: { message: string; options: Item<V>[]; initialValues?: V[] }) {
  const c = chrome(caps);
  const grouped = o.options.some((i) => i.group);
  const rows = layout(caps, o.options, grouped ? 8 : 6);
  const groupColor = new Map<string, string>();
  for (const i of o.options) if (i.group && !groupColor.has(i.group)) groupColor.set(i.group, STOPS[(groupColor.size * 2 + 1) % STOPS.length] ?? CYAN);
  const anim = { t: 0 };
  const prompt = new MultiSelectPrompt<Item<V>>({
    options: o.options,
    initialValues: o.initialValues ?? [],
    required: false,
    render() {
      const head = `${c.bar()}\n`;
      const selected = new Set(this.value ?? []);
      if (this.state === 'submit') {
        const names = o.options.filter((i) => selected.has(i.value)).map((i) => i.label);
        const lines = names.length ? wrap(names.join(c.g.sep.trim() ? c.g.sep : ' '), Math.max(20, caps.columns - 6)) : ['none'];
        return `${head}${c.done()}  ${o.message}\n${echo(caps, lines)}`;
      }
      if (this.state === 'cancel') return `${head}${hex(caps, RED, c.g.cancel)}  ${o.message}\n${c.bar()}`;
      const out: string[] = [];
      let lastGroup: string | undefined;
      o.options.forEach((item, i) => {
        if (item.group && item.group !== lastGroup) {
          lastGroup = item.group;
          out.push(`${c.live()}  ${hex(caps, groupColor.get(item.group) ?? CYAN, item.group)}`);
        }
        const r = rows[i];
        if (!r) return;
        const on = i === this.cursor;
        const box = selected.has(item.value) ? hex(caps, GREEN, c.g.boxOn) : dim(caps, c.g.boxOff);
        const label = on ? shimmer(caps, r.label, anim.t) : r.label;
        out.push(`${c.live()}  ${grouped ? '  ' : ''}${box} ${label}${r.gap}${on ? r.hint : dim(caps, r.hint)}`);
      });
      const footer = `${c.live(c.g.barEnd)}  ${dim(caps, 'space toggle · a all · enter confirm · esc cancel')}`;
      return `${head}${marker(caps, c.g.step, anim.t)}  ${o.message}\n${out.join('\n')}\n${footer}`;
    },
  });
  live(caps, prompt, anim);
  return prompt.prompt() as Promise<V[] | symbol>;
}
