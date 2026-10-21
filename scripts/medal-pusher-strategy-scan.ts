/**
 * Scans every way a player can play the Medal Pusher, the real machine as it is (engine, session and lottery of
 * src/components/game/MedalPusher), over many seeded machines at once, one process a machine and play, with each
 * play's 95% interval. It asks whether any way of playing gives back more than the published best: a medal every two
 * seconds down the middle (about 90%; the floor's `bestReturn` in src/lib/medalFloor/games.ts).
 *
 *   npx tsx scripts/medal-pusher-strategy-scan.ts [plays] [medals per machine] [machines] [first seed] [processes]
 *
 * Defaults: the published best (`p0.5`), 10,000 medals a machine after a warm-up of 500, 8 machines, seed 30001, and
 * as many processes as the machine has cores but two, at most ten. Plays are a comma-separated list. A play is
 * written as tokens joined by `/`; what it leaves out is the published best's:
 *
 *   how often     p0.5         a medal every two seconds, the rails by turns (the published best; p2 is two a second)
 *                 held         both feed buttons held down: each rail takes a medal whenever its slot is free
 *                 s1.2:2       two medals (both rails at once) each stroke of the pusher (3.6 s), let go so that they
 *                              land 1.2 s into the stroke (0 is the pusher fully back)
 *                 l4.2:5       five medals each turn of the lucky lamp (three strokes, 10.8 s), landing 4.2 s into it
 *                              (the lamp is on the left pocket for 0-3.6, the middle one for 3.6-7.2, the right for the rest)
 *   where         d5.5         the left rail 5.5 left of the middle, the right rail 5.5 right of it (d0: both down the
 *                              middle, the published aim; d11: at the outer pockets; d22: beside them)
 *                 x33.5        both rails at the one column 33.5 (the middle is 39, the pockets 28, 39 and 50); a column
 *                              only one rail reaches (left of 31, right of 47) is fed by that rail alone
 *                 any          anywhere at all, a new spot every medal (sim.ts `anywhere`)
 *                 chaseN       both rails at the pocket the lucky lamp is on now; chaseA at the one it will be on 34 s on
 *                 left, right  that rail alone
 *   by the edge   e2+12        two a second instead while 12 or more medals lie in the front row of the lower table,
 *                              over the tray (it holds 10 to 13 most of the time); e0.1-10: one in ten seconds while
 *                              10 or fewer do (nothing moves unless it is fed, so a play never waits on the field)
 *   when not      w1.2-2.1     only while a medal fed now would land between 1.2 and 2.1 s into the pusher's stroke
 *                 L4.8-5.7     only while it would land between 4.8 and 5.7 s into the lamp's turn: in the stroke that
 *                              lights the middle pocket, as the pusher is forward
 *                 h2           only while the hold has 2 spins or fewer in it (h0: only while it is empty)
 *                 idle         only while the hold is empty and nothing is on the screen
 *                 tower        while a tower is on its way (in a tube, on an arm or on the pusher), only while the hold is
 *                              empty and nothing is on the screen
 *   chance time   rb           both rails held while chance time lasts (the START wings open), the play's own way else
 *                 rs           nothing while chance time lasts
 *                 fill         scripts/medal-pusher-tune.ts's rush: both rails held until the hold is found full and while
 *                              chance time lasts, then nothing until the hold is empty and the screen still
 *   the screen    still        a cabinet that shows nothing moving (reduced motion): a medal is taken at the lip, not a
 *                              ride later
 *
 * and these stand for many: `aims`, `paces`, `strokes`, `lamps`, `gates`, `front`, `rush`, `windows`, `misc` (see FAMILIES). A play
 * at a pace that has held back (a window or a gate) and may feed again lets the medal it owes go in at once and the next
 * one straight after it, and keeps its pace from there; a timed burst whose moment comes while it holds back is skipped.
 *
 * The return is the Simulation tab's (`steadyReturn` in sim.ts), which the published figures are: the field's share of
 * the medals that left it, times one plus what the screen paid on with average luck (every spin at its exact average
 * with the jackpot at its start, what being gold adds, and the jackpot's growth, all of which is paid in the end). Its
 * interval comes from the spread of 2,500-medal batches by the delta method. What came back in fact (medals over the
 * front per medal fed, with the luck the machines had) is printed beside it; a jackpot of 500 or more makes it far
 * noisier. Exits 1 when any play's interval lies wholly above the published best, or its return above 100%.
 *
 * The scan in tests/unit/components/game/MedalPusher/fixtures/strategy-scan.json was made so, every play on the first
 * pass on the same four machines, and the published best and the plays that came out highest again on twenty others:
 *
 *   npx tsx scripts/medal-pusher-strategy-scan.ts aims,paces,strokes,lamps,gates,front,rush,windows,misc 10000 4 30001 10
 *   npx tsx scripts/medal-pusher-strategy-scan.ts p0.5,p0.5/h3,p0.5/h6 20000 20 40001 10
 *   npx tsx scripts/medal-pusher-strategy-scan.ts p0.2,p0.25,p5/L4.8-5.7,p0.5/still,p1,p3/w1.2-2.1,p0.5/e0.1-10 20000 20 50001 10
 *
 * A first pass takes some five hours at ten processes; each play of the second some fifteen minutes to an hour, the
 * slowest paces the longest, since a machine's time costs the same however few medals are fed in it.
 */

