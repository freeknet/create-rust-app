// ============================================================================
// Module:       @@module@@
// Description:  The command line: the few switches that cannot be reached from
//               inside the window.
//
// @if clap
// Dependencies: clap (derive)
// @else
// Dependencies: std only (a hand-rolled parser, no clap)
// @end
// ============================================================================

//! The command line.
//!
//! Deliberately small. A desktop app is not a command-line tool, and every
//! flag added here is a flag that has to keep working. The ones that exist
//! are the ones that cannot be reached any other way: an override for
//! testing, and an escape hatch for a config that made the window unusable.
// @if subcommands
//!
//! A subcommand ([`Command`]) is a headless job instead: it runs, prints
//! and exits without a window, so scripts and CI can drive the app.
// @end

/// The parsed command line.
// @if clap
#[derive(clap::Parser, Debug, Default, PartialEq)]
#[command(name = "@@bin@@", version, about = crate::TAGLINE)]
// @else
#[derive(Debug, Default, PartialEq)]
// @end
// @if config
pub struct Cli {
    // @if themes
    /// Select this theme for the session (and save it as the preference).
    // @if clap
    #[arg(long, value_name = "ID")]
    // @end
    pub theme: Option<String>,
    // @end
    /// Set the UI in this installed font family, by name.
    // @if clap
    #[arg(long, value_name = "FAMILY")]
    // @end
    pub font: Option<String>,
    /// Start from the built-in defaults and overwrite the saved preferences
    /// on exit: the escape hatch for a config that made the app unusable.
    // @if clap
    #[arg(long)]
    // @end
    pub reset: bool,
    // @if subcommands
    /// A headless job to run instead of opening the window.
    #[command(subcommand)]
    pub command: Option<Command>,
    // @end
}
// @elif subcommands
pub struct Cli {
    /// A headless job to run instead of opening the window.
    #[command(subcommand)]
    pub command: Option<Command>,
}
// @else
pub struct Cli {}
// @end
// @if subcommands

/// The headless jobs. Each runs, writes to stdout and exits without opening
/// a window, for scripts, CI and agents; a bare run opens the window.
///
/// Add a variant per job and a matching arm in [`Command::run`]. There is no
/// wildcard arm, so a variant without one fails the build.
#[derive(clap::Subcommand, Clone, Debug, PartialEq, Eq)]
pub enum Command {
    /// List the themes this build can draw in, one `id<TAB>name` per line.
    Themes,
    /// Print where the app keeps its files, one `what<TAB>path` per line.
    Paths,
}

impl Command {
    /// Runs the job, writing its output to `out`.
    ///
    /// # Errors
    ///
    /// When `out` cannot be written to, or the job itself fails.
    pub fn run(self, out: &mut impl std::io::Write) -> anyhow::Result<()> {
        match self {
            Self::Themes => {
                // @if themes
                for theme in crate::theme::Catalog::load().themes() {
                    writeln!(out, "{}\t{}", theme.id, theme.name)?;
                }
                // @else
                let theme = crate::theme::signature();
                writeln!(out, "{}\t{}", theme.id, theme.name)?;
                // @end
            }
            Self::Paths => {
                // @if config | themes
                let mut paths: Vec<(&str, std::path::PathBuf)> = Vec::new();
                // @else
                let paths: Vec<(&str, std::path::PathBuf)> = Vec::new();
                // @end
                // @if config
                paths.extend(crate::config::config_path().map(|path| ("config", path)));
                // @end
                // @if themes
                paths.extend(crate::theme::user_theme_dir().map(|dir| ("themes", dir)));
                // @end
                if paths.is_empty() {
                    writeln!(out, "(none: this build keeps no files)")?;
                }
                for (what, path) in paths {
                    writeln!(out, "{what}\t{}", path.display())?;
                }
            }
        }
        Ok(())
    }
}
// @end
// @if !clap

/// What a parse produced: options to run with, or text to print and exit.
#[derive(Debug, PartialEq)]
pub enum Parsed {
    /// Run the app with these options.
    Run(Cli),
    /// Print this to stdout and exit successfully (`--help`, `--version`).
    Print(String),
}

