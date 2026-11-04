import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgv, renderHelp } from '../src/args.ts';

test('parseArgv: positional dir and answer flags', () => {
  const { dir, flags, overrides } = parseArgv(['out/x', '--name', 'my-tool', '--preset', 'cli', '--kind', 'tui',
    '--gui', 'winit-glow', '--edition', '2021', '--license', 'Apache-2.0', '-y', '--dry-run']);
  assert.equal(dir, 'out/x', 'dir is the positional');
  assert.equal(flags.yes, true, '-y is --yes');
  assert.equal(flags['dry-run'], true, 'dry-run flag');
  assert.deepEqual(overrides, {
    name: 'my-tool', preset: 'cli', kind: 'tui', guiStack: 'winit-glow', edition: '2021', license: 'Apache-2.0',
  });
});

test('parseArgv: post flags map to post answers', () => {
  const { overrides } = parseArgv(['--no-git', '--no-cargo-check', '--open', 'cursor']);
  assert.deepEqual(overrides.post, { git: false, cargoCheck: false, open: 'cursor' });
});

test('parseArgv: --with / --without map short names', () => {
  const { overrides } = parseArgv(['--with', 'tray,palette', '--with', 'tokio', '--without', 'ci,cargo-deny', '--with', 'sqlite']);
  assert.ok(overrides.features && overrides.crates && overrides.tooling);
  assert.equal(overrides.features.tray, true, 'tray on');
  assert.equal(overrides.features.commandPalette, true, 'palette alias');
  assert.equal(overrides.crates.async, 'tokio', 'tokio sets async');
  assert.equal(overrides.crates.sqlite, true, 'crate bool');
  assert.equal(overrides.tooling.ci, false, 'ci off');
  assert.equal(overrides.tooling.cargoDeny, false, 'cargo-deny alias off');
});

test('parseArgv: --set overrides leaves with typed values; last wins', () => {
  const { overrides } = parseArgv(['--set', 'features.tray=true', '--set', 'tagline=Hi there', '--set', 'post.git=false',
    '--with', 'tray', '--set', 'features.tray=false']);
  assert.ok(overrides.features && overrides.post);
  assert.equal(overrides.features.tray, false, 'later --set wins over --with');
  assert.equal(overrides.tagline, 'Hi there', 'string value');
  assert.equal(overrides.post.git, false, 'bool value');
});

test('parseArgv: --preset custom means no preset', () => {
  assert.equal(parseArgv(['--preset', 'custom']).overrides.preset, null, 'custom → null');
});

test('parseArgv: errors', () => {
  assert.throws(() => parseArgv(['--presat', 'cli']), /Unknown flag --presat\. Did you mean --preset\?/);
  assert.throws(() => parseArgv(['--with', 'trya']), /Did you mean tray\?/);
  assert.throws(() => parseArgv(['--set', 'features.nope=true']), /Unknown answer key/);
  assert.throws(() => parseArgv(['--set', '__proto__.x=1']), /Unknown answer key/);
  assert.throws(() => parseArgv(['--set', 'features=true']), /leaf/);
  assert.throws(() => parseArgv(['--set', 'features.tray=yes']), /must be boolean/);
  assert.throws(() => parseArgv(['--kind', 'app']), /Invalid kind/);
  assert.throws(() => parseArgv(['--name', 'Bad_Name']), /Invalid project name/);
  assert.throws(() => parseArgv(['a', 'b']), /at most one/);
});

test('renderHelp: plain text lists flags and short names', async () => {
  const help = await renderHelp({ tier: 'none', unicode: false, tty: false, columns: 80, animate: false });
  for (const s of ['--preset', '--with', '--set', '--no-fetch', '--cargo-check', 'commandPalette', 'Command palette', 'Ctrl+K']) {
    assert.ok(help.includes(s), `help mentions ${s}`);
  }
});
