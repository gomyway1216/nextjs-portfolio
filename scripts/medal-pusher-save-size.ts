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
 *     npx tsx scripts/medal-pusher-save-size.ts where [seconds] [seed]
 *
 * `seconds` is how long each machine is played (300 by default, in the
 * machine's own time: nothing waits), `seeds` a comma-separated list (1,2,3 by
 * default). The numbers depend on nothing but those two and the code, so the
 * same command prints the same table. With the defaults it takes a minute or
 * two. Exits non-zero when a save does not fit.
 *
 * `where` says where the bytes are, for one crowded machine (seed 2 and 60
 * seconds by default): each part of its largest save packed by itself, as
 * format 1 packed it and as it is packed now, and what that comes to for
 * each medal of each kind; then each column of the medals lying and of the
 * medals in the air. The parts again for the moment its lifts held the most
 * towers, which is seldom the moment the save is largest. Format 1 is the
 * packer of the day before format 2, kept among the tests.
 *
 * `package.json` is byte-sealed for this repository, so there is no npm
 * script for it. `tests/unit/components/game/MedalPusher/savedMachine.test.ts`
 * imports {@link measure} and runs the crowded machine for a shorter while
 * inside vitest, so the test and this table are measured the same way.
 */

import { ACCOUNT_LIMIT, fromCloud, sizeOf, toCloud } from '../src/components/game/MedalPusher/account';
import { buildTowers, queuePayout, type FallingMedal, type Medal } from '../src/components/game/MedalPusher/engine';
import { holds } from '../src/components/game/MedalPusher/lift';
import { pack } from '../src/components/game/MedalPusher/pack';
import { MACHINE_GAME_KEY } from '../src/components/game/MedalPusher/savedMachine';
import { advance, createSession, insert, refill, type Session } from '../src/components/game/MedalPusher/session';
import { serialize } from '../src/components/game/MedalPusher/storage';
import { packFormat1 } from '../tests/unit/components/game/MedalPusher/packFormat1';

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