impl Cli {
    /// Parses arguments (without the program name).
    ///
    /// # Errors
    ///
    /// A message for an unknown flag or a flag missing its value; the
    /// binary prints it and exits with status 2, as clap would.
    pub fn parse_from<I: IntoIterator<Item = String>>(args: I) -> Result<Parsed, String> {
        // @if config
        let mut cli = Self::default();
        let mut args = args.into_iter();
        while let Some(arg) = args.next() {
            let mut value = |flag: &str| {
                args.next()
                    .ok_or_else(|| format!("{flag} needs a value; see --help"))
            };
            // @else
        let cli = Self::default();
        if let Some(arg) = args.into_iter().next() {
            // @end
            match arg.as_str() {
                "-h" | "--help" => return Ok(Parsed::Print(help())),
                "-V" | "--version" => {
                    return Ok(Parsed::Print(format!(
                        "{} {}",
                        crate::APP_ID,
                        env!("CARGO_PKG_VERSION")
                    )));
                }
                // @if config
                // @if themes
                "--theme" => cli.theme = Some(value("--theme")?),
                // @end
                "--font" => cli.font = Some(value("--font")?),
                "--reset" => cli.reset = true,
                // @end
                other => return Err(format!("unexpected argument '{other}'; see --help")),
            }
        }
        Ok(Parsed::Run(cli))
    }
}

/// The `--help` text.
fn help() -> String {
    let mut text = format!(
        "{}\n\nUsage: {} [OPTIONS]\n\nOptions:\n",
        crate::TAGLINE,
        crate::APP_ID
    );
    // @if config
    // @if themes
    text.push_str("      --theme <ID>       Select this theme for the session\n");
    // @end
    text.push_str("      --font <FAMILY>    Set the UI in this installed font family\n");
    text.push_str("      --reset            Start from the default preferences\n");
    // @end
    text.push_str("  -h, --help             Print help\n  -V, --version          Print version\n");
    text
}
// @end

#[cfg(test)]
mod tests {
    use super::*;
    // @if clap
    use clap::Parser as _;

    /// The program name the parser sees first.
    const BIN: &str = "@@bin@@";

    /// Parses `args` after a program name.
    fn parse(args: &[&str]) -> Result<Cli, clap::Error> {
        Cli::try_parse_from(std::iter::once(BIN).chain(args.iter().copied()))
    }
    // @else

    /// Parses `args`, expecting options to run with.
    fn parse(args: &[&str]) -> Result<Cli, String> {
        match Cli::parse_from(args.iter().map(ToString::to_string))? {
            Parsed::Run(cli) => Ok(cli),
            Parsed::Print(text) => Err(text),
        }
    }
    // @end

    #[test]
    fn the_bare_invocation_parses_to_the_defaults() -> anyhow::Result<()> {
        let cli = parse(&[]).map_err(|error| anyhow::anyhow!("{error}"))?;
        assert_eq!(cli, Cli::default(), "double-clicked from Explorer");
        Ok(())
    }

    #[test]
    fn an_unknown_flag_is_rejected_rather_than_ignored() {
        // A typo'd flag that is silently ignored appears not to work.
        assert!(parse(&["--nope"]).is_err());
    }
    // @if config

    #[test]
    fn a_font_is_taken() -> anyhow::Result<()> {
        let cli = parse(&["--font", "Inter"]).map_err(|error| anyhow::anyhow!("{error}"))?;
        assert_eq!(cli.font.as_deref(), Some("Inter"));
        Ok(())
    }

    #[test]
    fn a_flag_missing_its_value_is_rejected() {
        assert!(parse(&["--font"]).is_err());
    }

    #[test]
    fn reset_is_a_flag_rather_than_a_value() -> anyhow::Result<()> {
        let cli = parse(&["--reset"]).map_err(|error| anyhow::anyhow!("{error}"))?;
        assert!(cli.reset, "--reset should set the flag");
        Ok(())
    }
    // @if themes

    #[test]
    fn a_theme_override_is_taken() -> anyhow::Result<()> {
        let cli = parse(&["--theme", "nebula"]).map_err(|error| anyhow::anyhow!("{error}"))?;
        assert_eq!(cli.theme.as_deref(), Some("nebula"));
        Ok(())
    }
    // @end
    // @end
}
