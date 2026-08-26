/**
 * M5 — position tests for the heuristic AI and its safety module.
 *
 * Positions are described with the M4 fixture builder (`roundFixtures.ts`)
 * rather than reached by playing, so each test states exactly the situation it
 * is about. The whole-game tests at the end play real seeded rounds instead,
 * because "never illegal", "reproducible" and "fast enough" are properties of
 * the distribution rather than of any one position.
 *
 * ## Why the opponents mostly hold nothing
 *
 * Only seat 0 is ever asked to act here, and nothing seat 0 can see depends on
 * another seat's *concealed* tiles: `legalActions(state, 0)` reads seat 0's
 * hand and the pending discard, and the safety reads look at melds, ponds and
 * riichi flags. Giving the other seats {@link IDLE} empty hands therefore
 * changes no answer, and it leaves the whole tile pool available to the hand
 * actually under test — which matters, because several fixtures need three or
 * four copies of one kind.
 */

import { describe, expect, it } from 'vitest';

import { isLegalAction, legalActions } from '@/components/game/Mahjong/engine/actions';
import {
  advanceHand,
  applyAction,
  currentActors,
  startGame,
  startRound,
} from '@/components/game/Mahjong/engine/gameState';
import { createRng } from '@/components/game/Mahjong/engine/random';
import { DEFAULT_RULES } from '@/components/game/Mahjong/engine/rules';
import { kindOf, parseKinds } from '@/components/game/Mahjong/engine/tiles';
import {
  TILE_KIND_COUNT,
  type Action,
  type DiscardAction,
  type RoundState,
  type Seat,
} from '@/components/game/Mahjong/engine/types';
import {
  chooseAction,
  estimateHan,
  hasOpenYakuPath,
  shouldFold,
} from '@/components/game/Mahjong/ai/heuristicAI';
import {
  createSafetyContext,
  dangerLevel,
  DANGER_GENBUTSU,
  safestDiscard,
  threatSeats,
  visibleCounts,
} from '@/components/game/Mahjong/ai/safety';
import { handleRequest } from '@/components/game/Mahjong/mahjong-ai.worker';
import {
  MAX_WORKER_RESTARTS,
  chooseActionSync,
  createMahjongAiClient,
} from '@/components/game/Mahjong/mahjongAiWorkerClient';
import { buildRound, type SeatSpec } from './roundFixtures';

/** A seat that holds nothing and does nothing. See the file header. */
const IDLE: SeatSpec = { hand: '' };

const rng = () => createRng(12345);

/** The single kind behind an MPSZ string like `'5s'`. */
function tileKind(notation: string): number {
  const kinds = parseKinds(notation);
  expect(kinds).toHaveLength(1);
  return kinds[0];
}

function asDiscard(action: Action): DiscardAction {
  expect(action.type).toBe('discard');
  return action as DiscardAction;
}

function countsOf(notation: string): Uint8Array {
  const out = new Uint8Array(TILE_KIND_COUNT);
  for (const value of parseKinds(notation)) out[value] += 1;
  return out;
}

// ---------------------------------------------------------------------------
// safety.ts — visibility
// ---------------------------------------------------------------------------

describe('safety — visibility', () => {
  it('counts hand, melds, ponds and dora indicators, but not hidden hands', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p', discards: '9p' },
        { hand: '', melds: [{ type: 'pon', tiles: '777p' }], discards: '8p' },
        { hand: '666s' },
        IDLE,
      ],
      doraIndicators: '5p',
      turn: 0,
      phase: 'discard',
    });
    const visible = visibleCounts(round, 0);

    expect(visible[tileKind('1m')]).toBe(1);
    expect(visible[tileKind('9p')]).toBe(1);
    expect(visible[tileKind('7p')]).toBe(3);
    expect(visible[tileKind('8p')]).toBe(1);
    expect(visible[tileKind('5p')]).toBe(1);
    expect(visible[tileKind('6s')]).toBe(0);
  });

  it('does not count a claimed discard twice', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p' },
        { hand: '', melds: [{ type: 'pon', tiles: '777p', from: 0 }] },
        IDLE,
        IDLE,
      ],
      doraIndicators: '5p',
      turn: 0,
      phase: 'discard',
    });
    // The engine leaves the claimed tile in the discarder's pond with
    // `calledBy` set, so it is reachable through both the pond and the meld.
    const claimed = round.players[1].melds[0].calledTile;
    expect(claimed).not.toBeNull();
    round.players[0].discards.push({
      tile: claimed as number,
      riichi: false,
      tsumogiri: false,
      calledBy: 1,
    });

    expect(visibleCounts(round, 0)[tileKind('7p')]).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// safety.ts — danger
