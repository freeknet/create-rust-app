// ============================================================================
// Module:       @@module@@
// Description:  Workspace automation behind the cargo xtask alias.
//
// Dependencies: anyhow; std; changelog and ci modules
// ============================================================================

//! Run repository automation from any directory inside the workspace.
//!
//! `cargo xtask ci` checks the workspace; `cargo xtask changelog` regenerates
//! CHANGELOG.md from conventional commits and reachable version tags.

mod changelog;
mod ci;

use anyhow::bail;
use anyhow::{Context as _, Result};
use std::path::PathBuf;
use std::process::ExitCode;

fn run() -> Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() || matches!(args[0].as_str(), "--help" | "-h" | "help") {
        println!("Usage: cargo xtask <ci | changelog [--check]>");
        return Ok(());
    }
    // Cargo's runtime manifest path also handles checkouts sharing a target dir.
    let manifest = std::env::var_os("CARGO_MANIFEST_DIR")
        .map_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")), PathBuf::from);
    let root = manifest
        .parent()
        .and_then(std::path::Path::parent)
        .context("xtask must live under crates/xtask")?;
    std::env::set_current_dir(root).context("could not enter the workspace root")?;
    match args[0].as_str() {
        "ci" if args.len() == 1 => ci::run(),
        "changelog" if args.len() == 1 => changelog::run(false),
        "changelog" if args.len() == 2 && args[1] == "--check" => changelog::run(true),
        _ => bail!("unknown command or arguments; run `cargo xtask --help`"),
    }
}

fn main() -> ExitCode {
    match run() {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("error: {error:#}");
            ExitCode::FAILURE
        }
    }
}
