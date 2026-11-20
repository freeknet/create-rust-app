# Dogfood findings, November 2026

Findings from using create-rust-app end to end at commit `db3693d`: a 24-combination
scaffold matrix, 60+ scripted interactive runs through a pseudo-terminal, and four real
projects built on fresh scaffolds (a CLI log analyser, a TUI tail viewer, a duration-parsing
library and a GUI monitor page).

**Evidence.** The per-agent reports and friction logs are copied into
[`evidence/`](evidence/). They cite raw logs by paths such as `logs/matrix/rustaman/doc.log`;
those lived in a scratch directory outside the repo (`../cra-dogfood/`) and are not kept.
Every finding below names the repro command and the root cause `file:line` at `db3693d`.
Anything not reproduced is marked *hypothesis*.

Baseline before any change: `npm ci`, `npm run typecheck`, `npm test` (58/58), `npm run build`
and `scaffold-check minimal --gate check` all pass.

## 1. Bugs

Severity: **H** breaks a stated gate in normal use, **M** wrong output or silent misbehaviour,
**L** polish.

| # | Sev | Bug | Repro | Expected / actual | Root cause |
|---|---|---|---|---|---|
| B1 | H | GUI projects fail `cargo fmt --check` when the name has 14+ characters | `create-rust-app x --name abcdefghijklmn --preset rustaman -y --no-git --no-fetch && cd x && cargo fmt --all -- --check` | CONTRACTS says generated projects are fmt-clean under every flag combination; exit 1. Strobe fails by 16 characters. | Lines that grow with the name cross 100 columns: `templates/gui/files/src/config.rs:178`, `templates/gui/files/examples/screenshot.rs:38`, `templates/gui/files/src/main.rs:92,169`. The repo's own checks use `demo-rustaman` (13 characters), one under the threshold. |
| B2 | H | eframe GUI projects fail `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps` | `--preset rustaman -y`, then the doc command | Clean docs; exit 101 (`private_intra_doc_links`, `redundant_explicit_links`). Affects rustaman and custom; winit-glow passes. | `templates/gui/files/src/gui/run.rs:13,20` |
| B3 | M | `--with tray` breaks docs off Windows | `--preset rustaman --with tray -y`, doc command on Linux | Exit 101, `broken_intra_doc_links` | `templates/gui-features/files/src/tray.rs:11` links a `cfg(windows)` module |
| B4 | M | Rust keywords accepted as project names | `--name fn --preset minimal -y && cargo check` | Rejected like `test`/`std`; scaffold succeeds, then `expected identifier, found '::'` at `src/main.rs:17` | `src/context.ts:11` reserved list has no keywords |
| B5 | M | Cargo-reserved and Windows device names accepted as project names | name prompt or `--name build` / `deps` / `con` / `nul` | `--bin` rejects these; `--name` accepts them, and the binary defaults to the crate name | `validateName` (`src/context.ts:8`) does not apply the `validateBin` rules (`src/context.ts:17-24`) |
| B6 | M | No length limit on names; a long GUI name dies mid-write | `--name <260 chars> --preset rustaman -y` | Rejected up front (crates.io caps names at 64); `ENAMETOOLONG` during write, exit 1, partial project left behind | `src/context.ts:5` (`NAME_RE` unbounded); `src/engine/write.ts:33-38` has no cleanup on failure |
| B7 | M | A positional directory that is not a valid crate name silently becomes `my-app` | `create-rust-app MyDir --preset minimal -y` | An error or a notice; directory `MyDir`, crate `my-app`, nothing said | `src/cli.ts:190-193` |
| B8 | M | The recreate command drops `--accent`, `--author`, `--github` | Interactive run with `--preset rustaman --accent '#ff9f6e' --author 'Jane Q' --github janeq --with tray`, then run the printed command | Identical project; 14 files differ (LICENSE, CODEOWNERS, repository URLs, accent constant) | `src/reproduce.ts:18-55` has no branch for these answers |
| B9 | M | With a positional directory, renaming in Customize makes the review and the recreate command name the wrong folder | `create-rust-app fl-dir --preset cli`, Customize → Name → `fl-renamed` | Review says "writes ./fl-renamed"; files go to `fl-dir`; recreate command points at `fl-renamed` | `src/prompts.ts:149` uses `a.name`; target is `resolve(dir ?? answers.name)` at `src/cli.ts:222` |
| B10 | M | `--msrv` newer than `--toolchain` accepted | `--msrv 1.100 --toolchain 1.99.1 -y && cargo check` | Rejected; scaffolds, then cargo refuses to build. The prompt accepts MSRV 9.0 with toolchain 1.0.0. | `src/args.ts:93-94` and `src/prompts.ts:240-241` check the format only |
| B11 | M | Ctrl-C during `cargo fetch` leaves the cursor hidden and a half-finished folder, with no message | rustaman, Create, Ctrl-C one second into the fetch | Cursor restored and a line saying what was left; neither | `src/ui/rail.ts:273` hides the cursor and relies on `finally` (`:281`), which does not run on SIGINT. `src/ui/spinner.ts:48` and `src/ui/banner.ts:102` do install a handler. |
| B12 | M | With `--kind`, "Start over from a preset" ignores the preset picked | `--name fl-lib --kind lib`, Customize → Start over → Desktop app | A desktop app; still a library | `src/prompts.ts:158`: the flag's `kind` overrides the chosen preset |
| B13 | M | A fresh single-crate scaffold fails its own changelog check | `--preset cli -y && cargo run --example changelog -- --check` | Pass; fails, and running the generator rewrites the header | Header text differs: `templates/base/files/CHANGELOG.md:3` (`@@displayName@@`, hand-written wording) against `templates/guards/files/examples/changelog.rs:586-592` (`@@name@@`, "This file is generated"). The workspace generator differs again: `templates/workspace/files/crates/xtask/src/changelog.rs:152`. |
| B14 | M | Lists taller than the terminal do not scroll | 100×10 terminal, Customize → App features | Focused row stays visible; the row and the prompt message are off-screen and old frames are left behind | `src/ui/choose.ts:68-75,107-122` render every option with no window |
| B15 | M | At 40 columns option rows wrap | 40-column terminal, kind picker | Rows clipped to the width; rows and footers wrap | `src/ui/choose.ts:38` forces a minimum of 10 columns for the hint; footers at `:74,121` are not clipped |
| B16 | M | Without colour, multi-select focus and the text cursor are invisible | `NO_COLOR=1`, Customize → Tooling | Some non-colour marker; every row renders the same | Focus is shown only through `bold()`: `src/ui/choose.ts:118`, `src/ui/motion.ts:32` |
| B17 | L | `--no-color` still emits `ESC[7m` | `--no-color`, move the cursor left in the name prompt | No escape sequences | `src/ui/rail.ts:176` uses clack's `userInputWithCursor`, which sees `NO_COLOR` but not the flag |
| B18 | L | An empty tagline is written two ways | Customize → clear the tagline | Consistent; `Cargo.toml` falls back to the name, README gets `****` | `src/context.ts:121` against `src/gen/cargo.ts:130`; `templates/base/files/README.md:5` |
| B19 | L | A directory holding only a fresh `git init` gets no commit, but the summary says it will | `git init d && cd d && create-rust-app . --preset minimal -y` | First commit, or a summary that says git is skipped | `src/engine/write.ts:9` ignores a lone `.git`; `src/post/git.ts:28` then skips |
| B20 | L | `--json` reports `guiStack` for kinds without a GUI | `--preset cli --gui winit-glow --dry-run --json` | Blanked like `themeBase` | `src/context.ts:52-57` |
| B21 | L | `scaffold-check --set` cuts values at the first `=`, and it overrides `CARGO_TARGET_DIR` | `node scripts/scaffold-check.mjs cli --set tagline=a=b` | `description = "a=b"`; gets `"a"` | `scripts/scaffold-check.ts:39,66` |
| B22 | L | The TUI log file is created at a predictable `/tmp` path with `File::create`, which follows symlinks | read `templates/tui/files/src/logging.rs:29,34` | A per-user directory or `create_new` | Same lines. *Not exploited; reasoning from the code.* |

