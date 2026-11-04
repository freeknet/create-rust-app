# Architecture

@@displayName@@ is one crate with a library and a thin binary. The library is in three layers,
and the split is what keeps it testable.

```
src/
  main.rs            parse the command line, load preferences, open the window
  lib.rs             module graph; NAME, TAGLINE, ACCENT, APP_ID
  cli.rs             the command line
  color.rs           Rgb, OKLCh, the rainbow Ramp, WCAG contrast
  theme/             Palette (derived from a few stated colours) + readability rules
<!-- @if motion -->
  motion.rs          the four durations, the easing curves, Tween
<!-- @end -->
<!-- @if icons -->
  icon.rs            every icon as polylines on a 16x16 grid
<!-- @end -->
<!-- @if brand -->
  brand.rs           the mark: geometry, colours from the accent, a rasteriser
<!-- @end -->
<!-- @if config -->
  config.rs          preferences: forgiving per-field parse, atomic write
<!-- @end -->
<!-- @if commandPalette -->
  command_palette.rs the commands and the fuzzy matcher, without egui
<!-- @end -->
<!-- @if tray -->
  tray.rs            the notification-area icon, as actions for the app
<!-- @end -->
  gui/
    run.rs           the runtime: opens the window and drives App (the only eframe code)
    app/             App: state, Action, and the one place actions are applied
    ui/              drawing: theme, widgets, chrome, modal, settings, pages
    font.rs          an installed UI font by family name
<!-- @if brand -->
    icons.rs         the mark painted with egui, and the window icon
<!-- @end -->
  win/               every Win32 call, as safe leaf wrappers
```

## The portable core

`color`, `theme` and the other top-level modules
name no window and no Windows type. Their tests — the WCAG checks on every theme, the easing
curves, the config parser — run on any machine, including a CI runner with no GPU.

## The GUI

`gui::app::App` uses egui only. The runtime in `gui::run` owns the window and calls
`App::show(ui)` (or `App::ui(ctx)` inside `Context::run_pass`) once per frame, and
`App::on_exit()` on a normal quit. Swapping the runtime touches that one file.

Drawing never mutates the app directly: `gui::ui::draw` returns `Action`s and `App::apply`
carries them out. A button, a keyboard shortcut, a menu entry
and anything you add later are one code path.

Every colour comes from the active `Palette`; every margin from the spacing scale in
`gui::ui::theme`; every animation from a few helpers in `gui::ui::widgets`, so no call
site picks its own duration.

<!-- @if themes -->
## Themes

`assets/themes.toml` is compiled in. Each theme states eleven colours; `Palette::derive`
works out the rest. `*.toml` files in the user theme directory (shown in Settings) load on
top, and a theme whose `id` matches a built-in replaces it. A theme that fails
`Palette::readability_issues` is reported in Settings and not loaded; a built-in one that
fails is a failing test.

<!-- @end -->
## The Win32 layer

`src/win/` is the only place with `unsafe`. Each FFI call sits alone in a private function
with a `// SAFETY:` comment, handles are owned by types with `Drop`, and nothing outside
the module needs `unsafe` to use it.

## Adding a page

1. Add a variant to `Page` in `gui/app/mod.rs` (label, key, glyph).
2. Draw it in `gui/ui/mod.rs`'s `draw` match.
3. Bump the `Ctrl+1…N` shortcut and `SHORTCUTS`; the tests will remind you.
