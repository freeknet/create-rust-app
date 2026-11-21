# 3b — Interactive prompt dogfood (create-rust-app)

Date 2026-11-20 · CLI `dist/bin/create-rust-app.js` (@clack/core 1.6.0, node 22.23.5) · repo untouched.

## Harness

- `/home/user/cra-dogfood/pty/harness.py`: `pty.fork` + `bash -c "trap ':' INT; node … ; rc=$?; echo __EXIT=$rc; stty -a"`,
  so the exit code and the tty mode **after** node exits are recorded inside the same pty. Keys are sent one at a time
  with delays (escape sequences kept whole). Raw stream → `logs/interactive/<s>.raw`; rendered with `pyte`
  (installed into `pty/pylib`) → `<s>.txt` (labelled screen snapshots + final scrollback); `<s>.meta.json` has exit code,
  `stty_raw_left`, `cursor_visible_at_end` (last `?25l` vs `?25h`), and SGR count.
- Scenarios: `pty/scen.py` (definitions), `pty/run.py <name…>` (runner), `pty/snaps.py <txt>` (snapshot tails).
- Projects: `/home/user/cra-dogfood/projects/interactive/<name>`. Most runs use `--no-git --no-fetch --no-cargo-check`
  (prompts stay interactive).

## Scenario results

| # | Scenario | Result |
|---|---|---|
| 1 | Happy path cli / rustaman | PASS (exit 0, files written, tty restored). Logs `s1-happy-cli`, `s1-happy-rustaman` |
| 2 | Customize every section, compare | PARTIAL — all values chosen in sections were written correctly; mismatches exist outside what the review shows (F1, F4, F9) |
| 3 | Cancel everywhere | PASS for prompts (exit 130, "Nothing written.", cursor shown, cooked tty, no dir) — but Esc in any section kills the whole run (F5); Ctrl-C during post-steps leaves cursor hidden + partial dir (F3) |
| 4 | Invalid input | PARTIAL — inline, clear, recoverable messages; but Rust keywords, Cargo-reserved/Windows names, 300-char names, MSRV>toolchain accepted (F2, F6, F7, F8) |
| 5 | 40 cols / 10 rows | FAIL-ish — rows wrap at 40 cols; lists taller than the viewport have no scrolling, focused row off-screen (F10, F11) |
| 6 | NO_COLOR / --no-color | PARTIAL — 0 SGR under NO_COLOR; `--no-color` leaks `ESC[7m`; multiselect focus and text cursor invisible without colour (F12, F13) |
| 7 | Flags + interactive | PARTIAL — `--name/--preset` skip correctly, bad flags fail before prompting; positional dir + rename lies (F4); `--kind` overrides "Start over" choice (F14) |
| 8 | Keyboard | PASS mostly — arrows, j/k/h/l, space, a, i work; Home/PgDn/Tab ignored (fine); hint wording nits (F17) |

## Findings

### F1 — Author / GitHub owner are hard-coded to the repo author; never asked, never shown (bug, high)
- Scenario 1/2: any interactive run. `hp-cli/LICENSE`: `Copyright (c) 2026 Lawrence Norton`; `.github/CODEOWNERS`: `* @lnorton89`;
  `Cargo.toml` `authors`/`repository` likewise. `git config user.name` was set in this environment and ignored.
- Expected: ask (or derive from `git config`) and show on the review; actual: no prompt, no review line, Customize has no section for it.
- Root cause: `src/presets.ts:9-10` (`DEFAULTS.author/github`), no prompt in `src/prompts.ts:115-278`, not in `reviewLines` (`src/prompts.ts:54-112`).
- Log: `logs/interactive/s1-happy-cli.txt`; project `projects/interactive/hp-cli`.

### F2 — Rust keywords accepted as the project name; generated project does not compile (bug)
- Keys: `fn⏎` (also `match`, `async`, `type` accepted). `s4-name-00..02` show the kind picker appearing instead of an error.
- `s4-name-keyword-create` wrote `projects/interactive/fn`; `cargo check` → `error: expected identifier, found '::' --> src/main.rs:17:7`.
- Root cause: `src/context.ts:11` only rejects `test core std alloc proc-macro self crate super`; no Rust keyword list.
- Logs: `s4-name-00.txt` (match), `s4-name-01.txt` (async), `s4-name-02.txt` (type), `s4-name-keyword-create.txt`.

