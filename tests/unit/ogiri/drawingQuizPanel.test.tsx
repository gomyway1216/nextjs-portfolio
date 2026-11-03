import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { prompts } from '@/lib/ogiri/prompts';
import { DrawingGamePanel } from '@/components/game/Ogiri/DrawingGamePanel';
import type { DrawingData, Room } from '@/lib/ogiri/types';

const now = 10000;
const picture: DrawingData = { v: 1, strokes: [{ c: '#201a32', w: 7, p: [10, 10, 60, 60] }] };
function guessing() {
  const room = createRoom('ABC234', newPlayer('host', 'h', '進行役', '🐱', now), now);
  room.players.host.spectator = true;
  for (let i = 0; i < 3; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', now));
  room.settings = { ...room.settings, gameType: 'quiz' };
  act(room, 'host', { type: 'start' }, now, prompts, () => 0.3);
  for (const id of room.drawing!.players) {
    act(room, id, { type: 'drawingSubmit', drawing: picture }, now, prompts);
    act(room, id, { type: 'answerReady', ready: true }, now, prompts);
  }
  expect(room.phase).toBe('voting');
  return room;
}
const render = (room: Room, me: string | null, tv: boolean) => renderToStaticMarkup(
  <DrawingGamePanel view={project(room, me, now + 1, prompts)} tv={tv} busy={false} connected reduced send={async () => true} />);
const artist = (room: Room) => room.drawing!.chains[room.matchIndex].steps[0]!.author;

it('gives a guesser four buttons, and the artist and the TV the choices without any', () => {
  const room = guessing();
  const choices = room.drawing!.chains[room.matchIndex].choices!;
  const guesser = room.drawing!.players.find(id => id !== artist(room))!;
  const phone = render(room, guesser, false);
  expect(phone).toContain('この絵、なーんだ？');
  for (const choice of choices) expect(phone).toContain(`<span>${choice}</span>`);
  expect(phone.match(/<button type="button" class="[^"]*choice/g)).toHaveLength(4);
  expect(phone).toContain('0 / 2 人が予想済み');
  const own = render(room, artist(room), false);
  expect(own).toContain('あなたの絵です！');
  expect(own).not.toMatch(/<button type="button" class="[^"]*choice/);
  const tv = render(room, null, true);
  expect(tv).not.toMatch(/<button type="button" class="[^"]*choice/);
  expect(tv).not.toContain('正解は');
});

it('marks the answer, the counts and who got it once the guesses close', () => {
  const room = guessing();
  const answer = room.drawing!.chains[room.matchIndex].choices!.indexOf(room.drawing!.chains[room.matchIndex].prompt);
  const [right, wrong] = room.drawing!.players.filter(id => id !== artist(room));
  act(room, right, { type: 'quizGuess', choice: answer }, now, prompts);
  act(room, wrong, { type: 'quizGuess', choice: (answer + 1) % 4 }, now, prompts);
  expect(room.phase).toBe('reveal');
  const tv = render(room, null, true);
  expect(tv).toContain(`正解は「${room.drawing!.chains[room.matchIndex].prompt}」！`);
  expect(tv).toContain('1人が正解！');
  expect(tv).toContain(room.players[right].name);
  const loser = render(room, wrong, false);
  expect(loser).toContain('あなた</em>');
});
