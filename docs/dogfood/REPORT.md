# Dogfood report, November 2026

Before: `db3693d`. After: `58847b6` plus this report. Branch `claude/jolly-curie-lpi8jt`,
35 commits plus four merge commits, nothing merged to `main`, no tags, no release, nothing published.

The detailed findings are in [FINDINGS.md](FINDINGS.md). The agents' full reports are in
[`evidence/`](evidence/); they cite raw logs under `logs/…`, which lived in a scratch
directory outside the repo and were not kept.

## Outcome

- **Gate matrix:** 156 of 187 cells passed before; 165 of 187 pass after, and 40 new cells
  (64-character names, changelog checks, full gates on every GUI combination) all pass.
  No cell went from pass to fail.
- **Still failing, 22 cells:** 14 are zizmor's `dependabot-cooldown` (an owner decision, P11);
  8 are expected (`minimal` ships no `deny.toml`; binaries set `publish = false`).
- **Bugs:** 20 of the 22 in FINDINGS §1 are fixed. B22 (TUI log path) is deferred to the
  backlog because the fix moves a file; the `--json` post-step behaviour is documented, not
  changed.
- **Tests:** 58 before, 164 after.

## Environment

Ubuntu 24.04 container, Node 22.23.5, npm 10.9.9, rustup 1.29.3. Rust 1.99.1 (the pin)
and 1.98.1 (MSRV) with rustfmt and clippy; default stable was 1.97.0. cargo-deny 0.22.0,
cargo-msrv 0.19.6, zizmor 1.32.0 (run with `--offline`), actionlint 1.7.12 (no shellcheck,
so `run:` scripts were not linted), xvfb. GUI development libraries were installed through
apt. The reference projects `../rustaman` and `../strobe` were not present. Details:
[evidence/ENV.md](evidence/ENV.md).

## Gate matrix, before and after

Gates per combination: scaffold, fmt, clippy, clippy `--all-features`, test, cargo-deny,
rustdoc with `-D warnings`, MSRV build on 1.98, actionlint, zizmor. Full tables:
[evidence/3a-matrix.md](evidence/3a-matrix.md) (before) and
[evidence/4-validation.md](evidence/4-validation.md) (after).

| Combination | Before | After |
|---|---|---|
| cli, tui, strobe, and the cli variants (subcommands + `--bin`, tokio + reqwest, edition 2021, tracing) | all Rust gates pass; zizmor fails (high) | all Rust gates pass; zizmor: `dependabot-cooldown` only |
| lib | all pass; zizmor fails (medium) | all pass; zizmor: `dependabot-cooldown`, plus info-level trusted publishing |
| minimal | all pass; zizmor fails (medium) | all pass, zizmor clean |
| rustaman | **doc fails**; zizmor fails | all Rust gates pass; zizmor: `dependabot-cooldown` only |
| rustaman `--with tray,singleInstance` | **fmt and doc fail** | pass |
| rustaman `--without demo` | **fmt and doc fail** | pass |
| rustaman `--base graphite --accent #ff9f6e` | **fmt and doc fail** | pass |
| rustaman `--gui winit-glow` | pass | pass |
| custom | **doc fails** | pass |
| strobe `cargo xtask ci`, `cargo xtask changelog` | pass, but the changelog run rewrote the header | pass, and CHANGELOG.md is unchanged |
| lib `cargo publish --dry-run` | pass | pass |
| each `--license` with cargo-deny | pass | pass |
| `--dry-run --json`, all 7 presets | valid, matches a real run | same |
| 64-character names: rustaman, strobe, cli, tui (fmt, clippy, test, doc) | not run; fmt failed from 14 characters on GUI kinds | all pass |
| `cargo run --example changelog -- --check` on a fresh single-crate scaffold | fails | passes |

Baseline on the final branch: `npm ci`, `npm run typecheck`, `npm test` (164/164) and
`npm run build` all exit 0.

## What was fixed

