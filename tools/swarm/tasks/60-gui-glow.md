---
title: winit + glutin + egui_glow runtime (strobe-style)
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
- Use winit 0.30's `ApplicationHandler`, vsync, DPI scale, repaint on demand via egui's repaint delay,
  clean shutdown. The one unavoidable `unsafe` (GL loader / context) is a documented safe leaf with
  `// SAFETY:`; nothing else is unsafe.
