# 4 — Re-validation after fixes (create-rust-app @ 58847b6 vs before-run @ db3693d)

Date 2026-11-21. Branch `claude/jolly-curie-lpi8jt`, HEAD `58847b6` (repo untouched: `git status` clean throughout).
Toolchains 1.99.1 (pin) / 1.98 (MSRV); cargo-deny 0.22.0, actionlint 1.7.12, zizmor 1.32.0 `--offline` (same as before).

## How it was run

- Scripts (adapted from the before run, paths only + additions): `/home/user/cra-dogfood/scripts/after/`
  - `matrix-lib.sh` (same helpers; `P=projects/matrix-after`, `L=logs/matrix-after`, `CARGO_TARGET_DIR=target-matrix-after`)
  - `matrix-all.sh` (whole matrix, sequential, one target dir; adds long-name variants, `example changelog --check` + regen-diff,
    strobe changelog with `git diff --exit-code CHANGELOG.md`, full gate set on **every** GUI combo, clippy-win, fmt name-length probe)
  - `edge.sh` (before-run edge cases unchanged + additions), `jsoncheck.sh`, `recreate.exp`, `table.mjs` (builds the table from `results.tsv`).
- Logs: `/home/user/cra-dogfood/logs/matrix-after/<combo>/<gate>.log`, raw `results.tsv`, `driver.log`, table `table.md`;
  edge `edge/<id>.log` + `edge/summary.tsv`; JSON `jsoncheck/`; recreate `recreate/`; friction `friction/`; baseline `baseline/`;
  default-output diff before↔after `outdiff/<preset>.diff`.
- Projects: `/home/user/cra-dogfood/projects/matrix-after/` (same combo/dir names as before). `target-matrix` (old, 2.8 GB) deleted first.
- For attribution, the before commit was rebuilt out of tree (`git archive db3693d` → scratchpad, `npm ci && npm run build`) and used
  to scaffold every preset with default answers for a before↔after output diff.
- Builds were fast (warm registry/build caches; whole matrix ≈ 10 min). Logs confirm real compiles (e.g. `rustaman/msrv.log` compiles eframe on 1.98 in 52 s).

## 1. Baseline (`logs/matrix-after/baseline/`)

| step | exit |
|---|---|
| `npm ci` | 0 |
| `npm run typecheck` | 0 |
| `npm test` | 0 — **164 tests, 164 pass, 0 fail** (`npm_test.log`) |
| `npm run build` | 0 |

## 2. After table

Same format as 3a. Exit codes in parentheses; zizmor 13 = highest finding medium, 14 = high. "–" = not run.

| combo | scaffold | fmt | clippy | clippy-allfeat | clippy-win | check | test | deny | doc | msrv | actionlint | zizmor | extra |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cli | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | example-changelog-check: PASS, example-changelog-regen: PASS |
| rustaman | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | example-changelog-check: PASS, example-changelog-regen: PASS |
| lib | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | example-changelog-check: PASS, example-changelog-regen: PASS |
| minimal | PASS | PASS | PASS | PASS | – | – | PASS | N/A(no deny.toml) | PASS | PASS | PASS | PASS | example-changelog: N/A(no example) |
| tui | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | example-changelog-check: PASS, example-changelog-regen: PASS |
| lib-publish | PASS | – | – | – | – | – | – | – | – | – | – | – | publish-dry-run: PASS |
| cli-subcmd-bin | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | run-help: PASS |
| cli-tokio-reqwest | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) |  |
| cli-ed2021 | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) |  |
| cli-tracing | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) |  |
| strobe | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | xtask-ci: PASS, xtask-changelog: PASS (CHANGELOG.md unchanged) |
| minimal-lic-MIT | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| minimal-lic-MIT_CommonsClause | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| minimal-lic-Apache_2_0 | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| minimal-lic-MIT_OR_Apache_2_0 | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| lic1-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| lic2-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| lic3-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| lic4-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| rustaman-tray-si | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | example-changelog-check: PASS, example-changelog-regen: PASS |
| rustaman-nodemo | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) |  |
| rustaman-glow | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) |  |
| rustaman-graphite | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | inspect: PASS |
| custom | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) | example-changelog-check: PASS, example-changelog-regen: PASS |
| long-rustaman | PASS | PASS | PASS | – | – | – | PASS | – | PASS | – | – | – | example-changelog-check: PASS, example-changelog-regen: PASS |
| long-strobe | PASS | PASS | PASS | – | – | – | PASS | – | PASS | – | – | – | xtask-changelog: PASS (unchanged), xtask-ci: PASS |
| long-cli | PASS | PASS | PASS | – | – | – | PASS | – | PASS | – | – | – | example-changelog-check: PASS, example-changelog-regen: PASS |
| long-tui | PASS | PASS | PASS | – | – | – | PASS | – | PASS | – | – | – | example-changelog-check: PASS, example-changelog-regen: PASS |

