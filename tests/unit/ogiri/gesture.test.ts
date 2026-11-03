import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, tick } from '@/lib/ogiri/engine';
import { GESTURE_POINTS, GESTURE_SECONDS } from '@/lib/ogiri/gesture';
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
    expect(() => act(room, first, { type: 'gestureCorrect', by: first }, 201, prompts)).toThrow('当てた人');
    expect(() => act(room, first, { type: 'gestureCorrect', by: 'host' }, 201, prompts)).toThrow('当てた人');
    expect(() => act(room, a, { type: 'gestureCorrect', by: b }, 201, prompts)).toThrow('演じている人だけ');
    act(room, first, { type: 'gestureCorrect', by: a }, 201, prompts);
    expect(room.players[a].score).toBe(GESTURE_POINTS.guesser);
    expect(room.players[first].score).toBe(GESTURE_POINTS.actor);
    const two = room.gestures![0].words[1];
    expect(two).not.toBe(one);
    act(room, first, { type: 'gesturePass' }, 202, prompts);
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
      act(room, actor(room), { type: 'gestureCorrect', by: others(room)[0] }, now + 1, prompts);
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

  it('ends a started turn at once when its actor is removed', () => {
    const room = setup(4);
    const first = actor(room);
    act(room, first, { type: 'gestureStart' }, 200, prompts);
    act(room, 'host', { type: 'kick', playerId: first }, 201, prompts);
    expect(room.phase).toBe('reveal');
    expect(project(room, null, 202, prompts).gestureGame).toBeUndefined();
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
