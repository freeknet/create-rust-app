// ============================================================================
// Module:       @@module@@
// Description:  The application state: which page is open, what is selected,
//               the active theme, and the actions that change them.
//
// Dependencies: egui (the Context the runtime hands over); crate::theme,
//               crate::gui::ui (drawing)
// ============================================================================

//! The application.
//!
//! [`App`] is driven by whichever runtime owns the window (`gui::run`). It
//! uses **egui only** — never eframe or winit types — so the runtime can be
//! swapped without the app noticing. A runtime does three things with it:
//!
//! 1. builds it once with [`App::new`];
//! 2. each frame, either calls [`App::ui`] with the `Context` from inside
//!    `Context::run_pass`, or [`App::show`] with the root `Ui` it was given;
//! 3. on a normal quit, calls [`App::on_exit`].
//!
//! Every change of state a user can cause goes through [`Action`] and
//! [`App::apply`], so a shortcut, a button, the tray menu and the command
//! palette cannot drift apart in what "open settings" means.

use crate::gui::ui::{self, glyph};
use crate::theme::Palette;

/// A page of the app, in sidebar order.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub enum Page {
    /// The landing page: a grid of cards.
    #[default]
    Overview,
    /// The active palette, swatch by swatch.
    Palette,
    /// The mark, the version and the shortcuts.
    About,
}

impl Page {
    /// Every page, in sidebar order.
    pub const ALL: [Self; 3] = [Self::Overview, Self::Palette, Self::About];

    /// The name the page is shown under.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Overview => "Overview",
            Self::Palette => "Palette",
            Self::About => "About",
        }
    }

    /// The stable name the config persists. Never rename one.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Self::Overview => "overview",
            Self::Palette => "palette",
            Self::About => "about",
        }
    }

    /// The page with this stable name.
    #[must_use]
    pub fn from_key(key: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|page| page.key() == key)
    }

    /// The glyph the sidebar shows beside the label.
    #[must_use]
    pub fn glyph(self) -> ui::Glyph {
        match self {
            Self::Overview => glyph::OVERVIEW,
            Self::Palette => glyph::PALETTE,
            Self::About => glyph::ABOUT,
        }
    }
}

/// Everything a user can do, from any input.
#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    /// Open a page.
    Go(Page),
    // @if commandPalette
    /// Open the command palette.
    OpenCommands,
    // @end
    /// Open the settings card.
    OpenSettings,
    /// Close the settings card.
    CloseSettings,
    /// Collapse or expand the sidebar.
    ToggleSidebar,
    // @if themes
    /// Switch to the theme with this id.
    SetTheme(String),
    // @end
    // @if motion
    /// Switch animation off or back on.
    ToggleMotion,
    // @end
    /// Bring the window to the front.
    Focus,
    /// Close the window and quit.
    Quit,
}

/// One card on the overview page.
#[derive(Clone, Copy, Debug)]
pub struct Card {
    /// Its heading.
    pub title: &'static str,
    /// A sentence or two under it.
    pub body: &'static str,
    /// The glyph at its top left.
    pub glyph: ui::Glyph,
    /// How full its meter is, 0..=1.
    pub progress: f32,
}

/// The overview page's cards. Replace these with your own views; the shell
/// around them stays.
pub const CARDS: &[Card] = &[
    Card {
        title: "Fast by default",
        body: "Release builds use fat LTO; `release-fast` rebuilds in seconds.",
        glyph: glyph::BOLT,
        progress: 0.92,
    },
    Card {
        title: "Layered",
        body: "A portable core whose tests run anywhere, with the GUI on top.",
        glyph: glyph::LAYERS,
        progress: 0.78,
    },
    Card {
        title: "Readable",
        body: "Every colour comes from a palette that passes WCAG contrast tests.",
        glyph: glyph::SPARKLE,
        progress: 0.85,
    },
    // @if motion
    Card {
        title: "Animated",
        body: "Hovers fade, values settle and pages rise, through one motion module.",
        glyph: glyph::ACTIVITY,
        progress: 0.66,
    },
    // @end
    // @if config
    Card {
        title: "Remembers",
        body: "Preferences are written atomically and read back one field at a time.",
        glyph: glyph::FOLDER,
        progress: 0.58,
    },
    // @end
    Card {
        title: "Yours",
        body: "Swap these cards for your own views. Select one to see it respond.",
        glyph: glyph::SUN,
        progress: 0.40,
    },
];