| Finding | Fix | Commits |
|---|---|---|
| B1 fmt fails for names of 14+ characters | No generated line's width depends on the name: binaries alias the crate (`use <crate> as app;`), tests use constants or `env!("CARGO_PKG_NAME")`. Checked for every preset at 1 and 64 characters. | `b51a54a`, `ac959a0`, `92d5f6f`, `fbc3408` |
| B2, B3 rustdoc errors | GUI `run.rs`, tray and cli `db.rs` doc links corrected | `5bcdfde`, `019ffe7` |
| B4–B6 name validation | Rust keywords, Cargo and Windows reserved names and names over 64 characters are refused; a failed write removes what it created | `0d5b1b2`, `9505f95` |
| B7 positional folder silently renamed | A `note:` on stderr names the crate and points at `--name` | `99f5439` |
| B8, B9 recreate command | Carries accent, author, GitHub handle, display name, email and post-steps; names the real folder. Round-trip test over a spread of answers. | `7712459`, `8cf4351` |
| B10 MSRV newer than toolchain | Refused with exit 2, on the command line and in the prompt; also MSRV below what the edition needs | `7a38d56`, `abcd6b0` |
| B11 Ctrl-C during run steps | SIGINT handler restores the cursor, says what was left, exits 130 | `f1f08c9` |
| B12 `--kind` overriding a re-picked preset | The re-pick wins | `8cf4351` |
| B13, F4 changelog | The shipped CHANGELOG.md is what the project's generator writes; docs say one thing; `cargo xtask changelog` is generated only with the generator on | `6d57531`, `7b4b366`, `c052781`, `69684ec` |
| B14, B15 short and narrow terminals | Lists window to the terminal's rows; rows and footers clip to its width, read at render time | `6eab8cb` |
| B16, B17 no-colour focus | A focus glyph on multi-select rows, a caret for the text cursor, zero SGR with `--no-color` | `78aa367` |
| B18 empty tagline | Resolved once in the context | `ae820f7` |
| B19 fresh empty repository | First commit is made there, staged by path; the summary is truthful when git is skipped | `7445c64` |
| B20, F17 ignored options | A stderr note per ignored option; `guiStack` blank in `--json` for kinds without a GUI | `166fe1d` |
| F18 `--force` | Lists the files it overwrote | `9505f95` |
| B21 `scaffold-check` | `--set` splits on the first `=`; respects `CARGO_TARGET_DIR`; new `--gate fmt`, `--gate doc`, `--name` | `d9e175b` |
| F6 zizmor | `persist-credentials: false` on every checkout; no Actions cache in the release build. Generated workflows: 10 findings → 2 (rustaman, strobe, cli, tui), 8 → 3 (lib), 3 → 0 (minimal). | `eff8d91`, `c67252a` |
| F8 Esc in Customize | Steps back one level; Ctrl-C still quits | `b66cd19` |
| F7, F10, F19 generated docs | Colour count, tray and palette mentions, `assert!` wording, Linux runtime libraries, attestation requirement, release-target comment, header-check directories, `unsafe_check` message | `c11038a`, `9209843` |
| TUI pins | ratatui 0.30, crossterm 0.29 | `80e32b1` |
| This repo | `setup-node` pinned to a SHA, checkout credentials dropped, CHANGELOG/PLAN/CONTRACTS corrected, `--json` help text | `3ce7a92`, `4a651ac`, `8710457` |

Every fix has a `node --test` regression test: `test/validation.test.ts`,
`notices.test.ts`, `git.test.ts`, `write.test.ts`, `reproduce.test.ts`,
`name-length.test.ts`, `scaffold-check.test.ts`, `xtask.test.ts`, `workflows.test.ts`,
`changelog.test.ts`, `docs.test.ts`, `prompts.test.ts`.

## Changes that touch a convention

Each was needed to make a stated gate pass, and each is small, but they change generated
output and are the owner's to confirm or revert.

1. **`Unreleased` changelog entries carry no commit hash** (`6d57531`). A scaffolded
   CHANGELOG.md cannot contain the hash of the commit that adds it, so this is what lets a
   fresh project match its own generator. Released sections keep hashes and links.
2. **The header check exempts the `Module:` line from the 100-column limit** (`ac959a0`).
   Its value is the file's path, which a 64-character crate name pushes past the limit.
3. **`Dependencies:` banner lines say "the library crate"** instead of repeating the crate
   name, and binaries alias the crate as `app` (`b51a54a`, `ac959a0`).
4. **Esc inside Customize goes back instead of quitting** (`b66cd19`).
5. **`--json` reports `guiStack: ""`** for kinds without a GUI (`166fe1d`).
6. **An empty tagline reads as the project name** everywhere, where the README used to
   show `****` (`ae820f7`).

## Deferred, and why

| Item | Why |
|---|---|
| Author defaults to the template author (F9, P1) | Changes a default answer |
| `--json` skipping post-steps while reporting them on (P3) | Behaviour decision; help, README and CONTRACTS now say what it does |
| Windows-only release workflow (F1, P4) | Changes the generated release matrix |
| CI jobs for MSRV and rustdoc; `toolchain_pin` rejecting an MSRV job (F5, P6) | Changes generated CI and a guard |
| No home for non-Windows `unsafe` (F3, P7) | Changes the boundary convention. The check's message now names `src/win/`, though for eframe it also accepts `src/gui/run/`. |
| Dependabot cooldown, trusted publishing, tests before publish (P11) | Changes release and update behaviour; the cause of every remaining zizmor finding |
| Lib packaging `exclude`, unused lib dependencies (F11, P9) | Changes the lib preset |
| CLI skeleton I/O injection, Debug error output, config override (F2, F12, F13, P10) | Changes generated layout |
| TUI log file in `/tmp` (B22, P16) | Moves a file |
| `*.log` in `.gitignore` (F14, P17), cargo-deny allow-list noise (F15, P15) | Change generated defaults |
| Review screen omitting edited values (F16, P14) | Review layout |
| rusqlite `0.41` → 0.43, cargo-cyclonedx 0.5.9 → 0.5.10, cargo-deny-action v2.1.1 → v2.1.3 | Found by the version research after the fix plan was set; not exercised by a dogfood build |
| Released changelog entries formatted differently by the example and the xtask generator | Cosmetic; found in validation |
| `header_check.rs`'s own banner omits `benches/` and `build.rs` | Cosmetic; the docs are correct |
| `--bin`, display name, tagline and author have no length cap, so a very long one can still push a line past 100 columns | Needs a decision on the caps |
| Inconsistent `✖` / `error:` prefix; `-y` runs not printing the recreate command | Minor; unchanged |

