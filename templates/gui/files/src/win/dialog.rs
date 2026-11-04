// ============================================================================
// Module:       @@module@@
// Description:  Native message boxes, available before the app window exists.
//
// Dependencies: win::strings; windows-sys (MessageBoxW)
// ============================================================================

//! Native dialogs, for reporting an error when there is no window yet to
//! report it in.

use super::strings;
use windows_sys::Win32::UI::WindowsAndMessaging as wm;

/// Shows an ownerless error dialog and waits for it to be dismissed.
pub fn show_error(message: &str, caption: &str) {
    let message = strings::to_wide(message);
    let caption = strings::to_wide(caption);
    message_box(&message, &caption, wm::MB_OK | wm::MB_ICONERROR);
}

/// Calls `MessageBoxW` with buffers whose lifetimes are carried by slices.
fn message_box(message: &[u16], caption: &[u16], style: u32) {
    // SAFETY: both slices are live NUL-terminated UTF-16 buffers made by
    // `strings::to_wide` that outlive this synchronous call. A null owner
    // is the documented ownerless-dialog form.
    unsafe {
        wm::MessageBoxW(
            std::ptr::null_mut(),
            message.as_ptr(),
            caption.as_ptr(),
            style,
        );
    }
}
