// ============================================================================
// Module:       @@module@@
// Description:  The one modal card: a scrim, a raised card that fades and rises
//               into place, and dismissal by Escape or a click outside.
//
// Dependencies: egui (Modal); super::{theme, widgets}
// ============================================================================

//! Modal cards.
//!
//! **One modal shape, not several.** Every dialog in the app is this card
//! with different contents, so there are no six dialogs of six widths, none
//! aligned, three movable for no reason. egui's `Modal` layer confines
//! keyboard focus and blocks the views underneath; this module adds the
//! theme's card, a title row with a close button, and the arrival motion
//! shared with page changes: a short fade and rise.
//!
//! Escape and a click on the scrim both dismiss, because a dialog that can
//! only be closed with the mouse is a dialog that interrupts typing.

use super::theme::{self, SPACE_LG, SPACE_MD};
use super::widgets;
use crate::theme::Palette;
use egui::{Align2, CornerRadius, Ui, Vec2};

/// How far the card rises as it arrives.
const RISE: f32 = 8.0;

/// The scrim's opacity at rest: enough to push the window back without
/// hiding it.
const SCRIM_ALPHA: u8 = 150;

/// What a modal reports back after a frame.
pub struct Outcome<R> {
    /// What the contents returned, if they were drawn this frame.
    pub inner: Option<R>,
    /// Whether the user asked to dismiss it (Escape, the scrim, or ×).
    pub dismissed: bool,
}

/// Draws a modal card titled `title`, `width` wide, while `open` (and while
/// it fades out after closing).
pub fn show<R>(
    ctx: &egui::Context,
    theme: &Palette,
    title: &str,
    open: bool,
    width: f32,
    contents: impl FnOnce(&mut Ui) -> R,
) -> Outcome<R> {
    let id = egui::Id::unique("modal").with(title);
    let progress = widgets::fade(ctx, id.with("progress"), open);
    if progress <= 0.0 {
        return Outcome {
            inner: None,
            dismissed: false,
        };
    }
    let alpha = (f32::from(SCRIM_ALPHA) * progress)
        .round()
        .clamp(0.0, 255.0) as u8;
    let area = egui::Modal::default_area(id).anchor(
        Align2::CENTER_CENTER,
        Vec2::new(0.0, RISE * (1.0 - progress)),
    );
    let mut closed_by_button = false;
    let response = egui::Modal::new(id)
        .area(area)
        .frame(egui::Frame::NONE)
        .backdrop_color(theme::translucent(theme.app, alpha))
        .show(ctx, |ui| {
            ui.set_opacity(progress);
            egui::Frame::new()
                .fill(theme::rgb(theme.raised))
                .stroke(egui::Stroke::new(1.0, theme::rgb(theme.border)))
                .corner_radius(CornerRadius::same(theme::RADIUS_LG))
                .inner_margin(theme::margin(SPACE_LG))
                .shadow(egui::epaint::Shadow {
                    offset: [0, 10],
                    blur: 28,
                    spread: 0,
                    // Alpha-only: a shadow is lighting, not a theme colour.
                    color: egui::Color32::from_black_alpha(110),
                })
                .show(ui, |ui| {
                    ui.set_width(width);
                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new(title)
                                .font(theme::font(theme::HEADING_SIZE))
                                .color(theme::rgb(theme.text)),
                        );
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            let close = widgets::icon_button(ui, theme, "Close");
                            super::paint_glyph(ui, &close, super::glyph::CLOSE);
                            closed_by_button = close.response.clicked();
                        });
                    });
                    ui.add_space(SPACE_MD);
                    contents(ui)
                })
                .inner
        });
    let dismissed = open && (closed_by_button || response.should_close());
    Outcome {
        inner: Some(response.inner),
        dismissed,
    }
}
