import { describe, expect, it } from "vitest";
import {
  applyStrategy,
  otherDoor,
  pickHostDoors,
  playRound,
  randomDoor,
  runMontyCarloAsync,
  switchCandidates,
  won,
  theoreticalStay,
  theoreticalSwitch,
  type Round,
} from "@/components/game/MontyHall/engine";

/** Deterministic mulberry32 RNG for stable statistical assertions. */
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round3 = (
  prizeDoor: number,
  pickedDoor: number,
  opened: number,
): Round => ({
  doorCount: 3,
  prizeDoor,
  pickedDoor,
  openedDoors: [opened],
});

describe("MontyHall engine — basic API (N = 3)", () => {
  it("host never opens the picked door or the prize door", () => {
    expect(pickHostDoors(1, 0)).toEqual([2]);
    expect([1, 2]).toContain(pickHostDoors(0, 0, 3, () => 0.99)[0]);
  });

  it("switch strategy picks the only unopened door", () => {
    const round = round3(2, 0, 1);
    expect(otherDoor(round)).toBe(2);
    expect(switchCandidates(round)).toEqual([2]);
    expect(applyStrategy(round, "stay")).toBe(0);
    expect(applyStrategy(round, "switch")).toBe(2);
    expect(won(round, 2)).toBe(true);
  });

  it("uses injected rng for deterministic rounds", () => {
    const values = [0.9, 0.1];
    const rng = () => values.shift() ?? 0;
    expect(randomDoor(3, () => 0.99)).toBe(2);
    expect(playRound(0, 3, rng)).toEqual({
      doorCount: 3,
      prizeDoor: 2,
      pickedDoor: 0,
      openedDoors: [1],
    });
  });

  it("uses rng for random strategy decisions", () => {
    const round = round3(2, 0, 1);
    expect(applyStrategy(round, "random", () => 0.49)).toBe(0);
    expect(applyStrategy(round, "random", () => 0.5)).toBe(2);
  });
});

describe("host rule invariants (N = 3)", () => {
  it("host never opens the prize or the picked door, over many trials", () => {
    const rng = makeRng(1);
    let invalidLength = 0;
    let openedPrize = 0;
    let openedPicked = 0;
    for (let i = 0; i < 50_000; i++) {
      const picked = randomDoor(3, rng);
      const round = playRound(picked, 3, rng);
      if (round.openedDoors.length !== 1) invalidLength += 1;
      for (const opened of round.openedDoors) {
        if (opened === round.prizeDoor) openedPrize += 1;
        if (opened === round.pickedDoor) openedPicked += 1;
      }
    }
    expect({ invalidLength, openedPrize, openedPicked }).toEqual({
      invalidLength: 0,
      openedPrize: 0,
      openedPicked: 0,
    });
  });

  it("when the player picked the prize, both goats are reachable", () => {
    const seen = new Set<number>();
    const rng = makeRng(3);
    for (let i = 0; i < 1000; i++) {
      const opened = pickHostDoors(0, 0, 3, rng);
      expect([1, 2]).toContain(opened[0]);
      seen.add(opened[0]);
    }
    expect(seen).toEqual(new Set([1, 2]));
  });

  it("when the player picked a goat, the host is forced", () => {
    const rng = makeRng(4);
    for (let i = 0; i < 100; i++) {
      expect(pickHostDoors(2, 0, 3, rng)).toEqual([1]);
    }
  });
});

describe("strategy correctness (N = 3)", () => {
  it("switch wins iff the original pick was a goat; stay is the complement", () => {
    const rng = makeRng(5);
    for (let i = 0; i < 20_000; i++) {
      const round = playRound(randomDoor(3, rng), 3, rng);
      const pickedGoat = round.pickedDoor !== round.prizeDoor;
      expect(won(round, otherDoor(round))).toBe(pickedGoat);
      expect(won(round, applyStrategy(round, "stay", rng))).toBe(!pickedGoat);
    }
  });
});

describe("Monte-Carlo convergence (N = 3)", () => {
  it("switch ~= 2/3 and stay ~= 1/3 over many trials", async () => {
    const rng = makeRng(42);
    const trials = 200_000;
    const summary = await runMontyCarloAsync(
      trials,
      { chunkSize: trials },
      rng,
    );
    expect(summary).not.toBeNull();
    const stayRate = summary!.stayWins / summary!.trials;
    const switchRate = summary!.switchWins / summary!.trials;
    const randomRate = summary!.randomWins / summary!.trials;
    expect(switchRate).toBeCloseTo(2 / 3, 2); // tolerance ~0.005
    expect(stayRate).toBeCloseTo(1 / 3, 2);
    expect(randomRate).toBeCloseTo(1 / 2, 2);
    expect(switchRate).toBeGreaterThan(stayRate + 0.25);
  });

  it("produces one curve sample per trial and matching x values", async () => {
    const progress: Array<[number, number]> = [];
    const rng = makeRng(11);
    const summary = await runMontyCarloAsync(
      2,
      {
        chunkSize: 1,
        sampleEvery: 1,
        onProgress: (d, t) => progress.push([d, t]),
      },
      rng,
    );
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
    expect(summary!.curveX).toEqual([1, 2]);
    expect(summary!.stayCurve).toHaveLength(2);
    expect(summary!.switchCurve).toHaveLength(2);
    expect(summary!.randomCurve).toHaveLength(2);
    expect(summary!.doorCount).toBe(3);
  });

  it("validates monte carlo inputs", async () => {
    await expect(runMontyCarloAsync(0)).rejects.toThrow("trials");
  });

  it("returns null when aborted at a chunk boundary", async () => {
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

describe("generalized N-door variant", () => {
  it("host invariants hold for N = 5 and 3 switch candidates remain", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 5000; i++) {
      const round = playRound(randomDoor(5, rng), 5, rng);
      expect(round.openedDoors).toHaveLength(1);
      for (const opened of round.openedDoors) {
        expect(opened).not.toBe(round.prizeDoor);
        expect(opened).not.toBe(round.pickedDoor);
      }
      expect(switchCandidates(round)).toHaveLength(3);
    }
  });

  it("simulated N=5 rates match the closed form (N-1)/(N(N-2))", async () => {
    const rng = makeRng(99);
    const trials = 200_000;
    const summary = await runMontyCarloAsync(
      trials,
      { chunkSize: trials, doorCount: 5 },
      rng,
    );
    const switchRate = summary!.switchWins / summary!.trials;
    const stayRate = summary!.stayWins / summary!.trials;
    expect(switchRate).toBeCloseTo(theoreticalSwitch(5), 2);
    expect(stayRate).toBeCloseTo(theoreticalStay(5), 2);
    expect(switchRate).toBeGreaterThan(stayRate);
  });

  it("closed-form probabilities match classic N=3 values", () => {
    expect(theoreticalStay(3)).toBeCloseTo(1 / 3, 10);
    expect(theoreticalSwitch(3)).toBeCloseTo(2 / 3, 10);
  });

  it("rejects invalid door counts", () => {
    expect(() => playRound(0, 2)).toThrow();
    expect(() => playRound(0, 2.5)).toThrow();
  });

  it("rejects an out-of-range or non-integer picked door", () => {
    expect(() => playRound(99, 3)).toThrow("pickedDoor");
    expect(() => playRound(-1, 3)).toThrow("pickedDoor");
    expect(() => playRound(1.5, 3)).toThrow("pickedDoor");
    expect(() => pickHostDoors(99, 0, 3)).toThrow("prizeDoor");
  });
});
