# Setup Guide

## Required Dependencies

- **Node.js 18+** — runtime
- **yt-dlp** — audio downloading from Bilibili
- **ffmpeg** — audio extraction (fallback path)

### macOS

```bash
brew install node yt-dlp ffmpeg
```

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install -y nodejs npm ffmpeg
pip3 install yt-dlp
```

### Windows

```powershell
winget install OpenJS.NodeJS.LTS
pip install yt-dlp
# Download ffmpeg from https://ffmpeg.org/download.html
```

## SiliconFlow API Key

The tool uses [SiliconFlow's ASR API](https://siliconflow.cn) for audio transcription. You need an API key:

1. Go to https://cloud.siliconflow.cn/me/account/ak
2. Create a new API key
3. Set it as an environment variable:

```bash
# macOS / Linux
export SILICONFLOW_API_KEY="sk-your-key-here"
```

```powershell
# Windows PowerShell
$env:SILICONFLOW_API_KEY="sk-your-key-here"
```

### Persistent Configuration

Add the export line to your shell profile (`~/.zshrc`, `~/.bashrc`, etc.):

```bash
echo 'export SILICONFLOW_API_KEY="sk-your-key-here"' >> ~/.zshrc
source ~/.zshrc
```

## Verify Installation

```bash
node --version          # Should be v18+
yt-dlp --version        # Should print a version
ffmpeg -version         # Should print version info
echo $SILICONFLOW_API_KEY  # Should not be empty
```

## Run a Quick Test

```bash
cd Read-Bili
node src/bilibili_pipeline.mjs run "https://www.bilibili.com/video/BV1R6PzzAE9k"
```
