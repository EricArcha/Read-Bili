# Read-Bili 🎬➜📝

**Bilibili video transcription & summarization tool.**

A Node.js pipeline that downloads audio from Bilibili videos and transcribes it into readable text using [SiliconFlow ASR](https://siliconflow.cn). Supports official subtitles (zero-cost) as primary path, with audio download + ASR as fallback.

## Features

- **Official subtitles preferred** — if the video has built-in subtitles, they're used directly (free, fast)
- **Audio ASR fallback** — no subtitles? Downloads audio via [yt-dlp](https://github.com/yt-dlp/yt-dlp) and transcribes via SiliconFlow's `TeleSpeechASR` model
- **Long-video auto-segmentation** — audio longer than 180s is split into 240s chunks and transcribed segment-by-segment, with `[mm:ss]` timestamps in the output — no more silent 169-second truncation
- **Duration validation** — `ffprobe` checks the downloaded audio against the video's expected length and warns if the download looks incomplete
- **Automatic retry** — each ASR segment retries with exponential backoff (3 attempts) on transient failures
- **Probe mode** — inspect video metadata (title, BV, subtitles, audio/video streams) without downloading
- **Structured output** — saves probe results (`probe_result.json`), transcription data (`transcription_result.json`), and plain text (`transcript.txt`)

## Features (中文)

- **官方字幕优先** — 视频自带字幕时直接使用（免费、快速）
- **音频 ASR 兜底** — 无字幕时通过 yt-dlp 下载音频，调用硅基流动 `TeleSpeechASR` 转写
- **长视频自动分段** — 音频超过 180 秒自动切成 240 秒/段逐段转写，输出带 `[mm:ss]` 时间戳，彻底解决 169 秒静默截断
- **音频完整性校验** — 用 ffprobe 验证下载音频时长与视频预期时长是否匹配，下载不完整会告警
- **失败自动重试** — 每段 ASR 指数退避重试 3 次，应对瞬时故障
- **探测模式** — 不下载即可查看视频元数据（标题/BV/字幕/音视频流）
- **结构化输出** — 保存 probe 结果、转写 JSON、纯文本三种文件

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) — for audio downloading
- [ffmpeg](https://ffmpeg.org/) — for audio extraction (fallback path)
- A [SiliconFlow](https://cloud.siliconflow.cn/me/account/ak) API key (for ASR transcription)

### Quick Install

```bash
# macOS
brew install node yt-dlp ffmpeg

# Ubuntu/Debian
sudo apt update && sudo apt install -y nodejs npm ffmpeg
pip3 install yt-dlp
```

## Setup

```bash
# Clone the repo
git clone https://github.com/EricArcha/Read-Bili.git
cd Read-Bili

# Set your SiliconFlow API key (get one at https://cloud.siliconflow.cn/me/account/ak)
export SILICONFLOW_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

## Usage

### Probe — inspect video metadata

```bash
node src/bilibili_pipeline.mjs probe "https://www.bilibili.com/video/BV1R6PzzAE9k"
```

Outputs to `./output/probe_result.json` and prints transcript if official subtitles exist.

### Run — full pipeline (download + transcribe)

```bash
node src/bilibili_pipeline.mjs run "https://www.bilibili.com/video/BV1R6PzzAE9k"
```

Full pipeline flow:

1. **Probe** the video page — extract metadata, check for subtitles
2. **Has subtitles?** → save subtitle text directly, done
3. **No subtitles?** → download audio via yt-dlp
4. **Transcribe** audio via SiliconFlow ASR (`TeleAI/TeleSpeechASR`)
5. **Output** — saves to `output/`:
   - `probe_result.json` — page metadata & detected streams
   - `audio.mp3` — downloaded audio
   - `transcription_result.json` — ASR API response
   - `transcript.txt` — final readable transcript

### Custom output directory

```bash
node src/bilibili_pipeline.mjs run "BV1R6PzzAE9k" --output-dir ./my-output
```

### Use a different ASR model

```bash
node src/bilibili_pipeline.mjs run "BV1R6PzzAE9k" --model "TeleAI/TeleSpeechASR"
```

### Pass API key inline (instead of env var)

```bash
node src/bilibili_pipeline.mjs run "https://b23.tv/lsocHNd" --api-key "sk-xxx"
```

## Output Structure

```
output/
├── probe_result.json          # Video metadata & stream info
├── audio.mp3                  # Downloaded audio (if no subtitles)
├── transcription_result.json  # SiliconFlow ASR response
├── transcript.txt             # Final readable transcript
└── .skill-ready.json          # Cached readiness marker
```

## How It Works

```
Bilibili URL
     │
     ▼
┌─────────────┐
│   Probe     │──extract metadata, subtitles, playinfo
└──────┬──────┘
       │
       ▼
┌─────────────────┐     yes     ┌──────────────────┐
│ Has subtitles?  │────────────►│  Save subtitles   │──► transcript.txt
└────────┬────────┘             └──────────────────┘
         │ no
         ▼
┌─────────────────┐
│ yt-dlp download │── audio.mp3
└────────┬────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ SiliconFlow ASR  │────►│ transcription    │──► transcript.txt
└──────────────────┘     └──────────────────┘
```

## Script Reference

| Command | Description |
|---------|-------------|
| `probe <url>` | Inspect video metadata and check for subtitles |
| `run <url>` | Full pipeline: download + transcribe + output |
| `--output-dir <path>` | Custom output directory (default: `./output`) |
| `--api-key <key>` | SiliconFlow API key (overrides env var) |
| `--model <model>` | ASR model name (default: `TeleAI/TeleSpeechASR`) |

## Limitations

- **Audio availability**: Some videos may have restricted audio streams. In these cases, the tool will report the issue and suggest alternative approaches.
- **ASR quality**: Transcription accuracy depends on SiliconFlow's ASR model quality. Clear speech with minimal background noise yields the best results.
- **Rate limits**: Both Bilibili and SiliconFlow may impose rate limits on rapid consecutive requests.

## Contributing

Contributions are welcome! Please open an issue or pull request.

## License

[MIT](LICENSE)

---

## Install as an Agent Skill (OpenClaw / Claude Code / Hermes)

This repo is a universal skill — the root `SKILL.md` carries frontmatter that
OpenClaw, Claude Code, and Hermes all recognize (each reads its own namespace
and ignores the others).

### OpenClaw

```bash
openclaw skills install git:EricArcha/Read-Bili --global
```

### Claude Code

```bash
mkdir -p ~/.claude/skills/read-bili
git clone --depth 1 https://github.com/EricArcha/Read-Bili.git ~/.claude/skills/read-bili
```

### Hermes

```bash
mkdir -p ~/.hermes/skills/media/read-bili
git clone --depth 1 https://github.com/EricArcha/Read-Bili.git ~/.hermes/skills/media/read-bili
```

> Trigger words (description): B站视频总结 / B站转写 / B站字幕提取 / 视频讲了什么 /
> 帮我解读 / BV号解析 / 视频语音转文字 / 总结这个视频. This skill handles voice
> content transcription & summarization; for danmaku (comment) extraction use
> `bilibili-danmaku-extractor` instead.

## Author

Maintained by **EricArcha (Eric Lei)**.
