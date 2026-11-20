# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- Project names that cannot build are refused up front, on the command line and in the name
  prompt: Rust keywords from every edition (`fn`, `type`, `gen`, `try` …), Cargo-reserved names
  (`build`, `deps` …), Windows device names (`con`, `nul` …), and names over 64 characters (the
  crates.io limit, which `--bin` now shares). A long name used to die mid-write.

- A release build of a GUI app run from a terminal prints its `--help`, `--version`, usage errors
  and headless output: it attaches to the parent console just before printing
  (`src/win/console.rs`). Opening the window never attaches, so closing the terminal doesn't close
  the app, and Explorer launches are unchanged.
- The review panel and the next-steps box fit narrow terminals: below about 60 columns their right
  edges used to wrap onto the next line. Title facts that don't fit move into the panel, and the
  box drops its notes, then its frame, rather than overflow.
- `Cargo.lock` is part of the scaffold's first commit: `cargo fetch` now runs before `git init`,
  so a fresh project no longer starts with an untracked lockfile.
- `--json` reports the features a kind actually generates: desktop features read `false` for
  `cli` / `tui` / `lib`. A TUI no longer gets config-file bullets in its docs or an unused `dirs`.
- Generated header banners list the crates the project uses, not the template's options
  ("clap … when selected").
- Generated `--help` prints the Cargo description instead of the `Cli` struct's doc comment.
- A `cli` with `reqwest` and no tokio builds again (the blocking client asked for reqwest 0.12).
- The generated README's footer links to `github.com/freeknet/create-rust-app`.
- `npx github:freeknet/create-rust-app` works: a `prepare` script builds `dist/` on install. The
  README and the finish screen's reproduce command use it, since the npm name isn't published.

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

- `--with subcommands` on desktop apps: `app <job>` runs a headless job (`themes`, `paths` to start
  with) and exits, a bare run opens the window as before, and `tests/cli.rs` covers both paths.
- `--base <theme>`: lay the signature theme's accent on any shipped theme's surfaces, e.g.
  `--base graphite` for neutral greys behind media. The default (`midnight`) is unchanged, and the
  readability tests check the result in the generated project.
- `--without demo`: a GUI project starts from one empty page wired through the same page, shortcut
  and command-palette machinery, instead of the overview cards, palette and about pages. Pages are
  now additive: `Ctrl+1…9` and the palette follow `Page::ALL`, and `docs/ARCHITECTURE.md` explains
  adding one.
- `--with subcommands`: a `cli` built on a clap `Subcommand` enum (no wildcard dispatch) with
  matching integration tests, instead of the greeting demo.
- `--bin <name>`: an executable named differently from its crate. Writes `[[bin]]` and follows
  through clap, the README, the release workflow and the issue form. Also under Customize….
- README documents `--set`, `--bin` and `--preset custom`.
- Project README covering presets, CLI flags, Rust conventions, and contributing.
- MIT license, copyright 2026 Lawrence Norton.
- Node 20, 22, and 26 CI on Linux and Windows, plus per-preset Rust scaffold checks.
- Weekly Dependabot updates for npm dependencies and GitHub Actions.
- In-process preset e2e checks for rendered tokens, directives, unique destinations,
  and path-derived Rust module headers.
