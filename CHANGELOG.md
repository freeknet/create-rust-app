# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- An interactive run into an occupied folder carried on after the failed write: it ran `git init`,
  committed what was there, printed success and exited 0. Occupied folders are now refused before
  any question (unless `--force`), and a failed write stops the run with exit code 1.
- Animated prompts no longer flicker.

### Changed

- The classic Windows console gets 24-bit colour, block letters and a glyph set its font can draw,
  instead of an ASCII fallback.
- Motion: shimmering focused option, cycling marker, wave spinner, live file and crate counters,
  cascading review, closing sparkle. Off for pipes, CI, `NO_COLOR` and 16-colour terminals.
- `npm run build` starts from a clean `dist/`, so removed sources can't ship.
- The Desktop app preset (`rustaman`) defaults to Rust 2024.
- Interactive flow rebuilt: name → what you're building → a plain-words review with Create /
  Customize… / Cancel, instead of 20+ sequential questions. Every option shows a description;
  choices echo as short labels.
- Block-letter Prism wordmark; next-steps box; the finish screen prints a reproducible
  non-interactive command.
- Post-step defaults: `cargo fetch` on, `cargo check` off (`--cargo-check` to opt in) — a GUI
  project's check compiles eframe/wgpu and took minutes.
- `--help` describes every `--with` / `--without` name; `--yes` prints the review instead of a file
  tree. Prompts are drawn on @clack/core; @clack/prompts is gone.

### Added

- Project README covering presets, CLI flags, Rust conventions, and contributing.
- MIT license, copyright 2026 Lawrence Norton.
- Node 20, 22, and 26 CI on Linux and Windows, plus per-preset Rust scaffold checks.
- Weekly Dependabot updates for npm dependencies and GitHub Actions.
- In-process preset e2e checks for rendered tokens, directives, unique destinations,
  and path-derived Rust module headers.
