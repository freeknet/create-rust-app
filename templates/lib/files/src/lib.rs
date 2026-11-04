// ============================================================================
// Module:       @@module@@
// Description:  Crate root: the public API, re-exported in one place, and
//               the crate-level docs that docs.rs opens on.
//
// Dependencies: None; declarations only. See the individual modules.
// ============================================================================

//! @@displayName@@: @@tagline@@
//!
//! The public API is re-exported here, so callers write
//! `@@crate@@::Version` rather than reaching into module paths that are
//! free to move between releases.
//!
//! ```
//! use @@crate@@::Version;
//!
//! let installed: Version = "1.4.2".parse()?;
//! let required = Version::new(1, 3, 0);
//! assert!(installed >= required);
//! assert_eq!(installed.to_string(), "1.4.2");
//! # Ok::<(), @@crate@@::Error>(())
//! ```
//!
//! Every fallible function returns [`Result`], whose error is the one
//! [`Error`] enum. Callers match on its variants instead of on message
//! text, and a new failure mode is a new variant the compiler points them
//! at.

// docs.rs builds with `--cfg docsrs` (see `[package.metadata.docs.rs]`),
// which turns on the nightly-only `doc_cfg` badges for feature-gated items.
#![cfg_attr(docsrs, feature(doc_cfg))]

mod error;
mod version;

pub use error::{Error, Result};
pub use version::Version;

// Test-only guard modules, when enabled, go last: rustfmt sorts adjacent
// `mod` lines, and these must not interleave with the ones above.
// @if headerCheck
#[cfg(test)]
mod header_check;
// @end
// @if unsafeCheck
#[cfg(test)]
mod unsafe_check;
// @end
