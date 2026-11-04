// ============================================================================
// Module:       @@module@@
// Description:  Module graph: the portable core, the Win32 layer, and the
//               desktop front end built on top of both.
//
// Dependencies: None; declarations only. See the individual modules.
// ============================================================================

//! @@displayName@@: @@tagline@@
//!
//! The crate is in three layers, and the split is what keeps it testable.
//!
//! The **portable core** is plain Rust with no window in it: [`color`] is
//! the colour maths, [`theme`] the palette and its readability rules,
// @if motion
//! [`motion`] the easing curves and durations,
// @end
// @if icons
//! [`icon`] the icon geometry,
// @end
// @if brand
//! [`brand`] the application mark,
// @end
// @if config
//! [`config`] the preferences file,
// @end
//! and [`cli`] the command line. Its tests run on any machine, without a
//! GPU or a display.
//!
//! [`gui`] is the desktop front end. It draws with egui and nothing else,
//! so the runtime that owns the window (`gui::run`) can change without the
//! app noticing.
//!
//! `win` is the only place that talks to Win32. Every call is wrapped in a
//! safe leaf function, so nothing outside it contains `unsafe`.
//!
//! See `docs/ARCHITECTURE.md` for the module map.

// @if brand
pub mod brand;
// @end
pub mod cli;
pub mod color;
// @if commandPalette
pub mod command_palette;
// @end
// @if config
pub mod config;
// @end
pub mod gui;
// @if icons
pub mod icon;
// @end
// @if motion
pub mod motion;
// @end
pub mod theme;
// @if tray
pub mod tray;
// @end

#[cfg(windows)]
pub mod win;

/// The product name, as it appears in the window title and the about page.
pub const NAME: &str = "@@displayName@@";

/// The one-line description, for `--help` and the about page.
pub const TAGLINE: &str = "@@tagline@@";

/// The colour the project was scaffolded with: the seed for the built-in
/// theme's accent and for the mark's colours.
///
/// Parsed at compile time. A malformed value falls back to cyan here and
/// fails `the_accent_seed_parses`, rather than painting black.
pub const ACCENT: color::Rgb = match color::Rgb::from_hex("@@accent@@") {
    Some(accent) => accent,
    None => color::Rgb::new(0x00, 0xe5, 0xff),
};

/// The application id: config directory, single-instance mutex, tray host.
pub const APP_ID: &str = "@@name@@";

#[cfg(test)]
mod tests {
    #[test]
    fn the_accent_seed_parses() {
        assert_eq!(
            super::color::Rgb::from_hex("@@accent@@"),
            Some(super::ACCENT),
            "the scaffolded accent must be a #rrggbb colour"
        );
    }
}

// @if headerCheck
#[cfg(test)]
mod header_check;
// @end
// @if unsafeCheck
#[cfg(test)]
mod unsafe_check;
// @end