### F3 — Ctrl-C during the run steps leaves the cursor hidden, prints nothing, leaves a partial project (bug)
- Keys: rustaman, Create, Ctrl-C ~1s into `cargo fetch`. Exit 130 (killed by SIGINT), `cursor_visible_at_end=false`
  (last `ESC[?25l` never followed by `?25h`), spinner line left unterminated, no message. `projects/interactive/cx-fetch`
  left with all files but no Cargo.lock / git.
- Root cause: `src/ui/rail.ts:273` hides the cursor and relies on `finally` (`:281`) which never runs on SIGINT;
  `tasks()` has no SIGINT handler (unlike `src/ui/spinner.ts:48` and `src/ui/banner.ts:102`, which do).
- Log: `logs/interactive/s3-ctrlc-during-fetch.{txt,raw,meta.json}`.

### F4 — With a positional dir, renaming in Customize makes the review and the reproduce command lie (bug)
- Command `create-rust-app fl-dir --preset cli`; Customize → Name → `fl-renamed`. Review: `Create it  writes ./fl-renamed`.
  Actual: `Wrote 30 files to fl-dir`; reproduce line: `npx … fl-renamed --preset cli …` (would write elsewhere).
- Root cause: hint `src/prompts.ts:149` uses `a.name`; target is `resolve(dir ?? answers.name)` at `src/cli.ts:222`;
  reproduce takes the name as positional.
- Log: `logs/interactive/s7-dir-and-rename.txt`.

### F5 — Esc inside any Customize section or the Customize menu quits the whole program, discarding all edits (friction, high)
- Keys: review → Customize → (menu | Crates | Command line | GUI runtime | App features | Tooling | Licence | MSRV | After |
  Name | tagline | Start over) → Esc. Every one: exit 130, "Nothing written.". The menu has a "Back to review" row,
  but Esc, the obvious "back" key, cancels. Footer says only `esc cancel`, which doesn't say it cancels the whole run.
  "Start over from a preset" can't be backed out of either: you pick a preset or quit.
- Root cause: every section prompt goes through `got()` (`src/prompts.ts:38-44`), which throws `Cancelled`;
  `customize()` (`src/prompts.ts:175` onwards) never treats a cancel as "back to review".
- Logs: `s3-custmenu-esc.txt`, `s3-sect-{crates,cmdline,app,appfeat,tooling,licence,msrv,after,details,tagline,preset}-esc.txt`.

### F6 — No length limit on the name; a 300-char name passes validation then fails at write (bug, low)
- Typed 300×`a`: accepted, review shown, Create → `✖ Writing 30 files failed: ENAMETOOLONG … mkdir '<300-char path>'`, exit 1.
  No dir left behind (good).
- Root cause: `src/context.ts:8-14` (no max length; the target check `src/engine/write.ts:6` only tests existence).
- Log: `logs/interactive/s4-name-long.txt`.

### F7 — Cargo-reserved / Windows-device names accepted as project name although rejected as command name (bug)
- `build`, `deps`, `con`, `nul` accepted at the name prompt (`s4-name-11..14`). As the command name, `deps` and `con`
  are rejected (`s4-details-invalid`). The binary defaults to the crate name, so `con` ends up as `con.exe`.
  `cargo new build` → `error: invalid package name 'build'`; `cargo new con` warns that it won't work on Windows.
- Root cause: `validateName` (`src/context.ts:8`) doesn't apply the `validateBin` rules (`src/context.ts:17-24`);
  `effectiveAnswers` clears `bin` when it equals the crate name (`src/context.ts:65`), so `buildContext` (`:76`) never checks it.
- Logs: `s4-name-11.txt`…`s4-name-14.txt`, `s4-details-invalid.txt`.

### F8 — MSRV and toolchain are validated only for shape: MSRV 9.0 with toolchain 1.0.0 and edition 2024 is accepted (bug, medium)
- Customize → Licence + Rust → MSRV `9.0`, toolchain `1.0.0`. Written: `rust-version = "9.0"`, `channel = "1.0.0"`.
  Shape errors are inline and clear ("Use a version like 1.98", "Use an exact version like 1.99.1"); a leading space
  (` 1.98`) is rejected without trimming (nit); `stable`/`nightly-…` are rejected, which is defensible.
