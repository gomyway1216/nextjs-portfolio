import { GameError } from './errors';
import { drawingInput, DRAWING_ROOM_BUDGET } from './drawing-data';
import { DRAWING_PROMPTS, SHIRITORI_WORDS } from './drawing-prompts';
import { QUIZ_CHOICES, QUIZ_WORDS } from './quiz-words';
import { shiritoriLinks, shiritoriProblem, shiritoriStages, shiritoriWord, tailSound } from './shiritori';
import { normalizePlayerText } from './text';
import type { Action, DrawingGameView, DrawingHistoryChain, DrawingRound, DrawingStep, Room } from './types';

const requireThat: (ok: unknown, message: string, status?: number) => asserts ok = (ok, message, status = 400) => {
  if (!ok) throw new GameError(message, status);
};
const isShiritori = (room: Room) => room.gameType === 'shiritori';
const isQuiz = (room: Room) => room.gameType === 'quiz';
export const isDrawingGame = (room: Room) => room.gameType === 'drawing' || isShiritori(room) || isQuiz(room);
const participants = (room: Room) => (room.drawing?.players ?? []).filter(id =>
  room.players[id]?.active && !room.players[id].kicked && !room.players[id].spectator);
const valid = (room: Room, step: DrawingStep | null | undefined) => Boolean(step && room.players[step.author] && !room.players[step.author].kicked);
const chainFor = (room: Room, id: string) => {
  const drawing = room.drawing!;
  return (drawing.players.indexOf(id) - drawing.stage + drawing.players.length) % drawing.players.length;
};
const drawings = (room: Room) => (room.drawing?.chains ?? []).flatMap(chain =>
  chain.steps.filter((step): step is DrawingStep => Boolean(step && step.kind === 'draw' && step.id && step.data && valid(room, step))));
type Chain = DrawingRound['chains'][number];
/** A link is judged only when the next person had to read the sound from a picture. */
const linked = (room: Room, chain: Chain, stage: number) => {
  const before = chain.steps[stage - 1], step = chain.steps[stage];
  return isShiritori(room) && valid(room, before) && valid(room, step) ? shiritoriLinks(before!.text!, step!.text!) : null;
};
/** The sound a player is told outright: the first word, or the last word before a passed picture. */
function givenSound(room: Room, chain: Chain, stage: number) {
  if (!isShiritori(room) || valid(room, chain.steps[stage - 1])) return null;
  for (let i = stage - 1; i >= 0; i--) if (valid(room, chain.steps[i])) return tailSound(chain.steps[i]!.text!);
  return tailSound(chain.prompt);
}
/** A quiz picture scores only once its guesses have closed, never because the game ended mid-guess. */
const quizClosed = (room: Room, index: number) => Boolean(room.drawing!.chains[index].closed);
/** Everyone in the game except the artist, who already knows. */
const quizGuessers = (room: Room, index: number) => (room.drawing?.players ?? []).filter(id =>
  id !== room.drawing!.chains[index].steps[0]?.author && room.players[id] && !room.players[id].kicked && !room.players[id].spectator);
const quizAnswer = (room: Room, index: number) => room.drawing!.chains[index].choices!.indexOf(room.drawing!.chains[index].prompt);
const quizCorrect = (room: Room, index: number) => quizGuessers(room, index)
  .filter(id => room.drawing!.chains[index].guesses![id] === quizAnswer(room, index));
const QUIZ_POINTS = 100, QUIZ_ARTIST_POINTS = 50;
function quizRound(players: number, used: string[], rng: () => number) {
  const all = Object.entries(QUIZ_WORDS).flatMap(([group, words]) => words.map((word, i) => ({ word, group, id: `quiz:${group}:${i}` })));
  let pool = all.filter(word => !used.includes(word.id));
  const reset = pool.length < players;
  if (reset) pool = all;
  const pick = <T,>(items: T[]) => items.splice(Math.floor(rng() * items.length), 1)[0];
  const selected = Array.from({ length: players }, () => pick(pool));
  // The other choices share the answer's group, so the picture has to tell a cat from a dog.
  const choices = selected.map(({ word, group }) => {
    const others = QUIZ_WORDS[group].filter(other => other !== word);
    const options = [word, ...Array.from({ length: QUIZ_CHOICES - 1 }, () => pick(others))];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    return options;
  });
  return { reset, selected, choices };
}

