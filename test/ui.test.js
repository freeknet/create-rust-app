// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { width } from '../src/ui/tty.js';
import { paint, hex, dim, bold } from '../src/ui/rainbow.js';
import { bannerFrame, showBanner } from '../src/ui/banner.js';
import { STOPS, bullet, section } from '../src/ui/theme.js';
import { createSpinner } from '../src/ui/spinner.js';
import { renderSummary } from '../src/ui/summary.js';

/** @typedef {import('../src/ui/tty.js').Caps} Caps */

/** @param {Partial<Caps>} over @returns {Caps} */
const caps = (over = {}) => ({ tier: 'truecolor', unicode: true, tty: true, columns: 80, animate: false, ...over });

const ctx = {
  name: 'demo-app',
  kind: 'gui',
  guiStack: 'eframe',
  edition: '2024',
  msrv: '1.98',
  toolchain: '1.99.1',
  license: 'MIT',
  crates: { errors: 'anyhow', thiserror: false, logging: 'log', serde: true, async: 'none', http: 'none', sqlite: false, clap: true },
  features: { themes: true, brand: true, motion: true, icons: true, config: true, winres: true, tray: false,
    singleInstance: false, commandPalette: false, screenshotExample: false },
  tooling: { ci: true, release: true, cargoDeny: true, dependabot: true, toolchainPin: true, agentDocs: true,
    headerCheck: true, unsafeCheck: true, changelogGen: true, issueTemplates: true, codeowners: true, securityMd: true },
};

const dests = [
  'Cargo.toml', 'README.md', 'LICENSE', 'deny.toml', 'rust-toolchain.toml', '.gitignore', 'AGENTS.md', 'CLAUDE.md',
  'CHANGELOG.md', 'SECURITY.md', 'cliff.toml', 'build.rs',
  'src/main.rs', 'src/lib.rs', 'src/config.rs', 'src/header_check.rs', 'src/unsafe_check.rs',
  'src/gui/mod.rs', 'src/gui/run.rs', 'src/gui/app/mod.rs', 'src/gui/ui/mod.rs',
  '.github/workflows/ci.yml', '.github/workflows/release.yml', '.github/dependabot.yml', '.github/CODEOWNERS',
  'tests/toolchain_pin.rs', 'assets/icon.png', 'assets/app.ico',
];
const topDirs = ['src', '.github', 'tests', 'assets'];

test('none tier output has no escape codes', () => {
  const c = caps({ tier: 'none' });
  const out = [
    paint(c, 'hello world'), hex(c, '#ff6ec7', 'x'), dim(c, 'd'), bold(c, 'b'),
    ...bannerFrame(c, 5), bullet(c, 2), section(c, 3, 'Crates'),
    renderSummary(c, ctx, dests, { dir: 'demo-app', cargoChecked: true, git: true }),
  ].join('\n');
  assert.ok(!out.includes('\x1b'));
  assert.deepEqual(bannerFrame(c, 0), ['CREATE-RUST-APP', 'scaffold rust projects at the speed of light']);
});

test('paint keeps the visible text equal to the input', () => {
  for (const tier of /** @type {const} */ (['truecolor', 'ansi256', 'ansi16'])) {
    const text = 'Prism ◆ rainbow — ünïcødé!';
    const out = paint(caps({ tier }), text, { offset: 40, step: 13 });
    assert.notEqual(out, text);
    assert.equal(stripVTControlCharacters(out), text);
  }
  assert.equal(stripVTControlCharacters(hex(caps({ tier: 'ansi256' }), STOPS[0], 'abc')), 'abc');
});

