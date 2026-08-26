import { describe, expect, it } from 'vitest';

import {
  SHANTEN_UNREACHABLE,
  chiitoitsuShanten,
  isComplete,
  isTenpai,
  kokushiShanten,
  shanten,
  shantenBreakdown,
  standardShanten,
  waits,
} from '@/components/game/Mahjong/engine/shanten';
import {
  addVisible,
  bestDiscards,
  emptyVisible,
  ukeire,
} from '@/components/game/Mahjong/engine/ukeire';
import { formatKinds, parseCounts, parseKinds } from '@/components/game/Mahjong/engine/tiles';
import { TILE_KIND_COUNT, type TileCounts } from '@/components/game/Mahjong/engine/types';

import { isWinningShape, referenceStandardShanten } from './shantenReference';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** mulberry32: a tiny, fully deterministic PRNG so failures are reproducible. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random histogram of `size` tiles, never more than four of any kind. */
function randomHand(rng: () => number, size: number): TileCounts {
  const counts = new Uint8Array(TILE_KIND_COUNT);
  let placed = 0;
  while (placed < size) {
    const kind = Math.floor(rng() * TILE_KIND_COUNT);
    if (counts[kind] >= 4) continue;
    counts[kind] += 1;
    placed += 1;
  }
  return counts;
}

/** Everything the player can see when only their own hand is on the table. */
function visibleFromHand(counts: TileCounts): TileCounts {
  const visible = emptyVisible();
  for (let kind = 0; kind < TILE_KIND_COUNT; kind += 1) {
    if (counts[kind] > 0) addVisible(visible, kind, counts[kind]);
  }
  return visible;
}

function waitString(notation: string, meldCount = 0): string {
  return formatKinds(waits(parseCounts(notation), meldCount));
}

// ---------------------------------------------------------------------------
// Reference cross-check
// ---------------------------------------------------------------------------

describe('standardShanten vs the brute-force reference', () => {
  it('matches on 10,000 random hands across every hand size and meld count', () => {
    const rng = makeRng(0x5eed1234);
    const mismatches: string[] = [];
    let checked = 0;

    for (let i = 0; i < 10000; i += 1) {
      const meldCount = i % 5;
      const extra = i % 2; // alternate 13-tile and 14-tile hands
      const size = 13 + extra - 3 * meldCount;
      const counts = randomHand(rng, size);
      const fast = standardShanten(counts, meldCount);
      const slow = referenceStandardShanten(counts, meldCount);
      checked += 1;
      if (fast !== slow) {
        mismatches.push(
          `${formatKinds(Array.from(counts).flatMap((n, k) => Array.from({ length: n }, () => k)))}`
            + ` melds=${meldCount} fast=${fast} slow=${slow}`,
        );
        if (mismatches.length >= 5) break;
      }
    }

    expect(checked).toBe(10000);
    expect(mismatches).toEqual([]);
  });

  it('agrees with the reference on structured hands built from real blocks', () => {
    const rng = makeRng(0xc0ffee);
    const blocks = [
      '123m', '456m', '789m', '111m', '999m', '13m', '12m', '89m', '55m',
      '234p', '567p', '345p', '222p', '78p', '24p', '11p', '99p',
      '345s', '678s', '789s', '333s', '67s', '35s', '22s', '88s',
      '11z', '22z', '333z', '55z', '77z', '4z', '6z',
    ];

    for (let i = 0; i < 2000; i += 1) {
      const meldCount = i % 5;
      const size = 13 + (i % 2) - 3 * meldCount;
      const counts = new Uint8Array(TILE_KIND_COUNT);
      let placed = 0;
      let guard = 0;
      while (placed < size && guard < 200) {
        guard += 1;
        const kinds = parseKinds(blocks[Math.floor(rng() * blocks.length)]);
        if (placed + kinds.length > size) continue;
        const wanted = new Uint8Array(TILE_KIND_COUNT);
        for (const kind of kinds) wanted[kind] += 1;
        if (kinds.some((kind) => counts[kind] + wanted[kind] > 4)) continue;
        for (const kind of kinds) counts[kind] += 1;
        placed += kinds.length;
      }
      while (placed < size) {
        const kind = Math.floor(rng() * TILE_KIND_COUNT);
        if (counts[kind] >= 4) continue;
        counts[kind] += 1;
        placed += 1;
      }
      expect(standardShanten(counts, meldCount)).toBe(referenceStandardShanten(counts, meldCount));
    }
  });
});

// ---------------------------------------------------------------------------
// The definition of shanten, anchored on an independent winning-shape check
// ---------------------------------------------------------------------------

