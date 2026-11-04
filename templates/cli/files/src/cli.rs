// ============================================================================
// Module:       @@module@@
// Description:  The command line and what each command does.
//
// Dependencies: clap (derive) when selected; std::io for output
// ============================================================================

//! The command line, and the commands it dispatches to.
//!
//! Commands write to the `out` they are handed instead of reaching for
//! standard output themselves. The binary passes the real stdout; tests
//! pass a `Vec<u8>` and read back exactly what a user would have seen.
//!
//! Keep the surface small. Every flag added here is a flag that has to
//! keep working, so each one should earn its place by being the only way
//! to reach something.

use std::io::Write;

/// Who the default action greets when nobody is named.
const DEFAULT_NAME: &str = "world";

/// The word the default action greets with when no preference is saved.
const DEFAULT_GREETING: &str = "Hello";
// @if clap

/// The command line.
///
/// `about` comes from the `description` in `Cargo.toml`, so `--help` and
/// the published crate metadata cannot drift apart.
#[derive(clap::Parser, Debug)]
#[command(name = "@@name@@", version, about)]
pub(crate) struct Cli {
    /// Who to greet. Overrides the saved preference for this run.
    #[arg(long, value_name = "NAME")]
    pub(crate) name: Option<String>,
    // @if http_ureq | http_reqwest | sqlite

    /// Run one of the commands below instead of the greeting.
    #[command(subcommand)]
    pub(crate) command: Option<Command>,
    // @end
}
// @if http_ureq | http_reqwest | sqlite

/// The subcommands. Without one, the program runs the greeting.
#[derive(clap::Subcommand, Debug)]
pub(crate) enum Command {
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
// @end

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

/// Runs the command `options` selects.
// @if async_tokio
pub(crate) async fn execute(options: Cli, out: &mut impl Write) -> anyhow::Result<()> {
// @else
pub(crate) fn execute(options: Cli, out: &mut impl Write) -> anyhow::Result<()> {
// @end
    // @if http_ureq | http_reqwest | sqlite
    match options.command {
        // @if http_ureq | http_reqwest
        // @if async_tokio
        Some(Command::Fetch { url }) => fetch(&url, out).await,
        // @else
        Some(Command::Fetch { url }) => fetch(&url, out),
        // @end
        // @end
        // @if sqlite
        Some(Command::Db) => db_version(out),
        // @end
        None => greet(out, options.name.as_deref()),
    }
    // @else
    greet(out, options.name.as_deref())
    // @end
}
// @end

/// The default action: a greeting, so a fresh scaffold visibly does
/// something. Replace it with whatever the program is for.
pub(crate) fn greet(out: &mut impl Write, name: Option<&str>) -> anyhow::Result<()> {
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
// @if clap & http_ureq | clap & http_reqwest

/// Fetches `url` and writes the body to `out`.
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
// @if clap & sqlite

/// Opens the database (creating and migrating it if needed) and reports
/// which schema version it is at.
fn db_version(out: &mut impl Write) -> anyhow::Result<()> {
    let connection = crate::db::open()?;
    let version = crate::db::schema_version(&connection)?;
    writeln!(out, "schema version {version}")?;
    Ok(())
}
// @end
