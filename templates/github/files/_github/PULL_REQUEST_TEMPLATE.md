## Summary

What this change does and why. One or two sentences: the *why* matters more
than the *what*. If this fixes an issue, reference it here (e.g. `Closes #12`).

## Test plan

What you ran, and on what. The checks below must be clean before this is
mergeable; a warning is a build failure in CI.
<!-- @if has_gui -->

Say whether you ran it **on Windows**, the platform the app ships for. A
change to anything drawn wants a screenshot.
<!-- @end -->

## Checklist

<!-- @if workspace -->
- [ ] `cargo fmt --all -- --check` passes
- [ ] `cargo clippy --workspace --all-targets --all-features -- -D warnings` passes
- [ ] `cargo test --workspace --all-features` passes
<!-- @else -->
- [ ] `cargo fmt --all -- --check` passes
- [ ] `cargo clippy --all-targets --all-features -- -D warnings` passes
- [ ] `cargo test --all-features` passes
<!-- @end -->
- [ ] No new `unwrap` / `expect` / `panic!`, not even in tests
<!-- @if headerCheck -->
- [ ] New `.rs` files carry the module header banner (`Module:` / `Description:` /
      `Dependencies:`) and the matching `mod` declaration
<!-- @end -->
<!-- @if unsafeCheck -->
- [ ] Every new `unsafe` block is inside a safe leaf wrapper under `src/win/`,
      contains only the one call, and carries a `// SAFETY:` comment
<!-- @end -->
<!-- @if has_gui -->
- [ ] UI changes include a screenshot
<!-- @end -->
- [ ] Commit messages use the `feat:` / `fix:` / `perf:` / `refactor:` / `docs:` /
      `test:` / `build:` / `ci:` prefixes

Full guidelines, including how to build and what CI enforces, are in
[`CONTRIBUTING.md`](https://github.com/@@github@@/@@name@@/blob/main/CONTRIBUTING.md).
