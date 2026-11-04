// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileTree } from '../src/cli.js';

const BIN = fileURLToPath(new URL('../bin/create-rust-app.js', import.meta.url));
/** @param {string[]} args */
const run = (args) => spawnSync(process.execPath, [BIN, ...args], {
  encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});

test('e2e-lite: --preset cli --yes writes a project', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cra-'));
  const dir = join(base, 'demo-cli');
  try {
    const r = run([dir, '--preset', 'cli', '--yes', '--no-git', '--no-cargo-check', '--quiet']);
    assert.equal(r.status, 0, `exit 0, stderr: ${r.stderr}`);
    assert.ok(existsSync(join(dir, 'Cargo.toml')), 'Cargo.toml written');
    assert.ok(!existsSync(join(dir, '.git')), 'no git repo with --no-git');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});

test('--json --dry-run prints answers and files only', () => {
  const r = run(['--preset', 'lib', '--name', 'foo-lib', '--json', '--dry-run']);
  assert.equal(r.status, 0, `exit 0, stderr: ${r.stderr}`);
  const out = JSON.parse(r.stdout);
  assert.equal(out.answers.name, 'foo-lib', 'name in answers');
  assert.equal(out.answers.kind, 'lib', 'preset applied');
  assert.ok(out.files.includes('Cargo.toml'), 'files include Cargo.toml');
});

test('unknown flag exits 2 with a suggestion', () => {
  const r = run(['--dyr-run']);
  assert.equal(r.status, 2, 'exit 2');
  assert.match(r.stderr, /Did you mean --dry-run\?/);
});

test('--help and --version', () => {
  const h = run(['--help']);
  assert.equal(h.status, 0, 'help exits 0');
  assert.match(h.stdout, /--preset/);
  const v = run(['--version']);
  assert.match(v.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test('fileTree renders nested dests', () => {
  const tree = fileTree(['Cargo.toml', 'src/main.rs', 'src/lib.rs', '.github/workflows/ci.yml'], 2, false);
  assert.equal(tree, ['|-- .github/', '|   `-- workflows/', '|-- src/', '|   |-- lib.rs', '|   `-- main.rs', '`-- Cargo.toml'].join('\n'));
});
