import { NextRequest, NextResponse } from 'next/server';
import { ensureAdmin } from '@/lib/auth-utils';
import { getStudyDocumentsServer } from '@/lib/memory/getPrivateMemoriesServer';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' };
export async function GET(request: NextRequest) {
  const { user, response } = await ensureAdmin(request);
  if (response) { for (const [k, v] of Object.entries(headers)) response.headers.set(k, v); return response; }
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });
  const params = request.nextUrl.searchParams;
  const invalid = [...params.keys()].some(k => !['id', 'version', 'page', 'query', 'course', 'offset', 'limit'].includes(k) || params.getAll(k).length !== 1) ||
    (params.has('id') && !/^doc-[a-f0-9]{32}$/u.test(params.get('id')!)) ||
    (params.has('version') && !/^[a-f0-9]{64}$/u.test(params.get('version')!)) ||
    ['query', 'course'].some(k => (params.get(k)?.length ?? 0) > 200) ||
    ([['page', 1, 10000], ['offset', 0, 100000], ['limit', 1, 50]] as const).some(([k, min, max]) => {
      const value = params.get(k);
      return value !== null && (!/^\d{1,6}$/u.test(value) || Number(value) < min || Number(value) > max);
    });
  if (invalid) return NextResponse.json({ error: 'invalid_request' }, { status: 400, headers });
  try {return NextResponse.json(await getStudyDocumentsServer(params), { headers });}
  catch {return NextResponse.json({ error: 'documents_unavailable' }, { status: 503, headers });}
}
