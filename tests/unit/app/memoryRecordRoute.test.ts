import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { getServerAdminSessionMock, deletePrivateMemoryServerMock } = vi.hoisted(() => ({
  getServerAdminSessionMock: vi.fn(),
  deletePrivateMemoryServerMock: vi.fn(),
}));

vi.mock('@/lib/serverAdminAuth', () => ({ getServerAdminSession: getServerAdminSessionMock }));
vi.mock('@/lib/memory/getPrivateMemoriesServer', () => ({
  deletePrivateMemoryServer: deletePrivateMemoryServerMock,
  PrivateMemoryDeleteError: class PrivateMemoryDeleteError extends Error {
    constructor(readonly status: 404 | 409 | 503) {
      super('delete failed');
    }
  },
}));

import { DELETE } from '@/app/api/admin/memory-record/route';
import { PrivateMemoryDeleteError } from '@/lib/memory/getPrivateMemoriesServer';

const validBody = {
  memoryId: 'memory-1',
  expectedRevision: 3,
  confirmationTitle: 'Current record title',
  confirmed: true,
};

function request(body: unknown = validBody, origin = 'https://www.meetyudai.com') {
  return new NextRequest('https://www.meetyudai.com/api/admin/memory-record', {
    method: 'DELETE',
    headers: {'Content-Type': 'application/json', Origin: origin},
    body: JSON.stringify(body),
  });
}

describe('private memory deletion API gate', () => {
  beforeEach(() => {
    getServerAdminSessionMock.mockReset();
    deletePrivateMemoryServerMock.mockReset();
  });

  it('does not contact Personal Memory without an admin session', async () => {
    getServerAdminSessionMock.mockResolvedValue(null);
    const result = await DELETE(request());
    expect(result.status).toBe(401);
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(deletePrivateMemoryServerMock).not.toHaveBeenCalled();
  });

  it('rejects cross-origin and unconfirmed requests before the destructive call', async () => {
    getServerAdminSessionMock.mockResolvedValue({uid: 'admin-1'});
    expect((await DELETE(request(validBody, 'https://attacker.example'))).status).toBe(403);
    expect((await DELETE(request({...validBody, confirmed: false}))).status).toBe(400);
    expect(deletePrivateMemoryServerMock).not.toHaveBeenCalled();
  });

  it('forwards only a validated, explicitly confirmed deletion', async () => {
    getServerAdminSessionMock.mockResolvedValue({uid: 'admin-1'});
    deletePrivateMemoryServerMock.mockResolvedValue({memoryId: 'memory-1', deleted: true});
    const result = await DELETE(request());
    expect(result.status).toBe(200);
    expect(result.headers.get('cache-control')).toContain('no-store');
    expect(await result.json()).toEqual({memoryId: 'memory-1', deleted: true});
    expect(deletePrivateMemoryServerMock).toHaveBeenCalledWith(validBody);
  });

  it('preserves stale-record failures without claiming deletion', async () => {
    getServerAdminSessionMock.mockResolvedValue({uid: 'admin-1'});
    deletePrivateMemoryServerMock.mockRejectedValue(new PrivateMemoryDeleteError(409));
    const result = await DELETE(request());
    expect(result.status).toBe(409);
    expect(await result.json()).toEqual({error: 'stale_record'});
  });
});
