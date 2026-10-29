import { NextRequest, NextResponse } from 'next/server';
import { clientIpFrom, isRateLimited } from '@/lib/rateLimit';
import { GameError } from './engine';

export const cookieName = (code: string) => `ogiri_${code}`;
export function guardRecovery(request: NextRequest) {
  // Twelve phones on party Wi-Fi share an IP; allow one recovery and one retry each.
  if (isRateLimited(`ogiri:recovery:${clientIpFrom(request)}`, { limit: 24, windowMs: 60000 }))
    throw new GameError('復帰の操作が多すぎます。1分ほど待ってください。', 429);
}
function sameOriginJson(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin)
    throw new GameError('このサイトから操作してください。', 403);
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new GameError('JSON形式で送信してください。', 415);
}
/** Reactions get their own bucket so twelve phones on one Wi-Fi mashing 😂 never starve votes. */
export function guardReaction(request: NextRequest) {
  sameOriginJson(request);
  if (isRateLimited(`ogiri:react:${clientIpFrom(request)}`, { limit: 480, windowMs: 60000 }))
    throw new GameError('リアクションが多すぎます。少し待ってね。', 429);
}
export function guard(request: NextRequest, mutation = false, creating = false) {
  if (mutation) sameOriginJson(request);
  const kind = creating ? 'create' : mutation ? 'write' : 'read';
  if (
    isRateLimited(`ogiri:${kind}:${clientIpFrom(request)}`, {
      limit: creating ? 20 : mutation ? 360 : 1200,
      windowMs: creating ? 3600000 : 60000,
    })
  )
    throw new GameError('操作が多すぎます。少し待ってお試しください。', 429);
}
export function roomCode(value: string) {
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(value))
    throw new GameError('6文字のルームコードを確認してください。');
  return value;
}
export async function body(request: NextRequest, limit = 4096) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new GameError('送信内容が長すぎます。', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new GameError('送信内容がありません。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new GameError('送信内容が長すぎます。', 413);
    }
    chunks.push(value);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new GameError('送信内容を確認してください。');
  }
}
export function response(data: unknown, code?: string, token?: string) {
  const result = NextResponse.json(data, {
    headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Robots-Tag': 'noindex' },
  });
  if (code && token)
    result.cookies.set(cookieName(code), token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && process.env.OGIRI_EMULATOR !== '1',
      sameSite: 'strict',
      path: `/api/ogiri/${code}`,
      maxAge: 86400,
    });
  return result;
}
export function failure(error: unknown) {
  if (!(error instanceof GameError))
    console.error('[ogiri] Request failed', error instanceof Error ? error.name : 'unknown');
  return NextResponse.json(
    {
      error:
        error instanceof GameError
          ? error.message
          : '接続できませんでした。少し待って再試行してください。',
    },
    {
      status: error instanceof GameError ? error.status : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
