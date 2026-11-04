// ============================================================================
// Module:       @@module@@
// Description:  Raw mode and the alternate screen: entered once, and put
//               back on a normal exit, an error, and a panic.
//
// Dependencies: ratatui, crossterm
// ============================================================================

//! Terminal setup and, more importantly, teardown.
//!
//! A terminal UI that exits without leaving raw mode strands the user in a
//! shell that does not echo what they type, which reads as the machine
//! being broken. So there are two ways back:
//!
//! - [`Guard`] restores the terminal when it drops. That covers returning
//!   normally and every early `?` return.
//! - A panic hook restores it before the panic message prints. Drop alone
//!   is not enough: the release profile sets `panic = "abort"`, which runs
//!   the hook but never unwinds, so no destructor would run.
//!
//! Restoring twice is harmless, which is why both can fire.

use std::io;

/// The backend the app draws through.
pub(crate) type Backend = ratatui::backend::CrosstermBackend<io::Stdout>;

/// Restores the terminal when dropped.
pub(crate) struct Guard;

impl Drop for Guard {
    fn drop(&mut self) {
        // Nothing useful can be done with a failure here: we are already
        // on the way out, and the original error (if any) matters more.
        let _ = restore();
    }
}

/// Switches to raw mode and the alternate screen.
///
/// Hold the returned [`Guard`] for as long as the UI runs; dropping it
/// switches back.
///
/// # Errors
///
/// Returns an error when the terminal refuses raw mode or the alternate
/// screen (when stdout is not a terminal, for one).
pub(crate) fn enter() -> io::Result<(Guard, ratatui::Terminal<Backend>)> {
    install_panic_hook();
    crossterm::terminal::enable_raw_mode()?;
    // From here on any failure must restore, so the guard exists first.
    let guard = Guard;
    crossterm::execute!(
        io::stdout(),
        crossterm::terminal::EnterAlternateScreen,
        crossterm::cursor::Hide
    )?;
    let terminal = ratatui::Terminal::new(ratatui::backend::CrosstermBackend::new(io::stdout()))?;
    Ok((guard, terminal))
}

/// Leaves raw mode and the alternate screen, attempting both even if the
/// first fails.
fn restore() -> io::Result<()> {
    let raw = crossterm::terminal::disable_raw_mode();
    let screen = crossterm::execute!(
        io::stdout(),
        crossterm::terminal::LeaveAlternateScreen,
        crossterm::cursor::Show
    );
    raw.and(screen)
}

/// Chains a terminal restore in front of the existing panic hook, once.
fn install_panic_hook() {
    static INSTALLED: std::sync::Once = std::sync::Once::new();
    INSTALLED.call_once(|| {
        let previous = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            let _ = restore();
            previous(info);
        }));
    });
}
