import { afterEach, expect, it, vi } from 'vitest';
import { recallRecovery, rememberRecovery } from '@/lib/ogiri/recovery-local';
import type { RoomView } from '@/lib/ogiri/types';

afterEach(() => vi.unstubAllGlobals());

it('keeps only the authenticated participant code in session storage and isolates identities', () => {
  const values = new Map<string, string>();
  const setItem = vi.fn((key: string, value: string) => values.set(key, value));
  vi.stubGlobal('sessionStorage', { setItem, getItem: (key: string) => values.get(key) ?? null });
  rememberRecovery({ code: 'ABC234', me: 'one', recoveryCode: 'ABCD2345' } as RoomView);
  expect(recallRecovery('ABC234', 'one')).toBe('ABCD2345');
  expect(recallRecovery('ABC234', 'another')).toBe('');
  expect(recallRecovery('ZZZ234', 'one')).toBe('');
  rememberRecovery({ code: 'ABC234', me: null, recoveryCode: 'ZZZZ2345' } as RoomView);
  rememberRecovery({ code: 'ABC234', me: 'two', recoveryCode: 'invalid' } as RoomView);
  expect(setItem).toHaveBeenCalledTimes(1);
});

it('supports navigation with storage blocked and ignores malformed stored data', () => {
  vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('disabled'); }, setItem: () => { throw new Error('disabled'); } });
  expect(() => rememberRecovery({ code: 'JKL234', me: 'private', recoveryCode: 'EFGH6789' } as RoomView)).not.toThrow();
  expect(recallRecovery('JKL234', 'private')).toBe('EFGH6789');
  vi.stubGlobal('sessionStorage', { getItem: () => '<invalid>', setItem: () => {} });
  expect(recallRecovery('JKL234', 'unknown')).toBe('');
});
