#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { doctor, printDoctor } from './doctor.mjs';
import { configureKey, resolveKey } from './secrets.mjs';
import { setup } from './setup.mjs';
import { installSkill } from './install-skill.mjs';
import { beginOperation, cancelProcesses, operationSignal, redact, UsageError } from './process.mjs';

export const help = `Read-Bili 1.2.0 — subtitles and audio transcription
Usage:
  read-bili probe <url|BV> [--output-dir ./output]
  read-bili run <url|BV> [--output-dir ./output] [--model <model>]
      [--api-key <key>] [--cookies-from-browser <browser> | --cookies <file>]
      [--force-video-fallback]
  read-bili doctor [--mode subtitle|asr] [--json]
  read-bili setup [--yes] [--dry-run] [--agent <list>] [--skip-key]
  read-bili configure key set|status|delete
  read-bili install-skill --agent codex,claude,openclaw,hermes|all [--dest <directory>] [--update]
Environment: SILICONFLOW_API_KEY, READ_BILI_FFMPEG, READ_BILI_FFPROBE, READ_BILI_YT_DLP
No automatic browser cookie access. Use environment/keyring rather than --api-key where possible.`;
const flags = new Set(['help', 'json', 'yes', 'dry-run', 'skip-key', 'update', 'force-video-fallback']);
const values = new Set(['output-dir', 'model', 'api-key', 'cookies-from-browser', 'cookies', 'mode', 'agent', 'dest']);
export function parseArgs(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) { if (token === '-h') result.help = true; else result._.push(token); continue; }
    const name = token.slice(2);
    if (flags.has(name)) result[name] = true;
    else if (values.has(name)) {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new UsageError(`--${name} requires a value.`);
      result[name] = next;
    } else throw new UsageError(`Unknown option: ${token}`);
  }
  if (result.cookies && result['cookies-from-browser']) throw new UsageError('--cookies and --cookies-from-browser are mutually exclusive.');
  return result;
}
export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) { console.log(help); return 0; }
  if (Number(process.versions.node.split('.')[0]) < 18) throw new Error('Node.js 18+ required.');
  const [command, value, action] = args._;
  const allowed = {
    probe: ['output-dir'], run: ['output-dir', 'model', 'api-key', 'cookies', 'cookies-from-browser', 'force-video-fallback'],
    doctor: ['mode', 'json'], setup: ['yes', 'dry-run', 'agent', 'skip-key'], configure: [], 'install-skill': ['agent', 'dest', 'update']
  };
  if (!allowed[command]) throw new UsageError(help);
  for (const flag of Object.keys(args).filter(key => key !== '_')) if (!allowed[command].includes(flag)) throw new UsageError(`--${flag} is not supported by ${command}.`);
  const expected = command === 'configure' ? 3 : ['run', 'probe'].includes(command) ? 2 : 1;
  if (args._.length !== expected) throw new UsageError(`Invalid arguments for ${command}.\n${help}`);
  if (command === 'doctor') { const report = await doctor({ mode: args.mode }); printDoctor(report, args.json); return report.ready ? 0 : 1; }
  if (command === 'configure') { if (value !== 'key') throw new UsageError('Use configure key set|status|delete.'); await configureKey(action); return 0; }
  if (command === 'setup') { await setup({ yes: args.yes, dryRun: args['dry-run'], selection: args.agent, skipKey: args['skip-key'] }); return 0; }
  if (command === 'install-skill') {
    console.log(JSON.stringify(await installSkill({ selection: args.agent, destination: args.dest, update: args.update }), null, 2)); return 0;
  }
  const { runProbe, runPipeline } = await import('./pipeline.mjs');
  const outputDir = resolve(args['output-dir'] || './output');
  if (command === 'probe') { await runProbe(value, outputDir, false); return 0; }
  const key = await resolveKey({ explicit: args['api-key'] });
  await runPipeline(value, outputDir, key.value, args.model || 'TeleAI/TeleSpeechASR', Boolean(args['force-video-fallback']), { cookies: args.cookies, cookiesFromBrowser: args['cookies-from-browser'], keyWarning: key.warning });
  return 0;
}
export async function runCli(argv) {
  beginOperation();
  const cancel = () => { cancelProcesses(); process.exitCode = 1; };
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel);
  try { const code = await main(argv); process.exitCode = operationSignal().aborted ? 1 : code; }
  catch (error) { console.error(redact(error.message)); process.exitCode = error.exitCode || 1; }
  finally { process.removeListener('SIGINT', cancel); process.removeListener('SIGTERM', cancel); }
}
// ESM resolves symlinks, while argv may retain /var vs /private/var on macOS.
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await runCli();
