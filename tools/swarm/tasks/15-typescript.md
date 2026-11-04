---
title: Convert the tool to strict TypeScript
model: gpt-6.1-terra
effort: medium
owns: [src/**, bin/**, test/**, scripts/**, tools/swarm/*, package.json, package-lock.json, tsconfig.json, tsconfig.*.json, docs/CONTRACTS.md, AGENTS.md, README.md, .github/workflows/ci.yml, templates/*/manifest.js, templates/*/deps.js, .gitignore]
depends: []
gate: npm run typecheck && npm test && npm run build && node dist/bin/create-rust-app.js --help && node scripts/scaffold-check.mjs cli --gate none && node scripts/scaffold-check.mjs rustaman --gate none && node scripts/scaffold-check.mjs strobe --gate none
---
Convert create-rust-app from JS-with-JSDoc to strict TypeScript. Behaviour must not change.

Why a build step: Node strips types natively but refuses to for files under `node_modules`, which is
where `npx` runs us from. So the package ships compiled JS in `dist/`; development and tests run the
`.ts` sources directly (Node ≥ 22.18 / 26 strip types by default inside the repo).

1. `tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `module`/
   `moduleResolution` `NodeNext`, `target` `ES2023`, `rootDir` `.`, `outDir` `dist`, `verbatimModuleSyntax`,
   `rewriteRelativeImportExtensions: true` (sources import `./x.ts`; emitted JS imports `./x.js`),
   `erasableSyntaxOnly: true` (no enums/namespaces/parameter properties — must run under type stripping),
   `declaration` false. Include `src`, `bin`, `scripts`, `tools/swarm`; tests may be checked via a
   `tsconfig.test.json` that extends it with `noEmit`. Add `allowJs` + `checkJs` only for
   `templates/*/manifest.js` and `templates/*/deps.js` (they stay JS: loaded at runtime from templates/,
   typed via `/** @import { Dep } from '../../src/types.ts' */`-style JSDoc imports).
2. Create `src/types.ts` exporting the shared shapes now described in prose in docs/CONTRACTS.md:
   `Answers`, `Ctx`, `Dep`, `PlanEntry`, `Group`, `Caps` (UI capabilities), the UI module signatures as
   types where useful, flag and token key unions where practical. Every module imports from it.
   Update docs/CONTRACTS.md to point at `src/types.ts` as the source of truth (keep the prose rules
   about templates, directives, tokens, Rust output).
3. Rename every `.js` under src/, bin/, scripts/, tools/swarm/ and test/ to `.ts`; turn JSDoc types into
   annotations; delete `// @ts-check`. Fix everything strict mode finds (properly — no `any` unless at a
   true boundary like JSON.parse or dynamic import, and then narrowed immediately; no non-null `!`
   without a comment on why it holds).
4. Runtime paths: code that locates `templates/` must work both from sources (`src/engine/plan.ts`) and
   from `dist/src/engine/plan.js` — resolve the package root by walking up to the nearest package.json.
   Dynamic imports of `src/gen/index.*` must pick the right extension for the running file.
5. package.json: `"bin": { "create-rust-app": "./dist/bin/create-rust-app.js" }`, `"files": ["dist",
   "templates"]`, scripts `build` (`tsc -p .`), `typecheck` (tsc --noEmit for src + tests),
   `test` (`node --test "test/**/*.test.ts"`), `prepublishOnly` (`npm run typecheck && npm test && npm
   run build`), `check` and `swarm` pointing at the .ts scripts. devDependencies: `typescript` (latest
   5.x/6.x stable — check with `npm view typescript version`), `@types/node`. Ignore `dist/` in .gitignore.
6. CI (.github/workflows/ci.yml): add a `typecheck` step and a `npm pack --dry-run` check that the
   tarball contains `dist/bin/create-rust-app.js` and no `.ts` sources.
7. AGENTS.md and README.md: update commands and the "plain JS, no build step" wording.

8. Keep `node scripts/scaffold-check.mjs …` and `node tools/swarm/swarm.mjs …` working as entry
   points (other tasks' gates call them): make each `.mjs` a two-line shim that imports the `.ts`.

Run the gate; also run `npm pack --dry-run` and check the file list.
