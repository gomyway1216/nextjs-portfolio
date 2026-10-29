import {
  AVATARS,
  CATEGORIES,
  DEFAULT_SETTINGS,
  type Action,
  type Match,
  type Player,
  type Prompt,
  type Room,
  type RoomView,
  type Settings,
} from './types';
import { gameHighlights, gamePlayerIds } from './party';
import { normalizePlayerText } from './text';
import { GameError } from './errors';
import { advanceSideGame, beginSideRound, currentSideRound, isSideGame, projectSideGame, sideAction, syncSideProgress } from './side-games';
import { advanceDrawing, beginDrawing, drawingAction, isDrawingGame, moderateDrawing, projectDrawing, syncDrawing } from './drawing-game';

export { GameError } from './errors';
const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (
  ok,
  message,
  status,
) => {
  if (!ok) throw new GameError(message, status);
};
export const ROOM_TTL = 8 * 60 * 60 * 1000;
export function textInput(value: unknown, max: number): string {
  requireThat(typeof value === 'string', '文字で入力してください。');
  const text = normalizePlayerText(value);
  requireThat([...text].length > 0 && [...text].length <= max, `1〜${max}文字で入力してください。`);
  return text;
}
export function settingsInput(value: unknown): Settings {
  requireThat(value && typeof value === 'object', '設定が正しくありません。');
  const s = value as Settings;
  requireThat(s.gameType === undefined || ['ogiri', 'majority', 'identity', 'drawing'].includes(s.gameType), 'ゲームを選んでください。');
  requireThat(
    Number.isInteger(s.rounds) && s.rounds >= 1 && s.rounds <= 5,
    'ラウンド数は1〜5です。',
  );
  requireThat(
    Number.isInteger(s.answerSeconds) && s.answerSeconds >= 30 && s.answerSeconds <= 600,
    '回答時間は30〜600秒です。',
  );
  requireThat(
    Number.isInteger(s.voteSeconds) && s.voteSeconds >= 10 && s.voteSeconds <= 120,
    '投票時間は10〜120秒です。',
  );
  requireThat(
    typeof s.autoAdvance === 'boolean' && typeof s.halloween === 'boolean',
    '設定が正しくありません。',
  );
  requireThat(
    Array.isArray(s.categories) &&
      s.categories.length <= 12 &&
      s.categories.every((c) => Object.hasOwn(CATEGORIES, c)),
    'ジャンルが正しくありません。',
  );
  return {
    gameType: s.gameType ?? 'ogiri',
    rounds: s.gameType === 'drawing' ? 1 : s.rounds,
    answerSeconds: s.answerSeconds,
    voteSeconds: s.voteSeconds,
    autoAdvance: s.autoAdvance,
    halloween: s.halloween,
    categories: [...new Set(s.categories)],
  };
}
export function newPlayer(
  id: string,
  secretHash: string,
  name: unknown,
  avatar: unknown,
  now: number,
): Player {
  requireThat(typeof avatar === 'string' && AVATARS.includes(avatar), 'アバターを選んでください。');
  return {
    id,
    secretHash,
    name: textInput(name, 16),
    avatar,
    score: 0,
    roundScore: 0,
    previousRank: 1,
    active: true,
    kicked: false,
    joinedRound: 0,
    lastSeen: now,
  };
}
export function createRoom(code: string, host: Player, now: number): Room {
  return {
    code,
    hostId: host.id,
    createdAt: now,
    expiresAt: now + ROOM_TTL,
    revision: 1,
    settings: { ...DEFAULT_SETTINGS },
    phase: 'lobby',
    round: 0,
    matchIndex: 0,
    deadline: 0,
    pausedAt: 0,
    players: { [host.id]: host },
    matches: [],
    usedPrompts: [],
    pairCounts: {},
    game: 1,
  };
}
export function joinRoom(room: Room, player: Player): void {
  requireThat(
    room.phase === 'lobby' || room.phase === 'finished',
    'ゲーム中の新規参加はできません。再戦の受付までお待ちください。',
    409,
  );
  requireThat(
    Object.values(room.players).filter((p) => !p.kicked && !p.spectator).length < 12,
    'このルームは満員です（最大12人）。',
    409,
  );
  requireThat(
    Object.keys(room.players).length < 64,
    '参加履歴の上限です。新しいルームを作成してください。',
    409,
  );
  const names = new Set(Object.values(room.players).map((p) => p.name.toLocaleLowerCase('ja')));
  const original = player.name;
  let suffix = 2;
  while (names.has(player.name.toLocaleLowerCase('ja')))
    player.name = `${[...original].slice(0, 12).join('')} ${suffix++}`;
  room.players[player.id] = player;
  room.revision++;
}
function shuffled<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
const pairKey = (a: string, b: string) => [a, b].sort().join(':');
/** A cycle gives every player exactly two distinct opponents, including odd-sized groups. */
export function pairPlayers(
  ids: string[],
  history: Record<string, number>,
  rng = Math.random,
): [string, string][] {
  let best = ids,
    cost = Infinity;
  for (let attempt = 0; attempt < 120; attempt++) {
    const order = shuffled(ids, rng);
    const score = order.reduce(
      (sum, id, i) => sum + (history[pairKey(id, order[(i + 1) % order.length])] ?? 0),
      0,
    );
    if (score < cost) {
      best = order;
      cost = score;
    }
    if (cost === 0) break;
  }
  return best.map((id, i) => [id, best[(i + 1) % best.length]]);
}
export function rankPlayers(room: Room) {
  const players = Object.values(room.players)
    .filter((p) => !p.kicked && !p.spectator)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return players.map((p) => ({
    ...p,
    rank: 1 + players.filter((other) => other.score > p.score).length,
  }));
}
function beginRound(room: Room, now: number, prompts: Prompt[], rng: () => number) {
  const players = Object.values(room.players).filter((p) => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3, '3人以上の参加者が必要です。', 409);
  const categories = room.settings.halloween ? ['halloween'] : room.settings.categories;
  const eligiblePrompts = prompts.filter(
    (p) => p.enabled && (!categories.length || categories.includes(p.category)),
  );
  if (
    room.round === 0 &&
    eligiblePrompts.filter((p) => !room.usedPrompts.includes(p.id)).length <
      players.length * room.settings.rounds
  )
    room.usedPrompts = [];
  let pool = eligiblePrompts.filter((p) => !room.usedPrompts.includes(p.id));
  requireThat(
    pool.length >= players.length,
    'このジャンルの未出題のお題が足りません。ジャンルを増やしてください。',
    409,
  );
  pool = shuffled(pool, rng);
  // Round-robin categories avoids long runs of a single genre without synthetic prompt variations.
  const selected: Prompt[] = [];
  while (selected.length < players.length) {
    const previous = selected.at(-1)?.category;
    let index = pool.findIndex((p) => p.category !== previous);
    if (index < 0) index = 0;
    selected.push(pool.splice(index, 1)[0]);
  }
  for (const p of rankPlayers(room)) {
    room.players[p.id].previousRank = p.rank;
    room.players[p.id].roundScore = 0;
    room.players[p.id].answerReady = false;
  }
  if (room.round > 0) (room.pastRounds ??= []).push({ round: room.round, matches: room.matches });
  room.round++;
  room.matchIndex = 0;
  room.matches = pairPlayers(
    players.map((p) => p.id),
    room.pairCounts,
    rng,
  ).map((pair, index) => {
    const key = pairKey(...pair);
    room.pairCounts[key] = (room.pairCounts[key] ?? 0) + 1;
    const prompt = selected[index];
    room.usedPrompts.push(prompt.id);
    return {
      id: `${room.game}-${room.round}-${index}`,
      promptId: prompt.id,
      players: shuffled(pair, rng) as [string, string],
      answers: {},
      hidden: {},
      votes: {},
      scored: false,
      points: [0, 0],
    };
  });
  room.phase = 'answering';
  room.deadline = now + room.settings.answerSeconds * 1000;
}
function visible(room: Room, match: Match, index: number) {
  const id = match.players[index];
  return !match.hidden[id] && !room.players[id].kicked && Boolean(match.answers[id]);
}
function eligible(room: Room, match: Match) {
  return Object.values(room.players).filter(
    (p) => p.active && !p.kicked && !p.spectator && !match.players.includes(p.id) &&
      room.matches.some((assignment) => assignment.players.includes(p.id)),
  );
}
function scoreMatch(room: Room, match: Match) {
  if (match.scored) return;
  const counts = [0, 1].map((i) =>
    visible(room, match, i) ? Object.values(match.votes).filter((v) => v === i).length : 0,
  );
  match.points = counts.map((votes, i) =>
    visible(room, match, i) ? votes * 100 + (votes > counts[1 - i] ? 200 : 0) : 0,
  );
  match.players.forEach((id, i) => {
    room.players[id].score += match.points[i];
    room.players[id].roundScore += match.points[i];
  });
  match.scored = true;
}
function rescoreMatch(room: Room, match: Match) {
  match.players.forEach((id, i) => {
    room.players[id].score -= match.points[i];
    room.players[id].roundScore -= match.points[i];
  });
  match.scored = false;
  scoreMatch(room, match);
}
function advance(room: Room, now: number, prompts: Prompt[], rng: () => number) {
  if (room.phase === 'lobby') {
    room.gameType = room.settings.gameType ?? 'ogiri';
    if (isDrawingGame(room)) {
      beginDrawing(room, now, rng);
      return;
    }
    if (isSideGame(room)) {
      beginSideRound(room, now, rng);
      return;
    }
  } else if (isDrawingGame(room)) {
    advanceDrawing(room, now);
    return;
  } else if (isSideGame(room)) {
    advanceSideGame(room, now, rng);
    return;
  }
  switch (room.phase) {
    case 'lobby':
      beginRound(room, now, prompts, rng);
      break;
    case 'answering':
      room.phase = 'voting';
      room.deadline = now + room.settings.voteSeconds * 1000;
      break;
    case 'voting':
      scoreMatch(room, room.matches[room.matchIndex]);
      room.phase = 'reveal';
      room.deadline = now + 15000;
      break;
    case 'reveal':
      if (++room.matchIndex < room.matches.length) {
        room.phase = 'voting';
        room.deadline = now + room.settings.voteSeconds * 1000;
      } else {
        room.phase = 'ranking';
        room.deadline = now + 20000;
      }
      break;
    case 'ranking':
      if (room.round >= room.settings.rounds) {
        room.phase = 'finished';
        room.deadline = 0;
      } else if (
        Object.values(room.players).filter((p) => p.active && !p.kicked && !p.spectator).length < 3
      ) {
        room.phase = 'finished';
        room.deadline = 0;
      } else beginRound(room, now, prompts, rng);
      break;
  }
}
export function tick(room: Room, now: number, prompts: Prompt[], rng = Math.random): boolean {
  if (room.pausedAt || !room.deadline || now < room.deadline || room.phase === 'finished')
    return false;
  // The answer timer is a guide: only everyone's OK or the host closes submissions.
  if (room.phase === 'answering') return false;
  if (['reveal', 'ranking'].includes(room.phase) && !room.settings.autoAdvance) return false;
  advance(room, now, prompts, rng);
  room.revision++;
  return true;
}
function advanceReadyAnswers(room: Room, now: number, prompts: Prompt[], rng: () => number) {
  if (isDrawingGame(room)) {
    syncDrawing(room, now);
    return;
  }
  if (isSideGame(room)) {
    syncSideProgress(room, now, rng);
    return;
  }
  if (room.phase !== 'answering' || room.pausedAt || !room.settings.autoAdvance) return;
  const assigned = new Set(room.matches.flatMap((m) => m.players));
  const players = Object.values(room.players).filter((p) => assigned.has(p.id) && p.active && !p.kicked && !p.spectator);
  if (players.length && players.every((p) => p.answerReady)) advance(room, now, prompts, rng);
}
export function act(
  room: Room,
  playerId: string,
  action: Action,
  now: number,
  prompts: Prompt[],
  rng = Math.random,
): void {
  const player = room.players[playerId];
  requireThat(player && !player.kicked, '参加セッションが無効です。', 403);
  const host = room.hostId === playerId;
  if (!['answer', 'answerReady', 'vote', 'partyAnswer', 'partyVote', 'drawingSubmit', 'drawingGuess', 'drawingVote', 'leave', 'return', 'heartbeat'].includes(action.type))
    requireThat(host, '主催者だけが操作できます。', 403);
  if (action.type === 'heartbeat') {
    player.lastSeen = now;
    return;
  }
  if (action.type === 'leave') {
    player.active = false;
    player.lastSeen = now;
    room.expiresAt = now + ROOM_TTL;
    advanceReadyAnswers(room, now, prompts, rng);
    room.revision++;
    return;
  }
  if (action.type === 'return') {
    player.active = true;
  } else if (action.type === 'hostParticipation') {
    requireThat(room.phase === 'lobby', '回答への参加はゲーム開始前に切り替えてください。', 409);
    requireThat(typeof action.participating === 'boolean', '参加方法を選んでください。');
    requireThat(
      !action.participating || !player.spectator || rankPlayers(room).length < 12,
      'このルームは満員です（最大12人）。',
      409,
    );
    player.spectator = !action.participating;
  } else if (action.type === 'settings') {
    requireThat(
      room.phase === 'lobby' || room.phase === 'finished',
      '設定は参加受付中に変更できます。',
      409,
    );
    const settings = settingsInput(action.settings);
    const pool = prompts.filter(
      (p) =>
        p.enabled &&
        (settings.halloween
          ? p.category === 'halloween'
          : !settings.categories.length || settings.categories.includes(p.category)),
    );
    requireThat(
      settings.gameType !== 'ogiri' || pool.length >= settings.rounds * 12,
      'お題が不足するため、ジャンルを追加するかラウンド数を減らしてください。',
    );
    room.settings = settings;
  } else if (action.type === 'extend') {
    requireThat(room.deadline > 0 && !['lobby', 'finished'].includes(room.phase), '今は延長できません。', 409);
    room.deadline = Math.max(room.deadline, room.pausedAt || now) + (room.phase === 'answering' ? 60000 : 30000);
  } else if (action.type === 'pause') {
    requireThat(!room.pausedAt && room.deadline > 0, '今は一時停止できません。');
    room.pausedAt = now;
  } else if (action.type === 'resume') {
    requireThat(room.pausedAt, '一時停止していません。');
    room.deadline += now - room.pausedAt;
    room.pausedAt = 0;
  } else if (action.type === 'finish') {
    room.phase = 'finished';
    room.deadline = 0;
    room.pausedAt = 0;
  } else if (action.type === 'rematch') {
    requireThat(room.phase === 'finished', '終了後に再戦できます。', 409);
    room.phase = 'lobby';
    room.round = 0;
    room.matches = [];
    room.pastRounds = [];
    room.sideRounds = [];
    delete room.drawing;
    room.matchIndex = 0;
    room.pausedAt = 0;
    room.deadline = 0;
    room.game++;
    for (const p of Object.values(room.players)) {
      p.score = 0;
      p.roundScore = 0;
      p.previousRank = 1;
      p.partyEarned = 0;
      p.answerReady = false;
    }
    // Retain recent prompts between games, but never exhaust a selected genre forever.
    const available = prompts.filter(
      (p) =>
        p.enabled &&
        (room.settings.halloween
          ? p.category === 'halloween'
          : !room.settings.categories.length || room.settings.categories.includes(p.category)),
    );
    if (
      available.filter((p) => !room.usedPrompts.includes(p.id)).length <
      room.settings.rounds * 12
    )
      room.usedPrompts = [];
  } else if (action.type === 'kick') {
    requireThat(
      typeof action.playerId === 'string' &&
        action.playerId !== room.hostId &&
        Object.hasOwn(room.players, action.playerId),
      '退出させる参加者を選んでください。',
    );
    room.players[action.playerId].kicked = true;
    room.players[action.playerId].active = false;
    moderateDrawing(room, action.playerId);
    for (const m of room.matches) if (!m.scored) delete m.votes[action.playerId];
    const current = room.matches[room.matchIndex];
    if (room.phase === 'reveal' && current?.scored) rescoreMatch(room, current);
    const side = currentSideRound(room);
    if (side && !side.results.some(result => result.index === room.matchIndex)) {
      const votes = side.ballots[String(room.matchIndex)];
      if (votes) for (const [id, choice] of Object.entries(votes))
        if (id === action.playerId || (side.type === 'identity' && choice === action.playerId)) delete votes[id];
    }
  } else if (action.type === 'hide') {
    const m = room.matches.find((m) => m.id === action.matchId);
    requireThat(
      m &&
        m.id === room.matches[room.matchIndex]?.id &&
        ['voting', 'reveal'].includes(room.phase) &&
        (action.choice === 0 || action.choice === 1),
      'この回答は非表示にできません。',
    );
    m.hidden[m.players[action.choice]] = true;
    for (const [id, vote] of Object.entries(m.votes))
      if (vote === action.choice) delete m.votes[id];
    if (m.scored) rescoreMatch(room, m);
  } else {
    requireThat(!room.pausedAt, '一時停止中です。', 409);
    if (action.type === 'start') {
      requireThat(room.phase === 'lobby', 'すでに開始しています。', 409);
      advance(room, now, prompts, rng);
    } else if (action.type === 'next') {
      requireThat(!['lobby', 'finished'].includes(room.phase), '今は進められません。');
      advance(room, now, prompts, rng);
    } else if (isDrawingGame(room)) {
      drawingAction(room, playerId, action, now);
    } else if (isSideGame(room)) {
      sideAction(room, playerId, action, now);
    } else if (['partyAnswer', 'partyVote', 'drawingSubmit', 'drawingGuess', 'drawingVote'].includes(action.type)) {
      throw new GameError('このゲームでは使えない操作です。');
    } else if (action.type === 'answer') {
      requireThat(
        room.phase === 'answering' && player.active,
        '回答の受付は終了しました。',
        409,
      );
      const m = room.matches.find((m) => m.id === action.matchId);
      requireThat(!player.answerReady, '「回答を直す」で確定を取り消してから修正してください。', 409);
      requireThat(m && m.players.includes(playerId), 'このお題には回答できません。', 403);
      m.answers[playerId] = textInput(action.text, 100);
    } else if (action.type === 'answerReady') {
      requireThat(room.phase === 'answering' && player.active && !player.spectator,
        '今は回答を確定できません。', 409);
      requireThat(typeof action.ready === 'boolean', '確定するか選んでください。');
      const assignments = room.matches.filter((m) => m.players.includes(playerId));
      requireThat(assignments.length === 2 && assignments.every((m) => Boolean(m.answers[playerId])),
        '2問とも回答を送信してから確定してください。', 409);
      player.answerReady = action.ready;
    } else if (action.type === 'vote') {
      requireThat(
        room.phase === 'voting' && now < room.deadline,
        '投票の受付は終了しました。',
        409,
      );
      const m = room.matches[room.matchIndex];
      requireThat(
        m.id === action.matchId && eligible(room, m).some((p) => p.id === playerId),
        '自分の対戦には投票できません。',
        403,
      );
      requireThat(action.choice === 0 || action.choice === 1, '回答を選んでください。');
      requireThat(visible(room, m, action.choice), 'この回答には投票できません。');
      requireThat(!Object.hasOwn(m.votes, playerId), '投票済みです。', 409);
      m.votes[playerId] = action.choice;
      if (room.settings.autoAdvance && eligible(room, m).every((p) => Object.hasOwn(m.votes, p.id)))
        advance(room, now, prompts, rng);
    } else throw new GameError('不明な操作です。');
  }
  advanceReadyAnswers(room, now, prompts, rng);
  player.lastSeen = now;
  room.expiresAt = now + ROOM_TTL;
  room.revision++;
}
/** Explicit allowlist: never spread the private room or player record into a response. */
export const turnKey = (room: Room) => `${room.game}:${room.round}:${room.phase}:${room.matchIndex}${isDrawingGame(room) ? `:${room.drawing?.stage ?? 0}` : ''}`;
export function project(
  room: Room,
  playerId: string | null,
  now: number,
  prompts: Prompt[],
): RoomView {
  const me = playerId && room.players[playerId] && !room.players[playerId].kicked ? playerId : null;
  const promptText = (id: string) =>
    prompts.find((p) => p.id === id)?.text ?? 'お題を読み込めませんでした';
  const current = room.matches[room.matchIndex];
  const showMatch = current && ['voting', 'reveal'].includes(room.phase);
  const participants = gamePlayerIds(room);
  const side = isSideGame(room) ? currentSideRound(room) : undefined;
  const roundParticipants = new Set(room.drawing?.players ?? side?.players ?? room.matches.flatMap((m) => m.players));
  return {
    gameType: room.phase === 'lobby' ? room.settings.gameType ?? 'ogiri' : room.gameType ?? 'ogiri',
    sideGame: projectSideGame(room, me),
    drawingGame: projectDrawing(room, me),
    turn: turnKey(room),
    history: room.history ?? [],
    partyGames: room.partyGames ?? 0,
    partyPlayers: Object.values(room.players).some(
      (p) => !p.kicked && p.spectator && (p.partyPoints ?? 0) > 0,
    )
      ? Object.values(room.players)
          .filter((p) => !p.kicked && (!p.spectator || (p.partyPoints ?? 0) > 0))
          .map((p) => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            partyPoints: p.partyPoints ?? 0,
            partyEarned: p.partyEarned ?? 0,
          }))
      : undefined,
    highlights: ['ranking', 'finished'].includes(room.phase) ? gameHighlights(room, prompts) : null,
    code: room.code,
    revision: room.revision,
    game: room.game,
    phase: room.phase,
    round: room.round,
    settings: room.settings,
    deadline: room.deadline,
    paused: Boolean(room.pausedAt),
    serverTime: room.pausedAt || now,
    me,
    ...(me ? { hasPassphrase: Boolean(room.players[me].passphraseHash) } : {}),
    resting: Boolean(me && !room.players[me].active),
    isHost: me === room.hostId,
    hostPlays: !room.players[room.hostId].spectator,
    players: rankPlayers(room).map((p) => ({
      id: p.id,
      answerReady: Boolean(p.answerReady),
      answeringThisRound: roundParticipants.has(p.id),
      playingThisGame: participants.has(p.id),
      partyPoints: p.partyPoints ?? 0,
      partyEarned: p.partyEarned ?? 0,
      name: p.name,
      avatar: p.avatar,
      score: p.score,
      roundScore: p.roundScore,
      rank: p.rank,
      previousRank: p.previousRank,
      active: p.active,
      connected: now - p.lastSeen < 65000,
      answered: side?.type === 'identity' ? Number(Boolean(side.answers[p.id])) : room.matches.filter((m) => m.answers[p.id]).length,
    })),
    assignments:
      me && room.players[me].active && room.phase === 'answering'
        ? room.matches
            .filter((m) => m.players.includes(me))
            .map((m) => ({ id: m.id, text: promptText(m.promptId), answer: m.answers[me] ?? '' }))
        : [],
    match: showMatch
      ? {
          id: current.id,
          text: promptText(current.promptId),
          index: room.matchIndex + 1,
          total: room.matches.length,
          answers: [0, 1].map((i) =>
            visible(room, current, i) ? current.answers[current.players[i]] : null,
          ),
          canVote: Boolean(me && eligible(room, current).some((p) => p.id === me)),
          isAuthor: Boolean(me && current.players.includes(me)),
          voted: Boolean(me && Object.hasOwn(current.votes, me)),
          votesReceived: room.phase === 'voting' ? eligible(room, current).filter(player => Object.hasOwn(current.votes, player.id)).length : Object.keys(current.votes).length,
          eligible: eligible(room, current).length,
          result:
            room.phase === 'reveal'
              ? {
                  counts: [0, 1].map((i) =>
                    visible(room, current, i)
                      ? Object.values(current.votes).filter((v) => v === i).length
                      : 0,
                  ),
                  points: current.points,
                  authors: current.players.map((id) =>
                    room.players[id].kicked ? '退出したプレイヤー' : room.players[id].name,
                  ),
                }
              : null,
        }
      : null,
  };
}
