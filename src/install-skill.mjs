import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { runProcess, UsageError } from './process.mjs';

export const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const agents = ['codex', 'claude', 'openclaw', 'hermes'];
export const bundleFiles = ['src', 'docs', 'SKILL.md', 'README.md', 'LICENSE', 'package.json', 'package-lock.json', 'npm-shrinkwrap.json', 'install.ps1', 'install.sh'];
export function agentDestination(agent, { env = process.env, home = homedir() } = {}) {
  if (agent === 'codex') return join(env.CODEX_HOME || join(home, '.codex'), 'skills/read-bili');
  if (agent === 'claude') return join(home, '.claude/skills/read-bili');
  if (agent === 'openclaw') return join(home, '.openclaw/skills/read-bili');
  if (agent === 'hermes') return join(env.HERMES_HOME || join(home, '.hermes'), 'skills/media/read-bili');
  throw new UsageError(`Unknown agent: ${agent}. Use ${agents.join(',')}.`);
}
export function parseAgents(value) {
  if (!value || typeof value !== 'string') throw new UsageError('--agent is required (codex,claude,openclaw,hermes or all).');
  const selected = value === 'all' ? agents : [...new Set(value.split(',').map(s => s.trim()).filter(Boolean))];
  if (!selected.length || selected.some(agent => !agents.includes(agent))) throw new UsageError('Invalid --agent selection.');
  return selected;
}
async function exists(path) { try { await stat(path); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
async function canonical(path) {
  try { return await realpath(path); } catch (error) { if (error.code !== 'ENOENT') throw error; return join(await canonical(dirname(path)), path.slice(dirname(path).length + 1)); }
}
function within(parent, path) { return parent === path || path.startsWith(parent + sep); }

export async function findNpmCli() {
  // npm.cmd cannot be spawned with shell:false on Windows. Invoke npm's JS entry directly.
  const candidates = [process.env.npm_execpath, join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].filter(Boolean);
  for (const directory of (process.env.PATH || '').split(process.platform === 'win32' ? ';' : ':')) {
    try { const npm = await realpath(join(directory, process.platform === 'win32' ? 'npm.cmd' : 'npm')); if (npm.endsWith('.js')) candidates.push(npm); else candidates.push(join(dirname(npm), 'node_modules/npm/bin/npm-cli.js')); } catch { /* continue */ }
  }
  for (const path of candidates) if (await exists(path)) return path;
  throw new Error('npm entrypoint not found. Install Node.js with npm before installing a skill.');
}
export async function npmCi(cwd, execute = runProcess) {
  await execute(process.execPath, [await findNpmCli(), 'ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd, timeout: 300000, inherit: true });
}

export async function installSkill({ selection, destination, update = false, root = sourceRoot, env = process.env, home = homedir(), dependencies = npmCi, validate = validateBundle, onPlan = console.error } = {}) {
  const selected = parseAgents(selection);
  if (destination && selected.length !== 1) throw new UsageError('--dest requires exactly one agent and denotes the final skill directory.');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const results = [];
  for (const agent of selected) {
    const target = resolve(destination || agentDestination(agent, { env, home }));
    const realRoot = await canonical(root), realTarget = await canonical(target);
    if (within(realRoot, realTarget) || within(realTarget, realRoot) || realTarget === await canonical(home) || realTarget === dirname(realTarget)) throw new UsageError('Install destination must be a dedicated directory outside the source and home root.');
    const present = await exists(target);
    if (present) {
      let marker;
      try { marker = JSON.parse(await readFile(join(target, '.read-bili-install.json'), 'utf8')); } catch { /* not a managed installation */ }
      if (marker?.name === 'read-bili' && marker.version === pkg.version) {
        try { await validate(target); results.push({ agent, target, status: 'unchanged' }); continue; }
        catch { if (!update) throw new Error(`Installation is damaged: ${target}. Use --update to repair it.`); }
      }
      if (!update) throw new Error(`Destination already exists: ${target}. Use --update to back up and replace it.`);
    }
    onPlan(`Install Read-Bili ${pkg.version} from ${root} to ${agent}: ${target}${present ? ' (backup and update)' : ''}`);
    await mkdir(dirname(target), { recursive: true });
    const staging = await mkdtemp(join(dirname(target), '.read-bili-stage-'));
    let backup, installed = false;
    try {
      for (const entry of bundleFiles) {
        if (['package-lock.json', 'npm-shrinkwrap.json'].includes(entry) && !await exists(join(root, entry))) continue;
        await cp(join(root, entry), join(staging, entry), { recursive: true, dereference: false, filter: path => !relative(root, path).split(/[\\/]/).some(part => ['node_modules', '.git', 'output'].includes(part) || part.startsWith('.env') || /\.(?:mp3|mp4|m4s)$/.test(part)) });
      }
      if (!await exists(join(staging, 'package-lock.json')) && !await exists(join(staging, 'npm-shrinkwrap.json'))) throw new Error('Installation bundle is missing its npm lockfile.');
      await dependencies(staging);
      await writeFile(join(staging, '.read-bili-install.json'), JSON.stringify({ name: 'read-bili', version: pkg.version, agent, installedAt: new Date().toISOString() }, null, 2));
      await validate(staging);
      if (present) { const backupPath = `${target}.backup-${Date.now()}`; await rename(target, backupPath); backup = backupPath; }
      await rename(staging, target); installed = true;
      await validate(target);
      results.push({ agent, target, status: present ? 'updated' : 'installed', backup: backup || null });
    } catch (error) {
      if (installed) await rm(target, { recursive: true, force: true });
      if (backup) await rename(backup, target);
      throw error;
    } finally { await rm(staging, { recursive: true, force: true }); }
  }
  return results;
}
export async function validateBundle(root) {
  const skill = await readFile(join(root, 'SKILL.md'), 'utf8');
  if (!/^---\r?\nname: read-bili\r?\n/.test(skill)) throw new Error('Invalid SKILL.md in installation.');
  await runProcess(process.execPath, [join(root, 'src/cli.mjs'), '--help'], { cwd: root, timeout: 15000 });
}
