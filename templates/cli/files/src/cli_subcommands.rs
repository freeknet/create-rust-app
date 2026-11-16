// ============================================================================
// Module:       @@module@@
// Description:  The command line: one subcommand per job, and what each one
//               does.
//
// Dependencies: clap (derive) for parsing, std::io for output
// @if http_ureq
//               ureq for the fetch command
// @elif http_reqwest
//               reqwest for the fetch command
// @end
// @if serde & config
//               crate::config for the saved preferences
// @end
// @if sqlite
//               crate::db for the db command
// @end
// ============================================================================

//! The command line, and the subcommands it dispatches to.
//!
//! Every job the program does is a variant of [`Command`], and
//! [`execute`] matches on it with no wildcard arm: adding a variant fails
//! the build until it is dispatched (`wildcard_enum_match_arm` is denied).
//!
//! Commands write to the `out` they are handed instead of reaching for
//! standard output themselves. The binary passes the real stdout; tests
//! pass a `Vec<u8>` and read back exactly what a user would have seen.
//!
//! `hello` and `sum` are placeholders that show the shape (an optional
//! flag, a list of typed positionals, an error path). Replace them with
//! the program's real commands.

use std::io::Write;

/// Who `hello` greets when nobody is named.
const DEFAULT_NAME: &str = "world";

/// The word `hello` greets with when no preference is saved.
const DEFAULT_GREETING: &str = "Hello";

/// The command line.
///
/// `about` comes from the `description` in `Cargo.toml`, so `--help` and
/// the published crate metadata cannot drift apart. A subcommand is
/// required: a bare run prints usage and exits 2.
#[derive(clap::Parser, Debug)]
#[command(name = "@@bin@@", version, about)]
pub(crate) struct Cli {
    /// What to do.
    #[command(subcommand)]
    pub(crate) command: Command,
}

/// The subcommands.
#[derive(clap::Subcommand, Debug)]
pub(crate) enum Command {
    /// Print a greeting.
    Hello {
        /// Who to greet.
        #[arg(long, value_name = "NAME")]
        name: Option<String>,
    },
    /// Add up whole numbers and print the total.
    Sum {
        /// The numbers to add.
        #[arg(required = true, allow_negative_numbers = true)]
        numbers: Vec<i64>,
    },
    // @if http_ureq | http_reqwest
    /// Fetch a URL and print the response body.
    Fetch {
        /// The `http://` or `https://` address to read.
        url: String,
    },
    // @end
    // @if sqlite
    /// Open the local database and print its schema version.
    Db,
    // @end
}

/// Parses `args`, or prints why it could not and yields the exit code.
///
/// Help and `--version` are "errors" to clap but successes to the user,
/// so they exit 0; anything clap refused exits 2.
pub(crate) fn parse<I, T>(args: I) -> Result<Cli, std::process::ExitCode>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    use clap::Parser as _;
    Cli::try_parse_from(args).map_err(|error| {
        // Printing is best effort: if the terminal is gone there is no one
        // left to tell, and the exit code still carries the outcome.
        let _ = error.print();
        if error.use_stderr() {
            std::process::ExitCode::from(2)
        } else {
            std::process::ExitCode::SUCCESS
        }
    })
}

/// Runs the subcommand `options` selects.
// @if async_tokio
pub(crate) async fn execute(options: Cli, out: &mut impl Write) -> anyhow::Result<()> {
// @else
pub(crate) fn execute(options: Cli, out: &mut impl Write) -> anyhow::Result<()> {
// @end
    match options.command {
        Command::Hello { name } => hello(out, name.as_deref()),
        Command::Sum { numbers } => sum(out, &numbers),
        // @if http_ureq | http_reqwest
        // @if async_tokio
        Command::Fetch { url } => fetch(&url, out).await,
        // @else
        Command::Fetch { url } => fetch(&url, out),
        // @end
        // @end
        // @if sqlite
        Command::Db => db_version(out),
        // @end
    }
}

/// `hello`: one line of greeting.
fn hello(out: &mut impl Write, name: Option<&str>) -> anyhow::Result<()> {
    // @if serde & config
    let saved = crate::config::load();
    let greeting = saved.greeting.as_deref().unwrap_or(DEFAULT_GREETING);
    let name = name.or(saved.name.as_deref()).unwrap_or(DEFAULT_NAME);
    // @else
    let greeting = DEFAULT_GREETING;
    let name = name.unwrap_or(DEFAULT_NAME);
    // @end
    // @if !log_tracing
    log::debug!("greeting {name} with {greeting:?}");
    // @end
    writeln!(out, "{greeting}, {name}!")?;
    Ok(())
}

/// `sum`: the total of `numbers`, or an error if it does not fit in an
/// `i64`.
fn sum(out: &mut impl Write, numbers: &[i64]) -> anyhow::Result<()> {
    let total = numbers
        .iter()
        .try_fold(0_i64, |total, &n| total.checked_add(n))
        .ok_or_else(|| anyhow::anyhow!("the total does not fit in a 64-bit integer"))?;
    writeln!(out, "{total}")?;
    Ok(())
}
// @if http_ureq | http_reqwest

/// `fetch`: the body of `url`, written to `out`.
///
/// A non-2xx status is an error rather than a body, so a script piping
/// this command never mistakes an error page for content.
// @if http_reqwest & async_tokio
async fn fetch(url: &str, out: &mut impl Write) -> anyhow::Result<()> {
    use anyhow::Context as _;
    let response = reqwest::get(url)
        .await
        .with_context(|| format!("requesting {url}"))?;
    let body = response.error_for_status()?.text().await?;
    // @elif http_reqwest
fn fetch(url: &str, out: &mut impl Write) -> anyhow::Result<()> {
    use anyhow::Context as _;
    let response = reqwest::blocking::get(url).with_context(|| format!("requesting {url}"))?;
    let body = response.error_for_status()?.text()?;
    // @elif async_tokio
async fn fetch(url: &str, out: &mut impl Write) -> anyhow::Result<()> {
    use anyhow::Context as _;
    // ureq blocks, so it runs on the blocking pool rather than stalling
    // the async worker that called it.
    let owned = url.to_owned();
    let body =
        tokio::task::spawn_blocking(move || ureq::get(&owned).call()?.body_mut().read_to_string())
            .await?
            .with_context(|| format!("requesting {url}"))?;
    // @else
fn fetch(url: &str, out: &mut impl Write) -> anyhow::Result<()> {
    use anyhow::Context as _;
    let body = ureq::get(url)
        .call()
        .and_then(|mut response| response.body_mut().read_to_string())
        .with_context(|| format!("requesting {url}"))?;
    // @end
    writeln!(out, "{body}")?;
    Ok(())
}
// @end
// @if sqlite

/// `db`: opens the database (creating and migrating it if needed) and
/// reports which schema version it is at.
fn db_version(out: &mut impl Write) -> anyhow::Result<()> {
    let connection = crate::db::open()?;
    let version = crate::db::schema_version(&connection)?;
    writeln!(out, "schema version {version}")?;
    Ok(())
}
// @end
