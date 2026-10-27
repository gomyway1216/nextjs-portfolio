import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { NextRequest } from 'next/server';
import { authenticate, identity } from '@/lib/ogiri/store';
import { createRoom, newPlayer } from '@/lib/ogiri/engine';
import { body, guard, roomCode } from '@/lib/ogiri/http';

describe('guest capability and input boundaries', () => {
  it('binds a cryptographic secret to one player in one room, revoking kicked players', () => {
    const session = identity(),
      other = identity();
    const room = createRoom(
      'ABC234',
      newPlayer(session.id, session.hash, '主催者', '🐱', Date.now()),
      Date.now(),
    );
    expect(authenticate(room, session.token)).toBe(session.id);
    expect(authenticate(room, other.token)).toBeNull();
    expect(authenticate(room, `${session.id}.${other.token.split('.')[1]}`)).toBeNull();
    expect(authenticate(room, session.id)).toBeNull();
    expect(authenticate(room, room.code)).toBeNull();
    expect(JSON.stringify(room)).not.toContain(session.token.split('.')[1]);
    room.players[session.id].kicked = true;
    expect(authenticate(room, session.token)).toBeNull();
  });
  it('rejects cross-origin JSON and form posts, malformed codes and oversized streamed input', async () => {
    expect(() =>
      guard(
        new NextRequest('https://meetyudai.com/api/ogiri', {
          method: 'POST',
          headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
        }),
        true,
      ),
    ).toThrow('このサイト');
    expect(() =>
      guard(
        new NextRequest('https://meetyudai.com/api/ogiri', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
        }),
        true,
      ),
    ).toThrow('JSON');
    expect(() => roomCode('../foo')).toThrow();
    expect(roomCode('ABC234')).toBe('ABC234');
    const request = new NextRequest('https://meetyudai.com/api/ogiri', {
      method: 'POST',
      body: 'あ'.repeat(2000),
    });
    await expect(body(request)).rejects.toThrow('長すぎ');
    await expect(
      body(new NextRequest('https://meetyudai.com/api/ogiri', { method: 'POST', body: '[]' })),
    ).rejects.toThrow('確認');
  });
});
