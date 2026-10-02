import { createWriteStream, existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, delimiter } from "node:path";
import { pipeline } from "node:stream/promises";
import { runProcess, UsageError, redact, registerSecret, requestSignal, operationSignal } from "./process.mjs";
import { findTool } from "./tools.mjs";

const READY_FILE_NAME = ".skill-ready.json";

function normalizeVideoUrl(value) {
  if (!value) {
    throw new UsageError("Missing Bilibili URL or BV id.");
  }

  if (/^BV[0-9A-Za-z]+$/i.test(value)) {
    return `https://www.bilibili.com/video/${value}`;
  }

  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !(url.hostname === "b23.tv" || url.hostname === "bilibili.com" || url.hostname.endsWith(".bilibili.com"))) throw new Error("Not a Bilibili URL");
    return url.toString();
  } catch {
    throw new UsageError(`Unsupported input: ${value}`);
  }
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

function buildHeaders(extra = {}) {
  return {
    "user-agent": USER_AGENT,
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    referer: "https://www.bilibili.com/",
    ...extra,
  };
}

async function request(url, options, consume, timeout = 30000) {
  const context = requestSignal(timeout);
  try {
    if (context.signal.aborted) throw new Error("Request cancelled");
    const response = await fetch(url, { ...options, signal: context.signal });
    return await consume(response);
  } finally { context.cleanup(); }
}
async function fetchText(url, headers = {}) {
  return request(url, { headers: buildHeaders(headers), redirect: "follow" }, async response => ({
    ok: response.ok, status: response.status, url: response.url, text: await response.text()
  }));
}
async function fetchJson(url, headers = {}) {
  const response = await fetchText(url, { accept: "application/json,text/plain,*/*", ...headers });
  let json = null;
  try { json = JSON.parse(response.text); } catch { /* invalid JSON recorded by probe */ }
  return { ...response, json };
}

function extractJsonBlock(html, token) {
  const start = html.indexOf(token);
  if (start === -1) {
    return null;
  }

  let i = start + token.length;
  while (i < html.length && /\s/.test(html[i])) {
    i += 1;
  }

  if (html[i] !== "{") {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  const begin = i;

  for (; i < html.length; i += 1) {
    const ch = html[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      depth += 1;
      continue;
    }

    if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(begin, i + 1);
      }
    }
  }

  return null;
}

function simplifyPlayInfo(playInfo) {
  if (!playInfo?.data) {
    return {};
  }

  return {
    quality: playInfo.data.quality,
    format: playInfo.data.format,
    timelength: playInfo.data.timelength,
    accept_quality: playInfo.data.accept_quality ?? [],
    accept_description: playInfo.data.accept_description ?? [],
    durl: Array.isArray(playInfo.data.durl)
      ? playInfo.data.durl.map((item) => ({
          size: item.size,
          length: item.length,
          url: item.url,
          backup_url: item.backup_url ?? [],
        }))
      : [],
    dash: {
      video: Array.isArray(playInfo.data.dash?.video)
        ? playInfo.data.dash.video.map((item) => ({
            id: item.id,
            codecid: item.codecid,
            bandwidth: item.bandwidth,
            baseUrl: item.baseUrl ?? item.base_url,
            backupUrl: item.backupUrl ?? item.backup_url ?? [],
            width: item.width,
            height: item.height,
          }))
        : [],
      audio: Array.isArray(playInfo.data.dash?.audio)
        ? playInfo.data.dash.audio.map((item) => ({
            id: item.id,
            bandwidth: item.bandwidth,
            baseUrl: item.baseUrl ?? item.base_url,
            backupUrl: item.backupUrl ?? item.backup_url ?? [],
          }))
        : [],
    },
  };
}