import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';

import { AIM, ARM_REACH, CHECKERS, FALL_TIME, FIELD, LUCKY, MEDAL_RADIUS, MIDDLE, PUSHER, ROLL_TIME, aimArm, armFor, frontPays, luckySlot, seededRng, type Arm, type Machine } from '../src/components/game/MedalPusher/engine';
import { CHANCE_BONUS, JACKPOT_GROWTH, JACKPOT_START, spinValue } from '../src/components/game/MedalPusher/lottery';
import { advance, createSession, insert, type Session } from '../src/components/game/MedalPusher/session';
import { goldStarted } from '../src/components/game/MedalPusher/sim';
import { stackerBusy } from '../src/components/game/MedalPusher/stacker';
import { FLOOR_RULES } from '../src/lib/medalFloor/games';

const DT = 1 / 60;
const WARM_UP = 500;
const BATCH = 2_500;
/** Seconds the lamp takes to come back to the same pocket: one stroke a pocket. */
const LAMP_TURN = LUCKY.dwell * CHECKERS.positions.length;
/** Seconds from a medal being fed to its landing on the pusher: down the rail, then through the air. */
const TO_LAND = ROLL_TIME + FALL_TIME;
/** About how many seconds a medal fed down the middle takes to reach the lip (scripts/medal-pusher-tune.ts `TRANSIT`). */
const TRANSIT = 34;
/** What a spin is worth with average luck, what being gold adds, and what a medal played grows the jackpot by. */
const SPIN = spinValue(JACKPOT_START);
const GOLD = CHANCE_BONUS;
const GROWTH = JACKPOT_GROWTH;

export interface Play {
  /** Medals a second, the rails by turns; or both rails as fast as their slots take medals. */
  pace?: number;
  held?: boolean;
  /** `burst` medals each `period` seconds, let go so that they land `phase` seconds into it. */
  lock?: { period: number; phase: number; burst: number };
  /** Where each rail drops: the left rail's column and the right's, or anywhere, or the lucky lamp's pocket. */
  aim: [number, number] | 'any' | 'chaseN' | 'chaseA';
  rails: 'both' | 'left' | 'right';
  /** Only while a medal fed now would land between these seconds of the pusher's stroke. */
  window?: [number, number];
  /** Only while a medal fed now would land between these seconds of the lucky lamp's turn. */
  lampWindow?: [number, number];
  /** Another pace while at least (`more`) or at most so many medals lie in the front row of the lower table, over the tray. */
  edge?: { pace: number; more: boolean; count: number };
  hold?: number;
  idle?: boolean;
  tower?: boolean;
  rush?: 'burst' | 'stop' | 'fill';
  still?: boolean;
}

interface Job {
  name: string;
  play: Play;
  medals: number;
  seed: number;
}

/** What a stretch of play did. */
interface Counts {
  fed: number;
  won: number;
  lost: number;
  spins: number;
  gold: number;
  hits: number;
  wasted: number;
  lucky: number;
  paidOut: number;
  jackpots: number;
  /** Machine seconds, and the seconds chance time was on. */
  time: number;
  rushTime: number;
}
type Batches = Counts[];

const range = (from: number, to: number, by: number): number[] => Array.from({ length: Math.round((to - from) / by) + 1 }, (_, i) => Math.round((from + by * i) * 1000) / 1000);

