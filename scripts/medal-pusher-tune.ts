/**
 * Measures what the medal pusher gives back, for tuning it.
 *
 *   npx tsx scripts/medal-pusher-tune.ts [seeds] [medals] [only]
 *   npx tsx scripts/medal-pusher-tune.ts --first [machines] [hundreds]
 *
 * It plays the real machine (engine, session and lottery as they are in
 * src/components/game/MedalPusher: the field, the hopper and the tubes that
 * pay onto it, the jewels, the roulette and its bowls) in each of the ways
 * listed in PLAYS, over `seeds` machines of `medals` medals each after a
 * warm-up, and prints one table. Defaults: 12 seeds, 3,000 medals. `only`
 * keeps the ways whose name has that text in it. Thirty-six seeds bring the
 * error on a return down to about a third of a point, and the whole table then
 * takes some forty minutes on a dozen cores, with medals as small as they are
 * and half as many again on the tables: the slow ways are most of it.
 *
 * What a row says, per 100 medals fed unless it is a share:
 *
 *   Spins                   spins the screen played
 *   Through a pocket        medals that dropped into a START pocket
 *   Wasted on a full hold   those of them that found the hold full
 *   Gold spins              spins that were gold, and their share of the spins
 *   Spins the lamp made gold  the share of the spins that were gold because
 *                           the lucky lamp was on their pocket, wings shut
 *   Chance times            per 1,000 medals fed
 *   Hold full               the share of the time the hold was full
 *   Field's share           of the medals that left the field, the share that
 *                           left it by the front, over the tray: what the
 *                           table alone gives back
 *   Lotteries pay on        medals the screen's games put on the field with
 *                           average luck: every spin at its exact average,
 *                           every gold spin at what being gold adds, and
 *                           what the jackpot grows by, which is all paid in
 *                           the end
 *   Back from the lotteries  how many of those come back to the player: the
 *                           field's share of them, which is the return less
 *                           the field's share
 *   Return                  medals back per 100 fed, with average luck
 *
 * What is tuned is three things, and the table says what they are set to:
 *
 *   FIELD.sideReach (engine.ts)     how far the side holes reach round the
 *                                   front corners, which is the field's share
 *   SPIN_TABLE, BOARD, CHESTS,      how often a spin wins a line and what the
 *   JACKPOT_START, JACKPOT_STEP     line's game pays, which is what a spin is
 *   (lottery.ts)                    worth
 *   CHECKERS.wingWidth (engine.ts)  how wide a START pocket takes medals
 *                                   while its wings are open
 *
 * `CHECKERS.halfWidth`, how wide a pocket is with its wings shut, is how
 * often a medal starts a spin. It is left where it is.
 *
 * The return is `front × (1 + spins × spinValue + gold × CHANCE_BONUS +
 * JACKPOT_GROWTH)` per medal played, as the Simulation tab has it
 * (`steadyReturn` in sim.ts): the share of medals that leave by the front,
 * and the exact average of everything the machine pays. A spin's average
 * counts the jewel a treasure line lets go as what it pays once it is
 * collected, and the jackpot as it stands when it starts; the medals the
 * jackpot grows by are counted as they are played, since every one of them is
 * paid when the jackpot is won. The machines start with no ball and no jewel
 * on the field, as the Simulation tab's do: one left there is a gift.
 *
 * `--first` measures that gift. It plays the first `hundreds` hundred medals
 * (3) of `machines` new machines (600) the best way, down the middle at a
 * medal every two seconds: as a new machine starts (`START_BALLS`,
 * `START_JEWELS`), with no ball and no jewel on it, and with the two balls
 * and two jewels a new machine once had. It prints what each hundred gave
 * back in fact, with the luck it had.
 *
 * Each machine is played in a process of its own, as many at once as there
 * are cores to spare. With TUNE_RUNS set to a file's name, what every machine
 * did is written there as JSON as well.
 */

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';

import { CHECKERS, FIELD, LUCKY, aimArm, luckySlot, seededRng, type Arm } from '../src/components/game/MedalPusher/engine';
import {
  BOARD,
  BOARD_VALUE,
  CHANCE_BONUS,
  CHESTS,
  CHEST_VALUE,
  JACKPOT_GROWTH,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL_SPIN_VALUE,
  SPIN_TABLE,
  SPIN_TOTAL,
  chanceSpinValue,
  rouletteValue,
  spinValue,
} from '../src/components/game/MedalPusher/lottery';
import { MAX_STOCK, START_BALLS, START_JEWELS, advance, createSession, insert, isBusy, type SessionEvent } from '../src/components/game/MedalPusher/session';
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

