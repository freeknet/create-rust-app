// ============================================================================
// Module:       @@module@@
// Description:  The colour type the palette is written in, the OKLCh maths that
//               derives shades from it, and the WCAG contrast check.
//
// Dependencies: std only. Deliberately free of egui: the palette is data, and
//               the contrast rules are testable without a window.
// ============================================================================

//! Colour as data, one layer below the drawing code.
//!
//! [`Rgb`] is what a theme file parses into and what
//! [`crate::theme::Palette`] is made of. It is not an egui type on purpose:
//! the shade derivation and the contrast rules that reject an unreadable
//! theme are pure arithmetic, so their tests run on any machine rather than
//! needing a GPU and a window. `gui::ui::theme` converts to `Color32` at the
//! boundary, once.
//!
//! ## The rainbow is a ramp, built in OKLCh
//!
//! A theme states an accent and a hue span, and [`Ramp`] hands out evenly
//! spaced hues across it, so the third series is the same colour in a chart
//! as in the legend beside it without either holding a literal.
//!
//! The ramp is built in [`Oklch`] rather than HSL because a ramp has one job
//! beyond being colourful: no entry may look more important than its
//! neighbours. HSL's `l` is not perceived lightness (yellow at `l = 57%` is
//! several times as luminous as blue at the same value); OKLCh's is, so
//! holding it constant while sweeping the hue gives colours of equal visual
//! weight. Out-of-gamut colours are brought back by walking the chroma down
//! rather than clipping channels, which would shift the hue.

/// An opaque 24-bit colour.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub struct Rgb {
    /// Red channel, 0..=255.
    pub r: u8,
    /// Green channel, 0..=255.
    pub g: u8,
    /// Blue channel, 0..=255.
    pub b: u8,
}

impl Rgb {
    /// Constructs a colour from its channels.
    #[must_use]
    pub const fn new(r: u8, g: u8, b: u8) -> Self {
        Self { r, g, b }
    }

    /// Parses `#rrggbb`, case-insensitively, at compile time.
    ///
    /// The `const` sibling of [`Rgb::parse`], for colours stated in source
    /// (the scaffolded accent). Accepts only the six-digit form with its
    /// `#`, which is the only form the scaffolder writes.
    #[must_use]
    pub const fn from_hex(text: &str) -> Option<Self> {
        /// One hex digit's value.
        const fn nibble(byte: u8) -> Option<u8> {
            match byte {
                b'0'..=b'9' => Some(byte - b'0'),
                b'a'..=b'f' => Some(byte - b'a' + 10),
                b'A'..=b'F' => Some(byte - b'A' + 10),
                _ => None,
            }
        }
        /// The byte at `index`, as two hex digits from there.
        const fn pair(bytes: &[u8], index: usize) -> Option<u8> {
            let (Some(hi), Some(lo)) = (nibble(bytes[index]), nibble(bytes[index + 1])) else {
                return None;
            };
            Some(hi * 16 + lo)
        }
        let bytes = text.as_bytes();
        if bytes.len() != 7 || bytes[0] != b'#' {
            return None;
        }
        match (pair(bytes, 1), pair(bytes, 3), pair(bytes, 5)) {
            (Some(r), Some(g), Some(b)) => Some(Self::new(r, g, b)),
            _ => None,
        }
    }

    /// Parses `#rrggbb` or `#rgb`, case-insensitively, with the `#`
    /// optional.
    ///
    /// Returns `None` rather than a fallback for anything else: a theme
    /// file with a typo in it should be reported as broken, not silently
    /// rendered in black.
    #[must_use]
    pub fn parse(text: &str) -> Option<Self> {
        let hex = text.trim().trim_start_matches('#');
        let nibble = |c: char| c.to_digit(16).and_then(|d| u8::try_from(d).ok());
        let mut chars = hex.chars();
        match hex.len() {
            // `#rgb` shorthand doubles each nibble, as CSS does.
            3 => {
                let r = nibble(chars.next()?)?;
                let g = nibble(chars.next()?)?;
                let b = nibble(chars.next()?)?;
                Some(Self::new(r * 17, g * 17, b * 17))
            }
            6 => {
                let mut byte = || -> Option<u8> {
                    let hi = nibble(chars.next()?)?;
                    let lo = nibble(chars.next()?)?;
                    Some(hi * 16 + lo)
                };
                let r = byte()?;
                let g = byte()?;
                let b = byte()?;
                Some(Self::new(r, g, b))
            }
            _ => None,
        }
    }