/// The application state.
pub struct App {
    /// The page on screen.
    pub page: Page,
    /// Whether the sidebar shows icons only.
    pub sidebar_collapsed: bool,
    /// Whether the settings card is open.
    pub settings_open: bool,
    /// The selected overview card, by index into [`CARDS`].
    pub selected_card: Option<usize>,
    /// The palette everything is drawn in.
    pub theme: Palette,
    // @if themes
    /// Every theme the picker offers.
    pub catalog: crate::theme::Catalog,
    // @end
    // @if motion
    /// Whether animation is switched off.
    pub reduce_motion: bool,
    // @end
    // @if config
    /// The preferences, kept current so [`App::on_exit`] can save them.
    pub config: crate::config::Config,
    // @end
    // @if commandPalette
    /// The command palette's state.
    pub commands: ui::command_palette::State,
    // @end
    // @if tray
    /// The notification-area icon, kept alive with the app.
    _tray: Option<crate::tray::Tray>,
    // @end
}

impl App {
    /// Builds the app, before the first frame.
    // @if config
    #[must_use]
    pub fn new(ctx: &egui::Context, config: crate::config::Config) -> Self {
        if let Some(family) = config.font.as_deref() {
            // A missing family is not an error: the bundled faces stay.
            let _ = crate::gui::font::install(ctx, family);
        }
        // @if themes
        let catalog = crate::theme::Catalog::load();
        let theme = catalog.get(config.theme.as_deref());
        // @else
        let theme = crate::theme::signature();
        // @end
        Self {
            page: config
                .page
                .as_deref()
                .and_then(Page::from_key)
                .unwrap_or_default(),
            sidebar_collapsed: config.sidebar_collapsed.unwrap_or(false),
            settings_open: false,
            selected_card: None,
            theme,
            // @if themes
            catalog,
            // @end
            // @if motion
            reduce_motion: config.reduce_motion.unwrap_or(false),
            // @end
            config,
            // @if commandPalette
            commands: ui::command_palette::State::default(),
            // @end
            // @if tray
            _tray: crate::tray::Tray::new(ctx),
            // @end
        }
    }
    // @else
    #[must_use]
    pub fn new(ctx: &egui::Context) -> Self {
        // @if !tray
        let _ = ctx;
        // @end
        // @if themes
        let catalog = crate::theme::Catalog::load();
        let theme = catalog.get(None);
        // @else
        let theme = crate::theme::signature();
        // @end
        Self {
            page: Page::default(),
            sidebar_collapsed: false,
            settings_open: false,
            selected_card: None,
            theme,
            // @if themes
            catalog,
            // @end
            // @if motion
            reduce_motion: false,
            // @end
            // @if commandPalette
            commands: ui::command_palette::State::default(),
            // @end
            // @if tray
            _tray: crate::tray::Tray::new(ctx),
            // @end
        }
    }
    // @end

    /// Draws one frame, given the `Context` inside `Context::run_pass`.
    ///
    /// Takes the pass's root `Ui` through `Context::root_ui`, so it must not
    /// be called from inside `Context::run_ui` or another `root_ui` call —
    /// a runtime that already holds the root `Ui` calls [`App::show`].
    pub fn ui(&mut self, ctx: &egui::Context) {
        ctx.root_ui(|ui| self.show(ui));
    }

    /// Draws one frame into the root `Ui`.
    pub fn show(&mut self, ui: &mut egui::Ui) {
        // @if config
        self.remember_window_size(ui.ctx());
        // @end
        let actions = ui::draw(self, ui);
        for action in actions {
            self.apply(ui.ctx(), action);
        }
    }

