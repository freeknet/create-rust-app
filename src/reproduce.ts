/**
 * The command that recreates a set of answers without prompts, printed on the finish screen.
 * It lists only what differs from the chosen preset, so the common case stays one short line.
 */
import { resolveAnswers } from './presets.ts';
import type { Answers } from './types.ts';

const quote = (v: string) => (/^[\w.@/:+-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`);

export function reproduceCommand(a: Answers, dir?: string): string {
  const base = resolveAnswers(a.preset, { name: a.name });
  const parts = ['npx create-rust-app', quote(dir ?? a.name)];
  if (a.preset) parts.push('--preset', a.preset);
  else if (a.kind !== base.kind) parts.push('--kind', a.kind);

  const on: string[] = [];
  const off: string[] = [];
  for (const group of ['features', 'tooling'] as const) {
    const now = a[group] as unknown as Record<string, boolean>;
    const was = base[group] as unknown as Record<string, boolean>;
    for (const k of Object.keys(now)) if (now[k] !== was[k]) (now[k] ? on : off).push(k);
  }
  for (const k of ['clap', 'serde', 'thiserror', 'sqlite'] as const) {
    if (a.crates[k] !== base.crates[k]) (a.crates[k] ? on : off).push(k);
  }
  if (on.length) parts.push('--with', on.join(','));
  if (off.length) parts.push('--without', off.join(','));

  for (const k of ['logging', 'async', 'http'] as const) {
    if (a.crates[k] !== base.crates[k]) parts.push('--set', `crates.${k}=${a.crates[k]}`);
  }
  if (a.guiStack !== base.guiStack && (a.kind === 'gui' || a.kind === 'workspace')) parts.push('--gui', a.guiStack);
  for (const k of ['edition', 'msrv', 'toolchain', 'license'] as const) {
    if (a[k] !== base[k]) parts.push(`--${k}`, quote(a[k]));
  }
  if (a.tagline !== base.tagline) parts.push('--set', `tagline=${quote(a.tagline)}`);
  if (!a.post.git) parts.push('--no-git');
  if (!a.post.fetch) parts.push('--no-fetch');
  if (a.post.cargoCheck) parts.push('--cargo-check');
  if (a.post.open !== 'none') parts.push('--open', a.post.open);
  parts.push('-y');
  return parts.join(' ');
}
