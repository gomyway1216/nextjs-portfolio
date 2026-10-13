/**
 * Measures what the medal pusher gives back, for tuning it.
 *
 *   npx tsx scripts/medal-pusher-tune.ts [seeds] [medals]
 *
 * It plays the real machine (engine, session and lottery as they are in
 * src/components/game/MedalPusher) in each of the ways listed in PLAYS, over
 * `seeds` machines of `medals` medals each after a warm-up, and prints one
 * table: how often a medal starts a spin, how often the hold is full, and the
 * return with average luck on the screen. Defaults: 12 seeds, 3,000 medals.
 * Thirty-six seeds bring the error on a return down to about 0.15 of a point,
 * and take some ten minutes on a dozen cores.
 *
 * What is tuned is two things, and the table says what they are set to:
 *
 *   CHECKERS.halfWidth (engine.ts)  how wide a START slot is, which is how
 *                                   often a medal starts a spin
 *   SPIN_TABLE (lottery.ts)         how often a spin wins a line, which is
 *                                   what a spin is worth
 *
 * The return is `front × (1 + spins × spinValue + gold × CHANCE_BONUS)` per
 * medal played, as the Simulation tab has it: the share of medals that leave
 * by the front, and the exact average of what each spin pays. So the two
 * trade against each other: narrow the slots to two thirds of the spins and
 * a spin has to be worth half as much again.
 *
 * Each machine is played in a process of its own, as many at once as there
 * are cores to spare.
 */

import { spawn } from 'node:child_process';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CHECKERS, LUCKY, aimArm, luckySlot, seededRng } from '../src/components/game/MedalPusher/engine';
import { CHANCE_BONUS, JACKPOT_START, SPIN_TABLE, SPIN_TOTAL, chanceSpinValue, spinValue } from '../src/components/game/MedalPusher/lottery';
import { MAX_STOCK, advance, createSession, insert, isBusy, type SessionEvent } from '../src/components/game/MedalPusher/session';
import { WARM_UP, aimAt, type AimId } from '../src/components/game/MedalPusher/sim';

/**
 * A way of playing: how the medals are aimed, and how many a second are fed.
 * `held` feeds both rails as fast as their slots take them. `chase` aims
 * both rails at a START slot's column instead: the one the lucky lamp is on
 * now, or the one it will be on when a medal fed now is likeliest to reach
 * the lip, which is half a minute on. `rush` plays for chance time: both
 * rails flat out until the hold has been found full and for as long as
 * chance time lasts, and then nothing until the hold is empty again.
 */
interface Play {
  id: string;
  aim: AimId;
  pace: number;
  held?: boolean;
  chase?: 'now' | 'ahead';
  rush?: boolean;
}

/** Seconds a medal fed down the middle most often takes to reach the lip. Half of them take between 23 and 49. */
const TRANSIT = 35;

export const PLAYS: readonly Play[] = [
  { id: 'middle, 0.5 a second', aim: 'centre', pace: 0.5 },
  { id: 'middle, 1 a second', aim: 'centre', pace: 1 },
  { id: 'middle, 2 a second', aim: 'centre', pace: 2 },
  { id: 'middle, 5 a second', aim: 'centre', pace: 5 },
  { id: 'middle, both held', aim: 'centre', pace: 11, held: true },
  { id: 'anywhere, 2 a second', aim: 'anywhere', pace: 2 },
  { id: 'beside, 2 a second', aim: 'beside', pace: 2 },
  { id: 'edges, 2 a second', aim: 'edges', pace: 2 },
  { id: 'chase the lamp where it is, 2 a second', aim: 'centre', pace: 2, chase: 'now' },
  { id: 'chase the lamp where it will be, 2 a second', aim: 'centre', pace: 2, chase: 'ahead' },
  { id: 'chase the lamp where it will be, 0.5 a second', aim: 'centre', pace: 0.5, chase: 'ahead' },
  { id: 'fill the hold, feed the rush, then wait', aim: 'centre', pace: 11, held: true, rush: true },
];

const DT = 1 / 60;

/** What one machine did, per medal played after the warm-up. */
interface Run {
  spins: number;
  through: number;
  wasted: number;
  gold: number;
  chances: number;
  full: number;
  front: number;
  steady: number;
}

