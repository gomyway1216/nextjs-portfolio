/**
 * Measures what the medal pusher gives back, for tuning it.
 *
 *   npx tsx scripts/medal-pusher-tune.ts [seeds] [medals] [only]
 *
 * It plays the real machine (engine, session and lottery as they are in
 * src/components/game/MedalPusher: the field, the hopper and the lifts that
 * pay onto it, the jewels, the roulette and its bowls) in each of the ways
 * listed in PLAYS, over `seeds` machines of `medals` medals each after a
 * warm-up, and prints one table: how often a medal starts a spin, how many of
 * the spins are gold and how many of those the lucky lamp made so, how often
 * chance time begins, how often the hold is full, and the return with average
 * luck on the screen. Defaults: 12 seeds, 3,000 medals. `only` keeps the ways
 * whose name has that text in it. Thirty-six seeds bring the error on a
 * return down to about 0.2 of a point, and the whole table then takes some
 * twenty-five minutes on a dozen cores: the slow ways are most of it.
 *
 * What is tuned is two things, and the table says what they are set to:
 *
 *   CHECKERS.wingWidth (engine.ts)  how wide a START pocket takes medals
 *                                   while its wings are open, which is what
 *                                   fast play gets back for filling the hold
 *   SPIN_TABLE (lottery.ts)         how often a spin wins a line, which is
 *                                   what a spin is worth
 *
 * `CHECKERS.halfWidth`, how wide a pocket is with its wings shut, is how
 * often a medal starts a spin. It is left where it is.
 *
 * The return is `front × (1 + spins × spinValue + gold × CHANCE_BONUS)` per
 * medal played, as the Simulation tab has it (`steadyReturn` in sim.ts): the
 * share of medals that leave by the front, and the exact average of what
 * each spin pays, which counts the jewel a treasure line lets go as what it
 * pays once it is collected. The machines start with no ball and no jewel on
 * the field, as the Simulation tab's do: one left there is a gift.
 *
 * Each machine is played in a process of its own, as many at once as there
 * are cores to spare. With TUNE_RUNS set to a file's name, what every machine
 * did is written there as JSON as well.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CHECKERS, LUCKY, aimArm, luckySlot, seededRng, type Arm } from '../src/components/game/MedalPusher/engine';
import { CHANCE_BONUS, JACKPOT_START, JEWEL_SPIN_VALUE, SPIN_TABLE, SPIN_TOTAL, chanceSpinValue, spinValue } from '../src/components/game/MedalPusher/lottery';
import { MAX_STOCK, advance, createSession, insert, isBusy, type SessionEvent } from '../src/components/game/MedalPusher/session';
import { AIM_IDS, WARM_UP, aimAt, type AimId } from '../src/components/game/MedalPusher/sim';

/**
 * A way of playing: how the medals are aimed, and how many a second are fed.
 * `held` feeds both rails as fast as their slots take them. `chase` aims
 * both rails at a START pocket's column instead: the one the lucky lamp is on
 * now, or the one it will be on when a medal fed now is likeliest to reach
 * the lip, which is half a minute on. `rush` plays for chance time: both
 * rails flat out until the hold has been found full and for as long as
 * chance time lasts, and then nothing until the hold is empty again.
 */
export interface Play {
  id: string;
  aim: AimId;
  pace: number;
  held?: boolean;
  chase?: 'now' | 'ahead';
  rush?: boolean;
}

/** About how many seconds the middle one of the medals fed down the middle takes to reach the lip. Half of them take between 24 and 53, and one in ten two minutes. */
const TRANSIT = 35;

/** What each way of aiming is called in the table. */
const AIM_NAMES: Record<AimId, string> = { centre: 'middle', anywhere: 'anywhere', beside: 'beside', edges: 'edges' };
/** Medals a second between the two rails, for every way of aiming. */
const PACES = [0.5, 1, 2, 5] as const;

export const PLAYS: readonly Play[] = [
  ...AIM_IDS.flatMap((aim): Play[] => [
    ...PACES.map((pace): Play => ({ id: `${AIM_NAMES[aim]}, ${pace} a second`, aim, pace })),
    { id: `${AIM_NAMES[aim]}, both held`, aim, pace: 11, held: true },
  ]),
  { id: 'chase the lamp where it is, 2 a second', aim: 'centre', pace: 2, chase: 'now' },
  { id: 'chase the lamp where it will be, 2 a second', aim: 'centre', pace: 2, chase: 'ahead' },
  { id: 'chase the lamp where it will be, 0.5 a second', aim: 'centre', pace: 0.5, chase: 'ahead' },
  { id: 'fill the hold, feed the rush, then wait', aim: 'centre', pace: 11, held: true, rush: true },
];

const DT = 1 / 60;

