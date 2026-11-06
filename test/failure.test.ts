/**
 * The CLI must never touch a folder it can't scaffold into. An earlier version carried on after a
 * failed write: it ran `git init` and committed the user's own files in the existing folder, printed
 * the success screen and exited 0.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as pty from '@lydell/node-pty';
import { targetProblem } from '../src/engine/write.ts';
import { tasks } from '../src/ui/rail.ts';
import type { Caps } from '../src/types.ts';

const BIN = resolve(import.meta.dirname, '..', 'bin', 'create-rust-app.ts');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A temp folder holding `existing/precious.txt`, the user's work that must stay untouched. */
function fixture(t: { after(fn: () => void): void }) {
  const work = mkdtempSync(join(tmpdir(), 'cra-failure-'));
  t.after(() => rmSync(work, { recursive: true, force: true, maxRetries: 3 }));
  const existing = join(work, 'existing');
  mkdirSync(existing);
  writeFileSync(join(existing, 'precious.txt'), 'mine');
  return { work, existing };
}

function assertUntouched(existing: string) {
  assert.deepEqual(readdirSync(existing), ['precious.txt'], 'nothing was added to the folder, including .git');
  assert.equal(readFileSync(join(existing, 'precious.txt'), 'utf8'), 'mine');
}

/** Run the real CLI on a TTY; resolves once it exits. Returns its exit code and plain-text output. */
async function runTty(args: string[], cwd: string, steps: { wait: number; keys?: string }[] = []) {
  const proc = pty.spawn(process.execPath, [BIN, ...args], {
    name: 'xterm-256color', cols: 100, rows: 40, cwd,
    env: { ...process.env, CI: '', NO_COLOR: '1' } as Record<string, string>,
  });
  let out = '';
  let code: number | undefined;
  proc.onData((d) => { out += d; });
  proc.onExit((e) => { code = e.exitCode; });
  for (const s of steps) {
    await sleep(s.wait);
    if (s.keys && code === undefined) proc.write(s.keys);
  }
  const deadline = Date.now() + 20000;
  while (code === undefined && Date.now() < deadline) await sleep(50);
  if (code === undefined) proc.kill();
  // eslint-disable-next-line no-control-regex
  return { code, out: out.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '') };
}

test('targetProblem: missing and empty folders are fine, occupied ones are not', (t) => {
  const { work, existing } = fixture(t);
  assert.equal(targetProblem(join(work, 'nope')), null);
  const empty = join(work, 'empty');
  mkdirSync(join(empty, '.git'), { recursive: true });
  assert.equal(targetProblem(empty), null, 'a lone .git does not count');
  assert.match(targetProblem(existing) ?? '', /not empty/);
  assert.match(targetProblem(join(existing, 'precious.txt')) ?? '', /isn't a directory/);
});

test('a failed required task stops everything after it', async () => {
  const caps: Caps = { tier: 'none', glyphs: 'ascii', unicode: false, tty: false, columns: 80, animate: false };
  const ran: string[] = [];
  const ok = await tasks(caps, [
    { title: 'write', required: true, run: async () => { ran.push('write'); throw new Error('disk full'); } },
    { title: 'git', run: async () => { ran.push('git'); return { ok: true, message: 'git' }; } },
  ]);
  assert.equal(ok, false);
  assert.deepEqual(ran, ['write'], 'git must not run after a failed write');
});

test('a failed optional task does not stop the run', async () => {
  const caps: Caps = { tier: 'none', glyphs: 'ascii', unicode: false, tty: false, columns: 80, animate: false };
  const ran: string[] = [];
  const ok = await tasks(caps, [
    { title: 'fetch', run: async () => { ran.push('fetch'); return { ok: false, message: 'offline' }; } },
    { title: 'check', run: async () => { ran.push('check'); return { ok: true, message: 'ok' }; } },
  ]);
  assert.equal(ok, true);
  assert.deepEqual(ran, ['fetch', 'check']);
});

test('--yes into an occupied folder fails and leaves it untouched', (t) => {
  const { work, existing } = fixture(t);
  const r = spawnSync(process.execPath, [BIN, existing, '--preset', 'cli', '--yes'], { cwd: work, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not empty/);
  assertUntouched(existing);
});

test('interactive: an occupied folder is refused before any question', async (t) => {
  const { work, existing } = fixture(t);
  const { code, out } = await runTty([existing, '--preset', 'cli', '--no-fetch'], work);
  assert.equal(code, 1);
  assert.match(out, /not empty/);
  assert.ok(!out.includes('Ready?'), 'no prompts were shown');
  assert.ok(!out.includes('build something luminous'), 'no success screen');
  assertUntouched(existing);
});

test('interactive: the name prompt refuses an occupied folder, and Ctrl-C leaves it untouched', async (t) => {
  const { work, existing } = fixture(t);
  const { code, out } = await runTty([], work, [
    { wait: 1800, keys: 'existing' },
    { wait: 300, keys: '\r' },
    { wait: 600, keys: '\x03' },
  ]);
  assert.match(out, /not empty/, 'the prompt explains why');
  assert.ok(!out.includes('What are you building?'), 'it did not move on');
  assert.notEqual(code, 0);
  assert.ok(existsSync(existing));
  assertUntouched(existing);
});
