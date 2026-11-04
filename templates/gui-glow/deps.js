// @ts-check
/** @param {any} _ctx @returns {import('../../src/types.ts').Dep[]} */
export default (_ctx) => [
  { name: 'winit', version: '0.30', defaultFeatures: false, features: ['rwh_06', 'x11', 'wayland', 'wayland-dlopen'] },
  { name: 'egui_glow', version: '0.37', features: ['winit'] },
  { name: 'egui-winit', version: '0.37', defaultFeatures: false, features: ['links', 'clipboard', 'wayland', 'x11'] },
  { name: 'glow', version: '0.17' },
  { name: 'glutin', version: '0.32' },
  { name: 'glutin-winit', version: '0.5' },
  { name: 'raw-window-handle', version: '0.6' },
];
