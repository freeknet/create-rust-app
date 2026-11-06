# Contracts

Every module codes against these. Change one deliberately, and update this file with it.

The shared TypeScript shapes are declared in `src/types.ts`; the prose below specifies
the runtime behavior and template conventions.

## Layout

```
bin/create-rust-app.ts     entry; imports src/cli.ts and calls main(process.argv.slice(2))
src/cli.ts                 main(argv): args → answers → ctx → plan → write → post → summary
src/args.ts                parseArgv(argv) → { dir, flags, overrides } (node:util parseArgs)
src/presets.ts             PRESETS: Record<id, Partial<Answers>>; DEFAULTS: Answers
src/prompts.ts             ask(partial, caps, targetCheck) → Answers   (@clack/core)
src/context.ts             buildContext(answers) → Ctx                 (CORE, exists)
src/engine/directives.ts   applyDirectives(text, flags) → text         (CORE, exists)
src/engine/render.ts       renderText(text, ctx, dest) → text          (CORE, exists)
src/engine/groups.ts       GROUPS: [{ id, when(ctx) }]                 (CORE, exists)
src/engine/plan.ts         buildPlan(ctx) → Promise<PlanEntry[]>       (CORE, exists)
src/engine/write.ts        writePlan(plan, targetDir, {force, dryRun, onFile}); targetProblem(dir)
src/gen/header.ts          moduleFor(dest, ctx) → string               (CORE, exists)
src/gen/index.ts           generate(ctx) → PlanEntry[]                 (Cargo.toml, deny.toml …)
src/gen/cargo.ts, deps.ts, deny.ts
src/post/{git,cargo,open}.ts
src/reproduce.ts           reproduceCommand(answers, dir?) → string
src/ui/{tty,glyphs,rainbow,banner,theme,labels,choose,rail,motion,spinner}.ts
templates/<group>/files/** template files; templates/<group>/manifest.js optional
test/*.test.ts             node --test
```

## Answers (user choices; what presets and prompts produce)

```js
{
  name, displayName, tagline, author, github, email,
  license: 'MIT' | 'MIT+CommonsClause' | 'Apache-2.0' | 'MIT OR Apache-2.0',
  edition: '2024' | '2021', msrv: '1.98', toolchain: '1.99.1', accent: '#00e5ff',
  kind: 'cli' | 'gui' | 'tui' | 'lib' | 'workspace',
  guiStack: 'eframe' | 'winit-glow',
  crates:   { errors: 'anyhow', thiserror: bool, logging: 'log'|'env_logger'|'tracing',
              serde: bool, async: 'none'|'tokio', http: 'none'|'ureq'|'reqwest',
              sqlite: bool, clap: bool },
  features: { themes, brand, motion, icons, config, winres, tray, singleInstance,
              commandPalette, screenshotExample },            // all bool
  tooling:  { ci, release, cargoDeny, dependabot, toolchainPin, agentDocs, headerCheck,
              unsafeCheck, changelogGen, issueTemplates, codeowners, securityMd }, // all bool
  post:     { git: bool, cargoCheck: bool, open: 'none'|'code'|'cursor' },
  preset:   string | null,
}
```

## Ctx = Answers + derived

`buildContext(answers)` adds: `crate` (snake), `Name` (Pascal), `NAME` (SCREAMING),
`year`, `appCrate` (workspace: `<name>-app`, else `<name>`), `flags: Set<string>`, `tokens`.

### Flags (used by directives and `when`)

- `kind_<kind>`, `gui_<guiStack>` (only when kind is gui or workspace), `edition_<edition>`,
  `license_mit`, `license_mit_cc`, `license_apache`, `license_dual`
- `log_<logging>`, `async_<x>`, `http_<x>` (including `_none`)
- every true boolean in crates/features/tooling by its key: `thiserror`, `serde`, `sqlite`, `clap`,
  `themes`, `tray`, `ci`, `release`, …
- `has_gui` (kind gui, or workspace — the workspace app crate is a GUI), `has_bin` (kind ≠ lib),
  `workspace` (kind workspace), `single` (not workspace)

### Tokens (`@@x@@`)

