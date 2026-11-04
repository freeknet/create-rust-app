// ============================================================================
// Module:       @@module@@
// Description:  The notification-area icon: Shell_NotifyIconW on a hidden
//               message-only window, with a click to restore and a menu.
//
// Dependencies: win::{strings, window}; windows-sys (Shell, Gdi,
//               WindowsAndMessaging, LibraryLoader)
// ============================================================================

//! The tray icon.
//!
//! A notification icon needs a window to receive its clicks. The app's own
//! window belongs to the runtime, so this creates a hidden *message-only*
//! window of its own and gives the icon that. A left click restores and
//! focuses the app's window; a right click opens a menu with Open and
//! Exit. Both act on the main window through [`super::window`], by title,
//! so this module never needs the runtime's handle — and Exit closes the
//! window the way its own close button would, so preferences still save.
//!
//! The window procedure runs on the thread that created the window, inside
//! the runtime's own message loop, which is why the title it needs is kept
//! in a thread-local rather than passed through a pointer.

use super::strings;
use super::window::{self, Owner};
use windows_sys::Win32::Foundation::{HMODULE, HWND, LPARAM, LRESULT, POINT, WPARAM};
use windows_sys::Win32::Graphics::Gdi as gdi;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::UI::Shell as shell;
use windows_sys::Win32::UI::WindowsAndMessaging as wm;

/// The message the icon's clicks arrive as.
const TRAY_MESSAGE: u32 = wm::WM_APP + 1;

/// This icon's id among the window's icons. There is only the one.
const ICON_ID: u32 = 1;

/// The menu's "Open" command.
const MENU_OPEN: usize = 1;

/// The menu's "Exit" command.
const MENU_EXIT: usize = 2;

thread_local! {
    /// The title of the window the tray acts on.
    static TITLE: std::cell::RefCell<String> = const { std::cell::RefCell::new(String::new()) };
}

/// An `HICON` this module created, destroyed on drop.
struct OwnedIcon(wm::HICON);

impl Drop for OwnedIcon {
    fn drop(&mut self) {
        destroy_icon(self.0);
    }
}

/// A GDI bitmap this module created, deleted on drop.
struct OwnedBitmap(gdi::HBITMAP);

impl Drop for OwnedBitmap {
    fn drop(&mut self) {
        delete_object(self.0);
    }
}

/// A popup menu this module created, destroyed on drop.
struct OwnedMenu(wm::HMENU);

impl Drop for OwnedMenu {
    fn drop(&mut self) {
        destroy_menu(self.0);
    }
}

/// The icon in the notification area. Removed when dropped.
pub struct TrayIcon {
    /// The hidden window the icon reports to.
    window: HWND,
    /// The icon image, kept alive while the shell shows it.
    _icon: OwnedIcon,
}

impl TrayIcon {
    /// Adds an icon showing `rgba` (`edge × edge` pixels) with `tooltip`,
    /// acting on the top-level window titled `title`.
    ///
    /// `None` if any step fails; a missing tray icon costs the tray icon,
    /// never the app.
    #[must_use]
    pub fn create(rgba: &[u8], edge: u32, title: &str, tooltip: &str) -> Option<Self> {
        TITLE.with(|cell| title.clone_into(&mut cell.borrow_mut()));
        let icon = icon_from_rgba(rgba, edge)?;
        let class = strings::to_wide(&format!("{}-tray", crate::APP_ID));
        let instance = module_handle();
        // A second registration of the same class fails harmlessly.
        register_class(&class, instance);
        let window = create_message_window(&class, instance);
        if window.is_null() {
            return None;
        }
        let mut data = notify_data(window, tooltip);
        data.hIcon = icon.0;
        if !notify(shell::NIM_ADD, &data) {
            destroy_window(window);
            return None;
        }
        Some(Self {
            window,
            _icon: icon,
        })
    }
}

impl Drop for TrayIcon {
    fn drop(&mut self) {
        let data = notify_data(self.window, "");
        notify(shell::NIM_DELETE, &data);
        destroy_window(self.window);
    }
}

