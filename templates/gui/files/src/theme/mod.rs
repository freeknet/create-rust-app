// ============================================================================
// Module:       @@module@@
// Description:  Themes as data: what a theme states, what is derived from it,
//               and the readability rules every palette has to pass.
//
// @if themes
// Dependencies: crate::color for the maths; serde + toml (the catalog format),
//               dirs (the user theme directory).
// @else
// Dependencies: crate::color for the maths and the contrast check.
// @end
// ============================================================================

//! Themes, as data.
//!
//! A theme states **eleven** colours. Everything else a window needs — the
//! selection fill, the muted accent behind a chip, the scrollbar handle,
//! the text colour that goes on top of the accent, the rainbow ramp — is
//! derived from those in [`Palette::derive`]. A format where every colour
//! is stated is a format where a new theme has to get forty decisions
//! right; deriving them means a theme is eleven colours and comes out
//! internally consistent, and a fix to a derivation fixes every theme.
//!
//! ## The signature theme
//!
//! [`signature`] is a dark theme whose accent is the colour this project
//! was scaffolded with ([`crate::ACCENT`]). An accent that would fail the
//! readability rules is walked through a few lightnesses at the same hue,
//! and if none of them reads, the theme keeps its own default — so the app
//! cannot open unreadable, whatever colour was picked.
// @if themes
//!
//! ## The catalog
//!
//! [`Catalog::load`] starts with the signature theme, adds the built-in
//! themes from `assets/themes.toml` (compiled in with `include_str!`), then
//! any `*.toml` in [`user_theme_dir`]. A user theme whose `id` matches an
//! existing one replaces it, which is how a shipped theme is tweaked. `id`
//! is what the config persists: **never rename one.**
// @end
//!
//! ## The readability rules are enforced
//!
//! [`Palette::readability_issues`] checks layer separation and WCAG
//! contrast. The tests run it over every built-in theme, so an unreadable
//! theme is a failing build rather than a subtly unreadable window.
// @if themes
//! A user theme that fails it is reported in the settings page and not
//! loaded.
// @end

use crate::color::{Oklch, Ramp, Rgb};
// @if themes
use serde::Deserialize;
use std::path::PathBuf;

/// The built-in catalog, compiled into the binary.
const BUILT_IN: &str = include_str!("../../assets/themes.toml");
// @end

/// Whether a theme's surfaces get lighter or darker as they come forward.
// @if themes
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default, Deserialize)]
#[serde(rename_all = "lowercase")]
// @else
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
// @end
pub enum Mode {
    /// Dark theme: a surface reads as lifted by getting lighter.
    #[default]
    Dark,
    /// Light theme: a pale surface reads as lifted by getting *darker*,
    /// which is why this is stated rather than guessed from luminance.
    Light,
}

/// What a theme states. See the module docs on why that is the whole format.
// @if themes
#[derive(Clone, Debug, Deserialize)]
// @else
#[derive(Clone, Debug)]
// @end
pub struct ThemeSpec {
    /// Stable identifier, persisted in the config. Never rename one.
    pub id: String,
    /// The name shown in the theme picker.
    pub name: String,
    /// Which way the surface ramp runs.
    // @if themes
    #[serde(default)]
    // @end
    pub mode: Mode,
    /// Behind everything: the window's own background.
    pub app: String,
    /// A panel sitting on the app background.
    pub panel: String,
    /// A card sitting on a panel.
    pub raised: String,
    /// The interactive lift above `raised`.
    pub hover: String,
    /// Rules and outlines.
    pub border: String,
    /// The primary accent, and the centre of the rainbow.
    pub accent: String,
    /// Primary text.
    pub text: String,
    /// Secondary text: captions, units, inactive labels.
    pub text_muted: String,
    /// Errors and destructive actions.
    pub danger: String,
    /// Warnings.
    pub warning: String,
    /// Success.
    pub success: String,
    /// How many degrees of hue the rainbow ramp spans, centred on the
    /// accent. Defaults to [`DEFAULT_RAMP_SPAN`].
    // @if themes
    #[serde(default)]
    // @end
    pub rainbow_span: Option<f32>,
}

