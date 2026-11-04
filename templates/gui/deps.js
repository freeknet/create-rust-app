// @ts-check
/**
 * Crates the GUI app shell needs. egui is a direct dependency in both runtimes so app code
 * names `egui::` rather than `eframe::egui::` (see CONTRACTS.md, "GUI runtime seam").
 *
 * @param {import('../../src/types.ts').Ctx} ctx
 * @returns {import('../../src/types.ts').Dep[]}
 */
export default (ctx) => {
  const f = ctx.flags;
  /** @type {import('../../src/types.ts').Dep[]} */
  const deps = [{ name: 'egui', version: '0.37' }];
  if (f.has('gui_eframe')) {
    // x11 + wayland give winit a windowing backend on Linux (CI lints and tests there too);
    // they compile to nothing on Windows.
    deps.push({
      name: 'eframe',
      version: '0.37',
      defaultFeatures: false,
      features: ['wgpu', 'default_fonts', 'x11', 'wayland'],
    });
  }
  // src/win/: MessageBoxW for startup failures (dialog.rs) and the wide-string helpers.
  deps.push({
    name: 'windows-sys',
    version: '0.61',
    target: 'cfg(windows)',
    features: ['Win32_Foundation', 'Win32_UI_WindowsAndMessaging'],
  });
  // The theme catalog and the config file are TOML, the user theme directory and the config
  // path come from `dirs`. Declared here as well as by src/gen/deps.js so turning `serde` off in
  // the crates step cannot leave these features without their crates.
  if (f.has('themes') || f.has('config')) {
    deps.push(
      { name: 'serde', version: '1', features: ['derive'] },
      { name: 'toml', version: '1.1' },
      { name: 'dirs', version: '7' },
    );
  }
  if (f.has('winres')) deps.push({ name: 'winresource', version: '0.1', kind: 'build' });
  if (f.has('screenshotExample')) {
    deps.push({ name: 'egui_kittest', version: '0.37', kind: 'dev', features: ['wgpu', 'snapshot'] });
  }
  return deps;
};