Notes on cells:
- `long-*` use `--name a-very-long-project-name-used-to-probe-rustfmt-width-limits-abcd` (64 chars, the new maximum), dir `long-<preset>`.
  long-strobe's app crate becomes `<name>-app` (68 chars); harmless because the workspace sets `publish = false`, but it exceeds the
  crates.io cap the name validator cites (observation, not a failure).
- `example-changelog-check` = `cargo run --example changelog -- --check` on the fresh git-initialised scaffold;
  `-regen` = run the generator then `git diff --exit-code CHANGELOG.md` (a fresh scaffold must not change).
- `minimal-lic-*` deny FAIL(4) and `lic*-deny` publish-dry-run FAIL(101) are the same **expected** results as before (no deny.toml on minimal;
  binaries write `publish = false`). The `minimal-lic-*` crates are still named `my-app` (uppercase dir names), but the scaffold now
  prints `note: the folder name "minimal-lic-MIT" can't be a crate name, so the crate is named "my-app"` (`minimal-lic-MIT/scaffold.log`, finding 6).
- `rustaman-graphite` inspect: `#ff9f6e` reaches `src/lib.rs:54`, Graphite base in `src/theme/mod.rs` (`rustaman-graphite/inspect.log`).
- Remaining zizmor FAIL(13) everywhere = `dependabot-cooldown` (medium) only, + `use-trusted-publishing` (info) on lib (`<combo>/zizmor.log`).

### Name-length fmt probe (`logs/matrix-after/fmtlen-<preset>-<N>/fmt.log`)

| preset | 2 | 8 | 16 | 24 | 64 (long-*) |
|---|---|---|---|---|---|
| rustaman | PASS | PASS | PASS | PASS | PASS |
| strobe | PASS | PASS | PASS | PASS | PASS |
| cli / tui | PASS | PASS | PASS | PASS | PASS |
| lib / minimal | PASS | PASS | PASS | PASS | – |

### `--dry-run --json` (`logs/matrix-after/jsoncheck/summary.tsv`, `normalized-summary.txt`)

All 7 presets: exit 0, single valid JSON doc starting `{`, 0 bytes stderr, nothing written; plan list == real `-y --no-git --no-fetch`
run after normalising the project name (58/68/30/31/30/17/57 files — identical counts to before).

## 3. Before → after cell diff

Counting executed cells in the 24 comparable rows (excluding N/A and "–"): **before 156 PASS / 31 FAIL → after 165 PASS / 22 FAIL**
(+1 new `rustaman-graphite inspect` PASS). All new cells (long-name rows, example-changelog cells, upgraded GUI gates): 40 more, all PASS.
Total after: 206 PASS / 22 FAIL, of which 8 FAIL are expected-by-design (4 deny-without-config, 4 publish of binaries).

