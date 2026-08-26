/**
 * Riichi Mahjong M4 — round and game state machine.
 *
 * Scenario tests built from hand-made positions (see `roundFixtures.ts`), one
 * per rule the state machine is responsible for: ippatsu, furiten, chankan,
 * rinshan, haitei/houtei, double ron attribution, kyuushu kyuuhai, exhaustive
 * draw payments, riichi restrictions, call priority and hand progression.
 *
 * ## Filler seats
 *
 * Most scenarios only care about one or two hands, but a round needs four —
 * and every fixture has to stay inside four copies of each tile. The three
 * seats that are only there to make up the numbers therefore use
 * {@link filler}: three called runs plus four isolated tiles, which is
 * guaranteed noten (it cannot ron), cannot pon or chi anything, and — crucially
 * — draws its nine meld tiles from a single suit, so the interesting hand is
 * free to use the rest of the wall. `filler(3)` is honour-only and touches no
 * suit at all.
 *
 * The last block runs the `scripts/mahjong-sim-smoke.ts` invariant loop over a
 * couple of thousand random hands; the script itself is used for larger runs.
 */

import { describe, expect, it } from 'vitest';

import {
  legalActions,
  seatWindOf,
} from '@/components/game/Mahjong/engine/actions';
import { isFuriten } from '@/components/game/Mahjong/engine/furiten';
import {
  advanceHand,
  applyAction,
  cloneRoundState,
  currentActors,
  startGame,
  startRound,
  tenpaiSeatsAt,
} from '@/components/game/Mahjong/engine/gameState';
import { createRng } from '@/components/game/Mahjong/engine/random';
import { DEFAULT_RULES, HANCHAN_RULES } from '@/components/game/Mahjong/engine/rules';
import { kindOf, parseKinds, sortTiles } from '@/components/game/Mahjong/engine/tiles';
import { liveTilesRemaining } from '@/components/game/Mahjong/engine/wall';
import type {
  Action,
  RoundState,
  Seat,
  TileId,
  YakuId,
} from '@/components/game/Mahjong/engine/types';
import { runSmoke } from '../../../../../scripts/mahjong-sim-smoke';
import { buildGame, buildRound, type MeldSpec, type SeatSpec } from './roundFixtures';

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/**
 * Closed tenpai: 123m 456m 789m + 11s pair + 23s, waiting 1s/4s.
 * Worth pinfu plus ittsuu (3 han) whichever side of the ryanmen lands.
 */
const PINFU_TENPAI = '123m456m789m11s23s';

/** Three called runs, one suit each, plus an honour-only variant. */
const FILLER_MELDS: readonly MeldSpec[][] = [
  [
    { type: 'chi', tiles: '123m' },
    { type: 'chi', tiles: '456m' },
    { type: 'chi', tiles: '789m' },
  ],
  [
    { type: 'chi', tiles: '123p' },
    { type: 'chi', tiles: '456p' },
    { type: 'chi', tiles: '789p' },
  ],
  [
    { type: 'chi', tiles: '123s' },
    { type: 'chi', tiles: '456s' },
    { type: 'chi', tiles: '789s' },
  ],
  [
    { type: 'pon', tiles: '111z' },
    { type: 'pon', tiles: '222z' },
    { type: 'pon', tiles: '333z' },
  ],
];
/** Four isolated tiles: with three melds down that is two away from tenpai. */
const FILLER_TAIL: readonly string[] = ['2p6p2s6s', '3m7m3s7s', '4m8m4p8p', '4z5z6z7z'];

/** A seat that exists only to fill the table: noten, and unable to call. */
function filler(index: number): SeatSpec {
  return { hand: FILLER_TAIL[index], melds: [...FILLER_MELDS[index]] };
}

/** The same seat holding one extra tile, which it is about to discard. */
function fillerHolding(index: number, extra: string): SeatSpec {
  return {
    hand: `${FILLER_TAIL[index]}${extra}`,
    melds: [...FILLER_MELDS[index]],
    drawn: true,
  };
}

/** A concrete tile of `kind` from a seat's concealed hand. */
function held(state: RoundState, seat: Seat, kind: string): TileId {
  const target = parseKinds(kind)[0];
  const tile = state.players[seat].hand.find((id) => kindOf(id) === target);
  if (tile === undefined) throw new Error(`seat ${seat} holds no ${kind}`);
  return tile;
}

/** Every concrete tile of `kind` a seat holds, ascending. */
function allHeld(state: RoundState, seat: Seat, kind: string): TileId[] {
  const target = parseKinds(kind)[0];
  return state.players[seat].hand.filter((id) => kindOf(id) === target);
}

