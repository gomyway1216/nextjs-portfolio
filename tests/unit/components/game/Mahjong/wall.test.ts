import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '@/components/game/Mahjong/engine/random';
import {
  HAND_SIZE,
  MAX_DORA_INDICATORS,
  MAX_KANS,
  buildWall,
  dealHands,
  drawReplacementTile,
  drawTile,
  isExhausted,
  liveTilesRemaining,
  revealKanDora,
  uraDoraKinds,
  visibleDoraKinds,
} from '@/components/game/Mahjong/engine/wall';
import { kindOf, doraFromIndicator } from '@/components/game/Mahjong/engine/tiles';
import {
  DEAD_WALL_SIZE,
  DEAD_WALL_START,
  TILE_COUNT,
  TILE_KIND_COUNT,
  type TileId,
  type WallState,
} from '@/components/game/Mahjong/engine/types';

/** Live tiles available for the whole hand when nobody kans: 122 - 4 * 13. */
const LIVE_DRAWS_WITHOUT_KANS = DEAD_WALL_START - 4 * HAND_SIZE;

function wallFor(seed: number | string): WallState {
  return buildWall(createRng(seed));
}

describe('createRng', () => {
  it('produces an identical stream for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const streamA = Array.from({ length: 200 }, () => a.next());
    const streamB = Array.from({ length: 200 }, () => b.next());
    expect(streamA).toEqual(streamB);
  });

  it('produces different streams for different seeds', () => {
    const rngA = createRng(1);
    const rngB = createRng(2);
    const streamA = Array.from({ length: 50 }, () => rngA.next());
    const streamB = Array.from({ length: 50 }, () => rngB.next());
    expect(streamA).not.toEqual(streamB);
  });

  it('accepts string seeds and treats them as distinct', () => {
    const a = createRng('east-1');
    const b = createRng('east-1');
    const c = createRng('east-2');
    expect(a.next()).toBe(b.next());
    expect(createRng('east-1').next()).not.toBe(c.next());
  });

  it('emits uint32 values only', () => {
    const rng = createRng('range');
    for (let i = 0; i < 5000; i += 1) {
      const value = rng.next();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('keeps nextInt inside [0, n) and hits every residue', () => {
    const rng = createRng('nextInt');
    const seen = new Set<number>();
    for (let i = 0; i < 20000; i += 1) {
      const value = rng.nextInt(7);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(7);
      seen.add(value);
    }
    expect(seen.size).toBe(7);
  });

  it('rejects non-positive nextInt bounds', () => {
    const rng = createRng(1);
    expect(() => rng.nextInt(0)).toThrow();
    expect(() => rng.nextInt(-3)).toThrow();
    expect(() => rng.nextInt(2.5)).toThrow();
  });

  it('shuffle permutes without mutating the input', () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const copy = [...input];
    const out = shuffle(input, createRng('shuffle'));
    expect(input).toEqual(copy);
    expect([...out].sort((a, b) => a - b)).toEqual(copy);
    expect(out).not.toEqual(copy);
  });
});

describe('buildWall determinism', () => {
  it('yields byte-identical tiles and hands for the same seed', () => {
    const first = wallFor('duplicate-wall');
    const second = wallFor('duplicate-wall');
    expect(first.tiles).toEqual(second.tiles);
    expect(first.doraIndicators).toEqual(second.doraIndicators);
    expect(first.uraIndicators).toEqual(second.uraIndicators);
    expect(dealHands(first)).toEqual(dealHands(second));
  });

  it('yields different walls for different seeds', () => {
    const a = wallFor(1);
    const b = wallFor(2);
    expect(a.tiles).not.toEqual(b.tiles);
    expect(dealHands(a)).not.toEqual(dealHands(b));
  });

  it('starts with exactly one dora indicator and a matching ura', () => {
    const wall = wallFor('start');
    expect(wall.drawIndex).toBe(0);
    expect(wall.liveEnd).toBe(DEAD_WALL_START);
    expect(wall.rinshanDrawn).toBe(0);
    expect(wall.doraIndicators).toEqual([wall.tiles[130]]);
    expect(wall.uraIndicators).toEqual([wall.tiles[131]]);
    expect(visibleDoraKinds(wall)).toEqual([doraFromIndicator(wall.tiles[130])]);
    expect(uraDoraKinds(wall)).toEqual([doraFromIndicator(wall.tiles[131])]);
  });
});

describe('wall conservation', () => {
  it('is a permutation of 0..135 with four copies of each kind, over 1000 seeds', () => {
    const expectedIds = Array.from({ length: TILE_COUNT }, (_, i) => i);
    for (let seed = 0; seed < 1000; seed += 1) {
      const wall = wallFor(seed);
      expect(wall.tiles).toHaveLength(TILE_COUNT);
      expect([...wall.tiles].sort((a, b) => a - b)).toEqual(expectedIds);

      const kindCounts = new Uint8Array(TILE_KIND_COUNT);
      for (const tile of wall.tiles) kindCounts[kindOf(tile)] += 1;
      expect(Array.from(kindCounts)).toEqual(
        Array.from({ length: TILE_KIND_COUNT }, () => 4),
      );
    }
  });

  it('deals 13 sorted tiles to each of four seats and consumes 52 live tiles', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const wall = wallFor(seed);
      const before = liveTilesRemaining(wall);
      const hands = dealHands(wall);
      expect(hands).toHaveLength(4);
      const dealt = new Set<TileId>();
      for (const hand of hands) {
        expect(hand).toHaveLength(HAND_SIZE);
        expect(hand).toEqual([...hand].sort((a, b) => a - b));
        for (const tile of hand) dealt.add(tile);
      }
      expect(dealt.size).toBe(4 * HAND_SIZE);
      expect(wall.drawIndex).toBe(4 * HAND_SIZE);
      expect(liveTilesRemaining(wall)).toBe(before - 4 * HAND_SIZE);
    }
  });
});

