# Contributing to @@displayName@@

Thanks for considering a contribution to @@displayName@@: @@tagline@@

The [README](README.md) covers installation and use; this file is about
contributing.

## Reporting bugs and requesting features

Open an issue on the [issue tracker](https://github.com/@@github@@/@@name@@/issues).
<!-- @if securityMd -->
Security vulnerabilities are *not* reported there; see
[`SECURITY.md`](SECURITY.md) for the private channel.
<!-- @else -->
Security vulnerabilities are *not* reported there; use GitHub's
[private vulnerability reporting](https://github.com/@@github@@/@@name@@/security/advisories/new).
<!-- @end -->

For a bug report, include your operating system, the version (or commit)
you ran, what you did, and what happened. The smallest reproduction you can
manage is worth more than a long description.

## Building and running

<!-- @if toolchainPin -->
You need a Rust toolchain. The version is pinned in `rust-toolchain.toml`,
so `rustup` fetches the right one automatically.
<!-- @else -->
You need Rust @@msrv@@ or newer.
<!-- @end -->

<!-- @if kind_lib -->
```bash
cargo build
cargo test --all-features
cargo run --example basic
cargo doc --open
```
<!-- @elif workspace -->
```bash
cargo run -p @@appCrate@@                        # debug: keeps a console for panics and println!
cargo run -p @@appCrate@@ --profile release-fast # optimised, incremental: the one to iterate with
cargo run -p @@appCrate@@ --release              # what a user gets: LTO, panic = "abort"
```
<!-- @else -->
```bash
cargo run                        # debug build
cargo run --profile release-fast # optimised, incremental: the one to iterate with
cargo run --release              # what a user gets: fat LTO, panic = "abort"
```
<!-- @end -->
<!-- @if has_bin -->

`--release` rebuilds slowly by design. Fat LTO over one codegen unit
re-optimises every dependency after any edit. `release-fast` is the same
optimisation level and `panic = "abort"` without the LTO, and rebuilds in
seconds. It is not the shipped binary, so build `--release` before
measuring performance.
<!-- @end -->

`cargo check` is faster still when you only need to know whether the code
compiles. On Windows, most of a debug rebuild after a small edit is the
linker. Two things help there, and both are your call rather than the
repository's:

- **`rust-lld`**, which ships with the toolchain: set
  `CARGO_TARGET_X86_64_PC_WINDOWS_MSVC_LINKER=rust-lld.exe` in your
  environment, or the same key in your user-level `~/.cargo/config.toml`.
  It is not set in the repository because CI and the release build use
  `link.exe`, and a linker change there would be a change to what ships.
- **Keep `target/` out of real-time antivirus scanning**: a Dev Drive, or a
  Defender exclusion for the checkout.

## Before you submit

<!-- @if workspace -->
Three commands, all clean (`cargo xtask ci` runs them in CI's order):

```bash
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
```
<!-- @else -->
Three commands, all clean:

```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```
<!-- @end -->

<!-- @if ci & cargoDeny -->
CI runs all three on Windows and on Linux, plus `cargo deny check`. A
warning is a build failure there.
<!-- @elif ci -->
CI runs all three on Windows and on Linux. A warning is a build failure
there.
<!-- @elif cargoDeny -->
Run `cargo deny check` too when you change a dependency.
<!-- @end -->
<!-- @if has_gui -->

### What a Linux run proves

The app ships for Windows, and the platform layer under `src/win/` only
compiles there. Off Windows, type-check it without linking:

```bash
rustup target add x86_64-pc-windows-msvc
<!-- @if workspace -->
cargo clippy --workspace --all-targets --all-features --target x86_64-pc-windows-msvc -- -D warnings
<!-- @else -->
cargo clippy --all-targets --all-features --target x86_64-pc-windows-msvc -- -D warnings
<!-- @end -->
```

That catches a broken `extern` block or an egui API that moved. It cannot
run a test, and it cannot show you the window: **anything visible still
needs a Windows run, and a visible change wants a screenshot in the pull
request.**
<!-- @end -->

## Rules the codebase enforces

These are enforced by lints and tests, so a violation fails the build
rather than getting caught in review.
<!-- @if agentDocs -->
[`CLAUDE.md`](CLAUDE.md) has the full list with the reasoning; the short
version:
<!-- @end -->

- **No `unwrap`, `expect`, `panic!`, `todo!` or `unreachable!`, including
  in tests.** Use `let ... else`, `?`, or an explicit fallback. Tests return
  `anyhow::Result<()>`, and every `assert!` carries a message.
- **`match` arms list every variant** (`wildcard_enum_match_arm` is denied),
  and suppressions are `#[expect(lint, reason = "...")]`, never `#[allow]`,
  so they cannot outlive what they suppressed.
- **Every public item is documented** (`missing_docs` is denied), and
  `unreachable_pub` is forbidden: what is `pub` is reachable from outside.
<!-- @if headerCheck -->
- **Every source file opens with a module header banner**: a ruled block
  naming `Module:`, `Description:` and `Dependencies:`, then the `//!` docs.
  `src/header_check.rs` walks `src/`, `tests/` and `examples/` and fails the
  build for a file missing one, checking `Module:` against the path the file
  actually sits at.
<!-- @end -->
<!-- @if unsafeCheck -->
- **Every `unsafe` block is a safe leaf wrapper.** One named, private, safe
  function per FFI call; the `unsafe` block contains the call and nothing
  else; a `// SAFETY:` comment stating the reasoning; an owning `Drop` type
  wherever there is a matching close/free/destroy. Required unsafe lives
  only under `src/win/`, and `src/unsafe_check.rs` enforces it.
<!-- @end -->
<!-- @if toolchainPin -->
- **One toolchain.** `rust-toolchain.toml` pins it, every workflow's
  `toolchain:` line names the same version, and `tests/toolchain_pin.rs`
  fails the build if they drift.
<!-- @end -->
<!-- @if cargoDeny -->
- **Every dependency passes `cargo deny check`**: an allowed licence, no
  known advisory, crates.io as the only source.
<!-- @end -->
- **Constants live with what they govern**, and there is deliberately no
  `constants.rs`.
<!-- @if workspace -->

The `src/` and `tests/` paths above are the app crate's, under
`crates/@@appCrate@@/`. Lints are set once, in the root `Cargo.toml`'s
`[workspace.lints]`, and every crate opts in with `[lints] workspace = true`;
a new crate that forgets that line is unlinted.
<!-- @end -->

## Changelog

<!-- @if changelogGen & workspace -->
`CHANGELOG.md` is rebuilt from the git history by `cargo xtask changelog`:
every entry is a conventional-commit subject, grouped under the release tag
that shipped it. That is the other reason the commit prefixes matter: a
subject that does not parse still appears, but in a catch-all section
rather than the right one. Never hand-edit a released section; prose for a
release belongs in the GitHub release body.
<!-- @else -->
`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Add a line under `## [Unreleased]` in the same pull request as the change,
in the section its commit prefix implies: `feat:` under Added, `fix:` under
Fixed, and so on.
<!-- @end -->

## Cutting a release

1. On a release branch off `main`: bump `version` in `Cargo.toml`, move the
   `Unreleased` entries under a new `## [x.y.z] - YYYY-MM-DD` heading in
   `CHANGELOG.md`, and commit.
2. Open the pull request and let the checks pass.
3. Merge (a merge commit, so the history the changelog describes survives),
   then tag the merge commit, annotated:
   `git tag -a v0.2.0 -m "@@name@@ v0.2.0"`, and push the tag.
<!-- @if release & has_bin -->
4. The push triggers `.github/workflows/release.yml`: it checks the tag
   against `Cargo.toml`, builds the release archive with an SBOM and
   checksums, attests them, and publishes the GitHub release.
<!-- @elif release & kind_lib -->
4. Run `.github/workflows/publish.yml` from the tag
   (`gh workflow run publish.yml --ref v0.2.0`). It checks the tag against
   `Cargo.toml`, does a `cargo publish --dry-run`, then publishes with the
   `CARGO_REGISTRY_TOKEN` repository secret.
<!-- @end -->

**Never amend or rebase a commit after tagging it.** The tag keeps pointing
at the copy you discarded, which then sits on no branch at all.

## Dependency updates

<!-- @if dependabot -->
Dependabot opens version-update PRs weekly for both crates and GitHub
Actions (`.github/dependabot.yml`). CI runs against every one, so the check
marks are the first thing to read.

One thing about that config is deliberate: **only patch bumps are
grouped.** Dependabot classifies an update by its literal version segments,
so `0.36 -> 0.37` reaches it as a *minor*, while under cargo that is
exactly the breaking one. Anything above patch therefore arrives as its own
PR by design. If you are batching upgrades by hand, batch them the same way.
<!-- @else -->
Update dependencies deliberately, one breaking bump per commit, so each can
be read, built and reverted by itself. Under cargo a `0.x` minor bump is a
breaking one.
<!-- @end -->
<!-- @if toolchainPin -->

`rust-toolchain.toml` and the `dtolnay/rust-toolchain` pin in the workflows
move by hand, together, in their own commit.
<!-- @end -->

## Commit hygiene

- Keep each commit focused on one change, with a message that says *why*.
  Prefixes: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`,
  `build:`, `ci:`.
- Stage only the files you actually changed, by name, not `git add -A`.
  `git commit` commits the whole index, so use `git commit -- path/to/file`
  when the tree holds work that is not yours.
- Line endings are handled by `.gitattributes`: every text file is stored
  and checked out as LF, including on Windows. Don't convert endings by
  hand.

## Opening a pull request

Against `main`, with a title that summarises the change and a body that
says what and why. The template asks what you ran and on what; please
answer it honestly.
<!-- @if has_gui -->
UI changes want a screenshot.
<!-- @end -->

Small, focused PRs are easier to review and land faster than large ones.
