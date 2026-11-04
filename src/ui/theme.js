// @ts-check
import { hex, bold } from './rainbow.js';
import { ascii } from './tty.js';

/** @typedef {import('./tty.js').Caps} Caps */

/** Prompt-bullet rainbow stops: pink, cyan, lime, amber, violet, coral. */
export const STOPS = ['#ff6ec7', '#7cf7ff', '#b6ff6e', '#ffd36e', '#8a5cff', '#ff9f6e'];

/** Chrome colours from PLAN.md section 4. */
export const CHROME = {
  dim: '#9aa8bc',
  success: '#5fd08a',
  warning: '#ff9a47',
  danger: '#ff6b7c',
  bar: '#00e5ff',
};

/** Glyph in the right character set for this terminal. @param {Caps} caps @param {string} text */
export function glyph(caps, text) {
  return caps.unicode ? text : ascii(text);
}

/** @param {number} i */
export function stop(i) {
  return STOPS[((i % STOPS.length) + STOPS.length) % STOPS.length];
}

/** '◆' tinted with the i-th rainbow stop. @param {Caps} caps @param {number} i */
export function bullet(caps, i) {
  return hex(caps, stop(i), glyph(caps, '◆'));
}

/** Tinted, bold section title for prompt groups. @param {Caps} caps @param {number} i @param {string} title */
export function section(caps, i, title) {
  return hex(caps, stop(i), bold(caps, glyph(caps, title)));
}
