---
title: CLI entry, args, prompts, post-steps
model: gpt-6.1-sol
effort: medium
owns: [bin/**, src/cli.js, src/args.js, src/prompts.js, src/post/**, test/cli.test.js, test/args.test.js]
depends: []
gate: npm test
---
Build the interactive and non-interactive CLI that drives the existing core.

- `bin/create-rust-app.js` (shebang, imports `src/cli.js`, `main(process.argv.slice(2))`, sets exitCode).
- `src/args.js`: `parseArgv(argv)` using `node:util` `parseArgs` for every flag in PLAN.md §3 plus
  `--set key.path=value` (repeatable, like scripts/scaffold-check.mjs). Returns `{ dir, flags, overrides }`
  where `overrides` is a partial Answers object (CONTRACTS.md). `--with tray,palette` / `--without ci`
  map short names → features/tooling/crates keys (document the map in `--help`). Unknown flag → error
  with a suggestion (Levenshtein ≤ 2). `--help` prints a beautiful help screen using src/ui — import it
  lazily and fall back to plain text if `src/ui/*.js` don't exist yet (another worker writes them in
  parallel to the "UI API" in CONTRACTS.md).
- `src/prompts.js`: `ask(partial, caps)` with `@clack/prompts` `group()`; steps in PLAN.md order:
  preset first (options from `PRESETS` with hints, plus "custom"), then name (validate with
  `validateName`), tagline, kind, gui stack (gui/workspace only), crates (multiselect + selects),
  features (multiselect, gui only), tooling (multiselect, pre-checked per defaults), license,
  edition/MSRV/toolchain behind one "advanced settings?" confirm, post (git, cargo check, open editor).
  Questions already answered by flags are skipped; preset values pre-fill defaults. Section titles via
  `theme.section(caps, i, title)`; bullets per PLAN.md. Ctrl-C → `cancel('Nothing written.')`, exit 130.
- `src/cli.js`: `main(argv)`: detect caps → banner (unless --quiet/--json) → answers (prompts, or
  `resolveAnswers(preset, overrides)` with `--yes`/non-TTY) → `buildContext` → `buildPlan` → preview tree
  with clack `note()` (interactive only) + confirm → `writePlan` (`--dry-run` prints the tree and exits)
  → post-steps → `renderSummary`. `--json`: print `{ answers, files }` JSON only. Errors print a red
  one-liner (stack only with `DEBUG`). Default dir = `./<name>`.
- `src/post/git.js`: if git is present and the target isn't inside an existing repo: `git init -b main`,
  add, commit `feat: scaffold <name> with create-rust-app` (if user.name/email are unset, pass
  `-c user.name=… -c user.email=…` from answers). `src/post/cargo.js`: if cargo is on PATH, check
  `rustup toolchain list` for the pin (hint `rustup toolchain install <pin>` if missing), then
  `cargo check --all-targets` streaming the last output line into the spinner; returns true/false/null
  (skipped). `src/post/open.js`: spawn `code`/`cursor` detached (shell on win32).
- Tests: args parsing (flags, --with/--without, --set, unknown-flag suggestion), and an e2e-lite test
  running `node bin/create-rust-app.js <tmp> --preset cli --yes --no-git --no-cargo-check --quiet` that
  asserts Cargo.toml exists.
