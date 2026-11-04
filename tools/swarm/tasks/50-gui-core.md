---
title: GUI app templates (eframe stack, rustaman-style)
owns: [templates/gui/**, templates/gui-features/**]
depends: []
gate: node scripts/scaffold-check.mjs rustaman && node scripts/scaffold-check.mjs rustaman --out .scratch/gui-all --set features.tray=true --set features.singleInstance=true --set features.commandPalette=true --set edition=2024 && node scripts/scaffold-check.mjs rustaman --out .scratch/gui-bare --set features.themes=false --set features.brand=false --set features.motion=false --set features.icons=false --set features.config=false --set features.winres=false
---
Port rustaman's GUI skeleton into templates: the polished app shell without the task-manager domain.
Read rustaman's src/ thoroughly first (brand.rs, color.rs, theme/, motion.rs, icon.rs, config.rs,
gui/**, win/**, build.rs, assets/, examples/). Follow CONTRACTS.md "GUI runtime seam" exactly (another
worker builds the winit+glow runtime against it, after you) and "Crate shape every kind follows".

templates/gui/files is mounted at the crate root, or at `crates/<name>-app/` in workspaces, so use only
crate-relative paths; window title / app id use `@@displayName@@` / `@@name@@`:

- `src/main.rs` (`windows_subsystem` attr, parse Cli, run, errors → `win::dialog::show_error` on Windows,
  stderr elsewhere), `src/lib.rs`, `src/cli.rs`, `src/brand.rs` (NAME, TAGLINE, mark geometry, colours
  derived from `@@accent@@`), `src/color.rs` (OKLCh), `src/theme/mod.rs` + `assets/themes.toml` (the
  themes from rustaman's catalog; user override dir; WCAG contrast tests), `src/motion.rs`, `src/icon.rs`,
  `src/config.rs`, `src/gui/{mod.rs,font.rs,icons.rs}`, `src/gui/app/mod.rs` (a demo screen: sidebar +
  header + a cards grid + a settings modal with a theme picker — show off theme, motion and icons),
  `src/gui/ui/{mod,chrome,theme,motion,icon,widgets,settings,modal}.rs`, `src/gui/run.rs` (eframe;
  the gui-glow group replaces this file for `gui_winit_glow`), `src/win/{mod,dialog,strings}.rs`
  (safe-leaf FFI over windows-sys), `build.rs` (winresource icon + manifest + version info when `winres`;
  otherwise a trivial build script or none — drop via manifest.js), `assets/@@name@@.manifest.tmpl`,
  an app icon (generate a real small multi-size .ico now with a node one-off and commit it as a binary
  template file; rename via the path token), `examples/brand_assets.rs`, `examples/screenshot.rs`
  (only with `screenshotExample`, egui_kittest), `docs/ARCHITECTURE.md`.
- Each feature flag (themes, brand, motion, icons, config, winres) must be independently removable:
  directives in the code, manifest.js drops the files. The gate covers all-on, all-off and extras.
- templates/gui/deps.js: egui 0.37 always; eframe 0.37 (default-features=false, ["wgpu","default_fonts"])
  only with `gui_eframe`; windows-sys 0.61 under `cfg(windows)` with the features your win/ code needs;
  winresource 0.1 (build) with `winres`; egui_kittest dev with `screenshotExample`; anything else you need.
- templates/gui-features/files: tray (`src/tray.rs` + `src/win/tray.rs`, tray-icon crate or
  Shell_NotifyIcon), single instance (`src/win/single_instance.rs`, named mutex, safe leaf), command
  palette (`src/command_palette.rs` + `src/gui/ui/command_palette.rs`, fuzzy filter, Ctrl+K). Hook them
  in with directives in the gui files (`// @if tray` …) and a manifest.js that drops each unless its
  flag is on. Every combination in the gate must pass fmt, clippy -D warnings and tests on Windows.