/** About how many seconds the middle one of the medals fed down the middle, two a second, takes to reach the lip. Half of them take between 31 and 60, and one in ten more than a minute and a half. */
const TRANSIT = 45;

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
  /** Of the medals that left the field, the share that left it by the front, over the tray. */
  front: number;
  /** Medals the screen's games put on the field with average luck: each spin's exact average, what being gold adds, and what the jackpot grew by. */
  paid: number;
  /** Medals the screen's games put on the field in fact, with the luck this machine had. */
  paidInFact: number;
  /** Jackpots this machine paid. */
  jackpots: number;
  steady: number;
}

/**
 * Keeps each arm pointed where the medal that leaves it next is meant to
 * drop. A medal drops where its arm's tip is when it leaves it, a roll after
 * it was fed, so this is done before every step, as the Simulation tab's
 * player does it. `meant` is the spot each medal on a rail is meant for, rail
 * by rail, in the order they were fed.
 */
function holdArms(session: ReturnType<typeof createSession>, meant: [number[], number[]]): void {
  for (const arm of [0, 1] as const) {
    const onRail = session.machine.rolling.reduce((count, medal) => count + (medal.arm === arm ? 1 : 0), 0);
    meant[arm].splice(0, meant[arm].length - onRail);
    if (meant[arm].length > 0) aimArm(session.machine, arm, meant[arm][0]);
  }
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
  let start: { inserted: number; won: number; lost: number; spins: number; hits: number; wasted: number; gold: number; paidOut: number; jackpots: number } | null = null;
  let chances = 0;
  let lamp = 0;
  /** For each medal on its way to a pocket, the oldest first: whether the lucky lamp alone had lit its pocket as it came over. */
  const byLamp: boolean[] = [];
  let gildedAt = 0;
  let full = 0;
  let steps = 0;
  const events: SessionEvent[] = [];
  let filling = true;
  const meant: [number[], number[]] = [[], []];
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
    if (!start && session.inserted >= WARM_UP) {
      start = { inserted: session.inserted, won: session.won, lost: session.lost, spins: session.spins, hits: session.hits, wasted: session.wasted, gold: session.gilded + session.lucky - session.gold, paidOut: session.paidOut, jackpots: session.jackpots };
    }
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
    holdArms(session, meant);
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
    holdArms(session, meant);
    advance(session, DT);
  }
  const from = start ?? { inserted: 0, won: 0, lost: 0, spins: 0, hits: 0, wasted: 0, gold: 0, paidOut: 0, jackpots: 0 };
  const played = session.inserted - from.inserted;
  const won = session.won - from.won;
  const lost = session.lost - from.lost;
  const spins = (session.spins - from.spins) / played;
  const gold = (session.gilded + session.lucky - session.gold - from.gold) / played;
  const front = won / (won + lost);
  // The Simulation tab's sum (`steadyReturn` in sim.ts): a spin's exact average has the jewels in it, and the jackpot's growth is paid in the end.
  const paid = spins * spinValue(JACKPOT_START) + gold * CHANCE_BONUS + JACKPOT_GROWTH;
  return {
    spins,
    through: (session.hits - from.hits) / played,
    wasted: (session.wasted - from.wasted) / played,
    gold,
    lamp: lamp / played,
    chances: chances / played,
    full: full / Math.max(1, steps),
    front,
    paid,
    paidInFact: (session.paidOut - from.paidOut) / played,
    jackpots: session.jackpots - from.jackpots,
    steady: front * (1 + paid),
  };
}

/** What the first hundreds of one new machine gave back, hundred by hundred. */
export interface Opening {
  /** Medals won while each hundred was being fed. */
  won: number[];
  /** The hundred in which a ball first went over the front, from 0, or −1 if none did. */
  ball: number;
}

/**
 * Plays the first `hundreds` hundred medals of a new machine the best way,
 * down the middle at a medal every two seconds, with `balls` balls and
 * `jewels` jewels lying on it at the start, and counts what came back while
 * each hundred was being fed. A hundred ends as the first medal of the next
 * falls due.
 */