`--json` without `--dry-run` writes the files, skips fetch and git, and still reports
`post.git: true` (`src/cli.ts:226-230`). Whether it should run the post-steps is a
behaviour decision, so it is in the backlog (P3); the help text is fixed in the meantime.

## 2. Friction

Ranked by the time it cost across the four real projects and the interactive walk.

| # | Friction | Cost | Evidence |
|---|---|---|---|
| F1 | **Release workflow is Windows-only for every kind**, and its comment says another target is "just an entry". It is not: `.exe`, `7z` and a target-less SBOM name are hard-coded. | ~25 min (tui), ~15 min (gui), noted by cli | `templates/github/files/_github/workflows/release.yml:103-106,143-145,160,184-187,256-259` |
| F2 | **The CLI skeleton's `run(args, out)` has no stdin, terminal info or config injection**, and `config::load()` runs inside the command. A CLI that reads stdin rewrites lib, main and tests. | ~25 min (cli) | `templates/cli/files/src/lib.rs:70`, `templates/cli/files/src/cli_subcommands.rs:132` |
| F3 | **The `unsafe` boundary has no home for non-Windows FFI.** `src/win/` compiles only on Windows, so a `libc` call has nowhere allowed to live. The error also names `src/gui/run/`, which does not exist. | ~25 min (gui) | `templates/guards/files/src/unsafe_check.rs:12,87,89` |
| F4 | **Changelog docs contradict the shipped generator** (see B13). CLAUDE.md and CONTRIBUTING say to hand-edit; `examples/changelog.rs` regenerates the file. | ~15 min (tui), ~6 min (cli), ~5 min (lib) | `templates/base/files/CLAUDE.md` changelog section, `templates/base/files/CHANGELOG.md:5-12` |
| F5 | **CI has no MSRV, rustdoc or package job, and `tests/toolchain_pin.rs` rejects the usual MSRV job** because any workflow `toolchain:` other than the pin fails the test. | ~15 min (lib), ~3 min (tui) | `templates/guards/files/tests/toolchain_pin.rs:83-106`, `templates/github/files/_github/workflows/ci.yml` |
| F6 | **Generated workflows fail zizmor out of the box** (section 3). | ~10 min per project | `logs/matrix/<combo>/zizmor.log` |
| F7 | **Linux runtime libraries are not in the README.** The GUI crashed under xvfb until `libxkbcommon-x11-0` and a Vulkan driver were installed. | ~15 min (gui) | `templates/base/files/README.md` |
| F8 | **Esc inside any Customize section quits the whole run** and discards every edit. The footer says only `esc cancel`. | every interactive user | `src/prompts.ts:38-44`, `customize()` from `:175` |
| F9 | **The author is never asked and never shown.** Every project is stamped "Lawrence Norton" / `@lnorton89` in LICENSE, CODEOWNERS and `Cargo.toml`; `git config user.name` is ignored. | every user who is not the author | `src/presets.ts:9-10`; no prompt in `src/prompts.ts`; not in `reviewLines` (`src/prompts.ts:54-112`) |
| F10 | **Wrong statements in generated docs.** "All of these are clean on main" is false on a fresh GUI scaffold (B1, B2); README says thirteen colours where the other docs say eleven; doc comments mention a tray and command palette the preset lacks; CLAUDE.md says every `assert!` carries a message, which nothing checks. | ~10 min (gui) | `templates/base/files/README.md:137,215`, `templates/gui/files/src/gui/app/mod.rs:22`, `templates/gui/files/src/gui/ui/mod.rs:232` |
| F11 | **The lib preset carries dependencies a library never uses** (`log`, `toml`, non-optional `serde`), and the crate package ships `.github/`, AGENTS.md, CLAUDE.md, deny.toml and a 724-line `examples/changelog.rs`. | ~10 min (lib) | `src/presets.ts:20,53`, `src/gen/deps.ts:27,30`; no `exclude` in `src/gen/cargo.ts` |
| F12 | **Windows test isolation for CLI config.** `dirs::config_dir()` ignores environment variables on Windows, so tests cannot redirect it. | ~10 min (cli) | `templates/cli/files/src/config.rs` |
| F13 | **`main` prints errors in Debug form** and does not handle a closed pipe. | ~5 min (cli) | `templates/cli/files/src/main.rs:22` |
| F14 | **`*.log` in `.gitignore` hid test fixtures**; CI would have failed on a clean checkout. | ~3 min (cli) | `templates/base/files/_gitignore:4` |
| F15 | **cargo-deny prints 11–13 unused-licence warnings on every run**, from an allow-list sized for the GUI dependency tree. | noise on every run | `src/gen/deny.ts:4-8` |
| F16 | **The review omits values the user edited**: MSRV, tagline, theme base, accent. | interactive users | `src/prompts.ts:82-89,105` |
| F17 | **Inapplicable flags are dropped silently**: `--preset lib --with tray`, `--preset tui --with subcommands`, `--preset lib --bin foo`, `--preset cli --gui winit-glow`. | scripted users | `src/context.ts:52-57`; no notice in `src/args.ts` or `src/cli.ts` |
| F18 | **`--force` overwrites colliding files without listing them.** | scripted users | `src/engine/write.ts:27-38` |
| F19 | Smaller: the "not empty" error suggests `--force` mid-prompt (`src/engine/write.ts:9`); `-y` runs do not print the recreate command (`src/cli.ts:138`); argument errors print `✖` while later errors print `error:` (`src/cli.ts:26`); attestation needs a public repo or Enterprise Cloud and the docs do not say so; header docs omit `benches/` and `build.rs`. | minutes | reports 3a and 3b |

