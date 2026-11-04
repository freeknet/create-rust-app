# AGENTS.md

`create-rust-app` is an `npx` scaffolder for Rust projects in the author's house style
(taken from his `strobe` and `rustaman` projects). Plain ESM JavaScript, no build step.

Read before doing anything:

1. [docs/PLAN.md](docs/PLAN.md) — what we're building, conventions, option matrix, UX.
2. [docs/CONTRACTS.md](docs/CONTRACTS.md) — module APIs, the Ctx shape, flags, tokens, template rules.
   Code against these. If you think one must change, say so in your final message; don't change it quietly.

Reference projects (read-only, copy from them freely):
`C:\Users\ADUPU\Documents\Development\rustaman` (single-crate GUI) and
`C:\Users\ADUPU\Documents\Development\strobe` (workspace). Strip app-specific content
(task-manager / visualizer features, decision IDs, backlog links); keep the patterns.

## Gates

```bash
npm test                                         # node --test test/
node scripts/scaffold-check.mjs <preset>         # scaffold + fmt + clippy -D warnings + test
node scripts/scaffold-check.mjs <preset> --gate check   # faster: cargo check only
```

Presets: `rustaman strobe cli tui lib minimal`. Override any answer with `--set features.tray=true`.

## Rules

- Stay inside the paths your task owns. Other agents are working in parallel on the rest.
- Do not run `git commit`, `git checkout`, or `git merge`; the orchestrator commits for you.
- Do not edit `src/engine/*`, `src/context.js`, `src/presets.js`, `src/gen/header.js`,
  `docs/CONTRACTS.md` unless your task says so.
- Node: `// @ts-check` + JSDoc, ESM, no new runtime deps beyond `@clack/prompts` and `picocolors`.
- Generated Rust must satisfy the lint block in PLAN.md 1.3 and the header banner rule.
- Finish with a short report: what you built, what you verified (exact commands + result),
  anything left undone or any contract you think needs changing.
