import type { Answers, Ctx, TokenKey } from './types.ts';
/** Answers → Ctx (see docs/CONTRACTS.md). */

export const NAME_RE = /^[a-z][a-z0-9-]*$/;

/** @param {string} name */
export function validateName(name: string) {
  if (!NAME_RE.test(name)) return 'Use lowercase letters, digits, and dashes, starting with a letter.';
  if (name.endsWith('-') || name.includes('--')) return 'No trailing or doubled dashes.';
  if (['test', 'core', 'std', 'alloc', 'proc-macro', 'self', 'crate', 'super'].includes(name))
    return `"${name}" is reserved in Rust.`;
  return null;
}

/** A binary name: what users type, so the same rules as a crate name plus underscores. */
export function validateBin(bin: string) {
  if (!/^[a-z][a-z0-9_-]*$/.test(bin)) return 'Use lowercase letters, digits, dashes and underscores, starting with a letter.';
  // Cargo refuses these as target names: they collide with directories under target/.
  if (['deps', 'examples', 'build', 'incremental'].includes(bin)) return `"${bin}" is reserved by Cargo.`;
  // Every project builds a Windows .exe, and Windows treats these as devices, not files.
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/.test(bin)) return `"${bin}" is a reserved device name on Windows.`;
  return null;
}

/** @param {string} s */
export const toSnake = (s: string) => s.replace(/-/g, '_');
/** @param {string} s */
export const toPascal = (s: string) =>
  s.split('-').filter(Boolean).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
/** @param {string} s */
export const toScreaming = (s: string) => toSnake(s).toUpperCase();

const LICENSE_FLAG = {
  MIT: 'license_mit',
  'MIT+CommonsClause': 'license_mit_cc',
  'Apache-2.0': 'license_apache',
  'MIT OR Apache-2.0': 'license_dual',
};

/** App features only a desktop GUI generates (kind `gui`, or the `workspace` app crate). */
export const GUI_ONLY_FEATURES = ['themes', 'brand', 'motion', 'icons', 'winres', 'tray', 'singleInstance',
  'commandPalette', 'screenshotExample', 'demo'] as const satisfies readonly (keyof Answers['features'])[];

/**
 * The answers as they apply to this kind of project: options the kind never generates read
 * `false`. Presets and defaults set desktop features for every kind (so switching to a GUI
 * mid-flow keeps them); this is what the flags, and `--json`, report instead.
 */
export function effectiveAnswers(a: Answers): Answers {
  const out = structuredClone(a);
  const hasGui = a.kind === 'gui' || a.kind === 'workspace';
  if (!hasGui) {
    for (const f of GUI_ONLY_FEATURES) out.features[f] = false;
    out.tooling.unsafeCheck = false;
  }
  // The GUI kinds always ship a config file; the CLI only when serde is on to read it. A library
  // leaves config to the app embedding it, and the TUI template has none.
  if (!hasGui && !(a.kind === 'cli' && a.crates.serde)) out.features.config = false;
  // Subcommands shape a clap command line, so they need the cli kind with clap.
  if (a.kind !== 'cli' || !a.crates.clap) out.features.subcommands = false;
  // A library has no binary, and a binary named like its crate needs no [[bin]] table.
  if (a.kind === 'lib' || a.bin === (a.kind === 'workspace' ? `${a.name}-app` : a.name)) out.bin = '';
  return out;
}

/**
 * @param {any} raw Answers
 */
export function buildContext(raw: Answers): Ctx {
  const a = effectiveAnswers(raw);
  const err = validateName(a.name);
  if (err) throw new Error(`invalid project name "${a.name}": ${err}`);
  const binErr = a.bin ? validateBin(a.bin) : null;
  if (binErr) throw new Error(`invalid binary name "${a.bin}": ${binErr}`);
  const workspace = a.kind === 'workspace';
  const hasGui = a.kind === 'gui' || workspace;

  /** @type {Set<string>} */
  const flags: Set<string> = new Set();
  flags.add(`kind_${a.kind}`);
  flags.add(`edition_${a.edition}`);
  flags.add(workspace ? 'workspace' : 'single');
  if (hasGui) {
    flags.add('has_gui');
    flags.add(`gui_${a.guiStack.replace(/-/g, '_')}`);
  }
  if (a.kind !== 'lib') flags.add('has_bin');
  if (a.bin) flags.add('custom_bin');
  const lf = LICENSE_FLAG[/** @type {keyof typeof LICENSE_FLAG} */ (a.license as keyof typeof LICENSE_FLAG)];
  if (!lf) throw new Error(`unknown license ${a.license}`);
  flags.add(lf);
  flags.add(`log_${a.crates.logging}`);
  flags.add(`async_${a.crates.async}`);
  flags.add(`http_${a.crates.http}`);
  flags.add(`errors_${a.crates.errors}`);
  // Options the kind never generates are already false here (see effectiveAnswers).
  for (const group of [a.crates, a.features, a.tooling]) {
    for (const [k, v] of Object.entries(group)) if (v === true) flags.add(k);
  }

  const appCrate = workspace ? `${a.name}-app` : a.name;
  const year = String(new Date().getFullYear());
  /** @type {Record<string,string>} */
  const tokens: Record<TokenKey,string> = {
    name: a.name,
    // The command's name. Without --bin a workspace's executable file is still <name>-app
    // (templates switch on the custom_bin flag where the file name matters).
    bin: a.bin || a.name,
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
