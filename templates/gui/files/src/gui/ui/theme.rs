// ============================================================================
// Module:       @@module@@
// Description:  The active palette, the egui style derived from it, and the one
//               spacing scale every margin in the app comes from.
//
// Dependencies: egui; crate::theme (the palette), crate::color::Rgb
// ============================================================================

//! Where a theme becomes a window.
//!
//! [`apply`] installs the palette into egui's own `Visuals` once per frame,
//! before anything paints, so built-in widgets follow the theme without any
//! call site being involved, and no widget can be drawn under the previous
//! frame's theme. Custom drawing takes its colours from the same
//! [`Palette`], converted here by [`rgb`] — the single conversion point
//! between [`Rgb`] and `Color32`.
//!
//! ## No hand-picked pixel gaps
//!
//! Every margin, inset and gap is one of [`SPACE_XS`], [`SPACE_SM`],
//! [`SPACE_MD`], [`SPACE_LG`] or [`SPACE_XL`]. A value between two steps is
//! one of the two steps, which is what makes the left edges of the header,
//! the sidebar and every card line up.

use crate::color::Rgb;
use crate::theme::{Mode, Palette};
use egui::{Color32, CornerRadius, Margin, Stroke, TextStyle, Vec2};

/// The tightest gap: between an icon and its label.
pub const SPACE_XS: f32 = 4.0;

/// Between related controls in a row.
pub const SPACE_SM: f32 = 8.0;

/// Between groups of controls, and a card's inner margin.
pub const SPACE_MD: f32 = 12.0;

/// Between sections, and around a modal's body.
pub const SPACE_LG: f32 = 20.0;

/// Around a page's content.
pub const SPACE_XL: f32 = 28.0;

/// The corner radius on chips and buttons.
pub const RADIUS: u8 = 6;

/// The corner radius on cards and modals.
pub const RADIUS_LG: u8 = 10;

/// The height of buttons, nav items and fields.
pub const CONTROL_HEIGHT: f32 = 32.0;

/// The height of the header bar.
pub const HEADER_HEIGHT: f32 = 52.0;

/// The height of the status bar.
pub const STATUS_HEIGHT: f32 = 26.0;

/// The width of the expanded sidebar.
pub const SIDEBAR_WIDTH: f32 = 196.0;

/// The width of the collapsed, icon-only sidebar: one control and its insets.
pub const SIDEBAR_MINI_WIDTH: f32 = CONTROL_HEIGHT + SPACE_MD * 2.0;

/// The width of the accent bar down a selected item's leading edge. The
/// selection fill is a light tint, so this is what makes it unmistakable.
pub const SELECTION_BAR: f32 = 3.0;

/// Body text size.
pub const BODY_SIZE: f32 = 14.0;

/// Page heading size.
pub const HEADING_SIZE: f32 = 22.0;

/// Card and section title size.
pub const TITLE_SIZE: f32 = 16.0;

// Relations between constants, checked when the crate is compiled.
const _: () = {
    assert!(SPACE_XS < SPACE_SM && SPACE_SM < SPACE_MD);
    assert!(SPACE_MD < SPACE_LG && SPACE_LG < SPACE_XL);
    assert!(
        SIDEBAR_MINI_WIDTH < SIDEBAR_WIDTH,
        "collapsing must narrow it"
    );
    assert!(HEADER_HEIGHT > CONTROL_HEIGHT, "the header holds a control");
};

/// Installs `theme` into egui's style. Called once per frame, first.
pub fn apply(ctx: &egui::Context, theme: &Palette) {
    // egui keeps a light and a dark `Style` and picks by the OS setting.
    // The palette already decides, so the preference is pinned to it —
    // otherwise the fields set here would sit on top of the wrong defaults.
    ctx.set_theme(match theme.mode {
        Mode::Dark => egui::ThemePreference::Dark,
        Mode::Light => egui::ThemePreference::Light,
    });
    let derived = visuals(theme);
    ctx.all_styles_mut(|style| {
        style.visuals = derived.clone();
        style.spacing.item_spacing = Vec2::new(SPACE_SM, SPACE_SM);
        style.spacing.button_padding = Vec2::new(SPACE_MD, SPACE_XS);
        style.spacing.interact_size = Vec2::new(0.0, CONTROL_HEIGHT - SPACE_SM);
        // Solid scrollbars: a floating bar is invisible until the pointer
        // is already on it.
        style.spacing.scroll = egui::style::ScrollStyle::solid();
        style.spacing.scroll.bar_width = SPACE_SM;
        // Labels are not text fields; a selectable label makes the pointer
        // an I-beam over every piece of chrome.
        style.interaction.selectable_labels = false;
        for (text_style, size, family) in [
            (TextStyle::Body, BODY_SIZE, egui::FontFamily::Proportional),
            (TextStyle::Button, BODY_SIZE, egui::FontFamily::Proportional),
            (TextStyle::Small, 12.0, egui::FontFamily::Proportional),
            (
                TextStyle::Heading,
                HEADING_SIZE,
                egui::FontFamily::Proportional,
            ),
            (TextStyle::Monospace, 13.0, egui::FontFamily::Monospace),
        ] {
            style
                .text_styles
                .insert(text_style, egui::FontId::new(size, family));
        }
    });
}