    /// Carries out one action.
    pub fn apply(&mut self, ctx: &egui::Context, action: Action) {
        match action {
            Action::Go(page) => self.page = page,
            Action::OpenSettings => self.settings_open = true,
            Action::CloseSettings => self.settings_open = false,
            // @if commandPalette
            Action::OpenCommands => self.commands.open(),
            // @end
            Action::ToggleSidebar => self.sidebar_collapsed = !self.sidebar_collapsed,
            // @if themes
            Action::SetTheme(id) => self.theme = self.catalog.get(Some(&id)),
            // @end
            // @if motion
            Action::ToggleMotion => self.reduce_motion = !self.reduce_motion,
            // @end
            Action::Focus => {
                ctx.send_viewport_cmd(egui::ViewportCommand::Visible(true));
                ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(false));
                ctx.send_viewport_cmd(egui::ViewportCommand::Focus);
            }
            Action::Quit => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
        }
        // @if config
        self.remember_choices();
        // @end
    }

    /// The colour the runtime clears the window to before egui paints: the
    /// theme's own background, so a resize never flashes white.
    #[must_use]
    pub fn clear_color(&self) -> [f32; 4] {
        egui::Rgba::from(ui::theme::rgb(self.theme.app)).to_array()
    }

    /// Called by the runtime on a normal quit.
    pub fn on_exit(&mut self) {
        // @if config
        // The window is already closing, so a failed save has nowhere to
        // be shown; the next start simply uses the previous preferences.
        let _ = crate::config::save(&self.config);
        // @else
        // Nothing is persisted in this build: there is no config module.
        // @end
    }
    // @if config

    /// Copies what the user has chosen into the config, so it is saved.
    fn remember_choices(&mut self) {
        self.config.page = Some(self.page.key().to_string());
        self.config.sidebar_collapsed = Some(self.sidebar_collapsed);
        // @if themes
        self.config.theme = Some(self.theme.id.clone());
        // @end
        // @if motion
        self.config.reduce_motion = Some(self.reduce_motion);
        // @end
    }

    /// Keeps the restored window size in the config, so the next start
    /// opens the window the size it was left.
    fn remember_window_size(&mut self, ctx: &egui::Context) {
        let (rect, maximized) =
            ctx.input(|input| (input.viewport().inner_rect, input.viewport().maximized));
        if maximized == Some(true) {
            return;
        }
        let usable = |size: &egui::Vec2| {
            size.x.is_finite() && size.y.is_finite() && size.x > 0.0 && size.y > 0.0
        };
        if let Some(size) = rect.map(|rect| rect.size()).filter(usable) {
            self.config.window_size = Some([size.x, size.y]);
        }
    }
    // @end
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A fresh app, built the way the runtime builds it.
    fn app(ctx: &egui::Context) -> App {
        // @if config
        App::new(ctx, crate::config::Config::default())
        // @else
        App::new(ctx)
        // @end
    }

    /// Runs `frames` headless frames, the way a runtime would.
    fn run(ctx: &egui::Context, app: &mut App, frames: usize) {
        for _ in 0..frames {
            let input = egui::RawInput {
                screen_rect: Some(egui::Rect::from_min_size(
                    egui::Pos2::ZERO,
                    egui::vec2(1180.0, 760.0),
                )),
                ..Default::default()
            };
            ctx.run_pass(input, |ctx| app.ui(ctx))
                .drop_without_applying_deltas();
        }
    }

    #[test]
    fn page_keys_are_unique_and_round_trip() {
        for page in Page::ALL {
            assert_eq!(Page::from_key(page.key()), Some(page), "{page:?}");
        }
        assert_eq!(Page::from_key("no-such-page"), None);
    }

    #[test]
    fn every_page_and_the_settings_card_draw_headless() {
        let ctx = egui::Context::default();
        let mut app = app(&ctx);
        for page in Page::ALL {
            app.apply(&ctx, Action::Go(page));
            run(&ctx, &mut app, 2);
            assert_eq!(app.page, page);
        }
        app.apply(&ctx, Action::OpenSettings);
        run(&ctx, &mut app, 2);
        assert!(app.settings_open, "settings stays open until dismissed");
    }

    #[test]
    fn toggling_the_sidebar_twice_restores_it() {
        let ctx = egui::Context::default();
        let mut app = app(&ctx);
        let before = app.sidebar_collapsed;
        app.apply(&ctx, Action::ToggleSidebar);
        assert_ne!(app.sidebar_collapsed, before);
        app.apply(&ctx, Action::ToggleSidebar);
        assert_eq!(app.sidebar_collapsed, before);
    }

    #[test]
    fn every_card_has_something_to_say() {
        assert!(CARDS.len() >= 3, "the grid needs cards to be a grid");
        for card in CARDS {
            assert!(!card.title.is_empty() && !card.body.is_empty());
            assert!((0.0..=1.0).contains(&card.progress), "{}", card.title);
        }
    }
    // @if themes

    #[test]
    fn switching_theme_changes_the_palette() -> anyhow::Result<()> {
        let ctx = egui::Context::default();
        let mut app = app(&ctx);
        let other = app
            .catalog
            .themes()
            .iter()
            .find(|theme| theme.id != app.theme.id)
            .map(|theme| theme.id.clone())
            .ok_or_else(|| anyhow::anyhow!("the catalog has only one theme"))?;
        app.apply(&ctx, Action::SetTheme(other.clone()));
        assert_eq!(app.theme.id, other);
        run(&ctx, &mut app, 1);
        Ok(())
    }
    // @end
}
