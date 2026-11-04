/** Post-step: `cargo check --all-targets`, streaming the last output line to a callback. */
import { spawn, spawnSync } from 'node:child_process';

/** @param {string} cmd */
export function onPath(cmd: string) {
  const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0;
}

/**
 * Is the pinned toolchain installed? `null` when rustup is unavailable (can't tell).
 * @param {string} pin
 * @returns {boolean | null}
 */
export function hasToolchain(pin: string) {
  const r = spawnSync('rustup', ['toolchain', 'list'], { encoding: 'utf8', windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).some((line: string) => line.trim() === pin || line.trim().startsWith(`${pin}-`));
}

type CargoOpts = { toolchain: string; onLine?: (line: string) => void; onHint?: (hint: string) => void };

/**
 * `cargo check --all-targets`: true ok, false failed, null skipped (no cargo / no toolchain).
 * Slow for GUI projects (it compiles eframe/wgpu), so it is opt-in.
 */
export function cargoCheck(dir: string, opts: CargoOpts) {
  return cargo(dir, ['check', '--all-targets'], opts);
}

/** `cargo fetch`: downloads the dependency graph and writes Cargo.lock. Seconds, not minutes. */
export function cargoFetch(dir: string, opts: CargoOpts) {
  return cargo(dir, ['fetch'], opts);
}

async function cargo(dir: string, args: string[], { toolchain, onLine, onHint }: CargoOpts): Promise<boolean | null> {
  if (!onPath('cargo')) {
    onHint?.('cargo not found on PATH; install Rust from https://rustup.rs');
    return null;
  }
  if (hasToolchain(toolchain) === false) {
    onHint?.(`toolchain ${toolchain} is not installed; run: rustup toolchain install ${toolchain}`);
    return null;
  }
  return new Promise((resolve: (value: boolean | PromiseLike<boolean | null> | null) => void) => {
    const child = spawn('cargo', args, {
      cwd: dir, windowsHide: true, env: { ...process.env, CARGO_TERM_COLOR: 'never' },
    });
    let tail = '';
    /** @param {Buffer} chunk */
    const feed = (chunk: Buffer) => {
      tail += chunk.toString('utf8');
      const lines = tail.split(/\r?\n/);
      tail = lines.pop() ?? '';
      const last = lines.map((l: string) => l.trim()).filter(Boolean).pop();
      if (last) onLine?.(last);
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', () => resolve(false));
    child.on('close', (code: unknown) => resolve(code === 0));
  });
}
