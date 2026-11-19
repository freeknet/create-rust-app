// ============================================================================
// Module:       @@module@@
// Description:  Borrowing the launching terminal's console, so a release build
//               run from a shell can print its help, version and errors.
//
// Dependencies: windows-sys (AttachConsole)
// ============================================================================

//! The parent process's console.
//!
//! A release build uses the Windows subsystem (see `main.rs`), so it starts
//! with no console: launched from Explorer that is what you want, but run
//! from a terminal, clap's `--help`, `--version` and usage errors would be
//! written to nowhere. Attaching to the parent's console fixes that, and
//! does nothing when there is no parent console to attach to.
//!
//! Attach only to print: an attached process is closed with the console
//! and receives its Ctrl+C, so `main` never attaches before opening the
//! window.
//!
//! One quirk of the platform remains: the shell does not wait for a
//! Windows-subsystem program, so its prompt can come back before the
//! output. Press Enter for a fresh prompt.

use windows_sys::Win32::System::Console as sys;

/// Attaches to the console of the process that launched this one, if any.
///
/// Best effort: launched from Explorer there is no parent console, and a
/// debug build already has its own; both are fine and leave things as
/// they were.
pub fn attach_parent() {
    // Failure only means there was nothing to attach to.
    let _attached = attach_console(sys::ATTACH_PARENT_PROCESS);
}

/// Calls `AttachConsole`; true when this process now has a console.
fn attach_console(process: u32) -> bool {
    // SAFETY: AttachConsole takes a process id by value and reads or writes
    // no memory of ours; failure is reported only through its return value.
    unsafe { sys::AttachConsole(process) != 0 }
}
