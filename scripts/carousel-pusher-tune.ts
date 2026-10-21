/**
 * Measures what Cherry Blossom Carousel gives back: the real machine (engine.ts and lottery.ts as they are), fed each
 * way of sim.ts for millions of medals over many seeded machines at once, one process a machine.
 *
 *   npx tsx scripts/carousel-pusher-tune.ts [medals per way] [processes] [ways] [first seed]
 *
 * Defaults: 3,000,000 medals a way, 12 processes, every way, seed 1. Each process plays its share of the medals on a
 * machine of its own (seed = first seed + its number), in batches of `BATCH` medals; the return of the whole is the
 * medals back over the medals fed, and its 95% confidence interval comes from the spread of the batches (batch means:
 * a batch is long enough, about four jackpots' worth at the timed pace, that one batch hardly tells on the next).
 *
 * What a row says, per medal fed unless it is a share:
 *
 *   return      medals back: off the front edge, thrown into the tray by a jackpot, and the counter's prizes
 *   ±95%        half the width of the 95% confidence interval of the return
 *   front       medals off the front edge into the tray (the field's own return, jackpots' medals included)
 *   prizes      the counter's prizes (straight into the tray)
 *   pockets     medals into a hole (direct: came down in one), and those that found all four lamps lit
 *   field share of the medals that left the field, the share that left it into the tray
 *   jackpots    per 1,000 medals fed, and the medals the dish threw out on average
 *
 * Prints a table, and the JSON that published.ts is written from.
 */

import { fork } from 'node:child_process';
import { STRATEGIES, addTally, emptyTally, returnOf, simulate, type Strategy, type Tally } from '../src/components/game/CarouselPusher/sim';

const BATCH = 5_000;

interface Job {
  strategy: Strategy;
  medals: number;
  seed: number;
}
interface Result {
  strategy: Strategy;
  tally: Tally;
  batches: { fed: number; back: number }[];
  ms: number;
}

async function worker(): Promise<void> {
  const job = JSON.parse(process.env.CAROUSEL_JOB ?? '{}') as Job;
  const started = Date.now();
  const batches: Result['batches'] = [];
  const { tally } = simulate({ strategy: job.strategy, medals: job.medals, seed: job.seed, warmup: 500, batch: BATCH, onBatch: (t) => batches.push({ fed: t.fed, back: t.back }) });
  process.send?.({ strategy: job.strategy, tally, batches, ms: Date.now() - started } satisfies Result);
}

function run(job: Job): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [], { env: { ...process.env, CAROUSEL_JOB: JSON.stringify(job) } });
    child.on('message', (message) => resolve(message as Result));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}`));
    });
  });
}

/** The mean of the batches' returns, weighted by their medals, and the 95% half-width from their spread. */
function interval(batches: Result['batches']): { mean: number; half: number; n: number } {
  const full = batches.filter((b) => b.fed > 0);
  const fed = full.reduce((s, b) => s + b.fed, 0);
  const back = full.reduce((s, b) => s + b.back, 0);
  const mean = back / fed;
  const n = full.length;
  // The ratio estimator's variance: the batches' deviations from the mean, each in its own medals.
  const avgFed = fed / n;
  const variance = full.reduce((s, b) => s + (b.back - mean * b.fed) ** 2, 0) / (n - 1) / (n * avgFed * avgFed);
  return { mean, half: 1.96 * Math.sqrt(variance), n };
}

async function main(): Promise<void> {
  const medals = Number(process.argv[2] ?? 3_000_000);
  const processes = Number(process.argv[3] ?? 12);
  const ways = (process.argv[4] ?? STRATEGIES.join(',')).split(',') as Strategy[];
  const firstSeed = Number(process.argv[5] ?? 1);
  const report: Record<string, unknown> = {};
  for (const strategy of ways) {
    const started = Date.now();
    const share = Math.ceil(medals / processes);
    const results = await Promise.all(Array.from({ length: processes }, (_, i) => run({ strategy, medals: share, seed: firstSeed + i })));
    const tally = results.reduce((all, r) => addTally(all, r.tally), emptyTally());
    const { mean, half, n } = interval(results.flatMap((r) => r.batches));
    const left = tally.front + tally.lost;
    const row = {
      fed: tally.fed,
      return: mean,
      half,
      batches: n,
      front: tally.front / tally.fed,
      thrownIn: tally.thrownIn / tally.fed,
      prizes: tally.prizes / tally.fed,
      pockets: tally.pockets / tally.fed,
      direct: tally.direct / tally.fed,
      wasted: tally.wasted / tally.fed,
      fieldShare: left > 0 ? tally.front / left : 0,
      jackpotsPer1000: (tally.jackpots / tally.fed) * 1000,
      thrownPerJackpot: tally.jackpots > 0 ? tally.thrown / tally.jackpots : 0,
      outcomes: tally.outcomes,
      check: returnOf(tally),
      seconds: (Date.now() - started) / 1000,
    };
    report[strategy] = row;
    console.log(
      `${strategy.padEnd(7)} return ${(100 * mean).toFixed(2)}% ±${(100 * half).toFixed(2)} (${n} batches, ${tally.fed.toLocaleString('en-US')} medals)` +
        ` front ${row.front.toFixed(4)} thrownIn ${row.thrownIn.toFixed(4)} prizes ${row.prizes.toFixed(4)} pockets ${row.pockets.toFixed(4)} (direct ${row.direct.toFixed(4)}, wasted ${row.wasted.toFixed(4)})` +
        ` fieldShare ${row.fieldShare.toFixed(4)} JP/1000 ${row.jackpotsPer1000.toFixed(3)} thrown/JP ${row.thrownPerJackpot.toFixed(1)} ${row.seconds.toFixed(0)}s`,
    );
  }
  console.log(JSON.stringify(report));
}

if (process.env.CAROUSEL_JOB) void worker();
else void main();