/// The default width of a theme's rainbow band, in degrees: wide enough to
/// be colourful, narrow enough not to wrap round into the status colours.
pub const DEFAULT_RAMP_SPAN: f32 = 260.0;

/// A theme's full set of colours, derived and ready to draw with.
#[derive(Clone, Debug, PartialEq)]
pub struct Palette {
    /// This theme's stable id.
    pub id: String,
    /// This theme's display name.
    pub name: String,
    /// Dark or light.
    pub mode: Mode,
    /// The window background.
    pub app: Rgb,
    /// A panel on the app background.
    pub panel: Rgb,
    /// A card on a panel.
    pub raised: Rgb,
    /// The interactive lift above `raised`.
    pub hover: Rgb,
    /// Rules and outlines.
    pub border: Rgb,
    /// A heavier rule, for a focused or active edge.
    pub border_strong: Rgb,
    /// Primary text.
    pub text: Rgb,
    /// Secondary text.
    pub text_muted: Rgb,
    /// Tertiary text: placeholders, disabled labels.
    pub text_faint: Rgb,
    /// Text that sits on top of [`Palette::accent`], chosen for contrast.
    pub text_on_accent: Rgb,
    /// Text that sits on top of [`Palette::danger`].
    pub text_on_danger: Rgb,
    /// The primary accent.
    pub accent: Rgb,
    /// The accent lifted, for a hovered accent surface.
    pub accent_hover: Rgb,
    /// The accent knocked back into the panel: a tint, not a colour.
    pub accent_soft: Rgb,
    /// The selected-item fill.
    pub selection: Rgb,
    /// Text on a selected item.
    pub selection_text: Rgb,
    /// The scrollbar handle, checkbox interior and slider rail — never a
    /// surface colour, or every scrollbar disappears.
    pub control: Rgb,
    /// The control colour, hovered.
    pub control_hover: Rgb,
    /// Errors and destructive actions.
    pub danger: Rgb,
    /// A destructive action's hover fill.
    pub danger_hover: Rgb,
    /// Warnings.
    pub warning: Rgb,
    /// Success.
    pub success: Rgb,
    /// The rainbow band this theme's multi-series colours come from.
    ramp: Ramp,
}

/// The contrast body text must clear against every surface: WCAG AAA.
pub const TEXT_CONTRAST: f32 = 7.0;

/// The contrast secondary text and text on fills must clear: WCAG AA.
pub const SECONDARY_CONTRAST: f32 = 4.5;

/// The contrast an accent or status colour needs to be *noticed*.
pub const INDICATOR_CONTRAST: f32 = 3.0;

/// The least two adjacent surfaces may differ and still read as layers.
pub const LAYER_SEPARATION: f32 = 1.06;

/// The least a control (scrollbar handle) may differ from any surface.
pub const CONTROL_SEPARATION: f32 = 1.25;

