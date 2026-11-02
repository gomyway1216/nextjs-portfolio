import { describe, it, expect } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, shutoutIndex } from '@/lib/ogiri/engine';
import { historyText, snapshotHistory } from '@/lib/ogiri/history';
import { settlePartyPoints } from '@/lib/ogiri/party';
import { roundMultiplier } from '@/lib/ogiri/plan';
import { phaseSound } from '@/lib/ogiri/sound';
import { prompts } from '@/lib/ogiri/prompts';
import type { GameHistory, Match, Room } from '@/lib/ogiri/types';

const now = 1_000_000;
function setup(n: number, rounds: number) {
  const room = createRoom('ABC234', newPlayer('p0', 'secret0', '主催者', '🐱', now), now);
  for (let i = 1; i < n; i++)
    joinRoom(room, newPlayer(`p${i}`, `secret${i}`, `参加者${i}`, '🐶', now));
  room.settings.rounds = rounds;
  act(room, 'p0', { type: 'start' }, now, prompts);
  return room;
}
const next = (room: Room) => act(room, 'p0', { type: 'next' }, now + 2, prompts);
function answerAll(room: Room) {
  for (const m of room.matches)
    for (const id of m.players)
      act(room, id, { type: 'answer', matchId: m.id, text: `回答 ${id}` }, now + 1, prompts);
  next(room);
}
const voters = (room: Room, m: Match) => Object.keys(room.players).filter((id) => !m.players.includes(id));
/** Plays every match of the current round; `choose` picks each voter's answer. */
function playRound(room: Room, choose: (voter: number, match: number) => number) {
  answerAll(room);
  room.matches.forEach((m, j) => {
    voters(room, m).forEach((id, i) =>
      act(room, id, { type: 'vote', matchId: m.id, choice: choose(i, j) }, now + 3, prompts));
    expect(room.phase).toBe('reveal');
    next(room);
  });
  expect(room.phase).toBe('ranking');
  next(room);
}

