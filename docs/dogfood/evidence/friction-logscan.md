# Friction log: building `logscan` on a fresh `cli` scaffold

Dogfood run, 2026-11-20. create-rust-app built from `/home/user/create-rust-app` (dist).
Project: `/home/user/cra-dogfood/projects/real/logscan`. Logs: `/home/user/cra-dogfood/logs/real-cli/`.

Cost notation: `[~Nm, K attempts]` = rough wall-clock minutes spent / number of tries.

## 0. Scaffold (`scaffold.log`)

Command:

```
node dist/bin/create-rust-app.js logscan --name logscan --preset cli --with subcommands \
  --author "Dogfood Tester" --github dogfood-tester --license "MIT OR Apache-2.0" \
  --set tagline="Parse, filter and summarise log files" -y --no-color
```

`[~1m, 1 attempt]` Clean. 31 files, git init + first commit, cargo fetch.

- Minor: the summary prints `then  git init + first commit / cargo fetch` *after* both have already run;
  reads like a to-do list rather than a record of what happened.
- Minor: the tagline is pasted verbatim into sentences that need a full stop, so the generated docs read
  `Logscan is a command-line tool in Rust. Parse, filter and summarise log files` (CLAUDE.md line 3),
  `Thanks for considering a contribution to Logscan: Parse, filter and summarise log files` (CONTRIBUTING.md)
  and `//! Logscan: Parse, filter and summarise log files` (src/lib.rs). The `--help` example
  (`--set tagline="A useful app"`) has no full stop either, so every user hits this.
- Scaffold-pinned crate versions checked against crates.io (2026-11-20): anyhow 1, clap 4 (4.6.9),
  dirs 7 (7.0.0), env_logger 0.11 (0.11.11), log 0.4, serde 1, toml 1.2 (1.2.1), tempfile 3 (3.27.0).
  **All current; nothing outdated.**

## 1. Following the generated docs (README / AGENTS.md / CLAUDE.md / CONTRIBUTING.md)

`[~10m reading]` Overall the docs are good: the header-banner rule, the lint rules, `#[expect]` policy and
"commit by path" are all clearly stated, and CLAUDE.md's banner example was enough to write nine new
files that passed `header_check` first time. Inaccuracies found:

- **CHANGELOG policy contradicts the shipped generator** `[~6m]`. CLAUDE.md ("`CHANGELOG.md` moves with the
  code: Every user-visible change adds a line under `## [Unreleased]`") and CONTRIBUTING.md ("Add a line
  under `## [Unreleased]` in the same pull request") describe a *hand-written* changelog, and the
  generated CHANGELOG.md says "Entries follow the conventional-commit subjects". But the scaffold also
  ships `examples/changelog.rs`, which says "The changelog is derived, not authored", and
  **`cargo run --example changelog -- --check` fails on the untouched fresh scaffold** ("CHANGELOG.md is
  out of date with the git history"). Regenerating rewrites the header to "**This file is generated.**",
  lower-cases the display name (`logscan` vs `Logscan`) and replaces the hand-written entry with the raw
  commit subject. So the single-crate `cli` preset documents one policy and ships a tool enforcing the
  other. Nobody runs `--check` in CI, so it is a latent trap rather than a red gate.
  Responsible: `templates/base/files/CHANGELOG.md:5-12` (`@if changelogGen & workspace` - the
  generated-file wording is only used for workspaces), `templates/base/files/CLAUDE.md:220-235`
  (`@elif changelogGen` = manual policy for single crates), `templates/base/files/CONTRIBUTING.md:177-188`,
  vs `templates/guards/files/examples/changelog.rs` (mounted for any `changelogGen`,
  `src/engine/groups.ts:24`) whose output header is at `templates/guards/files/examples/changelog.rs:588`.
  CLAUDE.md's Commands block (`templates/base/files/CLAUDE.md:48-50`) only lists the changelog command for
  workspaces (`cargo xtask changelog`); single crates are never told the example exists.
- **README placeholder**: "Logscan is a command-line tool. Describe here what it does and who it is for"
  (`templates/base/files/README.md:31`). Expected, but the "What's inside" section then describes the
  *scaffold* (clap, env_logger, forgiving config) as if they were product features; a user has to rewrite
  the whole top half. I replaced it with real usage.
- **Tagline without a full stop** (see section 0), `templates/base/files/CLAUDE.md:6`,
  `templates/base/files/CONTRIBUTING.md:3`, `templates/cli/files/src/lib.rs:33`.
- CLAUDE.md Commands lists `cargo run   # the app, debug` - with `subcommands` on, a bare `cargo run` is a
  usage error (exit 2). Harmless but slightly wrong for this preset.
- CLAUDE.md says the lint ban applies "not even in tests"; CONTRIBUTING agrees. Accurate (clippy's
  `unwrap_used` is denied in tests too), and the scaffold's own tests show the `-> anyhow::Result<()>` +
  `let ... else { bail! }` pattern, which made it easy to follow.

## 2. Things the scaffold shape made me rewrite

- **`run(args, out)` has no stdin and no TTY/colour information** `[~10m]`. `src/lib.rs`'s entry point
  takes only args and a `Write`, and `config::load()` is called *inside* the command (reads the real
  user config dir during in-process tests). A log tool needs stdin, needs to know whether stdout is a
  terminal (colour), and tests need to inject config. I replaced it with an `Io { stdin, stdout,
  terminal, config }` struct, moved `config::load()` and terminal detection to `main.rs`, and rewrote
  all of `tests/cli.rs`. Responsible: `templates/cli/files/src/lib.rs` (`run` signature),
  `templates/cli/files/src/main.rs`, `templates/cli/files/src/cli.rs` (`hello` calls `config::load()`).
  A scaffolded CLI arguably should pass a stdin reader through from day one.
- **`main` returns `anyhow::Result<ExitCode>`** `[~5m]`: errors print as Rust's `Debug` form
  (`Error: ...` + `Caused by:` block, plus a full backtrace when `RUST_BACKTRACE=1` is set, as it is in
  this environment). For a user-facing CLI I rewrote `main` to print one `logscan: error: ctx: cause`
  line and exit 1. Also **no broken-pipe handling**: `logscan parse big.log | head` would print
  "Error: Broken pipe". Added `is_broken_pipe` + quiet exit 0 (and a test). Responsible:
  `templates/cli/files/src/main.rs`. Both are things every CLI built on this needs.
- `hello`/`sum` placeholder commands, their tests and the greeting/name config fields: deleted/replaced
  (expected; the module docs say to). The forgiving per-field config parser and atomic save were kept
  and reused for `color`/`top` defaults - genuinely useful.
- **`*.log` in the generated `.gitignore` silently ignores test fixtures** `[~3m, caught only because I
  checked git status]`. My `tests/fixtures/*.log` files were invisible to git, so the tests that pass
  locally would fail in CI on a missing file. Fixed with `!tests/fixtures/*.log`. Responsible:
  `templates/base/files/_gitignore:4`. Any project that processes logs (or keeps `.log` golden files)
  hits this; consider dropping the rule or adding the negation by default.

## 3. Adding modules: header banner + `header_check`

`[~0m extra, 1 attempt]` Nine new `src/*.rs` and one `tests/binary.rs`, all passed `header_check` on the
first run. Copying an existing banner as CLAUDE.md says, and the path->`Module:` rule
(`tests/x.rs` -> `x (integration test)`) is documented precisely. Helped rather than obstructed. I did
not need the error messages; reading `src/header_check.rs` they are specific (`declares Module: X but
sits at Y`, `header line exceeds 100 columns`). One oddity: the rule for `src/bin/helper.rs` is
`<crate>-helper (binary crate root)` (`templates/guards/files/src/header_check.rs`, `module_for`), but
Cargo names that binary `helper`, not `logscan-helper`.

## 4. Dependencies + cargo-deny

`[~3m, 1 attempt]` Added `regex 1.13`, `serde_json 1.0`, `jiff 1.0` (no default features, `std,serde`),
`anstyle 1.0`. `cargo deny check` passed immediately: licences ok, advisories ok, sources ok.

- Noise: **the fresh scaffold already emits 11 `license-not-encountered` warnings** (OFL-1.1,
  Ubuntu-font-1.0, MPL-2.0, Zlib, BSL-1.0, ... in a CLI with no fonts or GUI deps). Real warnings (like
  my duplicate `jiff 0.2` via env_logger vs `jiff 1.0`) drown in them. Responsible:
  `templates/base/files/deny.toml` (or wherever the allow-list is generated); it is the GUI list applied
  to every kind. Not a failure, just noise.
- `deny.toml` `[graph] targets` includes `x86_64-pc-windows-msvc` and `rust-toolchain.toml` adds the
  MSVC target for a CLI preset, so every Linux developer's rustup downloads the Windows std on first
  build. Minor.
- `multiple-versions = "warn"`: jiff 0.2 (env_logger) + 1.0 (mine) is a duplicate. Fine as a warning.

## 5. Lint strictness

`[~5m total, 2 attempts]` Surprisingly little friction on ~1,500 lines of new code:

- `warnings = "deny"` promoted `private_interfaces` to an error when a `pub` method of the (necessarily
  public) `style` module took the crate-private `Level`. Fix: narrow to `pub(crate)`. 1 attempt.
- `unreachable_pub = "forbid"` forced a sweep of every `pub` in private modules to `pub(crate)` before
  the first build. Expected and documented; one `sed`.
- `RUSTDOCFLAGS="-D warnings" cargo doc` failed once: `rustdoc::private_intra_doc_links` (module doc of a
  public module linked a `pub(crate)` type). Note **CI never runs `cargo doc`**, so this class of error
  would rot silently in a generated project (see 7).
- `clippy::too_many_arguments` would have fired on a flat `filter(...)` helper; I restructured into a
  `#[derive(clap::Args)] FilterArgs` struct instead of reaching for `#[expect]`. In the end I needed
  **zero `#[expect]`s**, so the expect path was never exercised for real.
- Docs inaccuracy: CLAUDE.md says "Suppress with `#[expect(lint, reason = "...")]`, never `#[allow]`"
  as a general rule, but `unused_imports`, `unused_must_use`, `unreachable_patterns` and `unreachable_pub`
  are `forbid` in `[lints.rust]`, and **`forbid` lints cannot be `#[expect]`ed at all** (rustc errors
  "incompatible with previous forbid"). Worth one sentence in `templates/base/files/CLAUDE.md` (lint
  section, ~line 135-150).
- `wildcard_enum_match_arm` made me write `(Some(_) | None, true) | (None, false)` in one tuple match;
  slightly awkward but fine.

## 6. Gates (final state, logs in `/home/user/cra-dogfood/logs/real-cli/`)

| Gate | Result | Log |
|---|---|---|
| `cargo fmt --all -- --check` | pass | `fmt.log` |
| `cargo clippy --all-targets --all-features -- -D warnings` | pass (also for `--target x86_64-pc-windows-msvc`) | `clippy.log`, `clippy-windows-target.log` |
| `cargo test --all-features` (67 tests incl. 8 header_check + toolchain_pin) | pass | `test.log` |
| `cargo deny check` | pass (13 warnings: 11 unused licences, 2 duplicate jiff) | `deny.log` |
| `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps` | pass on attempt 2 | `doc.attempt1.log`, `doc.log` |
| `cargo +1.98 build` / `cargo +1.98 test` (MSRV) | pass | `msrv.log`, `msrv-test.log` |
| `actionlint` | pass, also on the unmodified generated workflows (but see note) | `actionlint.generated.log`, `actionlint.log` |
| `zizmor` | **generated workflows FAIL** (exit 14: 7x medium `artipacked`, 1x high `cache-poisoning`); pass after my fix | `zizmor.online-attempt.log`, `zizmor.attempt1-generated.log`, `zizmor.log`, `zizmor-pedantic.log` |

No lint table, deny policy or guard test was weakened. The only scaffold policy files changed were
`.gitignore` (un-ignore fixtures) and the two workflows (made *stricter*).

- **zizmor out of the box** `[~8m]`: plain `zizmor .github/workflows/` dies with a 401 (online audits need a
  GitHub token); `--offline` is needed in a sandbox. Then it fails the generated workflows:
  - `artipacked` on every `actions/checkout` (no `persist-credentials: false`):
    `templates/github/files/_github/workflows/ci.yml:39,58,74,125` and
    `templates/github/files/_github/workflows/release.yml:51,111,231`. None of the jobs push with git
    (`gh` uses `GH_TOKEN`), so `persist-credentials: false` is free.
  - `cache-poisoning` (high): `Swatinem/rust-cache` in the tag-triggered release build,
    `templates/github/files/_github/workflows/release.yml:120`. A release binary built from a cache that
    PR runs can write to is exactly the risk the file's own SHA-pinning comments argue against. I removed
    the step.
  - The generator repo has no actionlint/zizmor check of its output at all (`grep -r zizmor` in the repo:
    nothing), which is how this shipped.
- **actionlint caveat**: `shellcheck` is not installed in this environment, so actionlint silently skipped
  the `run:` scripts. It would likely flag `gh release upload "$TAG" $(find . -type f) --clobber`
  (SC2046, `release.yml` "Upload and undraft") - harmless with these file names.

## 7. Step 5: would `ci.yml` / `release.yml` work for logscan?

Verified locally where possible: the tag/version `awk` prints `0.1.0` from this `Cargo.toml`; installing
`cargo-cyclonedx 0.5.9 --locked` and running the exact SBOM command with
`--target x86_64-pc-windows-msvc --override-filename logscan.cdx` writes `logscan.cdx.json`
(CycloneDX 1.3, 52 components), which is the path the next step copies (`sbom-sim.log`).

**ci.yml - works**, with gaps:
- fmt, cargo-deny (action, `--all-features`), Windows (clippy, test, `cargo build --release --bins`) and
  Linux (clippy, test) jobs all map onto commands that pass here. Toolchain `1.99.1` matches
  `rust-toolchain.toml` (and `tests/toolchain_pin.rs` enforces it). Permissions `contents: read`.
- Gap: **MSRV is declared (`rust-version = "1.98"`) but never built in CI**, and **`cargo doc -D warnings`
  is not run**; both were gates in this exercise and both could regress unnoticed.
  (`templates/github/files/_github/workflows/ci.yml`).
- My own Windows-only trap, which the scaffold's config design invites: `dirs::config_dir()` on Windows
  ignores env vars, so integration tests that spawn the binary cannot isolate the user config via
  `XDG_CONFIG_HOME`/`APPDATA`. I added a `LOGSCAN_CONFIG` override. The scaffold's config module could ship
  that hook (`templates/cli/files/src/config.rs`, `config_path`).

**release.yml - would run green on a public repo, but ships the wrong thing for a CLI:**
- Correct: `v*` tag trigger + `workflow_dispatch` with tag input; tag-vs-Cargo.toml check before any
  build; draft -> build -> attest -> publish ordering; per-job permissions (only `draft`/`publish` get
  `contents: write`, only `publish` gets `id-token`/`attestations: write`); binary path
  `target/x86_64-pc-windows-msvc/release/logscan.exe` matches the crate name; artifact name
  `release-assets-<target>` and `pattern:` + `merge-multiple` download are right; both attest actions
  point at files that exist (`dist/*.zip`, `dist/logscan-${TAG}-sbom.cdx.json`).
- **Only `x86_64-pc-windows-msvc` is built for the `cli` preset** - no Linux or macOS binary for a
  command-line tool. And the comment "adding a target later is an entry rather than a rewrite" is not
  true: Package hard-codes `logscan.exe` and `7z ... -tzip`, and the SBOM is named
  `logscan-${TAG}-sbom.cdx.json` without the target, so two matrix entries would collide under
  `merge-multiple: true` and `attest-sbom` takes a single `sbom-path`. Responsible:
  `templates/github/files/_github/workflows/release.yml:105-106` (matrix), `:145` (package, `.exe`),
  `:187` (SBOM name without target) and `:256-259` (`attest-sbom` single `sbom-path`).
- `actions/attest-build-provenance` / `attest-sbom` only work on public repos (or GitHub Enterprise
  Cloud private repos); a private repo on a personal plan fails the `publish` job after the draft is
  made. Not mentioned in CONTRIBUTING's "Cutting a release".
- `cargo install cargo-cyclonedx` compiles from source on every release (a few minutes on Windows);
  acceptable.
- zizmor findings above (now fixed in my copy).

## 8. What I had to build that the scaffold could provide

- stdin plumbing + TTY/`NO_COLOR` colour decision + `--color` flag (every CLI needs these; the
  scaffold's `run(args, out)` has neither) `[~15m]`.
- single-line error printing and broken-pipe-is-success in `main` `[~5m]`.
- an integration test that spawns the real binary (`CARGO_BIN_EXE_<name>`) with a hermetic env; the
  scaffold only has in-process tests, which cannot see exit codes of `main`, stderr, or colour detection
  `[~10m]`.
- a config-path env override for test isolation (see 7) `[~5m]`.

## 9. What helped

- `header_check` + the CLAUDE.md example: zero failed attempts across 10 new files.
- Strict lints caught nothing I disagreed with; the tests-return-`Result` pattern was easy to follow.
- The forgiving config parser and atomic save, reused as-is for `color`/`top`.
- cargo-deny's allow-list covered regex/jiff/serde_json/anstyle (MIT/Apache/Unlicense) without edits.
- SHA-pinned actions, least-privilege permissions, the tag/version check and the toolchain-pin test are
  all genuinely good.

## Ranked by time cost (rough)

1. Scaffold `run()` shape: no stdin/TTY/config injection; rewrote lib/main/tests (~25m incl. section 8).
2. Windows test isolation / config dir (~10m).
3. zizmor failures on generated workflows + offline flag (~8m).
4. CHANGELOG policy vs `examples/changelog.rs --check` failing on a fresh scaffold (~6m).
5. `main` error format + broken pipe (~5m).
6. Lints: private_interfaces / unreachable_pub sweep / rustdoc private link (~5m).
7. `*.log` gitignore hiding fixtures (~3m, but would have cost a red CI run).
8. deny.toml noise (11 warnings on a fresh scaffold) (~2m).
