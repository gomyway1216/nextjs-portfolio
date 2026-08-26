import { describe, expect, it } from 'vitest';

import { DEFAULT_RULES, HANCHAN_RULES, baseHandCount } from '@/components/game/Mahjong/engine/rules';
import {
  DEAD_WALL_SIZE,
  DEAD_WALL_START,
  RED_FIVE_TILE_IDS,
  TILE_COUNT,
  TILE_KIND_COUNT,
  isMenzen,
  type Meld,
} from '@/components/game/Mahjong/engine/types';
import {
  YAOCHUU_KINDS,
  doraFromIndicator,
  formatKinds,
  isSimple,
  isTerminal,
  isYaochuu,
  kindsToTileIds,
  parseKinds,
} from '@/components/game/Mahjong/engine/tiles';

describe('mahjong tile constants', () => {
  it('describes a complete wall', () => {
    expect(TILE_KIND_COUNT * 4).toBe(TILE_COUNT);
    expect(DEAD_WALL_START + DEAD_WALL_SIZE).toBe(TILE_COUNT);
  });

  it('places the red fives on copy 0 of each 5', () => {
    const fiveKinds = [4, 13, 22];
    RED_FIVE_TILE_IDS.forEach((tileId, index) => {
      expect(tileId >> 2).toBe(fiveKinds[index]);
      expect(tileId & 3).toBe(0);
    });
  });
});

describe('menzen', () => {
  const meld = (type: Meld['type']): Meld => ({
    type,
    tiles: [0, 1, 2],
    calledTile: type === 'ankan' ? null : 0,
    fromSeat: type === 'ankan' ? null : 1,
  });

  it('is preserved by an ankan only', () => {
    expect(isMenzen([])).toBe(true);
    expect(isMenzen([meld('ankan')])).toBe(true);
    expect(isMenzen([meld('pon')])).toBe(false);
    expect(isMenzen([meld('chi')])).toBe(false);
    expect(isMenzen([meld('ankan'), meld('minkan')])).toBe(false);
  });
});

describe('default rules', () => {
  it('is an ari-ari tonpuusen with red fives', () => {
    expect(DEFAULT_RULES.length).toBe('tonpuu');
    expect(DEFAULT_RULES.kuitan).toBe(true);
    expect(DEFAULT_RULES.redFives).toBe(true);
    expect(baseHandCount(DEFAULT_RULES)).toBe(4);
    expect(baseHandCount(HANCHAN_RULES)).toBe(8);
  });
});

describe('tile helpers', () => {
  it('round-trips MPSZ notation', () => {
    expect(formatKinds(parseKinds('123m0p789s11z'))).toBe('123m5p789s11z');
  });

  it('walks dora indicators around each cycle', () => {
    expect(doraFromIndicator(kindsToTileIds([0])[0])).toBe(1); // 1m -> 2m
    expect(doraFromIndicator(kindsToTileIds([8])[0])).toBe(0); // 9m -> 1m
    expect(doraFromIndicator(kindsToTileIds([30])[0])).toBe(27); // North -> East
    expect(doraFromIndicator(kindsToTileIds([33])[0])).toBe(31); // Chun -> Haku
  });

  it('classifies yaochuu tiles', () => {
    expect(YAOCHUU_KINDS.every(isYaochuu)).toBe(true);
    expect(YAOCHUU_KINDS.filter(isTerminal)).toHaveLength(6);
    expect(isSimple(4)).toBe(true);
  });
});
