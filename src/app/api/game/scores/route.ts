import { NextRequest, NextResponse } from 'next/server';
import { getFirestore } from '@/lib/firebase-admin';
import { GAME_SCORES_COLLECTION } from '../../constants';

/**
 * Game high scores stored per player
 * Structure: game_scores/{playerId}/scores/{gameKey}
 * No authentication required - uses a client-generated player ID
 */

/**
 * GET /api/game/scores?playerId=xxx
 * Get all high scores for a player
 * Returns: { scores: { [gameKey]: number } }
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const playerId = searchParams.get('playerId');

    if (!playerId) {
      return NextResponse.json(
        { error: 'Missing playerId parameter' },
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
    console.error('Error fetching game scores:', error);
    return NextResponse.json(
      { error: 'Failed to fetch game scores' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/game/scores
 * Update a high score for a specific game
 * Body: { playerId: string, gameKey: string, score: number }
 * Only updates if the new score is higher than the existing score
 * Returns: { highScore: number, isNewHighScore: boolean }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { playerId, gameKey, score } = body;

    if (!playerId || typeof playerId !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid playerId' },
        { status: 400 }
      );
    }

    if (!gameKey || typeof gameKey !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid gameKey' },
        { status: 400 }
      );
    }

    if (typeof score !== 'number' || score < 0) {
      return NextResponse.json(
        { error: 'Invalid score value' },
        { status: 400 }
      );
    }

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
    console.error('Error updating game score:', error);
    return NextResponse.json(
      { error: 'Failed to update game score' },
      { status: 500 }
    );
  }
}
