// ============================================================================
// Module:       @@module@@
// Description:  The application mark: its geometry, its colours (derived once
//               from the scaffolded accent) and a software rasteriser for it.
//
// Dependencies: crate::color. Deliberately free of egui and of the theme: a
//               logo that restyles itself is not a logo.
// ============================================================================

//! The application mark.
//!
//! Four nested half-rings, a small rainbow standing on a baseline, on a
//! dark rounded plate. The geometry is stated once, here, in unit
//! coordinates, and three renderers consume it: `gui::icons::paint_brand`
//! draws it into the header with egui, `gui::icons::app_icon` rasterises it
//! for the window icon, and `examples/brand_assets.rs` writes the `.ico`
//! that `build.rs` embeds into the executable. One definition is what stops
//! the mark coming out subtly different in the taskbar and in the window.
//!
//! ## Why the colours do not follow the theme
//!
//! Every other colour comes from the active palette. The mark is the
//! exception: it has to look the same in the header, the taskbar and
//! Explorer, two of which this app does not draw. So its colours are fixed
//! at build time — a rainbow at one perceived lightness, centred on the hue
//! of [`crate::ACCENT`] — and its lightness is stated rather than taken from
//! the accent, so every band clears its contrast against the plate whatever
//! accent was picked.

pub use crate::{NAME, TAGLINE};

use crate::color::{Oklch, Ramp, Rgb};

/// How many bands the mark has.
pub const BANDS: usize = 4;

/// The centre of the rings, in unit coordinates.
pub const CENTRE: (f32, f32) = (0.5, 0.70);

/// The outer radius of the outermost band.
pub const OUTER_RADIUS: f32 = 0.38;

/// Each band's thickness.
pub const BAND_WIDTH: f32 = 0.075;

/// The gap between bands. Small enough to read as one shape, large enough
/// to survive at 16 px.
pub const BAND_GAP: f32 = 0.02;

/// The plate the mark sits on in the icon. The header draws without it.
pub const PLATE: Rgb = Rgb::new(0x11, 0x14, 0x1c);

/// The plate's corner radius, as a fraction of its size.
pub const PLATE_RADIUS: f32 = 0.22;

/// The perceived lightness of every band (OKLCh `l`).
const BAND_LIGHTNESS: f32 = 0.80;

/// The chroma of every band.
const BAND_CHROMA: f32 = 0.15;

/// How many degrees of hue the bands span.
const BAND_SPAN: f32 = 200.0;

// The innermost band must still be a ring, not a disc.
const _: () = assert!(
    OUTER_RADIUS - (BANDS as f32) * (BAND_WIDTH + BAND_GAP) + BAND_GAP > 0.0,
    "the bands do not fit inside the outer radius"
);

/// One band's radii, as `(inner, outer)`, outermost first.
#[must_use]
pub fn band(index: usize) -> (f32, f32) {
    let outer = OUTER_RADIUS - index as f32 * (BAND_WIDTH + BAND_GAP);
    (outer - BAND_WIDTH, outer)
}

/// The bands' colours, outermost first.
#[must_use]
pub fn colors() -> [Rgb; BANDS] {
    let hue = Oklch::from_rgb(crate::ACCENT).h;
    let ramp = Ramp::at_lightness(hue, BAND_SPAN, BAND_LIGHTNESS, BAND_CHROMA);
    std::array::from_fn(|index| ramp.at(index, BANDS))
}

/// The mark rasterised to `edge × edge` RGBA pixels, plate included,
/// transparent outside it.
///
/// Four-by-four supersampled, so the curves are smooth at every icon size
/// rather than stair-stepped.
#[must_use]
pub fn rasterise(edge: u32) -> Vec<u8> {
    /// Samples per pixel along each axis.
    const SUB: u32 = 4;
    let colors = colors();
    let size = edge as f32;
    let mut pixels = Vec::with_capacity((edge * edge * 4) as usize);
    for y in 0..edge {
        for x in 0..edge {
            let mut sum = [0.0f32; 3];
            let mut covered = 0u32;
            for sy in 0..SUB {
                for sx in 0..SUB {
                    let u = (x as f32 + (sx as f32 + 0.5) / SUB as f32) / size;
                    let v = (y as f32 + (sy as f32 + 0.5) / SUB as f32) / size;
                    if let Some(color) = sample(u, v, &colors) {
                        sum[0] += f32::from(color.r);
                        sum[1] += f32::from(color.g);
                        sum[2] += f32::from(color.b);
                        covered += 1;
                    }
                }
            }
            if covered == 0 {
                pixels.extend_from_slice(&[0, 0, 0, 0]);
                continue;
            }
            let n = covered as f32;
            let alpha = (covered * 255 / (SUB * SUB)) as u8;
            pixels.extend_from_slice(&[
                (sum[0] / n).round() as u8,
                (sum[1] / n).round() as u8,
                (sum[2] / n).round() as u8,
                alpha,
            ]);
        }
    }
    pixels
}

