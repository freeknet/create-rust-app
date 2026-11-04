// @ts-check
/**
 * Template groups, in application order (later wins on the same dest).
 * `mount(ctx)` is a dest prefix: the GUI/app code lives at the project root for a
 * single crate and under `crates/<name>-app/` in a workspace.
 *
 * @typedef {{ id: string, when: (ctx: any) => boolean, mount?: (ctx: any) => string }} Group
 */

/** @param {any} ctx */
const appMount = (ctx) => (ctx.workspace ? `crates/${ctx.appCrate}/` : '');

/** @type {Group[]} */
export const GROUPS = [
  { id: 'base', when: () => true },
  { id: 'github', when: (c) => ['ci', 'release', 'dependabot', 'issueTemplates', 'codeowners'].some((k) => c.flags.has(k)) },
  { id: 'cli', when: (c) => c.kind === 'cli' },
  { id: 'tui', when: (c) => c.kind === 'tui' },
  { id: 'lib', when: (c) => c.kind === 'lib' },
  { id: 'gui', when: (c) => c.hasGui, mount: appMount },
  { id: 'gui-glow', when: (c) => c.flags.has('gui_winit_glow'), mount: appMount },
  { id: 'gui-features', when: (c) => c.hasGui, mount: appMount },
  { id: 'guards', when: (c) => ['headerCheck', 'unsafeCheck', 'toolchainPin', 'changelogGen'].some((k) => c.flags.has(k)), mount: appMount },
  { id: 'workspace', when: (c) => c.workspace },
];
