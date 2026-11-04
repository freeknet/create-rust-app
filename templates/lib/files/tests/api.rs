// ============================================================================
// Module:       @@module@@
// Description:  The public API as a downstream crate sees it: only what is
//               exported from the crate root.
//
// Dependencies: @@crate@@, anyhow
// ============================================================================

//! The public API, used from outside the crate.
//!
//! Integration tests compile as a separate crate, so they can only reach
//! what is exported. A test here breaking is a signal that a change is
//! visible to users and may need a version bump.

use @@crate@@::{Error, Version};

#[test]
fn versions_parse_from_the_crate_root() -> anyhow::Result<()> {
    let version: Version = "2.0.1".parse()?;
    assert_eq!(version, Version::new(2, 0, 1), "the parts land in order");
    Ok(())
}

#[test]
fn errors_are_matchable_and_describe_themselves() -> anyhow::Result<()> {
    let error = "1.2.3.4".parse::<Version>().err();
    assert!(
        matches!(error, Some(Error::PartCount { found: 4 })),
        "four parts is a part-count error, got {error:?}"
    );
    let message = error.map(|error| error.to_string()).unwrap_or_default();
    assert!(
        message.contains("4 part"),
        "the message names the count: {message}"
    );
    Ok(())
}

#[test]
fn the_error_chain_reaches_the_underlying_cause() -> anyhow::Result<()> {
    let error = "1.2.-3".parse::<Version>().err();
    let source = error.as_ref().and_then(std::error::Error::source);
    assert!(
        source.is_some(),
        "an invalid part keeps its cause: {error:?}"
    );
    Ok(())
}