    /// Renders back to `#rrggbb`.
    #[must_use]
    pub fn to_hex(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
    }

    /// Mixes towards `other`, `t` clamped to 0..=1.
    ///
    /// Channel-wise in sRGB. Every use is a small step between two close
    /// colours (a hover lift, a tint), where sRGB blending is what the eye
    /// expects; long interpolations go through [`Ramp`].
    #[must_use]
    pub fn lerp(self, other: Self, t: f32) -> Self {
        // `f32::clamp` propagates a NaN, and a NaN cast to u8 is 0 — so one
        // bad blend factor would silently paint black.
        let t = if t.is_nan() { 0.0 } else { t.clamp(0.0, 1.0) };
        let mix = |a: u8, b: u8| -> u8 {
            let a = f32::from(a);
            let b = f32::from(b);
            channel((a + (b - a) * t) / 255.0)
        };
        Self::new(
            mix(self.r, other.r),
            mix(self.g, other.g),
            mix(self.b, other.b),
        )
    }

    /// Relative luminance, per WCAG 2.1.
    #[must_use]
    pub fn luminance(self) -> f32 {
        0.2126 * to_linear(self.r) + 0.7152 * to_linear(self.g) + 0.0722 * to_linear(self.b)
    }

    /// The WCAG contrast ratio between two colours, from 1.0 (identical)
    /// to 21.0 (black on white).
    #[must_use]
    pub fn contrast(self, other: Self) -> f32 {
        let a = self.luminance();
        let b = other.luminance();
        let (lighter, darker) = if a > b { (a, b) } else { (b, a) };
        (lighter + 0.05) / (darker + 0.05)
    }

    /// Whether this colour is dark enough that light text belongs on it.
    ///
    /// The crossover where black and white text score the same contrast is
    /// a luminance of about 0.179.
    #[must_use]
    pub fn prefers_light_text(self) -> bool {
        self.luminance() < 0.179
    }
}

/// A colour in the Oklab perceptual space.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Oklab {
    /// Perceived lightness, 0..=1.
    pub l: f32,
    /// Green–red opponent axis.
    pub a: f32,
    /// Blue–yellow opponent axis.
    pub b: f32,
}

impl Oklab {
    /// Converts from sRGB.
    #[must_use]
    pub fn from_rgb(rgb: Rgb) -> Self {
        let (r, g, b) = (to_linear(rgb.r), to_linear(rgb.g), to_linear(rgb.b));
        let l = (0.412_221_47 * r + 0.536_332_54 * g + 0.051_445_995 * b).cbrt();
        let m = (0.211_903_5 * r + 0.680_699_5 * g + 0.107_396_96 * b).cbrt();
        let s = (0.088_302_46 * r + 0.281_718_85 * g + 0.629_978_5 * b).cbrt();
        Self {
            l: 0.210_454_26 * l + 0.793_617_8 * m - 0.004_072_047 * s,
            a: 1.977_998_5 * l - 2.428_592_2 * m + 0.450_593_7 * s,
            b: 0.025_904_037 * l + 0.782_771_77 * m - 0.808_675_77 * s,
        }
    }

    /// Converts to linear-light RGB, **without** clamping, so a caller can
    /// tell whether the colour is inside the sRGB gamut.
    fn to_linear_rgb(self) -> [f32; 3] {
        let l = (self.l + 0.396_337_78 * self.a + 0.215_803_76 * self.b).powi(3);
        let m = (self.l - 0.105_561_346 * self.a - 0.063_854_17 * self.b).powi(3);
        let s = (self.l - 0.089_484_18 * self.a - 1.291_485_5 * self.b).powi(3);
        [
            4.076_741_7 * l - 3.307_711_6 * m + 0.230_969_94 * s,
            -1.268_438 * l + 2.609_757_4 * m - 0.341_319_38 * s,
            -0.004_196_086_3 * l - 0.703_418_6 * m + 1.707_614_7 * s,
        ]
    }
}

