/** One-line stderr notices for choices the CLI makes on the user's behalf. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = fileURLToPath(new URL('../bin/create-rust-app.ts', import.meta.url));
const run = (args: string[], cwd?: string) => spawnSync(process.execPath, [BIN, ...args], {
  encoding: 'utf8', env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'], ...(cwd ? { cwd } : {}),
});

test('a positional folder that is not a crate name says which name is used (B7)', (t) => {
  const work = mkdtempSync(join(tmpdir(), 'cra-notice-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const r = run(['MyDir', '--preset', 'minimal', '--dry-run', '--json'], work);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).answers.name, 'my-app', 'the documented default still applies; stdout is pure JSON');
  assert.match(r.stderr, /note: the folder name "MyDir" can't be a crate name, so the crate is named "my-app" \(set it with --name\)\./);
  assert.equal(r.stderr.trim().split('\n').length, 1, 'one line');

  const quiet = run(['MyDir', '--preset', 'minimal', '--dry-run', '--quiet'], work);
  assert.equal(quiet.status, 0, quiet.stderr);
  assert.equal(quiet.stderr, '', '--quiet suppresses it');

  const named = run(['MyDir', '--name', 'my-dir', '--preset', 'minimal', '--dry-run', '--json'], work);
  assert.equal(named.stderr, '', 'no notice once --name is given');
  const valid = run(['good-dir', '--preset', 'minimal', '--dry-run', '--json'], work);
  assert.equal(valid.stderr, '', 'no notice when the folder name is the crate name');
});
