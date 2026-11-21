# 3a — Scaffold matrix (create-rust-app @ db3693d, dist/ as built)

Date 2026-11-20. Toolchains: 1.99.1 (pin, auto-selected by generated `rust-toolchain.toml`), 1.98.1 (MSRV).
cargo-deny 0.22.0, actionlint 1.7.12, zizmor 1.32.0 (`--offline`).

## How it was run

- Driver scripts (all in `/home/user/cra-dogfood/scripts/`):
  - `matrix-lib.sh` (helpers: `scaffold`, `gate`, `gates`), `matrix-nongui.sh`, `matrix-gui.sh`, `matrix-lic.sh`,
    `matrix-probe.sh` (name-length fmt probe, Windows-target clippy, upgrade of reduced GUI combos to full gates),
    `edge.sh` (edge cases), `jsoncheck.sh` (`--dry-run --json`), `recreate.exp` (expect driver for the interactive finish screen).
- Gates were run **directly** with the built CLI (not `scripts/scaffold-check.mjs`), because scaffold-check hard-codes
  `CARGO_TARGET_DIR=<repo>/.scratch/target` and writes into `<repo>/.scratch` by default (finding 17).
- Scaffold: `node dist/bin/create-rust-app.js <combo> <flags> -y` in `/home/user/cra-dogfood/projects/matrix/` (default post-steps: cargo fetch + git init/commit).
- Gates: `cargo fmt --all -- --check`; `cargo clippy --workspace --all-targets -- -D warnings`; same with `--all-features` (CONTRACTS' form);
  `cargo test --workspace`; `cargo deny check`; `RUSTDOCFLAGS='-D warnings' cargo doc --no-deps --workspace`; `cargo +1.98 build --workspace`;
  `actionlint .github/workflows/*.yml`; `zizmor --offline .github/`. Extra: `clippy-win` = clippy with `--target x86_64-pc-windows-msvc`.
- CARGO_TARGET_DIR: `/home/user/cra-dogfood/target-matrix` (non-GUI), `target-matrix-gui` (GUI, so the two drivers didn't block each other on the
  build-dir lock), `target-edge` (edge/licence probes). The built CLI itself respects the env var (it only runs `cargo fetch`).
- Logs: `/home/user/cra-dogfood/logs/matrix/<combo>/<gate>.log`; raw results `logs/matrix/results.tsv`; edge cases `logs/matrix/edge/<id>.log`
  (+ `summary.tsv`); JSON checks `logs/matrix/jsoncheck/`; recreate `logs/matrix/recreate/`.
- Builds were much faster than expected (warm registry/caches); no disk problems (58 GB free throughout).
- All combos got the full gate set except `rustaman-graphite` and `custom` (no `clippy-allfeat`), the licence combos (scaffold + deny + inspect, as asked), and `lib-publish`.

## Pass/fail table

Exit codes in parentheses. zizmor exit 13 = highest finding medium, 14 = high (zizmor docs). "–" = not run.

| combo | scaffold | fmt | clippy | clippy-allfeat | clippy-win | check | test | deny | doc | msrv | actionlint | zizmor | extra |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| cli | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) |  |
| rustaman | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | FAIL(101) | PASS | PASS | FAIL(14) |  |
| lib | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(13) |  |
| minimal | PASS | PASS | PASS | PASS | – | – | PASS | N/A(no deny.toml) | PASS | PASS | PASS | FAIL(13) |  |
| tui | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) |  |
| lib-publish | PASS | – | – | – | – | – | – | – | – | – | – | – | publish-dry-run: PASS |
| cli-subcmd-bin | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) | run-help: PASS |
| cli-tokio-reqwest | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) |  |
| cli-ed2021 | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) |  |
| cli-tracing | PASS | PASS | PASS | PASS | – | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) |  |
| strobe | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) | xtask-ci: PASS, xtask-changelog: PASS |
| minimal-lic-MIT | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| minimal-lic-MIT_CommonsClause | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| minimal-lic-Apache_2_0 | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| minimal-lic-MIT_OR_Apache_2_0 | PASS | – | – | – | – | – | – | FAIL(4) | – | – | – | – | inspect: PASS |
| lic1-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| lic2-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| lic3-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| lic4-deny | PASS | – | – | – | – | – | – | PASS | – | – | – | – | inspect: PASS, publish-dry-run: FAIL(101) |
| rustaman-tray-si | PASS | FAIL(1) | PASS | PASS | PASS | – | PASS | PASS | FAIL(101) | PASS | PASS | FAIL(14) |  |
| rustaman-nodemo | PASS | FAIL(1) | PASS | PASS | – | – | PASS | PASS | FAIL(101) | PASS | PASS | FAIL(14) |  |
| rustaman-glow | PASS | PASS | PASS | PASS | PASS | – | PASS | PASS | PASS | PASS | PASS | FAIL(14) |  |
| rustaman-graphite | PASS | FAIL(1) | PASS | – | – | PASS | PASS | PASS | FAIL(101) | PASS | PASS | FAIL(14) |  |
| custom | PASS | PASS | PASS | – | – | PASS | PASS | PASS | FAIL(101) | PASS | PASS | FAIL(14) |  |