describe('kan accounting', () => {
  it('shortens the live wall by exactly one tile per kan', () => {
    const noKans = wallFor('kan');
    dealHands(noKans);
    const baseline = liveTilesRemaining(noKans);

    const wall = wallFor('kan');
    dealHands(wall);
    for (let i = 0; i < MAX_KANS; i += 1) {
      drawReplacementTile(wall);
    }
    expect(wall.liveEnd).toBe(DEAD_WALL_START - MAX_KANS);
    expect(wall.liveEnd).toBe(118);
    expect(wall.rinshanDrawn).toBe(MAX_KANS);
    expect(liveTilesRemaining(wall)).toBe(baseline - MAX_KANS);
  });

  it('returns the dead wall tiles 135, 134, 133, 132 in order', () => {
    const wall = wallFor('rinshan-order');
    dealHands(wall);
    const drawn = [
      drawReplacementTile(wall),
      drawReplacementTile(wall),
      drawReplacementTile(wall),
      drawReplacementTile(wall),
    ];
    expect(drawn).toEqual([
      wall.tiles[135],
      wall.tiles[134],
      wall.tiles[133],
      wall.tiles[132],
    ]);
  });

  it('throws on a fifth replacement draw', () => {
    const wall = wallFor('five-kans');
    dealHands(wall);
    for (let i = 0; i < MAX_KANS; i += 1) drawReplacementTile(wall);
    expect(() => drawReplacementTile(wall)).toThrow();
  });

  it('never hands out the same tile twice across live and replacement draws', () => {
    const wall = wallFor('no-duplicates');
    const seen = new Set<TileId>();
    for (const hand of dealHands(wall)) {
      for (const tile of hand) seen.add(tile);
    }
    let expectedCount = 4 * HAND_SIZE;

    // Interleave four kans with normal draws, the way a real hand would.
    let kansTaken = 0;
    while (!isExhausted(wall)) {
      if (kansTaken < MAX_KANS && (seen.size + kansTaken) % 9 === 0) {
        seen.add(drawReplacementTile(wall));
        kansTaken += 1;
        expectedCount += 1;
        continue;
      }
      seen.add(drawTile(wall));
      expectedCount += 1;
    }

    expect(kansTaken).toBe(MAX_KANS);
    expect(seen.size).toBe(expectedCount);
    expect(() => drawTile(wall)).toThrow();
  });
});