/// [`Oklab`] in cylindrical form: lightness, chroma, hue.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Oklch {
    /// Perceived lightness, 0..=1.
    pub l: f32,
    /// Chroma, distance from grey. About 0.33 is the most sRGB can express.
    pub c: f32,
    /// Hue in degrees, 0..360.
    pub h: f32,
}

impl Oklch {
    /// Constructs a colour, wrapping the hue and clamping the rest.
    #[must_use]
    pub fn new(l: f32, c: f32, h: f32) -> Self {
        Self {
            l: if l.is_nan() { 0.0 } else { l.clamp(0.0, 1.0) },
            c: if c.is_nan() { 0.0 } else { c.max(0.0) },
            h: if h.is_finite() {
                h.rem_euclid(360.0)
            } else {
                0.0
            },
        }
    }

    /// Converts from sRGB.
    #[must_use]
    pub fn from_rgb(rgb: Rgb) -> Self {
        let lab = Oklab::from_rgb(rgb);
        Self {
            l: lab.l,
            c: (lab.a * lab.a + lab.b * lab.b).sqrt(),
            h: lab.b.atan2(lab.a).to_degrees().rem_euclid(360.0),
        }
    }

    /// The [`Oklab`] this is the polar form of.
    fn to_lab(self) -> Oklab {
        let radians = self.h.to_radians();
        Oklab {
            l: self.l,
            a: self.c * radians.cos(),
            b: self.c * radians.sin(),
        }
    }

    /// Converts to sRGB, reducing chroma until the colour fits the gamut.
    ///
    /// Bisection rather than an analytic boundary: the boundary has no
    /// closed form, and the tolerance below is far under one 8-bit step.
    #[must_use]
    pub fn to_rgb(self) -> Rgb {
        /// How close to the true gamut boundary to bisect.
        const TOLERANCE: f32 = 0.000_1;

        fn fits(linear: [f32; 3]) -> bool {
            linear
                .iter()
                .all(|value| *value >= -TOLERANCE && *value <= 1.0 + TOLERANCE)
        }

        let full = self.to_lab().to_linear_rgb();
        let linear = if fits(full) {
            full
        } else {
            // Chroma zero is grey, always in gamut, so the search terminates.
            let (mut low, mut high) = (0.0f32, self.c);
            let mut best = Self::new(self.l, 0.0, self.h).to_lab().to_linear_rgb();
            while high - low > TOLERANCE {
                let middle = f32::midpoint(low, high);
                let candidate = Self::new(self.l, middle, self.h).to_lab().to_linear_rgb();
                if fits(candidate) {
                    best = candidate;
                    low = middle;
                } else {
                    high = middle;
                }
            }
            best
        };
        Rgb::new(
            from_linear(linear[0]),
            from_linear(linear[1]),
            from_linear(linear[2]),
        )
    }
}

/// Expands one sRGB channel to linear light.
fn to_linear(value: u8) -> f32 {
    let v = f32::from(value) / 255.0;
    if v <= 0.040_45 {
        v / 12.92
    } else {
        ((v + 0.055) / 1.055).powf(2.4)
    }
}

/// Encodes one linear-light channel back to an sRGB byte.
fn from_linear(value: f32) -> u8 {
    if !value.is_finite() {
        return 0;
    }
    let v = value.clamp(0.0, 1.0);
    let encoded = if v <= 0.003_130_8 {
        v * 12.92
    } else {
        1.055 * v.powf(1.0 / 2.4) - 0.055
    };
    channel(encoded)
}