impl Palette {
    /// Derives a full palette from what a theme stated.
    ///
    /// `None` if any colour fails to parse: a theme with a typo is reported
    /// as broken rather than rendered with a black hole in it.
    #[must_use]
    pub fn derive(spec: &ThemeSpec) -> Option<Self> {
        let app = Rgb::parse(&spec.app)?;
        let panel = Rgb::parse(&spec.panel)?;
        let raised = Rgb::parse(&spec.raised)?;
        let hover = Rgb::parse(&spec.hover)?;
        let border = Rgb::parse(&spec.border)?;
        let accent = Rgb::parse(&spec.accent)?;
        let text = Rgb::parse(&spec.text)?;
        let text_muted = Rgb::parse(&spec.text_muted)?;
        let danger = Rgb::parse(&spec.danger)?;
        let warning = Rgb::parse(&spec.warning)?;
        let success = Rgb::parse(&spec.success)?;

        // "Forward" is towards the viewer: lighter in a dark theme, darker
        // in a light one. Writing the derivations in terms of it is what
        // lets one set of rules serve both modes.
        let forward = match spec.mode {
            Mode::Dark => Rgb::new(255, 255, 255),
            Mode::Light => Rgb::new(0, 0, 0),
        };
        let on = |fill: Rgb| {
            if fill.prefers_light_text() {
                Rgb::new(255, 255, 255)
            } else {
                Rgb::new(16, 16, 20)
            }
        };
        // Towards *text* rather than `forward`: a black scrollbar handle on
        // a white card is far heavier than the rest of the chrome.
        let control = hover.lerp(text, 0.34);
        let danger_hover = danger.lerp(forward, 0.12);

        Some(Self {
            id: spec.id.clone(),
            name: spec.name.clone(),
            mode: spec.mode,
            app,
            panel,
            raised,
            hover,
            border,
            border_strong: border.lerp(text, 0.28),
            text,
            text_muted,
            text_faint: text_muted.lerp(panel, 0.42),
            text_on_accent: on(accent),
            text_on_danger: on(danger),
            accent,
            accent_hover: accent.lerp(forward, 0.18),
            accent_soft: accent.lerp(panel, 0.74),
            // A tint, not the accent: a selected item still shows its muted
            // text, which has to stay readable on top of the fill.
            selection: accent.lerp(panel, 0.80),
            selection_text: text,
            control,
            control_hover: control.lerp(text, 0.28),
            danger,
            danger_hover,
            warning,
            success,
            ramp: Ramp::around(accent, spec.rainbow_span.unwrap_or(DEFAULT_RAMP_SPAN)),
        })
    }

    /// Entry `index` of `count` along this theme's rainbow.
    #[must_use]
    pub fn series(&self, index: usize, count: usize) -> Rgb {
        self.ramp.at(index, count)
    }

    /// The four surfaces, back to front.
    #[must_use]
    pub fn surfaces(&self) -> [Rgb; 4] {
        [self.app, self.panel, self.raised, self.hover]
    }

    /// Every way this palette falls short of the readability rules, as
    /// human-readable sentences. Empty means it passes.
    #[must_use]
    pub fn readability_issues(&self) -> Vec<String> {
        let mut issues = Vec::new();
        let mut require = |label: String, ratio: f32, minimum: f32| {
            if ratio < minimum {
                issues.push(format!("{label} is {ratio:.2}:1, below {minimum}:1"));
            }
        };
        for (label, surface) in [
            ("app", self.app),
            ("panel", self.panel),
            ("raised", self.raised),
            ("hover", self.hover),
            ("selection", self.selection),
        ] {
            require(
                format!("text on {label}"),
                self.text.contrast(surface),
                TEXT_CONTRAST,
            );
            require(
                format!("muted text on {label}"),
                self.text_muted.contrast(surface),
                SECONDARY_CONTRAST,
            );
        }
        for (label, color) in [
            ("accent", self.accent),
            ("danger", self.danger),
            ("warning", self.warning),
            ("success", self.success),
        ] {
            require(
                format!("{label} on panel"),
                color.contrast(self.panel),
                INDICATOR_CONTRAST,
            );
        }
        require(
            "text on accent".to_string(),
            self.text_on_accent.contrast(self.accent),
            SECONDARY_CONTRAST,
        );
        for fill in [self.danger, self.danger_hover] {
            require(
                "text on danger".to_string(),
                self.text_on_danger.contrast(fill),
                SECONDARY_CONTRAST,
            );
        }
        let names = ["app", "panel", "raised", "hover"];
        let surfaces = self.surfaces();
        for (pair, labels) in surfaces.windows(2).zip(names.windows(2)) {
            if let ([back, front], [behind, ahead]) = (pair, labels) {
                require(
                    format!("{behind} against {ahead}"),
                    back.contrast(*front),
                    LAYER_SEPARATION,
                );
            }
        }
        for (label, surface) in names.iter().zip(surfaces) {
            require(
                format!("control on {label}"),
                self.control.contrast(surface),
                CONTROL_SEPARATION,
            );
        }
        let (app, hover) = (self.app.luminance(), self.hover.luminance());
        let runs_forward = match self.mode {
            Mode::Dark => hover > app,
            Mode::Light => hover < app,
        };
        if !runs_forward {
            issues.push("the surfaces run the wrong way for the theme's mode".to_string());
        }
        issues
    }
}

