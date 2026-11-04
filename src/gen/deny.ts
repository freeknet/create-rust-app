import type { Ctx } from '../types.ts';
/** deny.toml, from strobe/rustaman. */

const LICENSES = [
  'MIT', 'MIT-0', 'Apache-2.0', 'Apache-2.0 WITH LLVM-exception', 'BSD-2-Clause', 'BSD-3-Clause',
  'ISC', 'Zlib', 'Unicode-3.0', 'CC0-1.0', '0BSD', 'Unlicense', 'BSL-1.0', 'MPL-2.0', 'OFL-1.1',
  'Ubuntu-font-1.0',
];

/** @param {any} ctx */
export function denyToml(ctx: Ctx) {
  const allow = [...LICENSES];
  // webpki-roots (pulled in by rustls) is CDLA-Permissive-2.0.
  if (ctx.crates.http !== 'none') allow.push('CDLA-Permissive-2.0');
  return `# cargo-deny: \`cargo deny check\`. CI runs this on every push.

[graph]
targets = ["x86_64-pc-windows-msvc", "x86_64-unknown-linux-gnu"]
all-features = true

[advisories]
yanked = "warn"
ignore = []

[licenses]
allow = [
${allow.map((l: string) => `    ${JSON.stringify(l)},`).join('\n')}
]
confidence-threshold = 0.9

# Our own crates are unpublished; their licence is ours to state, not cargo-deny's to check.
[licenses.private]
ignore = true

[bans]
multiple-versions = "warn"
deny = []

[sources]
unknown-registry = "deny"
unknown-git = "deny"
`;
}
