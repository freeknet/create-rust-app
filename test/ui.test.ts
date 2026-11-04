type Caps = import('../src/ui/tty.ts').Caps;
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { width } from '../src/ui/tty.ts';
import { paint, hex, dim, bold } from '../src/ui/rainbow.ts';
import { BLOCK_WIDTH, bannerFrame, showBanner } from '../src/ui/banner.ts';
import { STOPS, bullet, section } from '../src/ui/theme.ts';
import { createSpinner } from '../src/ui/spinner.ts';
import { reviewLines } from '../src/prompts.ts';
import { nextCommands } from '../src/cli.ts';
import { reproduceCommand } from '../src/reproduce.ts';
import { parseArgv } from '../src/args.ts';
import { buildContext } from '../src/context.ts';
import { resolveAnswers } from '../src/presets.ts';

/** @typedef {import('../src/ui/tty.ts').Caps} Caps */

/** @param {Partial<Caps>} over @returns {Caps} */
const caps = (over: Partial<Caps> = {}): Caps => ({ tier: 'truecolor', unicode: true, tty: true, columns: 80, animate: false, ...over });

const ctx = buildContext(resolveAnswers(null, {
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
}));

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
    reviewLines(c, ctx).title, reviewLines(c, ctx).body,
  ].join('\n');
  assert.ok(!out.includes('\x1b'));
  assert.deepEqual(bannerFrame(c, 0), ['CREATE-RUST-APP', 'scaffold rust projects at the speed of light']);
});

test('paint keeps the visible text equal to the input', () => {
  for (const tier of /** @type {const} */ (['truecolor', 'ansi256', 'ansi16'] as const)) {
    const text = 'Prism ◆ rainbow — ünïcødé!';
    const out = paint(caps({ tier }), text, { offset: 40, step: 13 });
    assert.notEqual(out, text);
    assert.equal(stripVTControlCharacters(out), text);
  }
  assert.equal(stripVTControlCharacters(hex(caps({ tier: 'ansi256' }), STOPS[0] ?? '', 'abc')), 'abc');
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
  // Three block-letter rows + the tagline/rule line.
  assert.equal(f0.length, 4, 'block wordmark is 3 rows + tagline');
  assert.notDeepEqual(f0, f10, 'frames differ (the hue drifts)');
  const plain = f0.map((l) => stripVTControlCharacters(l));
  assert.ok(plain.slice(0, 3).every((l) => /[▀▄█]/.test(l)), 'rows are block glyphs');
  assert.ok(plain.slice(0, 3).every((l) => l.length <= BLOCK_WIDTH), 'rows fit the declared width');
  assert.ok(plain[3]?.startsWith('◇ scaffold rust projects at the speed of light ━'), 'tagline then rule');
  assert.equal(plain[3]?.length, BLOCK_WIDTH, 'rule ends at the wordmark edge');

  // Too narrow for block letters → one bold line.
  const narrow = bannerFrame(caps({ columns: 40 }), 0).map((l) => stripVTControlCharacters(l));
  assert.equal(narrow[0], 'CREATE-RUST-APP', 'narrow terminals get a single-line wordmark');
});

test('showBanner animates, restores the cursor and ends with a blank line', async () => {
  let out = '';
  const sink = { write: (/** @type {string} */ s: string) => { out += s; } };
  await showBanner(caps({ animate: true }), { out: sink, frames: 3, interval: 1 });
  assert.ok(out.startsWith('\x1b[?25l'));
  assert.ok(out.endsWith('\n\n\x1b[?25h'));
  assert.equal(out.split('\x1b[4A').length - 1, 2, 'each later frame rewrites the 4 banner lines in place');

  out = '';
  await showBanner(caps({ tier: 'none' }), { out: sink });
  assert.equal(out, 'CREATE-RUST-APP\nscaffold rust projects at the speed of light\n\n');
});

