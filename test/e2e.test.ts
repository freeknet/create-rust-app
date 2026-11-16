import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { moduleFor } from '../src/gen/header.ts';
import { PRESETS, resolveAnswers } from '../src/presets.ts';
import type { PlanEntry } from '../src/types.ts';
import type { TestContext } from 'node:test';

// A `@@token@@` the engine failed to substitute.
const TOKEN = /@@[A-Za-z]+@@/;
// Match whole directive lines, including every supported comment leader.
const DIRECTIVE_LINE = /^\s*(?:\/\/|#|<!--|--|;)?\s*@(if|elif|else|end)\b.*$/m;

for (const preset of Object.keys(PRESETS)) {
  test('e2e: ' + preset + ' produces a fully rendered plan with Rust headers', async (t: TestContext) => {
    const ctx = buildContext(resolveAnswers(preset, { name: 'prism-' + preset }));
    const plan = await buildPlan(ctx);
    const dests = plan.map((entry: PlanEntry) => entry.dest);
    assert.equal(new Set(dests).size, dests.length, preset + ': duplicate destinations');

    for (const entry of plan) {
      const where = preset + ': ' + entry.dest;
      assert.doesNotMatch(entry.dest, TOKEN, where + ': unrendered path token');
      if ('content' in entry) {
        assert.doesNotMatch(entry.content, TOKEN, where + ': unrendered content token');
        assert.doesNotMatch(entry.content, DIRECTIVE_LINE, where + ': leftover directive line');
      }
    }

    const rust = plan.filter((entry: PlanEntry) => entry.dest.endsWith('.rs'));
    if (rust.length === 0) {
      t.skip(preset + ': templates do not produce Rust files yet');
      return;
    }

    for (const entry of rust) {
      const where = preset + ': ' + entry.dest;
      assert.ok('content' in entry, where + ': Rust must be rendered text');
      const lines = entry.content.replace(/\r\n/g, '\n').split('\n');
      assert.ok(lines[0] !== undefined && lines[1] !== undefined, where + ': incomplete header');
      assert.match(lines[0], /^\/\/ =+$/, where + ': missing opening header rule');
      const module = /^\/\/ Module: +(.+)$/.exec(lines[1]);
      assert.ok(module, where + ': missing Module line in opening header');
      assert.equal(module[1], moduleFor(entry.dest, ctx), where + ': incorrect header module');
      const end = lines.indexOf(lines[0], 1);
      assert.ok(end > 1, where + ': missing closing header rule');
      const header = lines.slice(2, end);
      assert.ok(header.every((line: string) => line.startsWith('//')), where + ': header must use line comments');
      assert.ok(header.some((line: string) => /^\/\/ Description: +\S/.test(line)), where + ': missing Description');
    }
  });
}

/** The `// Dependencies:` block of a rendered banner, continuation lines included. */
function dependencyBlock(content: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((line: string) => line.startsWith('// Dependencies:'));
  if (start < 0) return '';
  const block = [lines[start] ?? ''];
  for (const line of lines.slice(start + 1)) {
    if (!/^\/\/ {15}\S/.test(line)) break;
    block.push(line);
  }
  return block.join('\n');
}

const BANNER_VARIANTS: [string, Record<string, unknown>][] = [
  ['cli', {}],
  ['cli', { crates: { async: 'tokio', http: 'reqwest', sqlite: true, logging: 'tracing' } }],
  ['cli', { crates: { http: 'ureq', logging: 'log' } }],
  ['minimal', {}],
  ['tui', {}],
  ['tui', { crates: { clap: false, logging: 'tracing' } }],
  ['lib', {}],
  ['lib', { crates: { thiserror: false } }],
  ['rustaman', { crates: { clap: false } }],
];

test('banners name the crates the project uses, not the options it could have (#5)', async () => {
  for (const [preset, extra] of BANNER_VARIANTS) {
    const ctx = buildContext(resolveAnswers(preset, { name: 'deps-' + preset, ...extra }));
    const plan = await buildPlan(ctx);
    const where = preset + ' ' + JSON.stringify(extra);
    for (const entry of plan) {
      if (!entry.dest.endsWith('.rs') || !('content' in entry)) continue;
      const block = dependencyBlock(entry.content);
      assert.doesNotMatch(block, /\bselected\b/i, `${where}: ${entry.dest} describes options: ${block}`);
    }
    if (ctx.kind !== 'cli') continue;
    // A CLI's lib.rs banner lists every runtime crate in Cargo.toml.
    const cargo = plan.find((e: PlanEntry) => e.dest === 'Cargo.toml');
    const lib = plan.find((e: PlanEntry) => e.dest === 'src/lib.rs');
    assert.ok(cargo && 'content' in cargo && lib && 'content' in lib, where + ': Cargo.toml and lib.rs rendered');
    const section = /\n\[dependencies\]\n([\s\S]*?)(?:\n\[|$)/.exec(cargo.content)?.[1] ?? '';
    const crates = [...section.matchAll(/^([\w-]+)\s*=/gm)].map((m) => m[1] ?? '');
    assert.ok(crates.length > 0, where + ': has dependencies');
    const block = dependencyBlock(lib.content);
    for (const name of crates) {
      assert.match(block, new RegExp(`\\b${name}\\b`), `${where}: lib.rs banner names ${name}: ${block}`);
    }
  }
});