Notes on cells:
- `minimal` deny / `minimal-lic-*` deny FAIL(4): minimal has `cargoDeny` off, so there is no deny.toml and cargo-deny's built-in defaults allow no licence. Not a generator bug; re-run as `lic1..4-deny` (`--with cargoDeny`): all PASS.
  Also note the `minimal-lic-*` crates were all named `my-app` because the uppercase dir name was silently rejected (finding 6).
- `lic*-deny` publish-dry-run FAIL(101): binary kinds write `publish = false` deliberately; expected. `lib-publish` (publishable) PASS.
- `clippy-win` was run on rustaman, rustaman-tray-si, strobe, rustaman-glow, cli: all PASS (Windows-only code such as tray/single-instance/`src/win/` is invisible to Linux clippy).

### Name-length probe (fmt only; `--name` of N chars, nothing else changed) — `logs/matrix/fmtlen-<preset>-<N>/fmt.log`

| preset | 2 | 8 | 16 | 24 |
|---|---|---|---|---|
| rustaman | PASS | PASS | FAIL | FAIL |
| strobe | PASS | PASS | FAIL | FAIL |
| cli / tui / lib / minimal | PASS | PASS | PASS | PASS |

Threshold for rustaman: 13 chars PASS, 14 chars FAIL (`logs/matrix/fmtlen-threshold/summary.txt`).

### `--dry-run --json` per preset (`logs/matrix/jsoncheck/summary.tsv`, `normalized-summary.txt`)

All 7 (rustaman strobe cli tui lib minimal custom): exit 0, stdout is a single valid JSON document starting with `{`, 0 bytes on stderr,
no directory created. Plan file list == files written by a real `-y --no-git --no-fetch` run (58/68/30/31/30/17/57 files) after normalising
the project name. `--preset custom -y` works non-interactively (= defaults: eframe GUI without the screenshot example).

### Edge cases (`logs/matrix/edge/summary.tsv`; each `<id>.log` has command, exit, stdout, stderr)

