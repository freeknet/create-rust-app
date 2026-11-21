# Friction log: `humandur` (real library on the `lib` preset)

Started 2026-11-20 19:27 UTC. Kept as I went; time/attempt costs are rough wall-clock.
Logs: `/home/user/cra-dogfood/logs/real-lib/`. Project: `/home/user/cra-dogfood/projects/real/humandur`.

## 0. Scaffold (0.6 s, 1 attempt)

Command (also in `logs/real-lib/scaffold.log`):

```
create-rust-app humandur --preset lib --name humandur --author "Dogfood Tester" \
  --github dogfood-tester --license "MIT OR Apache-2.0" \
  --set tagline="Parse and format human-readable durations" --with thiserror --no-color -y
```

Baseline gates on the untouched scaffold (`logs/real-lib/baseline/`): fmt, clippy, test, deny, doc
(-D warnings), `cargo +1.98 test`, `cargo package --list` all exit 0. Good starting point.

First impressions while reading the scaffold:

- **F0.1 lib preset ships unused, non-optional runtime deps** (~5 min to notice and remove). `[dependencies]`
  has `log`, `serde` (derive), `toml` that the library code never uses; every downstream user would
  compile serde_derive + toml for nothing. For a library, serde should be an *optional feature*, and
  `toml` has no business being a lib dependency at all. The summary line even says
  `crates anyhow / log / serde + toml / thiserror` although I only passed `--with thiserror`.
  Cause: `src/presets.ts:20` (DEFAULTS `serde: true, logging: 'log'`) is not overridden by the lib preset at
  `src/presets.ts:53`, and `src/gen/deps.ts:30` always pairs serde with `toml` (and never makes it optional),
  `src/gen/deps.ts:27` adds `log` unconditionally.
- **F0.2 `keywords = []`, `categories = []`** emitted empty in Cargo.toml. Fine as a TODO, but nothing
  (doc, comment, check) tells you to fill them before publishing; crates.io search/categorisation suffers.
- **F0.3 Tagline used as a sentence without a full stop**: CLAUDE.md "Humandur is a Rust library crate.
  Parse and format human-readable durations" (no period), CONTRIBUTING "Thanks for considering a
  contribution to Humandur: Parse and format human-readable durations" (no period), lib.rs `//! Humandur: Parse ...`.
- **F0.4 `examples/changelog.rs` (724 lines) in a library's `examples/`** - a repo tool, not an example of the
  library's API. It is shipped in the crate package and shows up as a docs.rs/`cargo run --example` example.
- **F0.5 Changelog policy contradiction.** CLAUDE.md/CONTRIBUTING: "Every user-visible change adds a line under
  `## [Unreleased]` in the same commit" (hand-maintained). `examples/changelog.rs` docs: "The changelog is
  derived, not authored ... Released sections are rewritten on every run. Prose added to one is lost".
  Also changelog.rs says "the GitHub release body, which `.github/workflows/release.yml` owns" - this lib
  project has no release.yml, only publish.yml.
- **F0.6 CONTRIBUTING's Windows linker paragraph** ("CI and the release build use `link.exe`, ... a change to
  what ships") is binary-app advice; a library ships source.
- **F0.7 `[profile.release]` with `panic = "abort"`, fat LTO, `strip` in a library manifest** (and CLAUDE.md's
  "Things that are deliberate: `panic = "abort"` ... Smaller, faster binaries"). Profiles in a library's
  manifest are ignored by every dependent; for a lib this is noise that reads like policy.
  `src/gen/cargo.ts:41` (profiles), `templates/base/files/CLAUDE.md:146,248`.
- **F0.8 `rust-toolchain.toml` adds `targets = ["x86_64-pc-windows-msvc"]`** for a pure library: every
  contributor's rustup downloads a Windows std they never use. `templates/base/files/rust-toolchain.toml:11`.

## 1. Writing the crate (~20 min, the cheap part)

Deleted `src/version.rs`; rewrote `src/lib.rs`, `src/error.rs`, `examples/basic.rs`, `tests/api.rs`; added
`src/{unit,parse,format,human,serde_support}.rs`, `tests/roundtrip.rs`. 19 files changed in one commit
(`686d1d6`), staged by path as CLAUDE.md asks.

### Header banner rule / `header_check` (helped; 0 failed attempts, ~2 min)