/// A 0..=1 fraction as a channel byte, rounded and clamped.
fn channel(fraction: f32) -> u8 {
    let scaled = (fraction * 255.0).round();
    if scaled.is_nan() || scaled <= 0.0 {
        0
    } else if scaled >= 255.0 {
        255
    } else {
        // In 1..255 after the checks above, so the cast is exact.
        scaled as u8
    }
}

/// An evenly spaced band of hues at one perceived lightness.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Ramp {
    /// Where the band starts, in degrees.
    start: f32,
    /// How far it runs, in degrees.
    span: f32,
    /// The chroma every colour in the band shares.
    chroma: f32,
    /// The perceived lightness every colour in the band shares.
    lightness: f32,
}

impl Ramp {
    /// Builds a ramp centred on `accent`, running `span` degrees, at the
    /// accent's own lightness and (bounded) chroma.
    #[must_use]
    pub fn around(accent: Rgb, span: f32) -> Self {
        let base = Oklch::from_rgb(accent);
        Self::at_lightness(base.h, span, base.l, base.c)
    }

    /// Builds a ramp centred on `hue` at a stated lightness and chroma.
    ///
    /// For colours that must hold a contrast whatever the seed was — the
    /// mark's bars against their dark plate, say.
    #[must_use]
    pub fn at_lightness(hue: f32, span: f32, lightness: f32, chroma: f32) -> Self {
        Self {
            start: hue - span / 2.0,
            span,
            chroma: chroma.clamp(MIN_RAMP_CHROMA, MAX_RAMP_CHROMA),
            lightness: lightness.clamp(0.0, 1.0),
        }
    }

    /// The colour at position `index` of `count`, first at the start of the
    /// band and last at its end. A count of zero or one is the centre.
    #[must_use]
    pub fn at(self, index: usize, count: usize) -> Rgb {
        if count <= 1 {
            return self.hue(0.5);
        }
        let t = index.min(count - 1) as f32 / (count - 1) as f32;
        self.hue(t)
    }

    /// The colour at fraction `t` along the band.
    #[must_use]
    pub fn hue(self, t: f32) -> Rgb {
        Oklch::new(self.lightness, self.chroma, self.start + self.span * t).to_rgb()
    }

    /// The perceived lightness every colour in this ramp shares.
    #[must_use]
    pub fn lightness(self) -> f32 {
        self.lightness
    }
}

/// The least chroma a ramp is allowed, however grey its accent.
const MIN_RAMP_CHROMA: f32 = 0.09;

/// The most chroma a ramp will ask for, so the whole band stays in gamut and
/// therefore evenly saturated.
const MAX_RAMP_CHROMA: f32 = 0.16;

#[cfg(test)]
mod tests {
    use super::*;

    /// Summed absolute channel difference, widened so it cannot overflow.
    fn distance(a: Rgb, b: Rgb) -> u32 {
        u32::from(a.r.abs_diff(b.r)) + u32::from(a.g.abs_diff(b.g)) + u32::from(a.b.abs_diff(b.b))
    }

    #[test]
    fn hex_parses_in_both_lengths_and_either_case() {
        assert_eq!(Rgb::parse("#1e1e1e"), Some(Rgb::new(30, 30, 30)));
        assert_eq!(Rgb::parse("1E1E1E"), Some(Rgb::new(30, 30, 30)));
        assert_eq!(Rgb::parse("#f0a"), Some(Rgb::new(255, 0, 170)));
    }

    #[test]
    fn the_const_parser_agrees_with_the_runtime_one() {
        for text in ["#00e5ff", "#00E5FF", "#123abc", "#000000", "#ffffff"] {
            assert_eq!(Rgb::from_hex(text), Rgb::parse(text), "{text}");
        }
        for bad in ["", "#", "00e5ff", "#00e5f", "#00e5ffa", "#zzzzzz"] {
            assert_eq!(Rgb::from_hex(bad), None, "{bad:?} should not parse");
        }
    }

    #[test]
    fn a_malformed_hex_code_is_rejected_rather_than_defaulted() {
        for bad in ["", "#", "#12", "#12345", "#1234567", "#zzzzzz", "nope"] {
            assert_eq!(Rgb::parse(bad), None, "{bad:?} should not parse");
        }
    }

