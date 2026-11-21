import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { resolveAnswers } from '../src/presets.ts';
import type { PlanEntry } from '../src/types.ts';

async function files(preset: string): Promise<Map<string, string>> {
  const ctx = buildContext(resolveAnswers(preset, { name: 'doc-' + preset }));
  const out = new Map<string, string>();
  for (const entry of (await buildPlan(ctx)) as PlanEntry[]) {
    if ('content' in entry) out.set(entry.dest, entry.content);
  }
  return out;
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen'];

test('docs: every count of theme colours matches the colours a shipped theme states', async () => {
  const themes = readFileSync(new URL('../templates/gui/files/assets/themes.toml', import.meta.url), 'utf8');
  const first = themes.split('[[theme]]')[1] ?? '';
  const colours = first.split('\n').filter((line: string) => /^\w+ = "#[0-9a-f]{6}"$/.test(line)).length;
  const word = WORDS[colours];
  assert.ok(word !== undefined, 'colour count in range');
  const plan = await files('rustaman');
  for (const [dest, content] of plan) {
    // A theme's colour count is in the tens; smaller counts elsewhere are about other things.
    for (const match of content.matchAll(/\b(ten|eleven|twelve|thirteen)\b\**\s+colours\b/gi)) {
      assert.equal(match[1]?.toLowerCase(), word, dest + ': "' + match[0] + '"');
    }
  }
  assert.match(plan.get('README.md') ?? '', new RegExp('A theme is ' + word + ' colours'));
});

test('docs: header-banner docs name every place the check walks', async () => {
  const check = readFileSync(new URL('../templates/guards/files/src/header_check.rs', import.meta.url), 'utf8');
  const areas = /for area in \[([^\]]*)\]/.exec(check)?.[1]?.match(/"(\w+)"/g)?.map((a: string) => a.slice(1, -1) + '/') ?? [];
  assert.ok(areas.length > 0, 'areas found in header_check.rs');
  assert.match(check, /root\.join\("build\.rs"\)/, 'build.rs is checked');
  for (const preset of ['cli', 'strobe']) {
    const plan = await files(preset);
    for (const dest of ['CLAUDE.md', 'CONTRIBUTING.md']) {
      const text = (plan.get(dest) ?? '').replace(/\s+/g, ' ');
      for (const place of [...areas, 'build.rs']) assert.ok(text.includes('`' + place + '`'), preset + ' ' + dest + ': ' + place);
      for (const name of ['(integration test)', '(example)', '(benchmark)', '(build script)']) {
        assert.ok(text.includes(name), preset + ' ' + dest + ': ' + name);
      }
    }
  }
});

test('docs: nothing claims a check enforces assert! messages', async () => {
  for (const preset of ['cli', 'strobe']) {
    const plan = await files(preset);
    for (const dest of ['CLAUDE.md', 'CONTRIBUTING.md']) {
      const text = (plan.get(dest) ?? '').replace(/\s+/g, ' ');
      assert.match(text, /not (by any check|something the build checks)/, preset + ' ' + dest);
    }
  }
});

test('docs: release docs say attestation needs a public repository or Enterprise Cloud', async () => {
  for (const preset of ['cli', 'rustaman', 'strobe']) {
    const text = ((await files(preset)).get('CONTRIBUTING.md') ?? '').replace(/\s+/g, ' ');
    assert.match(text, /public repository, or a private one on GitHub Enterprise Cloud/, preset);
  }
});

test('docs: the GUI README lists the Linux runtime libraries for its renderer', async () => {
  const eframe = (await files('rustaman')).get('README.md') ?? '';
  assert.match(eframe, /libxkbcommon-x11-0/);
  assert.match(eframe, /mesa-vulkan-drivers/);
  const cli = (await files('cli')).get('README.md') ?? '';
  assert.doesNotMatch(cli, /Linux runtime libraries/);
});
