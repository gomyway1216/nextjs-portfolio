import { describe, it, expect } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { HISTORY_TTL, historyText, snapshotHistory, validHistoryId } from '@/lib/ogiri/history';
import { readLocalHistory } from '@/lib/ogiri/history-local';
import { prompts } from '@/lib/ogiri/prompts';
import type { Room } from '@/lib/ogiri/types';
const now = 1_000_000;
const id = 'a'.repeat(32);
function setup(n = 4) {
  const room = createRoom('ABC234', newPlayer('p0', 'secret', '主催者', '🐱', now), now);
  for (let i = 1; i < n; i++)
    joinRoom(room, newPlayer(`p${i}`, `secret${i}`, `参加者${i}`, '🐶', now));
  room.settings.autoAdvance = false;
  return room;
}
function next(room: Room) {
  act(room, 'p0', { type: 'next' }, now + 3, prompts);
}
function answerRound(room: Room) {
  for (const match of room.matches)
    for (const player of match.players)
      act(
        room,
        player,
        {
          type: 'answer',
          matchId: match.id,
          text: `回答${room.round} <script>alert(1)</script>😀`,
        },
        now + 1,
        prompts,
      );
}
function completeRound(room: Room) {
  answerRound(room);
  next(room);
  for (const match of room.matches) {
    const voters = Object.keys(room.players).filter((p) => !match.players.includes(p));
    voters.forEach((p, i) =>
      act(room, p, { type: 'vote', matchId: match.id, choice: i % 2 }, now + 2, prompts),
    );
    next(room);
    next(room);
  }
  next(room);
}
describe('durable game history', () => {
  it('keeps the display host out of capacity, assignments, votes, scores and saved rankings', () => {
    const room = setup(3);
    room.players.p0.spectator = true;
    expect(() => act(room, 'p0', { type: 'start' }, now, prompts)).toThrow('3人以上');
    for (let i = 3; i <= 12; i++)
      joinRoom(room, newPlayer(`p${i}`, `secret${i}`, `参加者${i}`, '🐶', now));
    expect(project(room, 'p0', now, prompts).players).toHaveLength(12);
    expect(() =>
      act(room, 'p0', { type: 'hostParticipation', participating: true }, now, prompts),
    ).toThrow('満員');
    expect(() =>
      act(room, 'p1', { type: 'hostParticipation', participating: true }, now, prompts),
    ).toThrow('主催者');
    act(room, 'p0', { type: 'start' }, now, prompts);
    expect(room.matches).toHaveLength(12);
    expect(room.matches.every((m) => !m.players.includes('p0'))).toBe(true);
    expect(project(room, 'p0', now, prompts)).toMatchObject({
      isHost: true,
      hostPlays: false,
      assignments: [],
    });
    answerRound(room);
    next(room);
    const view = project(room, 'p0', now, prompts);
    expect(view.match).toMatchObject({ canVote: false, eligible: 10 });
    expect(() =>
      act(room, 'p0', { type: 'vote', matchId: room.matches[0].id, choice: 0 }, now + 2, prompts),
    ).toThrow();
    expect(() =>
      act(room, 'p0', { type: 'hostParticipation', participating: true }, now, prompts),
    ).toThrow('開始前');
    expect(snapshotHistory(room, id, now, prompts).rankings).toHaveLength(12);
  });
  it('allows an existing participant-host to become a display host before a new game', () => {
    const room = setup(4);
    act(room, 'p0', { type: 'hostParticipation', participating: false }, now, prompts);
    act(room, 'p0', { type: 'heartbeat' }, now, prompts);
    expect(project(room, 'p0', now, prompts).players).toHaveLength(3);
    act(room, 'p0', { type: 'hostParticipation', participating: true }, now, prompts);
    expect(project(room, 'p0', now, prompts).players).toHaveLength(4);
  });
  it('preserves all five rounds, votes, tie ranks and scores independently of rematch', () => {
    const room = setup(12);
    room.settings.rounds = 5;
    act(room, 'p0', { type: 'start' }, now, prompts);
    for (let i = 0; i < 5; i++) completeRound(room);
    expect(room.phase).toBe('finished');
    const history = snapshotHistory(room, id, now + 4, prompts);
    expect(history.matches).toHaveLength(60);
    expect(new Set(history.matches.map((m) => m.round))).toEqual(new Set([1, 2, 3, 4, 5]));
    expect(
      history.matches.every((m) => m.answers.every((a) => a.votes === 5 && !a.shutout &&
        a.points === (m.round === 5 ? 1000 : 500))),
    ).toBe(true);
    expect(history.matches.filter((m) => m.multiplier === 2).map((m) => m.round)).toEqual(Array(12).fill(5));
    expect(history.rankings.every((p) => p.rank === 1 && p.score === 6000)).toBe(true);
    expect(history.expiresAt - history.finishedAt).toBe(HISTORY_TTL);
    expect(Buffer.byteLength(JSON.stringify(history))).toBeLessThan(100_000);
    const text = historyText(history);
    expect(text).toContain('ROUND 1');
    expect(text).toContain('ROUND 5 (得点2倍)');
    expect(text).not.toContain('ROUND 4 (得点');
    expect(text).toContain('5票');
    expect(JSON.stringify(history)).not.toContain('secret');
    expect(JSON.stringify(history)).not.toContain('p0');
    const before = structuredClone(history);
    act(room, 'p0', { type: 'rematch' }, now + 5, prompts);
    act(room, 'p0', { type: 'start' }, now + 6, prompts);
    expect(history).toEqual(before);
    expect(room.pastRounds).toEqual([]);
    expect(room.players.p0.score).toBe(0);
  });
  it('does not expose unscored answers, future prompts, hidden answers or individual voters', () => {
    const room = setup();
    act(room, 'p0', { type: 'start' }, now, prompts);
    answerRound(room);
    expect(snapshotHistory(room, id, now, prompts).matches).toEqual([]);
    next(room);
    const match = room.matches[0];
    for (const p of Object.keys(room.players).filter((p) => !match.players.includes(p)))
      act(room, p, { type: 'vote', matchId: match.id, choice: 0 }, now + 2, prompts);
    next(room);
    act(room, 'p0', { type: 'hide', matchId: match.id, choice: 0 }, now + 3, prompts);
    act(room, 'p0', { type: 'finish' }, now + 4, prompts);
    const history = snapshotHistory(room, id, now + 5, prompts);
    expect(history.matches).toHaveLength(1);
    expect(history.matches[0].answers[0]).toMatchObject({ text: null, votes: 0, points: 0 });
    expect(history.matches[0]).not.toHaveProperty('players');
    expect(project(room, null, now, prompts)).not.toHaveProperty('pastRounds');
    expect(project(room, null, now, prompts)).not.toHaveProperty('historyId');
  });
  it('excludes kicked names and answers from the snapshot', () => {
    const room = setup();
    act(room, 'p0', { type: 'start' }, now, prompts);
    completeRound(room);
    room.players.p1.kicked = true;
    const history = snapshotHistory(room, id, now, prompts);
    expect(JSON.stringify(history)).not.toContain('参加者1');
    expect(history.rankings).toHaveLength(3);
  });
  it('redacts missing players without losing the rest of a finished game', () => {
    const room = setup();
    act(room, 'p0', { type: 'start' }, now, prompts);
    completeRound(room);
    delete room.players.p1;
    const history = snapshotHistory(room, id, now, prompts);
    expect(history.matches).toHaveLength(4);
    const missing = history.matches.flatMap((m) => m.answers).filter((a) => a.name === '退出したプレイヤー');
    expect(missing).toHaveLength(2);
    expect(missing.every((a) => a.text === null && a.votes === 0 && a.points === 0)).toBe(true);
  });
  it('validates unguessable link identifiers and prunes corrupt/expired browser entries', () => {
    expect(validHistoryId(id)).toBe(true);
    expect(validHistoryId('ABC234')).toBe(false);
    expect(validHistoryId('../private')).toBe(false);
    const ref = { id, code: 'ABC234', game: 1, finishedAt: now, expiresAt: now + HISTORY_TTL };
    expect(
      readLocalHistory(
        { getItem: () => JSON.stringify([ref, { ...ref, id: 'bad' }, { ...ref, expiresAt: 1 }]) },
        now,
      ),
    ).toEqual([ref]);
    expect(readLocalHistory({ getItem: () => 'invalid' }, now)).toEqual([]);
    expect(
      readLocalHistory(
        {
          getItem: () => {
            throw new Error('disabled');
          },
        },
        now,
      ),
    ).toEqual([]);
  });
});
