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

test('explicit options the kind ignores get one stderr line each, not an error (F17)', () => {
  const cases: [string[], RegExp][] = [
    [['--preset', 'lib', '--with', 'tray'], /^note: tray is ignored: a library has no desktop window\.$/],
    [['--preset', 'tui', '--with', 'subcommands'], /^note: subcommands is ignored: a terminal UI has no command line/],
    [['--preset', 'minimal', '--with', 'subcommands'], /^note: subcommands is ignored: subcommands need clap/],
    [['--preset', 'lib', '--bin', 'foo'], /^note: --bin foo is ignored: a library has no executable\.$/],
    [['--preset', 'cli', '--gui', 'winit-glow'], /^note: --gui winit-glow is ignored: a command-line tool has no desktop window\.$/],
    [['--preset', 'cli', '--set', 'features.tray=true'], /^note: tray is ignored/],
  ];
  for (const [args, re] of cases) {
    const r = run([...args, '--dry-run', '--json']);
    assert.equal(r.status, 0, `${args.join(' ')} still succeeds: ${r.stderr}`);
    JSON.parse(r.stdout);
    const lines = r.stderr.trim().split('\n');
    assert.equal(lines.length, 1, `one line for ${args.join(' ')}: ${r.stderr}`);
    assert.match(lines[0] ?? '', re);
    assert.equal(run([...args, '--dry-run', '--quiet']).stderr, '', '--quiet suppresses it');
  }
  const both = run(['--preset', 'lib', '--with', 'tray,palette', '--dry-run', '--json']);
  assert.equal(both.stderr.trim().split('\n').length, 2, 'one line per ignored option');
  for (const args of [['--preset', 'cli', '--without', 'tray'], ['--preset', 'rustaman', '--with', 'tray'], ['--preset', 'cli', '--with', 'subcommands']]) {
    assert.equal(run([...args, '--dry-run', '--json']).stderr, '', `nothing ignored: ${args.join(' ')}`);
  }
});

test('--json blanks guiStack like themeBase for kinds without a GUI (B20)', () => {
  for (const preset of ['cli', 'tui', 'lib', 'minimal']) {
    const out = JSON.parse(run(['--preset', preset, '--gui', 'winit-glow', '--dry-run', '--json']).stdout);
    assert.equal(out.answers.guiStack, '', `${preset}: no GUI stack`);
    assert.equal(out.answers.themeBase, '', `${preset}: no theme base`);
  }
  for (const [preset, stack] of [['rustaman', 'eframe'], ['strobe', 'winit-glow']] as const) {
    assert.equal(JSON.parse(run(['--preset', preset, '--dry-run', '--json']).stdout).answers.guiStack, stack);
  }
});
