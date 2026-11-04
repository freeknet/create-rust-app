import type { Ctx } from '../types.ts';
type PlanEntry = { dest: string, content: string } | { dest: string, copyFrom: string };
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GROUPS } from './groups.ts';
import { renderText, destPath } from './render.ts';

// The engine can run from either src/ or dist/src/. Find the package root in both cases.
let packageRoot = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(packageRoot, 'package.json'))) {
  const parent = dirname(packageRoot);
  if (parent === packageRoot) throw new Error('Unable to locate create-rust-app package root');
  packageRoot = parent;
}
export const TEMPLATES = join(packageRoot, 'templates');
const BINARY = /\.(png|ico|ttf|otf|woff2?|zip|jpg|jpeg|gif|wav)$/i;

/**
 * @typedef {{ dest: string, content: string } | { dest: string, copyFrom: string }} PlanEntry
 */

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir: string) {
  /** @type {string[]} */
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const d = /** @type {string} */ (stack.pop() as string);
    for (const e of await readdir(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else out.push(p);
    }
  }
  return out.sort();
}

/**
 * Files of one group as `{src, dest}` (dest before the mount prefix), after its manifest.
 * @param {string} id
 * @param {any} ctx
 */
export async function groupFiles(id: string, ctx: Ctx) {
  const root = join(TEMPLATES, id);
  const filesDir = join(root, 'files');
  if (!existsSync(filesDir)) return [];
  let files = (await walk(filesDir)).map((src: string) => ({
    src,
    dest: destPath(relative(filesDir, src).split(sep).join('/'), ctx),
  }));
  const manifest = join(root, 'manifest.js');
  if (existsSync(manifest)) {
    const mod = await import(pathToFileURL(manifest).href);
    files = mod.default(ctx, files);
  }
  return files;
}

/**
 * @param {any} ctx
 * @param {{ generate?: (ctx: any) => PlanEntry[] | Promise<PlanEntry[]> }} [opts]
 * @returns {Promise<PlanEntry[]>}
 */
export async function buildPlan(ctx: Ctx, opts: { generate?: (ctx: Ctx) => PlanEntry[] | Promise<PlanEntry[]>; } | undefined = {}) {
  /** @type {Map<string, PlanEntry>} */
  const byDest: Map<string, PlanEntry> = new Map();
  for (const g of GROUPS) {
    if (!g.when(ctx)) continue;
    const prefix = g.mount ? g.mount(ctx) : '';
    for (const { src, dest: d } of await groupFiles(g.id, ctx)) {
      const dest = prefix + d;
      if (BINARY.test(src)) {
        byDest.set(dest, { dest, copyFrom: src });
        continue;
      }
      if (!(await stat(src)).isFile()) continue;
      const text = await readFile(src, 'utf8');
      byDest.set(dest, { dest, content: renderText(text, ctx, dest) });
    }
  }
  let generate = opts.generate;
  if (!generate) {
    const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
    const genIndex = fileURLToPath(new URL(`../gen/index${extension}`, import.meta.url));
    if (existsSync(genIndex)) generate = (await import(pathToFileURL(genIndex).href)).generate;
  }
  if (generate) for (const e of await generate(ctx)) byDest.set(e.dest, e);
  return [...byDest.values()].sort((a: PlanEntry, b: PlanEntry) => a.dest.localeCompare(b.dest));
}