**What helped, in every project:** the header banner check (new files passed first time
and its messages say exactly what to fix); cargo-deny accepted every new crate unchanged
(regex, jiff, serde_json, anstyle, notify, tempfile, proptest, libc); the TUI skeleton
(`terminal.rs`, `event.rs`, `logging.rs` kept unchanged); adding a GUI page touched two
files and ARCHITECTURE.md described it accurately; persisted settings needed no migration.

## 3. Template quality

**Crate versions.** Scaffold pins were checked against crates.io during the builds.
ratatui `0.29` and crossterm `0.28` are behind (`templates/tui/deps.js:8-9`); the tail viewer
moved to ratatui 0.30 and crossterm 0.29 with no code changes. eframe/egui 0.37,
windows-sys 0.61 and the CLI crates are current. egui 0.37 deprecates `Id::new`, which the
templates do not use in a way that warns.

**Workflows.** actionlint is clean on every combination. zizmor 1.32 fails all 15
combinations that have workflows (exit 14 with `release.yml`, 13 for lib and minimal):

| zizmor audit | Level | Where |
|---|---|---|
| `cache-poisoning` | high | `Swatinem/rust-cache` in the tag-triggered release build: `templates/github/files/_github/workflows/release.yml:120` |
| `artipacked` | medium | `actions/checkout` without `persist-credentials: false`: `ci.yml:39,58,74,125`, `release.yml:51,111,231`, `publish.yml:33` |
| `dependabot-cooldown` | medium | no `cooldown:` in `templates/github/files/_github/dependabot.yml:16,38` |
| `use-trusted-publishing` | info | `cargo publish` with a stored token: `publish.yml:62` |

