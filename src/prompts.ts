/**
 * The interactive flow. Three screens on the default path, everything else one level down:
 *
 *   name  →  what are you building (preset)  →  review ⟲ { create · customize… · cancel }
 *
 * The review screen is the hub: Customize opens one section at a time and comes back to it, which
 * also stands in for the back navigation clack doesn't have. Flags given on the command line are
 * never asked again.
 */
import { isCancel } from '@clack/core';
import { NOTE_FRAME, NOTE_TITLE_FRAME, cancel, note, text } from './ui/rail.ts';
import { glyphs } from './ui/glyphs.ts';
import { PRESETS, resolveAnswers } from './presets.ts';
import { shippedThemes } from './gen/themes.ts';
import { effectiveAnswers, validateBin, validateName } from './context.ts';
import { dim, hex, bold } from './ui/rainbow.ts';
import { BACK, pick, pickMany } from './ui/choose.ts';
import type { Item } from './ui/choose.ts';
import { STOPS } from './ui/theme.ts';
import { clip, width, wrap } from './ui/tty.ts';
import { ASYNC, CRATE_TOGGLES, DESKTOP, FEATURES, HTTP, KINDS, LICENSES, LOGGING, STACKS, TOOLING, grouped } from './ui/labels.ts';
import type { Choice } from './ui/labels.ts';
import type { Answers, Caps, PartialAnswers } from './types.ts';

/** Cancellation is handled by main without printing an error or writing files. */
export class Cancelled extends Error {
  exitCode: number;
  constructor() { super('Nothing written.'); this.exitCode = 130; }
}

const RECOMMENDED = 'rustaman';
const PRESET_ORDER = ['rustaman', 'strobe', 'cli', 'tui', 'lib', 'minimal'];

/** Terminal caps for the running flow (set by ask), so a cancel anywhere renders consistently. */
let flowCaps: Caps | null = null;

/** Unwrap a prompt result, turning Ctrl-C / Esc into a clean cancel. */
function got<T>(value: T): Exclude<T, symbol> {
  if (isCancel(value) || typeof value === 'symbol') {
    if (flowCaps) cancel(flowCaps, 'Nothing written.');
    throw new Cancelled();
  }
  return value as Exclude<T, symbol>;
}

/** Esc inside Customize: leave the current section (or the preset re-pick) without keeping its edits. */
class Back extends Error {}

/** Unwrap a Customize prompt: Esc (BACK) steps back a level, Ctrl-C still cancels the run. */
function sect<T>(value: T): Exclude<T, symbol> {
  if (value === BACK) throw new Back();
  return got(value);
}

/** Catalogue entries → choose.ts items (description as hint, catalogue group as header). */
function items<K extends string>(cat: Record<K, Choice>, keys: K[], withGroups = false): Item<K>[] {
  return keys.map((k) => ({ value: k, label: cat[k].label, hint: cat[k].hint, ...(withGroups ? { group: cat[k].group } : {}) }));
}

const isGui = (a: Answers) => a.kind === 'gui' || a.kind === 'workspace';

