// ============================================================================
// Module:       @@module@@
// Description:  End-to-end checks of the command line, through the same
//               entry point the binary calls.
//
// Dependencies: the library crate, anyhow
// ============================================================================

//! End-to-end checks of the command line.
//!
//! These call [`@@crate@@::run`] with an argument list and an in-memory
//! buffer instead of spawning the compiled binary, so they need no shell,
//! no path to an executable, and no scraping of a real terminal.

use std::process::ExitCode;

use @@crate@@ as app;

/// Exit code 0, named for the assertions below.
const SUCCESS: ExitCode = ExitCode::SUCCESS;

/// The program name, the first argument the parser sees.
const BIN: &str = "@@bin@@";
// @if async_tokio

/// Runs the program with `args` and returns its exit code and stdout.
async fn run(args: &[&str]) -> anyhow::Result<(ExitCode, String)> {
    let mut out = Vec::new();
    let code = app::run(args.iter().copied(), &mut out).await?;
    Ok((code, String::from_utf8(out)?))
}

#[tokio::test]
async fn the_default_action_greets() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN]).await?;
    // @else

/// Runs the program with `args` and returns its exit code and stdout.
fn run(args: &[&str]) -> anyhow::Result<(ExitCode, String)> {
    let mut out = Vec::new();
    let code = app::run(args.iter().copied(), &mut out)?;
    Ok((code, String::from_utf8(out)?))
}

#[test]
fn the_default_action_greets() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN])?;
    // @end
    assert_eq!(code, SUCCESS, "a bare run succeeds");
    assert!(out.ends_with("!\n"), "one line: {out:?}");
    Ok(())
}
// @if clap

// @if async_tokio
#[tokio::test]
async fn a_name_is_greeted() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "--name", "Ferris"]).await?;
    // @else
#[test]
fn a_name_is_greeted() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "--name", "Ferris"])?;
    // @end
    assert_eq!(code, SUCCESS, "a valid flag succeeds");
    assert!(out.contains("Ferris"), "--name is used: {out:?}");
    Ok(())
}

// @if async_tokio
#[tokio::test]
async fn an_unknown_flag_is_a_usage_error() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "--no-such-flag"]).await?;
    // @else
#[test]
fn an_unknown_flag_is_a_usage_error() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "--no-such-flag"])?;
    // @end
    assert_eq!(code, ExitCode::from(2), "usage errors exit 2");
    assert!(out.is_empty(), "nothing ran: {out:?}");
    Ok(())
}

// @if async_tokio
#[tokio::test]
async fn version_is_not_an_error() -> anyhow::Result<()> {
    let (code, _) = run(&[BIN, "--version"]).await?;
    // @else
#[test]
fn version_is_not_an_error() -> anyhow::Result<()> {
    let (code, _) = run(&[BIN, "--version"])?;
    // @end
    assert_eq!(code, SUCCESS, "--version exits 0");
    Ok(())
}
// @else

// @if async_tokio
#[tokio::test]
async fn arguments_are_ignored_without_a_parser() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "--anything"]).await?;
    // @else
#[test]
fn arguments_are_ignored_without_a_parser() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "--anything"])?;
    // @end
    assert_eq!(code, SUCCESS, "every run succeeds");
    assert!(!out.is_empty(), "the default runs: {out:?}");
    Ok(())
}
// @end
