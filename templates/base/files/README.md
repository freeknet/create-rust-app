<div align="center">

# @@displayName@@

**@@tagline@@**

<!-- @if ci -->
[![CI](https://github.com/@@github@@/@@name@@/actions/workflows/ci.yml/badge.svg)](https://github.com/@@github@@/@@name@@/actions/workflows/ci.yml)
<!-- @end -->
<!-- @if kind_lib -->
[![crates.io](https://img.shields.io/crates/v/@@name@@.svg)](https://crates.io/crates/@@name@@)
[![docs.rs](https://img.shields.io/docsrs/@@name@@)](https://docs.rs/@@name@@)
<!-- @end -->
<!-- @if license_mit -->
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- @elif license_mit_cc -->
[![License: MIT + Commons Clause](https://img.shields.io/badge/license-MIT%20%2B%20Commons%20Clause-blue.svg)](LICENSE)
<!-- @elif license_apache -->
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
<!-- @else -->
[![License: MIT OR Apache-2.0](https://img.shields.io/badge/license-MIT%20OR%20Apache--2.0-blue.svg)](#licence)
<!-- @end -->
[![MSRV](https://img.shields.io/badge/rust-@@msrv@@%2B-orange.svg)](Cargo.toml)

</div>

<!-- @if kind_lib -->
@@displayName@@ is a Rust library. Describe here what problem it solves and
for whom, in two or three sentences, before anyone reads a line of API.
<!-- @elif kind_cli -->
@@displayName@@ is a command-line tool. Describe here what it does and who
it is for, in two or three sentences, before the first command.
<!-- @elif kind_tui -->
@@displayName@@ is a terminal app. Describe here what it does and who it is
for, in two or three sentences, before the first keystroke.
<!-- @else -->
@@displayName@@ is a native desktop app. Describe here what it does and who
it is for, in two or three sentences, before the first screenshot.
<!-- @end -->

## Quick start

<!-- @if kind_lib -->
Add it to a project:

```bash
cargo add @@name@@
```

Then see [`examples/basic.rs`](examples/basic.rs) for a complete program, or
run it from a checkout:

```bash
cargo run --example basic
cargo doc --open          # the API documentation, as docs.rs will show it
```
<!-- @elif workspace -->
```bash
cargo run -p @@appCrate@@                        # debug build: keeps a console for panics
cargo run -p @@appCrate@@ --profile release-fast # optimised, rebuilds in seconds
cargo run -p @@appCrate@@ --release              # what a user gets: LTO, panic = "abort"
```
<!-- @elif has_gui -->
```bash
cargo run                        # debug build: keeps a console for panics
cargo run --profile release-fast # optimised, rebuilds in seconds
cargo run --release              # what a user gets: LTO, panic = "abort"
```
<!-- @elif kind_tui -->
```bash
cargo run                        # opens in the current terminal
cargo install --path .           # puts `@@name@@` on your PATH
```
<!-- @else -->
```bash
<!-- @if clap -->
cargo run -- --help              # every subcommand and flag
<!-- @else -->
cargo run
<!-- @end -->
cargo install --path .           # puts `@@name@@` on your PATH
```
<!-- @end -->

<!-- @if toolchainPin -->
The toolchain is pinned in `rust-toolchain.toml`, so `rustup` fetches the
right one automatically.
<!-- @else -->
Needs Rust @@msrv@@ or newer.
<!-- @end -->

## What's inside

<!-- @if kind_lib -->
- **Typed errors.** One `Error` enum and a `Result` alias, so callers can
  match on what went wrong rather than parse a message.
- **docs.rs ready.** `all-features = true` and the `docsrs` cfg are set, so
  feature-gated items are labelled in the published docs.
<!-- @end -->
<!-- @if clap -->
- **A real command line.** `clap` derive, `--help` and `--version` for free,
  and exit code 2 for arguments it refuses.
<!-- @end -->
<!-- @if log_env_logger -->
- **Logging** through `log` + `env_logger`: set `RUST_LOG=debug` to see more.
<!-- @elif log_tracing -->
- **Structured logging** through `tracing`: set `RUST_LOG=debug` to see more.
<!-- @end -->
<!-- @if async_tokio -->
- **Async** on the `tokio` runtime.
<!-- @end -->
<!-- @if http_ureq | http_reqwest -->
- **An HTTP client** (`fetch`) ready to point at a real endpoint.
<!-- @end -->
<!-- @if sqlite -->
- **SQLite storage** through `rusqlite` (bundled, so there is nothing to
  install), with a migrations table from the first run.
<!-- @end -->
<!-- @if config & serde & !kind_lib -->
- **A forgiving config file.** Every field is optional and parsed
  independently, so one bad value costs that setting, not the file; writes
  are atomic (temp file, then rename).
<!-- @end -->
<!-- @if kind_tui -->
- **A ratatui interface** with a rainbow title bar, a list and a status line
  of key hints. The terminal is restored on error and on panic.
<!-- @end -->
<!-- @if has_gui -->
<!-- @if gui_eframe -->
- **A native window** on egui/eframe, rendering through wgpu.
<!-- @else -->
- **A native window** on egui, driven by a winit + glutin + `egui_glow`
  loop.
<!-- @end -->
<!-- @end -->
<!-- @if themes -->
- **Themes, or write your own.** A theme is thirteen colours in a TOML
  file; everything else is derived, and every theme is checked against WCAG
  contrast as a test.
<!-- @end -->
<!-- @if brand -->
- **One brand definition.** The mark and its colours live in `src/brand.rs`;
  the icon and the in-app mark are drawn from it.
<!-- @end -->
<!-- @if motion -->
- **Motion with four durations.** Every animation goes through one module,
  so the app moves with one rhythm.
<!-- @end -->
<!-- @if icons -->
- **Icons as geometry**, polylines on a 16x16 grid, so they stay crisp at
  any scale and take the theme's colours.
<!-- @end -->
<!-- @if winres -->
- **A proper Windows binary**: icon, application manifest (per-monitor DPI,
  UTF-8 code page) and version info compiled into the `.exe`.
<!-- @end -->
<!-- @if tray -->
- **A notification-area icon.**
<!-- @end -->
<!-- @if singleInstance -->
- **Single instance.** A named mutex keeps one copy of the app running.
<!-- @end -->
<!-- @if commandPalette -->
- **A command palette** on `Ctrl+K`, with fuzzy filtering.
<!-- @end -->
<!-- @if screenshotExample -->
- **Screenshots without a window.** `cargo run --example screenshot` draws
  the UI offscreen to a PNG, for pull requests and docs.
<!-- @end -->
- **Strict by default.** `unwrap`, `expect` and `panic!` are denied, every
  `match` names its variants, and a warning is a build failure.
<!-- @if headerCheck -->
- **Every source file says what it is.** A header banner on each `.rs` file,
  checked against the file's path by a test.
<!-- @end -->
<!-- @if workspace -->

## Layout

A Cargo workspace. Shared versions, metadata and lints live in the root
`Cargo.toml`; each crate opts in with `[lints] workspace = true`.

| Path | |
|---|---|
| `crates/@@appCrate@@` | The app: the window, its UI and the platform layer. |
| `crates/xtask` | Project automation, run as `cargo xtask <task>` (alias in `.cargo/config.toml`). |

New crates go under `crates/` and are picked up by `members = ["crates/*"]`.
<!-- @end -->

## Development

<!-- @if workspace -->
```bash
cargo xtask ci                                                      # everything CI runs, in order
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --all-features -- -D warnings
cargo test --workspace --all-features
<!-- @if cargoDeny -->
cargo deny check                                                    # licences, advisories, sources
<!-- @end -->
```
<!-- @else -->
```bash
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
<!-- @if cargoDeny -->
cargo deny check                                         # licences, advisories, sources
<!-- @end -->
```
<!-- @end -->

<!-- @if ci -->
All of these are clean on `main` and enforced by CI
(`.github/workflows/ci.yml`). A warning is a build failure there.
<!-- @else -->
All of these are clean on `main`. A warning is a build failure.
<!-- @end -->
See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the rest.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md): how to build, test, and what the build enforces
<!-- @if agentDocs -->
- [`CLAUDE.md`](CLAUDE.md): the rules this codebase enforces, for people and agents
<!-- @end -->
- [`CHANGELOG.md`](CHANGELOG.md): what changed, release by release
<!-- @if securityMd -->
- [`SECURITY.md`](SECURITY.md): how to report a vulnerability privately
<!-- @end -->

## Licence

<!-- @if license_mit -->
MIT. See [`LICENSE`](LICENSE).
<!-- @elif license_mit_cc -->
MIT with the Commons Clause: use it, change it, run it for anything,
including paid work done with it, but do not sell the software itself. See
[`LICENSE`](LICENSE) for the exact terms.
<!-- @elif license_apache -->
Apache-2.0. See [`LICENSE`](LICENSE).
<!-- @else -->
Licensed under either of

- Apache License, Version 2.0 ([`LICENSE-APACHE`](LICENSE-APACHE))
- MIT licence ([`LICENSE-MIT`](LICENSE-MIT))

at your option.

Unless you explicitly state otherwise, any contribution intentionally
submitted for inclusion in the work by you, as defined in the Apache-2.0
licence, shall be dual licensed as above, without any additional terms or
conditions.
<!-- @end -->

---

<sub>Scaffolded with [create-rust-app](https://github.com/lnorton89/create-rust-app).</sub>