`name crate Name NAME appCrate appCrateSnake displayName tagline author github email year license edition msrv
toolchain accent module`. `@@module@@` is computed per file by `moduleFor(dest, ctx)`.
Unknown tokens throw (so a typo fails tests loudly).

## Templates

- A group is a folder `templates/<id>/` with a `files/` tree. `src/engine/groups.ts` lists the
  groups and when each applies. Dest path = path under `files/`, with:
  - `@@token@@` substituted in path segments,
  - a leading `_` on a segment's name turned into `.` (`_gitignore` → `.gitignore`, `_github` → `.github`),
    because npm drops dotfiles from packages,
  - a trailing `.tmpl` stripped.
- Optional `templates/<id>/manifest.js`: `export default function (ctx, files) → files'` where
  `files` is `[{ src, dest }]` (absolute src, relative dest). Use it to drop or rename files.
  Without a manifest all files are included.
- Binary files (`.png .ico .ttf .otf .woff2 .zip`) are copied raw. Everything else is text and goes
  through `renderText`.
- Line directives work in any text file. A line whose trimmed content, after an optional comment
  leader (`//`, `#`, `<!--`, `--`, `;`), is `@if EXPR`, `@elif EXPR`, `@else`, or `@end` (an
  optional trailing `-->` is ignored) is a directive and is removed. Blocks nest. EXPR is
  `term (| term)*`, term is `atom (& atom)*`, atom is `flag` or `!flag`.
- Later groups override earlier ones on the same dest (last write wins) — so a feature group can
  replace a base file. Generators (`src/gen`) run last and win over templates.

## PlanEntry

`{ dest: 'src/main.rs', content: string } | { dest, copyFrom: absPath }` — dest is POSIX-relative.

## Rust output rules (generated projects must pass these)

- Every `.rs` starts with the header banner using `@@module@@`, then `//!` docs.
- Generated projects must pass `cargo fmt --check`, `cargo clippy --all-targets --all-features -- -D warnings`
  under the lint block in PLAN.md 1.3, and `cargo test`.
- No `unwrap/expect/panic/todo` in non-test code; tests return `anyhow::Result<()>`.

## Dependencies (`templates/<group>/deps.js`)

Templates never edit Cargo.toml. A group that needs crates ships `templates/<group>/deps.js`:

```js
// @ts-check
/** @param {import('../../src/types.ts').Ctx} ctx @returns {import('../../src/gen/deps.ts').Dep[]} */
export default (ctx) => [
  { name: 'eframe', version: '0.37', defaultFeatures: false, features: ['wgpu', 'default_fonts'] },
  { name: 'windows-sys', version: '0.61', target: 'cfg(windows)', features: ['Win32_Foundation'] },
  { name: 'winresource', version: '0.1', kind: 'build' },
  { name: 'egui_kittest', version: '0.37', kind: 'dev', features: ['wgpu', 'snapshot'] },
  { name: 'resvg', version: '0.49', crate: 'xtask' },     // workspace: goes to crates/xtask
];
```

`kind`: normal (default) / dev / build. `crate`: `app` (default — the single crate, or `crates/<name>-app`)
or `xtask`. Same dep from several groups → features are unioned. Base deps from the `crates` answers
(anyhow, thiserror, clap+derive, log/env_logger/tracing, serde+derive & toml, dirs (serde & config),
tokio, ureq/reqwest, rusqlite) are added by `src/gen/deps.ts` — don't redeclare them unless you need
extra features. Unused deps are harmless; missing ones fail the build.

Cargo target auto-discovery is relied on: `src/lib.rs`, `src/main.rs`, `src/bin/*.rs`, `build.rs`,
`examples/*.rs`, `tests/*.rs` need no manifest entries.

## Crate shape every kind follows

- Every kind ships `src/lib.rs` (the binary kinds also `src/main.rs`, a thin shell over the lib).
- `lib.rs` must contain these hooks verbatim, as the LAST items in the file with no other `mod`
  adjacent (rustfmt reorders runs of adjacent `mod` lines, which breaks `cargo fmt --check`):

  ```rust
  // @if headerCheck
  #[cfg(test)]
  mod header_check;
  // @end
  // @if unsafeCheck
  #[cfg(test)]
  mod unsafe_check;
  // @end
  ```
