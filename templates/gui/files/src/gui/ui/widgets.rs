// ============================================================================
// Module:       @@module@@
// Description:  The app's own controls: nav items, buttons, switches, cards,
//               meters and swatches, all painted from the active palette.
//
// @if motion
// Dependencies: egui; super::{theme, motion}, crate::theme::Palette
// @else
// Dependencies: egui; super::theme, crate::theme::Palette
// @end
// ============================================================================

//! The app's controls.
//!
//! egui's built-in widgets follow the theme through `Visuals` (see
//! [`super::theme`]); the ones here are drawn by hand because they need
//! something `Visuals` cannot say: a hover that fades rather than switches,
//! an accent bar down a selected item, a card that lifts.
//!
//! Every colour comes from the [`Palette`] passed in. Every animation goes
//! through [`hover_t`], [`fade`] and [`level`], which are the only places
//! that know whether motion is compiled in.

use super::theme::{self, SPACE_MD, SPACE_SM, SPACE_XS};
use crate::color::Rgb;
use crate::theme::Palette;
use egui::{Align2, Color32, CornerRadius, Rect, Response, Sense, Stroke, Ui, Vec2};

/// How far a hover has progressed, 0..=1, for the control `id`.
#[must_use]
pub fn hover_t(ui: &Ui, id: egui::Id, hovered: bool) -> f32 {
    // @if motion
    super::motion::toggle(ui.ctx(), id, hovered, super::motion::INSTANT)
    // @else
    let _ = (ui, id);
    f32::from(u8::from(hovered))
    // @end
}

/// How far a state change has progressed, 0..=1: a selection, a modal.
#[must_use]
pub fn fade(ctx: &egui::Context, id: egui::Id, on: bool) -> f32 {
    // @if motion
    super::motion::toggle(ctx, id, on, super::motion::QUICK)
    // @else
    let _ = (ctx, id);
    f32::from(u8::from(on))
    // @end
}

/// A value that settles on `target` rather than jumping to it.
#[must_use]
pub fn level(ctx: &egui::Context, id: egui::Id, target: f32) -> f32 {
    // @if motion
    super::motion::value(ctx, id, target)
    // @else
    let _ = (ctx, id);
    target
    // @end
}

/// How far a page keyed `key` has arrived, 0..=1; restarts when `key`
/// changes. See `motion::arrival`.
#[must_use]
pub fn arrival(ctx: &egui::Context, id: egui::Id, key: egui::Id) -> f32 {
    // @if motion
    super::motion::arrival(ctx, id, key)
    // @else
    let _ = (ctx, id, key);
    1.0
    // @end
}

/// Blends two palette colours by `t` and converts for painting.
#[must_use]
pub fn blend(rest: Rgb, lifted: Rgb, t: f32) -> Color32 {
    theme::rgb(rest.lerp(lifted, t))
}

/// What a hand-drawn control hands back: its response, where its icon goes,
/// and the colour that icon should be drawn in.
pub struct Slot {
    /// The control's interaction response.
    pub response: Response,
    /// The square reserved for the control's icon.
    pub icon: Rect,
    /// The colour the icon should take, matching the control's label.
    pub ink: Color32,
}