/** What one machine did, per medal played after the warm-up. */
export interface Run {
  spins: number;
  through: number;
  wasted: number;
  gold: number;
  /** Medals that held a gold spin because the pocket they went through was the lit one, the wings being shut. */
  lamp: number;
  chances: number;
  full: number;
  front: number;
  steady: number;
}

/** Plays one machine one way and counts. */
export function play(way: Play, seed: number, medals: number): Run {
  // No balls and no jewels to begin with, and a player who picks a chest the moment it is offered: the Simulation tab's machine.
  const session = createSession(seed, { balls: 0, jewels: 0, quickPick: true });
  session.credits = Number.MAX_SAFE_INTEGER;
  const pick = seededRng(seed * 7 + 1);
  const interval = 1 / way.pace;
  let clock = interval;
  let fed = 0;
  let start: { inserted: number; won: number; lost: number; spins: number; hits: number; wasted: number; gold: number } | null = null;
  let chances = 0;
  let lamp = 0;
  /** For each medal on its way to a pocket, the oldest first: whether the lucky lamp alone had lit its pocket as it came over. */
  const byLamp: boolean[] = [];
  let gildedAt = 0;
  let full = 0;
  let steps = 0;
  const events: SessionEvent[] = [];
  let filling = true;
  // The spot each medal on a rail is meant for, rail by rail, in the order they were fed.
  const meant: [number[], number[]] = [[], []];
  /**
   * A medal drops where its arm's tip is when it leaves it, a roll after it was fed. So before every step each
   * arm is pointed where the medal that leaves it next is meant to drop, as the Simulation tab's player does.
   */
  const holdArms = (): void => {
    for (const arm of [0, 1] as const) {
      const onRail = session.machine.rolling.reduce((count, medal) => count + (medal.arm === arm ? 1 : 0), 0);
      meant[arm].splice(0, meant[arm].length - onRail);
      if (meant[arm].length > 0) aimArm(session.machine, arm, meant[arm][0]);
    }
  };
  /** Feeds the next medal: into the rail its way of aiming gives it by turns, or into `arm` when both buttons are held. */
  const feedOne = (arm?: Arm): boolean => {
    const aimed = aimAt(way.aim, arm ?? fed, pick);
    const rail = aimed.arm;
    const x = way.chase ? CHECKERS.positions[luckySlot(session.machine.time + (way.chase === 'ahead' ? TRANSIT : 0))] : aimed.x;
    if (session.machine.waits[rail] > 1e-9) return false;
    if (!insert(session, rail)) return false;
    meant[rail].push(x);
    fed += 1;
    return true;
  };
  while (session.inserted < WARM_UP + medals) {
    if (!start && session.inserted >= WARM_UP) start = { inserted: session.inserted, won: session.won, lost: session.lost, spins: session.spins, hits: session.hits, wasted: session.wasted, gold: session.gilded + session.lucky - session.gold };
    if (way.rush) {
      // Feeding stops when chance time is over, and starts again when the hold is empty and the screen is still.
      if (filling && !session.rush && session.gilded > gildedAt) filling = false;
      else if (!filling && session.stock === 0 && !session.spin && !session.bonus) {
        filling = true;
        gildedAt = session.gilded;
      }
    }
    if (way.held && !filling) {
      // Waiting.
    } else if (way.held) {
      // Both buttons held: each rail takes a medal whenever its slot is free.
      feedOne(way.aim === 'anywhere' ? undefined : 0);
      if (session.inserted < WARM_UP + medals) feedOne(way.aim === 'anywhere' ? undefined : 1);
    } else if (clock >= interval && feedOne()) {
      clock -= interval;
    }
    holdArms();
    events.length = 0;
    // One step is one of the engine's own pieces, so the wings stand through it as they stood when it began.
    const wings = session.rush;
    advance(session, DT, events);
    clock += DT;
    if (start) {
      steps += 1;
      if (session.stock >= MAX_STOCK) full += 1;
    }
    for (const event of events) {
      // What lit a medal's pocket was settled as it came over the lip, and what it holds when it drops, a ride later.
      // The medals drop in the order they came over, so each one's word is the oldest that is waiting.
      if (event.type === 'riding') byLamp.push(event.lit && !wings);
      else if (event.type === 'checker' && byLamp.shift() && event.lucky && start) lamp += 1;
      else if (event.type === 'chanceStart' && start) chances += 1;
    }
  }
  for (let i = 0; i < 90 * 60 && isBusy(session); i++) {
    holdArms();
    advance(session, DT);
  }
  const from = start ?? { inserted: 0, won: 0, lost: 0, spins: 0, hits: 0, wasted: 0, gold: 0 };
  const played = session.inserted - from.inserted;
  const won = session.won - from.won;
  const lost = session.lost - from.lost;
  const spins = (session.spins - from.spins) / played;
  const gold = (session.gilded + session.lucky - session.gold - from.gold) / played;
  const front = won / (won + lost);
  return {
    spins,
    through: (session.hits - from.hits) / played,
    wasted: (session.wasted - from.wasted) / played,
    gold,
    lamp: lamp / played,
    chances: chances / played,
    full: full / Math.max(1, steps),
    front,
    // The Simulation tab's sum (`steadyReturn` in sim.ts): a spin's exact average has the jewels in it.
    steady: front * (1 + spins * spinValue(JACKPOT_START) + gold * CHANCE_BONUS),
  };
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const spread = (values: number[]): number => {
  if (values.length < 2) return 0;
  const middle = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - middle) ** 2, 0) / (values.length - 1) / values.length);
};

