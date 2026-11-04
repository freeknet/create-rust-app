// ============================================================================
// Module:       @@module@@
// Description:  The notification-area icon, as the app sees it: created with
//               the window, removed when the app is dropped.
//
// Dependencies: egui (the Context it is created alongside); crate::win::tray
// ============================================================================

//! The tray icon.
//!
//! On Windows the icon lives in [`crate::win::tray`]: a left click restores
//! and focuses the window, a right click offers Open and Exit, and Exit
//! closes the window the way its own close button does, so the app still
//! shuts down normally and saves its preferences. Elsewhere there is no
//! tray, and [`Tray::new`] says so with `None`.
//!
//! The icon's pixels come from the same source as the window icon, so the
//! two cannot disagree.

/// The icon's edge in pixels: the small-icon size at 200% scaling, which
/// Windows scales down cleanly for 100% and 150%.
pub const EDGE: u32 = 32;

/// The tray icon. Dropping it removes the icon.
pub struct Tray {
    /// The platform icon.
    #[cfg(windows)]
    _icon: crate::win::tray::TrayIcon,
}

impl Tray {
    /// Adds the icon. `None` where there is no tray, or the shell refused:
    /// a missing tray icon costs the icon, never the app.
    #[must_use]
    pub fn new(ctx: &egui::Context) -> Option<Self> {
        // Taken for symmetry with the rest of `App::new`; the icon acts on
        // the window through Win32 and needs nothing from egui today.
        let _ = ctx;
        #[cfg(windows)]
        {
            let tooltip = format!("{} — {}", crate::NAME, crate::TAGLINE);
            let icon = crate::win::tray::TrayIcon::create(&pixels(), EDGE, crate::NAME, &tooltip)?;
            Some(Self { _icon: icon })
        }
        #[cfg(not(windows))]
        {
            None
        }
    }
}

/// The icon as `EDGE × EDGE` RGBA pixels.
#[must_use]
pub fn pixels() -> Vec<u8> {
    // @if brand
    crate::brand::rasterise(EDGE)
    // @else
    // Without the brand mark: a disc in the accent colour.
    let centre = EDGE as f32 / 2.0;
    let radius = centre - 1.0;
    let accent = crate::ACCENT;
    let mut rgba = Vec::with_capacity((EDGE * EDGE * 4) as usize);
    for y in 0..EDGE {
        for x in 0..EDGE {
            let (dx, dy) = (x as f32 + 0.5 - centre, y as f32 + 0.5 - centre);
            let inside = dx * dx + dy * dy <= radius * radius;
            let alpha = if inside { 255 } else { 0 };
            rgba.extend_from_slice(&[accent.r, accent.g, accent.b, alpha]);
        }
    }
    rgba
    // @end
}

#[cfg(test)]
mod tests {
    #[test]
    fn the_icon_has_one_rgba_pixel_per_point_of_its_square() {
        let pixels = super::pixels();
        assert_eq!(pixels.len(), (super::EDGE * super::EDGE * 4) as usize);
        assert!(
            pixels
                .as_chunks::<4>()
                .0
                .iter()
                .any(|[_, _, _, alpha]| *alpha == 255),
            "the icon must not be fully transparent"
        );
    }
}
