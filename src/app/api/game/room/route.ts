/**
 * Game Room API Routes
 * POST /api/game/room - Create a new room
 * GET /api/game/room?roomId=XXX - Get room info
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

import { withActivityLog } from '@/app/api/_lib/withActivityLog';
/**
 * POST /api/game/room
 * Create a new game room
 */
export const POST = withActivityLog('next_api.game.room.POST', async (request: NextRequest) => {
  try {
    const body = await request.json();
    const { hostId, hostName, password, gameType } = body;

    if (!hostId || !hostName || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await gameRoom.createRoom(hostId, hostName, password, gameType);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Error creating game room:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create room' },
      { status: 500 }
    );
  }
});

/**
 * GET /api/game/room?roomId=XXX
 * Get room info
 */
export const GET = withActivityLog('next_api.game.room.GET', async (request: NextRequest) => {
  try {
    const roomId = request.nextUrl.searchParams.get('roomId');

    if (!roomId) {
      return NextResponse.json(
        { success: false, error: 'Missing room ID' },
        { status: 400 }
      );
    }

    const room = await gameRoom.getRoom(roomId);
    if (!room) {
      return NextResponse.json(
        { success: false, error: 'Room not found' },
        { status: 404 }
      );
    }

    // Don't send the password hash to client
    const { password, ...safeRoom } = room;
    return NextResponse.json({ success: true, room: safeRoom });
  } catch (error) {
    console.error('Error getting room:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get room' },
      { status: 500 }
    );
  }
});
