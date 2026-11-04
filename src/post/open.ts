/** Post-step: open the project in an editor, detached. */
import { spawn } from 'node:child_process';

/**
 * @param {string} dir
 * @param {'none' | 'code' | 'cursor'} editor
 * @returns {boolean} whether a launch was attempted
 */
export function openEditor(dir: string, editor: "code" | "none" | "cursor") {
  if (!editor || editor === 'none') return false;
  try {
    const win = process.platform === 'win32';
    const child = spawn(editor, [win ? `"${dir}"` : dir], {
      detached: true, stdio: 'ignore', shell: win, windowsHide: true,
    });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}
