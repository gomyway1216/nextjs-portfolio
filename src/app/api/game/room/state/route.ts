/**
 * Update Game State API
 * POST /api/game/room/state - Update game state
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, gameState } = body;

    if (!roomId || !gameState) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await gameRoom.updateGameState(roomId, gameState);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating game state:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update game state' },
      { status: 500 }
    );
  }
}
