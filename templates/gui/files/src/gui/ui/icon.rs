// ============================================================================
// Module:       @@module@@
// Description:  Painting crate::icon's geometry with egui, and the sizes the
//               app draws an icon at.
//
// Dependencies: egui (Painter, Shape); crate::icon
// ============================================================================

//! The icon set, painted.
//!
//! [`crate::icon`] owns the shapes; this maps them onto a rect and strokes
//! them, round-capped and round-joined. A mitre joint on a chevron renders
//! as a one-pixel spike at 16 px, which reads as a rendering fault.

use crate::icon::Icon;
use crate::icon::{GRID, WEIGHT};
use egui::{Color32, Painter, Pos2, Rect, Shape, Stroke, Vec2};

/// The size an icon is drawn at beside body text.
pub const INLINE: f32 = 16.0;

/// The size for a sidebar destination.
pub const NAV: f32 = 18.0;

/// The size for a card's feature icon.
pub const FEATURE: f32 = 22.0;

/// Paints `icon` centred in `rect`, on the largest square that fits, so a
/// non-square rect does not distort it.
pub fn paint(painter: &Painter, rect: Rect, icon: Icon, color: Color32) {
    let side = rect.width().min(rect.height());
    if side <= 0.0 || !side.is_finite() {
        return;
    }
    let scale = side / GRID;
    let origin = rect.center() - Vec2::splat(side / 2.0);
    let stroke = Stroke::new((WEIGHT * scale).max(1.0), color);
    let place = |(x, y): (f32, f32)| Pos2::new(origin.x + x * scale, origin.y + y * scale);
    for path in icon.strokes() {
        let mut points: Vec<Pos2> = path.points.iter().copied().map(place).collect();
        if let (true, Some(&first)) = (path.closed, points.first()) {
            points.push(first);
        }
        // One polyline rather than a segment per pair: egui joins the
        // segments of one line, and separate segments notch at the apex.
        painter.add(Shape::line(points, stroke));
    }
}

/// Allocates a square of `size` in the current layout and paints `icon`.
pub fn show(ui: &mut egui::Ui, icon: Icon, size: f32, color: Color32) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(Vec2::splat(size), egui::Sense::hover());
    paint(ui.painter(), rect, icon, color);
    response
}

// The sizes have a hierarchy, checked when the crate is compiled.
const _: () = {
    assert!(NAV >= INLINE, "a nav icon smaller than an inline one");
    assert!(FEATURE > NAV, "a card's feature icon should lead");
};