- Wrote 7 new files with banners copied from the CLAUDE.md example; `header_check` passed first time.
- Probed the failure path on purpose (`benches/probe.rs` with `Module: probe`, `examples/noheader.rs`
  without banner): messages are precise and list all files at once:
  `benches/probe.rs: declares `Module: probe` but sits at `probe (benchmark)``. Good.
- Coverage: walks `src/`, `tests/`, `examples/`, `benches/` and `build.rs`. CLAUDE.md
  (`templates/base/files/CLAUDE.md:172`) says only `src/`, `tests/` and `examples/`, and documents the
  `(integration test)` suffix but not `(example)` / `(benchmark)` - you learn those from the error.
- "does not open with the header rule" does not print the rule or point at CLAUDE.md; a one-line hint
  ("copy the banner from src/lib.rs") would make it self-serve. `templates/guards/files/src/header_check.rs:156`.
- Note: the check runs only under `cargo test --lib`; `cargo test --test api` alone skips it (fine).

### Lint strictness (low friction; 1 failed attempt, ~3 min)

- The table is *not* pedantic: no `arithmetic_side_effects`, `indexing_slicing`, `cast_*`,
  `missing_errors_doc`, `must_use_candidate`. Exact parsing with `u128` arithmetic, `%`, `/`, `as`-free
  conversions produced **zero** lint hits in `src/`. (I used checked ops / `try_from` by choice.)
- The one hit: `clippy::wildcard_enum_match_arm` in `tests/api.rs` on a downstream-style match over my own
  `#[non_exhaustive] ErrorKind`, where a `_` arm is *mandatory* from outside the crate. Clippy's suggestion
  (`ErrorKind::A | ErrorKind::B | ... | _`) is acceptable and arguably the point, so no `#[expect]` was needed.
  But the scaffold's own `src/error.rs` doc ("every downstream `match` already needs a wildcard arm")
  doesn't mention that house-style consumers must also enumerate every variant. The note
  "requested on the command line with `-D clippy::wildcard-enum-match-arm`" is misleading (it is in
  `[lints]`; that's Cargo/clippy wording, not the scaffold's).
- `missing_docs` is `deny` but only covers public items; it pushed nothing unreasonable.
- CLAUDE.md says "no `unwrap` ... not even in tests". True for `#[test]` (clippy `--all-targets`), but
  **doctests are never clippy-linted**, so an `unwrap()` in a doc example would pass every gate. Worth one
  sentence. `templates/base/files/CLAUDE.md:~140`.
- `#[expect(..., reason)]` path: never needed, so untested here.

### Dependencies and features (~5 min, 1 attempt)

- Removed `log`, `toml` and non-optional `serde` (F0.1); added `serde` as `optional = true,
  default-features = false, features = ["std"]` behind `serde = ["dep:serde"]`.
- `proptest = { version = "1.12", default-features = false, features = ["std"] }` (latest, MSRV 1.88) and
  `serde_json` as dev-deps. **cargo-deny passed first time** - proptest's tree (rand 0.10, chacha20,
  regex-syntax, unarray, bit-set...) is all on the allow-list. No change to deny.toml needed. Chose proptest
  (not a hand-rolled generator) because nothing blocked it.
- Every `cargo deny check` prints **13 `license-not-encountered` warnings** (MPL-2.0, OFL-1.1, Ubuntu-font-1.0,
  Zlib, ... ). The allow-list is the GUI one (fonts!) applied to a lib; for a library, allowing MPL-2.0 is also
  a policy choice a user may not want silently. `src/gen/deny.ts:6-7`.
- Running `cargo deny check --all-features` locally fails (`unexpected argument`): the flag goes *before* the
  subcommand (`cargo deny --all-features check`); `deny.toml` already sets `[graph] all-features = true`, so CI's
  `arguments: --all-features` is redundant but harmless.
- Versions pinned by the scaffold are current as of today (thiserror 2 -> 2.0.21, serde 1 -> 1.0.229,
  toml 1.2 -> 1.2.1, anyhow 1 -> 1.0.104). Major-only specs (`"1"`, `"2"`) mean the real minimum is untested
  (no `-Z minimal-versions` job); I tightened mine to the versions I actually tested.

## 2. Gates (all green at the end; logs in `logs/real-lib/`)

