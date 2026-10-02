import { findTool, toolNames, repairHint } from './tools.mjs';
import { resolveKey } from './secrets.mjs';
import { UsageError } from './process.mjs';

export async function doctor({ mode = 'asr', platform = process.platform, env = process.env, nodeVersion = process.versions.node, find = findTool, key = resolveKey } = {}) {
  if (!['subtitle', 'asr'].includes(mode)) throw new UsageError('--mode must be subtitle or asr.');
  const checks = [{ name: 'node', status: Number(nodeVersion.split('.')[0]) >= 18 ? 'ok' : 'missing', version: nodeVersion, path: process.execPath, repair: 'Install Node.js 18+ (current LTS recommended).' }];
  if (mode === 'asr') {
    for (const name of toolNames) {
      const result = await find(name, { platform, env });
      checks.push({ name, status: result ? 'ok' : 'missing', version: result?.version || null, path: result?.path || null, repair: result ? null : repairHint(name, platform) });
    }
    const result = await key({ env });
    checks.push({ name: 'siliconflow-key', status: result.invalid ? 'invalid' : result.value ? 'ok' : 'missing', version: null, path: null, source: result.source, repair: result.value ? null : result.warning || 'Run read-bili configure key set or set SILICONFLOW_API_KEY.' });
  }
  return { schemaVersion: 1, platform, mode, checks, ready: checks.every(check => check.status === 'ok') };
}
export function printDoctor(report, json = false) {
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Read-Bili ${report.mode} readiness: ${report.ready ? 'ready' : 'needs setup'} (${report.platform})`);
    for (const check of report.checks) console.log(`${check.status === 'ok' ? 'OK' : 'MISSING'} ${check.name}${check.version ? ': ' + check.version : ''}${check.path ? ' [' + check.path + ']' : ''}${check.status !== 'ok' ? '\n  ' + check.repair : ''}`);
  }
}
