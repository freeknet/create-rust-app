/** The recreate command carries every answer that changes the output, and names the real folder. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { parseArgv } from '../src/args.ts';
import { resolveAnswers } from '../src/presets.ts';
import { effectiveAnswers, reportedAnswers } from '../src/context.ts';
import { RUN_COMMAND, reproduceCommand, shownTarget } from '../src/reproduce.ts';
import { nameFromFolder } from '../src/cli.ts';
import type { Answers, PartialAnswers } from '../src/types.ts';

/** POSIX-shell word splitting for what reproduceCommand emits: bare words and "…" with \ escapes. */
function shellWords(cmd: string): string[] {
  const out: string[] = [];
  let word: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i] ?? '';
    if (c === ' ') { if (word !== null) out.push(word); word = null; continue; }
    word ??= '';
    if (c !== '"') { word += c; continue; }
    for (i++; i < cmd.length && cmd[i] !== '"'; i++) word += cmd[i] === '\\' ? cmd[++i] ?? '' : cmd[i];
  }
  if (word !== null) out.push(word);
  return out;
}

/** Run the printed command back through the CLI's own steps: parseArgv, positional name, resolveAnswers. */
function replay(cmd: string): Answers {
  assert.ok(cmd.startsWith(`${RUN_COMMAND} `), cmd);
  const { dir, overrides } = parseArgv(shellWords(cmd.slice(RUN_COMMAND.length + 1)));
  if (dir && overrides.name === undefined) {
    const fromFolder = nameFromFolder(dir);
    if (fromFolder) overrides.name = fromFolder;
  }
  return resolveAnswers(overrides.preset ?? null, overrides);
}

const SETS: [string | null, PartialAnswers][] = [
  ['rustaman', { name: 'jane-app', accent: '#ff9f6e', author: 'Jane Q', github: 'janeq', features: { tray: true } }],
  ['strobe', { name: 'ws', displayName: 'Work Space', email: 'jq@example.com', themeBase: 'graphite', guiStack: 'eframe' }],
  ['cli', { name: 'neon', tagline: 'Says "hi" for $5 `now` \\ ok', bin: 'nd', crates: { async: 'tokio', sqlite: true }, features: { subcommands: true } }],
  ['cli', { name: 'quiet-one', tagline: '', post: { git: false, fetch: false, cargoCheck: true, open: 'code' } }],
  ['tui', { name: 'tv', edition: '2021', msrv: '1.80', toolchain: '1.90.0', license: 'Apache-2.0', features: { tray: true } }],
  ['lib', { name: 'dur', bin: 'ignored', crates: { thiserror: false, serde: false }, tooling: { release: true, ci: false } }],
  ['minimal', { name: 'mini', guiStack: 'winit-glow', crates: { clap: true }, features: { subcommands: true } }],
  [null, { name: 'custom-gui', kind: 'gui', guiStack: 'winit-glow', author: '', github: '', accent: '#123abc' }],
  ['rustaman', { name: 'as-cli', kind: 'cli', crates: { logging: 'tracing', http: 'ureq' } }],
];

test('round trip: the recreate command reproduces the effective answers (B8)', () => {
  for (const [preset, over] of SETS) {
    const raw = resolveAnswers(preset, over);
    for (const dir of [undefined, raw.name, 'some/other-folder', 'Not A Crate', '.']) {
      const cmd = reproduceCommand(raw, dir);
      const back = replay(cmd);
      assert.deepEqual(reportedAnswers(back), reportedAnswers(raw), `${preset}/${raw.name} in ${dir}: ${cmd}`);
      if (raw.kind === 'gui' || raw.kind === 'workspace') assert.deepEqual(effectiveAnswers(back), effectiveAnswers(raw), cmd);
    }
  }
});

test('the recreate command carries accent, author, GitHub handle, display name and email (B8)', () => {
  const raw = resolveAnswers('rustaman', { name: 'jane-app', accent: '#ff9f6e', author: 'Jane Q', github: 'janeq', displayName: 'Jane', email: 'j@q.dev' });
  const cmd = reproduceCommand(raw);
  for (const part of ['--accent "#ff9f6e"', '--author "Jane Q"', '--github janeq', '--set displayName=Jane', '--set email=j@q.dev']) {
    assert.ok(cmd.includes(part), `${part} in ${cmd}`);
  }
  assert.equal(reproduceCommand(resolveAnswers('rustaman', { name: 'x' })), `${RUN_COMMAND} x --preset rustaman -y`, 'defaults add nothing');
});

test('the recreate command names the real folder, and --name when it differs (B9)', () => {
  const raw = resolveAnswers('cli', { name: 'fl-renamed' });
  assert.equal(reproduceCommand(raw, 'fl-dir'), `${RUN_COMMAND} fl-dir --name fl-renamed --preset cli -y`);
  assert.equal(reproduceCommand(raw, 'out/fl-renamed'), `${RUN_COMMAND} out/fl-renamed --preset cli -y`, 'no --name when the folder supplies it');
  assert.equal(reproduceCommand(raw), `${RUN_COMMAND} fl-renamed --preset cli -y`);
  const cwd = join('/', 'work');
  assert.equal(shownTarget('fl-dir', 'fl-renamed', cwd), 'fl-dir', 'the positional wins over the name');
  assert.equal(shownTarget(undefined, 'fl-renamed', cwd), 'fl-renamed');
  assert.equal(shownTarget('.', 'x', cwd), '.');
  assert.equal(shownTarget('../elsewhere', 'x', cwd), join('/', 'elsewhere'), 'outside cwd: absolute');
});
