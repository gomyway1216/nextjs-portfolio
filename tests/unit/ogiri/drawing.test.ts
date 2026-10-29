import { describe, expect, it } from 'vitest';
import { act, createRoom, joinRoom, newPlayer, project, rankPlayers, tick, turnKey } from '@/lib/ogiri/engine';
import { drawingAsset, drawingHistory } from '@/lib/ogiri/drawing-game';
import { drawingInput, drawingSvg, DRAWING_ROOM_BUDGET } from '@/lib/ogiri/drawing-data';
import { drawingHistoryHtml, snapshotHistory } from '@/lib/ogiri/history';
import { settlePartyPoints } from '@/lib/ogiri/party';
import { partyPointsForRank } from '@/lib/party/points';
import { prompts } from '@/lib/ogiri/prompts';
import type { DrawingData, Room } from '@/lib/ogiri/types';

const picture = (n = 1): DrawingData => ({ v: 1, strokes: [{ c: '#201a32', w: 7, p: [n, 10, n + 1, 11, n + 2, 12] }] });
function setup(n = 4, automatic = true) {
  const room = createRoom('ABC234', newPlayer('host', 'secret', '進行だけ', '🐱', 100), 100);
  room.players.host.spectator = true;
  for (let i = 0; i < n; i++) joinRoom(room, newPlayer(`p${i}`, 's', `参加者${i}`, 'rabbit', 100));
  act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'drawing', autoAdvance: automatic } }, 100, prompts);
  act(room, 'host', { type: 'start' }, 100, prompts);
  return room;
}
function submit(room: Room, id: string, data = picture()) {
  const assignment = project(room, id, 101, prompts).drawingGame!.assignment!;
  act(room, id, assignment.kind === 'draw' ? { type: 'drawingSubmit', drawing: data }
    : { type: 'drawingGuess', text: `伝わったかな${id}` }, 101, prompts);
}
function stage(room: Room, data = picture()) {
  for (const id of room.drawing!.players) {
    submit(room, id, data);
    act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
  }
}
function complete(room: Room) {
  for (let i = 0; i < room.drawing!.stages; i++) stage(room);
  for (let i = 0; i < room.drawing!.chains.length; i++) act(room, 'host', { type: 'next' }, 103, prompts);
  expect(room.phase).toBe('voting');
  const works = project(room, 'p0', 103, prompts).drawingGame!.gallery;
  for (const id of room.drawing!.players) {
    const choice = works.find(work => work.author === (id === 'p0' ? 'p1' : 'p0'))!;
    act(room, id, { type: 'drawingVote', choice: choice.id }, 104, prompts);
  }
  act(room, 'host', { type: 'next' }, 105, prompts);
  act(room, 'host', { type: 'next' }, 106, prompts);
  return works;
}

describe('drawing data allowlist', () => {
  it('accepts only bounded integer strokes and creates SVG without accepting SVG input', () => {
    expect(drawingInput(picture())).toEqual(picture());
    expect(drawingSvg(picture())).toContain('polyline');
    expect(drawingSvg({ v: 1, strokes: [{ c: '#ffffff', w: 3, p: [0, 0] }] })).toContain('r="1.5"');
    for (const data of [
      '<svg onload="alert(1)">', { ...picture(), onload: 'alert(1)' },
      { v: 1, strokes: [] }, { v: 1, strokes: [{ c: 'url(x)', w: 7, p: [1, 1] }] },
      { v: 1, strokes: [{ c: '#201a32', w: 8, p: [1, 1] }] },
      { v: 1, strokes: [{ c: '#201a32', w: 7, p: [1, 1, 2] }] },
      ...[-1, 512, NaN, Infinity, 0.5].map(n => ({ v: 1, strokes: [{ c: '#201a32', w: 7, p: [n, 1] }] })),
      { v: 1, strokes: [{ c: '#201a32', w: 7, p: [1, 384] }] },
      { v: 1, strokes: Array.from({ length: 65 }, () => picture().strokes[0]) },
      { v: 1, strokes: [{ c: '#201a32', w: 7, p: Array(1442).fill(1) }] },
    ]) expect(() => drawingInput(data)).toThrow();
  });
});

