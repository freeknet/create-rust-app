// @ts-check
/**
 * The xtask `changelog` command regenerates CHANGELOG.md, so it ships only with `changelogGen`;
 * without it the file is hand-edited and nothing may rewrite it.
 * @param {import('../../src/types.ts').Ctx} ctx
 * @param {{ src: string, dest: string }[]} files
 */
export default function (ctx, files) {
  return files.filter(({ dest }) => dest !== 'crates/xtask/src/changelog.rs' || ctx.flags.has('changelogGen'));
}