/// The window procedure Windows calls; it only hands over to [`dispatch`].
unsafe extern "system" fn window_proc(
    window: HWND,
    message: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    dispatch(window, message, wparam, lparam)
}

/// Handles the icon's clicks; everything else gets the default handling.
fn dispatch(window: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if message != TRAY_MESSAGE {
        return default_window_proc(window, message, wparam, lparam);
    }
    // The low word of `lparam` is the mouse message that happened.
    let event = u32::try_from(lparam & 0xFFFF).unwrap_or(0);
    if event == wm::WM_LBUTTONUP {
        open();
    } else if event == wm::WM_RBUTTONUP {
        show_menu(window);
    }
    0
}

/// Restores and focuses the app's window.
fn open() {
    TITLE.with(|title| window::bring_to_front(&title.borrow(), Owner::ThisProcess));
}

/// Asks the app's window to close.
fn exit() {
    TITLE.with(|title| window::request_close(&title.borrow(), Owner::ThisProcess));
}

/// Shows the right-click menu at the pointer and acts on the choice.
fn show_menu(window: HWND) {
    let Some(menu) = popup_menu() else {
        return;
    };
    let open_label = strings::to_wide(&format!("Open {}", crate::NAME));
    let exit_label = strings::to_wide("Exit");
    append_item(menu.0, wm::MF_STRING, MENU_OPEN, &open_label);
    append_item(menu.0, wm::MF_SEPARATOR, 0, &[0]);
    append_item(menu.0, wm::MF_STRING, MENU_EXIT, &exit_label);
    let Some(point) = cursor_position() else {
        return;
    };
    // Without the foreground the menu does not close when the user clicks
    // elsewhere; the null message afterwards is the documented companion.
    set_foreground(window);
    let choice = track_menu(menu.0, point, window);
    post_null(window);
    match usize::try_from(choice).unwrap_or(0) {
        MENU_OPEN => open(),
        MENU_EXIT => exit(),
        _ => {}
    }
}

/// The notification data for this icon, with `tooltip` truncated to fit.
fn notify_data(window: HWND, tooltip: &str) -> shell::NOTIFYICONDATAW {
    let mut data = zeroed_notify_data();
    data.cbSize = u32::try_from(size_of::<shell::NOTIFYICONDATAW>()).unwrap_or(0);
    data.hWnd = window;
    data.uID = ICON_ID;
    data.uFlags = shell::NIF_ICON | shell::NIF_MESSAGE | shell::NIF_TIP;
    data.uCallbackMessage = TRAY_MESSAGE;
    strings::fill_fixed(&mut data.szTip, tooltip);
    data
}

/// An icon from RGBA pixels: a 32-bit colour bitmap and an empty mask.
fn icon_from_rgba(rgba: &[u8], edge: u32) -> Option<OwnedIcon> {
    let side = usize::try_from(edge).ok()?;
    let length = side.checked_mul(side)?.checked_mul(4)?;
    if rgba.len() < length {
        return None;
    }
    // Windows wants BGRA, top-down here because the height is negative.
    let bgra: Vec<u8> = rgba
        .as_chunks::<4>()
        .0
        .iter()
        .take(side * side)
        .flat_map(|[r, g, b, a]| [*b, *g, *r, *a])
        .collect();
    let height = i32::try_from(edge).ok()?;
    let mut info = zeroed_bitmap_info();
    info.bmiHeader.biSize = u32::try_from(size_of::<gdi::BITMAPINFOHEADER>()).ok()?;
    info.bmiHeader.biWidth = height;
    info.bmiHeader.biHeight = -height;
    info.bmiHeader.biPlanes = 1;
    info.bmiHeader.biBitCount = 32;
    info.bmiHeader.biCompression = gdi::BI_RGB;
    let color = OwnedBitmap(create_dib(&info, &bgra));
    // The mask is 1 bit per pixel, rows padded to 16 bits, all zero: the
    // alpha channel carries the shape.
    let mask_bits = vec![0u8; side.div_ceil(16) * 2 * side];
    let mask = OwnedBitmap(create_mask(edge, &mask_bits));
    if color.0.is_null() || mask.0.is_null() {
        return None;
    }
    let icon = create_icon(color.0, mask.0);
    (!icon.is_null()).then_some(OwnedIcon(icon))
}

