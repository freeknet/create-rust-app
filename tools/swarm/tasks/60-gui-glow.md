---
title: winit + glutin + egui_glow runtime (strobe-style)
model: gpt-6.1-sol
effort: high
owns: [templates/gui-glow/**]
depends: [gui-core]
gate: node scripts/scaffold-check.mjs rustaman --out .scratch/glow-single --set guiStack=winit-glow
---
Add the alternative GUI runtime used by strobe. Read strobe's crates/strobe-app window/event loop and GL
setup (search for glutin, egui_glow, winit ApplicationHandler) and reduce it to the essentials.

- `templates/gui-glow/files/src/gui/run.rs` replaces the eframe runner (same dest, same signature — see
  CONTRACTS.md "GUI runtime seam"). Put helpers in `src/gui/run/*.rs`, declared from run.rs with `mod`
  (Rust 2018+ allows `run.rs` + `run/` children). Do not edit the gui group's files; if you truly need a
  change there, describe it in your report.
- `templates/gui-glow/deps.js`: winit 0.30 (default-features=false, ["rwh_06","x11","wayland","wayland-dlopen"]),
  egui_glow 0.37 ["winit"], egui-winit 0.37 (default-features=false, ["links","clipboard","wayland","x11"]),
  glow 0.17, glutin 0.32, glutin-winit 0.5, raw-window-handle if needed.
- The seam as gui-core actually built it (read templates/gui/files/src/gui/run.rs and app/mod.rs first):
  `App` has `ui(ctx)` AND `show(ui)`. `ui(ctx)` calls `ctx.root_ui(...)`, so it may only be called inside
  `Context::run_pass`; a runtime that already holds the root `Ui` calls `show(ui)` instead. On quit call
  `app.on_exit()` (saves preferences); clear the framebuffer with `app.clear_color()`. With the `config`
  flag off the signatures are `run() -> anyhow::Result<()>` and `App::new(ctx)` — mirror the
  `// @if config` split exactly as the eframe run.rs does.
- `unsafe_check` already allows `unsafe` under `src/gui/run/` — keep the GL loader there.
- rustfmt traps (both editions are gated): no gated `use`/`#[derive]` lines adjacent to ungated ones,
  no brace imports mixing case classes (`{Icon, GRID}`), no `use @@crate@@::…` next to other `use`s,
  no nested `if` inside `if let` (2024 flags it; the let-chain fix doesn't compile on 2021).
- Use winit 0.30's `ApplicationHandler`, vsync, DPI scale, repaint on demand via egui's repaint delay,
  clean shutdown. The one unavoidable `unsafe` (GL loader / context) is a documented safe leaf with
  `// SAFETY:`; nothing else is unsafe.
