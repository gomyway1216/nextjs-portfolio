import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, settingsInput, tick } from '@/lib/ogiri/engine';
import { snapshotHistory, historyText, HISTORY_TTL } from '@/lib/ogiri/history';
import { gamePlayerIds, settlePartyPoints } from '@/lib/ogiri/party';
import { currentSideRound } from '@/lib/ogiri/side-games';
import { MAJORITY_PROMPTS, IDENTITY_PROMPTS } from '@/lib/ogiri/side-prompts';
import { prompts } from '@/lib/ogiri/prompts';
import type { GameType, Room } from '@/lib/ogiri/types';

const now = 10000;
function setup(count: number, gameType: GameType, automatic = true, rounds = 1) {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < count; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType, autoAdvance: automatic, rounds };
  act(room, 'host', { type: 'start' }, now, prompts, () => 0.3);
  return room;
}
const ids = (room: Room) => currentSideRound(room)!.players;
const next = (room: Room) => act(room, 'host', { type: 'next' }, now + 10, prompts, () => 0.3);
function answer(room: Room, time = now + 1) {
  for (const id of ids(room)) {
    act(room, id, { type: 'partyAnswer', text: `ひみつの回答${id}` }, time, prompts);
    act(room, id, { type: 'answerReady', ready: true }, time, prompts, () => 0.3);
  }
}

it.each([3, 4, 10, 12])('majority gives %i players equal votes and scores only the most popular option', count => {
  const room = setup(count, 'majority');
  expect(room.phase).toBe('voting');
  expect(project(room, 'host', now, prompts).sideGame?.canVote).toBe(false);
  const size = Math.floor(count / 2) + 1;
  for (const [index, id] of ids(room).entries()) {
    const view = project(room, id, now, prompts);
    expect(view.sideGame).toMatchObject({ canVote: true, result: null, eligible: count, answerRequired: false });
    expect(view.sideGame).not.toHaveProperty('ballots');
    act(room, id, { type: 'partyVote', choice: index < size ? '0' : '1' }, now + 1, prompts);
  }
  expect(room.phase).toBe('reveal');
  expect(project(room, null, now, prompts).sideGame?.result?.counts).toMatchObject({ '0': size, '1': count - size });
  expect(ids(room).map(id => room.players[id].score)).toEqual(Array.from({ length: count }, (_, i) => i < size ? 100 : 0));
  next(room); next(room);
  expect(room.phase).toBe('finished');
  settlePartyPoints(room, rankPlayers(room));
  const awarded = ids(room).map(id => room.players[id].partyPoints);
  settlePartyPoints(room, rankPlayers(room));
  expect(ids(room).map(id => room.players[id].partyPoints)).toEqual(awarded);
  expect(room.partyGames).toBe(1);
  const history = snapshotHistory(room, 'a'.repeat(32), now, prompts);
  expect(history).toMatchObject({ gameType: 'majority', expiresAt: now + HISTORY_TTL });
  expect(history.matches).toHaveLength(1);
  expect(history.matches[0].awards).toHaveLength(size);
  expect(historyText(history)).toContain('みんなの多数決');
});

it('majority awards tied leaders equally, never awards an empty option, and closes timed voting', () => {
  const room = setup(4, 'majority', false);
  for (const [i, id] of ids(room).entries()) act(room, id, { type: 'partyVote', choice: String(i % 2) }, now + 1, prompts);
  expect(() => act(room, 'p0', { type: 'partyVote', choice: '1' }, now + 2, prompts)).toThrow('投票済み');
  expect(() => act(room, 'host', { type: 'partyVote', choice: '0' }, now + 2, prompts)).toThrow();
  next(room);
  expect(ids(room).map(id => room.players[id].score)).toEqual([100, 100, 100, 100]);
  expect(project(room, null, now, prompts).sideGame?.result?.counts['2']).toBe(0);
  const empty = setup(3, 'majority');
  expect(tick(empty, empty.deadline, prompts)).toBe(true);
  expect(empty.phase).toBe('reveal');
  expect(project(empty, null, now, prompts).sideGame?.result?.awards).toEqual([]);
  expect(ids(empty).every(id => empty.players[id].score === 0)).toBe(true);
});

