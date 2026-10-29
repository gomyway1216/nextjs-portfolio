import { GameError } from './errors';
import { normalizePlayerText } from './text';
import { WORD_WOLF_PAIRS } from './word-wolf-words';
import type { Action, GameHistory, Room, WordWolfRound, WordWolfView } from './types';

const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => {
  if (!ok) throw new GameError(message, status);
};
/** Each citizen when a wolf is caught, a citizen's vote on any wolf, and each wolf that escapes or reverses. */
export const WOLF_POINTS = { caught: 100, detective: 50, escape: 300 } as const;

export const isWordWolf = (room: Room) => room.gameType === 'wordwolf';
export const currentWordWolf = (room: Room) => room.wordWolf?.at(-1);
const listed = (room: Room, id: string) => Boolean(room.players[id] && !room.players[id].kicked && !room.players[id].spectator);
/** Active voters this round. A resting player keeps their word and can still be accused. */
const voters = (room: Room, round: WordWolfRound) => round.players.filter(id => listed(room, id) && room.players[id].active);
const suspects = (room: Room, round: WordWolfRound) => round.players.filter(id => listed(room, id));
const words = (round: WordWolfRound) => {
  const pair = WORD_WOLF_PAIRS[round.pair];
  return {
    citizen: pair.ja[1 - round.wolfSide], wolf: pair.ja[round.wolfSide],
    citizenEn: pair.en[1 - round.wolfSide],
  };
};
const shuffled = <T>(values: T[], rng: () => number) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
/** Width, kana and spacing differences do not decide a last-chance guess. */
export const canonicalWord = (value: string) => normalizePlayerText(value).toLowerCase()
  .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
  .replace(/[\s\p{P}\p{S}]/gu, '');

export function beginWordWolf(room: Room, now: number, rng: () => number) {
  const players = Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3 && players.length <= 12, '3〜12人の参加者が必要です。', 409);
  const ranked = Object.values(room.players).filter(p => !p.kicked && !p.spectator);
  for (const player of ranked) {
    player.previousRank = 1 + ranked.filter(other => other.score > player.score).length;
    player.roundScore = 0;
    player.answerReady = false;
  }
  let available = WORD_WOLF_PAIRS.map((_, i) => i).filter(i => !room.usedPrompts.includes(`wordwolf:${i}`));
  if (!available.length) {
    room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith('wordwolf:'));
    available = WORD_WOLF_PAIRS.map((_, i) => i);
  }
  const pair = available[Math.min(available.length - 1, Math.floor(rng() * available.length))];
  room.usedPrompts.push(`wordwolf:${pair}`);
  const wolfCount = room.settings.wolves === 2 && players.length >= 6 ? 2 : 1;
  const round: WordWolfRound = {
    round: ++room.round, pair, wolfSide: rng() < 0.5 ? 0 : 1,
    players: players.map(p => p.id),
    wolves: shuffled(players.map(p => p.id), rng).slice(0, wolfCount),
    ballots: {}, accused: null, guess: null, guessCorrect: false, counts: {}, awards: [], scored: false,
  };
  (room.wordWolf ??= []).push(round);
  room.matchIndex = 0;
  room.phase = 'answering';
  room.deadline = now + room.settings.answerSeconds * 1000;
}

function tally(room: Room, round: WordWolfRound) {
  const options = suspects(room, round);
  const counts = Object.fromEntries(options.map(id => [id, 0]));
  for (const [voter, choice] of Object.entries(round.ballots))
    if (Object.hasOwn(counts, voter) && choice !== voter && Object.hasOwn(counts, choice)) counts[choice]++;
  const max = Math.max(0, ...Object.values(counts));
  const top = Object.keys(counts).filter(id => counts[id] === max);
  round.counts = counts;
  // A tie or no votes means nobody is singled out, so the wolves slip away.
  round.accused = max > 0 && top.length === 1 ? top[0] : null;
}

const caught = (round: WordWolfRound) => Boolean(round.accused && round.wolves.includes(round.accused));

function award(room: Room, round: WordWolfRound) {
  if (round.scored) return;
  const awards = new Map<string, number>();
  const add = (id: string, points: number) => awards.set(id, (awards.get(id) ?? 0) + points);
  const citizensWin = caught(round) && !round.guessCorrect;
  for (const id of suspects(room, round)) {
    if (round.wolves.includes(id)) {
      if (!citizensWin) add(id, WOLF_POINTS.escape);
      continue;
    }
    if (citizensWin) add(id, WOLF_POINTS.caught);
    const choice = round.ballots[id];
    if (choice && round.wolves.includes(choice) && listed(room, choice)) add(id, WOLF_POINTS.detective);
  }
  round.awards = [...awards].map(([id, points]) => ({ id, points }));
  for (const { id, points } of round.awards) {
    room.players[id].score += points;
    room.players[id].roundScore += points;
  }
  round.scored = true;
}

