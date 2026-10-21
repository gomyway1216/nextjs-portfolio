/**
 * Scans the moment a timed medal is dropped: Cherry Blossom Carousel's best play (sim.ts `timed`) at each lead, the
 * real machine as it is, over many seeded machines at once, one process a machine, with each lead's 95% interval.
 *
 *   npx tsx scripts/carousel-pusher-lead-scan.ts [leads] [medals per machine] [machines] [first seed]
 *
 * Defaults: leads -24,-21,-18,-15,-12,-9,-6,-3,0,3,6, 60,000 medals a machine, 12 machines, seed 20001. A lead is how
 * many steps after the medal lands a hole passes under the drop spot (sim.ts `simulate`'s `lead`): 0 is the published
 * best, a negative lead lands the medal after the hole has gone by. The interval comes from the spread of 5,000-medal
 * batches, as scripts/carousel-pusher-tune.ts reckons it.
 *
 * Exits 1 when any lead's interval lies wholly above the published best's (published.ts), or above 100%: best play is
 * then not the best there is.
 */

import { fork } from 'node:child_process';
import { PUBLISHED_CAROUSEL } from '../src/components/game/CarouselPusher/published';
import { simulate } from '../src/components/game/CarouselPusher/sim';

const BATCH = 5_000;

interface Job {
  lead: number;
  medals: number;
  seed: number;
}
type Batches = { fed: number; back: number }[];

function worker(): void {
  const job = JSON.parse(process.env.CAROUSEL_LEAD_JOB ?? '{}') as Job;
  const batches: Batches = [];
  simulate({ strategy: 'timed', lead: job.lead, medals: job.medals, seed: job.seed, warmup: 500, batch: BATCH, onBatch: (t) => batches.push({ fed: t.fed, back: t.back }) });
  process.send?.(batches);
}

function run(job: Job): Promise<Batches> {
  return new Promise((resolve, reject) => {
    const child = fork(__filename, [], { env: { ...process.env, CAROUSEL_LEAD_JOB: JSON.stringify(job) } });
    child.on('message', (message) => resolve(message as Batches));
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
  const leads = (process.argv[2] ?? '-24,-21,-18,-15,-12,-9,-6,-3,0,3,6').split(',').map(Number);
  const medals = Number(process.argv[3] ?? 60_000);
  const machines = Number(process.argv[4] ?? 12);
  const first = Number(process.argv[5] ?? 20_001);
  const best = PUBLISHED_CAROUSEL.ways.timed;
  let beaten = false;
  for (const lead of leads) {
    const started = Date.now();
    const all = (await Promise.all(Array.from({ length: machines }, (_, i) => run({ lead, medals, seed: first + i })))).flat();
    const { mean, half } = interval(all);
    const over = mean - half > best.return + best.half || mean - half > 1;
    beaten ||= over;
    console.log(`lead ${String(lead).padStart(3)}: ${(100 * mean).toFixed(2)}% ±${(100 * half).toFixed(2)}${over ? '  ← above the published best' : ''}  (${((Date.now() - started) / 1000).toFixed(0)} s)`);
  }
  console.log(`published best ${(100 * best.return).toFixed(2)}% ±${(100 * best.half).toFixed(2)}`);
  process.exitCode = beaten ? 1 : 0;
}

if (process.env.CAROUSEL_LEAD_JOB) worker();
else void main();