it.each([3, 4, 10, 12])('identity keeps %i private answers hidden, then scores correct guesses and author bluffs', count => {
  const room = setup(count, 'identity');
  const participants = [...ids(room)];
  act(room, 'p0', { type: 'partyAnswer', text: 'ひみつの回答p0' }, now + 1, prompts);
  expect(project(room, 'p0', now, prompts).sideGame?.answer).toBe('ひみつの回答p0');
  expect(JSON.stringify(project(room, null, now, prompts))).not.toContain('ひみつ');
  answer(room);
  expect(room.phase).toBe('voting');
  const round = currentSideRound(room)!;
  expect(round.order).toHaveLength(count);
  for (let index = 0; index < count; index++) {
    const author = round.order[index];
    const voters = participants.filter(id => id !== author);
    const tv = project(room, null, now, prompts);
    expect(tv.sideGame).toMatchObject({ revealText: `ひみつの回答${author}`, result: null, canVote: false, eligible: count - 1 });
    expect(tv.sideGame).not.toHaveProperty('order');
    if (index + 1 < count) expect(JSON.stringify(tv)).not.toContain(`ひみつの回答${round.order[index + 1]}`);
    expect(project(room, author, now, prompts).sideGame).toMatchObject({ isAuthor: true, canVote: false });
    expect(() => act(room, author, { type: 'partyVote', choice: author }, now + 2, prompts)).toThrow('自分の回答');
    for (const [i, id] of voters.entries())
      act(room, id, { type: 'partyVote', choice: i === 0 ? author : voters[0] }, now + 2, prompts);
    expect(room.phase).toBe('reveal');
    const result = project(room, null, now, prompts).sideGame?.result;
    expect(result?.correctOption).toBe(author);
    expect(result?.awards).toContainEqual({ id: voters[0], points: 100 });
    expect(result?.awards).toContainEqual({ id: author, points: (count - 2) * 50 });
    next(room);
  }
  expect(room.phase).toBe('ranking');
  expect(participants.reduce((sum, id) => sum + room.players[id].score, 0)).toBe(count * (100 + (count - 2) * 50));
  next(room);
  const history = snapshotHistory(room, 'b'.repeat(32), now, prompts);
  expect(history.gameType).toBe('identity');
  expect(history.matches).toHaveLength(count);
  expect(history.matches[0].answers[0].votes).toBe(1);
  expect(history.matches[0].awards).toHaveLength(2);
  expect(historyText(history)).toContain('だれのひとこと？');
});

it('identity waits after the guide and lets confirmed players undo, while manual progress waits for the host', () => {
  const room = setup(3, 'identity', false);
  const late = room.deadline + 60000;
  expect(tick(room, late, prompts)).toBe(false);
  expect(() => act(room, 'p0', { type: 'answerReady', ready: true }, late, prompts)).toThrow('回答を送信');
  answer(room, late);
  expect(room.phase).toBe('answering');
  expect(() => act(room, 'p0', { type: 'partyAnswer', text: '変えたい' }, late, prompts)).toThrow('回答を直す');
  act(room, 'p0', { type: 'answerReady', ready: false }, late, prompts);
  act(room, 'p0', { type: 'partyAnswer', text: ' ＡＢＣ　猫😀 ' }, late, prompts);
  expect(project(room, 'p0', late, prompts).sideGame?.answer).toBe('ABC 猫😀');
  expect(() => act(room, 'p0', { type: 'partyAnswer', text: 'あ'.repeat(101) }, late, prompts)).toThrow('100文字');
  act(room, 'host', { type: 'next' }, late, prompts);
  expect(room.phase).toBe('voting');
  expect(() => act(room, 'p0', { type: 'partyAnswer', text: '締切後' }, late, prompts)).toThrow('受付');
});

it('leaving and kicking remove blockers without revealing future identities', () => {
  const room = setup(4, 'identity');
  for (const id of ['p0', 'p1', 'p2']) {
    act(room, id, { type: 'partyAnswer', text: `回答${id}` }, now + 1, prompts);
    act(room, id, { type: 'answerReady', ready: true }, now + 1, prompts);
  }
  act(room, 'p3', { type: 'leave' }, now + 2, prompts);
  expect(room.phase).toBe('voting');
  expect(currentSideRound(room)?.order).toHaveLength(3);
  const author = currentSideRound(room)!.order[0];
  act(room, 'host', { type: 'kick', playerId: author }, now + 3, prompts);
  expect(room.phase).toBe('reveal');
  const tv = project(room, null, now, prompts);
  expect(tv.sideGame).toMatchObject({ revealText: null, result: { correctOption: null, awards: [] } });
  expect(tv.sideGame?.options.some(option => option.id === author)).toBe(false);
  next(room);
  expect(room.phase).toBe('voting');
  const majority = setup(3, 'majority');
  act(majority, 'p0', { type: 'partyVote', choice: '0' }, now + 1, prompts);
  act(majority, 'p1', { type: 'partyVote', choice: '0' }, now + 1, prompts);
  act(majority, 'p2', { type: 'leave' }, now + 2, prompts);
  expect(majority.phase).toBe('reveal');
});

