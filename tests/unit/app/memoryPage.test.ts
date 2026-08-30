import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireServerAdminMock, getPublicMemoriesServerMock, getPrivateMemoryIndexServerMock } = vi.hoisted(() => ({
  requireServerAdminMock: vi.fn(),
  getPublicMemoriesServerMock: vi.fn(),
  getPrivateMemoryIndexServerMock: vi.fn(),
}));

vi.mock('@/lib/serverAdminAuth', () => ({
  requireServerAdmin: requireServerAdminMock,
}));
vi.mock('@/lib/memory/getPublicMemoriesServer', () => ({
  getPublicMemoriesServer: getPublicMemoriesServerMock,
}));
vi.mock('@/lib/memory/getPrivateMemoriesServer', () => ({
  getPrivateMemoryIndexServer: getPrivateMemoryIndexServerMock,
}));
vi.mock('@/components/memory/PublicMemoryAtlas', () => ({
  default: () => null,
}));
vi.mock('@/components/memory/PrivateMemoryDashboard', () => ({
  default: () => null,
}));

import MemoryPreviewPage from '@/app/memory/page';

describe('memory preview page gate', () => {
  beforeEach(() => {
    requireServerAdminMock.mockReset();
    getPublicMemoriesServerMock.mockReset();
    getPrivateMemoryIndexServerMock.mockReset();
  });

  it('does not fetch memory data when the server admin gate rejects', async () => {
    requireServerAdminMock.mockRejectedValue(new Error('redirect'));

    await expect(MemoryPreviewPage()).rejects.toThrow('redirect');
    expect(getPublicMemoriesServerMock).not.toHaveBeenCalled();
    expect(getPrivateMemoryIndexServerMock).not.toHaveBeenCalled();
  });

  it('fetches the private index and public status only after the server admin gate succeeds', async () => {
    requireServerAdminMock.mockResolvedValue({ uid: 'admin-1' });
    getPublicMemoriesServerMock.mockResolvedValue([]);
    getPrivateMemoryIndexServerMock.mockResolvedValue([]);

    await expect(MemoryPreviewPage()).resolves.toBeTruthy();
    expect(requireServerAdminMock).toHaveBeenCalledWith('/memory');
    expect(getPublicMemoriesServerMock).toHaveBeenCalledOnce();
    expect(getPrivateMemoryIndexServerMock).toHaveBeenCalledOnce();
    expect(requireServerAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      getPublicMemoriesServerMock.mock.invocationCallOrder[0],
    );
    expect(requireServerAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      getPrivateMemoryIndexServerMock.mock.invocationCallOrder[0],
    );
  });

  it('keeps the public preview on its separate projection-only path', async () => {
    requireServerAdminMock.mockResolvedValue({ uid: 'admin-1' });
    getPublicMemoriesServerMock.mockResolvedValue([]);

    await expect(MemoryPreviewPage({
      searchParams: Promise.resolve({ view: 'public' }),
    })).resolves.toBeTruthy();
    expect(getPublicMemoriesServerMock).toHaveBeenCalledOnce();
    expect(getPrivateMemoryIndexServerMock).not.toHaveBeenCalled();
  });
});