/// A zeroed `NOTIFYICONDATAW`, the documented starting state.
fn zeroed_notify_data() -> shell::NOTIFYICONDATAW {
    // SAFETY: a plain C struct of integers, arrays and nullable handles,
    // for which all-zero bits are a valid value.
    unsafe { std::mem::zeroed() }
}

/// A zeroed `BITMAPINFO`.
fn zeroed_bitmap_info() -> gdi::BITMAPINFO {
    // SAFETY: a plain C struct of integers, for which all-zero is valid.
    unsafe { std::mem::zeroed() }
}

/// A zeroed `WNDCLASSW`.
fn zeroed_class() -> wm::WNDCLASSW {
    // SAFETY: a plain C struct of integers, nullable pointers and an
    // `Option` of a function pointer, for which all-zero is valid (`None`).
    unsafe { std::mem::zeroed() }
}

/// This executable's module handle.
fn module_handle() -> HMODULE {
    // SAFETY: a null name asks for the calling executable, which is
    // always loaded; no pointers are written.
    unsafe { GetModuleHandleW(std::ptr::null()) }
}

/// Registers the tray host's window class.
fn register_class(class: &[u16], instance: HMODULE) -> u16 {
    let mut description = zeroed_class();
    description.lpfnWndProc = Some(window_proc);
    description.hInstance = instance;
    description.lpszClassName = class.as_ptr();
    // SAFETY: `description` and the class name it points into are live for
    // the call, and the system copies what it keeps.
    unsafe { wm::RegisterClassW(&description) }
}

/// Creates the hidden message-only window the icon reports to.
fn create_message_window(class: &[u16], instance: HMODULE) -> HWND {
    // SAFETY: `class` is a live NUL-terminated buffer naming a class
    // registered above; `HWND_MESSAGE` makes the window message-only.
    unsafe {
        wm::CreateWindowExW(
            0,
            class.as_ptr(),
            std::ptr::null(),
            0,
            0,
            0,
            0,
            0,
            wm::HWND_MESSAGE,
            std::ptr::null_mut(),
            instance,
            std::ptr::null(),
        )
    }
}

/// Destroys a window this module created.
fn destroy_window(window: HWND) {
    // SAFETY: `window` came from `create_message_window` on this thread.
    unsafe { wm::DestroyWindow(window) };
}

/// The default handling for a message.
fn default_window_proc(window: HWND, message: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    // SAFETY: forwards exactly the arguments Windows passed to the window
    // procedure, on the same thread.
    unsafe { wm::DefWindowProcW(window, message, wparam, lparam) }
}

/// Adds, changes or removes the icon.
fn notify(message: shell::NOTIFY_ICON_MESSAGE, data: &shell::NOTIFYICONDATAW) -> bool {
    // SAFETY: `data` is a live, fully initialised struct whose `cbSize`
    // states its own size; the shell copies it.
    unsafe { shell::Shell_NotifyIconW(message, data) != 0 }
}

/// A 32-bit DIB section holding `bgra`.
fn create_dib(info: &gdi::BITMAPINFO, bgra: &[u8]) -> gdi::HBITMAP {
    let mut bits = std::ptr::null_mut();
    // SAFETY: `info` describes a top-down 32-bit bitmap; `bits` receives
    // the section's pixel pointer, which is written below only when the
    // call succeeded and only for the size `info` states.
    let bitmap = unsafe {
        gdi::CreateDIBSection(
            std::ptr::null_mut(),
            info,
            gdi::DIB_RGB_COLORS,
            &mut bits,
            std::ptr::null_mut(),
            0,
        )
    };
    if !bitmap.is_null() && !bits.is_null() {
        copy_pixels(bits, bgra);
    }
    bitmap
}

