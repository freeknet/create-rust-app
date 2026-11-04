/**
 * Visual harness: run the real CLI in a pseudo-terminal, drive it with keystrokes, and render each
 * screen to HTML (xterm headless + serialize) and PNG (headless Edge/Chrome). This is how UI changes
 * get judged — by what a person would actually see, not by unit tests.
 *
 *   node tools/screens/capture.ts <scenario> [--out .scratch/screens]
 *
 * Scenarios are below. Each step waits for text (or a pause), optionally sends keys, then captures.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import * as pty from '@lydell/node-pty';
import xtermHeadless from '@xterm/headless';
import serializeAddon from '@xterm/addon-serialize';

const { Terminal } = xtermHeadless;
const { SerializeAddon } = serializeAddon;

const ROOT = resolve(import.meta.dirname, '..', '..');
let COLS = 96;
const ROWS = 44;
const EXTRA_ENV: Record<string, string> = {};

type Step = { wait?: string | number; keys?: string; shot?: string };

const KEY = { enter: '\r', down: '\x1b[B', up: '\x1b[A', space: ' ', tab: '\t', ctrlC: '\x03', right: '\x1b[C' };

/** Scenarios: the default interactive path, a customise path, and a cancel. */
const SCENARIOS: Record<string, { args: (dir: string) => string[]; steps: Step[] }> = {
  // Accept every default by pressing Enter until the summary appears.
  defaults: {
    args: (dir) => [join(dir, 'demo-app')],
    steps: [
      { wait: 1600, shot: '01-start' },
      ...Array.from({ length: 30 }, (_, i): Step => ({ keys: KEY.enter, wait: 700, shot: `${String(i + 2).padStart(2, '0')}-enter` })),
    ],
  },
  cancel: {
    args: (dir) => [join(dir, 'demo-cancel')],
    steps: [{ wait: 1600 }, { keys: KEY.down, wait: 300 }, { keys: KEY.ctrlC, wait: 800, shot: '01-cancel' }],
  },
  // No dir argument: the name prompt, then pick "Command-line tool".
  name: {
    args: () => [],
    steps: [
      { wait: 1600, shot: '01-name' },
      { keys: 'neon-dash', wait: 300, shot: '02-typed' },
      { keys: KEY.enter, wait: 600, shot: '03-preset' },
      { keys: KEY.down + KEY.down, wait: 300, shot: '04-cli-highlighted' },
      { keys: KEY.enter, wait: 700, shot: '05-review' },
      { keys: KEY.down + KEY.down, wait: 300 },
      { keys: KEY.enter, wait: 600, shot: '06-cancelled' },
    ],
  },
  // Review → Customize → App → runtime → features (toggle tray) → back to review → create.
  customize: {
    args: (dir) => [join(dir, 'demo-custom')],
    steps: [
      { wait: 1600 },
      { keys: KEY.enter, wait: 700 },
      { keys: KEY.down, wait: 300 },
      { keys: KEY.enter, wait: 600, shot: '01-menu' },
      { keys: KEY.down, wait: 300 },
      { keys: KEY.enter, wait: 600, shot: '02-runtime' },
      { keys: KEY.enter, wait: 600, shot: '03-features' },
      { keys: KEY.down.repeat(6), wait: 300 },
      { keys: KEY.space, wait: 300, shot: '04-tray-on' },
      { keys: KEY.enter, wait: 700, shot: '05-review-again' },
      { keys: KEY.down, wait: 300 },
      { keys: KEY.enter, wait: 600 },
      { keys: KEY.down.repeat(2), wait: 300 },
      { keys: KEY.enter, wait: 600, shot: '06-tooling' },
    ],
  },
};

function edge(): string | null {
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  return candidates.find((c) => existsSync(c)) ?? null;
}

