import type { Page } from '@playwright/test';

import type { FakePlayer, FakeRoomOptions } from './fakeGameRoom';

/**
 * Rooms of the three online card games, part-way through a match and at its end, as the backend writes them (the
 * strippable fields JSON-stringified). The log details are the engine's own English strings.
 */

export const ME: FakePlayer = { id: 'p-me', name: 'Yudai' };
const PLAYERS: FakePlayer[] = [
  ME,
  { id: 'p-aki', name: 'Aki' },
  { id: 'p-ben', name: 'Benjamin' },
  { id: 'p-chi', name: 'Chihiro' },
];
const ORDER = PLAYERS.map((p) => p.id);

type Suit = 'S' | 'H' | 'D' | 'C';
function card(suit: Suit | 'J', rank: number) {
  return { id: `${suit}${rank}`, suit, rank };
}
function cards(spec: Array<[Suit | 'J', number]>) {
  return spec.map(([s, r]) => card(s, r));
}
function filler(n: number, prefix: string) {
  return Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}`, suit: 'S', rank: 2 + (i % 11) }));
}

function room(gameType: string, playerIdKey: string, gameState: Record<string, unknown>, status: 'playing' | 'finished' = 'playing'): FakeRoomOptions {
  return { gameType, roomId: 'K7Q2', me: ME, playerIdKey, players: PLAYERS, gameState, status };
}

// ---------- Shichinarabe ----------

function shichinarabeState(finished: boolean) {
  const hands: Record<string, unknown[]> = finished
    ? { 'p-me': [], 'p-aki': cards([['C', 2]]), 'p-ben': [], 'p-chi': cards([['H', 1], ['D', 13]]) }
    : {
      'p-me': cards([['S', 4], ['S', 10], ['S', 13], ['H', 3], ['H', 9], ['H', 12], ['D', 6], ['D', 11], ['C', 5], ['C', 8], ['C', 9], ['C', 1]]),
      'p-aki': filler(9, 'a'),
      'p-ben': filler(10, 'b'),
      'p-chi': filler(7, 'c'),
    };
  const log = [
    { id: 'l1', type: 'start', playerId: 'p-aki', detail: 'Game started', timestamp: 1 },
    { id: 'l2', type: 'play', playerId: 'p-aki', card: { suit: 'S', rank: 8 }, timestamp: 2 },
    { id: 'l3', type: 'pass', playerId: 'p-ben', passCount: 1, timestamp: 3 },
    { id: 'l4', type: 'play', playerId: 'p-chi', card: { suit: 'H', rank: 6 }, timestamp: 4 },
    { id: 'l5', type: 'play', playerId: 'p-me', card: { suit: 'D', rank: 8 }, timestamp: 5 },
    { id: 'l6', type: 'eliminate', playerId: 'p-ben', detail: 'Eliminated (pass limit)', timestamp: 6 },
    { id: 'l7', type: 'play', playerId: 'p-ben', card: { suit: 'C', rank: 6 }, detail: 'Revealed on elimination', timestamp: 7 },
    { id: 'l8', type: 'play', playerId: 'p-aki', card: { suit: 'D', rank: 9 }, timestamp: 8 },
  ];
  if (finished) log.push({ id: 'l9', type: 'finish', playerId: 'p-me', detail: 'Game finished', timestamp: 9 });
  return {
    version: 1,
    playerOrder: ORDER,
    currentTurnPlayerId: finished ? 'p-aki' : 'p-me',
    maxPasses: 3,
    finished,
    winnerId: finished ? 'p-me' : null,
    startedAt: 1,
    lastUpdate: 9,
    table: finished
      ? { S: { low: 1, high: 13 }, H: { low: 2, high: 13 }, D: { low: 1, high: 12 }, C: { low: 3, high: 13 } }
      : { S: { low: 5, high: 9 }, H: { low: 4, high: 8 }, D: { low: 7, high: 10 }, C: { low: 6, high: 7 } },
    handsJson: JSON.stringify(hands),
    passCountsJson: JSON.stringify({ 'p-me': 1, 'p-aki': 0, 'p-ben': 3, 'p-chi': 2 }),
    finishedOrderJson: JSON.stringify(finished ? ['p-me'] : []),
    eliminatedOrderJson: JSON.stringify(['p-ben']),
    resultOrderJson: JSON.stringify(finished ? ['p-me', 'p-aki', 'p-chi', 'p-ben'] : []),
    ranksJson: JSON.stringify(finished ? { 'p-me': 1, 'p-aki': 2, 'p-chi': 3, 'p-ben': 4 } : null),
    logJson: JSON.stringify(log),
  };
}

export const shichinarabeRoom = (finished = false) =>
  room('shichinarabe', 'shichinarabePlayerId', shichinarabeState(finished), finished ? 'finished' : 'playing');

// ---------- Daifugo ----------

function daifugoState(finished: boolean) {
  const hands: Record<string, unknown[]> = finished
    ? { 'p-me': [], 'p-aki': [], 'p-ben': [], 'p-chi': cards([['S', 3], ['H', 9]]) }
    : {
      'p-me': cards([['D', 3], ['S', 4], ['H', 5], ['H', 6], ['C', 7], ['S', 9], ['D', 10], ['C', 11], ['H', 12], ['S', 13], ['D', 14], ['H', 15], ['J', 16]]),
      'p-aki': filler(11, 'a'),
      'p-ben': filler(12, 'b'),
      'p-chi': filler(9, 'c'),
    };
  const log = [
    { id: 'l1', type: 'play', playerId: 'p-aki', playKind: 'group', cardCount: 2, rankKey: 6, timestamp: 1 },
    { id: 'l2', type: 'pass', playerId: 'p-ben', timestamp: 2 },
    { id: 'l3', type: 'play', playerId: 'p-chi', playKind: 'straight', cardCount: 3, rankKey: 9, timestamp: 3 },
    { id: 'l4', type: 'trick_end', playerId: 'p-chi', timestamp: 4 },
    { id: 'l5', type: 'play', playerId: 'p-chi', detail: 'Eleven-back active', timestamp: 5 },
    { id: 'l6', type: 'play', playerId: 'p-aki', playKind: 'group', cardCount: 1, rankKey: 8, timestamp: 6 },
  ];
  if (finished) log.push({ id: 'l7', type: 'round_end', playerId: 'p-me', detail: 'Round finished', timestamp: 7 });
  return {
    version: 2,
    round: 1,
    playerOrder: ORDER,
    currentTurnPlayerId: finished ? 'p-chi' : 'p-me',
    lastPlayedBy: 'p-aki',
    finished,
    winnerId: finished ? 'p-me' : null,
    startDaifugoId: null,
    revolution: false,
    jackBack: false,
    lockSignature: null,
    lastPlaySignature: null,
    gekishibaNextRank: null,
    startedAt: 1,
    lastUpdate: 7,
    handsJson: JSON.stringify(hands),
    pileJson: JSON.stringify(finished ? null : {
      kind: 'group', cards: cards([['S', 8], ['H', 8]]), count: 2, rankKey: 8, signature: null, playedBy: 'p-aki',
    }),
    passesJson: JSON.stringify(finished ? [] : ['p-ben']),
    finishedOrderJson: JSON.stringify(finished ? ['p-me', 'p-aki', 'p-ben'] : []),
    forbiddenFinishersJson: JSON.stringify([]),
    ranksJson: JSON.stringify(finished ? { 'p-me': 'daifugo', 'p-aki': 'fugo', 'p-ben': 'hinmin', 'p-chi': 'daihinmin' } : null),
    logJson: JSON.stringify(log),
  };
}

export const daifugoRoom = (finished = false) =>
  room('daifugo', 'daifugoPlayerId', daifugoState(finished), finished ? 'finished' : 'playing');

// ---------- Doubt ----------

function doubtState(finished: boolean, phase: 'play' | 'challenge' = 'play') {
  const hands: Record<string, unknown[]> = finished
    ? { 'p-me': [], 'p-aki': filler(4, 'a'), 'p-ben': [], 'p-chi': filler(9, 'c') }
    : {
      'p-me': cards([['S', 1], ['H', 1], ['D', 3], ['C', 4], ['S', 5], ['H', 6], ['D', 7], ['C', 8], ['S', 9], ['H', 10], ['D', 11], ['C', 12], ['S', 13], ['H', 2]]),
      'p-aki': filler(12, 'a'),
      'p-ben': filler(11, 'b'),
      'p-chi': filler(10, 'c'),
    };
  const log = [
    { id: 'l1', type: 'start', playerId: 'p-aki', detail: 'Game started', timestamp: 1 },
    { id: 'l2', type: 'play', playerId: 'p-aki', declaredRank: 11, count: 2, timestamp: 2 },
    { id: 'l3', type: 'doubt', playerId: 'p-ben', timestamp: 3 },
    { id: 'l4', type: 'resolve', playerId: 'p-ben', claimTruth: false, pileTakerId: 'p-aki', detail: 'Lie (claimant takes pile)', timestamp: 4 },
    { id: 'l5', type: 'play', playerId: 'p-chi', declaredRank: 12, count: 1, timestamp: 5 },
    { id: 'l6', type: 'accept', playerId: 'p-me', detail: 'Auto-accepted (no challengers)', timestamp: 6 },
  ];
  if (finished) {
    log.push({ id: 'l7', type: 'resolve', playerId: 'p-me', detail: 'Player finished', timestamp: 7 });
    log.push({ id: 'l8', type: 'finish', playerId: 'p-chi', detail: 'Game finished', timestamp: 8 });
  }
  const pendingClaim = phase === 'challenge'
    ? { playerId: 'p-chi', declaredRank: 13, cardIds: ['c-1', 'c-2'], cardCount: 2, wentOut: false, timestamp: 5 }
    : null;
  return {
    version: 1,
    phase: finished ? 'finished' : phase,
    playerOrder: ORDER,
    currentTurnPlayerId: finished ? 'p-aki' : 'p-me',
    requiredRank: 1,
    finished,
    winnerId: finished ? 'p-me' : null,
    startedAt: 1,
    lastUpdate: 8,
    handsJson: JSON.stringify(hands),
    pileJson: JSON.stringify(finished ? [] : filler(7, 'pile')),
    pendingClaimJson: JSON.stringify(pendingClaim),
    finishedOrderJson: JSON.stringify(finished ? ['p-me', 'p-ben'] : []),
    ranksJson: JSON.stringify(finished ? { 'p-me': 1, 'p-ben': 2, 'p-aki': 3, 'p-chi': 4 } : null),
    logJson: JSON.stringify(log),
  };
}

export const doubtRoom = (finished = false, phase: 'play' | 'challenge' = 'play') =>
  room('doubt', 'doubtPlayerId', doubtState(finished, phase), finished ? 'finished' : 'playing');

// ---------- getting there ----------

export type CardGameSlug = 'daifugo' | 'shichinarabe' | 'doubt';

/**
 * From the game's page, into its online match: the mode select's online button, then the lobby's "create room" with
 * a name and a password. The faked room (see fakeGameRoom) is already under way, so the match screen follows.
 */
export async function enterOnlineMatch(
  page: Page,
  labels: { online: string; createRoom: string; yourName: string; roomPassword: string; create: string },
): Promise<void> {
  await page.getByRole('button', { name: labels.online, exact: true }).click();
  await page.getByRole('button', { name: labels.createRoom, exact: true }).click();
  await page.getByPlaceholder(labels.yourName, { exact: true }).fill(ME.name);
  await page.getByPlaceholder(labels.roomPassword, { exact: true }).fill('pass');
  await page.getByRole('button', { name: labels.create, exact: true }).click();
}