/** The plays each family stands for. */
export const FAMILIES: Record<string, string[]> = {
  // Where to drop: both rails mirrored about the middle, one column for both, anywhere, at the edges.
  aims: [
    ...[0, 1, 2, 3, 4, 5.5, 8, 11, 16, 22, 35.4].map((d) => `p0.5/d${d}`),
    ...[37, 35, 33.5, 31, 28].map((x) => `p0.5/x${x}`),
    'p0.5/any',
  ],
  // How fast, down the middle.
  paces: [...[0.2, 0.25, 0.33, 0.4, 0.5, 0.67, 0.8, 1, 1.5, 2, 3, 5].map((p) => `p${p}`), 'held'],
  // Two medals at once each stroke of the pusher (about the published pace), or one, landing at each moment of it.
  strokes: [...range(0, 3.3, 0.3).map((at) => `s${at}:2`), ...range(0, 3, 0.6).map((at) => `s${at}:1`)],
  // Five medals at once each turn of the lucky lamp, landing at each moment of it.
  lamps: range(0, 9.9, 0.9).map((at) => `l${at}:5`),
  // Holding back while the hold is deep, while the screen is busy, or while a tower is on its way.
  gates: ['p0.5/h0', 'p0.5/h1', 'p0.5/h3', 'p0.5/h6', 'p0.5/idle', 'p0.5/tower', 'p1/h0', 'p2/h0', 'p2/h3', 'p5/h0', 'held/h0', 'held/idle'],
  // Feeding faster or slower while the front edge of the lower table is full, or while it is not.
  front: ['p0.5/e2+12', 'p0.5/e0.1+12', 'p0.5/e2-10', 'p0.5/e0.1-10', 'p0.5/e2+13'],
  // Chance time.
  rush: ['p0.5/rb', 'p0.5/rs', 'p1/rb', 'p0.5/h0/rb', 'fill', 'p0.5/idle/rb'],
  // Feeding only while a medal would land in part of the pusher's stroke, or of the lamp's turn.
  windows: ['p2/w1.2-2.1', 'p2/w1.5-2.4', 'p2/w0.9-1.8', 'p2/w0.6-2.4', 'p1/w1.2-2.1', 'p1/w0.9-2.4', 'p3/w1.2-2.1', 'p5/L4.8-5.7', 'p3/L4.5-6.3', 'p5/L4.5-6.3'],
  // The rest: one rail alone, the lamp chased, a still cabinet.
  misc: ['p0.5/left', 'p0.5/right', 'p0.5/chaseN', 'p0.5/chaseA', 'p0.5/still', 'p1/still', 'p2/still', 'p5/still', 'held/still'],
};

/** The play a word names. */
export function parsePlay(word: string): Play {
  const play: Play = { aim: [MIDDLE, MIDDLE], rails: 'both' };
  for (const token of word.split('/')) {
    let match: RegExpMatchArray | null;
    if ((match = token.match(/^p([\d.]+)$/))) play.pace = Number(match[1]);
    else if (token === 'held') play.held = true;
    else if ((match = token.match(/^([sl])([\d.]+):(\d+)$/))) play.lock = { period: match[1] === 's' ? PUSHER.period : LAMP_TURN, phase: Number(match[2]), burst: Number(match[3]) };
    else if ((match = token.match(/^d([\d.]+)$/))) play.aim = [MIDDLE - Number(match[1]), MIDDLE + Number(match[1])];
    else if ((match = token.match(/^x([\d.]+)$/))) play.aim = [Number(match[1]), Number(match[1])];
    else if (token === 'any' || token === 'chaseN' || token === 'chaseA') play.aim = token;
    else if (token === 'left' || token === 'right') play.rails = token;
    else if ((match = token.match(/^w([\d.]+)-([\d.]+)$/))) play.window = [Number(match[1]), Number(match[2])];
    else if ((match = token.match(/^L([\d.]+)-([\d.]+)$/))) play.lampWindow = [Number(match[1]), Number(match[2])];
    else if ((match = token.match(/^e([\d.]+)([+-])(\d+)$/))) play.edge = { pace: Number(match[1]), more: match[2] === '+', count: Number(match[3]) };
    else if ((match = token.match(/^h(\d+)$/))) play.hold = Number(match[1]);
    else if (token === 'idle') play.idle = true;
    else if (token === 'tower') play.tower = true;
    else if (token === 'rb') play.rush = 'burst';
    else if (token === 'rs') play.rush = 'stop';
    else if (token === 'fill') {
      play.rush = 'fill';
      play.held = true;
    } else if (token === 'still') play.still = true;
    else throw new Error(`not a play: ${word} (${token})`);
  }
  if (play.pace === undefined && !play.held && !play.lock) play.pace = 0.5;
  if (Array.isArray(play.aim)) for (const x of play.aim) if (!(x >= AIM.min && x <= AIM.max)) throw new Error(`out of reach: ${word}`);
  // A column only one rail reaches is fed by that rail alone.
  if (Array.isArray(play.aim) && play.rails === 'both' && play.aim[0] === play.aim[1]) {
    if (play.aim[0] < ARM_REACH[1].min) play.rails = 'left';
    else if (play.aim[0] > ARM_REACH[0].max) play.rails = 'right';
  }
  return play;
}

