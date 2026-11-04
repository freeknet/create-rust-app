// ============================================================================
// Module:       @@module@@
// Description:  Keeps workflow Rust versions aligned with the local toolchain.
//
// Dependencies: anyhow, std::fs (reads repository configuration during tests)
// ============================================================================

//! Checks every workflow that explicitly installs a Rust toolchain.
//! Workflows without a toolchain key and repositories without workflows
//! need no check. Workspace app crates resolve configuration at the repo root.

// @if edition_2021
use anyhow::{anyhow, Result};
// @else
use anyhow::{Result, anyhow};
// @end
use std::fs;
use std::path::{Path, PathBuf};

/// The repository containing this crate's toolchain pin.
fn repo_root() -> Result<PathBuf> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"));
    for candidate in [root.to_path_buf(), root.join("../..")] {
        if candidate.join("rust-toolchain.toml").is_file() {
            return Ok(candidate);
        }
    }
    Err(anyhow!(
        "rust-toolchain.toml not found at the crate root or ../../"
    ))
}

/// An unquoted TOML/YAML scalar, ignoring a trailing comment.
fn scalar(value: &str) -> &str {
    let value = value.trim();
    if let Some(quote) = value.chars().next().filter(|c| *c == '"' || *c == '\'') {
        let rest = &value[1..];
        return rest.split(quote).next().unwrap_or_default();
    }
    value.split('#').next().unwrap_or_default().trim()
}

/// The channel rustup installs locally.
fn pinned_channel(root: &Path) -> Result<String> {
    let text = fs::read_to_string(root.join("rust-toolchain.toml"))?;
    for line in text.lines() {
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim() == "channel" {
            return Ok(scalar(value).to_string());
        }
    }
    Err(anyhow!("rust-toolchain.toml has no channel key"))
}

/// YAML workflows at the repository root; absent GitHub configuration is valid.
fn workflows(root: &Path) -> Result<Vec<PathBuf>> {
    let directory = root.join(".github/workflows");
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut found = Vec::new();
    for entry in fs::read_dir(directory)? {
        let path = entry?.path();
        if path.is_file()
            && path
                .extension()
                .is_some_and(|ext| ext == "yml" || ext == "yaml")
        {
            found.push(path);
        }
    }
    found.sort();
    Ok(found)
}

/// Explicit toolchain keys only; unrelated workflows yield an empty list.
fn workflow_toolchains(text: &str) -> Vec<&str> {
    text.lines()
        .filter_map(|line| line.trim().strip_prefix("toolchain:"))
        .map(scalar)
        .collect()
}

#[test]
fn every_workflow_pins_the_same_toolchain_as_the_repo() -> Result<()> {
    let root = repo_root()?;
    let pinned = pinned_channel(&root)?;
    assert!(
        !pinned.is_empty(),
        "rust-toolchain.toml must name a channel"
    );
    for workflow in workflows(&root)? {
        let text = fs::read_to_string(&workflow)?;
        for declared in workflow_toolchains(&text) {
            assert!(
                !declared.is_empty(),
                "{} asks for an empty toolchain",
                workflow.display()
            );
            assert_eq!(
                declared,
                pinned,
                "{} installs Rust {declared}, but rust-toolchain.toml pins {pinned}",
                workflow.display()
            );
        }
    }
    Ok(())
}

#[test]
fn no_workflow_installs_a_floating_stable_toolchain() -> Result<()> {
    for workflow in workflows(&repo_root()?)? {
        let text = fs::read_to_string(&workflow)?;
        assert!(
            !text
                .lines()
                .filter(|line| !line.trim_start().starts_with('#'))
                .any(|line| line.contains("rust-toolchain@stable")),
            "{} uses a floating rust-toolchain@stable",
            workflow.display()
        );
    }
    Ok(())
}

#[test]
fn workflow_keys_accept_literals_and_skip_unrelated_steps() -> Result<()> {
    assert_eq!(
        workflow_toolchains("name: audit\n  uses: audit/action@sha\n"),
        Vec::<&str>::new(),
        "workflows without toolchain keys must be skipped"
    );
    assert_eq!(
        workflow_toolchains(
            "  toolchain: \"1.99.1\" # pinned\n  toolchain: '1.99.1'\n  toolchain: 1.99.1 # pinned\n"
        ),
        vec!["1.99.1", "1.99.1", "1.99.1"],
        "literal styles must parse consistently"
    );
    Ok(())
}
