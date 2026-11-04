#!/usr/bin/env node
/**
 * Dev loop for template work, independent of the interactive CLI:
 *
 *   node scripts/scaffold-check.mjs <preset> [--out DIR] [--set key.path=value ...] [--gate none|check|clippy|full]
 *
 * Scaffolds the preset into DIR (default .scratch/<preset>), then runs the gate:
 *   check  → cargo check --all-targets
 *   clippy → cargo fmt --check + cargo clippy --all-targets --all-features -- -D warnings
 *   full   → clippy + cargo test --all-features   (default)
 * Exits non-zero on the first failure. Uses a shared CARGO_TARGET_DIR (.scratch/target) so
 * repeated runs are fast.
 */
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { resolveAnswers } from '../src/presets.ts';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { writePlan } from '../src/engine/write.ts';
import type { PartialAnswers, PlanEntry } from '../src/types.ts';

const args = process.argv.slice(2);
const preset = args.find((a: string) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--'));
if (!preset) {
  console.error('usage: scaffold-check.mjs <preset> [--out DIR] [--set a.b=v] [--gate none|check|clippy|full]');
  process.exit(2);
}
/** @param {string} f */
const opt = (f: string) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const gate = opt('--gate') ?? 'full';
const root = resolve(import.meta.dirname, '..');
const out = resolve(opt('--out') ?? join(root, '.scratch', preset));

/** @type {any} */
const overrides: Record<string, unknown> = { name: `demo-${preset}`.replace(/[^a-z0-9-]/g, '-') };
for (let i = 0; i < args.length; i++) {
  if (args[i] !== '--set') continue;
  const [path, raw] = (args[i + 1] ?? '').split('=');
  if (!path) throw new Error('--set requires a key');
  const value = raw === 'true' ? true : raw === 'false' ? false : raw;
  const keys = path.split('.');
  let o = overrides;
  for (const k of keys.slice(0, -1)) {
    const next = o[k];
    if (!next || typeof next !== 'object') o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  const last = keys.at(-1);
  if (last !== undefined) o[last] = value;
}

const ctx = buildContext(resolveAnswers(preset, overrides as PartialAnswers));
const plan = await buildPlan(ctx);
await rm(out, { recursive: true, force: true });
await writePlan(plan, out, { force: true });
console.log(`scaffolded ${plan.length} files → ${out}`);

const leftovers = plan.filter((e: PlanEntry) => 'content' in e && /@@[A-Za-z]+@@|^\s*(\/\/|#)\s*@(if|end|else|elif)\b/m.test(e.content));
if (leftovers.length) {
  console.error('unrendered tokens/directives in:', leftovers.map((e: PlanEntry) => e.dest).join(', '));
  process.exit(1);
}
if (gate === 'none') process.exit(0);

const env = { ...process.env, CARGO_TARGET_DIR: join(root, '.scratch', 'target'), CARGO_TERM_COLOR: 'always' };
/** @param {string[]} cmd */
const run = (cmd: string[]) => {
  console.log(`\n$ cargo ${cmd.join(' ')}`);
  const r = spawnSync('cargo', cmd, { cwd: out, stdio: 'inherit', env });
  if (r.status !== 0) { console.error(`\nFAILED: cargo ${cmd.join(' ')} (preset ${preset})`); process.exit(r.status ?? 1); }
};
if (gate === 'check') run(['check', '--all-targets']);
else {
  run(['fmt', '--all', '--', '--check']);
  run(['clippy', '--all-targets', '--all-features', '--', '-D', 'warnings']);
  if (gate === 'full') run(['test', '--all-features']);
}
console.log(`\nOK ${preset} (${gate})`);
