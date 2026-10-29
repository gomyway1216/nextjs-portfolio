import { GameError } from './errors';
import { BLUFF_QUESTIONS } from './bluff-questions';
import { normalizePlayerText } from './text';
import { BLUFF_MAX_LENGTH, type Action, type BluffGameView, type BluffRound, type GameHistory, type Room } from './types';

const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => {
  if (!ok) throw new GameError(message, status);
};
export const isBluffGame = (room: Room) => room.gameType === 'bluff';
export const currentBluffRound = (room: Room) => room.bluffRounds?.at(-1);
const playing = (room: Room, id: string) => Boolean(room.players[id]?.active && !room.players[id].kicked && !room.players[id].spectator);
const participants = (room: Room, round: BluffRound) => round.players.filter(id => playing(room, id));
const shuffled = <T>(values: T[], rng: () => number) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
/** Comparison key only: width, case, kana and punctuation differences do not make a new answer. */
export const bluffKey = (value: string) => normalizePlayerText(value).toLowerCase()
  .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s\p{P}\p{S}]/gu, '');
const matchesTruth = (round: BluffRound, text: string) =>
  [round.truth, ...round.also].some(truth => bluffKey(truth) === bluffKey(text));

export function beginBluffRound(room: Room, now: number, rng: () => number) {
  const players = Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3, '3人以上の参加者が必要です。', 409);
  const ranked = Object.values(room.players).filter(p => !p.kicked && !p.spectator);
  for (const player of ranked) {
    player.previousRank = 1 + ranked.filter(other => other.score > player.score).length;
    player.roundScore = 0;
    player.answerReady = false;
  }
  let available = BLUFF_QUESTIONS.map((_, index) => index).filter(index => !room.usedPrompts.includes(`bluff:${index}`));
  if (!available.length) {
    room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith('bluff:'));
    available = BLUFF_QUESTIONS.map((_, index) => index);
  }
  const index = available[Math.min(available.length - 1, Math.floor(rng() * available.length))];
  room.usedPrompts.push(`bluff:${index}`);
  const question = BLUFF_QUESTIONS[index];
  (room.bluffRounds ??= []).push({
    round: ++room.round, prompt: question.text, truth: question.answer, also: question.also ?? [],
    sourceUrl: question.sourceUrl, players: players.map(p => p.id),
    fakes: {}, options: [], ballots: {}, result: null,
  });
  room.matchIndex = 0;
  room.phase = 'answering';
  room.deadline = now + room.settings.answerSeconds * 1000;
}

/** Identical fakes share one card, so a duplicate can never mark itself as a lie. */
function dealOptions(room: Room, round: BluffRound, rng: () => number) {
  const cards = new Map<string, { label: string; truth: boolean; authors: string[] }>();
  for (const id of participants(room, round)) {
    const fake = round.fakes[id];
    if (!fake) continue;
    const key = bluffKey(fake) || fake;
    const card = cards.get(key);
    if (card) card.authors.push(id);
    else cards.set(key, { label: fake, truth: false, authors: [id] });
  }
  const fakes = [...cards.values()];
  round.options = fakes.length ? shuffled([...fakes, { label: round.truth, truth: true, authors: [] }], rng)
    .map((card, i) => ({ id: String(i), ...card })) : [];
}

const validBallots = (room: Room, round: BluffRound) => Object.entries(round.ballots).filter(([id, choice]) => {
  const option = round.options.find(candidate => candidate.id === choice);
  return option && round.players.includes(id) && !room.players[id].kicked && !room.players[id].spectator && !option.authors.includes(id);
});

function scoreBluff(room: Room, round: BluffRound) {
  if (round.result) return;
  const votes = validBallots(room, round);
  const counts = Object.fromEntries(round.options.map(option => [option.id, votes.filter(([, choice]) => choice === option.id).length]));
  const awards = new Map<string, number>();
  for (const [id, choice] of votes) {
    const option = round.options.find(candidate => candidate.id === choice)!;
    if (option.truth) awards.set(id, (awards.get(id) ?? 0) + 100);
    else for (const author of option.authors)
      if (!room.players[author].kicked) awards.set(author, (awards.get(author) ?? 0) + 50);
  }
  round.result = {
    truth: round.options.find(option => option.truth)!.id,
    counts,
    awards: [...awards].map(([id, points]) => ({ id, points })),
  };
  for (const { id, points } of round.result.awards) {
    room.players[id].score += points;
    room.players[id].roundScore += points;
  }
}

export function advanceBluff(room: Room, now: number, rng: () => number) {
  const round = currentBluffRound(room);
  if (!round) return;
  if (room.phase === 'answering') {
    dealOptions(room, round, rng);
    room.phase = round.options.length ? 'voting' : 'ranking';
    room.deadline = now + (round.options.length ? room.settings.voteSeconds * 1000 : 20000);
  } else if (room.phase === 'voting') {
    scoreBluff(room, round);
    room.phase = 'reveal';
    room.deadline = now + 20000;
  } else if (room.phase === 'reveal') {
    room.phase = 'ranking';
    room.deadline = now + 20000;
  } else if (room.phase === 'ranking') {
    if (room.round >= room.settings.rounds || Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator).length < 3) {
      room.phase = 'finished';
      room.deadline = 0;
    } else beginBluffRound(room, now, rng);
  }
}

export function syncBluff(room: Room, now: number, rng: () => number) {
  const round = currentBluffRound(room);
  if (!round || room.pausedAt || !room.settings.autoAdvance) return;
  const active = participants(room, round);
  if (!active.length) return;
  if ((room.phase === 'answering' && active.every(id => room.players[id].answerReady)) ||
    (room.phase === 'voting' && active.every(id => Object.hasOwn(round.ballots, id))))
    advanceBluff(room, now, rng);
}

