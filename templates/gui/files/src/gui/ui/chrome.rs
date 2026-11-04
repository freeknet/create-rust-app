// ============================================================================
// Module:       @@module@@
// Description:  Everything around the page rather than in it: the header, the
//               sidebar and the status bar.
//
// Dependencies: egui (Panel); super::{theme, widgets}, crate::gui::app
// ============================================================================

//! The window's frame.
//!
//! The window keeps the platform's own title bar, so dragging, snapping and
//! the caption buttons behave exactly as the user expects on every runtime.
//! The header below it carries the mark, the name and the app-wide
//! controls; the sidebar carries navigation and collapses to icons; the
//! status bar says what is in force.
//!
//! Every panel turns its separator line off: each one is padded, so the
//! default line lands as a pale hairline floating in the gap, which reads
//! as a resize handle on a panel that cannot be resized.

use super::theme::{self, SPACE_LG, SPACE_MD, SPACE_SM};
use super::{paint_glyph, widgets};
use crate::gui::app::{Action, App, Page};
use egui::{Align, Layout, Ui};

/// Draws the header: the mark and name on the left, app-wide controls on
/// the right.
pub fn header(app: &App, ui: &mut Ui, actions: &mut Vec<Action>) {
    let theme = &app.theme;
    egui::Panel::top("header")
        .exact_size(theme::HEADER_HEIGHT)
        .resizable(false)
        .show_separator_line(false)
        .frame(
            egui::Frame::new()
                .fill(theme::rgb(theme.app))
                .inner_margin(theme::margin_xy(SPACE_LG, 0.0)),
        )
        .show(ui, |ui| {
            ui.horizontal_centered(|ui| {
                // @if brand
                crate::gui::icons::paint_brand(ui, 26.0);
                ui.add_space(SPACE_SM);
                // @end
                ui.label(
                    egui::RichText::new(crate::NAME)
                        .font(theme::font(theme::TITLE_SIZE))
                        .color(theme::rgb(theme.text))
                        .strong(),
                );
                ui.label(
                    egui::RichText::new(crate::TAGLINE)
                        .color(theme::rgb(theme.text_faint))
                        .small(),
                );
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let settings = widgets::icon_button(ui, theme, "Settings (Ctrl+,)");
                    paint_glyph(ui, &settings, super::glyph::SETTINGS);
                    if settings.response.clicked() {
                        actions.push(Action::OpenSettings);
                    }
                    // @if commandPalette
                    let commands = widgets::icon_button(ui, theme, "Commands (Ctrl+K)");
                    paint_glyph(ui, &commands, super::glyph::COMMAND);
                    if commands.response.clicked() {
                        actions.push(Action::OpenCommands);
                    }
                    // @end
                });
            });
        });
}

/// Draws the status bar.
pub fn status_bar(app: &App, ui: &mut Ui) {
    let theme = &app.theme;
    egui::Panel::bottom("status")
        .exact_size(theme::STATUS_HEIGHT)
        .resizable(false)
        .show_separator_line(false)
        .frame(
            egui::Frame::new()
                .fill(theme::rgb(theme.app))
                .inner_margin(theme::margin_xy(SPACE_LG, 0.0)),
        )
        .show(ui, |ui| {
            ui.horizontal_centered(|ui| {
                let (dot, _) = ui.allocate_exact_size(egui::vec2(8.0, 8.0), egui::Sense::hover());
                ui.painter()
                    .circle_filled(dot.center(), 3.5, theme::rgb(theme.success));
                ui.label(
                    egui::RichText::new("Ready")
                        .small()
                        .color(theme::rgb(theme.text_muted)),
                );
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.label(
                        egui::RichText::new(format!(
                            "{} · v{}",
                            theme.name,
                            env!("CARGO_PKG_VERSION")
                        ))
                        .small()
                        .color(theme::rgb(theme.text_faint)),
                    );
                });
            });
        });
}

/// Draws the sidebar: the collapse toggle, the pages, and settings at the
/// foot. Its width settles between the two sizes rather than snapping.
pub fn sidebar(app: &App, ui: &mut Ui, actions: &mut Vec<Action>) {
    let theme = &app.theme;
    let target = if app.sidebar_collapsed {
        theme::SIDEBAR_MINI_WIDTH
    } else {
        theme::SIDEBAR_WIDTH
    };
    let width = widgets::level(ui.ctx(), egui::Id::unique("sidebar-width"), target);
    // Labels go before the width reaches the icon-only size, so none is ever
    // drawn clipped mid-word.
    let compact = width < theme::SIDEBAR_WIDTH * 0.8;
    egui::Panel::left("sidebar")
        .exact_size(width)
        .resizable(false)
        .show_separator_line(false)
        .frame(
            egui::Frame::new()
                .fill(theme::rgb(theme.panel))
                .inner_margin(theme::margin(SPACE_MD)),
        )
        .show(ui, |ui| {
            ui.spacing_mut().item_spacing.y = SPACE_SM / 2.0;
            let toggle = widgets::nav_item(ui, theme, "Collapse sidebar", false, compact);
            paint_glyph(ui, &toggle, super::glyph::MENU);
            if toggle.response.clicked() {
                actions.push(Action::ToggleSidebar);
            }
            ui.add_space(SPACE_MD);
            for page in Page::ALL {
                let item = widgets::nav_item(ui, theme, page.label(), app.page == page, compact);
                paint_glyph(ui, &item, page.glyph());
                if item.response.clicked() {
                    actions.push(Action::Go(page));
                }
            }
            ui.with_layout(Layout::bottom_up(Align::Min), |ui| {
                let settings = widgets::nav_item(ui, theme, "Settings", app.settings_open, compact);
                paint_glyph(ui, &settings, super::glyph::SETTINGS);
                if settings.response.clicked() {
                    actions.push(Action::OpenSettings);
                }
            });
        });
}
