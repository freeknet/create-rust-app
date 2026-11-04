// ============================================================================
// Module:       @@module@@
// Description:  Run the workspace CI checks locally, stopping on failure.
//
// Dependencies: anyhow; std::process
// ============================================================================

//! Check formatting, lint every target, run tests, and audit dependencies.
//! Install cargo-deny with `cargo install cargo-deny --locked` when enabled.

use anyhow::{Context as _, Result, bail};
use std::process::Command;

pub(crate) fn run() -> Result<()> {
    let cargo = std::env::var_os("CARGO").unwrap_or_else(|| "cargo".into());
    let steps: &[&[&str]] = &[
        &["fmt", "--all", "--", "--check"],
        &[
            "clippy",
            "--workspace",
            "--all-targets",
            "--all-features",
            "--",
            "-D",
            "warnings",
        ],
        &["test", "--workspace", "--all-features"],
        // @if cargoDeny
        &["deny", "check"],
        // @end
    ];
    for args in steps {
        let label = format!("cargo {}", args.join(" "));
        println!("\n$ {label}");
        let status = Command::new(&cargo)
            .args(*args)
            .status()
            .with_context(|| format!("could not start {label}"))?;
        if !status.success() {
            bail!("{label} failed ({status})");
        }
    }
    Ok(())
}
