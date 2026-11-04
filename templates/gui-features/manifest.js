// @ts-check
/**
 * The optional GUI features. Each file is kept only when its flag is on; the gui group's code
 * references them behind matching line directives (`// @if tray` …).
 */

/** dest → predicate on the flag set that keeps it. */
const OWNED = [
  [/^src\/tray\.rs$/, (/** @type {Set<string>} */ f) => f.has('tray')],
  [/^src\/win\/tray\.rs$/, (/** @type {Set<string>} */ f) => f.has('tray')],
  [/^src\/win\/single_instance\.rs$/, (/** @type {Set<string>} */ f) => f.has('singleInstance')],
  [/^src\/win\/window\.rs$/, (/** @type {Set<string>} */ f) => f.has('tray') || f.has('singleInstance')],
  [/^src\/command_palette\.rs$/, (/** @type {Set<string>} */ f) => f.has('commandPalette')],
  [/^src\/gui\/ui\/command_palette\.rs$/, (/** @type {Set<string>} */ f) => f.has('commandPalette')],
];

/**
 * @param {import('../../src/types.ts').Ctx} ctx
 * @param {{ src: string, dest: string }[]} files
 */
export default function manifest(ctx, files) {
  return files.filter(({ dest }) => {
    const hit = OWNED.find(([re]) => /** @type {RegExp} */ (re).test(dest));
    return !hit || /** @type {(f: Set<string>) => boolean} */ (hit[1])(ctx.flags);
  });
}
