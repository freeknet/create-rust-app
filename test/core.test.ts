import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectives, evalExpr } from '../src/engine/directives.ts';
import { moduleFor } from '../src/gen/header.ts';
import { destPath, renderText } from '../src/engine/render.ts';
import { buildContext } from '../src/context.ts';
import { resolveAnswers, PRESETS } from '../src/presets.ts';

const flags = new Set(['a', 'b', 'kind_gui']);

test('evalExpr: and/or/not', () => {
  assert.equal(evalExpr('a & b', flags), true);
  assert.equal(evalExpr('a & !b', flags), false);
  assert.equal(evalExpr('x | kind_gui', flags), true);
  assert.throws(() => evalExpr('a &', flags));
});

test('directives: nesting, elif, else, comment leaders', () => {
  const src = [
    'top',
    '// @if a',
    'A',
    '#   @if x',
    'X',
    '# @elif b',
    'B',
    '# @else',
    'ELSE',
    '# @end',
    '<!-- @end -->',
    '// @if x',
    'nope',
    '// @else',
    'yes',
    '// @end',
  ].join('\n');
  assert.equal(applyDirectives(src, flags), 'top\nA\nB\nyes');
  assert.throws(() => applyDirectives('// @if a\nunclosed', flags));
  assert.throws(() => applyDirectives('// @end', flags));
});

test('moduleFor mirrors rustaman header_check', () => {
  const ctx = { name: 'demo' };
  assert.equal(moduleFor('src/main.rs', ctx), 'demo (binary crate root)');
  assert.equal(moduleFor('src/lib.rs', ctx), 'demo (library crate root)');
  assert.equal(moduleFor('src/gui/ui/mod.rs', ctx), 'gui::ui');
  assert.equal(moduleFor('src/gui/ui/theme.rs', ctx), 'gui::ui::theme');
  assert.equal(moduleFor('src/bin/tool.rs', ctx), 'demo-tool (binary crate root)');
  assert.equal(moduleFor('tests/toolchain_pin.rs', ctx), 'toolchain_pin (integration test)');
  assert.equal(moduleFor('examples/changelog.rs', ctx), 'changelog (example)');
  assert.equal(moduleFor('build.rs', ctx), 'build (build script)');
  assert.equal(moduleFor('crates/demo-app/src/cli.rs', ctx), 'demo_app::cli');
  assert.equal(moduleFor('crates/demo-app/src/main.rs', ctx), 'demo-app (binary crate root)');
});

test('context, tokens and paths', () => {
  const ctx = buildContext(resolveAnswers('cli', { name: 'neon-dash' }));
  assert.equal(ctx.tokens.crate, 'neon_dash');
  assert.equal(ctx.tokens.Name, 'NeonDash');
  assert.ok(ctx.flags.has('kind_cli') && ctx.flags.has('has_bin') && !ctx.flags.has('themes'));
  assert.equal(destPath('_github/workflows/ci.yml', ctx), '.github/workflows/ci.yml');
  assert.equal(destPath('assets/@@name@@.manifest.tmpl', ctx), 'assets/neon-dash.manifest');
  assert.equal(renderText('// Module:       @@module@@\n// @if kind_cli\ncli @@crate@@\n// @end', ctx, 'src/cli.rs'), '// Module:       cli\ncli neon_dash');
  assert.throws(() => renderText('@@nope@@', ctx, 'x'));
  assert.throws(() => buildContext(resolveAnswers(null, { name: 'Bad_Name' })));
});

test('every preset builds a context', () => {
  for (const p of Object.keys(PRESETS)) assert.ok(buildContext(resolveAnswers(p, { name: 'x-y' })).flags.size > 0, p);
});

test('generated README links back to this repository (package.json repository.url)', async () => {
  const { readFile } = await import('node:fs/promises');
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const repo = String(pkg.repository.url).replace(/^git\+/, '').replace(/\.git$/, '');
  const readme = await readFile(new URL('../templates/base/files/README.md', import.meta.url), 'utf8');
  const links = [...readme.matchAll(/https:\/\/github\.com\/[\w.-]+\/create-rust-app\b/g)].map((m) => m[0]);
  assert.ok(links.length > 0, 'the footer links to create-rust-app');
  for (const link of links) assert.equal(link, repo, 'README template link matches package.json');
});

test('template deps.js never pins a different version of a base crate', async () => {
  const { baseDeps, collectDeps } = await import('../src/gen/deps.ts');
  const combos = [
    ['cli', { crates: { http: 'reqwest', async: 'none', sqlite: true } }],
    ['cli', { crates: { http: 'ureq', async: 'tokio' } }],
    ['tui', {}], ['lib', {}], ['rustaman', {}], ['strobe', {}],
  ] as const;
  for (const [preset, extra] of combos) {
    const ctx = buildContext(resolveAnswers(preset, { name: 'v-' + preset, ...extra }));
    const base = new Map(baseDeps(ctx).map((d) => [d.name, d.version]));
    for (const dep of await collectDeps(ctx)) {
      const want = base.get(dep.name);
      if (want && (dep.crate ?? 'app') === 'app') assert.equal(dep.version, want, `${preset}: ${dep.name} keeps the base version`);
    }
  }
});