| combo | gate | before | after | why |
|---|---|---|---|---|
| rustaman | doc | FAIL(101) | PASS | 5bcdfde (run.rs links) |
| rustaman-tray-si | fmt | FAIL(1) | PASS | b51a54a/ac959a0 (name-width) |
| rustaman-tray-si | doc | FAIL(101) | PASS | 5bcdfde (tray.rs link) |
| rustaman-nodemo | fmt | FAIL(1) | PASS | b51a54a |
| rustaman-nodemo | doc | FAIL(101) | PASS | 5bcdfde |
| rustaman-graphite | fmt | FAIL(1) | PASS | b51a54a |
| rustaman-graphite | doc | FAIL(101) | PASS | 5bcdfde |
| custom | doc | FAIL(101) | PASS | 5bcdfde |
| minimal | zizmor | FAIL(13) | PASS | eff8d91 (persist-credentials) |
| cli, rustaman, tui, cli-subcmd-bin, cli-tokio-reqwest, cli-ed2021, cli-tracing, strobe, rustaman-tray-si, rustaman-nodemo, rustaman-glow, rustaman-graphite, custom | zizmor | FAIL(14) | FAIL(13) | c67252a (no release cache), eff8d91; dependabot-cooldown remains |
| lib | zizmor | FAIL(13) | FAIL(13) | artipacked gone; dependabot-cooldown + trusted-publishing (info) remain |
| rustaman-graphite, custom | clippy-allfeat | – | PASS | gate set upgraded (was `check` only) |
| rustaman-graphite, custom | check | PASS | – | replaced by full gates |
| rustaman-tray-si, rustaman-nodemo, rustaman-glow | (all gates in one pass) | partly via probe | all PASS | full set run directly |

No cell went PASS → FAIL.

## 4. Edge cases (`logs/matrix-after/edge/summary.tsv`; same ids as before + additions)

| case | before | after |
|---|---|---|
| `--name fn/async/type` | exit 0, code doesn't compile | exit 2 "is a Rust keyword, so it can't name a crate" ✔ (also match, mod, use, self, crate, super, loop, dyn; `Self` rejected by the lowercase rule) |
| `--name` 300 chars (minimal) | exit 0, cargo "File name too long" | exit 2 "Use at most 64 characters (the crates.io limit); this one has 300" ✔ |
| `--name` 260 chars (rustaman) | exit 1 mid-write, partial project | exit 2 at validation, nothing written ✔ (`name-long-gui.log`) |
| `--name` 64 / 65 chars | – | 64 accepted / 65 rejected ✔ |
| positional `MyDir`, `sub2/Weird_Dir`, 70×`b` | crate silently `my-app` | crate still `my-app`, but stderr: `note: the folder name "MyDir" can't be a crate name, so the crate is named "my-app" (set it with --name).` ✔ |
| `--json` without `--dry-run` | writes files, skips post-steps, JSON `post.git:true` | **unchanged behaviour**; `--help` now says "Still writes the files unless --dry-run, but skips fetch, git, cargo check and open"; JSON still reports `"post":{"git":true,"fetch":true,…}` with no .git / Cargo.lock (`json-nodry-git.log`) |
| `--msrv 1.100 --toolchain 1.99.1` | exit 0, cargo fails | exit 2 "msrv 1.100 is newer than toolchain 1.99.1 …", nothing written ✔; `--msrv 1.80 --edition 2024` also rejected; `--msrv 1.99 --toolchain 1.99.1` accepted |
| ignored flags (`lib --with tray`, `tui --with subcommands`, `minimal --with subcommands`, `lib --bin foo`, `cli --gui winit-glow`) | silent | `note: … is ignored: <reason>` on stderr ✔; with `--json` stdout stays a pure JSON doc ✔ and `guiStack` is `""` for cli ✔ (`notice-*.log`, `fix-n3b/n5b.log`). `--quiet` also suppresses the notes (`fix-n7b.log`, stdout+stderr empty) |
| `--force` over colliding file | silent overwrite | stderr `note: --force overwrote 1 existing file: README.md` ✔; JSON mode stdout still valid ✔ |
| failed write | partial project left | `error: Writing src/main.rs failed: EISDIR … Removed the 14 files this run created …; files that were there before are kept.` — verified only `keep.txt` and the blocker remain (`write-fail-cleanup.log`) ✔ |
| dir with only `git init` (`.` and named) | nothing committed | `git: first commit on master in the existing repository`, one commit ✔ (`dir-dot-gitonly.log`, `dir-gitonly-named.log`); inside a parent repo: "git skipped: already inside a git repository", summary truthful ✔ |
| error prefix in non-TTY | `✖` for arg errors, `error:` later | unchanged (`nontty-error-prefix.log` ✖, `nontty-error-prefix2.log` error:; msrv cross-check also prints `error:`) |
| NO_COLOR / --no-color / help / error (pty) | 0 ESC | 0 ESC ✔ (control run 9 ESC) |
| `--quiet` | silent stdout | unchanged ✔ |
| non-TTY stdin, no `-y` | defaults | unchanged ✔ |
| `nocolor-dryrun` (interactive in a pty with stdin at EOF) | recorded 1 ESC | 1 ESC, but the process **hung** until killed; the before build (`db3693d`, rebuilt out of tree) hangs identically under `timeout 40 script …` (rc 124 both), so not a regression — environment/pty artefact |
| everything else in the before table (name rules, --set validation, unknown flags, bins, --no-git, --no-fetch, file target, two positionals, …) | ✔ | identical exit codes and messages (joined summary) |
| `scaffold-check minimal --set tagline=a=b --out <outside> --gate fmt` with `CARGO_TARGET_DIR` set | `description = "a"` | `description = "a=b"`, exit 0; `<repo>/.scratch` untouched (mtimes 2026-11-20) ✔ (`scaffold-check/set-eq.log`) |