/** The plays a word stands for, each with its name. */
function plays(word: string): { name: string; play: Play }[] {
  if (FAMILIES[word]) return FAMILIES[word].flatMap(plays);
  return [{ name: word, play: parsePlay(word) }];
}

const towerOnItsWay = (machine: Machine): boolean => stackerBusy(machine.stacker) || machine.medals.some((medal) => medal.level === 1 && medal.stack > 1);
/** Medals lying in the front row of the lower table, over the tray: within a diameter of the front edge, where it pays. */
const frontRow = (machine: Machine): number =>
  machine.medals.reduce((count, medal) => count + (medal.level === 0 && !medal.ball && !medal.jewel && medal.y >= FIELD.depth - 2 * MEDAL_RADIUS && frontPays(medal.x) ? 1 : 0), 0);
const screenStill = (session: Session): boolean => session.stock === 0 && session.spin === null && session.bonus === null && session.roulette === null && session.riding.length === 0;

const snapshot = (session: Session, rushTime: number): Counts => ({
  fed: session.inserted,
  won: session.won,
  lost: session.lost,
  spins: session.spins,
  gold: goldStarted(session),
  hits: session.hits,
  wasted: session.wasted,
  lucky: session.lucky,
  paidOut: session.paidOut,
  jackpots: session.jackpots,
  time: session.machine.time,
  rushTime,
});
const minus = (a: Counts, b: Counts): Counts => Object.fromEntries(Object.keys(a).map((key) => [key, a[key as keyof Counts] - b[key as keyof Counts]])) as unknown as Counts;

/**
 * Plays one machine one way: `WARM_UP` medals uncounted, then `medals` medals in batches of `BATCH`. The machine is the
 * Simulation tab's (no ball and no jewel to begin with, a chest picked at once, a purse that never runs dry).
 */