`release.yml` was read step by step in all four projects: tag/version check, permissions,
binary name, artifact names, SBOM and attestation steps line up. It builds only a Windows
artifact (F1). `publish.yml` for libraries runs no tests before publishing and accepts a
branch named like a tag.

**MSRV.** Every combination builds on 1.98. No MSRV breakage found.

**This repo's own files.** `CHANGELOG.md` says CI covers Node 20, 22 and 26, while
`.github/workflows/ci.yml` has 22 and 26. `docs/PLAN.md` §5 says `npm pack` lists `bin/ src/
templates/`, while `package.json` `files` is `dist` and `templates`. `ci.yml` uses
`actions/setup-node@v7` unpinned, against the house rule. `docs/CONTRACTS.md` omits
`post.fetch` and has a shorter binary-extension list than `src/engine/plan.ts:18`.
PLAN §5 mentions preset snapshots; there are none.

## 4. Feature backlog

Ranked by value ÷ effort. "Changes defaults" items are proposals only.

| # | Item | Problem and evidence | Proposed design | Files | Changes defaults? |
|---|---|---|---|---|---|
| P1 | **Ask for, or derive, the author** | F9: every project is stamped with the template author's name. | Default `author` from `git config user.name`, `github` from `gh`/remote or blank; add both to the review and a Customize row. Pairs with P5. | `src/presets.ts:9-10`, `src/prompts.ts`, `src/cli.ts` | Yes |
| P2 | **Snapshot tests of generated trees** | B1–B3 shipped because the checks use one short name per preset and never run rustdoc. | `node --test` snapshots of the `--dry-run --json` file list plus hashes of rendered text per preset, with a long-name variant; `scaffold-check --gate doc`. The long-name and doc gates land in Phase 3; snapshots are the follow-up. | `test/`, `scripts/scaffold-check.ts` | No |
| P3 | **`--json` runs post-steps, or says it did not** | `src/cli.ts:226-230`: files written, git and fetch skipped, JSON reports them on. | Run the post-steps quietly and add a `post` result object, or make `--json` imply `--dry-run`. | `src/cli.ts`, `docs/CONTRACTS.md` | Yes (behaviour) |
| P4 | **Cross-platform release matrix** | F1: a CLI or TUI ships only a Windows zip. | Per-target `ext`/`archive` matrix fields, target in the SBOM name, Linux and macOS entries on for `cli`/`tui`, opt-in for GUI. | `templates/github/files/_github/workflows/release.yml` | Yes |
| P5 | **Saved answer profile** | F9, B8: author, handle, licence and accent are retyped or wrong on every run. | `~/.config/create-rust-app/config.toml` read under the preset layer; `--no-config` to skip; `--save-profile` to write it. | `src/presets.ts`, `src/args.ts`, new `src/profile.ts` | No (opt-in file) |
| P6 | **CI jobs for MSRV, rustdoc and package, and a toolchain-pin test that allows an MSRV job** | F5: both libraries and binaries hit doc failures CI never ran. | `--with msrvJob,docJob` tooling features; `toolchain_pin.rs` accepts the pin or `rust-version`. | `templates/github/…/ci.yml`, `templates/guards/files/tests/toolchain_pin.rs`, `src/types.ts` | Yes if on by default; no as opt-in |
| P7 | **A non-Windows `unsafe` home** | F3: no allowed place for unix FFI. | Allow `src/sys/` (or `src/unix/`) as a second boundary directory under the same rules. | `templates/guards/files/src/unsafe_check.rs`, generated docs | Yes (convention) |
| P8 | **`doctor` command** | F7 and the Phase 0 setup: missing GUI runtime libs, toolchains and cargo tools are found one crash at a time. | `create-rust-app doctor [dir]`: rustup toolchains against the pin, cargo-deny, Windows target, Linux GUI libs through `pkg-config`/`ldconfig`. | new `src/doctor.ts`, `src/args.ts` | No |
| P9 | **Library packaging and lean lib preset** | F11. | `exclude` in `[package]` for libs; drop `log`/`toml`, make `serde` an optional feature. | `src/gen/cargo.ts`, `src/presets.ts`, `src/gen/deps.ts` | Yes |
| P10 | **CLI skeleton with injectable I/O** | F2, F12, F13. | `run(args, &mut Io)` carrying stdin, stdout, stderr, terminal flags and a config path; `main` prints `Display` and exits 0 on a closed pipe; a `<NAME>_CONFIG` override. | `templates/cli/files/src/{lib,main,config,cli_subcommands}.rs` | Yes (generated layout) |
| P11 | **Workflow hardening that changes behaviour** | Section 3: Dependabot cooldown, crates.io trusted publishing, tests before publish. | `cooldown: default-days: 7`; `rust-lang/crates-io-auth-action`; a test step in `publish.yml`. | `templates/github/files/_github/**` | Yes |
| P12 | **`upgrade`/`diff` command** | Template fixes such as B1–B3 never reach existing projects. | Write `.create-rust-app.json` (answers and tool version) at scaffold time; `diff` re-renders with those answers and shows drift per file. | `src/cli.ts`, new `src/diff.ts` | Additive file in output: yes |
| P13 | **`add` subcommand** | Users who start minimal cannot add `tray`, `subcommands` or tooling later. Needs the answers file from P12; edits to user-modified files are the hard part. | Start with tooling groups that only add files (ci, release, dependabot, cargoDeny). | `src/engine/plan.ts`, `src/cli.ts` | No |
| P14 | **Review shows everything edited; warn on dropped flags; list `--force` overwrites** | F16–F18. Warnings land in Phase 3; the review layout is a proposal. | Add MSRV, tagline, accent, base and author rows. | `src/prompts.ts:54-112` | Review layout: yes |
| P15 | **Trim the cargo-deny allow-list per kind** | F15. | Compose the list from the groups in use. | `src/gen/deny.ts` | Yes |
| P16 | **TUI log file location** | B22. | `dirs::state_dir()`/cache dir, or `create_new` with a per-process name. | `templates/tui/files/src/logging.rs` | Yes (file location) |
| P17 | **`.gitignore` `*.log`** | F14. | Anchor it (`/*.log`) so fixtures under `tests/` are tracked. | `templates/base/files/_gitignore:4` | Yes |
| P18 | **New presets: axum service, wasm, `no_std`; macOS GUI** | No dogfood evidence either way; each is a new template group with its own lint and CI story. macOS CI targets depend on P4. | One preset at a time, axum first (largest audience, reuses the cli group). | `templates/`, `src/presets.ts` | No |
| P19 | **npm name** | `src/reproduce.ts:9-14`: the tool runs from GitHub because the `create-rust-app` name is not this project's. | See REPORT.md for the name research. | `package.json`, `src/reproduce.ts` | Owner decision |
| P20 | **Third-party template groups** | No evidence of demand. The group format (`manifest.js`, `deps.js`) executes code, so loading external groups is a trust decision. | Defer until P12 fixes the answers file and the group API is documented as stable. | `src/engine/groups.ts` | No |