export function opening(seed: number, hundreds: number, balls: number, jewels: number): Opening {
  const session = createSession(seed, { balls, jewels, quickPick: true });
  session.credits = Number.MAX_SAFE_INTEGER;
  const interval = 2;
  const out: Opening = { won: [], ball: -1 };
  let clock = interval;
  let counted = 0;
  const meant: [number[], number[]] = [[], []];
  while (out.won.length < hundreds) {
    if (clock >= interval) {
      const feed = aimAt('centre', session.inserted, () => 0.5);
      if (session.machine.waits[feed.arm] <= 1e-9 && insert(session, feed.arm)) {
        meant[feed.arm].push(feed.x);
        clock -= interval;
      }
    }
    holdArms(session, meant);
    advance(session, DT);
    clock += DT;
    if (out.ball < 0 && session.roulettes + session.balls > 0) out.ball = out.won.length;
    if (session.inserted === (out.won.length + 1) * 100 && clock >= interval) {
      out.won.push(session.won - counted);
      counted = session.won;
    }
  }
  return out;
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;
const spread = (values: number[]): number => {
  if (values.length < 2) return 0;
  const middle = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - middle) ** 2, 0) / (values.length - 1) / values.length);
};

/** Runs this script again in a process of its own with `args` and gives back what it printed, as JSON. */
function inAProcess<T>(script: string, args: (string | number)[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, script, ...args.map(String)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (chunk: Buffer) => (text += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(text) as T) : reject(new Error(`a machine stopped with ${code}`))));
  });
}

const pct = (value: number, digits = 1): string => (value * 100).toFixed(digits);

/** What the machine is set to: the table, the pockets and the lottery, as the table's heading. */
function printSettings(): void {
  const chance = (tier: keyof typeof SPIN_TABLE): string => `${tier} ${SPIN_TABLE[tier]} in ${SPIN_TOTAL} (${pct(SPIN_TABLE[tier] / SPIN_TOTAL, 3)}%)`;
  console.log(`the field: sides open from depth ${FIELD.sideOpenFrom} of ${FIELD.depth}; the side holes reach ${FIELD.sideReach} round each front corner, so the front edge pays over its middle ${FIELD.width - 2 * FIELD.sideReach} of ${FIELD.width}`);
  console.log(`START pockets: half-width ${CHECKERS.halfWidth} at ${CHECKERS.positions.join(', ')}, ${CHECKERS.wingWidth} with their wings open; the lucky lamp steps every ${LUCKY.dwell} s`);
  console.log(`a spin: ${(['small', 'big', 'seven', 'miss'] as const).map(chance).join(', ')}`);
  console.log(`the board pays ${BOARD_VALUE} a roll (${BOARD.join(', ')}), a chest ${CHEST_VALUE} (${CHESTS.join(', ')}), a ball's roulette ${rouletteValue(JACKPOT_START).toFixed(3)} with the jackpot at its start of ${JACKPOT_START}`);
  console.log(`a spin is worth ${spinValue(JACKPOT_START).toFixed(5)} medals, a gold one ${chanceSpinValue(JACKPOT_START).toFixed(5)}; ${JEWEL_SPIN_VALUE.toFixed(5)} of either is its jewel`);
  console.log(`the jackpot grows by a medal for every ${JACKPOT_STEP} played: ${JACKPOT_GROWTH} medals a medal, paid when it is won`);
  console.log(`a new machine starts with ${START_BALLS} ball${START_BALLS === 1 ? '' : 's'} and ${START_JEWELS} jewel${START_JEWELS === 1 ? '' : 's'} on the field`);
}

/** The table: every way of playing over `seeds` machines of `medals` medals. */
async function table(script: string, seeds: number, medals: number, only: string): Promise<void> {
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
      runs[job.way].push(await inAProcess<Run>(script, ['--one', job.way, job.seed, medals]));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, cpus().length - 2) }, worker));
  if (process.env.TUNE_RUNS) writeFileSync(process.env.TUNE_RUNS, JSON.stringify(ways.map((way) => ({ id: PLAYS[way].id, runs: runs[way] }))));

  printSettings();
  console.log(`${seeds} machines of ${medals} medals each way; ± is the standard error of their mean\n`);
  console.log(
    '| Play | Spins per 100 | Through a pocket | Wasted on a full hold | Gold spins | Gold share | Spins the lamp made gold | Chance times per 1,000 | Hold full | Field’s share | Lotteries pay on, per 100 fed | Back from the lotteries, per 100 fed | Return |',
  );
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const way of ways) {
    const of = (pickOne: (run: Run) => number): number[] => runs[way].map(pickOne);
    const steady = of((run) => run.steady);
    const spins = mean(of((run) => run.spins));
    const gold = mean(of((run) => run.gold));
    console.log(
      `| ${PLAYS[way].id} | ${pct(spins)} | ${pct(mean(of((run) => run.through)))} | ${pct(mean(of((run) => run.wasted)))} | ${pct(gold)} | ${pct(gold / spins)}% | ${pct(mean(of((run) => run.lamp)) / spins)}% | ${(mean(of((run) => run.chances)) * 1000).toFixed(1)} | ${pct(mean(of((run) => run.full)))}% | ${pct(mean(of((run) => run.front)))}% | ${pct(mean(of((run) => run.paid)))} | ${pct(mean(of((run) => run.front * run.paid)))} | ${pct(mean(steady), 2)}% ± ${pct(spread(steady), 2)} (best ${pct(Math.max(...steady))}) |`,
    );
  }
  // The average-luck figure against what the machines paid in fact, all of them together. What is between them is
  // the jackpot's growth, which a machine of a few thousand medals seldom lives to see paid, and the balls still on
  // the field when the count ends, which have paid nothing yet.
  const all = ways.flatMap((way) => runs[way]);
  const jackpots = all.reduce((sum, run) => sum + run.jackpots, 0);
  console.log(
    `\nover all ${all.length} machines: the lotteries paid ${pct(mean(all.map((run) => run.paidInFact)), 2)} medals per 100 fed in fact, against ${pct(mean(all.map((run) => run.paid)), 2)} with average luck, of which ${pct(JACKPOT_GROWTH, 2)} is the jackpot's growth, paid only when a jackpot is won; ${jackpots} jackpot${jackpots === 1 ? ' was' : 's were'} won`,
  );
}