test('ansi tiers use the right escape families', () => {
  assert.match(paint(caps({ tier: 'truecolor' }), 'a'), /\x1b\[38;2;\d+;\d+;\d+m/);
  assert.match(paint(caps({ tier: 'ansi256' }), 'a'), /\x1b\[38;5;\d+m/);
  assert.match(paint(caps({ tier: 'ansi16' }), 'a'), /\x1b\[9[1-6]m/);
});

test('banner frames animate in truecolor', () => {
  const c = caps();
  const f0 = bannerFrame(c, 0);
  const f10 = bannerFrame(c, 10);
  assert.equal(f0.length, 2);
  assert.notDeepEqual(f0, f10);
  assert.equal(stripVTControlCharacters(f0[0]), 'C R E A T E - R U S T - A P P');
  assert.equal(stripVTControlCharacters(f0[1]), `◇ scaffold rust projects at the speed of light ${'━'.repeat(20)}`);
});

test('showBanner animates, restores the cursor and ends with a blank line', async () => {
  let out = '';
  const sink = { write: (/** @type {string} */ s) => { out += s; } };
  await showBanner(caps({ animate: true }), { out: sink, frames: 3, interval: 1 });
  assert.ok(out.startsWith('\x1b[?25l'));
  assert.ok(out.endsWith('\n\n\x1b[?25h'));
  assert.equal(out.split('\x1b[2A').length - 1, 2);

  out = '';
  await showBanner(caps({ tier: 'none' }), { out: sink });
  assert.equal(out, 'CREATE-RUST-APP\nscaffold rust projects at the speed of light\n\n');
});

test('summary contains the name and every top-level dir', () => {
  for (const tier of /** @type {const} */ (['truecolor', 'none'])) {
    const out = stripVTControlCharacters(renderSummary(caps({ tier }), ctx, dests, { dir: 'demo-app', cargoChecked: true, git: true }));
    assert.ok(out.includes('demo-app'));
    for (const dir of topDirs) assert.ok(out.includes(`${dir}/`), `missing ${dir}/`);
    assert.ok(out.includes('cd demo-app'));
    assert.ok(out.includes('cargo run'));
    assert.ok(out.includes('cargo clippy --all-targets --all-features -- -D warnings'));
    assert.ok(out.includes('more'));
  }
  const lib = stripVTControlCharacters(renderSummary(caps(), { ...ctx, kind: 'lib' }, ['Cargo.toml', 'src/lib.rs'], { dir: '.' }));
  assert.ok(lib.includes('cargo test'));
  assert.ok(!lib.includes('cargo run'));
  assert.ok(!lib.includes('cd .'));
});

test('summary never exceeds the terminal width', () => {
  for (const columns of [24, 40, 60, 80, 120]) {
    for (const unicode of [true, false]) {
      const out = renderSummary(caps({ columns, unicode }), ctx, dests, { dir: 'some/rather/long/path/to/demo-app', cargoChecked: false, git: true });
      for (const line of out.split('\n')) {
        assert.ok(width(line) <= Math.min(columns, 80), `${columns}: "${stripVTControlCharacters(line)}"`);
      }
    }
  }
  for (const columns of [20, 40, 80]) {
    for (const line of bannerFrame(caps({ columns }), 3)) assert.ok(width(line) <= columns);
  }
});

test('ASCII fallback has no non-ASCII when unicode=false', () => {
  for (const tier of /** @type {const} */ (['truecolor', 'ansi16', 'none'])) {
    const c = caps({ tier, unicode: false });
    let spun = '';
    const sp = createSpinner(c, { out: { write: (/** @type {string} */ s) => { spun += s; } } });
    sp.start('checking ✔ things…');
    sp.stop('done', true);
    sp.start('again');
    sp.stop('failed', false);
    const out = [
      ...bannerFrame(c, 7), bullet(c, 1), section(c, 4, 'Tooling ◆'), spun,
      renderSummary(c, { ...ctx, name: 'démo' }, dests, { dir: 'démo app', cargoChecked: true, git: true }),
    ].join('\n');
    assert.ok(/^[\x00-\x7f]*$/.test(out), stripVTControlCharacters(out).replace(/[\x00-\x7f]/g, ''));
  }
});

test('animated spinner redraws and restores the cursor', async () => {
  let out = '';
  const sp = createSpinner(caps({ animate: true }), { out: { write: (/** @type {string} */ s) => { out += s; } }, interval: 1 });
  sp.start('cargo check');
  await new Promise((r) => setTimeout(r, 15));
  sp.message('still checking');
  sp.stop('cargo check passed');
  assert.ok(out.includes('\x1b[?25l'));
  assert.ok(out.endsWith('\x1b[?25h'));
  assert.ok(stripVTControlCharacters(out).includes('✔ cargo check passed'));
});