describe('dora indicators', () => {
  it('reveals five indicators in total and then throws', () => {
    const wall = wallFor('dora');
    expect(wall.doraIndicators).toHaveLength(1);
    for (let i = 1; i < MAX_DORA_INDICATORS; i += 1) {
      const revealed = revealKanDora(wall);
      expect(revealed).toBe(wall.tiles[130 - 2 * i]);
      expect(wall.doraIndicators).toHaveLength(i + 1);
      expect(wall.uraIndicators).toHaveLength(i + 1);
      expect(wall.uraIndicators[i]).toBe(wall.tiles[131 - 2 * i]);
    }
    expect(wall.doraIndicators).toHaveLength(MAX_DORA_INDICATORS);
    expect(() => revealKanDora(wall)).toThrow();
  });

  it('keeps dora, ura and replacement slots disjoint and inside the dead wall', () => {
    const doraIdx = Array.from({ length: MAX_DORA_INDICATORS }, (_, i) => 130 - 2 * i);
    const uraIdx = Array.from({ length: MAX_DORA_INDICATORS }, (_, i) => 131 - 2 * i);
    const rinshanIdx = Array.from({ length: MAX_KANS }, (_, n) => 135 - n);
    const all = [...doraIdx, ...uraIdx, ...rinshanIdx];

    expect(new Set(all).size).toBe(all.length);
    expect(all).toHaveLength(DEAD_WALL_SIZE);
    for (const index of all) {
      expect(index).toBeGreaterThanOrEqual(DEAD_WALL_START);
      expect(index).toBeLessThan(DEAD_WALL_START + DEAD_WALL_SIZE);
    }
  });

  it('maps every revealed indicator through doraFromIndicator', () => {
    const wall = wallFor('dora-kinds');
    revealKanDora(wall);
    revealKanDora(wall);
    expect(visibleDoraKinds(wall)).toEqual(
      wall.doraIndicators.map(doraFromIndicator),
    );
    expect(uraDoraKinds(wall)).toEqual(wall.uraIndicators.map(doraFromIndicator));
    expect(visibleDoraKinds(wall)).toHaveLength(3);
  });
});

describe('exhaustive draw', () => {
  it('yields exactly 70 live draws after the deal when nobody kans', () => {
    const wall = wallFor('exhaustive');
    dealHands(wall);
    expect(LIVE_DRAWS_WITHOUT_KANS).toBe(70);
    expect(liveTilesRemaining(wall)).toBe(LIVE_DRAWS_WITHOUT_KANS);

    let draws = 0;
    let lastTile: TileId | null = null;
    let haiteiTile: TileId | null = null;
    while (!isExhausted(wall)) {
      haiteiTile = wall.tiles[wall.liveEnd - 1];
      lastTile = drawTile(wall);
      draws += 1;
    }

    expect(draws).toBe(LIVE_DRAWS_WITHOUT_KANS);
    expect(lastTile).toBe(haiteiTile);
    expect(wall.drawIndex).toBe(wall.liveEnd);
    expect(liveTilesRemaining(wall)).toBe(0);
    expect(() => drawTile(wall)).toThrow();
  });

  it('loses one live draw per kan', () => {
    for (let kans = 0; kans <= MAX_KANS; kans += 1) {
      const wall = wallFor(`kan-${kans}`);
      dealHands(wall);
      for (let i = 0; i < kans; i += 1) drawReplacementTile(wall);
      let draws = 0;
      while (!isExhausted(wall)) {
        drawTile(wall);
        draws += 1;
      }
      expect(draws).toBe(LIVE_DRAWS_WITHOUT_KANS - kans);
    }
  });
});
