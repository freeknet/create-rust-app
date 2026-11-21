import type { Answers, Ctx, PartialAnswers, ReportedAnswers, TokenKey } from './types.ts';
import { DEFAULT_BASE, shippedTheme } from './gen/themes.ts';
/** Answers → Ctx (see docs/CONTRACTS.md). */

export const NAME_RE = /^[a-z][a-z0-9-]*$/;

/** crates.io refuses longer package names; the binary name gets the same cap. */
export const MAX_NAME_LENGTH = 64;

/**
 * Rust keywords from the Reference (strict and reserved, every edition through 2024). A crate
 * name is a Rust identifier once dashes become underscores, so none of these can be one; Cargo
 * refuses them too. Weak keywords (`union`, `macro_rules`, `raw`, `safe`) are ordinary identifiers.
 */
export const RUST_KEYWORDS: readonly string[] = [
  // strict, 2015
  'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern', 'false', 'fn', 'for', 'if',
  'impl', 'in', 'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return', 'self',
  'static', 'struct', 'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
  // strict, 2018+
  'async', 'await', 'dyn',
  // reserved, 2015
  'abstract', 'become', 'box', 'do', 'final', 'macro', 'override', 'priv', 'typeof', 'unsized',
  'virtual', 'yield',
  // reserved, 2018+ and 2024+
  'try', 'gen',
];

/** Crates every program already has in scope: a crate of the same name shadows them. */
const BUILTIN_CRATES: readonly string[] = ['test', 'core', 'std', 'alloc', 'proc-macro'];

/** Cargo refuses these as package and target names: they collide with directories under target/. */
export const CARGO_RESERVED: readonly string[] = ['deps', 'examples', 'build', 'incremental'];

/** Every project builds a Windows .exe, and Windows treats these as devices, not files. */
export const WINDOWS_DEVICE_RE = /^(con|prn|aux|nul|com\d|lpt\d)$/;

const tooLong = (name: string) =>
  `Use at most ${MAX_NAME_LENGTH} characters (the crates.io limit); this one has ${name.length}.`;

/** Rules a crate name and a binary name share: Cargo's reserved names and Windows device names. */
function reservedProblem(name: string): string | null {
  if (CARGO_RESERVED.includes(name)) return `"${name}" is reserved by Cargo.`;
  if (WINDOWS_DEVICE_RE.test(name)) return `"${name}" is a reserved device name on Windows.`;
  return null;
}

/** @param {string} name */
export function validateName(name: string) {
  if (name.length > MAX_NAME_LENGTH) return tooLong(name);
  if (!NAME_RE.test(name)) return 'Use lowercase letters, digits, and dashes, starting with a letter.';
  if (name.endsWith('-') || name.includes('--')) return 'No trailing or doubled dashes.';
  if (BUILTIN_CRATES.includes(name)) return `"${name}" is reserved in Rust.`;
  if (RUST_KEYWORDS.includes(name)) return `"${name}" is a Rust keyword, so it can't name a crate.`;
  return reservedProblem(name);
}

/** A binary name: what users type, so the same rules as a crate name plus underscores. */
export function validateBin(bin: string) {
  if (bin.length > MAX_NAME_LENGTH) return tooLong(bin);
  if (!/^[a-z][a-z0-9_-]*$/.test(bin)) return 'Use lowercase letters, digits, dashes and underscores, starting with a letter.';
  return reservedProblem(bin);
}

/** The first Rust release that accepts each edition (2021: 1.56.0, 2024: 1.85.0). */
export const EDITION_MIN_RUST: Record<Answers['edition'], string> = { 2021: '1.56', 2024: '1.85' };

/** `1.98` / `1.99.1` → [1, 98, 0] / [1, 99, 1]; null when it isn't a Rust version number. */
function versionParts(v: string): number[] | null {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(v)) return null;
  const parts = v.split('.').map(Number);
  return parts.length === 2 ? [...parts, 0] : parts;
}

function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
  return 0;
}

/**
 * Cross-field check of the Rust versions: the pinned toolchain must be able to build the crate
 * (`msrv` ≤ `toolchain`) and the MSRV must know the edition. Returns the problem, or null.
 */
