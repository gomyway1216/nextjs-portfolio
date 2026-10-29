import { GameError } from './errors';
import { drawingInput, DRAWING_ROOM_BUDGET } from './drawing-data';
import { DRAWING_PROMPTS } from './drawing-prompts';
import { normalizePlayerText } from './text';
import type { Action, DrawingGameView, DrawingHistoryChain, DrawingStep, Room } from './types';

const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => {
  if (!ok) throw new GameError(message, status);
};
export const isDrawingGame = (room: Room) => room.gameType === 'drawing';
const participants = (room: Room) => (room.drawing?.players ?? []).filter(id =>
  room.players[id]?.active && !room.players[id].kicked && !room.players[id].spectator);
const valid = (room: Room, step: DrawingStep | null | undefined) => Boolean(step && room.players[step.author] && !room.players[step.author].kicked);
const chainFor = (room: Room, id: string) => {
  const drawing = room.drawing!;
  return (drawing.players.indexOf(id) - drawing.stage + drawing.players.length) % drawing.players.length;
};
const drawings = (room: Room) => (room.drawing?.chains ?? []).flatMap(chain =>
  chain.steps.filter((step): step is DrawingStep => Boolean(step && step.kind === 'draw' && step.id && step.data && valid(room, step))));

export function beginDrawing(room: Room, now: number, rng: () => number) {
  const players = Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3 && players.length <= 12, '3〜12人の参加者が必要です。', 409);
  let pool = DRAWING_PROMPTS.map((prompt, i) => ({ prompt, id: `drawing:${i}` }))
    .filter(prompt => !room.usedPrompts.includes(prompt.id));
  if (pool.length < players.length) {
    room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith('drawing:'));
    pool = DRAWING_PROMPTS.map((prompt, i) => ({ prompt, id: `drawing:${i}` }));
  }
  const selected = [];
  while (selected.length < players.length) selected.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const stages = players.length === 3 ? 3 : 4;
  room.drawing = {
    players: players.map(player => player.id), stages, stage: 0,
    chains: selected.map(prompt => ({ prompt: prompt.prompt, steps: Array(stages).fill(null) })),
    revealed: 0, votes: {}, awards: {}, scored: false,
  };
  room.usedPrompts.push(...selected.map(prompt => prompt.id));
  for (const player of Object.values(room.players)) {
    player.answerReady = false;
    player.roundScore = 0;
    player.previousRank = 1;
  }
  room.round = 1;
  room.settings.rounds = 1;
  room.matchIndex = 0;
  room.phase = 'answering';
  room.deadline = now + room.settings.answerSeconds * 1000;
}

function scoreDrawings(room: Room) {
  const drawing = room.drawing!;
  if (drawing.scored) return;
  const works = drawings(room);
  drawing.awards = {};
  for (const [id, choice] of Object.entries(drawing.votes)) {
    const work = works.find(work => work.id === choice);
    if (!work || work.author === id || !drawing.players.includes(id) || room.players[id].kicked || room.players[id].spectator) continue;
    drawing.awards[work.author] = (drawing.awards[work.author] ?? 0) + 100;
  }
  for (const [id, points] of Object.entries(drawing.awards)) {
    room.players[id].score += points;
    room.players[id].roundScore += points;
  }
  drawing.scored = true;
}

export function advanceDrawing(room: Room, now: number) {
  const drawing = room.drawing;
  if (!drawing) return;
  if (room.phase === 'answering') {
    if (drawing.stage + 1 < drawing.stages) {
      drawing.stage++;
      for (const id of drawing.players) room.players[id].answerReady = false;
      room.deadline = now + room.settings.answerSeconds * 1000;
    } else {
      room.phase = 'reveal';
      room.matchIndex = 0;
      drawing.revealed = 1;
      room.deadline = now + 30000;
    }
  } else if (room.phase === 'reveal') {
    if (room.matchIndex < drawing.chains.length - 1) {
      drawing.revealed = ++room.matchIndex + 1;
      room.deadline = now + 30000;
    } else if (room.matchIndex === drawing.chains.length - 1) {
      room.phase = drawings(room).length ? 'voting' : 'ranking';
      room.deadline = now + (room.phase === 'voting' ? room.settings.voteSeconds * 1000 : 20000);
    } else {
      room.phase = 'ranking';
      room.deadline = now + 20000;
    }
  } else if (room.phase === 'voting') {
    scoreDrawings(room);
    room.phase = 'reveal';
    room.matchIndex = drawing.chains.length;
    room.deadline = now + 15000;
  } else if (room.phase === 'ranking') {
    room.phase = 'finished';
    room.deadline = 0;
  }
}

