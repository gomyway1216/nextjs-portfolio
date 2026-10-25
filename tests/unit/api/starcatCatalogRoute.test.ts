import { NextRequest, NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CHARACTERS } from '@/components/game/StarcatCaravan/data';
import { CatalogError } from '@/components/game/StarcatCaravan/catalog';
import { GET, PUT } from '@/app/api/game/starcat/catalog/route';

const mocks = vi.hoisted(() => ({ ensureAdmin: vi.fn(), getOrCreate: vi.fn(), update: vi.fn() }));
vi.mock('@/app/api/_lib/withActivityLog', () => ({ withActivityLog: (_action: string, handler: unknown) => handler }));
vi.mock('@/lib/auth-utils', () => ({ ensureAdmin: mocks.ensureAdmin }));
vi.mock('@/lib/starcatCatalog', () => ({ getOrCreateStarcatCatalog: mocks.getOrCreate, updateStarcatCatalog: mocks.update }));

const url = 'https://example.com/api/game/starcat/catalog';
const catalog = { revision: 1, characters: CHARACTERS };
const putRequest = (body: unknown = catalog) => new NextRequest(url, { method: 'PUT', body: JSON.stringify(body) });

describe('/api/game/starcat/catalog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'admin', isAdmin: true } });
    mocks.getOrCreate.mockResolvedValue(catalog);
    mocks.update.mockResolvedValue({ ...catalog, revision: 2 });
  });

  it('publicly reads the actual database catalog without caching it', async () => {
    const response = (await GET(new NextRequest(url), undefined))!;
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(await response.json()).toEqual(catalog);
    expect(mocks.ensureAdmin).not.toHaveBeenCalled();
  });

  it.each([401, 403])('rejects non-admin writes before reading the body (%s)', async (status) => {
    mocks.ensureAdmin.mockResolvedValue({ user: null, response: NextResponse.json({ error: 'Denied' }, { status }) });
    const request = putRequest();
    const parse = vi.spyOn(request, 'json');
    const response = (await PUT(request, undefined))!;
    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(parse).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('validates admin writes and returns the committed revision', async () => {
    const response = (await PUT(putRequest(), undefined))!;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...catalog, revision: 2 });
    expect(mocks.update).toHaveBeenCalledWith(catalog, 'admin');
  });

  it('rejects malformed JSON and bad stats without writing', async () => {
    const malformed = (await PUT(new NextRequest(url, { method: 'PUT', body: '{' }), undefined))!;
    expect(malformed.status).toBe(400);
    const invalid = { ...catalog, characters: CHARACTERS.map((cat) => ({ ...cat, cost: 201 })) };
    const response = (await PUT(putRequest(invalid), undefined))!;
    expect(response.status).toBe(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('returns conflicts for original ID removal and stale revisions', async () => {
    const removed = (await PUT(putRequest({ ...catalog, characters: CHARACTERS.slice(1) }), undefined))!;
    expect(removed.status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
    mocks.update.mockRejectedValueOnce(new CatalogError('Reload before saving.', 409));
    expect((await PUT(putRequest(), undefined))!.status).toBe(409);
  });

  it('returns 503 on database failure instead of presenting bootstrap data as a successful read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      mocks.getOrCreate.mockRejectedValueOnce(new Error('Database unavailable'));
      const response = (await GET(new NextRequest(url), undefined))!;
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: expect.stringContaining('temporarily unavailable') });
      mocks.update.mockRejectedValueOnce(new Error('Database unavailable'));
      expect((await PUT(putRequest(), undefined))!.status).toBe(503);
    } finally { log.mockRestore(); }
  });
});
