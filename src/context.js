// @ts-check
/** Answers → Ctx (see docs/CONTRACTS.md). */

export const NAME_RE = /^[a-z][a-z0-9-]*$/;

/** @param {string} name */
export function validateName(name) {
  if (!NAME_RE.test(name)) return 'Use lowercase letters, digits, and dashes, starting with a letter.';
  if (name.endsWith('-') || name.includes('--')) return 'No trailing or doubled dashes.';
  if (['test', 'core', 'std', 'alloc', 'proc-macro', 'self', 'crate', 'super'].includes(name))
    return `"${name}" is reserved in Rust.`;
  return null;
}

/** @param {string} s */
export const toSnake = (s) => s.replace(/-/g, '_');
/** @param {string} s */
export const toPascal = (s) =>
  s.split('-').filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join('');
/** @param {string} s */
export const toScreaming = (s) => toSnake(s).toUpperCase();

const LICENSE_FLAG = {
  MIT: 'license_mit',
  'MIT+CommonsClause': 'license_mit_cc',
  'Apache-2.0': 'license_apache',
  'MIT OR Apache-2.0': 'license_dual',
};

/**
 * @param {any} a Answers
 */
export function buildContext(a) {
  const err = validateName(a.name);
  if (err) throw new Error(`invalid project name "${a.name}": ${err}`);
  const workspace = a.kind === 'workspace';
  const hasGui = a.kind === 'gui' || workspace;

  /** @type {Set<string>} */
  const flags = new Set();
  flags.add(`kind_${a.kind}`);
  flags.add(`edition_${a.edition}`);
  flags.add(workspace ? 'workspace' : 'single');
  if (hasGui) {
    flags.add('has_gui');
    flags.add(`gui_${a.guiStack.replace(/-/g, '_')}`);
  }
  if (a.kind !== 'lib') flags.add('has_bin');
  const lf = LICENSE_FLAG[/** @type {keyof typeof LICENSE_FLAG} */ (a.license)];
  if (!lf) throw new Error(`unknown license ${a.license}`);
  flags.add(lf);
  flags.add(`log_${a.crates.logging}`);
  flags.add(`async_${a.crates.async}`);
  flags.add(`http_${a.crates.http}`);
  flags.add(`errors_${a.crates.errors}`);
  for (const group of [a.crates, a.features, a.tooling]) {
    for (const [k, v] of Object.entries(group)) if (v === true) flags.add(k);
  }
  // GUI-only features mean nothing without a GUI.
  if (!hasGui) {
    for (const f of ['themes', 'brand', 'motion', 'icons', 'winres', 'tray', 'singleInstance',
      'commandPalette', 'screenshotExample', 'unsafeCheck']) flags.delete(f);
  }
  // A library has no user config file of its own; that belongs to the app embedding it.
  if (a.kind === 'lib') flags.delete('config');

  const appCrate = workspace ? `${a.name}-app` : a.name;
  const year = String(new Date().getFullYear());
  /** @type {Record<string,string>} */
  const tokens = {
    name: a.name,
    crate: toSnake(a.name),
    Name: toPascal(a.name),
    NAME: toScreaming(a.name),
    appCrate,
    appCrateSnake: toSnake(appCrate),
    displayName: a.displayName || toPascal(a.name),
    tagline: a.tagline || '',
    author: a.author || '',
    github: a.github || '',
    email: a.email || '',
    year,
    license: a.license,
    edition: a.edition,
    msrv: a.msrv,
    toolchain: a.toolchain,
    accent: a.accent,
  };

  return {
    ...a,
    crate: tokens.crate,
    Name: tokens.Name,
    NAME: tokens.NAME,
    appCrate,
    year,
    hasGui,
    workspace,
    flags,
    tokens,
  };
}
