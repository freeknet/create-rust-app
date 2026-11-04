// @ts-check
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GROUPS } from './groups.js';
import { renderText, destPath } from './render.js';

export const TEMPLATES = fileURLToPath(new URL('../../templates/', import.meta.url));
const BINARY = /\.(png|ico|ttf|otf|woff2?|zip|jpg|jpeg|gif|wav)$/i;

/**
 * @typedef {{ dest: string, content: string } | { dest: string, copyFrom: string }} PlanEntry
 */

/** @param {string} dir @returns {Promise<string[]>} */
async function walk(dir) {
  /** @type {string[]} */
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = /** @type {string} */ (stack.pop());
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
export async function groupFiles(id, ctx) {
  const root = join(TEMPLATES, id);
  const filesDir = join(root, 'files');
  if (!existsSync(filesDir)) return [];
  let files = (await walk(filesDir)).map((src) => ({
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
export async function buildPlan(ctx, opts = {}) {
  /** @type {Map<string, PlanEntry>} */
  const byDest = new Map();
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
    const genIndex = fileURLToPath(new URL('../gen/index.js', import.meta.url));
    if (existsSync(genIndex)) generate = (await import(pathToFileURL(genIndex).href)).generate;
  }
  if (generate) for (const e of await generate(ctx)) byDest.set(e.dest, e);
  return [...byDest.values()].sort((a, b) => a.dest.localeCompare(b.dest));
}
