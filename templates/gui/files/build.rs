// ============================================================================
// Module:       @@module@@
// Description:  Embeds the Windows resources: the application icon, the
//               manifest, and the version information Explorer shows.
//
// Dependencies: winresource (does nothing for a non-Windows target)
// ============================================================================

//! Embeds the Windows resources into the executable.
//!
//! Three things, and all of them are invisible until they are missing.
//!
//! - **The icon.** The window icon is set at runtime, but Explorer, the
//!   taskbar and a pinned shortcut read an icon *resource* out of the
//!   `.exe`; without one they show the generic blank-page icon.
//!   `assets/@@name@@.ico` is regenerated from `src/brand.rs` by
//!   `cargo run --example brand_assets`.
//! - **The manifest** (`assets/@@name@@.manifest`). Without one, Windows
//!   bitmap-scales the window on a high-DPI display (a blurry app), reports
//!   Windows 8 to every version check, and gives the process the legacy
//!   code page instead of UTF-8.
//! - **The version information** the Properties dialog and Task Manager
//!   read, taken from `Cargo.toml` so it cannot disagree with the crate.
//!
//! Release builds fail if the resources cannot be embedded: a distributable
//! binary without its manifest is not a valid release.

fn main() {
    println!("cargo:rerun-if-changed=assets/@@name@@.ico");
    println!("cargo:rerun-if-changed=assets/@@name@@.manifest");
    println!("cargo:rerun-if-changed=build.rs");

    // The *target*, not the host: `cfg(windows)` in a build script describes
    // the machine running it.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let mut resource = winresource::WindowsResource::new();
    resource.set_icon("assets/@@name@@.ico");
    resource.set_manifest_file("assets/@@name@@.manifest");
    // `FileDescription` is what Task Manager and Explorer show as the
    // program's name, so it holds the product name, not a sentence.
    resource.set("ProductName", "@@displayName@@");
    resource.set("FileDescription", "@@displayName@@");
    resource.set("Comments", env!("CARGO_PKG_DESCRIPTION"));
    resource.set("LegalCopyright", "Copyright (c) @@year@@ @@author@@");

    if let Err(error) = resource.compile() {
        if std::env::var("PROFILE").as_deref() == Ok("release") {
            eprintln!("could not embed the Windows resources: {error}");
            std::process::exit(1);
        }
        println!("cargo:warning=could not embed the Windows resources: {error}");
    }
}