| Gate | Result |
|---|---|
| `cargo fmt --check` | pass after one `cargo fmt` (2 diffs in my code) |
| clippy `--all-features` / `--no-default-features` (+ on 1.98) | pass |
| `cargo test` default / `--all-features` / `--no-default-features` (header_check, toolchain_pin, 18 doctests, 6 proptests) | pass |
| `cargo deny check` (+ `--all-features`) | pass (13 noise warnings) |
| `RUSTDOCFLAGS=-D warnings cargo doc --no-deps` both configs | pass |
| `cargo +1.98 build` / `test` both configs; `cargo msrv verify` | pass |
| `cargo publish --dry-run --allow-dirty`; tests inside the extracted `.crate` | pass |
| actionlint | pass (also on the untouched scaffold) |
| zizmor (default persona) | scaffold: **5 medium `artipacked` + 1 info `use-trusted-publishing`, exit 13**; after my fixes: 0 findings |

Not run: a real docs.rs build (`--cfg docsrs` needs nightly; none installed).

## 3. Packaging (`cargo package --list`) (~5 min)

Untouched scaffold ships **everything**: `.github/**` (workflows, issue forms, CODEOWNERS, dependabot),
`AGENTS.md`, `CLAUDE.md`, `deny.toml`, `.editorconfig`, `.gitattributes`, `examples/changelog.rs` (724-line
repo tool), `src/header_check.rs`, `tests/toolchain_pin.rs`, `rust-toolchain.toml`. Licence files and README are
present (good). There is no `include`/`exclude` and no doc telling you to curate the package.

I added an `exclude` list (`.github/`, agent docs, `deny.toml`, editor files, `examples/changelog.rs`). Things I
could *not* cleanly exclude:
- `rust-toolchain.toml`: `tests/toolchain_pin.rs` errors ("rust-toolchain.toml not found") if it is missing, so
  excluding it breaks `cargo test` from the published crate (distro packagers / crater run these).
  `templates/guards/files/tests/toolchain_pin.rs:17-27`.
- `tests/toolchain_pin.rs` itself ships but is vacuous without `.github/` (passes, checks nothing).
Verified `cargo test --all-features` passes inside `target/package/humandur-0.1.0` (`packaged-crate-test.log`).

## 4. CI / release verdict for a library (~10 min)

Generated `ci.yml` (`templates/github/files/_github/workflows/ci.yml`): fmt, cargo-deny, then *identical*
clippy+test jobs on Windows and Linux with `--all-features` only.
- **No MSRV job**, although `rust-version = "1.98"` is a public promise and README shows an MSRV badge.
- **No `--no-default-features` / feature matrix**: an optional feature that breaks the default build passes CI.
- **No docs job** (`RUSTDOCFLAGS=-D warnings cargo doc`), despite "docs.rs ready" in the README.
- **No package/publish-dry-run job** on PRs; the only dry run is in the manual publish workflow, i.e. at release time.
- Windows job is reasonable for a lib only if it has OS-specific code; costs a 60-minute runner otherwise.
- **`actions/checkout` without `persist-credentials: false`** (zizmor `artipacked`, medium) at
  `ci.yml:39,58,74,125` and `publish.yml:33`.

