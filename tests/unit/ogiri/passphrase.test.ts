import { expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { hashPassphrase, verifyPassphrase } from '@/lib/ogiri/passphrase';

it('uses independent salts and accepts Japanese NFC spellings without storing plaintext', async () => {
  const value = 'ぱーてぃーであそぶ';
  const first = await hashPassphrase(value);
  const second = await hashPassphrase(value);
  expect(first).not.toEqual(second);
  expect(first.salt).toMatch(/^[a-f0-9]{32}$/);
  expect(first.hash).toMatch(/^[a-f0-9]{64}$/);
  expect(JSON.stringify(first)).not.toContain(value);
  expect(await verifyPassphrase(value.normalize('NFD'), first)).toBe(true);
  expect(await verifyPassphrase('ちがうあいことば', first)).toBe(false);
});

it('bounds the input before hashing and rejects malformed verifiers', async () => {
  for (const value of [null, {}, 'short', ' '.repeat(6), 'x'.repeat(65), 'hello\nworld'])
    await expect(hashPassphrase(value)).rejects.toMatchObject({ status: 400 });
  const verifier = await hashPassphrase('😀'.repeat(6));
  expect(await verifyPassphrase('😀'.repeat(6), verifier)).toBe(true);
  expect(await verifyPassphrase('x'.repeat(65), verifier)).toBe(false);
  expect(await verifyPassphrase('abcdef', { ...verifier, salt: 'bad' })).toBe(false);
  expect(await verifyPassphrase('abcdef', { ...verifier, hash: 'bad' })).toBe(false);
});
