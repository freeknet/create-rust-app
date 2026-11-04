import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { DEFAULTS, PRESETS } from './presets.ts';
import { validateName } from './context.ts';
import type { PartialAnswers } from './types.ts';

/** @type {Record<string, import('node:util').ParseArgsOptionConfig>} */
const OPTIONS: NonNullable<import('node:util').ParseArgsConfig['options']> = {};
for (const name of ['name', 'preset', 'kind', 'gui', 'edition', 'msrv', 'toolchain', 'license', 'author', 'github', 'accent', 'open']) {
  OPTIONS[name] = { type: 'string' };
}
for (const name of ['with', 'without', 'set']) OPTIONS[name] = { type: 'string', multiple: true };
for (const name of ['yes', 'no-git', 'no-cargo-check', 'dry-run', 'json', 'no-color', 'quiet', 'force', 'help', 'version']) {
  OPTIONS[name] = { type: 'boolean' };
}
OPTIONS.yes = { type: 'boolean', short: 'y' };
OPTIONS.help = { type: 'boolean', short: 'h' };
OPTIONS.version = { type: 'boolean', short: 'v' };

/** Short names accepted by --with/--without, with enabled and disabled values. */
/** @type {Record<string, [string, string | boolean, string | boolean]>} */
export const SHORT_NAMES: Record<string, [string, string | boolean, string | boolean]> = {};
for (const group of ['features', 'tooling', 'crates'] as const) {
  for (const [key, value] of Object.entries(DEFAULTS[group])) {
    if (typeof value === 'boolean') SHORT_NAMES[key] = [group + '.' + key, true, false];
  }
}
for (const [alias, key] of Object.entries({
  palette: 'commandPalette', 'single-instance': 'singleInstance', screenshot: 'screenshotExample',
  'cargo-deny': 'cargoDeny', 'toolchain-pin': 'toolchainPin', 'agent-docs': 'agentDocs',
  'header-check': 'headerCheck', 'unsafe-check': 'unsafeCheck', changelog: 'changelogGen',
  'issue-templates': 'issueTemplates', security: 'securityMd',
})) { const entry = SHORT_NAMES[key]; if (entry) SHORT_NAMES[alias] = entry; }
Object.assign(SHORT_NAMES, {
  tokio: ['crates.async', 'tokio', 'none'],
  ureq: ['crates.http', 'ureq', 'none'],
  reqwest: ['crates.http', 'reqwest', 'none'],
  tracing: ['crates.logging', 'tracing', 'log'],
  env_logger: ['crates.logging', 'env_logger', 'log'],
  log: ['crates.logging', 'log', 'log'],
});

/** @type {Record<string, string[]>} */
const CHOICES: Record<string, string[]> = {
  preset: [...Object.keys(PRESETS), 'custom'],
  kind: ['cli', 'gui', 'tui', 'lib', 'workspace'], guiStack: ['eframe', 'winit-glow'],
  license: ['MIT', 'MIT+CommonsClause', 'Apache-2.0', 'MIT OR Apache-2.0'],
  edition: ['2024', '2021'], 'crates.errors': ['anyhow'],
  'crates.logging': ['log', 'env_logger', 'tracing'], 'crates.async': ['none', 'tokio'],
  'crates.http': ['none', 'ureq', 'reqwest'], 'post.open': ['none', 'code', 'cursor'],
};

/** @param {string} a @param {string} b */
function distance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_: unknown, i: number) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min((next[j] ?? 0) + 1, (row[j + 1] ?? 0) + 1, (row[j] ?? 0) + Number(a[i] !== b[j])));
    row = next;
  }
  return row[b.length] ?? 0;
}

/** @param {string} value @param {string[]} choices */
function suggestion(value: string, choices: string[]) {
  const match = choices.map((key: string) => ({ key, n: distance(value, key) })).sort((a: { key: string; n: number; }, b: { key: string; n: number; }) => a.n - b.n)[0];
  return match && match.n <= 2 ? ' Did you mean ' + match.key + '?' : '';
}

/** Validate a leaf before setting it; never allow arbitrary keys or prototype traversal.
 * @param {any} target @param {string} path @param {string | boolean | null} value
 */
