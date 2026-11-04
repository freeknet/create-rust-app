---
title: The tool's own README, CI and e2e test
owns: [README.md, LICENSE, CHANGELOG.md, .github/**, test/e2e.test.js]
depends: []
gate: npm test
---
Repository polish for create-rust-app itself (not the generated projects).

- `README.md`: a gorgeous, nerdy README: centered title, one-line pitch, an ASCII rendering of the
  Prism banner, `npx create-rust-app` / `npm create rust-app` quick start, a presets table (from
  src/presets.js), every flag (docs/PLAN.md §3), what you get (lints table, header banners, unsafe
  boundary, toolchain pin, CI/release with attestations, cargo-deny), how templates work (link
  docs/CONTRACTS.md), Contributing (`npm test`, `node scripts/scaffold-check.mjs <preset>`), and a short
  "How this repo is built" note on `tools/swarm` (parallel Codex workers in git worktrees). No drug or
  acid wording.
- `LICENSE` MIT (Lawrence Norton, 2026). `CHANGELOG.md` Keep a Changelog, `## [Unreleased]`.
- `.github/workflows/ci.yml`: matrix node 20/22/26 × ubuntu/windows: `npm ci`, `npm test`; plus a
  `scaffold` job (windows-latest + ubuntu-latest, Rust 1.99.1 via the dtolnay SHA in PLAN.md) running
  `node scripts/scaffold-check.mjs <preset>` per preset in a matrix (gui presets on ubuntu use
  `--gate check`). SHA-pin actions as PLAN.md does (for `actions/setup-node` use a major tag with a TODO
  to pin). `.github/dependabot.yml` for npm and github-actions.
- `test/e2e.test.js`: for each preset build ctx + plan in-process; assert no unrendered `@@` tokens or
  directive lines remain, every `.rs` dest has a header whose Module line equals `moduleFor(dest, ctx)`,
  and dests are unique. Skip a preset cleanly (t.skip) when no `.rs` files are produced yet.
