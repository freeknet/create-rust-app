// @ts-check
/**
 * The terminal UI stack. crossterm is pinned to the version ratatui 0.29 builds on, so
 * both name the same `KeyEvent` type.
 * @param {import('../../src/types.ts').Ctx} _ctx @returns {import('../../src/types.ts').Dep[]}
 */
export default (_ctx) => [
  { name: 'ratatui', version: '0.29' },
  { name: 'crossterm', version: '0.28' },
];
