---
name: read-bili
description: |
  将B站视频转成文字并总结（B站视频转录、字幕提取、内容总结）。当用户提供B站视频链接、BV号或 b23.tv 短链，并想获取视频内容、台词文本、字幕内容、视频总结、视频要点、AI解读视频、分析视频内容时使用。
  触发词：B站视频总结、B站转写、B站字幕提取、视频讲了什么、帮我解读、BV号解析、bilibili视频总结、b站视频内容、视频语音转文字、总结这个视频、这个视频在讲什么。
  与 bilibili-danmaku-extractor（弹幕提取/弹幕分析）区分：本 skill 专注视频语音内容的转录与总结 —— 优先官方字幕，其次 yt-dlp 下载音频 + 硅基流动 ASR 转写；支持长视频自动分段（240s/段）、音频完整性校验、失败指数退避重试，输出带 [mm:ss] 时间戳。
version: 1.1.0
author: EricArcha (Eric Lei)
license: MIT
platforms: [macos, linux, windows]
metadata:
  openclaw:
    homepage: https://github.com/EricArcha/Read-Bili
    primaryEnv: SILICONFLOW_API_KEY
    requires:
      bins: [node, ffmpeg, ffprobe, yt-dlp]
      env: []
  hermes:
    tags: [bilibili, transcription, asr, subtitles, video, 视频转录, 视频总结]
    category: media
prerequisites:
  commands: [node, ffmpeg, ffprobe, yt-dlp]
---

# Read-Bili — B站视频转录与总结

将 B 站视频转成文字并总结。官方字幕优先（零成本），无字幕时用 yt-dlp 下载音频 + 硅基流动（SiliconFlow）ASR 转写。长视频自动分段，彻底解决旧版 169 秒静默截断。

## 触发条件

满足以下两点时触发：

- 用户输入 B 站标准链接、`BV...` 号，或 `https://b23.tv/...` 短链。
- 用户意图是转录、提取字幕、总结、分析视频内容（含「视频讲了什么」「帮我解读」「总结这个视频」等表达）。

**与弹幕提取 skill 的区分**：弹幕（评论性文字）提取请用 `bilibili-danmaku-extractor`；本 skill 专注视频**语音内容**的转录与总结。

## 依赖

- Node.js 18+
- ffmpeg / ffprobe（音频提取、时长校验、分段）
- yt-dlp（音频下载，需要时用浏览器 cookies 绕过 B站 412）
- `SILICONFLOW_API_KEY`（ASR 转写）—— 可在 https://cloud.siliconflow.cn/me/account/ak 获取

## 工作流程

1. 检查依赖（node/ffmpeg/ffprobe/yt-dlp）与 API key。
2. 运行 `node src/bilibili_pipeline.mjs run <url>`（完整流程）或 `probe`（仅探测）。

**路径 1 — 官方字幕（零成本，首选）**：probe 自动请求字幕 API，有官方字幕直接使用。

**路径 2 — yt-dlp 下载音频 + ASR**：无字幕时，yt-dlp（优先浏览器 cookies 绕过 412，失败降级匿名）下载音频为 mp3。

**路径 3 — 长视频自动分段**：音频 >180s 自动切 240s/段，逐段 ASR，输出带 `[mm:ss]` 时间戳拼接 —— 解决 169 秒静默截断。

**路径 4 — 完整性校验 + 重试**：ffprobe 校验音频实际时长 vs 视频 timelength，缺口 >15% 告警；每段 ASR 指数退避重试 3 次（1s/2s）。

## 常用命令

```bash
# 只探测（不下载）
node src/bilibili_pipeline.mjs probe "BV1R6PzzAE9k" --output-dir ./output

# 完整执行（下载 + 转写 + 总结）
node src/bilibili_pipeline.mjs run "https://www.bilibili.com/video/BV1R6PzzAE9k" --output-dir ./output

# 指定模型 / 内联 API key / 自定义输出目录
node src/bilibili_pipeline.mjs run "BV1R6PzzAE9k" --model "TeleAI/TeleSpeechASR" --api-key "sk-xxx" --output-dir ./my-output

# 短链接
node src/bilibili_pipeline.mjs run "https://b23.tv/lsocHNd" --output-dir ./output
```

## 输出文件

写入输出目录：

- `probe_result.json` — 页面解析结果、字幕信息、音视频流
- `audio.mp3` — 下载的音频（无字幕时）
- `transcription_result.json` — 转写结果（分段 JSON + combined 文本）
- `transcript.txt` — 最终可读文字稿（分段时带 `[mm:ss]` 时间戳）
- `.skill-ready.json` — 输出目录成功跑通过的标记

成功拿到文字稿时，脚本会把 transcript 打印到 stdout。

## 回复规则

- 用户要求完整转录 → 输出完整文字或引用 `transcript.txt`。
- 用户要求重点分析 → 只围绕该部分总结。
- 未特别要求 → 默认重点总结。
- 说明文字来源：官方字幕 / 音频 ASR（是否分段）。
- 出现 `BLOCKED` 或告警（音频不完整/分段失败）时如实说明，列出可选的下一步。

## Agent 安装方式

**OpenClaw**：
```bash
openclaw skills install git:EricArcha/Read-Bili --global
```

**Claude Code**：
```bash
mkdir -p ~/.claude/skills/read-bili
git clone --depth 1 https://github.com/EricArcha/Read-Bili.git ~/.claude/skills/read-bili
# 或拷贝仓库内容到 ~/.claude/skills/read-bili/
```

**Hermes**：
```bash
mkdir -p ~/.hermes/skills/media/read-bili
git clone --depth 1 https://github.com/EricArcha/Read-Bili.git ~/.hermes/skills/media/read-bili
```

## 说明

- 本 skill 的升级版由 EricArcha（Eric Lei）维护：https://github.com/EricArcha/Read-Bili
- 依赖 B站网页结构 & yt-dlp 维护；B站反爬升级时可能需要浏览器 cookies（`--cookies-from-browser chrome`）。