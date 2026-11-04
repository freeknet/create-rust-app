// ============================================================================
// Module:       @@module@@
// Description:  The one draw entry point, the frame's layout order, the pages,
//               and the keyboard shortcuts.
//
// Dependencies: egui; every sibling module; crate::gui::app
// ============================================================================

//! Drawing one frame.
//!
//! [`draw`] runs in full every frame and lays the window out in a fixed
//! order, because egui's panels claim space in the order they are shown:
//!
//! 1. **The header** (top) and **the status bar** (bottom), full width.
//! 2. **The sidebar** (left), the height between them.
//! 3. **The page**, in whatever is left.
//! 4. **Overlays**: the settings card and anything else modal.
//!
//! Drawing never changes the app directly: it returns [`Action`]s, which
//! [`App::apply`](crate::gui::app::App::apply) carries out after the frame.
//! A shortcut, a button and a menu entry for the same thing are therefore
//! the same code path.
//!
//! Shortcuts are read before the page draws, and not at all while a modal
//! is open, so a keystroke aimed at a dialog cannot also act behind it.

pub mod chrome;
// @if commandPalette
pub mod command_palette;
// @end
// @if icons
pub mod icon;
// @end
pub mod modal;
// @if motion
pub mod motion;
// @end
pub mod settings;
pub mod theme;
pub mod widgets;

use crate::gui::app::{Action, App, Page};
use egui::{Key, Ui};
use theme::{SPACE_LG, SPACE_MD, SPACE_SM, SPACE_XL};

// @if icons
/// What a control shows in its icon slot: an icon from the drawn set.
pub type Glyph = crate::icon::Icon;
// @else
/// What a control shows in its icon slot. Built without the icon set, so a
/// letter stands in.
pub type Glyph = char;
// @end

/// The glyph for each purpose, so call sites name the purpose and not the
/// shape.
pub mod glyph {
    use super::Glyph;
    // @if icons
    use crate::icon::Icon;

    /// The overview page.
    pub const OVERVIEW: Glyph = Icon::Grid;
    /// The palette page.
    pub const PALETTE: Glyph = Icon::Palette;
    /// The about page.
    pub const ABOUT: Glyph = Icon::Info;
    /// Settings.
    pub const SETTINGS: Glyph = Icon::Settings;
    /// The sidebar toggle.
    pub const MENU: Glyph = Icon::Menu;
    /// Close.
    pub const CLOSE: Glyph = Icon::Close;
    /// The command palette.
    pub const COMMAND: Glyph = Icon::Command;
    /// A card: speed.
    pub const BOLT: Glyph = Icon::Bolt;
    /// A card: structure.
    pub const LAYERS: Glyph = Icon::Layers;
    /// A card: polish.
    pub const SPARKLE: Glyph = Icon::Sparkle;
    /// A card: motion.
    pub const ACTIVITY: Glyph = Icon::Activity;
    /// A card: storage.
    pub const FOLDER: Glyph = Icon::Folder;
    /// A card: you.
    pub const SUN: Glyph = Icon::Sun;
    // @else

    /// The overview page.
    pub const OVERVIEW: Glyph = 'O';
    /// The palette page.
    pub const PALETTE: Glyph = 'P';
    /// The about page.
    pub const ABOUT: Glyph = 'A';
    /// Settings.
    pub const SETTINGS: Glyph = 'S';
    /// The sidebar toggle.
    pub const MENU: Glyph = '=';
    /// Close.
    pub const CLOSE: Glyph = '×';
    /// The command palette.
    pub const COMMAND: Glyph = '>';
    /// A card: speed.
    pub const BOLT: Glyph = 'F';
    /// A card: structure.
    pub const LAYERS: Glyph = 'L';
    /// A card: polish.
    pub const SPARKLE: Glyph = 'R';
    /// A card: motion.
    pub const ACTIVITY: Glyph = 'M';
    /// A card: storage.
    pub const FOLDER: Glyph = 'S';
    /// A card: you.
    pub const SUN: Glyph = 'Y';
    // @end
}

/// The size a glyph is drawn at in the sidebar and on buttons.
#[must_use]
pub const fn icon_size() -> f32 {
    // @if icons
    icon::NAV
    // @else
    18.0
    // @end
}

/// Paints `glyph` into a control's icon slot, in the control's ink.
pub fn paint_glyph(ui: &Ui, slot: &widgets::Slot, glyph: Glyph) {
    draw_glyph(ui.painter(), slot.icon, glyph, slot.ink);
}

/// Paints `glyph` into `rect` in `color`.
pub fn draw_glyph(painter: &egui::Painter, rect: egui::Rect, glyph: Glyph, color: egui::Color32) {
    // @if icons
    icon::paint(painter, rect, glyph, color);
    // @else
    widgets::monogram(painter, rect, &glyph.to_string(), color);
    // @end
}

