import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers } from '@/lib/ogiri/engine';
import { settlePartyPoints } from '@/lib/ogiri/party';
import { drawingAsset, drawingHistory } from '@/lib/ogiri/drawing-game';
import { QUIZ_WORDS } from '@/lib/ogiri/quiz-words';
import { prompts } from '@/lib/ogiri/prompts';
import type { DrawingData, Room } from '@/lib/ogiri/types';

const picture: DrawingData = { v: 1, strokes: [{ c: '#201a32', w: 7, p: [10, 10, 60, 60] }] };
function setup(n = 4, automatic = true) {
  const room = createRoom('ABC234', newPlayer('host', 'secret', '進行だけ', '🐱', 100), 100);
  room.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', 100));
  act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'quiz', autoAdvance: automatic } }, 100, prompts);
  act(room, 'host', { type: 'start' }, 100, prompts);
  return room;
}
const artist = (room: Room) => room.drawing!.chains[room.matchIndex].steps[0]!.author;
const answer = (room: Room) => room.drawing!.chains[room.matchIndex].choices!.indexOf(room.drawing!.chains[room.matchIndex].prompt);
function drawAll(room: Room, skip: string[] = []) {
  for (const id of room.drawing!.players) {
    if (skip.includes(id)) continue;
    act(room, id, { type: 'drawingSubmit', drawing: picture }, 101, prompts);
    act(room, id, { type: 'answerReady', ready: true }, 101, prompts);
  }
}

