import { NextRequest, NextResponse } from 'next/server';
import { revalidateTag } from 'next/cache';
import { HOME_GAMES_CONFIG_DOC_ID, SITE_CONFIG_COLLECTION } from '@/app/api/constants';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';
import { ensureAdmin } from '@/lib/auth-utils';
import { getFirestore, getServerTimestamp } from '@/lib/firebase-admin';
import {
  HOME_GAMES_CACHE_TAG,
  getDuplicateHomeGameIds,
  getUnknownHomeGameIds,
  normalizeHomeGameIds,
} from '@/lib/homeGames';

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

export const GET = withActivityLog('next_api.home-games.GET', async () => {
  try {
    const doc = await getFirestore()
      .collection(SITE_CONFIG_COLLECTION)
      .doc(HOME_GAMES_CONFIG_DOC_ID)
      .get();

    return NextResponse.json({
      gameIds: normalizeHomeGameIds(doc.exists ? doc.data()?.gameIds : undefined),
    });
  } catch (error) {
    console.error('Error fetching home games config:', error);
    return jsonError('Failed to fetch home games config', 500);
  }
});

export const PUT = withActivityLog('next_api.home-games.PUT', async (request: NextRequest) => {
  const { user, response } = await ensureAdmin(request);
  if (!user) return response!;

  try {
    const body = await request.json();
    const { gameIds } = body as { gameIds?: unknown };

    if (!Array.isArray(gameIds)) {
      return jsonError('gameIds must be an array of game ids', 400);
    }

    if (gameIds.length === 0) {
      return jsonError('At least one game must be visible on the home page', 400);
    }

    if (!gameIds.every((gameId) => typeof gameId === 'string')) {
      return jsonError('Every game id must be a string', 400);
    }

    const typedGameIds = gameIds as string[];
    const unknownIds = getUnknownHomeGameIds(typedGameIds);
    if (unknownIds.length > 0) {
      return jsonError(`Unknown game ids: ${unknownIds.join(', ')}`, 400);
    }

    const duplicateIds = getDuplicateHomeGameIds(typedGameIds);
    if (duplicateIds.length > 0) {
      return jsonError(`Duplicate game ids: ${duplicateIds.join(', ')}`, 400);
    }

    await getFirestore()
      .collection(SITE_CONFIG_COLLECTION)
      .doc(HOME_GAMES_CONFIG_DOC_ID)
      .set({
        gameIds: typedGameIds,
        updatedAt: getServerTimestamp(),
        updatedBy: user.uid,
      }, { merge: true });

    revalidateTag(HOME_GAMES_CACHE_TAG, 'max');

    return NextResponse.json({ success: true, gameIds: typedGameIds });
  } catch (error) {
    console.error('Error updating home games config:', error);
    return jsonError('Failed to update home games config', 500);
  }
});
