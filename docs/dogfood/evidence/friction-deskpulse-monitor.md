# Friction log: deskpulse-monitor (rustaman preset, real GUI feature build)

Scaffold command (log: `logs/real-gui/scaffold.log`, 1 s, 58 files, git commit, `cargo fetch`):

```
create-rust-app deskpulse-monitor --preset rustaman --name deskpulse-monitor \
  --author "Dogfood Tester" --github dogfood-tester \
  --set tagline="Live system load, memory and uptime at a glance" -y
```

Costs are rough wall-clock for me plus attempt counts. Repo paths are relative to
`/home/user/create-rust-app`.

## Timeline (appended as I go)

### 0. Baseline: untouched scaffold

- **`cargo fmt --check` FAILS on the untouched scaffold (CONFIRMED).** Log:
  `logs/real-gui/baseline-fmt.log`. Two lines exceed 100 columns once the 17-char name is
  substituted; the generator substitutes tokens and never runs rustfmt (no `rustfmt`/`cargo fmt`
  anywhere in `src/**`).
  - `templates/gui/files/src/config.rs:178` — `format!("@@name@@-config-{}", ...)`
  - `templates/gui/files/examples/screenshot.rs:38` — `@@appCrateSnake@@::config::Config::default()`
  Any name over ~12 chars breaks it. Fix in the generator: run `cargo fmt` as a post-step, or
  pre-break these lines so they fit with the longest plausible name. Cost: 2 min (a user just runs
  `cargo fmt`, but CI would be red on the very first push).
- **`RUSTDOCFLAGS="-D warnings" cargo doc --no-deps` FAILS on the untouched scaffold (CONFIRMED).**
  Log: `logs/real-gui/baseline-doc.log`. Two rustdoc lints, both in
  `templates/gui/files/src/gui/run.rs`:
  - `:20` `[`backends`]` links to a private fn from public module docs (`private_intra_doc_links`).
  - `:13` `[`App`](super::app::App)` is a `redundant_explicit_links` (App is imported).
  CI (`templates/github/files/_github/workflows/ci.yml`) never runs `cargo doc`, which is why this
  went unnoticed. Cost: 3 min.
- **zizmor fails on the untouched scaffold**: exit 14, 1 high (`cache-poisoning`, rust-cache in the
  tag-triggered release build, generated `release.yml:116` = template `release.yml:120`) + 7 medium `artipacked` (every `actions/checkout`
  lacks `persist-credentials: false`: ci.yml:39,57,70,105; release.yml:51,107,202). Log:
  `logs/real-gui/baseline-zizmor.log` (run `--offline`). Same finding as other presets.
- Green on the untouched scaffold: clippy -D warnings, `cargo test` (87 lib + 3 integration tests),
  `cargo deny check` (but 9 duplicate-crate + 3 license-not-encountered warnings of noise),
  `cargo +1.98 build`, actionlint. First GUI build ~4 min on 4 cores.
- Versions: eframe/egui/egui_kittest 0.37.0 = current on crates.io (2026-10-15); windows-sys 0.61
  current (0.61.2); toml 1.2, dirs 7 current. Nothing outdated.
- Minimal user fix applied as commit `e718a83` (`cargo fmt`, and the two doc links rewritten).

### 1. Reading the generated docs (~10 min)

AGENTS.md -> CLAUDE.md -> docs/ARCHITECTURE.md is a good chain. ARCHITECTURE.md's **"Adding a page"**
section is accurate and was all I needed. Inaccurate or misleading statements:

- CLAUDE.md and README.md: *"All of these are clean on `main` and enforced by CI"* — false on a
  fresh scaffold (`cargo fmt --check` fails, see 0). `templates/base/files/CLAUDE.md:84`,
  `templates/base/files/README.md:215`.
- CLAUDE.md/AGENTS.md: *"Required unsafe code belongs only under `src/win/`"*, but
  `src/unsafe_check.rs` docs and error say *"unsafe code must live under src/win/ or src/gui/run/"*;
  `src/gui/run/` does not exist in this preset (it is `src/gui/run.rs`, so even the allowance would
  not match it). `templates/guards/files/src/unsafe_check.rs:12,87,89`.
- README: *"A theme is thirteen colours"*; ARCHITECTURE.md, `themes.toml` and `theme/mod.rs` say
  **eleven**. `templates/base/files/README.md:137` vs `templates/gui/files/docs/ARCHITECTURE.md:65`.
- `gui::app` docs: *"a shortcut, a button, the tray menu and the command palette cannot drift apart"*
  and `PAGE_KEYS` doc *"(and its command palette entry)"* — the rustaman preset has neither tray nor
  command palette. `templates/gui/files/src/gui/app/mod.rs:22`, `templates/gui/files/src/gui/ui/mod.rs:232`.
- Nothing documents Linux runtime requirements (see 6).

