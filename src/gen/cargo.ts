import type { Ctx } from '../types.ts';
import type { Dep } from '../types.ts';
/** Cargo.toml composition. Lint and profile blocks are verbatim from strobe/rustaman. */

/** @typedef {import('./deps.ts').Dep} Dep */

export const LINTS_RUST_BASE = `warnings = "deny"
dead_code = "deny"
non_snake_case = "deny"
non_upper_case_globals = "deny"
non_camel_case_types = "deny"
unused_variables = "deny"
unused_imports = "forbid"
unused_must_use = "forbid"
unreachable_patterns = "forbid"
unreachable_pub = "forbid"
missing_docs = "deny"
unsafe_op_in_unsafe_fn = "deny"`;

export const LINTS_CLIPPY = `unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
unimplemented = "deny"
unreachable = "deny"
wildcard_enum_match_arm = "deny"
match_wildcard_for_single_variants = "deny"
match_wild_err_arm = "deny"
rest_pat_in_fully_bound_structs = "deny"
ignored_unit_patterns = "deny"
allow_attributes = "deny"
missing_safety_doc = "deny"
undocumented_unsafe_blocks = "deny"`;

/** @param {string} pkg */
export const profiles = (pkg: string) => `[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = "debuginfo"
panic = "abort"

# Optimised but quick to rebuild: \`cargo run --profile release-fast\`.
[profile.release-fast]
inherits = "release"
lto = false
incremental = true
codegen-units = 16

[profile.release-fast.package.${pkg}]
codegen-units = 256

[profile.dev.package."*"]
debug = "line-tables-only"
`;

/** @param {string} s */
const q = (s: string) => JSON.stringify(s);

/** @param {Dep} d */
function inlineSpec(d: Dep) {
  const simple = !d.features?.length && d.defaultFeatures !== false;
  if (simple) return q(d.version);
  const parts = [`version = ${q(d.version)}`];
  if (d.defaultFeatures === false) parts.push('default-features = false');
  if (d.features?.length) parts.push(`features = [${d.features.map(q).join(', ')}]`);
  return `{ ${parts.join(', ')} }`;
}

/** @param {string} name */
const tomlKey = (name: string) => (/^[A-Za-z0-9_-]+$/.test(name) ? name : q(name));

/**
 * Dependency tables for one crate.
 * @param {Dep[]} deps already filtered to the crate
 * @param {(d: Dep) => string} spec
 */
function depTables(deps: Dep[], spec: (d: Dep) => string) {
  /** @type {Map<string, Dep[]>} */
  const tables: Map<string, Dep[]> = new Map();
  for (const d of deps) {
    const kind = d.kind ?? 'normal';
    const section = kind === 'normal' ? 'dependencies' : `${kind}-dependencies`;
    const header = d.target ? `[target.'${d.target}'.${section}]` : `[${section}]`;
    if (!tables.has(header)) tables.set(header, []);
    tables.get(header)?.push(d);
  }
  const order = (/** @type {string} */ h: string) => (h.startsWith('[target') ? 1 : 0) * 10 + (h.includes('dev-') ? 2 : h.includes('build-') ? 3 : 1);
  return [...tables.entries()]
    .sort(([a]: [string, Dep[]], [b]: [string, Dep[]]) => order(a) - order(b) || a.localeCompare(b))
    .map(([h, ds]: [string, Dep[]]) => `${h}\n${ds.map((d: Dep) => `${tomlKey(d.name)} = ${spec(d)}`).join('\n')}\n`)
    .join('\n');
}

/** @param {any} ctx */
function licenseLines(ctx: Ctx) {
  return ctx.license === 'MIT+CommonsClause' ? 'license-file = "LICENSE"' : `license = ${q(ctx.license)}`;
}

/** @param {any} ctx */
const repoUrl = (ctx: Ctx) => (ctx.github ? `https://github.com/${ctx.github}/${ctx.name}` : '');

/** @param {any} ctx */
function authors(ctx: Ctx) {
  if (!ctx.author) return '[]';
  return `[${q(ctx.email ? `${ctx.author} <${ctx.email}>` : ctx.author)}]`;
}

/**
 * Single-crate manifest.
 * @param {any} ctx @param {Dep[]} deps
 */
