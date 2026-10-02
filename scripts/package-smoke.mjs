import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../src/process.mjs';
import { findNpmCli, sourceRoot } from '../src/install-skill.mjs';

const temporary = await mkdtemp(join(tmpdir(), 'read-bili package 中文 space-'));
try {
  assert.deepEqual(JSON.parse(await readFile(join(sourceRoot, 'package-lock.json'))), JSON.parse(await readFile(join(sourceRoot, 'npm-shrinkwrap.json'))), 'Keep both lockfiles in sync');
  const npm = await findNpmCli();
  const packed = await runProcess(process.execPath, [npm, 'pack', '--json', '--pack-destination', temporary], { cwd: sourceRoot });
  const [bundle] = JSON.parse(packed.stdout);
  for (const path of ['SKILL.md', 'npm-shrinkwrap.json', 'install.sh', 'install.ps1', 'src/cli.mjs']) assert.ok(bundle.files.some(file => file.path === path), `Missing ${path}`);
  assert.ok(bundle.files.every(file => !/(?:^|\/)(?:\.git|\.env|output|node_modules)(?:\/|$)/.test(file.path)));
  const prefix = join(temporary, 'consumer');
  await runProcess(process.execPath, [npm, 'install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', join(temporary, bundle.filename)], { timeout: 300000 });
  const cli = join(prefix, 'node_modules/read-bili/src/cli.mjs');
  const help = await runProcess(process.execPath, [cli, '--help'], { cwd: temporary });
  assert.match(help.stdout, /Read-Bili 1.2.0/);
  const installed = join(temporary, 'installed skill 中文');
  await runProcess(process.execPath, [cli, 'install-skill', '--agent', 'codex', '--dest', installed], { cwd: temporary });
  const result = await runProcess(process.execPath, [join(installed, 'src/cli.mjs'), 'doctor', '--mode', 'subtitle', '--json'], { cwd: temporary });
  assert.equal(JSON.parse(result.stdout).ready, true);
  console.log('Packaged CLI, locked dependencies, and skill installation passed.');
} finally { await rm(temporary, { recursive: true, force: true }); }
