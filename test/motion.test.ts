/**
 * Animated prompts must not flicker. @clack/core redraws a frame by diffing it with the previous one:
 * exactly one changed line → it rewrites that line; more than one → `erase.down()` (ESC[J) from the
 * first changed line and a full repaint, which flashes. So while a prompt sits idle, each animation
 * tick may change at most one line, and every tick must be wrapped in synchronized output.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough, Writable } from 'node:stream';
import { pick, pickMany } from '../src/ui/choose.ts';
import { text } from '../src/ui/rail.ts';
import { TICK_MS } from '../src/ui/motion.ts';
import type { Caps } from '../src/types.ts';

const caps: Caps = { tier: 'truecolor', glyphs: 'full', unicode: true, tty: true, columns: 100, animate: true };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function harness() {
  const input = new PassThrough();
  let out = '';
  const output = new Writable({ write(chunk, _enc, cb) { out += chunk.toString(); cb(); } });
  return { io: { input, output }, input, read: () => out };
}

async function idleRedraws(start: (io: ReturnType<typeof harness>['io']) => Promise<unknown>) {
  const h = harness();
  const done = start(h.io);
  await sleep(60); // initial render
  const before = h.read().length;
  await sleep(TICK_MS * 6); // ~6 ticks with nobody typing
  const idle = h.read().slice(before);
  h.input.write('\r'); // submit, so the prompt resolves and stops its ticker
  await done;
  return {
    idle,
    eraseDown: idle.split('\x1b[J').length - 1,
    syncOpen: idle.split('\x1b[?2026h').length - 1,
    syncClose: idle.split('\x1b[?2026l').length - 1,
  };
}

for (const [name, start] of [
  ['text prompt', (io: ReturnType<typeof harness>['io']) => text(caps, { message: 'Project name', placeholder: 'my-app', defaultValue: 'my-app', io })],
  ['select', (io: ReturnType<typeof harness>['io']) => pick(caps, { message: 'What are you building?', options: [{ value: 'a', label: 'Desktop app', hint: 'egui' }, { value: 'b', label: 'Library', hint: 'lib' }], io })],
  ['multiselect', (io: ReturnType<typeof harness>['io']) => pickMany(caps, { message: 'Features', options: [{ value: 'a', label: 'Themes', hint: 'x', group: 'look' }, { value: 'b', label: 'Tray', hint: 'y', group: 'behaviour' }], io })],
] as const) {
  test(`${name}: idle animation repaints one line at a time, synchronized`, async () => {
    const r = await idleRedraws(start);
    assert.ok(r.syncOpen >= 3, `expected the ticker to run (got ${r.syncOpen} frames)`);
    assert.equal(r.syncOpen, r.syncClose, 'every synchronized frame is closed');
    assert.equal(r.eraseDown, 0, 'an idle tick changed more than one line, forcing a full repaint (flicker)');
  });
}

test('no ticker when not animating (pipes, CI, NO_COLOR)', async () => {
  const h = harness();
  const done = pick({ ...caps, animate: false }, { message: 'x', options: [{ value: 1, label: 'one' }], io: h.io });
  await sleep(60);
  const before = h.read().length;
  await sleep(TICK_MS * 4);
  assert.equal(h.read().length, before, 'nothing is written while idle');
  h.input.write('\r');
  await done;
});
