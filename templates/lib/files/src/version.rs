// ============================================================================
// Module:       @@module@@
// Description:  `Version`: a MAJOR.MINOR.PATCH triple that parses, prints,
//               and orders the way people expect.
//
// Dependencies: crate::error
// ============================================================================

//! A small, real module to grow from: a version number.
//!
//! It shows the shape most library types end up with. Construction that
//! cannot fail is a `const fn`; construction that can is [`FromStr`],
//! returning the crate's [`Error`]; and [`Display`] is its exact inverse,
//! so a value survives a round trip through text unchanged.
//!
//! Ordering is derived, and derived ordering compares fields in
//! declaration order. That is why the fields are `major`, `minor`,
//! `patch` in that order, and it is what makes `1.10.0 > 1.9.0` hold where
//! comparing the strings would get it backwards.
//!
//! [`FromStr`]: std::str::FromStr
//! [`Display`]: std::fmt::Display

use crate::error::{Error, Result};

/// A `MAJOR.MINOR.PATCH` version number.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Default)]
pub struct Version {
    /// Incremented for incompatible changes.
    pub major: u64,
    /// Incremented for compatible additions.
    pub minor: u64,
    /// Incremented for compatible fixes.
    pub patch: u64,
}

impl Version {
    /// A version from its three parts.
    #[must_use]
    pub const fn new(major: u64, minor: u64, patch: u64) -> Self {
        Self {
            major,
            minor,
            patch,
        }
    }

    /// Whether code written against `self` works with `other` under the
    /// usual rule: same major version, and `other` at least as new.
    ///
    /// ```
    /// use @@crate@@::Version;
    ///
    /// assert!(Version::new(1, 2, 0).is_compatible_with(Version::new(1, 4, 1)));
    /// assert!(!Version::new(1, 2, 0).is_compatible_with(Version::new(2, 0, 0)));
    /// ```
    #[must_use]
    pub fn is_compatible_with(self, other: Self) -> bool {
        self.major == other.major && other >= self
    }
}

impl std::str::FromStr for Version {
    type Err = Error;

    fn from_str(text: &str) -> Result<Self> {
        let text = text.trim();
        if text.is_empty() {
            return Err(Error::Empty);
        }
        let parts: Vec<&str> = text.split('.').collect();
        let [major, minor, patch] = parts.as_slice() else {
            return Err(Error::PartCount { found: parts.len() });
        };
        Ok(Self::new(number(major)?, number(minor)?, number(patch)?))
    }
}

/// Parses one part of a version.
fn number(part: &str) -> Result<u64> {
    part.parse().map_err(|source| Error::InvalidPart {
        part: part.to_owned(),
        source,
    })
}

impl std::fmt::Display for Version {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

#[cfg(test)]
mod tests {
    use super::{Error, Version};

    #[test]
    fn parsing_and_printing_round_trip() -> anyhow::Result<()> {
        let version: Version = " 1.10.3 ".parse()?;
        assert_eq!(
            version,
            Version::new(1, 10, 3),
            "surrounding space is ignored"
        );
        assert_eq!(
            version.to_string(),
            "1.10.3",
            "printing is the inverse of parsing"
        );
        Ok(())
    }

    #[test]
    fn ordering_is_numeric_not_textual() -> anyhow::Result<()> {
        let older: Version = "1.9.0".parse()?;
        let newer: Version = "1.10.0".parse()?;
        assert!(newer > older, "1.10.0 must sort after 1.9.0");
        Ok(())
    }

    #[test]
    fn each_malformed_input_names_its_problem() -> anyhow::Result<()> {
        assert_eq!("".parse::<Version>(), Err(Error::Empty), "empty input");
        assert_eq!(
            "1.2".parse::<Version>(),
            Err(Error::PartCount { found: 2 }),
            "too few parts"
        );
        let invalid = "1.x.3".parse::<Version>();
        assert!(
            matches!(&invalid, Err(Error::InvalidPart { part, .. }) if part == "x"),
            "a non-numeric part is named, got {invalid:?}"
        );
        Ok(())
    }

    #[test]
    fn compatibility_follows_the_major_version() -> anyhow::Result<()> {
        let base = Version::new(1, 2, 0);
        assert!(base.is_compatible_with(Version::new(1, 2, 0)), "itself");
        assert!(
            base.is_compatible_with(Version::new(1, 3, 0)),
            "newer minor"
        );
        assert!(
            !base.is_compatible_with(Version::new(1, 1, 9)),
            "older minor"
        );
        assert!(
            !base.is_compatible_with(Version::new(2, 2, 0)),
            "newer major"
        );
        Ok(())
    }
}
