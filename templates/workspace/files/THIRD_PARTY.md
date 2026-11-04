# Third-party acknowledgements

@@displayName@@ builds on the Rust community's libraries and tools.
The project's own license is in [LICENSE](LICENSE); dependencies retain
their respective licenses.

## Dependency inventory

`Cargo.lock` records the exact dependency versions. After resolving dependencies,
run `cargo metadata --locked --format-version 1` to inspect each package's
license, repository and manifest path. `cargo tree --workspace` shows how they
are used. Development tools, including `xtask`, are not shipped in the app.

Before distributing a release, inventory the dependencies actually shipped for
each target and include the license texts and notices they require. Also record
any bundled fonts, images or native libraries here with their source and license.

When enabled, `cargo deny check` checks dependency licenses and advisories
against `deny.toml`; it does not assemble distribution notices.