- Root cause: `src/prompts.ts:240-241` (regex only; no MSRV ≤ toolchain check, no edition 2024 ⇒ ≥1.85 check, no trim).
- Log: `logs/interactive/s4-rust-invalid.txt`; project `projects/interactive/rv-cli`.

### F9 — An empty tagline is written two different ways (bug, low)
- Customize → tagline cleared → Create. `Cargo.toml description = "dv-cli"` (falls back to the name), README has `****` (empty bold).
- Root cause: `src/context.ts:121` (`tagline: a.tagline || ''`) vs the fallback in `src/gen/cargo.ts:130`; template `templates/base/files/README.md:5`.
  The tagline is also not shown on the review screen, so the user can't spot it.
- Log: `logs/interactive/s4-details-invalid.txt`; project `projects/interactive/dv-cli`.

### F10 — At 40 columns, option rows overflow and wrap (bug, medium)
- `s5-narrow-40`: kind picker rows like `│  ● Desktop app  recommended   egui +` / `wg…` and Customize menu rows wrap onto
  two lines. Footers (`space toggle · a all · enter confirm` / `· esc cancel`) and long messages also wrap.
- Root cause: `src/ui/choose.ts:38` `room = Math.max(10, cols - indent - labelW - 6)`: the minimum of 10 forces rows
  wider than the terminal. Footers at `src/ui/choose.ts:74,121` aren't clipped. The review note itself degrades well
  (licence moves into the body).
- Logs: `s5-narrow-40.txt`, `s5-tiny-40x10.txt`.

### F11 — Lists taller than the terminal: no scrolling, focused row and message off-screen, stale frames left behind (bug, medium)
- `s5-short-10` (100×10): App features (15 lines + footer) and Tooling show only the bottom; with the cursor on `Themes`
  (top) the focused row and the `◆ App features` message are off-screen, so space toggles a row you can't see. The theme
  list (11 lines) loses its message too. After submit/cancel, the active frame's top lines stay in scrollback above the
  echo (`s5-tiny-40x10` final: `◼ CODEOWNERS …` / `guardrails` above `■ Tooling`).
- Root cause: `pick`/`pickMany` render every option (`src/ui/choose.ts:68-75`, `107-122`) with no window. @clack/core's
  primitives don't window; @clack/prompts does it with `maxItems`/`limitOptions`, checked via Context7 (/bombshell-dev/clack), but that package isn't a dependency.
- Logs: `s5-short-10.txt`, `s5-tiny-40x10.txt`.

### F12 — Without colour, the multiselect focus and the text cursor position are invisible (bug, medium a11y)
- `NO_COLOR=1`, Tooling, cursor moved to `Dependabot`: every row renders identically; nothing marks the focused row.
  Single-select is fine (●/○). In the name prompt, after ← ←, the input shows `nc-env` with no cursor mark (the `█`
  appears only when the cursor is at the end).
- Root cause: focus is shown only through `shimmer()` → `bold()`, which returns plain text at tier `none`
  (`src/ui/choose.ts:118`, `src/ui/motion.ts:32`, `src/ui/rainbow.ts:122`). The text cursor uses clack's
  `userInputWithCursor` (`src/ui/rail.ts:176`) = `util.styleText('inverse')`, which honours NO_COLOR.
- Log: `logs/interactive/s6-no-color-env.txt` (snap "tooling multiselect cursor on row 3", "text cursor moved left").

### F13 — `--no-color` still emits `ESC[7m … ESC[27m` (bug, low)
- `--no-color`, edit the name with ←: 3× `ESC[7m`/`ESC[27m` in the raw stream (`nc-fla\x1b[7mg\x1b[27m`). NO_COLOR env: 0 SGR.
- Root cause: same `userInputWithCursor` (`src/ui/rail.ts:176`): node's `styleText` sees NO_COLOR but not our flag.
- Log: `logs/interactive/s6-no-color-flag.raw` (+ `.meta.json` `esc_sgr_count: 6`).

