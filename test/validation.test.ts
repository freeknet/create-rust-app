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
