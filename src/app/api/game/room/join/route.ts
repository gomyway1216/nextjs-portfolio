/**
 * Join Game Room API
 * POST /api/game/room/join - Join an existing room
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
export const POST = withActivityLog('next_api.game.room.join.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { roomId, playerId, playerName, password } = body;

    console.log('[Join Room API] Request:', { roomId, playerId, playerName, hasPassword: !!password });

    if (!roomId || !playerId || !playerName || !password) {
      console.log('[Join Room API] Missing fields:', { roomId: !!roomId, playerId: !!playerId, playerName: !!playerName, password: !!password });
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await gameRoom.joinRoom(roomId, playerId, playerName, password);
    console.log('[Join Room API] Result:', { success: result.success, error: result.error });
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Join Room API] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to join room' },
      { status: 500 }
    );
  }
});
