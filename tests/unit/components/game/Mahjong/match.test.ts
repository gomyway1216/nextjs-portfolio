/**
 * M7 — the duplicate-wall A/B harness (`scripts/mahjong-ai-match.ts`) and the
 * EV tables it produced.
 *
 * Four things are worth a test here, and they are the four things a wrong
 * answer would be invisible in:
 *
 * 1. **The wall really is duplicated.** Every rotation of a set has to see the
 *    same shuffle and the same deal, whatever the arms do to each other, or
 *    the pairing is decoration.
 * 2. **A run is reproducible.** A seed has to replay a whole match exactly, or
 *    a result cannot be re-derived by anyone reading the JSON.
 * 3. **The statistic is right.** The t-tests are hand-rolled (no dependency is
 *    added for them), so they are checked against closed forms with exactly
 *    known answers rather than against themselves.
 * 4. **An arm playing itself shows no difference.** In this design that is
 *    provable rather than merely probable — see the A-vs-A block.
 *
 * Budget: the whole file plays 24 tonpuu games, about four seconds. The long
 * runs live in the script; a shared CI runner is not the place for them.
 */

import { describe, expect, it } from 'vitest';

import {
  GAMES_PER_SET,
  incompleteBeta,
  mean,
  pairedTTest,
  perGameContrast,
  playSet,
  resolveArm,
  runMatch,
  setSeed,
  studentTwoSidedP,
  summarize,
  variance,
  welchTTest,
  type SetRecord,
} from '../../../../../scripts/mahjong-ai-match';
import {
  BASELINE_DEAL_IN_PROBABILITY,
  DEAL_IN_PROBABILITY_BY_DANGER,
  EV_TABLE_PROVENANCE,
  WIN_PROBABILITY_BY_TURN_SHANTEN,
  dealInProbability,
  evaluatePush,
  expectedDealInCost,
  expectedWinValue,
  winProbability,
} from '@/components/game/Mahjong/ai/evTables';
import {
  chooseActionWithPolicy,
  policyFor,
} from '@/components/game/Mahjong/ai/heuristicAI';
import type { ThreatInfo } from '@/components/game/Mahjong/ai/safety';
import {
  applyAction,
  currentActors,
  startRound,
} from '@/components/game/Mahjong/engine/gameState';
import { createRng } from '@/components/game/Mahjong/engine/random';
import { DEFAULT_RULES } from '@/components/game/Mahjong/engine/rules';
import type { Difficulty } from '@/components/game/common/types';
import { chooseActionSync } from '@/components/game/Mahjong/mahjongAiWorkerClient';

const MEDIUM = resolveArm('medium');
const HARD_EV = resolveArm('hard-ev');

/** Everything about a set record that must not depend on wall-clock timing. */
function stripTiming(record: SetRecord): unknown {
  const clean = (stats: SetRecord['statsA']) => {
    const { decisionMs: _ignored, ...rest } = stats;
    return rest;
  };
  return {
    ...record,
    statsA: clean(record.statsA),
    statsB: clean(record.statsB),
  };
}

// ---------------------------------------------------------------------------
// 1. The duplicate wall
// ---------------------------------------------------------------------------

