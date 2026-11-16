/**
 * The command that recreates a set of answers without prompts, printed on the finish screen.
 * It lists only what differs from the chosen preset, so the common case stays one short line.
 */
import { resolveAnswers } from './presets.ts';
import { effectiveAnswers } from './context.ts';
import type { Answers } from './types.ts';

/**
 * How to run the tool. The `create-rust-app` name on npm is not published by this project (an
 * unrelated package of that name was unpublished in 2025), so this runs it from GitHub, which npm
 * builds through the `prepare` script. Switch to `npx create-rust-app` once it is on npm.
 */
export const RUN_COMMAND = 'npx github:freeknet/create-rust-app';

const quote = (v: string) => (/^[\w.@/:+-]+$/.test(v) ? v : `"${v.replace(/"/g, '\\"')}"`);

export function reproduceCommand(raw: Answers, dir?: string): string {
  const preset = resolveAnswers(raw.preset, { name: raw.name });
  const parts = [RUN_COMMAND, quote(dir ?? raw.name)];
  if (raw.preset) parts.push('--preset', raw.preset);
  if (raw.kind !== preset.kind) parts.push('--kind', raw.kind);
  // Compare what each would generate for this kind, so options it never uses aren't listed.
  const a = effectiveAnswers(raw);
  const base = effectiveAnswers({ ...preset, kind: raw.kind });

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
  if (a.bin) parts.push('--bin', quote(a.bin));
  if (a.tagline !== base.tagline) parts.push('--set', `tagline=${quote(a.tagline)}`);
  if (!a.post.git) parts.push('--no-git');
  if (!a.post.fetch) parts.push('--no-fetch');
  if (a.post.cargoCheck) parts.push('--cargo-check');
  if (a.post.open !== 'none') parts.push('--open', a.post.open);
  parts.push('-y');
  return parts.join(' ');
}
