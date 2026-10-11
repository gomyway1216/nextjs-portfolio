/**
 * The machine between visits. In an arcade the medals are banked and found
 * again next time; here the whole machine is written down as text and read
 * back: the field with every medal on it, the purse, the counters, the
 * jackpot and whatever the screen was in the middle of.
 *
 * This file only turns a session into text and back. It never touches the
 * browser: the cabinet does the reading and the writing.
 *
 * What comes back out of storage is not trusted. It may have been written by
 * an older version of the game, cut short, damaged, or edited by hand, so
 * every value is checked before a machine is built from it: its type, its
 * range, and that it agrees with the tables in lottery.ts. A save that fails
 * is refused as a whole and the cabinet starts a new machine. The one
 * exception is the screen, described at `restore`.
 *
 * To store a new field, add it to `Machine`, `Session` or one of the things
 * the screen shows: this file then stops compiling until the field has a
 * check in the matching list below. A save written before the field existed
 * lacks it and is refused. Raise STORAGE_VERSION when a stored value changes
 * its meaning without changing its shape.
 */

import { DROP_INTERVAL, FIELD, MEDAL_RADIUS, SETTLE, TOWER, seededRng, type FallingMedal, type Machine, type Medal } from './engine';
import {
  BOARD,
  CHAIN_GOAL,
  CHESTS,
  DIE_FACES,
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  TIERS,
  TIER_DIGITS,
  squareAfter,
  type SpinResult,
  type Tier,
} from './lottery';
import { MAX_STOCK, type ActiveBonus, type ActiveChest, type ActiveRoulette, type ActiveSpin, type ActiveSugoroku, type Session } from './session';

export const STORAGE_KEY = 'medal-pusher-machine';
/** A save carrying any other number is refused. */
export const STORAGE_VERSION = 1;

/**
 * The bounds a save has to keep within. Play stays far inside them. They are
 * there so that a damaged save cannot hand the machine a number it would
 * choke on, or more medals than it could ever hold.
 */
export const LIMITS = {
  /** Medals lying on the two tables. Packed two deep with every tower standing, they hold about 650. */
  medals: 1000,
  /** Medals in the air. Every tower coming down at once is 450. */
  falling: 600,
  /** Prize balls, on the field or waiting for their roulette. */
  balls: 50,
  /** Medals in one place: the purse, the jackpot, a payout still to be thrown on. */
  purse: 1_000_000,
  /** Anything counted since the machine was switched on, the medals' ids included. */
  count: 1_000_000_000_000,
  /** The machine's own clock, in seconds: about thirty years. */
  clock: 1_000_000_000,
  /** No timer on the machine runs for longer than a minute. */
  timer: 60,
  /** How far outside the field a position may be, in field units. */
  margin: MEDAL_RADIUS * 2,
  /** The longest text that is read at all. A machine filled to the bounds above comes to about a quarter of it. */
  length: 1_000_000,
} as const;

// ── Checks ──────────────────────────────────────────────────────────────────

/** A check takes a stored value and gives it back with its type known, or `undefined` when it is not what it should be. */
type Check<T> = (value: unknown) => T | undefined;

/** A whole number from `min` to `max`. */
const whole =
  (min: number, max: number): Check<number> =>
  (value) =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;

/** Any number from `min` to `max`. NaN and the infinities are in no range. */
const real =
  (min: number, max: number): Check<number> =>
  (value) =>
    typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;

const flag: Check<boolean> = (value) => (typeof value === 'boolean' ? value : undefined);

/** One of the values listed. */
const oneOf =
  <const T extends readonly (string | number)[]>(options: T): Check<T[number]> =>
  (value) =>
    options.includes(value as T[number]) ? (value as T[number]) : undefined;

/** At most `max` items, each passing `item`. */
const list =
  <T>(item: Check<T>, max: number): Check<T[]> =>
  (value) => {
    if (!Array.isArray(value) || value.length > max) return undefined;
    const items: T[] = [];
    for (const entry of value) {
      const checked = item(entry);
      if (checked === undefined) return undefined;
      items.push(checked);
    }
    return items;
  };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * An object with exactly the fields listed, no more and no fewer, each passing
 * its own check, and then `agrees`, which looks at them together. Every field
 * of `T` has to be listed, which is what keeps this file in step with the game.
 */
function shape<T>(fields: { [K in keyof T]-?: Check<T[K]> }, agrees: (value: T) => boolean = () => true): Check<T> {
  const keys = Object.keys(fields) as (keyof T & string)[];
  return (value) => {
    if (!isRecord(value) || Object.keys(value).length !== keys.length) return undefined;
    const checked = {} as T;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) return undefined;
      const field = fields[key](value[key]);
      if (field === undefined) return undefined;
      checked[key] = field;
    }
    return agrees(checked) ? checked : undefined;
  };
}

