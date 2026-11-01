import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rejoinSeats, requestRejoin } from '@/lib/ogiri/engine';
import { prompts } from '@/lib/ogiri/prompts';
import type { GameType, Room } from '@/lib/ogiri/types';

function room(n: number, gameType: GameType = 'ogiri', autoAdvance = false) {
  const value = createRoom('ABC234', newPlayer('host', 'secret', '進行役', '🐱', 100), 100);
  value.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(value, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', 100));
  act(value, 'host', { type: 'settings', settings: { ...value.settings, gameType, autoAdvance, rounds: 2 } }, 100, prompts);
  act(value, 'host', { type: 'start' }, 100, prompts);
  return value;
}
function toVoting(value: Room) {
  for (const match of value.matches) for (const id of match.players) act(value, id, { type: 'answer', matchId: match.id, text: '回答' }, 101, prompts);
  act(value, 'host', { type: 'next' }, 102, prompts);
  expect(value.phase).toBe('voting');
  return value.matches[0];
}
const voters = (value: Room) => Object.keys(value.players).filter(id => id !== 'host' && !value.matches[0].players.includes(id));

describe('removing a player from ogiri voting', () => {
  it('frees the votes cast for their answer so those voters can choose again', () => {
    const value = room(5);
    const match = toVoting(value);
    const [author, other] = match.players;
    const [a, b, c] = voters(value);
    act(value, a, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    act(value, b, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    act(value, c, { type: 'vote', matchId: match.id, choice: 1 }, 103, prompts);
    act(value, 'host', { type: 'kick', playerId: author }, 104, prompts);
    expect(project(value, a, 104, prompts).match?.voted).toBe(false);
    act(value, a, { type: 'vote', matchId: match.id, choice: 1 }, 105, prompts);
    expect(() => act(value, b, { type: 'vote', matchId: match.id, choice: 0 }, 105, prompts)).toThrow('この回答には投票できません');
    act(value, 'host', { type: 'next' }, 106, prompts);
    expect(value.players[other].score).toBe(2 * 100 + 200);
    expect(match.points).toEqual([0, 400]);
  });

  it('rescores the reveal without the removed voter, whose vote may have decided the win', () => {
    const value = room(5);
    const match = toVoting(value);
    const [first, second] = match.players;
    const [a, b, c] = voters(value);
    act(value, a, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    act(value, b, { type: 'vote', matchId: match.id, choice: 1 }, 103, prompts);
    act(value, c, { type: 'vote', matchId: match.id, choice: 1 }, 103, prompts);
    act(value, 'host', { type: 'next' }, 104, prompts);
    expect(match.points).toEqual([100, 400]);
    act(value, 'host', { type: 'kick', playerId: c }, 105, prompts);
    expect(match.points).toEqual([100, 100]);
    expect(value.players[first].score).toBe(100);
    expect(value.players[second].score).toBe(100);
  });

  it('rescores the reveal when the winning author is the one removed', () => {
    const value = room(5);
    const match = toVoting(value);
    const [first, second] = match.players;
    const [a, b, c] = voters(value);
    act(value, a, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    act(value, b, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    act(value, c, { type: 'vote', matchId: match.id, choice: 1 }, 103, prompts);
    act(value, 'host', { type: 'next' }, 104, prompts);
    expect(value.players[first].score).toBe(400);
    act(value, 'host', { type: 'kick', playerId: first }, 105, prompts);
    expect(match.points).toEqual([0, 300]);
    expect(value.players[second].score).toBe(300);
  });
});

describe('closing ogiri voting early', () => {
  it.each(['leave', 'kick'] as const)('ends the vote on %s of the last undecided voter', how => {
    const value = room(4, 'ogiri', true);
    for (const match of value.matches) for (const id of match.players) act(value, id, { type: 'answer', matchId: match.id, text: '回答' }, 101, prompts);
    for (const id of Object.keys(value.players).filter(id => id !== 'host')) act(value, id, { type: 'answerReady', ready: true }, 102, prompts);
    expect(value.phase).toBe('voting');
    const match = value.matches[0];
    const [voted, undecided] = voters(value);
    act(value, voted, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    expect(value.phase).toBe('voting');
    if (how === 'leave') act(value, undecided, { type: 'leave' }, 104, prompts);
    else act(value, 'host', { type: 'kick', playerId: undecided }, 104, prompts);
    expect(value.phase).toBe('reveal');
    expect(match.scored).toBe(true);
  });

  it('still waits for the host when the game is run by hand', () => {
    const manual = room(4);
    const match = toVoting(manual);
    const [voted, undecided] = voters(manual);
    act(manual, voted, { type: 'vote', matchId: match.id, choice: 0 }, 103, prompts);
    act(manual, undecided, { type: 'leave' }, 104, prompts);
    expect(manual.phase).toBe('voting');
  });
});

describe('removing an author during an identity reveal', () => {
  it('takes back the points for guessing an answer that left the screen', () => {
    const value = room(4, 'identity');
    const ids = Object.keys(value.players).filter(id => id !== 'host');
    for (const id of ids) act(value, id, { type: 'partyAnswer', text: `${id}のひとこと` }, 101, prompts);
    act(value, 'host', { type: 'next' }, 102, prompts);
    const author = value.sideRounds!.at(-1)!.order[0];
    for (const id of ids) if (id !== author) act(value, id, { type: 'partyVote', choice: author }, 103, prompts);
    act(value, 'host', { type: 'next' }, 104, prompts);
    expect(value.phase).toBe('reveal');
    expect(Object.values(value.players).reduce((sum, player) => sum + player.score, 0)).toBe(300);
    act(value, 'host', { type: 'kick', playerId: author }, 105, prompts);
    expect(Object.values(value.players).reduce((sum, player) => sum + player.score, 0)).toBe(0);
    expect(project(value, null, 105, prompts).sideGame?.result?.awards).toEqual([]);
  });
});

it('does not bring back a rejoin request once the owner has checked in', () => {
  const value = room(4);
  const owner = 'p0', later = 100 + 70000;
  value.players[owner].lastSeen = 100;
  requestRejoin(value, owner, 'hash', later);
  act(value, owner, { type: 'heartbeat' }, later + 1000, prompts);
  expect(value.rejoinRequests).toEqual({});
  expect(rejoinSeats(value, later + 1000 + 66000).map(seat => seat.id)).toContain(owner);
  expect(project(value, 'host', later + 1000 + 66000, prompts).rejoinRequests).toEqual([]);
});