/// Copies `bgra` into a DIB section's pixel memory.
fn copy_pixels(bits: *mut core::ffi::c_void, bgra: &[u8]) {
    // SAFETY: `bits` is the pixel memory of a DIB section created for
    // exactly `bgra.len()` bytes (edge × edge × 4), and nothing else
    // references it yet.
    unsafe { std::ptr::copy_nonoverlapping(bgra.as_ptr(), bits.cast::<u8>(), bgra.len()) };
}

/// A 1-bit monochrome bitmap from `bits`.
fn create_mask(edge: u32, bits: &[u8]) -> gdi::HBITMAP {
    let side = i32::try_from(edge).unwrap_or(0);
    // SAFETY: `bits` holds a full 1-bpp image of `edge × edge`, rows
    // padded to 16 bits as the call requires, and is copied by it.
    unsafe { gdi::CreateBitmap(side, side, 1, 1, bits.as_ptr().cast()) }
}

/// An icon from a colour bitmap and a mask; both are copied.
fn create_icon(color: gdi::HBITMAP, mask: gdi::HBITMAP) -> wm::HICON {
    let info = wm::ICONINFO {
        fIcon: 1,
        xHotspot: 0,
        yHotspot: 0,
        hbmMask: mask,
        hbmColor: color,
    };
    // SAFETY: `info` is live for the call and names two valid bitmaps,
    // which the system copies rather than adopts.
    unsafe { wm::CreateIconIndirect(&info) }
}

/// Destroys an icon this module created.
fn destroy_icon(icon: wm::HICON) {
    // SAFETY: `icon` came from `create_icon` and is destroyed once.
    unsafe { wm::DestroyIcon(icon) };
}

/// Deletes a bitmap this module created.
fn delete_object(bitmap: gdi::HBITMAP) {
    // SAFETY: `bitmap` came from this module and is deleted once.
    unsafe { gdi::DeleteObject(bitmap) };
}

/// A new, empty popup menu.
fn popup_menu() -> Option<OwnedMenu> {
    // SAFETY: no arguments; returns null on failure.
    let menu = unsafe { wm::CreatePopupMenu() };
    (!menu.is_null()).then_some(OwnedMenu(menu))
}

/// Appends an item to `menu`.
fn append_item(menu: wm::HMENU, flags: wm::MENU_ITEM_FLAGS, id: usize, text: &[u16]) {
    // SAFETY: `text` is a live NUL-terminated buffer the menu copies.
    unsafe { wm::AppendMenuW(menu, flags, id, text.as_ptr()) };
}

/// Destroys a menu this module created.
fn destroy_menu(menu: wm::HMENU) {
    // SAFETY: `menu` came from `popup_menu` and is destroyed once.
    unsafe { wm::DestroyMenu(menu) };
}

/// Shows `menu` at `at` and returns the chosen command, 0 for none.
fn track_menu(menu: wm::HMENU, at: POINT, window: HWND) -> i32 {
    // SAFETY: `menu` and `window` are live handles from this module; a
    // null rectangle is documented as "no exclusion area".
    unsafe {
        wm::TrackPopupMenu(
            menu,
            wm::TPM_RETURNCMD | wm::TPM_RIGHTBUTTON,
            at.x,
            at.y,
            0,
            window,
            std::ptr::null(),
        )
    }
}

/// The pointer's position in screen coordinates.
fn cursor_position() -> Option<POINT> {
    let mut point = POINT { x: 0, y: 0 };
    // SAFETY: `point` is a live local the call writes into.
    let ok = unsafe { wm::GetCursorPos(&mut point) };
    (ok != 0).then_some(point)
}

/// Asks for `window` to become the foreground window.
fn set_foreground(window: HWND) {
    // SAFETY: takes the handle by value; Windows may refuse, harmlessly.
    unsafe { wm::SetForegroundWindow(window) };
}

/// Posts `WM_NULL` to `window`, which lets a tracked menu dismiss properly.
fn post_null(window: HWND) {
    // SAFETY: posting copies the arguments; no pointers are passed.
    unsafe { wm::PostMessageW(window, wm::WM_NULL, 0, 0) };
}
