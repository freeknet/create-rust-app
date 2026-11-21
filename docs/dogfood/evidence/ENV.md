# Dogfood environment (phase 0, 2026-11-20)

OS: Ubuntu 24.04.5 LTS (container), Linux 6.18. Logs: `logs/phase0/`.

## Versions
| Tool | Version |
|---|---|
| node | v22.23.5 |
| npm | 10.9.9 |
| rustup | 1.28.2 at start, self-updated to 1.29.3 during `toolchain install` |
| cargo / rustc (default stable) | 1.97.0 (2026-07-07) |
| go | /usr/local/go/bin/go (used for actionlint) |

## Rust toolchains
- `stable` = 1.97.0 (default; older than the 1.98 MSRV, so plain `cargo +stable` on generated code may fail rust-version)
- `1.99.1` — installed (rustc 1.99.1 58cf8f9c3 2026-10-13), profile minimal + rustfmt + clippy. Log: rustup-1.99.1.log
- `1.98` — installed, resolves to 1.98.1 (48a229cea 2026-09-01), + rustfmt + clippy. Log: rustup-1.98.log
- Generated projects' `rust-toolchain.toml` auto-selects 1.99.1 (verified in `.scratch/minimal`).
- No Windows MSVC target installed (rust-toolchain.toml lists `x86_64-pc-windows-msvc`; not added by minimal install).

## Tools
| Tool | Status |
|---|---|
| cargo-deny | 0.22.0 installed (`cargo install --locked`) |
| cargo-msrv | 0.19.6 installed |
| zizmor | 1.32.0 installed |
| actionlint | 1.7.12 installed via `go install` to /usr/local/bin |
| xvfb-run | present (/usr/bin/xvfb-run) |
| script | present (util-linux) |
| expect | 5.45.4 installed via apt |

## GUI system libs
Before: runtime .so files present (libxkbcommon, libwayland-client, libX11, libGL, libvulkan) but dev/pkg-config
files missing for xkbcommon, wayland, xcursor, xrandr, xi, gtk3, appindicator, gl, egl.
Installed via apt (log apt-install.log): libxkbcommon-dev libwayland-dev libx11-dev libxcursor-dev libxrandr-dev
libxi-dev libgtk-3-dev libayatana-appindicator3-dev libgl1-mesa-dev libegl1-mesa-dev libxdo-dev expect.
After (env-probe-after.txt): all resolve via pkg-config (xkbcommon 1.6.0, wayland 1.22.0, gtk3 3.24.41,
ayatana-appindicator3 0.5.90, gl 1.2, egl 1.5). Note: repo CI installs libxinerama-dev too (not installed here).

## Reference projects
`../rustaman` and `../strobe` (/home/user/rustaman, /home/user/strobe): NOT present.

## Nothing failed to install.
