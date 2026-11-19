/**
 * The built-in theme catalog (templates/gui/files/assets/themes.toml), read by the generator so
 * `--base` can lay the signature theme's accent on any shipped theme's surfaces. The file the
 * generated app compiles in is the single source: a theme added there is a valid `--base` at once.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES } from '../engine/plan.ts';

/** One `[[theme]]` from the catalog: the eleven stated colours plus identity and band. */
export interface ShippedTheme {
  id: string; name: string; mode: 'dark' | 'light';
  app: string; panel: string; raised: string; hover: string; border: string;
  accent: string; text: string; text_muted: string;
  danger: string; warning: string; success: string;
  rainbow_span: number;
}

/** The base the signature theme uses unless `--base` says otherwise. */
export const DEFAULT_BASE = 'midnight';

const COLOURS = ['app', 'panel', 'raised', 'hover', 'border', 'accent', 'text', 'text_muted', 'danger', 'warning', 'success'] as const;

let cache: ShippedTheme[] | undefined;

/** Every shipped theme, in catalog order. Throws if the catalog is malformed (a template bug). */
export function shippedThemes(): ShippedTheme[] {
  if (cache) return cache;
  const text = readFileSync(join(TEMPLATES, 'gui', 'files', 'assets', 'themes.toml'), 'utf8');
  const blocks = text.split(/^\[\[theme\]\]\s*$/m).slice(1);
  cache = blocks.map((block, index) => {
    const fields: Record<string, string> = {};
    for (const line of block.split('\n')) {
      const m = /^([a-z_]+)\s*=\s*(?:"([^"]*)"|([\d.]+))\s*$/.exec(line.trim());
      if (m?.[1]) fields[m[1]] = m[2] ?? m[3] ?? '';
    }
    const where = `themes.toml theme #${index + 1}`;
    const need = (key: string) => {
      const value = fields[key];
      if (value === undefined) throw new Error(`${where}: missing ${key}`);
      return value;
    };
    const mode = need('mode');
    if (mode !== 'dark' && mode !== 'light') throw new Error(`${where}: mode must be dark or light`);
    for (const key of COLOURS) {
      if (!/^#[\da-f]{6}$/i.test(need(key))) throw new Error(`${where}: ${key} is not a #rrggbb colour`);
    }
    const span = Number(need('rainbow_span'));
    if (!Number.isFinite(span)) throw new Error(`${where}: rainbow_span is not a number`);
    return {
      id: need('id'), name: need('name'), mode,
      app: need('app'), panel: need('panel'), raised: need('raised'), hover: need('hover'), border: need('border'),
      accent: need('accent'), text: need('text'), text_muted: need('text_muted'),
      danger: need('danger'), warning: need('warning'), success: need('success'),
      rainbow_span: span,
    };
  });
  return cache;
}

/** The shipped theme with this id, or undefined. */
export function shippedTheme(id: string): ShippedTheme | undefined {
  return shippedThemes().find((theme) => theme.id === id);
}
