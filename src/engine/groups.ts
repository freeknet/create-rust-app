import type { Ctx } from '../types.ts';
import type { Group } from '../types.ts';
/**
 * Template groups, in application order (later wins on the same dest).
 * `mount(ctx)` is a dest prefix: the GUI/app code lives at the project root for a
 * single crate and under `crates/<name>-app/` in a workspace.
 *
 * @typedef {{ id: string, when: (ctx: any) => boolean, mount?: (ctx: any) => string }} Group
 */

/** @param {any} ctx */
const appMount = (ctx: Ctx) => (ctx.workspace ? `crates/${ctx.appCrate}/` : '');

/** @type {Group[]} */
export const GROUPS: Group[] = [
  { id: 'base', when: () => true },
  { id: 'github', when: (c: Ctx) => ['ci', 'release', 'dependabot', 'issueTemplates', 'codeowners'].some((k: string) => c.flags.has(k)) },
  { id: 'cli', when: (c: Ctx) => c.kind === 'cli' },
  { id: 'tui', when: (c: Ctx) => c.kind === 'tui' },
  { id: 'lib', when: (c: Ctx) => c.kind === 'lib' },
  { id: 'gui', when: (c: Ctx) => c.hasGui, mount: appMount },
  { id: 'gui-glow', when: (c: Ctx) => c.flags.has('gui_winit_glow'), mount: appMount },
  { id: 'gui-features', when: (c: Ctx) => c.hasGui, mount: appMount },
  { id: 'guards', when: (c: Ctx) => ['headerCheck', 'unsafeCheck', 'toolchainPin', 'changelogGen'].some((k: string) => c.flags.has(k)), mount: appMount },
  { id: 'workspace', when: (c: Ctx) => c.workspace },
];
