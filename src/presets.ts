import type { Answers, PartialAnswers } from './types.ts';
/** Defaults (the author's conventions) and presets. See docs/PLAN.md section 2. */

export const DEFAULTS: Answers = Object.freeze<Answers>({
  name: 'my-app',
  displayName: '',
  tagline: 'A Rust app.',
  author: 'Lawrence Norton',
  github: 'lnorton89',
  email: '',
  license: 'MIT',
  edition: '2024',
  msrv: '1.98',
  toolchain: '1.99.1',
  accent: '#00e5ff',
  kind: 'gui',
  guiStack: 'eframe',
  crates: { errors: 'anyhow', thiserror: false, logging: 'log', serde: true, async: 'none', http: 'none', sqlite: false, clap: true },
  features: { themes: true, brand: true, motion: true, icons: true, config: true, winres: true, tray: false, singleInstance: false, commandPalette: false, screenshotExample: false },
  tooling: { ci: true, release: true, cargoDeny: true, dependabot: true, toolchainPin: true, agentDocs: true, headerCheck: true, unsafeCheck: true, changelogGen: true, issueTemplates: true, codeowners: true, securityMd: true },
  // fetch (seconds) by default; a full check of a GUI project compiles eframe/wgpu (minutes).
  post: { git: true, fetch: true, cargoCheck: false, open: 'none' },
  preset: null,
});

/** @type {Record<string, { label: string, hint: string, answers: any }>} */
export const PRESETS: Record<string, { label: string, hint: string, answers: PartialAnswers }> = {
  rustaman: {
    label: 'Desktop app',
    hint: 'egui + wgpu · themes, icons, settings',
    answers: { kind: 'gui', guiStack: 'eframe', edition: '2024', license: 'MIT', features: { screenshotExample: true } },
  },
  strobe: {
    label: 'Desktop workspace',
    hint: 'app + xtask crates · winit + egui_glow',
    answers: { kind: 'workspace', guiStack: 'winit-glow', edition: '2024', license: 'MIT+CommonsClause', crates: { thiserror: true } },
  },
  cli: {
    label: 'Command-line tool',
    hint: 'clap · anyhow · env_logger',
    answers: { kind: 'cli', crates: { logging: 'env_logger' } },
  },
  tui: {
    label: 'Terminal UI',
    hint: 'ratatui · crossterm',
    answers: { kind: 'tui', crates: { logging: 'log' } },
  },
  lib: {
    label: 'Library',
    hint: 'thiserror · docs.rs ready · dual licence',
    answers: { kind: 'lib', license: 'MIT OR Apache-2.0', crates: { thiserror: true, clap: false } },
  },
  minimal: {
    label: 'Minimal',
    hint: 'Cargo.toml, strict lints, main.rs, CI',
    answers: {
      kind: 'cli',
      crates: { serde: false, logging: 'log', clap: false },
      tooling: { ci: true, release: false, cargoDeny: false, dependabot: false, toolchainPin: true, agentDocs: false, headerCheck: false, unsafeCheck: false, changelogGen: false, issueTemplates: false, codeowners: false, securityMd: false },
    },
  },
};

/** Deep-merge plain objects (arrays and scalars replace). */
export function merge<T>(base: T, over?: unknown): T {
  if (!over) return structuredClone(base);
  const out = structuredClone(base) as Record<string, unknown>;
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') out[k] = merge(out[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** @param {string | null | undefined} preset @param {any} [overrides] */
export function resolveAnswers(preset: string | null | undefined, overrides?: PartialAnswers): Answers {
  let a: Answers = structuredClone(DEFAULTS);
  if (preset) {
    const p = PRESETS[preset];
    if (!p) throw new Error(`unknown preset "${preset}". Try: ${Object.keys(PRESETS).join(', ')}`);
    a = merge(a, p.answers);
    a.preset = preset;
  }
  return merge(a, overrides);
}