describe('shanten matches its definition', () => {
  it('is 0 exactly when one tile away from a standard winning shape', () => {
    const rng = makeRng(0xabcdef);
    for (let i = 0; i < 800; i += 1) {
      const counts = randomHand(rng, 13);
      const value = standardShanten(counts, 0);
      let oneAway = false;
      for (let kind = 0; kind < TILE_KIND_COUNT && !oneAway; kind += 1) {
        if (counts[kind] >= 4) continue;
        counts[kind] += 1;
        oneAway = isWinningShape(counts, 0);
        counts[kind] -= 1;
      }
      expect(value === 0).toBe(oneAway);
    }
  });

  it('drops by exactly one for the best draw-and-discard exchange', () => {
    const rng = makeRng(0x13579b);
    for (let i = 0; i < 300; i += 1) {
      const counts = randomHand(rng, 13);
      const value = standardShanten(counts, 0);
      if (value <= 0) continue;

      let bestNext = Number.POSITIVE_INFINITY;
      for (let draw = 0; draw < TILE_KIND_COUNT; draw += 1) {
        if (counts[draw] >= 4) continue;
        counts[draw] += 1;
        for (let discard = 0; discard < TILE_KIND_COUNT; discard += 1) {
          if (counts[discard] === 0) continue;
          counts[discard] -= 1;
          const next = standardShanten(counts, 0);
          if (next < bestNext) bestNext = next;
          counts[discard] += 1;
        }
        counts[draw] -= 1;
      }
      expect(bestNext).toBe(value - 1);
    }
  });
});

// ---------------------------------------------------------------------------
// Known values
// ---------------------------------------------------------------------------

