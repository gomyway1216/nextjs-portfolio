import { GameError } from './errors';
import { GESTURE_WORDS } from './gesture-words';
import type { Action, GameHistory, GestureRound, GestureView, Room } from './types';

const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => {
  if (!ok) throw new GameError(message, status);
};
/** A turn is one minute of acting. Each word guessed scores for the guesser and, less, for the actor. */
export const GESTURE_SECONDS = 60;
export const GESTURE_POINTS = { guesser: 100, actor: 50 } as const;

export const isGesture = (room: Room) => room.gameType === 'gesture';
export const currentGesture = (room: Room) => room.gestures?.at(-1);
const listed = (room: Room, id: string) => Boolean(room.players[id] && !room.players[id].kicked && !room.players[id].spectator);
const present = (room: Room, id: string) => listed(room, id) && room.players[id].active;
/** Everyone else in the game can shout the answer, including players who joined after it began. */
const guessers = (room: Room, round: GestureRound) =>
  Object.keys(room.players).filter(id => id !== round.actor && present(room, id));
const person = (room: Room, id: string) => ({ id, name: room.players[id].name, avatar: room.players[id].avatar });

/** Fresh words first; once the room has seen them all, then once this turn has, any but the one just shown. */
function nextWord(room: Room, round: GestureRound, rng: () => number) {
  const all = GESTURE_WORDS.map((word, i) => ({ word, id: `gesture:${i}` }));
  let pool = all.filter(word => !room.usedPrompts.includes(word.id) && !round.words.includes(word.word));
  if (!pool.length) {
    room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith('gesture:'));
    pool = all.filter(word => !round.words.includes(word.word));
  }
  if (!pool.length) pool = all.filter(word => word.word !== round.words.at(-1));
  const word = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
  room.usedPrompts.push(word.id);
  round.words.push(word.word);
}

/** The next actor still in the room, in the order fixed when the game began. */
function beginTurn(room: Room, order: string[], rng: () => number) {
  const done = new Set((room.gestures ?? []).map(round => round.actor));
  const actor = order.find(id => !done.has(id) && present(room, id));
  if (!actor) return false;
  const ranked = Object.values(room.players).filter(p => !p.kicked && !p.spectator);
  for (const player of ranked) {
    player.previousRank = 1 + ranked.filter(other => other.score > player.score).length;
    player.roundScore = 0;
  }
  const round: GestureRound = { round: ++room.round, actor, order, words: [], results: [], awards: [], startedAt: 0 };
  nextWord(room, round, rng);
  (room.gestures ??= []).push(round);
  room.matchIndex = 0;
  room.phase = 'answering';
  // No clock until the actor presses start in front of the TV.
  room.deadline = 0;
  return true;
}

export function beginGesture(room: Room, now: number, rng: () => number) {
  const players = Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3 && players.length <= 12, '3〜12人の参加者が必要です。', 409);
  const order = players.map(p => p.id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  room.round = 0;
  beginTurn(room, order, rng);
}

function start(room: Room, round: GestureRound, now: number) {
  round.startedAt = now;
  room.deadline = now + GESTURE_SECONDS * 1000;
}

/** Only the turn being played moves the round score; earlier turns change the total alone. */
function award(room: Room, round: GestureRound, id: string, points: number) {
  const entry = round.awards.find(item => item.id === id);
  if (entry) entry.points += points;
  else round.awards.push({ id, points });
  room.players[id].score += points;
  if (round === currentGesture(room)) room.players[id].roundScore += points;
}
/** Points always follow from the results, so a removal can be applied again cleanly. */
function rescore(room: Room, round: GestureRound) {
  for (const { id, points } of round.awards) {
    room.players[id].score -= points;
    if (round === currentGesture(room)) room.players[id].roundScore -= points;
  }
  round.awards = [];
  // A removed actor's turn counts for nobody, as a removed artist's quiz picture does.
  if (!listed(room, round.actor)) return;
  for (const entry of round.results) if (entry.by) {
    award(room, round, entry.by, GESTURE_POINTS.guesser);
    award(room, round, round.actor, GESTURE_POINTS.actor);
  }
}
/** A removed guesser's words become passes. */
export function moderateGesture(room: Room, kicked: string) {
  for (const round of room.gestures ?? []) {
    for (const entry of round.results) if (entry.by === kicked) entry.by = null;
    rescore(room, round);
  }
}
function nextTurn(room: Room, round: GestureRound, now: number, rng: () => number) {
  if (beginTurn(room, round.order, rng)) return;
  room.phase = 'ranking';
  room.deadline = now + 20000;
}

