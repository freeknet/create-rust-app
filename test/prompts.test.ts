/**
 * Interactive prompt behaviour that doesn't need a terminal: prompts are driven in-process through
 * streams, and the pure layout / validation helpers are called directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { startOver, writesHint } from '../src/prompts.ts';
import { stripVTControlCharacters } from 'node:util';
import { isCancel } from '@clack/core';
import { BACK, pick, pickMany } from '../src/ui/choose.ts';
import { tasks, text } from '../src/ui/rail.ts';
import type { Caps } from '../src/types.ts';

const caps: Caps = { tier: 'truecolor', glyphs: 'full', unicode: true, tty: true, columns: 100, animate: false };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness() {
  const input = new PassThrough();
  let out = '';
  const output = new Writable({ write(chunk, _enc, cb) { out += chunk.toString(); cb(); } });
  return { io: { input, output }, input, read: () => out };
}

type Start = (io: ReturnType<typeof harness>['io']) => Promise<unknown>;

/** Start a prompt, press `key` once it has rendered, and return what it resolved to plus its output. */
async function press(start: Start, key: string) {
  const h = harness();
  const done = start(h.io);
  await sleep(30);
  h.input.write(key);
  const value = await done;
  return { value, out: stripVTControlCharacters(h.read()) };
}

const options = [{ value: 'a', label: 'Alpha', hint: 'first' }, { value: 'b', label: 'Beta', hint: 'second' }];
const prompts: Record<string, (back: boolean) => Start> = {
  pick: (back: boolean) => (io: ReturnType<typeof harness>['io']) => pick(caps, { message: 'Pick', options, back, io }),
  pickMany: (back: boolean) => (io: ReturnType<typeof harness>['io']) => pickMany(caps, { message: 'Many', options, back, io }),
  text: (back: boolean) => (io: ReturnType<typeof harness>['io']) => text(caps, { message: 'Name', initialValue: 'x', back, io }),
};

for (const [name, make] of Object.entries(prompts)) {
  test(`${name}: Esc on a back prompt resolves to BACK and says "esc back"`, async () => {
    const r = await press(make(true), '\x1b');
    assert.equal(r.value, BACK);
    assert.match(r.out, /esc back/);
    assert.doesNotMatch(r.out, /esc cancel/);
  });
  test(`${name}: Ctrl-C on a back prompt still cancels`, async () => {
    const r = await press(make(true), '\x03');
    assert.notEqual(r.value, BACK);
    assert.ok(isCancel(r.value));
  });
  test(`${name}: Esc outside Customize still cancels and says "esc cancel"`, async () => {
    const r = await press(make(false), '\x1b');
    assert.notEqual(r.value, BACK);
    assert.ok(isCancel(r.value));
    assert.match(r.out, /esc cancel/);
  });
}

test('"Start over from a preset" wins over --kind and --preset, keeps the other flags (B12)', () => {
  const lib = startOver({ kind: 'lib', name: 'fl-lib' }, 'rustaman', 'fl-lib');
  assert.equal(lib.kind, 'gui');
  assert.equal(lib.preset, 'rustaman');
  assert.equal(lib.name, 'fl-lib');
  const flagged = startOver({ preset: 'cli', kind: 'cli', edition: '2021', license: 'Apache-2.0' }, 'lib', 'renamed');
  assert.equal(flagged.kind, 'lib');
  assert.equal(flagged.preset, 'lib');
  assert.equal(flagged.name, 'renamed');
  assert.equal(flagged.edition, '2021', 'flags other than --kind / --preset still apply');
  assert.equal(flagged.license, 'Apache-2.0');
});

test('the review hint names the folder the run writes, including a positional dir (B9)', () => {
  const cwd = resolve('/work/projects');
  assert.equal(writesHint(undefined, 'hp-cli', cwd), 'writes ./hp-cli');
  assert.equal(writesHint('fl-dir', 'fl-renamed', cwd), 'writes ./fl-dir');
  assert.equal(writesHint('.', 'here', cwd), 'writes .');
  assert.equal(writesHint('../elsewhere', 'x', cwd), `writes ${resolve('/work/elsewhere')}`);
});

/** Run a script against src/ui/rail.ts in a child process (real signals, real exit codes, own stdout). */
function child(body: string) {
  const rail = new URL('../src/ui/rail.ts', import.meta.url).href;
  const script = `import { tasks } from ${JSON.stringify(rail)};\nconst caps = ${JSON.stringify({ ...caps, tty: true })};\n${body}`;
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 20000 });
}

test('Ctrl-C during the run steps restores the cursor, says what was left and exits 130 (B11)', () => {
  const r = child(`
    setTimeout(() => process.kill(process.pid, 'SIGINT'), 100);
    // A step that never finishes and keeps the process alive, like cargo fetch would.
    await tasks(caps, [{ title: 'cargo fetch', run: () => new Promise(() => { setInterval(() => {}, 1000); }) }],
      { interrupted: 'Interrupted. The partly created folder demo was left in place.' });`);
  assert.equal(r.status, 130);
  assert.ok(r.stdout.lastIndexOf('\x1b[?25h') > r.stdout.lastIndexOf('\x1b[?25l'), 'cursor shown again');
  const plain = stripVTControlCharacters(r.stdout);
  assert.match(plain, /cargo fetch \(interrupted\)/);
  assert.match(plain, /The partly created folder demo was left in place\./);
});

test('the run steps remove their SIGINT handler when they finish', () => {
  const r = child(`
    const before = process.listenerCount('SIGINT');
    await tasks(caps, [{ title: 'step', run: async () => ({ ok: true, message: 'done' }) }]);
    console.log('listeners', before, process.listenerCount('SIGINT'));`);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /listeners 0 0/);
});
