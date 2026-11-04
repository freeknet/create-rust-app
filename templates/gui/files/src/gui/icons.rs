// ============================================================================
// Module:       @@module@@
// Description:  Painting the brand mark with egui, and rasterising it for the
//               window icon.
//
// Dependencies: egui; crate::brand (the geometry and its colours)
// ============================================================================

//! The brand mark, drawn.
//!
//! Both functions consume the one definition in [`crate::brand`], so the
//! mark in the header, in the taskbar and in `assets/` cannot drift apart.
//! The window icon is rasterised at startup rather than decoded from a file,
//! so there is no image whose contents nothing checks.

use crate::brand;
use egui::{Pos2, Sense, Stroke, Ui, Vec2};

/// The window icon's edge, in pixels. Windows downsamples it cleanly to
/// the 32 and 16 the title bar and the taskbar use.
pub const ICON_SIZE: u32 = 64;

/// Paints the mark at the cursor, `size` points square, without its plate:
/// in the header it sits straight on the window.
pub fn paint_brand(ui: &mut Ui, size: f32) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(size), Sense::hover());
    let painter = ui.painter();
    let (cx, cy) = brand::CENTRE;
    let centre = rect.min + Vec2::new(cx, cy) * size;
    for (index, color) in brand::colors().iter().enumerate() {
        let (inner, outer) = brand::band(index);
        let radius = (inner + outer) / 2.0 * size;
        let width = (outer - inner) * size;
        // The upper half-circle, left to right, as one stroked polyline.
        let points: Vec<Pos2> = (0..=24)
            .map(|step| {
                let angle = std::f32::consts::PI * (1.0 + step as f32 / 24.0);
                centre + Vec2::new(angle.cos(), angle.sin()) * radius
            })
            .collect();
        painter.add(egui::Shape::line(
            points,
            Stroke::new(width, super::ui::theme::rgb(*color)),
        ));
    }
    response
}

/// The window icon, rasterised from the same definition, plate included.
#[must_use]
pub fn app_icon() -> egui::IconData {
    egui::IconData {
        rgba: brand::rasterise(ICON_SIZE),
        width: ICON_SIZE,
        height: ICON_SIZE,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_icon_is_the_size_it_claims() {
        let icon = app_icon();
        assert_eq!((icon.width, icon.height), (ICON_SIZE, ICON_SIZE));
        assert_eq!(icon.rgba.len(), (ICON_SIZE * ICON_SIZE * 4) as usize);
    }
}
