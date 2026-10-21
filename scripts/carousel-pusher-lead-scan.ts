/**
 * Scans the moment a medal is dropped: Cherry Blossom Carousel's best play (sim.ts `timed`) at each lead, and every
 * other way of sim.ts that chooses its moment, the real machine as it is, over many seeded machines at once, one
 * process a machine and play, with each play's 95% interval.
 *
 *   npx tsx scripts/carousel-pusher-lead-scan.ts [plays] [medals per machine] [machines] [first seed] [processes]
 *
 * Defaults: leads -24,-21,-18,-15,-12,-9,-6,-3,0,3,6, 60,000 medals a machine, 12 machines, seed 20001, as many
 * processes as the machine has cores but two. A play is written:
 *
 *   -18           a lead: every hole timed (sim.ts `timed`), and the medal let go so that a hole passes under the drop
 *                 spot 18 steps before it lands (0 is the published best; negative lands it after the hole has gone by)
 *   phase@120+1   medals only to come down at the carousel's angle 120 (one a turn); +60: DROP held through 60°
 *   dish@150      the holes timed while the treasure dish holds 150 or more, DROP held otherwise
 *   steady, held  the everyday hand and DROP held, as published
 *
 * and these stand for many: `leads` (-40 to +20 in steps of 3), `fine` (-6 to +6, every step), `angles` (one angle a
 * turn, 0 to 348 in steps of 12), `swings` (DROP held through 60° of the swing at six places, and through 120° at
 * three), `dishes` (dish@100, 150, 250).
 *
 * The interval comes from the spread of 5,000-medal batches, as scripts/carousel-pusher-tune.ts reckons it. Exits 1
 * when any play's interval lies wholly above the published best's (published.ts), or above 100%: best play is then not
 * the best there is.
 */

import { fork } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { PUBLISHED_CAROUSEL } from '../src/components/game/CarouselPusher/published';
import { addTally, emptyTally, simulate, type SimulateOptions, type Strategy, type Tally } from '../src/components/game/CarouselPusher/sim';

const BATCH = 5_000;

type Options = Pick<SimulateOptions, 'strategy' | 'lead' | 'angle' | 'width' | 'stockAt'>;
interface Job {
  name: string;
  options: Options;
  medals: number;
  seed: number;
}
type Batches = { fed: number; back: number }[];
interface Result {
  tally: Tally;
  batches: Batches;
}

const range = (from: number, to: number, by: number): number[] => Array.from({ length: Math.floor((to - from) / by) + 1 }, (_, i) => from + by * i);

/** The plays a word stands for, each with its name and how sim.ts plays it. */
function plays(word: string): { name: string; options: Options }[] {
  if (word === 'leads') return range(-40, 20, 3).flatMap((lead) => plays(String(lead)));
  if (word === 'fine') return range(-6, 6, 1).flatMap((lead) => plays(String(lead)));
  if (word === 'angles') return range(0, 348, 12).flatMap((angle) => plays(`phase@${angle}+1`));
  if (word === 'swings') return [...range(0, 300, 60).map((a) => `phase@${a}+60`), ...range(0, 240, 120).map((a) => `phase@${a}+120`)].flatMap(plays);
  if (word === 'dishes') return ['dish@100', 'dish@150', 'dish@250'].flatMap(plays);
  if (/^[-+]?\d+$/.test(word)) return [{ name: `lead ${Number(word)}`, options: { strategy: 'timed', lead: Number(word) } }];
  const [way, rest] = word.split('@') as [Strategy, string | undefined];
  const [a, b] = (rest ?? '').split('+').map(Number);
  if (way === 'phase') return [{ name: word, options: { strategy: way, angle: a || 0, width: b || 1 } }];
  if (way === 'dish') return [{ name: word, options: { strategy: way, stockAt: a || 0 } }];
  if (way === 'timed' || way === 'steady' || way === 'held') return [{ name: word, options: { strategy: way } }];
  throw new Error(`not a play: ${word}`);
}

function worker(): void {
  const job = JSON.parse(process.env.CAROUSEL_LEAD_JOB ?? '{}') as Job;
  const batches: Batches = [];
  const { tally } = simulate({ ...job.options, medals: job.medals, seed: job.seed, warmup: 500, batch: BATCH, onBatch: (t) => batches.push({ fed: t.fed, back: t.back }) });
  process.send?.({ tally, batches } satisfies Result);
}

function run(job: Job): Promise<Result> {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [], { env: { ...process.env, CAROUSEL_LEAD_JOB: JSON.stringify(job) } });
    child.on('message', (message) => resolve(message as Result));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0) reject(new Error(`worker exited ${code}`));
    });
  });
}

function interval(batches: Batches): { mean: number; half: number } {
  const full = batches.filter((b) => b.fed > 0);
  const fed = full.reduce((s, b) => s + b.fed, 0);
  const back = full.reduce((s, b) => s + b.back, 0);
  const mean = back / fed;
  const n = full.length;
  const avg = fed / n;
  const variance = full.reduce((s, b) => s + (b.back - mean * b.fed) ** 2, 0) / (n - 1) / (n * avg * avg);
  return { mean, half: 1.96 * Math.sqrt(variance) };
}

async function main(): Promise<void> {
  // Each play once, however many of the words name it.
  const list = [...new Map((process.argv[2] ?? '-24,-21,-18,-15,-12,-9,-6,-3,0,3,6').split(',').flatMap(plays).map((p) => [p.name, p] as const)).values()];
  const medals = Number(process.argv[3] ?? 60_000);
  const machines = Number(process.argv[4] ?? 12);
  const first = Number(process.argv[5] ?? 20_001);
  const processes = Number(process.argv[6] ?? Math.max(1, availableParallelism() - 2));
  const best = PUBLISHED_CAROUSEL.ways.timed;
  const jobs = list.flatMap((play) => Array.from({ length: machines }, (_, i): Job => ({ ...play, medals, seed: first + i })));
  const done = new Map<string, Result[]>();
  const report: Record<string, unknown> = {};
  let beaten = false;
  let next = 0;
  const started = Date.now();
  const finish = (name: string) => {
    const results = done.get(name)!;
    const tally = results.reduce((all, r) => addTally(all, r.tally), emptyTally());
    const { mean, half } = interval(results.flatMap((r) => r.batches));
    const over = mean - half > best.return + best.half || mean - half > 1;
    beaten ||= over;
    const left = tally.front + tally.lost;
    const row = { fed: tally.fed, return: mean, half, front: tally.front / tally.fed, side: tally.lost / tally.fed, prizes: tally.prizes / tally.fed, pockets: tally.pockets / tally.fed, fieldShare: left > 0 ? tally.front / left : 0 };
    report[name] = row;
    console.log(
      `${name.padEnd(14)} ${(100 * mean).toFixed(2)}% ±${(100 * half).toFixed(2)}${over ? '  ← above the published best' : ''}` +
        `  front ${row.front.toFixed(4)} side ${row.side.toFixed(4)} prizes ${row.prizes.toFixed(4)} pockets ${row.pockets.toFixed(4)} field share ${row.fieldShare.toFixed(4)}` +
        `  (${tally.fed.toLocaleString('en-US')} medals, ${((Date.now() - started) / 1000).toFixed(0)} s)`,
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
  console.log(`published best ${(100 * best.return).toFixed(2)}% ±${(100 * best.half).toFixed(2)}`);
  console.log(JSON.stringify(report));
  process.exitCode = beaten ? 1 : 0;
}

if (process.env.CAROUSEL_LEAD_JOB) worker();
else void main();