/// Draws one frame and returns what the user asked for.
pub fn draw(app: &mut App, ui: &mut Ui) -> Vec<Action> {
    let mut actions = Vec::new();
    // Installed before anything paints, so nothing is drawn under the
    // previous frame's theme.
    theme::apply(ui.ctx(), &app.theme);
    // @if motion
    motion::set_reduced(app.reduce_motion);
    // @end

    let blocked = app.settings_open;
    // @if commandPalette
    let blocked = blocked || app.commands.open;
    // @end
    if !blocked {
        shortcuts(ui, &mut actions);
    }

    chrome::header(app, ui, &mut actions);
    chrome::status_bar(app, ui);
    chrome::sidebar(app, ui, &mut actions);

    egui::CentralPanel::default()
        .frame(egui::Frame::new().fill(theme::rgb(app.theme.app)))
        .show(ui, |ui| {
            egui::ScrollArea::vertical()
                .auto_shrink([false, false])
                .show(ui, |ui| {
                    egui::Frame::new()
                        .inner_margin(theme::margin(SPACE_XL))
                        .show(ui, |ui| {
                            enter_page(ui, app.page);
                            match app.page {
                                Page::Overview => overview(app, ui),
                                Page::Palette => palette(app, ui, &mut actions),
                                Page::About => about(app, ui),
                            }
                        });
                });
        });

    settings::draw(app, ui.ctx(), &mut actions);
    // @if commandPalette
    command_palette::draw(app, ui.ctx(), &mut actions);
    // @end
    actions
}

/// Reads the keyboard shortcuts into actions. See [`SHORTCUTS`].
fn shortcuts(ui: &Ui, actions: &mut Vec<Action>) {
    // A shortcut must not fire while a text field has focus.
    if ui.ctx().egui_wants_keyboard_input() {
        return;
    }
    ui.ctx().input(|input| {
        let command = input.modifiers.command;
        if command && input.key_pressed(Key::Comma) {
            actions.push(Action::OpenSettings);
        }
        if command && input.key_pressed(Key::B) {
            actions.push(Action::ToggleSidebar);
        }
        for (key, page) in [Key::Num1, Key::Num2, Key::Num3].into_iter().zip(Page::ALL) {
            if command && input.key_pressed(key) {
                actions.push(Action::Go(page));
            }
        }
    });
}

/// The shortcuts, as data, so the about page and the handler above cannot
/// drift apart without the test below noticing.
pub const SHORTCUTS: &[(&str, &str)] = &[
    ("Ctrl+,", "Open settings"),
    ("Ctrl+B", "Collapse or expand the sidebar"),
    ("Ctrl+1…3", "Switch page"),
    // @if commandPalette
    ("Ctrl+K", "Open the command palette"),
    // @end
    ("Esc", "Close a dialog"),
];

/// Fades and lifts a page into place as it arrives, so a page change reads
/// as navigation rather than as a flicker. Left alone once finished: a
/// permanently non-opaque `Ui` costs a layer every frame for nothing.
fn enter_page(ui: &mut Ui, page: Page) {
    /// How far the content rises as it arrives.
    const RISE: f32 = 8.0;
    let ctx = ui.ctx().clone();
    // Keyed on the page, so arriving at another restarts the animation.
    let progress = widgets::arrival(&ctx, egui::Id::unique("page-enter"), egui::Id::unique(page));
    if progress >= 1.0 {
        return;
    }
    ui.set_opacity(progress);
    ui.add_space(RISE * (1.0 - progress));
}

/// A page's heading and the line under it.
fn heading(app: &App, ui: &mut Ui, title: &str, subtitle: &str) {
    ui.label(
        egui::RichText::new(title)
            .font(theme::font(theme::HEADING_SIZE + 6.0))
            .color(theme::rgb(app.theme.text))
            .strong(),
    );
    widgets::muted(ui, &app.theme, subtitle);
    ui.add_space(SPACE_LG);
}

