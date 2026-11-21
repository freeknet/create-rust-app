/**
 * The command that recreates a set of answers without prompts, printed on the finish screen.
 * It lists only what differs from the chosen preset, so the common case stays one short line.
 */
import path, { basename, resolve } from 'node:path';
import { resolveAnswers } from './presets.ts';
import { effectiveAnswers } from './context.ts';
import type { Answers } from './types.ts';

/**
 * How to run the tool. The `create-rust-app` name on npm is not published by this project (an
 * unrelated package of that name was unpublished in 2025), so this runs it from GitHub, which npm
 * builds through the `prepare` script. Switch to `npx create-rust-app` once it is on npm.
 */
export const RUN_COMMAND = 'npx github:freeknet/create-rust-app';

/** A POSIX-shell word: bare when safe, else double-quoted with `" \ $ \`` escaped. */
const quote = (v: string) => (/^[\w.@/:+-]+$/.test(v) ? v : `"${v.replace(/["\\$`]/g, '\\$&')}"`);

/**
 * The target folder as the finish screen and the recreate command name it: `dir` (the positional)
 * or `./<name>`, relative to `cwd` when inside it, else absolute; `.` for `cwd` itself.
 * Separators are always `/`: the result goes into `cd …` and the POSIX-quoted recreate command, and
 * a Windows backslash would be eaten by Git Bash (`cd out\x` is `cd outx`) or doubled by the
 * quoting, while `/` works in Git Bash, PowerShell, cmd and Node alike. `p` is `node:path` (or its
 * `win32` / `posix` variant, so tests can exercise either platform).
 */
export function shownTarget(dir: string | undefined, name: string, cwd: string = process.cwd(), p: typeof path = path): string {
  const target = p.resolve(cwd, dir ?? name);
  const rel = p.relative(cwd, target);
  const shown = rel.startsWith('..') || p.isAbsolute(rel) ? target : rel || '.';
  return p.sep === '\\' ? shown.replaceAll('\\', '/') : shown;
}

/**
 * @param raw the answers as resolved (not yet effective)
 * @param dir the real target directory as shown to the user (see `shownTarget`); defaults to
 *   `./<name>`. `--name` is added whenever the name differs from the folder's own name.
 * Every answer that changes the output is carried: anything differing from what a fresh run with
 * the same preset would default to becomes a flag or a `--set`.
 */
export function reproduceCommand(raw: Answers, dir?: string): string {
  const preset = resolveAnswers(raw.preset, { name: raw.name });
  const folder = dir ?? raw.name;
  const parts = [RUN_COMMAND, quote(folder)];
  // The CLI names the crate after a positional folder only when the folder's name is the name.
  if (basename(resolve(folder)) !== raw.name) parts.push('--name', quote(raw.name));
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
  if (a.themeBase !== base.themeBase) parts.push('--base', a.themeBase);
  for (const k of ['edition', 'msrv', 'toolchain', 'license'] as const) {
    if (a[k] !== base[k]) parts.push(`--${k}`, quote(a[k]));
  }
  if (a.bin) parts.push('--bin', quote(a.bin));
  for (const k of ['author', 'github', 'accent'] as const) {
    if (a[k] !== base[k]) parts.push(`--${k}`, quote(a[k]));
  }
  for (const k of ['displayName', 'tagline', 'email'] as const) {
    if (a[k] !== base[k]) parts.push('--set', `${k}=${quote(a[k])}`);
  }
  if (a.post.git !== base.post.git) parts.push(...(a.post.git ? ['--set', 'post.git=true'] : ['--no-git']));
  if (a.post.fetch !== base.post.fetch) parts.push(...(a.post.fetch ? ['--set', 'post.fetch=true'] : ['--no-fetch']));
  if (a.post.cargoCheck !== base.post.cargoCheck) parts.push(a.post.cargoCheck ? '--cargo-check' : '--no-cargo-check');
  if (a.post.open !== base.post.open) parts.push('--open', a.post.open);
  parts.push('-y');
  return parts.join(' ');
}
