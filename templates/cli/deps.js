// @ts-check
/**
 * Crates the cli templates need beyond the base set in src/gen/deps.js.
 * @param {any} ctx @returns {import('../../src/gen/deps.js').Dep[]}
 */
export default (ctx) => {
  const f = ctx.flags;
  const config = f.has('serde') && f.has('config');
  /** @type {import('../../src/gen/deps.js').Dep[]} */
  const deps = [];
  // db.rs finds its data directory with `dirs`; base deps only add it for config.
  if (f.has('sqlite') && !config) deps.push({ name: 'dirs', version: '7' });
  // Without tokio the fetch command uses reqwest's blocking client.
  if (f.has('http_reqwest') && !f.has('async_tokio')) deps.push({ name: 'reqwest', version: '0.12', features: ['blocking'] });
  // The `fetch` command with ureq under tokio runs on the blocking pool (`rt` is already on).
  // Config and database tests write into throwaway directories.
  if (config || f.has('sqlite')) deps.push({ name: 'tempfile', version: '3', kind: 'dev' });
  return deps;
};
