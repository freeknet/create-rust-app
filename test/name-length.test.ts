// Generated Rust must be rustfmt-stable for every valid project name (1 to 64 characters).
// rustfmt reflows a statement once it crosses 100 columns, and re-joins one that fits, so a
// line whose length grows with the name must stay within 100 columns at the longest name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { writePlan } from '../src/engine/write.ts';
import { resolveAnswers } from '../src/presets.ts';
import type { PartialAnswers, PlanEntry } from '../src/types.ts';
import type { TestContext } from 'node:test';

const SHORT = 'a';
const LONG = 'abcdefghij'.repeat(6) + 'abcd'; // 64 characters, the crates.io limit
const LONG_DASHED = 'ab-cd-ef-gh-'.repeat(5) + 'ij-k'; // 64, with dashes (Pascal/snake forms differ)

// The changelog generators are owned by the changelog work (fix-plan row 4): `REPO` and the
// header string grow with the name. Remove these once that lands.
const KNOWN = new Set(['examples/changelog.rs', 'crates/xtask/src/changelog.rs']);

const COMBOS: [string, PartialAnswers][] = [
  ['rustaman', {}],
  ['rustaman', { features: { tray: true, singleInstance: true, commandPalette: true, subcommands: true } }],
  ['rustaman', { features: { demo: false } }],
  ['rustaman', { guiStack: 'winit-glow' }],
  ['rustaman', { crates: { clap: false } }],
  ['strobe', {}],
  ['strobe', { features: { tray: true, singleInstance: true } }],
  ['cli', {}],
  ['cli', { features: { subcommands: true }, crates: { async: 'tokio', sqlite: true } }],
  ['cli', { crates: { async: 'tokio' } }],
  ['tui', {}],
  ['lib', {}],
  ['minimal', {}],
];

const label = (preset: string, over: PartialAnswers) => preset + (Object.keys(over).length ? ' ' + JSON.stringify(over) : '');

async function rustFiles(preset: string, over: PartialAnswers, name: string) {
  const plan = await buildPlan(buildContext(resolveAnswers(preset, { ...over, name })));
  const files = new Map<string, string>();
  for (const e of plan) {
    if (!e.dest.endsWith('.rs') || !('content' in e)) continue;
    // Workspace paths carry the name (crates/<name>-app/...); key by a name-free path.
    files.set(e.dest.replace(`crates/${name}-`, 'crates/<name>-'), e.content);
  }
  return files;
}

for (const [preset, over] of COMBOS) {
  for (const long of [LONG, LONG_DASHED]) {
    test(`name length: ${label(preset, over)} keeps name-dependent lines within 100 columns (${long.includes('-') ? 'dashed' : 'plain'})`, async () => {
      const short = await rustFiles(preset, over, SHORT);
      const wide = await rustFiles(preset, over, long);
      assert.deepEqual([...wide.keys()].sort(), [...short.keys()].sort(), 'same files for both names');
      const problems: string[] = [];
      for (const [dest, text] of wide) {
        if ([...KNOWN].some((k) => dest.endsWith(k))) continue;
        const a = (short.get(dest) ?? '').split('\n');
        const b = text.split('\n');
        assert.equal(b.length, a.length, `${dest}: line count must not depend on the name`);
        b.forEach((line, i) => {
          // rustfmt leaves doc comments (wrap_comments is off) and tool attributes such as
          // `#[command(name = "…")]` as written. Plain `//` lines stay in: the header check
          // holds banner lines to 100 columns, except `Module:`, whose value is the path.
          const t = line.trimStart();
          if (line === a[i] || t.startsWith('#[') || t.startsWith('///') || t.startsWith('//!')) return;
          if (t.startsWith('// Module:')) return;
          if (line.length > 100) problems.push(`${dest}:${i + 1} (${line.length} cols): ${line.trim()}`);
        });
      }
      assert.deepEqual(problems, [], 'name-dependent lines over 100 columns');
    });
  }
}

const hasRustfmt = spawnSync('rustfmt', ['--version'], { stdio: 'ignore' }).status === 0;

for (const preset of ['rustaman', 'strobe', 'cli', 'tui']) {
  test(`name length: ${preset} is rustfmt-clean with 1- and 64-character names`, async (t: TestContext) => {
    if (!hasRustfmt) {
      t.skip('rustfmt is not installed');
      return;
    }
    for (const name of [SHORT, LONG, LONG_DASHED]) {
      const ctx = buildContext(resolveAnswers(preset, { name }));
      const plan = await buildPlan(ctx);
      const dir = await mkdtemp(join(tmpdir(), 'cra-fmt-'));
      try {
        await writePlan(plan, dir, { force: true });
        const files = plan
          .filter((e: PlanEntry) => e.dest.endsWith('.rs') && ![...KNOWN].some((k) => e.dest.endsWith(k)))
          .map((e: PlanEntry) => join(dir, e.dest));
        const r = spawnSync('rustfmt', ['--check', '--edition', ctx.edition, ...files], { encoding: 'utf8' });
        assert.equal(r.status, 0, `${preset} named ${name}:\n${r.stdout}${r.stderr}`);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });
}
