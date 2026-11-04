// ============================================================================
// Module:       @@module@@
// Description:  Finding the app's top-level window by title, and bringing it
//               forward or asking it to close.
//
// Dependencies: win::strings; windows-sys (WindowsAndMessaging)
// ============================================================================

//! The app's window, from the outside.
//!
//! The tray and the single-instance check both need to act on the main
//! window without holding its handle: the tray because the window belongs
//! to the runtime, the second instance because the window belongs to
//! another process. Both find it the same way, by its title, and both act
//! through messages Windows already defines rather than by reaching into
//! the runtime.

use super::strings;
use windows_sys::Win32::Foundation::HWND;
use windows_sys::Win32::UI::WindowsAndMessaging as wm;

/// Which process the window must belong to.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Owner {
    /// This process: the tray acting on its own app.
    ThisProcess,
    /// Another process: a second launch handing over to the first.
    OtherProcess,
}

/// Restores and focuses the top-level window titled `title`. Returns
/// whether one was found.
pub fn bring_to_front(title: &str, owner: Owner) -> bool {
    let Some(window) = find(title, owner) else {
        return false;
    };
    if is_iconic(window) {
        show_window(window, wm::SW_RESTORE);
    } else {
        show_window(window, wm::SW_SHOW);
    }
    set_foreground(window);
    true
}

/// Asks the window titled `title` to close, as its own close button would,
/// so the runtime shuts down normally and preferences are saved.
pub fn request_close(title: &str, owner: Owner) -> bool {
    let Some(window) = find(title, owner) else {
        return false;
    };
    post_message(window, wm::WM_CLOSE)
}

/// The first top-level window titled `title` owned as `owner` says.
fn find(title: &str, owner: Owner) -> Option<HWND> {
    let wide = strings::to_wide(title);
    let this = std::process::id();
    let mut after: HWND = std::ptr::null_mut();
    loop {
        let window = find_window_after(after, &wide);
        if window.is_null() {
            return None;
        }
        let mine = process_of(window) == this;
        if mine == (owner == Owner::ThisProcess) {
            return Some(window);
        }
        after = window;
    }
}

/// The next top-level window after `after` whose title is `title`.
fn find_window_after(after: HWND, title: &[u16]) -> HWND {
    // SAFETY: `title` is a live NUL-terminated UTF-16 buffer for the whole
    // call; a null parent and class mean "any top-level window", and
    // `after` is null or a handle this module was given by the same call.
    unsafe {
        wm::FindWindowExW(
            std::ptr::null_mut(),
            after,
            std::ptr::null(),
            title.as_ptr(),
        )
    }
}

/// The id of the process that owns `window`.
fn process_of(window: HWND) -> u32 {
    let mut process = 0u32;
    // SAFETY: `process` is a live local the call writes one u32 into; a
    // stale window handle makes the call fail and leave it 0.
    unsafe { wm::GetWindowThreadProcessId(window, &mut process) };
    process
}

/// Whether `window` is minimised.
fn is_iconic(window: HWND) -> bool {
    // SAFETY: takes the handle by value; an invalid one returns false.
    unsafe { wm::IsIconic(window) != 0 }
}

/// Shows `window` with the `SW_*` command `command`.
fn show_window(window: HWND, command: wm::SHOW_WINDOW_CMD) {
    // SAFETY: takes the handle by value; an invalid one fails harmlessly.
    unsafe { wm::ShowWindow(window, command) };
}

/// Asks for `window` to become the foreground window.
fn set_foreground(window: HWND) {
    // SAFETY: takes the handle by value; Windows may refuse, harmlessly.
    unsafe { wm::SetForegroundWindow(window) };
}

/// Posts `message` (with no parameters) to `window`'s queue.
fn post_message(window: HWND, message: u32) -> bool {
    // SAFETY: posting copies the arguments; no pointers are passed.
    unsafe { wm::PostMessageW(window, message, 0, 0) != 0 }
}
