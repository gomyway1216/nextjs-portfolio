import { describe, it, expect } from 'vitest';
import {
  act,
  createRoom,
  joinRoom,
  newPlayer,
  pairPlayers,
  project,
  rankPlayers,
  settingsInput,
  textInput,
  tick,
} from '@/lib/ogiri/engine';
import { DEFAULT_SETTINGS, type Room } from '@/lib/ogiri/types';
import { prompts } from '@/lib/ogiri/prompts';

const now = 1_000_000;
function setup(n = 10) {
  const room = createRoom('ABC234', newPlayer('p0', 'secret0', '主催者', '🐱', now), now);
  for (let i = 1; i < n; i++)
    joinRoom(room, newPlayer(`p${i}`, `secret${i}`, `参加者${i}`, '🐶', now));
  return room;
}
function start(room: Room) {
  act(room, 'p0', { type: 'start' }, now, prompts);
}
function allAnswers(room: Room) {
  for (const m of room.matches)
    for (const id of m.players)
      act(room, id, { type: 'answer', matchId: m.id, text: `ひらめき😀 ${id}` }, now + 1, prompts);
}
function next(room: Room) {
  act(room, 'p0', { type: 'next' }, now + 2, prompts);
}

describe('Ogiri party engine', () => {
  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    '%i players have exactly two distinct opponents and prompts',
    (n) => {
      const room = setup(n);
      start(room);
      expect(room.matches).toHaveLength(n);
      expect(new Set(room.matches.map((m) => m.promptId)).size).toBe(n);
      for (const id of Object.keys(room.players)) {
        const assigned = room.matches.filter((m) => m.players.includes(id));
        expect(assigned).toHaveLength(2);
        expect(new Set(assigned.flatMap((m) => m.players).filter((p) => p !== id)).size).toBe(2);
      }
    },
  );
  it('uses history to avoid repeated opponents when alternatives exist', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `p${i}`),
      history: Record<string, number> = {};
    for (const pair of pairPlayers(ids, {})) history[pair.sort().join(':')] = 1;
    const next = pairPlayers(ids, history);
    expect(next.every((pair) => !history[pair.sort().join(':')])).toBe(true);
  });
  it('handles duplicate names, max capacity and late joins', () => {
    const room = setup(11);
    joinRoom(room, newPlayer('p11', 'secret', '主催者', '🐶', now));
    expect(room.players.p11.name).toBe('主催者 2');
    expect(() => joinRoom(room, newPlayer('p12', 'secret', '13人目', '🐶', now))).toThrow('満員');
    start(room);
    expect(() => joinRoom(room, newPlayer('late', 'secret', '途中参加', '🐶', now))).toThrow(
      'ゲーム中',
    );
  });
  it('requires three players, validates settings and Japanese input', () => {
    expect(() => start(setup(2))).toThrow('3人以上');
    expect(textInput(' ＡＢＣ　猫😀\n', 10)).toBe('ABC 猫😀');
    expect(textInput('😀'.repeat(100), 100)).toHaveLength(200);
    expect(textInput('👩‍🚀', 10)).toBe('👩‍🚀');
    expect(() => textInput('あ'.repeat(101), 100)).toThrow();
    expect(() => textInput('', 100)).toThrow();
    expect(() => settingsInput({ ...DEFAULT_SETTINGS, rounds: 100 })).toThrow();
    expect(() => settingsInput({ ...DEFAULT_SETTINGS, categories: ['constructor'] })).toThrow();
  });
  it('never exposes secrets, opponents, future prompts or unpublished answers', () => {
    const room = setup();
    start(room);
    allAnswers(room);
    const tv = project(room, null, now, prompts);
    expect(tv.isHost).toBe(false);
    expect(tv.assignments).toHaveLength(0);
    expect(tv.match).toBeNull();
    expect(JSON.stringify(tv)).not.toContain('secret');
    expect(JSON.stringify(tv)).not.toContain('ひらめき');
    const player = project(room, 'p1', now, prompts);
    expect(player.assignments).toHaveLength(2);
    expect(JSON.stringify(player)).not.toContain('ひらめき😀 p2');
    next(room);
    const voting = project(room, null, now, prompts);
    expect(voting.match?.result).toBeNull();
    expect(voting.assignments).toHaveLength(0);
    expect(voting.match).not.toHaveProperty('players');
  });
  it('rejects impersonated answers, self-match votes and duplicates', () => {
    const room = setup();
    start(room);
    allAnswers(room);
    const match = room.matches[0],
      outsider = Object.keys(room.players).find((id) => !match.players.includes(id))!;
    expect(() =>
      act(room, outsider, { type: 'answer', matchId: match.id, text: '不正' }, now + 1, prompts),
    ).toThrow();
    next(room);
    expect(() =>
      act(room, match.players[0], { type: 'vote', matchId: match.id, choice: 1 }, now + 3, prompts),
    ).toThrow('自分');
    act(room, outsider, { type: 'vote', matchId: match.id, choice: 0 }, now + 3, prompts);
    expect(() =>
      act(room, outsider, { type: 'vote', matchId: match.id, choice: 1 }, now + 4, prompts),
    ).toThrow('投票済み');
  });
  it('scores votes and bonuses exactly once, with equal ranks on ties', () => {
    const room = setup(4);
    start(room);
    allAnswers(room);
    next(room);
    const m = room.matches[0],
      voters = Object.keys(room.players).filter((id) => !m.players.includes(id));
    voters.forEach((id, i) =>
      act(room, id, { type: 'vote', matchId: m.id, choice: i }, now + 3, prompts),
    );
    expect(room.phase).toBe('reveal');
    expect(m.points).toEqual([100, 100]);
    expect(
      rankPlayers(room)
        .slice(0, 2)
        .map((p) => p.rank),
    ).toEqual([1, 1]);
    expect(tick(room, now + 4, prompts)).toBe(false);
    expect(m.points).toEqual([100, 100]);
  });
  it('handles missing answers/votes, server deadlines and pause without scoring empty answers', () => {
    const room = setup();
    start(room);
    const deadline = room.deadline;
    act(room, 'p0', { type: 'pause' }, now + 500, prompts);
    expect(tick(room, deadline + 1, prompts)).toBe(false);
    expect(() =>
      act(
        room,
        'p1',
        { type: 'answer', matchId: room.matches[0].id, text: 'まだ' },
        now + 600,
        prompts,
      ),
    ).toThrow('一時停止');
    act(room, 'p0', { type: 'resume' }, now + 5500, prompts);
    expect(room.deadline).toBe(deadline + 5000);
    expect(() =>
      act(
        room,
        room.matches[0].players[0],
        { type: 'answer', matchId: room.matches[0].id, text: '遅刻' },
        room.deadline,
        prompts,
      ),
    ).toThrow('受付');
    tick(room, room.deadline, prompts);
    tick(room, room.deadline, prompts);
    expect(room.phase).toBe('reveal');
    expect(room.matches[0].points).toEqual([0, 0]);
  });
  it('protects host controls and supports moderation, leave and reconnect', () => {
    const room = setup();
    start(room);
    allAnswers(room);
    next(room);
    expect(() => act(room, 'p1', { type: 'finish' }, now, prompts)).toThrow('主催者');
    const m = room.matches[0],
      voter = Object.keys(room.players).find((id) => !m.players.includes(id))!;
    act(room, voter, { type: 'vote', matchId: m.id, choice: 0 }, now + 3, prompts);
    act(room, 'p0', { type: 'hide', matchId: m.id, choice: 0 }, now + 4, prompts);
    expect(project(room, null, now, prompts).match?.answers[0]).toBeNull();
    expect(m.votes).toEqual({});
    act(room, 'p1', { type: 'leave' }, now, prompts);
    expect(room.players.p1.active).toBe(false);
    act(room, 'p1', { type: 'heartbeat' }, now, prompts);
    expect(room.players.p1.active).toBe(true);
    act(room, 'p0', { type: 'kick', playerId: 'p1' }, now, prompts);
    expect(() => act(room, 'p1', { type: 'heartbeat' }, now, prompts)).toThrow('無効');
  });
  it.each([10, 12])(
    'finishes three full rounds with %i players, conserving scores and changing prompts',
    (n) => {
      const room = setup(n);
      start(room);
      const seen = new Set<string>();
      for (let round = 1; round <= 3; round++) {
        for (const m of room.matches) {
          expect(seen.has(m.promptId)).toBe(false);
          seen.add(m.promptId);
        }
        allAnswers(room);
        next(room);
        for (let i = 0; i < n; i++) {
          const m = room.matches[i];
          Object.keys(room.players)
            .filter((id) => !m.players.includes(id))
            .forEach((id) =>
              act(room, id, { type: 'vote', matchId: m.id, choice: 0 }, now + 3, prompts),
            );
          expect(room.phase).toBe('reveal');
          expect(m.points).toEqual([(n - 2) * 100 + 200, 0]);
          next(room);
        }
        expect(room.phase).toBe('ranking');
        next(room);
      }
      expect(room.phase).toBe('finished');
      expect(rankPlayers(room).reduce((sum, p) => sum + p.score, 0)).toBe(
        3 * n * ((n - 2) * 100 + 200),
      );
      act(room, 'p0', { type: 'rematch' }, now, prompts);
      expect(room.phase).toBe('lobby');
      expect(room.game).toBe(2);
      expect(rankPlayers(room).every((p) => p.score === 0)).toBe(true);
      start(room);
      expect(room.matches.every((m) => !seen.has(m.promptId))).toBe(true);
    },
  );
  it('moderates a revealed answer without double scoring and rejects inherited player keys', () => {
    const room = setup(4);
    start(room);
    allAnswers(room);
    next(room);
    const m = room.matches[0];
    Object.keys(room.players)
      .filter((id) => !m.players.includes(id))
      .forEach((id, i) =>
        act(room, id, { type: 'vote', matchId: m.id, choice: i }, now + 3, prompts),
      );
    expect(m.points).toEqual([100, 100]);
    act(room, 'p0', { type: 'hide', matchId: m.id, choice: 0 }, now + 4, prompts);
    expect(m.points).toEqual([0, 300]);
    expect(room.players[m.players[0]].score).toBe(0);
    expect(room.players[m.players[1]].score).toBe(300);
    act(room, 'p0', { type: 'hide', matchId: m.id, choice: 0 }, now + 5, prompts);
    expect(room.players[m.players[1]].score).toBe(300);
    expect(() => act(room, 'p0', { type: 'kick', playerId: '__proto__' }, now, prompts)).toThrow();
    expect({}).not.toHaveProperty('kicked');
  });
  it('has 1008 distinct original prompts across 12 balanced genres, including Halloween', () => {
    expect(prompts).toHaveLength(1008);
    expect(
      new Set(prompts.map((p) => p.text.normalize('NFKC').replace(/[\p{P}\s]/gu, ''))).size,
    ).toBe(1008);
    expect(
      prompts.every(
        (p) => p.origin === 'original' && p.sourceUrl === null && p.license && p.enabled,
      ),
    ).toBe(true);
    expect(prompts.filter((p) => p.category === 'halloween')).toHaveLength(84);
    const room = setup(12);
    room.settings.halloween = true;
    start(room);
    expect(
      room.matches.every((m) => prompts.find((p) => p.id === m.promptId)?.category === 'halloween'),
    ).toBe(true);
  });
  it('resets cross-game history before starting a newly selected genre with too few unseen prompts', () => {
    const room = setup(12);
    room.usedPrompts = prompts
      .filter((p) => p.category === 'halloween')
      .slice(0, 60)
      .map((p) => p.id);
    room.settings.halloween = true;
    start(room);
    expect(room.usedPrompts).toHaveLength(12);
    allAnswers(room);
    next(room);
    for (let i = 0; i < 12; i++) {
      next(room);
      next(room);
    }
    next(room);
    expect(room.round).toBe(2);
  });
});
