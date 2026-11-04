# Contracts

Every module codes against these. If you need to change one, say so in your final message —
do not silently change it.

## Layout

```
bin/create-rust-app.js     entry; imports src/cli.js and calls main(process.argv.slice(2))
src/cli.js                 main(argv): args → answers → ctx → plan → write → post → summary
src/args.js                parseArgv(argv) → { dir, flags }           (node:util parseArgs)
src/presets.js             PRESETS: Record<id, Partial<Answers>>; DEFAULTS: Answers
src/prompts.js             ask(partial, ui) → Answers                  (@clack/prompts)
src/context.js             buildContext(answers) → Ctx                 (CORE, exists)
src/engine/directives.js   applyDirectives(text, flags) → text         (CORE, exists)
src/engine/render.js       renderText(text, ctx, dest) → text          (CORE, exists)
src/engine/groups.js       GROUPS: [{ id, when(ctx) }]                 (CORE, exists)
src/engine/plan.js         buildPlan(ctx) → Promise<PlanEntry[]>       (CORE, exists)
src/engine/write.js        writePlan(plan, targetDir, {force, dryRun}) (CORE, exists)
src/gen/header.js          moduleFor(dest, ctx) → string               (CORE, exists)
src/gen/index.js           generate(ctx) → PlanEntry[]                 (Cargo.toml, deny.toml …)
src/gen/cargo.js, deps.js, deny.js
src/post/{git,cargo,open}.js
src/ui/{tty,rainbow,banner,theme,spinner,summary}.js
templates/<group>/files/** template files; templates/<group>/manifest.js optional
test/*.test.js             node --test
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

`name crate Name NAME appCrate displayName tagline author github email year license edition msrv
toolchain accent module`. `@@module@@` is computed per file by `moduleFor(dest, ctx)`.
Unknown tokens throw (so a typo fails tests loudly).

## Templates

- A group is a folder `templates/<id>/` with a `files/` tree. `src/engine/groups.js` lists the
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
