import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, settingsInput } from '@/lib/ogiri/engine';
import { snapshotHistory } from '@/lib/ogiri/history';
import { roundPlan } from '@/lib/ogiri/plan';
import { prompts } from '@/lib/ogiri/prompts';
import { DEFAULT_SETTINGS, maxRounds, roundsFor, type Room, type Settings } from '@/lib/ogiri/types';

const FIRESTORE_LIMIT = 1048576;
const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;
const playerId = (i: number) => String(i).padStart(24, 'a'); // The same length as real session IDs.
function lobby(n: number, settings: Partial<Settings> = {}) {
  const room = createRoom('ABC234', newPlayer('host', 'secret', '進行だけ', '🐱', 100), 100);
  room.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(room, newPlayer(playerId(i), 's'.repeat(64), `とても長い名前の参加者${i}`, 'rabbit', 100));
  act(room, 'host', { type: 'settings', settings: { ...room.settings, ...settings } }, 100, prompts);
  return room;
}
/** Plays one round with everyone answering at the longest allowed length and every vote cast. */
function playRound(room: Room, pool = prompts) {
  const text = '😀'.repeat(100);
  const ids = [...new Set(room.matches.flatMap(match => match.players))];
  for (const match of room.matches) for (const id of match.players) act(room, id, { type: 'answer', matchId: match.id, text }, 101, pool);
  for (const id of ids) act(room, id, { type: 'answerReady', ready: true }, 102, pool);
  expect(room.phase).toBe('voting');
  for (const match of [...room.matches]) {
    for (const id of ids) if (!match.players.includes(id)) act(room, id, { type: 'vote', matchId: match.id, choice: 0 }, 103, pool);
    act(room, 'host', { type: 'next' }, 104, pool);
  }
  expect(room.phase).toBe('ranking');
  act(room, 'host', { type: 'next' }, 105, pool);
}

describe('round limits', () => {
  it('lets ogiri run to 20 rounds while the short modes stay at 5', () => {
    expect(settingsInput({ ...DEFAULT_SETTINGS, rounds: 20 }).rounds).toBe(20);
    expect(settingsInput({ ...DEFAULT_SETTINGS, gameType: 'ogiri', rounds: 20 }).rounds).toBe(20);
    expect(() => settingsInput({ ...DEFAULT_SETTINGS, rounds: 21 })).toThrow('1〜20');
    for (const gameType of ['majority', 'identity'] as const) {
      expect(settingsInput({ ...DEFAULT_SETTINGS, gameType, rounds: 5 }).rounds).toBe(5);
      expect(() => settingsInput({ ...DEFAULT_SETTINGS, gameType, rounds: 6 })).toThrow('1〜5');
    }
    expect(maxRounds()).toBe(20);
    expect(roundPlan(12, 20)).toMatchObject({ totalQuestions: 240, totalAnswersPerPlayer: 40 });
    expect(roundPlan(4, 21)).toBeNull();
  });

  it('fits long rounds into the next game instead of rejecting the switch', () => {
    expect(roundsFor('majority', 20)).toBe(5);
    expect(roundsFor('shiritori', 20)).toBe(20);
    expect(roundsFor('ogiri', 20)).toBe(20);
    const room = lobby(3, { rounds: 20 });
    room.phase = 'finished';
    act(room, 'host', { type: 'rematch', gameType: 'identity' }, 110, prompts);
    expect(room.settings).toMatchObject({ gameType: 'identity', rounds: 5 });
  });

  it.each(['drawing', 'shiritori'] as const)('keeps the chosen round count through a %s game for the next one', gameType => {
    const room = lobby(3, { rounds: 7 });
    act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType } }, 106, prompts);
    act(room, 'host', { type: 'start' }, 110, prompts);
    expect(room.settings.rounds).toBe(7);
    act(room, 'host', { type: 'finish' }, 111, prompts);
    act(room, 'host', { type: 'rematch', gameType: 'ogiri' }, 112, prompts);
    expect(room.settings).toMatchObject({ gameType: 'ogiri', rounds: 7 });
  });

  it('checks prompts against the real head count, so a small Halloween party can play long', () => {
    const halloween = prompts.filter(p => p.category === 'halloween').length;
    expect(halloween).toBe(84);
    const room = lobby(4, { halloween: true, rounds: 20 });
    expect(room.settings.rounds).toBe(20);
    act(room, 'host', { type: 'start' }, 110, prompts);
    expect(room.phase).toBe('answering');
    expect(() => lobby(5, { halloween: true, rounds: 17 })).toThrow('お題が不足');
    expect(lobby(5, { halloween: true, rounds: 16 }).settings.rounds).toBe(16);
  });

  it('rechecks at the start when people joined after the settings were saved', () => {
    const room = lobby(4, { halloween: true, rounds: 20 });
    joinRoom(room, newPlayer(playerId(4), 's', '後から参加', 'rabbit', 100));
    expect(() => act(room, 'host', { type: 'start' }, 110, prompts)).toThrow('お題が不足');
    expect(room.phase).toBe('lobby');
  });

  it('ends the game instead of stalling when a returning player outgrows the prompts', () => {
    const few = prompts.slice(0, 12), resting = playerId(4);
    const room = lobby(5);
    act(room, resting, { type: 'leave' }, 106, few);
    act(room, 'host', { type: 'settings', settings: { ...room.settings, rounds: 3 } }, 107, few);
    act(room, 'host', { type: 'start' }, 110, few);
    playRound(room, few);
    expect(room).toMatchObject({ phase: 'answering', round: 2 });
    act(room, resting, { type: 'return' }, 120, few);
    // Four prompts remain for five players, so round 2 is the last one.
    playRound(room, few);
    expect(room).toMatchObject({ phase: 'finished', round: 2 });
  });
});

describe('a full 20-round game', () => {
  it('stays within Firestore limits at 12 players with the longest answers, never repeating a prompt', () => {
    const room = lobby(12, { rounds: 20 });
    act(room, 'host', { type: 'start' }, 110, prompts);
    for (let round = 0; round < 20; round++) {
      expect(room.round).toBe(round + 1);
      playRound(room);
    }
    expect(room.phase).toBe('finished');
    expect(room.usedPrompts).toHaveLength(240);
    expect(new Set(room.usedPrompts).size).toBe(240);
    const history = snapshotHistory(room, 'a'.repeat(32), 200, prompts);
    expect(history.matches).toHaveLength(240);
    expect(size(room)).toBeLessThan(FIRESTORE_LIMIT * .6);
    expect(size(history)).toBeLessThan(FIRESTORE_LIMIT * .6);
    // Polls stay small however long the game ran: past rounds never reach the client.
    expect(size(project(room, playerId(0), 200, prompts))).toBeLessThan(30000);
  });
});