/** Every player draws one word, then the room guesses each picture from four choices. */
function beginQuiz(room: Room, players: string[], rng: () => number) {
  const { reset, selected, choices } = quizRound(players.length, room.usedPrompts, rng);
  if (reset) room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith('quiz:'));
  room.drawing = {
    players, stages: 1, stage: 0,
    chains: selected.map((word, i) => ({ prompt: word.word, steps: [null], choices: choices[i], guesses: {} })),
    revealed: 0, votes: {}, awards: {}, scored: false,
  };
  room.usedPrompts.push(...selected.map(word => word.id));
}
function beginChains(room: Room, players: string[], rng: () => number) {
  const type = isShiritori(room) ? 'shiritori' : 'drawing';
  const all = (type === 'shiritori' ? SHIRITORI_WORDS : DRAWING_PROMPTS).map((prompt, i) => ({ prompt, id: `${type}:${i}` }));
  let pool = all.filter(prompt => !room.usedPrompts.includes(prompt.id));
  if (pool.length < players.length) {
    room.usedPrompts = room.usedPrompts.filter(id => !id.startsWith(`${type}:`));
    pool = all;
  }
  const selected = [];
  while (selected.length < players.length) selected.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const stages = type === 'shiritori' ? shiritoriStages(players.length) : players.length === 3 ? 3 : 4;
  room.drawing = {
    players, stages, stage: 0,
    chains: selected.map(prompt => ({ prompt: prompt.prompt, steps: Array(stages).fill(null) })),
    revealed: 0, votes: {}, awards: {}, scored: false,
  };
  room.usedPrompts.push(...selected.map(prompt => prompt.id));
}

export function beginDrawing(room: Room, now: number, rng: () => number) {
  const players = Object.values(room.players).filter(p => p.active && !p.kicked && !p.spectator);
  requireThat(players.length >= 3 && players.length <= 12, '3〜12人の参加者が必要です。', 409);
  (isQuiz(room) ? beginQuiz : beginChains)(room, players.map(player => player.id), rng);
  for (const player of Object.values(room.players)) {
    player.answerReady = false;
    player.roundScore = 0;
    player.previousRank = 1;
  }
  room.round = 1;
  room.matchIndex = 0;
  room.phase = 'answering';
  room.deadline = now + room.settings.answerSeconds * 1000;
}

/** Recompute from saved work: chains score as they are revealed, and moderation can run at any time. */
function scoreDrawings(room: Room) {
  const drawing = room.drawing!;
  for (const [id, points] of Object.entries(drawing.awards)) {
    room.players[id].score -= points;
    room.players[id].roundScore -= points;
  }
  const works = drawings(room);
  drawing.awards = {};
  const award = (id: string, points = 100) => { drawing.awards[id] = (drawing.awards[id] ?? 0) + points; };
  if (isQuiz(room)) drawing.chains.forEach((chain, index) => {
    if (!quizClosed(room, index) || !valid(room, chain.steps[0])) return;
    for (const id of quizCorrect(room, index)) { award(id, QUIZ_POINTS); award(chain.steps[0]!.author, QUIZ_ARTIST_POINTS); }
  });
  else for (const chain of drawing.chains.slice(0, drawing.revealed)) chain.steps.forEach((step, stage) => {
    if (linked(room, chain, stage)) { award(chain.steps[stage - 1]!.author); award(step!.author); }
  });
  if (drawing.scored) for (const [id, choice] of Object.entries(drawing.votes)) {
    const work = works.find(work => work.id === choice);
    if (!work || work.author === id || !drawing.players.includes(id) || room.players[id].kicked || room.players[id].spectator) continue;
    award(work.author);
  }
  for (const [id, points] of Object.entries(drawing.awards)) {
    room.players[id].score += points;
    room.players[id].roundScore += points;
  }
}

