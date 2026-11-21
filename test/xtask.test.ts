import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { resolveAnswers } from '../src/presets.ts';
import type { PlanEntry } from '../src/types.ts';

const text = (plan: PlanEntry[], dest: string) => {
  const e = plan.find((x: PlanEntry) => x.dest === dest);
  return e && 'content' in e ? e.content : undefined;
};

test('workspace xtask ships the changelog command only with changelogGen', async () => {
  const on = await buildPlan(buildContext(resolveAnswers('strobe', { name: 'ws' })));
  assert.ok(text(on, 'crates/xtask/src/changelog.rs') !== undefined, 'generator present by default');
  assert.match(text(on, 'crates/xtask/src/main.rs') ?? '', /^mod changelog;$/m);
  assert.match(text(on, 'crates/xtask/src/main.rs') ?? '', /"changelog" if args\.len\(\) == 1/);

  const off = await buildPlan(buildContext(resolveAnswers('strobe', { name: 'ws', tooling: { changelogGen: false } })));
  assert.equal(text(off, 'crates/xtask/src/changelog.rs'), undefined, 'no generator to rewrite a hand-edited CHANGELOG.md');
  const main = text(off, 'crates/xtask/src/main.rs') ?? '';
  assert.doesNotMatch(main, /changelog/i, 'no module, command or help text for it');
  assert.match(main, /^mod ci;$/m, 'ci stays');
});