export function syncDrawing(room: Room, now: number) {
  if (!room.drawing || room.pausedAt || !room.settings.autoAdvance) return;
  const players = participants(room);
  if (room.phase === 'answering' && players.length && players.every(id => room.players[id].answerReady))
    advanceDrawing(room, now);
  else if (room.phase === 'voting' && players.length && players.every(id => Object.hasOwn(room.drawing!.votes, id)))
    advanceDrawing(room, now);
}

export function drawingAction(room: Room, id: string, action: Action, now: number) {
  const drawing = room.drawing;
  requireThat(drawing && participants(room).includes(id), 'この伝言には参加できません。', 403);
  if (action.type === 'drawingVote') {
    requireThat(room.phase === 'voting' && now < room.deadline, '投票の受付は終了しました。', 409);
    const work = drawings(room).find(work => work.id === action.choice);
    requireThat(work, '投票先が見つかりません。', 404);
    requireThat(work.author !== id, '自分の絵には投票できません。', 403);
    requireThat(!Object.hasOwn(drawing.votes, id), '投票済みです。', 409);
    drawing.votes[id] = action.choice;
    return;
  }
  requireThat(room.phase === 'answering', '伝言の受付は終了しました。', 409);
  const chain = drawing.chains[chainFor(room, id)];
  if (action.type === 'answerReady') {
    requireThat(typeof action.ready === 'boolean', '確定するか選んでください。');
    requireThat(chain.steps[drawing.stage], '伝言を送信してから確定してください。', 409);
    room.players[id].answerReady = action.ready;
    return;
  }
  requireThat(!room.players[id].answerReady, '「伝言を直す」で確定を取り消してから修正してください。', 409);
  if (action.type === 'drawingSubmit') {
    requireThat(drawing.stage % 2 === 0, '今は絵を言葉にする番です。', 409);
    const data = JSON.stringify(drawingInput(action.drawing));
    chain.steps[drawing.stage] = {
      author: id, kind: 'draw', data,
      id: `${room.game}-${chainFor(room, id)}-${drawing.stage}-${room.revision + 1}`,
    };
  } else if (action.type === 'drawingGuess') {
    requireThat(drawing.stage % 2 === 1 && typeof action.text === 'string', '今は絵を描く番です。', 409);
    const text = normalizePlayerText(action.text);
    requireThat([...text].length > 0 && [...text].length <= 80, '1〜80文字で伝えてください。');
    chain.steps[drawing.stage] = { author: id, kind: 'guess', text };
  } else throw new GameError('このゲームでは使えない操作です。');
  requireThat(new TextEncoder().encode(JSON.stringify(room)).length <= DRAWING_ROOM_BUDGET,
    'この部屋の保存上限です。線を減らして、もう一度送ってね。', 413);
}

export function moderateDrawing(room: Room, id: string) {
  const drawing = room.drawing;
  if (!drawing) return;
  for (const [voter, choice] of Object.entries(drawing.votes)) {
    const work = drawing.chains.flatMap(chain => chain.steps).find(step => step?.id === choice);
    if (voter === id || work?.author === id) delete drawing.votes[voter];
  }
  if (drawing.scored) {
    for (const [author, points] of Object.entries(drawing.awards)) {
      room.players[author].score -= points;
      room.players[author].roundScore -= points;
    }
    drawing.scored = false;
    scoreDrawings(room);
  }
}

/** Return just one authorized drawing; room polls contain IDs, never vector payloads. */
export function drawingAsset(room: Room, id: string, me: string | null) {
  const drawing = room.drawing;
  requireThat(drawing && /^[0-9]{1,8}-[0-9]{1,2}-[0-9]-[0-9]{1,10}$/.test(id), '絵が見つかりません。', 404);
  const chainIndex = drawing.chains.findIndex(chain => chain.steps.some(step => step?.id === id));
  requireThat(chainIndex >= 0, '絵が見つかりません。', 404);
  const chain = drawing.chains[chainIndex];
  const step = chain.steps.find(step => step?.id === id)!;
  requireThat(valid(room, step) && step?.data, 'この絵は表示できません。', 404);
  const published = chainIndex < drawing.revealed;
  const assigned = me && room.phase === 'answering' && participants(room).includes(me) && chainFor(room, me) === chainIndex;
  const mine = assigned && chain.steps[drawing.stage]?.id === id;
  const previous = assigned && drawing.stage % 2 === 1 && chain.steps[drawing.stage - 1]?.id === id;
  requireThat(published || mine || previous, 'この絵はまだ公開されていません。', 403);
  return { data: drawingInput(JSON.parse(step.data)), published };
}

