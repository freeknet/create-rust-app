// ============================================================================
// Module:       @@module@@
// Description:  End-to-end checks of the command line, through the same
//               entry point the binary calls.
//
// Dependencies: @@crate@@ (the library), anyhow
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

/// Exit code 2: the arguments were refused.
fn usage_error() -> ExitCode {
    ExitCode::from(2)
}
// @if async_tokio

/// Runs the program with `args` and returns its exit code and stdout.
async fn run(args: &[&str]) -> anyhow::Result<(ExitCode, String)> {
    let mut out = Vec::new();
    let code = app::run(args.iter().copied(), &mut out).await?;
    Ok((code, String::from_utf8(out)?))
}

#[tokio::test]
async fn a_bare_run_is_a_usage_error() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN]).await?;
    // @else

/// Runs the program with `args` and returns its exit code and stdout.
fn run(args: &[&str]) -> anyhow::Result<(ExitCode, String)> {
    let mut out = Vec::new();
    let code = app::run(args.iter().copied(), &mut out)?;
    Ok((code, String::from_utf8(out)?))
}

#[test]
fn a_bare_run_is_a_usage_error() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN])?;
    // @end
    assert_eq!(code, usage_error(), "a subcommand is required");
    assert!(out.is_empty(), "nothing ran: {out:?}");
    Ok(())
}

// @if async_tokio
#[tokio::test]
async fn hello_greets_the_named_person() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "hello", "--name", "Ferris"]).await?;
    // @else
#[test]
fn hello_greets_the_named_person() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "hello", "--name", "Ferris"])?;
    // @end
    assert_eq!(code, SUCCESS, "hello succeeds");
    assert!(out.contains("Ferris"), "--name is used: {out:?}");
    Ok(())
}

// @if async_tokio
#[tokio::test]
async fn sum_prints_the_total() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "sum", "2", "40", "-5"]).await?;
    // @else
#[test]
fn sum_prints_the_total() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "sum", "2", "40", "-5"])?;
    // @end
    assert_eq!(code, SUCCESS, "sum succeeds");
    assert_eq!(out, "37\n", "the total, on its own line");
    Ok(())
}

// @if async_tokio
#[tokio::test]
async fn sum_reports_overflow_as_an_error() -> anyhow::Result<()> {
    let max = i64::MAX.to_string();
    let result = run(&[BIN, "sum", &max, "1"]).await;
    // @else
#[test]
fn sum_reports_overflow_as_an_error() -> anyhow::Result<()> {
    let max = i64::MAX.to_string();
    let result = run(&[BIN, "sum", &max, "1"]);
    // @end
    assert!(result.is_err(), "overflow fails, it never wraps");
    Ok(())
}

// @if async_tokio
#[tokio::test]
async fn sum_rejects_a_non_number() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "sum", "two"]).await?;
    // @else
#[test]
fn sum_rejects_a_non_number() -> anyhow::Result<()> {
    let (code, out) = run(&[BIN, "sum", "two"])?;
    // @end
    assert_eq!(code, usage_error(), "clap refuses it before anything runs");
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
