import { describe, expect, it } from 'vitest';
import {
  applyStrategy,
  otherDoor,
  pickHostDoor,
  playRound,
  randomDoor,
  won,
} from '@/components/game/MontyHall/engine';

describe('MontyHall engine', () => {
  it('host never opens the picked door or prize door', () => {
    expect(pickHostDoor(1, 0)).toBe(2);
    expect([1, 2]).toContain(pickHostDoor(0, 0, () => 0.99));
  });

  it('switch strategy picks the only unopened door', () => {
    const round = { prizeDoor: 2 as const, pickedDoor: 0 as const, openedDoor: 1 as const };

    expect(otherDoor(0, 1)).toBe(2);
    expect(applyStrategy(round, 'stay')).toBe(0);
    expect(applyStrategy(round, 'switch')).toBe(2);
    expect(won(round, 2)).toBe(true);
  });

  it('uses injected rng for deterministic rounds', () => {
    const values = [0.9, 0.1];
    const rng = () => values.shift() ?? 0;

    expect(randomDoor(() => 0.99)).toBe(2);
    expect(playRound(0, rng)).toEqual({ prizeDoor: 2, pickedDoor: 0, openedDoor: 1 });
  });
});
