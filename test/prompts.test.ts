/**
 * Interactive prompt behaviour that doesn't need a terminal: prompts are driven in-process through
 * streams, and the pure layout / validation helpers are called directly.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { stripVTControlCharacters } from 'node:util';
import { isCancel } from '@clack/core';
import { BACK, pick, pickMany } from '../src/ui/choose.ts';
import { text } from '../src/ui/rail.ts';
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
