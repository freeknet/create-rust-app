// @ts-check
/**
 * Each piece of GitHub automation is gated by its own tooling flag. A library has no
 * binary to release, so `release` gives it a manual crates.io publish workflow instead.
 * The PR template travels with the group.
 * @param {{ flags: Set<string> }} ctx
 * @param {{ src: string, dest: string }[]} files
 * @returns {{ src: string, dest: string }[]}
 */
export default function manifest(ctx, files) {
  const on = (/** @type {string} */ f) => ctx.flags.has(f);
  return files.filter(({ dest }) => {
    if (dest === '.github/workflows/ci.yml') return on('ci');
    if (dest === '.github/workflows/release.yml') return on('release') && on('has_bin');
    if (dest === '.github/workflows/publish.yml') return on('release') && on('kind_lib');
    if (dest === '.github/dependabot.yml') return on('dependabot');
    if (dest === '.github/CODEOWNERS') return on('codeowners');
    if (dest.startsWith('.github/ISSUE_TEMPLATE/')) return on('issueTemplates');
    return true;
  });
}
