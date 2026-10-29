import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers } from '@/lib/ogiri/engine';
import { bluffKey, currentBluffRound } from '@/lib/ogiri/bluff-game';
import { BLUFF_QUESTIONS } from '@/lib/ogiri/bluff-questions';
import { historyText, snapshotHistory } from '@/lib/ogiri/history';
import { settlePartyPoints } from '@/lib/ogiri/party';
import { prompts } from '@/lib/ogiri/prompts';
import { BLUFF_MAX_LENGTH, type Room } from '@/lib/ogiri/types';

const now = 10000;
function setup(count: number, automatic = true, rounds = 1, rng = () => 0.3) {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < count; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType: 'bluff', autoAdvance: automatic, rounds };
  act(room, 'host', { type: 'start' }, now, prompts, rng);
  return room;
}
const round = (room: Room) => currentBluffRound(room)!;
const ids = (room: Room) => round(room).players;
const write = (room: Room, id: string, text: string, rng = () => 0.3) => {
  act(room, id, { type: 'partyAnswer', text }, now + 1, prompts);
  act(room, id, { type: 'answerReady', ready: true }, now + 1, prompts, rng);
};
const option = (room: Room, label: string) => project(room, null, now, prompts).bluffGame!.options.find(o => o.label === label)!.id;
const vote = (room: Room, id: string, choice: string) => act(room, id, { type: 'partyVote', choice }, now + 2, prompts);

it('ships about forty original, sourced questions whose answers fit the fake length', () => {
  expect(BLUFF_QUESTIONS.length).toBeGreaterThanOrEqual(40);
  expect(new Set(BLUFF_QUESTIONS.map(q => q.text)).size).toBe(BLUFF_QUESTIONS.length);
  for (const question of BLUFF_QUESTIONS) {
    expect(question.sourceUrl).toMatch(/^https:\/\/ja\.wikipedia\.org\/wiki\/\S+$/);
    expect([...question.answer].length).toBeLessThanOrEqual(BLUFF_MAX_LENGTH);
    for (const truth of [question.answer, ...(question.also ?? [])]) expect(bluffKey(truth)).not.toBe('');
  }
});

it.each([3, 4, 12])('keeps %i players\' lies and the truth private until the reveal', count => {
  const room = setup(count);
  expect(room.phase).toBe('answering');
  const { truth } = round(room);
  act(room, 'p0', { type: 'partyAnswer', text: 'ひみつのうそ' }, now + 1, prompts);
  expect(project(room, 'p0', now, prompts).bluffGame).toMatchObject({ answer: 'ひみつのうそ', answerRequired: true, options: [] });
  for (const viewer of [null, 'host', 'p1']) {
    const json = JSON.stringify(project(room, viewer, now, prompts));
    expect(json).not.toContain('ひみつのうそ');
    expect(json).not.toContain(truth);
  }
  for (const id of ids(room)) write(room, id, `ひみつのうそ${id}`);
  expect(room.phase).toBe('voting');
  const view = project(room, 'p1', now, prompts).bluffGame!;
  expect(view.options.map(o => o.id)).toEqual(view.options.map((_, i) => String(i)));
  expect(view.options.map(o => o.label).sort()).toEqual([truth, ...ids(room).map(id => `ひみつのうそ${id}`)].sort());
  expect(view.mine).toBe(option(room, 'ひみつのうそp1'));
  expect(view.result).toBeNull();
  // Neither the shared nor a personal projection says which card is true or who wrote one.
  for (const viewer of [null, 'p1']) {
    const side = JSON.stringify(project(room, viewer, now, prompts).bluffGame);
    expect(side).not.toMatch(/"truth"|"authors"|sourceUrl|wikipedia/);
  }
  expect(project(room, null, now, prompts).bluffGame?.mine).toBeNull();
});

it('rejects a fake that is the truth after width, kana, case and punctuation normalization', () => {
  const room = setup(3);
  round(room).truth = 'サガルマータ';
  round(room).also = ['Gorilla gorilla'];
  for (const text of ['サガルマータ', 'さがるまーた', ' ｻｶﾞﾙﾏｰﾀ！', 'サガル・マータ', 'GORILLA  gorilla'])
    expect(() => act(room, 'p0', { type: 'partyAnswer', text }, now + 1, prompts)).toThrow('本当の答え');
  expect(round(room).fakes.p0).toBeUndefined();
  act(room, 'p0', { type: 'partyAnswer', text: 'サガルマータ山' }, now + 1, prompts);
  expect(round(room).fakes.p0).toBe('サガルマータ山');
  expect(() => act(room, 'p1', { type: 'partyAnswer', text: 'あ'.repeat(BLUFF_MAX_LENGTH + 1) }, now + 1, prompts)).toThrow('文字');
  expect(() => act(room, 'p1', { type: 'answerReady', ready: true }, now + 1, prompts)).toThrow('送信してから');
});