**The toolchain-pin test blocks the obvious MSRV job** (top friction, ~10 min including reading the test):
`tests/toolchain_pin.rs` (`every_workflow_pins_the_same_toolchain_as_the_repo`) asserts that *every*
`toolchain:` key in every workflow equals `rust-toolchain.toml`'s channel, so
`dtolnay/rust-toolchain` with `toolchain: "1.98"` fails `cargo test`. I did not weaken the test; I installed
the MSRV with `rustup toolchain install "$(sed ... Cargo.toml)"` and `cargo +$MSRV test`, which sidesteps the
check (and reads the version from `rust-version`, so it can't drift). A real user would more likely just
delete/relax the test. Fix in the generator: emit an MSRV job and let the test accept `rust-version`.
`templates/guards/files/tests/toolchain_pin.rs:83-106`.

`publish.yml` (selected for libs by `templates/github/manifest.js:15`): sensible shape (manual
`workflow_dispatch`, ref/version check, dry run, no binary artifacts, correct for a lib). Gaps:
- Uses a long-lived `CARGO_REGISTRY_TOKEN` secret; crates.io trusted publishing exists (zizmor flags it).
  I switched to `rust-lang/crates-io-auth-action@3268eb4 # v1.0.6` with job-scoped `id-token: write`.
  `templates/github/files/_github/workflows/publish.yml:9,61-62`.
- Runs no tests before publishing (`cargo publish` only builds). Added both feature configs.
- Ref check accepts a *branch* named `v0.1.0`; added a `github.ref_type == tag` check.
- No GitHub release / changelog body for libs (fine, but changelog.rs docs point at a release.yml that
  isn't generated - F0.5).
- zizmor pedantic: 6 `superfluous-actions` infos (dtolnay/rust-toolchain where rustup is preinstalled);
  `undocumented-permissions` after my `permissions:` block until I added per-line comments.

Cargo.toml metadata for crates.io: description, license, repository, readme, rust-version, edition,
docs.rs metadata all present (good). `keywords`/`categories` empty (F0.2; filled in). No `exclude` (section 3).
`documentation`/`homepage` absent, which is fine (crates.io defaults to docs.rs).

## 5. Generated docs accuracy (quotes)

- CLAUDE.md: "`src/header_check.rs` walks `src/`, `tests/` and `examples/`" - it also walks `benches/` and `build.rs`.
- CLAUDE.md + CONTRIBUTING: "Every user-visible change adds a line under `## [Unreleased]`" vs.
  `examples/changelog.rs`: "The changelog is derived, not authored". **The pristine scaffold fails its own
  `cargo run --example changelog -- --check`** ("CHANGELOG.md is out of date with the git history"), and
  running the generator rewrites the header ("This file is generated") and replaces my hand-written
  Unreleased lines with commit subjects. Root cause: `templates/base/files/CHANGELOG.md:5` and
  `templates/base/files/CLAUDE.md:~229` only switch to the "generated" wording for `changelogGen & workspace`,
  while single-crate projects still get the generator (`templates/guards/files/examples/changelog.rs`).
  `--check` also dumps a 20-frame anyhow backtrace (RUST_BACKTRACE set in this env, but it's an expected
  user error, not a bug). Log: `changelog-example.log`.
- `examples/changelog.rs:49,347`: "`.github/workflows/release.yml` owns" the release body - libs get `publish.yml`.
- CLAUDE.md "Errors are one `thiserror` enum" - a positioned parse error is naturally a struct + kind enum;
  I reworded it (`templates/base/files/CLAUDE.md:~250`).
- CLAUDE.md/CONTRIBUTING/lib.rs tagline sentences missing a full stop (F0.3).
- README "What's inside: Typed errors. One `Error` enum and a `Result` alias" - placeholder-ish marketing for
  the template's Version type; had to rewrite the whole section anyway.
- AGENTS.md handoff list omits `cargo deny check` and doc/MSRV checks that CI (after my changes) runs; the
  README/CLAUDE lists include deny. Minor inconsistency across the three docs.
- Accurate and useful: the commit-by-path rule, the banner example, the toolchain-pin explanation,
  "examples are compiled by `cargo test`".

## 6. Deleted / rewritten from the scaffold

Deleted `src/version.rs` (template demo), `log`/`toml`/non-optional `serde` deps. Rewrote lib.rs, error.rs,
basic example, api test, README body, CHANGELOG lines, CLAUDE.md error bullet + tagline, CONTRIBUTING release
step, ci.yml (+msrv, docs, package jobs, no-default-features steps, persist-credentials), publish.yml
(trusted publishing, tests, tag check). Kept `examples/changelog.rs` but excluded it from the package.
Nothing in the lint table, deny.toml policy or the guard tests was weakened.

## 7. What the scaffold should arguably provide for `--preset lib`

1. MSRV + `--no-default-features` + docs + `cargo publish --dry-run` CI jobs; toolchain-pin test that accepts
   `rust-version`.
2. serde as an optional feature (or not at all), no `toml`/`log` by default.
3. A curated `exclude`/`include` in Cargo.toml and a `keywords`/`categories` reminder.
4. `persist-credentials: false` on every checkout; trusted publishing in publish.yml.
5. Changelog docs that match the generator actually shipped (or no generator for single crates).
6. A lib-appropriate deny allow-list (no font licences; MPL as an explicit decision).
7. No release profile / Windows target / Windows-linker prose for libraries.

## Time summary (ranked)

| Item | Cost |
|---|---|
| CI gaps for a lib + toolchain-pin test blocking an MSRV job | ~15 min |
| Package contents / exclude (and rust-toolchain.toml coupling) | ~5-8 min |
| Unused non-optional serde/toml/log deps; turning serde into a feature | ~5 min |
| Changelog policy contradiction (incl. a self-inflicted `git checkout` revert while probing) | ~5 min |
| zizmor artipacked + trusted publishing | ~5 min |
| wildcard_enum_match_arm on non_exhaustive enum in tests | ~2 min, 1 retry |
| Header banners | ~0 (helped) |
| cargo-deny with proptest | ~0 (just noise warnings) |
