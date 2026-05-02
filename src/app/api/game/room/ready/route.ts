/**
 * Set Player Ready API
 * POST /api/game/room/ready - Set player ready status
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
export const POST = withActivityLog('next_api.game.room.ready.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { roomId, playerId, ready } = body;

    if (!roomId || !playerId || ready === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await gameRoom.setPlayerReady(roomId, playerId, ready);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error setting player ready:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to set ready status' },
      { status: 500 }
    );
  }
});
