// ============================================================================
// Module:       @@module@@
// Description:  Persisted preferences, loaded once at startup and saved on a
//               normal quit, parsed forgivingly field by field.
//
// Dependencies: serde + toml (the on-disk format), dirs (the location)
// ============================================================================

//! The preferences that survive a restart.
//!
//! All of it is convenience state: a missing, partial or unreadable file
//! means "use the defaults", never a hard failure.
//!
//! ## Parsed one field at a time
//!
//! [`parse`] pulls each field out of a `toml::Table` individually rather
//! than deserializing the whole struct at once. Whole-struct
//! deserialization fails on the first mistyped value, and the caller can
//! only fall back to the defaults — so one bad field would silently throw
//! away every other preference. Per field, a bad value costs that one
//! preference and the next save writes a valid file again.
//!
//! ## Written atomically
//!
//! [`save`] writes a temporary file beside the target, flushes it, and
//! renames it over the old one, so a crash mid-write leaves the previous
//! config intact rather than a half-written one that parses to nothing.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Everything the app remembers between runs.
///
/// Every field is `Option`, and `None` means "the app decides". That lets a
/// default change in a later release and reach users who never touched the
/// setting, while respecting the choice of anyone who did.
#[derive(Serialize, Deserialize, Default, Clone, Debug, PartialEq)]
pub struct Config {
    /// A theme `id`. An id that no longer exists falls back to the default.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub theme: Option<String>,
    /// The UI typeface, by family name, looked up among installed fonts.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font: Option<String>,
    /// Which page was open, by its stable name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub page: Option<String>,
    /// Whether the sidebar shows only icons.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sidebar_collapsed: Option<bool>,
    /// Whether animations are switched off.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reduce_motion: Option<bool>,
    /// The window's inner size in logical points, as `[width, height]`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub window_size: Option<[f32; 2]>,
}

/// Where the config file lives: `<config dir>/@@name@@/config.toml`.
#[must_use]
pub fn config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join(crate::APP_ID).join("config.toml"))
}

/// Loads the config, or the defaults if there is nothing readable.
#[must_use]
pub fn load() -> Config {
    config_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|text| parse(&text))
        .unwrap_or_default()
}

/// Parses a config, forgiving per field. See the module docs.
#[must_use]
pub fn parse(text: &str) -> Config {
    let Ok(table) = text.parse::<toml::Table>() else {
        return Config::default();
    };
    /// Reads one field, `None` for anything that does not deserialize.
    fn field<T: serde::de::DeserializeOwned>(table: &toml::Table, key: &str) -> Option<T> {
        table
            .get(key)
            .cloned()
            .and_then(|value| value.try_into().ok())
    }
    Config {
        theme: field(&table, "theme"),
        font: field(&table, "font"),
        page: field(&table, "page"),
        sidebar_collapsed: field(&table, "sidebar_collapsed"),
        reduce_motion: field(&table, "reduce_motion"),
        window_size: field::<[f32; 2]>(&table, "window_size")
            .filter(|[width, height]| width.is_finite() && height.is_finite()),
    }
}

/// Writes the config to [`config_path`], atomically. See the module docs.
///
/// # Errors
///
/// Returned rather than swallowed, so the caller can say the preferences
/// were not saved: no config directory, or an I/O failure.
pub fn save(config: &Config) -> std::io::Result<()> {
    let path = config_path()
        .ok_or_else(|| std::io::Error::other("no configuration directory could be found"))?;
    write(config, &path)
}

/// Writes `config` to `path` through a temporary file and a rename.
fn write(config: &Config, path: &std::path::Path) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let text = toml::to_string_pretty(config).map_err(std::io::Error::other)?;
    let temporary = path.with_extension(format!("toml.{}.tmp", std::process::id()));
    {
        use std::io::Write as _;
        let mut file = std::fs::File::create(&temporary)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
    }
    // `rename` replaces an existing file on every platform std supports.
    std::fs::rename(&temporary, path).inspect_err(|_| {
        // Do not leave the temporary behind to be mistaken for a config.
        let _ = std::fs::remove_file(&temporary);
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_absent_or_garbled_config_yields_the_defaults() {
        assert_eq!(parse(""), Config::default());
        assert_eq!(parse("}{ not toml <<<"), Config::default());
    }

    #[test]
    fn one_bad_field_costs_only_that_field() {
        let config = parse(
            r#"
            theme = "nebula"
            sidebar_collapsed = "yes please"
            window_size = [1280.0, 800.0]
            "#,
        );
        assert_eq!(config.theme.as_deref(), Some("nebula"), "before survives");
        assert_eq!(config.window_size, Some([1280.0, 800.0]), "after survives");
        assert_eq!(config.sidebar_collapsed, None, "the bad field is dropped");
    }

    #[test]
    fn a_config_round_trips() -> anyhow::Result<()> {
        let original = Config {
            theme: Some("midnight".to_string()),
            font: Some("Inter".to_string()),
            page: Some("palette".to_string()),
            sidebar_collapsed: Some(true),
            reduce_motion: Some(false),
            window_size: Some([1440.0, 900.0]),
        };
        let text = toml::to_string_pretty(&original)?;
        assert_eq!(parse(&text), original, "what was written must read back");
        Ok(())
    }

    #[test]
    fn an_untouched_config_writes_nothing() -> anyhow::Result<()> {
        let text = toml::to_string_pretty(&Config::default())?;
        assert!(text.trim().is_empty(), "got {text:?}");
        Ok(())
    }

    #[test]
    fn a_save_replaces_the_previous_file_and_leaves_no_temporary() -> anyhow::Result<()> {
        let dir = std::env::temp_dir().join(format!("@@name@@-config-{}", std::process::id()));
        let path = dir.join("config.toml");
        for theme in ["first", "second"] {
            let config = Config {
                theme: Some(theme.to_string()),
                ..Config::default()
            };
            write(&config, &path)?;
        }
        let read = parse(&std::fs::read_to_string(&path)?);
        let leftovers = std::fs::read_dir(&dir)?.count();
        std::fs::remove_dir_all(&dir)?;
        assert_eq!(read.theme.as_deref(), Some("second"), "the save replaced");
        assert_eq!(leftovers, 1, "only the config itself is left behind");
        Ok(())
    }
}
