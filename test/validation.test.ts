import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_NAME_LENGTH, RUST_KEYWORDS, validateBin, validateName } from '../src/context.ts';
import { parseArgv } from '../src/args.ts';

test('validateName: Rust keywords from every edition are rejected (B4)', () => {
  for (const kw of ['fn', 'async', 'type', 'match', 'mod', 'use', 'gen', 'try', 'dyn', 'await', 'yield', 'self', 'crate', 'super']) {
    assert.match(validateName(kw) ?? '', /keyword/, `${kw} is rejected as a keyword`);
  }
  for (const kw of RUST_KEYWORDS) assert.ok(validateName(kw), `${kw} rejected`);
  // Weak keywords are ordinary identifiers.
  for (const ok of ['union', 'raw', 'safe', 'fn-tool', 'my-type']) assert.equal(validateName(ok), null, `${ok} allowed`);
});

test('validateName: Cargo-reserved and Windows device names are rejected like --bin (B5)', () => {
  for (const name of ['build', 'deps', 'examples', 'incremental']) {
    assert.match(validateName(name) ?? '', /reserved by Cargo/, name);
    assert.match(validateBin(name) ?? '', /reserved by Cargo/, name);
  }
  for (const name of ['con', 'nul', 'prn', 'aux', 'com1', 'lpt9']) {
    assert.match(validateName(name) ?? '', /device name on Windows/, name);
    assert.match(validateBin(name) ?? '', /device name on Windows/, name);
  }
});

test('validateName / validateBin: at most 64 characters (B6)', () => {
  assert.equal(MAX_NAME_LENGTH, 64);
  assert.equal(validateName('a'.repeat(64)), null, '64 is fine');
  assert.match(validateName('a'.repeat(65)) ?? '', /at most 64 characters.*65/);
  assert.match(validateName('a'.repeat(260)) ?? '', /at most 64 characters/);
  assert.equal(validateBin('b'.repeat(64)), null);
  assert.match(validateBin('b'.repeat(65)) ?? '', /at most 64 characters/);
});

test('parseArgv: --name and --bin apply the shared rules', () => {
  assert.throws(() => parseArgv(['--name', 'fn']), /Invalid project name: "fn" is a Rust keyword/);
  assert.throws(() => parseArgv(['--name', 'build']), /Invalid project name: "build" is reserved by Cargo/);
  assert.throws(() => parseArgv(['--name', 'con']), /Invalid project name: .*Windows/);
  assert.throws(() => parseArgv(['--name', 'x'.repeat(260)]), /Invalid project name: Use at most 64/);
  assert.throws(() => parseArgv(['--bin', 'x'.repeat(65)]), /Invalid binary name: Use at most 64/);
  assert.throws(() => parseArgv(['--set', 'name=gen']), /keyword/);
});

test('validateRustVersions: msrv must not be newer than the toolchain, nor older than the edition (B10)', async () => {
  const { validateRustVersions } = await import('../src/context.ts');
  assert.equal(validateRustVersions('1.98', '1.99.1', '2024'), null, 'defaults pass');
  assert.equal(validateRustVersions('1.99.1', '1.99.1', '2024'), null, 'equal is fine');
  assert.equal(validateRustVersions('1.85', '1.85.0', '2024'), null, '2024 from 1.85');
  assert.equal(validateRustVersions('1.56', '1.99.1', '2021'), null, '2021 from 1.56');
  assert.match(validateRustVersions('1.100', '1.99.1', '2024') ?? '', /msrv 1\.100 is newer than toolchain 1\.99\.1/, 'numeric, not string, compare');
  assert.match(validateRustVersions('9.0', '1.0.0', '2021') ?? '', /newer than toolchain/);
  assert.match(validateRustVersions('1.99.2', '1.99.1', '2024') ?? '', /newer than toolchain/, 'patch level counts');
  assert.match(validateRustVersions('1.84', '1.99.1', '2024') ?? '', /edition 2024 needs Rust 1\.85/);
  assert.match(validateRustVersions('1.55', '1.99.1', '2021') ?? '', /edition 2021 needs Rust 1\.56/);
  assert.match(validateRustVersions('x', '1.99.1', '2024') ?? '', /not a Rust version/);
});

test('CLI: contradictory Rust versions exit 2 from flags, --set and preset defaults (B10)', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const bin = fileURLToPath(new URL('../bin/create-rust-app.ts', import.meta.url));
  const run = (args: string[]) => spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const args of [
    ['--msrv', '1.100', '--toolchain', '1.99.1'],
    ['--set', 'msrv=1.100'],
    ['--toolchain', '1.97.0'],
    ['--msrv', '1.80'],
    ['--preset', 'lib', '--msrv', '1.84'],
  ]) {
    const r = run([...args, '--dry-run', '-y']);
    assert.equal(r.status, 2, `${args.join(' ')} exits 2; stderr ${r.stderr}`);
    assert.match(r.stderr, /newer than toolchain|needs Rust 1\.85/);
  }
  const ok = run(['--msrv', '1.80', '--edition', '2021', '--dry-run', '-y', '--quiet']);
  assert.equal(ok.status, 0, ok.stderr);
});
