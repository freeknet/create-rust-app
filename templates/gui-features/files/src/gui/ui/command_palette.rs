// ============================================================================
// Module:       @@module@@
// Description:  The command palette: Ctrl+K, type to filter, arrows to move,
//               Enter to run, Escape to close.
//
// Dependencies: egui (Modal, TextEdit); crate::command_palette (matching),
//               super::{theme, widgets}, crate::gui::app
// ============================================================================

//! The command palette.
//!
//! Every [`Action`] the app has, reachable by typing. The list is built
//! fresh each time the palette is drawn from the app's own state, so a new
//! theme or page shows up here without anyone remembering to add it, and
//! running an entry pushes the same `Action` a button or shortcut would.

use super::theme::{SPACE_MD, SPACE_SM, SPACE_XS};
use super::widgets;
use crate::command_palette::Command;
use crate::gui::app::{Action, App, Page};
use egui::{Key, Ui};

/// The palette's width.
const WIDTH: f32 = 520.0;

/// How many matches are shown at once.
const VISIBLE: usize = 8;

/// The palette's state between frames.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct State {
    /// Whether it is showing.
    pub open: bool,
    /// What has been typed.
    pub query: String,
    /// The highlighted match, by position in the filtered list.
    pub selected: usize,
}

impl State {
    /// Opens the palette with an empty query.
    pub fn open(&mut self) {
        self.open = true;
        self.query.clear();
        self.selected = 0;
    }
}

/// Every command the palette offers, built from the app's current state.
#[must_use]
pub fn commands(app: &App) -> Vec<Command<Action>> {
    let mut commands: Vec<Command<Action>> = Page::ALL
        .into_iter()
        .zip(1..)
        .map(|(page, number)| {
            Command::new(
                format!("Go to {}", page.label()),
                format!("Ctrl+{number}"),
                Action::Go(page),
            )
        })
        .collect();
    commands.push(Command::new(
        "Open settings",
        "Ctrl+,",
        Action::OpenSettings,
    ));
    commands.push(Command::new(
        if app.sidebar_collapsed {
            "Expand sidebar"
        } else {
            "Collapse sidebar"
        },
        "Ctrl+B",
        Action::ToggleSidebar,
    ));
    // @if motion
    commands.push(Command::new(
        if app.reduce_motion {
            "Turn animations on"
        } else {
            "Reduce motion"
        },
        "Settings",
        Action::ToggleMotion,
    ));
    // @end
    // @if themes
    for theme in app.catalog.themes() {
        commands.push(Command::new(
            format!("Switch theme to {}", theme.name),
            "Theme",
            Action::SetTheme(theme.id.clone()),
        ));
    }
    // @end
    commands.push(Command::new("Quit", "", Action::Quit));
    commands
}

/// Draws the palette while it is open; Ctrl+K opens it from anywhere.
pub fn draw(app: &mut App, ctx: &egui::Context, actions: &mut Vec<Action>) {
    let toggle = ctx.input_mut(|input| input.consume_key(egui::Modifiers::COMMAND, Key::K));
    if toggle && !app.settings_open {
        if app.commands.open {
            app.commands.open = false;
        } else {
            app.commands.open();
        }
    }
    if !app.commands.open {
        return;
    }
    let all = commands(app);
    let matches = crate::command_palette::filter(&all, &app.commands.query);
    let (up, down, enter) = ctx.input_mut(|input| {
        (
            input.consume_key(egui::Modifiers::NONE, Key::ArrowUp),
            input.consume_key(egui::Modifiers::NONE, Key::ArrowDown),
            input.consume_key(egui::Modifiers::NONE, Key::Enter),
        )
    });
    let state = &mut app.commands;
    let last = matches.len().saturating_sub(1);
    if down {
        state.selected = (state.selected + 1).min(last);
    }
    if up {
        state.selected = state.selected.saturating_sub(1);
    }
    state.selected = state.selected.min(last);

    let theme = app.theme.clone();
    let id = egui::Id::unique("command-palette");
    let mut chosen = None;
    let area =
        egui::Modal::default_area(id).anchor(egui::Align2::CENTER_TOP, egui::vec2(0.0, 96.0));
    let response = egui::Modal::new(id)
        .area(area)
        .frame(egui::Frame::NONE)
        .backdrop_color(super::theme::translucent(theme.app, 140))
        .show(ctx, |ui| {
            egui::Frame::new()
                .fill(super::theme::rgb(theme.raised))
                .stroke(egui::Stroke::new(1.0, super::theme::rgb(theme.border)))
                .corner_radius(egui::CornerRadius::same(super::theme::RADIUS_LG))
                .inner_margin(super::theme::margin(SPACE_MD))
                .show(ui, |ui| {
                    ui.set_width(WIDTH);
                    let field = ui.add(
                        egui::TextEdit::singleline(&mut state.query)
                            .hint_text("Type a command")
                            .desired_width(f32::INFINITY)
                            .font(super::theme::font(super::theme::TITLE_SIZE)),
                    );
                    field.request_focus();
                    if field.changed() {
                        state.selected = 0;
                    }
                    ui.add_space(SPACE_SM);
                    if matches.is_empty() {
                        widgets::muted(ui, &theme, "No command matches.");
                    }
                    let first = state.selected.saturating_sub(VISIBLE - 1);
                    for (index, command) in matches.iter().enumerate().skip(first).take(VISIBLE) {
                        if row(ui, &theme, command, index == state.selected).clicked() {
                            chosen = Some(command.action.clone());
                        }
                    }
                });
        });
    if enter {
        chosen = chosen.or_else(|| {
            matches
                .get(state.selected)
                .map(|command| command.action.clone())
        });
    }
    if let Some(action) = chosen {
        state.open = false;
        actions.push(action);
    } else if response.should_close() {
        state.open = false;
    }
}

/// One match: its title, its hint, and a fill when highlighted.
fn row(
    ui: &mut Ui,
    theme: &crate::theme::Palette,
    command: &Command<Action>,
    selected: bool,
) -> egui::Response {
    let width = ui.available_width();
    let (rect, response) = ui.allocate_exact_size(
        egui::vec2(width, super::theme::CONTROL_HEIGHT),
        egui::Sense::click(),
    );
    let lift = widgets::hover_t(ui, response.id, response.hovered());
    let fill = theme
        .raised
        .lerp(theme.hover, lift)
        .lerp(theme.selection, if selected { 1.0 } else { 0.0 });
    let painter = ui.painter();
    painter.rect_filled(
        rect,
        egui::CornerRadius::same(super::theme::RADIUS),
        super::theme::rgb(fill),
    );
    let inset = egui::vec2(SPACE_SM + SPACE_XS, 0.0);
    painter.text(
        rect.left_center() + inset,
        egui::Align2::LEFT_CENTER,
        &command.title,
        super::theme::font(super::theme::BODY_SIZE),
        super::theme::rgb(theme.text),
    );
    painter.text(
        rect.right_center() - inset,
        egui::Align2::RIGHT_CENTER,
        &command.hint,
        super::theme::font(12.0),
        super::theme::rgb(theme.text_faint),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_page_is_reachable_from_the_palette() {
        let ctx = egui::Context::default();
        // @if config
        let app = App::new(&ctx, crate::config::Config::default());
        // @else
        let app = App::new(&ctx);
        // @end
        let all = commands(&app);
        for page in Page::ALL {
            assert!(
                all.iter().any(|command| command.action == Action::Go(page)),
                "{page:?} has no command"
            );
        }
    }
}
