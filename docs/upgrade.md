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

Automated tests mock remote Bilibili/ASR responses and credential backends; no real browser cookies or paid ASR calls are used. CI covers Node 18/22/24 on Windows/macOS/Ubuntu and an additional Intel macOS job. Platform and architecture claims require successful CI before release.

Manual release checklist:

- [ ] Real official-subtitle video transcript compared against subtitles.
- [ ] Real audio ASR video with user's explicit API spending authorization, duration and transcript checked.
- [ ] macOS Keychain / Windows Credential Manager / Linux Secret Service interactive set/status/delete verified.
- [ ] Four host agents discover the installed skill in their real environment.
- [ ] Cross-platform CI passed; inspect npm pack contents and unpacked CLI.

Publishing npm/GitHub releases is outside this local implementation. Real manual checks must not be claimed complete unless performed.
