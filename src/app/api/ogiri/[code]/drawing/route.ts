import { NextRequest } from 'next/server';
import { body, cookieName, failure, guard, response, roomCode } from '@/lib/ogiri/http';
import { command } from '@/lib/ogiri/store';
import { GameError } from '@/lib/ogiri/errors';
export const runtime = 'nodejs';
export async function POST(request: NextRequest, context: { params: Promise<{ code: string }> }) {
  try {
    guard(request, true);
    const code = roomCode((await context.params).code);
    const data = await body(request, 12288);
    if (data.type !== 'drawingSubmit') throw new GameError('絵の提出だけに使える操作です。');
    return response(await command(code, request.cookies.get(cookieName(code))?.value,
      { type: 'drawingSubmit', drawing: data.drawing }, data.turn));
  } catch (error) { return failure(error); }
}