## 5. Fix plan (Phase 3)

In scope: bug fixes, missing validation, better errors, docs, tests. Nothing here changes a
flag, a default answer, the lint table, the banner format, licence options or file layout.

| Order | Item | Covers | Size |
|---|---|---|---|
| 1 | GUI templates fmt-clean for any valid name; doc-link fixes; `scaffold-check` gains `--gate doc`, a `--name` override, respects `CARGO_TARGET_DIR`, splits `--set` on the first `=`; long-name regression case | B1, B2, B3, B21 | medium |
| 2 | Name validation: Rust keywords, Cargo and Windows reserved names, 64-character cap; notice when a positional directory cannot be the crate name; `--msrv` ≤ `--toolchain`; warn on flags the kind ignores; blank `guiStack` for non-GUI kinds; empty tagline handled once; commit into a fresh empty repo; `--json` help text | B4–B7, B10, B18–B20, F17 | medium |
| 3 | Recreate command carries accent, author, GitHub handle and the real target directory | B8, B9 | small |
| 4 | Workflows: `persist-credentials: false` on every checkout, no cache in the release build; changelog generator and shipped CHANGELOG agree, docs say one thing | B13, F4, F6 (part) | medium |
| 5 | Generated-doc corrections: colour count, tray/palette mentions, `unsafe_check` message path, Linux runtime libraries, attestation requirement, release-target comment, header docs | F3 (message), F7, F10, F19 | small |
| 6 | TUI pins: ratatui 0.30, crossterm 0.29 | section 3 | small |
| 7 | Interactive: Esc in Customize goes back, Ctrl-C during tasks restores the terminal, `--kind` no longer overrides a re-picked preset, MSRV/toolchain cross-check in the prompt, windowed lists, clipped rows, non-colour focus marker, `--no-color` honoured by the text cursor | B11, B12, B14–B17, F8 | medium |
| 8 | This repo's docs: CHANGELOG Node versions, PLAN `npm pack` list, CONTRACTS `post.fetch` and binary extensions, pin `setup-node` | section 3 | small |
