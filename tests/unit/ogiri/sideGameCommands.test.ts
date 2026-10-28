import { expect, it, vi } from 'vitest';
import type { Room } from '@/lib/ogiri/types';
const memory = vi.hoisted(() => ({ room: null as Room | null, writes: 0 }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ data: () => structuredClone(memory.room), updateTime: {} }),
    create: async (room: Room) => { memory.room = structuredClone(room); memory.writes++; },
    update: async (room: Room) => { memory.room = structuredClone(room); memory.writes++; },
  }) }) }),
}));
import { act, createRoom, joinRoom, newPlayer } from '@/lib/ogiri/engine';
import { command, identity, makeRoom } from '@/lib/ogiri/store';
import { prompts } from '@/lib/ogiri/prompts';

function setup(gameType: 'majority' | 'identity') {
  vi.stubEnv('OGIRI_EMULATOR', '');
  const session = identity();
  const now = Date.now();
  const room = createRoom('ABC234', newPlayer(session.id, session.hash, 'host', 'rabbit', now), now);
  for (const id of ['b', 'c']) joinRoom(room, newPlayer(id, id, id, 'pudding', now));
  room.settings.gameType = gameType;
  act(room, session.id, { type: 'start' }, now, prompts);
  memory.room = room;
  memory.writes = 0;
  return { session, room, now, turn: `${room.game}:${room.round}:${room.phase}:${room.matchIndex}` };
}

it('creates the selected mode and rejects invalid modes before saving a room', async () => {
  vi.stubEnv('OGIRI_EMULATOR', '');
  const result = await makeRoom('進行役', 'rabbit', false, 'identity');
  expect(result.view.gameType).toBe('identity');
  expect(result.view.settings.gameType).toBe('identity');
  const writes = memory.writes;
  await expect(makeRoom('進行役', 'rabbit', false, 'unknown')).rejects.toThrow('ゲーム');
  expect(memory.writes).toBe(writes);
  vi.unstubAllEnvs();
});

it.each(['majority', 'identity'] as const)('requires the current turn on %s commands before writing', async gameType => {
  const { session, room, turn } = setup(gameType);
  const action = gameType === 'majority' ? { type: 'partyVote' as const, choice: '0' } : { type: 'partyAnswer' as const, text: '自分だけの回答' };
  await expect(command(room.code, session.token, action, `${turn}:old`)).rejects.toMatchObject({ status: 409 });
  expect(memory.writes).toBe(0);
  const view = await command(room.code, session.token, action, turn);
  expect(memory.writes).toBe(1);
  expect(view.gameType).toBe(gameType);
  if (gameType === 'identity') expect(view.sideGame?.answer).toBe('自分だけの回答');
  else expect(view.sideGame?.voted).toBe(true);
  vi.unstubAllEnvs();
});
