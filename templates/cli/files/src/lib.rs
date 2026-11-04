// ============================================================================
// Module:       @@module@@
// Description:  The whole application behind one testable entry point:
//               argument parsing, logging setup, and command dispatch.
//
// Dependencies: anyhow; clap, configuration, HTTP and SQLite when selected
// ============================================================================

//! @@displayName@@: @@tagline@@
//!
//! Everything the program does lives in this library, and `src/main.rs`
//! only hands it the process arguments and standard output. That split is
//! what makes the binary testable: `tests/cli.rs` calls [`run`] with its
//! own argument list and an in-memory buffer, so the commands are checked
//! without spawning a process, finding a compiled executable, or scraping
//! a terminal.
//!
//! [`run`] reports through its return value rather than exiting. A usage
//! error is exit code 2 (the convention `clap` and most Unix tools share),
//! help and version requests are success, and an operational failure is an
//! `Err` whose context chain the binary prints on the way out.

mod cli;
// @if serde & config
pub mod config;
// @end
// @if sqlite
pub mod db;
// @end
mod logging;

/// Runs one invocation of the program and returns its exit code.
///
/// `args` includes the program name as its first item, exactly as
/// [`std::env::args_os`] yields it. Normal output goes to `out`; usage
/// errors, help, and logs go where the terminal expects them.
///
/// # Errors
///
/// Returns an error when a command fails (an unwritable `out`, or a
/// failure in the command itself). Refused arguments are not an error:
/// they print a usage message and return exit code 2.
// @if async_tokio
pub async fn run<I, T, W>(args: I, out: &mut W) -> anyhow::Result<std::process::ExitCode>
// @else
pub fn run<I, T, W>(args: I, out: &mut W) -> anyhow::Result<std::process::ExitCode>
// @end
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
    W: std::io::Write,
{
    logging::init();
    // @if clap
    let options = match cli::parse(args) {
        Ok(options) => options,
        Err(code) => return Ok(code),
    };
    // @if async_tokio
    cli::execute(options, out).await?;
    // @else
    cli::execute(options, out)?;
    // @end
    // @else
    // Without an argument parser there is nothing to read: every
    // invocation runs the default action, whatever it was given.
    let _ = args;
    cli::greet(out, None)?;
    // @end
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
