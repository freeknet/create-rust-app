/** The git post-step: a fresh, empty repository gets the first commit; another repo is left alone. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoState } from '../src/post/git.ts';

const BIN = fileURLToPath(new URL('../bin/create-rust-app.ts', import.meta.url));
const ID = ['-c', 'user.name=Test', '-c', 'user.email=test@example.com'];
const git = (args: string[], cwd: string) => spawnSync('git', args, { cwd, encoding: 'utf8' });
const run = (args: string[], cwd: string) => spawnSync(process.execPath, [BIN, ...args], {
  encoding: 'utf8', cwd, env: { ...process.env, NO_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'],
});
const files = (cwd: string) => JSON.parse(run(['.', '--name', 'fresh-repo', '--preset', 'minimal', '--dry-run', '--json'], cwd).stdout).files as string[];

function work(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), 'cra-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true, maxRetries: 3 }));
  return dir;
}

test('a folder holding only a fresh git init gets the first commit of the generated files (B19)', (t) => {
  const d = join(work(t), 'fresh-repo');
  mkdirSync(d);
  git(['init', '-q', '-b', 'trunk'], d);
  assert.deepEqual(repoState(d), { action: 'commit' });
  const r = run(['.', '--preset', 'minimal', '-y', '--no-fetch'], d);
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /git skipped/);
  assert.match(r.stdout, /first commit/);
  assert.equal(git(['rev-list', '--count', 'HEAD'], d).stdout.trim(), '1', 'one commit');
  assert.equal(git(['symbolic-ref', '--short', 'HEAD'], d).stdout.trim(), 'trunk', 'the repo keeps its branch');
  assert.deepEqual(git(['ls-files'], d).stdout.trim().split('\n').sort(), files(d).sort(), 'exactly the generated files');
  assert.equal(git(['status', '--porcelain'], d).stdout, '', 'clean tree');
});

test('with --force, only generated files are committed into the fresh repo; the user\'s stay untracked', (t) => {
  const d = join(work(t), 'fresh-repo');
  mkdirSync(d);
  git(['init', '-q'], d);
  writeFileSync(join(d, 'notes.txt'), 'mine');
  const r = run(['.', '--preset', 'minimal', '-y', '--no-fetch', '--force', '--quiet'], d);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!git(['ls-files'], d).stdout.split('\n').includes('notes.txt'), 'notes.txt is not committed');
  assert.equal(git(['status', '--porcelain'], d).stdout.trim(), '?? notes.txt');
});

test('inside another repository git is skipped and the summary does not promise a commit', (t) => {
  const parent = work(t);
  git(['init', '-q'], parent);
  writeFileSync(join(parent, 'README'), 'x');
  git(['add', 'README'], parent);
  git([...ID, 'commit', '-q', '-m', 'init'], parent);
  const r = run(['child', '--preset', 'minimal', '-y', '--no-fetch'], parent);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /git skipped: already inside a git repository/);
  assert.doesNotMatch(r.stdout, /git init \+ first commit/, 'the finished summary is truthful');
  assert.equal(git(['rev-list', '--count', 'HEAD'], parent).stdout.trim(), '1', 'parent repo untouched');
  assert.equal(repoState(join(parent, 'child')).action, 'skip');
  // A fresh repo nested in another one is still its own root: it gets the commit.
  const nested = join(parent, 'nested');
  mkdirSync(nested);
  git(['init', '-q'], nested);
  assert.deepEqual(repoState(nested), { action: 'commit' });
});
