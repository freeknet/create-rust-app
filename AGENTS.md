# AGENTS.md

`create-rust-app` is an `npx` scaffolder for Rust projects in the author's house style
(taken from the `strobe` and `rustaman` projects). Strict TypeScript, compiled to ESM JavaScript for distribution.

Read before doing anything:

1. [docs/PLAN.md](docs/PLAN.md) — what we're building, conventions, option matrix, UX.
2. [docs/CONTRACTS.md](docs/CONTRACTS.md) — module APIs, the Ctx shape, flags, tokens, template rules.
   Code against these. If you think one must change, say so in your final message; don't change it quietly.

Reference projects, usually checked out next to this repo (read-only, copy from them freely):
`../rustaman` (single-crate GUI) and `../strobe` (workspace). Strip app-specific content
(task-manager / visualizer features, decision IDs, backlog links); keep the patterns.

## Gates

```bash
npm run typecheck && npm test && npm run build
node scripts/scaffold-check.mjs <preset>         # scaffold + fmt + clippy -D warnings + test
node scripts/scaffold-check.mjs <preset> --gate check   # faster: cargo check only
node scripts/scaffold-check.mjs <preset> --gate fmt     # cargo fmt --check only, no build
node scripts/scaffold-check.mjs <preset> --gate doc     # cargo doc --no-deps, RUSTDOCFLAGS=-D warnings
```

Presets: `rustaman strobe cli tui lib minimal`. Override any answer with `--set features.tray=true`
(split on the first `=`), the project name with `--name <name>`. The doc gate is not part of the
default full gate; run it too when you touch doc comments. An existing `CARGO_TARGET_DIR` is used.

## Rules

- Node: strict TypeScript, ESM, no new runtime deps beyond `@clack/core` and `picocolors`.
- Generated Rust must satisfy the lint block in PLAN.md 1.3 and the header banner rule.
