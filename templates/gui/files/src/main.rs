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

//! Entry point for `@@name@@`.
//!
//! Deliberately thin: it parses the command line, loads the saved
//! preferences and hands off. Everything else belongs to the library.
//!
//! ## Failures are reported in a dialog on Windows
//!
//! A release build has no console, so anything written to stderr goes
//! nowhere and a startup failure would look like the program refusing to
//! open. See [`report`].

use @@appCrateSnake@@::cli::Cli;

fn main() -> std::process::ExitCode {
    // @if clap
    let cli = {
        use clap::Parser as _;
        Cli::parse()
    };
    // @else
    let cli = match Cli::parse_from(std::env::args().skip(1)) {
        Ok(@@appCrateSnake@@::cli::Parsed::Run(cli)) => cli,
        Ok(@@appCrateSnake@@::cli::Parsed::Print(text)) => {
            println!("{text}");
            return std::process::ExitCode::SUCCESS;
        }
        Err(message) => {
            eprintln!("error: {message}");
            return std::process::ExitCode::from(2);
        }
    };
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
    let Cli {} = cli;
    @@appCrateSnake@@::gui::run::run()
    // @end
}

/// Reports a startup failure somewhere the user will actually see it.
///
/// Written to stderr for a terminal, and on Windows also shown in a
/// message box, because a release build has no console at all.
fn report(message: &str) {
    eprintln!("{message}");
    #[cfg(windows)]
    @@appCrateSnake@@::win::dialog::show_error(message, @@appCrateSnake@@::NAME);
}