export function playMachine(play: Play, seed: number, medals: number, batch = BATCH, warmUp = WARM_UP): Batches {
  const session = createSession(seed, { balls: 0, jewels: 0, quickPick: true });
  session.credits = Number.MAX_SAFE_INTEGER;
  const machine = session.machine;
  const pick = seededRng(seed * 7 + 1);
  const meant: [number[], number[]] = [[], []];
  const batches: Batches = [];
  const total = warmUp + medals;
  let mark: Counts | null = null;
  let rushTime = 0;
  let clock = play.pace ? 1 / play.pace : 0;
  let turn: Arm = play.rails === 'right' ? 1 : 0;
  let pending = 0;
  let filling = true;
  let gildedAt = 0;
  const lockAt = (time: number): number => (play.lock ? (((time + TO_LAND - play.lock.phase) % play.lock.period) + play.lock.period) % play.lock.period : 0);
  let lastLock = lockAt(0);

  /** Where a medal fed into `arm` now is meant to drop. */
  const spotFor = (arm: Arm): number => {
    if (play.aim === 'any') return AIM.min + pick() * (AIM.max - AIM.min);
    if (play.aim === 'chaseN' || play.aim === 'chaseA') return CHECKERS.positions[luckySlot(machine.time + (play.aim === 'chaseA' ? TRANSIT : 0))];
    return play.aim[arm];
  };
  /** Feeds a medal into `arm` if its slot is free. */
  const feed = (arm: Arm): boolean => {
    if (session.inserted >= total) return false;
    if (play.rails !== 'both' && arm !== (play.rails === 'left' ? 0 : 1)) return false;
    const x = spotFor(arm);
    const rail: Arm = play.aim === 'any' ? armFor(x) : arm;
    if (machine.waits[rail] > 1e-9 || !insert(session, rail)) return false;
    meant[rail].push(x);
    if (session.inserted === warmUp) mark = snapshot(session, rushTime);
    else if (mark && (session.inserted - warmUp) % batch === 0) {
      const now = snapshot(session, rushTime);
      batches.push(minus(now, mark));
      mark = now;
    }
    return true;
  };
  /** Feeds the next medal into the rail whose turn it is, or into the other when that one's slot is busy. */
  const feedNext = (): boolean => {
    if (play.rails !== 'both') return feed(play.rails === 'left' ? 0 : 1);
    for (const arm of [turn, turn === 0 ? 1 : 0] as const) {
      if (feed(arm)) {
        turn = arm === 0 ? 1 : 0;
        return true;
      }
    }
    return false;
  };
  const bothHeld = (): void => {
    feed(0);
    feed(1);
  };
  /** Whether the play's own way of holding back lets a medal go now. */
  const open = (): boolean => {
    if (play.window) {
      const at = (machine.time + TO_LAND) % PUSHER.period;
      if (at < play.window[0] || at >= play.window[1]) return false;
    }
    if (play.lampWindow) {
      const at = (machine.time + TO_LAND) % LAMP_TURN;
      if (at < play.lampWindow[0] || at >= play.lampWindow[1]) return false;
    }
    if (play.hold !== undefined && session.stock > play.hold) return false;
    if (play.idle && !screenStill(session)) return false;
    if (play.tower && towerOnItsWay(machine) && !screenStill(session)) return false;
    return true;
  };

  const limit = total * 600;
  // The last batch is closed as the last medal goes in.
  while (session.inserted < total) {
    if (machine.time > limit) throw new Error(`a machine played ${session.inserted} medals in ${limit} s`);
    if (play.rush === 'fill') {
      // Feeding stops when chance time is over, and starts again when the hold is empty and the screen is still.
      if (filling && !session.rush && session.gilded > gildedAt) filling = false;
      else if (!filling && session.stock === 0 && !session.spin && !session.bonus) {
        filling = true;
        gildedAt = session.gilded;
      }
      if (filling) bothHeld();
    } else if (play.rush === 'burst' && session.rush) {
      bothHeld();
    } else if (play.rush === 'stop' && session.rush) {
      // Waiting.
    } else if (play.held) {
      if (open()) bothHeld();
    } else if (play.lock) {
      const at = lockAt(machine.time);
      if (at < lastLock && open()) pending = play.lock.burst;
      lastLock = at;
      while (pending > 0 && feedNext()) pending--;
    } else if (play.pace) {
      let pace = play.pace;
      if (play.edge) {
        const row = frontRow(machine);
        if (play.edge.more ? row >= play.edge.count : row <= play.edge.count) pace = play.edge.pace;
      }
      if (clock >= 1 / pace && open() && feedNext()) clock = Math.max(0, Math.min(clock - 1 / pace, 1 / pace));
    }
    // A medal drops where its arm's tip is when it leaves it: each arm is pointed where the next medal on it is meant to drop.
    for (const arm of [0, 1] as const) {
      const onRail = machine.rolling.reduce((count, medal) => count + (medal.arm === arm ? 1 : 0), 0);
      meant[arm].splice(0, meant[arm].length - onRail);
      if (meant[arm].length > 0) aimArm(machine, arm, meant[arm][0]);
    }
    advance(session, DT, undefined, play.still === true);
    clock += DT;
    if (session.rush && mark) rushTime += DT;
  }
  return batches;
}

/** The return with average luck on the screen, and in fact, from summed counts. */
function figures(c: Counts): { steady: number; fact: number; front: number; spins: number; gold: number } {
  const front = c.won / (c.won + c.lost);
  const spins = c.spins / c.fed;
  const gold = c.gold / c.fed;
  return { steady: front * (1 + spins * SPIN + gold * GOLD + GROWTH), fact: c.won / c.fed, front, spins, gold };
}

const sum = (batches: Batches): Counts => batches.reduce((all, b) => (Object.keys(all) as (keyof Counts)[]).reduce((next, key) => ({ ...next, [key]: next[key] + b[key] }), all));

/**
 * The 95% half-widths of the return with average luck (by the delta method: it is the field's share times what the
 * screen pays on, each a ratio of batch sums) and of the return in fact (a ratio of batch sums), from the spread of
 * the batches.
 */
