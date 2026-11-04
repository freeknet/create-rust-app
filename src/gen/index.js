// @ts-check
/** Files composed in JS rather than templated. They win over templates on the same dest. */
import { collectDeps } from './deps.js';
import { singleManifest, workspaceManifests } from './cargo.js';
import { denyToml } from './deny.js';

/** @param {any} ctx @returns {Promise<{dest: string, content: string}[]>} */
export async function generate(ctx) {
  const deps = await collectDeps(ctx);
  const out = ctx.workspace ? workspaceManifests(ctx, deps) : [{ dest: 'Cargo.toml', content: singleManifest(ctx, deps) }];
  if (ctx.flags.has('cargoDeny')) out.push({ dest: 'deny.toml', content: denyToml(ctx) });
  return out;
}