## Ranked backlog

Full entries with design and files are in FINDINGS §4. Top of the list:

1. **P1 Ask for, or derive, the author.** Every project is stamped with the template
   author's name and handle.
2. **P4 Cross-platform release matrix.** A CLI or TUI ships only a Windows zip.
3. **P11 Workflow hardening**: Dependabot cooldown, crates.io trusted publishing, tests
   before publish. Clears the remaining zizmor findings.
4. **P6 CI jobs for MSRV and rustdoc**, with a toolchain-pin test that allows them.
5. **P2 Snapshot tests of generated trees.** The name-length and doc gates landed here;
   per-preset snapshots are the follow-up.
6. P5 saved answer profile; P3 `--json` post-steps; P7 non-Windows `unsafe` home;
   P10 CLI skeleton I/O; P9 lib packaging; P8 `doctor`; P12 `upgrade`/`diff`; P13 `add`.

### npm name (P19)

`create-rust-app` on npm is an unowned tombstone: one version, 0.0.0, published
2022-03-12 and unpublished 2025-06-19. npm's policy does not say whether another account
may claim an unpublished name, and crates.io has a well-known unrelated `create-rust-app`
generator, so the name invites confusion either way. Free at the time of checking:

| Package | Invocation | Note |
|---|---|---|
| `@freeknet/create-rust-app` | `npm create @freeknet/rust-app` | Keeps the name, makes authorship clear. Needs the `freeknet` npm scope, whose ownership could not be confirmed. |
| `create-rust-app-kit` | `npm create rust-app-kit` | Unscoped, no similar name exists |
| `@freeknet/create` | `npm create @freeknet` | Shortest command; needs the scope |

Also free: `create-rusty-app`, `create-ferris-app`, `create-rust-project`,
`create-rust-scaffold`, `create-crate`. Taken: `create-rs-app`, `create-cargo-app`,
`create-rust`, `create-rs`, `create-cargo`. Full table:
[evidence/research.md](evidence/research.md).

## Friction logs, summarised

Four projects were built on fresh scaffolds; all four pass every generated gate.

| Project | What was built | Top friction | Log |
|---|---|---|---|
| `logscan` (cli, subcommands) | Log analyser: parse, filter, stats; files and stdin; 67 tests | `run(args, out)` has no stdin or terminal info (~25 min); Windows config isolation (~10 min); zizmor (~8 min); changelog check failing on the untouched scaffold (~6 min) | [friction-logscan.md](evidence/friction-logscan.md) |
| `tailview` (tui) | Live multi-file tail viewer with filter, follow/pause, help; 43 tests | Windows-only release workflow (~25 min); changelog contradiction (~15 min); zizmor (~10 min); outdated ratatui/crossterm pins (~5 min) | [friction-tailview.md](evidence/friction-tailview.md) |
| `humandur` (lib) | Duration parser with `serde` feature, 18 doctests, property tests | No MSRV/doc/package CI job and `toolchain_pin` blocking one (~15 min); package ships repo files (~8 min); unused dependencies (~5 min) | [friction-humandur.md](evidence/friction-humandur.md) |
| `deskpulse-monitor` (rustaman) | Monitor page, background sampler, persisted settings; ran under xvfb | No home for unix `unsafe` (~25 min); Linux runtime libraries undocumented (~15 min); workflows (~15 min); fmt and doc failures on the untouched scaffold | [friction-deskpulse-monitor.md](evidence/friction-deskpulse-monitor.md) |

Re-check on a fresh `logscan` scaffold from the final branch: the changelog check passes,
rustdoc passes, zizmor reports only `dependabot-cooldown`, the changelog statements in
CLAUDE.md, CONTRIBUTING and README agree with the generator, and a wrong header fails
`cargo test` with "src/parse.rs: declares `Module: scan` but sits at `parse`".

In every project the header check, cargo-deny's allow-list and the lint table cost almost
nothing: new files passed the header check first time, no added crate was blocked, and
`#[expect]` was rarely needed.

## Process notes

- The prompt asked for a local branch `improve/dogfood-2026-11` and no pushes. This ran in
  an ephemeral cloud session configured for `claude/jolly-curie-lpi8jt`, whose stop hook
  requires commits to be pushed, so the work is on that branch on the remote. No pull
  request, tag, release or package was created.
- Subagent commits carry the attribution line of the model that wrote them.
