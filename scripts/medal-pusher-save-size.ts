/**
 * Medal Pusher: how big a saved machine is, on the device and on its way to
 * the player's account.
 *
 * The account's route takes at most 64 KB of state (`MAX_STATE_BYTES` in
 * `src/app/api/game/saves/route.ts`), and a browser sends at most 64 KiB of
 * body with a request that has to outlive the page. A machine with a full
 * field is bigger than that as it is saved on the device, so it is packed
 * (`pack.ts`) before it goes. This plays machines for a good while, in the
 * ways listed under `SCENARIOS`, measures every half second what the save
 * would come to, and prints the largest of each.
 *
 * Usage:
 *
 *     npx tsx scripts/medal-pusher-save-size.ts [seconds] [seeds]
 *
 * `seconds` is how long each machine is played (300 by default, in the
 * machine's own time: nothing waits), `seeds` a comma-separated list (1,2,3 by
 * default). The numbers depend on nothing but those two and the code, so the
 * same command prints the same table. With the defaults it takes a minute or
 * two. Exits non-zero when a save does not fit.
 *
 * `package.json` is byte-sealed for this repository, so there is no npm
 * script for it. `tests/unit/components/game/MedalPusher/savedMachine.test.ts`
 * imports {@link measure} and runs the crowded machine for a shorter while
 * inside vitest, so the test and this table are measured the same way.
 */

import { ACCOUNT_LIMIT, fromCloud, sizeOf, toCloud } from '../src/components/game/MedalPusher/account';
import { buildTowers, queuePayout } from '../src/components/game/MedalPusher/engine';
import { MACHINE_GAME_KEY } from '../src/components/game/MedalPusher/savedMachine';
import { advance, createSession, insert, refill } from '../src/components/game/MedalPusher/session';
import { serialize } from '../src/components/game/MedalPusher/storage';

const DT = 1 / 60;
/** The most a browser sends as the body of a request made with `keepalive`. */
export const KEEPALIVE_LIMIT = 64 * 1024;

export interface Scenario {
  name: string;
  /** A medal goes into each rail every this many steps of a sixtieth of a second. */
  feedEvery: number;
  /**
   * Whether the field is crowded on purpose, far past what play gives a
   * machine: 1,200 medals of towers stood on the pusher every 20 seconds and
   * 150 more thrown on every 7.
   */
  crowded: boolean;
}

export const SCENARIOS: Scenario[] = [
  { name: 'ordinary play: a medal on each rail every half second', feedEvery: 30, crowded: false },
  { name: 'both feeds held down', feedEvery: 1, crowded: false },
  { name: 'crowded on purpose: both feeds held down, 1,200 medals of towers every 20 s, 150 thrown on every 7 s', feedEvery: 1, crowded: true },
];

const bytes = (text: string): number => new TextEncoder().encode(text).length;

export interface Measured {
  /** The save as it is kept on the device, in bytes: the new machine's, and the largest. */
  deviceNew: number;
  deviceMost: number;
  /** The state the route is sent, in bytes, measured as the route measures it: the new machine's, the mean, and the largest. */
  accountNew: number;
  accountMean: number;
  accountMost: number;
  /** The whole body of the request at its largest. */
  requestMost: number;
  /** Medals lying on the field and in the air at the largest. */
  medals: number;
  falling: number;
  /** Saves measured, and how many of them did not come back from the packing as the text they were. */
  samples: number;
  changed: number;
}

