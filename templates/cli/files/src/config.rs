// ============================================================================
// Module:       @@module@@
// Description:  Saved preferences: a forgiving TOML parse, and a write that
//               can never leave a half-written file behind.
//
// Dependencies: serde, toml, dirs
// ============================================================================

//! Saved preferences, in `<config dir>/@@name@@/config.toml`.
//!
//! ## Every field is an `Option`
//!
//! A field the user never set stays `None` and is never written, so the
//! file holds only choices someone actually made. Changing a default in a
//! later release then reaches everyone who did not override it, instead of
//! being pinned forever by a value the program wrote on their behalf.
//!
//! ## The parse forgives per field
//!
//! This is deliberately not one `toml::from_str::<Config>`. That fails the
//! whole file when one value has the wrong type, and the user loses every
//! preference over a single typo. [`parse`] reads the file as a table and
//! then each field on its own: a bad field costs only that field, and a
//! file that is not TOML at all costs nothing but the defaults.
//!
//! ## The write is atomic
//!
//! [`save_to`] writes a temporary file beside the target, flushes it to
//! disk, and renames it over the original. A crash or a full disk midway
//! leaves the previous file intact rather than a truncated one that parses
//! to nothing.

use std::path::{Path, PathBuf};

/// The saved preferences. `None` means "use the built-in default".
#[derive(Clone, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Config {
    /// The word the greeting opens with, such as `Hello`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub greeting: Option<String>,
    /// Who to greet when no `--name` is given.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
}

/// Where the config file lives, or `None` on a system with no per-user
/// config directory (a stripped-down container, for one).
#[must_use]
pub fn config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("@@name@@").join("config.toml"))
}

/// Loads the saved config, or the defaults if there is nothing readable.
///
/// A missing or unreadable file is the normal first-run case, not an
/// error worth stopping for.
#[must_use]
pub fn load() -> Config {
    config_path()
        .and_then(|path| std::fs::read_to_string(path).ok())
        .map(|text| parse(&text))
        .unwrap_or_default()
}

/// Parses a config, forgiving per field. See the module docs for why.
#[must_use]
pub fn parse(text: &str) -> Config {
    let Ok(table) = text.parse::<toml::Table>() else {
        return Config::default();
    };
    /// Reads one field, yielding `None` for anything that does not
    /// deserialize rather than failing the whole parse.
    fn field<T: serde::de::DeserializeOwned>(table: &toml::Table, key: &str) -> Option<T> {
        table
            .get(key)
            .cloned()
            .and_then(|value| value.try_into().ok())
    }
    Config {
        greeting: field(&table, "greeting"),
        name: field(&table, "name"),
    }
}

/// Saves the config to [`config_path`].
///
/// # Errors
///
/// Returns an error when there is no config directory or the write fails.
/// Failures are returned rather than swallowed: "your preferences were not
/// saved" is the caller's to surface.
pub fn save(config: &Config) -> std::io::Result<()> {
    let path = config_path()
        .ok_or_else(|| std::io::Error::other("no configuration directory could be determined"))?;
    save_to(config, &path)
}

/// Writes the config to `path` atomically: a temporary file beside it,
/// flushed, then renamed over the original.
///
/// # Errors
///
/// Returns an error when the directory cannot be created or the file
/// cannot be written or renamed. The temporary file is removed on failure.
pub fn save_to(config: &Config, path: &Path) -> std::io::Result<()> {
    let Some(parent) = path.parent() else {
        return Err(std::io::Error::other(format!(
            "{} has no parent directory",
            path.display()
        )));
    };
    if !parent.as_os_str().is_empty() {
        std::fs::create_dir_all(parent)?;
    }

    let text = toml::to_string_pretty(config).map_err(std::io::Error::other)?;
    // The process id keeps two instances saving at once from writing the
    // same temporary file.
    let temporary = path.with_extension(format!("toml.{}.tmp", std::process::id()));
    let written =
        write_durably(&temporary, text.as_bytes()).and_then(|()| std::fs::rename(&temporary, path));
    if written.is_err() {
        // Do not leave the temporary behind to be mistaken for a config
        // later; the failure itself is already the error being reported.
        let _ = std::fs::remove_file(&temporary);
    }
    written
}

/// Writes `bytes` to a new file at `path` and waits for them to reach the
/// disk, so the rename that follows never publishes an empty file.
fn write_durably(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    use std::io::Write as _;
    let mut file = std::fs::File::create(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests {
    use super::Config;
    use super::{parse, save_to};

    #[test]
    fn an_empty_or_broken_file_yields_the_defaults() -> anyhow::Result<()> {
        assert_eq!(parse(""), Config::default(), "an empty file");
        assert_eq!(
            parse("}{ not toml <<<"),
            Config::default(),
            "a file that is not TOML at all is all defaults"
        );
        Ok(())
    }

    #[test]
    fn one_bad_field_costs_only_that_field() -> anyhow::Result<()> {
        let config = parse("greeting = \"Howdy\"\nname = 42\n");
        assert_eq!(
            config.greeting.as_deref(),
            Some("Howdy"),
            "a valid field must survive a bad neighbour"
        );
        assert_eq!(config.name, None, "a mistyped field is dropped");
        Ok(())
    }

    #[test]
    fn saving_replaces_the_file_and_round_trips() -> anyhow::Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("nested").join("config.toml");
        save_to(&Config::default(), &path)?;
        let config = Config {
            greeting: Some("Howdy".to_owned()),
            name: Some("Ferris".to_owned()),
        };
        save_to(&config, &path)?;
        assert_eq!(
            parse(&std::fs::read_to_string(&path)?),
            config,
            "what was saved must load back unchanged"
        );
        let leftovers = std::fs::read_dir(dir.path().join("nested"))?.count();
        assert_eq!(leftovers, 1, "no temporary file may be left");
        Ok(())
    }

    #[test]
    fn unset_fields_are_not_written() -> anyhow::Result<()> {
        let text = toml::to_string_pretty(&Config::default())?;
        assert!(text.trim().is_empty(), "defaults are not pinned: {text:?}");
        Ok(())
    }
}
