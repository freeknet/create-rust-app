// ============================================================================
// Module:       @@module@@
// Description:  The local SQLite database: where it lives, and the schema
//               migrations applied every time it is opened.
//
// Dependencies: rusqlite (bundled SQLite), dirs, anyhow
// ============================================================================

//! The local database, in `<data dir>/@@name@@/@@name@@.db`.
//!
//! Every connection comes from [`open`] or [`open_at`], and both run the
//! migrations before handing the connection out. No caller can see a
//! database at an older schema, and no caller has to remember to upgrade
//! one.
//!
//! Migrations are an append-only list. Each runs in the same transaction
//! that records it in the `migrations` table, so a crash midway leaves the
//! database at the previous version rather than half-upgraded, and
//! reopening is always safe. To change the schema, add an entry to
//! [`MIGRATIONS`]; never edit one that has shipped.

use anyhow::Context as _;

/// The schema, one step per entry. Entry `i` takes the database to
/// version `i + 1`.
const MIGRATIONS: &[&str] = &["CREATE TABLE notes (
        id INTEGER PRIMARY KEY,
        body TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );"];

/// Opens the per-user database, creating and migrating it as needed.
///
/// # Errors
///
/// Returns an error when there is no data directory, it cannot be
/// created, or the database cannot be opened or migrated.
pub fn open() -> anyhow::Result<rusqlite::Connection> {
    let dir = dirs::data_dir()
        .context("no per-user data directory could be determined")?
        .join("@@name@@");
    std::fs::create_dir_all(&dir).with_context(|| format!("creating {}", dir.display()))?;
    open_at(&dir.join("@@name@@.db"))
}

/// Opens the database at `path`, creating and migrating it as needed.
///
/// # Errors
///
/// Returns an error when the file cannot be opened or a migration fails.
pub fn open_at(path: &std::path::Path) -> anyhow::Result<rusqlite::Connection> {
    let mut connection =
        rusqlite::Connection::open(path).with_context(|| format!("opening {}", path.display()))?;
    // Wait for a second instance's write instead of failing at once.
    connection.busy_timeout(std::time::Duration::from_secs(5))?;
    migrate(&mut connection)?;
    Ok(connection)
}

/// The highest migration applied to `connection`; 0 for a new database.
///
/// # Errors
///
/// Returns an error when the `migrations` table cannot be read.
pub fn schema_version(connection: &rusqlite::Connection) -> anyhow::Result<i64> {
    let version = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM migrations",
        [],
        |row| row.get(0),
    )?;
    Ok(version)
}

/// Applies every migration the database has not seen yet.
fn migrate(connection: &mut rusqlite::Connection) -> anyhow::Result<()> {
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );",
    )?;
    let current = schema_version(connection)?;
    for (version, sql) in (1_i64..).zip(MIGRATIONS) {
        if version <= current {
            continue;
        }
        let transaction = connection.transaction()?;
        transaction
            .execute_batch(sql)
            .with_context(|| format!("applying migration {version}"))?;
        transaction.execute("INSERT INTO migrations (version) VALUES (?1)", [version])?;
        transaction.commit()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn a_new_database_is_migrated_to_the_latest_version() -> anyhow::Result<()> {
        let dir = tempfile::tempdir()?;
        let connection = super::open_at(&dir.path().join("test.db"))?;
        let latest = i64::try_from(super::MIGRATIONS.len())?;
        assert_eq!(
            super::schema_version(&connection)?,
            latest,
            "opening must apply every migration"
        );
        Ok(())
    }

    #[test]
    fn reopening_does_not_reapply_migrations() -> anyhow::Result<()> {
        let dir = tempfile::tempdir()?;
        let path = dir.path().join("test.db");
        drop(super::open_at(&path)?);
        let connection = super::open_at(&path)?;
        let rows: i64 =
            connection.query_row("SELECT COUNT(*) FROM migrations", [], |row| row.get(0))?;
        let latest = i64::try_from(super::MIGRATIONS.len())?;
        assert_eq!(rows, latest, "reopening must not record a migration twice");
        Ok(())
    }
}