it('scores 100 for the truth and 50 per fooled player, never for voting on your own lie', () => {
  const room = setup(4);
  write(room, 'p0', 'うそA');
  write(room, 'p1', 'うそB');
  write(room, 'p2', 'うそC');
  write(room, 'p3', 'うそD');
  const truth = option(room, round(room).truth);
  expect(() => vote(room, 'p0', option(room, 'うそA'))).toThrow('自分のうそ');
  expect(() => vote(room, 'host', truth)).toThrow();
  vote(room, 'p0', truth);
  vote(room, 'p1', option(room, 'うそA'));
  vote(room, 'p2', option(room, 'うそA'));
  expect(() => vote(room, 'p2', truth)).toThrow('投票済み');
  vote(room, 'p3', option(room, 'うそB'));
  expect(room.phase).toBe('reveal');
  expect(Object.fromEntries(ids(room).map(id => [id, room.players[id].score]))).toEqual({ p0: 200, p1: 50, p2: 0, p3: 0 });
  const result = project(room, null, now, prompts).bluffGame!.result!;
  expect(result.truth).toBe(truth);
  expect(result.counts).toMatchObject({ [truth]: 1, [option(room, 'うそA')]: 2, [option(room, 'うそB')]: 1, [option(room, 'うそC')]: 0 });
  expect(result.authors[option(room, 'うそA')]).toEqual(['p0']);
  expect(result.authors[truth]).toEqual([]);
  expect(result.sourceUrl).toBe(round(room).sourceUrl);
});

it('merges identical lies into one card that pays every author and none of them can pick', () => {
  const room = setup(4);
  write(room, 'p0', 'おなじうそ');
  write(room, 'p1', 'オナジ ウソ');
  write(room, 'p2', '別のうそ');
  write(room, 'p3', 'さらに別');
  const shared = project(room, 'p1', now, prompts).bluffGame!;
  expect(shared.options).toHaveLength(4);
  expect(shared.mine).toBe(option(room, 'おなじうそ'));
  expect(() => vote(room, 'p1', shared.mine!)).toThrow('自分のうそ');
  vote(room, 'p2', shared.mine!);
  vote(room, 'p3', shared.mine!);
  vote(room, 'p0', option(room, '別のうそ'));
  vote(room, 'p1', option(room, round(room).truth));
  expect(Object.fromEntries(ids(room).map(id => [id, room.players[id].score]))).toEqual({ p0: 100, p1: 200, p2: 50, p3: 0 });
});

it('shuffles the truth into different positions across deals', () => {
  const positions = new Set<number>();
  for (const seed of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
    const room = setup(3, true, 1, () => seed);
    for (const id of ids(room)) write(room, id, `うそ${id}`, () => seed);
    positions.add(project(room, null, now, prompts).bluffGame!.options.findIndex(o => o.label === round(room).truth));
  }
  expect(positions.size).toBeGreaterThan(1);
});

it('drops a kicked author\'s card and the votes on it, and skips a question with no lies', () => {
  const room = setup(4, false);
  write(room, 'p0', 'うそA');
  write(room, 'p1', 'うそB');
  act(room, 'host', { type: 'next' }, now + 2, prompts, () => 0.3);
  expect(room.phase).toBe('voting');
  vote(room, 'p2', option(room, 'うそA'));
  vote(room, 'p3', option(room, 'うそB'));
  act(room, 'host', { type: 'kick', playerId: 'p0' }, now + 3, prompts);
  expect(project(room, null, now, prompts).bluffGame!.options.map(o => o.label)).not.toContain('うそA');
  expect(round(room).ballots).toEqual({ p3: option(room, 'うそB') });
  act(room, 'host', { type: 'next' }, now + 4, prompts);
  expect(room.players.p1.score).toBe(50);
  expect(room.players.p2.score).toBe(0);

  const empty = setup(3, false);
  act(empty, 'host', { type: 'next' }, now + 2, prompts);
  expect(empty.phase).toBe('ranking');
  act(empty, 'host', { type: 'next' }, now + 3, prompts);
  expect(empty.phase).toBe('finished');
  settlePartyPoints(empty, rankPlayers(empty));
  expect(empty.partyGames ?? 0).toBe(0);
});

it('archives the truth, lies, votes and source, settles party points and plays later rounds once', () => {
  const room = setup(3, true, 2);
  const used = round(room).prompt;
  for (const id of ids(room)) write(room, id, `うそ${id}`);
  vote(room, 'p0', option(room, round(room).truth));
  vote(room, 'p1', option(room, 'うそp0'));
  vote(room, 'p2', option(room, 'うそp0'));
  act(room, 'host', { type: 'next' }, now + 3, prompts);
  expect(room.phase).toBe('ranking');
  act(room, 'host', { type: 'next' }, now + 4, prompts, () => 0.9);
  expect(room.phase).toBe('answering');
  expect(round(room).prompt).not.toBe(used);
  expect(ids(room).some(id => room.players[id].answerReady)).toBe(false);
  act(room, 'host', { type: 'finish' }, now + 5, prompts);
  settlePartyPoints(room, rankPlayers(room));
  expect(room.players.p0.partyPoints).toBe(10);
  const history = snapshotHistory(room, 'a'.repeat(32), now, prompts);
  expect(history.gameType).toBe('bluff');
  expect(history.matches).toHaveLength(1);
  const [match] = history.matches;
  expect(match.text).toBe(used);
  expect(match.note).toContain(room.bluffRounds![0].truth);
  expect(match.note).toContain(room.bluffRounds![0].sourceUrl);
  expect(match.answers.find(a => a.text === 'うそp0')).toMatchObject({ name: '参加者0', votes: 2, points: 100 });
  expect(match.answers.find(a => a.name === '本当の答え')).toMatchObject({ votes: 1, points: 0 });
  expect(match.awards).toEqual(expect.arrayContaining([{ name: '参加者0', avatar: 'rabbit', points: 200 }]));
  expect(historyText(history)).toContain('うそ回答まぜ');
});
