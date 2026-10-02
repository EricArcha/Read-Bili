import { homedir } from 'node:os';
import { join, delimiter, isAbsolute } from 'node:path';
import { readdir, readFile } from 'node:fs/promises';
import { runProcess } from './process.mjs';

export const toolNames = ['ffmpeg', 'ffprobe', 'yt-dlp'];
export const toolEnv = { ffmpeg: 'READ_BILI_FFMPEG', ffprobe: 'READ_BILI_FFPROBE', 'yt-dlp': 'READ_BILI_YT_DLP' };
export async function commonDirectories({ platform = process.platform, env = process.env, home = homedir() } = {}) {
  if (platform !== 'win32') return ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', join(home, '.local/bin')];
  const local = env.LOCALAPPDATA || join(home, 'AppData/Local');
  const roaming = env.APPDATA || join(home, 'AppData/Roaming');
  const dirs = [join(local, 'Microsoft/WinGet/Links')];
  const packages = join(local, 'Microsoft/WinGet/Packages');
  try {
    for (const entry of await readdir(packages)) {
      if (!/ffmpeg|yt-dlp/i.test(entry)) continue;
      const root = join(packages, entry); dirs.push(root);
      for (const child of await readdir(root)) { dirs.push(join(root, child), join(root, child, 'bin')); }
    }
  } catch { /* Package directory is optional. */ }
  for (const root of [join(roaming, 'Python'), join(local, 'Programs/Python')]) {
    try { for (const entry of await readdir(root)) if (/^Python\d+$/i.test(entry)) dirs.push(join(root, entry, 'Scripts')); } catch { /* optional */ }
  }
  return dirs;
}

export async function findTool(name, { platform = process.platform, env = process.env, home = homedir(), execute = runProcess, extraDirectories } = {}) {
  const suffix = platform === 'win32' ? '.exe' : '';
  const explicit = env[toolEnv[name]];
  const dirs = (env.PATH || env.Path || '').split(platform === 'win32' ? ';' : delimiter).filter(Boolean).map(d => d.replace(/^"|"$/g, ''));
  const candidates = explicit ? [explicit] : [...dirs, ...(extraDirectories || await commonDirectories({ platform, env, home }))].map(d => join(d, name + suffix));
  for (const path of [...new Set(candidates)]) {
    try {
      const result = await execute(path, [name === 'yt-dlp' ? '--version' : '-version'], { timeout: 5000, env });
      return { name, path: isAbsolute(path) ? path : path, version: result.stdout.trim().split(/\r?\n/)[0] };
    } catch { /* Try next candidate, but never bypass an explicit override. */ }
  }
  return null;
}

export async function detectLinuxFamily(path = '/etc/os-release') {
  try {
    const text = await readFile(path, 'utf8');
    return /^(?:ID|ID_LIKE)=["']?(?:.*\b)?(?:debian|ubuntu)\b/m.test(text) ? 'debian' : 'other';
  } catch { return 'other'; }
}

export function repairHint(name, platform = process.platform) {
  const pkg = name === 'ffprobe' ? 'ffmpeg' : name;
  if (platform === 'win32') return `winget install --id ${pkg === 'ffmpeg' ? 'Gyan.FFmpeg' : 'yt-dlp.yt-dlp'} --exact --source winget`;
  if (platform === 'darwin') return `brew install ${pkg}`;
  return `Debian/Ubuntu: sudo apt-get install ${pkg}; other distributions: install ${pkg} using your package manager.`;
}
