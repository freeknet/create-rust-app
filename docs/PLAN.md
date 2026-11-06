# create-rust-app — implementation plan

Planned from a read of the author's two Rust projects, `strobe` and `rustaman`. Sections 1, 2 and 5
are the original plan; sections 3 and 4 describe what was built. Contracts that code must agree on
live in [CONTRACTS.md](CONTRACTS.md) and win over this file where they differ.

Name: `create-rust-app` only (`npx create-rust-app`, `npm create rust-app`). No drug or
acid wording anywhere. The look is psychedelic rainbow, nerdy, slick.

## 1. Conventions extracted from strobe + rustaman

### Shared house style

- Lints identical in both (verbatim block in section 1.3). Tests return `anyhow::Result<()>`,
  every `assert!` carries a message, `#[expect(lint, reason = "…")]` never `#[allow]`.
- Every `.rs` file (src/, tests/, examples/, build.rs) opens with a plain-`//` banner, a 78-`=`
  rule, labels padded to column 15 (`LABEL_WIDTH = 14`), a blank line, then `//!` docs:

  ```
  // ============================================================================
  // Module:       gui::ui::theme
  // Description:  …
  //
  // Dependencies: …
  // ============================================================================
  ```

  `Module:` is derived from the path: `src/foo/mod.rs`→`foo`, `src/lib.rs`→`<crate> (library crate root)`,
  `src/main.rs`→`<crate> (binary crate root)`, `src/bin/x.rs`→`<crate>-x (binary crate root)`,
  `tests/x.rs`→`x (integration test)`, `examples/x.rs`→`x (example)`. Workspace crates prefix
  the crate: `strobe_app::cli`. Enforced in the generated project by `src/header_check.rs`
  (a `#[cfg(test)] mod header_check;` in lib.rs). Templates write `@@module@@` and the engine
  fills it (see CONTRACTS.md).
- `unsafe` safe-leaf rule: one FFI call per private safe fn, `// SAFETY:` on each, owning
  `Drop` types, only under `src/win/`. Enforced by `src/unsafe_check.rs`.
- `rust-toolchain.toml` pins an exact channel (default `1.99.1`) with
  `components = ["clippy","rustfmt"]`, `targets = ["x86_64-pc-windows-msvc"]`; `tests/toolchain_pin.rs`
  checks every workflow's `toolchain: "…"` literal equals it.
- `deny.toml`: `[graph] targets = ["x86_64-pc-windows-msvc","x86_64-unknown-linux-gnu"] all-features = true`,
  `[advisories] yanked="warn" ignore=[]`, `[licenses] allow = [MIT, MIT-0, Apache-2.0,
  Apache-2.0 WITH LLVM-exception, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, CC0-1.0,
  0BSD, Unlicense, BSL-1.0, MPL-2.0, OFL-1.1, Ubuntu-font-1.0]` (+ `CDLA-Permissive-2.0` when
  ureq/rustls/webpki-roots are in), `confidence-threshold = 0.9`, `[bans] multiple-versions="warn" deny=[]`,
  `[sources] unknown-registry="deny" unknown-git="deny"`.
- `.gitattributes`: `* text=auto eol=lf`, `*.png binary`, `*.ico binary`. `.gitignore`: `/target` + extras.
- `.github/`: `CODEOWNERS` = `* @<github>` (one line), `PULL_REQUEST_TEMPLATE.md`
  (Summary / Test plan / Checklist), `ISSUE_TEMPLATE/{bug_report,feature_request}.yml` forms +
  `config.yml` with a security-advisory contact link, `dependabot.yml` (cargo weekly Monday,
  `open-pull-requests-limit: 5`, `commit-message.prefix: build`, group `cargo-patch` patch-only;
  github-actions weekly, prefix `ci`, group `github-actions` `patterns: ["*"]`).
