import { spawn } from 'node:child_process';
import { join } from 'node:path';

export class UsageError extends Error { constructor(message) { super(message); this.exitCode = 2; } }
const secrets = new Set();
const activeChildren = new Set();
let operation = new AbortController();
export function beginOperation() { operation = new AbortController(); }
export function operationSignal() { return operation.signal; }
export function requestSignal(timeout) {
  const parent = operation.signal;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = setTimeout(cancel, timeout); timer.unref?.();
  const cleanup = () => { clearTimeout(timer); parent.removeEventListener('abort', cancel); };
  controller.signal.addEventListener('abort', cleanup, { once: true });
  parent.addEventListener('abort', cancel, { once: true });
  if (parent.aborted) cancel();
  return { signal: controller.signal, cleanup };
}
function killTree(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    try {
      const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
      killer.on('error', () => child.kill('SIGKILL'));
    } catch { child.kill('SIGKILL'); }
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}
export function cancelProcesses() { operation.abort(); for (const child of activeChildren) killTree(child); }
export function registerSecret(value) { if (value) secrets.add(value); }
export function redact(value) {
  let text = String(value);
  for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]');
}

// Executables only: no shell expansion of paths, URLs, or user arguments.
export function runProcess(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = 300000, signal = operation.signal, cwd, env = process.env, inherit = false } = options;
    let child;
    if (signal?.aborted) { reject(new Error('Process aborted.')); return; }
    try { child = spawn(command, args, { shell: false, detached: process.platform !== 'win32', windowsHide: true, cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { reject(new Error(redact(`Could not start ${command}: ${error.message}`))); return; }
    activeChildren.add(child);
    let stdout = '', stderr = '', timedOut = false, aborted = false;
    let pending = '';
    const progress = data => {
      if (!inherit) return;
      pending += data;
      const end = pending.lastIndexOf('\n');
      if (end >= 0) { process.stderr.write(redact(pending.slice(0, end + 1))); pending = pending.slice(end + 1); }
      // Avoid unbounded output from a malformed child; retain enough tail to redact a split secret.
      if (pending.length > limit) { pending = pending.slice(-limit); }
    };
    const limit = 1024 * 1024;
    child.stdout.on('data', data => { stdout = (stdout + data).slice(-limit); progress(data); });
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-limit); progress(data); });
    const onAbort = () => { aborted = true; killTree(child); };
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => { timedOut = true; killTree(child); }, timeout);
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); activeChildren.delete(child); };
    child.once('error', error => { cleanup(); reject(new Error(redact(`Could not start ${command}: ${error.message}`))); });
    child.once('close', (code, exitSignal) => {
      cleanup();
      if (inherit && pending) process.stderr.write(redact(pending));
      if (timedOut || aborted || code !== 0) {
        reject(new Error(redact(`${command}: ${timedOut ? 'timed out' : aborted ? 'aborted' : `exit=${code}, signal=${exitSignal}`} ${stderr.trim()}`)));
      } else resolve({ stdout, stderr, code });
    });
  });
}