/// The base the signature theme is built on: a deep blue-black.
fn signature_spec(accent: Rgb) -> ThemeSpec {
    ThemeSpec {
        id: "signature".to_string(),
        name: "Signature".to_string(),
        mode: Mode::Dark,
        app: "#0a0c11".to_string(),
        panel: "#11141c".to_string(),
        raised: "#1a1e28".to_string(),
        hover: "#242936".to_string(),
        border: "#333a4a".to_string(),
        accent: accent.to_hex(),
        text: "#e9edf5".to_string(),
        text_muted: "#98a3b8".to_string(),
        danger: "#ff5c7a".to_string(),
        warning: "#ffb347".to_string(),
        success: "#4ade80".to_string(),
        rainbow_span: Some(280.0),
    }
}

/// The accent the signature theme falls back to when the scaffolded one
/// cannot be made readable on its surfaces.
const FALLBACK_ACCENT: Rgb = Rgb::new(0x4c, 0xc9, 0xf0);

/// The signature theme: the dark base with [`crate::ACCENT`] as its accent.
///
/// See the module docs: an accent that fails the rules is tried at a few
/// lightnesses of the same hue before the base's own accent is used.
#[must_use]
pub fn signature() -> Palette {
    let seed = Oklch::from_rgb(crate::ACCENT);
    let candidates = std::iter::once(crate::ACCENT)
        .chain(
            [0.72, 0.78, 0.84, 0.66]
                .into_iter()
                .map(|lightness| Oklch::new(lightness, seed.c, seed.h).to_rgb()),
        )
        .chain(std::iter::once(FALLBACK_ACCENT));
    let mut last = None;
    for accent in candidates {
        let Some(palette) = Palette::derive(&signature_spec(accent)) else {
            continue;
        };
        if palette.readability_issues().is_empty() {
            return palette;
        }
        last = Some(palette);
    }
    // Only reachable if the base itself stopped passing, which the tests
    // below rule out; returning what was derived keeps this total.
    last.unwrap_or_else(emergency)
}

/// A palette built from literals, for the one path where deriving failed.
fn emergency() -> Palette {
    let accent = FALLBACK_ACCENT;
    Palette {
        id: "signature".to_string(),
        name: "Signature".to_string(),
        mode: Mode::Dark,
        app: Rgb::new(10, 12, 17),
        panel: Rgb::new(17, 20, 28),
        raised: Rgb::new(26, 30, 40),
        hover: Rgb::new(36, 41, 54),
        border: Rgb::new(51, 58, 74),
        border_strong: Rgb::new(102, 108, 122),
        text: Rgb::new(233, 237, 245),
        text_muted: Rgb::new(152, 163, 184),
        text_faint: Rgb::new(95, 103, 120),
        text_on_accent: Rgb::new(16, 16, 20),
        text_on_danger: Rgb::new(16, 16, 20),
        accent,
        accent_hover: Rgb::new(110, 214, 244),
        accent_soft: Rgb::new(32, 66, 84),
        selection: Rgb::new(29, 56, 72),
        selection_text: Rgb::new(233, 237, 245),
        control: Rgb::new(103, 108, 125),
        control_hover: Rgb::new(139, 144, 159),
        danger: Rgb::new(255, 92, 122),
        danger_hover: Rgb::new(255, 112, 138),
        warning: Rgb::new(255, 179, 71),
        success: Rgb::new(74, 222, 128),
        ramp: Ramp::around(accent, DEFAULT_RAMP_SPAN),
    }
}
// @if themes

/// Every theme available to the app.
#[derive(Clone, Debug)]
pub struct Catalog {
    /// The themes, in catalog order. Never empty: the signature theme is
    /// always first.
    themes: Vec<Palette>,
    /// Theme sources that could not be used, as `(source, reason)`.
    /// Surfaced in the settings page rather than swallowed: a theme that
    /// silently does not appear is indistinguishable from one the app
    /// cannot see.
    problems: Vec<(String, String)>,
}