/** The review block: what will be generated, in human words, grouped and colour-keyed. */
export function reviewLines(caps: Caps, a: Answers): { title: string; body: string } {
  const sep = glyphs(caps).sep;
  // Sentence-case words read as a list; keep acronyms and file names as written (CI, SECURITY.md).
  const soft = (l: string) => (/^[A-Z][a-z]/.test(l) ? l[0]?.toLowerCase() + l.slice(1) : l);
  const on = <K extends string>(cat: Record<K, Choice>, values: Record<K, boolean>, group?: string) =>
    (Object.keys(cat) as K[]).filter((k) => values[k] && (!group || cat[k].group === group)).map((k) => soft(cat[k].label));

  const crates = ['anyhow'];
  if (a.crates.clap && a.kind !== 'lib') crates.push(effectiveAnswers(a).features.subcommands ? 'clap subcommands' : 'clap');
  crates.push(LOGGING[a.crates.logging].label);
  if (a.crates.serde) crates.push('serde + toml');
  if (a.crates.thiserror) crates.push('thiserror');
  if (a.crates.async !== 'none') crates.push(a.crates.async);
  if (a.crates.http !== 'none') crates.push(a.crates.http);
  if (a.crates.sqlite) crates.push('SQLite');
  if (a.kind === 'tui') crates.push('ratatui', 'crossterm');
  if (isGui(a)) crates.push(STACKS[a.guiStack].label);

  const guardrails = ['strict lints', ...on(TOOLING, a.tooling, 'guardrails')
    .filter((l) => isGui(a) || l !== soft(TOOLING.unsafeCheck.label))
    .map((l) => (l === soft(TOOLING.toolchainPin.label) ? `pinned ${a.toolchain}` : l))];
  const then = [
    a.post.git && 'git init + first commit',
    a.post.fetch && 'cargo fetch',
    a.post.cargoCheck && 'cargo check',
    a.post.open !== 'none' && `open in ${a.post.open}`,
  ].filter(Boolean) as string[];

  const sections: [string, string, string[]][] = [
    ['crates', STOPS[0] ?? '', crates],
    ...(isGui(a) ? [['app', STOPS[5] ?? '', on(DESKTOP, a.features)] as [string, string, string[]]] : []),
    ['guardrails', STOPS[3] ?? '', guardrails],
    ['github', STOPS[2] ?? '', on(TOOLING, a.tooling, 'github')],
    ['docs', STOPS[1] ?? '', on(TOOLING, a.tooling, 'docs')],
    ['then', STOPS[4] ?? '', then.length ? then : ['nothing']],
  ];
  // The body is drawn inside note(): label column + wrapped items + NOTE_FRAME must fit the terminal.
  const label = Math.max(...sections.map(([n]) => n.length)) + 2;
  const max = Math.max(8, Math.min(caps.columns, 100) - NOTE_FRAME - label);
  const rows = sections
    .filter(([, , items]) => items.length)
    .flatMap(([name, color, items]) => wrap(items.join(sep), max).map((line, i) =>
      `${i === 0 ? hex(caps, color, name.padEnd(label)) : ' '.repeat(label)}${line}`));

  // Title: name, then kind / edition / licence while they fit; whatever doesn't moves to the
  // top of the body, so a narrow terminal loses no information and no line wraps.
  const room = Math.max(8, caps.columns - NOTE_TITLE_FRAME);
  const bin = effectiveAnswers(a).bin;
  let name = `${a.name}${bin ? ` (runs as ${bin})` : ''}`;
  const ellipsis = glyphs(caps).ellipsis;
  if (width(name) > room) name = `${clip(name, room - width(ellipsis))}${ellipsis}`;
  const facts = [KINDS[a.kind], `Rust ${a.edition}`, LICENSES[a.license].label];
  let shown = facts.length;
  while (shown > 0 && width(name + facts.slice(0, shown).map((f) => sep + f).join('')) > room) shown--;
  const rest = facts.slice(shown);
  const top = rest.length ? wrap(rest.join(sep), max).map((line) => `${' '.repeat(label)}${dim(caps, line)}`) : [];
  const title = `${bold(caps, name)}${dim(caps, facts.slice(0, shown).map((f) => sep + f).join(''))}`;
  return { title, body: [...top, ...rows].join('\n') };
}

/** Explicit command-line answers only; the preset's answers stay editable defaults. */
export async function ask(partial: PartialAnswers, caps: Caps, targetCheck: (name: string) => string | null = () => null): Promise<Answers> {
  flowCaps = caps;
  const given = (path: string) => path.split('.').reduce<unknown>((o, k) =>
    o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined, partial) !== undefined;

  // ── 1. name ──────────────────────────────────────────────────────────────
  const name = given('name') ? String(partial.name) : got(await text(caps, {
    message: 'Project name',
    placeholder: 'my-app',
    defaultValue: 'my-app',
    validate: (v) => validateName(v || 'my-app') ?? targetCheck(v || 'my-app') ?? undefined,
  }));

  // ── 2. what are you building ─────────────────────────────────────────────
  const pickPreset = async (initial: string, back = false) => (back ? sect : got)(await pick(caps, {
    message: 'What are you building?',
    initialValue: initial,
    back,
    options: (PRESET_ORDER.map((id) => ({
      value: id, label: PRESETS[id]?.label ?? id, hint: PRESETS[id]?.hint ?? '',
      ...(id === RECOMMENDED ? { tag: 'recommended' } : {}),
    }))),
  }));
  const choosePreset = !given('preset') && !given('kind');
  let preset = given('preset') ? String(partial.preset) : choosePreset ? await pickPreset(RECOMMENDED) : null;
  let a = resolveAnswers(preset, { ...partial, name });

  // ── 3. review ⟲ customise ────────────────────────────────────────────────
  for (;;) {
    const { title, body } = reviewLines(caps, a);
    await note(caps, title, body);
    const next = got(await pick(caps, {
      message: 'Ready?',
      initialValue: 'create',
      options: ([
        { value: 'create', label: 'Create it', hint: `writes ./${a.name}` },
        { value: 'customize', label: 'Customize…', hint: 'crates, features, tooling, licence, Rust version' },
        { value: 'cancel', label: 'Cancel', hint: 'nothing is written' },
      ]),
    }));
    if (next === 'create') return a;
    if (next === 'cancel') got(Symbol.for('clack:cancel'));
    a = await customize(caps, a, targetCheck, async () => {
      preset = await pickPreset(preset ?? RECOMMENDED, true);
      return resolveAnswers(preset, { ...partial, name: a.name });
    });
  }
}