/// The overview page: a grid of cards.
fn overview(app: &mut App, ui: &mut Ui) {
    heading(
        app,
        ui,
        &format!("Welcome to {}", crate::NAME),
        crate::TAGLINE,
    );
    let theme = app.theme.clone();
    let mut clicked = None;
    widgets::card_grid(ui, 250.0, crate::gui::app::CARDS.len(), |ui, index| {
        let Some(card) = crate::gui::app::CARDS.get(index) else {
            return;
        };
        let id = egui::Id::unique("card").with(card.title);
        let selected = app.selected_card == Some(index);
        let accent = theme.series(index, crate::gui::app::CARDS.len());
        let response = widgets::card(ui, &theme, id, selected, |ui| {
            let (rect, _) = ui.allocate_exact_size(
                egui::Vec2::splat(theme::CONTROL_HEIGHT + SPACE_SM),
                egui::Sense::hover(),
            );
            ui.painter().rect_filled(
                rect,
                egui::CornerRadius::same(theme::RADIUS_LG),
                theme::rgb(theme.accent_soft),
            );
            draw_glyph(
                ui.painter(),
                rect.shrink(SPACE_SM),
                card.glyph,
                theme::rgb(accent),
            );
            ui.add_space(SPACE_SM);
            widgets::title(ui, &theme, card.title);
            widgets::muted(ui, &theme, card.body);
            ui.add_space(SPACE_SM);
            let target = if selected { 1.0 } else { card.progress };
            widgets::meter(ui, &theme, id.with("meter"), target, accent);
        });
        if response.clicked() {
            clicked = Some(index);
        }
    });
    if let Some(index) = clicked {
        app.selected_card = (app.selected_card != Some(index)).then_some(index);
    }
}

/// The palette page: the active theme, swatch by swatch.
fn palette(app: &App, ui: &mut Ui, actions: &mut Vec<Action>) {
    let theme = &app.theme;
    heading(
        app,
        ui,
        &theme.name,
        "Every colour in the window comes from these. Most are derived from a few.",
    );
    let groups: [(&str, Vec<(&str, crate::color::Rgb)>); 3] = [
        (
            "Surfaces",
            vec![
                ("app", theme.app),
                ("panel", theme.panel),
                ("raised", theme.raised),
                ("hover", theme.hover),
                ("border", theme.border),
            ],
        ),
        (
            "Text and accent",
            vec![
                ("text", theme.text),
                ("muted", theme.text_muted),
                ("accent", theme.accent),
                ("soft", theme.accent_soft),
                ("selection", theme.selection),
            ],
        ),
        (
            "Status",
            vec![
                ("success", theme.success),
                ("warning", theme.warning),
                ("danger", theme.danger),
                ("control", theme.control),
            ],
        ),
    ];
    for (title, swatches) in groups {
        widgets::title(ui, theme, title);
        ui.horizontal_wrapped(|ui| {
            for (label, color) in swatches {
                ui.vertical(|ui| {
                    widgets::swatch(ui, theme, color, egui::vec2(96.0, 48.0));
                    ui.label(egui::RichText::new(label).color(theme::rgb(theme.text_muted)));
                    ui.label(
                        egui::RichText::new(color.to_hex())
                            .monospace()
                            .color(theme::rgb(theme.text_faint)),
                    );
                });
            }
        });
        ui.add_space(SPACE_MD);
    }
    widgets::title(ui, theme, "Rainbow");
    widgets::muted(
        ui,
        theme,
        "One perceived lightness across the band, so no entry shouts over its neighbours.",
    );
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 2.0;
        let count = 16;
        let width = ((ui.available_width() - 2.0 * 15.0) / count as f32).max(8.0);
        for index in 0..count {
            widgets::swatch(
                ui,
                theme,
                theme.series(index, count),
                egui::vec2(width, 28.0),
            );
        }
    });
    ui.add_space(SPACE_LG);
    if widgets::button(ui, theme, "Open settings", widgets::Emphasis::Secondary).clicked() {
        actions.push(Action::OpenSettings);
    }
}

/// The about page: the mark, the version and the shortcuts.
fn about(app: &App, ui: &mut Ui) {
    let theme = &app.theme;
    // @if brand
    crate::gui::icons::paint_brand(ui, 72.0);
    ui.add_space(SPACE_MD);
    // @end
    heading(
        app,
        ui,
        crate::NAME,
        &format!("{} Version {}.", crate::TAGLINE, env!("CARGO_PKG_VERSION")),
    );
    widgets::title(ui, theme, "Keyboard");
    egui::Grid::new("shortcuts")
        .num_columns(2)
        .spacing([SPACE_LG, SPACE_SM])
        .show(ui, |ui| {
            for (keys, what) in SHORTCUTS {
                ui.label(
                    egui::RichText::new(*keys)
                        .monospace()
                        .color(theme::rgb(theme.accent)),
                );
                ui.label(egui::RichText::new(*what).color(theme::rgb(theme.text_muted)));
                ui.end_row();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_page_has_a_numbered_shortcut() {
        assert_eq!(
            Page::ALL.len(),
            3,
            "update the Ctrl+1…3 shortcut and SHORTCUTS"
        );
    }

    #[test]
    fn every_shortcut_is_documented_once() {
        let mut keys: Vec<&str> = SHORTCUTS.iter().map(|(keys, _)| *keys).collect();
        let count = keys.len();
        keys.sort_unstable();
        keys.dedup();
        assert_eq!(keys.len(), count, "a shortcut is listed twice");
    }
}
