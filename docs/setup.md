# 安装与配置 / Setup

## 平台支持

首版目标：Windows x64（PowerShell 5.1/7）、macOS Intel/Apple Silicon、Ubuntu x64。Node.js 18+ 与 npm 为入口要求，推荐当前 LTS。Windows `install.ps1` 和 POSIX `install.sh` 都按自身位置定位脚本。

先执行 `npm ci` 安装锁定的可选凭据库依赖。省略 optional dependencies 时环境变量及字幕仍可使用。

```sh
node src/cli.mjs setup --dry-run
node src/cli.mjs setup
```

`--dry-run` 只读取并展示诊断和安装计划。交互向导允许跳过密钥和 agent 安装。自动化使用 `setup --yes --skip-key --agent codex`；--yes 不产生密钥、不获取 sudo 权限、不隐式更新已有 skill。

Windows：winget 安装 Gyan.FFmpeg 和 yt-dlp.yt-dlp，后者可能带其软件包声明的依赖。macOS：使用已有 Homebrew，不自动安装 Homebrew。Debian/Ubuntu：使用 apt-get；非 root 用户会收到 sudo 安装命令，由用户自己运行后重新执行向导。其他发行版显示手动指引。

Windows PowerShell 默认执行策略可能拒绝直接运行 `.ps1`。在自己的终端使用单次进程设置（替换为实际绝对路径）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\path\read-bili\install.ps1" --dry-run
```

这不永久修改执行策略。企业组策略仍可覆盖此设置；被组策略阻止时使用 `node C:\path\read-bili\src\cli.mjs setup --dry-run`，不要修改组策略或全局 ExecutionPolicy。

缺少 Node 的入口会给出安装命令。apt 的 Node 版本由发行版决定；安装后确认 `node --version` >=18，不满足时从 nodejs.org 获取受支持版本。

安装中断可重跑，已检测到的工具不会重新安装。已打开终端或 agent 可能需要重开以刷新 PATH；Read-Bili 同时探测常见用户安装目录。

## 诊断和工具路径

```sh
node src/cli.mjs doctor --mode subtitle
node src/cli.mjs doctor --mode asr --json
```

默认 doctor 模式为 asr。JSON 包含 schemaVersion/platform/mode/checks/ready；检查项包含 name/status/version/path/repair，密钥项仅含来源，不含值。doctor 不访问 B 站，不验证密钥有效性、不产生 API 费用。

工具查找：显式环境变量 → PATH → 常见用户目录。显式路径无效时直接诊断失败，不静默使用其他版本。

- READ_BILI_FFMPEG：ffmpeg 可执行文件路径。
- READ_BILI_FFPROBE：ffprobe 可执行文件路径。
- READ_BILI_YT_DLP：yt-dlp 可执行文件路径。

## 密钥

在 https://cloud.siliconflow.cn/me/account/ak 创建密钥。在自己的终端执行：

```sh
node src/cli.mjs configure key set
node src/cli.mjs configure key status
node src/cli.mjs configure key delete
```

set 隐藏输入，存入 Windows Credential Manager/macOS Keychain/Linux Secret Service；不保存明文配置文件。Linux 需要已解锁的桌面 Secret Service，headless 环境请使用环境变量；不使用重启即消失的内存 keyring。安装或解锁失败会明确提示。

配置前检查完整 token 的本地格式：至少 20 个可打印 ASCII 字符，内部无空白；外侧空白会去除。这是合理性检查，不是服务端认证。短值、掩码字符或换行会在写入和 ASR 前被拒绝；凭据库写入后必须读回一致才报告成功。`status` 区分已配置、可读取和格式正常；`doctor` 将异常配置报告为 `invalid`，不输出密钥。

Windows 兼容的用户环境变量配置脚本也随安装包提供。它在用户确认后从剪贴板读取，不回显密钥；请先从官网复制完整 token，再运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\path\read-bili\configure-api-key.ps1"
```

脚本校验格式和用户级持久化读回结果，失败时不报告成功。它不调用 ASR，也不清除剪贴板或更改全局执行策略。新值存入用户环境变量后，已有 agent 仍可能继承旧值，需要完全重启。不要使用带密钥字面量的命令或把密钥发到聊天。

读取优先级：--api-key → SILICONFLOW_API_KEY → 系统凭据库。已有环境变量不会被安装流程修改。参数兼容保留，但命令行可能进入历史，优先使用环境变量或凭据库。不要将密钥发送到聊天或提交到源码仓库。

迁移已有 Windows 用户环境变量：先运行 configure key set 输入同一密钥，再在 PowerShell 中执行：

```powershell
[Environment]::SetEnvironmentVariable('SILICONFLOW_API_KEY', $null, 'User')
Remove-Item Env:SILICONFLOW_API_KEY -ErrorAction SilentlyContinue
```

之后完全重启已有 agent，避免其继承旧环境变量。macOS/Linux 删除自己在 shell 配置中添加的 export 并重新打开终端。configure key delete 只删除 Read-Bili 凭据，不删除环境变量。

非交互任务设置 SILICONFLOW_API_KEY；set 不从 stdin 管道接收秘密，缺少 TTY 时退出。status 仅验证配置可读取，不调用收费服务。

## Agent 安装

```sh
node src/cli.mjs install-skill --agent codex
node src/cli.mjs install-skill --agent codex,claude,openclaw,hermes
node src/cli.mjs install-skill --agent all
node src/cli.mjs install-skill --agent codex --dest <最终skill目录>
node src/cli.mjs install-skill --agent codex --update
```

默认用户级路径：

| Agent | 路径 |
|---|---|
| Codex | $CODEX_HOME/skills/read-bili，未设置时 ~/.codex/skills/read-bili |
| Claude Code | ~/.claude/skills/read-bili |
| OpenClaw | ~/.openclaw/skills/read-bili |
| Hermes | $HERMES_HOME/skills/media/read-bili，未设置时 ~/.hermes/skills/media/read-bili |

--dest 是最终 skill 目录，只允许单个 agent。安装不依赖 agent 已安装，也不修改 agent 配置；宿主自身不支持的 OS 请按其官方指导使用容器或 WSL，WSL 属于独立 Linux 环境。

同版本受管理安装在未指定 --update 时会跳过；显式 --update 总是重新安装并验证，即使版本号相同。未知/旧目录默认拒绝覆盖；--update 先准备完整新包、npm ci 和验证，再保留时间戳备份并替换，失败回滚。备份存入用户主目录的 `.read-bili-backups`，位于 agent 的技能发现目录之外，避免备份被加载成第二个同名技能。多 agent 顺序安装，失败前已成功的目标保留，可重跑。旧的 Git clone/手动安装需要 --update 才会替换。

skill 包含 runtime、文档、锁文件和入口，不包含源码 .git、输出或秘密。源码同时维护 package-lock.json 与 npm-shrinkwrap.json；npm 发布包使用后者（npm 不打包 package-lock.json），两者内容须一致。每个安装目标有独立 npm 依赖，卸载可删除对应专用目录；备份保留到用户手动删除。

## 手动安装

也可将仓库的分发文件放入上述任一目录并执行 npm ci。Claude Code/OpenClaw/Hermes 的手动 clone 指导仍适用，但不要复制 .git、.env 或历史输出到其他安装目标。使用 agent 在对话中调用时，必须定位 skill 目录中的绝对脚本路径，输出写入任务可写目录。

## 返回码

0：命令成功（setup 可完成字幕模式并提醒 ASR 未配置）；1：环境或运行失败；2：参数错误。doctor asr 缺少密钥返回 1，subtitle 模式不因此失败。