describe('おえかきクイズ', () => {
  it('gives each player one easy word, with three wrong choices from the same group', () => {
    const room = setup(5);
    expect(room.drawing!.stages).toBe(1);
    const words = room.drawing!.chains.map(chain => chain.prompt);
    expect(new Set(words).size).toBe(5);
    room.drawing!.chains.forEach((chain, i) => {
      const choices = room.drawing!.chains[i].choices!;
      expect(choices).toHaveLength(4);
      expect(new Set(choices).size).toBe(4);
      expect(choices).toContain(chain.prompt);
      const group = Object.values(QUIZ_WORDS).find(list => list.includes(chain.prompt))!;
      expect(choices.every(choice => group.includes(choice))).toBe(true);
    });
    const view = project(room, 'p0', 101, prompts).drawingGame!;
    expect(view.assignment).toMatchObject({ kind: 'draw', saved: false });
    expect(words).toContain(view.assignment!.prompt);
    expect(view.quiz).toBeNull();
    // Nobody else's word, and no choices, leave the server while everyone draws.
    const others = words.filter(word => word !== view.assignment!.prompt);
    const poll = JSON.stringify(project(room, 'p0', 101, prompts));
    expect(others.some(word => poll.includes(`"${word}"`))).toBe(false);
  });

  it('stores nothing Firestore refuses: no array directly inside another array', () => {
    const room = setup(4);
    drawAll(room);
    act(room, room.drawing!.players.find(id => id !== artist(room))!, { type: 'quizGuess', choice: 0 }, 102, prompts);
    const nested = (value: unknown, inArray: boolean): boolean => Array.isArray(value)
      ? inArray || value.some(item => nested(item, true))
      : Boolean(value && typeof value === 'object' && Object.values(value).some(item => nested(item, false)));
    expect(nested(room, false)).toBe(false);
  });

  it('shows one picture at a time, hides the answer until the guesses close, and scores both sides', () => {
    const room = setup(4);
    drawAll(room);
    expect(room.phase).toBe('voting');
    const first = artist(room);
    const guessers = room.drawing!.players.filter(id => id !== first);
    let view = project(room, guessers[0], 102, prompts).drawingGame!.quiz!;
    expect(view).toMatchObject({ index: 1, total: 4, mine: false, canGuess: true, guess: null, guessed: 0, eligible: 3, result: null });
    expect(project(room, first, 102, prompts).drawingGame!.quiz).toMatchObject({ mine: true, canGuess: false });
    // The picture being guessed is public; the next one is not yet.
    expect(drawingAsset(room, view.drawingId, null).published).toBe(true);
    expect(() => act(room, first, { type: 'quizGuess', choice: 0 }, 102, prompts)).toThrow('自分の絵には答えられません');
    expect(() => act(room, guessers[0], { type: 'quizGuess', choice: 4 }, 102, prompts)).toThrow('選んだ答え');
    const right = answer(room), wrong = (right + 1) % 4;
    act(room, guessers[0], { type: 'quizGuess', choice: right }, 102, prompts);
    expect(() => act(room, guessers[0], { type: 'quizGuess', choice: wrong }, 102, prompts)).toThrow('予想済み');
    act(room, guessers[1], { type: 'quizGuess', choice: right }, 102, prompts);
    expect(room.phase).toBe('voting');
    act(room, guessers[2], { type: 'quizGuess', choice: wrong }, 102, prompts);
    expect(room.phase).toBe('reveal');
    view = project(room, guessers[2], 103, prompts).drawingGame!.quiz!;
    expect(view.result).toMatchObject({ answer: right, drawerPoints: 100 });
    expect(view.result!.counts[right]).toBe(2);
    expect(view.result!.correct.map(player => player.name).sort()).toEqual([guessers[0], guessers[1]].map(id => room.players[id].name).sort());
    expect(room.players[guessers[0]].score).toBe(100);
    expect(room.players[guessers[2]].score).toBe(0);
    expect(room.players[first].score).toBe(100);
    act(room, 'host', { type: 'next' }, 104, prompts);
    expect(room.phase).toBe('voting');
    expect(project(room, null, 104, prompts).drawingGame!.quiz).toMatchObject({ index: 2, result: null });
  });

  it('skips a picture nobody sent and plays through to a saved history', () => {
    const room = setup(4, false);
    drawAll(room, ['p2']);
    act(room, 'host', { type: 'next' }, 102, prompts);
    let shown = 0;
    while (room.phase === 'voting') {
      expect(artist(room)).not.toBe('p2');
      shown++;
      for (const id of room.drawing!.players) if (id !== artist(room)) act(room, id, { type: 'quizGuess', choice: answer(room) }, 103, prompts);
      act(room, 'host', { type: 'next' }, 104, prompts);
      expect(room.phase).toBe('reveal');
      act(room, 'host', { type: 'next' }, 105, prompts);
    }
    expect(shown).toBe(3);
    expect(room.phase).toBe('ranking');
    // Three pictures, everyone right every time: guessers earn 100 each, artists 50 per right guess.
    expect(room.players.p2.score).toBe(300);
    expect(room.players.p0.score).toBe(200 + 150);
    act(room, 'host', { type: 'next' }, 106, prompts);
    expect(room.phase).toBe('finished');
    const history = drawingHistory(room);
    expect(history).toHaveLength(3);
    expect(history[0].steps[1].text).toBe('3人中3人が正解');
    expect(history[0].steps[0].points).toBe(150);
  });

  it('moves on when the artist is removed mid-guess and takes back their points', () => {
    const room = setup(4);
    drawAll(room);
    const first = artist(room);
    act(room, 'host', { type: 'kick', playerId: first }, 102, prompts);
    expect(room.phase).toBe('voting');
    expect(artist(room)).not.toBe(first);
    expect(project(room, null, 102, prompts).drawingGame!.quiz!.total).toBe(3);
  });

  it('ends the guesses when the last undecided guesser rests', () => {
    const room = setup(3);
    drawAll(room);
    const [a, b] = room.drawing!.players.filter(id => id !== artist(room));
    act(room, a, { type: 'quizGuess', choice: 0 }, 102, prompts);
    act(room, b, { type: 'leave' }, 102, prompts);
    expect(room.phase).toBe('reveal');
  });

  it('scores a picture only once its guesses close, so ending the game mid-guess records nothing for it', () => {
    const room = setup(4, false);
    drawAll(room);
    act(room, 'host', { type: 'next' }, 102, prompts);
    expect(room.phase).toBe('voting');
    for (const id of room.drawing!.players) if (id !== artist(room)) act(room, id, { type: 'quizGuess', choice: answer(room) }, 103, prompts);
    act(room, 'host', { type: 'finish' }, 104, prompts);
    expect(drawingHistory(room)).toEqual([]);
    expect(Object.values(room.players).every(player => player.score === 0)).toBe(true);
    // A removal after the end recounts, and must not pay out the unfinished picture either.
    act(room, 'host', { type: 'kick', playerId: room.drawing!.players.find(id => id !== artist(room))! }, 105, prompts);
    expect(Object.values(room.players).every(player => player.score === 0)).toBe(true);
  });

  it('counts a quiz where nobody guessed right as played', () => {
    const room = setup(3, false);
    drawAll(room);
    act(room, 'host', { type: 'next' }, 102, prompts);
    while (room.phase === 'voting') {
      for (const id of room.drawing!.players) if (id !== artist(room)) act(room, id, { type: 'quizGuess', choice: (answer(room) + 1) % 4 }, 103, prompts);
      act(room, 'host', { type: 'next' }, 104, prompts);
      act(room, 'host', { type: 'next' }, 105, prompts);
    }
    act(room, 'host', { type: 'next' }, 106, prompts);
    expect(room.phase).toBe('finished');
    settlePartyPoints(room, rankPlayers(room));
    expect(room.partyGames).toBe(1);
  });
});
