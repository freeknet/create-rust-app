// ============================================================================
// Module:       @@module@@
// Description:  The only part of the crate that talks to Win32, wrapped so that
//               nothing above it contains the word `unsafe`.
//
// Dependencies: windows-sys; sibling modules per subsystem. No egui.
// ============================================================================

//! Everything that talks to Windows.
//!
//! ## The discipline
//!
//! Every FFI call lives inside a *safe leaf wrapper*: one private function
//! that takes ordinary Rust arguments, contains a single `unsafe` block
//! holding **the call and nothing else**, and returns a safe type.
//! Arithmetic, error handling and string marshalling stay outside the
//! block. Three rules make that hold rather than merely being a preference:
//!
//! - **Every `unsafe` block carries a `// SAFETY:` comment** stating which
//!   pointer points at what, for how long, and who guarantees the length.
//! - **Anything with a matching close or free call gets an owning wrapper
//!   with a `Drop` impl**, so an early return cannot leak it.
//! - **No caller of these needs `unsafe` itself**, and no code outside this
//!   module contains any.
// @if unsafeCheck
//!
//! `unsafe_check` (a test) fails the build for an `unsafe` block outside
//! `src/win/`, in test code, or two of them in one function.
// @end

pub mod dialog;
// @if singleInstance
pub mod single_instance;
// @end
pub mod strings;
// @if tray
pub mod tray;
// @end
// @if tray | singleInstance
pub mod window;
// @end
