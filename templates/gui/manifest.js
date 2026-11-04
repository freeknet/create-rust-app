// @ts-check
/**
 * Drops the files of every GUI feature that is switched off. The code that references them is
 * gated with line directives (`// @if themes` …), so each flag is independently removable.
 */

/** dest (before the mount prefix, after token substitution) → flag that keeps it. */
const OWNED = [
  [/^src\/brand\.rs$/, 'brand'],
  [/^src\/gui\/icons\.rs$/, 'brand'],
  [/^examples\/brand_assets\.rs$/, 'brand'],
  [/^assets\/themes\.toml$/, 'themes'],
  [/^src\/motion\.rs$/, 'motion'],
  [/^src\/gui\/ui\/motion\.rs$/, 'motion'],
  [/^src\/icon\.rs$/, 'icons'],
  [/^src\/gui\/ui\/icon\.rs$/, 'icons'],
  [/^src\/config\.rs$/, 'config'],
  [/^build\.rs$/, 'winres'],
  [/^assets\/[^/]+\.manifest$/, 'winres'],
  [/^assets\/[^/]+\.ico$/, 'winres'],
  [/^examples\/screenshot\.rs$/, 'screenshotExample'],
  // The eframe runner; the gui-glow group ships its own file at this dest.
  [/^src\/gui\/run\.rs$/, 'gui_eframe'],
];

/**
 * @param {import('../../src/types.ts').Ctx} ctx
 * @param {{ src: string, dest: string }[]} files
 */
export default function manifest(ctx, files) {
  return files.filter(({ dest }) => {
    const hit = OWNED.find(([re]) => /** @type {RegExp} */ (re).test(dest));
    return !hit || ctx.flags.has(/** @type {string} */ (hit[1]));
  });
}
