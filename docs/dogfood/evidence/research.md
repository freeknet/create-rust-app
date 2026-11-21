# create-rust-app: npm name and dependency-version research

Date: 2026-11-20. Raw output: `/home/user/cra-dogfood/logs/research/`. Nothing was published and there was no `npm login`. The repository was not modified.

## 1. npm name

### `create-rust-app`
- `npm view create-rust-app --json` returned E404 "Unpublished on 2025-06-19T21:40:46.066Z" (`npm-view-create-rust-app.json`).
- The registry document (`curl-create-rust-app.json`, HTTP 200) is a tombstone. It was created 2022-03-12. Its only version, `0.0.0`, was unpublished on 2025-06-19. It lists no maintainers or owner and has no security-holding marker. This is a normal unpublish, not a security hold.
- The npm unpublish policy (https://docs.npmjs.com/policies/unpublish) says that after a full unpublish you "may not publish any new versions of that package until 24 hours have passed". It also says "Once `package@version` has been used, you can never use it again", so `0.0.0` can never be reused. The page does not say whether a *different* account may claim the name. That was not verified, because only a real publish would test it.
- Confusion risk: crates.io has a well-known, unrelated `create-rust-app` crate (v11.0.3, 2025-06-22; `crate-create-rust-app.json`). It does the same job, generating Rust projects. npm's guidelines (https://docs.npmjs.com/package-name-guidelines) ask that unscoped names "Will not confuse others about authorship". **Do not take this name**, even if npm would allow it.

### npm similarity rules
- npm's "moniker" rule (https://blog.npmjs.org/post/168978377570/new-package-moniker-rules): "we remove punctuation from its name and compare it to existing package names". For example, `react-native` blocks `reactnative`, `react_native` and `react.native`.
- https://docs.npmjs.com/threats-and-mitigations: "npm is able to detect typosquat attacks and block the publishing of these packages."
- Scoped names are not compared against unscoped names, and the docs encourage scopes.
- So `create-rustapp` could collide with the `create-rust-app` tombstone, if tombstones count. That is unverified, so avoid it.

### `npm create` / `npm init` mapping
Sources: https://docs.npmjs.com/cli/v11/commands/npm-init, confirmed through Context7 `/npm/cli`.
- `npm init foo` -> `npm exec create-foo`
- `npm init @usr/foo` -> `npm exec @usr/create-foo`
- `npm init @usr` -> `npm exec @usr/create`

`create` is an alias of `init`.

### Candidates (raw results: `candidates.txt`, `reg-*.json`)
| Package | Registry | Similar / notes | Invocation |
|---|---|---|---|
| create-rust-app | unpublished 2025-06-19 | crates.io crate of the same name | `npm create rust-app` |
| create-rust-app-kit | **404 free** | none | `npm create rust-app-kit` |
| create-rusty-app | **404 free** | none | `npm create rusty-app` |
| create-rustaman | **404 free** | named after a reference app, so a misleading name | `npm create rustaman` |
| create-ferris-app | **404 free** | none | `npm create ferris-app` |
| create-ferris | **404 free** | none | `npm create ferris` |
| create-rust-project | **404 free** | none | `npm create rust-project` |
| create-rust-scaffold | **404 free** | none | `npm create rust-scaffold` |
| create-rust-template | **404 free** | none | `npm create rust-template` |
| create-crate | **404 free** | none | `npm create crate` |
| create-oxide-app | **404 free** | none | `npm create oxide-app` |
| create-rustapp | 404 | likely blocked by the punctuation rule against create-rust-app | (avoid) |
| create-rs-app | taken (1.0.5, ahoward2, 2022, unrelated) | n/a | n/a |
| create-cargo-app | taken (0.0.0, chen7david, 2023) | n/a | n/a |
| create-rust | taken (0.0.2, liruifengv, "create a Rust project") | n/a | n/a |
| create-rs | taken (0.1.5, 2023) | n/a | n/a |
| create-cargo | taken (1.0.0, 2025-08) | n/a | n/a |
| create-rust-starter | unpublished 2026-05-19 | tombstone | (avoid) |
| @freeknet/create-rust-app | **404 free** | scoped, so no similarity check | `npm create @freeknet/rust-app` |
| @freeknet/create-rust | **404 free** | scoped | `npm create @freeknet/rust` |
| @freeknet/create | **404 free** | scoped | `npm create @freeknet` |

Scope ownership: `registry.npmjs.org/-/org/freeknet/package` returned 404, and the npmjs.com profile and org pages returned 403 (bot wall; `scope-freeknet.txt`). So it is **not verified** whether an npm user or org named `freeknet` exists or who holds it. A scoped publish needs that scope. Check it while logged in before deciding.

Not checked: the Rust Foundation trademark policy on using "Rust" in package names.

### Recommendation
1. **`@freeknet/create-rust-app`** (`npm create @freeknet/rust-app`). It keeps the current name and makes authorship clear. Scoped names are exempt from the similarity check and avoid the crates.io confusion. It needs the `freeknet` npm scope and `--access public`.
2. **`create-rust-app-kit`** (`npm create rust-app-kit`). It is free and unscoped, has no similar name once punctuation is removed, and is closest to the current brand.
3. **`@freeknet/create`** (`npm create @freeknet`). It is the shortest invocation, and the same scope can hold other generators later. It needs the scope, like option 1.

## 2. Template dependency versions

MSRV is 1.98 (`src/presets.ts:14`) and the pinned toolchain is 1.99.1 (`src/presets.ts:15`). Data comes from the crates.io API (`crates-latest.txt`, `crate-*.json`). The latest stable Rust is 1.100.0 (2026-11-09; `rust-stable.txt`). The local cargo is 1.97.0, so I used the crates.io API instead of `cargo info`.

| Crate | Pin | Latest stable | Pin admits latest? | Latest's rust-version > 1.98? |
|---|---|---|---|---|
| anyhow | 1 | 1.0.104 | yes | no (1.68) |
| thiserror | 2 | 2.0.21 | yes | no (1.77) |
| clap | 4 | 4.6.9 | yes | no (1.85) |
| log | 0.4 | 0.4.35 | yes | no (1.71) |
| env_logger | 0.11 | 0.11.12 | yes | no (1.85) |
| tracing | 0.1 | 0.1.44 | yes | no (1.65) |
| tracing-subscriber | 0.3 | 0.3.23 | yes | no (1.65) |
| serde | 1 | 1.0.229 | yes | no (1.56) |
| toml | 1.2 | 1.2.1 | yes | no (1.85) |
| dirs | 7 | 7.0.0 | yes | none declared |
| tokio | 1 | 1.54.1 | yes | no (1.85) |
| ureq | 3 | 3.5.2 | yes | no (1.85) |
| reqwest | 0.13 | 0.13.5 | yes | no (1.85) |
| **rusqlite** | 0.41 | **0.43.0** | **no** | no (1.89) |
| tempfile | 3 | 3.27.0 | yes | no (1.63) |
| windows-sys | 0.61 | 0.61.2 | yes | no (1.71) |
| egui / eframe / egui_glow / egui-winit / egui_kittest | 0.37 | 0.37.0 | yes | no (1.95) |
| winit | 0.30 | 0.30.13 | yes | no (1.70) |
| glow | 0.17 | 0.18.0 | no; **keep it**: egui_glow 0.37 and eframe 0.37 require `glow ^0.17.0` | none declared |
| glutin | 0.32 | 0.32.3 | yes | no (1.71) |
| glutin-winit | 0.5 | 0.5.0 | yes | no (1.70) |
| raw-window-handle | 0.6 | 0.6.2 | yes | no (1.64) |
| winresource | 0.1 | 0.1.34 | yes | none declared |
| **ratatui** | 0.29 | **0.30.2** | **no** | no (1.88) |
| **crossterm** | 0.28 | **0.29.0** | **no** | no (1.63) |
| **cargo-cyclonedx** (`cargo install --version 0.5.9`, release.yml:175) | =0.5.9 | **0.5.10** | no (exact pin) | no (1.86) |

Notes:
- ratatui 0.30.2's default backend is `ratatui-crossterm` with `crossterm_0_29` (`ratatui-crossterm-features.txt`). The comment in `templates/tui/deps.js` ties crossterm to ratatui's version, so bump both together, to 0.30 and 0.29. That is a breaking API change, so re-run `scaffold-check tui` after.
- No crate's latest version needs Rust above 1.98. The highest requirement is egui 0.37, at 1.95.

### GitHub Actions (`actions-latest.txt`, `sha-to-tag.txt`, `rust-toolchain-pinned.txt`)
| Action | Pinned SHA / comment | Tag check | Latest | Status |
|---|---|---|---|---|
| actions/checkout | 3d3c42e5 # v7.0.1 | SHA = v7.0.1 | v7.0.1 | current |
| dtolnay/rust-toolchain | 683b588c # master, 2026-10 | commit 2026-10-15, "Add 1.99.1 patch release"; ancestor of master | master df2a88e (2026-11-14) | 2 commits behind; Rust 1.100.0 was released after the pin; no major version (branch-pinned) |
| EmbarkStudios/cargo-deny-action | 3c634983 # v2.1.1 | SHA = v2.1.1 | v2.1.3 | 2 patches behind, same major |
| Swatinem/rust-cache | d1527c8f # v2.9.3 | SHA = v2.9.3 | v2.9.3 | current |
| actions/upload-artifact | cf430e03 # v7.0.2 | SHA = v7.0.2 | v7.0.2 | current |
| actions/download-artifact | 9000827c # v8.0.2 | SHA = v8.0.2 | v8.0.2 | current |
| actions/attest-build-provenance | 4d101475 # v4.2.2 | SHA = v4.2.2 | v4.2.2 | current |
| actions/attest-sbom | c6043329 # v4.1.0 | SHA = v4.1.0 | v4.1.0 | current |

Every pinned SHA matches its version comment. No action is more than one major version behind.

Aside: the default toolchain is 1.99.1, and stable is now 1.100.0.

## Network
No call was blocked by the proxy. The npmjs.com website pages returned 403, which looked like the site's bot protection rather than the proxy. The registry API worked.