- CI (`ci.yml`): `concurrency: group: ci-${{ github.ref }} cancel-in-progress: true`,
  `env: CARGO_TERM_COLOR: always, CARGO_INCREMENTAL: "0"`, `permissions: contents: read`,
  `timeout-minutes` on every job. Jobs: `format` (rustfmt check), `deny` (cargo-deny-action),
  `windows` (clippy `--all-targets --all-features -- -D warnings`, test, `cargo build --release --bins`),
  `linux` (clippy + test; GUI projects also `cargo clippy … --target x86_64-pc-windows-msvc`).
  Actions pinned to full SHAs with version comments:
  - `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1`
  - `dtolnay/rust-toolchain@683b588c487a69d01f6c6ddf40f036ff682cc2c8 # master, 2026-10` with `toolchain: "<pin>"`
  - `Swatinem/rust-cache@d1527c8f67ef9af357290475d4af4b0fab8f12e0 # v2.9.3`
  - `EmbarkStudios/cargo-deny-action@3c6349835b2b7b196a839186cb8b78e02f7b5f25 # v2.1.1`
  - `actions/upload-artifact@cf430e030ddbb5b0abf93d22962f4752f3646cd9 # v7.0.2`
  - `actions/download-artifact@9000827ccba6bdab643e8b6fd33ac0654aef8333 # v8.0.2`
  - `actions/attest-build-provenance@4d101475d8b20a2381f78447822ac1eab6504dd8 # v4.2.2`
  - `actions/attest-sbom@c604332985a26aa8cf1bdc465b92731239ec6b9e # v4.1.0`
- Release (`release.yml`, on tag `v*` + `workflow_dispatch` input `tag`): job `draft`
  (contents: write; `gh release create "$TAG" --draft --title "<name> $TAG" --generate-notes`, reuse
  if exists) → `build` matrix `[{os: windows-latest, target: x86_64-pc-windows-msvc}]`
  (build `--release --bins --target`, package `dist/<name>-<tag>-<target>/` with exe + README + LICENSE
  (+ themes.toml for GUI), `7z a -tzip`; SBOM via `cargo install cargo-cyclonedx --version 0.5.9 --locked
  && cargo cyclonedx --format json`; sha256; upload `release-assets-<target>`) → `publish`
  (contents/id-token/attestations: write; download `pattern: release-assets-*` `merge-multiple: true`;
  attest provenance for `dist/*.zip dist/*.cdx.json`; attest SBOM;
  `gh release upload "$TAG" … --clobber && gh release edit "$TAG" --draft=false --latest`).
  A tag-vs-Cargo.toml version check step before build.
