import { NextRequest } from 'next/server';
import { body, failure, guard, response } from '@/lib/ogiri/http';
import { makeRoom } from '@/lib/ogiri/store';
export const runtime = 'nodejs';
export async function POST(request: NextRequest) {
  try {
    guard(request, true, true);
    const data = await body(request);
    const { view, token } = await makeRoom(data.name, data.avatar);
    return response(view, view.code, token);
  } catch (error) {
    return failure(error);
  }
}
