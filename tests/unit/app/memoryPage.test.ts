import { beforeEach, describe, expect, it, vi } from 'vitest';

const { requireServerAdminMock, getPublicMemoriesServerMock } = vi.hoisted(() => ({
  requireServerAdminMock: vi.fn(),
  getPublicMemoriesServerMock: vi.fn(),
}));

vi.mock('@/lib/serverAdminAuth', () => ({
  requireServerAdmin: requireServerAdminMock,
}));
vi.mock('@/lib/memory/getPublicMemoriesServer', () => ({
  getPublicMemoriesServer: getPublicMemoriesServerMock,
}));
vi.mock('@/components/memory/PublicMemoryAtlas', () => ({
  default: () => null,
}));

import MemoryPreviewPage from '@/app/memory/page';

describe('memory preview page gate', () => {
  beforeEach(() => {
    requireServerAdminMock.mockReset();
    getPublicMemoriesServerMock.mockReset();
  });

  it('does not fetch memory data when the server admin gate rejects', async () => {
    requireServerAdminMock.mockRejectedValue(new Error('redirect'));

    await expect(MemoryPreviewPage()).rejects.toThrow('redirect');
    expect(getPublicMemoriesServerMock).not.toHaveBeenCalled();
  });

  it('fetches memory data only after the server admin gate succeeds', async () => {
    requireServerAdminMock.mockResolvedValue({ uid: 'admin-1' });
    getPublicMemoriesServerMock.mockResolvedValue([]);

    await expect(MemoryPreviewPage()).resolves.toBeTruthy();
    expect(requireServerAdminMock).toHaveBeenCalledWith('/memory');
    expect(getPublicMemoriesServerMock).toHaveBeenCalledOnce();
    expect(requireServerAdminMock.mock.invocationCallOrder[0]).toBeLessThan(
      getPublicMemoriesServerMock.mock.invocationCallOrder[0],
    );
  });
});
