/**
 * Monty Hall problem engine.
 *
 * 3 doors. One has a prize, two have goats. Player picks a door, the host
 * (who knows where the prize is) opens a different door revealing a goat, then
 * the player chooses to stay or switch. Counter-intuitive result: switching
 * wins with probability 2/3, staying with probability 1/3.
 */

export const DOOR_COUNT = 3;
export type Door = 0 | 1 | 2;

export interface Round {
  prizeDoor: Door;
  pickedDoor: Door;
  openedDoor: Door;
}

/**
 * Host opens a door that is (a) not the player's pick and (b) not the prize
 * door. If the player picked the prize, the host has 2 valid doors and picks
 * uniformly; otherwise there is exactly one valid door.
 */
export function pickHostDoor(prizeDoor: Door, pickedDoor: Door, rng: () => number = Math.random): Door {
  const options: Door[] = [];
  for (let d = 0 as Door; d < DOOR_COUNT; d = (d + 1) as Door) {
    if (d !== prizeDoor && d !== pickedDoor) options.push(d);
  }
  return options[Math.floor(rng() * options.length)];
}

export function otherDoor(pickedDoor: Door, openedDoor: Door): Door {
  for (let d = 0 as Door; d < DOOR_COUNT; d = (d + 1) as Door) {
    if (d !== pickedDoor && d !== openedDoor) return d;
  }
  // Unreachable for valid input — fail loud.
  throw new Error('otherDoor: no remaining door');
}

export function randomDoor(rng: () => number = Math.random): Door {
  return Math.floor(rng() * DOOR_COUNT) as Door;
}

export function playRound(pickedDoor: Door, rng: () => number = Math.random): Round {
  const prizeDoor = randomDoor(rng);
  const openedDoor = pickHostDoor(prizeDoor, pickedDoor, rng);
  return { prizeDoor, pickedDoor, openedDoor };
}

export type Strategy = 'stay' | 'switch' | 'random';

export function applyStrategy(round: Round, strategy: Strategy, rng: () => number = Math.random): Door {
  switch (strategy) {
    case 'stay':
      return round.pickedDoor;
    case 'switch':
      return otherDoor(round.pickedDoor, round.openedDoor);
    case 'random':
      return rng() < 0.5 ? round.pickedDoor : otherDoor(round.pickedDoor, round.openedDoor);
  }
}

export function won(round: Round, finalDoor: Door): boolean {
  return finalDoor === round.prizeDoor;
}

// ---------- Simulation ----------

export interface SimSummary {
  trials: number;
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
}

export async function runMontyCarloAsync(
  trials: number,
  options: SimOptions = {},
  rng: () => number = Math.random,
): Promise<SimSummary | null> {
  if (!Number.isInteger(trials) || trials <= 0) {
    throw new Error('runMontyCarloAsync: trials must be a positive integer');
  }
  const chunkSize = options.chunkSize ?? 500;
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
      const picked = randomDoor(rng);
      const round = playRound(picked, rng);
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
    stayWins,
    switchWins,
    randomWins,
    stayCurve,
    switchCurve,
    randomCurve,
    curveX,
  };
}
