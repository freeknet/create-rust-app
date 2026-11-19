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
  ['cli', { features: { subcommands: true }, crates: { http: 'ureq', sqlite: true } }],
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

test('--with subcommands swaps in the subcommand CLI, only for the cli kind with clap (#9)', async () => {
  const plan = async (preset: string, extra: Record<string, unknown>) =>
    buildPlan(buildContext(resolveAnswers(preset, { name: 'sub-' + preset, ...extra })));
  const text = (entries: PlanEntry[], dest: string) => {
    const e = entries.find((x: PlanEntry) => x.dest === dest);
    return e && 'content' in e ? e.content : '';
  };
  const sub = await plan('cli', { features: { subcommands: true } });
  const dests = sub.map((e: PlanEntry) => e.dest);
  assert.ok(!dests.some((d: string) => d.includes('_subcommands')), 'variant files are renamed into place');
  assert.match(text(sub, 'src/cli.rs'), /#\[command\(subcommand\)\]\n    pub\(crate\) command: Command,/, 'a required subcommand');
  assert.doesNotMatch(text(sub, 'src/cli.rs'), /=> *\{?\s*_|\b_ =>/, 'dispatch has no wildcard arm');
  assert.match(text(sub, 'tests/cli.rs'), /a_bare_run_is_a_usage_error/, 'subcommand tests');
  assert.match(text(sub, 'src/cli.rs'), /^\/\/ Module: +cli$/m, 'banner module follows the final path');

  const plain = await plan('cli', {});
  assert.doesNotMatch(text(plain, 'src/cli.rs'), /Command::Sum/, 'off by default');
  const noClap = await plan('minimal', { features: { subcommands: true } });
  assert.doesNotMatch(text(noClap, 'src/cli.rs'), /Command::Sum/, 'needs clap');
  const tui = await plan('tui', { features: { subcommands: true } });
  assert.ok(!tui.some((e: PlanEntry) => e.dest === 'tests/cli.rs'), 'other kinds are untouched');
});

test('--bin names the executable everywhere it is named, and only there (#8)', async () => {
  const plan = async (preset: string, extra: Record<string, unknown>) =>
    buildPlan(buildContext(resolveAnswers(preset, { name: 'long-name', ...extra })));
  const text = (entries: PlanEntry[], dest: string) => {
    const e = entries.find((x: PlanEntry) => x.dest === dest);
    return e && 'content' in e ? e.content : '';
  };
  const cli = await plan('cli', { bin: 'ln' });
  assert.match(text(cli, 'Cargo.toml'), /\n\[\[bin\]\]\nname = "ln"\npath = "src\/main\.rs"\n/, '[[bin]] table');
  assert.match(text(cli, 'Cargo.toml'), /^name = "long-name"$/m, 'the package keeps its name');
  assert.match(text(cli, 'src/cli.rs'), /#\[command\(name = "ln"/, 'clap shows the command name');
  assert.match(text(cli, 'README.md'), /puts `ln` on your PATH/, 'README');
  assert.match(text(cli, '.github/workflows/release.yml'), /release\/ln\.exe/, 'release packages the right exe');
  assert.match(text(cli, 'src/config.rs'), /join\("long-name"\)/, 'the config dir stays the app name');

  const ws = await plan('strobe', { bin: 'ln' });
  assert.match(text(ws, 'crates/long-name-app/Cargo.toml'), /\[\[bin\]\]\nname = "ln"/, 'workspace app crate gets [[bin]]');
  assert.doesNotMatch(text(ws, 'crates/xtask/Cargo.toml'), /\[\[bin\]\]/, 'xtask does not');
  assert.match(text(ws, '.github/workflows/release.yml'), /release\/ln\.exe/, 'workspace release');

  const plainWs = await plan('strobe', {});
  assert.match(text(plainWs, '.github/workflows/release.yml'), /release\/long-name-app\.exe/, 'default workspace exe is the app crate');
  assert.doesNotMatch(text(plainWs, 'crates/long-name-app/Cargo.toml'), /\[\[bin\]\]/, 'no table by default');
  for (const [preset, bin] of [['cli', 'long-name'], ['lib', 'ln'], ['strobe', 'long-name-app']] as const) {
    const p = await plan(preset, { bin });
    assert.ok(!p.some((e: PlanEntry) => 'content' in e && /\[\[bin\]\]/.test(e.content)), `${preset} --bin ${bin}: no [[bin]] needed`);
  }
});

test('--without demo starts the GUI from one empty page (#18)', async () => {
  const text = (entries: PlanEntry[], dest: string) => {
    const e = entries.find((x: PlanEntry) => x.dest === dest);
    return e && 'content' in e ? e.content : '';
  };
  const shell = await buildPlan(buildContext(resolveAnswers('rustaman', { name: 'shell', features: { demo: false, commandPalette: true } })));
  const app = text(shell, 'src/gui/app/mod.rs');
  const ui = text(shell, 'src/gui/ui/mod.rs');
  assert.match(app, /pub const ALL: \[Self; 1\] = \[Self::Home\];/, 'one page');
  assert.doesNotMatch(app + ui, /CARDS|selected_card|Overview|fn palette\(|fn about\(/, 'no demo content left');
  assert.match(ui, /Page::Home => home\(app, ui, &mut actions\)/, 'the page is drawn');
  assert.match(ui, /\("Ctrl\+1", "Switch page"\)/, 'shortcut list matches one page');
  assert.match(text(shell, 'docs/ARCHITECTURE.md'), /## Adding a page[\s\S]*command palette gets a "Go to" entry/, 'docs explain adding pages');

  const demo = await buildPlan(buildContext(resolveAnswers('rustaman', { name: 'demo' })));
  assert.match(text(demo, 'src/gui/app/mod.rs'), /pub const CARDS: &\[Card\]/, 'the showcase stays the default');
  const cli = buildContext(resolveAnswers('cli', { name: 'c', features: { demo: true } }));
  assert.ok(!cli.flags.has('demo'), 'demo is a desktop-only feature');
});

test('--base lays the signature theme on a shipped theme\'s surfaces (#19)', async () => {
  const { shippedThemes } = await import('../src/gen/themes.ts');
  const themes = shippedThemes();
  assert.ok(themes.length >= 2 && themes.some((t) => t.id === 'midnight'), 'the catalog parses');
  const theme = (base: string) => buildPlan(buildContext(resolveAnswers('rustaman', { name: 'b', themeBase: base })))
    .then((plan) => plan.find((e: PlanEntry) => e.dest === 'src/theme/mod.rs'))
    .then((e) => (e && 'content' in e ? e.content : ''));
  const graphite = themes.find((t) => t.id === 'graphite');
  assert.ok(graphite, 'graphite ships');
  const src = await theme('graphite');
  assert.match(src, new RegExp(`app: "${graphite.app}"\\.to_string\\(\\)`), 'surfaces come from the base');
  assert.match(src, /mode: Mode::Dark,/);
  assert.match(src, /const FALLBACK_ACCENT: Rgb = Rgb::new\(0x62, 0xb6, 0xf5\);/, 'the base\'s own accent is the fallback');
  const light = await theme('daylight');
  assert.match(light, /mode: Mode::Light,/);
  assert.match(light, /\[0\.48, 0\.42, 0\.36, 0\.54\]/, 'darker accent retries on a light base');
  // The default reproduces the literals the template used to hard-code.
  const midnight = await theme('midnight');
  assert.match(midnight, /app: "#0a0c11"\.to_string\(\)[\s\S]*rainbow_span: Some\(280\.0\)/);
  assert.match(midnight, /const FALLBACK_ACCENT: Rgb = Rgb::new\(0x4c, 0xc9, 0xf0\);/);
});
