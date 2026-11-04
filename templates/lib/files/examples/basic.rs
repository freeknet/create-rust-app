// ============================================================================
// Module:       @@module@@
// Description:  The crate's API end to end: parse, compare, and report a
//               bad input the way a caller would.
//
// Dependencies: @@crate@@
// ============================================================================

//! Run with `cargo run --example basic`.
//!
//! Examples are compiled by `cargo test`, so this one cannot quietly rot
//! as the API changes: if it stops building, the test run fails.

use @@crate@@::Version;

fn main() -> @@crate@@::Result<()> {
    let mut versions: Vec<Version> = ["1.10.0", "1.9.3", "0.4.1", "1.2.0"]
        .iter()
        .map(|text| text.parse())
        .collect::<@@crate@@::Result<_>>()?;
    versions.sort();
    let listed: Vec<String> = versions.iter().map(Version::to_string).collect();
    println!("sorted:  {}", listed.join(", "));

    let required = Version::new(1, 2, 0);
    for version in &versions {
        let verdict = if required.is_compatible_with(*version) {
            "compatible"
        } else {
            "incompatible"
        };
        println!("{version:>7} is {verdict} with {required}");
    }

    if let Err(error) = "1.x".parse::<Version>() {
        println!("\"1.x\" is rejected: {error}");
    }
    Ok(())
}
