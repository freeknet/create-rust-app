// ============================================================================
// Module:       @@module@@
// Description:  App state and every way it can change: the list, the
//               selection, and the key bindings that drive them.
//
// Dependencies: crossterm (key types only)
// ============================================================================

//! The app's state, and the only code that changes it.
//!
//! Everything here is plain data and plain functions. A key press reaches
//! [`App::update`] as an [`Action`], never as a terminal event, so every
//! state transition is a unit test that needs no terminal.
//!
//! [`BINDINGS`] is the single source for which key does what. Both the
//! key handling ([`action_for`]) and the hints in the status line read it,
//! so the hints cannot advertise a key that does nothing.

use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

/// Everything the app can be asked to do.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    /// Move the selection up one row, wrapping at the top.
    Up,
    /// Move the selection down one row, wrapping at the bottom.
    Down,
    /// Jump to the first row.
    First,
    /// Jump to the last row.
    Last,
    /// Mark the selected row done, or not done.
    Toggle,
    /// Leave the app.
    Quit,
    /// Time passed; advances animation.
    Tick,
}

/// One key binding.
#[derive(Clone, Copy, Debug)]
pub struct Binding {
    /// The key.
    pub code: KeyCode,
    /// Modifiers that must be held, exactly.
    pub modifiers: KeyModifiers,
    /// What it does.
    pub action: Action,
    /// How the status line shows it. `None` keeps a binding working but
    /// out of the hints (an alias, say).
    pub hint: Option<Hint>,
}

/// A status-line hint: the key as shown, and what it does.
pub type Hint = (&'static str, &'static str);

/// Shorthand for a binding with no modifiers held.
const fn plain(code: KeyCode, action: Action, hint: Option<Hint>) -> Binding {
    Binding {
        code,
        modifiers: KeyModifiers::NONE,
        action,
        hint,
    }
}

/// Every key the app responds to.
pub const BINDINGS: &[Binding] = &[
    plain(KeyCode::Up, Action::Up, Some(("↑↓", "move"))),
    plain(KeyCode::Down, Action::Down, None),
    plain(KeyCode::Char('k'), Action::Up, None),
    plain(KeyCode::Char('j'), Action::Down, None),
    plain(KeyCode::Char('g'), Action::First, Some(("g/G", "ends"))),
    plain(KeyCode::Char('G'), Action::Last, None),
    plain(KeyCode::Home, Action::First, None),
    plain(KeyCode::End, Action::Last, None),
    plain(KeyCode::Char(' '), Action::Toggle, Some(("spc", "toggle"))),
    plain(KeyCode::Enter, Action::Toggle, None),
    plain(KeyCode::Char('q'), Action::Quit, Some(("q", "quit"))),
    plain(KeyCode::Esc, Action::Quit, None),
    Binding {
        code: KeyCode::Char('c'),
        modifiers: KeyModifiers::CONTROL,
        action: Action::Quit,
        hint: None,
    },
];

/// The action bound to `key`, if any.
#[must_use]
pub fn action_for(key: KeyEvent) -> Option<Action> {
    // Terminals report an uppercase letter with SHIFT held; the character
    // already says which case it is, so SHIFT is ignored for characters.
    let modifiers = if let KeyCode::Char(_) = key.code {
        key.modifiers - KeyModifiers::SHIFT
    } else {
        key.modifiers
    };
    BINDINGS
        .iter()
        .find(|binding| binding.code == key.code && binding.modifiers == modifiers)
        .map(|binding| binding.action)
}

/// One row of the list.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Item {
    /// What the row says.
    pub label: String,
    /// Whether it has been ticked off.
    pub done: bool,
}

/// The whole state of the app.
#[derive(Clone, Debug)]
pub struct App {
    /// The rows, in display order.
    items: Vec<Item>,
    /// Index of the selected row. Always valid while `items` is non-empty.
    selected: usize,
    /// False once the user has asked to quit.
    running: bool,
    /// Ticks since start, for animation.
    ticks: u64,
}

impl Default for App {
    fn default() -> Self {
        Self::new()
    }
}

impl App {
    /// The starting state: a short checklist to show the list off.
    #[must_use]
    pub fn new() -> Self {
        let labels = [
            "Read src/app.rs: the state and its transitions",
            "Read src/ui.rs: one frame, drawn from the state",
            "Read src/event.rs: keys and ticks",
            "Replace this list with something real",
        ];
        Self::with_items(labels.iter().map(|label| Item {
            label: (*label).to_owned(),
            done: false,
        }))
    }

