---
title: Rust templates for cli, tui and lib kinds
model: gpt-6.1-sol
effort: high
owns: [templates/cli/**, templates/tui/**, templates/lib/**]
depends: []
gate: node scripts/scaffold-check.mjs cli && node scripts/scaffold-check.mjs tui && node scripts/scaffold-check.mjs lib && node scripts/scaffold-check.mjs minimal && node scripts/scaffold-check.mjs cli --out .scratch/cli-max --set crates.async=tokio --set crates.http=reqwest --set crates.sqlite=true --set crates.logging=tracing
---
Write the Rust source templates for three kinds. Every .rs file opens with the header banner using
`@@module@@` (PLAN.md §1), then `//!` docs that explain *why*, house-style. Respect the lint block
(no unwrap/expect/panic in non-test code, `#[expect(.., reason = "..")]` never allow, docs on every
pub item, no unreachable pub). Follow "Crate shape every kind follows" in CONTRACTS.md (lib.rs + thin
main.rs + the guard hooks verbatim). Adapt to the `crates` flags with directives: `log_env_logger` /
`log_tracing` / `log_log` init, `async_tokio` (`#[tokio::main]`), `http_ureq` / `http_reqwest` (a small
`fetch` subcommand), `sqlite` (a `db` module opening `<data_dir>/<name>.db` with a migrations table),
`serde` + `config` (config.rs like rustaman's: every field Option, forgiving parse, atomic temp+rename
write; `dirs` is a base dep then), `clap` (derive `Cli`, `#[command(name, version, about)]`, exit code 2
for usage errors). Without `clap` parse nothing and run the default action.

- cli: `src/main.rs`, `src/lib.rs`, `src/cli.rs`, `src/config.rs` (serde & config only — drop via
  manifest.js), `src/logging.rs`, `tests/cli.rs` (calls the lib entry point, returns anyhow::Result,
  every assert has a message).
- tui: ratatui 0.29 + crossterm 0.28 (declare in templates/tui/deps.js): `src/main.rs`, `src/lib.rs`,
  `src/app.rs` (state + update), `src/ui.rs` (a rainbow-gradient title bar seeded from `@@accent@@`, a
  list, a status line with key hints), `src/event.rs` (crossterm events + tick), terminal restore on
  error and in a panic hook. Unit tests for app state transitions.
- lib: `src/lib.rs` (crate docs with a doctest, `#![cfg_attr(docsrs, feature(doc_cfg))]`),
  `src/error.rs` (thiserror `Error` + `Result` alias), one small real module with tests,
  `examples/basic.rs`, `tests/api.rs`. No main.rs.
- The `minimal` preset is kind cli with serde/config/clap off and most tooling off: the cli templates
  must compile under every combination of those flags. Use per-kind `deps.js` for crates beyond base deps.
