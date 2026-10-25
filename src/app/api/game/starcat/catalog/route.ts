import { NextRequest, NextResponse } from 'next/server';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { CatalogError, validateCharacterCatalog } from '@/components/game/StarcatCaravan/catalog';
import { ensureAdmin } from '@/lib/auth-utils';
import { getOrCreateStarcatCatalog, updateStarcatCatalog } from '@/lib/starcatCatalog';

const NO_STORE = { 'Cache-Control': 'no-store' };

function failed(error: unknown): NextResponse {
  if (error instanceof CatalogError) return NextResponse.json({ error: error.message }, { status: error.status, headers: NO_STORE });
  console.error('[game/starcat/catalog] database operation failed:', error);
  return NextResponse.json({ error: 'The character catalog is temporarily unavailable. Please try again.' }, { status: 503, headers: NO_STORE });
}

export const GET = withActivityLog('next_api.game.starcat.catalog.GET', async () => {
  try {
    return NextResponse.json(await getOrCreateStarcatCatalog(), { headers: NO_STORE });
  } catch (error) { return failed(error); }
});

export const PUT = withActivityLog('next_api.game.starcat.catalog.PUT', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) {
    response!.headers.set('Cache-Control', NO_STORE['Cache-Control']);
    return response!;
  }
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Malformed JSON body.' }, { status: 400, headers: NO_STORE }); }
  try {
    const catalog = validateCharacterCatalog(body);
    return NextResponse.json(await updateStarcatCatalog(catalog, user.uid), { headers: NO_STORE });
  } catch (error) { return failed(error); }
});
