/** writePlan cleans up after a failed write; --force reports what it overwrote. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existingFiles, writePlan } from '../src/engine/write.ts';
import { overwriteNotice } from '../src/cli.ts';
import type { PlanEntry } from '../src/types.ts';

const BIN = fileURLToPath(new URL('../bin/create-rust-app.ts', import.meta.url));

function work(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'cra-write-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

test('a failed write removes the target folder this run created, parents included (B6)', async (t) => {
  const base = work(t);
  const target = join(base, 'parent', 'proj');
  // 'a' is a file, so 'a/b' cannot be written: a deterministic failure midway.
  const plan: PlanEntry[] = [{ dest: 'ok.txt', content: 'x' }, { dest: 'a', content: 'x' }, { dest: 'a/b', content: 'x' }];
  await assert.rejects(writePlan(plan, target), (e: Error) => {
    assert.match(e.message, /^Writing a\/b failed: /);
    assert.match(e.message, /Removed .*parent, which this run created\.$/);
    return true;
  });
  assert.deepEqual(readdirSync(base), [], 'nothing is left behind');
});

test('a failed write into an existing folder removes only what this run added (B6)', async (t) => {
  const target = work(t);
  writeFileSync(join(target, 'keep.txt'), 'mine');
  mkdirSync(join(target, 'src'));
  writeFileSync(join(target, 'src', 'user.rs'), 'mine');
  const plan: PlanEntry[] = [
    { dest: 'new.txt', content: 'x' },
    { dest: 'src/gen.rs', content: 'x' },
    { dest: 'deep/dir/f.txt', content: 'x' },
    { dest: 'keep.txt', content: 'replaced' },
    { dest: 'new.txt/bad', content: 'x' },
  ];
  await assert.rejects(writePlan(plan, target, { force: true }), (e: Error) => {
    assert.match(e.message, /^Writing new\.txt\/bad failed: /);
    assert.match(e.message, /Removed the 3 files this run created in .*; files that were there before are kept, but 1 existing file had already been overwritten\.$/);
    return true;
  });
  assert.deepEqual(readdirSync(target).sort(), ['keep.txt', 'src'], 'new.txt and deep/ are gone');
  assert.deepEqual(readdirSync(join(target, 'src')), ['user.rs'], 'the user\'s file stays, gen.rs is gone');
  assert.equal(readFileSync(join(target, 'keep.txt'), 'utf8'), 'replaced\n', 'an overwritten file is reported, not restored');
});

test('existingFiles lists what --force would overwrite; overwriteNotice says how many and which (F18)', (t) => {
  const target = work(t);
  writeFileSync(join(target, 'README.md'), 'mine');
  mkdirSync(join(target, 'src'));
  const plan: PlanEntry[] = [{ dest: 'README.md', content: '' }, { dest: 'src', content: '' }, { dest: 'Cargo.toml', content: '' }];
  assert.deepEqual(existingFiles(plan, target), ['README.md'], 'files only');
  assert.equal(overwriteNotice(['a', 'b']), '--force overwrote 2 existing files: a, b');
  assert.equal(overwriteNotice(['a']), '--force overwrote 1 existing file: a');
  assert.equal(overwriteNotice(['a', 'b', 'c'], 2), '--force overwrote 3 existing files: a, b, and 1 more');
});

test('CLI: --force lists overwritten files on stderr unless --quiet (F18)', (t) => {
  const base = work(t);
  const run = (dir: string, extra: string[]) => spawnSync(process.execPath, [BIN, dir, '--preset', 'minimal', '-y', '--no-git', '--no-fetch', '--force', ...extra], {
    encoding: 'utf8', cwd: base, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (const [dir, extra] of [['loud', []], ['json', ['--json']], ['hush', ['--quiet']]] as const) {
    mkdirSync(join(base, dir));
    writeFileSync(join(base, dir, 'README.md'), 'mine');
    writeFileSync(join(base, dir, 'Cargo.toml'), 'mine');
    writeFileSync(join(base, dir, 'notes.txt'), 'mine');
    const r = run(dir, [...extra]);
    assert.equal(r.status, 0, r.stderr);
    if (dir === 'hush') assert.equal(r.stderr, '', '--quiet hides it');
    else assert.match(r.stderr, /note: --force overwrote 2 existing files: (Cargo\.toml, README\.md|README\.md, Cargo\.toml)\n/);
    if (dir === 'json') JSON.parse(r.stdout);
    assert.ok(existsSync(join(base, dir, 'notes.txt')));
  }
  const fresh = run('fresh', []);
  assert.doesNotMatch(fresh.stderr, /overwrote/, 'nothing to report in a new folder');
});