describe('duplicate wall', () => {
  it('deals the identical wall and hands in all four seat rotations', () => {
    // Deliberately two *different* arms: if the wall stream were entangled with
    // the decision stream, divergent play would show up as divergent walls.
    const walls: string[][] = [[], [], [], []];
    const hands: string[][] = [[], [], [], []];
    const dealers: number[][] = [[], [], [], []];

    playSet({
      a: HARD_EV,
      b: MEDIUM,
      rules: DEFAULT_RULES,
      seed: setSeed('wall-test', 0),
      aaSalt: '',
      observe: (round, handOrdinal, rotation) => {
        walls[rotation][handOrdinal] = round.wall.tiles.join(',');
        dealers[rotation][handOrdinal] = round.dealer;
        hands[rotation][handOrdinal] = round.players
          .map((player) => [...player.hand].sort((x, y) => x - y).join('.'))
          .join('|');
      },
    });

    // Every rotation reached at least the first hand, and rotation 0 is the
    // reference the other three are compared against.
    expect(walls[0].length).toBeGreaterThan(0);
    let comparedHands = 0;
    for (let rotation = 1; rotation < GAMES_PER_SET; rotation += 1) {
      const shared = Math.min(walls[0].length, walls[rotation].length);
      expect(shared).toBeGreaterThan(0);
      for (let hand = 0; hand < shared; hand += 1) {
        // The wall is a pure function of (seed, hand ordinal): identical in
        // every rotation however far the play has diverged by then.
        expect(walls[rotation][hand]).toBe(walls[0][hand]);
        // The deal is by absolute seat, so the thirteen concealed tiles match
        // unconditionally; the fourteenth is the dealer's first draw, and the
        // dealer legitimately differs once the rotations have settled
        // different hands. Compare the full deal whenever the dealer agrees,
        // which the first hand of the game always does.
        if (dealers[rotation][hand] === dealers[0][hand]) {
          expect(hands[rotation][hand]).toBe(hands[0][hand]);
          comparedHands += 1;
        }
      }
      expect(dealers[rotation][0]).toBe(dealers[0][0]);
      expect(hands[rotation][0]).toBe(hands[0][0]);
    }
    expect(comparedHands).toBeGreaterThanOrEqual(3);

    // …and the wall really is the full 136-tile order, so "identical wall"
    // means identical draw order and not merely identical opening hands.
    expect(walls[0][0].split(',')).toHaveLength(136);
  });

  it('gives different seeds different walls', () => {
    const wallOf = (seed: string): string => {
      let first = '';
      playSet({
        a: MEDIUM,
        b: MEDIUM,
        rules: DEFAULT_RULES,
        seed,
        aaSalt: '',
        observe: (round, handOrdinal, rotation) => {
          if (handOrdinal === 0 && rotation === 0) first = round.wall.tiles.join(',');
        },
      });
      return first;
    };
    expect(wallOf(setSeed('wall-test', 1))).not.toBe(wallOf(setSeed('wall-test', 2)));
  });
});

// ---------------------------------------------------------------------------
// 2. Reproducibility
// ---------------------------------------------------------------------------

