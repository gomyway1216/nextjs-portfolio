import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth-utils';
import { getCloudFunctionUrl } from '@/app/api/constants';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const { user, response } = await ensureAdmin(request);
  if (response) { response.headers.set('Cache-Control', 'private, no-store'); return response; }
  if (!user) return NextResponse.json({ success: false }, { status: 401, headers });
  const body = await request.json().catch(() => null);
  if (!body || !['search', 'save', 'review', 'organize'].includes(body.action) || !body.input || typeof body.input !== 'object' || Array.isArray(body.input)) return NextResponse.json({ success: false, error: 'Invalid learning request' }, { status: 400, headers });
  if (JSON.stringify(body).length > 110_000) return NextResponse.json({ success: false, error: 'Request is too large' }, { status: 413, headers });
  try {
    const upstream = await fetch(getCloudFunctionUrl('ownerLearningLibrary'), {
      method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(60_000),
      headers: { Authorization: request.headers.get('authorization')!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: body.action, input: body.input }),
    });
    const data = await upstream.json();
    return NextResponse.json(data, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ success: false, error: 'Learning Library is temporarily unavailable' }, { status: 502, headers });
  }
}
