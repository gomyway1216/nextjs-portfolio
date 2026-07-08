/**
 * Monty Hall problem engine (generalized to N doors).
 *
 * N doors (N >= 3). One hides a prize, the rest hide goats. The player picks a
 * door; the host — who knows where the prize is — opens exactly ONE other door
 * revealing a goat (never the prize, never the player's pick). The player then
 * chooses to stay or switch to one of the remaining unopened doors.
 *
 * Classic result for N = 3:
 *   - stay   wins with probability 1/N              = 1/3
 *   - switch wins with probability (N-1)/(N*(N-2))  = 2/3
 *
 * General closed forms (host opens exactly one goat door):
 *   - P(win | stay)   = 1/N
 *   - P(win | switch) = (N-1) / (N * (N-2))      for N >= 3
 *   (For N = 3 this reduces to 2/3.)
 *   - P(win | random pick among the two candidate doors) = 1/2 * (stay + switch)
 */

export type Door = number;

export interface Round {
  /** Number of doors in this round. */
  doorCount: number;
  prizeDoor: Door;
  pickedDoor: Door;
  /** Doors opened by the host (always goats, never the pick or the prize). */
  openedDoors: Door[];
}

export const DEFAULT_DOOR_COUNT = 3;

function assertDoorCount(doorCount: number): void {
  if (!Number.isInteger(doorCount) || doorCount < 3) {
    throw new Error(`doorCount must be an integer >= 3, got ${doorCount}`);
  }
}

/** Validate a door index is an integer in [0, doorCount - 1]. */
function assertDoor(door: number, doorCount: number, name: string): void {
  if (!Number.isInteger(door) || door < 0 || door >= doorCount) {
    throw new Error(`${name} must be an integer in [0, ${doorCount - 1}], got ${door}`);
  }
}