export function intervals(batches: Batches): { steady: number; fact: number } {
  const n = batches.length;
  if (n < 2) return { steady: NaN, fact: NaN };
  const all = sum(batches);
  const f = figures(all);
  const leftMean = (all.won + all.lost) / n;
  const fedMean = all.fed / n;
  const paid = 1 + f.spins * SPIN + f.gold * GOLD + GROWTH;
  let steady = 0;
  let fact = 0;
  for (const b of batches) {
    const dFront = (b.won - f.front * (b.won + b.lost)) / leftMean;
    const dPaid = (b.spins * SPIN + b.gold * GOLD - (paid - 1 - GROWTH) * b.fed) / fedMean;
    steady += (paid * dFront + f.front * dPaid) ** 2;
    fact += ((b.won - f.fact * b.fed) / fedMean) ** 2;
  }
  return { steady: 1.96 * Math.sqrt(steady / (n - 1) / n), fact: 1.96 * Math.sqrt(fact / (n - 1) / n) };
}

function worker(): void {
  const job = JSON.parse(process.env.MEDAL_PUSHER_SCAN_JOB ?? '{}') as Job;
  process.send?.(playMachine(job.play, job.seed, job.medals));
}

function run(job: Job): Promise<Batches> {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [], { env: { ...process.env, MEDAL_PUSHER_SCAN_JOB: JSON.stringify(job) } });
    child.on('message', (message) => resolve(message as Batches));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}`));
    });
  });
}

async function main(): Promise<void> {
  // Each play once, however many of the words name it.
  const list = [...new Map((process.argv[2] ?? 'p0.5').split(',').flatMap(plays).map((p) => [p.name, p] as const)).values()];
  const medals = Number(process.argv[3] ?? 10_000);
  const machines = Number(process.argv[4] ?? 8);
  const first = Number(process.argv[5] ?? 30_001);
  const processes = Math.min(10, Number(process.argv[6] ?? Math.max(1, availableParallelism() - 2)));
  const best = FLOOR_RULES['medal-pusher'].bestReturn;
  // The slowest plays first, machine by machine, so that no slow one is left to finish alone.
  const jobs = list.flatMap((play) => Array.from({ length: machines }, (_, i): Job => ({ ...play, medals, seed: first + i })));
  const done = new Map<string, Batches[]>();
  const report: Record<string, unknown> = {};
  let beaten = false;
  let next = 0;
  const started = Date.now();
  const finish = (name: string) => {
    const batches = done.get(name)!.flat();
    const all = sum(batches);
    const f = figures(all);
    const half = intervals(batches);
    const over = f.steady - half.steady > best || f.steady > 1;
    beaten ||= over;
    const row = {
      fed: all.fed,
      return: f.steady,
      half: half.steady,
      fact: f.fact,
      factHalf: half.fact,
      fieldShare: f.front,
      spins: f.spins,
      gold: f.gold,
      lamp: all.lucky / Math.max(1, all.spins),
      through: all.hits / all.fed,
      wasted: all.wasted / all.fed,
      chance: all.rushTime / all.time,
      pace: all.fed / all.time,
      jackpots: all.jackpots,
    };
    report[name] = row;
    console.log(
      `${name.padEnd(16)} ${(100 * f.steady).toFixed(2)}% ±${(100 * half.steady).toFixed(2)}${over ? '  ← above the published best' : ''}` +
        `  in fact ${(100 * f.fact).toFixed(1)}% ±${(100 * half.fact).toFixed(1)}  field ${(100 * f.front).toFixed(2)}%  spins ${(100 * f.spins).toFixed(2)}  gold ${(100 * f.gold).toFixed(2)}` +
        `  lamp ${(100 * row.lamp).toFixed(1)}%  through ${(100 * row.through).toFixed(1)}  wasted ${(100 * row.wasted).toFixed(1)}  chance ${(100 * row.chance).toFixed(1)}%  ${row.pace.toFixed(2)}/s` +
        `  (${all.fed.toLocaleString('en-US')} medals, ${all.jackpots} JP, ${((Date.now() - started) / 1000).toFixed(0)} s)`,
    );
  };
  const lane = async (): Promise<void> => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const result = await run(job);
      const results = done.get(job.name) ?? [];
      results.push(result);
      done.set(job.name, results);
      if (results.length === machines) finish(job.name);
    }
  };
  await Promise.all(Array.from({ length: processes }, lane));
  console.log(`published best ${(100 * best).toFixed(1)}% (the floor's bestReturn)`);
  console.log(JSON.stringify(report));
  process.exitCode = beaten ? 1 : 0;
}

// Run as a script, and not when a test borrows `playMachine`.
const invokedDirectly = typeof process.argv[1] === 'string' && /medal-pusher-strategy-scan\.[cm]?ts$/.test(process.argv[1]);
if (process.env.MEDAL_PUSHER_SCAN_JOB) worker();
else if (invokedDirectly) void main();
