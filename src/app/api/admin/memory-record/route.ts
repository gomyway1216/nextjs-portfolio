import { NextRequest, NextResponse } from 'next/server';
import {
  deletePrivateMemoryServer,
  PrivateMemoryDeleteError,
} from '@/lib/memory/getPrivateMemoriesServer';
import { parsePrivateMemoryDeleteRequest } from '@/lib/memory/privateMemoryDeletion';
import { getServerAdminSession } from '@/lib/serverAdminAuth';

export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
  Pragma: 'no-cache',
} as const;
const MAX_DELETE_BODY_BYTES = 2 * 1024;

function response(error: string, status: number) {
  return NextResponse.json({error}, {status, headers: NO_STORE_HEADERS});
}

export async function DELETE(request: NextRequest) {
  const admin = await getServerAdminSession();
  if (!admin) return response('unauthorized', 401);

  if (request.headers.get('origin') !== request.nextUrl.origin) {
    return response('forbidden', 403);
  }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return response('invalid_request', 400);
  }
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (!Number.isFinite(declaredLength) || declaredLength > MAX_DELETE_BODY_BYTES) {
    return response('invalid_request', 400);
  }

  const body = await request.text();
  if (Buffer.byteLength(body, 'utf8') > MAX_DELETE_BODY_BYTES) {
    return response('invalid_request', 400);
  }
  let input;
  try {
    input = parsePrivateMemoryDeleteRequest(JSON.parse(body));
  } catch {
    return response('invalid_request', 400);
  }

  try {
    return NextResponse.json(await deletePrivateMemoryServer(input), {headers: NO_STORE_HEADERS});
  } catch (error) {
    if (error instanceof PrivateMemoryDeleteError) {
      return response(error.status === 404 ? 'not_found' :
        error.status === 409 ? 'stale_record' : 'temporarily_unavailable', error.status);
    }
    return response('temporarily_unavailable', 503);
  }
}