/// A sidebar destination. The caller paints the icon into [`Slot::icon`].
pub fn nav_item(ui: &mut Ui, theme: &Palette, label: &str, active: bool, compact: bool) -> Slot {
    let width = ui.available_width();
    let (rect, response) =
        ui.allocate_exact_size(Vec2::new(width, theme::CONTROL_HEIGHT), Sense::click());
    let response = if compact {
        response.on_hover_text(label)
    } else {
        response
    };
    let lift = hover_t(ui, response.id, response.hovered());
    let selected = fade(ui.ctx(), response.id.with("active"), active);

    let fill = theme
        .panel
        .lerp(theme.hover, lift * 0.8)
        .lerp(theme.selection, selected);
    let painter = ui.painter();
    painter.rect_filled(rect, CornerRadius::same(theme::RADIUS), theme::rgb(fill));
    if selected > 0.0 {
        let bar = Rect::from_min_size(
            rect.left_top() + Vec2::new(0.0, SPACE_SM),
            Vec2::new(theme::SELECTION_BAR, (rect.height() - SPACE_MD) * selected),
        );
        painter.rect_filled(bar, CornerRadius::same(2), theme::rgb(theme.accent));
    }
    let ink = blend(theme.text_muted, theme.text, lift.max(selected));
    let icon = Rect::from_center_size(
        rect.left_center() + Vec2::new(SPACE_MD + super::icon_size() / 2.0, 0.0),
        Vec2::splat(super::icon_size()),
    );
    if !compact {
        painter.text(
            icon.right_center() + Vec2::new(SPACE_MD, 0.0),
            Align2::LEFT_CENTER,
            label,
            theme::font(theme::BODY_SIZE),
            ink,
        );
    }
    focus_ring(ui, theme, &response);
    Slot {
        response,
        icon,
        ink,
    }
}

/// A square, borderless button for the header. The caller paints the icon
/// into [`Slot::icon`]; `label` is its tooltip and accessible name.
pub fn icon_button(ui: &mut Ui, theme: &Palette, label: &str) -> Slot {
    let size = Vec2::splat(theme::CONTROL_HEIGHT);
    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
    let response = response.on_hover_text(label);
    response.widget_info(|| egui::WidgetInfo::labeled(egui::Role::Button, true, label));
    let lift = hover_t(ui, response.id, response.hovered());
    ui.painter().rect_filled(
        rect,
        CornerRadius::same(theme::RADIUS),
        blend(theme.panel, theme.hover, lift),
    );
    focus_ring(ui, theme, &response);
    Slot {
        icon: rect.shrink(SPACE_SM),
        ink: blend(theme.text_muted, theme.text, lift),
        response,
    }
}

/// The emphasis a button carries.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Emphasis {
    /// The accent-filled action a view is for.
    Primary,
    /// Everything else: a quiet surface button.
    Secondary,
}

/// A text button.
pub fn button(ui: &mut Ui, theme: &Palette, label: &str, emphasis: Emphasis) -> Response {
    let galley = ui.painter().layout_no_wrap(
        label.to_owned(),
        theme::font(theme::BODY_SIZE),
        Color32::PLACEHOLDER,
    );
    let size = Vec2::new(galley.size().x + SPACE_MD * 2.0, theme::CONTROL_HEIGHT);
    let (rect, response) = ui.allocate_exact_size(size, Sense::click());
    response.widget_info(|| egui::WidgetInfo::labeled(egui::Role::Button, true, label));
    let lift = hover_t(ui, response.id, response.hovered());
    let (fill, text, stroke) = match emphasis {
        Emphasis::Primary => (
            blend(theme.accent, theme.accent_hover, lift),
            theme::rgb(theme.text_on_accent),
            Stroke::NONE,
        ),
        Emphasis::Secondary => (
            blend(theme.raised, theme.hover, lift),
            theme::rgb(theme.text),
            Stroke::new(1.0, theme::rgb(theme.border)),
        ),
    };
    let painter = ui.painter();
    painter.rect(
        rect,
        CornerRadius::same(theme::RADIUS),
        fill,
        stroke,
        egui::StrokeKind::Inside,
    );
    painter.galley(rect.center() - galley.size() / 2.0, galley, text);
    focus_ring(ui, theme, &response);
    response
}

