/**
 * Human words for every option. Prompts, the review screen and `--help` all read from here, so a
 * key like `singleInstance` never reaches the user as `singleInstance`.
 */
import type { Answers } from '../types.ts';

export interface Choice { label: string; hint: string; group: string }

type FeatureKey = keyof Answers['features'];
type ToolingKey = keyof Answers['tooling'];

export const FEATURES: Record<FeatureKey, Choice> = {
  themes: { label: 'Themes', hint: 'built-in palettes + user themes from a folder', group: 'look' },
  motion: { label: 'Motion', hint: 'eased transitions for panels and dialogs', group: 'look' },
  icons: { label: 'Icons', hint: 'vector icon set on a 16px grid', group: 'look' },
  brand: { label: 'Brand mark', hint: 'logo geometry + colours from your accent', group: 'look' },
  config: { label: 'Settings file', hint: 'remembers choices in your config dir', group: 'behaviour' },
  tray: { label: 'Tray icon', hint: 'minimise to the notification area', group: 'behaviour' },
  singleInstance: { label: 'Single instance', hint: 'a second launch focuses the running window', group: 'behaviour' },
  commandPalette: { label: 'Command palette', hint: 'Ctrl+K fuzzy search over every action', group: 'behaviour' },
  winres: { label: 'Windows resources', hint: 'exe icon, manifest, version info', group: 'packaging' },
  screenshotExample: { label: 'Screenshot example', hint: 'renders the UI headlessly to PNG', group: 'packaging' },
};

export const TOOLING: Record<ToolingKey, Choice> = {
  ci: { label: 'CI', hint: 'fmt · clippy -D warnings · tests on Windows + Linux', group: 'github' },
  release: { label: 'Releases', hint: 'tag → zip + SBOM + signed provenance', group: 'github' },
  dependabot: { label: 'Dependabot', hint: 'weekly grouped dependency PRs', group: 'github' },
  issueTemplates: { label: 'Issue forms', hint: 'bug + feature forms, PR template', group: 'github' },
  codeowners: { label: 'CODEOWNERS', hint: 'you review everything by default', group: 'github' },
  cargoDeny: { label: 'cargo-deny', hint: 'licence allow-list, advisories, sources', group: 'guardrails' },
  toolchainPin: { label: 'Pinned toolchain', hint: 'rust-toolchain.toml + a test that CI matches it', group: 'guardrails' },
  headerCheck: { label: 'Header check', hint: 'every .rs file opens with a module banner', group: 'guardrails' },
  unsafeCheck: { label: 'Unsafe boundary', hint: 'unsafe only in src/win/, one FFI call per fn', group: 'guardrails' },
  changelogGen: { label: 'Changelog', hint: 'generated from conventional commits', group: 'docs' },
  securityMd: { label: 'SECURITY.md', hint: 'private reporting via GitHub advisories', group: 'docs' },
  agentDocs: { label: 'Agent docs', hint: 'AGENTS.md + CLAUDE.md with the house rules', group: 'docs' },
};

export const CRATE_TOGGLES = {
  clap: { label: 'clap', hint: 'argument parsing with derive', group: 'core' },
  serde: { label: 'serde + toml', hint: 'config and data files', group: 'core' },
  thiserror: { label: 'thiserror', hint: 'typed errors for a library surface', group: 'core' },
  sqlite: { label: 'SQLite', hint: 'rusqlite, bundled, with a migrations table', group: 'data' },
} as const satisfies Record<string, Choice>;

export const LOGGING: Record<Answers['crates']['logging'], Choice> = {
  log: { label: 'log', hint: 'the facade, with a tiny built-in logger', group: '' },
  env_logger: { label: 'env_logger', hint: 'RUST_LOG-driven, the usual CLI choice', group: '' },
  tracing: { label: 'tracing', hint: 'spans + structured events', group: '' },
};

export const ASYNC: Record<Answers['crates']['async'], Choice> = {
  none: { label: 'none', hint: 'plain threads; simplest to reason about', group: '' },
  tokio: { label: 'tokio', hint: 'multi-threaded runtime + #[tokio::main]', group: '' },
};

export const HTTP: Record<Answers['crates']['http'], Choice> = {
  none: { label: 'none', hint: 'no HTTP client', group: '' },
  ureq: { label: 'ureq', hint: 'small, blocking, rustls', group: '' },
  reqwest: { label: 'reqwest', hint: 'async, JSON, rustls', group: '' },
};

export const LICENSES: Record<Answers['license'], Choice> = {
  MIT: { label: 'MIT', hint: 'short and permissive', group: '' },
  'MIT OR Apache-2.0': { label: 'MIT OR Apache-2.0', hint: 'the Rust ecosystem default', group: '' },
  'Apache-2.0': { label: 'Apache-2.0', hint: 'permissive with a patent grant', group: '' },
  'MIT+CommonsClause': { label: 'MIT + Commons Clause', hint: 'source-available, no reselling', group: '' },
};

export const STACKS: Record<Answers['guiStack'], Choice> = {
  eframe: { label: 'eframe (wgpu)', hint: 'batteries included; the simple path', group: '' },
  'winit-glow': { label: 'winit + glow', hint: 'your own event loop and GL context', group: '' },
};

export const KINDS: Record<Answers['kind'], string> = {
  gui: 'desktop app', workspace: 'desktop workspace', cli: 'command-line tool', tui: 'terminal UI', lib: 'library',
};

/** Group a label catalogue into `{ group: keys[] }`, preserving declaration order. */
export function grouped<K extends string>(catalogue: Record<K, Choice>): Record<string, K[]> {
  const out: Record<string, K[]> = {};
  for (const key of Object.keys(catalogue) as K[]) (out[catalogue[key].group] ??= []).push(key);
  return out;
}
