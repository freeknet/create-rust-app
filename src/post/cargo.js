// @ts-check
/** Post-step: `cargo check --all-targets`, streaming the last output line to a callback. */
import { spawn, spawnSync } from 'node:child_process';

/** @param {string} cmd */
export function onPath(cmd) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0;
}

/**
 * Is the pinned toolchain installed? `null` when rustup is unavailable (can't tell).
 * @param {string} pin
 * @returns {boolean | null}
 */
export function hasToolchain(pin) {
  const r = spawnSync('rustup', ['toolchain', 'list'], { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).some((line) => line.trim() === pin || line.trim().startsWith(`${pin}-`));
}

/**
 * @param {string} dir project directory
 * @param {{ toolchain: string, onLine?: (line: string) => void, onHint?: (hint: string) => void }} opts
 * @returns {Promise<boolean | null>} true ok, false failed, null skipped
 */
export async function cargoCheck(dir, { toolchain, onLine, onHint }) {
  if (!onPath('cargo')) {
    onHint?.('cargo not found on PATH; install Rust from https://rustup.rs');
    return null;
  }
  if (hasToolchain(toolchain) === false) {
    onHint?.(`toolchain ${toolchain} is not installed; run: rustup toolchain install ${toolchain}`);
    return null;
  }
  return new Promise((resolve) => {
    const child = spawn('cargo', ['check', '--all-targets'], {
      cwd: dir, windowsHide: true, env: { ...process.env, CARGO_TERM_COLOR: 'never' },
    });
    let tail = '';
    /** @param {Buffer} chunk */
    const feed = (chunk) => {
      tail += chunk.toString('utf8');
      const lines = tail.split(/\r?\n/);
      tail = lines.pop() ?? '';
      const last = lines.map((l) => l.trim()).filter(Boolean).pop();
      if (last) onLine?.(last);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', () => resolve(false));
    child.on('close', (code) => resolve(code === 0));
  });
}
