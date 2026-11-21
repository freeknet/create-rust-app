# Friction log: tailview (tui preset, real app build)

Scaffold command (log: `logs/real-tui/scaffold.log`):

```
create-rust-app tailview --preset tui --name tailview --author "Dogfood Tester" \
  --github dogfood-tester --set tagline="Follow log files live in your terminal" --no-color -y
```

2 s, 31 files, git commit + `cargo fetch` done. I then followed README / AGENTS.md / CLAUDE.md /
CONTRIBUTING.md as the guide.

**What got built:** `tailview FILE...`, a live multi-file tail viewer. It has `tail -F` semantics
(handles truncation, rotation, and files that don't exist yet, starting from a backward-read
backlog), a notify-woken background reader thread with a 250 ms polling fallback that sends to the
UI over an mpsc channel, follow/pause with an unseen-line counter, scrolling, a live regex filter
(smart case, invalid regex falls back to a literal match with the error in the status bar, match
highlighting), a help popup, a status bar plus key hints, per-file tags, a buffer capped by
`--max-lines`, and replacement of control characters (a log can't inject escape sequences).
Modules: `tail.rs`, `reader.rs` (new); `app.rs`, `ui.rs`, `lib.rs` (rewritten). There are 43 tests:
state transitions, tail edge cases, a real-thread reader test, and `TestBackend` render tests that
check text, a highlight cell's background, and cursor position.
New deps: `notify 8`, `regex 1`, dev `tempfile 3`. Bumped `ratatui 0.29→0.30` and `crossterm 0.28→0.29`.
Dropped `serde` and `toml`, which were unused.

Costs are rough wall-clock for an experienced user, plus attempt counts. **Ranked by cost:**

| # | Item | Cost |
|---|------|------|
| 1 | Release workflow is Windows-only; adding a target needs four coupled edits | ~25 min |
| 2 | Changelog: the docs and `examples/changelog.rs` contradict each other; `--check` fails on a pristine scaffold | ~15 min |
| 3 | zizmor fails on the untouched scaffold (8 findings) | ~10 min |
| 4 | Scaffold pins ratatui 0.29 / crossterm 0.28 (current: 0.30.2 / 0.29.0) | ~5 min (no breakage) |
| 5 | `cargo doc -D warnings` (my gate) failed once; CI doesn't run rustdoc or MSRV | ~3 min, 1 attempt |
| 6 | Unused serde + toml in the tui preset; default author is someone else's name | ~3 min |
| 7 | Event loop has no slot for background work (channel drained after each tick) | ~3 min |
| 8 | Temp-file logger at a predictable `/tmp` path | 0 min (noticed, left) |
| — | Header banner, cargo-deny, lint table: **zero friction** (see below) | 0 |

---

## 1. Release workflow: Windows-only, and "adding a target is an entry" is false (~25 min)

The generated `release.yml` builds exactly one target, `x86_64-pc-windows-msvc`, for a **terminal**
app whose users are mostly on Linux/macOS. Template: `templates/github/files/_github/workflows/release.yml:105-106`
(the matrix is the same for every kind). `rust-toolchain.toml` also lists only the Windows target
(`templates/base/files/rust-toolchain.toml:11`).

The template comment at `release.yml:103-104` reads: *"The matrix stays a matrix so adding a target
later is an entry rather than a rewrite."* That is false. Adding `ubuntu-latest /
x86_64-unknown-linux-gnu` also required these changes:
- `release.yml:143/145`: `cp target/${TARGET}/release/@@bin@@.exe` hard-codes `.exe`.
- The Package step only zips with `7z`. I added `tar.gz` for non-Windows.
- `release.yml:184/187`: the SBOM is written as `@@name@@-${TAG}-sbom.cdx.json` with no target in the
  name. With two matrix jobs and `merge-multiple: true`, one SBOM silently overwrites the other.
  The SBOMs really do differ by target: I checked with cargo-cyclonedx 0.5.9 locally (179 vs 171
  components; `windows-sys` appears only in the Windows SBOM).
- `release.yml:259`: `attest-sbom` takes a single `sbom-path`, so I needed one step per target.
- Checksums, upload and attest globs only cover `*.zip`.

Done in this project's commit `9b6c00b`. actionlint and zizmor are clean afterwards.

## 2. CHANGELOG: two conflicting systems (~15 min)

- CLAUDE.md ("`CHANGELOG.md` moves with the code") and CONTRIBUTING ("Changelog") say to
  **hand-add** a line under `## [Unreleased]` in each commit. I did that.
- But the scaffold also ships `examples/changelog.rs`. It **regenerates** the file from git
  (header: *"**This file is generated.** … edits to them do not survive"*), and its `--check`
  mode fails:
  - on my project, because the hand-written entries are discarded (`logs/real-tui/changelog-regen.diff`);
  - **on the pristine scaffold commit too** (`pristine_check_exit=1`). The generator writes
    `All notable changes to @@name@@` (`templates/guards/files/examples/changelog.rs:586`), while the
    template writes `@@displayName@@` (`templates/base/files/CHANGELOG.md:3`). The template also
    picks the "generated" header only for `changelogGen & workspace` (`CHANGELOG.md:5`;
    `CLAUDE.md:220/229` likewise).
- None of the single-crate docs (README, CLAUDE.md, CONTRIBUTING) mention `examples/changelog.rs`.
  `docs/PLAN.md:75-77` says the changelog is *generated*, so the single-crate docs contradict the plan.
- Kept the hand-edited version, since that's what the docs say. Log: `logs/real-tui/changelog-check.log`.

## 3. zizmor fails out of the box (~10 min)

`zizmor --offline` on the untouched scaffold: exit 14, 7× medium `artipacked` (every
`actions/checkout` lacks `persist-credentials: false`) and 1× high `cache-poisoning`
(`Swatinem/rust-cache` in the tag-triggered release build). Log: `logs/real-tui/baseline-zizmor.log`.
- Templates: every checkout in `templates/github/files/_github/workflows/ci.yml:39,58,74,125` and
  in `release.yml` (draft, build, publish), plus the rust-cache step in `release.yml:119-121`.
- Fix (not a weakening): add `persist-credentials: false`; `gh` uses `GH_TOKEN`, not the git
  credential. Removed rust-cache from the release build, since releases should build cold.
- Online zizmor needs a GitHub token (HTTP 401). That's environment, not scaffold.
- This hurts more because the workflow comments brag about supply-chain hardening (SHA pins,
  least privilege), yet the most common zizmor finding ships.

## 4. Outdated ratatui / crossterm pins (~5 min)

`templates/tui/deps.js:8-9` pins `ratatui 0.29` / `crossterm 0.28`. crates.io currently has
ratatui 0.30.2 / crossterm 0.29.0. Bumping both together kept a single crossterm in the lock.
The scaffold's `terminal.rs` / `event.rs` compiled unchanged on 0.30. The one 0.30 change I hit,
`TestBackend` error type → `Infallible`, works with `?` into anyhow. The deps.js comment
explaining the pin is fine but needs updating. The scaffold could also re-export through
`ratatui::crossterm` to make version skew impossible.

## 5. Docs / CI gate gaps (~3 min, 1 attempt)

- `RUSTDOCFLAGS="-D warnings" cargo doc` failed once on a private intra-doc link
  (`[`filter_action`]` in a pub item's doc). Easy fix, but **no generated gate runs rustdoc**: not
  CI, not CLAUDE.md "Commands", even though `missing_docs` is denied, so docs clearly matter.
- The README badge says `rust 1.98+` and `Cargo.toml` says `rust-version = "1.98"`, but nothing
  checks the MSRV. CI uses only the 1.99.1 pin. (`cargo +1.98 build`/`test` passed here.)
- Neither actionlint nor zizmor runs in CI. With both added, (3) would have been caught at
  generation time.
- `CLAUDE.md` puts *"Tests return `anyhow::Result<()>`, and every `assert!` carries a message"*
  under "Rules the build enforces". Nothing enforces either; they're conventions.
- `event.rs` doc says *"an idle app uses no CPU"*, but it redraws at 10 Hz forever (rainbow tick).
  Cheap, but not "no CPU". (`templates/tui/files/src/event.rs`)

## 6. Preset defaults (~3 min)

- The tui preset includes `serde` + `toml` (`src/presets.ts:20`, base DEFAULTS), but no generated
  code uses either. I removed them.
- `src/presets.ts:8-9`: the default `author` / `github` are `Lawrence Norton` / `lnorton89`, and
  `git config user.name` is ignored (checked with `--json -y`). A user who runs
  `npx create-rust-app x -y` gets a stranger's name in LICENSE, CODEOWNERS and Cargo `authors`.
  `--help` doesn't show the default. (I passed `--author`, so I wasn't hit.)
- `deny.toml` passes but prints 7–10 `license-not-encountered` warnings on every run (`src/gen/deny.ts`
  has a GUI-oriented superset allow-list: `OFL-1.1`, `Ubuntu-font-1.0`, …). It's noise, not a blocker.

## 7. TUI skeleton: a good base, mostly kept

- **Kept unchanged:** `terminal.rs` (guard + chained panic hook; the restore is correct, verified
  under a pty: `icanon echo` before *and* after), `event.rs`, `main.rs`, `logging.rs`, the
  `header_check.rs` banner format, and the title-bar colour helpers.
- **Rewritten:** the `app.rs` demo checklist became the log state. I kept and extended its
  `BINDINGS` single-source table (hints + help pane + key lookup); that pattern was the most
  useful thing in the scaffold. `ui.rs` got a new layout. In `lib.rs`, the run loop now drains the
  reader channel after each event.
- **Missing:** `Events` only knows terminal input + tick, with no slot for a background
  source. Every "TUI that shows live data" needs this, so the channel is drained after each wait
  and latency is bounded by the tick. A `Event::App(T)` variant fed by an mpsc, or a documented
  pattern, would help. There's also no viewport-from-terminal-size helper for paging, and no
  `tempfile` dev-dep for tests that touch files.
- The panic hook restores the terminal on *any* thread's panic. In debug (unwind), a panicking
  background thread would restore the terminal while the UI keeps drawing. That's a non-issue in
  release (`panic = "abort"`), but worth a doc line once threads are involved.
- The scaffold doesn't use ratatui 0.30's `ratatui::try_init` / `DefaultTerminal`. That's fine,
  since the hand-rolled version is clearer, but it's dated.

## 8. Logging to a predictable temp path (noticed, not changed)

`templates/tui/files/src/logging.rs:29,34`: `File::create(std::env::temp_dir().join("@@name@@.log"))`.
On Linux that's world-writable `/tmp`, and `File::create` follows symlinks and truncates. Another
local user can pre-create `/tmp/tailview.log -> ~/.bashrc`. Most distros mitigate this with
`fs.protected_symlinks`, but the right place is the user's state/cache dir, or `create_new` plus a
per-user name.

## Zero-friction items (worth saying)

- **Header banner + `header_check`:** I added two new files and passed on the first attempt
  (0 failures) by copying a neighbour's banner, as CLAUDE.md suggests. I also probed the error
  messages deliberately: `src/view/mod.rs: does not open with the header rule` and
  `declares \`Module: tail_other\` but sits at \`view::tail2\``. They're clear and list every
  problem at once. It helped. One nit: "does not open with the header rule" could print the rule
  line itself.
- **cargo-deny:** `notify` (CC0-1.0), `regex`, and `tempfile` with all their transitive deps passed
  `cargo deny check` with no changes. Licences, bans, sources and advisories were all OK.
- **Lint table:** **zero** lints fired on ~2,000 lines of TUI code (casts, `u16` cursor maths,
  VecDeque windowing, usize arithmetic). I never needed `#[expect]`. That's because the table
  denies panicking APIs and wildcards but enables no `cast_*`, `indexing_slicing`,
  `arithmetic_side_effects` or `pedantic` (the template's own `as u8` in `hsl_to_rgb` passes). I wrote
  `try_from`/`saturating_*`/`.get()` by habit, but nothing required it. "Strict" here really
  means "no panics, no wildcards, documented". The `#[expect]` path is documented clearly but went
  unused.
- Windows cross-clippy (`--target x86_64-pc-windows-msvc`) is clean (`logs/real-tui/clippy-windows.log`).

## Gates (final, all in `logs/real-tui/`)

fmt ✔ · clippy -D warnings ✔ · test ✔ (40 lib + 3 toolchain_pin, incl. header_check) · deny ✔ ·
doc -D warnings ✔ (after 1 fix) · `cargo +1.98 build` ✔ (+ `test` ✔) · actionlint ✔ · zizmor ✔
(after fixes in item 3). Smoke: `smoke.typescript` (raw pty capture), `smoke-rendered.txt` (pyte-rendered
frames: live append, help pane, filter prompt, filtered view), `smoke-restore.typescript`
(stty `icanon echo` before/after, EXIT=0), `smoke-errors.log` (no tty → "could not set up the
terminal: No such device or address", exit 1; no args → usage, exit 2).

## Workflow verdict (step 5)

- **ci.yml:** correct as generated. It runs on push to main and on PRs, read-only token, SHA-pinned
  actions, per-job timeouts, fmt / deny / clippy+test on Windows+Linux, and a release build on
  Windows (catches `panic = "abort"` issues). `arguments: --all-features` is a valid global
  cargo-deny flag. Gaps: no MSRV, rustdoc, actionlint or zizmor job; fails zizmor (item 3).
- **release.yml:** the `v*` tag trigger, the tag-vs-`Cargo.toml` check, draft → build → publish
  sequencing, scoped permissions (`contents: write` only on draft/publish;
  `id-token`/`attestations: write` only on publish), the artifact naming per target,
  `download-artifact` with `pattern` + `merge-multiple`, provenance attestation, and the
  cargo-cyclonedx 0.5.9 flags (verified locally) are all right. **It would work, but it only
  ships a Windows `.zip`** for a TUI. Adding a target breaks SBOM naming and attestation (item 1).
  Also: artifact attestations need a public repo or GitHub Enterprise Cloud, so on a private repo
  on a free/Team plan, `publish` fails at the attest step and leaves a draft. Nothing in the docs says so.
  `gh release upload $(find . -type f)` is unquoted but safe with these filenames.
