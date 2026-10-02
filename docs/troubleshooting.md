# 故障排查

- “此系统上禁止运行脚本”：使用 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "脚本绝对路径"`，只作用于本次进程；不要建议永久 Set-ExecutionPolicy。组策略限制下改用 Node CLI，不修改组策略。
- “已配置”但请求头无效：先运行 `configure key status` 和 `doctor --mode asr --json`。旧配置可能保存了非空掩码字符；新版区分配置存在与格式有效。确认来源和格式，不要求在聊天里提供密钥；无效环境变量会覆盖凭据库，不静默切换。
- 仓库和已安装版本不同：分别核对实际目录的 package.json、SKILL.md 和 CLI --help；使用 `install-skill --agent codex --update`，然后对目标目录运行帮助和 doctor 验证。仅源码、测试或打包通过不能算已安装。

- 命令找不到：运行 doctor。显式路径优先；检查 READ_BILI_* 是否指向可执行文件。安装后旧应用需要重启以读取新的 PATH。
- PowerShell 中文乱码或解析失败：使用仓库提供的入口；其提示为 ASCII，兼容 Windows PowerShell 5.1 与 PowerShell 7。不要随意改编码。自制中文脚本在 PowerShell 5.1 上使用 UTF-8 BOM。
- npm 或包管理器无法联网：已成功步骤会保留，恢复网络后重新执行；不下载来源不明的替代可执行文件。
- Linux apt 权限不足：自己运行向导列出的 sudo 安装命令，然后重跑。Secret Service 不可用时用环境变量，不创建明文回退文件。
- B 站 412：显式选择 --cookies-from-browser <browser> 或 --cookies <file>，二者互斥。关闭占用 cookie 数据库的浏览器可能有帮助。默认不读取浏览器，也不保证所有受限视频可下载。
- 无密钥：官方字幕仍可用；无字幕会在下载前停止并提示配置。doctor 不验证远程密钥有效性。
- ASR 401/403：检查密钥和账号权限；密钥不应出现在日志。限流和网络错误仍按现有重试策略处理。
- 分段失败：检查 ffmpeg/ffprobe，程序停止，不回退为可能截断的单次转写。分段部分失败会保存可用文字，但返回失败且无成功标记。
- 视频输出目录：probe 不产生转录成功标记；run 会移除旧成功标记。请以本次命令退出码和输出判断，不使用旧 transcript 作为本次结果。
- 音频时长短于预期超过 15%：保留告警，检查文字稿完整性，不将它描述为完整视频转录。
- agent 未发现 skill：检查目标路径、SKILL.md 与宿主权限/刷新机制。OpenClaw 前置只要求 Node，音频依赖在执行阶段检查。