describe('drawing relay', () => {
  it.each([3, 4, 12])('%i players have equal drawing/guess opportunities without repeating a person in a chain', n => {
    const room = setup(n);
    expect(room.settings.rounds).toBe(1);
    expect(room.drawing!.stages).toBe(n === 3 ? 3 : 4);
    const mine = project(room, 'p0', 101, prompts).drawingGame!;
    expect(mine.assignment?.prompt).toBeTruthy();
    const tv = project(room, null, 101, prompts);
    expect(tv.drawingGame?.assignment).toBeNull();
    expect(JSON.stringify(tv)).not.toContain(mine.assignment!.prompt);
    for (let i = 0; i < room.drawing!.stages; i++) stage(room);
    for (const chain of room.drawing!.chains) {
      expect(new Set(chain.steps.map(step => step!.author)).size).toBe(room.drawing!.stages);
    }
    for (const id of room.drawing!.players) {
      const entries = room.drawing!.chains.flatMap(chain => chain.steps).filter(step => step?.author === id);
      expect(entries.filter(step => step?.kind === 'draw')).toHaveLength(2);
      expect(entries.filter(step => step?.kind === 'guess')).toHaveLength(n === 3 ? 1 : 2);
    }
  });

  it('keeps private pictures out of polls, serving only the assigned previous picture before publication', () => {
    const room = setup();
    submit(room, 'p0');
    const id = project(room, 'p0', 101, prompts).drawingGame!.assignment!.savedDrawingId!;
    expect(drawingAsset(room, id, 'p0').data).toEqual(picture());
    for (const caller of ['host', 'p1', 'p2', 'p3', null]) expect(() => drawingAsset(room, id, caller)).toThrow('まだ公開');
    expect(JSON.stringify(project(room, null, 101, prompts))).not.toContain('strokes');
    for (const id of room.drawing!.players) {
      if (id !== 'p0') submit(room, id);
      act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
    }
    const recipient = room.drawing!.players.find(player => project(room, player, 103, prompts).drawingGame!.assignment!.inputDrawingId === id)!;
    expect(recipient).not.toBe('p0');
    expect(drawingAsset(room, id, recipient).data).toEqual(picture());
    expect(() => drawingAsset(room, id, 'p0')).toThrow('まだ公開');
    stage(room); stage(room); stage(room);
    expect(drawingHistory(room)).toHaveLength(1);
    const publicId = project(room, null, 104, prompts).drawingGame!.chain!.steps.find(step => step.drawingId)!.drawingId!;
    expect(drawingAsset(room, publicId, null).published).toBe(true);
  });

  it('waits for explicit OK after the guide, locks saved work and changes the stage turn token', () => {
    const room = setup();
    const originalTurn = turnKey(room);
    expect(() => act(room, 'p0', { type: 'answerReady', ready: true }, 101, prompts)).toThrow('送信');
    for (const id of ['p0', 'p1', 'p2']) {
      submit(room, id); act(room, id, { type: 'answerReady', ready: true }, 102, prompts);
    }
    expect(tick(room, room.deadline + 10000, prompts)).toBe(false);
    expect(room.drawing!.stage).toBe(0);
    expect(() => submit(room, 'p0')).toThrow('伝言を直す');
    act(room, 'p0', { type: 'answerReady', ready: false }, 103, prompts);
    submit(room, 'p0', picture(5));
    act(room, 'p0', { type: 'answerReady', ready: true }, 104, prompts);
    submit(room, 'p3');
    act(room, 'p3', { type: 'answerReady', ready: true }, room.deadline + 10001, prompts);
    expect(room.drawing!.stage).toBe(1);
    expect(turnKey(room)).not.toBe(originalTurn);
    expect(Object.values(room.players).every(player => !player.answerReady)).toBe(true);
    expect(() => act(room, 'host', { type: 'drawingGuess', text: '主催者' }, 105, prompts)).toThrow('参加できません');
    expect(() => act(room, 'p0', { type: 'drawingSubmit', drawing: picture() }, 105, prompts)).toThrow('言葉にする番');
  });

  it('supports manual progress, passes, leave and a returning participant', () => {
    const room = setup(4, false);
    stage(room);
    expect(room.drawing!.stage).toBe(0);
    act(room, 'host', { type: 'next' }, 103, prompts);
    expect(room.drawing!.stage).toBe(1);
    act(room, 'p3', { type: 'leave' }, 104, prompts);
    act(room, 'host', { type: 'next' }, 105, prompts);
    expect(room.drawing!.stage).toBe(2);
    act(room, 'p3', { type: 'heartbeat' }, 106, prompts);
    expect(room.players.p3.active).toBe(false);
    act(room, 'p3', { type: 'return' }, 107, prompts);
    expect(project(room, 'p3', 106, prompts).drawingGame?.assignment).not.toBeNull();
  });

  it('preserves the relay rotation, saved work and scores when a word turn is missed during leave', () => {
    const room = setup();
    stage(room);
    const rotation = [...room.drawing!.players];
    const firstPicture = room.drawing!.chains[0].steps[0];
    const missedKey = project(room, 'p0', 103, prompts).drawingGame!.assignment!.key.split(':')[1];
    room.players.p0.partyPoints = 7;
    act(room, 'p0', { type: 'leave' }, 103, prompts);
    for (const id of ['p1', 'p2', 'p3']) {
      submit(room, id);
      act(room, id, { type: 'answerReady', ready: true }, 104, prompts);
    }
    expect(room.drawing!.stage).toBe(2);
    const recipient = rotation.find(id => project(room, id, 105, prompts).drawingGame?.assignment?.key.split(':')[1] === missedKey)!;
    expect(project(room, recipient, 105, prompts).drawingGame!.assignment!.prompt).toBeNull();
    act(room, 'p0', { type: 'heartbeat' }, 106, prompts);
    expect(room.players.p0.active).toBe(false);
    act(room, 'p0', { type: 'return' }, 107, prompts);
    expect(room.drawing!.players).toEqual(rotation);
    expect(room.drawing!.chains[0].steps[0]).toEqual(firstPicture);
    expect(room.players.p0).toMatchObject({ active: true, score: 0, partyPoints: 7 });
    expect(project(room, 'p0', 106, prompts).drawingGame!.assignment!.key.split(':').slice(1)).toEqual(['2', '2']);
  });

  it.each([3, 4, 12])('scores %i votes once, blocks self voting, archives drawings and retains party totals across a game switch', n => {
    const room = setup(n);
    const works = complete(room);
    expect(room.phase).toBe('finished');
    expect(room.players.p0.score).toBe((n - 1) * 100);
    expect(room.players.p1.score).toBe(100);
    expect(Object.values(room.players).reduce((sum, player) => sum + player.score, 0)).toBe(n * 100);
    settlePartyPoints(room, rankPlayers(room));
    settlePartyPoints(room, rankPlayers(room));
    expect(room.partyGames).toBe(1);
    for (const player of rankPlayers(room)) expect(room.players[player.id].partyPoints).toBe(partyPointsForRank(player.rank));
    const history = snapshotHistory(room, 'a'.repeat(32), 107, prompts);
    expect(history.drawingChains).toHaveLength(n);
    expect(history.drawingChains!.flatMap(chain => chain.steps).filter(step => step.drawing)).toHaveLength(n * 2);
    const oldPoints = room.players.p0.partyPoints;
    act(room, 'host', { type: 'settings', settings: { ...room.settings, gameType: 'majority' } }, 108, prompts);
    act(room, 'host', { type: 'rematch' }, 109, prompts);
    expect(room.drawing).toBeUndefined();
    expect(room.players.p0.partyPoints).toBe(oldPoints);
    expect(room.players.p0.score).toBe(0);
    expect(works).toHaveLength(n * 2);
  });

  it('rejects self votes and invalid choices, and removes kicked drawings and their votes', () => {
    const room = setup();
    for (let i = 0; i < 4; i++) stage(room);
    for (let i = 0; i < 4; i++) act(room, 'host', { type: 'next' }, 103, prompts);
    const mine = project(room, 'p0', 103, prompts).drawingGame!.gallery.find(work => work.author === 'p0')!;
    expect(() => act(room, 'p0', { type: 'drawingVote', choice: mine.id }, 104, prompts)).toThrow('自分');
    expect(() => act(room, 'p1', { type: 'drawingVote', choice: 'missing' }, 104, prompts)).toThrow('投票先が見つかりません');
    act(room, 'p1', { type: 'drawingVote', choice: mine.id }, 104, prompts);
    act(room, 'host', { type: 'next' }, 105, prompts);
    expect(room.players.p0.score).toBe(100);
    act(room, 'host', { type: 'kick', playerId: 'p0' }, 106, prompts);
    expect(room.players.p0.score).toBe(0);
    expect(() => drawingAsset(room, mine.id, null)).toThrow('表示できません');
    expect(drawingHistory(room).flatMap(chain => chain.steps).filter(step => step.name === '参加者0')).toHaveLength(0);
  });

  it('omits an unavailable author record safely from reveal, gallery, assets and history', () => {
    const room = setup(3);
    stage(room); stage(room); stage(room);
    const id = room.drawing!.chains[0].steps[0]!.id!;
    delete room.players.p0;
    expect(project(room, null, 103, prompts).drawingGame!.chain!.steps[0].name).toBe('今回はパス');
    expect(drawingHistory(room)[0].steps[0].drawing).toBeNull();
    expect(() => drawingAsset(room, id, null)).toThrow('表示できません');
    room.drawing!.revealed = 3;
    room.matchIndex = 3;
    expect(project(room, null, 103, prompts).drawingGame!.gallery.some(work => work.author === 'p0')).toBe(false);
  });

  it('counts current voters accurately through rest while preserving an already submitted ballot and points', () => {
    const room = setup();
    for (let i = 0; i < 4; i++) stage(room);
    for (let i = 0; i < 4; i++) act(room, 'host', { type: 'next' }, 103, prompts);
    const works = project(room, null, 103, prompts).drawingGame!.gallery;
    act(room, 'p0', { type: 'drawingVote', choice: works.find(work => work.author === 'p1')!.id }, 104, prompts);
    act(room, 'p0', { type: 'leave' }, 105, prompts);
    expect(project(room, 'p1', 105, prompts).drawingGame).toMatchObject({ eligible: 3, votesReceived: 0 });
    for (const id of ['p1', 'p2']) act(room, id, { type: 'drawingVote', choice: works.find(work => work.author === 'p0')!.id }, 106, prompts);
    expect(project(room, 'p3', 106, prompts).drawingGame).toMatchObject({ eligible: 3, votesReceived: 2 });
    act(room, 'p3', { type: 'drawingVote', choice: works.find(work => work.author === 'p0')!.id }, 107, prompts);
    expect(room.phase).toBe('reveal');
    expect(project(room, null, 107, prompts).drawingGame).toMatchObject({ eligible: 3, votesReceived: 4 });
    expect(room.players.p0.score).toBe(300);
    expect(room.players.p1.score).toBe(100);
  });

  it('keeps maximum 12-player vector payloads well below a Firestore document and out of ordinary room views', () => {
    const room = setup(12);
    const dense: DrawingData = { v: 1, strokes: [{ c: '#201a32', w: 7, p: Array.from({ length: 1440 }, (_, i) => i % 2 ? 383 : 511) }] };
    expect(drawingInput(dense)).toEqual(dense);
    for (let i = 0; i < 4; i++) stage(room, dense);
    expect(new TextEncoder().encode(JSON.stringify(room)).length).toBeLessThan(DRAWING_ROOM_BUDGET);
    expect(JSON.stringify(project(room, null, 104, prompts)).length).toBeLessThan(20000);
    expect(JSON.stringify(project(room, null, 104, prompts))).not.toContain('strokes');
  });

  it('exports published pictures as safe self-contained HTML with escaped names and words', () => {
    const room = setup(3);
    room.players.p0.name = '<script>alert(1)</script>';
    complete(room);
    const html = drawingHistoryHtml(snapshotHistory(room, 'a'.repeat(32), 107, prompts));
    expect(html).toContain('<svg');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/<img|<iframe|<script|onload=/i);
    expect(html).toContain("default-src 'none'");
  });
});
