import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
const mocks = vi.hoisted(() => ({ ensureAdmin: vi.fn() }));
vi.mock('@/lib/auth-utils', () => ({ ensureAdmin: mocks.ensureAdmin }));
import { POST } from '@/app/api/study/library/route';

const request = (body: unknown) => new NextRequest('https://www.meetyudai.com/api/study/library', { method: 'POST', headers: { Authorization: 'Bearer firebase-test' }, body: JSON.stringify(body) });
describe('private Learning Library API', () => {
  beforeEach(() => { vi.restoreAllMocks(); mocks.ensureAdmin.mockReset(); });
  it('blocks non-admin before calling backend and disables caching', async () => {
    mocks.ensureAdmin.mockResolvedValue({ user: null, response: NextResponse.json({}, { status: 403 }) });
    const fetch = vi.spyOn(globalThis, 'fetch');
    const response = await POST(request({ action: 'search', input: {} }));
    expect(response.status).toBe(403); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(fetch).not.toHaveBeenCalled();
  });
  it('forwards only allowed action and input with owner token', async () => {
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'owner', isAdmin: true } });
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, items: [] })));
    const response = await POST(request({ action: 'search', input: { domain: 'english' }, userId: 'another-owner' }));
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('ownerlearninglibrary'), expect.objectContaining({ cache: 'no-store', body: JSON.stringify({ action: 'search', input: { domain: 'english' } }), headers: { Authorization: 'Bearer firebase-test', 'Content-Type': 'application/json' } }));
  });
  it('does not expose delete or publish operations', async () => {
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'owner', isAdmin: true } });
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const action of ['delete', 'publish', 'generateAudio']) expect((await POST(request({ action, input: {} }))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('propagates stale-revision errors without unsafe success fallbacks', async () => {
    mocks.ensureAdmin.mockResolvedValue({ user: { uid: 'owner', isAdmin: true } });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: false, error: 'Reload' }), { status: 409 }));
    const response = await POST(request({ action: 'review', input: {} }));
    expect(response.status).toBe(409); expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
