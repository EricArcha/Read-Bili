import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm, stat, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configureKey, resolveKey, readHidden, openKeyring } from '../src/secrets.mjs';
import { EventEmitter } from 'node:events';
import { installationPlan, setup } from '../src/setup.mjs';
import { installSkill, agentDestination, parseAgents, sourceRoot } from '../src/install-skill.mjs';
import { runProcess } from '../src/process.mjs';

async function temporary(t) { const path = await mkdtemp(join(tmpdir(), 'read-bili install 中文-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
test('key source precedence, unavailable keyring and no plaintext fallback', async () => {
  let calls = 0; const keyring = async () => { calls++; throw new Error('locked'); };
  assert.equal((await resolveKey({ explicit: 'arg-key', env: { SILICONFLOW_API_KEY: 'env-key' }, keyring })).source, 'argument');
  assert.equal((await resolveKey({ env: { SILICONFLOW_API_KEY: 'env-key' }, keyring })).source, 'environment'); assert.equal(calls, 0);
  const missing = await resolveKey({ env: {}, keyring }); assert.equal(missing.value, ''); assert.match(missing.warning, /unavailable/);
  assert.equal((await resolveKey({ env: {}, keyring: async () => ({ getPassword: () => 'stored-key' }) })).source, 'keyring');
});
test('key set/status/delete do not leak or delete environment keys', async () => {
  let password; const env = { SILICONFLOW_API_KEY: 'existing-env' }; const out = [];
  const options = { env, output: text => out.push(text), hidden: async () => 'new-secret', keyring: async () => ({ getPassword: () => password, setPassword: value => { password = value; }, deletePassword: () => { password = undefined; } }) };
  await configureKey('set', options); assert.equal(password, 'new-secret');
  await configureKey('status', options); assert.match(out.join(''), /environment/); assert.ok(!out.join('').includes('new-secret')); assert.ok(!out.join('').includes('existing-env'));
  await configureKey('delete', options); assert.equal(password, undefined); assert.equal(env.SILICONFLOW_API_KEY, 'existing-env');
  await assert.rejects(configureKey('set', { ...options, hidden: async () => '' }), { exitCode: 2 });
  assert.throws(() => readHidden({ input: { isTTY: false }, output: {} }), { exitCode: 2 });
});
test('keyring failures are actionable and do not expose backend secret errors', async () => {
  await assert.rejects(configureKey('set', { keyring: async () => { throw new Error('private'); } }), /Credential store unavailable/);
  await assert.rejects(configureKey('set', { hidden: async () => 'my-secret', keyring: async () => ({ setPassword: () => { throw new Error('my-secret'); } }) }), /Could not save credential/);
});
test('Linux credentials pin persistent Secret Service, not memory keyutils', async () => {
  let received;
  await openKeyring('linux', async () => ({ Entry: class { constructor(...args) { received = args; } } }));
  assert.deepEqual(received, ['read-bili', 'siliconflow', { linux: { store: 'secret-service' } }]);
});
test('hidden key input handles paste/backspace and restores terminal without echoing secrets', async () => {
  const input = new EventEmitter(); Object.assign(input, { isTTY: true, isRaw: false, setRawMode(value) { this.isRaw = value; }, resume() {}, pause() {}, setEncoding() {} });
  const printed = []; const output = { isTTY: true, write: text => printed.push(text) };
  const read = readHidden({ input, output }); input.emit('data', 'abc\bD\r');
  assert.equal(await read, 'abD'); assert.equal(input.isRaw, false); assert.ok(!printed.join('').includes('abD'));
  const cancelled = readHidden({ input, output }); input.emit('data', '\u0003'); await assert.rejects(cancelled, /cancelled/); assert.equal(input.isRaw, false);
});
function report(platform, missing = ['ffmpeg', 'ffprobe', 'yt-dlp']) { return { platform, mode: 'asr', checks: [...['node', 'ffmpeg', 'ffprobe', 'yt-dlp', 'siliconflow-key'].map(name => ({ name, status: missing.includes(name) ? 'missing' : 'ok', repair: 'repair' }))], ready: missing.length === 0 }; }
test('platform install plans deduplicate ffprobe and do not reinstall found tools', () => {
  assert.deepEqual(installationPlan(report('win32')).map(p => p.name), ['ffmpeg', 'yt-dlp']);
  assert.ok(installationPlan(report('darwin'))[0].command === 'brew');
  assert.equal(installationPlan(report('linux'), 'debian')[0].command, 'apt-get');
  assert.equal(installationPlan(report('linux'), 'other')[0].command, null);
  assert.equal(installationPlan(report('win32', [] )).length, 0);
});
test('dry run does not execute, prompt, configure or install', async () => {
  const forbidden = () => { throw new Error('mutation'); };
  await setup({ dryRun: true, platform: 'win32', diagnose: async () => report('win32'), execute: forbidden, prompt: forbidden, configure: forbidden, install: forbidden });
});
test('noninteractive setup requires --yes; key skip enables subtitles', async () => {
  await assert.rejects(setup({ interactive: false, diagnose: async () => report('win32', []) }), { exitCode: 2 });
  const final = await setup({ yes: true, skipKey: true, interactive: false, diagnose: async () => report('win32', ['siliconflow-key']), prompt: () => { throw new Error('unexpected'); } });
  assert.equal(final.ready, false);
});
test('setup rediscovers installed tools and resumable failure does not replay successful packages', async () => {
  const found = new Set(['node', 'siliconflow-key']); let attempts = []; let fail = true;
  const diagnose = async () => report('win32', ['ffmpeg', 'ffprobe', 'yt-dlp'].filter(n => !found.has(n)));
  const execute = async (_cmd, args) => { const id = args[args.indexOf('--id') + 1]; attempts.push(id); if (id === 'Gyan.FFmpeg') { found.add('ffmpeg'); found.add('ffprobe'); } else if (fail) throw new Error('network'); else found.add('yt-dlp'); };
  await assert.rejects(setup({ yes: true, interactive: false, platform: 'win32', diagnose, execute }), /network/);
  fail = false; await setup({ yes: true, interactive: false, platform: 'win32', diagnose, execute });
  assert.equal(attempts.filter(id => id === 'Gyan.FFmpeg').length, 1); assert.ok(found.has('yt-dlp'));
});
test('agent roots and invalid selections', () => {
  assert.equal(agentDestination('codex', { env: { CODEX_HOME: '/custom' }, home: '/home' }), join('/custom', 'skills/read-bili'));
  assert.equal(agentDestination('hermes', { env: { HERMES_HOME: '/hermes' }, home: '/home' }), join('/hermes', 'skills/media/read-bili'));
  assert.deepEqual(parseAgents('all'), ['codex', 'claude', 'openclaw', 'hermes']); assert.throws(() => parseAgents('invalid'), { exitCode: 2 });
});
test('four agent installation includes complete runtime and same version skips', async t => {
  const root = await temporary(t), home = join(root, 'home'); await mkdir(home);
  let installs = 0;
  const results = await installSkill({ selection: 'all', home, env: {}, dependencies: async () => { installs++; } });
  assert.equal(results.length, 4); assert.equal(installs, 4);
  for (const result of results) {
    assert.equal(JSON.parse(await readFile(join(result.target, 'package.json'), 'utf8')).version, '1.2.0');
    assert.ok(await readFile(join(result.target, 'package-lock.json'))); assert.ok(await readFile(join(result.target, 'install.ps1')));
    await assert.rejects(stat(join(result.target, '.git')), { code: 'ENOENT' });
  }
  assert.equal((await installSkill({ selection: 'all', home, env: {}, dependencies: async () => { throw new Error('unnecessary'); } })).every(r => r.status === 'unchanged'), true);
});
test('update preserves backup and failure restores prior installation', async t => {
  const root = await temporary(t), target = join(root, 'skill'); await mkdir(target); await writeFile(join(target, 'old.txt'), 'OLD');
  await assert.rejects(installSkill({ selection: 'codex', destination: target }), /already exists/);
  await assert.rejects(installSkill({ selection: 'codex', destination: target, update: true, dependencies: async () => { throw new Error('npm failed'); } }), /npm failed/);
  assert.equal(await readFile(join(target, 'old.txt'), 'utf8'), 'OLD');
  let validations = 0;
  await assert.rejects(installSkill({ selection: 'codex', destination: target, update: true, dependencies: async () => {}, validate: async () => { if (++validations === 2) throw new Error('post-install failure'); } }), /post-install failure/);
  assert.equal(await readFile(join(target, 'old.txt'), 'utf8'), 'OLD');
  const [result] = await installSkill({ selection: 'codex', destination: target, update: true, dependencies: async () => {} });
  assert.equal(await readFile(join(result.backup, 'old.txt'), 'utf8'), 'OLD');
  assert.ok(!(await readdir(root)).some(name => name.startsWith('.read-bili-stage-')));
});
test('unsafe or ambiguous install destinations are rejected before mutation', async () => {
  await assert.rejects(installSkill({ selection: 'all', destination: '/anything' }), { exitCode: 2 });
  await assert.rejects(installSkill({ selection: 'codex', destination: sourceRoot }), { exitCode: 2 });
});
test('legacy CLI works from arbitrary cwd and argument errors exit 2', async t => {
  const cwd = await temporary(t);
  const help = await runProcess(process.execPath, [join(sourceRoot, 'src/bilibili_pipeline.mjs'), '--help'], { cwd }); assert.match(help.stdout, /Read-Bili 1.2.0/);
  await assert.rejects(runProcess(process.execPath, [join(sourceRoot, 'src/cli.mjs'), 'doctor', '--mode', 'invalid'], { cwd }), /exit=2/);
});
test('CLI executes through a symlinked directory (macOS /var temporary paths)', async t => {
  const cwd = await temporary(t), linked = join(cwd, 'linked source');
  await symlink(sourceRoot, linked, process.platform === 'win32' ? 'junction' : 'dir');
  const help = await runProcess(process.execPath, [join(linked, 'src/cli.mjs'), '--help'], { cwd });
  assert.match(help.stdout, /Read-Bili 1.2.0/);
  const report = await runProcess(process.execPath, [join(linked, 'src/cli.mjs'), 'doctor', '--mode', 'subtitle', '--json'], { cwd });
  assert.equal(JSON.parse(report.stdout).ready, true);
});
