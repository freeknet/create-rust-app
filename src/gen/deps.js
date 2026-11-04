// @ts-check
/**
 * Dependency registry. Base deps come from the `crates` answers; each active template group
 * may add its own through `templates/<group>/deps.js` (default export `(ctx) => Dep[]`).
 *
 * @typedef {{
 *   name: string, version: string, features?: string[], defaultFeatures?: boolean,
 *   kind?: 'normal' | 'dev' | 'build', target?: string, crate?: 'app' | 'xtask',
 * }} Dep
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GROUPS } from '../engine/groups.js';
import { TEMPLATES } from '../engine/plan.js';

/** @param {any} ctx @returns {Dep[]} */
export function baseDeps(ctx) {
  const c = ctx.crates;
  const f = ctx.flags;
  /** @type {Dep[]} */
  const d = [];
  if (c.errors === 'anyhow') d.push({ name: 'anyhow', version: '1', kind: f.has('has_bin') ? 'normal' : 'dev' });
  if (c.thiserror) d.push({ name: 'thiserror', version: '2' });
  if (c.clap && f.has('has_bin')) d.push({ name: 'clap', version: '4', features: ['derive'] });
  if (c.logging === 'log') d.push({ name: 'log', version: '0.4' });
  if (c.logging === 'env_logger') d.push({ name: 'log', version: '0.4' }, { name: 'env_logger', version: '0.11' });
  if (c.logging === 'tracing') d.push({ name: 'tracing', version: '0.1' }, { name: 'tracing-subscriber', version: '0.3', features: ['env-filter'] });
  if (c.serde) d.push({ name: 'serde', version: '1', features: ['derive'] }, { name: 'toml', version: '1.2' });
  if (c.serde && f.has('config')) d.push({ name: 'dirs', version: '7' });
  if (c.async === 'tokio') d.push({ name: 'tokio', version: '1', features: ['rt-multi-thread', 'macros'] });
  if (c.http === 'ureq') d.push({ name: 'ureq', version: '3', defaultFeatures: false, features: ['rustls'] });
  if (c.http === 'reqwest') d.push({ name: 'reqwest', version: '0.13', defaultFeatures: false, features: ['rustls', 'json'] });
  if (c.sqlite) d.push({ name: 'rusqlite', version: '0.41', features: ['bundled'] });
  return d;
}

/** @param {Dep} dep */
const keyOf = (dep) => `${dep.crate ?? 'app'}|${dep.kind ?? 'normal'}|${dep.target ?? ''}|${dep.name}`;

/** Base + every active group's deps.js, merged (same dep → features unioned). @param {any} ctx */
export async function collectDeps(ctx) {
  /** @type {Dep[]} */
  const all = baseDeps(ctx);
  for (const g of GROUPS) {
    if (!g.when(ctx)) continue;
    const file = join(TEMPLATES, g.id, 'deps.js');
    if (!existsSync(file)) continue;
    const mod = await import(pathToFileURL(file).href);
    all.push(...mod.default(ctx));
  }
  /** @type {Map<string, Dep>} */
  const merged = new Map();
  for (const dep of all) {
    const k = keyOf(dep);
    const prev = merged.get(k);
    if (!prev) { merged.set(k, { ...dep, features: dep.features ? [...dep.features] : undefined }); continue; }
    const feats = new Set([...(prev.features ?? []), ...(dep.features ?? [])]);
    prev.features = feats.size ? [...feats].sort() : undefined;
    if (dep.defaultFeatures === false) prev.defaultFeatures = false;
    if (dep.version !== prev.version) prev.version = dep.version; // later group wins
  }
  // A dep that is both normal and dev only needs the normal entry.
  for (const [k, dep] of merged) {
    if ((dep.kind ?? 'normal') !== 'dev') continue;
    if (merged.has(`${dep.crate ?? 'app'}|normal|${dep.target ?? ''}|${dep.name}`)) merged.delete(k);
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}
