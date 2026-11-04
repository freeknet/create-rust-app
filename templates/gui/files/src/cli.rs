// ============================================================================
// Module:       @@module@@
// Description:  The command line: the few switches that cannot be reached from
//               inside the window.
//
// @if clap
// Dependencies: clap (derive)
// @else
// Dependencies: std only (a hand-rolled parser; clap was not selected)
// @end
// ============================================================================

//! The command line.
//!
//! Deliberately small. A desktop app is not a command-line tool, and every
//! flag added here is a flag that has to keep working. The ones that exist
//! are the ones that cannot be reached any other way: an override for
//! testing, and an escape hatch for a config that made the window unusable.

/// The parsed command line.
// @if clap
#[derive(clap::Parser, Debug, Default, PartialEq)]
#[command(name = "@@name@@", version, about = crate::TAGLINE)]
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
}
// @else
pub struct Cli {}
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
                        "@@name@@ {}",
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
        "{}\n\nUsage: @@name@@ [OPTIONS]\n\nOptions:\n",
        crate::TAGLINE
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

    /// Parses `args` after a program name.
    fn parse(args: &[&str]) -> Result<Cli, clap::Error> {
        Cli::try_parse_from(std::iter::once("@@name@@").chain(args.iter().copied()))
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
