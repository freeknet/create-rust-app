// @ts-check
/**
 * Win32 features the optional GUI features call. windows-sys features from several groups are
 * unioned by src/gen/deps.js.
 *
 * @param {any} ctx
 * @returns {import('../../src/gen/deps.js').Dep[]}
 */
export default (ctx) => {
  const f = ctx.flags;
  /** @type {Set<string>} */
  const features = new Set();
  if (f.has('tray') || f.has('singleInstance')) {
    features.add('Win32_Foundation').add('Win32_UI_WindowsAndMessaging');
  }
  if (f.has('tray')) {
    features.add('Win32_UI_Shell').add('Win32_Graphics_Gdi').add('Win32_System_LibraryLoader');
  }
  if (f.has('singleInstance')) features.add('Win32_System_Threading').add('Win32_Security');
  if (!features.size) return [];
  return [{ name: 'windows-sys', version: '0.61', target: 'cfg(windows)', features: [...features].sort() }];
};