/// An on/off switch with its label to the left. Returns the response; the
/// value is flipped in place when clicked.
pub fn switch(ui: &mut Ui, theme: &Palette, on: &mut bool, label: &str) -> Response {
    let track = Vec2::new(36.0, 20.0);
    let width = ui.available_width();
    let (rect, mut response) =
        ui.allocate_exact_size(Vec2::new(width, theme::CONTROL_HEIGHT), Sense::click());
    if response.clicked() {
        *on = !*on;
        response.mark_changed();
    }
    let value = *on;
    response.widget_info(|| egui::WidgetInfo::selected(egui::Role::Switch, true, value, label));
    let t = fade(ui.ctx(), response.id, value);
    let lift = hover_t(ui, response.id.with("hover"), response.hovered());
    let painter = ui.painter();
    painter.text(
        rect.left_center(),
        Align2::LEFT_CENTER,
        label,
        theme::font(theme::BODY_SIZE),
        theme::rgb(theme.text),
    );
    let track_rect =
        Rect::from_center_size(rect.right_center() - Vec2::new(track.x / 2.0, 0.0), track);
    let off = theme.control.lerp(theme.control_hover, lift);
    painter.rect_filled(
        track_rect,
        CornerRadius::same(10),
        blend(off, theme.accent, t),
    );
    let knob_x = egui::lerp((track_rect.left() + 10.0)..=(track_rect.right() - 10.0), t);
    painter.circle_filled(
        egui::pos2(knob_x, track_rect.center().y),
        7.0,
        blend(theme.text, theme.text_on_accent, t),
    );
    focus_ring(ui, theme, &response);
    response
}

/// A card: a raised surface that lifts under the pointer and carries an
/// accent edge when selected. Click anywhere on it to select it.
pub fn card(
    ui: &mut Ui,
    theme: &Palette,
    id: egui::Id,
    selected: bool,
    add_contents: impl FnOnce(&mut Ui),
) -> Response {
    let hovered_before = ui.ctx().read_response(id).is_some_and(|r| r.hovered());
    let lift = hover_t(ui, id.with("lift"), hovered_before);
    let chosen = fade(ui.ctx(), id.with("chosen"), selected);
    let border = theme
        .border
        .lerp(theme.border_strong, lift)
        .lerp(theme.accent, chosen);
    let inner = egui::Frame::new()
        .fill(blend(theme.raised, theme.hover, lift * 0.6))
        .stroke(Stroke::new(1.0 + chosen, theme::rgb(border)))
        .corner_radius(CornerRadius::same(theme::RADIUS_LG))
        .inner_margin(theme::margin(SPACE_MD + SPACE_XS))
        .show(ui, |ui| {
            ui.set_width(ui.available_width());
            add_contents(ui);
        });
    ui.interact(inner.response.rect, id, Sense::click())
}

/// Lays `count` cards out in as many equal columns of at least `minimum`
/// width as fit, wrapping onto new rows.
pub fn card_grid(ui: &mut Ui, minimum: f32, count: usize, mut card: impl FnMut(&mut Ui, usize)) {
    let (columns, width) = grid_layout(ui.available_width(), minimum, SPACE_MD, count);
    if columns == 0 {
        return;
    }
    let mut index = 0;
    while index < count {
        ui.horizontal_top(|ui| {
            ui.spacing_mut().item_spacing.x = SPACE_MD;
            for _ in 0..columns {
                if index >= count {
                    break;
                }
                let column = egui::Layout::top_down(egui::Align::Min);
                ui.allocate_ui_with_layout(Vec2::new(width, 0.0), column, |ui| {
                    ui.set_width(width);
                    card(ui, index);
                });
                index += 1;
            }
        });
        ui.add_space(SPACE_XS);
    }
}

/// How many columns of at least `minimum` fit in `available` with `gap`
/// between them, and how wide each one is. Zero columns when nothing fits
/// or there is nothing to lay out.
#[must_use]
pub fn grid_layout(available: f32, minimum: f32, gap: f32, count: usize) -> (usize, f32) {
    if count == 0 || !available.is_finite() || available <= 0.0 || minimum <= 0.0 {
        return (0, 0.0);
    }
    let fit = ((available + gap) / (minimum + gap)).floor().max(1.0) as usize;
    let columns = fit.min(count);
    let width = (available - gap * (columns as f32 - 1.0)) / columns as f32;
    (columns, width.max(0.0))
}

