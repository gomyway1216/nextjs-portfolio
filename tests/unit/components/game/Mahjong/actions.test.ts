/**
 * Riichi Mahjong M4 — legal action enumeration.
 *
 * Every case is a hand-built position (see `roundFixtures.ts`) whose expected
 * action list is small enough to write out in full, so the tests pin down not
 * just "chi is available" but *exactly* which chi actions exist. That matters
 * most around red fives: melding the red copy or keeping it are different
 * moves with different scores, and both have to be offered.
 */

import { describe, expect, it } from 'vitest';

import {
  ankanKinds,
  canKyuushu,
  canRon,
  discardChoices,
  isLegalAction,
  kakanTiles,
  legalActions,
  sameAction,
} from '@/components/game/Mahjong/engine/actions';
import { DEFAULT_RULES } from '@/components/game/Mahjong/engine/rules';
import { isRedFive, kindOf, parseKinds } from '@/components/game/Mahjong/engine/tiles';
import type {
  Action,
  RoundState,
  Seat,
  TileId,
} from '@/components/game/Mahjong/engine/types';
import { buildRound, type MeldSpec, type RoundSpec, type SeatSpec } from './roundFixtures';

// ---------------------------------------------------------------------------
// Filler seats (see gameState.test.ts for the rationale)
// ---------------------------------------------------------------------------

const MANZU_RUNS: MeldSpec[] = [
  { type: 'chi', tiles: '123m' },
  { type: 'chi', tiles: '456m' },
  { type: 'chi', tiles: '789m' },
];
const PINZU_RUNS: MeldSpec[] = [
  { type: 'chi', tiles: '123p' },
  { type: 'chi', tiles: '456p' },
  { type: 'chi', tiles: '789p' },
];
const HONOUR_PONS_A: MeldSpec[] = [
  { type: 'pon', tiles: '111z' },
  { type: 'pon', tiles: '222z' },
  { type: 'pon', tiles: '333z' },
];
const HONOUR_PONS_B: MeldSpec[] = [
  { type: 'pon', tiles: '444z' },
  { type: 'pon', tiles: '555z' },
  { type: 'pon', tiles: '666z' },
];

/** The seat that made the pending discard: three manzu runs and four spares. */
function discarder(tile: string): SeatSpec {
  return { hand: '2p6p2s6s', melds: [...MANZU_RUNS], discards: tile };
}
/** Bystanders that can never claim anything. */
const BYSTANDER_PINZU: SeatSpec = { hand: '3m7m3s7s', melds: [...PINZU_RUNS] };
const BYSTANDER_HONOUR: SeatSpec = { hand: '2m6m4p8p', melds: [...HONOUR_PONS_B] };

/** A call position: seat 0 has just discarded `tile`, seat 1 may respond. */
function callPosition(tile: string, responder: SeatSpec, extra: Partial<RoundSpec> = {}) {
  return buildRound({
    turn: 0,
    pending: { seat: 0 },
    seats: [discarder(tile), responder, BYSTANDER_PINZU, BYSTANDER_HONOUR],
    ...extra,
  });
}

function types(state: RoundState, seat: Seat): string[] {
  return legalActions(state, seat).map((action) => action.type);
}

function tilesOf(action: Action): TileId[] {
  if (action.type === 'chi' || action.type === 'pon' || action.type === 'minkan') {
    return [...action.tiles];
  }
  throw new Error(`${action.type} has no tiles`);
}

function redness(action: Action): boolean[] {
  return tilesOf(action).map(isRedFive);
}

// ---------------------------------------------------------------------------
// Turn actions
// ---------------------------------------------------------------------------

