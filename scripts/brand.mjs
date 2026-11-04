#!/usr/bin/env node
// Generates the brand assets in assets/brand/ from the same hue math the terminal banner uses
// (docs/PLAN.md §4 "Prism"): letter i gets hue = start + i*9, sat 0.95, light 0.68; the rule
// sweeps the whole wheel. Re-run after changing anything here:  node scripts/brand.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(import.meta.dirname, '..', 'assets', 'brand');
mkdirSync(OUT, { recursive: true });

/** HSL → #rrggbb. */
function hsl(h, s = 0.95, l = 0.68) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const WORD = 'CREATE-RUST-APP';
const TAGLINE = 'scaffold rust projects at the speed of light';
const START = 140; // green → cyan → blue → violet, as in the approved mockup
const MONO = `'JetBrains Mono','Cascadia Code','SF Mono',Consolas,'Liberation Mono',monospace`;
const THEMES = {
  dark: { bg: '#0c0b12', panel: '#14121d', dim: '#6f6a85', fg: '#e8e6f0', border: '#25222f', light: 0.68, sat: 0.95 },
  light: { bg: '#ffffff', panel: '#f6f5fa', dim: '#6b6680', fg: '#1b1924', border: '#e4e1ec', light: 0.44, sat: 0.78 },
};

/** The two-line Prism banner. */
function banner(theme, { width = 900, pad = 40 } = {}) {
  const t = THEMES[theme];
  const size = 52;
  const adv = size * 0.62; // monospace advance + letter spacing
  const letters = [...WORD].map((c, i) =>
    `<tspan fill="${hsl(START + i * 9, t.sat, t.light)}">${c}</tspan>`).join('');
  const ruleX = pad + TAGLINE.length * 9.6 + 34;
  const segs = 20;
  const segW = (width - pad - ruleX) / segs;
  const rule = Array.from({ length: segs }, (_, i) =>
    `<rect x="${(ruleX + i * segW).toFixed(1)}" y="117" width="${(segW + 0.6).toFixed(1)}" height="4" fill="${hsl(i * 18, t.sat, t.light)}"/>`).join('');
  const h = 160;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}" role="img" aria-label="create-rust-app — ${TAGLINE}">
  <rect width="${width}" height="${h}" rx="16" fill="${t.bg}"/>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${h - 1}" rx="15.5" fill="none" stroke="${t.border}"/>
  <text x="${pad}" y="${pad + 44}" font-family="${MONO}" font-size="${size}" font-weight="700" letter-spacing="${(adv - size * 0.6).toFixed(1)}">${letters}</text>
  <text x="${pad}" y="${123}" font-family="${MONO}" font-size="16" fill="${t.dim}">◇ ${TAGLINE}</text>
  ${rule}
</svg>
`;
}

/** The mark: a faceted diamond (the ◆ prompt bullet) split into the six prompt colours. */
function mark({ size = 256, tile = true } = {}) {
  const STOPS = ['#ff6ec7', '#ff9f6e', '#ffd36e', '#b6ff6e', '#7cf7ff', '#8a5cff'];
  const c = size / 2;
  const r = size * 0.34;
  const pts = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [c + r * Math.cos(a) * 0.82, c + r * Math.sin(a)];
  });
  const facets = pts.map((p, i) => {
    const q = pts[(i + 1) % 6];
    return `<path d="M${c} ${c}L${p[0].toFixed(1)} ${p[1].toFixed(1)}L${q[0].toFixed(1)} ${q[1].toFixed(1)}Z" fill="${STOPS[i]}"/>`;
  }).join('');
  const bg = tile ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="#0c0b12"/>` : '';
  // A small prompt chevron in the centre ties it to the terminal.
  const k = size * 0.07;
  const chevron = `<path d="M${c - k * 0.7} ${c - k}L${c + k * 0.5} ${c}L${c - k * 0.7} ${c + k}" fill="none" stroke="#0c0b12" stroke-width="${(size * 0.035).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="create-rust-app">${bg}${facets}${chevron}</svg>\n`;
}

/** 1280×640 social preview (GitHub repo card). */
function social() {
  const W = 1280, H = 640;
  const t = THEMES.dark;
  const size = 84;
  const letters = [...WORD].map((ch, i) => `<tspan fill="${hsl(START + i * 9)}">${ch}</tspan>`).join('');
  const segs = 30;
  const rule = Array.from({ length: segs }, (_, i) =>
    `<rect x="${(120 + i * 34.67).toFixed(1)}" y="452" width="35" height="6" fill="${hsl(i * 12)}"/>`).join('');
  const markSvg = mark({ size: 120, tile: false }).replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="create-rust-app">
  <rect width="${W}" height="${H}" fill="${t.bg}"/>
  <g transform="translate(104 120)">${markSvg}</g>
  <text x="250" y="200" font-family="${MONO}" font-size="30" fill="${t.dim}">npx create-rust-app</text>
  <text x="120" y="360" font-family="${MONO}" font-size="${size}" font-weight="700" letter-spacing="2">${letters}</text>
  <text x="120" y="420" font-family="${MONO}" font-size="28" fill="${t.dim}">◇ ${TAGLINE}</text>
  ${rule}
  <text x="120" y="540" font-family="${MONO}" font-size="24" fill="${t.fg}">cli · gui · tui · lib · workspace   —   strict lints · CI · signed releases</text>
</svg>
`;
}

const files = {
  'banner-dark.svg': banner('dark'),
  'banner-light.svg': banner('light'),
  'mark.svg': mark(),
  'mark-transparent.svg': mark({ tile: false }),
  'social-preview.svg': social(),
};
for (const [name, svg] of Object.entries(files)) writeFileSync(join(OUT, name), svg);
console.log(`wrote ${Object.keys(files).length} files to assets/brand/`);