export function validateRustVersions(msrv: string, toolchain: string, edition: Answers['edition']): string | null {
  const m = versionParts(msrv);
  const t = versionParts(toolchain);
  if (!m) return `msrv "${msrv}" is not a Rust version number, such as 1.98.`;
  if (!t) return `toolchain "${toolchain}" is not a Rust version number, such as 1.99.1.`;
  const needed = EDITION_MIN_RUST[edition];
  const n = versionParts(needed);
  if (n && compareVersions(m, n) < 0) return `edition ${edition} needs Rust ${needed} or newer, but msrv is ${msrv}. Raise --msrv or pick another --edition.`;
  if (compareVersions(m, t) > 0) return `msrv ${msrv} is newer than toolchain ${toolchain}, so the pinned toolchain can't build the crate. Lower --msrv or raise --toolchain.`;
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
    out.themeBase = '';
  }
  // The GUI kinds always ship a config file; the CLI only when serde is on to read it. A library
  // leaves config to the app embedding it, and the TUI template has none.
  if (!hasGui && !(a.kind === 'cli' && a.crates.serde)) out.features.config = false;
  // Subcommands shape a clap command line: the cli kind's commands, or a desktop app's headless
  // jobs. A TUI or a library has no place for them, and without clap there is no parser.
  if (!a.crates.clap || !(a.kind === 'cli' || hasGui)) out.features.subcommands = false;
  // A library has no binary, and a binary named like its crate needs no [[bin]] table.
  if (a.kind === 'lib' || a.bin === (a.kind === 'workspace' ? `${a.name}-app` : a.name)) out.bin = '';
  return out;
}

/**
 * What `--json` reports: the effective answers, with `guiStack` blanked like `themeBase` for kinds
 * without a GUI. The Ctx keeps a stack value (no flag reads it without a GUI), so files don't change.
 */
export function reportedAnswers(a: Answers): ReportedAnswers {
  const out: ReportedAnswers = effectiveAnswers(a);
  if (!(a.kind === 'gui' || a.kind === 'workspace')) out.guiStack = '';
  return out;
}

const KIND_WORDS: Record<Answers['kind'], string> = {
  cli: 'a command-line tool', gui: 'a desktop app', tui: 'a terminal UI', lib: 'a library', workspace: 'a desktop workspace',
};

/**
 * Options the user set explicitly (`overrides`: flags and `--set`) that the chosen kind never
 * generates, one human sentence each, e.g. `tray is ignored: a library has no desktop window.`
 * Only options turned on, or given a value, count; asking for `false` is never ignored.
 */
export function ignoredOptions(overrides: PartialAnswers, answers: Answers): string[] {
  const eff = effectiveAnswers(answers);
  const hasGui = answers.kind === 'gui' || answers.kind === 'workspace';
  const kind = KIND_WORDS[answers.kind];
  const out: string[] = [];
  if (overrides.guiStack !== undefined && !hasGui) out.push(`--gui ${overrides.guiStack} is ignored: ${kind} has no desktop window.`);
  if (overrides.themeBase !== undefined && !hasGui) out.push(`--base ${overrides.themeBase} is ignored: ${kind} has no desktop window.`);
  if (overrides.bin && answers.kind === 'lib') out.push(`--bin ${overrides.bin} is ignored: a library has no executable.`);
  for (const [k, v] of Object.entries(overrides.features ?? {}) as [keyof Answers['features'], boolean][]) {
    if (v !== true || eff.features[k]) continue;
    let why = `${kind} has no desktop window`;
    if (k === 'config') why = answers.kind === 'cli' ? 'a command-line tool reads a config file only with serde' : `${kind} ships no config file`;
    if (k === 'subcommands') why = answers.kind === 'cli' || hasGui ? 'subcommands need clap (--with clap)' : `${kind} has no command line to add them to`;
    out.push(`${k} is ignored: ${why}.`);
  }
  if (overrides.tooling?.unsafeCheck === true && !eff.tooling.unsafeCheck) out.push(`unsafeCheck is ignored: only the desktop kinds have an unsafe boundary to check.`);
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
  const base = shippedTheme(a.themeBase || DEFAULT_BASE);
  if (!base) throw new Error(`unknown theme base "${a.themeBase}"`);
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
  if (hasGui) flags.add(`base_${base.mode}`);
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
  // Resolved once so Cargo.toml, README and doc comments agree: an empty tagline reads as the name.
  const tagline = a.tagline.trim() ? a.tagline : a.name;
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
    tagline,
    author: a.author || '',
    github: a.github || '',
    email: a.email || '',
    year,
    license: a.license,
    edition: a.edition,
    msrv: a.msrv,
    toolchain: a.toolchain,
    accent: a.accent,
    // The --base theme's stated colours, for the signature theme (theme/mod.rs).
    baseName: base.name,
    baseMode: base.mode === 'light' ? 'Light' : 'Dark',
    baseApp: base.app,
    basePanel: base.panel,
    baseRaised: base.raised,
    baseHover: base.hover,
    baseBorder: base.border,
    baseText: base.text,
    baseTextMuted: base.text_muted,
    baseDanger: base.danger,
    baseWarning: base.warning,
    baseSuccess: base.success,
    baseSpan: Number.isInteger(base.rainbow_span) ? `${base.rainbow_span}.0` : String(base.rainbow_span),
    baseAccentRgb: [1, 3, 5].map((i) => `0x${base.accent.slice(i, i + 2).toLowerCase()}`).join(', '),
  };

  return {
    ...a,
    tagline,
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
