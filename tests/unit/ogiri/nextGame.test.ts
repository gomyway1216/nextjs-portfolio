import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { prompts } from '@/lib/ogiri/prompts';
import type { Action, GameType } from '@/lib/ogiri/types';

function finishedRoom() {
  const room = createRoom('ABC234', newPlayer('host', 'host-secret', '進行役', 'rabbit', 0), 0);
  room.players.host.spectator = true;
  for (const id of ['a', 'b', 'c']) joinRoom(room, newPlayer(id, `${id}-secret`, id, 'pudding', 0));
  room.phase = 'finished'; room.round = 1; room.gameType = 'ogiri';
  room.players.a.score = 400; room.players.a.partyPoints = 10; room.players.a.active = false;
  room.players.a.passphraseHash = { salt: 'a'.repeat(32), hash: 'b'.repeat(64) };
  room.history = [{ id: 'a'.repeat(32), code: room.code, game: 1, finishedAt: 10, expiresAt: 10000, gameType: 'ogiri' }];
  return room;
}

it.each(['ogiri', 'majority', 'identity', 'drawing', 'minority', 'thermometer'] satisfies GameType[])(
  'selects %s in the rematch without replacing participants, secrets, totals or history', gameType => {
    const room = finishedRoom();
    const player = structuredClone(room.players.a);
    const history = structuredClone(room.history);
    act(room, 'host', { type: 'rematch', gameType }, 20, prompts);
    expect(room).toMatchObject({ code: 'ABC234', hostId: 'host', phase: 'lobby', game: 2, round: 0 });
    expect(room.settings.gameType).toBe(gameType);
    expect(room.settings.rounds).toBe(gameType === 'drawing' ? 1 : 3);
    expect(room.players.a).toMatchObject({
      id: player.id, name: player.name, avatar: player.avatar, secretHash: player.secretHash,
      passphraseHash: player.passphraseHash, partyPoints: 10, active: false, score: 0,
    });
    expect(room.history).toEqual(history);
    expect(Object.keys(room.players)).toEqual(['host', 'a', 'b', 'c']);
    expect(project(room, 'host', 20, prompts).gameType).toBe(gameType);
  });

it('rejects non-hosts and switching before the game is finished', () => {
  const room = finishedRoom();
  const before = JSON.stringify(room);
  expect(() => act(room, 'a', { type: 'rematch', gameType: 'majority' }, 20, prompts)).toThrow('主催者');
  expect(JSON.stringify(room)).toBe(before);
  room.phase = 'answering';
  expect(() => act(room, 'host', { type: 'rematch', gameType: 'majority' }, 20, prompts)).toThrow('終了後');
  expect(room.phase).toBe('answering');
});

it('validates a choice before changing the finished game or its settings', () => {
  const room = finishedRoom();
  const before = JSON.stringify(room);
  for (const gameType of ['unknown', null, 123]) {
    expect(() => act(room, 'host', { type: 'rematch', gameType } as Action, 20, prompts)).toThrow('ゲーム');
    expect(JSON.stringify(room)).toBe(before);
  }
  expect(() => act(room, 'host', { type: 'rematch', gameType: 'ogiri' }, 20, prompts.slice(0, 1))).toThrow('お題が不足');
  expect(JSON.stringify(room)).toBe(before);
});

it('keeps the existing saved mode when an older client sends a rematch without a choice', () => {
  const room = finishedRoom();
  room.settings.gameType = 'identity';
  act(room, 'host', { type: 'rematch' }, 20, prompts);
  expect(project(room, 'host', 20, prompts).gameType).toBe('identity');
});
