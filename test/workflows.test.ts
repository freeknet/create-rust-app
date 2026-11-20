import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { PRESETS, resolveAnswers } from '../src/presets.ts';
import type { PlanEntry } from '../src/types.ts';

/** Rendered `.github/workflows/*.yml` files of a preset, by dest. */
async function workflows(preset: string): Promise<Map<string, string>> {
  const ctx = buildContext(resolveAnswers(preset, { name: 'flow-' + preset }));
  const plan = await buildPlan(ctx);
  const out = new Map<string, string>();
  for (const entry of plan) {
    if (entry.dest.startsWith('.github/workflows/') && 'content' in entry) out.set(entry.dest, entry.content);
  }
  return out;
}

/** The step starting at `lines[start]` (a `- uses:` / `- name:` line), up to the next step or job. */
function stepAt(lines: string[], start: number): string[] {
  const indent = (lines[start] ?? '').search(/\S/);
  const step = [lines[start] ?? ''];
  for (const line of lines.slice(start + 1)) {
    const at = line.search(/\S/);
    if (at >= 0 && at <= indent && !line.trimStart().startsWith('#')) break;
    step.push(line);
  }
  return step;
}

for (const preset of Object.keys(PRESETS)) {
  test('workflows: every checkout in ' + preset + ' drops its credential (zizmor artipacked)', async () => {
    for (const [dest, content] of await workflows(preset)) {
      const lines = content.split('\n');
      lines.forEach((line: string, i: number) => {
        if (!/^\s*- uses: actions\/checkout@/.test(line)) return;
        const step = stepAt(lines, i).join('\n');
        assert.match(step, /^\s+persist-credentials: false$/m, preset + ': ' + dest + ':' + (i + 1));
      });
    }
  });
}
