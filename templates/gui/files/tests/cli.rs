// ============================================================================
// Module:       @@module@@
// Description:  The command line's two paths: a bare run opens the window,
//               a subcommand runs a headless job.
//
// Dependencies: @@appCrateSnake@@::cli, clap, anyhow
// ============================================================================

//! The command line's two paths.
//!
//! The window itself can't open in a test, so this checks the decision
//! `main` makes (no subcommand: window; a subcommand: headless) and runs
//! the headless jobs against an in-memory buffer.

use @@appCrateSnake@@::cli::{Cli, Command};

/// Parses `args` after a program name.
fn parse(args: &[&str]) -> Result<Cli, clap::Error> {
    let argv = std::iter::once("@@bin@@").chain(args.iter().copied());
    <Cli as clap::Parser>::try_parse_from(argv)
}

/// Runs `command` and returns what it printed.
fn output(command: Command) -> anyhow::Result<String> {
    let mut out = Vec::new();
    command.run(&mut out)?;
    Ok(String::from_utf8(out)?)
}

#[test]
fn a_bare_run_opens_the_window() -> anyhow::Result<()> {
    assert_eq!(parse(&[])?.command, None, "no subcommand means the window");
    Ok(())
}

#[test]
fn a_subcommand_runs_headless() -> anyhow::Result<()> {
    assert_eq!(parse(&["themes"])?.command, Some(Command::Themes));
    assert_eq!(parse(&["paths"])?.command, Some(Command::Paths));
    Ok(())
}

#[test]
fn an_unknown_subcommand_is_refused() {
    assert!(
        parse(&["no-such-job"]).is_err(),
        "a typo must not open the window instead"
    );
}

#[test]
fn themes_lists_the_signature_theme_first() -> anyhow::Result<()> {
    let out = output(Command::Themes)?;
    assert!(out.starts_with("signature\t"), "signature leads: {out:?}");
    Ok(())
}

#[test]
fn paths_always_says_something() -> anyhow::Result<()> {
    let out = output(Command::Paths)?;
    assert!(!out.trim().is_empty(), "paths printed nothing");
    Ok(())
}
