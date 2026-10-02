# Read-Bili 🎬 → 📝

将 Bilibili 视频转成文字，供 agent 总结与分析。优先免费官方字幕，无字幕时通过 yt-dlp 下载音频、ffmpeg 处理并调用 SiliconFlow ASR。长视频分段转写，输出时间戳。

## Quick start / 快速开始

Requires Node.js 18+ and npm; current Node LTS is recommended. / 需要 Node.js 18+ 与 npm，推荐当前 LTS。

```sh
git clone https://github.com/EricArcha/Read-Bili.git
cd Read-Bili
npm ci
node src/cli.mjs setup
```

Windows 可用 `powershell -ExecutionPolicy Bypass -File .\install.ps1`；macOS/Linux 可用 `sh install.sh`。入口可从任意目录调用。没有 Node 时只显示安装指引，不自动下载执行远程脚本。

向导展示依赖安装来源与目标，安装缺失工具，允许跳过密钥并多选 Codex、Claude Code、OpenClaw、Hermes。Linux 自动安装支持 Debian/Ubuntu，其他发行版提供手动指引。无需 ASR 时可以跳过向导，直接 probe/run 获取字幕。

```sh
node src/cli.mjs setup --dry-run
node src/cli.mjs doctor --mode subtitle --json
node src/cli.mjs doctor --mode asr
node src/cli.mjs configure key set
node src/cli.mjs configure key status
node src/cli.mjs install-skill --agent codex,claude
node src/cli.mjs run BV1R6PzzAE9k --output-dir ./output
```

## 输出与依赖

- 官方字幕：仅需要 Node 与网络，不需要音频工具或 API Key。
- 音频转写：需要 ffmpeg、ffprobe、yt-dlp 与硅基流动 API Key，可能产生 API 费用。
- 输出：probe_result.json、audio.mp3、transcription_result.json、transcript.txt、成功标记 .skill-ready.json。
- 脚本负责转录；视频总结由调用 skill 的 agent 根据文字稿完成。

默认匿名访问，不自动读取浏览器。反爬失败时可显式添加 `--cookies-from-browser chrome` 或 `--cookies <文件>`，两者互斥。

[安装与密钥配置](docs/setup.md) · [故障排查](docs/troubleshooting.md) · [升级及验证记录](docs/upgrade.md)

## Development

```sh
npm ci
npm test
npm run test:package
npm pack --dry-run
```

保留旧入口 `node src/bilibili_pipeline.mjs probe|run ...`。安装后的 npm 命令为 `read-bili`。从仓库直接使用时不要求全局 npm 安装。

License: MIT. Maintained by EricArcha.