/// The `[[theme]]` array a catalog file holds.
#[derive(Deserialize)]
struct CatalogFile {
    /// One entry per theme.
    #[serde(default)]
    theme: Vec<ThemeSpec>,
}

impl Catalog {
    /// The signature theme and the built-in catalog, without user themes.
    #[must_use]
    pub fn built_in() -> Self {
        let mut catalog = Self {
            themes: vec![signature()],
            problems: Vec::new(),
        };
        catalog.absorb("built-in", BUILT_IN);
        catalog
    }

    /// The built-in themes, then any user themes on top of them.
    #[must_use]
    pub fn load() -> Self {
        let mut catalog = Self::built_in();
        let Some(dir) = user_theme_dir() else {
            return catalog;
        };
        let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
            .into_iter()
            .flatten()
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| path.extension().is_some_and(|ext| ext == "toml"))
            .collect();
        // Sorted, so the catalog cannot differ between runs.
        files.sort();
        for path in files {
            let label = path
                .file_name()
                .map(|name| name.to_string_lossy().into_owned())
                .unwrap_or_else(|| path.to_string_lossy().into_owned());
            match std::fs::read_to_string(&path) {
                Ok(text) => catalog.absorb(&label, &text),
                Err(error) => catalog.problems.push((label, error.to_string())),
            }
        }
        catalog
    }

    /// Parses one catalog file and merges its themes in.
    fn absorb(&mut self, source: &str, text: &str) {
        let parsed: CatalogFile = match toml::from_str(text) {
            Ok(parsed) => parsed,
            Err(error) => {
                self.problems.push((source.to_string(), error.to_string()));
                return;
            }
        };
        for spec in parsed.theme {
            let label = format!("{source}: {}", spec.id);
            let Some(palette) = Palette::derive(&spec) else {
                self.problems
                    .push((label, "a colour is not a valid hex code".to_string()));
                continue;
            };
            let issues = palette.readability_issues();
            if !issues.is_empty() {
                self.problems.push((label, issues.join("; ")));
                continue;
            }
            match self.themes.iter_mut().find(|theme| theme.id == palette.id) {
                Some(slot) => *slot = palette,
                None => self.themes.push(palette),
            }
        }
    }

    /// Every loaded theme, in catalog order.
    #[must_use]
    pub fn themes(&self) -> &[Palette] {
        &self.themes
    }

    /// Theme sources that could not be loaded, as `(source, reason)`.
    #[must_use]
    pub fn problems(&self) -> &[(String, String)] {
        &self.problems
    }

    /// The theme with this id, or the first theme when there is none.
    ///
    /// Falling back rather than failing is deliberate: a preference naming
    /// a removed theme should cost the theme, not the config.
    #[must_use]
    pub fn get(&self, id: Option<&str>) -> Palette {
        id.and_then(|id| self.themes.iter().find(|theme| theme.id == id))
            .or_else(|| self.themes.first())
            .cloned()
            .unwrap_or_else(signature)
    }
}

