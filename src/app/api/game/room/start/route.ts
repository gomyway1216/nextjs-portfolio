/**
 * Start Game API
 * POST /api/game/room/start - Start the game (host only)
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, playerId, initialGameState } = body;

    if (!roomId || !playerId || !initialGameState) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await gameRoom.startGame(roomId, playerId, initialGameState);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error starting game:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to start game' },
      { status: 500 }
    );
  }
}