function normalizeSubtitleUrl(value) {
  if (!value) {
    return null;
  }
  if (value.startsWith("//")) {
    return `https:${value}`;
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value.replace(/^\/+/, "")}`;
}

function readyFilePath(outputDir) {
  return resolve(outputDir, READY_FILE_NAME);
}

async function markReady(outputDir, apiKeyFound) {
  const payload = {
    version: 1,
    created_at: new Date().toISOString(),
    node_version: process.versions.node,
    api_key_found: Boolean(apiKeyFound),
  };
  await writeFile(readyFilePath(outputDir), JSON.stringify(payload, null, 2), "utf8");
}

export async function probeVideo(inputUrl) {
  const videoUrl = normalizeVideoUrl(inputUrl);
  const page = await fetchText(videoUrl);
  if (!page.ok) throw new Error(`Bilibili page failed: HTTP ${page.status}. If blocked, supply explicit cookies for audio download.`);

  const result = {
    input: inputUrl,
    requested_url: videoUrl,
    final_page_url: page.url,
    page_status: page.status,
    title: null,
    bvid: null,
    aid: null,
    cid: null,
    subtitles: [],
    subtitle_text: null,
    playinfo: {},
    errors: [],
  };

  const initialStateRaw =
    extractJsonBlock(page.text, "window.__INITIAL_STATE__=") ??
    extractJsonBlock(page.text, "__INITIAL_STATE__=");
  const playInfoRaw =
    extractJsonBlock(page.text, "window.__playinfo__=") ??
    extractJsonBlock(page.text, "__playinfo__=");

  if (initialStateRaw) {
    try {
      const initialState = JSON.parse(initialStateRaw);
      result.title = initialState?.videoData?.title ?? null;
      result.bvid = initialState?.bvid ?? initialState?.videoData?.bvid ?? null;
      result.aid = initialState?.aid ?? initialState?.videoData?.aid ?? null;
      const pages = initialState?.videoData?.pages ?? [];
      result.cid = pages[0]?.cid ?? initialState?.videoData?.cid ?? null;
    } catch (error) {
      result.errors.push(`Failed to parse __INITIAL_STATE__: ${error.message}`);
    }
  } else {
    result.errors.push("Page does not contain __INITIAL_STATE__.");
  }

  if (!result.bvid) {
    const match = page.url.match(/\/video\/(BV[0-9A-Za-z]+)/i);
    if (match) {
      result.bvid = match[1];
    }
  }

  if (playInfoRaw) {
    try {
      result.playinfo = simplifyPlayInfo(JSON.parse(playInfoRaw));
    } catch (error) {
      result.errors.push(`Failed to parse __playinfo__: ${error.message}`);
    }
  }

  if (result.bvid && result.cid) {
    const subtitleApi = `https://api.bilibili.com/x/player/v2?bvid=${encodeURIComponent(
      result.bvid
    )}&cid=${encodeURIComponent(result.cid)}`;
    const subtitleResponse = await fetchJson(subtitleApi);
    const subtitleItems = subtitleResponse.json?.data?.subtitle?.subtitles ?? [];
    result.subtitles = subtitleItems.map((item) => ({
      id: item.id,
      lan: item.lan,
      lan_doc: item.lan_doc,
      subtitle_url: normalizeSubtitleUrl(item.subtitle_url),
    }));

    if (result.subtitles.length > 0) {
      const subtitleUrl = result.subtitles[0].subtitle_url;
      const subtitleFile = await fetchJson(subtitleUrl, { referer: page.url });
      const body = subtitleFile.json?.body ?? [];
      if (Array.isArray(body) && body.length > 0) {
        result.subtitle_text = body
          .map((item) => String(item.content ?? "").trim())
          .filter(Boolean)
          .join("\n");
      }
    }
  }

  return result;
}

function pickBestAudio(playinfo) {
  const audios = Array.isArray(playinfo?.dash?.audio) ? [...playinfo.dash.audio] : [];
  if (audios.length === 0) {
    return null;
  }
  audios.sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return audios[0];
}

function pickBestVideo(playinfo) {
  const videos = Array.isArray(playinfo?.dash?.video) ? [...playinfo.dash.video] : [];
  if (videos.length === 0) {
    return null;
  }
  // Prefer 720p-1080p range to balance quality vs size; fall back to highest
  const preferred = videos.find((v) => v.width >= 1280 && v.width <= 1920);
  if (preferred) return preferred;
  const sorted = [...videos].sort((a, b) => (b.bandwidth ?? 0) - (a.bandwidth ?? 0));
  return sorted[0];
}

async function downloadToFile(url, outputPath, referer) {
  await request(url, { headers: buildHeaders({ accept: "*/*", referer }), redirect: "follow" }, async response => {
    if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
    await mkdir(dirname(outputPath), { recursive: true });
    await pipeline(response.body, createWriteStream(outputPath));
  }, 300000);
}

export async function extractAudioFromVideo(videoPath, audioPath, tools) {
  await runProcess(tools.ffmpeg.path, ["-y", "-i", videoPath, "-vn", "-acodec", "libmp3lame", "-q:a", "2", audioPath]);
  if (!(await stat(audioPath)).size) throw new Error("ffmpeg produced empty audio");
}

function emitResult(summary, transcriptText) {
  console.log(redact(JSON.stringify(summary, null, 2)));
  if (typeof transcriptText === "string" && transcriptText.trim()) {
    console.log("\n===TRANSCRIPT===\n");
    console.log(transcriptText);
  }
}

export async function transcribeWithSiliconFlow(filePath, apiKey, model) {
  if (!apiKey) {
    throw new Error(
      `Missing SiliconFlow API key. Set SILICONFLOW_API_KEY or pass --api-key <key>.
       Get a key at https://cloud.siliconflow.cn/me/account/ak`
    );
  }
  registerSecret(apiKey);

  const buffer = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", model);

  return request("https://api.siliconflow.cn/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form,
  }, async response => {
    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON API response */ }
    if (!response.ok) throw new Error(`SiliconFlow transcription failed: HTTP ${response.status} ${redact(text)}`);
    return { status: response.status, json, rawText: text };
  }, 120000);
}