### F14 — With `--kind`, "Start over from a preset" ignores the preset you pick (bug, medium)
- `--name fl-lib --kind lib` → Customize → Start over → pick "Desktop app" → review still `fl-lib · library`, crates unchanged.
- Root cause: `src/prompts.ts:158` `resolveAnswers(preset, { ...partial, … })`: the CLI `kind` overrides the picked
  preset's kind. Also, with `--kind lib` and no preset, the base is the GUI defaults (MIT, not the lib preset's dual licence).
- Log: `logs/interactive/s7-kind-lib-repick.txt`.

### F15 — The review omits values the user edits: MSRV, tagline, author/owner, theme base, accent (friction)
- s2: MSRV changed to 1.90, tagline changed, theme changed to Graphite; none appear on the review (only "pinned 1.92.0",
  and only while Pinned toolchain is on). Every value that did appear matched the written files (licence, edition,
  toolchain in `rust-toolchain.toml` and every `ci.yml` job, release.yml dropped, tray.rs, winit+glow deps,
  SQLite/tokio/ureq/tracing, `[[bin]] custy`, git commit).
- Root cause: `reviewLines` sections (`src/prompts.ts:82-89`, title facts `:105`).
- Log: `logs/interactive/s2-customize-gui.txt`; project `projects/interactive/cust-app2`.

### F16 — The "not empty" error suggests `--force`, which can't be used mid-prompt, and wraps a full absolute path (friction)
- Name `hp-cli` (exists): `└  /home/user/cra-dogfood/projects/interactive/hp-cli is not empty. Pick another directory or pass` / `--force.`
- Root cause: message from `src/engine/write.ts:9`, reused as the prompt validator (`src/prompts.ts:125` via `src/cli.ts`).
- Log: `logs/interactive/s4-name-08.txt`.

### F17 — Keyboard hint nits (nit)
- `a all` toggles: when everything is selected, `a` clears all (`s8-keys` "after a"). `i` (invert), j/k and h/l work but
  aren't advertised. Home/End/PgDn/Tab do nothing (fine). Space on a single select does nothing (fine).
- Root cause: footer text `src/ui/choose.ts:121`; behaviour is @clack/core's `toggleAll`.
- Log: `logs/interactive/s8-keys.txt`.

### F18 — Flags are asked again inside Customize, contrary to PLAN §4 "Flags are never asked again" (nit / contract)
- `--msrv 1.90 --license Apache-2.0` → Customize → Licence + Rust asks both again (prefilled correctly). `--no-git` →
  After creating offers git again; turning it on did run git. Prefill is consistent, so this is mostly a doc/contract mismatch.
- Root cause: `customize()` doesn't consult `given()` (`src/prompts.ts:117`, `:234-262`).
- Logs: `s7-msrv-flag.txt`, `s2-customize-gui.txt`.

### F19 — Smaller nits
- Choosing "Cancel" on the review exits 130, the same as Ctrl-C (a deliberate choice could be 0). `src/prompts.ts:155`. Log `s3-review-canceloption.txt`.
- The cancel output draws an extra empty rail line (`│`,`│`,`└ Nothing written.`): the prompt's cancel frame and `cancel()` each add one. `src/ui/choose.ts:67` + `src/ui/rail.ts:247`.
- Layout uses the column count read at startup; after a resize to 40 cols, rows hard-wrap (`caps.columns` fixed in `src/ui/tty.ts:166`). Log `s5-resize.txt`.
- At 40 cols the banner tagline is clipped without an ellipsis ("…at the speed of"). Log `s5-narrow-40.txt`.
- Each Customize round reprints a full review box, so the transcript grows long (cosmetic).

## Verified OK
- Terminal state restored after every prompt-time cancel (Esc and Ctrl-C at every stage): `icanon echo isig` on, cursor visible, no directory created.
- Validation messages are inline (warning colour, under the input), specific, and the prompt recovers as soon as you type.
- `--name X --preset Y` skips both prompts; a positional valid dir supplies the name; `--name BadName` and `--preset bogus` fail before any prompt (exit 2).
- `NO_COLOR=1` output has 0 SGR sequences; single-select stays legible (●/○).
- The escaping of a tagline with `"` and `\` is correct in Cargo.toml (`"Says \"hi\" \\ there"`) and README.