| case | exit | result |
|---|---|---|
| `--name ''`, `MyApp`, `1app`, `'my app'`, `a/b`, `../escape`, `app-` | 2 | rejected with clear message ✔ |
| `--name test`, `std` | 2 | "reserved in Rust" ✔ |
| `--name fn` / `async` / `type` | 0 | **accepted; generated code doesn't compile** (finding 4) |
| `--name` 300 chars (minimal) | 0 | accepted; cargo fails "File name too long" (finding 5) |
| `--name` 260 chars (rustaman) | 1 | ENAMETOOLONG mid-write, partial project left behind (finding 5) |
| positional `MyDir`, `sub2/Weird_Dir` | 0 | crate silently named `my-app` (finding 6) |
| positional `sub/dir/proj` | 0 | nested dirs created, name `proj` ✔ |
| non-empty dir, no `--force` | 1 | "is not empty. Pick another directory or pass --force." ✔ (checked before any prompt) |
| non-empty dir, `--force` | 0 | unrelated `keep.txt` kept; colliding `README.md` silently overwritten (finding 12) |
| target is a file | 1 | "exists and isn't a directory." ✔ |
| `--no-git` | 0 | no `.git` ✔ ; default run: one commit `feat: scaffold gd with create-rust-app` ✔ |
| `--no-fetch` | 0 | no Cargo.lock ✔ ; default writes Cargo.lock ✔ |
| `--with tray --without tray`, `--with sqlite --without sqlite` | 0 | last wins (documented) ✔ |
| `--preset lib --with tray`; `--preset tui --with subcommands`; `--preset minimal --with subcommands`; `--preset lib --bin foo` | 0 | silently dropped, no warning (finding 13) |
| `--preset cli --gui winit-glow` | 0 | accepted silently; JSON reports `guiStack: "winit-glow"` for a cli (finding 13) |
| `--dry-run --open code` | 0 | tree printed, nothing written, no editor ✔ |
| `--msrv 1.100 --toolchain 1.99.1` | 0 | accepted; `cargo check` fails "rustc 1.99.1 is not supported" (finding 9) |
| `--msrv latest`, `--toolchain 1.99` | 2 | rejected ✔ |
| `--set foo.bar=1`, `features.nope=true`, `__proto__.x=1` | 2 | "Unknown answer key" ✔ |
| `--set features.tray=yes` / `crates.http=curl` / `features=true` / `name=true` / `tagline=true` | 2 | type/choice errors ✔ (note: `tagline=true` can't be set — "tagline must be string", minor) |
| `--set 'tagline=a=b==c'`, quotes/backslashes in value | 0 | value kept intact and escaped correctly in Cargo.toml ✔ |
| `--set features.tray`, `--set =x` | 2 | "--set expects key.path=value." ✔ |
| unknown flag / feature / preset / accent / base / edition / license / open | 2 | clear errors with "Did you mean" ✔ |
| two positionals | 2 | ✔ |
| `NO_COLOR=1` (pty), `--no-color` (pty): run, error, help | 0 | 0 ESC bytes ✔ (control: same run without them has 9 ESC) |
| stdin `</dev/null` / piped, no `-y` | 0 | defaults accepted, scaffolds ✔ (no args at all → full GUI `my-app` + fetch + git) |
| `--quiet` | 0 | nothing on stdout ✔; errors still on stderr ✔ |
| `--json` without `--dry-run` | 0 | writes files, **skips fetch and git**, JSON still says `post.git: true` (finding 7) |
| `.` in empty dir | 0 | name from dir ✔ ; in a dir with only a fresh `git init`: git skipped, no commit (finding 14) |
| `--bin deps`, `--bin con`, `--bin 'Bad Name'` | 2 | rejected ✔ |

### Recreate command (`logs/matrix/recreate/`)

- rc1: interactive run (expect) with `--preset cli --with subcommands,tracing --set crates.async=tokio --license Apache-2.0 --bin rc-tool --base graphite --no-fetch`;
  printed `npx github:freeknet/create-rust-app rc1 --preset cli --with subcommands --set crates.logging=tracing --set crates.async=tokio --license Apache-2.0 --bin rc-tool --no-fetch -y`.
  Run **verbatim** (npx from GitHub worked) and with the local dist: `diff -r` (excl. .git/target/Cargo.lock) **identical** both times.
- rc2: `--preset rustaman --base graphite --accent '#ff9f6e' --author 'Jane Q' --github janeq --with tray` → printed command lacks
  `--accent/--author/--github`; recreated project differs in 14 files (finding 8).

## Findings

Severity: H = breaks a stated gate for normal use, M = wrong output / silent misbehaviour, L = polish.

1. **(H) GUI templates fail `cargo fmt --check` once the project name is ≥14 characters.**
   Repro: `create-rust-app x --name abcdefghijklmn --preset rustaman -y --no-git --no-fetch && cd x && cargo fmt --all -- --check` → exit 1.
   Expected: fmt-clean for any valid name (CONTRACTS "Rust output rules"). Actual: rustaman fails at 14+ chars, strobe at ≤16; cli/tui/lib/minimal fine up to 24.
   Hit in the matrix by `rustaman-tray-si`, `rustaman-nodemo`, `rustaman-graphite` (the asked combos!).
   Logs: `logs/matrix/rustaman-tray-si/fmt.log`, `rustaman-nodemo/fmt.log`, `rustaman-graphite/fmt.log`, `fmtlen-*/fmt.log`, `fmtlen-threshold/summary.txt`.
   Root cause: lines whose length grows with the name and cross rustfmt's 100-column limit:
   `templates/gui/files/src/config.rs:178` (`temp_dir().join(format!("@@name@@-config-{}", …))`),
   `templates/gui/files/examples/screenshot.rs:38` (`App::new(ui.ctx(), @@appCrateSnake@@::config::Config::default())`),
   `templates/gui/files/src/main.rs:92` (single-instance `acquire(@@appCrateSnake@@::APP_ID)`), `templates/gui/files/src/main.rs:169` (`show_error(message, @@appCrateSnake@@::NAME)`).
   The repo's own scaffold-check uses `demo-<preset>` names (13 chars for rustaman), one under the threshold, so tests can't see it.

2. **(H) eframe GUI projects fail `RUSTDOCFLAGS=-D warnings cargo doc`.** Repro: `--preset rustaman -y`, then the doc gate → exit 101.
   Errors: `rustdoc::private_intra_doc_links` (`[`backends`]` links a private fn) and `rustdoc::redundant_explicit_links` (`[`App`](super::app::App)`).
   Affects rustaman, custom, rustaman-nodemo, rustaman-graphite, rustaman-tray-si; winit-glow (strobe, rustaman-glow) passes.
   Logs: `logs/matrix/rustaman/doc.log` (+ same gate in those combos). Root cause: `templates/gui/files/src/gui/run.rs:13` and `:20`.

3. **(M) `--with tray`: broken intra-doc link on non-Windows.** `//! … [`crate::win::tray`]` points at a `cfg(windows)` module, so docs on Linux fail
   (`rustdoc::broken_intra_doc_links`). Log: `logs/matrix/rustaman-tray-si/doc.log`. Root cause: `templates/gui-features/files/src/tray.rs:11`.

4. **(M) Rust keywords accepted as project names; generated code doesn't compile.** `--name fn|async|type --preset minimal -y` → exit 0, then
   `cargo check`: `error: expected identifier, found `::`` at `src/main.rs:17` (`fn::run(…)`). Expected: rejected like `test`/`std`.
   Logs: `logs/matrix/edge/name-kw-{fn,async,type}.log`, `edge/cargo-check-d4{,b,c}.log`. Root cause: `src/context.ts:11` reserved list has no keywords (`fn, async, type, match, mod, use, …`; `self/crate/super` are already there).

5. **(M) No length limit on names.** 300-char `--name` scaffolds (exit 0), but `cargo check` fails "File name too long (os error 36)"
   (`edge/cargo-check-d7.log`). With a GUI preset (260 chars) the CLI itself dies mid-write — `error: ENAMETOOLONG … copyfile … assets/@@name@@.ico`, exit 1 —
   and leaves a partial project (`edge/name-long-gui.out`). Root cause: `src/context.ts:5` (`NAME_RE` unbounded); `src/engine/write.ts:33-38` writes in place with no cleanup on failure. (crates.io caps names at 64.)

6. **(M) A positional dir that isn't a valid crate name silently becomes `my-app`.** `create-rust-app MyDir --preset minimal -y` → dir `MyDir`, crate `my-app`, no warning
   (same for `sub2/Weird_Dir`; it also renamed all four `minimal-lic-*` matrix crates). Logs: `edge/name-positional-only-upper.log`, `edge/name-positional-path2.log`,
   `logs/matrix/minimal-lic-MIT/deny.log` ("my-app v0.1.0"). Root cause: `src/cli.ts:190-193` (invalid basename is ignored instead of reported, or snake/lower-cased).

7. **(M) `--json` without `--dry-run` writes files but skips all post-steps while reporting them on.** `create-rust-app j2 --preset minimal --json` → files written, no
   Cargo.lock, no `.git`; JSON says `"post": {"git": true, "fetch": true}`. Help says only "Emit only { answers, files } JSON; no prompts".
   Logs: `edge/json-nodry.log` (+ manual re-run without --no-git, recorded in this report). Root cause: `src/cli.ts:226-230` returns before the post-step block.

8. **(M) The recreate command drops `--accent`, `--author`, `--github` (and email/displayName).** rc2 (above): recreated project differs in 14 files
   (LICENSE copyright, CODEOWNERS, repository URLs, `ACCENT` in `src/lib.rs`). Log: `logs/matrix/recreate/rc2-command.txt`, `diff-rc2.txt`.
   Root cause: `src/reproduce.ts:20-55` has no branch for `accent`, `author`, `github`, `email`, `displayName`.

9. **(M) `--msrv` newer than `--toolchain` accepted.** `--msrv 1.100 --toolchain 1.99.1` → exit 0, `rust-version = "1.100"` + `channel = "1.99.1"`; `cargo check`
   → "rustc 1.99.1 is not supported by … c5@0.1.0 requires rustc 1.100". Logs: `edge/msrv-gt-toolchain.log`, `edge/cargo-check-c5.log`.
   Root cause: `src/args.ts:93-94` validate format only; no cross-field check (args or `buildContext`).

10. **(M) zizmor fails every generated workflow set** (actionlint is clean everywhere). Exit 14 (high) for all kinds with `release.yml`; 13 for lib/minimal.
    - `cache-poisoning` (high): `Swatinem/rust-cache` in the tag-triggered release build — `templates/github/files/_github/workflows/release.yml:120`.
    - `artipacked` (medium): `actions/checkout` without `persist-credentials: false` — `ci.yml:39,58,74,125`, `release.yml:51,111,231`, `publish.yml:33`.
    - `dependabot-cooldown` (medium): no `cooldown:` — `dependabot.yml:16,38`.
    - `use-trusted-publishing` (info, lib): `publish.yml:62` (`cargo publish` with a token).
    Logs: `logs/matrix/<combo>/zizmor.log`. Remediations per zizmor docs (Context7 /zizmorcore/zizmor): `persist-credentials: false`, `cooldown: default-days: 7`, disable caching on tag refs.

11. **(L) Changelog generators disagree with the shipped CHANGELOG.md.** Running the generator right after scaffolding rewrites the header: cli
    (`cargo run --example changelog`) changes "Cli" → "cli" and swaps the intro paragraph; strobe (`cargo xtask changelog`) rewrites the header in different words again.
    The two generators also differ from each other (example links commits, xtask doesn't). Logs: `logs/matrix/cli/example-changelog.log`, `logs/matrix/strobe/xtask-changelog.log`
    (diffs via `git diff CHANGELOG.md` in those projects). Root cause: `templates/base/files/CHANGELOG.md:3` (`@@displayName@@`) vs
    `templates/guards/files/examples/changelog.rs:586` (`@@name@@`) vs `templates/workspace/files/crates/xtask/src/changelog.rs:152`.

12. **(L) `--force` silently overwrites colliding files.** Pre-existing `README.md` replaced, unrelated `keep.txt` kept; no list, no warning, no backup.
    Log: `edge/nonempty-force.log`. Root cause: `src/engine/write.ts:27-38`. (Behaviour may be intended; it isn't documented beyond "Allow writing into a nonempty directory".)

13. **(L) Conflicting or inapplicable flags are silently dropped.** `--preset lib --with tray`, `--preset tui --with subcommands`, `--preset minimal --with subcommands`
    (no clap), `--preset lib --bin foo`, `--preset cli --gui winit-glow` all exit 0 with no notice. Also inconsistent: `effectiveAnswers` blanks `themeBase` for non-GUI kinds but
    leaves `guiStack`, so `--json` reports `"guiStack": "winit-glow"` for a cli. Logs: `edge/lib-with-tray.log`, `edge/kind-tui-subcommands.log`, `edge/minimal-subcommands-noclap.log`,
    `edge/bin-on-lib.log`, `edge/cli-gui-flag.log`. Root cause: `src/context.ts:52-57` (`effectiveAnswers`); no warnings in `src/args.ts`/`src/cli.ts`.

14. **(L) Dir with only a fresh `git init`: allowed, but nothing is committed.** `targetProblem` deliberately ignores a lone `.git` (`src/engine/write.ts:9`), but `initRepo` then
    skips because the dir is "already inside a git repository" (`src/post/git.ts:28`); the summary still lists "then git init + first commit". Log: `edge/dir-dot-gitonly.log`.

15. **(L) Inconsistent error prefix in non-TTY.** Argument errors print `✖ …` (pre-detection `fallbackCaps` hard-codes `glyphs: 'full'` on non-Windows, `src/cli.ts:26`); errors after
    capability detection print `error: …` (ascii). Compare `edge/name-upper.log` vs `edge/nonempty-noforce.log`.

16. **(L, design) Defaults stamp the template author's identity on every project.** `-y` without `--author/--github` writes "Copyright (c) 2026 Lawrence Norton",
    `* @lnorton89` in CODEOWNERS and `github.com/lnorton89/<name>` URLs. Root cause: `src/presets.ts:9-10` (matches PLAN ★ defaults; risky for a public scaffolder —
    suggest reading `git config user.name` or leaving blank). Evidence: `logs/matrix/lic1-deny/inspect.log`, `recreate/diff-rc2.txt`.

17. **(L, dev tooling) `scripts/scaffold-check.ts`.** (a) Overrides any `CARGO_TARGET_DIR` with `<repo>/.scratch/target` (line 66) and defaults `--out` into the repo (line 33),
    so it couldn't be used under the "never inside the repo" rule. (b) `--set` splits on every `=` (line 39): `--set tagline=a=b` produces `description = "a"`
    (`logs/matrix/scaffold-check/set-eq.log`); the real CLI handles this correctly.

18. **(Info)** The non-interactive (`-y`) finish screen doesn't print the "again without prompts" command (only `runInteractive` does, `src/cli.ts:138`); the
    recreate check therefore needed an expect-driven interactive run.

19. **(Info)** Windows-only code (tray, single instance, `src/win/`) is never compiled by Linux `clippy`/`test`; checked separately with
    `--target x86_64-pc-windows-msvc` clippy: PASS (`logs/matrix/<combo>/clippy-win.log`).

## Verified OK (no finding)

`--edition 2021` (all gates), `tracing` (`unused_imports = "deny"  # forbid breaks the tracing macros (E0453)` present, clippy PASS — `logs/matrix/cli-tracing/`),
tokio+reqwest, subcommands + `--bin other-tool` (help shows `Usage: other-tool`, binary `target/debug/other-tool` exists), every MSRV build on 1.98,
lib `cargo publish --dry-run` (packages 33 files, verifies), strobe `cargo xtask ci` (fmt+clippy+test) and `cargo xtask changelog`, `--base graphite --accent #ff9f6e`
(accent reaches `src/lib.rs`, Graphite base in `src/theme/mod.rs`), licence files (MIT → LICENSE + `license = "MIT"`; Apache-2.0 → Apache text; dual → LICENSE-MIT + LICENSE-APACHE
+ `license = "MIT OR Apache-2.0"`; MIT+CommonsClause → Commons Clause + MIT text in LICENSE and `license-file = "LICENSE"`), cargo-deny PASS on every config that ships deny.toml,
`--dry-run --json` purity and plan/real parity, NO_COLOR/`--no-color`, `--quiet`, non-TTY defaults, `--set` validation incl. prototype keys.
