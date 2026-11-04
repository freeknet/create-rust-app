// ============================================================================
// Module:       @@module@@
// Description:  The crate's one error type and its `Result` alias.
//
// Dependencies: thiserror when selected; std otherwise
// ============================================================================

//! The crate's one error type.
//!
//! A library error is part of the API, so it is an enum callers can match
//! on rather than a boxed trait object or a string. It is
//! `#[non_exhaustive]`: adding a variant in a minor release is then not a
//! breaking change, because every downstream `match` already needs a
//! wildcard arm.

/// Shorthand for results whose error is [`Error`].
pub type Result<T, E = Error> = std::result::Result<T, E>;

/// Everything that can go wrong in this crate.
// @if thiserror
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[non_exhaustive]
pub enum Error {
    /// The input was empty (or only whitespace).
    #[error("empty version string")]
    Empty,
    /// The input did not have exactly three dot-separated parts.
    #[error("expected MAJOR.MINOR.PATCH, found {found} part(s)")]
    PartCount {
        /// How many parts there were.
        found: usize,
    },
    /// One part was not a non-negative integer.
    #[error("invalid version part {part:?}")]
    InvalidPart {
        /// The offending text.
        part: String,
        /// Why it did not parse.
        #[source]
        source: std::num::ParseIntError,
    },
}
// @else
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum Error {
    /// The input was empty (or only whitespace).
    Empty,
    /// The input did not have exactly three dot-separated parts.
    PartCount {
        /// How many parts there were.
        found: usize,
    },
    /// One part was not a non-negative integer.
    InvalidPart {
        /// The offending text.
        part: String,
        /// Why it did not parse.
        source: std::num::ParseIntError,
    },
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Empty => write!(f, "empty version string"),
            Self::PartCount { found } => {
                write!(f, "expected MAJOR.MINOR.PATCH, found {found} part(s)")
            }
            Self::InvalidPart { part, .. } => write!(f, "invalid version part {part:?}"),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidPart { source, .. } => Some(source),
            Self::Empty | Self::PartCount { .. } => None,
        }
    }
}
// @end