/** One step of a machine played as a scenario says: step `i`, a sixtieth of a second. */
function step(session: Session, scenario: Scenario, i: number): void {
  if (session.credits === 0) refill(session);
  if (i % scenario.feedEvery === 0) {
    insert(session, 0);
    insert(session, 1);
  }
  if (scenario.crowded && i % (60 * 20) === 0) buildTowers(session.machine, 1200);
  if (scenario.crowded && i % (60 * 7) === 0) queuePayout(session.machine, 150);
  advance(session, DT);
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
    step(session, scenario, i);
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

/** A part of a save: how many rows it has if it is a list, and its bytes on the device, packed as format 1 packed it, and packed now. */
export interface Part {
  name: string;
  rows: number | null;
  device: number;
  before: number;
  now: number;
}

/**
 * Where the bytes of a save are: each part of it, and each kind of medal,
 * packed by itself. The parts do not add up to the whole to the byte, since
 * the names of a table's fields are written once for each list that is packed.
 */
export function partsOf(text: string): Part[] {
  const save = JSON.parse(text) as { machine: Record<string, unknown>; session: unknown; screen: unknown };
  const { medals, falling, rolling, lifts, hopper, ...rest } = save.machine;
  const [lying, inTheAir] = [medals as Medal[], falling as FallingMedal[]];
  const part = (name: string, value: unknown): Part => {
    const written = JSON.stringify(value);
    return { name, rows: Array.isArray(value) ? value.length : null, device: bytes(written), before: bytes(packFormat1(written) ?? ''), now: bytes(pack(written) ?? '') };
  };
  const single = (medal: Medal): boolean => !medal.ball && !medal.jewel && medal.stack + medal.grow === 1;
  const from = (source: FallingMedal['source']) => inTheAir.filter((medal) => medal.source === source && !medal.ball && !medal.jewel);
  return [
    part('the whole save', save),
    part('medals lying on the tables', lying),
    part('- single medals', lying.filter(single)),
    part('- towers', lying.filter((medal) => !medal.ball && !medal.jewel && !single(medal))),
    part('- prize balls', lying.filter((medal) => medal.ball)),
    part('- jewels', lying.filter((medal) => medal.jewel)),
    part('medals in the air', inTheAir),
    part('- poured out of the hopper', from('pour')),
    part('- thrown on from the slot', from('payout')),
    part('- off a falling tower', from('spill')),
    part('- dropped by the player', from('player')),
    part('- prize balls and jewels', inTheAir.filter((medal) => medal.ball || medal.jewel)),
    part('medals on the rails', rolling),
    part('lifts under towers', lifts),
    part('the hopper', hopper),
    part('the rest of the machine', rest),
    part('the session’s numbers', save.session),
    part('the screen', save.screen),
  ];
}

/**
 * What the jewels in a save cost: how many there are, and how much smaller
 * the whole save packs with them taken out. A jewel has a field the medals
 * have not, so the jewels are a table of their own beside the medals'; packed
 * by themselves, as in the table of parts, two rows carry little but the
 * names of their fields.
 */
function jewelsOf(text: string): string {
  const save = JSON.parse(text) as { machine: { medals: Medal[]; falling: FallingMedal[] } };
  const count = save.machine.medals.filter((medal) => medal.jewel).length + save.machine.falling.filter((medal) => medal.jewel).length;
  if (count === 0) return 'No jewel is on the field or in the air.';
  save.machine.medals = save.machine.medals.filter((medal) => !medal.jewel);
  save.machine.falling = save.machine.falling.filter((medal) => !medal.jewel);
  const without = JSON.stringify(save);
  const less = (write: (written: string) => string | null): number => bytes(write(text) ?? '') - bytes(write(without) ?? '');
  return `Jewels on the field or in the air: ${count}. With them taken out the whole save packs ${less(pack)} bytes smaller (${less(packFormat1)} in format 1).`;
}

/** The parts of a save as a table. */
function partsTable(parts: Part[]): string[] {
  const each = (size: number, rows: number | null): string => (rows ? (size / rows).toFixed(1) : '');
  return [
    '| part | rows | on the device | packed as format 1 | packed now | a row on the device | a row in format 1 | a row now |',
    '|---|---|---|---|---|---|---|---|',
    ...parts.map((part) => `| ${part.name} | ${part.rows ?? ''} | ${part.device} | ${part.before} | ${part.now} | ${each(part.device, part.rows)} | ${each(part.before, part.rows)} | ${each(part.now, part.rows)} |`),
  ];
}

/**
 * What each column of a list comes to. A column cannot be packed without a
 * table round it, so each is measured as a table of that field and one other
 * that is nothing, less a table of the other alone: a few bytes out either way.
 */
function columnsTable(rows: Record<string, unknown>[]): string[] {
  const size = (list: unknown[], write: (written: string) => string | null): number => bytes(write(JSON.stringify(list)) ?? '');
  const fields = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = ['| column | rows | different values | on the device | packed as format 1 | packed now | a row in format 1 | a row now |', '|---|---|---|---|---|---|---|---|'];
  for (const field of fields) {
    const cells = rows.filter((row) => field in row).map((row) => row[field]);
    if (cells.length < 2) continue;
    const alone = cells.map(() => ({ _: 0 }));
    const beside = cells.map((cell) => ({ [field]: cell, _: 0 }));
    const [before, now] = [size(beside, packFormat1) - size(alone, packFormat1), size(beside, pack) - size(alone, pack)];
    const different = new Set(cells.map((cell) => JSON.stringify(cell))).size;
    lines.push(`| ${field} | ${cells.length} | ${different} | ${bytes(JSON.stringify(cells))} | ${before} | ${now} | ${(before / cells.length).toFixed(1)} | ${(now / cells.length).toFixed(1)} |`);
  }
  return lines;
}

/** Says where the bytes are, for one crowded machine: at its largest save, and when its lifts held the most towers. */
function where(seconds: number, seed: number): void {
  const scenario = SCENARIOS.find((candidate) => candidate.crowded) as Scenario;
  const session = createSession(seed);
  let largest = { size: 0, text: '', at: 0 };
  let lifting = { held: 0, text: '', at: 0 };
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step(session, scenario, i);
    const held = session.machine.lifts.filter(holds).length;
    if (held > lifting.held) lifting = { held, text: serialize(session), at: (i + 1) * DT };
    if (i % 30 !== 0) continue;
    const text = serialize(session);
    const size = bytes(pack(text) ?? '');
    if (size > largest.size) largest = { size, text, at: (i + 1) * DT };
  }
  const lines = [
    `Medal Pusher: where the bytes of a save are. The crowded machine, seed ${seed}, ${seconds} s of its own time; sizes in bytes, each part packed by itself.`,
    '',
    `Its largest save, at ${largest.at.toFixed(1)} s:`,
    '',
    ...partsTable(partsOf(largest.text)),
    '',
    jewelsOf(largest.text),
    '',
  ];
  const { medals, falling } = (JSON.parse(largest.text) as { machine: { medals: Record<string, unknown>[]; falling: Record<string, unknown>[] } }).machine;
  lines.push('The columns of the medals lying on the tables, in that save:', '', ...columnsTable(medals), '', 'The columns of the medals in the air:', '', ...columnsTable(falling), '');
  if (lifting.held > 0) lines.push(`With the most towers held on lifts (${lifting.held}), at ${lifting.at.toFixed(2)} s:`, '', ...partsTable(partsOf(lifting.text)), '', jewelsOf(lifting.text), '');
  process.stdout.write(lines.join('\n'));
}

function main(): void {
  if (process.argv[2] === 'where') {
    const [seconds, seed] = [Number(process.argv[3] ?? 60), Number(process.argv[4] ?? 2)];
    if (!Number.isFinite(seconds) || seconds <= 0 || !Number.isInteger(seed)) {
      process.stderr.write('usage: npx tsx scripts/medal-pusher-save-size.ts where [seconds] [seed]\n');
      process.exit(2);
      return;
    }
    where(seconds, seed);
    return;
  }
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