/**
 * Probe audio duration with ffprobe. Returns seconds (float) or null on failure.
 */
export async function probeAudioDuration(filePath, tools) {
  const out = await runProcess(tools.ffprobe.path, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", filePath], { timeout: 15000 });
  const duration = Number.parseFloat(out.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("Could not determine audio duration; refusing potentially truncated ASR.");
  return duration;
}

export async function splitAudioIntoSegments(filePath, tools, segmentSeconds = 240, execute = runProcess) {
  const directory = await mkdtemp(resolve(dirname(filePath), ".segments-"));
  try {
    await execute(tools.ffmpeg.path, ["-y", "-i", filePath, "-f", "segment", "-segment_time", String(segmentSeconds), "-c:a", "libmp3lame", "-q:a", "2", "-segment_format", "mp3", resolve(directory, "audio%03d.mp3")], { timeout: 600000 });
    const segments = [];
    for (let i = 0; ; i++) {
      const path = resolve(directory, `audio${String(i).padStart(3, "0")}.mp3`);
      if (!existsSync(path)) break;
      if (!(await stat(path)).size) throw new Error("Empty audio segment");
      segments.push(path);
    }
    if (!segments.length) throw new Error("No audio segments were produced");
    return { segments, directory };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw new Error(`Audio segmentation failed; single-shot ASR was not attempted: ${error.message}`);
  }
}

export async function requireAudioTools(apiKey, options = {}) {
  if (!apiKey) throw new Error(options.keyWarning || "Missing SiliconFlow API key. Run read-bili configure key set or set SILICONFLOW_API_KEY. Official subtitle mode remains available.");
  const tools = {};
  for (const name of ["ffmpeg", "ffprobe", "yt-dlp"]) {
    const tool = await (options.find || findTool)(name);
    if (!tool) throw new Error(`Missing ${name}. Run read-bili doctor or read-bili setup before audio transcription.`);
    tools[name] = tool;
  }
  return tools;
}

export async function downloadAudio(url, result, outputDir, tools, options = {}) {
  const temporary = await mkdtemp(resolve(outputDir, ".download-"));
  const audioPath = resolve(temporary, "audio.mp3");
  const execute = options.execute || runProcess;
  try {
    const audio = pickBestAudio(result.playinfo);
    if (audio?.baseUrl && !options.forceVideoFallback && !options.cookies && !options.cookiesFromBrowser) {
      const inputPath = resolve(temporary, "audio.m4s");
      try {
        await downloadToFile(audio.baseUrl, inputPath, result.final_page_url);
        await execute(tools.ffmpeg.path, ["-y", "-i", inputPath, "-vn", "-acodec", "libmp3lame", "-q:a", "2", audioPath]);
      } catch (error) {
        await rm(audioPath, { force: true });
        options.note?.(`Direct audio download failed; trying yt-dlp: ${redact(error.message)}`);
      }
    }
    if (!existsSync(audioPath)) {
      const args = ["-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", audioPath];
      if (options.forceVideoFallback) args.push("-f", "bestvideo+bestaudio/best");
      if (options.cookies) args.push("--cookies", options.cookies);
      if (options.cookiesFromBrowser) args.push("--cookies-from-browser", options.cookiesFromBrowser);
      args.push("--", normalizeVideoUrl(url));
      const env = { ...process.env };
      const originalPath = env.PATH || env.Path || '';
      for (const key of Object.keys(env)) if (key.toUpperCase() === 'PATH') delete env[key];
      env.PATH = [dirname(tools.ffmpeg.path), dirname(tools.ffprobe?.path || tools.ffmpeg.path), originalPath].join(delimiter);
      try { await execute(tools["yt-dlp"].path, args, { timeout: 300000, env }); }
      catch (error) { throw new Error(`yt-dlp failed: ${error.message}. If Bilibili returns 412, pass --cookies-from-browser <browser> or --cookies <file>.`); }
    }
    if (!(await stat(audioPath)).size) throw new Error("Download produced an empty audio file");
    await (options.duration || probeAudioDuration)(audioPath, tools);
    const final = resolve(outputDir, "audio.mp3");
    await rm(final, { force: true });
    await rename(audioPath, final);
    return final;
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

/**
 * Transcribe one audio file with exponential backoff retry (3 attempts).
 * Returns { text, json } or throws after exhausting retries.
 */
async function transcribeSingleWithRetry(filePath, apiKey, model, label = "") {
  const maxAttempts = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await transcribeWithSiliconFlow(filePath, apiKey, model);
      const text = result.json?.text;
      if (typeof text === "string" && text.trim()) {
        return { text: text.trim(), json: result.json };
      }
      throw new Error("Empty transcript returned");
    } catch (error) {
      if (operationSignal().aborted) throw new Error("Transcription cancelled");
      lastError = error;
      if (attempt < maxAttempts) {
        const delayMs = 1000 * 2 ** (attempt - 1); // 1s, 2s
        process.stderr.write(`[asr] ${label} attempt ${attempt} failed (${redact(error.message)}); retrying in ${delayMs}ms\n`);
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError ?? new Error("Transcription failed");
}

/**
 * Format seconds as [mm:ss] timestamp marker.
 */
function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
}

export async function runProbe(url, outputDir, apiKey, options = {}) {
  const result = await (options.probe || probeVideo)(url);
  await mkdir(outputDir, { recursive: true });
  const out = resolve(outputDir, "probe_result.json");
  await writeFile(out, JSON.stringify(result, null, 2), "utf8");
  emitResult(
    {
      saved: out,
      ready_file: readyFilePath(outputDir),
      title: result.title,
      bvid: result.bvid,
      cid: result.cid,
      subtitleCount: result.subtitles.length,
      hasAudio: Boolean(pickBestAudio(result.playinfo)),
      hasVideo: Boolean(pickBestVideo(result.playinfo)),
    },
    result.subtitle_text
  );
}

export async function runPipeline(url, outputDir, apiKey, model, forceVideoFallback, options = {}) {
  await mkdir(outputDir, { recursive: true });
  await rm(readyFilePath(outputDir), { force: true });
  const result = await (options.probe || probeVideo)(url);
  const probePath = resolve(outputDir, "probe_result.json");
  await writeFile(probePath, JSON.stringify(result, null, 2), "utf8");

  const summary = {
    probe_path: probePath,
    ready_file: readyFilePath(outputDir),
    title: result.title,
    subtitle_used: false,
    transcript_path: null,
    audio_mp3_path: null,
    transcription_json_path: null,
    notes: [],
  };

  // Path 1: Official subtitle
  if (result.subtitle_text) {
    const transcriptPath = resolve(outputDir, "transcript.txt");
    await writeFile(transcriptPath, `${result.subtitle_text}\n`, "utf8");
    summary.subtitle_used = true;
    summary.transcript_path = transcriptPath;
    summary.notes.push("Used official subtitle text, so no transcription API call was needed.");
    await markReady(outputDir, apiKey);
    emitResult(summary, result.subtitle_text);
    return;
  }

  const tools = await requireAudioTools(apiKey, options);
  summary.audio_mp3_path = await (options.download || downloadAudio)(url, result, outputDir, tools, { ...options, forceVideoFallback, note: note => summary.notes.push(note) });
  summary.notes.push("Audio validated and converted to MP3.");

  // --- Step A: validate downloaded audio duration against expected video length ---
  const expectedDurationMs = Number(result.playinfo?.timelength) || null;
  const actualDuration = await (options.duration || probeAudioDuration)(summary.audio_mp3_path, tools);
  if (expectedDurationMs && actualDuration) {
    const expectedSec = expectedDurationMs / 1000;
    const gap = expectedSec - actualDuration;
    if (gap > expectedSec * 0.15) {
      summary.notes.push(
        `WARN: audio duration ${actualDuration.toFixed(0)}s is ${(gap / expectedSec * 100).toFixed(0)}% shorter than video ${expectedSec.toFixed(0)}s — download likely incomplete.`
      );
    } else {
      summary.notes.push(`Audio duration verified: ${actualDuration.toFixed(0)}s (video ${expectedSec.toFixed(0)}s).`);
    }
  } else if (actualDuration) {
    summary.notes.push(`Audio duration: ${actualDuration.toFixed(0)}s (no reference video duration).`);
  } else {
    summary.notes.push("WARN: could not probe audio duration.");
  }

  // --- Step B: segment long audio (>180s) into 240s chunks ---
  const SEGMENT_SECONDS = 240;
  const SEGMENT_THRESHOLD = 180;
  let segments = null;
  let segmentDirectory;
  if (actualDuration && actualDuration > SEGMENT_THRESHOLD) {
    summary.notes.push(`Audio is ${actualDuration.toFixed(0)}s (>${SEGMENT_THRESHOLD}s), splitting into ${SEGMENT_SECONDS}s segments.`);
    const split = await (options.split || splitAudioIntoSegments)(summary.audio_mp3_path, tools, SEGMENT_SECONDS);
    segments = split.segments;
    segmentDirectory = split.directory;
    summary.notes.push(`Split into ${segments.length} segments.`);
  }

  // --- Step C: transcribe (segmented w/ timestamps, or single) with retry ---
  const transcriptionJsonPath = resolve(outputDir, "transcription_result.json");
  const allSegmentTexts = [];
  const allSegmentResults = [];

  let segmentFailures = 0;
  try {
  if (segments) {
    for (let i = 0; i < segments.length; i += 1) {
      const segPath = segments[i];
      const segStartSec = i * SEGMENT_SECONDS;
      try {
        const r = await (options.transcribe || transcribeSingleWithRetry)(segPath, apiKey, model, `seg${i + 1}/${segments.length}`);
        allSegmentResults.push(r.json ?? {});
        if (r.text) {
          allSegmentTexts.push(`${formatTimestamp(segStartSec)} ${r.text}`);
        }
      } catch (segError) {
        segmentFailures++;
        summary.notes.push(`WARN: segment ${i + 1}/${segments.length} failed after retries: ${redact(segError.message)}`);
      }
    }
  } else {
    const r = await (options.transcribe || transcribeSingleWithRetry)(summary.audio_mp3_path, apiKey, model, "full");
    allSegmentResults.push(r.json ?? {});
    if (r.text) {
      allSegmentTexts.push(r.text);
    }
  }

  } finally {
    if (segmentDirectory) await rm(segmentDirectory, { recursive: true, force: true });
  }

  summary.transcription_json_path = transcriptionJsonPath;
  await writeFile(
    transcriptionJsonPath,
    JSON.stringify({ segments: allSegmentResults, combined: allSegmentTexts.join("\n") }, null, 2),
    "utf8"
  );

  const transcriptText = allSegmentTexts.join("\n");
  if (transcriptText.trim()) {
    const transcriptPath = resolve(outputDir, "transcript.txt");
    await writeFile(transcriptPath, `${transcriptText}\n`, "utf8");
    summary.transcript_path = transcriptPath;
    summary.segment_count = segments && segments.length > 1 ? segments.length : 1;
  } else {
    summary.notes.push("SiliconFlow returned no usable text field.");
  }

  if (transcriptText.trim() && segmentFailures === 0) await markReady(outputDir, true);
  emitResult(summary, transcriptText);
  if (segmentFailures) throw new Error("Partial transcript saved: one or more segments failed. Readiness was not marked.");
  if (!transcriptText.trim()) throw new Error("ASR returned no usable transcript.");
}
