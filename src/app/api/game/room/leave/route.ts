/**
 * Leave Game Room API
 * POST /api/game/room/leave - Leave a room
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
export const POST = withActivityLog('next_api.game.room.leave.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { roomId, playerId } = body;

    if (!roomId || !playerId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await gameRoom.leaveRoom(roomId, playerId);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error leaving game room:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to leave room' },
      { status: 500 }
    );
  }
});
