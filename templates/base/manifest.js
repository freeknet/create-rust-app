// @ts-check
/**
 * Keep optional documents and select exactly one licence family.
 * @param {{ flags: Set<string> }} ctx
 * @param {{ src: string, dest: string }[]} files
 * @returns {{ src: string, dest: string }[]}
 */
export default function manifest(ctx, files) {
  const { flags } = ctx;
  return files.flatMap((file) => {
    if (file.dest === 'rust-toolchain.toml' && !flags.has('toolchainPin')) return [];
    if (file.dest === 'SECURITY.md' && !flags.has('securityMd')) return [];
    if (['AGENTS.md', 'CLAUDE.md'].includes(file.dest) && !flags.has('agentDocs')) return [];
    if (file.dest === 'LICENSE-MIT') {
      if (flags.has('license_dual')) return [file];
      return flags.has('license_mit') ? [{ ...file, dest: 'LICENSE' }] : [];
    }
    if (file.dest === 'LICENSE-APACHE') {
      if (flags.has('license_dual')) return [file];
      return flags.has('license_apache') ? [{ ...file, dest: 'LICENSE' }] : [];
    }
    if (file.dest === 'LICENSE-MIT-CC') {
      return flags.has('license_mit_cc') ? [{ ...file, dest: 'LICENSE' }] : [];
    }
    return [file];
  });
}