/// Converts a palette colour to an egui one.
#[must_use]
pub const fn rgb(color: Rgb) -> Color32 {
    Color32::from_rgb(color.r, color.g, color.b)
}

/// A palette colour at a given opacity, for scrims and overlays, where the
/// alpha is the design decision and the colour still comes from the theme.
#[must_use]
pub fn translucent(color: Rgb, alpha: u8) -> Color32 {
    Color32::from_rgba_unmultiplied(color.r, color.g, color.b, alpha)
}

/// A spacing-scale value as a margin unit, clamped rather than wrapped:
/// `Margin` is `i8`, and a bare cast of a large value would go negative.
#[must_use]
pub fn as_margin(space: f32) -> i8 {
    if space.is_nan() {
        return 0;
    }
    space.round().clamp(0.0, 127.0) as i8
}

/// A uniform margin from a scale value.
#[must_use]
pub fn margin(space: f32) -> Margin {
    Margin::same(as_margin(space))
}

/// A margin with separate horizontal and vertical steps.
#[must_use]
pub fn margin_xy(horizontal: f32, vertical: f32) -> Margin {
    Margin::symmetric(as_margin(horizontal), as_margin(vertical))
}

/// A proportional font at `size`.
#[must_use]
pub fn font(size: f32) -> egui::FontId {
    egui::FontId::proportional(size)
}

/// egui's `Visuals`, derived from a palette.
#[must_use]
pub fn visuals(theme: &Palette) -> egui::Visuals {
    let mut visuals = match theme.mode {
        Mode::Dark => egui::Visuals::dark(),
        Mode::Light => egui::Visuals::light(),
    };
    visuals.panel_fill = rgb(theme.panel);
    visuals.window_fill = rgb(theme.raised);
    visuals.window_stroke = Stroke::new(1.0, rgb(theme.border));
    visuals.window_corner_radius = CornerRadius::same(RADIUS_LG);
    visuals.menu_corner_radius = CornerRadius::same(RADIUS);
    visuals.faint_bg_color = rgb(theme.raised);
    visuals.extreme_bg_color = rgb(theme.app);
    visuals.code_bg_color = rgb(theme.raised);
    visuals.hyperlink_color = rgb(theme.accent);
    visuals.warn_fg_color = rgb(theme.warning);
    visuals.error_fg_color = rgb(theme.danger);
    visuals.override_text_color = Some(rgb(theme.text));
    visuals.weak_text_color = Some(rgb(theme.text_muted));
    visuals.selection.bg_fill = rgb(theme.selection);
    visuals.selection.stroke = Stroke::new(1.0, rgb(theme.accent));

    // egui paints *buttons* from `weak_bg_fill` and *filled controls* — the
    // scrollbar handle, a checkbox's interior, a slider's rail — from
    // `bg_fill`. Pointing both at a surface makes every scrollbar in the
    // app invisible, so the second always gets the control colour.
    for (state, surface, control) in [
        (
            &mut visuals.widgets.noninteractive,
            theme.panel,
            theme.control,
        ),
        (&mut visuals.widgets.inactive, theme.raised, theme.control),
        (
            &mut visuals.widgets.hovered,
            theme.hover,
            theme.control_hover,
        ),
        (&mut visuals.widgets.active, theme.hover, theme.accent),
        (&mut visuals.widgets.open, theme.hover, theme.control_hover),
    ] {
        state.weak_bg_fill = rgb(surface);
        state.bg_fill = rgb(control);
        state.bg_stroke = Stroke::new(1.0, rgb(theme.border));
        state.fg_stroke = Stroke::new(1.0, rgb(theme.text));
        state.corner_radius = CornerRadius::same(RADIUS);
        // No growth on hover: it nudges neighbouring widgets.
        state.expansion = 0.0;
    }
    visuals.widgets.noninteractive.fg_stroke = Stroke::new(1.0, rgb(theme.text_muted));
    visuals.widgets.hovered.bg_stroke = Stroke::new(1.0, rgb(theme.border_strong));
    visuals.widgets.active.bg_stroke = Stroke::new(2.0, rgb(theme.accent));
    visuals
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_scrollbar_handle_is_never_the_colour_of_the_surface_it_scrolls() {
        let theme = crate::theme::signature();
        let visuals = visuals(&theme);
        for state in [
            &visuals.widgets.noninteractive,
            &visuals.widgets.inactive,
            &visuals.widgets.hovered,
            &visuals.widgets.open,
        ] {
            assert_ne!(state.bg_fill, state.weak_bg_fill, "a control vanishes");
        }
    }

    #[test]
    fn the_derived_visuals_carry_the_themes_own_colours() {
        let theme = crate::theme::signature();
        let visuals = visuals(&theme);
        assert_eq!(visuals.panel_fill, rgb(theme.panel));
        assert_eq!(visuals.override_text_color, Some(rgb(theme.text)));
        assert!(visuals.dark_mode, "the signature theme is dark");
    }

    #[test]
    fn an_absurd_margin_is_clamped_rather_than_wrapping() {
        assert_eq!(as_margin(10_000.0), 127);
        assert_eq!(as_margin(-50.0), 0);
        assert_eq!(as_margin(f32::NAN), 0);
        assert_eq!(as_margin(SPACE_MD), 12);
    }
}
