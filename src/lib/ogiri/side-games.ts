import { GameError } from './errors';
import { MAJORITY_PROMPTS, IDENTITY_PROMPTS } from './side-prompts';
import { MINORITY_PROMPTS, THERMOMETER_PROMPTS } from './choice-prompts';
import { normalizePlayerText } from './text';
import { isChoiceGame, type Action, type PartyGameResult, type PartyGameView, type Room, type SideGameRound } from './types';

const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => {
  if (!ok) throw new GameError(message, status);
};
export const currentSideRound = (room: Room) => room.sideRounds?.at(-1);
export const isSideGame = (room: Room) => isChoiceGame(room.gameType) || room.gameType === 'identity';
export const sidePlayers = (room: Room, round = currentSideRound(room)) => (round?.players ?? [])
  .filter(id => room.players[id]?.active && !room.players[id].kicked && !room.players[id].spectator);
const shuffled = <T>(values: T[], rng: () => number) => {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};
const currentAuthor = (room: Room, round: SideGameRound) => round.type === 'identity' ? round.order[room.matchIndex] : null;
const ballots = (room: Room, round: SideGameRound) => round.ballots[String(room.matchIndex)] ?? {};
const eligible = (room: Room, round: SideGameRound) => sidePlayers(room, round).filter(id => id !== currentAuthor(room, round));
const options = (room: Room, round: SideGameRound) => round.type !== 'identity' ? round.options : round.players
  .filter(id => !room.players[id].kicked && !room.players[id].spectator)
  .map(id => ({ id, label: room.players[id].name, avatar: room.players[id].avatar }));
/** A thermometer rating is the canonical decimal string of an integer 0–100. */
const validChoice = (room: Room, round: SideGameRound, choice: unknown) => typeof choice === 'string' && (
  round.type === 'thermometer' ? /^(?:100|[1-9]?\d)$/.test(choice) : options(room, round).some(option => option.id === choice));
const POOLS = {
  majority: MAJORITY_PROMPTS, minority: MINORITY_PROMPTS, thermometer: THERMOMETER_PROMPTS, identity: IDENTITY_PROMPTS,
} as const;
const THERMOMETER_AWARDS = [100, 50, 25];

export function beginSideRound(room: Room, now: number, rng: () => number) {
  const type = room.gameType;
  requireThat(isChoiceGame(type) || type === 'identity', 'ゲームを選んでください。');
  const players = Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3, '3人以上の参加者が必要です。', 409);
  const ranked = Object.values(room.players).filter(p => !p.kicked && !p.spectator);
  for (const player of ranked) {
    player.previousRank = 1 + ranked.filter(other => other.score > player.score).length;
    player.roundScore = 0;
    player.answerReady = false;
  }
  const pool = POOLS[type];
  let available = pool.map((_, index) => index).filter(index => !room.usedPrompts.includes(`${type}:${index}`));
  if (!available.length) {
    room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith(`${type}:`));
    available = pool.map((_, index) => index);
  }
  const index = available[Math.min(available.length - 1, Math.floor(rng() * available.length))];
  room.usedPrompts.push(`${type}:${index}`);
  const choice = type === 'majority' ? MAJORITY_PROMPTS[index] : type === 'minority' ? MINORITY_PROMPTS[index] : null;
  const scale = type === 'thermometer' ? THERMOMETER_PROMPTS[index] : null;
  const round: SideGameRound = {
    round: ++room.round, type,
    prompt: choice?.text ?? scale?.text ?? IDENTITY_PROMPTS[index],
    ...(scale ? { scale: { low: scale.low, high: scale.high } } : {}),
    players: players.map(p => p.id),
    options: choice ? choice.options.map((label, i) => ({ id: String(i), label })) : [],
    answers: {}, order: [], ballots: {}, results: [],
  };
  (room.sideRounds ??= []).push(round);
  room.matchIndex = 0;
  room.phase = type === 'identity' ? 'answering' : 'voting';
  room.deadline = now + (type === 'identity' ? room.settings.answerSeconds : room.settings.voteSeconds) * 1000;
}

