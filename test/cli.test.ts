import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileTree } from '../src/cli.ts';
import { resolveAnswers } from '../src/presets.ts';

const BIN = fileURLToPath(new URL('../bin/create-rust-app.ts', import.meta.url));
/** @param {string[]} args */
const run = (args: string[]) => spawnSync(process.execPath, [BIN, ...args], {
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

test('--json reports the features a kind actually generates (#6)', () => {
  for (const [preset, kind] of [['cli', 'cli'], ['tui', 'tui'], ['lib', 'lib']] as const) {
    const r = run(['--preset', preset, '--name', 'x-' + preset, '--json', '--dry-run']);
    assert.equal(r.status, 0, `exit 0, stderr: ${r.stderr}`);
    const { answers, files } = JSON.parse(r.stdout);
    assert.equal(answers.kind, kind, preset + ': kind');
    for (const f of ['themes', 'brand', 'motion', 'icons', 'winres', 'tray', 'singleInstance', 'commandPalette', 'screenshotExample']) {
      assert.equal(answers.features[f], false, `${preset}: ${f} is not generated`);
    }
    assert.equal(answers.tooling.unsafeCheck, false, preset + ': no unsafe check without a GUI');
    assert.equal(answers.features.config, files.includes('src/config.rs'), preset + ': config matches the files');
  }
  const gui = JSON.parse(run(['--preset', 'rustaman', '--name', 'x-gui', '--json', '--dry-run']).stdout);
  assert.equal(gui.answers.features.themes, true, 'desktop kinds keep their features');
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

test('Cargo.lock from cargo fetch is part of the first commit (#11)', { skip: process.platform === 'win32' && 'shell-script cargo shim' }, async (t) => {
  if (spawnSync('git', ['--version']).status !== 0) { t.skip('git not on PATH'); return; }
  const base = await mkdtemp(join(tmpdir(), 'cra-lock-'));
  try {
    // Stand-ins: cargo's `fetch` writes Cargo.lock, as the real one does, and rustup reports the
    // pinned toolchain, so a real rustup next to git on PATH can't skip the fetch.
    const bin = join(base, 'bin');
    await import('node:fs/promises').then((fs) => fs.mkdir(bin));
    writeFileSync(join(bin, 'cargo'), '#!/bin/sh\n[ "$1" = fetch ] && echo "# lock" > Cargo.lock\nexit 0\n');
    writeFileSync(join(bin, 'rustup'), `#!/bin/sh\necho "${resolveAnswers('minimal', {}).toolchain}-stand-in"\n`);
    chmodSync(join(bin, 'cargo'), 0o755);
    chmodSync(join(bin, 'rustup'), 0o755);
    const gitDir = spawnSync('sh', ['-c', 'dirname "$(command -v git)"'], { encoding: 'utf8' }).stdout.trim();
    const dir = join(base, 'demo');
    const r = spawnSync(process.execPath, [BIN, dir, '--preset', 'minimal', '--yes', '--quiet'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NO_COLOR: '1', PATH: `${bin}:${gitDir}`, GIT_CONFIG_GLOBAL: '/dev/null' },
    });
    assert.equal(r.status, 0, `exit 0, stderr: ${r.stderr}`);
    assert.ok(existsSync(join(dir, 'Cargo.lock')), 'cargo fetch ran');
    const tracked = spawnSync('git', ['ls-files', 'Cargo.lock'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
    assert.equal(tracked, 'Cargo.lock', 'Cargo.lock is committed');
    const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }).stdout;
    assert.equal(dirty, '', 'the tree is clean straight after scaffolding');
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
