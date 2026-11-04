// @ts-check
/**
 * Line directives: `// @if a & !b`, `# @elif c | d`, `<!-- @else -->`, `@end`.
 * Directive lines are removed; lines in inactive branches are removed.
 */

const DIRECTIVE =
  /^\s*(?:\/\/|#|<!--|--|;)?\s*@(if|elif|else|end)\b\s*(.*?)\s*(?:-->)?\s*$/;

/**
 * @param {string} expr
 * @param {Set<string>} flags
 */
export function evalExpr(expr, flags) {
  const src = expr.trim();
  if (!src) throw new Error('empty directive expression');
  return src.split('|').some((term) =>
    term.split('&').every((raw) => {
      const atom = raw.trim();
      if (!atom) throw new Error(`bad directive expression: "${expr}"`);
      const neg = atom.startsWith('!');
      const name = neg ? atom.slice(1).trim() : atom;
      if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`bad flag "${name}" in "${expr}"`);
      return neg ? !flags.has(name) : flags.has(name);
    }),
  );
}

/**
 * @param {string} text
 * @param {Set<string>} flags
 * @param {string} [where] for error messages
 */
export function applyDirectives(text, flags, where = '<text>') {
  if (!text.includes('@')) return text;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  /** @type {{active: boolean, taken: boolean, parentActive: boolean}[]} */
  const stack = [];
  const out = [];
  const active = () => (stack.length ? stack[stack.length - 1].active : true);
  lines.forEach((line, i) => {
    const m = DIRECTIVE.exec(line);
    if (!m) {
      if (active()) out.push(line);
      return;
    }
    const [, kind, expr] = m;
    const at = `${where}:${i + 1}`;
    if (kind === 'if') {
      const parentActive = active();
      const hit = parentActive && evalExpr(expr, flags);
      stack.push({ active: hit, taken: hit, parentActive });
    } else if (kind === 'elif') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error(`@elif without @if at ${at}`);
      const hit = top.parentActive && !top.taken && evalExpr(expr, flags);
      top.active = hit;
      top.taken ||= hit;
    } else if (kind === 'else') {
      const top = stack[stack.length - 1];
      if (!top) throw new Error(`@else without @if at ${at}`);
      top.active = top.parentActive && !top.taken;
      top.taken = true;
    } else {
      if (!stack.pop()) throw new Error(`@end without @if at ${at}`);
    }
  });
  if (stack.length) throw new Error(`unclosed @if in ${where}`);
  return out.join(eol);
}
