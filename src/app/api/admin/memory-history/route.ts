import { NextRequest, NextResponse } from 'next/server';
import { getPrivateMemoryHistoryServer } from '@/lib/memory/getPrivateMemoriesServer';
import { getServerAdminSession } from '@/lib/serverAdminAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const admin = await getServerAdminSession();
  if (!admin) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const memoryId = request.nextUrl.searchParams.get('memoryId') ?? '';
  if (!/^[A-Za-z\d._:-]{1,128}$/u.test(memoryId)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const items = await getPrivateMemoryHistoryServer(memoryId);
    return NextResponse.json(
      { view: 'history', memoryId, items },
      { headers: { 'Cache-Control': 'private, no-store', Pragma: 'no-cache' } },
    );
  } catch {
    console.error('[memory] Private history is temporarily unavailable');
    return NextResponse.json(
      { error: 'temporarily_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
