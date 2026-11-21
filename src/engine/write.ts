import { mkdir, readdir, writeFile, copyFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Why `dir` can't be scaffolded into, or null if it can. A lone `.git` doesn't count as content. */
export function targetProblem(dir: string): string | null {
  if (!existsSync(dir)) return null;
  try {
    return readdirSync(dir).some((e) => e !== '.git') ? `${dir} is not empty. Pick another directory or pass --force.` : null;
  } catch {
    return `${dir} exists and isn't a directory.`;
  }
}

export async function isEmptyDir(dir: string) {
  if (!existsSync(dir)) return true;
  const entries = await readdir(dir);
  return entries.filter((e: unknown) => e !== '.git').length === 0;
}

/** The plan's dests that already exist as files under `target`: what `--force` would overwrite. */
export function existingFiles(plan: PlanEntry[], target: string): string[] {
  return plan.map((e) => e.dest).filter((dest) => {
    try { return statSync(join(target, ...dest.split('/'))).isFile(); } catch { return false; }
  });
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * @param {import('./plan.ts').PlanEntry[]} plan
 * @param {string} target
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 * @returns {Promise<string[]>} dests written (or that would be)
 *
 * If a write fails, what this run made is removed before the error is thrown: the whole target
 * when this run created it, otherwise only the files and folders it added (files it had already
 * overwritten under --force can't be restored, and the error says how many). The error says which.
 */
export async function writePlan(plan: PlanEntry[], target: string, opts: { force?: boolean; dryRun?: boolean; onFile?: (dest: string, i: number, n: number) => void } | undefined = {}) {
  const dests = plan.map((e: PlanEntry) => e.dest);
  if (opts.dryRun) return dests;
  if (!opts.force && !(await isEmptyDir(target))) {
    throw new Error(`${target} is not empty. Pick another directory or pass --force.`);
  }
  const targetExisted = existsSync(target);
  /** The topmost folder this run created for the target itself (it may include missing parents). */
  let createdRoot: string | undefined;
  if (!targetExisted) createdRoot = await mkdir(target, { recursive: true });
  const createdDirs: string[] = [];
  const createdFiles: string[] = [];
  let overwritten = 0;
  let current = '';
  try {
    for (const [i, e] of plan.entries()) {
      current = e.dest;
      opts.onFile?.(e.dest, i + 1, plan.length);
      const out = join(target, ...e.dest.split('/'));
      const made = await mkdir(dirname(out), { recursive: true });
      if (made) createdDirs.push(made);
      const existed = existsSync(out);
      if ('copyFrom' in e) await copyFile(e.copyFrom, out);
      else await writeFile(out, e.content.endsWith('\n') ? e.content : e.content + '\n');
      if (existed) overwritten++;
      else createdFiles.push(out);
    }
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error);
    let cleanup: string;
    try {
      if (createdRoot) {
        await rm(createdRoot, { recursive: true, force: true, maxRetries: 3 });
        cleanup = `Removed ${createdRoot}, which this run created.`;
      } else {
        // Folders first (everything under one was made by this run), then files elsewhere.
        for (const dir of createdDirs.reverse()) await rm(dir, { recursive: true, force: true, maxRetries: 3 });
        for (const file of createdFiles) await rm(file, { force: true });
        cleanup = `Removed the ${plural(createdFiles.length, 'file')} this run created in ${target}; files that were there before are kept`
          + (overwritten ? `, but ${plural(overwritten, 'existing file')} had already been overwritten.` : '.');
      }
    } catch (cleanupError) {
      const detail = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
      cleanup = `Cleaning up failed too (${detail}); check ${createdRoot ?? target} by hand.`;
    }
    throw new Error(`Writing ${current} failed: ${why}. ${cleanup}`, { cause: error });
  }
  return dests;
}
import type { PlanEntry } from '../types.ts';