function scoreSideQuestion(room: Room, round: SideGameRound) {
  if (round.results.some(result => result.index === room.matchIndex)) return;
  const author = currentAuthor(room, round);
  const validAuthor = author && !room.players[author].kicked ? author : null;
  const votes = Object.entries(ballots(room, round)).filter(([id, choice]) =>
    round.players.includes(id) && !room.players[id].kicked && !room.players[id].spectator && id !== author &&
    validChoice(room, round, choice));
  const counts: Record<string, number> = round.type === 'thermometer' ? {} :
    Object.fromEntries(options(room, round).map(option => [option.id, votes.filter(([, choice]) => choice === option.id).length]));
  const awards = new Map<string, number>();
  let average: number | undefined;
  if (round.type === 'majority') {
    const max = Math.max(0, ...Object.values(counts));
    for (const [id, choice] of votes) if (max > 0 && counts[choice] === max) awards.set(id, 100);
  } else if (round.type === 'minority') {
    // The least-picked option among those somebody picked wins; when every picked option is tied, nobody does.
    const picked = Object.values(counts).filter(count => count > 0);
    const fewest = Math.min(...picked);
    if (picked.length && fewest < Math.max(...picked))
      for (const [id, choice] of votes) if (counts[choice] === fewest) awards.set(id, 100);
  } else if (round.type === 'thermometer') {
    for (const [, choice] of votes) counts[choice] = (counts[choice] ?? 0) + 1;
    if (votes.length >= 2) {
      // Compare n·|v − mean| as integers so exact ties stay ties. Rank 1 + strictly closer players.
      const sum = votes.reduce((total, [, choice]) => total + Number(choice), 0);
      const distances = votes.map(([id, choice]) => [id, Math.abs(Number(choice) * votes.length - sum)] as const);
      for (const [id, distance] of distances) {
        const points = THERMOMETER_AWARDS[distances.filter(([, other]) => other < distance).length] ?? 0;
        if (points) awards.set(id, points);
      }
      average = Math.round(sum / votes.length * 10) / 10;
    }
  } else if (validAuthor) {
    for (const [id, choice] of votes) if (choice === author) awards.set(id, 100);
    const bonus = votes.filter(([, choice]) => choice !== author).length * 50;
    if (bonus) awards.set(validAuthor, bonus);
  }
  const result: PartyGameResult = {
    correctOption: validAuthor || null,
    counts,
    awards: [...awards].map(([id, points]) => ({ id, points })),
    ...(average === undefined ? {} : { average }),
  };
  for (const { id, points } of result.awards) {
    room.players[id].score += points;
    room.players[id].roundScore += points;
  }
  round.results.push({ index: room.matchIndex, author: validAuthor || null, text: validAuthor ? round.answers[validAuthor] : null, result });
}

export function advanceSideGame(room: Room, now: number, rng: () => number) {
  const round = currentSideRound(room);
  if (!round) return;
  if (room.phase === 'answering') {
    round.order = shuffled(sidePlayers(room, round).filter(id => Boolean(round.answers[id])), rng);
    room.matchIndex = 0;
    room.phase = round.order.length ? 'voting' : 'ranking';
    room.deadline = now + (round.order.length ? room.settings.voteSeconds * 1000 : 20000);
  } else if (room.phase === 'voting') {
    scoreSideQuestion(room, round);
    room.phase = 'reveal';
    room.deadline = now + 15000;
  } else if (room.phase === 'reveal') {
    if (round.type === 'identity') {
      do { room.matchIndex++; } while (room.matchIndex < round.order.length && !sidePlayers(room, round).includes(round.order[room.matchIndex]));
    }
    room.phase = round.type === 'identity' && room.matchIndex < round.order.length ? 'voting' : 'ranking';
    room.deadline = now + (room.phase === 'voting' ? room.settings.voteSeconds * 1000 : 20000);
  } else if (room.phase === 'ranking') {
    if (room.round >= room.settings.rounds || Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator).length < 3) {
      room.phase = 'finished';
      room.deadline = 0;
    } else beginSideRound(room, now, rng);
  }
}

