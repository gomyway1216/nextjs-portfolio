import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRESTORE_READ_DEADLINE_MS } from '@/lib/firestoreDeadline';

const mocks = vi.hoisted(() => ({
  getFirestore: vi.fn(),
  getProjectsServer: vi.fn(),
  getSlugMapSafe: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getFirestore: mocks.getFirestore }));
vi.mock('@/lib/projects/getProjectsServer', () => ({ getProjectsServer: mocks.getProjectsServer }));
vi.mock('@/lib/blog/getSlugIndexServer', () => ({ getSlugMapSafe: mocks.getSlugMapSafe }));

const never = () => new Promise<never>(() => {});

describe('sitemap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    Object.values(mocks).forEach((mock) => mock.mockReset());
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('still answers, with its static routes, when every Firestore read hangs', async () => {
    const query = { where: () => query, get: never };
    mocks.getFirestore.mockReturnValue({ collection: () => query });
    mocks.getProjectsServer.mockImplementation(never);
    mocks.getSlugMapSafe.mockResolvedValue(new Map());
    const { default: sitemap } = await import('@/app/sitemap');

    const pending = sitemap();
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(FIRESTORE_READ_DEADLINE_MS - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    const entries = await pending;
    const urls = entries.map((entry) => entry.url);
    expect(urls).toContain('https://www.meetyudai.com/blog');
    expect(urls).toContain('https://www.meetyudai.com/projects');
    expect(urls.some((url) => /\/blog\/[^/]+\/[^/]+$/.test(url))).toBe(false);
  });
});
