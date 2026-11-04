// ============================================================================
// Module:       @@module@@
// Description:  One running copy per user session: a named mutex, and handing
//               focus to the first copy when a second one starts.
//
// Dependencies: win::{strings, window}; windows-sys (CreateMutexW)
// ============================================================================

//! Single instance.
//!
//! The first copy creates a named mutex and holds it for its lifetime; a
//! second copy finds the name taken, brings the first copy's window
//! forward, and exits. Two copies would otherwise fight over the config
//! file, each saving its own preferences over the other's on exit.
//!
//! The mutex is in the `Local\` namespace: per user session, so two people
//! signed in to one machine each get their own copy.

use super::strings;
use windows_sys::Win32::Foundation as foundation;
use windows_sys::Win32::System::Threading::CreateMutexW;

/// Holds the instance mutex; dropping it releases the name.
pub struct InstanceGuard {
    /// The mutex handle, or null when it could not be created.
    handle: foundation::HANDLE,
}

impl Drop for InstanceGuard {
    fn drop(&mut self) {
        if !self.handle.is_null() {
            close_handle(self.handle);
        }
    }
}

/// Claims the instance for `app_id`. `None` means another copy holds it.
///
/// A mutex that cannot be created at all (an exotic security setup) is not
/// a reason to refuse to start, so that case runs without the guarantee.
#[must_use]
pub fn acquire(app_id: &str) -> Option<InstanceGuard> {
    let name = strings::to_wide(&format!("Local\\{app_id}-single-instance"));
    let handle = create_mutex(&name);
    // Read at once: any later call may overwrite the thread's last error.
    let already_running = last_error() == foundation::ERROR_ALREADY_EXISTS;
    let guard = InstanceGuard { handle };
    (!already_running).then_some(guard)
}

/// Brings the first copy's window, titled `title`, to the front.
pub fn focus_existing(title: &str) -> bool {
    super::window::bring_to_front(title, super::window::Owner::OtherProcess)
}

/// Creates (or opens) the named mutex `name`, without taking ownership.
fn create_mutex(name: &[u16]) -> foundation::HANDLE {
    // SAFETY: `name` is a live NUL-terminated UTF-16 buffer for the call;
    // null security attributes mean the default descriptor.
    unsafe { CreateMutexW(std::ptr::null(), 0, name.as_ptr()) }
}

/// The calling thread's last-error code.
fn last_error() -> u32 {
    // SAFETY: reads thread-local state; takes no arguments.
    unsafe { foundation::GetLastError() }
}

/// Closes a handle this module created.
fn close_handle(handle: foundation::HANDLE) {
    // SAFETY: `handle` came from `create_mutex`, is non-null, and is closed
    // exactly once, by the guard that owns it.
    unsafe { foundation::CloseHandle(handle) };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_second_claim_is_refused_until_the_first_is_released() {
        let id = format!("@@name@@-test-{}", std::process::id());
        let first = acquire(&id);
        assert!(first.is_some(), "the first claim must succeed");
        assert!(acquire(&id).is_none(), "a second claim must be refused");
        drop(first);
        assert!(acquire(&id).is_some(), "released, the name is free again");
    }
}
