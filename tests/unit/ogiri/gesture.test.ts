import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, tick } from '@/lib/ogiri/engine';
import { gamePlayerIds, settlePartyPoints } from '@/lib/ogiri/party';
import { GESTURE_POINTS, GESTURE_SECONDS } from '@/lib/ogiri/gesture';
import { GESTURE_WORDS } from '@/lib/ogiri/gesture-words';
import { snapshotHistory } from '@/lib/ogiri/history';
import { prompts } from '@/lib/ogiri/prompts';
import type { Room } from '@/lib/ogiri/types';

function setup(n = 4) {
  const room = createRoom('ABC234', newPlayer('host', 'secret', '進行だけ', '🐱', 100), 100);
  room.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', 100));
  act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'gesture' } }, 100, prompts);
  act(room, 'host', { type: 'start' }, 100, prompts);
  return room;
}
const actor = (room: Room) => room.gestures!.at(-1)!.actor;
const others = (room: Room) => room.gestures!.at(-1)!.order.filter(id => id !== actor(room));
/** Which dealt word an actor's tap is about: the count of words dealt so far. */
const dealt = (room: Room) => room.gestures!.at(-1)!.words.length;

describe('ジェスチャー早当て', () => {
  it('waits for the actor to start, and shows the word to the actor alone', () => {
    const room = setup();
    expect(room.phase).toBe('answering');
    expect(room.deadline).toBe(0);
    expect(tick(room, 10_000_000, prompts)).toBe(false);
    const first = actor(room);
    expect(project(room, first, 101, prompts).gestureGame).toMatchObject({ mine: true, started: false, canStart: true, word: null });
    expect(() => act(room, others(room)[0], { type: 'gestureStart' }, 101, prompts)).toThrow('演じている人だけ');
    act(room, first, { type: 'gestureStart' }, 200, prompts);
    expect(room.deadline).toBe(200 + GESTURE_SECONDS * 1000);
    const word = room.gestures![0].words[0];
    expect(project(room, first, 201, prompts).gestureGame!.word).toBe(word);
    for (const id of [others(room)[0], 'host', null]) {
      const view = project(room, id, 201, prompts);
      expect(view.gestureGame!.word).toBeNull();
      expect(JSON.stringify(view)).not.toContain(`"${word}"`);
    }
  });

  it('scores a guess for the guesser and the actor, and moves to a fresh word on a guess or a pass', () => {
    const room = setup();
    const first = actor(room), [a, b] = others(room);
    act(room, first, { type: 'gestureStart' }, 200, prompts);
    const one = room.gestures![0].words[0];
    expect(() => act(room, first, { type: 'gestureCorrect', by: first, word: dealt(room) }, 201, prompts)).toThrow('当てた人');
    expect(() => act(room, first, { type: 'gestureCorrect', by: 'host', word: dealt(room) }, 201, prompts)).toThrow('当てた人');
    expect(() => act(room, a, { type: 'gestureCorrect', by: b, word: dealt(room) }, 201, prompts)).toThrow('演じている人だけ');
    act(room, first, { type: 'gestureCorrect', by: a, word: dealt(room) }, 201, prompts);
    expect(room.players[a].score).toBe(GESTURE_POINTS.guesser);
    expect(room.players[first].score).toBe(GESTURE_POINTS.actor);
    const two = room.gestures![0].words[1];
    expect(two).not.toBe(one);
    act(room, first, { type: 'gesturePass', word: dealt(room) }, 202, prompts);
    expect(room.gestures![0].words).toHaveLength(3);
    expect(project(room, b, 203, prompts).gestureGame).toMatchObject({ solved: [{ word: one, name: room.players[a].name }], passes: 1 });
  });

  it('ends the acting when time is up, then gives every player one turn', () => {
    const room = setup(3);
    const order = [...room.gestures![0].order];
    let now = 1000;
    for (let turn = 0; turn < 3; turn++) {
      expect(actor(room)).toBe(order[turn]);
      act(room, actor(room), { type: 'gestureStart' }, now, prompts);
      act(room, actor(room), { type: 'gestureCorrect', by: others(room)[0], word: dealt(room) }, now + 1, prompts);
      now = room.deadline;
      expect(tick(room, now, prompts)).toBe(true);
      expect(room.phase).toBe('reveal');
      const result = project(room, null, now, prompts).gestureGame!.result!;
      expect(result.words).toHaveLength(1);
      expect(result.last).toBe(room.gestures!.at(-1)!.words[1]);
      now += 12000;
      tick(room, now, prompts);
    }
    expect(room.phase).toBe('ranking');
    tick(room, now + 20000, prompts);
    expect(room.phase).toBe('finished');
    const history = snapshotHistory(room, 'h', now, prompts);
    expect(history.matches).toHaveLength(3);
    expect(history.matches[0].note).toContain('正解1つ');
  });

  it('hands an unstarted turn on when its actor rests, and gives them a turn after they return', () => {
    const room = setup(3);
    const order = [...room.gestures![0].order];
    act(room, order[0], { type: 'leave' }, 101, prompts);
    expect(actor(room)).toBe(order[1]);
    act(room, order[0], { type: 'return' }, 102, prompts);
    act(room, order[1], { type: 'gestureStart' }, 103, prompts);
    tick(room, room.deadline, prompts);
    tick(room, room.deadline, prompts);
    expect(actor(room)).toBe(order[0]);
  });

  it('voids a removed actor\'s turn and hands the next actor the stage at once', () => {
    const room = setup(4);
    const first = actor(room), [a] = others(room);
    act(room, first, { type: 'gestureStart' }, 200, prompts);
    act(room, first, { type: 'gestureCorrect', by: a, word: dealt(room) }, 201, prompts);
    act(room, 'host', { type: 'kick', playerId: first }, 202, prompts);
    expect(room.phase).toBe('answering');
    expect(actor(room)).not.toBe(first);
    expect(project(room, null, 203, prompts).gestureGame).toMatchObject({ index: 2, started: false });
    expect(room.players[a].score).toBe(0);
  });

  it('turns a removed guesser\'s words into passes and takes back the actor\'s share', () => {
    const room = setup(4);
    const first = actor(room), [a, b] = others(room);
    act(room, first, { type: 'gestureStart' }, 200, prompts);
    act(room, first, { type: 'gestureCorrect', by: a, word: dealt(room) }, 201, prompts);
    act(room, first, { type: 'gestureCorrect', by: b, word: dealt(room) }, 202, prompts);
    act(room, 'host', { type: 'kick', playerId: a }, 203, prompts);
    expect(room.players[first].score).toBe(GESTURE_POINTS.actor);
    expect(room.players[b].score).toBe(GESTURE_POINTS.guesser);
    expect(project(room, null, 204, prompts).gestureGame).toMatchObject({ passes: 1, solved: [{ name: room.players[b].name }] });
    tick(room, room.deadline, prompts);
    tick(room, room.deadline, prompts);
    const turn = snapshotHistory(room, 'h', 400, prompts).matches[0];
    expect(turn.note).toContain('正解1つ・パス1回');
    expect(turn.answers.map(answer => answer.points)).toEqual([0, GESTURE_POINTS.guesser]);
  });
});

