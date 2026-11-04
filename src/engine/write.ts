import { mkdir, readdir, writeFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** @param {string} dir */
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
export async function writePlan(plan: PlanEntry[], target: string, opts: { force?: boolean; dryRun?: boolean; } | undefined = {}) {
  const dests = plan.map((e: PlanEntry) => e.dest);
  if (opts.dryRun) return dests;
  if (!opts.force && !(await isEmptyDir(target))) {
    throw new Error(`${target} is not empty. Pick another directory or pass --force.`);
  }
  for (const e of plan) {
    const out = join(target, ...e.dest.split('/'));
    await mkdir(dirname(out), { recursive: true });
    if ('copyFrom' in e) await copyFile(e.copyFrom, out);
    else await writeFile(out, e.content.endsWith('\n') ? e.content : e.content + '\n');
  }
  return dests;
}
import type { PlanEntry } from '../types.ts';
