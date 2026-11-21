# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- A workspace scaffolded `--without changelogGen` no longer ships `cargo xtask changelog`, which
  would have rewritten the hand-edited CHANGELOG.md: the module, command and help text are gated.
- Generated projects are `cargo fmt --check` clean for every project name from 1 to 64 characters:
  lines that grew with the name (GUI `build.rs`, `main.rs`, `config.rs`, the screenshot and brand
  examples, CLI `main.rs` and tests, the TUI log path) now name the crate through a short alias
  (`use <crate> as app;`) or a constant, so rustfmt's layout no longer depends on the name.
  GUI projects of 14+ characters, workspaces of 16+, used to fail. `test/name-length.test.ts`
  guards it.
- Projects with long names pass their own header check: `Dependencies:` lines name "the library
  crate" instead of its (up to 68-character) path, and the check no longer counts the `Module:`
  line, whose value is the file's path, against the 100-column limit.
- `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps` passes on eframe GUI projects (a private and a
  redundant intra-doc link in `src/gui/run.rs`) and with `--with tray` off Windows (`src/tray.rs`
  linked the Windows-only `win::tray`), and for a `cli` with SQLite (`src/db.rs` linked the private
  `MIGRATIONS`).
- Generated docs say what the project has: the `unsafe` boundary check names `src/win/` (plus
  `src/gui/run/` on winit-glow) instead of a `src/gui/run/` an eframe project doesn't have, and
  the app and shortcut docs mention the tray and command palette only when they are enabled.
- Project names that cannot build are refused up front, on the command line and in the name
  prompt: Rust keywords from every edition (`fn`, `type`, `gen`, `try` …), Cargo-reserved names
  (`build`, `deps` …), Windows device names (`con`, `nul` …), and names over 64 characters (the
  crates.io limit, which `--bin` now shares). A long name used to die mid-write.
- A target folder whose name can't be a crate name (`create-rust-app MyDir -y`) still gets the
  default crate name, but a one-line note on stderr now says so and points at `--name`.
- An MSRV newer than the pinned toolchain, or older than the edition allows (2024 needs 1.85),
  is an argument error (exit 2), whether it came from `--msrv`, `--toolchain`, `--set` or a preset.
  It used to scaffold a project cargo then refused to build.
- Options the chosen kind ignores (`--preset lib --with tray`, `--preset lib --bin foo`,
  `--preset cli --gui winit-glow`, `subcommands` on a TUI or without clap) each print a one-line
  note on stderr instead of vanishing silently; `--quiet` hides them. `--json` reports `guiStack`
  as `""` for kinds without a GUI, as it already did `themeBase`.
- An empty tagline reads as the project name everywhere: the README's bold line used to come out
  as `****` while `Cargo.toml` already fell back to the name.
- Scaffolding into a folder that holds only a fresh `git init` makes the first commit there,
  staging the generated files by path (anything else in the folder stays untracked). Inside some
  other repository git is still skipped, and the finished summary no longer promises a commit.
- A write that fails midway no longer leaves a partial project: a folder the run created is
  removed, and in an existing folder only the files the run added are, with the error saying
  which. `--force` lists the existing files it overwrote on stderr.
- The "again without prompts" command recreates the same project: it carries `--accent`,
  `--author`, `--github`, display name and email, names the real target folder, and adds `--name`
  when the crate name differs from the folder's.
- `--help`, the README and CONTRACTS say what `--json` does without `--dry-run`: it writes the
  files but skips fetch, git, cargo check and `--open`.

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
- Generated workflows check out with `persist-credentials: false`, so the job token is not left
  in `.git/config` for build scripts to read (zizmor `artipacked`). No step needed it: `gh`
  authenticates with `GH_TOKEN`.
- The generated release build no longer restores `Swatinem/rust-cache`: the Actions cache is
  writable from any branch's CI, so a tagged build could have shipped a poisoned entry (zizmor
  `cache-poisoning`, high).
- A fresh project's `CHANGELOG.md` is what its generator writes: `cargo run --example changelog --
  --check` passes straight after scaffolding and regenerating is a no-op (`cargo xtask changelog`
  on workspaces too). Both generators share the header, `Unreleased` entries carry no commit hash
  (released ones still do), and CLAUDE.md / CONTRIBUTING.md say the file is generated and name
  the command whenever the generator ships.
- Generated docs: the README says a theme is eleven colours, as the themes do; CLAUDE.md and
  CONTRIBUTING.md no longer claim a check enforces `assert!` messages, and list every place the
  header check walks (`benches/`, `build.rs` too) with each module-name form; the GUI README lists
  the Linux runtime libraries; CONTRIBUTING says attestation needs a public repository or GitHub
  Enterprise Cloud; the release workflow's matrix comment says what else a new target needs.
- This repo's docs match the code: CONTRACTS lists `post.fetch` and every binary extension the
  engine copies raw, PLAN's `npm pack` check names `dist/` and `templates/`, and the changelog's
  CI line names Node 22 and 26 (the `engines` floor is 22.18).
- This repo's CI pins `actions/setup-node` to a full commit SHA (v7.1.0) and checks out without
  persisting the token.

### Changed

- TUI projects build on ratatui 0.30 and crossterm 0.29 (were 0.29 and 0.28); the templates needed
  no code changes, and the scaffold still builds on the 1.98 MSRV.
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

- `scaffold-check` gains `--gate fmt` (rustfmt only, no build), `--gate doc` (`cargo doc --no-deps`
  with `RUSTDOCFLAGS=-D warnings`, opt-in) and `--name <name>`; it splits `--set` on the first `=`
  and keeps an existing `CARGO_TARGET_DIR`.
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
- Node 22 and 26 CI on Linux and Windows, plus per-preset Rust scaffold checks.
- Weekly Dependabot updates for npm dependencies and GitHub Actions.
- In-process preset e2e checks for rendered tokens, directives, unique destinations,
  and path-derived Rust module headers.
