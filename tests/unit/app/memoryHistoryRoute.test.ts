import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getServerAdminSessionMock, getPrivateMemoryHistoryServerMock } = vi.hoisted(() => ({
  getServerAdminSessionMock: vi.fn(),
  getPrivateMemoryHistoryServerMock: vi.fn(),
}));

vi.mock('@/lib/serverAdminAuth', () => ({ getServerAdminSession: getServerAdminSessionMock }));
vi.mock('@/lib/memory/getPrivateMemoriesServer', () => ({
  getPrivateMemoryHistoryServer: getPrivateMemoryHistoryServerMock,
}));

import { GET } from '@/app/api/admin/memory-history/route';

describe('private memory history API gate', () => {
  beforeEach(() => {
    getServerAdminSessionMock.mockReset();
    getPrivateMemoryHistoryServerMock.mockReset();
  });

  it('does not contact Personal Memory without an admin session', async () => {
    getServerAdminSessionMock.mockResolvedValue(null);
    const response = await GET(new NextRequest('https://example.com/api/admin/memory-history?memoryId=memory-1'));
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('pragma')).toBe('no-cache');
    expect(getPrivateMemoryHistoryServerMock).not.toHaveBeenCalled();
  });

  it('validates the id and returns only after admin verification', async () => {
    getServerAdminSessionMock.mockResolvedValue({ uid: 'admin-1' });
    getPrivateMemoryHistoryServerMock.mockResolvedValue([]);
    const invalid = await GET(new NextRequest('https://example.com/api/admin/memory-history?memoryId=../private'));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get('cache-control')).toContain('no-store');
    expect(invalid.headers.get('pragma')).toBe('no-cache');
    expect(getPrivateMemoryHistoryServerMock).not.toHaveBeenCalled();

    const response = await GET(new NextRequest('https://example.com/api/admin/memory-history?memoryId=memory-1'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({ view: 'history', memoryId: 'memory-1', items: [] });
  });
});