/// The colour at unit point `(u, v)`, or `None` outside the plate.
fn sample(u: f32, v: f32, colors: &[Rgb; BANDS]) -> Option<Rgb> {
    if !inside_rounded(u, v, PLATE_RADIUS) {
        return None;
    }
    let (cx, cy) = CENTRE;
    if v <= cy {
        let distance = ((u - cx).powi(2) + (v - cy).powi(2)).sqrt();
        for (index, color) in colors.iter().enumerate() {
            let (inner, outer) = band(index);
            if distance >= inner && distance <= outer {
                return Some(*color);
            }
        }
    }
    Some(PLATE)
}

/// Whether a unit point is inside the unit square with rounded corners.
fn inside_rounded(u: f32, v: f32, radius: f32) -> bool {
    if !(0.0..=1.0).contains(&u) || !(0.0..=1.0).contains(&v) {
        return false;
    }
    let cx = u.clamp(radius, 1.0 - radius);
    let cy = v.clamp(radius, 1.0 - radius);
    (u - cx).powi(2) + (v - cy).powi(2) <= radius * radius
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_bands_nest_without_touching() {
        for index in 1..BANDS {
            let (inner_of_outer, _) = band(index - 1);
            let (_, outer_of_inner) = band(index);
            assert!(
                outer_of_inner < inner_of_outer,
                "bands {} and {index} overlap",
                index - 1
            );
        }
    }

    #[test]
    fn the_mark_fits_inside_the_plates_rounded_corners() {
        let (cx, cy) = CENTRE;
        // The outermost band's extreme points: left, right and top.
        for (u, v) in [
            (cx - OUTER_RADIUS, cy),
            (cx + OUTER_RADIUS, cy),
            (cx, cy - OUTER_RADIUS),
        ] {
            assert!(inside_rounded(u, v, PLATE_RADIUS), "({u}, {v}) is clipped");
        }
    }

    #[test]
    fn the_mark_is_optically_centred() {
        let top = CENTRE.1 - OUTER_RADIUS;
        let middle = f32::midpoint(top, CENTRE.1);
        assert!(
            (middle - 0.5).abs() < 0.03,
            "the ink is centred at {middle}"
        );
    }

    #[test]
    fn every_band_is_visible_against_the_plate() {
        for (index, color) in colors().iter().enumerate() {
            let ratio = color.contrast(PLATE);
            assert!(ratio >= 3.0, "band {index} is only {ratio:.2}:1");
        }
    }

    #[test]
    fn adjacent_bands_are_tellable_apart() {
        let colors = colors();
        for (index, pair) in colors.windows(2).enumerate() {
            if let [a, b] = pair {
                let delta = u32::from(a.r.abs_diff(b.r))
                    + u32::from(a.g.abs_diff(b.g))
                    + u32::from(a.b.abs_diff(b.b));
                assert!(delta >= 40, "bands {index} and {} are too close", index + 1);
            }
        }
    }

    #[test]
    fn the_raster_is_the_size_it_claims_and_transparent_in_its_corners() {
        let edge = 32;
        let pixels = rasterise(edge);
        assert_eq!(pixels.len(), (edge * edge * 4) as usize);
        assert_eq!(pixels.get(3), Some(&0), "the corner is outside the plate");
        let centre = ((edge / 2 * edge + edge / 2) * 4 + 3) as usize;
        assert_eq!(pixels.get(centre), Some(&255), "the centre is opaque");
    }

    #[test]
    fn the_outer_band_appears_in_the_raster() {
        let edge = 64;
        let pixels = rasterise(edge);
        let (inner, outer) = band(0);
        let radius = f32::midpoint(inner, outer);
        let x = ((CENTRE.0 * edge as f32) as u32).min(edge - 1);
        let y = (((CENTRE.1 - radius) * edge as f32) as u32).min(edge - 1);
        let index = ((y * edge + x) * 4) as usize;
        let pixel = pixels.get(index..index + 3);
        let expected = colors()[0];
        assert_eq!(pixel, Some(&[expected.r, expected.g, expected.b][..]));
    }
}