- Docs set: README (centered `<div align="center">` header + bold tagline), CHANGELOG
  (Keep a Changelog, `## [Unreleased]` then `## [x.y.z] - date`, generated from conventional
  commits by `examples/changelog.rs`), CONTRIBUTING (Reporting / Building / Before you submit /
  Rules the codebase enforces / Changelog / Cutting a release / Dependency updates / Commit hygiene /
  Opening a PR), SECURITY (private reporting via GitHub advisories, latest release only, Scope list),
  AGENTS.md (short: read CLAUDE.md, gates to run, unsafe rule, never revert others' edits),
  CLAUDE.md (project one-liner, doc table, `## Commands` bash block, "Commit only what you changed",
  `## Rules the build enforces` with a `###` per rule, `## Things that are deliberate, not oversights`).
  Commit prefixes `feat: fix: perf: refactor: docs: test: build: ci:`.
- GUI module set (from rustaman): `brand.rs` (mark geometry + fixed colours, `NAME`, `TAGLINE`),
  `color.rs` (OKLCh ramp), `theme/mod.rs` (13 colours + `rainbow_span`, `Palette::derive`, WCAG
  contrast tests, `include_str!("../../assets/themes.toml")` + user dir
  `dirs::config_dir()/<app>/themes/*.toml` overriding by `id`), `motion.rs`
  (`INSTANT/QUICK/SETTLE/ENTER`, `ease_out`, `Tween`, no egui), `icon.rs` (polyline icons on a 16×16
  grid), `gui::ui::{theme,motion,icon,chrome,modal,widgets,settings}` egui bindings, `config.rs`
  (serde+toml, every field `Option`, forgiving per-field parse, atomic temp+rename write,
  `dirs::config_dir()/<app>/config.toml`), `#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]`,
  failures shown in a message box (`win::dialog::show_error`), clap derive `Cli` with
  `#[command(name, version, about = TAGLINE)]`, exit code 2 for refused args.

### Project-specific

- strobe = workspace: `resolver = "3"`, `members = ["crates/*"]`, `[workspace.package]` edition 2024
  rust-version 1.98, `[workspace.dependencies]`, `[workspace.lints]` (+ per-crate `[lints] workspace = true`),
  `.cargo/config.toml` alias `xtask = "run -p xtask --"`, `crates/xtask` (ci/changelog), `crates/<name>-conventions`
  (header/toolchain/unsafe checks as a crate), winit 0.30 + egui_glow/egui-winit 0.37 + glow 0.17/glutin 0.32,
  `embed-resource = "3"` with `.rc` scripts (`1 ICON ICON_PATH` + `VERSIONINFO` with `VER_*` from
  `CARGO_PKG_VERSION_*`), THIRD_PARTY.md, `.mailmap`, docs/decisions/Dnnn.md.
- rustaman = single crate: `[lib]` + `[[bin]]`, eframe 0.37 `default-features=false,
  features=["wgpu","default_fonts"]`, `windows-sys 0.61` under `[target.'cfg(windows)'.dependencies]`,
  `winresource = "0.1"` build.rs with `set_icon`/`set_manifest_file`/`set("ProductName"…)`,
  `assets/<app>.manifest` (asInvoker, PerMonitorV2 DPI, UTF-8 code page, supportedOS GUIDs,
  Common-Controls 6), `examples/{brand_assets,changelog,screenshot}.rs`, `egui_kittest 0.37`,
  `docs/{ARCHITECTURE,PERFORMANCE,WINDOWS_APIS}.md`, `tests/toolchain_pin.rs`,
  `src/{header_check,unsafe_check}.rs`.

### 1.3 Verbatim Cargo blocks

```toml
[lints.rust]            # workspace: [workspace.lints.rust] + per-crate [lints] workspace = true
warnings = "deny"
dead_code = "deny"
non_snake_case = "deny"
non_upper_case_globals = "deny"
non_camel_case_types = "deny"
unused_variables = "deny"
unused_imports = "forbid"
unused_must_use = "forbid"
unreachable_patterns = "forbid"
unreachable_pub = "forbid"
missing_docs = "deny"
unsafe_op_in_unsafe_fn = "deny"

[lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
todo = "deny"
unimplemented = "deny"
unreachable = "deny"
wildcard_enum_match_arm = "deny"
match_wildcard_for_single_variants = "deny"
match_wild_err_arm = "deny"
rest_pat_in_fully_bound_structs = "deny"
ignored_unit_patterns = "deny"
allow_attributes = "deny"
missing_safety_doc = "deny"
undocumented_unsafe_blocks = "deny"

[profile.release]
opt-level = 3
lto = true
codegen-units = 1
strip = "debuginfo"
panic = "abort"

[profile.release-fast]
inherits = "release"
lto = false
incremental = true
codegen-units = 16

[profile.release-fast.package.@@name@@]
codegen-units = 256

[profile.dev.package."*"]
debug = "line-tables-only"
```

## 2. Option matrix (★ = default, matches the author's conventions)

| Group | Option | Values |
|---|---|---|
| identity | name (kebab `^[a-z][a-z0-9-]*$`), displayName, tagline, author ★`Lawrence Norton`, github ★`lnorton89`, email, license ★`MIT` / `MIT+CommonsClause` / `Apache-2.0` / `MIT OR Apache-2.0`, edition ★`2024`/`2021`, msrv ★`1.98`, toolchain ★`1.99.1` |
| kind | `cli` / `gui` ★ / `tui` / `lib` / `workspace` |
| gui stack | `eframe` ★ (rustaman: eframe + wgpu) / `winit-glow` (strobe) |
| crates | errors: anyhow ★ (+ thiserror ★ for lib/workspace); logging: `log` ★gui / `env_logger` ★cli / `tracing`; serde+toml ★; async: none ★ / tokio; http: none ★ / ureq / reqwest; sqlite: off ★ / rusqlite bundled; clap ★ (everything but lib) |
| features (gui) | themes ★, brand ★, motion ★, icons ★, config ★, winres ★ (icon+manifest+version), tray, singleInstance, commandPalette, screenshotExample |
| tooling | ci ★, release ★, cargoDeny ★, dependabot ★, toolchainPin ★, agentDocs ★ (AGENTS.md + CLAUDE.md), headerCheck ★, unsafeCheck ★ (gui), changelogGen ★, issueTemplates ★, codeowners ★, securityMd ★ |
| theme | accent ★`#00e5ff` |
| post | git ★ (init + initial commit `feat: scaffold <name> with create-rust-app`), cargoCheck ★ if cargo is on PATH, open: none ★ / code / cursor |

Presets (`--preset`): `rustaman` (single-crate desktop GUI, eframe, edition 2024, MIT, winres,
screenshot example), `strobe` (workspace desktop app, winit-glow, edition 2024, MIT+CommonsClause,
xtask, conventions crate, embed-resource `.rc`, THIRD_PARTY), `cli` (clap + anyhow + log/env_logger,
all tooling), `tui` (ratatui + crossterm), `lib` (thiserror, no bin, docs.rs metadata), `minimal`
(Cargo.toml + lints + main + CI only).

## 3. Node CLI architecture

- Strict TypeScript, compiled to `dist/` for publishing because Node won't strip types under
  `node_modules`. `"engines": {"node": ">=22.18.0"}`, one bin `create-rust-app`.
- Runtime deps: `@clack/core` (prompt state machines and key handling) and `picocolors`. Everything
  else is hand-rolled: arg parsing with `node:util` `parseArgs`, gradients in `src/ui/rainbow.ts`, the
  banner in `src/ui/banner.ts`, rendering in `src/ui/{rail,choose,motion}.ts`.
- Flags: `create-rust-app [dir] --name --preset <p> --kind --gui <eframe|winit-glow> --edition --msrv
  --toolchain --license --author --github --accent --with a,b --without a,b --set key.path=value
  --yes/-y --no-git --no-fetch --cargo-check --no-cargo-check --open <code|cursor> --dry-run --json
  --no-color --quiet --force --help --version`. Non-TTY implies `--yes`.
- Templates: see CONTRACTS.md (groups, manifests, `@@token@@`, line directives). Cargo.toml and
  deny.toml are composed in code (`src/gen/`), not templated.
- A target folder with content is refused before any question unless `--force` is passed. In the run,
  writing is a required step: if it fails, nothing after it runs.
- Post-steps: `git init -b main` + add + commit; `cargo fetch` by default; opt-in `cargo check
  --all-targets`; a `rustup toolchain install <pin>` hint when the pin is missing; `--open` spawns the
  editor detached.

## 4. UX

- Capability detection (`src/ui/tty.ts`): colour tier `truecolor` / `ansi256` / `ansi16` / `none`, with
  `none` for NO_COLOR, `--no-color`, non-TTY and CI. Windows 10 build 14931+ counts as truecolor, classic
  console included. Glyph level `full` / `console` / `ascii` (`src/ui/glyphs.ts`): `console` is the classic
  Windows console with Consolas or Cascadia, read from `HKCU\Console`, which has no font fallback.
- Banner ("Prism"): 3-row block-letter `CREATE-RUST-APP` with hue running across columns from 140°
  (green → cyan → violet), a dim tagline and a rainbow rule ending at the wordmark's edge. It sweeps for
  about a second and settles on the brand hues. Narrower than 59 columns or `ascii`: one bold line. No
  colour: plain text.
- Flow (`src/prompts.ts`): name → what are you building → review, which offers Create it / Customize… /
  Cancel. Customize opens one section at a time and returns to the review. Flags are never asked again.
- Options show a description on every row and echo short labels after submit (`src/ui/choose.ts`).
- Run: ticked steps with timings and live counters, then a next-steps box, the equivalent
  non-interactive command, and a closing line.
- Motion (`src/ui/motion.ts`), off when `caps.animate` is false: the focused option shimmers; the name
  prompt's marker cycles hue; a three-cell spinner; the review cascades in; the closing line sparkles.
  **Each prompt animates one line only.** Two changed lines make clack erase and repaint everything
  below them, which flickers; `test/motion.test.ts` guards this.
- Palette: prompt stops `#ff6ec7 #7cf7ff #b6ff6e #ffd36e #8a5cff #ff9f6e`; chrome: dim `#9aa8bc`, rail
  `#6f6a85`, warning `#ffd36e`, danger `#ff6b7c`.
- Judge UI changes by looking at them: `node tools/screens/capture.ts <scenario>` drives the real CLI in a
  pseudo-terminal and renders each screen to PNG.

## 5. Verification

1. `node --test`: directives, tokens (no `@@` left), cargo.js output, header module derivation,
   preset snapshots.
2. E2E: for each preset scaffold into a temp dir with `--yes --no-git --no-cargo-check`, then
   `cargo fmt --all -- --check`, `cargo clippy --all-targets --all-features -- -D warnings`,
   `cargo test --all-features`. Feature combos: gui + tray + singleInstance + commandPalette;
   cli + tokio + reqwest + sqlite; lib with `MIT OR Apache-2.0`.
3. Manual: Windows Terminal, PowerShell 5, `NO_COLOR=1`, piped, `CI=1`, `--dry-run`, `--json`.
4. `npm pack --dry-run` lists only `bin/ src/ templates/`.
