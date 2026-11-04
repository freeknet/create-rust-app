// @ts-check
/** Defaults (the author's conventions) and presets. See docs/PLAN.md section 2. */

export const DEFAULTS = Object.freeze({
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
  post: { git: true, cargoCheck: true, open: 'none' },
  preset: null,
});

/** @type {Record<string, { label: string, hint: string, answers: any }>} */
export const PRESETS = {
  rustaman: {
    label: 'rustaman-style',
    hint: 'single-crate Windows GUI · eframe + wgpu',
    answers: { kind: 'gui', guiStack: 'eframe', edition: '2021', license: 'MIT', features: { screenshotExample: true } },
  },
  strobe: {
    label: 'strobe-style',
    hint: 'cargo workspace desktop app · winit + egui_glow · xtask',
    answers: { kind: 'workspace', guiStack: 'winit-glow', edition: '2024', license: 'MIT+CommonsClause', crates: { thiserror: true } },
  },
  cli: {
    label: 'cli',
    hint: 'clap + anyhow + env_logger, full tooling',
    answers: { kind: 'cli', crates: { logging: 'env_logger' } },
  },
  tui: {
    label: 'tui',
    hint: 'ratatui + crossterm terminal app',
    answers: { kind: 'tui', crates: { logging: 'log' } },
  },
  lib: {
    label: 'library',
    hint: 'publishable crate · thiserror · docs.rs ready',
    answers: { kind: 'lib', license: 'MIT OR Apache-2.0', crates: { thiserror: true, clap: false } },
  },
  minimal: {
    label: 'minimal',
    hint: 'Cargo.toml + lints + main + CI, nothing else',
    answers: {
      kind: 'cli',
      crates: { serde: false, logging: 'log', clap: false },
      tooling: { ci: true, release: false, cargoDeny: false, dependabot: false, toolchainPin: true, agentDocs: false, headerCheck: false, unsafeCheck: false, changelogGen: false, issueTemplates: false, codeowners: false, securityMd: false },
    },
  },
};

/** Deep-merge plain objects (arrays and scalars replace). */
export function merge(/** @type {any} */ base, /** @type {any} */ over) {
  if (!over) return structuredClone(base);
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over)) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') out[k] = merge(out[k], v);
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

/** @param {string | null | undefined} preset @param {any} [overrides] */
export function resolveAnswers(preset, overrides) {
  let a = structuredClone(DEFAULTS);
  if (preset) {
    const p = PRESETS[preset];
    if (!p) throw new Error(`unknown preset "${preset}". Try: ${Object.keys(PRESETS).join(', ')}`);
    a = merge(a, p.answers);
    a.preset = preset;
  }
  return merge(a, overrides);
}