/// A horizontal meter, `fraction` full, that settles rather than jumps.
pub fn meter(ui: &mut Ui, theme: &Palette, id: egui::Id, fraction: f32, fill: Rgb) -> Response {
    let width = ui.available_width();
    let (rect, response) = ui.allocate_exact_size(Vec2::new(width, 6.0), Sense::hover());
    let shown = level(ui.ctx(), id, fraction.clamp(0.0, 1.0));
    let painter = ui.painter();
    painter.rect_filled(rect, CornerRadius::same(3), theme::rgb(theme.hover));
    let filled = Rect::from_min_size(rect.min, Vec2::new(rect.width() * shown, rect.height()));
    painter.rect_filled(filled, CornerRadius::same(3), theme::rgb(fill));
    response
}

/// A colour swatch with a hairline, so a swatch matching its surface still
/// shows where it is.
pub fn swatch(ui: &mut Ui, theme: &Palette, color: Rgb, size: Vec2) -> Response {
    let (rect, response) = ui.allocate_exact_size(size, Sense::hover());
    ui.painter().rect(
        rect,
        CornerRadius::same(theme::RADIUS),
        theme::rgb(color),
        Stroke::new(1.0, theme::rgb(theme.border)),
        egui::StrokeKind::Inside,
    );
    response
}

/// The first letter of `label` in a rounded square: the stand-in for an
/// icon in a build without the icon set.
pub fn monogram(painter: &egui::Painter, rect: Rect, label: &str, color: Color32) {
    let letter: String = label.chars().take(1).collect();
    painter.text(
        rect.center(),
        Align2::CENTER_CENTER,
        letter,
        theme::font(rect.height() * 0.8),
        color,
    );
}

/// A label in the theme's title size.
pub fn title(ui: &mut Ui, theme: &Palette, text: &str) -> Response {
    ui.label(
        egui::RichText::new(text)
            .font(theme::font(theme::TITLE_SIZE))
            .color(theme::rgb(theme.text))
            .strong(),
    )
}

/// Body text in the secondary colour, wrapping.
pub fn muted(ui: &mut Ui, theme: &Palette, text: &str) -> Response {
    ui.add(egui::Label::new(egui::RichText::new(text).color(theme::rgb(theme.text_muted))).wrap())
}

/// The keyboard focus ring, drawn only while the control has focus.
pub fn focus_ring(ui: &Ui, theme: &Palette, response: &Response) {
    if response.has_focus() {
        ui.painter().rect_stroke(
            response.rect.expand(2.0),
            CornerRadius::same(theme::RADIUS + 2),
            Stroke::new(2.0, theme::rgb(theme.accent)),
            egui::StrokeKind::Outside,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_grid_fits_as_many_columns_as_the_minimum_allows() {
        assert_eq!(grid_layout(1000.0, 240.0, 12.0, 6).0, 4);
        assert_eq!(
            grid_layout(1000.0, 240.0, 12.0, 2).0,
            2,
            "never more than cards"
        );
        assert_eq!(
            grid_layout(100.0, 240.0, 12.0, 6).0,
            1,
            "one column at worst"
        );
    }

    #[test]
    fn the_columns_and_gaps_fill_the_width_exactly() {
        let (columns, width) = grid_layout(1000.0, 240.0, 12.0, 6);
        let total = width * columns as f32 + 12.0 * (columns as f32 - 1.0);
        assert!((total - 1000.0).abs() < 0.01, "the grid covers {total}");
    }

    #[test]
    fn nothing_to_lay_out_is_zero_columns_not_a_division_by_zero() {
        assert_eq!(grid_layout(1000.0, 240.0, 12.0, 0), (0, 0.0));
        assert_eq!(grid_layout(f32::NAN, 240.0, 12.0, 3), (0, 0.0));
    }
}