function yakuIds(state: RoundState, index = 0): YakuId[] {
  const result = state.result;
  if (result === null) throw new Error('the hand has not ended');
  return result.agari[index].value.yaku.map((entry) => entry.id);
}

function discard(state: RoundState, seat: Seat, kind: string, riichi = false): void {
  const action: Action = riichi
    ? { type: 'discard', seat, tile: held(state, seat, kind), riichi: true }
    : { type: 'discard', seat, tile: held(state, seat, kind) };
  applyAction(state, action);
}

function pon(state: RoundState, seat: Seat, kind: string): void {
  const [a, b] = allHeld(state, seat, kind);
  applyAction(state, { type: 'pon', seat, tiles: [a, b] });
}

function chi(state: RoundState, seat: Seat, first: string, second: string): void {
  const tiles = sortTiles([held(state, seat, first), held(state, seat, second)]);
  applyAction(state, { type: 'chi', seat, tiles: [tiles[0], tiles[1]] });
}

function actionTypes(state: RoundState, seat: Seat): string[] {
  return legalActions(state, seat).map((action) => action.type);
}

// ---------------------------------------------------------------------------
// Dealing and basic shape
// ---------------------------------------------------------------------------

describe('startRound', () => {
  it('deals, turns the first dora and leaves the dealer holding fourteen tiles', () => {
    const state = startRound({
      rules: DEFAULT_RULES,
      roundWind: 0,
      dealer: 0,
      honba: 0,
      riichiSticks: 0,
      scores: [25000, 25000, 25000, 25000],
      rng: createRng('m4-deal'),
    });

    expect(state.phase).toBe('discard');
    expect(state.turn).toBe(0);
    expect(state.players[0].hand).toHaveLength(14);
    expect(state.players[0].drawn).not.toBeNull();
    for (const seat of [1, 2, 3] as Seat[]) {
      expect(state.players[seat].hand).toHaveLength(13);
      expect(state.players[seat].drawn).toBeNull();
    }
    expect(state.wall.doraIndicators).toHaveLength(1);
    // 122 live tiles minus 52 dealt minus the dealer's first draw.
    expect(liveTilesRemaining(state.wall)).toBe(69);
    expect(state.lastDrawSource).toBe('wall');
  });

  it('is fully reproducible from its seed', () => {
    const deal = (): RoundState =>
      startRound({
        rules: DEFAULT_RULES,
        roundWind: 0,
        dealer: 2,
        honba: 1,
        riichiSticks: 2,
        scores: [25000, 25000, 25000, 25000],
        rng: createRng(4242),
      });
    expect(deal().players.map((p) => p.hand)).toEqual(
      deal().players.map((p) => p.hand),
    );
  });

  it('gives the dealer the East seat wind and rotates the rest', () => {
    const state = buildRound({
      dealer: 2,
      seats: [filler(0), filler(1), filler(2), filler(3)],
      turn: 2,
    });
    expect(seatWindOf(state, 2)).toBe(0);
    expect(seatWindOf(state, 3)).toBe(1);
    expect(seatWindOf(state, 0)).toBe(2);
    expect(seatWindOf(state, 1)).toBe(3);
  });
});

