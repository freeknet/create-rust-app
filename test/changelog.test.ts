import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildContext } from '../src/context.ts';
import { buildPlan } from '../src/engine/plan.ts';
import { resolveAnswers } from '../src/presets.ts';
import type { PlanEntry } from '../src/types.ts';

/** The value of `const <name>: &str = "...";` in rendered Rust, escapes resolved. */
function rustStr(source: string, name: string): string {
  const match = new RegExp('const ' + name + ': &str = "((?:[^"\\\\]|\\\\.)*)";', 's').exec(source);
  assert.ok(match?.[1] !== undefined, 'no const ' + name);
  return match[1].replace(/\\(\n\s*|n|"|\\)/g, (_all: string, esc: string) => {
    if (esc === 'n') return '\n';
    if (esc === '"' || esc === '\\') return esc;
    return '';
  });
}

/** The subject the scaffold's first commit is made with, for `name`. */
function firstSubject(name: string): string {
  const git = readFileSync(new URL('../src/post/git.ts', import.meta.url), 'utf8');
  const match = /const message = `([^`]*)`/.exec(git);
  assert.ok(match?.[1] !== undefined, 'first commit message not found in src/post/git.ts');
  return match[1].replace('${answers.name}', name);
}

async function files(preset: string, overrides: Record<string, unknown> = {}): Promise<Map<string, string>> {
  const ctx = buildContext(resolveAnswers(preset, { name: 'log-' + preset, ...overrides }));
  const out = new Map<string, string>();
  for (const entry of (await buildPlan(ctx)) as PlanEntry[]) {
    if ('content' in entry) out.set(entry.dest, entry.content);
  }
  return out;
}

const SINGLE = ['cli', 'tui', 'lib', 'rustaman'];

for (const preset of SINGLE) {
  test('changelog: ' + preset + ' ships exactly what examples/changelog.rs generates from the first commit', async () => {
    const plan = await files(preset);
    const generator = plan.get('examples/changelog.rs');
    assert.ok(generator !== undefined, preset + ': examples/changelog.rs is shipped');
    const subject = firstSubject('log-' + preset);
    assert.match(subject, /^feat: /, 'the first commit lands under Added');
    const expected =
      rustStr(generator, 'PREAMBLE') +
      '\n## [Unreleased]\n\n### Added\n\n- ' + subject.slice('feat: '.length) + '\n' +
      '\n[Unreleased]: ' + rustStr(generator, 'REPO') + '/commits/HEAD\n';
    assert.equal(plan.get('CHANGELOG.md'), expected);
    assert.match(plan.get('CLAUDE.md') ?? '', /`cargo run --example changelog` rebuilds it/);
    assert.match(plan.get('CONTRIBUTING.md') ?? '', /rebuilt from the git history by\n`cargo run --example changelog`/);
  });
}

test('changelog: strobe ships exactly what `cargo xtask changelog` generates from the first commit', async () => {
  const plan = await files('strobe');
  const generator = plan.get('crates/xtask/src/changelog.rs');
  assert.ok(generator !== undefined, 'xtask changelog is shipped');
  const subject = firstSubject('log-strobe');
  const expected =
    rustStr(generator, 'PREAMBLE') + '\n## [Unreleased]\n\n### Added\n\n- ' + subject.slice('feat: '.length) + '\n';
  assert.equal(plan.get('CHANGELOG.md'), expected);
  assert.match(plan.get('CLAUDE.md') ?? '', /`cargo xtask changelog` rebuilds it/);
});

for (const preset of [...SINGLE, 'strobe']) {
  test('changelog: ' + preset + ' without the generator keeps the hand-edited wording', async () => {
    const plan = await files(preset, { tooling: { changelogGen: false } });
    assert.equal(plan.has('examples/changelog.rs'), false, preset + ': no generator example');
    const changelog = plan.get('CHANGELOG.md') ?? '';
    assert.doesNotMatch(changelog, /generated/i);
    assert.match(changelog, /Entries follow the conventional-commit subjects/);
    assert.doesNotMatch(plan.get('CLAUDE.md') ?? '', /CHANGELOG.md` is generated/);
    assert.doesNotMatch(plan.get('CONTRIBUTING.md') ?? '', /rebuilt from the git history/);
  });
}
