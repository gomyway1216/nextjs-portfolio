import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { GAME_SCORES_COLLECTION } from '../../constants';
import { withActivityLog } from '@/app/api/_lib/withActivityLog';

// Sanity bounds — game scores are stored under client-supplied playerIds
// (guests use a localStorage-generated id; signed-in users use their uid).
// We can't fully prevent leaderboard cheating without a server-authoritative
// game loop, but capping score and validating id format blocks the obvious
// abuse cases (NaN, Infinity, multi-megabyte ids, path traversal).
const MAX_SCORE = 1_000_000_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && ID_PATTERN.test(id);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

function isFirebaseAdminUnavailable(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes('Firebase projectId is required') ||
    message.includes('Initialization attempted during build phase') ||
    message.includes('Could not load the default credentials')
  );
}

/**
 * GET /api/game/scores?playerId=xxx
 * Get all high scores for a player
 */
export const GET = withActivityLog('next_api.game.scores.GET', async (request: NextRequest) => {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerId = searchParams.get('playerId');

    if (!isValidId(playerId)) {
      return NextResponse.json(
        { error: 'Missing or invalid playerId' },
        { status: 400 }
      );
    }

    const db = getFirestore();
    const scoresPath = `${GAME_SCORES_COLLECTION}/${playerId}/scores`;
    const snapshot = await db.collection(scoresPath).get();

    const scores: Record<string, number> = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      scores[doc.id] = data.highScore || 0;
    });

    return NextResponse.json({ scores });
  } catch (error) {
    if (isFirebaseAdminUnavailable(error)) {
      console.warn('Game score storage unavailable; returning empty scores:', error);
      return NextResponse.json({ scores: {}, unavailable: true });
    }

    console.error('Error fetching game scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game scores' },
      { status: 500 }
    );
  }
});

/**
 * PUT /api/game/scores
 * Update a high score for a specific game
 * Body: { playerId: string, gameKey: string, score: number }
 */
export const PUT = withActivityLog('next_api.game.scores.PUT', async (request: NextRequest) => {
  let requestedScore = 0;

  try {
    const body = await request.json();
    const { playerId, gameKey, score } = body;

    if (!isValidId(playerId)) {
      return NextResponse.json(
        { error: 'Missing or invalid playerId' },
        { status: 400 }
      );
    }

    if (!isValidId(gameKey)) {
      return NextResponse.json(
        { error: 'Missing or invalid gameKey' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > MAX_SCORE) {
      return NextResponse.json(
        { error: 'Invalid score value' },
        { status: 400 }
      );
    }
    requestedScore = score;

    const db = getFirestore();
    const scoreDocPath = `${GAME_SCORES_COLLECTION}/${playerId}/scores/${gameKey}`;
    const docRef = db.doc(scoreDocPath);
    const doc = await docRef.get();

    let currentHighScore = 0;
    if (doc.exists) {
      currentHighScore = doc.data()?.highScore || 0;
    }

    const isNewHighScore = score > currentHighScore;

    if (isNewHighScore) {
      await docRef.set({
        gameKey,
        highScore: score,
        lastUpdated: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      highScore: isNewHighScore ? score : currentHighScore,
      isNewHighScore,
    });
  } catch (error) {
    if (isFirebaseAdminUnavailable(error)) {
      console.warn('Game score storage unavailable; keeping score local only:', error);
      return NextResponse.json({
        highScore: requestedScore,
        isNewHighScore: false,
        unavailable: true,
      });
    }

    console.error('Error updating game score:', error);
    return NextResponse.json(
      { error: 'Failed to update game score' },
      { status: 500 }
    );
  }
});