describe('applyAction validation', () => {
  function opening(): RoundState {
    return buildRound({
      seats: [
        { hand: `${PINFU_TENPAI}7z`, drawn: true },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
  }

  it('throws on a tile the player does not hold', () => {
    const state = opening();
    const notHeld = [...Array(136).keys()].find(
      (id) => !state.players[0].hand.includes(id),
    ) as TileId;
    expect(() => applyAction(state, { type: 'discard', seat: 0, tile: notHeld })).toThrow(
      /Illegal action/,
    );
  });

  it('throws when a seat acts out of turn', () => {
    const state = opening();
    expect(() => applyAction(state, { type: 'tsumo', seat: 1 })).toThrow(/Illegal action/);
  });

  it('reports the seat on turn as the only actor while a discard is owed', () => {
    const state = opening();
    expect(currentActors(state)).toEqual([0]);
    expect(legalActions(state, 1)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Riichi
// ---------------------------------------------------------------------------

describe('riichi declaration', () => {
  function riichiPosition(overrides: Partial<SeatSpec> = {}): RoundState {
    return buildRound({
      seats: [
        { hand: `${PINFU_TENPAI}7z`, drawn: true, ...overrides },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
  }

  it('moves 1000 points onto the table when the declaration tile passes', () => {
    const state = riichiPosition();
    discard(state, 0, '7z', true);

    expect(state.players[0].score).toBe(24000);
    expect(state.riichiSticks).toBe(1);
    expect(state.players[0].riichi).not.toBeNull();
    expect(state.players[0].ippatsu).toBe(true);
    expect(state.players[0].discards.at(-1)?.riichi).toBe(true);
    expect(state.turn).toBe(1);
    expect(state.phase).toBe('discard');
  });

  it('is a double riichi on the very first uninterrupted discard', () => {
    const state = buildRound({
      firstGoAround: true,
      turnCount: 0,
      seats: [
        { hand: `${PINFU_TENPAI}7z`, drawn: true },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    discard(state, 0, '7z', true);
    expect(state.players[0].riichi?.double).toBe(true);
  });

  it('is refused below the cost of the stick', () => {
    const state = riichiPosition({ score: 900 });
    expect(legalActions(state, 0).some((a) => a.type === 'discard' && a.riichi)).toBe(
      false,
    );
  });

  it('is refused with an open hand', () => {
    const state = buildRound({
      seats: [
        {
          hand: '456m789m11s23s7z',
          melds: [{ type: 'chi', tiles: '123m' }],
          drawn: true,
        },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    expect(legalActions(state, 0).some((a) => a.type === 'discard' && a.riichi)).toBe(
      false,
    );
  });

  it('locks the declarer into tsumogiri afterwards', () => {
    const state = buildRound({
      seats: [
        { hand: `${PINFU_TENPAI}7z`, drawn: true, riichi: true, discards: '9p9p' },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    const discards = legalActions(state, 0).filter((a) => a.type === 'discard');
    expect(discards).toHaveLength(1);
    expect(discards[0].tile).toBe(state.players[0].drawn);
  });

  it('offers a declared riichi no calls on another seat discard', () => {
    const state = buildRound({
      turn: 1,
      seats: [
        { hand: '123m456m789m11s44s', riichi: true, discards: '9p9p' },
        fillerHolding(1, '4s'),
        filler(2),
        filler(3),
      ],
    });
    discard(state, 1, '4s');
    expect(actionTypes(state, 0)).not.toContain('pon');
    expect(actionTypes(state, 0)).not.toContain('minkan');
  });
});

describe('riichi and ankan', () => {
  // 123m 456m 789m + 5p tanki. Kanning the 1s just drawn leaves the wait alone.
  const KEEPS_WAIT = '123m456m789m5p111s1s';
  // 111s + 2s reads either as a triplet with a 2s tanki or as 11s + 12s, so the
  // hand waits on 2s *and* 3s; melding the four 1s throws the 3s wait away.
  const CHANGES_WAIT = '123m456m789m2s111s1s';

  function ankanPosition(hand: string): RoundState {
    return buildRound({
      rinshan: '9p',
      seats: [
        { hand, drawn: true, riichi: true, discards: '9m9m' },
        filler(0),
        filler(1),
        filler(3),
      ],
    });
  }

  it('allows an ankan that leaves the wait untouched', () => {
    const state = ankanPosition(KEEPS_WAIT);
    expect(legalActions(state, 0).some((a) => a.type === 'ankan')).toBe(true);
  });

  it('refuses an ankan that would change the wait', () => {
    const state = ankanPosition(CHANGES_WAIT);
    expect(legalActions(state, 0).some((a) => a.type === 'ankan')).toBe(false);
  });

  it('allows the same ankan without a declaration', () => {
    const state = buildRound({
      rinshan: '9p',
      seats: [
        { hand: CHANGES_WAIT, drawn: true },
        filler(0),
        filler(1),
        filler(3),
      ],
    });
    expect(legalActions(state, 0).some((a) => a.type === 'ankan')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ippatsu
// ---------------------------------------------------------------------------

describe('ippatsu', () => {
  it('is scored on a ron inside the declaration go-around', () => {
    const state = buildRound({
      doraIndicators: '8p',
      turn: 1,
      seats: [
        { hand: PINFU_TENPAI, riichi: true, ippatsu: true, discards: '9p9p' },
        fillerHolding(0, '4s'),
        filler(1),
        filler(3),
      ],
    });

    discard(state, 1, '4s');
    expect(currentActors(state)).toEqual([0]);
    applyAction(state, { type: 'ron', seat: 0 });

    expect(yakuIds(state)).toEqual(
      expect.arrayContaining(['riichi', 'ippatsu', 'pinfu', 'ittsuu']),
    );
  });

  it('is cancelled by a call made before the winning tile', () => {
    const state = buildRound({
      doraIndicators: '8p',
      turn: 1,
      seats: [
        { hand: PINFU_TENPAI, riichi: true, ippatsu: true, discards: '9p9p' },
        fillerHolding(0, '5z'),
        { hand: '4m8m55z4s', melds: [...FILLER_MELDS[1]] },
        filler(3),
      ],
    });

    discard(state, 1, '5z');
    expect(currentActors(state)).toEqual([2]);
    pon(state, 2, '5z');

    expect(state.players[0].ippatsu).toBe(false);
    expect(state.firstGoAround).toBe(false);
    expect(state.turn).toBe(2);

    discard(state, 2, '4s');
    applyAction(state, { type: 'ron', seat: 0 });
    const ids = yakuIds(state);
    expect(ids).toContain('riichi');
    expect(ids).not.toContain('ippatsu');
  });
});

// ---------------------------------------------------------------------------
// Furiten
// ---------------------------------------------------------------------------

describe('furiten', () => {
  function waitingPosition(seat0: Partial<SeatSpec>): RoundState {
    return buildRound({
      doraIndicators: '8p',
      nextDraws: '5z6z7z',
      turn: 1,
      seats: [
        { hand: PINFU_TENPAI, ...seat0 },
        fillerHolding(0, '4s'),
        filler(1),
        filler(3),
      ],
    });
  }

  it("blocks ron when a winning kind sits in the player's own pond", () => {
    const state = waitingPosition({ discards: '1s' });
    discard(state, 1, '4s');
    expect(state.result).toBeNull();
    // Nobody could claim, so the discard passed straight on to the next seat.
    expect(state.turn).toBe(2);
  });

  it('marks a seat that lets a winning tile go past, and clears it on the next draw', () => {
    const state = waitingPosition({ discards: '9p9p' });
    discard(state, 1, '4s');
    expect(currentActors(state)).toEqual([0]);
    applyAction(state, { type: 'pass', seat: 0 });

    expect(state.players[0].temporaryFuriten).toBe(true);
    expect(isFuriten(state.players[0], state)).toBe(true);

    discard(state, 2, '5z');
    discard(state, 3, '6z');
    expect(state.turn).toBe(0);
    expect(state.players[0].temporaryFuriten).toBe(false);
    expect(isFuriten(state.players[0], state)).toBe(false);
  });

  it('makes a declared riichi permanently furiten after a miss', () => {
    const state = waitingPosition({ discards: '9p9p', riichi: true });
    discard(state, 1, '4s');
    applyAction(state, { type: 'pass', seat: 0 });

    expect(state.players[0].riichiFuriten).toBe(true);
    discard(state, 2, '5z');
    discard(state, 3, '6z');
    expect(state.players[0].temporaryFuriten).toBe(false);
    expect(state.players[0].riichiFuriten).toBe(true);
    expect(isFuriten(state.players[0], state)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Kans
// ---------------------------------------------------------------------------

describe('kans', () => {
  it('flips a new dora indicator and draws from the dead wall on an ankan', () => {
    const state = buildRound({
      rinshan: '9p',
      seats: [
        { hand: '123m456m789m1111z9m', drawn: true },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    const before = state.wall.doraIndicators.length;
    applyAction(state, { type: 'ankan', seat: 0, kind: parseKinds('1z')[0] });

    expect(state.wall.doraIndicators).toHaveLength(before + 1);
    expect(state.wall.uraIndicators).toHaveLength(before + 1);
    expect(state.kanCount).toBe(1);
    expect(state.lastDrawSource).toBe('rinshan');
    expect(state.phase).toBe('discard');
    expect(state.turn).toBe(0);
    expect(state.players[0].melds[0].type).toBe('ankan');
    expect(state.players[0].hand).toHaveLength(11);
  });

  it('never opens a robbing window for an ankan', () => {
    const state = buildRound({
      rinshan: '9s',
      seats: [
        { hand: '123m456m789m9999p9m', drawn: true },
        { hand: '123m456m789m11s78p' },
        filler(2),
        filler(3),
      ],
    });
    // Seat 1 is waiting on 9p, but a concealed kan is not robbable in v1.
    applyAction(state, { type: 'ankan', seat: 0, kind: parseKinds('9p')[0] });
    expect(state.phase).toBe('discard');
    expect(state.pendingDiscard).toBeNull();
    expect(state.result).toBeNull();
  });

  it('scores rinshan kaihou when the replacement tile completes the hand', () => {
    const state = buildRound({
      doraIndicators: '8p',
      rinshan: '5p',
      seats: [
        { hand: '123m456m789m1111s5p', drawn: true },
        filler(0),
        filler(1),
        filler(3),
      ],
    });
    applyAction(state, { type: 'ankan', seat: 0, kind: parseKinds('1s')[0] });
    expect(state.lastDrawSource).toBe('rinshan');
    applyAction(state, { type: 'tsumo', seat: 0 });
    expect(yakuIds(state)).toEqual(expect.arrayContaining(['rinshan', 'menzen-tsumo']));
  });

  it('exposes a kakan to chankan before it completes', () => {
    const state = buildRound({
      doraIndicators: '8p',
      rinshan: '9s',
      seats: [
        {
          hand: '123m456m789m9p9m',
          melds: [{ type: 'pon', tiles: '999p', from: 3 }],
          drawn: true,
        },
        { hand: '123m456m789m11s78p' },
        filler(2),
        filler(3),
      ],
    });

    applyAction(state, { type: 'kakan', seat: 0, tile: held(state, 0, '9p') });
    expect(state.phase).toBe('call');
    expect(state.pendingDiscard?.chankan).toBe(true);
    expect(currentActors(state)).toEqual([1]);
    expect(actionTypes(state, 1)).toEqual(['ron', 'pass']);

    applyAction(state, { type: 'ron', seat: 1 });
    expect(yakuIds(state)).toContain('chankan');
    expect(state.result?.agari[0].loser).toBe(0);
  });

  it('completes the kakan when nobody robs it', () => {
    const state = buildRound({
      rinshan: '9s',
      seats: [
        {
          hand: '123m456m789m9p9m',
          melds: [{ type: 'pon', tiles: '999p', from: 3 }],
          drawn: true,
        },
        filler(0),
        filler(2),
        filler(3),
      ],
    });
    applyAction(state, { type: 'kakan', seat: 0, tile: held(state, 0, '9p') });
    expect(state.phase).toBe('discard');
    expect(state.players[0].melds[0].type).toBe('kakan');
    expect(state.players[0].melds[0].tiles).toHaveLength(4);
    expect(state.lastDrawSource).toBe('rinshan');
    expect(state.kanCount).toBe(1);
  });

  it('refuses a fifth kan', () => {
    const state = buildRound({
      kanCount: 4,
      seats: [
        { hand: '123m456m789m1111z9m', drawn: true },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    expect(state.kanCount).toBe(4);
    expect(legalActions(state, 0).some((a) => a.type === 'ankan')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Last tile of the hand
// ---------------------------------------------------------------------------

describe('haitei and houtei', () => {
  it('scores haitei raoyue on the last tile drawn from the live wall', () => {
    const state = buildRound({
      doraIndicators: '8p',
      liveRemaining: 1,
      nextDraws: '4s',
      turn: 3,
      seats: [
        { hand: PINFU_TENPAI, discards: '9p9p' },
        filler(1),
        filler(3),
        fillerHolding(2, '7z'),
      ],
    });

    discard(state, 3, '7z');
    expect(state.turn).toBe(0);
    expect(liveTilesRemaining(state.wall)).toBe(0);
    applyAction(state, { type: 'tsumo', seat: 0 });
    expect(yakuIds(state)).toContain('haitei');
  });

  it('scores houtei raoyui on the very last discard', () => {
    const state = buildRound({
      doraIndicators: '8p',
      liveRemaining: 0,
      turn: 3,
      seats: [
        { hand: PINFU_TENPAI, discards: '9p9p' },
        filler(1),
        filler(3),
        fillerHolding(2, '4s'),
      ],
    });

    discard(state, 3, '4s');
    expect(currentActors(state)).toEqual([0]);
    applyAction(state, { type: 'ron', seat: 0 });
    expect(yakuIds(state)).toContain('houtei');
  });

  it('refuses pon and chi on the final discard', () => {
    const state = buildRound({
      liveRemaining: 0,
      turn: 3,
      seats: [
        filler(0),
        filler(3),
        { hand: '3m7m11s', melds: [...FILLER_MELDS[1]] },
        fillerHolding(2, '1s'),
      ],
    });
    discard(state, 3, '1s');
    // Seat 2 holds a pair of 1s, but no call is possible on the houtei tile.
    expect(state.players[2].melds).toHaveLength(3);
    expect(state.result?.draw?.reason).toBe('exhaustive');
  });
});

// ---------------------------------------------------------------------------
// Call priority
// ---------------------------------------------------------------------------

describe('call priority', () => {
  it('lets ron beat a pon claimed first', () => {
    const state = buildRound({
      doraIndicators: '8p',
      turn: 0,
      seats: [
        fillerHolding(0, '4s'),
        { hand: '3m7m44s', melds: [...FILLER_MELDS[1]] },
        { hand: PINFU_TENPAI, discards: '9p' },
        filler(3),
      ],
    });

    discard(state, 0, '4s');
    pon(state, 1, '4s');
    expect(state.result).toBeNull();
    applyAction(state, { type: 'ron', seat: 2 });

    expect(state.result?.agari).toHaveLength(1);
    expect(state.result?.agari[0].winner).toBe(2);
    expect(state.players[1].melds).toHaveLength(3);
  });

  it('lets pon beat a chi claimed first', () => {
    const state = buildRound({
      turn: 0,
      seats: [
        fillerHolding(0, '4s'),
        { hand: '3m7m35s', melds: [...FILLER_MELDS[1]] },
        { hand: '4m8m44s', melds: [...FILLER_MELDS[3]] },
        filler(2),
      ],
    });

    discard(state, 0, '4s');
    chi(state, 1, '3s', '5s');
    pon(state, 2, '4s');

    expect(state.players[2].melds).toHaveLength(4);
    expect(state.players[1].melds).toHaveLength(3);
    expect(state.turn).toBe(2);
  });

  it('offers chi only to the seat on the discarder right', () => {
    const state = buildRound({
      turn: 0,
      seats: [
        fillerHolding(0, '4s'),
        { hand: '3m7m35s', melds: [...FILLER_MELDS[1]] },
        { hand: '4m8m35s', melds: [...FILLER_MELDS[3]] },
        {
          hand: '2m6m35s',
          melds: [
            { type: 'pon', tiles: '444z' },
            { type: 'pon', tiles: '555z' },
            { type: 'pon', tiles: '666z' },
          ],
        },
      ],
    });
    discard(state, 0, '4s');
    expect(actionTypes(state, 1)).toContain('chi');
    expect(actionTypes(state, 2)).not.toContain('chi');
    expect(actionTypes(state, 3)).not.toContain('chi');
  });

  it('pays both winners of a double ron and gives the sticks to the head bump', () => {
    const state = buildRound({
      doraIndicators: '8p',
      honba: 2,
      riichiSticks: 1,
      turn: 0,
      seats: [
        fillerHolding(0, '4s'),
        { hand: PINFU_TENPAI, discards: '9p' },
        { hand: PINFU_TENPAI, discards: '9p' },
        filler(3),
      ],
    });

    discard(state, 0, '4s');
    applyAction(state, { type: 'ron', seat: 2 });
    expect(state.result).toBeNull();
    applyAction(state, { type: 'ron', seat: 1 });

    const result = state.result;
    expect(result?.agari.map((a) => a.winner)).toEqual([1, 2]);
    // Both hands are pinfu + ittsuu, 3 han 30 fu = 3900 each. Seat 1 is the
    // head bump, so it also collects 2 honba (600) and the 1000-point stick.
    expect(result?.scoreDeltas).toEqual([-8400, 5500, 3900, 0]);
    expect(result?.dealerRepeat).toBe(false);
    expect(result?.nextHonba).toBe(0);
    expect(result?.riichiSticksCarried).toBe(0);
  });

  it('head bumps when double ron is disabled', () => {
    const state = buildRound({
      rules: { ...DEFAULT_RULES, doubleRon: false },
      doraIndicators: '8p',
      turn: 0,
      seats: [
        fillerHolding(0, '4s'),
        { hand: PINFU_TENPAI, discards: '9p' },
        { hand: PINFU_TENPAI, discards: '9p' },
        filler(3),
      ],
    });

    discard(state, 0, '4s');
    applyAction(state, { type: 'ron', seat: 2 });
    applyAction(state, { type: 'ron', seat: 1 });
    expect(state.result?.agari.map((a) => a.winner)).toEqual([1]);
  });
});

// ---------------------------------------------------------------------------
// Draws
// ---------------------------------------------------------------------------

const DRAW_MELDS: readonly MeldSpec[][] = [
  [
    { type: 'chi', tiles: '123m' },
    { type: 'chi', tiles: '456m' },
    { type: 'chi', tiles: '789m' },
  ],
  [
    { type: 'chi', tiles: '123p' },
    { type: 'chi', tiles: '456p' },
    { type: 'chi', tiles: '789p' },
  ],
  [
    { type: 'chi', tiles: '123s' },
    { type: 'chi', tiles: '456s' },
    { type: 'chi', tiles: '789s' },
  ],
  [
    { type: 'chi', tiles: '234m' },
    { type: 'chi', tiles: '678m' },
    { type: 'chi', tiles: '234s' },
  ],
];
/** Two pairs behind three melds: a shanpon tenpai. */
const DRAW_TENPAI: readonly string[] = ['1122p', '1122s', '3344m', '5566z'];
/** Four isolated tiles behind three melds: two away from tenpai. */
const DRAW_NOTEN: readonly string[] = ['1p5p9p3z', '1s5s9s4z', '2m6m1z5z', '1z3z5z7z'];

/**
 * A position one discard away from an exhaustive draw, where `tenpai` names
 * the seats that will be counted as tenpai. Seat 3 makes the last discard.
 */
function exhaustivePosition(tenpai: readonly Seat[]): RoundState {
  const seats = [0, 1, 2, 3].map((index) => {
    const isTenpai = tenpai.includes(index as Seat);
    const tail = isTenpai ? DRAW_TENPAI[index] : DRAW_NOTEN[index];
    return {
      hand: index === 3 ? `${tail}2z` : tail,
      melds: [...DRAW_MELDS[index]],
      drawn: index === 3,
    };
  }) as [SeatSpec, SeatSpec, SeatSpec, SeatSpec];

  return buildRound({ liveRemaining: 0, turn: 3, doraIndicators: '8p', seats });
}

describe('exhaustive draw', () => {
  it.each([
    [[] as Seat[], [0, 0, 0, 0]],
    [[0] as Seat[], [3000, -1000, -1000, -1000]],
    [[0, 1] as Seat[], [1500, 1500, -1500, -1500]],
    [[0, 1, 2] as Seat[], [1000, 1000, 1000, -3000]],
    [[0, 1, 2, 3] as Seat[], [0, 0, 0, 0]],
  ])('pays out correctly with tenpai seats %j', (tenpai, deltas) => {
    const state = exhaustivePosition(tenpai);
    discard(state, 3, '2z');

    expect(state.phase).toBe('ended');
    expect(state.result?.draw?.reason).toBe('exhaustive');
    expect(state.result?.draw?.tenpaiSeats).toEqual(tenpai);
    expect(state.result?.scoreDeltas).toEqual(deltas);
    expect(state.result?.nextHonba).toBe(1);
  });

  it('repeats the deal when the dealer is tenpai and passes it otherwise', () => {
    const repeat = exhaustivePosition([0]);
    discard(repeat, 3, '2z');
    expect(repeat.result?.dealerRepeat).toBe(true);

    const pass = exhaustivePosition([1]);
    discard(pass, 3, '2z');
    expect(pass.result?.dealerRepeat).toBe(false);
  });

  it('carries riichi sticks over instead of paying them out', () => {
    const state = exhaustivePosition([0, 1]);
    state.riichiSticks = 2;
    discard(state, 3, '2z');
    expect(state.result?.riichiSticksCarried).toBe(2);
    expect(state.riichiSticks).toBe(2);
  });

  it('agrees with tenpaiSeatsAt', () => {
    const state = exhaustivePosition([1, 3]);
    discard(state, 3, '2z');
    expect(tenpaiSeatsAt(state)).toEqual([1, 3]);
  });
});

describe('kyuushu kyuuhai', () => {
  const NINE_ORPHANS = '19m19p19s1234567z1m';

  function orphanPosition(overrides: Partial<Record<number, Partial<SeatSpec>>> = {}) {
    return buildRound({
      firstGoAround: true,
      turnCount: 0,
      honba: 1,
      riichiSticks: 1,
      seats: [
        { hand: NINE_ORPHANS, drawn: true, ...overrides[0] },
        { ...filler(0), ...overrides[1] },
        { ...filler(1), ...overrides[2] },
        { ...filler(2), ...overrides[3] },
      ],
    });
  }

  it('aborts the hand, keeps the deal and bumps the honba', () => {
    const state = orphanPosition();
    expect(legalActions(state, 0).some((a) => a.type === 'kyuushu')).toBe(true);
    applyAction(state, { type: 'kyuushu', seat: 0 });

    expect(state.phase).toBe('ended');
    expect(state.result?.draw?.reason).toBe('kyuushu');
    expect(state.result?.dealerRepeat).toBe(true);
    expect(state.result?.nextHonba).toBe(2);
    expect(state.result?.riichiSticksCarried).toBe(1);
    expect(state.result?.scoreDeltas).toEqual([0, 0, 0, 0]);
  });

  it('is gone once a call has interrupted the go-around', () => {
    const state = buildRound({
      firstGoAround: false,
      turnCount: 0,
      seats: [
        { hand: NINE_ORPHANS, drawn: true },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    expect(legalActions(state, 0).some((a) => a.type === 'kyuushu')).toBe(false);
  });

  it('is gone once the player has discarded', () => {
    const state = buildRound({
      firstGoAround: true,
      turnCount: 4,
      seats: [
        { hand: NINE_ORPHANS, drawn: true, discards: '2m' },
        filler(0),
        filler(1),
        filler(2),
      ],
    });
    expect(legalActions(state, 0).some((a) => a.type === 'kyuushu')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blessings
// ---------------------------------------------------------------------------

describe('tenhou', () => {
  it('is scored when the dealer completes the hand on the opening draw', () => {
    const state = buildRound({
      doraIndicators: '8p',
      firstGoAround: true,
      turnCount: 0,
      seats: [
        { hand: '123m456m789m123s99p', drawn: true },
        filler(0),
        filler(1),
        filler(3),
      ],
    });
    applyAction(state, { type: 'tsumo', seat: 0 });
    expect(yakuIds(state)).toContain('tenhou');
    expect(state.result?.agari[0].value.yakuman).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Cloning
// ---------------------------------------------------------------------------

describe('cloneRoundState', () => {
  it('detaches every mutable structure', () => {
    const state = startRound({
      rules: DEFAULT_RULES,
      roundWind: 0,
      dealer: 0,
      honba: 0,
      riichiSticks: 0,
      scores: [25000, 25000, 25000, 25000],
      rng: createRng('clone'),
    });
    const copy = cloneRoundState(state);
    applyAction(copy, { type: 'discard', seat: 0, tile: copy.players[0].hand[0] });

    expect(state.phase).toBe('discard');
    expect(state.players[0].hand).toHaveLength(14);
    expect(state.players[0].discards).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Game progression
// ---------------------------------------------------------------------------

describe('game progression', () => {
  function abortedRound(scores?: [number, number, number, number]): RoundState {
    const round = buildRound({
      firstGoAround: true,
      turnCount: 0,
      seats: [
        { hand: '19m19p19s1234567z1m', drawn: true, score: scores?.[0] },
        { ...filler(0), score: scores?.[1] },
        { ...filler(1), score: scores?.[2] },
        { ...filler(2), score: scores?.[3] },
      ],
    });
    applyAction(round, { type: 'kyuushu', seat: 0 });
    return round;
  }

  it('starts every seat on the rule set starting score', () => {
    const game = startGame({ rules: DEFAULT_RULES, rng: createRng('game') });
    expect(game.scores).toEqual([25000, 25000, 25000, 25000]);
    expect(game.handIndex).toBe(0);
    expect(game.dealer).toBe(0);
    expect(game.round?.phase).toBe('discard');
  });

  it('keeps the hand index on a dealer repeat and bumps the honba', () => {
    const game = advanceHand(buildGame(abortedRound()));
    expect(game.handIndex).toBe(0);
    expect(game.dealer).toBe(0);
    expect(game.honba).toBe(1);
    expect(game.finished).toBe(false);
    expect(game.round).toBeNull();
  });

  it('passes the deal and deals the next hand when an rng is supplied', () => {
    const round = exhaustivePosition([1]);
    discard(round, 3, '2z');

    const game = advanceHand(buildGame(round), createRng('next'));
    expect(game.handIndex).toBe(1);
    expect(game.dealer).toBe(1);
    expect(game.roundWind).toBe(0);
    expect(game.round?.dealer).toBe(1);
    expect(game.round?.phase).toBe('discard');
  });

  it('ends a tonpuusen once the deal leaves East 4', () => {
    const round = exhaustivePosition([1]);
    discard(round, 3, '2z');

    const game = advanceHand(buildGame(round, { handIndex: 3, dealer: 3 }));
    expect(game.handIndex).toBe(4);
    expect(game.finished).toBe(true);
    expect(game.round).toBeNull();
    expect(game.placements).not.toBeNull();
  });

  it('runs a hanchan into the South round instead of stopping', () => {
    const round = exhaustivePosition([1]);
    round.rules = HANCHAN_RULES;
    discard(round, 3, '2z');

    const game = advanceHand(
      buildGame(round, { handIndex: 3, dealer: 3, rules: HANCHAN_RULES }),
    );
    expect(game.finished).toBe(false);
    expect(game.handIndex).toBe(4);
    expect(game.roundWind).toBe(1);
  });

  it('ends the game on tobi and ranks the seats', () => {
    const game = advanceHand(buildGame(abortedRound([40000, 35100, 25000, -100])));
    expect(game.finished).toBe(true);
    expect(game.placements).toEqual([0, 1, 2, 3]);
  });

  it('refuses to advance while the hand is still running', () => {
    const game = startGame({ rules: DEFAULT_RULES, rng: createRng('unfinished') });
    expect(() => advanceHand(game)).toThrow(/has not finished/);
  });
});

// ---------------------------------------------------------------------------
// Fuzz
// ---------------------------------------------------------------------------

describe('random-play invariants', () => {
  it(
    'survives 750 random hands with tiles, hands, scores and actors intact',
    () => {
      // 750 rather than the script's 5000: invariants are re-checked after
      // every single action, so this is CPU-bound, and CI runners share cores
      // with other suites that have short timeouts. The full 5000-hand budget
      // lives in `scripts/mahjong-sim-smoke.ts`.
      const summary = runSmoke({ hands: 750, seed: 'm4-fuzz' });
      expect(summary.hands).toBe(750);
      expect(summary.actions).toBeGreaterThan(50_000);
      // The bigger 5000-hand budget is run from the script itself.
      expect(summary.tsumo + summary.ron).toBeGreaterThan(0);
      expect(summary.exhaustiveDraws).toBeGreaterThan(0);
      expect(summary.riichiDeclarations).toBeGreaterThan(0);
      expect(summary.kans).toBeGreaterThan(0);
      expect(summary.calls).toBeGreaterThan(0);
    },
    120_000,
  );
});