### Recreate command (`logs/matrix-after/recreate/`)

Interactive run via expect (`scripts/after/recreate.exp`) with `--preset rustaman --base graphite --accent '#ff9f6e' --author 'Jane Q' --github janeq --with tray --no-fetch`
printed: `npx github:freeknet/create-rust-app rc2 --preset rustaman --with tray --base graphite --author "Jane Q" --github janeq --accent "#ff9f6e" --no-fetch -y`.
Run with local dist: `diff -r -x .git -x target -x Cargo.lock` → **identical (0 lines)** (`diff-rc2.txt`; before: 14 files differed).
`-y` runs still don't print the command (`rc2-local.log`).

## 5. Per-finding status (1–19)

| # | status | evidence |
|---|---|---|
| 1 fmt fails for names ≥14 chars (GUI) | **fixed** | fmtlen all PASS; long-* (64) fmt PASS; tray-si/nodemo/graphite fmt PASS |
| 2 eframe rustdoc `-D warnings` | **fixed** | doc PASS on rustaman, custom, nodemo, graphite, tray-si, long-rustaman |
| 3 tray broken intra-doc link | **fixed** | `rustaman-tray-si/doc.log` PASS |
| 4 keywords accepted | **fixed** | `edge/name-kw-*.log` exit 2 |
| 5 no length limit / partial write | **fixed** | 64 max enforced; failed write cleans up (`write-fail-cleanup.log`) |
| 6 positional dir → silent `my-app` | **fixed** (now a stderr note; crate still `my-app`) | `edge/name-positional-*.log` |
| 7 `--json` w/o `--dry-run` skips post-steps | **partly** — documented in `--help`, but JSON still claims `post.git/fetch: true` | `edge/json-nodry-git.log` |
| 8 recreate drops accent/author/github | **fixed** | `recreate/diff-rc2.txt` empty |
| 9 msrv > toolchain accepted | **fixed** | `edge/msrv-gt-toolchain.log`, exit 2 |
| 10 zizmor | **partly** — cache-poisoning (high) and artipacked gone; `dependabot-cooldown` (medium, `dependabot.yml:16,38`, template not touched) and lib `use-trusted-publishing` (info) remain → exit 13 on 14 combos | `<combo>/zizmor.log` |
| 11 changelog generators vs shipped file | **fixed** (shipped file == generator output for example and xtask; `--check` passes; regen leaves file unchanged on 11 combos). Residual: released entries still formatted differently (example links hashes, xtask prints bare hash) | `*/example-changelog-*.log`, `strobe/xtask-changelog.log` |
| 12 `--force` silent overwrite | **fixed** (lists overwritten files) | `edge/force-notice.log` |
| 13 inapplicable flags silently dropped | **fixed** (notes; guiStack blanked) | `edge/notice-*.log` |
| 14 git-only dir: no commit | **fixed** | `edge/dir-dot-gitonly.log` |
| 15 inconsistent error prefix | **unchanged** | `edge/nontty-error-prefix{,2}.log` |
| 16 author identity defaults | **unchanged** (`src/presets.ts` still `Lawrence Norton`/`lnorton89`) | `edge/json-nodry.log` answers |
| 17 scaffold-check target dir / `--set` | **fixed** (both) | `scaffold-check/set-eq.log` |
| 18 `-y` finish screen lacks recreate command | **unchanged** (info) | `recreate/rc2-local.log` |
| 19 Windows code not compiled on Linux | **unchanged** (info); clippy-win PASS on rustaman, tray-si, strobe, glow, cli | `<combo>/clippy-win.log` |