// ---------------------------------------------------------------------------

describe('safety — danger ordering', () => {
  /** Seat 1 has declared riichi with `pond`; seat 0 holds `hand`. */
  function riichiRound(pond: string, hand = '19m19p19s1234567z'): RoundState {
    return buildRound({
      seats: [
        { hand },
        { hand: '', discards: pond, riichi: true },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
  }

  it('rates a tile in the opponent pond as provably safe', () => {
    expect(dangerLevel(tileKind('4m'), 1, riichiRound('4m'), 0)).toBe(DANGER_GENBUTSU);
  });

  it('rates a tile discarded by a third seat after the riichi as safe', () => {
    const round = buildRound({
      seats: [
        { hand: '19m19p19s1234567z' },
        { hand: '', discards: '9m4m', riichi: { declaredAtDiscard: 1 } },
        // Seat 1 declared on its *second* discard, so seat 2's first pond
        // entry is not provably later and the ones after it are.
        { hand: '', discards: '1p2p3p' },
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    expect(dangerLevel(tileKind('3p'), 1, round, 0)).toBe(DANGER_GENBUTSU);
    expect(dangerLevel(tileKind('2p'), 1, round, 0)).toBe(DANGER_GENBUTSU);
    // …while the first entry is not provably later, so it stays live.
    expect(dangerLevel(tileKind('1p'), 1, round, 0)).toBeGreaterThan(0);
  });

  it('rates a suji tile below the same tile with no suji', () => {
    expect(dangerLevel(tileKind('4p'), 1, riichiRound('1p'), 0)).toBeLessThan(
      dangerLevel(tileKind('4p'), 1, riichiRound('9m'), 0),
    );
  });

  it('leaves a suji tile live — suji only rules out ryanmen', () => {
    expect(dangerLevel(tileKind('4p'), 1, riichiRound('1p'), 0)).toBeGreaterThan(
      DANGER_GENBUTSU,
    );
  });

  it('rates a walled (one-chance) tile below an unwalled one', () => {
    // All four 3p sit in seat 0's own hand, so the 3p4p ryanmen cannot exist.
    const walled = riichiRound('9m', '3333p19m19s12345z');
    const plain = riichiRound('9m', '3789p19m19s12345z');
    expect(dangerLevel(tileKind('5p'), 1, walled, 0)).toBeLessThan(
      dangerLevel(tileKind('5p'), 1, plain, 0),
    );
  });

  it('rates an honour lower the fewer copies are left', () => {
    const many = riichiRound('9m', '19m19p19s1234567z');
    const few = riichiRound('9m', '111z19m19p19s2345z');
    expect(dangerLevel(tileKind('1z'), 1, few, 0)).toBeLessThan(
      dangerLevel(tileKind('1z'), 1, many, 0),
    );
  });

  it('makes a no-suji middle tile the most dangerous tile on offer', () => {
    const round = riichiRound('9m');
    const middle = dangerLevel(tileKind('5p'), 1, round, 0);
    expect(middle).toBeGreaterThan(dangerLevel(tileKind('1p'), 1, round, 0));
    expect(middle).toBeGreaterThan(dangerLevel(tileKind('1z'), 1, round, 0));
    expect(middle).toBeGreaterThan(dangerLevel(tileKind('9m'), 1, round, 0));
  });

  it('never rates a tile as dangerous against the seat discarding it', () => {
    expect(dangerLevel(tileKind('5p'), 0, riichiRound('9m'), 0)).toBe(DANGER_GENBUTSU);
  });
});

// ---------------------------------------------------------------------------
// safety.ts — threats
// ---------------------------------------------------------------------------

describe('safety — threat detection', () => {
  it('flags a declared riichi at full weight', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p' },
        { hand: '', discards: '9s', riichi: true },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    const threats = threatSeats(round, 0);
    expect(threats).toHaveLength(1);
    expect(threats[0]).toMatchObject({ seat: 1, reason: 'riichi', weight: 1 });
  });

  it('flags a three-meld open hand', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p' },
        {
          hand: '5556s',
          melds: [
            { type: 'pon', tiles: '111s' },
            { type: 'pon', tiles: '222s' },
            { type: 'chi', tiles: '678s' },
          ],
        },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    expect(threatSeats(round, 0).map((threat) => threat.reason)).toEqual(['melds']);
  });

  it('flags a yakuhai pon backed by a second meld', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p' },
        {
          hand: '1234567s',
          melds: [
            { type: 'pon', tiles: '555z' },
            { type: 'pon', tiles: '111s' },
          ],
        },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    const threats = threatSeats(round, 0);
    expect(threats).toHaveLength(1);
    expect(threats[0]).toMatchObject({ seat: 1, reason: 'yakuhai' });
  });

  it('flags a visible one-suit lean', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p' },
        {
          hand: '233445566s',
          melds: [{ type: 'pon', tiles: '111s' }],
          discards: '5p6p7p8p9p',
        },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    const threats = threatSeats(round, 0);
    expect(threats).toHaveLength(1);
    expect(threats[0]).toMatchObject({ seat: 1, reason: 'flush' });
  });

  it('ignores quiet closed opponents', () => {
    const round = buildRound({
      seats: [
        { hand: '123456789m1234p' },
        { hand: '', discards: '5p6p7p' },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    expect(threatSeats(round, 0)).toEqual([]);
  });
});

describe('safety — safestDiscard', () => {
  it('prefers genbutsu over every other read', () => {
    const round = buildRound({
      seats: [
        { hand: '19m19p19s1234567z' },
        { hand: '', discards: '1z', riichi: true },
        IDLE,
        IDLE,
      ],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    const chosen = safestDiscard(round.players[0].hand, threatSeats(round, 0), round, 0);
    expect(kindOf(chosen)).toBe(tileKind('1z'));
  });
});

// ---------------------------------------------------------------------------
// heuristicAI — wins
// ---------------------------------------------------------------------------

describe('heuristic AI — taking wins', () => {
  it('takes an available tsumo', () => {
    const round = buildRound({
      seats: [{ hand: '234456m234567p55s', drawn: true }, IDLE, IDLE, IDLE],
      doraIndicators: '9m',
      turn: 0,
      phase: 'discard',
    });
    expect(chooseAction(round, 0, 'medium', rng()).type).toBe('tsumo');
  });

  it('takes an available ron', () => {
    const round = buildRound({
      seats: [
        { hand: '234567m23445p55s' },
        { hand: '', discards: '6p' },
        IDLE,
        IDLE,
      ],
      doraIndicators: '9m',
      pending: { seat: 1 },
    });
    expect(chooseAction(round, 0, 'medium', rng()).type).toBe('ron');
  });
});

// ---------------------------------------------------------------------------
// heuristicAI — push and fold
// ---------------------------------------------------------------------------

/**
 * Seat 1 riichi (declaration tile 5s). Seat 0 is 2-shanten and holds the 5s in
 * a block it would never break while pushing, so folding and pushing pick
 * visibly different tiles.
 */
function foldRound(): RoundState {
  return buildRound({
    seats: [
      { hand: '2349m1299p45s1357z', drawn: true },
      { hand: '', discards: '5s3p', riichi: true },
      IDLE,
      IDLE,
    ],
    doraIndicators: '9m',
    turn: 0,
    phase: 'discard',
  });
}

describe('heuristic AI — push and fold', () => {
  it('discards genbutsu against a lone riichi when folding', () => {
    const action = asDiscard(chooseAction(foldRound(), 0, 'medium', rng()));
    expect(kindOf(action.tile)).toBe(tileKind('5s'));
    expect(action.riichi).not.toBe(true);
  });

  it('does not fold with a good tenpai — it pushes and declares riichi', () => {
    const round = buildRound({
      seats: [
        { hand: '234567p3455s2349m', drawn: true },
        { hand: '', discards: '2m3s', riichi: true },
        IDLE,
        IDLE,
      ],
      doraIndicators: '9p',
      turn: 0,
      phase: 'discard',
    });
    const action = asDiscard(chooseAction(round, 0, 'medium', rng()));
    expect(kindOf(action.tile)).toBe(tileKind('9m'));
    expect(action.riichi).toBe(true);
  });

  it('stays damaten on a cheap narrow wait that is one draw from widening', () => {
    // 234m 567m 234p 99s + a 46s kanchan. Two 5s are already on the table, so
    // the wait is two tiles; the hand is worth nothing; and a 3s or 7s turns
    // the kanchan into a ryanmen. All three damaten conditions hold.
    const round = buildRound({
      seats: [
        { hand: '234567m234p4699s1z', drawn: true },
        IDLE,
        { hand: '', discards: '5s5s' },
        IDLE,
      ],
      doraIndicators: '1z',
      turn: 0,
      phase: 'discard',
    });
    const legal = legalActions(round, 0);
    expect(legal.some((action) => action.type === 'discard' && action.riichi === true)).toBe(
      true,
    );
    const action = asDiscard(chooseAction(round, 0, 'medium', rng()));
    expect(kindOf(action.tile)).toBe(tileKind('1z'));
    expect(action.riichi).not.toBe(true);
  });

  it('declares riichi on the same shape once the wait is live', () => {
    const round = buildRound({
      seats: [{ hand: '234567m234p4699s1z', drawn: true }, IDLE, IDLE, IDLE],
      doraIndicators: '1z',
      turn: 0,
      phase: 'discard',
    });
    const action = asDiscard(chooseAction(round, 0, 'medium', rng()));
    expect(kindOf(action.tile)).toBe(tileKind('1z'));
    expect(action.riichi).toBe(true);
  });

  it('shouldFold is threshold-driven: 2+ shanten folds, 1-shanten pushes', () => {
    const threats = [{ seat: 1 as Seat, reason: 'riichi' as const, weight: 1 }];
    expect(shouldFold(threats, 2, 5, 0)).toBe(true);
    expect(shouldFold(threats, 1, 0, 0)).toBe(false);
    expect(shouldFold(threats, 0, 1, 2)).toBe(true);
    expect(shouldFold(threats, 0, 1, 8)).toBe(false);
    expect(shouldFold([], 4, 0, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// heuristicAI — difficulty
// ---------------------------------------------------------------------------

describe('heuristic AI — difficulty', () => {
  it('easy ignores danger while medium folds to it', () => {
    const medium = asDiscard(chooseAction(foldRound(), 0, 'medium', rng()));
    const easy = asDiscard(chooseAction(foldRound(), 0, 'easy', rng()));
    expect(kindOf(medium.tile)).toBe(tileKind('5s'));
    // `easy` never leaves the shortlist of shanten-preserving discards, and
    // breaking the 45s block is not on it.
    expect(kindOf(easy.tile)).not.toBe(tileKind('5s'));
  });

  it('routes hard, expert and master through the same policy', () => {
    const hard = chooseAction(foldRound(), 0, 'hard', rng());
    expect(chooseAction(foldRound(), 0, 'expert', rng())).toEqual(hard);
    expect(chooseAction(foldRound(), 0, 'master', rng())).toEqual(hard);
  });
});

// ---------------------------------------------------------------------------
// heuristicAI — calls
// ---------------------------------------------------------------------------

describe('heuristic AI — calls', () => {
  it('pons a yakuhai that completes a yaku path', () => {
    const round = buildRound({
      seats: [
        // 234m 567m + a 5z pair + 45p + 66s + a floating 9m: ponning the
        // dragon leaves 66s as the head, so it really does gain a step.
        { hand: '234567m9m55z45p66s' },
        { hand: '', discards: '5z' },
        IDLE,
        IDLE,
      ],
      doraIndicators: '9p',
      pending: { seat: 1 },
    });
    expect(chooseAction(round, 0, 'medium', rng()).type).toBe('pon');
  });

  it('declines a call that would leave the hand yakuless', () => {
    const round = buildRound({
      seats: [
        { hand: '123m99p45p789s13s1z' },
        { hand: '', discards: '9p' },
        IDLE,
        IDLE,
      ],
      doraIndicators: '9m',
      pending: { seat: 1 },
    });
    expect(legalActions(round, 0).some((action) => action.type === 'pon')).toBe(true);
    expect(chooseAction(round, 0, 'medium', rng()).type).toBe('pass');
  });

  it('does not open a closed hand that is already close to tenpai', () => {
    const round = buildRound({
      seats: [
        { hand: '234m567m123p55z45s' },
        { hand: '', discards: '5z' },
        IDLE,
        IDLE,
      ],
      doraIndicators: '9p',
      pending: { seat: 1 },
    });
    expect(legalActions(round, 0).some((action) => action.type === 'pon')).toBe(true);
    expect(chooseAction(round, 0, 'medium', rng()).type).toBe('pass');
  });

  it('hasOpenYakuPath accepts yakuhai and all-simples and rejects mixed junk', () => {
    const round = buildRound({
      seats: [{ hand: '123456789m1234p' }, IDLE, IDLE, IDLE],
      doraIndicators: '9s',
      turn: 0,
      phase: 'discard',
    });
    expect(hasOpenYakuPath(round, 0, countsOf('555z234m'), [])).toBe(true);
    expect(hasOpenYakuPath(round, 0, countsOf('234m567p'), [])).toBe(true);
    expect(hasOpenYakuPath(round, 0, countsOf('123m789p45s1z'), [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// heuristicAI — tile value
// ---------------------------------------------------------------------------

describe('heuristic AI — tile value', () => {
  it('keeps a dora pair over an equal-acceptance non-dora pair', () => {
    // Four symmetric honour pairs behind two finished runs; the 1z indicator
    // makes 2z the dora. Breaking a run costs a whole block, so the real
    // choice is which honour pair to let go of, and the four are identical
    // apart from the dora.
    const round = buildRound({
      seats: [{ hand: '123m123p22334455z', drawn: true }, IDLE, IDLE, IDLE],
      doraIndicators: '1z',
      turn: 0,
      phase: 'discard',
    });
    const action = asDiscard(chooseAction(round, 0, 'medium', rng()));
    expect(kindOf(action.tile)).toBeGreaterThanOrEqual(tileKind('1z'));
    expect(kindOf(action.tile)).not.toBe(tileKind('2z'));
  });

  it('estimateHan credits dora, red fives, yakuhai and menzen', () => {
    const round = buildRound({
      seats: [{ hand: '234m099p55577z234s', drawn: true }, IDLE, IDLE, IDLE],
      doraIndicators: '1m',
      turn: 0,
      phase: 'discard',
    });
    // 2m dora (1) + red 5p (1) + haku triplet (1) + menzen (1).
    expect(estimateHan(round, 0, createSafetyContext(round, 0))).toBeGreaterThanOrEqual(4);
  });
});

// ---------------------------------------------------------------------------
// Worker plumbing
// ---------------------------------------------------------------------------

describe('worker plumbing', () => {
  it('handleRequest answers with the action chooseAction would', () => {
    const direct = chooseAction(foldRound(), 0, 'medium', createRng(7));
    const response = handleRequest({
      requestId: 42,
      state: foldRound(),
      seat: 0,
      difficulty: 'medium',
      seed: 7,
    });
    expect(response.requestId).toBe(42);
    expect(response.action).toEqual(direct);
  });

  it('handleRequest reports an error instead of throwing', () => {
    // Seat 2 has nothing to do while seat 0 holds the tiles.
    const response = handleRequest({
      requestId: 1,
      state: foldRound(),
      seat: 2,
      difficulty: 'medium',
      seed: 1,
    });
    expect(response.action).toBeUndefined();
    expect(response.error).toMatch(/no legal action/);
  });

  it('chooseActionSync is the in-process fallback path', () => {
    const action = chooseActionSync({
      state: foldRound(),
      seat: 0,
      difficulty: 'medium',
      seed: 1,
    });
    expect(kindOf(asDiscard(action).tile)).toBe(tileKind('5s'));
  });
});

// ---------------------------------------------------------------------------
// Whole-game properties
// ---------------------------------------------------------------------------

interface PlayResult {
  actions: string[];
  positions: number;
  totalMs: number;
}

/** Play `games` seeded tonpuu games with every seat driven by the AI. */
function playGames(
  seed: number,
  difficulty: 'easy' | 'medium' | 'hard',
  games: number,
  check?: (state: RoundState, seat: Seat, action: Action) => void,
): PlayResult {
  const stream = createRng(seed);
  const actions: string[] = [];
  let positions = 0;
  let totalMs = 0;

  for (let index = 0; index < games; index += 1) {
    let game = startGame({ rules: DEFAULT_RULES, rng: stream });
    let hands = 0;
    while (!game.finished && hands < 20) {
      const round = game.round;
      if (round === null) throw new Error('game has no round to play');
      let plies = 0;
      while (round.phase !== 'ended' && plies < 2000) {
        plies += 1;
        const actors = currentActors(round);
        if (actors.length === 0) throw new Error('no actor to move');
        const seat = actors[stream.nextInt(actors.length)];
        const started = performance.now();
        const action = chooseAction(round, seat, difficulty, createRng(stream.next()));
        totalMs += performance.now() - started;
        positions += 1;
        check?.(round, seat, action);
        actions.push(`${seat}:${JSON.stringify(action)}`);
        applyAction(round, action);
      }
      hands += 1;
      game = advanceHand(game, stream);
    }
  }
  return { actions, positions, totalMs };
}

describe('heuristic AI — whole-game properties', () => {
  it('never returns an illegal action across a few hundred fuzzed positions', () => {
    let checked = 0;
    const result = playGames(2024, 'medium', 6, (state, seat, action) => {
      expect(action.seat).toBe(seat);
      expect(isLegalAction(state, action)).toBe(true);
      checked += 1;
    });
    expect(checked).toBe(result.positions);
    expect(result.positions).toBeGreaterThan(300);
  });

  it('never returns an illegal action on the easy policy either', () => {
    const result = playGames(99, 'easy', 4, (state, _seat, action) => {
      expect(isLegalAction(state, action)).toBe(true);
    });
    expect(result.positions).toBeGreaterThan(200);
  });

  it('produces identical play from identical seeds', () => {
    const first = playGames(4242, 'easy', 3);
    const second = playGames(4242, 'easy', 3);
    expect(first.actions.length).toBeGreaterThan(150);
    expect(second.actions).toEqual(first.actions);
  });

  it('produces different play from different seeds on the easy policy', () => {
    expect(playGames(777, 'easy', 2).actions).not.toEqual(
      playGames(4242, 'easy', 2).actions,
    );
  });

  it('averages under 2 ms per decision', () => {
    // Warm the shanten decomposition cache: the first decisions of a process
    // pay for every suit profile they touch.
    playGames(5, 'medium', 1);
    const result = playGames(11, 'medium', 4);
    expect(result.positions).toBeGreaterThan(200);
    expect(result.totalMs / result.positions).toBeLessThan(2);
  });

  it('throws rather than inventing a move when the seat cannot act', () => {
    expect(() => chooseAction(foldRound(), 3, 'medium', rng())).toThrow(/no legal action/);
  });
});

describe('worker restart budget', () => {
  class ExplodingWorker {
    static built = 0;

    onmessage: ((event: MessageEvent) => void) | null = null;

    onerror: (() => void) | null = null;

    constructor() {
      ExplodingWorker.built += 1;
    }

    postMessage(): void {
      // Every worker dies on its first message, exercising the rebuild budget.
      this.onerror?.();
    }

    terminate(): void {}
  }

  it('rebuilds MAX_WORKER_RESTARTS times before settling on the fallback', async () => {
    const original = (globalThis as { Worker?: unknown }).Worker;
    ExplodingWorker.built = 0;
    (globalThis as { Worker?: unknown }).Worker = ExplodingWorker;
    try {
      const client = createMahjongAiClient();
      const state = startRound({
        rules: DEFAULT_RULES,
        roundWind: 0,
        dealer: 0,
        honba: 0,
        riichiSticks: 0,
        scores: [25000, 25000, 25000, 25000],
        rng: createRng('worker-budget'),
      });

      // One more request than the budget allows: each failing request spends
      // one rebuild, and every one of them still returns a legal action from
      // the in-process fallback.
      for (let i = 0; i <= MAX_WORKER_RESTARTS + 1; i += 1) {
        const action = await client.requestAction({
          state,
          seat: state.turn,
          difficulty: 'medium',
          seed: 'worker-budget',
        });
        expect(action).toBeDefined();
      }

      // Initial construction plus one rebuild per failure inside the budget.
      expect(ExplodingWorker.built).toBe(MAX_WORKER_RESTARTS + 1);
      expect(client.usingWorker()).toBe(false);
      client.terminate();
    } finally {
      if (original === undefined) delete (globalThis as { Worker?: unknown }).Worker;
      else (globalThis as { Worker?: unknown }).Worker = original;
    }
  });
});