/** One picture at a time: guess from the choices, then see the answer. Pictures nobody sent are skipped. */
function advanceQuiz(room: Room, now: number) {
  const drawing = room.drawing!;
  const open = (from: number) => {
    const index = drawing.chains.findIndex((chain, i) => i >= from && valid(room, chain.steps[0]));
    if (index < 0) {
      room.phase = 'ranking';
      room.deadline = now + 20000;
      return;
    }
    room.phase = 'voting';
    room.matchIndex = index;
    drawing.revealed = index + 1;
    room.deadline = now + room.settings.voteSeconds * 1000;
  };
  if (room.phase === 'answering') open(0);
  else if (room.phase === 'voting' && !valid(room, drawing.chains[room.matchIndex].steps[0])) open(room.matchIndex + 1);
  else if (room.phase === 'voting') {
    drawing.chains[room.matchIndex].closed = true;
    room.phase = 'reveal';
    room.deadline = now + 12000;
    scoreDrawings(room);
  } else if (room.phase === 'reveal') open(room.matchIndex + 1);
  else if (room.phase === 'ranking') {
    room.phase = 'finished';
    room.deadline = 0;
  }
}

export function advanceDrawing(room: Room, now: number) {
  const drawing = room.drawing;
  if (!drawing) return;
  if (isQuiz(room)) return advanceQuiz(room, now);
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
      scoreDrawings(room);
    }
  } else if (room.phase === 'reveal') {
    if (room.matchIndex < drawing.chains.length - 1) {
      drawing.revealed = ++room.matchIndex + 1;
      room.deadline = now + 30000;
      scoreDrawings(room);
    } else if (room.matchIndex === drawing.chains.length - 1) {
      room.phase = drawings(room).length ? 'voting' : 'ranking';
      room.deadline = now + (room.phase === 'voting' ? room.settings.voteSeconds * 1000 : 20000);
    } else {
      room.phase = 'ranking';
      room.deadline = now + 20000;
    }
  } else if (room.phase === 'voting') {
    drawing.scored = true;
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
  else if (isQuiz(room)) {
    // Resting or removing the last undecided guesser, or the artist, ends the guesses like a final guess.
    const index = room.matchIndex, guesses = room.drawing.chains[index].guesses!;
    if (room.phase === 'voting' && (!valid(room, room.drawing.chains[index].steps[0]) ||
      quizGuessers(room, index).filter(id => players.includes(id)).every(id => Object.hasOwn(guesses, id))))
      advanceDrawing(room, now);
  } else if (room.phase === 'voting' && players.length && players.every(id => Object.hasOwn(room.drawing!.votes, id)))
    advanceDrawing(room, now);
}

