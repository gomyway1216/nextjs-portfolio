import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, turnKey } from '@/lib/ogiri/engine';
import { drawingAsset } from '@/lib/ogiri/drawing-game';
import { DRAWING_ROOM_BUDGET } from '@/lib/ogiri/drawing-data';
import { SHIRITORI_WORDS } from '@/lib/ogiri/drawing-prompts';
import { drawingHistoryHtml, historyText, snapshotHistory } from '@/lib/ogiri/history';
import { settlePartyPoints } from '@/lib/ogiri/party';
import { prompts } from '@/lib/ogiri/prompts';
import { headSound, shiritoriLinks, shiritoriProblem, shiritoriStages, shiritoriWord, tailSound } from '@/lib/ogiri/shiritori';
import type { DrawingData, Room } from '@/lib/ogiri/types';

const picture = (n = 1): DrawingData => ({ v: 1, strokes: [{ c: '#201a32', w: 7, p: [n, 10, n + 1, 11, n + 2, 12] }] });
function setup(n = 4, automatic = true) {
  const room = createRoom('ABC234', newPlayer('host', 'secret', '進行だけ', '🐱', 100), 100);
  room.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', 100));
  act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'shiritori', autoAdvance: automatic } }, 100, prompts);
  act(room, 'host', { type: 'start' }, 100, prompts);
  return room;
}
const chainOf = (room: Room, id: string) => {
  const drawing = room.drawing!;
  return drawing.chains[(drawing.players.indexOf(id) - drawing.stage + drawing.players.length) % drawing.players.length];
};
/** The word that continues (or deliberately breaks) this player's chain. */
function wordFor(room: Room, id: string, connect = true) {
  const chain = chainOf(room, id), stage = room.drawing!.stage;
  const tail = tailSound(chain.steps[stage - 1]?.text ?? chain.prompt);
  return `${connect ? tail : tail === 'ぽ' ? 'ま' : 'ぽ'}あい`;
}
function stage(room: Room, connect: (id: string) => boolean = () => true, data = picture()) {
  for (const id of [...room.drawing!.players]) {
    act(room, id, { type: 'drawingSubmit', drawing: data, word: room.drawing!.stage === 0 ? wordFor(room, id) : wordFor(room, id, connect(id)) }, 101, prompts);
    act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
  }
}
const revealAll = (room: Room) => { for (let i = 1; i < room.drawing!.chains.length; i++) act(room, 'host', { type: 'next' }, 103, prompts); };
const total = (room: Room) => Object.values(room.players).reduce((sum, player) => sum + player.score, 0);

describe('shiritori words', () => {
  it('reads the last sound the way players expect and normalizes spelling', () => {
    expect(shiritoriWord(' リン ゴ ')).toBe('りんご');
    expect(shiritoriWord('ﾗｰﾒﾝ')).toBe('らーめん');
    expect(tailSound('でんしゃ')).toBe('や');
    expect(tailSound('こーひー')).toBe('ひ');
    expect(tailSound('きっぷ')).toBe('ぷ');
    expect(headSound('ゃま')).toBe('や');
    expect(shiritoriLinks('りんご', 'ごりら')).toBe(true);
    expect(shiritoriLinks('りんご', 'こま')).toBe(false); // Voiced marks stay distinct.
  });

  it.each([
    ['', null, '読み'], ['らーめん', null, '「ん」'], ['らーめんー', null, '「ん」'], ['りんご1', null, 'ひらがな'],
    ['ーあ', null, 'ひらがな'], ['林檎', null, 'ひらがな'], ['あ', null, '2〜12'], ['あいうえおかきくけこさしす', null, '2〜12'],
    ['まくら', 'ご', '「ご」'],
  ])('rejects %j', (word, sound, message) => {
    expect(shiritoriProblem(word, sound)).toContain(message);
  });

  it('keeps every first word usable', () => {
    expect(new Set(SHIRITORI_WORDS).size).toBe(SHIRITORI_WORDS.length);
    expect(SHIRITORI_WORDS.length).toBeGreaterThanOrEqual(24);
    for (const word of SHIRITORI_WORDS) expect(shiritoriProblem(word, null)).toBeNull();
  });

  it('never needs more than 36 pictures, leaving room for the 8,000 byte picture limit', () => {
    for (let n = 3; n <= 12; n++) {
      expect(shiritoriStages(n)).toBeLessThanOrEqual(n);
      expect(n * shiritoriStages(n)).toBeLessThanOrEqual(36);
    }
    expect([3, 4, 9, 10, 12].map(shiritoriStages)).toEqual([3, 4, 4, 3, 3]);
  });
});