describe('known shanten values', () => {
  it('reports -1 for complete hands', () => {
    expect(shanten(parseCounts('123m456m789m123p11s'))).toBe(-1);
    expect(isComplete(parseCounts('123m456m789m123p11s'), 0)).toBe(true);
    // Four sets of triplets plus a pair.
    expect(shanten(parseCounts('111m999m111p999p11z'))).toBe(-1);
    // Chuuren poutou is still just a standard complete hand.
    expect(shanten(parseCounts('11123455678999m'))).toBe(-1);
    // Its 13-tile form is the nine-sided tenpai, not a win.
    expect(shanten(parseCounts('1112345678999m'))).toBe(0);
    expect(waits(parseCounts('1112345678999m'), 0)).toHaveLength(9);
    // Two melds called, the rest concealed.
    expect(isComplete(parseCounts('123m456m11p'), 2)).toBe(true);
    // Four melds plus the pair.
    expect(isComplete(parseCounts('11p'), 4)).toBe(true);
  });

  it('reports 0 for tenpai hands', () => {
    expect(shanten(parseCounts('123m456m789m123p1s'))).toBe(0);
    expect(isTenpai(parseCounts('123m456m789m123p1s'), 0)).toBe(true);
    expect(isTenpai(parseCounts('123m456m11p'), 2)).toBe(false);
    expect(isTenpai(parseCounts('123m45m11p'), 2)).toBe(true);
    expect(isTenpai(parseCounts('1m'), 4)).toBe(true);
  });

  it('refuses to call a five-block headless hand tenpai', () => {
    // Three sets plus two proto-runs and no pair anywhere: one of the blocks
    // still has to be reworked into the head.
    expect(shanten(parseCounts('123m456m789m12p34s'))).toBe(1);
    // The same hand with a pair instead of one proto-run is tenpai.
    expect(shanten(parseCounts('123m456m789m11p34s'))).toBe(0);
  });

  it('handles the kokushi thirteen-sided wait', () => {
    const kokushi = parseCounts('19m19p19s1234567z');
    expect(kokushiShanten(kokushi)).toBe(0);
    expect(shanten(kokushi)).toBe(0);
    expect(waits(kokushi, 0)).toHaveLength(13);
    expect(formatKinds(waits(kokushi, 0))).toBe('19m19p19s1234567z');
    // Completing it.
    expect(shanten(parseCounts('19m19p19s11234567z'))).toBe(-1);
    // One yaochuu short and no pair: two away.
    expect(kokushiShanten(parseCounts('19m19p1s1234567z5m'))).toBe(1);
  });

  it('counts chiitoitsu pairs without double counting a triplet', () => {
    // Six pairs and a lone tile: tenpai on the seventh pair.
    expect(chiitoitsuShanten(parseCounts('11m22m33p44p55s66s7z'))).toBe(0);
    // A triplet supplies one pair only, and the hand is a kind short.
    expect(chiitoitsuShanten(parseCounts('111m22m33m44m55m66m'))).toBe(1);
    // Four of a kind is still one pair.
    expect(chiitoitsuShanten(parseCounts('1111m22m33m44m55m6m'))).toBe(2);
    // Seven pairs is complete.
    expect(chiitoitsuShanten(parseCounts('11m22m33m44p55p66s77s'))).toBe(-1);
    expect(shanten(parseCounts('11m22m33m44p55p66s77s'))).toBe(-1);
  });

  it('takes the minimum across the three shapes', () => {
    // Chiitoitsu wins: six scattered pairs are three-shanten as a normal hand.
    const pairs = parseCounts('11m22m33p44p55s66s7z');
    expect(standardShanten(pairs, 0)).toBe(3);
    expect(chiitoitsuShanten(pairs)).toBe(0);
    expect(shanten(pairs)).toBe(0);

    // The standard shape wins: no pairs at all makes chiitoitsu hopeless.
    const runs = parseCounts('123m456m789m123p1s');
    expect(standardShanten(runs, 0)).toBe(0);
    expect(chiitoitsuShanten(runs)).toBe(6);
    expect(shanten(runs)).toBe(0);

    // Kokushi wins over both.
    const orphans = parseCounts('19m19p19s123456z');
    expect(kokushiShanten(orphans)).toBe(1);
    expect(shanten(orphans)).toBe(1);
    expect(standardShanten(orphans, 0)).toBeGreaterThan(1);
  });

  it('reports the worst possible standard shanten as 8', () => {
    // Nine isolated, mutually unconnected tiles plus scattered honours.
    expect(standardShanten(parseCounts('147m258p369s1234z'), 0)).toBe(8);
  });

  it('accounts for called melds', () => {
    // Two pon plus one concealed set, a pair and a ryanmen: tenpai.
    expect(shanten(parseCounts('123m11p34s'), 2)).toBe(0);
    // Same concealed tiles with nothing called: much further away.
    expect(shanten(parseCounts('123m11p34s'), 0)).toBe(4);
    // Melds never make chiitoitsu or kokushi available.
    const breakdown = shantenBreakdown(parseCounts('123m11p34s'), 2);
    expect(breakdown.chiitoitsu).toBe(SHANTEN_UNREACHABLE);
    expect(breakdown.kokushi).toBe(SHANTEN_UNREACHABLE);
    expect(breakdown.shanten).toBe(breakdown.standard);
  });

  it('exposes every shape in the breakdown', () => {
    const breakdown = shantenBreakdown(parseCounts('19m19p19s1234567z'));
    expect(breakdown).toEqual({ shanten: 0, standard: 8, chiitoitsu: 6, kokushi: 0 });
  });

  it('rejects an impossible meld count', () => {
    expect(() => standardShanten(parseCounts('11p'), 5)).toThrow();
    expect(() => standardShanten(parseCounts('11p'), -1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Waits
// ---------------------------------------------------------------------------

describe('waits', () => {
  it('finds tanki (single tile) waits', () => {
    expect(waitString('123m456m789m123p1s')).toBe('1s');
  });

  it('finds shanpon (dual pair) waits', () => {
    expect(waitString('123m456m789m11p22p')).toBe('12p');
  });

  it('finds kanchan (closed) waits', () => {
    expect(waitString('123m456m789m11p13s')).toBe('2s');
  });

  it('finds penchan (edge) waits', () => {
    expect(waitString('123m456m789m11p12s')).toBe('3s');
    expect(waitString('123m456m789m11p89s')).toBe('7s');
  });

  it('finds ryanmen (two-sided) waits', () => {
    expect(waitString('123m456m789m11p34s')).toBe('25s');
  });

  it('finds nobetan (stretched tanki) waits', () => {
    expect(waitString('123m456m789m2345s')).toBe('25s');
  });

  it('finds sanmenchan (three-sided) waits', () => {
    expect(waitString('11m234p567p34567s')).toBe('258s');
  });

  it('finds the three-sided wait of a 2345678s shape', () => {
    expect(waitString('123m456m2345678s')).toBe('258s');
  });

  it('finds the chiitoitsu wait', () => {
    expect(waitString('11m22m33p44p55s66s7z')).toBe('7z');
  });

  it('finds the tanki wait behind four called melds', () => {
    expect(waitString('5s', 4)).toBe('5s');
  });

  it('returns nothing when the hand is not tenpai', () => {
    expect(waits(parseCounts('123m456m789m12p34s'), 0)).toEqual([]);
  });

  it('never waits on a kind the hand already holds four of', () => {
    // 1111m plus three sets: the shanpon half on 1m is dead.
    expect(waitString('1111m456m789m123p')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Ukeire
// ---------------------------------------------------------------------------

describe('ukeire', () => {
  it('lists the accepted kinds with the copies left in the wall', () => {
    const hand = parseCounts('123m456m789m11p34s');
    const result = ukeire(hand, 0, visibleFromHand(hand));
    expect(result.shanten).toBe(0);
    expect(result.tiles.map((entry) => entry.kind)).toEqual(parseKinds('25s'));
    expect(result.tiles.every((entry) => entry.remaining === 4)).toBe(true);
    expect(result.total).toBe(8);
  });

  it('subtracts tiles the player can already see', () => {
    const hand = parseCounts('123m456m789m123p1s');
    const visible = visibleFromHand(hand);
    // The 1s in hand is visible, so only three copies are left.
    const before = ukeire(hand, 0, visible);
    expect(before.tiles).toEqual([{ kind: parseKinds('1s')[0], remaining: 3 }]);
    expect(before.total).toBe(3);

    // Two more 1s show up in the discards.
    addVisible(visible, parseKinds('1s')[0], 2);
    const after = ukeire(hand, 0, visible);
    expect(after.tiles).toEqual([{ kind: parseKinds('1s')[0], remaining: 1 }]);
    expect(after.total).toBe(1);

    // The last one too: the wait is dead but still listed.
    addVisible(visible, parseKinds('1s')[0], 1);
    const dead = ukeire(hand, 0, visible);
    expect(dead.tiles).toEqual([{ kind: parseKinds('1s')[0], remaining: 0 }]);
    expect(dead.total).toBe(0);
  });

  it('works behind called melds', () => {
    const hand = parseCounts('123m11p34s');
    const result = ukeire(hand, 2, visibleFromHand(hand));
    expect(result.shanten).toBe(0);
    expect(result.tiles.map((entry) => entry.kind)).toEqual(parseKinds('25s'));
    expect(result.total).toBe(8);
  });

  it('starts an empty visibility histogram at zero', () => {
    const visible = emptyVisible();
    expect(visible).toHaveLength(TILE_KIND_COUNT);
    expect(Array.from(visible).every((n) => n === 0)).toBe(true);
    addVisible(visible, 0, 5);
    expect(visible[0]).toBe(4);
  });
});

describe('bestDiscards', () => {
  it('puts the tenpai discard ahead of every one-shanten discard', () => {
    const hand = parseCounts('123m456m789m11p45s9s');
    const candidates = bestDiscards(hand, 0, visibleFromHand(hand));
    expect(candidates).toHaveLength(new Set(parseKinds('123m456m789m11p45s9s')).size);
    expect(candidates[0].tile).toBe(parseKinds('9s')[0] * 4);
    expect(candidates[0].shanten).toBe(0);
    expect(candidates[0].ukeire.tiles.map((entry) => entry.kind)).toEqual(parseKinds('36s'));
    expect(candidates[0].ukeire.total).toBe(8);
    expect(candidates.slice(1).every((candidate) => candidate.shanten >= 1)).toBe(true);
  });

  it('breaks a shanten tie on the widest acceptance', () => {
    // Discarding 4s leaves a 1p/5s shanpon (two live copies of each, because
    // the hand itself already shows two of both); discarding a 5s leaves a
    // 3s/6s ryanmen (eight live tiles). Both are tenpai, so the tie is broken
    // on ukeire even though 4s sorts first by kind.
    const hand = parseCounts('123m456m789m11p455s');
    const candidates = bestDiscards(hand, 0, visibleFromHand(hand));
    const tenpai = candidates.filter((candidate) => candidate.shanten === 0);
    expect(tenpai.map((candidate) => candidate.tile)).toEqual([
      parseKinds('5s')[0] * 4,
      parseKinds('4s')[0] * 4,
    ]);
    expect(tenpai[0].ukeire.total).toBe(8);
    expect(tenpai[1].ukeire.total).toBe(4);
  });

  it('is consistent with the shanten of the hand it was given', () => {
    const rng = makeRng(0x2468ace);
    for (let i = 0; i < 200; i += 1) {
      const meldCount = i % 5;
      const counts = randomHand(rng, 14 - 3 * meldCount);
      const candidates = bestDiscards(counts, meldCount, visibleFromHand(counts));
      // A 14-tile hand that is already complete still has to give a tile up,
      // so the best a discard can leave behind is tenpai.
      expect(candidates[0].shanten).toBe(Math.max(shanten(counts, meldCount), 0));
      for (let j = 1; j < candidates.length; j += 1) {
        expect(candidates[j - 1].shanten).toBeLessThanOrEqual(candidates[j].shanten);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('evaluates a hand well inside the 0.05 ms budget', () => {
    const rng = makeRng(0x77777777);
    const hands = Array.from({ length: 2000 }, () => randomHand(rng, 14));
    // Warm the suit-profile cache so the measurement reflects steady state.
    for (const hand of hands) shanten(hand, 0);

    const started = performance.now();
    for (const hand of hands) shanten(hand, 0);
    const perHand = (performance.now() - started) / hands.length;
    expect(perHand).toBeLessThan(0.05);
  });
});