describe('ogiri shutout bonus and final-round multiplier', () => {
  it('requires every vote, at least two voters and both answers shown', () => {
    expect(shutoutIndex([2, 0], [true, true])).toBe(0);
    expect(shutoutIndex([0, 5], [true, true])).toBe(1);
    expect(shutoutIndex([1, 0], [true, true])).toBeNull();
    expect(shutoutIndex([3, 1], [true, true])).toBeNull();
    expect(shutoutIndex([2, 2], [true, true])).toBeNull();
    expect(shutoutIndex([0, 0], [true, true])).toBeNull();
    expect(shutoutIndex([3, 0], [true, false])).toBeNull();
  });
  it('doubles only the last round of a multi-round game', () => {
    expect([1, 2, 3].map((round) => roundMultiplier(round, 3))).toEqual([1, 1, 2]);
    expect(roundMultiplier(1, 1)).toBe(1);
  });
  it('adds the bonus for a two-voter shutout and shows it at reveal', () => {
    const room = setup(4, 3);
    answerAll(room);
    const m = room.matches[0];
    for (const id of voters(room, m)) act(room, id, { type: 'vote', matchId: m.id, choice: 1 }, now + 3, prompts);
    expect(room.phase).toBe('reveal');
    expect(m.points).toEqual([0, 200 + 200 + 200]);
    expect(m.shutout).toBe(1);
    expect(room.players[m.players[1]].score).toBe(600);
    expect(project(room, null, now + 4, prompts).match).toMatchObject({
      multiplier: 1, result: { counts: [0, 2], points: [0, 600], shutout: 1 },
    });
  });
  it('gives no bonus with a single voter', () => {
    const room = setup(3, 3);
    answerAll(room);
    const m = room.matches[0];
    const [voter] = voters(room, m);
    act(room, voter, { type: 'vote', matchId: m.id, choice: 0 }, now + 3, prompts);
    expect(m.points).toEqual([300, 0]);
    expect(m.shutout).toBeNull();
  });
  it('withdraws the bonus when moderation leaves only one answer', () => {
    const room = setup(5, 3);
    answerAll(room);
    const m = room.matches[0];
    for (const id of voters(room, m)) act(room, id, { type: 'vote', matchId: m.id, choice: 0 }, now + 3, prompts);
    expect(m.points).toEqual([300 + 200 + 200, 0]);
    act(room, 'p0', { type: 'hide', matchId: m.id, choice: 1 }, now + 4, prompts);
    expect(m.points).toEqual([500, 0]);
    expect(m.shutout).toBeNull();
    expect(room.players[m.players[0]].score).toBe(500);
  });
  it('doubles votes, wins and shutouts in the final round and keeps ties equal', () => {
    const room = setup(4, 2);
    expect(room.matches.every((m) => m.multiplier === 1)).toBe(true);
    playRound(room, (voter) => voter % 2);
    expect(rankPlayers(room).every((p) => p.score === 200 && p.rank === 1)).toBe(true);
    expect(room.round).toBe(2);
    expect(room.matches.every((m) => m.multiplier === 2)).toBe(true);
    answerAll(room);
    expect(project(room, null, now + 3, prompts).match?.multiplier).toBe(2);
    // Final-round tie: one vote each is doubled, with no win bonus.
    const tie = room.matches[0];
    voters(room, tie).forEach((id, i) => act(room, id, { type: 'vote', matchId: tie.id, choice: i }, now + 3, prompts));
    expect(tie.points).toEqual([200, 200]);
    next(room);
    // Final-round shutout: (2 votes + win + shutout) × 2.
    const shutout = room.matches[1];
    for (const id of voters(room, shutout)) act(room, id, { type: 'vote', matchId: shutout.id, choice: 0 }, now + 3, prompts);
    expect(shutout.points).toEqual([1200, 0]);
    expect(shutout.shutout).toBe(0);
  });
  it('keeps final ranks and party points tied after a doubled final round', () => {
    const room = setup(4, 2);
    playRound(room, (voter) => voter % 2);
    playRound(room, (voter) => voter % 2);
    expect(room.phase).toBe('finished');
    const standings = rankPlayers(room);
    expect(standings.every((p) => p.score === 200 + 400 && p.rank === 1)).toBe(true);
    settlePartyPoints(room, standings);
    expect(new Set(Object.values(room.players).map((p) => p.partyEarned))).toEqual(new Set([10]));
  });
  it('treats in-flight matches from before the multiplier as single points', () => {
    const room = setup(4, 1);
    answerAll(room);
    const m = room.matches[0];
    delete m.multiplier;
    for (const id of voters(room, m)) act(room, id, { type: 'vote', matchId: m.id, choice: 0 }, now + 3, prompts);
    expect(m.points).toEqual([600, 0]);
    expect(project(room, null, now + 4, prompts).match?.multiplier).toBe(1);
  });
  it('archives the bonus and multiplier, and still renders older histories', () => {
    const room = setup(4, 2);
    playRound(room, () => 0);
    playRound(room, () => 0);
    const history = snapshotHistory(room, 'a'.repeat(32), now + 5, prompts);
    expect(history.matches.filter((m) => m.round === 1).every((m) => !m.multiplier)).toBe(true);
    expect(history.matches.filter((m) => m.round === 2).every((m) => m.multiplier === 2)).toBe(true);
    expect(history.matches.every((m) => m.answers[0].shutout && !m.answers[1].shutout)).toBe(true);
    expect(history.matches.filter((m) => m.round === 2).every((m) => m.answers[0].points === 1200)).toBe(true);
    const text = historyText(history);
    expect(text).toContain('ROUND 2 (得点2倍)');
    expect(text).toContain('1200 点 · 全票ボーナス');
    const legacy: GameHistory = {
      ...history,
      matches: history.matches.map(({ multiplier: _multiplier, ...m }) => ({
        ...m, answers: m.answers.map(({ shutout: _shutout, ...a }) => a),
      })),
    };
    const legacyText = historyText(legacy);
    expect(legacyText).not.toContain('全票ボーナス');
    expect(legacyText).not.toContain('得点2倍');
  });
  it('plays the bigger cheer when a shutout scores', () => {
    const room = setup(4, 3);
    answerAll(room);
    const m = room.matches[0];
    const before = project(room, null, now + 3, prompts);
    for (const id of voters(room, m)) act(room, id, { type: 'vote', matchId: m.id, choice: 0 }, now + 3, prompts);
    const after = project(room, null, now + 4, prompts);
    expect(phaseSound(before, after)).toBe('cheer');
    expect(phaseSound(after, structuredClone(after))).toBeNull();
  });
});
