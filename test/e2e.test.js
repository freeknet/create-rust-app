// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/context.js';
import { buildPlan } from '../src/engine/plan.js';
import { moduleFor } from '../src/gen/header.js';
import { PRESETS, resolveAnswers } from '../src/presets.js';

// A `@@token@@` the engine failed to substitute.
const TOKEN = /@@[A-Za-z]+@@/;
// Match whole directive lines, including every supported comment leader.
const DIRECTIVE_LINE = /^\s*(?:\/\/|#|<!--|--|;)?\s*@(if|elif|else|end)\b.*$/m;

for (const preset of Object.keys(PRESETS)) {
  test('e2e: ' + preset + ' produces a fully rendered plan with Rust headers', async (t) => {
    const ctx = buildContext(resolveAnswers(preset, { name: 'prism-' + preset }));
    const plan = await buildPlan(ctx);
    const dests = plan.map((entry) => entry.dest);
    assert.equal(new Set(dests).size, dests.length, preset + ': duplicate destinations');

    for (const entry of plan) {
      const where = preset + ': ' + entry.dest;
      assert.doesNotMatch(entry.dest, TOKEN, where + ': unrendered path token');
      if ('content' in entry) {
        assert.doesNotMatch(entry.content, TOKEN, where + ': unrendered content token');
        assert.doesNotMatch(entry.content, DIRECTIVE_LINE, where + ': leftover directive line');
      }
    }

    const rust = plan.filter((entry) => entry.dest.endsWith('.rs'));
    if (rust.length === 0) {
      t.skip(preset + ': templates do not produce Rust files yet');
      return;
    }

    for (const entry of rust) {
      const where = preset + ': ' + entry.dest;
      assert.ok('content' in entry, where + ': Rust must be rendered text');
      const lines = entry.content.replace(/\r\n/g, '\n').split('\n');
      assert.match(lines[0], /^\/\/ =+$/, where + ': missing opening header rule');
      const module = /^\/\/ Module: +(.+)$/.exec(lines[1]);
      assert.ok(module, where + ': missing Module line in opening header');
      assert.equal(module[1], moduleFor(entry.dest, ctx), where + ': incorrect header module');
      const end = lines.indexOf(lines[0], 1);
      assert.ok(end > 1, where + ': missing closing header rule');
      const header = lines.slice(2, end);
      assert.ok(header.every((line) => line.startsWith('//')), where + ': header must use line comments');
      assert.ok(header.some((line) => /^\/\/ Description: +\S/.test(line)), where + ': missing Description');
    }
  });
}