/** Uniformly pick one element of a non-empty array. */
function sample<T>(arr: readonly T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

export function randomDoor(doorCount = DEFAULT_DOOR_COUNT, rng: () => number = Math.random): Door {
  assertDoorCount(doorCount);
  return Math.floor(rng() * doorCount);
}

/**
 * Host opens exactly ONE door that is neither the player's pick nor the prize.
 * If the player picked the prize, every other door is a goat and the host picks
 * uniformly; otherwise there is a set of goat doors and the host still picks
 * uniformly among them. The host NEVER opens the prize door or the picked door.
 */
export function pickHostDoors(
  prizeDoor: Door,
  pickedDoor: Door,
  doorCount = DEFAULT_DOOR_COUNT,
  rng: () => number = Math.random,
): Door[] {
  assertDoorCount(doorCount);
  assertDoor(prizeDoor, doorCount, 'prizeDoor');
  assertDoor(pickedDoor, doorCount, 'pickedDoor');
  const options: Door[] = [];
  for (let d = 0; d < doorCount; d++) {
    if (d !== prizeDoor && d !== pickedDoor) options.push(d);
  }
  // Host opens exactly one goat door (classic single-reveal variant).
  return [sample(options, rng)];
}

/**
 * The doors the player may switch TO: every door except the pick and any
 * opened door. For N = 3 this is a single door.
 */
export function switchCandidates(round: Round): Door[] {
  const opened = new Set(round.openedDoors);
  const candidates: Door[] = [];
  for (let d = 0; d < round.doorCount; d++) {
    if (d !== round.pickedDoor && !opened.has(d)) candidates.push(d);
  }
  return candidates;
}

/**
 * Convenience for the 3-door case: the single door reached by switching.
 * Throws if there is not exactly one candidate.
 */
export function otherDoor(round: Round): Door {
  const candidates = switchCandidates(round);
  if (candidates.length !== 1) {
    throw new Error(`otherDoor: expected exactly one switch candidate, got ${candidates.length}`);
  }
  return candidates[0];
}

export function playRound(
  pickedDoor: Door,
  doorCount = DEFAULT_DOOR_COUNT,
  rng: () => number = Math.random,
): Round {
  assertDoorCount(doorCount);
  assertDoor(pickedDoor, doorCount, 'pickedDoor');
  const prizeDoor = randomDoor(doorCount, rng);
  const openedDoors = pickHostDoors(prizeDoor, pickedDoor, doorCount, rng);
  return { doorCount, prizeDoor, pickedDoor, openedDoors };
}

export type Strategy = 'stay' | 'switch' | 'random';

/**
 * Resolve the final door for a strategy. `switch` picks uniformly among the
 * switch candidates (for N = 3 that's deterministic). `random` flips a coin
 * between staying and switching.
 */
export function applyStrategy(round: Round, strategy: Strategy, rng: () => number = Math.random): Door {
  switch (strategy) {
    case 'stay':
      return round.pickedDoor;
    case 'switch':
      return sample(switchCandidates(round), rng);
    case 'random':
      return rng() < 0.5 ? round.pickedDoor : sample(switchCandidates(round), rng);
  }
}

export function won(round: Round, finalDoor: Door): boolean {
  return finalDoor === round.prizeDoor;
}

// ---------- Theoretical probabilities ----------

/** P(win | stay) = 1/N. */
export function theoreticalStay(doorCount = DEFAULT_DOOR_COUNT): number {
  assertDoorCount(doorCount);
  return 1 / doorCount;
}

/**
 * P(win | switch) when the host opens exactly one goat door and the player
 * switches to a uniformly-random unopened door: (N-1) / (N * (N-2)).
 * N = 3 → 2/3. N = 4 → 3/8. N -> ∞ → 1/N-ish but still beats stay.
 */
export function theoreticalSwitch(doorCount = DEFAULT_DOOR_COUNT): number {
  assertDoorCount(doorCount);
  return (doorCount - 1) / (doorCount * (doorCount - 2));
}

/** P(win | random) = midpoint of stay and switch. */
export function theoreticalRandom(doorCount = DEFAULT_DOOR_COUNT): number {
  return (theoreticalStay(doorCount) + theoreticalSwitch(doorCount)) / 2;
}

// ---------- Simulation ----------

export interface SimSummary {
  trials: number;
  doorCount: number;
  /** wins per strategy */
  stayWins: number;
  switchWins: number;
  randomWins: number;
  /** Running win-rate samples for the convergence chart, one per `sampleEvery` trials. */
  stayCurve: number[];
  switchCurve: number[];
  randomCurve: number[];
  /** X-axis values matching the curves (trial counts). */
  curveX: number[];
}

export interface SimOptions {
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
  chunkSize?: number;
  /** Sample running win-rate this often (default: max(1, trials/200)). */
  sampleEvery?: number;
  doorCount?: number;
}

/**
 * Run `trials` independent Monte-Carlo rounds, evaluating all three strategies
 * on each round so they share variance. Yields to the event loop between chunks
 * to keep the UI responsive, and supports cancellation via `signal`.
 */
export async function runMontyCarloAsync(
  trials: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<SimSummary | null> {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runMontyCarloAsync: trials must be a positive integer');
  }
  const doorCount = options.doorCount ?? DEFAULT_DOOR_COUNT;
  assertDoorCount(doorCount);
  const chunkSize = options.chunkSize ?? 5000;
  const sampleEvery = options.sampleEvery ?? Math.max(1, Math.floor(trials / 200));

  let stayWins = 0;
  let switchWins = 0;
  let randomWins = 0;
  const stayCurve: number[] = [];
  const switchCurve: number[] = [];
  const randomCurve: number[] = [];
  const curveX: number[] = [];

  for (let i = 0; i < trials; i += chunkSize) {
    const end = Math.min(i + chunkSize, trials);
    for (let j = i; j < end; j++) {
      const picked = randomDoor(doorCount, rng);
      const round = playRound(picked, doorCount, rng);
      // All three strategies on the same round so they share variance.
      if (won(round, applyStrategy(round, 'stay', rng))) stayWins++;
      if (won(round, applyStrategy(round, 'switch', rng))) switchWins++;
      if (won(round, applyStrategy(round, 'random', rng))) randomWins++;
      const n = j + 1;
      if (n % sampleEvery === 0 || n === trials) {
        stayCurve.push(stayWins / n);
        switchCurve.push(switchWins / n);
        randomCurve.push(randomWins / n);
        curveX.push(n);
      }
    }
    options.onProgress?.(end, trials);
    if (options.signal?.aborted) return null;
    if (end < trials) await new Promise<void>((res) => setTimeout(res, 0));
  }

  return {
    trials,
    doorCount,
    stayWins,
    switchWins,
    randomWins,
    stayCurve,
    switchCurve,
    randomCurve,
    curveX,
  };
}
