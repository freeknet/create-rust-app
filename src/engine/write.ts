import { mkdir, readdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
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

/**
 * @param {import('./plan.ts').PlanEntry[]} plan
 * @param {string} target
 * @param {{ force?: boolean, dryRun?: boolean }} [opts]
 * @returns {Promise<string[]>} dests written (or that would be)
 */
export async function writePlan(plan: PlanEntry[], target: string, opts: { force?: boolean; dryRun?: boolean; onFile?: (dest: string, i: number, n: number) => void } | undefined = {}) {
  const dests = plan.map((e: PlanEntry) => e.dest);
  if (opts.dryRun) return dests;
  if (!opts.force && !(await isEmptyDir(target))) {
    throw new Error(`${target} is not empty. Pick another directory or pass --force.`);
  }
  for (const [i, e] of plan.entries()) {
    opts.onFile?.(e.dest, i + 1, plan.length);
    const out = join(target, ...e.dest.split('/'));
    await mkdir(dirname(out), { recursive: true });
    if ('copyFrom' in e) await copyFile(e.copyFrom, out);
    else await writeFile(out, e.content.endsWith('\n') ? e.content : e.content + '\n');
  }
  return dests;
}
import type { PlanEntry } from '../types.ts';
