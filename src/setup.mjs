import { createInterface } from 'node:readline/promises';
import { doctor, printDoctor } from './doctor.mjs';
import { detectLinuxFamily } from './tools.mjs';
import { runProcess, UsageError, operationSignal, cancelProcesses } from './process.mjs';
import { configureKey } from './secrets.mjs';
import { installSkill, parseAgents, agentDestination } from './install-skill.mjs';

export function installationPlan(report, linuxFamily = 'other') {
  const missing = new Set(report.checks.filter(c => c.status !== 'ok').map(c => c.name));
  const packages = [];
  if (missing.has('ffmpeg') || missing.has('ffprobe')) packages.push('ffmpeg');
  if (missing.has('yt-dlp')) packages.push('yt-dlp');
  if (report.platform === 'win32') return packages.map(name => ({ name, command: 'winget.exe', args: ['install', '--id', name === 'ffmpeg' ? 'Gyan.FFmpeg' : 'yt-dlp.yt-dlp', '--exact', '--source', 'winget', '--scope', 'user', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'], source: 'winget', target: 'current user' }));
  if (report.platform === 'darwin') return packages.map(name => ({ name, command: 'brew', args: ['install', name], source: 'Homebrew', target: 'existing Homebrew prefix' }));
  if (report.platform === 'linux' && linuxFamily === 'debian') return packages.map(name => ({ name, command: 'apt-get', args: ['install', '-y', name], source: 'configured apt repositories', target: 'system (requires privileges)' }));
  return packages.map(name => ({ name, command: null, args: [], source: 'system package manager', target: 'manual installation' }));
}
async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  rl.on('SIGINT', cancelProcesses);
  try { return (await rl.question(question, { signal: operationSignal() })).trim(); } finally { rl.close(); }
}
export async function setup({ yes = false, dryRun = false, selection, skipKey = false, diagnose = doctor, execute = runProcess, platform = process.platform, linuxFamily, interactive = Boolean(process.stdin.isTTY && process.stderr.isTTY), prompt = ask, configure = configureKey, install = installSkill } = {}) {
  if (selection) parseAgents(selection);
  const report = await diagnose({ platform });
  const plan = installationPlan(report, linuxFamily || (platform === 'linux' ? await detectLinuxFamily() : 'other'));
  printDoctor(report);
  for (const step of plan) console.log(`Install ${step.name}: ${step.command || '(manual)'} ${step.args.join(' ')}; source=${step.source}; target=${step.target}`);
  if (dryRun) {
    if (selection) for (const agent of parseAgents(selection)) console.log(`Skill target ${agent}: ${agentDestination(agent)}`);
    console.log('Dry run: no installations, configuration, or skill copies performed.'); return report;
  }
  if (!interactive && !yes) throw new UsageError('Non-interactive setup requires --yes. Add --agent <list> and/or --skip-key as needed.');
  for (const step of plan) {
    if (!step.command) throw new Error(`Install ${step.name} manually with your distribution package manager, then rerun setup.`);
    if (!yes && !/^y(es)?$/i.test(await prompt(`Install ${step.name}? [y/N] `))) continue;
    if (step.command === 'apt-get' && process.getuid?.() !== 0) throw new Error(`Run sudo apt-get update && sudo apt-get install ${plan.map(p => p.name).join(' ')}, then rerun setup. Setup does not obtain sudo credentials.`);
    if (step.command === 'brew') {
      try { await execute('brew', ['--version'], { timeout: 5000 }); } catch { throw new Error('Homebrew is required. Install it using brew.sh, then rerun setup.'); }
    }
    await execute(step.command, step.args, { inherit: true, timeout: 600000 });
  }
  const afterInstall = await diagnose({ platform });
  const keyMissing = afterInstall.checks.some(c => c.name === 'siliconflow-key' && c.status !== 'ok');
  if (keyMissing && !skipKey && interactive && /^y(es)?$/i.test(await prompt('Configure SiliconFlow key in system credential store? [y/N] '))) await configure('set');
  if (!selection && interactive) selection = await prompt('Install skill to agents (codex,claude,openclaw,hermes,all; blank to skip): ');
  if (selection) for (const result of await install({ selection })) console.log(`${result.agent}: ${result.status} ${result.target}${result.backup ? ' (backup: ' + result.backup + ')' : ''}`);
  const final = await diagnose({ platform }); printDoctor(final);
  console.log('Existing terminals/agents may need restarting to refresh PATH. Read-Bili discovers newly installed tools without restarting this process.');
  if (final.checks.some(c => c.name !== 'siliconflow-key' && c.status !== 'ok')) throw new Error('Setup incomplete: repair missing dependencies and rerun setup.');
  if (!final.ready) console.log('Subtitle mode is available. Configure a key later to enable ASR.');
  return final;
}