export function syncSideProgress(room: Room, now: number, rng: () => number) {
  const round = currentSideRound(room);
  if (!round || room.pausedAt) return;
  if (room.phase === 'answering' && room.settings.autoAdvance) {
    const participants = sidePlayers(room, round);
    if (participants.length && participants.every(id => room.players[id].answerReady)) advanceSideGame(room, now, rng);
  } else if (room.phase === 'voting') {
    const author = currentAuthor(room, round);
    if ((author && room.players[author].kicked) ||
      (room.settings.autoAdvance && eligible(room, round).every(id => Object.hasOwn(ballots(room, round), id))))
      advanceSideGame(room, now, rng);
  }
}

export function sideAction(room: Room, playerId: string, action: Action, now: number) {
  const round = currentSideRound(room);
  requireThat(round && sidePlayers(room, round).includes(playerId), 'このゲームには参加できません。', 403);
  if (action.type === 'partyAnswer') {
    requireThat(round.type === 'identity' && room.phase === 'answering', '回答の受付は終了しました。', 409);
    requireThat(!room.players[playerId].answerReady, '「回答を直す」で確定を取り消してから修正してください。', 409);
    requireThat(typeof action.text === 'string', '文字で入力してください。');
    const text = normalizePlayerText(action.text);
    requireThat([...text].length > 0 && [...text].length <= 100, '1〜100文字で入力してください。');
    round.answers[playerId] = text;
  } else if (action.type === 'answerReady') {
    requireThat(round.type === 'identity' && room.phase === 'answering', '今は回答を確定できません。', 409);
    requireThat(typeof action.ready === 'boolean', '確定するか選んでください。');
    requireThat(round.answers[playerId], '回答を送信してから確定してください。', 409);
    room.players[playerId].answerReady = action.ready;
  } else if (action.type === 'partyVote') {
    requireThat(room.phase === 'voting' && now < room.deadline, '投票の受付は終了しました。', 409);
    requireThat(eligible(room, round).includes(playerId), '自分の回答には投票できません。', 403);
    requireThat(validChoice(room, round, action.choice), round.type === 'thermometer' ? '0〜100の数字を選んでください。' : '選択肢を選んでください。');
    const votes = round.ballots[String(room.matchIndex)] ??= {};
    requireThat(!Object.hasOwn(votes, playerId), '投票済みです。', 409);
    votes[playerId] = action.choice;
  } else throw new GameError('このゲームでは使えない操作です。');
}

export function projectSideGame(room: Room, me: string | null): PartyGameView | undefined {
  const round = currentSideRound(room);
  if (!round || !isSideGame(room)) return undefined;
  const participants = sidePlayers(room, round);
  const author = currentAuthor(room, round);
  const showAnswer = ['voting', 'reveal'].includes(room.phase) && author && !room.players[author].kicked;
  const stored = room.phase === 'reveal' ? round.results.find(result => result.index === room.matchIndex)?.result : null;
  return {
    type: round.type, prompt: round.prompt,
    ...(round.scale ? { scale: { ...round.scale } } : {}),
    answer: me && round.type === 'identity' && room.phase === 'answering' ? round.answers[me] ?? '' : '',
    answerRequired: Boolean(me && round.type === 'identity' && room.phase === 'answering' && participants.includes(me)),
    readyCount: participants.filter(id => room.players[id].answerReady).length,
    answererCount: participants.length,
    revealText: showAnswer ? round.answers[author] ?? null : null,
    options: ['voting', 'reveal'].includes(room.phase) ? options(room, round) : [],
    canVote: Boolean(me && room.phase === 'voting' && eligible(room, round).includes(me)),
    isAuthor: Boolean(me && author === me),
    voted: Boolean(me && Object.hasOwn(ballots(room, round), me)),
    votesReceived: room.phase === 'voting' ? eligible(room, round).filter(id => Object.hasOwn(ballots(room, round), id)).length : Object.keys(ballots(room, round)).length,
    eligible: eligible(room, round).length,
    index: round.type !== 'identity' ? room.round : room.matchIndex + 1,
    total: round.type !== 'identity' ? room.settings.rounds : room.phase === 'answering' ? participants.length : round.order.length,
    result: stored ? { correctOption: stored.correctOption && !room.players[stored.correctOption]?.kicked ? stored.correctOption : null,
      counts: { ...stored.counts }, awards: stored.awards.filter(award => !room.players[award.id]?.kicked),
      ...(stored.average === undefined ? {} : { average: stored.average }) } : null,
  };
}
