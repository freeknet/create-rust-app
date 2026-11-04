<div align="center">

# create-rust-app

**Scaffold Rust projects at the speed of light: strict lints, real CI, signed releases, and a house style that holds itself to account.**

```text
C R E A T E - R U S T - A P P
◇ scaffold rust projects at the speed of light ━━━━━━━━━━━━━━━━━━━━
```

<sub>In a truecolor terminal every letter takes its own hue and the rule sweeps through the spectrum for about a second, then settles.</sub>

[![CI](https://github.com/lnorton89/create-rust-app/actions/workflows/ci.yml/badge.svg)](https://github.com/lnorton89/create-rust-app/actions/workflows/ci.yml)
![node](https://img.shields.io/badge/node-%3E%3D20-5fd08a)
![rust](https://img.shields.io/badge/rust-1.99.1-ff7a18)
![license](https://img.shields.io/badge/license-MIT-7b5bff)

</div>

---

## Quick start

```bash
npx create-rust-app            # interactive
npm create rust-app            # same thing, npm-init style

npx create-rust-app my-tool --preset cli -y     # no questions asked
npx create-rust-app my-gui --preset rustaman --with tray,singleInstance
npx create-rust-app --preset lib --dry-run --json  # see the plan, write nothing
```

Then:

```bash
cd my-tool
cargo run
cargo test
cargo clippy --all-targets --all-features -- -D warnings
```

Needs Node 20+. Rust is optional at scaffold time; when `cargo` is on `PATH` the new project gets a
`cargo check --all-targets` before you see the summary, and you get a `rustup toolchain install`
hint if the pinned channel is missing.

## Presets

| Preset | What you get | Kind | Edition | Licence |
|---|---|---|---|---|
| `rustaman` | single-crate Windows GUI · eframe + wgpu, winres icon/manifest, screenshot example | `gui` | 2021 | MIT |
| `strobe` | cargo workspace desktop app · winit + egui_glow · xtask + conventions crate | `workspace` | 2024 | MIT + Commons Clause |
| `cli` | clap + anyhow + env_logger, full tooling | `cli` | 2024 | MIT |
| `tui` | ratatui + crossterm terminal app | `tui` | 2024 | MIT |
| `lib` | publishable crate · thiserror · docs.rs ready, no binary | `lib` | 2024 | MIT OR Apache-2.0 |
| `minimal` | Cargo.toml + lints + main + CI, nothing else | `cli` | 2024 | MIT |

With no preset you get the defaults: a single-crate eframe GUI, edition 2024, MSRV 1.98,
toolchain pinned to 1.99.1, every tooling option on. Presets are just partial answers layered on
those defaults (see [`src/presets.js`](src/presets.js)); any flag below overrides them.

## Flags

```text
create-rust-app [dir] [options]
```

| Flag | Meaning |
|---|---|
| `[dir]` | Target directory (defaults to the project name) |
| `--name <kebab>` | Crate / project name, `^[a-z][a-z0-9-]*$` |
| `--preset <p>` | `rustaman` `strobe` `cli` `tui` `lib` `minimal` |
| `--kind <k>` | `cli` `gui` `tui` `lib` `workspace` |
| `--gui <stack>` | `eframe` (wgpu) or `winit-glow` (winit + glutin + egui_glow) |
| `--edition <e>` | `2024` or `2021` |
| `--msrv <v>` | `rust-version` in Cargo.toml (default `1.98`) |
| `--toolchain <v>` | Exact channel pinned in `rust-toolchain.toml` and CI (default `1.99.1`) |
| `--license <l>` | `MIT`, `MIT+CommonsClause`, `Apache-2.0`, `MIT OR Apache-2.0` |
| `--author <name>` | Author for Cargo.toml, LICENSE, headers |
| `--github <user>` | GitHub handle for CODEOWNERS and repository links |
| `--accent <#hex>` | Accent colour for GUI themes (default `#00e5ff`) |
| `--with a,b` | Turn on features / tooling, e.g. `--with tray,commandPalette` |
| `--without a,b` | Turn them off, e.g. `--without release,dependabot` |
| `-y`, `--yes` | Accept defaults for anything not given; no prompts |
| `--no-git` | Skip `git init -b main` and the initial commit |
| `--no-cargo-check` | Skip the post-scaffold `cargo check --all-targets` |
| `--open <editor>` | Open the project in `code` or `cursor` when done |
| `--dry-run` | Print the plan, write nothing |
| `--json` | Machine-readable output |
| `--no-color` | Plain output (also honoured: `NO_COLOR`, non-TTY, `CI`) |
| `--quiet` | Only errors |
| `--force` | Write into a non-empty directory |
| `--help`, `--version` | The usual |

A non-TTY stdin implies `--yes`.

## What you get

### Lints that mean it

Every project carries the same lint block (single crates in `[lints]`, workspaces in
`[workspace.lints]` with `[lints] workspace = true` per crate):

| `[lints.rust]` | level | `[lints.clippy]` | level |
|---|---|---|---|
| `warnings` | deny | `unwrap_used` | deny |
| `dead_code` | deny | `expect_used` | deny |
| `missing_docs` | deny | `panic` | deny |
| `unreachable_pub` | **forbid** | `todo` / `unimplemented` / `unreachable` | deny |
| `unused_imports` | **forbid** | `wildcard_enum_match_arm` | deny |
| `unused_must_use` | **forbid** | `match_wildcard_for_single_variants` | deny |
| `unreachable_patterns` | **forbid** | `allow_attributes` | deny |
| `unsafe_op_in_unsafe_fn` | deny | `undocumented_unsafe_blocks` | deny |
| `non_snake_case` & friends | deny | `missing_safety_doc` | deny |

Exceptions are written `#[expect(lint, reason = "…")]`, never `#[allow]`. Tests return
`anyhow::Result<()>` and every `assert!` carries a message. Release profile: LTO, one codegen
unit, `panic = "abort"`, plus a `release-fast` profile for quick optimised builds.

### Header banners

Every `.rs` file opens with the same banner, and the `Module:` line is derived from the path:

```rust
// ============================================================================
// Module:       gui::ui::theme
// Description:  Palette and egui visuals derived from the active theme.
//
// Dependencies: egui
// ============================================================================

//! Theme bindings for egui.
```

`src/lib.rs` → `my_app (library crate root)`, `src/main.rs` → `my_app (binary crate root)`,
`tests/x.rs` → `x (integration test)`, workspace crates get their crate as prefix
(`my_app_app::cli`). A generated `src/header_check.rs` test walks the crate and fails the build
when a banner drifts.

### An `unsafe` boundary

GUI projects keep FFI in `src/win/` only, one call per private safe function, a `// SAFETY:`
comment on each, and `Drop` types that own every handle. `src/unsafe_check.rs` enforces it.

### A pinned toolchain

`rust-toolchain.toml` pins an exact channel with `clippy` + `rustfmt`. `tests/toolchain_pin.rs`
checks that every workflow's `toolchain: "…"` matches it, so CI and your laptop never disagree.

### CI and releases with attestations

- `ci.yml`: format, cargo-deny, Windows (clippy `-D warnings`, test, release build) and Linux
  jobs; concurrency-cancelled, `contents: read`, a timeout on every job, every action pinned to a
  full commit SHA.
- `release.yml`: push a `v*` tag → draft release → build and zip per target → CycloneDX SBOM +
  SHA-256 → build-provenance and SBOM attestations → publish. A tag-vs-Cargo.toml check runs first.
- Dependabot (cargo + github-actions, weekly, grouped), CODEOWNERS, issue forms, PR template,
  SECURITY.md, and agent docs (`AGENTS.md`, `CLAUDE.md`) if you want them.

### cargo-deny

`deny.toml` with an explicit licence allow-list, `unknown-registry` / `unknown-git` denied,
yanked crates warned, and duplicate versions surfaced.

## How templates work

Templates live in `templates/<group>/files/**`. Groups apply in order and later ones win on the
same path, so a feature group can replace a base file. Inside any text file:

```rust
// @if gui_eframe & !tray
use eframe::egui;
// @end
pub const NAME: &str = "@@displayName@@";
```

- `@@token@@` is substituted (unknown tokens throw, so typos fail tests loudly).
- `@if` / `@elif` / `@else` / `@end` lines after any comment leader are evaluated against the
  context flags and removed.
- `_gitignore` becomes `.gitignore`, `.tmpl` is stripped, binaries are copied raw.
- Cargo.toml and deny.toml are composed in JavaScript (`src/gen/`), and groups declare crates
  through `templates/<group>/deps.js` instead of editing Cargo.toml.

The full rules (Ctx shape, flags, tokens, manifests, the GUI runtime seam) are in
[docs/CONTRACTS.md](docs/CONTRACTS.md); the design is in [docs/PLAN.md](docs/PLAN.md).

## Contributing

```bash
npm ci
npm test                                          # node --test test/
node scripts/scaffold-check.mjs <preset>          # scaffold + fmt + clippy -D warnings + test
node scripts/scaffold-check.mjs <preset> --gate check   # cargo check only, faster
node scripts/scaffold-check.mjs cli --set crates.async=tokio --set crates.http=reqwest
```

Plain ESM JavaScript with `// @ts-check` and JSDoc, no build step, and only two runtime
dependencies (`@clack/prompts`, `picocolors`). Every preset must come out passing
`cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings` and `cargo test`.
Commits use conventional prefixes (`feat:`, `fix:`, `docs:`, `test:`, `build:`, `ci:` …), and
notable changes go under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md).

## How this repo is built

The work is split into tasks in [`tools/swarm/tasks/`](tools/swarm/tasks), each owning a
disjoint set of paths. `node tools/swarm/swarm.mjs run` fans them out to parallel Codex workers,
one git worktree and branch per task. The orchestrator checks each diff stays inside the task's
`owns` globs, runs its gate, commits, and merges into `swarm/integration` for a human to review.
Workers code against [docs/CONTRACTS.md](docs/CONTRACTS.md), which is what keeps a dozen of them
from stepping on each other.

## License

[MIT](LICENSE) © 2026 Lawrence Norton