## 6. Friction re-check on a real project (`logs/matrix-after/friction/`)

`create-rust-app real-logscan --name logscan --preset cli --with subcommands -y` (with fetch + git; one commit `feat: scaffold logscan with create-rust-app`).
On the untouched scaffold:

| claim | result |
|---|---|
| `cargo run --example changelog -- --check` passes | **confirmed** — "CHANGELOG.md matches the git history.", exit 0 (`changelog-check.log`) |
| zizmor findings | default persona exit 13: 2× `dependabot-cooldown` (medium) only, 7 suppressed (`zizmor.log`). `--persona=pedantic`: + 1 `template-injection` (help), 2 `undocumented-permissions` (help), 4 `superfluous-actions` (info) (`zizmor-pedantic.log`) |
| `RUSTDOCFLAGS=-D warnings cargo doc` passes | **confirmed**, exit 0 (`doc.log`) |
| CLAUDE.md / CONTRIBUTING / README agree with the generator | **confirmed**: both say generated, never hand-edit, `--check` compares released sections only (matches `examples/changelog.rs:50`), CI does not run it (no workflow mentions changelog), `--release vX` flow and unparsed subjects → catch-all (`OTHER = "Other"`). README only links the file. Shipped CHANGELOG.md is byte-identical to a regeneration |
| header-banner docs list the dirs the check walks | **confirmed for CLAUDE.md:88 and CONTRIBUTING.md:79** (`src/`, `tests/`, `examples/`, `benches/`, `build.rs` = the loop at `src/header_check.rs:214` + build.rs at :230). Residual (pre-existing, unchanged since db3693d): `src/header_check.rs`'s own banner (line 6) and `//!` doc (line 15) still say "src/, tests/ and examples/" |

Header test on a copy (`projects/matrix-after/real-logscan-hdr`): added `src/scan.rs` with a correct banner (`Module: scan`) → `cargo test` exit 0
(`header-good.log`); added `src/parse.rs` declaring `Module: scan` → exit 101 with
`1 file header problem(s) across 11 file(s): src/parse.rs: declares \`Module: scan\` but sits at \`parse\`` (`header-bad.log`). Clear.

## 7. Regressions

**None found.**
- No matrix cell went PASS → FAIL; no edge case got worse.
- Default-answer output diff before↔after for all 6 presets (`logs/matrix-after/outdiff/<preset>.diff`; 4–18 files per preset) was read in full:
  every change maps to a fix commit — workflows (eff8d91, c67252a), name-width rewrites `use <crate> as app;`, `BIN`/`NAME` consts,
  `env!("CARGO_PKG_NAME")`, split `REPO` string (b51a54a, ac959a0, 92d5f6f), rustdoc links (5bcdfde), docs naming only present features (9209843, c11038a),
  CHANGELOG/PREAMBLE and hash-less Unreleased (6d57531), TUI ratatui 0.30 / crossterm 0.29 (80e32b1). Values are equivalent (e.g. config dir still `<name>`).

Minor new observation (not a gate failure; hypothesis-grade impact): `templates/guards/files/src/unsafe_check.rs` (9209843) now tells eframe projects
"unsafe code must live under src/win/" while the check itself still also accepts `src/gui/run/` — message/doc and logic disagree for non-winit-glow projects.
Repro: read `projects/matrix-after/rustaman/src/unsafe_check.rs` (const `ALLOWED` vs the `starts_with` test). `git log --oneline db3693d..58847b6 -- templates/guards/files/src/unsafe_check.rs` → `9209843`.
