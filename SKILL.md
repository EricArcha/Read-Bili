---
name: read-bili
description: 将 B 站视频转录、提取字幕并总结。当用户提供 Bilibili 链接、BV 号或 b23.tv 短链，并要求获取视频内容、台词、要点、总结或分析时使用。专注视频语音内容，不用于弹幕分析。
license: MIT
metadata:
  version: "1.2.1"
  author: EricArcha
  openclaw:
    homepage: https://github.com/EricArcha/Read-Bili
    requires:
      bins: [node]
  hermes:
    tags: [bilibili, transcription, subtitles, video]
    category: media
---

# Read-Bili

优先官方字幕；无字幕时下载音频并通过硅基流动 ASR 转写。总结由调用本 skill 的 agent 根据文字稿完成，脚本不调用摘要 API。

## 调用

定位本 SKILL.md 所在目录，以该目录中 src/cli.mjs 的绝对路径调用，不依赖当前工作目录。输出目录使用当前任务中明确指定的可写路径，不写入 skill 安装目录。

开始时核对安装目录的 package.json、CLI --help 和 SKILL.md 版本。仓库已升级不代表 Codex 安装已更新；更新后核验实际目标路径与版本。不要绕过新版 CLI 回到旧脚本、自行降级为不分段转写或把失败退出当作成功。

```text
node <skill目录>/src/cli.mjs probe <B站链接或BV号> --output-dir <任务输出目录>
node <skill目录>/src/cli.mjs run <B站链接或BV号> --output-dir <任务输出目录>
node <skill目录>/src/cli.mjs doctor --mode subtitle --json
node <skill目录>/src/cli.mjs doctor --mode asr --json
```

仅探测和官方字幕不要求 API Key 或音频工具。ASR 缺少依赖时运行 doctor 并解释修复建议；安装及密钥配置按 [安装文档](docs/setup.md) 操作。不要让用户在对话中发送密钥，不要输出环境变量中的密钥值。

密钥“存在”、本地格式通过、保存可读和服务端授权成功是不同状态。用户说已配置时先诊断来源及格式，不重复要求配置；环境变量会覆盖凭据库。格式异常时停止 ASR，不输出密钥片段、不自动删除或迁移已有配置。Windows 的 .ps1 指引使用安装文档中的单次进程 ExecutionPolicy 命令，不要求永久放宽系统策略；组策略阻止时停止并提供 Node CLI 路径，不反复尝试绕过。

默认不读取浏览器 cookies。遇到 412 时解释 --cookies-from-browser <browser> 或 --cookies <file>，由用户显式选择后再使用。

## 输出与回复

读取 transcript.txt；用户要求完整转录则提供文字稿或文件，要求重点分析则围绕该部分，未特别要求则总结重点。说明文字来源是官方字幕还是音频 ASR，以及是否分段。

probe_result.json 保存探测信息，transcription_result.json 保存分段和合并文字。不要将历史输出文件视为本次成功。仅有效且完整的文字稿会生成 .skill-ready.json。

失败、音频不完整警告或部分分段失败时如实说明；部分文字稿不得包装成完整视频总结。参考 [故障排查](docs/troubleshooting.md)。

仅标题、简介和评论不能替代视频内容总结。无有效完整文字稿时明确“视频总结未完成”，保留已取得的材料并说明具体阻塞；初步分析必须标明证据范围。用户在中途排障或升级技能时，保留原视频任务，恢复后继续执行。

商单分析区分品牌付费合作、联盟带货和推测。商品联盟链接只能支持导购利益关联，不能证明品牌商单；网友质疑、文案风格和热度异常不能证明水军。涉及口播的结论引用文字稿位置，ASR 分段时间是段落起点，不能冒充精确句子时间。
