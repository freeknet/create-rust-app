import { test } from 'node:test';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { cargoEnv, gateCommands, parseArgs, parseSet } from '../scripts/scaffold-check.ts';

test('scaffold-check --set splits on the first = only', () => {
  assert.deepEqual(parseSet('tagline=a=b'), [['tagline'], 'a=b']);
  assert.deepEqual(parseSet('features.tray=true'), [['features', 'tray'], true]);
  assert.deepEqual(parseSet('crates.serde=false'), [['crates', 'serde'], false]);
  assert.deepEqual(parseSet('tagline='), [['tagline'], '']);
  assert.throws(() => parseSet('=x'), /requires a key/);
  const { overrides } = parseArgs(['cli', '--set', 'tagline=x = y', '--set', 'features.tray=true']);
  assert.equal(overrides.tagline, 'x = y');
  assert.deepEqual(overrides.features, { tray: true });
});

test('scaffold-check parses preset, --name, --out and --gate', () => {
  const a = parseArgs(['--gate', 'fmt', 'rustaman', '--name', 'x', '--out', '/tmp/o']);
  assert.equal(a.preset, 'rustaman');
  assert.equal(a.gate, 'fmt');
  assert.equal(a.out, '/tmp/o');
  assert.equal(a.overrides.name, 'x');
  const d = parseArgs(['strobe']);
  assert.equal(d.gate, 'full');
  assert.equal(d.overrides.name, 'demo-strobe');
  // --name wins over --set name=…, whatever the order.
  assert.equal(parseArgs(['cli', '--name', 'a', '--set', 'name=b']).overrides.name, 'a');
  assert.throws(() => parseArgs([]), /usage/);
  assert.throws(() => parseArgs(['cli', '--gate', 'bogus']), /unknown gate/);
  assert.throws(() => parseArgs(['cli', '--name']), /needs a value/);
  assert.throws(() => parseArgs(['cli', '--frobnicate']), /unknown option/);
});

test('scaffold-check gates: doc is opt-in, fmt builds nothing', () => {
  assert.deepEqual(gateCommands('fmt'), [['fmt', '--all', '--', '--check']]);
  assert.deepEqual(gateCommands('doc'), [['doc', '--no-deps']]);
  assert.ok(!gateCommands('full').some((c) => c[0] === 'doc'));
  assert.deepEqual(gateCommands('full').map((c) => c[0]), ['fmt', 'clippy', 'test']);
  assert.deepEqual(gateCommands('none'), []);
});

test('scaffold-check keeps an existing CARGO_TARGET_DIR', () => {
  assert.equal(cargoEnv({ CARGO_TARGET_DIR: '/shared/target' }, '/repo', 'full').CARGO_TARGET_DIR, '/shared/target');
  // The platform's own separators: cargo gets a native path (`\repo\.scratch\target` on Windows).
  assert.equal(cargoEnv({}, '/repo', 'full').CARGO_TARGET_DIR, join('/repo', '.scratch', 'target'));
  assert.equal(cargoEnv({}, '/repo', 'doc').RUSTDOCFLAGS, '-D warnings');
  assert.equal(cargoEnv({ RUSTDOCFLAGS: '--cfg x' }, '/repo', 'doc').RUSTDOCFLAGS, '--cfg x -D warnings');
  assert.equal(cargoEnv({}, '/repo', 'full').RUSTDOCFLAGS, undefined);
});
