// ============================================================================
// Module:       @@module@@
// Description:  Logging setup: diagnostics to stderr, filtered by level, so
//               stdout stays clean for the program's real output.
//
// Dependencies: the selected logging crate
// ============================================================================

//! Logging setup.
//!
//! Logs go to stderr and output goes to stdout, so piping the program into
//! another one never mixes the two. The level defaults to `info`;
//! `RUST_LOG` overrides it where the logger supports that.
//!
//! [`init`] may run more than once (every test that calls the entry point
//! runs it), and something else may have installed a logger first. Both
//! are fine: the first logger installed wins and later attempts are no-ops
//! rather than errors.

/// Installs the logger, unless one is already installed.
pub(crate) fn init() {
    // @if log_env_logger
    let env = env_logger::Env::default().default_filter_or("info");
    let _ = env_logger::Builder::from_env(env).try_init();
    // @elif log_tracing
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .try_init();
    // @else
    if log::set_logger(&LOGGER).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
    // @end
}
// @if !log_env_logger & !log_tracing

/// A minimal stderr logger, so the `log` macros print without pulling in
/// a logging backend. Swap in `env_logger` if you want `RUST_LOG` filters.
struct StderrLogger;

/// The installed logger. `log` needs a `'static` one.
static LOGGER: StderrLogger = StderrLogger;

impl log::Log for StderrLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            use std::io::Write as _;
            // Best effort: a closed stderr is no reason to fail the program.
            let _ = writeln!(
                std::io::stderr().lock(),
                "[{}] {}",
                record.level(),
                record.args()
            );
        }
    }

    fn flush(&self) {}
}
// @end
