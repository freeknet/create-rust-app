# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Interactive flow rebuilt: name → what you're building → a plain-words review with Create /
  Customize… / Cancel, instead of 20+ sequential questions. Every option shows a description;
  choices echo as short labels.
- Block-letter Prism wordmark; next-steps box; the finish screen prints a reproducible
  non-interactive command.
- Post-step defaults: `cargo fetch` on, `cargo check` off (`--cargo-check` to opt in) — a GUI
  project's check compiles eframe/wgpu and took minutes.
- `--help` describes every `--with` / `--without` name; `--yes` prints the review instead of a file
  tree. Moved to @clack/prompts 1.8 + @clack/core.

### Added

- Project README covering presets, CLI flags, Rust conventions, and contributing.
- MIT license, copyright 2026 Lawrence Norton.
- Node 20, 22, and 26 CI on Linux and Windows, plus per-preset Rust scaffold checks.
- Weekly Dependabot updates for npm dependencies and GitHub Actions.
- In-process preset e2e checks for rendered tokens, directives, unique destinations,
  and path-derived Rust module headers.