### 2. Adding new modules: header banner + `header_check` (~2 min, 1 attempt; helped)

Wrote 5 new files (`monitor/mod.rs`, `monitor/job.rs`, `gui/app/monitor.rs`, `gui/ui/monitor.rs`,
`win/system.rs`) by copying a neighbour's banner as CLAUDE.md says; all passed first time. A
deliberate mistake (`Module: job`, empty `Dependencies:`) gives exact, actionable messages
(`logs/real-gui/header-check-experiment.log`): *"declares `Module: job` but sits at `monitor::job`"*,
*"`Dependencies:` is empty"*. Verdict: helps; zero real friction. Writing `Dependencies:` is a
small but useful prompt.

### 3. Adding a page (~10 min; 2 existing files must change, docs accurate)

Touched for registration: `src/gui/app/mod.rs` (variant, `ALL` array length 3->4, `label`, `key`,
`glyph`, plus 3 new `Action` variants and their `apply` arms) and `src/gui/ui/mod.rs` (glyph const,
`pub mod monitor;`, one `match` arm, `SHORTCUTS` "Ctrl+1…3" -> "Ctrl+1…4"). The exhaustive matches
mean the compiler walks you through it; `every_page_has_a_numbered_shortcut` catches the shortcut
text, as documented. Sidebar, Ctrl+N, headless draw test and the screenshot example picked the page
up automatically (screenshot example rendered `monitor.png` with no change). Good design.
- Nit: the `SHORTCUTS` "Ctrl+1…N" string is hand-maintained; could be derived from `Page::ALL.len()`.
- No command palette in the rustaman preset (`commandPalette` off), so nothing to register there.
- Demo content: left the Overview cards (`CARDS` in `gui/app/mod.rs`) in place; they are clearly
  marked "Replace these with your own views" and isolated, so easy to delete later.
- egui 0.37 deprecates `egui::Id::new` (my first draft used it, `-D warnings` made it an error);
  the scaffold already uses `Id::unique`, so copying neighbours avoids it. 1 extra attempt.

### 4. Persisted settings (~8 min; easy)

Added `monitor_interval_secs`, `monitor_show_swap`, `monitor_show_history` to `Config`. The
"every field `Option`, parsed independently" design meant: no migration, no version number, old
config files load unchanged (tested), an out-of-range interval is dropped like any bad value
(tested). Four edits in `config.rs` (struct, `parse`, round-trip test) plus `remember_choices` in
the app. The only repetition is that every field is listed twice (struct + `parse`); a forgotten
`parse` line silently never loads — the round-trip test catches it if you extend it.
- Caveat (scaffold design, not fixed): config is only saved in `App::on_exit`; a crash or SIGTERM
  loses every change of the session.

### 5. The `unsafe` boundary with a real platform call (~25 min; clear error, awkward boundary)

- Wrong place first: `GetTickCount64` inside `src/monitor/mod.rs` (`#[cfg(windows)]`). Caught on
  Linux even though the code is cfg'd out (the check is textual — good):
  `src/monitor/mod.rs:137: unsafe code must live under src/win/ or src/gui/run/`
  (`logs/real-gui/unsafe-wrong-place.log`). Clear and immediate.
- Right place: `src/win/system.rs` with two private leaves (`GlobalMemoryStatusEx`,
  `GetTickCount64`), safe public `memory()`/`uptime()`, plus feature
  `Win32_System_SystemInformation` in Cargo.toml (generator list: `templates/gui/deps.js:29`).
  Passed unsafe_check first time; type-checked with
  `cargo clippy --target x86_64-pc-windows-msvc` (`logs/real-gui/clippy-windows.log`, exit 0).
- **Top friction: the boundary is Windows-only.** `src/win/` is `#[cfg(windows)] pub mod win;`, so
  there is no sanctioned home for unix FFI. I tried `libc::getloadavg` for a macOS/BSD fallback
  (`logs/real-gui/unsafe-wrong-place-unix.log`): rejected outside `src/win/`, and inside `src/win/`
  it would never compile on unix. The only ways forward are editing `unsafe_check.rs`'s allow-list
  or dropping the feature. I dropped it (non-Linux, non-Windows platforms show "not available")
  rather than weaken the check. Suggest a platform-neutral boundary (`src/sys/{win,unix}/`) or
  documenting how to extend the allow-list. `templates/guards/files/src/unsafe_check.rs:87`.
- Nit: `enclosing_function` only recognises `fn`/`pub fn`/`pub(crate) fn`/`unsafe fn` prefixes, so
  a leaf declared `pub(super) fn` or `const fn` is attributed to the previous function and can
  trigger a false "leaf wrapper contains 2 unsafe operations". `unsafe_check.rs:52-60`.

### 6. Running under xvfb (~15 min, 3 attempts; environment, but undocumented)