it.each(['majority', 'identity'] as const)('%s counts active voter progress while retaining a resting voter’s ballot and award at reveal', type => {
  const room = setup(5, type);
  if (type === 'identity') answer(room);
  const author = type === 'identity' ? currentSideRound(room)!.order[0] : null;
  const voters = ids(room).filter(id => id !== author);
  const choice = author ?? '0';
  act(room, voters[0], { type: 'partyVote', choice }, now + 2, prompts);
  act(room, voters[0], { type: 'leave' }, now + 3, prompts);
  expect(project(room, null, now + 3, prompts).sideGame).toMatchObject({ eligible: voters.length - 1, votesReceived: 0 });
  act(room, voters[1], { type: 'partyVote', choice }, now + 4, prompts);
  expect(project(room, null, now + 4, prompts).sideGame).toMatchObject({ eligible: voters.length - 1, votesReceived: 1 });
  for (const id of voters.slice(2)) act(room, id, { type: 'partyVote', choice }, now + 5, prompts);
  expect(room.phase).toBe('reveal');
  expect(project(room, null, now + 5, prompts).sideGame?.votesReceived).toBe(voters.length);
  expect(project(room, null, now + 5, prompts).sideGame?.result?.counts[choice]).toBe(voters.length);
  expect(room.players[voters[0]].score).toBe(100);
});

it('mode selection for the next game cannot relabel old results, points or immutable history', () => {
  const room = setup(3, 'majority');
  for (const id of ids(room)) act(room, id, { type: 'partyVote', choice: '0' }, now + 1, prompts);
  next(room); next(room);
  settlePartyPoints(room, rankPlayers(room));
  expect(room.partyGames).toBe(1);
  expect(gamePlayerIds(room).has('host')).toBe(false);
  act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'identity' } }, now + 2, prompts);
  expect(project(room, null, now, prompts).gameType).toBe('majority');
  const old = snapshotHistory(room, 'c'.repeat(32), now, prompts);
  expect(old.gameType).toBe('majority');
  room.history = [{ id: old.id, code: old.code, game: old.game, finishedAt: old.finishedAt, expiresAt: old.expiresAt }];
  act(room, 'host', { type: 'rematch' }, now + 3, prompts);
  expect(project(room, null, now, prompts).gameType).toBe('identity');
  expect(room.history).toHaveLength(1);
  expect(room.players.p0.partyPoints).toBe(10);
  expect(room.players.p0.score).toBe(0);
  act(room, 'host', { type: 'start' }, now + 4, prompts);
  expect(room.gameType).toBe('identity');
  expect(currentSideRound(room)?.type).toBe('identity');
  expect(room.sideRounds).toHaveLength(1);
  expect(old.matches).toHaveLength(1);
  expect(() => settingsInput({ ...room.settings, gameType: 'unknown' })).toThrow('ゲーム');
});

it('uses original distinct subjective prompts and starts another round without retaining ready flags', () => {
  expect(MAJORITY_PROMPTS.length).toBeGreaterThanOrEqual(30);
  expect(IDENTITY_PROMPTS.length).toBeGreaterThanOrEqual(30);
  expect(new Set(MAJORITY_PROMPTS.map(prompt => prompt.text)).size).toBe(MAJORITY_PROMPTS.length);
  expect(new Set(IDENTITY_PROMPTS).size).toBe(IDENTITY_PROMPTS.length);
  const room = setup(3, 'majority', true, 2);
  const first = currentSideRound(room)!.prompt;
  for (const id of ids(room)) act(room, id, { type: 'partyVote', choice: '0' }, now + 1, prompts);
  next(room); next(room);
  expect(room.phase).toBe('voting');
  expect(room.round).toBe(2);
  expect(currentSideRound(room)!.prompt).not.toBe(first);
  expect(room.sideRounds).toHaveLength(2);
});