export function advanceGesture(room: Room, now: number, rng: () => number) {
  const round = currentGesture(room);
  if (!round) return;
  if (room.phase === 'answering' && !round.startedAt && present(room, round.actor)) start(room, round, now);
  else if (room.phase === 'answering') {
    round.ended = true;
    room.phase = 'reveal';
    room.deadline = now + 12000;
  } else if (room.phase === 'reveal') nextTurn(room, round, now, rng);
  else if (room.phase === 'ranking') {
    room.phase = 'finished';
    room.deadline = 0;
  }
}

/** A turn ends early when its actor rests, and is skipped outright when they are removed. One that
 * never started is handed on, and a resting actor who comes back still gets a turn later. */
export function syncGesture(room: Room, now: number, rng: () => number) {
  const round = currentGesture(room);
  if (!round || room.pausedAt) return;
  if (!listed(room, round.actor) && ['answering', 'reveal'].includes(room.phase)) return nextTurn(room, round, now, rng);
  if (room.phase !== 'answering' || present(room, round.actor)) return;
  if (round.startedAt) return advanceGesture(room, now, rng);
  room.gestures!.pop();
  room.round--;
  nextTurn(room, round, now, rng);
}

export function gestureAction(room: Room, id: string, action: Action, now: number, rng: () => number) {
  const round = currentGesture(room);
  requireThat(round && room.phase === 'answering', '今はジェスチャーの時間ではありません。', 409);
  requireThat(id === round.actor && present(room, id), '操作できるのは演じている人だけです。', 403);
  if (action.type === 'gestureStart') {
    requireThat(!round.startedAt, 'もう始まっています。', 409);
    start(room, round, now);
    return;
  }
  requireThat(round.startedAt && now < room.deadline, '時間切れです。', 409);
  requireThat(action.type !== 'gestureCorrect' && action.type !== 'gesturePass' || action.word === round.words.length,
    'もう次のお題に進んでいます。画面のお題を確認してね。', 409);
  const word = round.words.at(-1)!;
  if (action.type === 'gestureCorrect') {
    requireThat(typeof action.by === 'string' && guessers(room, round).includes(action.by), '当てた人を選んでください。');
    round.results.push({ word, by: action.by });
    award(room, round, action.by, GESTURE_POINTS.guesser);
    award(room, round, id, GESTURE_POINTS.actor);
  } else if (action.type === 'gesturePass') round.results.push({ word, by: null });
  else throw new GameError('このゲームでは使えない操作です。');
  nextWord(room, round, rng);
}

export function projectGesture(room: Room, me: string | null): GestureView | undefined {
  const round = currentGesture(room);
  if (!isGesture(room) || !round || !listed(room, round.actor)) return undefined;
  const acting = room.phase === 'answering' && Boolean(round.startedAt);
  const named = (entry: { word: string; by: string | null }) => entry.by && listed(room, entry.by)
    ? { word: entry.word, name: room.players[entry.by].name, avatar: room.players[entry.by].avatar }
    : { word: entry.word, name: null, avatar: '' };
  return {
    // Turns taken so far: an actor who rested acts later, and the count still only goes up.
    index: room.gestures!.length, total: round.order.length,
    actor: person(room, round.actor), mine: me === round.actor,
    started: Boolean(round.startedAt),
    canStart: Boolean(me === round.actor && room.phase === 'answering' && !round.startedAt && present(room, me)),
    dealt: round.words.length,
    word: me === round.actor && acting ? round.words.at(-1)! : null,
    solved: round.results.filter(entry => entry.by && listed(room, entry.by)).map(entry => named(entry) as GestureView['solved'][number]),
    passes: round.results.filter(entry => !entry.by).length,
    guessers: me === round.actor && acting ? guessers(room, round).map(id => person(room, id)) : [],
    result: room.phase === 'reveal' ? {
      words: round.results.map(named),
      last: round.words.length > round.results.length ? round.words.at(-1)! : null,
      awards: round.awards.filter(entry => listed(room, entry.id)),
    } : null,
  };
}

export function gestureHistory(room: Room): GameHistory['matches'] {
  return (room.gestures ?? []).filter(round => round.startedAt && listed(room, round.actor)).map(round => {
    const solved = round.results.filter(entry => entry.by);
    return {
      round: round.round,
      text: `${room.players[round.actor].name}のジェスチャー`,
      answers: round.results.map(entry => ({
        name: entry.by && listed(room, entry.by) ? room.players[entry.by].name : 'パス',
        avatar: entry.by && listed(room, entry.by) ? room.players[entry.by].avatar : '',
        text: entry.word, votes: 0, points: entry.by ? GESTURE_POINTS.guesser : 0,
      })),
      awards: round.awards.filter(entry => listed(room, entry.id)).map(entry => ({
        name: room.players[entry.id].name, avatar: room.players[entry.id].avatar, points: entry.points,
      })),
      note: `正解${solved.length}つ・パス${round.results.length - solved.length}回。当てた人に${GESTURE_POINTS.guesser}点、演じた人に1つ${GESTURE_POINTS.actor}点。`,
    };
  });
}
