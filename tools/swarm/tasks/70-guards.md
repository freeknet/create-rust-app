---
title: Convention guards (header, unsafe boundary, toolchain pin)
model: gpt-6.1-sol
effort: medium
owns: [templates/guards/**]
depends: [cli-tui-lib]
gate: node scripts/scaffold-check.mjs cli && node scripts/scaffold-check.mjs lib && node scripts/scaffold-check.mjs tui
---
Port rustaman's `src/header_check.rs`, `src/unsafe_check.rs` and `tests/toolchain_pin.rs` into
templates/guards/files (mounted at the app crate root). Generalise per CONTRACTS.md "Crate shape every
kind follows": crate name from `env!("CARGO_PKG_NAME")`, workspace prefix when the crate sits under
`crates/`, module naming identical to src/gen/header.js (read it), toolchain file at `./` or `../../`,
workflows at the repo root's `.github/workflows`.

- `header_check.rs` only with `headerCheck`; `unsafe_check.rs` only with `unsafeCheck`, allowing `unsafe`
  only under `src/win/` and `src/gui/run/`; `tests/toolchain_pin.rs` only with `toolchainPin`, skipping
  workflows without a `toolchain:` key and skipping cleanly when `.github` is absent. Drop files via
  manifest.js.
- Also own the single-crate changelog generator: `examples/changelog.rs` (port rustaman's; regenerates
  CHANGELOG.md from conventional commits via `git log`), only with `changelogGen & single` (workspaces
  use `cargo xtask changelog`). Drop it via manifest.js otherwise.
- Your gate scaffolds include the cli/tui/lib templates (merged before you start): the header check must
  pass on them. If a template header is wrong, report it; don't edit other groups.