export function bluffAction(room: Room, playerId: string, action: Action, now: number) {
  const round = currentBluffRound(room);
  requireThat(round && participants(room, round).includes(playerId), 'このゲームには参加できません。', 403);
  if (action.type === 'partyAnswer') {
    requireThat(room.phase === 'answering', '回答の受付は終了しました。', 409);
    requireThat(!room.players[playerId].answerReady, '「回答を直す」で確定を取り消してから修正してください。', 409);
    requireThat(typeof action.text === 'string', '文字で入力してください。');
    const text = normalizePlayerText(action.text);
    requireThat([...text].length > 0 && [...text].length <= BLUFF_MAX_LENGTH, `1〜${BLUFF_MAX_LENGTH}文字で入力してください。`);
    requireThat(!matchesTruth(round, text), 'それ、本当の答えです！ みんなをだます別のうそを考えてね。');
    round.fakes[playerId] = text;
  } else if (action.type === 'answerReady') {
    requireThat(room.phase === 'answering', '今は回答を確定できません。', 409);
    requireThat(typeof action.ready === 'boolean', '確定するか選んでください。');
    requireThat(round.fakes[playerId], 'うその答えを送信してから確定してください。', 409);
    room.players[playerId].answerReady = action.ready;
  } else if (action.type === 'partyVote') {
    requireThat(room.phase === 'voting' && now < room.deadline, '投票の受付は終了しました。', 409);
    const option = round.options.find(candidate => candidate.id === action.choice);
    requireThat(typeof action.choice === 'string' && option, '選択肢を選んでください。');
    requireThat(!option.authors.includes(playerId), '自分のうそには投票できません。', 403);
    requireThat(!Object.hasOwn(round.ballots, playerId), '投票済みです。', 409);
    round.ballots[playerId] = action.choice;
  } else throw new GameError('このゲームでは使えない操作です。');
}

/** A removed player's lie leaves the table; votes for a card nobody wrote any more are discarded. */
export function moderateBluff(room: Room, playerId: string) {
  const round = currentBluffRound(room);
  if (!round || round.result) return;
  delete round.fakes[playerId];
  delete round.ballots[playerId];
  for (const option of round.options) option.authors = option.authors.filter(id => id !== playerId);
  const orphaned = round.options.filter(option => !option.truth && !option.authors.length).map(option => option.id);
  round.options = round.options.filter(option => !orphaned.includes(option.id));
  for (const [id, choice] of Object.entries(round.ballots)) if (orphaned.includes(choice)) delete round.ballots[id];
}

export function projectBluff(room: Room, me: string | null): BluffGameView | undefined {
  const round = currentBluffRound(room);
  if (!round || !isBluffGame(room)) return undefined;
  const active = participants(room, round);
  const shown = ['voting', 'reveal'].includes(room.phase);
  const result = room.phase === 'reveal' ? round.result : null;
  return {
    prompt: round.prompt,
    index: round.round,
    total: room.settings.rounds,
    answer: me && room.phase === 'answering' ? round.fakes[me] ?? '' : '',
    answerRequired: Boolean(me && room.phase === 'answering' && active.includes(me)),
    readyCount: active.filter(id => room.players[id].answerReady).length,
    answererCount: active.length,
    // The deal order is random and ids follow it, so neither reveals which card is true.
    options: shown ? round.options.map(({ id, label }) => ({ id, label })) : [],
    mine: me && shown ? round.options.find(option => option.authors.includes(me))?.id ?? null : null,
    canVote: Boolean(me && room.phase === 'voting' && active.includes(me)),
    voted: Boolean(me && Object.hasOwn(round.ballots, me)),
    votesReceived: room.phase === 'voting' ? active.filter(id => Object.hasOwn(round.ballots, id)).length : validBallots(room, round).length,
    eligible: active.length,
    result: result ? {
      truth: result.truth,
      counts: { ...result.counts },
      authors: Object.fromEntries(round.options.map(option => [option.id, option.authors.filter(id => !room.players[id].kicked)])),
      awards: result.awards.filter(award => !room.players[award.id]?.kicked),
      sourceUrl: round.sourceUrl,
    } : null,
  };
}

export function bluffHistory(room: Room): GameHistory['matches'] {
  return (room.bluffRounds ?? []).filter(round => round.result).map(round => {
    const result = round.result!;
    const visible = (id: string) => room.players[id] && !room.players[id].kicked;
    return {
      round: round.round, text: round.prompt,
      answers: round.options.map(option => {
        const authors = option.authors.filter(visible);
        const removed = !option.truth && !authors.length;
        return {
          name: option.truth ? '本当の答え' : removed ? '退出したプレイヤー' : authors.map(id => room.players[id].name).join('・'),
          avatar: option.truth || removed ? '' : room.players[authors[0]].avatar,
          text: removed ? null : option.label,
          votes: result.counts[option.id] ?? 0,
          points: option.truth || removed ? 0 : (result.counts[option.id] ?? 0) * 50,
        };
      }),
      awards: result.awards.filter(award => visible(award.id)).map(award => ({
        name: room.players[award.id].name, avatar: room.players[award.id].avatar, points: award.points,
      })),
      note: `本当の答えは「${round.truth}」。正解を選ぶと100点、自分のうそに1人だまされるごとに作者へ50点（同じうそは全員に）。出典: ${round.sourceUrl}`,
    };
  });
}