describe('legalActions on your own turn', () => {
  const TENPAI = '123m456m789m11s23s7z';

  it('offers one discard per distinct tile, plus the riichi that keeps tenpai', () => {
    const state = buildRound({
      seats: [
        { hand: TENPAI, drawn: true },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_A] },
      ],
    });

    const actions = legalActions(state, 0);
    const discards = actions.filter((a) => a.type === 'discard');
    // 1m..9m, 1s, 2s, 3s, 7z: thirteen distinct kinds, and the pair of 1s
    // collapses to a single choice.
    expect(new Set(discards.map((a) => a.tile)).size).toBe(13);
    expect(discardChoices(state, 0)).toHaveLength(13);

    // Two discards keep the hand tenpai: dropping the 7z (waiting 1s/4s) and
    // dropping a 1s (123s completes, leaving a 7z tanki).
    const riichi = discards.filter((a) => a.riichi === true);
    expect(riichi.map((a) => kindOf(a.tile)).sort((x, y) => x - y)).toEqual(
      [parseKinds('1s')[0], parseKinds('7z')[0]].sort((x, y) => x - y),
    );
    expect(actions).toHaveLength(15);
  });

  it('keeps the red and the ordinary copy of a five apart', () => {
    const state = buildRound({
      seats: [
        { hand: '05m2p6p2s', melds: [...HONOUR_PONS_A], drawn: true },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
        { hand: '4m8m4s8s', melds: [...MANZU_RUNS] },
      ],
    });
    const choices = discardChoices(state, 0);
    expect(choices).toHaveLength(5);
    const fives = choices.filter((tile) => kindOf(tile) === parseKinds('5m')[0]);
    expect(fives).toHaveLength(2);
    expect(fives.map(isRedFive).sort()).toEqual([false, true]);
  });

  it('collapses the two copies again when red fives are switched off', () => {
    const state = buildRound({
      rules: { ...DEFAULT_RULES, redFives: false },
      seats: [
        { hand: '05m2p6p2s', melds: [...HONOUR_PONS_A], drawn: true },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
        { hand: '4m8m4s8s', melds: [...MANZU_RUNS] },
      ],
    });
    expect(discardChoices(state, 0)).toHaveLength(4);
  });

  it('refuses tsumo on a complete but yakuless open hand', () => {
    const state = buildRound({
      seats: [
        {
          hand: '789s22p',
          melds: [
            { type: 'chi', tiles: '234m' },
            { type: 'chi', tiles: '567p' },
            { type: 'chi', tiles: '234s' },
          ],
          drawn: true,
        },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_A] },
      ],
    });
    expect(types(state, 0)).not.toContain('tsumo');
  });

  it('offers tsumo on the same shape when the hand is closed', () => {
    const state = buildRound({
      seats: [
        { hand: '234m567p234s789s22p', drawn: true },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_A] },
      ],
    });
    expect(types(state, 0)).toContain('tsumo');
  });

  it('offers exactly the kinds held four times as an ankan', () => {
    const state = buildRound({
      seats: [
        { hand: '123m456m789m1111z9m', drawn: true },
        BYSTANDER_PINZU,
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_B] },
        { hand: '2m6m2s6s', melds: [...PINZU_RUNS] },
      ],
    });
    expect(ankanKinds(state, 0)).toEqual([parseKinds('1z')[0]]);
    expect(types(state, 0).filter((t) => t === 'ankan')).toHaveLength(1);
  });

  it('offers a kakan for every tile matching one of your own pons', () => {
    const state = buildRound({
      seats: [
        {
          hand: '123m456m789m9p9m',
          melds: [{ type: 'pon', tiles: '999p', from: 3 }],
          drawn: true,
        },
        { hand: '2p6p2s6s', melds: [...MANZU_RUNS] },
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_A] },
        { hand: '2m6m2s6s', melds: [...HONOUR_PONS_B] },
      ],
    });
    const kakan = kakanTiles(state, 0);
    expect(kakan).toHaveLength(1);
    expect(kindOf(kakan[0])).toBe(parseKinds('9p')[0]);
    expect(types(state, 0)).toContain('kakan');
  });

  it('offers kyuushu kyuuhai only on an untouched first draw', () => {
    const spec = (firstGoAround: boolean, discards?: string): RoundState =>
      buildRound({
        firstGoAround,
        turnCount: 0,
        seats: [
          { hand: '19m19p19s1234567z1m', drawn: true, discards },
          { hand: '2p6p2s6s', melds: [...MANZU_RUNS] },
          BYSTANDER_PINZU,
          { hand: '4m8m4p8p', melds: [{ type: 'chi', tiles: '123s' }, { type: 'chi', tiles: '456s' }, { type: 'chi', tiles: '789s' }] },
        ],
      });

    expect(canKyuushu(spec(true), 0)).toBe(true);
    expect(canKyuushu(spec(false), 0)).toBe(false);
    expect(canKyuushu(spec(true, '2m'), 0)).toBe(false);
  });

  it('gives every other seat nothing to do', () => {
    const state = buildRound({
      seats: [
        { hand: TENPAI, drawn: true },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_A] },
      ],
    });
    for (const seat of [1, 2, 3] as Seat[]) {
      expect(legalActions(state, seat)).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// Response actions
// ---------------------------------------------------------------------------

describe('legalActions while a discard is on the table', () => {
  it('offers both the red-including and the red-excluding pon', () => {
    const state = callPosition('5s', { hand: '4m055s', melds: [...HONOUR_PONS_A] });

    const actions = legalActions(state, 1);
    expect(actions.map((a) => a.type)).toEqual(['pon', 'pon', 'minkan', 'pass']);

    const pons = actions.filter((a) => a.type === 'pon');
    expect(pons.map(redness).map((flags) => flags.filter(Boolean).length).sort()).toEqual([
      0, 1,
    ]);
    // The minkan has to take all three, so the red copy is not optional there.
    const minkan = actions.find((a) => a.type === 'minkan');
    expect(minkan && redness(minkan).filter(Boolean)).toHaveLength(1);
  });

  it('offers a single pon when the three copies are interchangeable', () => {
    const state = callPosition('9s', { hand: '4m999s', melds: [...HONOUR_PONS_A] });
    expect(types(state, 1)).toEqual(['pon', 'minkan', 'pass']);
  });

  it('offers no minkan with only two copies in hand', () => {
    const state = callPosition('5s', { hand: '4m8m55s', melds: [...HONOUR_PONS_A] });
    expect(types(state, 1)).toEqual(['pon', 'pass']);
  });

  it('enumerates all three chi shapes around the discard', () => {
    const state = callPosition('4s', { hand: '2356s', melds: [...HONOUR_PONS_A] });
    const chi = legalActions(state, 1).filter((a) => a.type === 'chi');
    expect(chi).toHaveLength(3);
    const shapes = chi
      .map((a) => tilesOf(a).map(kindOf).map((k) => k - parseKinds('4s')[0]).join(','))
      .sort();
    expect(shapes).toEqual(['-1,1', '-2,-1', '1,2'].sort());
  });

  it('offers both red and ordinary five for the same chi shape', () => {
    const state = callPosition('6s', { hand: '4m057s', melds: [...HONOUR_PONS_A] });
    const chi = legalActions(state, 1).filter((a) => a.type === 'chi');
    expect(chi).toHaveLength(2);
    expect(
      chi.map((a) => redness(a).filter(Boolean).length).sort(),
    ).toEqual([0, 1]);
  });

  it('offers chi to the discarder shimocha only', () => {
    const state = buildRound({
      turn: 0,
      pending: { seat: 0 },
      seats: [
        discarder('4s'),
        { hand: '2356s', melds: [...HONOUR_PONS_A] },
        { hand: '2356s', melds: [...HONOUR_PONS_B] },
        BYSTANDER_PINZU,
      ],
    });
    expect(types(state, 1)).toContain('chi');
    expect(types(state, 2)).toEqual(['pass']);
    expect(types(state, 3)).toEqual(['pass']);
  });

  it('gives the discarder nothing and everyone else at least a pass', () => {
    const state = callPosition('4s', { hand: '2356s', melds: [...HONOUR_PONS_A] });
    expect(legalActions(state, 0)).toEqual([]);
    expect(types(state, 2)).toEqual(['pass']);
    expect(types(state, 3)).toEqual(['pass']);
  });

  it('drops a seat out once it has responded', () => {
    const state = callPosition('4s', { hand: '2356s', melds: [...HONOUR_PONS_A] });
    state.pendingResponses.push(1);
    state.pendingClaims.push({ type: 'pass', seat: 1 });
    expect(legalActions(state, 1)).toEqual([]);
  });

  it('offers a ron with a yaku and blocks it when furiten', () => {
    const open = (discards: string): RoundState =>
      buildRound({
        turn: 0,
        pending: { seat: 0 },
        doraIndicators: '8p',
        seats: [
          { hand: '2p6p2s6s', melds: [...MANZU_RUNS], discards: `4s${discards}` },
          { hand: '123m456m789m11s23s', discards },
          BYSTANDER_PINZU,
          BYSTANDER_HONOUR,
        ],
      });

    // The discarder's pond ends with the 4s, so `pending` points at it.
    const clean = open('');
    expect(canRon(clean, 1)).toBe(true);
    expect(types(clean, 1)).toContain('ron');

    // A 1s already in seat 1's own pond is one of its own winning tiles.
    const furiten = open('1s');
    expect(canRon(furiten, 1)).toBe(false);
    expect(types(furiten, 1)).not.toContain('ron');
  });

  it('offers nothing but ron and pass while a kakan is in flight', () => {
    const state = buildRound({
      turn: 0,
      pending: { seat: 0, chankan: true },
      doraIndicators: '8p',
      seats: [
        {
          hand: '123m456m789m9m',
          melds: [{ type: 'kakan', tiles: '9999p', from: 3 }],
        },
        { hand: '123m456m789m11s78p' },
        { hand: '4m8m4s8s', melds: [...HONOUR_PONS_A] },
        { hand: '2m6m2s6s', melds: [...HONOUR_PONS_B] },
      ],
    });
    expect(types(state, 1)).toEqual(['ron', 'pass']);
    expect(types(state, 2)).toEqual(['pass']);
  });

  it('offers no calls to a seat that has declared riichi', () => {
    const state = buildRound({
      turn: 0,
      pending: { seat: 0 },
      seats: [
        discarder('4s'),
        // Waiting on 6p/9p, so the 4s pair is only ever a pon candidate.
        { hand: '123m456m789m44s78p', riichi: true, discards: '1z1z' },
        BYSTANDER_PINZU,
        BYSTANDER_HONOUR,
      ],
    });
    expect(types(state, 1)).toEqual(['pass']);
  });
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

describe('isLegalAction', () => {
  it('accepts everything legalActions produced and nothing else', () => {
    const state = callPosition('4s', { hand: '2356s', melds: [...HONOUR_PONS_A] });
    for (const action of legalActions(state, 1)) {
      expect(isLegalAction(state, action)).toBe(true);
    }
    expect(isLegalAction(state, { type: 'tsumo', seat: 1 })).toBe(false);
    expect(isLegalAction(state, { type: 'ron', seat: 1 })).toBe(false);
    expect(
      isLegalAction(state, {
        type: 'pon',
        seat: 1,
        tiles: [state.players[1].hand[0], state.players[1].hand[1]],
      }),
    ).toBe(false);
  });

  it('treats a riichi-flagged discard as a different action', () => {
    const plain: Action = { type: 'discard', seat: 0, tile: 4 };
    const declared: Action = { type: 'discard', seat: 0, tile: 4, riichi: true };
    expect(sameAction(plain, declared)).toBe(false);
    expect(sameAction(plain, { type: 'discard', seat: 0, tile: 4 })).toBe(true);
  });

  it('returns nothing at all once the hand has ended', () => {
    const state = callPosition('4s', { hand: '2356s', melds: [...HONOUR_PONS_A] });
    state.phase = 'ended';
    for (const seat of [0, 1, 2, 3] as Seat[]) {
      expect(legalActions(state, seat)).toEqual([]);
    }
  });
});