- Guards (`templates/guards`): `src/header_check.rs` walks `src/`, `tests/`, `examples/` of the crate
  it is in (`env!("CARGO_MANIFEST_DIR")`), expected module names exactly as `src/gen/header.ts`
  computes them, crate name from `env!("CARGO_PKG_NAME")`, workspace prefix = crate name snake-cased
  when the crate dir is under `crates/`. `tests/toolchain_pin.rs` finds `rust-toolchain.toml` at the
  crate root or `../../` (workspace).

## GUI runtime seam (`templates/gui` ↔ `templates/gui-glow`)

- `src/gui/mod.rs` declares `pub mod app; pub mod run; pub mod ui; …`.
- `src/gui/app/mod.rs`: `pub struct App` with `pub fn new(ctx: &egui::Context, config: crate::config::Config) -> Self`
  (config only when `config` flag) and `pub fn ui(&mut self, ctx: &egui::Context)` that draws one frame.
  App code uses `egui` only — never eframe or winit types — so both runtimes can drive it.
- `src/gui/run.rs`: `pub fn run(config: crate::config::Config) -> anyhow::Result<()>` opens the window and
  drives `App`. The `gui` group's version uses eframe (`@if gui_eframe`); `templates/gui-glow` replaces
  this one file (same dest) with a winit + glutin + egui_glow loop modelled on strobe. Anything else the
  glow loop needs lives in `src/gui/glow/` (owned by gui-glow).
- `egui` is a direct dependency in both stacks (`egui = "0.37"`) so app code names `egui::` not `eframe::egui::`.

## UI API (`src/ui/*`, used by `src/cli.ts` and `src/prompts.ts`)

```ts
// tty.ts
detect({ noColor? }) → Caps  // { tier, glyphs: 'full'|'console'|'ascii', unicode, tty, columns, animate }
// glyphs.ts: every drawn character comes from here, never a literal
glyphs(caps) → Glyphs
// rainbow.ts (all return plain text when caps.tier === 'none')
paint(caps, text, { offset, step, sat, light }); hex(caps, '#ff6ec7', text); dim(caps, text); bold(caps, text)
// banner.ts
bannerFrame(caps, frame) → string[]; showBanner(caps) → Promise<void>
// labels.ts: the words for every option; prompts, review and --help all read these
FEATURES, TOOLING, CRATE_TOGGLES, LOGGING, ASYNC, HTTP, LICENSES, STACKS, KINDS, grouped(catalogue)
// choose.ts
pick(caps, { message, options: Item[], initialValue?, io? }) → value | cancel symbol
pickMany(caps, { message, options: Item[], initialValues?, io? }) → values | cancel symbol
// rail.ts
text(caps, { message, placeholder?, defaultValue?, initialValue?, validate?, io? }) → string | cancel symbol
note(caps, title, body); box(caps, title, lines); log(caps, lines); outro(caps, msg); cancel(caps, msg)
tasks(caps, Task[]) → Promise<boolean>  // false as soon as a `required` task fails; later tasks don't run
// motion.ts: one animated line per prompt
live(caps, prompt, state); marker(caps, glyph, t); shimmer(caps, text, t); wave(caps, frame)
cascade(caps, lines); sparkle(caps, prefix, text)
// spinner.ts: non-interactive progress
createSpinner(caps) → { start(msg), message(msg), stop(msg, ok = true) }
```

## rustfmt-safe templates (learned the hard way)

Generated code must pass `cargo fmt --check` on editions 2021 and 2024 under every flag combination.

- Don't put directive-gated `use` or `#[derive(..)]` lines next to ungated ones: rustfmt reorders imports
  and merges derives across what were directive lines. Give gated imports their own `use` block.
- Avoid brace imports mixing case classes (`{Icon, GRID}`) and adjacent `use` lines whose order differs
  between style editions; avoid `use @@crate@@::…` next to other `use`s.
- No nested `if` inside `if let` (2024 clippy wants a let-chain, which doesn't compile on 2021).
- Guard hook blocks go last in lib.rs (see "Crate shape").
