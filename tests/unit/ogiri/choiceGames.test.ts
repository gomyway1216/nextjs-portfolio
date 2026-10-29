import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, tick } from '@/lib/ogiri/engine';
import { historyText, snapshotHistory } from '@/lib/ogiri/history';
import { settlePartyPoints } from '@/lib/ogiri/party';
import { currentSideRound } from '@/lib/ogiri/side-games';
import { MINORITY_PROMPTS, THERMOMETER_PROMPTS } from '@/lib/ogiri/choice-prompts';
import { MAJORITY_PROMPTS } from '@/lib/ogiri/side-prompts';
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
const scores = (room: Room) => ids(room).map(id => room.players[id].score);
function vote(room: Room, choices: string[]) {
  for (const [i, choice] of choices.entries()) act(room, `p${i}`, { type: 'partyVote', choice }, now + 1, prompts);
}

it.each([
  [['0', '0', '0', '1'], [0, 0, 0, 100]],
  [['0', '0', '1', '2'], [0, 0, 100, 100]],
  [['0', '0', '1', '1'], [0, 0, 0, 0]],
  [['2', '2', '2', '2'], [0, 0, 0, 0]],
  [['0', '1', '2', '3', '3'], [100, 100, 100, 0, 0]],
])('minority scores the least-picked option that somebody chose: %j', (choices, expected) => {
  const room = setup(choices.length, 'minority');
  expect(room.phase).toBe('voting');
  expect(currentSideRound(room)!.options.length).toBeGreaterThanOrEqual(3);
  vote(room, choices);
  expect(room.phase).toBe('reveal');
  expect(scores(room)).toEqual(expected);
  const view = project(room, null, now + 2, prompts).sideGame!;
  expect(view.result!.awards.map(award => award.points)).toEqual(expected.filter(Boolean));
});

it('minority never awards anybody when nobody voted', () => {
  const room = setup(3, 'minority');
  expect(tick(room, room.deadline, prompts)).toBe(true);
  expect(project(room, null, now, prompts).sideGame?.result?.awards).toEqual([]);
});

it.each([
  // Ratings → mean; nearest 100, second 50, third 25, competition ranking on exact ties.
  [['50', '50', '80'], 60, [100, 100, 25]],
  [['0', '50', '100'], 50, [50, 100, 50]],
  [['10', '20', '30', '100'], 40, [25, 50, 100, 0]],
  [['33', '33', '33'], 33, [100, 100, 100]],
  [['0', '1', '2', '50', '100'], 30.6, [0, 25, 50, 100, 0]],
])('thermometer scores closeness to the room average: %j', (choices, average, expected) => {
  const room = setup(choices.length, 'thermometer');
  vote(room, choices);
  expect(room.phase).toBe('reveal');
  expect(scores(room)).toEqual(expected);
  const result = project(room, 'p0', now + 2, prompts).sideGame!.result!;
  expect(result.average).toBe(average);
  expect(Object.values(result.counts).reduce((sum, count) => sum + count, 0)).toBe(choices.length);
  expect(result.counts[choices[0]]).toBe(choices.filter(choice => choice === choices[0]).length);
});

it('thermometer accepts only canonical integers 0–100 and needs two ratings to score', () => {
  const room = setup(3, 'thermometer', false);
  for (const choice of ['101', '-1', '05', '5.5', ' 5', '', 'abc'])
    expect(() => act(room, 'p0', { type: 'partyVote', choice }, now + 1, prompts)).toThrow('0〜100');
  expect(() => act(room, 'p0', { type: 'partyVote', choice: 50 as unknown as string }, now + 1, prompts)).toThrow('0〜100');
  act(room, 'p0', { type: 'partyVote', choice: '100' }, now + 1, prompts);
  expect(() => act(room, 'p0', { type: 'partyVote', choice: '0' }, now + 1, prompts)).toThrow('投票済み');
  expect(tick(room, room.deadline, prompts)).toBe(true);
  const result = project(room, null, now, prompts).sideGame!.result!;
  expect(result).toMatchObject({ counts: { '100': 1 }, awards: [] });
  expect(result.average).toBeUndefined();
  expect(scores(room)).toEqual([0, 0, 0]);
});

