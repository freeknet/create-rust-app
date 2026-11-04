// ============================================================================
// Module:       @@module@@
// Description:  Logging setup: diagnostics to a file, because the terminal
//               belongs to the UI while it runs.
//
// Dependencies: the selected logging crate
// ============================================================================

//! Logging setup.
//!
//! A terminal UI cannot log to stderr: stderr is the same screen the UI
//! is drawn on, and a stray line tears the frame until the next redraw.
//! So logs go to `@@name@@.log` in the system temp directory instead
//! (`tail -f` it from a second terminal while the app runs).
//!
//! If the file cannot be created the app runs without logs; losing the
//! diagnostics is better than refusing to start.

use std::path::PathBuf;

/// Where the log file goes.
fn log_path() -> PathBuf {
    std::env::temp_dir().join("@@name@@.log")
}

/// Installs the file logger, unless one is already installed.
pub(crate) fn init() {
    let Ok(file) = std::fs::File::create(log_path()) else {
        return;
    };
    // @if log_env_logger
    let env = env_logger::Env::default().default_filter_or("info");
    let _ = env_logger::Builder::from_env(env)
        .target(env_logger::Target::Pipe(Box::new(file)))
        .try_init();
    // @elif log_tracing
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_ansi(false)
        .with_writer(std::sync::Mutex::new(file))
        .try_init();
    // @else
    let logger = LOGGER.get_or_init(|| FileLogger { file });
    if log::set_logger(logger).is_ok() {
        log::set_max_level(log::LevelFilter::Info);
    }
    log::info!("@@name@@ started");
    // @end
}
// @if !log_env_logger & !log_tracing

/// A minimal file logger, so the `log` macros work without pulling in a
/// logging backend.
struct FileLogger {
    /// The open log file. `&File` implements `Write`, so no lock is needed.
    file: std::fs::File,
}

/// The installed logger. `log` needs a `'static` one.
static LOGGER: std::sync::OnceLock<FileLogger> = std::sync::OnceLock::new();

impl log::Log for FileLogger {
    fn enabled(&self, metadata: &log::Metadata<'_>) -> bool {
        metadata.level() <= log::max_level()
    }

    fn log(&self, record: &log::Record<'_>) {
        if self.enabled(record.metadata()) {
            use std::io::Write as _;
            // Best effort: a full disk is no reason to stop the app.
            let _ = writeln!(&self.file, "[{}] {}", record.level(), record.args());
        }
    }

    fn flush(&self) {
        use std::io::Write as _;
        let _ = (&self.file).flush();
    }
}
// @end