export function projectDrawing(room: Room, me: string | null): DrawingGameView | undefined {
  const drawing = room.drawing;
  if (!isDrawingGame(room) || !drawing) return;
  const players = participants(room);
  const assigned = Boolean(me && room.phase === 'answering' && players.includes(me));
  const chainIndex = assigned ? chainFor(room, me!) : -1;
  const mine = assigned ? drawing.chains[chainIndex].steps[drawing.stage] : null;
  const previous = assigned ? drawing.chains[chainIndex].steps[drawing.stage - 1] : null;
  const showChain = room.phase === 'reveal' && room.matchIndex < drawing.chains.length;
  const chain = showChain ? drawing.chains[room.matchIndex] : null;
  const results = drawing.scored && ['reveal', 'ranking', 'finished'].includes(room.phase);
  return {
    stage: drawing.stage + 1, stages: drawing.stages,
    readyCount: players.filter(id => room.players[id].answerReady).length,
    answererCount: players.length,
    assignment: assigned ? {
      key: `${room.game}:${chainIndex}:${drawing.stage}`,
      kind: drawing.stage % 2 === 0 ? 'draw' : 'guess',
      prompt: drawing.stage === 0 ? drawing.chains[chainIndex].prompt : valid(room, previous) ? previous?.text ?? null : null,
      inputDrawingId: drawing.stage % 2 === 1 && valid(room, previous) ? previous?.id ?? null : null,
      savedDrawingId: mine?.id ?? null, answer: mine?.text ?? '', saved: Boolean(mine),
    } : null,
    chain: chain ? {
      index: room.matchIndex + 1, total: drawing.chains.length, prompt: chain.prompt,
      steps: chain.steps.map((step, stage) => ({
        kind: stage % 2 === 0 ? 'draw' : 'guess',
        name: valid(room, step) ? room.players[step!.author].name : '今回はパス',
        avatar: valid(room, step) ? room.players[step!.author].avatar : '',
        drawingId: valid(room, step) ? step?.id ?? null : null,
        text: valid(room, step) ? step?.text ?? null : null,
      })),
    } : null,
    gallery: ['voting', 'reveal', 'ranking', 'finished'].includes(room.phase) && drawing.revealed === drawing.chains.length
      ? drawings(room).map(step => ({ id: step.id!, author: step.author,
        name: room.players[step.author].name, avatar: room.players[step.author].avatar,
        votes: results ? Object.values(drawing.votes).filter(id => id === step.id).length : 0,
        points: results ? Object.values(drawing.votes).filter(id => id === step.id).length * 100 : 0,
      })) : [],
    canVote: Boolean(me && room.phase === 'voting' && players.includes(me)),
    voted: Boolean(me && Object.hasOwn(drawing.votes, me)),
    votesReceived: room.phase === 'voting' ? players.filter(id => Object.hasOwn(drawing.votes, id)).length : Object.keys(drawing.votes).length,
    eligible: players.length, results,
  };
}

export function drawingHistory(room: Room): DrawingHistoryChain[] {
  const drawing = room.drawing;
  if (!drawing) return [];
  return drawing.chains.slice(0, drawing.revealed).map(chain => ({
    prompt: chain.prompt,
    steps: chain.steps.map((step, stage) => {
      const visible = valid(room, step);
      const votes = visible && drawing.scored ? Object.values(drawing.votes).filter(id => id === step?.id).length : 0;
      return {
        kind: stage % 2 === 0 ? 'draw' : 'guess',
        name: visible ? room.players[step!.author].name : '今回はパス', avatar: visible ? room.players[step!.author].avatar : '',
        drawing: visible ? step?.data ?? null : null, text: visible ? step?.text ?? null : null,
        votes, points: votes * 100,
      };
    }),
  }));
}