it.each(['minority', 'thermometer'] as const)('%s keeps every individual choice private until the reveal', type => {
  const room = setup(4, type);
  const secret = type === 'thermometer' ? '73' : '2';
  act(room, 'p0', { type: 'partyVote', choice: secret }, now + 1, prompts);
  for (const viewer of [null, 'host', 'p0', 'p1']) {
    const view = project(room, viewer, now + 1, prompts);
    expect(view.sideGame).toMatchObject({ result: null, votesReceived: 1, eligible: 4 });
    expect(JSON.stringify(view.sideGame)).not.toContain('ballots');
    if (type === 'thermometer') expect(JSON.stringify(view)).not.toContain(`"${secret}"`);
  }
  expect(project(room, 'p0', now + 1, prompts).sideGame?.voted).toBe(true);
  expect(project(room, 'host', now + 1, prompts).sideGame?.canVote).toBe(false);
  if (type === 'thermometer') {
    const view = project(room, 'p1', now + 1, prompts).sideGame!;
    expect(view.scale).toEqual({ low: expect.any(String), high: expect.any(String) });
    expect(view.options).toEqual([]);
  }
  for (const id of ['p1', 'p2', 'p3']) act(room, id, { type: 'partyVote', choice: '1' }, now + 2, prompts);
  expect(room.phase).toBe('reveal');
  const revealed = project(room, 'p3', now + 2, prompts);
  expect(revealed.sideGame?.result?.counts[secret]).toBe(1);
  expect(JSON.stringify(revealed)).not.toContain('"p0":"');
});

it.each(['minority', 'thermometer'] as const)('%s settles party points once and archives an anonymous distribution', type => {
  const room = setup(4, type, true, 2);
  const firstPrompt = currentSideRound(room)!.prompt;
  vote(room, type === 'thermometer' ? ['10', '20', '20', '90'] : ['0', '0', '0', '1']);
  act(room, 'host', { type: 'next' }, now + 2, prompts);
  act(room, 'host', { type: 'next' }, now + 3, prompts, () => 0.3);
  expect(room.round).toBe(2);
  expect(currentSideRound(room)!.prompt).not.toBe(firstPrompt);
  vote(room, type === 'thermometer' ? ['50', '50', '50', '50'] : ['3', '3', '2', '2']);
  act(room, 'host', { type: 'next' }, now + 4, prompts);
  act(room, 'host', { type: 'next' }, now + 5, prompts);
  expect(room.phase).toBe('finished');
  settlePartyPoints(room, rankPlayers(room));
  const total = ids(room).map(id => room.players[id].partyPoints);
  settlePartyPoints(room, rankPlayers(room));
  expect(ids(room).map(id => room.players[id].partyPoints)).toEqual(total);
  expect(room.partyGames).toBe(1);
  const history = snapshotHistory(room, 'a'.repeat(32), now, prompts);
  expect(history.gameType).toBe(type);
  expect(history.matches).toHaveLength(2);
  expect(history.matches.flatMap(match => match.answers).every(answer => answer.avatar === '')).toBe(true);
  expect(JSON.stringify(history)).not.toMatch(/p[0-3]|ballot/);
  const text = historyText(history);
  if (type === 'thermometer') {
    expect(history.matches[0].answers.map(answer => [answer.text, answer.votes, answer.points]))
      .toEqual([['10度', 1, 25], ['20度', 2, 200], ['90度', 1, 0]]);
    expect(history.matches[0].note).toContain('平均 35');
    expect(text).toContain('みんなの温度計');
    expect(text).toContain('20度 (2人 / 200 点)');
  } else {
    expect(history.matches[0].answers.map(answer => answer.points)).toEqual([0, 100, 0, 0]);
    expect(history.matches[1].awards).toEqual([]);
    expect(text).toContain('少数派が勝ち');
  }
});

it('ships enough original, distinct prompts for both games', () => {
  expect(MINORITY_PROMPTS.length).toBeGreaterThanOrEqual(36);
  expect(THERMOMETER_PROMPTS.length).toBeGreaterThanOrEqual(36);
  const texts = [...MINORITY_PROMPTS.map(prompt => prompt.text), ...THERMOMETER_PROMPTS.map(prompt => prompt.text)];
  expect(new Set(texts).size).toBe(texts.length);
  const majority = new Set(MAJORITY_PROMPTS.map(prompt => prompt.text));
  expect(texts.some(text => majority.has(text))).toBe(false);
  for (const prompt of MINORITY_PROMPTS) {
    expect(prompt.options.length).toBeGreaterThanOrEqual(3);
    expect(new Set(prompt.options).size).toBe(prompt.options.length);
  }
  for (const prompt of THERMOMETER_PROMPTS) expect(prompt.low && prompt.high && prompt.low !== prompt.high).toBeTruthy();
});
