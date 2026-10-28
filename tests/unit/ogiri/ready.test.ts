import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, tick } from '@/lib/ogiri/engine';
import { prompts } from '@/lib/ogiri/prompts';
import { roundPlan } from '@/lib/ogiri/plan';

function setup(autoAdvance = true) {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', 100), 100);
  room.players.host.spectator = true;
  for (const id of ['a', 'b', 'c', 'd', 'e']) joinRoom(room, newPlayer(id, id, id, '🐶', 100));
  room.settings.autoAdvance = autoAdvance;
  act(room, 'host', { type: 'start' }, 100, prompts);
  return room;
}
function answerAll(room: ReturnType<typeof setup>) {
  for (const match of room.matches) for (const id of match.players)
    act(room, id, { type: 'answer', matchId: match.id, text: `回答${id}` }, 101, prompts);
}

it('waits for explicit confirmation, then advances only when every answerer is ready', () => {
  const room = setup();
  expect(() => act(room, 'a', { type: 'answerReady', ready: true }, 101, prompts)).toThrow('2問とも');
  expect(() => act(room, 'host', { type: 'answerReady', ready: true }, 101, prompts)).toThrow('今は');
  answerAll(room);
  expect(room.phase).toBe('answering');
  for (const id of ['a', 'b', 'c', 'd']) act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
  expect(room.phase).toBe('answering');
  expect(project(room, 'a', 102, prompts).players.find(p => p.id === 'a')?.answerReady).toBe(true);
  act(room, 'e', { type: 'answerReady', ready: true }, 102, prompts);
  expect(room.phase).toBe('voting');
  const match = room.matches[0];
  expect(project(room, match.players[0], 102, prompts).match).toMatchObject({ isAuthor: true, canVote: false });
  expect(() => act(room, match.players[0], { type: 'vote', matchId: match.id, choice: 0 }, 102, prompts)).toThrow('自分の対戦');
});

it('locks confirmed answers, supports undo, and resets confirmation in the next round and rematch', () => {
  const room = setup(false);
  answerAll(room);
  const match = room.matches.find(m => m.players.includes('a'))!;
  act(room, 'a', { type: 'answerReady', ready: true }, 102, prompts);
  expect(() => act(room, 'a', { type: 'answer', matchId: match.id, text: '変更' }, 103, prompts)).toThrow('回答を直す');
  act(room, 'a', { type: 'answerReady', ready: false }, 103, prompts);
  act(room, 'a', { type: 'answer', matchId: match.id, text: '変更' }, 103, prompts);
  for (const id of ['a','b','c','d','e']) act(room, id, { type: 'answerReady', ready: true }, 104, prompts);
  expect(room.phase).toBe('answering');
  for (let n = 0; n < 12; n++) act(room, 'host', { type: 'next' }, 105, prompts);
  expect(room.round).toBe(2);
  expect(Object.values(room.players).every(p => !p.answerReady)).toBe(true);
  act(room, 'host', { type: 'finish' }, 106, prompts);
  act(room, 'host', { type: 'rematch' }, 107, prompts);
  expect(Object.values(room.players).every(p => !p.answerReady)).toBe(true);
});

it('keeps the deadline fallback and ignores a player who leaves before confirming', () => {
  const timed = setup();
  expect(tick(timed, timed.deadline, prompts)).toBe(true);
  expect(timed.phase).toBe('voting');
  const room = setup();
  answerAll(room);
  for (const id of ['a','b','c','d']) act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
  act(room, 'e', { type: 'leave' }, 103, prompts);
  expect(room.phase).toBe('voting');
});

it.each([3,4,5,10,12])('shows a fair plan matching the actual assignments for %i players', (count) => {
  const room = createRoom('ABC234', newPlayer('p0','s','p0','🐱',100),100);
  for (let n = 1; n < count; n++) joinRoom(room, newPlayer(`p${n}`,'s',`p${n}`,'🐶',100));
  act(room, 'p0', { type: 'start' }, 100, prompts);
  const plan = roundPlan(count, 3)!;
  expect(plan.totalQuestions).toBe(count * 3);
  expect(plan.totalAnswersPerPlayer).toBe(6);
  expect(room.matches).toHaveLength(plan.questionsPerRound);
  for (const id of Object.keys(room.players)) {
    expect(room.matches.filter(m => m.players.includes(id))).toHaveLength(plan.answersPerPlayer);
    expect(room.matches.filter(m => !m.players.includes(id))).toHaveLength(plan.votesPerPlayer);
  }
  for (const m of room.matches) expect(project(room, 'p0',100,prompts).players.length - m.players.length).toBe(plan.votersPerQuestion);
});

it('does not show a playable plan below the minimum or for invalid settings', () => {
  expect(roundPlan(2,3)).toBeNull();
  expect(roundPlan(13,3)).toBeNull();
  expect(roundPlan(5,0)).toBeNull();
});
