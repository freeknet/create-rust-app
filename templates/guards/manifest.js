// @ts-check
/**
 * @param {any} ctx
 * @param {{ src: string, dest: string }[]} files
 */
export default function (ctx, files) {
  return files.filter(({ dest }) => {
    switch (dest) {
      case 'src/header_check.rs': return ctx.flags.has('headerCheck');
      case 'src/unsafe_check.rs': return ctx.flags.has('unsafeCheck');
      case 'tests/toolchain_pin.rs': return ctx.flags.has('toolchainPin');
      case 'examples/changelog.rs': return ctx.flags.has('changelogGen') && ctx.flags.has('single');
      default: return false;
    }
  });
}
