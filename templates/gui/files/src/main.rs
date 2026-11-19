// ============================================================================
// Module:       @@module@@
// Description:  Entry point: parses the command line, loads preferences, and
//               hands off to the desktop front end.
//
// Dependencies: anyhow; @@appCrateSnake@@::{cli, gui}
// ============================================================================

// No console window behind the GUI in a release build: Windows gives a
// console-subsystem binary a terminal whether or not it writes to one, so
// launching from Explorer would open an empty black window beside the app.
// Debug builds keep the console, which is where panics go while developing.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

//! Entry point for `@@bin@@`.
//!
//! Deliberately thin: it parses the command line, loads the saved
//! preferences and hands off. Everything else belongs to the library.
//!
//! ## A release build borrows the terminal it was run from
//!
//! A release build has no console of its own. When it has something to
// @if subcommands
//! print (`--help`, `--version`, a usage error, a headless job) it attaches
// @else
//! print (`--help`, `--version`, a usage error) it attaches
// @end
//! to the console of the terminal it was run from, so the output lands
//! there; launched from Explorer there is nothing to attach to. It never
//! attaches just to open the window, which would tie the window's life to
//! the terminal.
//!
//! ## Failures are also reported in a dialog on Windows
//!
//! Launched from Explorer, anything written to stderr goes nowhere and a
//! startup failure would look like the program refusing to open. See
//! [`report`].

use @@appCrateSnake@@::cli::Cli;

fn main() -> std::process::ExitCode {
    // @if clap
    // @if subcommands
    let mut cli = match <Cli as clap::Parser>::try_parse() {
    // @else
    let cli = match <Cli as clap::Parser>::try_parse() {
    // @end
        Ok(cli) => cli,
        Err(error) => {
            // Help, version or a usage error: something to print, so borrow
            // the terminal. Printing is best effort; the exit code carries
            // the outcome either way, as clap's own exit() would.
            borrow_console();
            let _ = error.print();
            return if error.use_stderr() {
                std::process::ExitCode::from(2)
            } else {
                std::process::ExitCode::SUCCESS
            };
        }
    };
    // @else
    let cli = match Cli::parse_from(std::env::args().skip(1)) {
        Ok(@@appCrateSnake@@::cli::Parsed::Run(cli)) => cli,
        Ok(@@appCrateSnake@@::cli::Parsed::Print(text)) => {
            borrow_console();
            println!("{text}");
            return std::process::ExitCode::SUCCESS;
        }
        Err(message) => {
            borrow_console();
            eprintln!("error: {message}");
            return std::process::ExitCode::from(2);
        }
    };
    // @end
    // @if subcommands

    // A subcommand is a headless job: run it against the terminal and exit
    // with no window, before the single-instance check so a job can run
    // beside an open window.
    if let Some(command) = cli.command.take() {
        borrow_console();
        return headless(command);
    }
    // @end
    // @if singleInstance

    // A second launch hands focus to the first window and leaves, rather
    // than opening a second copy that fights the first over the config file.
    #[cfg(windows)]
    let _instance = match @@appCrateSnake@@::win::single_instance::acquire(@@appCrateSnake@@::APP_ID) {
        Some(guard) => guard,
        None => {
            @@appCrateSnake@@::win::single_instance::focus_existing(@@appCrateSnake@@::NAME);
            return std::process::ExitCode::SUCCESS;
        }
    };
    // @end

    match run(cli) {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            report(&format!("{error:#}"));
            std::process::ExitCode::FAILURE
        }
    }
}

/// Borrows the launching terminal's console before printing: a release
/// build has none of its own (see `win::console`). Called only when there
/// is output, never before opening the window, because a process attached
/// to a console is closed with it and gets its Ctrl+C.
fn borrow_console() {
    #[cfg(windows)]
    @@appCrateSnake@@::win::console::attach_parent();
}

// @if subcommands
/// Runs a headless job. A failure goes to stderr only: the caller is a
/// terminal or a script, not someone looking for a dialog.
fn headless(command: @@appCrateSnake@@::cli::Command) -> std::process::ExitCode {
    match command.run(&mut std::io::stdout().lock()) {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            std::process::ExitCode::FAILURE
        }
    }
}

// @end
/// Applies the command line to the saved preferences and opens the window.
fn run(cli: Cli) -> anyhow::Result<()> {
    // @if config
    let mut config = if cli.reset {
        @@appCrateSnake@@::config::Config::default()
    } else {
        @@appCrateSnake@@::config::load()
    };
    // @if themes
    if let Some(theme) = cli.theme {
        config.theme = Some(theme);
    }
    // @end
    if let Some(font) = cli.font {
        config.font = Some(font);
    }
    @@appCrateSnake@@::gui::run::run(config)
    // @else
    // @if subcommands
    // main() has taken any subcommand; only the window is left to open.
    let Cli { command: _ } = cli;
    // @else
    let Cli {} = cli;
    // @end
    @@appCrateSnake@@::gui::run::run()
    // @end
}

/// Reports a startup failure somewhere the user will actually see it.
///
/// Written to stderr for a terminal, and on Windows also shown in a
/// message box, because a release build launched from Explorer has no
/// console at all.
fn report(message: &str) {
    eprintln!("{message}");
    #[cfg(windows)]
    @@appCrateSnake@@::win::dialog::show_error(message, @@appCrateSnake@@::NAME);
}
