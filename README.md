# Read-Bili 🎬➜📝

**Bilibili video transcription & summarization tool.**

A Node.js pipeline that downloads audio from Bilibili videos and transcribes it into readable text using [SiliconFlow ASR](https://siliconflow.cn). Supports official subtitles (zero-cost) as primary path, with audio download + ASR as fallback.

## Features

- **Official subtitles preferred** — if the video has built-in subtitles, they're used directly (free, fast)
- **Audio ASR fallback** — no subtitles? Downloads audio via [yt-dlp](https://github.com/yt-dlp/yt-dlp) and transcribes via SiliconFlow's `TeleSpeechASR` model
- **Probe mode** — inspect video metadata (title, BV, subtitles, audio/video streams) without downloading
- **Structured output** — saves probe results (`probe_result.json`), transcription data (`transcription_result.json`), and plain text (`transcript.txt`)

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
