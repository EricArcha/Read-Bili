import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { doctor } from '../src/doctor.mjs';
import { findTool } from '../src/tools.mjs';
import { runProcess, registerSecret, redact } from '../src/process.mjs';
import { parseArgs, main } from '../src/cli.mjs';
import { runPipeline, runProbe, downloadAudio, splitAudioIntoSegments, probeVideo, transcribeWithSiliconFlow } from '../src/pipeline.mjs';

async function temporary(t) { const path = await mkdtemp(join(tmpdir(), 'read-bili 中文 space-')); t.after(() => rm(path, { recursive: true, force: true })); return path; }
async function absent(path) { await assert.rejects(readFile(path), { code: 'ENOENT' }); }

test('subtitle doctor never checks audio tools or secrets', async () => {
  const report = await doctor({ mode: 'subtitle', find: () => { throw new Error('unexpected'); }, key: () => { throw new Error('unexpected'); } });
  assert.equal(report.ready, true); assert.equal(report.checks.length, 1);
});
test('ASR doctor reports failures without exposing key', async () => {
  const report = await doctor({ find: async name => name === 'ffmpeg' ? { path: '/with space/ffmpeg', version: 'v1' } : null, key: async () => ({ value: 'top-secret', source: 'environment' }) });
  assert.equal(report.ready, false); assert.equal(report.schemaVersion, 1); assert.ok(!JSON.stringify(report).includes('top-secret'));
  await assert.rejects(doctor({ mode: 'bad' }), { exitCode: 2 });
});
test('tool override takes precedence and invalid override is not bypassed', async () => {
  const calls = [];
  const tool = await findTool('ffmpeg', { env: { READ_BILI_FFMPEG: '/special space/ffmpeg', PATH: '/other' }, execute: async (path, args) => { calls.push([path, args]); return { stdout: 'version1\nmore' }; } });
  assert.equal(tool.path, '/special space/ffmpeg'); assert.deepEqual(calls[0][1], ['-version']);
  assert.equal(await findTool('ffmpeg', { env: { READ_BILI_FFMPEG: '/broken' }, execute: async () => { throw new Error('ENOENT'); } }), null);
});
test('tools are rediscovered outside stale PATH', async () => {
  const tool = await findTool('yt-dlp', { env: { PATH: '/missing' }, extraDirectories: ['/new install'], execute: async path => { if (!path.includes('new install')) throw new Error('missing'); return { stdout: 'new version' }; } });
  assert.match(tool.path, /new install/);
});
test('subprocess preserves Unicode/space/metachar arguments and handles errors', async t => {
  const root = await temporary(t), file = join(root, 'echo 中文.mjs');
  await writeFile(file, 'console.log(JSON.stringify(process.argv.slice(2)))');
  const args = ['space 中文', '$(do-not-run); & "quoted"'];
  const result = await runProcess(process.execPath, [file, ...args]);
  assert.deepEqual(JSON.parse(result.stdout), args);
  await assert.rejects(runProcess(join(root, 'absent'), []), /Could not start/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'process.exit(4)']), /exit=4/);
  await assert.rejects(runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 100 }), /timed out/);
  const controller = new AbortController(); const promise = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { signal: controller.signal }); controller.abort();
  await assert.rejects(promise, /abort/i);
});
test('CLI rejects missing values, wrong modes, unknown options and cookie conflicts', async () => {
  for (const args of [['run', 'BV1', '--cookies'], ['run', 'BV1', '--unknown'], ['run', 'BV1', '--cookies', 'x', '--cookies-from-browser', 'chrome']]) assert.throws(() => parseArgs(args), { exitCode: 2 });
  await assert.rejects(main(['probe', 'BV1', '--update']), { exitCode: 2 });
  await assert.rejects(main(['run']), { exitCode: 2 });
});
test('subtitle pipeline works with no key/tools, and probe does not mark ready', async t => {
  const root = await temporary(t), probe = async () => ({ subtitle_text: '你好\n字幕', subtitles: [{}], playinfo: {}, title: 'video' });
  await runProbe('BV1', root, false, { probe }); await absent(join(root, '.skill-ready.json'));
  await runPipeline('BV1', root, '', 'model', false, { probe, find: () => { throw new Error('unexpected tools'); } });
  assert.equal(await readFile(join(root, 'transcript.txt'), 'utf8'), '你好\n字幕\n'); assert.ok(await readFile(join(root, '.skill-ready.json')));
});
test('missing ASR prerequisites block before downloads and invalidate old readiness', async t => {
  const root = await temporary(t); await writeFile(join(root, '.skill-ready.json'), '{}');
  const options = { probe: async () => ({ playinfo: {}, subtitles: [] }), download: () => { throw new Error('download should not run'); } };
  await assert.rejects(runPipeline('BV1', root, '', 'model', false, options), /Missing SiliconFlow/);
  await absent(join(root, '.skill-ready.json'));
  await assert.rejects(runPipeline('BV1', root, 'key', 'model', false, { ...options, find: async () => null }), /Missing ffmpeg/);
});
test('failed download cannot reuse an old audio file; explicit cookies only', async t => {
  const root = await temporary(t); await writeFile(join(root, 'audio.mp3'), 'OLD');
  const tools = { ffmpeg: { path: '/tools/ffmpeg' }, ffprobe: { path: '/tools/ffprobe' }, 'yt-dlp': { path: '/tools/yt-dlp' } };
  let seen;
  await assert.rejects(downloadAudio('BV1abc', { playinfo: {} }, root, tools, { execute: async (_cmd, args) => { seen = args; await writeFile(args[args.indexOf('-o') + 1], 'partial'); throw new Error('exit 1'); } }), /yt-dlp failed/);
  assert.equal(await readFile(join(root, 'audio.mp3'), 'utf8'), 'OLD'); assert.ok(!seen.includes('--cookies-from-browser')); assert.ok(!(await readdir(root)).some(s => s.startsWith('.download-')));
  await downloadAudio('BV1abc', { playinfo: {} }, root, tools, { cookiesFromBrowser: 'firefox', execute: async (_cmd, args) => { seen = args; await writeFile(args[args.indexOf('-o') + 1], 'NEW'); }, duration: async () => 10 });
  assert.equal(await readFile(join(root, 'audio.mp3'), 'utf8'), 'NEW'); assert.equal(seen[seen.indexOf('--cookies-from-browser') + 1], 'firefox');
});
test('empty and invalid downloaded audio is never promoted', async t => {
  const root = await temporary(t), tools = { ffmpeg: { path: '/ffmpeg' }, 'yt-dlp': { path: '/yt-dlp' } };
  await assert.rejects(downloadAudio('BV1', { playinfo: {} }, root, tools, { execute: async (_c, a) => writeFile(a[a.indexOf('-o') + 1], ''), duration: async () => 0 }), /empty audio/);
  await assert.rejects(downloadAudio('BV1', { playinfo: {} }, root, tools, { execute: async (_c, a) => writeFile(a[a.indexOf('-o') + 1], 'bad'), duration: async () => { throw new Error('invalid'); } }), /invalid/);
  await absent(join(root, 'audio.mp3'));
});
test('segmentation failures clean temporary files and never trigger single-shot ASR', async t => {
  const root = await temporary(t); await writeFile(join(root, 'audio.mp3'), 'audio');
  await assert.rejects(splitAudioIntoSegments(join(root, 'audio.mp3'), { ffmpeg: { path: '/ffmpeg' } }, 240, async () => { throw new Error('codec failed'); }), /single-shot ASR was not attempted/);
  assert.ok(!(await readdir(root)).some(s => s.startsWith('.segments-')));
  let transcribed = false;
  await assert.rejects(runPipeline('BV1', root, 'key', 'model', false, { probe: async () => ({ playinfo: {} }), find: async () => ({ path: '/tool' }), download: async () => join(root, 'audio.mp3'), duration: async () => 500, split: async () => { throw new Error('split failed'); }, transcribe: async () => { transcribed = true; } }), /split failed/);
  assert.equal(transcribed, false); await absent(join(root, '.skill-ready.json'));
});
test('partial transcripts are saved but fail and never mark ready', async t => {
  const root = await temporary(t), segments = join(root, 'segments'); await mkdir(segments);
  await assert.rejects(runPipeline('BV1', root, 'key', 'model', false, {
    probe: async () => ({ playinfo: { timelength: 500000 } }), find: async () => ({ path: '/tool' }), download: async () => '/audio', duration: async () => 500,
    split: async () => ({ directory: segments, segments: ['one', 'two'] }), transcribe: async file => { if (file === 'two') throw new Error('failed'); return { text: 'first segment', json: { text: 'first segment' } }; }
  }), /Partial transcript/);
  assert.match(await readFile(join(root, 'transcript.txt'), 'utf8'), /\[00:00\] first segment/); await absent(join(root, '.skill-ready.json')); await absent(segments);
});
test('successful mock ASR writes outputs and readiness', async t => {
  const root = await temporary(t);
  await runPipeline('BV1', root, 'key', 'model', false, { probe: async () => ({ playinfo: {} }), find: async () => ({ path: '/tool' }), download: async () => '/audio', duration: async () => 40, transcribe: async () => ({ text: 'mock ASR text', json: { text: 'mock ASR text' } }) });
  assert.equal(await readFile(join(root, 'transcript.txt'), 'utf8'), 'mock ASR text\n'); assert.ok(await readFile(join(root, '.skill-ready.json')));
});
test('real probe parser reads mocked official subtitles without network', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async url => {
    if (url.includes('x/player/v2')) return new Response(JSON.stringify({ data: { subtitle: { subtitles: [{ subtitle_url: 'https://example.test/subtitle' }] } } }));
    if (url.includes('example.test')) return new Response(JSON.stringify({ body: [{ content: 'official text' }] }));
    return { ok: true, status: 200, url: 'https://www.bilibili.com/video/BV1abc', text: async () => '<script>window.__INITIAL_STATE__={"videoData":{"bvid":"BV1abc","cid":1,"title":"test"}};</script>' };
  };
  const result = await probeVideo('BV1abc'); assert.equal(result.subtitle_text, 'official text');
  await assert.rejects(probeVideo('file:///private'), { exitCode: 2 });
});
test('secret values and bearer tokens are redacted', () => { registerSecret('sk-test-secret'); assert.equal(redact('key sk-test-secret Bearer xyz'), 'key [REDACTED] Bearer [REDACTED]'); });
test('ASR uses mocked multipart HTTP and redacts API error bodies', async t => {
  const root = await temporary(t), audio = join(root, 'audio.mp3'); await writeFile(audio, 'mock audio');
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.siliconflow.cn/v1/audio/transcriptions');
    assert.equal(options.method, 'POST'); assert.equal(options.body.get('model'), 'mock-model');
    assert.equal(options.body.get('file').name, 'audio.mp3');
    return new Response(JSON.stringify({ text: 'mock HTTP transcript' }));
  };
  assert.equal((await transcribeWithSiliconFlow(audio, 'sk-mocked-http', 'mock-model')).json.text, 'mock HTTP transcript');
  globalThis.fetch = async () => new Response('bad sk-mocked-http', { status: 401 });
  await assert.rejects(transcribeWithSiliconFlow(audio, 'sk-mocked-http', 'mock-model'), error => /HTTP 401/.test(error.message) && !error.message.includes('sk-mocked-http'));
});
test('failed probe invalidates historical readiness too', async t => {
  const root = await temporary(t); await writeFile(join(root, '.skill-ready.json'), '{}');
  await assert.rejects(runPipeline('BV1', root, '', 'model', false, { probe: async () => { throw new Error('network'); } }), /network/);
  await absent(join(root, '.skill-ready.json'));
});
