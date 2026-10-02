import { registerSecret, UsageError } from './process.mjs';

export async function openKeyring(platform = process.platform, load = () => import('@napi-rs/keyring')) {
  const { Entry } = await load();
  return new Entry('read-bili', 'siliconflow', platform === 'linux' ? { linux: { store: 'secret-service' } } : {});
}
export async function resolveKey({ explicit, env = process.env, keyring = openKeyring } = {}) {
  if (explicit || env.SILICONFLOW_API_KEY) {
    const value = explicit || env.SILICONFLOW_API_KEY;
    registerSecret(value);
    return { value, source: explicit ? 'argument' : 'environment', warning: null };
  }
  try {
    const entry = await keyring();
    let value;
    try { value = entry.getPassword(); } catch (error) {
      if (/NoEntry|no entry|not found|no credential/i.test(error.message)) return { value: '', source: 'none', warning: null };
      throw error;
    }
    registerSecret(value);
    return { value: value || '', source: value ? 'keyring' : 'none', warning: null };
  } catch {
    return { value: '', source: 'none', warning: 'Credential store unavailable/locked. Unlock it, install npm optional dependencies, or set SILICONFLOW_API_KEY. Linux requires Secret Service.' };
  }
}

// No plaintext is echoed or placed on a subprocess command line.
export function readHidden({ input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY || !output.isTTY || !input.setRawMode) throw new UsageError('Key input requires an interactive terminal. Set SILICONFLOW_API_KEY for automation.');
  return new Promise((resolve, reject) => {
    let value = ''; const previousRaw = input.isRaw;
    output.write('SiliconFlow API Key (hidden): '); input.setRawMode(true); input.resume(); input.setEncoding('utf8');
    const cleanup = () => { input.removeListener('data', onData); input.setRawMode(Boolean(previousRaw)); input.pause(); output.write('\n'); };
    const onData = text => {
      for (const ch of text) {
        if (ch === '\u0003' || ch === '\u0004') { cleanup(); reject(new Error('Key input cancelled.')); return; }
        if (ch === '\r' || ch === '\n') { cleanup(); resolve(value); return; }
        if (ch === '\u007f' || ch === '\b') value = [...value].slice(0, -1).join('');
        else if (ch >= ' ') value += ch;
      }
    };
    input.on('data', onData);
  });
}

export async function configureKey(action, { keyring = openKeyring, hidden = readHidden, env = process.env, output = console.log } = {}) {
  if (action === 'status') {
    const key = await resolveKey({ env, keyring });
    output(JSON.stringify({ configured: Boolean(key.value), source: key.source, readable: Boolean(key.value), warning: key.warning }, null, 2)); return;
  }
  if (!['set', 'delete'].includes(action)) throw new UsageError('Use configure key set|status|delete.');
  let entry;
  try { entry = await keyring(); } catch { throw new Error('Credential store unavailable. Run npm ci, unlock your credential store, or use SILICONFLOW_API_KEY.'); }
  if (action === 'delete') {
    try { entry.deletePassword(); } catch (error) { if (!/NoEntry|no entry|not found|no credential/i.test(error.message)) throw new Error('Could not delete stored credential. Unlock your credential store.'); }
    output('Read-Bili credential deleted. Existing environment variables were not modified.'); return;
  }
  const value = (await hidden()).trim();
  if (!value) throw new UsageError('Empty key: configuration was not modified.');
  registerSecret(value);
  try { entry.setPassword(value); } catch { throw new Error('Could not save credential. Unlock your credential store.'); }
  output('Key saved in the system credential store. Environment variables take precedence.');
}
