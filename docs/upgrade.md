# 1.2.0 upgrade record

Baseline repository: https://github.com/EricArcha/Read-Bili
Baseline commit: a9bc5658d607b3673b4badd9aad107e4757e5bfa

Git clone was attempted twice but GitHub connections timed out/reset. Source was downloaded from the GitHub codeload archive for this exact commit, not copied from an installed skill. After GitHub authorization, the actual remote Git history was restored using the configured Windows system proxy, with the working files preserved and based on this commit.

## Delivery stages

1. Runtime and diagnostics: CLI modules, safe subprocess arguments, platform-aware discovery, staged audio validation, explicit cookie options, subtitle-first dependency gates and strict segmentation.
2. Setup: repeatable platform package-manager plans, hidden key input and optional persistent credential backend, four-agent staged installation with backup/rollback.
3. Distribution: consistent 1.2.0 version, lockfile, packaged SKILL.md and bootstrap entries, docs and cross-platform CI.

## Validation

Local verification (Windows x64): 31 tests passed on Node 18.20.8, 22.23.3 and 24.15.0. Tests cover subprocess cancellation/failures, Unicode/space paths, dependency gating, staged downloads, segmentation failures, mock HTTP ASR, key-source precedence/redaction, terminal restoration and four-agent installation/rollback.

PowerShell 5.1 and 7 bootstrap dry runs passed from outside the source directory. Real Windows tool discovery found ffmpeg/ffprobe 9.0.2 and yt-dlp 2026.08.19 without requiring refreshed parent-process PATH. Real npm pack -> consumer npm installation -> install-skill -> installed subtitle doctor passed with Unicode/space destinations. The distributed npm-shrinkwrap.json preserves locked installs because npm excludes package-lock.json from tarballs.

Live probe of repository example BV1R6PzzAE9k returned its title/BV/cid but no official subtitles or anonymous audio streams. This validates metadata probing only; it does not complete the real subtitle or paid ASR release checks below. No real cookies or paid ASR calls were used.

CI run 36981157939 passed 9 of 10 jobs; macOS arm64 / Node 22 passed all 31 core tests but failed the packaged CLI smoke check. macOS temporary paths can use /var aliases for /private/var: ESM resolved the CLI path while argv retained the alias, so the lexical entrypoint comparison skipped execution. The entrypoint now compares real paths, installation validation requires actual help output, and a symlink/junction regression test covers this case. The expanded 32-test suite passed locally on Node 18/22/24, including the package smoke check on Node 24.

Automated tests mock remote Bilibili/ASR responses and credential backends; no real browser cookies or paid ASR calls are used. CI covers Node 18/22/24 on Windows/macOS/Ubuntu and an additional Intel macOS job. Platform and architecture claims require successful CI before release.

Manual release checklist:

- [ ] Real official-subtitle video transcript compared against subtitles.
- [ ] Real audio ASR video with user's explicit API spending authorization, duration and transcript checked.
- [ ] macOS Keychain / Windows Credential Manager / Linux Secret Service interactive set/status/delete verified.
- [ ] Four host agents discover the installed skill in their real environment.
- [ ] Cross-platform CI passed; inspect npm pack contents and unpacked CLI.

Publishing npm/GitHub releases is outside this local implementation. Real manual checks must not be claimed complete unless performed.
# 1.2.1：配置校验与技能交付边界

- 拒绝过短、掩码、非 ASCII 或内部含空白的密钥，诊断区分配置存在与本地格式有效。凭据保存必须读回一致；本地检查不冒充服务端认证。
- 提供带 UTF-8 BOM 的 Windows 剪贴板配置脚本，纳入 npm 分发包和 agent 安装；文档使用单次进程 ExecutionPolicy，不修改全局策略。
- 实际安装核对技能、package 和 CLI 版本；显式 --update 即使同版本也重新安装。备份移到用户主目录 `.read-bili-backups`，避免被 agent 发现成重复技能。
- 技能说明要求完整文字稿才能交付完整总结，区分品牌商单、联盟导购与推测，并保留排障前的原视频任务。
- 验证：37 项本地测试、发布包安装检查、PowerShell 5.1/7 解析检查通过。三条真实 B 站视频完成分段 ASR，共 19 段全部返回文本；音频与视频元数据时长差均小于 1 秒。真实测试输出和密钥不纳入仓库。
