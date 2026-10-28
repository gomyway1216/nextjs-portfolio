import { NextRequest, NextResponse } from 'next/server';
import { cookieName, failure, guard, roomCode } from '@/lib/ogiri/http';
import { readDrawing } from '@/lib/ogiri/store';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ code: string; id: string }> }) {
  try {
    guard(request);
    const params = await context.params;
    const code = roomCode(params.code);
    const { data, published } = await readDrawing(code, params.id, request.cookies.get(cookieName(code))?.value);
    return NextResponse.json(data, { headers: {
      'Cache-Control': published ? 'private, max-age=3600' : 'private, no-store',
      Vary: 'Cookie', 'X-Robots-Tag': 'noindex',
    } });
  } catch (error) { return failure(error); }
}
