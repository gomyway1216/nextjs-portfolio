import { NextRequest } from 'next/server';
import { failure, guard, response } from '@/lib/ogiri/http';
import { readHistory } from '@/lib/ogiri/store';
export const runtime = 'nodejs';
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    guard(request);
    const history = await readHistory((await context.params).id);
    const result = response(history);
    const maxAge = Math.max(0, Math.min(3600, Math.floor((history.expiresAt - Date.now()) / 1000)));
    result.headers.set('Cache-Control', `private, max-age=${maxAge}`);
    result.headers.set('Referrer-Policy', 'no-referrer');
    return result;
  } catch (error) {
    return failure(error);
  }
}
