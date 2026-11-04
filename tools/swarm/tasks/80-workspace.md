---
title: Workspace layout (strobe-style) + xtask
owns: [templates/workspace/**]
depends: [gui-glow]
gate: node scripts/scaffold-check.mjs strobe && node scripts/scaffold-check.mjs strobe --out .scratch/ws-eframe --set guiStack=eframe
---
The `workspace` kind (strobe preset). Root `Cargo.toml`, `crates/<name>-app/Cargo.toml` and
`crates/xtask/Cargo.toml` are already generated (src/gen/cargo.js), and the GUI app code is mounted into
`crates/<name>-app/` by the gui groups. You add, in templates/workspace/files:

- `_cargo/config.toml` (alias `xtask = "run -p xtask --"`).
- `crates/xtask/src/{main.rs,ci.rs,changelog.rs}` modelled on strobe's xtask: `cargo xtask ci` runs
  fmt/clippy/test/deny like CI; `cargo xtask changelog` regenerates CHANGELOG.md from conventional
  commits via `git log`. Same lints and header banners (`crates/xtask/src/ci.rs` → `xtask::ci`).
- `THIRD_PARTY.md`, `_mailmap`, `docs/DECISIONS.md` + `docs/decisions/D1.md` (strobe's decision-record
  format; D1 = "workspace layout").
- `templates/workspace/deps.js` for xtask deps (`crate: 'xtask'`, e.g. anyhow).
