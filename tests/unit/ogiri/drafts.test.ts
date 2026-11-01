import { afterEach, expect, it, vi } from 'vitest';
import { clearDraft, loadDraft, saveDraft } from '@/lib/ogiri/drafts';

afterEach(() => { vi.unstubAllGlobals(); });
const refused = () => { throw new DOMException('denied', 'SecurityError'); };

it('keeps a draft for the page when DOM storage is blocked, so unsent checks still see it', () => {
  vi.stubGlobal('localStorage', { getItem: refused, setItem: refused, removeItem: refused });
  saveDraft('blocked', 'edited answer');
  expect(loadDraft('blocked')).toBe('edited answer');
  clearDraft('blocked');
  expect(loadDraft('blocked')).toBeNull();
});

it('treats a null localStorage the same way', () => {
  vi.stubGlobal('localStorage', null);
  expect(loadDraft('missing')).toBeNull();
  saveDraft('missing', 'edited answer');
  expect(loadDraft('missing')).toBe('edited answer');
  clearDraft('missing');
  expect(loadDraft('missing')).toBeNull();
});

it('prefers the newest text when storage refuses a write', () => {
  vi.stubGlobal('localStorage', { getItem: () => 'older text', setItem: refused, removeItem: () => undefined });
  saveDraft('full', 'newer text');
  expect(loadDraft('full')).toBe('newer text');
  clearDraft('full');
});

it('still reads what an earlier page left in storage', () => {
  const stored = new Map([['earlier', 'kept text']]);
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => { stored.set(key, value); },
    removeItem: (key: string) => { stored.delete(key); },
  });
  expect(loadDraft('earlier')).toBe('kept text');
  clearDraft('earlier');
  expect(stored.size).toBe(0);
});
