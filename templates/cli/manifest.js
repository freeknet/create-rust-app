// @ts-check
/**
 * Drops the optional modules whose crates were not selected, and picks the command-line shape:
 * with `subcommands` the `*_subcommands.rs` variants replace `src/cli.rs` and `tests/cli.rs`.
 * @param {import('../../src/types.ts').Ctx} ctx @param {{ src: string, dest: string }[]} files
 */
export default function (ctx, files) {
  const f = ctx.flags;
  const sub = f.has('subcommands');
  /** @type {Record<string, boolean>} */
  const keep = {
    'src/config.rs': f.has('serde') && f.has('config'),
    'src/db.rs': f.has('sqlite'),
    'src/cli.rs': !sub,
    'tests/cli.rs': !sub,
    'src/cli_subcommands.rs': sub,
    'tests/cli_subcommands.rs': sub,
  };
  return files
    .filter(({ dest }) => keep[dest] ?? true)
    .map((file) => ({ ...file, dest: file.dest.replace(/_subcommands\.rs$/, '.rs') }));
}
