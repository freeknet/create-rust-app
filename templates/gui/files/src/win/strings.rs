// ============================================================================
// Module:       @@module@@
// Description:  Marshalling between Rust strings and the UTF-16 Win32 speaks.
//
// Dependencies: std only
// ============================================================================

//! Rust strings in, UTF-16 out, and back.
//!
//! Win32 takes NUL-terminated wide strings. [`to_wide`] builds one; the
//! returned `Vec` must outlive the call it is passed to, which is why every
//! caller binds it to a local first rather than calling `as_ptr()` on a
//! temporary that is dropped before the call.
//!
//! Lossy on the way back: a name that is not valid UTF-16 still has to be
//! shown, so a malformed sequence becomes U+FFFD rather than an error.

/// A Rust string as a NUL-terminated UTF-16 buffer, for passing *into* Win32.
///
/// An interior NUL would silently truncate the string on the Win32 side, so
/// it is replaced with U+FFFD rather than passed through.
#[must_use]
pub fn to_wide(text: &str) -> Vec<u16> {
    text.encode_utf16()
        .map(|unit| if unit == 0 { 0xFFFD } else { unit })
        .chain(std::iter::once(0))
        .collect()
}

/// Reads a NUL-terminated wide string out of a buffer Win32 filled,
/// stopping at the first NUL or the end of the buffer, whichever is first.
#[must_use]
pub fn from_wide_nul(buffer: &[u16]) -> String {
    let end = buffer
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(buffer.len());
    String::from_utf16_lossy(buffer.get(..end).unwrap_or(&[]))
}

/// Copies `text` into a fixed wide buffer, truncating to fit and always
/// leaving it NUL-terminated (a tray tooltip, a window class name).
pub fn fill_fixed(buffer: &mut [u16], text: &str) {
    let Some(room) = buffer.len().checked_sub(1) else {
        return;
    };
    let wide = to_wide(text);
    let mut written = 0;
    for (slot, unit) in buffer.iter_mut().zip(wide.iter().take(room)) {
        *slot = *unit;
        written += 1;
    }
    for slot in buffer.iter_mut().skip(written) {
        *slot = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_round_trip_preserves_the_text() {
        for text in ["", "app.exe", r"C:\Program Files\App", "日本語", "crab 🦀"] {
            assert_eq!(from_wide_nul(&to_wide(text)), text);
        }
    }

    #[test]
    fn the_buffer_is_nul_terminated() {
        assert_eq!(to_wide("ab"), vec![u16::from(b'a'), u16::from(b'b'), 0]);
    }

    #[test]
    fn an_interior_nul_cannot_truncate_the_string() {
        let wide = to_wide("a\0b");
        assert_eq!(wide.iter().filter(|unit| **unit == 0).count(), 1);
    }

    #[test]
    fn a_buffer_without_a_nul_is_read_to_its_end_not_past_it() {
        let buffer = [u16::from(b'h'), u16::from(b'i')];
        assert_eq!(from_wide_nul(&buffer), "hi");
    }

    #[test]
    fn a_fixed_buffer_truncates_and_terminates() {
        let mut buffer = [0xFFFF_u16; 4];
        fill_fixed(&mut buffer, "abcdef");
        assert_eq!(from_wide_nul(&buffer), "abc");
        assert_eq!(buffer.last(), Some(&0));
    }
}