function page(body: string): string {
  return `<!doctype html><meta charset="utf-8"><style>
  html,body{margin:0;background:#0c0b12}
  .term{padding:18px 22px;font:15px/1.2 'Cascadia Mono','Cascadia Code',Consolas,monospace;color:#d6d3e2;white-space:pre}
  .term pre{margin:0;font:inherit}
  /* serializeAsHTML wraps everything in a div with a white background and black default fg */
  .term pre>div{background-color:transparent!important;color:#d6d3e2!important}
  </style><div class="term">${body}</div>`;
}

async function run(name: string, outDir: string, tag = ''): Promise<string[]> {
  const sc = SCENARIOS[name];
  if (!sc) throw new Error(`unknown scenario ${name}; try: ${Object.keys(SCENARIOS).join(', ')}`);
  const work = mkdtempSync(join(tmpdir(), 'cra-screens-'));
  const term = new Terminal({ cols: COLS, rows: ROWS, allowProposedApi: true });
  const ser = new SerializeAddon();
  term.loadAddon(ser);
  const entry = join(ROOT, 'dist', 'bin', 'create-rust-app.js');
  if (!existsSync(entry)) throw new Error('build first: npm run build');
  const proc = pty.spawn(process.execPath, [entry, ...sc.args(work)], {
    name: 'xterm-256color', cols: COLS, rows: ROWS, cwd: work,
    env: { ...process.env, COLORTERM: 'truecolor', WT_SESSION: 'screens', FORCE_COLOR: '3', CI: '', ...EXTRA_ENV } as Record<string, string>,
  });
  let text = '';
  proc.onData((d) => { term.write(d); text += d; });
  let exited = false;
  proc.onExit(() => { exited = true; });

  const shots: string[] = [];
  const settle = () => new Promise<void>((r) => term.write('', () => r()));
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let last = '';
  for (const step of sc.steps) {
    if (exited) break;
    if (step.keys) proc.write(step.keys);
    if (typeof step.wait === 'number') await sleep(step.wait);
    else if (typeof step.wait === 'string') {
      const deadline = Date.now() + 15000;
      while (!text.includes(step.wait) && Date.now() < deadline && !exited) await sleep(100);
    }
    await settle();
    if (!step.shot) continue;
    const html = ser.serializeAsHTML({ includeGlobalBackground: false });
    const plain = Array.from({ length: term.buffer.active.length }, (_, i) => term.buffer.active.getLine(i)?.translateToString(true) ?? '').join('\n');
    if (plain === last) continue; // nothing changed: skip duplicate frames
    last = plain;
    const file = join(outDir, `${name}${tag}-${step.shot}`);
    writeFileSync(`${file}.html`, page(html));
    writeFileSync(`${file}.txt`, plain);
    shots.push(file);
  }
  await sleep(300);
  if (!exited) proc.kill();
  rmSync(work, { recursive: true, force: true });
  return shots;
}

const args = process.argv.slice(2);
const colsIdx = args.indexOf('--cols');
if (colsIdx >= 0) COLS = Number(args[colsIdx + 1]);
for (let i = 0; i < args.length; i++) if (args[i] === '--env') { const [k, v] = (args[i + 1] ?? '').split('='); if (k) EXTRA_ENV[k] = v ?? ''; }
const name = args[0] ?? 'defaults';
const outIdx = args.indexOf('--out');
const outDir = resolve(ROOT, outIdx >= 0 ? (args[outIdx + 1] ?? '') : '.scratch/screens');
mkdirSync(outDir, { recursive: true });
const tagIdx = args.indexOf('--tag');
const shots = await run(name, outDir, tagIdx >= 0 ? `-${args[tagIdx + 1]}` : '');
const browser = edge();
for (const f of shots) {
  if (!browser) break;
  spawnSync(browser, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${COLS * 9 + 44},${ROWS * 20 + 36}`,
    `--screenshot=${f}.png`, `file:///${f.replace(/\\/g, '/')}.html`], { stdio: 'ignore' });
}
console.log(`${shots.length} screens → ${outDir}${browser ? '' : ' (no Edge/Chrome found: HTML only)'}`);
