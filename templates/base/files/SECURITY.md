# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for a security vulnerability. Instead,
report it privately through GitHub's private vulnerability reporting on the
[Security tab](https://github.com/@@github@@/@@name@@/security/advisories/new).

Include what you found, how to reproduce it, and which version or commit you
tested against. Reports are acknowledged within a few days, and fixes land in
the next release.

## Supported versions

Only the latest release is supported. Fixes ship in a new release; there is
no backport window for older versions.

## Scope

What *is* in scope:

<!-- @if kind_lib -->
- **Memory safety.** Any way to cause undefined behaviour through the public
  API without writing `unsafe` yourself.
- **Untrusted input.** A panic, an unbounded allocation or an infinite loop
  reachable from input a caller could reasonably pass through unchecked.
- **The dependency tree.** A vulnerable dependency this crate pulls in that
<!-- @if cargoDeny -->
  `cargo deny check` has not caught.
<!-- @else -->
  an advisory database already lists.
<!-- @end -->
<!-- @else -->
- **Untrusted input.** Files, arguments, environment variables and anything
  read from disk or the network are attacker-influenced; a crash, hang or
  unbounded allocation reachable from them is a real finding.
<!-- @if unsafeCheck -->
- **Misuse of an `unsafe` block.** The platform surface is hand-wrapped in
  `src/win/`; a handle leak, a missing bounds check, or a struct layout that
  disagrees with what the system writes all belong here.
<!-- @end -->
<!-- @if config & serde & !kind_lib -->
- **The config file.** A config file that can make the app do something
  other than change its own settings.
<!-- @end -->
<!-- @if http_ureq | http_reqwest -->
- **Network traffic.** Anything that weakens TLS verification or sends data
  somewhere the user did not ask for.
<!-- @end -->
<!-- @if release -->
- **The release pipeline.** Release archives carry build-provenance and SBOM
  attestations (`gh attestation verify <file> -R @@github@@/@@name@@`); a way
  to ship an archive that verifies but was not built from the tagged source
  is in scope.
<!-- @end -->
- **The dependency tree.** A vulnerable dependency this project pulls in
  that has not been updated.
<!-- @end -->

Everything else (bug reports, feature requests, and questions) belongs on
the [issue tracker](https://github.com/@@github@@/@@name@@/issues); see
[`CONTRIBUTING.md`](CONTRIBUTING.md).