/** Something counted: never negative, never a fraction. */
const count = whole(0, LIMITS.count);
/** Seconds on one of the machine's short timers. */
const timer = real(0, LIMITS.timer);
/** The seconds something takes. The screen divides by them, so never zero. */
const lasting = real(0.01, LIMITS.timer);
/** A place on the field, or just beside it: across, and from the back wall to the front. */
const across = real(-LIMITS.margin, FIELD.width + LIMITS.margin);
const along = real(-LIMITS.margin, FIELD.depth + LIMITS.margin);
const level = oneOf([0, 1]);

// ── The field ───────────────────────────────────────────────────────────────

const medal = shape<Medal>(
  {
    id: whole(1, LIMITS.count),
    x: across,
    y: along,
    level,
    tier: oneOf([0, 1]),
    sinceDrop: real(-1, LIMITS.clock),
    stack: whole(1, TOWER.max),
    grow: whole(0, TOWER.max - 1),
    ball: flag,
    grown: real(SETTLE.from, 1),
  },
  // A tower is never taller than the tallest, and a ball is not a tower.
  (m) => m.stack + m.grow <= TOWER.max && (!m.ball || m.stack + m.grow === 1),
);

const fallingMedal = shape<FallingMedal>(
  {
    id: whole(1, LIMITS.count),
    x: across,
    y: along,
    level,
    fromX: across,
    fromY: along,
    rank: whole(0, TOWER.max - 1),
    ball: flag,
    remaining: timer,
    duration: lasting,
    source: oneOf(['player', 'payout', 'spill']),
  },
  (m) => m.remaining <= m.duration,
);

/** The field as it is stored: everything but the generator. */
type StoredMachine = Omit<Machine, 'rng'>;

const storedMachine = shape<StoredMachine>(
  {
    time: real(0, LIMITS.clock),
    medals: list(medal, LIMITS.medals),
    falling: list(fallingMedal, LIMITS.falling),
    payoutQueue: whole(0, LIMITS.purse),
    payoutClock: timer,
    growing: whole(0, LIMITS.medals * TOWER.max),
    towerClock: timer,
    cooldown: real(0, DROP_INTERVAL),
    nextId: whole(1, LIMITS.count),
  },
  (machine) => {
    // Every medal has an id of its own, lower than the next one to be given out.
    const ids = new Set<number>();
    let balls = 0;
    for (const { id, ball } of [...machine.medals, ...machine.falling]) {
      if (id >= machine.nextId || ids.has(id)) return false;
      ids.add(id);
      if (ball) balls++;
    }
    // The medals still to be stacked are the ones the towers are waiting for.
    const growing = machine.medals.reduce((sum, m) => sum + m.grow, 0);
    return growing === machine.growing && balls <= LIMITS.balls;
  },
);

// ── The purse and the counters ──────────────────────────────────────────────

/** What the screen is in the middle of. At most one of the three is on at a time. */
type OnScreen = Pick<Session, 'spin' | 'bonus' | 'roulette'>;
/** The session's own numbers: everything but the field and the screen. */
type StoredNumbers = Omit<Session, 'machine' | keyof OnScreen>;

const storedNumbers = shape<StoredNumbers>({
  credits: whole(0, LIMITS.purse),
  inserted: count,
  won: count,
  lost: count,
  paidOut: count,
  stock: whole(0, MAX_STOCK),
  hits: count,
  wasted: count,
  jackpot: whole(JACKPOT_START, LIMITS.purse),
  jackpotProgress: whole(0, JACKPOT_STEP - 1),
  square: whole(0, BOARD.length - 1),
  balls: whole(0, LIMITS.balls),
  roulettes: count,
  spins: count,
  tiers: shape<Record<Tier, number>>({ miss: count, small: count, big: count, seven: count }),
  fevers: count,
  jackpots: count,
  refills: count,
  quickPick: flag,
});

// ── The screen ──────────────────────────────────────────────────────────────

/** Three digits, each one a reel can show. */
const digits: Check<[number, number, number]> = (value) => {
  const reels = list(whole(1, 9), 3)(value);
  return reels?.length === 3 ? [reels[0], reels[1], reels[2]] : undefined;
};

const spinResult = shape<SpinResult>({ tier: oneOf(TIERS), digits, reach: flag }, ({ tier, digits: [left, centre, right] }) => {
  // A winning tier shows three of one of its own digits, and a miss is not a line.
  const line = left === centre && centre === right;
  return tier === 'miss' ? !line : line && TIER_DIGITS[tier].includes(left);
});

const activeSpin = shape<ActiveSpin>({ result: spinResult, elapsed: timer, duration: lasting, done: flag });

