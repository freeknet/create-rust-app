<!-- @if changelogGen & workspace -->
# Changelog

All notable changes to @@name@@, newest first.

**This file is generated.** It is rebuilt from the git history by
`cargo xtask changelog`, so released sections are rewritten in place and
edits to them do not survive. See `CONTRIBUTING.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- scaffold @@name@@ with create-rust-app
<!-- @elif changelogGen -->
# Changelog

All notable changes to @@name@@, newest first.

**This file is generated.** It is rebuilt from the git history by
`cargo run --example changelog`, so released sections are rewritten in
place and edits to them do not survive. See `CONTRIBUTING.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- scaffold @@name@@ with create-rust-app

[Unreleased]: https://github.com/@@github@@/@@name@@/commits/HEAD
<!-- @else -->
# Changelog

All notable changes to @@displayName@@, newest first.

Entries follow the conventional-commit subjects in the git history
(`feat:` under Added, `fix:` under Fixed, and so on). See `CONTRIBUTING.md`.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Project scaffolded with create-rust-app.
<!-- @end -->
