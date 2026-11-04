// ============================================================================
// Module:       @@module@@
// Description:  Entry point: hands the process arguments to the library and
//               turns its result into an exit code.
//
// Dependencies: @@crate@@ (the library), anyhow
// ============================================================================

//! Entry point for `@@name@@`.
//!
//! Deliberately thin. The event loop, the state, and the drawing all live
//! in the library (see `src/lib.rs`). By the time an `Err` reaches `main`
//! the terminal has already been restored, so its context chain prints on
//! a normal screen instead of vanishing with the alternate one.

fn main() -> anyhow::Result<std::process::ExitCode> {
    @@crate@@::run(std::env::args_os())
}
