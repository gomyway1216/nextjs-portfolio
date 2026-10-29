import 'server-only';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { GameError } from './engine';

export type PassphraseHash = { salt: string; hash: string };

function input(value: unknown): string {
  if (typeof value !== 'string') throw new GameError('合言葉は6〜64文字で設定してください。');
  const normalized = value.normalize('NFC');
  const length = [...normalized].length;
  if (length < 6 || length > 64 || !normalized.trim() || /\p{Cc}/u.test(normalized))
    throw new GameError('合言葉は6〜64文字で設定してください。');
  return normalized;
}

function derive(value: string, salt: string): Promise<Buffer> {
  // OWASP's 32 MiB scrypt profile. Async work runs only on explicit setup/login.
  return new Promise((resolve, reject) => {
    scrypt(value, Buffer.from(salt, 'hex'), 32, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}

export async function hashPassphrase(value: unknown): Promise<PassphraseHash> {
  const normalized = input(value);
  const salt = randomBytes(16).toString('hex');
  return { salt, hash: (await derive(normalized, salt)).toString('hex') };
}

export async function verifyPassphrase(value: unknown, stored: PassphraseHash): Promise<boolean> {
  let normalized: string;
  try { normalized = input(value); } catch { return false; }
  if (!/^[a-f0-9]{32}$/.test(stored.salt) || !/^[a-f0-9]{64}$/.test(stored.hash)) return false;
  return timingSafeEqual(await derive(normalized, stored.salt), Buffer.from(stored.hash, 'hex'));
}