    #[test]
    fn hex_round_trips() {
        let color = Rgb::new(0x3c, 0x99, 0xe6);
        assert_eq!(color.to_hex(), "#3c99e6");
        assert_eq!(Rgb::parse(&color.to_hex()), Some(color));
    }

    #[test]
    fn contrast_matches_the_wcag_reference_points() {
        let black = Rgb::new(0, 0, 0);
        let white = Rgb::new(255, 255, 255);
        assert!(
            (black.contrast(white) - 21.0).abs() < 0.01,
            "black on white"
        );
        assert!((white.contrast(white) - 1.0).abs() < 0.001, "self is 1:1");
    }

    #[test]
    fn a_nan_blend_leaves_the_colour_alone_rather_than_painting_black() {
        let color = Rgb::new(200, 100, 50);
        assert_eq!(color.lerp(Rgb::new(0, 0, 0), f32::NAN), color);
    }

    #[test]
    fn oklch_round_trips_within_a_rounding_step() {
        for original in [
            Rgb::new(0x4c, 0xc9, 0xf0),
            Rgb::new(0xf1, 0x4c, 0x4c),
            Rgb::new(0x18, 0x18, 0x18),
            Rgb::new(255, 255, 255),
            Rgb::new(0, 0, 0),
        ] {
            let back = Oklch::from_rgb(original).to_rgb();
            assert!(
                distance(original, back) <= 3,
                "{original:?} became {back:?}"
            );
        }
    }

    #[test]
    fn an_out_of_gamut_colour_keeps_its_hue_and_lightness() {
        let asked = Oklch::new(0.55, 0.30, 264.0);
        let got = Oklch::from_rgb(asked.to_rgb());
        assert!((got.l - asked.l).abs() < 0.02, "lightness drifted");
        let delta = (got.h - asked.h).abs().min(360.0 - (got.h - asked.h).abs());
        assert!(delta < 3.0, "hue drifted {delta} degrees");
        assert!(got.c < asked.c, "chroma should have been given up");
    }

    #[test]
    fn a_degenerate_oklch_still_produces_a_colour() {
        for (l, c, h) in [(0.0, 0.0, 0.0), (0.5, 5.0, -90.0), (0.5, 0.1, f32::NAN)] {
            let rgb = Oklch::new(l, c, h).to_rgb();
            assert!(rgb.luminance().is_finite(), "{l} {c} {h}");
        }
    }

    #[test]
    fn a_ramp_holds_one_perceived_lightness_so_no_entry_shouts() {
        let ramp = Ramp::around(Rgb::new(0x4c, 0xc9, 0xf0), 280.0);
        let lightness: Vec<f32> = (0..16).map(|i| Oklch::from_rgb(ramp.at(i, 16)).l).collect();
        let lo = lightness.iter().copied().fold(f32::MAX, f32::min);
        let hi = lightness.iter().copied().fold(f32::MIN, f32::max);
        assert!(hi - lo < 0.02, "perceived lightness spread {lo}..{hi}");
    }

    #[test]
    fn a_ramp_spreads_its_entries_across_the_band() {
        let ramp = Ramp::around(Rgb::new(0x3c, 0x99, 0xe6), 200.0);
        let colors: Vec<Rgb> = (0..8).map(|i| ramp.at(i, 8)).collect();
        for (i, a) in colors.iter().enumerate() {
            for (j, b) in colors.iter().enumerate().skip(i + 1) {
                assert!(distance(*a, *b) > 20, "{i} and {j} are too close");
            }
        }
    }

    #[test]
    fn a_single_entry_gets_the_centre_rather_than_a_division_by_zero() {
        let ramp = Ramp::around(Rgb::new(0x3c, 0x99, 0xe6), 200.0);
        assert_eq!(ramp.at(0, 1), ramp.at(0, 0), "both degenerate counts agree");
        assert_eq!(
            ramp.at(99, 4),
            ramp.at(3, 4),
            "an index past the end clamps"
        );
    }
}
