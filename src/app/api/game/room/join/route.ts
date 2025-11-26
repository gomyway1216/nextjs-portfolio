/**
 * Join Game Room API
 * POST /api/game/room/join - Join an existing room
 */

import { NextRequest, NextResponse } from 'next/server';
import * as gameRoom from '@/lib/gameRoom';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, playerId, playerName, password } = body;

    if (!roomId || !playerId || !playerName || !password) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await gameRoom.joinRoom(roomId, playerId, playerName, password);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error joining game room:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to join room' },
      { status: 500 }
    );
  }
}