/** Plays one machine for `seconds` of its own time and measures its save every half second. */
export function measure(scenario: Scenario, seed: number, seconds: number): Measured {
  const session = createSession(seed);
  const sizes = (): { text: string; device: number; account: number; request: number; back: string | null } => {
    const text = serialize(session);
    const state = toCloud(text, 'a-mark-of-16-hex', 0);
    // A save too big to be sent at all has no state: it is counted as over the limit, by its size on the device.
    if (!state) return { text, device: bytes(text), account: bytes(text), request: bytes(text), back: null };
    const request = bytes(JSON.stringify({ gameKey: MACHINE_GAME_KEY, state }));
    return { text, device: bytes(text), account: sizeOf(state), request, back: fromCloud(JSON.parse(JSON.stringify(state)))?.text ?? null };
  };
  const fresh = sizes();
  const result: Measured = {
    deviceNew: fresh.device,
    deviceMost: fresh.device,
    accountNew: fresh.account,
    accountMean: 0,
    accountMost: fresh.account,
    requestMost: fresh.request,
    medals: session.machine.medals.length,
    falling: session.machine.falling.length,
    samples: 0,
    changed: fresh.back === fresh.text ? 0 : 1,
  };
  let sum = 0;
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    if (session.credits === 0) refill(session);
    if (i % scenario.feedEvery === 0) {
      insert(session, 0);
      insert(session, 1);
    }
    if (scenario.crowded && i % (60 * 20) === 0) buildTowers(session.machine, 1200);
    if (scenario.crowded && i % (60 * 7) === 0) queuePayout(session.machine, 150);
    advance(session, DT);
    if (i % 30 !== 0) continue;
    const now = sizes();
    result.samples += 1;
    sum += now.account;
    if (now.back !== now.text) result.changed += 1;
    result.deviceMost = Math.max(result.deviceMost, now.device);
    result.requestMost = Math.max(result.requestMost, now.request);
    if (now.account > result.accountMost) {
      result.accountMost = now.account;
      result.medals = session.machine.medals.length;
      result.falling = session.machine.falling.length;
    }
  }
  result.accountMean = result.samples === 0 ? fresh.account : Math.round(sum / result.samples);
  return result;
}

const kb = (size: number): string => `${(size / 1024).toFixed(1)} KB`;

function main(): void {
  const [secondsArg, seedsArg] = process.argv.slice(2);
  const seconds = secondsArg === undefined ? 300 : Number(secondsArg);
  const seeds = (seedsArg ?? '1,2,3').split(',').map(Number);
  if (!Number.isFinite(seconds) || seconds <= 0 || seeds.some((seed) => !Number.isInteger(seed))) {
    process.stderr.write('usage: npx tsx scripts/medal-pusher-save-size.ts [seconds] [seeds, as 1,2,3]\n');
    process.exit(2);
    return;
  }
  const started = Date.now();
  const lines = [
    `Medal Pusher save sizes: ${seconds} s of each machine's own time, measured every half second, seeds ${seeds.join(', ')}.`,
    `The route takes ${kb(ACCOUNT_LIMIT)} of state; a browser sends ${kb(KEEPALIVE_LIMIT)} of body as the page is left.`,
    '',
    '| machine | seed | on the device, new | on the device, largest | to the account, new | to the account, mean | to the account, largest | whole request, largest | medals lying / in the air at the largest |',
    '|---|---|---|---|---|---|---|---|---|',
  ];
  let most = 0;
  let mostRequest = 0;
  let changed = 0;
  for (const scenario of SCENARIOS) {
    for (const seed of seeds) {
      const m = measure(scenario, seed, seconds);
      most = Math.max(most, m.accountMost);
      mostRequest = Math.max(mostRequest, m.requestMost);
      changed += m.changed;
      lines.push(
        `| ${scenario.name} | ${seed} | ${kb(m.deviceNew)} | ${kb(m.deviceMost)} | ${kb(m.accountNew)} | ${kb(m.accountMean)} | ${kb(m.accountMost)} | ${kb(m.requestMost)} | ${m.medals} / ${m.falling} |`,
      );
    }
  }
  const fits = most <= ACCOUNT_LIMIT && mostRequest < KEEPALIVE_LIMIT && changed === 0;
  lines.push(
    '',
    `Largest to the account: ${most} bytes, ${((most / ACCOUNT_LIMIT) * 100).toFixed(1)}% of the ${ACCOUNT_LIMIT} the route takes.`,
    `Largest whole request: ${mostRequest} bytes, ${((mostRequest / KEEPALIVE_LIMIT) * 100).toFixed(1)}% of the ${KEEPALIVE_LIMIT} a browser sends as the page is left.`,
    `Saves that did not come back from the packing as the text they were: ${changed}.`,
    `${fits ? 'Everything fits' : 'NOT EVERYTHING FITS'}. Took ${((Date.now() - started) / 1000).toFixed(0)} s.`,
    '',
  );
  process.stdout.write(lines.join('\n'));
  if (!fits) process.exit(1);
}

const invokedDirectly =
  typeof process !== 'undefined' && Array.isArray(process.argv) && typeof process.argv[1] === 'string' && /medal-pusher-save-size\.[cm]?ts$/.test(process.argv[1]);

if (invokedDirectly) main();