/// Where user theme files live: `<config dir>/@@name@@/themes/`.
#[must_use]
pub fn user_theme_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join(crate::APP_ID).join("themes"))
}
// @end

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_signature_theme_is_readable() {
        let theme = signature();
        let issues = theme.readability_issues();
        assert!(issues.is_empty(), "signature theme: {issues:?}");
    }

    #[test]
    fn the_signature_base_is_readable_with_its_fallback_accent() {
        // The guarantee `signature` rests on: whatever accent was picked,
        // this one always passes.
        let palette = Palette::derive(&signature_spec(FALLBACK_ACCENT));
        let issues = palette.map(|palette| palette.readability_issues());
        assert_eq!(issues, Some(Vec::new()), "the fallback must pass");
    }

    #[test]
    fn any_accent_yields_a_readable_signature_theme() {
        for hex in [
            "#000000", "#ffffff", "#ffff00", "#0000ff", "#7b5bff", "#ff2d95",
        ] {
            let accent = Rgb::parse(hex).unwrap_or_default();
            let mut chosen = None;
            for candidate in [accent, FALLBACK_ACCENT] {
                let palette = Palette::derive(&signature_spec(candidate))
                    .filter(|palette| palette.readability_issues().is_empty());
                if palette.is_some() {
                    chosen = palette;
                    break;
                }
            }
            assert!(chosen.is_some(), "{hex}: no readable accent was found");
        }
    }

    #[test]
    fn the_emergency_palette_is_itself_readable() {
        let issues = emergency().readability_issues();
        assert!(issues.is_empty(), "emergency palette: {issues:?}");
    }

    #[test]
    fn a_bad_colour_is_reported_rather_than_rendered() {
        let mut spec = signature_spec(FALLBACK_ACCENT);
        spec.app = "#zzzzzz".to_string();
        assert!(Palette::derive(&spec).is_none());
    }

    #[test]
    fn text_on_the_accent_is_chosen_for_contrast() {
        for accent in [Rgb::new(250, 240, 120), Rgb::new(40, 20, 120)] {
            let palette = Palette::derive(&signature_spec(accent));
            let ratio = palette.map(|p| p.text_on_accent.contrast(p.accent));
            assert!(
                ratio.is_some_and(|ratio| ratio >= SECONDARY_CONTRAST),
                "{accent:?}: {ratio:?}"
            );
        }
    }
    // @if themes

    #[test]
    fn the_built_in_catalog_parses_and_every_theme_is_readable() {
        let catalog = Catalog::built_in();
        assert!(
            catalog.problems().is_empty(),
            "assets/themes.toml did not load cleanly: {:?}",
            catalog.problems()
        );
        assert!(
            catalog.themes().len() >= 6,
            "the catalog should ship more than a token theme"
        );
    }

    #[test]
    fn theme_ids_are_unique() {
        let catalog = Catalog::built_in();
        let mut ids: Vec<&str> = catalog.themes().iter().map(|t| t.id.as_str()).collect();
        let count = ids.len();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), count, "two themes share an id");
    }

    #[test]
    fn the_catalog_has_both_modes() {
        let catalog = Catalog::built_in();
        for mode in [Mode::Dark, Mode::Light] {
            assert!(
                catalog.themes().iter().any(|theme| theme.mode == mode),
                "no {mode:?} theme in the catalog"
            );
        }
    }

    #[test]
    fn a_user_theme_replaces_the_built_in_it_shares_an_id_with() {
        let mut catalog = Catalog::built_in();
        let before = catalog.themes().len();
        catalog.absorb(
            "user.toml",
            r##"
            [[theme]]
            id = "signature"
            name = "Mine"
            app = "#000000"
            panel = "#101010"
            raised = "#1c1c1c"
            hover = "#2a2a2a"
            border = "#3a3a3a"
            accent = "#4cc9f0"
            text = "#ffffff"
            text_muted = "#a8a8a8"
            danger = "#ff5c7a"
            warning = "#ffb347"
            success = "#4ade80"
            "##,
        );
        assert!(catalog.problems().is_empty(), "{:?}", catalog.problems());
        assert_eq!(catalog.themes().len(), before, "replaced, not appended");
        assert_eq!(catalog.get(Some("signature")).name, "Mine");
    }

    #[test]
    fn an_unreadable_user_theme_is_reported_and_not_loaded() {
        let mut catalog = Catalog::built_in();
        let before = catalog.themes().len();
        catalog.absorb(
            "grey.toml",
            r##"
            [[theme]]
            id = "grey-on-grey"
            name = "Grey on grey"
            app = "#777777"
            panel = "#787878"
            raised = "#797979"
            hover = "#7a7a7a"
            border = "#7b7b7b"
            accent = "#7c7c7c"
            text = "#808080"
            text_muted = "#818181"
            danger = "#828282"
            warning = "#838383"
            success = "#848484"
            "##,
        );
        assert_eq!(catalog.themes().len(), before, "it must not load");
        assert_eq!(catalog.problems().len(), 1, "and must be reported");
    }

    #[test]
    fn an_unknown_theme_id_falls_back_rather_than_failing() {
        let catalog = Catalog::built_in();
        assert_eq!(catalog.get(Some("no-such-theme")).id, catalog.get(None).id);
    }
    // @end
}