test('review names the project and every section, in human words', () => {
  for (const tier of (['truecolor', 'none'] as const)) {
    const { title, body } = reviewLines(caps({ tier }), ctx);
    const text = stripVTControlCharacters(`${title}
${body}`);
    assert.ok(text.includes('demo-app') && text.includes('desktop app'), 'title names project + kind');
    for (const s of ['crates', 'app', 'guardrails', 'github', 'docs', 'then']) assert.ok(text.includes(s), `missing ${s}`);
    for (const raw of ['singleInstance', 'toolchainPin', 'cargoDeny', 'changelogGen', 'issueTemplates', 'agentDocs']) {
      assert.ok(!text.includes(raw), `raw key ${raw} leaked into the review`);
    }
  }
  const lib = stripVTControlCharacters(reviewLines(caps(), { ...ctx, kind: 'lib' }).body);
  assert.ok(!/^app /m.test(lib), 'no app section for a library');
});

test('review never exceeds the terminal width', () => {
  for (const columns of [60, 80, 120]) {
    const { body } = reviewLines(caps({ columns }), ctx);
    for (const line of body.split('\n')) assert.ok(width(line) <= columns, `${columns}: "${stripVTControlCharacters(line)}"`);
  }
  for (const columns of [20, 40, 80]) {
    for (const line of bannerFrame(caps({ columns }), 3)) assert.ok(width(line) <= columns);
  }
});

test('next commands fit the kind', () => {
  const flat = (k: typeof ctx.kind, dir = 'demo') => nextCommands({ ...ctx, kind: k }, dir).map(([c]) => c);
  assert.deepEqual(flat('lib', '.'), ['cargo test', 'cargo clippy --all-targets -- -D warnings'], 'lib: test, no cd into "."');
  assert.ok(flat('gui').includes('cargo run') && flat('gui')[0] === 'cd demo');
  assert.ok(flat('workspace').includes('cargo xtask ci'), 'workspace uses xtask');
});

test('the reproduce command round-trips through the argument parser', () => {
  const custom = resolveAnswers('cli', { name: 'neon-dash' });
  custom.crates.async = 'tokio';
  custom.crates.sqlite = true;
  custom.tooling.release = false;
  custom.edition = '2021';
  custom.post.git = false;
  const cmd = reproduceCommand(custom);
  assert.ok(cmd.startsWith('npx create-rust-app neon-dash --preset cli'), cmd);
  const argv = cmd.replace(/^npx create-rust-app /, '').split(' ');
  const { overrides } = parseArgv(argv);
  const back = resolveAnswers(overrides.preset ?? null, overrides);
  assert.deepEqual(back.crates, custom.crates, 'crates survive the round trip');
  assert.deepEqual(back.tooling, custom.tooling, 'tooling survives the round trip');
  assert.equal(back.edition, '2021');
  assert.equal(back.post.git, false);
  assert.equal(reproduceCommand(resolveAnswers('cli', { name: 'x' })), 'npx create-rust-app x --preset cli -y', 'defaults stay one short line');
});

test('ASCII fallback has no non-ASCII when unicode=false', () => {
  for (const tier of /** @type {const} */ (['truecolor', 'ansi16', 'none'] as const)) {
    const c = caps({ tier, unicode: false });
    let spun = '';
    const sp = createSpinner(c, { out: { write: (/** @type {string} */ s: string) => { spun += s; } } });
    sp.start('checking ✔ things…');
    sp.stop('done', true);
    sp.start('again');
    sp.stop('failed', false);
    const out = [
      ...bannerFrame(c, 7), bullet(c, 1), section(c, 4, 'Tooling ◆'), spun,
      reviewLines(c, { ...ctx, name: 'demo' }).body,
    ].join('\n');
    assert.ok(/^[\x00-\x7f]*$/.test(out), stripVTControlCharacters(out).replace(/[\x00-\x7f]/g, ''));
  }
});

test('animated spinner redraws and restores the cursor', async () => {
  let out = '';
  const sp = createSpinner(caps({ animate: true }), { out: { write: (/** @type {string} */ s: string) => { out += s; } }, interval: 1 });
  sp.start('cargo check');
  await new Promise<void>((r) => setTimeout(r, 15));
  sp.message('still checking');
  sp.stop('cargo check passed');
  assert.ok(out.includes('\x1b[?25l'));
  assert.ok(out.endsWith('\x1b[?25h'));
  assert.ok(stripVTControlCharacters(out).includes('✔ cargo check passed'));
});