function unaward(room: Room, round: WordWolfRound) {
  if (!round.scored) return;
  for (const { id, points } of round.awards) {
    room.players[id].score -= points;
    room.players[id].roundScore -= points;
  }
  round.awards = [];
  round.scored = false;
}

/** matchIndex 0 of reveal is the caught wolf's last chance; 1 is the full answer. */
export function advanceWordWolf(room: Room, now: number, rng: () => number) {
  const round = currentWordWolf(room);
  if (!round) return;
  if (room.phase === 'answering') {
    room.phase = 'voting';
    room.deadline = now + room.settings.voteSeconds * 1000;
  } else if (room.phase === 'voting') {
    tally(room, round);
    room.phase = 'reveal';
    if (caught(round) && listed(room, round.accused!)) {
      room.matchIndex = 0;
      room.deadline = now + Math.max(30, room.settings.voteSeconds) * 1000;
    } else {
      award(room, round);
      room.matchIndex = 1;
      room.deadline = now + 20000;
    }
  } else if (room.phase === 'reveal' && room.matchIndex === 0) {
    award(room, round);
    room.matchIndex = 1;
    room.deadline = now + 20000;
  } else if (room.phase === 'reveal') {
    room.phase = 'ranking';
    room.deadline = now + 20000;
  } else if (room.phase === 'ranking') {
    if (room.round >= room.settings.rounds || Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator).length < 3) {
      room.phase = 'finished';
      room.deadline = 0;
    } else beginWordWolf(room, now, rng);
  }
}

export function syncWordWolf(room: Room, now: number, rng: () => number) {
  const round = currentWordWolf(room);
  if (!round || room.pausedAt) return;
  const players = voters(room, round);
  if (room.phase === 'reveal' && room.matchIndex === 0 && (round.guess !== null || !listed(room, round.accused ?? '')))
    advanceWordWolf(room, now, rng);
  if (!room.settings.autoAdvance || !players.length) return;
  if (room.phase === 'answering' && players.every(id => room.players[id].answerReady)) advanceWordWolf(room, now, rng);
  else if (room.phase === 'voting' && players.every(id => Object.hasOwn(round.ballots, id))) advanceWordWolf(room, now, rng);
}

export function wordWolfAction(room: Room, id: string, action: Action, now: number) {
  const round = currentWordWolf(room);
  requireThat(round, 'ゲームが始まっていません。', 409);
  if (action.type === 'wolfAccept') {
    requireThat(room.phase === 'reveal' && room.matchIndex === 1 && round.guess !== null && !round.guessCorrect,
      '正解にできる推理がありません。', 409);
    unaward(room, round);
    round.guessCorrect = true;
    award(room, round);
    return;
  }
  requireThat(voters(room, round).includes(id), 'このゲームには参加できません。', 403);
  if (action.type === 'answerReady') {
    requireThat(room.phase === 'answering', '今は話し合い中ではありません。', 409);
    requireThat(typeof action.ready === 'boolean', '確定するか選んでください。');
    room.players[id].answerReady = action.ready;
  } else if (action.type === 'partyVote') {
    requireThat(room.phase === 'voting' && now < room.deadline, '投票の受付は終了しました。', 409);
    requireThat(typeof action.choice === 'string' && suspects(room, round).includes(action.choice), '投票先を選んでください。');
    requireThat(action.choice !== id, '自分には投票できません。', 403);
    requireThat(!Object.hasOwn(round.ballots, id), '投票済みです。', 409);
    round.ballots[id] = action.choice;
  } else if (action.type === 'partyAnswer') {
    requireThat(room.phase === 'reveal' && room.matchIndex === 0 && round.accused === id, '今は推理できません。', 403);
    requireThat(round.guess === null, '推理は1回だけです。', 409);
    requireThat(typeof action.text === 'string', '文字で入力してください。');
    const text = normalizePlayerText(action.text);
    requireThat([...text].length > 0 && [...text].length <= 30, '1〜30文字で入力してください。');
    const { citizen, citizenEn } = words(round);
    round.guess = text;
    round.guessCorrect = [citizen, citizenEn].some(word => canonicalWord(word) === canonicalWord(text));
  } else throw new GameError('このゲームでは使えない操作です。');
}