/**
 * One section at a time, then back to the review. Esc on the menu returns to the review unchanged;
 * Esc inside a section (or the preset re-pick) drops that section's edits and reopens the menu.
 */
async function customize(caps: Caps, a: Answers, targetCheck: (name: string) => string | null, repick: () => Promise<Answers>): Promise<Answers> {
  for (;;) {
    const which = await pick(caps, { message: 'Customize what?', options: menu(a), back: true });
    if (which === BACK) return a;
    const choice = got(which);
    if (choice === 'back') return a;
    try {
      return choice === 'preset' ? await repick() : await section(caps, a, choice, targetCheck);
    } catch (e) {
      if (!(e instanceof Back)) throw e;
    }
  }
}

/** The Customize menu's rows for these answers. */
function menu(a: Answers): Item<string>[] {
  return [
    { value: 'crates', label: 'Crates', hint: 'logging, async, HTTP, serde, SQLite…' },
    ...(isGui(a) ? [{ value: 'app', label: 'App', hint: 'GUI runtime, theme base, tray, palette…' }] : []),
    { value: 'tooling', label: 'Tooling', hint: 'CI, releases, guardrails, docs' },
    { value: 'rust', label: 'Licence + Rust', hint: `${LICENSES[a.license].label} · edition ${a.edition} · MSRV ${a.msrv} · pin ${a.toolchain}` },
    { value: 'after', label: 'After creating', hint: 'git, cargo fetch / check, open editor' },
    { value: 'details', label: a.kind === 'lib' ? 'Name + tagline' : 'Name, command + tagline', hint: `${a.name}${effectiveAnswers(a).bin ? ` (runs as ${a.bin})` : ''} — ${a.tagline}` },
    { value: 'preset', label: 'Start over from a preset', hint: 'resets everything else' },
    { value: 'back', label: 'Back to review', hint: '' },
  ];
}