- Attempt 1: panic `Library libxkbcommon-x11.so could not be loaded` (`logs/real-gui/xvfb-run.log`).
  winit dlopens it; the container had only `libxkbcommon-dev`.
- Installed `libxkbcommon-x11-0` + `mesa-vulkan-drivers` (lavapipe). Note wgpu on Linux uses
  `Backends::PRIMARY` (Vulkan), so `LIBGL_ALWAYS_SOFTWARE=1` alone does nothing; a Vulkan ICD is
  needed. Then the app ran 8 s cleanly (`xvfb-run2.log`), screenshot of the live window
  `logs/real-gui/xvfb-monitor.png`, thread list shows `monitor-sampler` (`xvfb-threads.log`).
  The app opened on the Monitor page at 1 s because both were in the config file: persistence works.
- `cargo run --example screenshot` worked once lavapipe was present and rendered the new page
  (`logs/real-gui/screenshot-example-monitor.png`). Useful.
- README/CONTRIBUTING never mention Linux runtime needs (xkbcommon-x11, a Vulkan driver).
  `templates/base/files/README.md`.

### 7. Adding a dependency + cargo-deny (~3 min; no block)

`libc` (MIT OR Apache-2.0) passes `cargo deny check` (`logs/real-gui/deny-with-libc.log`); later
removed with the unix FFI (see 5). The only new crate surface kept is a windows-sys feature. Deny
output is noisy: 9 duplicate-crate warnings and 3 `license-not-encountered` on every run.

### 8. Lint strictness on GUI code (~5 min; mild)

`usize as f32`, `u64 as f64`, `f64 as f32`, float arithmetic and slicing all passed: the lint
table enables no pedantic cast lints, so no `#[expect]` was needed anywhere. Indexing I avoided by
habit (`.get()`), matching the scaffold. One borrow-check error (draining while borrowing
`self.sampler`), not lint-related. Verdict: strict where it matters (`unwrap`, wildcard arms,
`allow`), not noisy for drawing code.

### 9. CI / release review (step 6, ~15 min) and the zizmor fix (~5 min)

- ci.yml: works for this project. Linux job needs no `apt-get` because `wayland-sys` is built with
  `dlopen` and x11/xkbcommon are dlopened; tests that need `/proc` run on ubuntu; Windows job
  links/tests the `src/win/system.rs` path; Linux job cross-clippies Windows. Never runs
  `cargo doc`, so the rustdoc failure in 0 is invisible to CI.
- release.yml: tag `v*` -> draft -> Windows-only build -> zip + CycloneDX SBOM + sha256 -> attest
  -> undraft. Paths (`target/x86_64-pc-windows-msvc/release/deskpulse-monitor.exe`), the tag/version
  check, artifact names (`release-assets-<target>`, `pattern` + `merge-multiple`), and permissions
  (`contents: write` only on draft/publish, `id-token`+`attestations` only on publish) are right.
  winresource needs `rc.exe`, present on windows-latest. cargo-cyclonedx 0.5.9 exists (0.5.10 is
  newest). Would work for a public repo. Caveats:
  - **No Linux artifact**, though this app's main data source is Linux `/proc`. The comment says
    "adding a target later is an entry rather than a rewrite", but the Package step hardcodes
    `.exe` and `7z` (`templates/github/files/_github/workflows/release.yml:143,145,160`), so a
    Linux entry also needs Package-step changes.
  - Artifact attestations fail on a **private** repo without GitHub Enterprise Cloud.
- zizmor fix as a user: `persist-credentials: false` on all 7 checkouts and removed rust-cache from
  the release build (commit `976ad96`). actionlint + zizmor then clean.

## Deleted or rewritten from the scaffold
- Nothing deleted. Rewrote the README's placeholder intro, two doc-links in `gui/run.rs`, the
  workflow checkouts / release cache. Updated ARCHITECTURE.md module map and CHANGELOG (as CLAUDE.md
  requires).

## What helped
- Action/apply pattern + exhaustive matches made the page, settings and toggles a guided edit.
- Forgiving per-field config: new settings with zero migration work.
- Header and unsafe checks give file:line messages that say exactly what to fix.
- Headless page test + screenshot example covered the new page for free.
- `cargo clippy --target x86_64-pc-windows-msvc` documented in CLAUDE.md let me verify Windows FFI
  from Linux.

## Missing
- A home for non-Windows FFI; a "background job" pattern (I wrote `monitor::job` from scratch —
  the scaffold has no worker/channel/repaint example); Linux runtime deps in README; `cargo doc` in
  CI; a post-generate `cargo fmt`.

## Final gates (logs `logs/real-gui/final-*.log`, summary `final-summary.txt`)
fmt, clippy -D warnings (+ Windows target), test (113+3), deny, doc -D warnings, `+1.98 build`,
actionlint, zizmor: all exit 0.