describe('shiritori game', () => {
  it.each([3, 4, 9, 10, 12])('%i players each draw once per stage and never repeat in a chain', n => {
    const room = setup(n);
    expect(room.round).toBe(1);
    expect(room.drawing!.stages).toBe(shiritoriStages(n));
    expect(room.drawing!.chains).toHaveLength(n);
    for (let i = 0; i < room.drawing!.stages; i++) stage(room);
    for (const chain of room.drawing!.chains) {
      expect(new Set(chain.steps.map(step => step!.author)).size).toBe(room.drawing!.stages);
      expect(chain.steps.every(step => step!.kind === 'draw')).toBe(true);
    }
  });

  it('keeps words secret and passes on only the picture until the chain is revealed', () => {
    const room = setup();
    const first = project(room, 'p0', 101, prompts).drawingGame!.assignment!;
    expect(first.prompt).toBe(chainOf(room, 'p0').prompt);
    expect(first.sound).toBe(tailSound(first.prompt!));
    const secret = wordFor(room, 'p0').replace('あい', 'ひみつ');
    act(room, 'p0', { type: 'drawingSubmit', drawing: picture(), word: secret }, 101, prompts);
    expect(project(room, 'p0', 101, prompts).drawingGame!.assignment!.answer).toBe(secret);
    for (const viewer of ['host', 'p1', null]) expect(JSON.stringify(project(room, viewer, 101, prompts))).not.toContain(secret);
    act(room, 'p0', { type: 'answerReady', ready: true }, 102, prompts);
    for (const id of ['p1', 'p2', 'p3']) {
      act(room, id, { type: 'drawingSubmit', drawing: picture(), word: wordFor(room, id) }, 102, prompts);
      act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
    }
    const pictureId = room.drawing!.chains.flatMap(chain => chain.steps).find(step => step?.text === secret)!.id!;
    const recipient = room.drawing!.players.find(id => project(room, id, 103, prompts).drawingGame!.assignment!.inputDrawingId === pictureId)!;
    const assignment = project(room, recipient, 103, prompts).drawingGame!.assignment!;
    expect(assignment).toMatchObject({ prompt: null, sound: null, answer: '' });
    expect(JSON.stringify(project(room, recipient, 103, prompts))).not.toContain(secret);
    expect(drawingAsset(room, pictureId, recipient).data).toEqual(picture());
    for (const viewer of ['host', 'p0', null]) expect(() => drawingAsset(room, pictureId, viewer)).toThrow('まだ公開');
  });

  it('requires a valid reading, and the told sound only when no picture has to reveal it', () => {
    const room = setup();
    const sound = project(room, 'p0', 101, prompts).drawingGame!.assignment!.sound!;
    const wrong = sound === 'ま' ? 'ぽあい' : 'まあい';
    expect(() => act(room, 'p0', { type: 'drawingSubmit', drawing: picture(), word: wrong }, 101, prompts)).toThrow(`「${sound}」`);
    expect(() => act(room, 'p0', { type: 'drawingSubmit', drawing: picture(), word: `${sound}いん` }, 101, prompts)).toThrow('「ん」');
    expect(() => act(room, 'p0', { type: 'drawingSubmit', drawing: picture() }, 101, prompts)).toThrow('読み');
    stage(room);
    const guess = wordFor(room, 'p0', false);
    act(room, 'p0', { type: 'drawingSubmit', drawing: picture(), word: guess }, 103, prompts);
    expect(chainOf(room, 'p0').steps[1]!.text).toBe(guess);
    expect(() => act(room, 'p0', { type: 'drawingGuess', text: '言葉' }, 103, prompts)).toThrow('絵を描く番');
    expect(turnKey(room)).toContain(':1');
  });

  it('awards 100 points to both people on each connected link, chain by chain as it is revealed', () => {
    const room = setup(4);
    for (let i = 0; i < 4; i++) stage(room, id => id !== 'p0');
    expect(room.phase).toBe('reveal');
    const chain = room.drawing!.chains[0];
    const view = project(room, null, 103, prompts).drawingGame!.chain!;
    expect(view.steps[0]).toMatchObject({ link: null, text: chain.steps[0]!.text });
    expect(view.steps.slice(1).map(step => step.link)).toEqual(chain.steps.slice(1).map(step => step!.author !== 'p0'));
    const firstChainLinks = view.steps.filter(step => step.link).length;
    expect(total(room)).toBe(firstChainLinks * 200);
    revealAll(room);
    expect(room.phase).toBe('reveal');
    // p0 broke 3 links on the stages after the first; the remaining 9 of 12 connected.
    expect(total(room)).toBe(9 * 200);
    const scored = total(room);
    act(room, 'host', { type: 'next' }, 104, prompts);
    expect(room.phase).toBe('voting');
    expect(total(room)).toBe(scored);
  });

  it('tells the next player the sound after a pass and awards nothing for that link', () => {
    const room = setup(4, false);
    stage(room);
    act(room, 'host', { type: 'next' }, 102, prompts);
    act(room, 'p0', { type: 'leave' }, 103, prompts);
    for (const id of ['p1', 'p2', 'p3']) {
      act(room, id, { type: 'drawingSubmit', drawing: picture(), word: wordFor(room, id) }, 104, prompts);
      act(room, id, { type: 'answerReady', ready: true }, 104, prompts);
    }
    const passed = room.drawing!.chains.find(chain => !chain.steps[1])!;
    act(room, 'host', { type: 'next' }, 105, prompts);
    const recipient = room.drawing!.players.find(id => id !== 'p0' && chainOf(room, id) === passed)!;
    const assignment = project(room, recipient, 106, prompts).drawingGame!.assignment!;
    expect(assignment).toMatchObject({ prompt: null, inputDrawingId: null, sound: tailSound(passed.steps[0]!.text!) });
    expect(() => act(room, recipient, { type: 'drawingSubmit', drawing: picture(), word: assignment.sound === 'ま' ? 'ぽあい' : 'まあい' }, 106, prompts)).toThrow(`「${assignment.sound}」`);
    act(room, recipient, { type: 'drawingSubmit', drawing: picture(), word: `${assignment.sound}あい` }, 106, prompts);
    room.drawing!.revealed = room.drawing!.chains.indexOf(passed) + 1;
    room.phase = 'reveal';
    room.matchIndex = room.drawing!.revealed - 1;
    expect(project(room, null, 107, prompts).drawingGame!.chain!.steps.slice(0, 3).map(step => step.link)).toEqual([null, null, null]);
  });

  it('adds picture votes to link points, rescoring once when a player is removed', () => {
    const room = setup(4);
    for (let i = 0; i < 4; i++) stage(room);
    revealAll(room);
    const links = total(room);
    expect(links).toBe(12 * 200);
    act(room, 'host', { type: 'next' }, 104, prompts);
    const works = project(room, 'p0', 104, prompts).drawingGame!.gallery;
    expect(works).toHaveLength(16);
    expect(() => act(room, 'p0', { type: 'drawingVote', choice: works.find(work => work.author === 'p0')!.id }, 104, prompts)).toThrow('自分');
    for (const id of room.drawing!.players) act(room, id, { type: 'drawingVote', choice: works.find(work => work.author === (id === 'p0' ? 'p1' : 'p0'))!.id }, 105, prompts);
    expect(room.phase).toBe('reveal');
    expect(total(room)).toBe(links + 400);
    act(room, 'host', { type: 'kick', playerId: 'p0' }, 106, prompts);
    expect(room.players.p0.score).toBe(0);
    // Every vote here was by p0 or for p0, so only the links without p0 remain.
    const expected = room.drawing!.chains.flatMap(chain => chain.steps.map((step, i) =>
      i > 0 && step!.author !== 'p0' && chain.steps[i - 1]!.author !== 'p0' ? 200 : 0)).reduce<number>((a, b) => a + b, 0);
    expect(total(room)).toBe(expected);
    expect(expected).toBe(6 * 200);
  });

  it('settles party points once, archives words and pictures, and switches game in the same room', () => {
    const room = setup(3);
    for (let i = 0; i < 3; i++) stage(room);
    revealAll(room);
    act(room, 'host', { type: 'next' }, 104, prompts);
    const works = project(room, 'p0', 104, prompts).drawingGame!.gallery;
    for (const id of room.drawing!.players) act(room, id, { type: 'drawingVote', choice: works.find(work => work.author !== id)!.id }, 105, prompts);
    act(room, 'host', { type: 'next' }, 106, prompts);
    act(room, 'host', { type: 'next' }, 107, prompts);
    expect(room.phase).toBe('finished');
    settlePartyPoints(room, rankPlayers(room));
    settlePartyPoints(room, rankPlayers(room));
    expect(room.partyGames).toBe(1);
    const history = snapshotHistory(room, 'a'.repeat(32), 108, prompts);
    expect(history.gameType).toBe('shiritori');
    expect(history.matches).toEqual([]);
    expect(history.drawingChains).toHaveLength(3);
    const steps = history.drawingChains!.flatMap(chain => chain.steps);
    expect(steps.every(step => step.drawing && step.text && step.kind === 'draw')).toBe(true);
    expect(steps.filter(step => step.link)).toHaveLength(6);
    expect(history.drawingChains![0].steps.map(step => step.points - step.votes * 100)).toEqual([100, 200, 100]);
    expect(steps.reduce((sum, step) => sum + step.points, 0)).toBe(total(room));
    expect(historyText(history)).toContain('おえかきしりとり');
    expect(historyText(history)).toContain(`（絵）${steps[0].text}`);
    expect(historyText(history)).toContain('つながった');
    const html = drawingHistoryHtml(history);
    expect(html).toContain('<title>おえかきしりとり · ゲームの記録</title>');
    expect(html).toContain(steps[0].text!);
    const points = room.players.p0.partyPoints;
    act(room, 'host', { type: 'rematch', gameType: 'identity' }, 109, prompts);
    expect(room.drawing).toBeUndefined();
    expect(room.settings.gameType).toBe('identity');
    expect(room.players.p0.partyPoints).toBe(points);
  });

  it('counts an interrupted game once link points were announced', () => {
    const room = setup(3);
    for (let i = 0; i < 3; i++) stage(room);
    expect(total(room)).toBeGreaterThan(0);
    act(room, 'host', { type: 'finish' }, 104, prompts);
    settlePartyPoints(room, rankPlayers(room));
    expect(room.partyGames).toBe(1);
  });

  it('keeps a full 12-player game of the densest pictures within the room budget and out of polls', () => {
    const room = setup(12);
    const dense: DrawingData = { v: 1, strokes: Array.from({ length: 64 }, () => ({ c: '#201a32', w: 7, p: Array.from({ length: 22 }, (_, i) => i % 2 ? 383 : 511) })) };
    expect(new TextEncoder().encode(JSON.stringify(dense)).length).toBeGreaterThan(5000);
    for (let i = 0; i < 3; i++) stage(room, () => true, dense);
    expect(room.drawing!.chains.flatMap(chain => chain.steps)).toHaveLength(36);
    expect(new TextEncoder().encode(JSON.stringify(room)).length).toBeLessThan(DRAWING_ROOM_BUDGET);
    expect(JSON.stringify(project(room, null, 104, prompts))).not.toContain('strokes');
  });

  it('escapes player words in the downloaded archive', () => {
    const room = setup(3);
    room.players.p0.name = '<script>alert(1)</script>';
    for (let i = 0; i < 3; i++) stage(room);
    const html = drawingHistoryHtml(snapshotHistory(room, 'a'.repeat(32), 104, prompts));
    expect(html).not.toContain('<script>');
    expect(html).toContain("default-src 'none'");
  });
});
