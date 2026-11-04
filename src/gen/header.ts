/**
 * The `Module:` value a header banner must carry for a file at `dest`.
 * Mirrors rustaman's `header_check::expected_module`, plus the workspace form
 * (`crates/<crate>/src/foo.rs` → `<crate_snake>::foo`).
 */

/** @param {string} s */
const snake = (s: string) => s.replace(/-/g, '_');

/**
 * @param {string} rel path relative to a crate root, POSIX
 * @param {string} crateName kebab crate name
 * @param {string | null} prefix module prefix for non-root modules (workspace crates)
 */
function forCrate(rel: string, crateName: string, prefix: string | null) {
  if (rel === 'build.rs') return 'build (build script)';
  const slash = rel.indexOf('/');
  if (slash < 0) throw new Error(`${rel} is not under a checked directory`);
  const area = rel.slice(0, slash);
  const rest = rel.slice(slash + 1);
  if (!rest.endsWith('.rs')) throw new Error(`${rel} is not a Rust source file`);
  const stem = rest.slice(0, -3);
  if (area === 'tests') return `${stem} (integration test)`;
  if (area === 'examples') return `${stem} (example)`;
  if (area === 'benches') return `${stem} (benchmark)`;
  if (stem.startsWith('bin/')) return `${crateName}-${stem.slice(4)} (binary crate root)`;
  if (stem === 'lib') return `${crateName} (library crate root)`;
  if (stem === 'main') return `${crateName} (binary crate root)`;
  const module = (stem.endsWith('/mod') ? stem.slice(0, -4) : stem).replace(/\//g, '::');
  return prefix ? `${prefix}::${module}` : module;
}

/**
 * @param {string} dest project-relative POSIX path of a .rs file
 * @param {{ name: string }} ctx
 */
export function moduleFor(dest: string, ctx: { name: string; }) {
  const m = /^crates\/([^/]+)\/(.+)$/.exec(dest);
  if (m && m[1] !== undefined && m[2] !== undefined) return forCrate(m[2], m[1], snake(m[1]));
  return forCrate(dest, ctx.name, null);
}
