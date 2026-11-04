// ============================================================================
// Module:       @@module@@
// Description:  The settings card: the theme picker and the switches, drawn in
//               the shared modal.
//
// Dependencies: egui; super::{modal, theme, widgets}, crate::gui::app
// ============================================================================

//! Settings.
//!
//! Every control here emits an [`Action`] rather than writing to the app,
//! so a setting changed here and the same setting changed from a shortcut
//! or the command palette are one code path — and, with the config on, one
//! saved preference.

use super::theme::{SPACE_LG, SPACE_SM};
use super::{modal, widgets};
use crate::gui::app::{Action, App};
use egui::Ui;

/// The settings card's width.
const WIDTH: f32 = 560.0;

/// Draws the settings card while it is open (and while it fades out).
pub fn draw(app: &App, ctx: &egui::Context, actions: &mut Vec<Action>) {
    let theme = app.theme.clone();
    let outcome = modal::show(ctx, &theme, "Settings", app.settings_open, WIDTH, |ui| {
        // @if themes
        appearance(app, ui, actions);
        ui.add_space(SPACE_LG);
        // @end
        behaviour(app, ui, actions);
        ui.add_space(SPACE_LG);
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            widgets::button(ui, &app.theme, "Done", widgets::Emphasis::Primary).clicked()
        })
        .inner
    });
    if outcome.dismissed || outcome.inner == Some(true) {
        actions.push(Action::CloseSettings);
    }
}
// @if themes

/// The width of one theme card in the picker.
const THEME_CARD: egui::Vec2 = egui::vec2(124.0, 78.0);

/// The theme picker: one miniature of each theme, drawn in its own colours.
fn appearance(app: &App, ui: &mut Ui, actions: &mut Vec<Action>) {
    widgets::title(ui, &app.theme, "Theme");
    ui.add_space(SPACE_SM);
    ui.horizontal_wrapped(|ui| {
        ui.spacing_mut().item_spacing = egui::vec2(SPACE_SM, SPACE_SM);
        for candidate in app.catalog.themes() {
            let selected = candidate.id == app.theme.id;
            if theme_card(ui, &app.theme, candidate, selected).clicked() && !selected {
                actions.push(Action::SetTheme(candidate.id.clone()));
            }
        }
    });
    for (source, reason) in app.catalog.problems() {
        ui.label(
            egui::RichText::new(format!("{source}: {reason}"))
                .small()
                .color(super::theme::rgb(app.theme.warning)),
        );
    }
    if let Some(dir) = crate::theme::user_theme_dir() {
        widgets::muted(
            ui,
            &app.theme,
            &format!("Add your own: drop a .toml theme into {}", dir.display()),
        );
    }
}

/// One theme in the picker: a miniature window in the candidate's colours,
/// framed in the active theme's, with an accent ring when it is in force.
fn theme_card(
    ui: &mut Ui,
    active: &crate::theme::Palette,
    candidate: &crate::theme::Palette,
    selected: bool,
) -> egui::Response {
    let (rect, response) = ui.allocate_exact_size(THEME_CARD, egui::Sense::click());
    let response = response.on_hover_text(&candidate.name);
    let lift = widgets::hover_t(ui, response.id, response.hovered());
    let ring = widgets::fade(ui.ctx(), response.id.with("selected"), selected);
    let painter = ui.painter();
    let radius = egui::CornerRadius::same(super::theme::RADIUS_LG);
    painter.rect_filled(rect, radius, super::theme::rgb(candidate.app));
    // A sidebar, a card, and the accent: enough to recognise a theme by.
    let sidebar = egui::Rect::from_min_size(rect.min, egui::vec2(28.0, rect.height()));
    painter.rect_filled(
        sidebar,
        egui::CornerRadius {
            nw: super::theme::RADIUS_LG,
            sw: super::theme::RADIUS_LG,
            ne: 0,
            se: 0,
        },
        super::theme::rgb(candidate.panel),
    );
    let card = egui::Rect::from_min_size(rect.min + egui::vec2(36.0, 10.0), egui::vec2(78.0, 30.0));
    painter.rect_filled(
        card,
        egui::CornerRadius::same(4),
        super::theme::rgb(candidate.raised),
    );
    painter.circle_filled(
        card.left_center() + egui::vec2(10.0, 0.0),
        5.0,
        super::theme::rgb(candidate.accent),
    );
    painter.text(
        rect.left_bottom() + egui::vec2(36.0, -10.0),
        egui::Align2::LEFT_BOTTOM,
        &candidate.name,
        super::theme::font(12.0),
        super::theme::rgb(candidate.text),
    );
    let stroke = active
        .border
        .lerp(active.border_strong, lift)
        .lerp(active.accent, ring);
    painter.rect_stroke(
        rect,
        radius,
        egui::Stroke::new(1.0 + ring, super::theme::rgb(stroke)),
        egui::StrokeKind::Outside,
    );
    widgets::focus_ring(ui, active, &response);
    response
}
// @end

/// The switches.
fn behaviour(app: &App, ui: &mut Ui, actions: &mut Vec<Action>) {
    widgets::title(ui, &app.theme, "Behaviour");
    ui.add_space(SPACE_SM);
    let mut collapsed = app.sidebar_collapsed;
    if widgets::switch(ui, &app.theme, &mut collapsed, "Icon-only sidebar").changed() {
        actions.push(Action::ToggleSidebar);
    }
    // @if motion
    let mut reduce = app.reduce_motion;
    if widgets::switch(ui, &app.theme, &mut reduce, "Reduce motion").changed() {
        actions.push(Action::ToggleMotion);
    }
    // @end
    // @if config
    ui.add_space(super::theme::SPACE_MD);
    if let Some(path) = crate::config::config_path() {
        widgets::muted(
            ui,
            &app.theme,
            &format!("Preferences are saved on exit to {}", path.display()),
        );
    }
    // @end
}