const activeSugoroku = shape<ActiveSugoroku>(
  {
    kind: oneOf(['sugoroku']),
    roll: whole(1, DIE_FACES),
    from: whole(0, BOARD.length - 1),
    elapsed: timer,
    duration: lasting,
    payout: whole(-1, LIMITS.purse),
  },
  // Once it has paid, it paid what the square it reached says.
  (b) => b.payout === -1 || b.payout === BOARD[squareAfter(b.from, b.roll)],
);

const inOrder = (medals: readonly number[]): string => [...medals].sort((a, b) => a - b).join();

const activeChest = shape<ActiveChest>(
  {
    kind: oneOf(['chest']),
    prizes: list(whole(0, LIMITS.purse), CHESTS.length),
    fallback: whole(0, CHESTS.length - 1),
    picked: whole(-1, CHESTS.length - 1),
    elapsed: timer,
    pickedAt: real(-1, LIMITS.timer),
    told: flag,
    payout: whole(-1, LIMITS.purse),
  },
  (c) => {
    // The chests hold the three prizes, in some order.
    if (inOrder(c.prizes) !== inOrder(CHESTS)) return false;
    // Until one is picked nothing has happened; after that it pays what the picked chest holds.
    if (c.picked < 0) return c.pickedAt === -1 && !c.told && c.payout === -1;
    return c.pickedAt >= 0 && c.pickedAt <= c.elapsed && (c.payout === -1 || c.payout === c.prizes[c.picked]);
  },
);

const activeBonus: Check<ActiveBonus> = (value) => activeSugoroku(value) ?? activeChest(value);

const activeRoulette = shape<ActiveRoulette>(
  {
    pocket: whole(0, ROULETTE.length - 1),
    from: whole(0, ROULETTE.length - 1),
    elapsed: timer,
    duration: lasting,
    landed: flag,
    level: whole(0, CHAIN_GOAL),
    total: count,
    gain: whole(0, LIMITS.purse),
    over: flag,
    jackpot: flag,
  },
  // A run ends on a pocket it has reached, and the jackpot ends the run.
  (r) => (!r.over || r.landed) && (!r.jackpot || r.over),
);

/** What one of the screen's three places holds: the thing stored there if it passes its check, and nothing otherwise. */
const shown = <T>(check: Check<T>, value: unknown): T | null => (value === null || value === undefined ? null : (check(value) ?? null));

// ── Writing and reading ─────────────────────────────────────────────────────

/**
 * The session as text: a version number, the field, the session's numbers, and
 * what the screen is in the middle of. All of it is plain data except the
 * generator, which is left out (see `restore`).
 */
export function serialize(session: Session): string {
  const { machine, spin, bonus, roulette, ...numbers } = session;
  const { rng: _rng, ...field } = machine;
  return JSON.stringify({ version: STORAGE_VERSION, machine: field, session: numbers, screen: { spin, bonus, roulette } });
}

/**
 * The session a text was written from, or null when the text is not a save
 * this version of the game could have written. It never throws.
 *
 * The generator's state is shut inside a closure and cannot be read, so it is
 * not stored: the machine that comes back draws from a new generator started
 * from `seed`. What had already been drawn — a spin's digits, a roulette's
 * pocket, what each chest holds — is plain data and comes back as it was.
 *
 * The field, the purse and the counters have to pass every check, or there is
 * no machine. The screen is treated more gently, so that a spin gone wrong does
 * not cost the player the medals: whatever it holds that is not a spin, a bonus
 * game or a roulette this machine could be showing is simply left off, and if
 * more than one of them is on at once, which the machine never does, all are.
 * A roulette that is left off gives its ball back: the ball waits again, and
 * its roulette is counted when it starts afresh, not twice.
 */
export function restore(text: string | null, seed: number): Session | null {
  try {
    if (text === null || text.length > LIMITS.length) return null;
    const save: unknown = JSON.parse(text);
    // Four parts and no others: the version, the field, the numbers and the screen.
    if (!isRecord(save) || Object.keys(save).length !== 4 || save.version !== STORAGE_VERSION) return null;
    const field = storedMachine(save.machine);
    const numbers = storedNumbers(save.session);
    const { screen } = save;
    if (!field || !numbers || !isRecord(screen)) return null;

    const on: OnScreen = { spin: shown(activeSpin, screen.spin), bonus: shown(activeBonus, screen.bonus), roulette: shown(activeRoulette, screen.roulette) };
    const busy = [on.spin, on.bonus, on.roulette].filter((thing) => thing !== null).length;
    const session: Session = { ...numbers, ...(busy > 1 ? { spin: null, bonus: null, roulette: null } : on), machine: { ...field, rng: seededRng(seed) } };
    if (screen.roulette !== null && screen.roulette !== undefined && session.roulette === null) {
      session.balls = Math.min(LIMITS.balls, session.balls + 1);
      session.roulettes = Math.max(0, session.roulettes - 1);
    }
    return session;
  } catch {
    // Not JSON, or something no check foresaw: either way, not a machine.
    return null;
  }
}