describe('ジェスチャー早当て turn numbers', () => {
  it('counts turns forward even when a resting actor acts later', () => {
    const room = setup(3);
    const order = [...room.gestures![0].order];
    act(room, order[0], { type: 'leave' }, 101, prompts);
    expect(project(room, null, 101, prompts).gestureGame!.index).toBe(1);
    act(room, order[0], { type: 'return' }, 102, prompts);
    const seen = [];
    for (let turn = 0; turn < 3; turn++) {
      seen.push(project(room, null, 103, prompts).gestureGame!.index);
      act(room, actor(room), { type: 'gestureStart' }, 103, prompts);
      tick(room, room.deadline, prompts);
      tick(room, room.deadline, prompts);
    }
    expect(seen).toEqual([1, 2, 3]);
  });
});

it('keeps dealing words after one turn has used up the whole list', () => {
  const room = setup(3);
  const first = actor(room);
  act(room, first, { type: 'gestureStart' }, 200, prompts);
  for (let i = 0; i < GESTURE_WORDS.length + 5; i++) act(room, first, { type: 'gesturePass', word: dealt(room) }, 201, prompts);
  const words = room.gestures![0].words;
  expect(words).toHaveLength(GESTURE_WORDS.length + 6);
  expect(words.every(Boolean)).toBe(true);
  expect(words.every((word, i) => i === 0 || word !== words[i - 1])).toBe(true);
});

it('credits a repeated tap to the word it was for, never to the next one the actor has not seen', () => {
  const room = setup(3);
  const first = actor(room), [a] = others(room);
  act(room, first, { type: 'gestureStart' }, 200, prompts);
  const tap = { type: 'gestureCorrect' as const, by: a, word: dealt(room) };
  act(room, first, tap, 201, prompts);
  // The response was lost, so the phone sends the same tap again.
  expect(() => act(room, first, tap, 202, prompts)).toThrow('次のお題');
  expect(room.players[a].score).toBe(GESTURE_POINTS.guesser);
  expect(room.gestures![0].results).toHaveLength(1);
  expect(() => act(room, first, { type: 'gesturePass', word: 1 }, 203, prompts)).toThrow('次のお題');
  expect(project(room, first, 203, prompts).gestureGame!.dealt).toBe(2);
});

describe('ジェスチャー早当て party points', () => {
  function playThrough(room: Room, turn: (room: Room, now: number) => void) {
    let now = 1000;
    while (room.phase === 'answering') {
      act(room, actor(room), { type: 'gestureStart' }, now, prompts);
      turn(room, now + 1);
      now = room.deadline;
      tick(room, now, prompts);
      now += 12000;
      tick(room, now, prompts);
    }
    tick(room, now + 20000, prompts);
    expect(room.phase).toBe('finished');
  }

  it('ranks a player who was resting at the start but came back and guessed', () => {
    const room = createRoom('ABC234', newPlayer('host', 'secret', '進行だけ', '🐱', 100), 100);
    room.players.host.spectator = true;
    for (let i = 0; i < 4; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', 100));
    act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'gesture' } }, 100, prompts);
    act(room, 'p3', { type: 'leave' }, 100, prompts);
    act(room, 'host', { type: 'start' }, 100, prompts);
    expect(room.gestures![0].order).not.toContain('p3');
    act(room, 'p3', { type: 'return' }, 101, prompts);
    playThrough(room, (room, now) => act(room, actor(room), { type: 'gestureCorrect', by: 'p3', word: dealt(room) }, now, prompts));
    expect(gamePlayerIds(room).has('p3')).toBe(true);
    settlePartyPoints(room, rankPlayers(room));
    expect(room.players.p3.partyEarned).toBeGreaterThan(0);
  });

  it('counts a game where every word was passed as played', () => {
    const room = setup(3);
    playThrough(room, (room, now) => act(room, actor(room), { type: 'gesturePass', word: dealt(room) }, now, prompts));
    settlePartyPoints(room, rankPlayers(room));
    expect(room.partyGames).toBe(1);
  });
});
