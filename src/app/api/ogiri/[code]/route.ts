import { NextRequest } from 'next/server';
import { body, cookieName, failure, guard, guardRecovery, response, roomCode } from '@/lib/ogiri/http';
import { command, enterRoom, readRoom, recoverRoom, regenerateRecoveryCode } from '@/lib/ogiri/store';
import { GameError } from '@/lib/ogiri/engine';
export const runtime = 'nodejs';
type Context = { params: Promise<{ code: string }> };
export async function GET(request: NextRequest, context: Context) {
  try {
    guard(request);
    const code = roomCode((await context.params).code);
    return response(
      await readRoom(
        code,
        request.cookies.get(cookieName(code))?.value,
        request.nextUrl.searchParams.get('view') === 'tv',
      ),
    );
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: NextRequest, context: Context) {
  try {
    guard(request, true);
    const code = roomCode((await context.params).code);
    const data = await body(request);
    const token = request.cookies.get(cookieName(code))?.value;
    if (data.type === 'recover') {
      guardRecovery(request);
      const result = await recoverRoom(code, data.recoveryCode);
      return response(result.view, code, result.token);
    }
    if (data.type === 'recoveryCode') {
      guardRecovery(request);
      return response(await regenerateRecoveryCode(code, token));
    }
    if (data.type === 'join') {
      const result = await enterRoom(code, token, data.name, data.avatar);
      return response(result.view, code, result.token);
    }
    if (typeof data.type !== 'string') throw new GameError('操作を指定してください。');
    return response(await command(code, token, data, data.turn));
  } catch (error) {
    return failure(error);
  }
}