/** One Customize section on a copy of the answers; every prompt here offers Esc to go back. */
async function section(caps: Caps, a: Answers, which: string, targetCheck: (name: string) => string | null): Promise<Answers> {
  const out: Answers = structuredClone(a);

  if (which === 'crates') {
    const toggles = (Object.keys(CRATE_TOGGLES) as (keyof typeof CRATE_TOGGLES)[]).filter((k) => !(k === 'clap' && a.kind === 'lib'));
    const picked = sect(await pickMany(caps, { back: true,
      message: 'Crates',
      options: items(CRATE_TOGGLES, toggles),
      initialValues: toggles.filter((k) => out.crates[k]),
    }));
    for (const k of toggles) out.crates[k] = picked.includes(k);
    if ((a.kind === 'cli' || isGui(a)) && out.crates.clap) {
      const gui = isGui(a);
      out.features.subcommands = sect(await pick(caps, { back: true,
        message: 'Command line', initialValue: out.features.subcommands,
        options: ([
          gui
            ? { value: false, label: 'Window only', hint: 'a few flags, then the window' }
            : { value: false, label: 'One command', hint: 'flags only, with a greeting to replace' },
          gui
            ? { value: true, label: FEATURES.subcommands.label, hint: 'app <job> runs headless; a bare run opens the window' }
            : { value: true, label: FEATURES.subcommands.label, hint: 'tool <command> …, one enum variant per job' },
        ]),
      }));
    }
    out.crates.logging = sect(await pick(caps, { back: true, message: 'Logging', initialValue: out.crates.logging, options: items(LOGGING, ['log', 'env_logger', 'tracing']) }));
    out.crates.async = sect(await pick(caps, { back: true, message: 'Async runtime', initialValue: out.crates.async, options: items(ASYNC, ['none', 'tokio']) }));
    out.crates.http = sect(await pick(caps, { back: true, message: 'HTTP client', initialValue: out.crates.http, options: items(HTTP, ['none', 'ureq', 'reqwest']) }));
  }

  if (which === 'app') {
    out.guiStack = sect(await pick(caps, { back: true, message: 'GUI runtime', initialValue: out.guiStack, options: items(STACKS, ['eframe', 'winit-glow']) }));
    out.themeBase = sect(await pick(caps, { back: true,
      message: 'Signature theme surfaces (your accent on these)', initialValue: out.themeBase,
      options: shippedThemes().map((t) => ({ value: t.id, label: t.name, hint: `${t.mode} · ${t.app} / ${t.panel}` })),
    }));
    const keys = Object.values(grouped(DESKTOP)).flat();
    const picked = sect(await pickMany(caps, { back: true,
      message: 'App features',
      options: items(FEATURES, keys, true),
      initialValues: keys.filter((k) => out.features[k]),
    }));
    for (const k of keys) out.features[k] = picked.includes(k);
  }

  if (which === 'tooling') {
    const groups = grouped(TOOLING);
    if (!isGui(a)) groups['guardrails'] = (groups['guardrails'] ?? []).filter((k) => k !== 'unsafeCheck');
    const keys = Object.values(groups).flat();
    const picked = sect(await pickMany(caps, { back: true,
      message: 'Tooling',
      options: items(TOOLING, keys, true),
      initialValues: keys.filter((k) => out.tooling[k]),
    }));
    for (const k of keys) out.tooling[k] = picked.includes(k);
  }

  if (which === 'rust') {
    out.license = sect(await pick(caps, { back: true, message: 'Licence', initialValue: out.license, options: items(LICENSES, ['MIT', 'MIT OR Apache-2.0', 'Apache-2.0', 'MIT+CommonsClause']) }));
    out.edition = sect(await pick(caps, { back: true,
      message: 'Rust edition', initialValue: out.edition,
      options: ([{ value: '2024' as const, label: '2024', hint: 'current' }, { value: '2021' as const, label: '2021', hint: 'for older toolchains' }]),
    }));
    out.msrv = sect(await text(caps, { back: true, message: 'Minimum supported Rust (rust-version)', initialValue: out.msrv, validate: (v) => (/^\d+\.\d+(?:\.\d+)?$/.test(v ?? '') ? undefined : 'Use a version like 1.98') }));
    out.toolchain = sect(await text(caps, { back: true, message: 'Pinned toolchain (rust-toolchain.toml + CI)', initialValue: out.toolchain, validate: (v) => (/^\d+\.\d+\.\d+$/.test(v ?? '') ? undefined : 'Use an exact version like 1.99.1') }));
  }

  if (which === 'after') {
    const steps: Item<'git' | 'fetch' | 'cargoCheck'>[] = ([
      { value: 'git', label: 'git init', hint: 'branch main + a first commit' },
      { value: 'fetch', label: 'cargo fetch', hint: 'download crates now (seconds)' },
      { value: 'cargoCheck', label: 'cargo check', hint: 'compile once to prove it builds (minutes for GUI)' },
    ]);
    const picked = sect(await pickMany(caps, { back: true,
      message: 'After creating',
      options: steps,
      initialValues: (['git', 'fetch', 'cargoCheck'] as const).filter((k) => out.post[k]),
    }));
    out.post.git = picked.includes('git');
    out.post.fetch = picked.includes('fetch');
    out.post.cargoCheck = picked.includes('cargoCheck');
    out.post.open = sect(await pick(caps, { back: true,
      message: 'Open it in an editor?', initialValue: out.post.open,
      options: ([{ value: 'none' as const, label: 'No', hint: '' }, { value: 'code' as const, label: 'VS Code', hint: 'code' }, { value: 'cursor' as const, label: 'Cursor', hint: 'cursor' }]),
    }));
  }

  if (which === 'details') {
    out.name = sect(await text(caps, { back: true, message: 'Project name', initialValue: out.name, validate: (v) => validateName(v ?? '') ?? targetCheck(v ?? '') ?? undefined }));
    if (out.kind !== 'lib') {
      // The executable is named after its crate unless this differs; then a [[bin]] table names it.
      const crateBin = out.kind === 'workspace' ? `${out.name}-app` : out.name;
      const bin = sect(await text(caps, { back: true,
        message: 'Command name (what users type)', initialValue: out.bin || crateBin, placeholder: crateBin,
        validate: (v) => (v ? validateBin(v) ?? undefined : undefined),
      }));
      out.bin = bin === crateBin ? '' : bin;
    }
    out.tagline = sect(await text(caps, { back: true, message: 'One-line description', initialValue: out.tagline, placeholder: 'A Rust app.' }));
  }
  return out;
}
