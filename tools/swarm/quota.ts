type Window = { usedPercent: number, windowDurationMins: number, resetsAt: number };
export type Quota = { planType: string, primary: Window | null, secondary: Window | null, allowed: boolean };
/**
 * Read the ChatGPT-plan Codex usage windows without spending any: `codex app-server` speaks JSON-RPC
 * over stdio and answers `account/rateLimits/read` from the account, no model turn involved.
 *
 * @typedef {{ usedPercent: number, windowDurationMins: number, resetsAt: number }} Window
 * @typedef {{ planType: string, primary: Window | null, secondary: Window | null, allowed: boolean }} Quota
 */
import { spawn } from 'node:child_process';

/** @param {number} [timeoutMs] @returns {Promise<Quota | null>} null when the server can't be reached */
export function readQuota(timeoutMs: number | undefined = 20000) {
  return new Promise((resolve: (value: Quota | PromiseLike<Quota | null> | null) => void) => {
    const p = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let buf = '';
    let done = false;
    const finish = (/** @type {Quota | null} */ q: Quota | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      p.kill();
      resolve(q);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const send = (/** @type {object} */ m: object) => p.stdin.write(JSON.stringify(m) + '\n');
    p.on('error', () => finish(null));
    p.stdout.on('data', (d: unknown) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let msg;
        try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id === 1) {
          send({ method: 'initialized' });
          send({ id: 2, method: 'account/rateLimits/read' });
        } else if (msg.id === 2) {
          const r = msg.result?.rateLimits;
          finish(r ? { planType: r.planType ?? '?', primary: r.primary ?? null, secondary: r.secondary ?? null, allowed: msg.result.ordinaryUsageAllowed !== false } : null);
        }
      }
    });
    send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'create-rust-app-swarm', version: '0.1.0' } } });
  });
}

/** @param {Window | null} w */
const fmtWindow = (w: Window | null) => {
  if (!w) return 'n/a';
  const resets = new Date(w.resetsAt * 1000);
  const span = w.windowDurationMins >= 1440 ? `${Math.round(w.windowDurationMins / 1440)}d` : `${Math.round(w.windowDurationMins / 60)}h`;
  return `${span} ${Math.round(w.usedPercent)}% used (resets ${resets.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })})`;
};

/** @param {Quota | null} q */
export function describeQuota(q: Quota | null) {
  if (!q) return 'quota: unavailable (codex app-server did not answer)';
  return `quota: ${q.planType} · ${fmtWindow(q.primary)} · ${fmtWindow(q.secondary)}${q.allowed ? '' : ' · BLOCKED'}`;
}

/** Highest used% across windows (the binding constraint). @param {Quota | null} q */
export const usedPercent = (q: Quota | null) => (q ? Math.max(q.primary?.usedPercent ?? 0, q.secondary?.usedPercent ?? 0) : 0);
