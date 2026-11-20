#!/usr/bin/env node
/**
 * Dev loop for template work, independent of the interactive CLI:
 *
 *   node scripts/scaffold-check.mjs <preset> [--name NAME] [--out DIR] [--set key.path=value ...]
 *                                            [--gate none|fmt|check|clippy|doc|full]
 *
 * Scaffolds the preset into DIR (default .scratch/<preset>), then runs the gate:
 *   none   → scaffold only (and the unrendered-token check)
 *   fmt    → cargo fmt --check (no build, seconds)
 *   check  → cargo check --all-targets
 *   clippy → cargo fmt --check + cargo clippy --all-targets --all-features -- -D warnings
 *   doc    → cargo doc --no-deps with RUSTDOCFLAGS=-D warnings (not part of full)
 *   full   → clippy + cargo test --all-features   (default)
 * `--name` sets the project name (default demo-<preset>); `--set` splits on the first `=`, so
 * values may contain `=`. Exits non-zero on the first failure. Uses CARGO_TARGET_DIR when it is
 * set, else a shared .scratch/target, so repeated runs are fast.
 */
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { resolveAnswers } from '../src/presets.ts';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { writePlan } from '../src/engine/write.ts';
import type { PartialAnswers, PlanEntry } from '../src/types.ts';

export const GATES = ['none', 'fmt', 'check', 'clippy', 'doc', 'full'] as const;
export type Gate = (typeof GATES)[number];

export interface CheckArgs {
  preset: string;
  gate: Gate;
  out: string | undefined;
  overrides: Record<string, unknown>;
}

const USAGE =
  'usage: scaffold-check.mjs <preset> [--name NAME] [--out DIR] [--set a.b=v] [--gate none|fmt|check|clippy|doc|full]';

/** `key.path=value` → [['key', 'path'], value]; only the first `=` separates key from value. */
export function parseSet(spec: string): [string[], string | boolean] {
  const eq = spec.indexOf('=');
  const path = eq < 0 ? spec : spec.slice(0, eq);
  const raw = eq < 0 ? '' : spec.slice(eq + 1);
  if (!path) throw new Error('--set requires a key');
  const value = raw === 'true' ? true : raw === 'false' ? false : raw;
  return [path.split('.'), value];
}

/** Sets `value` at `keys` inside `target`, creating intermediate objects. */
function assign(target: Record<string, unknown>, keys: string[], value: unknown) {
  let o = target;
  for (const k of keys.slice(0, -1)) {
    const next = o[k];
    if (!next || typeof next !== 'object') o[k] = {};
    o = o[k] as Record<string, unknown>;
  }
  const last = keys.at(-1);
  if (last !== undefined) o[last] = value;
}

/** Parses the command line (without `node` and the script path). Throws with a usage message. */
export function parseArgs(argv: readonly string[]): CheckArgs {
  let preset: string | undefined;
  let gate: string = 'full';
  let out: string | undefined;
  let name: string | undefined;
  const sets: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--gate' || a === '--out' || a === '--set' || a === '--name') {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value\n${USAGE}`);
      if (a === '--gate') gate = v;
      else if (a === '--out') out = v;
      else if (a === '--name') name = v;
      else sets.push(v);
    } else if (a.startsWith('--')) throw new Error(`unknown option ${a}\n${USAGE}`);
    else if (preset === undefined) preset = a;
    else throw new Error(`unexpected argument ${a}\n${USAGE}`);
  }
  if (!preset) throw new Error(USAGE);
  if (!(GATES as readonly string[]).includes(gate)) throw new Error(`unknown gate ${gate}\n${USAGE}`);
  const overrides: Record<string, unknown> = { name: `demo-${preset}`.replace(/[^a-z0-9-]/g, '-') };
  for (const spec of sets) {
    const [keys, value] = parseSet(spec);
    assign(overrides, keys, value);
  }
  if (name !== undefined) overrides.name = name;
  return { preset, gate: gate as Gate, out, overrides };
}

/** The cargo invocations a gate runs, in order. */
export function gateCommands(gate: Gate): string[][] {
  const fmt = ['fmt', '--all', '--', '--check'];
  const clippy = ['clippy', '--all-targets', '--all-features', '--', '-D', 'warnings'];
  switch (gate) {
    case 'none': return [];
    case 'fmt': return [fmt];
    case 'check': return [['check', '--all-targets']];
    case 'clippy': return [fmt, clippy];
    case 'doc': return [['doc', '--no-deps']];
    case 'full': return [fmt, clippy, ['test', '--all-features']];
  }
}

/** Environment for the cargo runs: an existing CARGO_TARGET_DIR is kept. */
export function cargoEnv(base: NodeJS.ProcessEnv, root: string, gate: Gate): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...base,
    CARGO_TARGET_DIR: base.CARGO_TARGET_DIR || join(root, '.scratch', 'target'),
    CARGO_TERM_COLOR: 'always',
  };
  if (gate === 'doc') env.RUSTDOCFLAGS = [base.RUSTDOCFLAGS, '-D warnings'].filter(Boolean).join(' ');
  return env;
}

async function main() {
  let parsed: CheckArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  const { preset, gate, overrides } = parsed;
  const root = resolve(import.meta.dirname, '..');
  const out = resolve(parsed.out ?? join(root, '.scratch', preset));

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

  const env = cargoEnv(process.env, root, gate);
  for (const cmd of gateCommands(gate)) {
    console.log(`\n$ cargo ${cmd.join(' ')}`);
    const r = spawnSync('cargo', cmd, { cwd: out, stdio: 'inherit', env });
    if (r.status !== 0) {
      console.error(`\nFAILED: cargo ${cmd.join(' ')} (preset ${preset})`);
      process.exit(r.status ?? 1);
    }
  }
  console.log(`\nOK ${preset} (${gate})`);
}

// Run when executed (directly or through scaffold-check.mjs), not when a test imports it.
if (/scaffold-check\.(?:ts|mjs|js)$/.test(process.argv[1] ?? '')) await main();
