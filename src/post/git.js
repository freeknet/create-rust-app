// @ts-check
/** Post-step: `git init -b main` + initial commit. */
import { spawnSync } from 'node:child_process';

/** @param {string[]} args @param {string} cwd */
const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

/** True when the git executable is on PATH. */
export function hasGit() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0;
}

/** @param {string} dir */
export function insideRepo(dir) {
  const r = git(['rev-parse', '--is-inside-work-tree'], dir);
  return r.status === 0 && r.stdout.trim() === 'true';
}

/**
 * Initialise a repository and commit the scaffold.
 * @param {string} dir target directory (already written)
 * @param {{ name: string, author?: string, email?: string, github?: string }} answers
 * @returns {{ ok: boolean | null, reason?: string }} null = skipped
 */
export function initRepo(dir, answers) {
  if (!hasGit()) return { ok: null, reason: 'git not found on PATH' };
  if (insideRepo(dir)) return { ok: null, reason: 'already inside a git repository' };
  /** @type {string[]} */
  const identity = [];
  if (!git(['config', 'user.name'], dir).stdout?.trim()) identity.push('-c', `user.name=${answers.author || 'create-rust-app'}`);
  if (!git(['config', 'user.email'], dir).stdout?.trim()) {
    const email = answers.email || (answers.github ? `${answers.github}@users.noreply.github.com` : 'create-rust-app@localhost');
    identity.push('-c', `user.email=${email}`);
  }
  const steps = [
    ['init', '-q', '-b', 'main'],
    ['add', '-A'],
    [...identity, 'commit', '-q', '--no-verify', '-m', `feat: scaffold ${answers.name} with create-rust-app`],
  ];
  for (const args of steps) {
    const r = git(args, dir);
    if (r.error || r.status !== 0) {
      const detail = (r.stderr || r.error?.message || '').trim().split('\n').pop();
      return { ok: false, reason: `git ${args.filter((a) => a !== '-c' && !a.includes('=')).join(' ')} failed${detail ? `: ${detail}` : ''}` };
    }
  }
  return { ok: true };
}