function setAnswer(target: Record<string, unknown>, path: string, value: string | boolean | null) {
  const keys = path.split('.');
  let sample: unknown = DEFAULTS;
  for (const key of keys) {
    if (!sample || typeof sample !== 'object' || !Object.hasOwn(sample, key)) throw new Error('Unknown answer key: ' + path);
    sample = (sample as Record<string, unknown>)[key];
  }
  if (sample !== null && typeof sample === 'object') throw new Error('Set a leaf answer, such as features.tray=true: ' + path);
  if (path === 'preset' && value === 'custom') value = null;
  if (path !== 'preset' && typeof value !== typeof sample) throw new Error(path + ' must be ' + typeof sample + '.');
  const choices = CHOICES[path];
  if (choices && !(path === 'preset' && value === null) && !choices.includes(String(value))) {
    throw new Error('Invalid ' + path + ' "' + value + '". Choose: ' + choices.join(', '));
  }
  if (path === 'name') {
    const error = validateName(String(value));
    if (error) throw new Error('Invalid project name: ' + error);
  }
  if (path === 'accent' && !/^#[\da-f]{6}$/i.test(String(value))) throw new Error('accent must be a six-digit hex color, such as #00e5ff.');
  if (['msrv', 'toolchain'].includes(path) && !/^\d+\.\d+(?:\.\d+)?$/.test(String(value))) throw new Error(path + ' must be a Rust version number.');
  if (path === 'toolchain' && !/^\d+\.\d+\.\d+$/.test(String(value))) throw new Error('toolchain must be an exact Rust version, such as 1.99.1.');
  let out = target;
  for (const key of keys.slice(0, -1)) {
    out[key] ??= {};
    out = out[key] as Record<string, unknown>;
  }
  const last = keys.at(-1);
  if (last !== undefined) out[last] = value;
}

/** Parse flags without side effects. Later answer options win in command-line order.
 * @param {string[]} argv
 * @returns {{ dir: string | undefined, flags: Record<string, any>, overrides: any }}
 */
export function parseArgv(argv: string[]) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true, tokens: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') {
      const unknown = /Unknown option '([^']+)'/.exec(error.message)?.[1];
      if (unknown) throw new Error('Unknown flag ' + unknown + '.' + suggestion(unknown, Object.keys(OPTIONS).map((key: string) => '--' + key)));
    }
    throw error;
  }
  if (parsed.positionals.length > 1) throw new Error('Expected at most one target directory.');
  const flags = { ...parsed.values };
  /** @type {any} */
  const overrides: Record<string, unknown> = {};
  for (const token of parsed.tokens) {
    if (token.kind !== 'option') continue;
    const { name, value } = token;
    if (name === 'with' || name === 'without') {
      for (const key of String(value).split(',').map((part: string) => part.trim())) {
        if (!Object.hasOwn(SHORT_NAMES, key)) throw new Error('Unknown feature "' + key + '".' + suggestion(key, Object.keys(SHORT_NAMES)));
        const entry = SHORT_NAMES[key];
        if (!entry) throw new Error('Unknown feature "' + key + '".');
        const [path, on, off] = entry;
        setAnswer(overrides, path, name === 'with' ? on : off);
      }
    } else if (name === 'set') {
      const text = String(value);
      const eq = text.indexOf('=');
      if (eq <= 0) throw new Error('--set expects key.path=value.');
      const raw = text.slice(eq + 1);
      setAnswer(overrides, text.slice(0, eq), raw === 'true' ? true : raw === 'false' ? false : raw);
    } else if (name === 'no-git') setAnswer(overrides, 'post.git', false);
    else if (name === 'no-cargo-check') setAnswer(overrides, 'post.cargoCheck', false);
    else if (name === 'open') setAnswer(overrides, 'post.open', String(value));
    else if (name === 'gui') setAnswer(overrides, 'guiStack', String(value));
    else if (Object.hasOwn(DEFAULTS, name)) setAnswer(overrides, name, String(value));
  }
  return { dir: parsed.positionals[0], flags, overrides: overrides as PartialAnswers };
}

/** UI modules can arrive separately; only an absent module falls back.
 * @param {string} name @returns {Promise<any>}
 */
export async function optionalUi(name: string) {
  const extension = import.meta.url.endsWith('.ts') ? '.ts' : '.js';
  const url = new URL('./ui/' + name + extension, import.meta.url);
  return existsSync(url) ? import(url.href) : {};
}

/** @param {any} caps @returns {Promise<string>} */
export async function renderHelp(caps: unknown) {
  const [rainbow, theme, banner] = await Promise.all([optionalUi('rainbow'), optionalUi('theme'), optionalUi('banner')]);
  const heading = (title: unknown) => theme.section?.(caps, 1, title) ?? title;
  const bold = (text: unknown) => rainbow.bold?.(caps, text) ?? text;
  const rows = [
    ...(banner.bannerFrame?.(caps, 0) ?? ['CREATE-RUST-APP', 'scaffold rust projects at the speed of light']), '',
    bold('Usage') + '  create-rust-app [dir] [options]',
    'Default directory: ./<name>. Non-TTY input accepts defaults.', '',
    heading('Project'),
    '  --name <name>          Lowercase Rust project name (default: my-app)',
    '  --preset <preset>      ' + Object.keys(PRESETS).join(' | ') + ' | custom',
    '  --kind <kind>          cli | gui | tui | lib | workspace',
    '  --gui <stack>          eframe | winit-glow',
    '  --author <name>        Author name     --github <user>  GitHub owner',
    '  --license <license>    MIT | MIT+CommonsClause | Apache-2.0 | "MIT OR Apache-2.0"',
    '  --edition <edition>    2024 | 2021      --msrv <version>  Minimum Rust version',
    '  --toolchain <version>  Exact Rust pin  --accent <hex>    Theme accent', '',
    heading('Choices'),
    '  --with <a,b>           Enable short names (repeatable)',
    '  --without <a,b>        Disable short names (repeatable)',
    '  --set <key.path=value> Override any answer leaf (repeatable; true/false or text)',
    '                        e.g. --set tagline="A useful app" --set post.git=false',
    ...Object.entries(SHORT_NAMES).map(([key, [path, on, off]]: [string, [string, string | boolean, string | boolean]]) => '    ' + key.padEnd(18) + path + ' (' + on + ' / ' + off + ')'), '',
    heading('Run'),
    '  --yes, -y             Accept defaults without prompts',
    '  --no-git              Skip git initialization and initial commit',
    '  --no-cargo-check      Skip cargo check',
    '  --open <editor>       code | cursor (default: none)',
    '  --dry-run             Show planned files; write nothing and skip post-steps',
    '  --json                Emit only { answers, files } JSON; no prompts',
    '  --no-color            Plain terminal output',
    '  --quiet               Suppress banner, progress and summary',
    '  --force               Allow writing into a nonempty directory',
    '  --help, -h            Show help       --version, -v     Show version', '',
    'Example: create-rust-app my-tool --preset cli --with tokio,reqwest --yes',
    'Answer options apply left to right; the last value wins.',
  ];
  return rows.join('\n');
}