export function singleManifest(ctx: Ctx, deps: Dep[]) {
  const lib = ctx.kind === 'lib';
  const pkg = [
    '[package]',
    `name = ${q(ctx.name)}`,
    'version = "0.1.0"',
    `edition = ${q(ctx.edition)}`,
    `rust-version = ${q(ctx.msrv)}`,
    `description = ${q(ctx.tagline || ctx.name)}`,
    `authors = ${authors(ctx)}`,
    licenseLines(ctx),
    repoUrl(ctx) && `repository = ${q(repoUrl(ctx))}`,
    'readme = "README.md"',
    lib ? 'keywords = []' : '',
    lib ? 'categories = []' : 'publish = false',
  ].filter(Boolean).join('\n');
  const docs = lib ? '\n[package.metadata.docs.rs]\nall-features = true\nrustdoc-args = ["--cfg", "docsrs"]\n' : '';
  const appDeps = deps.filter((d: Dep) => (d.crate ?? 'app') === 'app');
  return `${pkg}
${docs}
${depTables(appDeps, inlineSpec)}
[lints.rust]
${lintsRust(ctx)}

[lints.clippy]
${LINTS_CLIPPY}

${profiles(ctx.name)}`.replace(/\n{3,}/g, '\n\n');
}

/**
 * Workspace manifests: root + `crates/<app>` + `crates/xtask`.
 * @param {any} ctx @param {Dep[]} deps
 * @returns {{ dest: string, content: string }[]}
 */
export function workspaceManifests(ctx: Ctx, deps: Dep[]) {
  // Workspace-level table: one entry per crate name (versions + default-features live here,
  // features are added per member so each crate states what it uses).
  /** @type {Map<string, Dep>} */
  const ws: Map<string, Dep> = new Map();
  for (const d of deps) {
    const prev = ws.get(d.name);
    if (!prev) ws.set(d.name, { name: d.name, version: d.version, ...(d.defaultFeatures === undefined ? {} : { defaultFeatures: d.defaultFeatures }) });
    else if (d.defaultFeatures === false) prev.defaultFeatures = false;
  }
  const wsDeps = [...ws.values()].sort((a: Dep, b: Dep) => a.name.localeCompare(b.name))
    .map((d: Dep) => `${tomlKey(d.name)} = ${d.defaultFeatures === false ? `{ version = ${q(d.version)}, default-features = false }` : q(d.version)}`)
    .join('\n');
  const root = `[workspace]
resolver = "3"
members = ["crates/*"]

[workspace.package]
version = "0.1.0"
edition = ${q(ctx.edition)}
rust-version = ${q(ctx.msrv)}
authors = ${authors(ctx)}
${licenseLines(ctx)}
${repoUrl(ctx) ? `repository = ${q(repoUrl(ctx))}\n` : ''}publish = false

[workspace.dependencies]
${wsDeps}

[workspace.lints.rust]
${lintsRust(ctx)}

[workspace.lints.clippy]
${LINTS_CLIPPY}

${profiles(ctx.appCrate)}`;

  /** @param {Dep} d */
  const memberSpec = (d: Dep) => (d.features?.length ? `{ workspace = true, features = [${d.features.map(q).join(', ')}] }` : '{ workspace = true }');
  /** @param {string} name @param {string} desc @param {Dep[]} ds */
  const member = (name: string, desc: string, ds: Dep[]) => `[package]
name = ${q(name)}
description = ${q(desc)}
version.workspace = true
edition.workspace = true
rust-version.workspace = true
authors.workspace = true
${ctx.license === 'MIT+CommonsClause' ? 'license-file = "../../LICENSE"' : 'license.workspace = true'}
publish.workspace = true

${depTables(ds, memberSpec)}
[lints]
workspace = true
`.replace(/\n{3,}/g, '\n\n');

  return [
    { dest: 'Cargo.toml', content: root },
    { dest: `crates/${ctx.appCrate}/Cargo.toml`, content: member(ctx.appCrate, ctx.tagline || ctx.name, deps.filter((d: Dep) => (d.crate ?? 'app') === 'app')) },
    { dest: 'crates/xtask/Cargo.toml', content: member('xtask', `Project automation for ${ctx.name}: \`cargo xtask <task>\`.`, deps.filter((d: Dep) => d.crate === 'xtask')) },
  ];
}

/**
 * The house lint block. One deliberate exception: tracing's event macros expand to
 * `#[allow(unused_imports)]`, which `forbid` turns into a hard error (E0453), so projects that log
 * with tracing get `deny` instead: same strictness for our code, and the macros still compile.
 * @param {{ flags: Set<string> }} ctx
 */
export function lintsRust(ctx: { flags: Set<string>; }) {
  if (!ctx.flags.has('log_tracing')) return LINTS_RUST_BASE;
  return LINTS_RUST_BASE.replace('unused_imports = "forbid"', 'unused_imports = "deny"  # forbid breaks the tracing macros (E0453)');
}
