// ============================================================================
// Module:       @@module@@
// Description:  The terminal app: argument parsing, the event loop, and the
//               module graph it is built from.
//
// Dependencies: ratatui, crossterm, anyhow; clap when selected
// ============================================================================

//! @@displayName@@: @@tagline@@
//!
//! The app is split the way most terminal UIs end up split, and the split
//! is what keeps it testable:
//!
//! - [`app`] is the state and every way it can change. It knows nothing
//!   about terminals: a key press arrives as an [`app::Action`], so the
//!   state transitions are plain unit tests.
//! - [`ui`] draws one frame from the state. It never mutates anything, so
//!   it can be rendered into ratatui's in-memory `TestBackend` and checked.
//! - [`event`] turns crossterm's input stream into keys and ticks.
//! - `terminal` owns raw mode and the alternate screen, and puts them back
//!   on every way out: a normal return, an error, and a panic.
//!
//! [`run`] wires them into the loop: draw, wait for an event, update.

pub mod app;
pub mod event;
mod logging;
mod terminal;
pub mod ui;

use std::time::Duration;

/// How often the app ticks when nothing is pressed: fast enough for the
/// title gradient to drift smoothly, slow enough to cost nothing.
pub const DEFAULT_TICK: Duration = Duration::from_millis(100);
// @if clap

/// The command line.
///
/// `about` comes from the `description` in `Cargo.toml`, so `--help` and
/// the published crate metadata cannot drift apart.
#[derive(clap::Parser, Debug)]
#[command(name = "@@name@@", version, about)]
struct Cli {
    /// Milliseconds between animation ticks.
    #[arg(
        long,
        value_name = "MS",
        default_value_t = 100,
        value_parser = clap::value_parser!(u64).range(10..=5_000),
    )]
    tick_ms: u64,
}
// @end

/// Runs the app until the user quits, and returns the exit code.
///
/// `args` includes the program name as its first item, exactly as
/// [`std::env::args_os`] yields it.
///
/// # Errors
///
/// Returns an error when the terminal cannot be put into raw mode, or
/// reading input or drawing fails. The terminal is restored first.
pub fn run<I, T>(args: I) -> anyhow::Result<std::process::ExitCode>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    // @if clap
    use clap::Parser as _;
    let tick = match Cli::try_parse_from(args) {
        Ok(cli) => Duration::from_millis(cli.tick_ms),
        Err(error) => {
            // Help and `--version` are "errors" to clap but successes to
            // the user; anything clap refused is a usage error, code 2.
            let _ = error.print();
            return Ok(if error.use_stderr() {
                std::process::ExitCode::from(2)
            } else {
                std::process::ExitCode::SUCCESS
            });
        }
    };
    // @else
    // Without an argument parser there is nothing to read.
    let _ = args;
    let tick = DEFAULT_TICK;
    // @end
    logging::init();

    // The guard restores the terminal when it drops, so every `?` below
    // leaves the user with a working shell.
    let (_guard, mut terminal) = terminal::enter()?;
    let mut app = app::App::new();
    let mut events = event::Events::new(tick);
    while app.is_running() {
        terminal.draw(|frame| ui::draw(frame, &app))?;
        let action = match events.wait()? {
            event::Event::Tick => Some(app::Action::Tick),
            event::Event::Key(key) => app::action_for(key),
            // The next pass through the loop redraws at the new size.
            event::Event::Resize => None,
        };
        if let Some(action) = action {
            app.update(action);
        }
    }
    Ok(std::process::ExitCode::SUCCESS)
}

// Test-only guard modules, when enabled, go last: rustfmt sorts adjacent
// `mod` lines, and these must not interleave with the ones above.
// @if headerCheck
#[cfg(test)]
mod header_check;
// @end
// @if unsafeCheck
#[cfg(test)]
mod unsafe_check;
// @end
