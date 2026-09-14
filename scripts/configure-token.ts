import {readFile, writeFile, rename, rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {Tracker} from '../src/tracker.js';

// Intentionally CLI-only. Never invoke from an LLM tool or pipe credentials.
async function secret(): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw Error('TTY required');
  process.stdout.write('OAuth token (hidden; Enter saves, Esc cancels): ');
  const previous = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (cancel = false) => {
      process.stdin.off('data', onData); process.stdin.setRawMode(previous); process.stdin.pause();
      process.stdout.write('\n');
      if (cancel) reject(Error('Cancelled')); else resolve(value);
      value = '';
    };
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003' || char === '\u001b') {finish(true); return;}
        if (char === '\r' || char === '\n') {finish(); return;}
        if (char === '\u007f' || char === '\b') value = value.slice(0,-1);
        else if (/^[\x21-\x7e]$/.test(char)) value += char;
        if (value.length > 4096) {finish(true); return;}
      }
    };
    process.stdin.on('data', onData);
  });
}
const path = fileURLToPath(new URL('../.env', import.meta.url));
let temporary: string | undefined;
try {
  const original = await readFile(path, 'utf8');
  const env = parseEnv(original);
  const token = await secret();
  if (!/^[A-Za-z0-9_-]{10,4096}$/.test(token)) throw Error('Invalid token');
  console.log('Checking API access...');
  await new Tracker(token, env.YANDEX_TRACKER_ORG_ID ?? '', env.YANDEX_TRACKER_ORG_HEADER ?? 'X-Org-ID', '')
    .status(AbortSignal.timeout(90_000));
  const lines = original.split(/\r?\n/).filter(line => !/^\s*(?:export\s+)?YANDEX_TRACKER_TOKEN\s*=/.test(line));
  const updated = lines.join('\n').replace(/\n*$/, '\n') + `YANDEX_TRACKER_TOKEN=${token}\n`;
  // Refuse to clobber edits made while the user was entering the token.
  if (await readFile(path,'utf8') !== original) throw Error('Configuration changed');
  temporary = path + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, updated, {flag:'wx', mode:0o600});
  await rename(temporary, path); temporary = undefined;
  console.log('Token verified and saved to .env. No token was printed. Existing environment variables may override .env; restart pi if needed.');
} catch {
  console.error('Setup cancelled or failed (input, API access, configuration or file error). Existing .env was not intentionally changed. No secrets printed.');
  process.exitCode = 1;
} finally {
  if (temporary) await rm(temporary, {force:true}).catch(() => {});
}
