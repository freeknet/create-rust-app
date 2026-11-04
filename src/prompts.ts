import * as p from '@clack/prompts';
import { PRESETS, resolveAnswers } from './presets.ts';
import { validateName } from './context.ts';
import { optionalUi } from './args.ts';
import type { Caps, PartialAnswers } from './types.ts';

/** Cancellation is handled by main without printing an error or writing files. */
export class Cancelled extends Error {
  exitCode: number;
  constructor() { super('Nothing written.'); this.exitCode = 130; }
}

/** @param {any} partial Explicit flag answers only; preset answers remain editable defaults.
 * @param {any} caps Terminal capabilities from the UI API.
 */
export async function ask(partial: PartialAnswers = {}, caps: Caps) {
  const theme = await optionalUi('theme');
  const rainbow = await optionalUi('rainbow');
  let answers = resolveAnswers(partial.preset, partial);
  let step = 0;
  const seen = new Set();
  const sections = ['Identity', 'Kind', 'GUI stack', 'Crates', 'Features', 'Tooling', 'License', 'Advanced settings', 'Post-steps'];
  /** @param {string} path */
  const lookup = (root: unknown, path: string): unknown => path.split('.').reduce<unknown>((o, key) =>
    o !== null && typeof o === 'object' && Object.hasOwn(o, key) ? (o as Record<string, unknown>)[key] : undefined, root);
  const explicit = (path: string) => lookup(partial, path) !== undefined;
  /** @param {string} path */
  const current = (path: string) => lookup(answers, path);
  /** @param {string} path @param {any} value */
  const save = (path: string, value: unknown) => {
    if (!p.isCancel(value)) {
      const keys = path.split('.');
      const parent = keys.slice(0, -1).join('.');
      const target = parent ? lookup(answers, parent) : answers;
      const key = keys.at(-1);
      if (key && target && typeof target === 'object') (target as Record<string, unknown>)[key] = value;
    }
    return value;
  };
  /** @param {number} section @param {string} text */
  const message = (section: number, text: string) => {
    if (!seen.has(section)) {
      seen.add(section);
      p.log.message(theme.section?.(caps, section, sections[section]) ?? sections[section]);
    }
    const bullet = theme.bullet?.(caps, step++) ?? (caps.unicode ? '◆' : '*');
    const arrow = rainbow.dim?.(caps, '›') ?? '>';
    return bullet + ' ' + text + ' ' + arrow;
  };
  /** @param {string} path @param {number} section @param {string} label @param {string[]} values */
  const select = async (path: string, section: number, label: string, values: string[]) => {
    if (explicit(path)) return;
    return save(path, await p.select({ message: message(section, label), initialValue: String(current(path) ?? ''), options: values.map((value: string) => ({ value, label: value })) }));
  };
  /** @param {string} path @param {number} section @param {string} label @param {(value: string) => string | undefined} [validate] */
  const text = async (path: string, section: number, label: string, validate?: (value: string) => string | undefined) => {
    if (explicit(path)) return;
    return save(path, await p.text({ message: message(section, label), initialValue: String(current(path) ?? ''), defaultValue: String(current(path) ?? ''), ...(validate ? { validate } : {}) }));
  };
  /** @param {string} path @param {string} label */
  const confirm = async (path: string, label: string) => {
    if (explicit(path)) return;
    return save(path, await p.confirm({ message: message(8, label), initialValue: Boolean(current(path)) }));
  };
  /** @param {string} group @param {number} section @param {string} label */
  const multi = async (group: string, section: number, label: string) => {
    const fields = lookup(answers, group);
    if (!fields || typeof fields !== 'object') return;
    const values = fields as Record<string, unknown>;
    const keys = Object.keys(values).filter((key: string) => typeof values[key] === 'boolean' && !explicit(group + '.' + key));
    if (!keys.length) return;
    const chosen = await p.multiselect({
      message: message(section, label), required: false,
      options: keys.map((value: string) => ({ value })), initialValues: keys.filter((key: string) => values[key]),
    });
    if (!p.isCancel(chosen)) for (const key of keys) save(group + '.' + key, chosen.includes(key));
    return chosen;
  };
  const hasGui = () => answers.kind === 'gui' || answers.kind === 'workspace';
  p.intro('create-rust-app');
  await p.group({
    preset: async () => {
      if (explicit('preset')) return;
      const chosen = await p.select({
        message: message(0, 'Start with a preset'), initialValue: answers.preset ?? 'custom',
        options: [...Object.entries(PRESETS).map(([value, preset]) => ({ value, label: preset.label, hint: preset.hint })),
          { value: 'custom', label: 'custom', hint: 'choose every option' }],
      });
      if (!p.isCancel(chosen)) answers = resolveAnswers(chosen === 'custom' ? null : chosen, partial);
      return chosen;
    },
    name: () => text('name', 0, 'Project name', (value: string) => validateName(value) ?? undefined),
    tagline: () => text('tagline', 0, 'Tagline'),
    kind: () => select('kind', 1, 'Project kind', ['cli', 'gui', 'tui', 'lib', 'workspace']),
    gui: () => hasGui() ? select('guiStack', 2, 'GUI stack', ['eframe', 'winit-glow']) : undefined,
    crates: () => multi('crates', 3, 'Crates'),
    errors: () => select('crates.errors', 3, 'Error handling', ['anyhow']),
    logging: () => select('crates.logging', 3, 'Logging', ['log', 'env_logger', 'tracing']),
    async: () => select('crates.async', 3, 'Async runtime', ['none', 'tokio']),
    http: () => select('crates.http', 3, 'HTTP client', ['none', 'ureq', 'reqwest']),
    features: () => hasGui() ? multi('features', 4, 'GUI features') : undefined,
    tooling: () => multi('tooling', 5, 'Project tooling'),
    license: () => select('license', 6, 'License', ['MIT', 'MIT+CommonsClause', 'Apache-2.0', 'MIT OR Apache-2.0']),
    advanced: async () => {
      if (['edition', 'msrv', 'toolchain'].every(explicit)) return false;
      return p.confirm({ message: message(7, 'Advanced settings?'), initialValue: false });
    },
    edition: ({ results }: { results: { advanced?: boolean | undefined } }) => results.advanced ? select('edition', 7, 'Rust edition', ['2024', '2021']) : undefined,
    msrv: ({ results }: { results: { advanced?: boolean | undefined } }) => results.advanced ? text('msrv', 7, 'Minimum Rust version', (value: string) => /^\d+\.\d+(?:\.\d+)?$/.test(value) ? undefined : 'Use a Rust version, such as 1.98.') : undefined,
    toolchain: ({ results }: { results: { advanced?: boolean | undefined } }) => results.advanced ? text('toolchain', 7, 'Pinned toolchain', (value: string) => /^\d+\.\d+\.\d+$/.test(value) ? undefined : 'Use an exact Rust version, such as 1.99.1.') : undefined,
    git: () => confirm('post.git', 'Initialize git and create an initial commit?'),
    cargo: () => confirm('post.cargoCheck', 'Run cargo check?'),
    open: () => select('post.open', 8, 'Open an editor', ['none', 'code', 'cursor']),
  }, { onCancel: () => { p.cancel('Nothing written.'); throw new Cancelled(); } });
  return answers;
}