/** Plays one machine one way and counts. */
function play(way: Play, seed: number, medals: number): Run {
  const session = createSession(seed, { balls: 0, quickPick: true });
  session.credits = Number.MAX_SAFE_INTEGER;
  const pick = seededRng(seed * 7 + 1);
  const interval = 1 / way.pace;
  let clock = interval;
  let fed = 0;
  let start: { inserted: number; won: number; lost: number; spins: number; hits: number; wasted: number; gold: number } | null = null;
  let chances = 0;
  let gildedAt = 0;
  let full = 0;
  let steps = 0;
  const events: SessionEvent[] = [];
  let filling = true;
  const feedOne = (): boolean => {
    const aimed = aimAt(way.aim, fed, pick);
    const arm = aimed.arm;
    const x = way.chase ? CHECKERS.positions[luckySlot(session.machine.time + (way.chase === 'ahead' ? TRANSIT : 0))] : aimed.x;
    if (session.machine.waits[arm] > 1e-9) return false;
    // The right arm is pointed first so that the left may come as far over as it reaches, and then again in case the left was in its way.
    aimArm(session.machine, arm, x);
    if (!insert(session, arm)) return false;
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
      feedOne();
      if (session.inserted < WARM_UP + medals) feedOne();
    } else if (clock >= interval && feedOne()) {
      clock -= interval;
    }
    events.length = 0;
    advance(session, DT, events);
    clock += DT;
    if (start) {
      steps += 1;
      if (session.stock >= MAX_STOCK) full += 1;
      for (const event of events) if (event.type === 'chanceStart') chances += 1;
    }
  }
  for (let i = 0; i < 90 * 60 && isBusy(session); i++) advance(session, DT);
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
    chances: chances / played,
    full: full / Math.max(1, steps),
    front,
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
  const jobs: { way: number; seed: number }[] = [];
  // The slow ways first: they take longest, so they should not be what is left to finish alone.
  for (let way = 0; way < PLAYS.length; way++) for (let n = 0; n < seeds; n++) jobs.push({ way, seed: 1011 * (n + 1) });
  const runs: Run[][] = PLAYS.map(() => []);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++];
      runs[job.way].push(await inAProcess(script, job.way, job.seed, medals));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, cpus().length - 2) }, worker));

  const pct = (value: number, digits = 1): string => (value * 100).toFixed(digits);
  const chance = (tier: keyof typeof SPIN_TABLE): string => `${tier} ${pct(SPIN_TABLE[tier] / SPIN_TOTAL, 2)}%`;
  console.log(`START slots: half-width ${CHECKERS.halfWidth} at ${CHECKERS.positions.join(', ')}, ${CHECKERS.wingWidth} with their wings open; the lucky lamp steps every ${LUCKY.dwell} s`);
  console.log(`a spin: ${(['small', 'big', 'seven', 'miss'] as const).map(chance).join(', ')}; worth ${spinValue(JACKPOT_START).toFixed(5)} medals, a gold one ${chanceSpinValue(JACKPOT_START).toFixed(5)}`);
  console.log(`${seeds} machines of ${medals} medals each way\n`);
  console.log('| Play | Spins per 100 | Through a slot | Wasted on a full hold | Gold spins | Chance times per 1,000 | Hold full | Out by the front | Return |');
  console.log('|---|---|---|---|---|---|---|---|---|');
  PLAYS.forEach((way, index) => {
    const of = (pickOne: (run: Run) => number): number[] => runs[index].map(pickOne);
    const steady = of((run) => run.steady);
    console.log(
      `| ${way.id} | ${pct(mean(of((run) => run.spins)))} | ${pct(mean(of((run) => run.through)))} | ${pct(mean(of((run) => run.wasted)))} | ${pct(mean(of((run) => run.gold)))} | ${(mean(of((run) => run.chances)) * 1000).toFixed(1)} | ${pct(mean(of((run) => run.full)))}% | ${pct(mean(of((run) => run.front)))}% | ${pct(mean(steady), 2)}% ± ${pct(spread(steady), 2)} (best ${pct(Math.max(...steady))}) |`,
    );
  });
}

void main();
