// @ts-check
/**
 * Drops the optional modules whose crates were not selected.
 * @param {import('../../src/types.ts').Ctx} ctx @param {{ src: string, dest: string }[]} files
 */
export default function (ctx, files) {
  const f = ctx.flags;
  /** @type {Record<string, boolean>} */
  const keep = {
    'src/config.rs': f.has('serde') && f.has('config'),
    'src/db.rs': f.has('sqlite'),
  };
  return files.filter(({ dest }) => keep[dest] ?? true);
}
