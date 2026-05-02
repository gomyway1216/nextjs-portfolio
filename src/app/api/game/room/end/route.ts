/**
 * End Game API
 * POST /api/game/room/end - End the game
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
export const POST = withActivityLog('next_api.game.room.end.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { roomId, winnerId } = body;

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    await gameRoom.endGame(roomId, winnerId || null);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error ending game:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to end game' },
      { status: 500 }
    );
  }
});