/** A kicked player's unscored ballots and the ballots naming them no longer count. */
export function moderateWordWolf(room: Room, kicked: string) {
  const round = currentWordWolf(room);
  if (!round || round.scored || round.accused) return;
  for (const [voter, choice] of Object.entries(round.ballots))
    if (voter === kicked || choice === kicked) delete round.ballots[voter];
}

const person = (room: Room, id: string) => ({ id, name: room.players[id].name, avatar: room.players[id].avatar });

export function projectWordWolf(room: Room, me: string | null): WordWolfView | undefined {
  const round = currentWordWolf(room);
  if (!isWordWolf(room) || !round) return undefined;
  const players = voters(room, round);
  const assigned = Boolean(me && round.players.includes(me) && listed(room, me));
  const { citizen, wolf } = words(round);
  const revealed = room.phase === 'reveal' || room.phase === 'ranking' || room.phase === 'finished';
  const final = revealed && round.scored;
  const accused = revealed && round.accused && listed(room, round.accused) ? round.accused : null;
  return {
    myWord: assigned ? round.wolves.includes(me!) ? wolf : citizen : null,
    wolfCount: round.wolves.length,
    readyCount: players.filter(id => room.players[id].answerReady).length,
    playerCount: players.length,
    options: room.phase === 'voting' ? suspects(room, round).map(id => person(room, id)) : [],
    canVote: Boolean(me && room.phase === 'voting' && players.includes(me) && !Object.hasOwn(round.ballots, me)),
    voted: Boolean(me && Object.hasOwn(round.ballots, me)),
    votesReceived: players.filter(id => Object.hasOwn(round.ballots, id)).length,
    eligible: players.length,
    accused: accused ? { ...person(room, accused), votes: round.counts[accused] ?? 0, isWolf: round.wolves.includes(accused) } : null,
    counts: revealed ? Object.fromEntries(Object.entries(round.counts).filter(([id]) => listed(room, id))) : null,
    canGuess: Boolean(me && room.phase === 'reveal' && room.matchIndex === 0 && me === accused && round.guess === null),
    guessing: room.phase === 'reveal' && room.matchIndex === 0,
    canAccept: Boolean(me && me === room.hostId && room.phase === 'reveal' && room.matchIndex === 1 && round.guess !== null && !round.guessCorrect),
    result: final ? {
      citizenWord: citizen, wolfWord: wolf,
      wolves: round.wolves.filter(id => listed(room, id)).map(id => person(room, id)),
      guess: round.guess, guessCorrect: round.guessCorrect,
      winner: caught(round) && !round.guessCorrect ? 'citizens' : 'wolves',
      awards: round.awards.filter(entry => listed(room, entry.id)),
    } : null,
  };
}

export function wordWolfHistory(room: Room): GameHistory['matches'] {
  return (room.wordWolf ?? []).filter(round => round.scored).map(round => {
    const { citizen, wolf } = words(round);
    const citizensWin = caught(round) && !round.guessCorrect;
    const outcome = !caught(round) ? 'ウルフが逃げ切り。'
      : round.guessCorrect ? `ウルフが「${round.guess}」で市民のお題を当てて逆転。`
        : `ウルフを発見！${round.guess ? `最後の推理「${round.guess}」は不正解。` : ''}`;
    return {
      round: round.round,
      text: `市民「${citizen}」 / ウルフ「${wolf}」`,
      answers: suspects(room, round).map(id => ({
        name: room.players[id].name, avatar: room.players[id].avatar,
        text: round.wolves.includes(id) ? `ウルフ（${wolf}）` : `市民（${citizen}）`,
        votes: round.counts[id] ?? 0,
        points: round.awards.find(entry => entry.id === id)?.points ?? 0,
      })),
      awards: round.awards.filter(entry => listed(room, entry.id)).map(entry => ({
        name: room.players[entry.id].name, avatar: room.players[entry.id].avatar, points: entry.points,
      })),
      note: `${outcome}${citizensWin ? '市民の勝ち' : 'ウルフの勝ち'}。票数は疑われた票。市民勝利で市民に各${WOLF_POINTS.caught}点、ウルフに投票した市民に${WOLF_POINTS.detective}点、ウルフ勝利でウルフに各${WOLF_POINTS.escape}点。`,
    };
  });
}
