// @ts-check
import { applyDirectives } from './directives.js';
import { moduleFor } from '../gen/header.js';

const TOKEN = /@@([A-Za-z]+)@@/g;

/**
 * Substitute `@@token@@`s. `@@module@@` is computed from `dest`.
 * @param {string} text
 * @param {{ tokens: Record<string,string>, name: string }} ctx
 * @param {string} dest
 */
export function substitute(text, ctx, dest) {
  return text.replace(TOKEN, (_, key) => {
    if (key === 'module') return moduleFor(dest, ctx);
    const v = ctx.tokens[key];
    if (v === undefined) throw new Error(`unknown token @@${key}@@ in ${dest}`);
    return v;
  });
}

/**
 * Directives first (so inactive branches may hold tokens that would not resolve), then tokens.
 * @param {string} text
 * @param {{ tokens: Record<string,string>, flags: Set<string>, name: string }} ctx
 * @param {string} dest
 */
export function renderText(text, ctx, dest) {
  return substitute(applyDirectives(text, ctx.flags, dest), ctx, dest);
}

/**
 * Template path → destination path (tokens, `_dot` names, `.tmpl` suffix).
 * @param {string} rel POSIX path under files/
 * @param {{ tokens: Record<string,string>, name: string }} ctx
 */
export function destPath(rel, ctx) {
  return rel
    .split('/')
    .map((seg) => {
      let s = seg.replace(TOKEN, (_, key) => {
        const v = ctx.tokens[key];
        if (v === undefined) throw new Error(`unknown token @@${key}@@ in path ${rel}`);
        return v;
      });
      if (s.startsWith('_')) s = '.' + s.slice(1);
      if (s.endsWith('.tmpl')) s = s.slice(0, -5);
      return s;
    })
    .join('/');
}