/** The first hundreds of new machines, as they start and with nothing lying on them. */
async function first(script: string, machines: number, hundreds: number): Promise<void> {
  const workers = Math.max(1, cpus().length - 2);
  const per = Math.ceil(machines / workers);
  const measure = async (balls: number, jewels: number): Promise<Opening[]> => {
    const batches: Promise<Opening[]>[] = [];
    for (let from = 0; from < machines; from += per) batches.push(inAProcess<Opening[]>(script, ['--openings', from, Math.min(machines, from + per), hundreds, balls, jewels]));
    return (await Promise.all(batches)).flat();
  };
  printSettings();
  console.log(`${machines} new machines, played down the middle at a medal every two seconds; medals back while each hundred was fed, in fact, ± the standard error of the mean\n`);
  console.log(`| A new machine with | ${Array.from({ length: hundreds }, (_, h) => `Hundred ${h + 1}`).join(' | ')} | All ${hundreds * 100} | A ball went over in hundred ${Array.from({ length: hundreds }, (_, h) => h + 1).join(', ')} |`);
  console.log(`|---|${'---|'.repeat(hundreds)}---|---|`);
  // As a machine starts now, with nothing lying on it, and as one started while it had a head start: two balls and two jewels.
  const starts: [number, number][] = [[START_BALLS, START_JEWELS]];
  for (const other of [[0, 0], [2, 2]] as [number, number][]) if (!starts.some(([balls, jewels]) => balls === other[0] && jewels === other[1])) starts.push(other);
  for (const [balls, jewels] of starts) {
    const all = await measure(balls, jewels);
    const by = Array.from({ length: hundreds }, (_, h) => all.map((one) => one.won[h]));
    const whole = all.map((one) => one.won.reduce((sum, won) => sum + won, 0) / hundreds);
    console.log(
      `| ${balls} ball${balls === 1 ? '' : 's'}, ${jewels} jewel${jewels === 1 ? '' : 's'} | ${by.map((won) => `${mean(won).toFixed(1)} ± ${spread(won).toFixed(1)}`).join(' | ')} | ${mean(whole).toFixed(1)}% ± ${spread(whole).toFixed(1)} | ${Array.from({ length: hundreds }, (_, h) => `${pct(all.filter((one) => one.ball === h).length / all.length, 0)}%`).join(', ')} |`,
    );
  }
}

async function main(): Promise<void> {
  const script = fileURLToPath(import.meta.url);
  const args = process.argv.slice(2);
  if (args[0] === '--one') {
    process.stdout.write(JSON.stringify(play(PLAYS[Number(args[1])], Number(args[2]), Number(args[3]))));
    return;
  }
  if (args[0] === '--openings') {
    const [from, to, hundreds, balls, jewels] = args.slice(1).map(Number);
    const list: Opening[] = [];
    for (let n = from; n < to; n++) list.push(opening(7919 * (n + 1), hundreds, balls, jewels));
    process.stdout.write(JSON.stringify(list));
    return;
  }
  if (args[0] === '--first') {
    await first(script, Number(args[1] ?? 600), Number(args[2] ?? 3));
    return;
  }
  await table(script, Number(args[0] ?? 12), Number(args[1] ?? 3000), args[2] ?? '');
}

// Run as a script, and not when another script borrows `play`.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) void main();
