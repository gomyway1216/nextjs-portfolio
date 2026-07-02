import { describe, expect, it } from 'vitest';
import {
  applyStrategy,
  otherDoor,
  pickHostDoor,
  playRound,
  randomDoor,
  runMontyCarloAsync,
  won,
} from '@/components/game/MontyHall/engine';

function sequence(values: number[], fallback = 0): () => number {
  let index = 0;
  return () => values[index++] ?? fallback;
}

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

  it('uses rng for random strategy decisions', () => {
    const round = { prizeDoor: 2 as const, pickedDoor: 0 as const, openedDoor: 1 as const };

    expect(applyStrategy(round, 'random', () => 0.49)).toBe(0);
    expect(applyStrategy(round, 'random', () => 0.5)).toBe(2);
  });

  it('runs a deterministic monte carlo summary with sampled curves', async () => {
    const progress: Array<[number, number]> = [];
    const rng = sequence([
      0.1, 0.1, 0, 0.4,
      0.1, 0.9, 0, 0.6,
    ]);

    const result = await runMontyCarloAsync(
      2,
      {
        chunkSize: 1,
        sampleEvery: 1,
        onProgress: (done, total) => progress.push([done, total]),
      },
      rng,
    );

    expect(progress).toEqual([[1, 2], [2, 2]]);
    expect(result).toEqual({
      trials: 2,
      stayWins: 1,
      switchWins: 1,
      randomWins: 2,
      stayCurve: [1, 0.5],
      switchCurve: [0, 0.5],
      randomCurve: [1, 1],
      curveX: [1, 2],
    });
  });

  it('validates monte carlo inputs', async () => {
    await expect(runMontyCarloAsync(0)).rejects.toThrow('trials');
  });

  it('returns null when monte carlo is aborted at a chunk boundary', async () => {
    const controller = new AbortController();

    const result = await runMontyCarloAsync(
      2,
      {
        chunkSize: 1,
        signal: controller.signal,
        onProgress: () => controller.abort(),
      },
      () => 0,
    );

    expect(result).toBeNull();
  });
});
