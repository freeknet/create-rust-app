// ============================================================================
// Module:       @@module@@
// Description:  Installs a UI typeface by family name from the machine's own
//               font directories, falling back to the bundled faces.
//
// Dependencies: egui (FontDefinitions); std::fs for the font directories
// ============================================================================

//! The UI typeface.
//!
//! egui ships its own faces compiled into the binary. This lets the window
//! take a face that is *installed on the machine* instead, by name, without
//! a font file entering the repository: reading an installed font is what
//! every other application on the machine does, while committing one to
//! `assets/` would be redistributing it under whatever licence it carries.
//!
//! ## The bundled faces stay underneath
//!
//! The named face is *prepended* to the proportional family rather than
//! replacing it. Many faces cover Latin and little else; replacing the
//! family would silently drop Greek, Cyrillic and every glyph a user's own
//! text might contain. Prepending means the named face is asked first and
//! the bundled one answers for everything it lacks.
//!
//! ## Failure is silence, on purpose
//!
//! A family that is not installed, or is spelled the way a font menu spells
//! it rather than the way the file is named, leaves the app in its bundled
//! face. That is a normal outcome, not an error worth showing anybody.

use std::path::{Path, PathBuf};

/// The name the loaded face is registered under.
const KEY: &str = "configured-ui-face";

/// Installs `family` as the proportional face, if it can be found.
///
/// Returns the file it loaded; `None` leaves the context untouched.
pub fn install(ctx: &egui::Context, family: &str) -> Option<PathBuf> {
    let path = locate(family)?;
    let bytes = std::fs::read(&path).ok()?;
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        KEY.to_owned(),
        std::sync::Arc::new(egui::FontData::from_owned(bytes)),
    );
    fonts
        .families
        .entry(egui::FontFamily::Proportional)
        .or_default()
        .insert(0, KEY.to_owned());
    ctx.set_fonts(fonts);
    Some(path)
}

/// The directories fonts are installed into, the per-user one first: it is
/// where a font installed without administrator rights lands.
fn directories() -> Vec<PathBuf> {
    let mut directories = Vec::new();
    if let Some(local) = std::env::var_os("LOCALAPPDATA") {
        directories.push(
            Path::new(&local)
                .join("Microsoft")
                .join("Windows")
                .join("Fonts"),
        );
    }
    if let Some(root) = std::env::var_os("SystemRoot") {
        directories.push(Path::new(&root).join("Fonts"));
    }
    if let Some(home) = std::env::var_os("HOME") {
        directories.push(Path::new(&home).join(".local").join("share").join("fonts"));
        directories.push(Path::new(&home).join("Library").join("Fonts"));
    }
    directories.push(PathBuf::from("/usr/share/fonts/truetype"));
    directories.push(PathBuf::from("/Library/Fonts"));
    directories
}

/// Finds the file holding `family`'s regular weight.
fn locate(family: &str) -> Option<PathBuf> {
    directories().into_iter().find_map(|directory| {
        let files: Vec<PathBuf> = std::fs::read_dir(&directory)
            .ok()?
            .flatten()
            .map(|entry| entry.path())
            .filter(|path| is_a_font_file(path))
            .collect();
        pick(&files, family).cloned()
    })
}

/// Whether a path names a font egui can load: TrueType or OpenType.
fn is_a_font_file(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "ttf" | "otf" | "ttc"
            )
        })
}

/// Picks the file for `family`'s regular weight out of `files`.
///
/// A family installs as several files that all begin with its name
/// (`Inter Regular.ttf`, `Inter Bold.ttf` …), and a directory listing has
/// no defined order, so the preference is explicit: the exact name, then
/// `<family> Regular`, then any match that is neither bold nor italic.
fn pick<'a>(files: &'a [PathBuf], family: &str) -> Option<&'a PathBuf> {
    let wanted = family.trim().to_ascii_lowercase();
    // `starts_with("")` is true of everything, so a blank name would
    // otherwise install the first font in the directory.
    if wanted.is_empty() {
        return None;
    }
    let stem = |path: &PathBuf| -> Option<String> {
        Some(path.file_stem()?.to_str()?.to_ascii_lowercase())
    };
    let regular = format!("{wanted} regular");
    files
        .iter()
        .find(|path| stem(path).is_some_and(|stem| stem == wanted))
        .or_else(|| {
            files
                .iter()
                .find(|path| stem(path).is_some_and(|stem| stem == regular))
        })
        .or_else(|| {
            files.iter().find(|path| {
                stem(path).is_some_and(|stem| {
                    stem.starts_with(&wanted) && !stem.contains("bold") && !stem.contains("italic")
                })
            })
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(names: &[&str]) -> Vec<PathBuf> {
        names.iter().map(PathBuf::from).collect()
    }

    #[test]
    fn the_regular_weight_wins_over_the_bold_and_the_italic() {
        let candidates = files(&[
            "Inter Bold Italic.ttf",
            "Inter Bold.ttf",
            "Inter Italic.ttf",
            "Inter Regular.ttf",
        ]);
        assert_eq!(
            pick(&candidates, "Inter"),
            Some(&PathBuf::from("Inter Regular.ttf"))
        );
    }

    #[test]
    fn a_family_whose_file_is_named_after_it_is_matched_exactly() {
        let candidates = files(&["Outfit Bold.ttf", "Outfit.ttf"]);
        assert_eq!(
            pick(&candidates, "Outfit"),
            Some(&PathBuf::from("Outfit.ttf"))
        );
    }

    #[test]
    fn the_match_ignores_case_and_finds_nothing_for_a_missing_family() {
        let candidates = files(&["Inter Regular.ttf"]);
        assert!(pick(&candidates, "inter").is_some(), "case must not matter");
        assert!(pick(&candidates, "Helvetica").is_none());
    }

    #[test]
    fn a_blank_name_matches_nothing_rather_than_everything() {
        let candidates = files(&["Arial.ttf"]);
        assert!(pick(&candidates, "").is_none());
        assert!(pick(&candidates, "   ").is_none());
    }

    #[test]
    fn a_family_with_only_a_bold_face_is_not_used() {
        assert!(pick(&files(&["Inter Bold.ttf"]), "Inter").is_none());
    }

    #[test]
    fn only_truetype_and_opentype_files_are_offered() {
        assert!(is_a_font_file(Path::new("Inter.TTF")));
        assert!(is_a_font_file(Path::new("Inter.otf")));
        assert!(!is_a_font_file(Path::new("vgasys.fon")));
        assert!(!is_a_font_file(Path::new("marlett")));
    }
}
