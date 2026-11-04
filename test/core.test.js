// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectives, evalExpr } from '../src/engine/directives.js';
import { moduleFor } from '../src/gen/header.js';
import { destPath, renderText } from '../src/engine/render.js';
import { buildContext } from '../src/context.js';
import { resolveAnswers, PRESETS } from '../src/presets.js';

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
