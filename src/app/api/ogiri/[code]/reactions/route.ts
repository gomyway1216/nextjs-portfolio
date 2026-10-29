import { NextRequest } from 'next/server';
import { body, cookieName, failure, guardReaction, response, roomCode } from '@/lib/ogiri/http';
import { react } from '@/lib/ogiri/store';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    guardReaction(request);
    const code = roomCode((await context.params).code);
    const data = await body(request, 512);
    return response(await react(code, request.cookies.get(cookieName(code))?.value, data.counts, data.turn));
  } catch (error) { return failure(error); }
}