/** Plays one machine in a process of its own and gives back what it printed. */
function inAProcess(script: string, way: number, seed: number, medals: number): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, script, '--one', String(way), String(seed), String(medals)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(text) as Run) : reject(new Error(`a machine stopped with ${code}`))));
  });
}

async function main(): Promise<void> {
  const script = fileURLToPath(import.meta.url);
  const args = process.argv.slice(2);
  if (args[0] === '--one') {
    process.stdout.write(JSON.stringify(play(PLAYS[Number(args[1])], Number(args[2]), Number(args[3]))));
    return;
  }
  const seeds = Number(args[0] ?? 12);
  const medals = Number(args[1] ?? 3000);
  const only = args[2] ?? '';
  const ways = PLAYS.map((_, way) => way).filter((way) => PLAYS[way].id.includes(only));
  const jobs: { way: number; seed: number }[] = [];
  for (const way of ways) for (let n = 0; n < seeds; n++) jobs.push({ way, seed: 1011 * (n + 1) });
  // The slow ways first: they take longest, so they should not be what is left to finish alone.
  jobs.sort((a, b) => PLAYS[a.way].pace - PLAYS[b.way].pace);
  const runs: Run[][] = PLAYS.map(() => []);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++];
      runs[job.way].push(await inAProcess(script, job.way, job.seed, medals));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, cpus().length - 2) }, worker));
  if (process.env.TUNE_RUNS) writeFileSync(process.env.TUNE_RUNS, JSON.stringify(ways.map((way) => ({ id: PLAYS[way].id, runs: runs[way] }))));

  const pct = (value: number, digits = 1): string => (value * 100).toFixed(digits);
  const chance = (tier: keyof typeof SPIN_TABLE): string => `${tier} ${SPIN_TABLE[tier]} in ${SPIN_TOTAL} (${pct(SPIN_TABLE[tier] / SPIN_TOTAL, 3)}%)`;
  console.log(`START pockets: half-width ${CHECKERS.halfWidth} at ${CHECKERS.positions.join(', ')}, ${CHECKERS.wingWidth} with their wings open; the lucky lamp steps every ${LUCKY.dwell} s`);
  console.log(`a spin: ${(['small', 'big', 'seven', 'miss'] as const).map(chance).join(', ')}`);
  console.log(`each winning line ${Number((SPIN_TABLE.small / SPIN_TOTAL / 0.04).toFixed(4))} times as likely as it was at 40, 15 and 7 in 1,000`);
  console.log(`a spin is worth ${spinValue(JACKPOT_START).toFixed(5)} medals, a gold one ${chanceSpinValue(JACKPOT_START).toFixed(5)}; ${JEWEL_SPIN_VALUE.toFixed(5)} of either is its jewel`);
  console.log(`${seeds} machines of ${medals} medals each way; ± is the standard error of their mean\n`);
  console.log('| Play | Spins per 100 | Through a pocket | Wasted on a full hold | Gold spins | Spins the lamp made gold | Chance times per 1,000 | Hold full | Out by the front | Return |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const way of ways) {
    const of = (pickOne: (run: Run) => number): number[] => runs[way].map(pickOne);
    const steady = of((run) => run.steady);
    const spins = mean(of((run) => run.spins));
    console.log(
      `| ${PLAYS[way].id} | ${pct(spins)} | ${pct(mean(of((run) => run.through)))} | ${pct(mean(of((run) => run.wasted)))} | ${pct(mean(of((run) => run.gold)))} | ${pct(mean(of((run) => run.lamp)) / spins)}% | ${(mean(of((run) => run.chances)) * 1000).toFixed(1)} | ${pct(mean(of((run) => run.full)))}% | ${pct(mean(of((run) => run.front)))}% | ${pct(mean(steady), 2)}% ± ${pct(spread(steady), 2)} (best ${pct(Math.max(...steady))}) |`,
    );
  }
}

// Run as a script, and not when another script borrows `play`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
