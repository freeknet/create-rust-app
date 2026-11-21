/** Post-step: `git init -b main` + initial commit. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** @param {string[]} args @param {string} cwd */
const git = (args: string[], cwd: string, input?: string) =>
  spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, ...(input === undefined ? {} : { input }) });

/** True when the git executable is on PATH. */
export function hasGit() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true });
  return !r.error && r.status === 0;
}

/** @param {string} dir */
export function insideRepo(dir: string) {
  const r = git(['rev-parse', '--is-inside-work-tree'], dir);
  return r.status === 0 && r.stdout.trim() === 'true';
}

/**
 * What the git step will do in `dir` (which must exist): `init` a new repository, `commit` into a
 * repository whose root is `dir` and that has no commits yet (a fresh `git init`), or `skip`
 * because `dir` is inside some other repository, or git is missing.
 */
export function repoState(dir: string): { action: 'init' | 'commit' } | { action: 'skip'; reason: string } {
  if (!hasGit()) return { action: 'skip', reason: 'git not found on PATH' };
  if (!insideRepo(dir)) return { action: 'init' };
  const atRoot = git(['rev-parse', '--show-cdup'], dir);
  const hasCommits = git(['rev-parse', '--verify', '-q', 'HEAD'], dir).status === 0;
  if (atRoot.status === 0 && atRoot.stdout.trim() === '' && !hasCommits) return { action: 'commit' };
  return { action: 'skip', reason: 'already inside a git repository' };
}

export interface GitResult {
  /** true = committed, false = a git command failed, null = skipped. */
  ok: boolean | null;
  reason?: string;
  /** Whether this run created the repository (false: it committed into a fresh, empty one). */
  initialised?: boolean;
  /** The branch the first commit landed on. */
  branch?: string;
}

/**
 * Initialise a repository and commit the scaffold. In a fresh repository whose root is `dir` (only
 * `git init` so far) it skips `init` and commits just the generated `files` (plus `Cargo.lock` once
 * fetched), staged by path, so nothing else in the folder is swept into the commit.
 * @param {string} dir target directory (already written)
 * @param {string[]} [files] the generated paths, POSIX-relative to `dir`
 */
export function initRepo(dir: string, answers: { name: string; author?: string; email?: string; github?: string; }, files?: string[]): GitResult {
  const state = repoState(dir);
  if (state.action === 'skip') return { ok: null, reason: state.reason };
  if (state.action === 'commit' && !files) return { ok: null, reason: 'already inside a git repository' };
  /** @type {string[]} */
  const identity: string[] = [];
  if (!git(['config', 'user.name'], dir).stdout?.trim()) identity.push('-c', `user.name=${answers.author || 'create-rust-app'}`);
  if (!git(['config', 'user.email'], dir).stdout?.trim()) {
    const email = answers.email || (answers.github ? `${answers.github}@users.noreply.github.com` : 'create-rust-app@localhost');
    identity.push('-c', `user.email=${email}`);
  }
  const message = `feat: scaffold ${answers.name} with create-rust-app`;
  const paths = [...(files ?? []), ...(files && !files.includes('Cargo.lock') && existsSync(join(dir, 'Cargo.lock')) ? ['Cargo.lock'] : [])];
  // NUL-separated on stdin: no command-line length limit, no shell quoting.
  const pathspec = ['--pathspec-from-file=-', '--pathspec-file-nul'];
  const steps: [string[], string?][] = state.action === 'init'
    ? [[['init', '-q', '-b', 'main']], [['add', '-A']], [[...identity, 'commit', '-q', '--no-verify', '-m', message]]]
    : [[['add', ...pathspec], paths.join('\0')], [[...identity, 'commit', '-q', '--no-verify', '-m', message, ...pathspec], paths.join('\0')]];
  for (const [args, input] of steps) {
    const r = git(args, dir, input);
    if (r.error || r.status !== 0) {
      const detail = (r.stderr || r.error?.message || '').trim().split('\n').pop();
      return { ok: false, reason: `git ${args.filter((a: string) => a !== '-c' && !a.includes('=')).join(' ')} failed${detail ? `: ${detail}` : ''}` };
    }
  }
  const branch = git(['symbolic-ref', '--short', 'HEAD'], dir).stdout?.trim() || 'main';
  return { ok: true, initialised: state.action === 'init', branch };
}