describe('reproducibility', () => {
  it('replays a whole match byte-for-byte from the seed', () => {
    const options = {
      a: HARD_EV,
      b: MEDIUM,
      sets: 2,
      seed: 'replay',
      length: 'tonpuu' as const,
      aaSalt: '',
    };
    const first = runMatch(options);
    const second = runMatch(options);

    expect(second.records.map(stripTiming)).toEqual(first.records.map(stripTiming));
    expect(second.paired.estimate).toBe(first.paired.estimate);
    expect(second.paired.p).toBe(first.paired.p);
    expect(second.metrics.a.averagePlacement).toBe(first.metrics.a.averagePlacement);
    expect(second.hands).toBe(first.hands);
  });

  it('drives the arms through the same entry point the game uses', () => {
    // The harness reaches ad-hoc policies through `chooseActionWithPolicy`
    // because the worker RPC only carries a `Difficulty`. That shortcut is only
    // legitimate if the two entry points agree, so: play a whole hand and
    // assert they agree on every decision of it.
    const difficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    for (const difficulty of difficulties) {
      const round = startRound({
        rules: DEFAULT_RULES,
        roundWind: 0,
        dealer: 0,
        honba: 0,
        riichiSticks: 0,
        scores: [25000, 25000, 25000, 25000],
        rng: createRng(`entry-${difficulty}`),
      });

      let ply = 0;
      while (round.phase !== 'ended' && ply < 400) {
        ply += 1;
        const seat = currentActors(round)[0];
        const seed = `entry-${difficulty}|${ply}`;
        const viaClient = chooseActionSync({ state: round, seat, difficulty, seed });
        const viaPolicy = chooseActionWithPolicy(
          round,
          seat,
          policyFor(difficulty),
          createRng(seed),
        );
        expect(viaPolicy).toEqual(viaClient);
        applyAction(round, viaClient);
      }
      expect(ply).toBeGreaterThan(10);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The statistic
// ---------------------------------------------------------------------------

describe('paired statistics', () => {
  it('computes the mean and the Bessel-corrected variance', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(variance([1, 2, 3, 4])).toBeCloseTo(5 / 3, 12);
    expect(variance([7])).toBe(0);
  });

  it('matches the closed form of the two-sided p-value at df = 1', () => {
    // For df = 1 the t distribution is Cauchy, so P(|T| > t) = 1 - (2/pi) atan t.
    for (const t of [0.25, 0.5, 1, 2.5, 10]) {
      const expected = 1 - (2 / Math.PI) * Math.atan(t);
      expect(studentTwoSidedP(t, 1)).toBeCloseTo(expected, 10);
      expect(studentTwoSidedP(-t, 1)).toBeCloseTo(expected, 10);
    }
  });

  it('matches the closed form of the two-sided p-value at df = 2', () => {
    // For df = 2, P(|T| > t) = 1 - t / sqrt(t^2 + 2), exactly.
    for (const t of [0.5, 2 * Math.sqrt(3), 4]) {
      const expected = 1 - t / Math.sqrt(t * t + 2);
      expect(studentTwoSidedP(t, 2)).toBeCloseTo(expected, 12);
    }
  });

  it('has the incomplete beta identities', () => {
    expect(incompleteBeta(3, 3, 0.5)).toBeCloseTo(0.5, 12);
    expect(incompleteBeta(2.5, 4, 0.3)).toBeCloseTo(1 - incompleteBeta(4, 2.5, 0.7), 12);
    expect(incompleteBeta(1, 1, 0.42)).toBeCloseTo(0.42, 12);
  });

  it('gives the known answer for a hand-computable paired sample', () => {
    // differences [1, 2, 3]: mean 2, sd 1, se 1/sqrt(3), t = 2*sqrt(3), df = 2.
    // The df = 2 closed form puts the two-sided p at 0.0741799002…
    const test = pairedTTest([1, 2, 3]);
    expect(test.estimate).toBeCloseTo(2, 12);
    expect(test.standardError).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(test.t).toBeCloseTo(2 * Math.sqrt(3), 12);
    expect(test.df).toBe(2);
    expect(test.p).toBeCloseTo(0.0741799002, 9);
  });

  it('reports p = 1 for a sample with no spread and no effect', () => {
    const test = pairedTTest([0, 0, 0, 0, 0]);
    expect(test.estimate).toBe(0);
    expect(test.standardError).toBe(0);
    expect(test.p).toBe(1);
  });

  it('gives the known answer for a hand-computable Welch sample', () => {
    // [1,2,3,4] vs [3,4,5,6]: equal n and equal variance, so Welch's df is
    // exactly 6 and t is -2/sqrt(5/6). The two-sided p at df = 6 is
    // 0.0709876543…, confirmed by direct numerical integration of the density.
    const test = welchTTest([1, 2, 3, 4], [3, 4, 5, 6]);
    expect(test.estimate).toBeCloseTo(-2, 12);
    expect(test.df).toBeCloseTo(6, 10);
    expect(test.t).toBeCloseTo(-2 / Math.sqrt(5 / 6), 10);
    expect(test.p).toBeCloseTo(0.0709876543, 9);
  });

  it('reproduces the paired estimate from the per-game contrast', () => {
    // The blocked and the unblocked analyses must share a point estimate, or
    // the reported variance reduction compares two different quantities.
    for (const places of [
      [1, 4, 2, 2],
      [1, 2, 3, 4],
      [4, 4, 4, 4],
    ]) {
      const total = places.reduce((x, y) => x + y, 0);
      const meanA = total / places.length;
      // Each game's four places sum to 10, so B holds 40 - total over 12 seats.
      const meanB = (10 * places.length - total) / (3 * places.length);
      expect(mean(places.map(perGameContrast))).toBeCloseTo(meanA - meanB, 12);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. A versus A
// ---------------------------------------------------------------------------

describe('an arm playing itself', () => {
  /**
   * With the same deterministic policy in all four seats, the four games of a
   * set are one game with the seats relabelled: same wall, same decisions. So
   * the A arm collects places {1, 2, 3, 4} exactly and the paired difference is
   * exactly zero — not "not significant", zero.
   *
   * That makes the A-vs-A control a *deterministic* test rather than a
   * statistical one, which is why three sets settle it here and why the
   * meaningful statistical null (a stochastic policy with the A arm's decision
   * stream salted, 300 sets) is run from the script and recorded in
   * `docs/mahjong-ai-strengthening-log-2026-08.md` instead.
   */
  it('is exactly balanced on every set', () => {
    const records: SetRecord[] = [];
    for (let index = 0; index < 3; index += 1) {
      const record = playSet({
        a: MEDIUM,
        b: MEDIUM,
        rules: DEFAULT_RULES,
        seed: setSeed('aa', index),
        aaSalt: '',
      });
      records.push(record);
      expect([...record.placesA].sort()).toEqual([1, 2, 3, 4]);
      expect(record.meanA).toBe(2.5);
      expect(record.meanB).toBe(2.5);
      expect(record.diff).toBe(0);
      // The four rotations really are the same game: identical hand counts and
      // identical per-seat accounting across arms.
      expect(record.statsA.hands * 3).toBe(record.statsB.hands);
      expect(record.statsA.wins * 3).toBe(record.statsB.wins);
      expect(record.statsA.dealIns * 3).toBe(record.statsB.dealIns);
    }

    const result = summarize(
      {
        a: MEDIUM,
        b: MEDIUM,
        sets: records.length,
        seed: 'aa',
        length: 'tonpuu',
        aaSalt: '',
      },
      records,
      1,
    );
    expect(result.paired.estimate).toBe(0);
    expect(result.paired.p).toBe(1);
    expect(result.gate.met).toBe(false);
    expect(result.metrics.a.averagePlacement).toBe(2.5);
    expect(result.metrics.b.averagePlacement).toBe(2.5);
  });
});

// ---------------------------------------------------------------------------
// 5. The EV tables
// ---------------------------------------------------------------------------

describe('EV tables', () => {
  const riichi: ThreatInfo[] = [{ seat: 1, reason: 'riichi', weight: 1 }];

  it('records where it came from', () => {
    expect(EV_TABLE_PROVENANCE.hands).toBe(11179);
    expect(EV_TABLE_PROVENANCE.seed).toBe('99');
    expect(EV_TABLE_PROVENANCE.source).toBe('docs/data/mahjong-ev-tables-v1-source.json');
  });

  it('is monotone in turn and in shanten', () => {
    for (let turn = 0; turn < WIN_PROBABILITY_BY_TURN_SHANTEN.length; turn += 1) {
      const row = WIN_PROBABILITY_BY_TURN_SHANTEN[turn];
      for (let s = 1; s < row.length; s += 1) expect(row[s]).toBeLessThanOrEqual(row[s - 1]);
      if (turn === 0) continue;
      const previous = WIN_PROBABILITY_BY_TURN_SHANTEN[turn - 1];
      for (let s = 0; s < row.length; s += 1) expect(row[s]).toBeLessThanOrEqual(previous[s]);
    }
    for (let band = 1; band < DEAL_IN_PROBABILITY_BY_DANGER.length; band += 1) {
      expect(DEAL_IN_PROBABILITY_BY_DANGER[band]).toBeGreaterThanOrEqual(
        DEAL_IN_PROBABILITY_BY_DANGER[band - 1],
      );
    }
  });

  it('clamps out-of-range lookups instead of returning undefined', () => {
    expect(winProbability(99, 99)).toBe(winProbability(17, 6));
    expect(winProbability(-1, -0)).toBe(winProbability(0, 0));
    expect(winProbability(3, -1)).toBe(1);
    expect(dealInProbability(99)).toBe(dealInProbability(12));
    expect(expectedWinValue(99)).toBe(expectedWinValue(13));
    expect(expectedDealInCost([])).toBeGreaterThan(0);
    expect(expectedDealInCost(riichi)).toBe(6000);
  });

  it('pushes a valuable tenpai on a safe tile and folds a far cheap hand', () => {
    const tenpaiOnGenbutsu = evaluatePush({
      turn: 5,
      handShanten: 0,
      estimatedHan: 4,
      danger: 0,
      threats: riichi,
    });
    expect(tenpaiOnGenbutsu.push).toBe(true);

    const farAndCheap = evaluatePush({
      turn: 5,
      handShanten: 3,
      estimatedHan: 1,
      danger: 9,
      threats: riichi,
    });
    expect(farAndCheap.push).toBe(false);
  });

  it('reads the danger of the tile it is actually about to throw', () => {
    // The whole point of the EV rule over the threshold rule: same hand, same
    // turn, same value — only the tile differs, and the answer flips.
    const inputs = { turn: 6, handShanten: 1, estimatedHan: 2, threats: riichi };
    expect(evaluatePush({ ...inputs, danger: 0 }).push).toBe(true);
    expect(evaluatePush({ ...inputs, danger: 12 }).push).toBe(false);
  });

  it('charges later discards at the baseline rate, not at this tile danger', () => {
    // Guards the modelling choice documented in evTables.ts: charging the whole
    // horizon at the current tile's band folded almost every tenpai hand.
    const late = evaluatePush({
      turn: 15,
      handShanten: 0,
      estimatedHan: 2,
      danger: 6,
      threats: riichi,
    });
    const early = evaluatePush({
      turn: 3,
      handShanten: 0,
      estimatedHan: 2,
      danger: 6,
      threats: riichi,
    });
    expect(late.foldRisk).toBeLessThan(early.foldRisk);
    expect(BASELINE_DEAL_IN_PROBABILITY).toBeGreaterThan(0);
    expect(BASELINE_DEAL_IN_PROBABILITY).toBeLessThan(DEAL_IN_PROBABILITY_BY_DANGER[6]);
  });
});