export function drawingAction(room: Room, id: string, action: Action, now: number) {
  const drawing = room.drawing;
  requireThat(drawing && participants(room).includes(id), 'この伝言には参加できません。', 403);
  if (action.type === 'quizGuess') {
    requireThat(isQuiz(room) && room.phase === 'voting' && now < room.deadline, '予想の受付は終了しました。', 409);
    const index = room.matchIndex;
    const chain = drawing.chains[index];
    requireThat(Number.isInteger(action.choice) && action.choice >= 0 && action.choice < chain.choices!.length, '選んだ答えが見つかりません。');
    requireThat(chain.steps[0]?.author !== id, '自分の絵には答えられません。', 403);
    requireThat(!Object.hasOwn(chain.guesses!, id), '予想済みです。', 409);
    chain.guesses![id] = action.choice;
    return;
  }
  if (action.type === 'drawingVote') {
    requireThat(!isQuiz(room), 'このゲームでは使えない操作です。');
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
  const shiritori = isShiritori(room);
  requireThat(!room.players[id].answerReady, `「${shiritori ? '絵' : '伝言'}を直す」で確定を取り消してから修正してください。`, 409);
  if (action.type === 'drawingSubmit') {
    requireThat(shiritori || drawing.stage % 2 === 0, '今は絵を言葉にする番です。', 409);
    const data = JSON.stringify(drawingInput(action.drawing));
    const word = shiritori ? shiritoriWord(typeof action.word === 'string' ? action.word : '') : '';
    const problem = shiritori && shiritoriProblem(word, givenSound(room, chain, drawing.stage));
    if (problem) throw new GameError(problem);
    chain.steps[drawing.stage] = {
      author: id, kind: 'draw', data,
      id: `${room.game}-${chainFor(room, id)}-${drawing.stage}-${room.revision + 1}`,
      ...(shiritori ? { text: word } : {}),
    };
  } else if (action.type === 'drawingGuess') {
    requireThat(!shiritori && drawing.stage % 2 === 1 && typeof action.text === 'string', '今は絵を描く番です。', 409);
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
  for (const chain of drawing.chains) if (chain.guesses) delete chain.guesses[id];
  for (const [voter, choice] of Object.entries(drawing.votes)) {
    const work = drawing.chains.flatMap(chain => chain.steps).find(step => step?.id === choice);
    if (voter === id || work?.author === id) delete drawing.votes[voter];
  }
  scoreDrawings(room);
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
  const previous = assigned && (isShiritori(room) || drawing.stage % 2 === 1) && chain.steps[drawing.stage - 1]?.id === id;
  requireThat(published || mine || previous, 'この絵はまだ公開されていません。', 403);
  return { data: drawingInput(JSON.parse(step.data)), published };
}

/** The answer stays on the server until this picture's guesses close. */
function projectQuiz(room: Room, me: string | null): DrawingGameView['quiz'] {
  const drawing = room.drawing!, index = room.matchIndex;
  if (!isQuiz(room) || !['voting', 'reveal'].includes(room.phase)) return null;
  const step = drawing.chains[index].steps[0];
  if (!valid(room, step)) return null;
  const guesses = drawing.chains[index].guesses!, guessers = quizGuessers(room, index);
  const answer = quizAnswer(room, index), correct = quizCorrect(room, index);
  const closed = room.phase === 'reveal';
  return {
    index: drawing.chains.slice(0, index + 1).filter(chain => valid(room, chain.steps[0])).length,
    total: drawings(room).length,
    drawingId: step!.id!, name: room.players[step!.author].name, avatar: room.players[step!.author].avatar,
    mine: me === step!.author, choices: drawing.chains[index].choices!,
    guess: me && Object.hasOwn(guesses, me) ? guesses[me] : null,
    canGuess: Boolean(me && !closed && guessers.includes(me) && participants(room).includes(me) && !Object.hasOwn(guesses, me)),
    guessed: guessers.filter(id => Object.hasOwn(guesses, id)).length,
    eligible: guessers.filter(id => participants(room).includes(id) || Object.hasOwn(guesses, id)).length,
    result: closed ? {
      answer,
      counts: drawing.chains[index].choices!.map((_, choice) => guessers.filter(id => guesses[id] === choice).length),
      correct: correct.map(id => ({ name: room.players[id].name, avatar: room.players[id].avatar })),
      drawerPoints: correct.length * QUIZ_ARTIST_POINTS,
    } : null,
  };
}

export function projectDrawing(room: Room, me: string | null): DrawingGameView | undefined {
  const drawing = room.drawing;
  if (!isDrawingGame(room) || !drawing) return;
  const players = participants(room);
  const shiritori = isShiritori(room);
  const kindAt = (stage: number) => shiritori || stage % 2 === 0 ? 'draw' as const : 'guess' as const;
  const assigned = Boolean(me && room.phase === 'answering' && players.includes(me));
  const chainIndex = assigned ? chainFor(room, me!) : -1;
  const mine = assigned ? drawing.chains[chainIndex].steps[drawing.stage] : null;
  const previous = assigned ? drawing.chains[chainIndex].steps[drawing.stage - 1] : null;
  const showChain = !isQuiz(room) && room.phase === 'reveal' && room.matchIndex < drawing.chains.length;
  const chain = showChain ? drawing.chains[room.matchIndex] : null;
  const results = drawing.scored && ['reveal', 'ranking', 'finished'].includes(room.phase);
  return {
    stage: drawing.stage + 1, stages: drawing.stages,
    readyCount: players.filter(id => room.players[id].answerReady).length,
    answererCount: players.length,
    assignment: assigned ? {
      key: `${room.game}:${chainIndex}:${drawing.stage}`,
      kind: kindAt(drawing.stage),
      // A shiritori word stays secret until its chain is revealed; only the picture is passed on.
      prompt: drawing.stage === 0 ? drawing.chains[chainIndex].prompt : !shiritori && valid(room, previous) ? previous?.text ?? null : null,
      inputDrawingId: (shiritori || drawing.stage % 2 === 1) && valid(room, previous) ? previous?.id ?? null : null,
      savedDrawingId: mine?.id ?? null, answer: mine?.text ?? '', saved: Boolean(mine),
      sound: givenSound(room, drawing.chains[chainIndex], drawing.stage),
    } : null,
    chain: chain ? {
      index: room.matchIndex + 1, total: drawing.chains.length, prompt: chain.prompt,
      steps: chain.steps.map((step, stage) => ({
        kind: kindAt(stage),
        name: valid(room, step) ? room.players[step!.author].name : '今回はパス',
        avatar: valid(room, step) ? room.players[step!.author].avatar : '',
        drawingId: valid(room, step) ? step?.id ?? null : null,
        text: valid(room, step) ? step?.text ?? null : null,
        link: linked(room, chain, stage),
      })),
    } : null,
    gallery: !isQuiz(room) && ['voting', 'reveal', 'ranking', 'finished'].includes(room.phase) && drawing.revealed === drawing.chains.length
      ? drawings(room).map(step => ({ id: step.id!, author: step.author,
        name: room.players[step.author].name, avatar: room.players[step.author].avatar,
        votes: results ? Object.values(drawing.votes).filter(id => id === step.id).length : 0,
        points: results ? Object.values(drawing.votes).filter(id => id === step.id).length * 100 : 0,
      })) : [],
    canVote: Boolean(!isQuiz(room) && me && room.phase === 'voting' && players.includes(me)),
    voted: Boolean(me && Object.hasOwn(drawing.votes, me)),
    votesReceived: room.phase === 'voting' ? players.filter(id => Object.hasOwn(drawing.votes, id)).length : Object.keys(drawing.votes).length,
    eligible: players.length, results,
    quiz: projectQuiz(room, me),
  };
}

export function drawingHistory(room: Room): DrawingHistoryChain[] {
  const drawing = room.drawing;
  if (!drawing) return [];
  if (isQuiz(room)) return drawing.chains.flatMap((chain, index) => {
    const step = chain.steps[0];
    if (!quizClosed(room, index) || !valid(room, step)) return [];
    const correct = quizCorrect(room, index).length;
    const guessers = quizGuessers(room, index).filter(id => Object.hasOwn(chain.guesses!, id)).length;
    return [{ prompt: chain.prompt, steps: [
      { kind: 'draw', name: room.players[step!.author].name, avatar: room.players[step!.author].avatar,
        drawing: step!.data ?? null, text: null, votes: correct, points: correct * QUIZ_ARTIST_POINTS },
      { kind: 'guess', name: 'みんなの予想', avatar: '', drawing: null, text: `${guessers}人中${correct}人が正解`, votes: 0, points: correct * QUIZ_POINTS },
    ] }];
  });
  return drawing.chains.slice(0, drawing.revealed).map(chain => ({
    prompt: chain.prompt,
    steps: chain.steps.map((step, stage) => {
      const visible = valid(room, step);
      const votes = visible && drawing.scored ? Object.values(drawing.votes).filter(id => id === step?.id).length : 0;
      const links = [linked(room, chain, stage), linked(room, chain, stage + 1)].filter(Boolean).length;
      return {
        kind: isShiritori(room) || stage % 2 === 0 ? 'draw' : 'guess',
        name: visible ? room.players[step!.author].name : '今回はパス', avatar: visible ? room.players[step!.author].avatar : '',
        drawing: visible ? step?.data ?? null : null, text: visible ? step?.text ?? null : null,
        votes, points: (votes + links) * 100, link: linked(room, chain, stage),
      };
    }),
  }));
}