    /// A state holding `items`, with the first selected.
    #[must_use]
    pub fn with_items(items: impl IntoIterator<Item = Item>) -> Self {
        Self {
            items: items.into_iter().collect(),
            selected: 0,
            running: true,
            ticks: 0,
        }
    }

    /// The rows, in display order.
    #[must_use]
    pub fn items(&self) -> &[Item] {
        &self.items
    }

    /// Index of the selected row (0 when the list is empty).
    #[must_use]
    pub fn selected(&self) -> usize {
        self.selected
    }

    /// Whether the event loop should keep going.
    #[must_use]
    pub fn is_running(&self) -> bool {
        self.running
    }

    /// Ticks since start; the title gradient drifts with it.
    #[must_use]
    pub fn ticks(&self) -> u64 {
        self.ticks
    }

    /// How many rows are done.
    #[must_use]
    pub fn done_count(&self) -> usize {
        self.items.iter().filter(|item| item.done).count()
    }

    /// Applies one action.
    pub fn update(&mut self, action: Action) {
        let last = self.items.len().saturating_sub(1);
        match action {
            Action::Up => self.selected = self.selected.checked_sub(1).unwrap_or(last),
            Action::Down => self.selected = (self.selected + 1) % (last + 1),
            Action::First => self.selected = 0,
            Action::Last => self.selected = last,
            Action::Toggle => {
                if let Some(item) = self.items.get_mut(self.selected) {
                    item.done = !item.done;
                }
            }
            Action::Quit => self.running = false,
            Action::Tick => self.ticks = self.ticks.wrapping_add(1),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Action, App, Item, action_for};
    use crossterm::event::{KeyCode, KeyEvent, KeyModifiers};

    /// A three-row list, first row selected.
    fn three() -> App {
        App::with_items(["a", "b", "c"].map(|label| Item {
            label: label.to_owned(),
            done: false,
        }))
    }

    #[test]
    fn moving_wraps_at_both_ends() -> anyhow::Result<()> {
        let mut app = three();
        app.update(Action::Up);
        assert_eq!(app.selected(), 2, "up from the first row wraps to the last");
        app.update(Action::Down);
        assert_eq!(app.selected(), 0, "down from the last row wraps");
        app.update(Action::Down);
        assert_eq!(app.selected(), 1, "down moves one row");
        Ok(())
    }

    #[test]
    fn first_and_last_jump() -> anyhow::Result<()> {
        let mut app = three();
        app.update(Action::Last);
        assert_eq!(app.selected(), 2, "last selects the final row");
        app.update(Action::First);
        assert_eq!(app.selected(), 0, "first selects row 0");
        Ok(())
    }

    #[test]
    fn toggle_flips_only_the_selected_row() -> anyhow::Result<()> {
        let mut app = three();
        app.update(Action::Down);
        app.update(Action::Toggle);
        let done: Vec<bool> = app.items().iter().map(|item| item.done).collect();
        assert_eq!(done, [false, true, false], "only row 1 is done");
        app.update(Action::Toggle);
        assert_eq!(app.done_count(), 0, "toggling again undoes it");
        Ok(())
    }

    #[test]
    fn an_empty_list_survives_every_action() -> anyhow::Result<()> {
        let mut app = App::with_items([]);
        for action in [Action::Up, Action::Down, Action::Last, Action::Toggle] {
            app.update(action);
            assert_eq!(app.selected(), 0, "{action:?} keeps the selection at 0");
        }
        Ok(())
    }

    #[test]
    fn quit_stops_the_loop_and_tick_counts() -> anyhow::Result<()> {
        let mut app = three();
        app.update(Action::Tick);
        app.update(Action::Tick);
        assert_eq!(app.ticks(), 2, "each tick is counted");
        assert!(app.is_running(), "ticking does not quit");
        app.update(Action::Quit);
        assert!(!app.is_running(), "quit stops the loop");
        Ok(())
    }

    #[test]
    fn keys_map_to_actions() -> anyhow::Result<()> {
        let key = |c, modifiers| action_for(KeyEvent::new(KeyCode::Char(c), modifiers));
        assert_eq!(key('j', KeyModifiers::NONE), Some(Action::Down), "j");
        assert_eq!(key('G', KeyModifiers::SHIFT), Some(Action::Last), "G");
        assert_eq!(key('c', KeyModifiers::CONTROL), Some(Action::Quit), "^C");
        assert_eq!(key('c', KeyModifiers::NONE), None, "plain c");
        Ok(())
    }
}
