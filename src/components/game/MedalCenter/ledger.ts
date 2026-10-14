/**
 * The medal bank's ledger: how many medals a player has deposited at the
 * medal center, kept as arithmetic on a small document.
 *
 * In a Japanese arcade a member keeps medals in the shop's medal bank (メダル
 * バンク, 貯メダル): won medals are deposited (預け入れ) and drawn out again
 * (引き出し) on a later visit, and at shops that link the bank to a member's
 * IC card the medals can be sent straight to a machine's credit (メダル転送)
 * and back. Here every machine of the medal center plays straight from the
 * bank: a medal fed into a machine is taken from it, and a medal won goes back
 * into it. This file is only the arithmetic. It never touches the browser and
 * never reads the clock.
 *
 * One player's ledger can exist in several copies: a phone's and a laptop's,
 * and the account's. `mergeLedgers` joins two copies so that nothing is lost
 * and nothing is counted twice, whatever order they meet in and however often:
 *
 * - Every device keeps its own row of two counts that only ever grow: medals
 *   it put into the bank (`got`) and medals it took out (`spent`). A device
 *   writes its own row and no other, so of two copies of a row the larger
 *   count is the later one. The balance is what all the rows got less what
 *   they spent: a counter that can go up and down and still be joined.
 * - A purse a machine held before there was a bank is moved in once
 *   (`imports`), under a name for where it came from, so that two devices
 *   that each move the same purse in count it once. A new member's medals
 *   are kept the same way, under a name of their own (`welcome:` and the
 *   era), so two guests' banks that become one account's give them once; and
 *   a player whose old machine had a purse was never a new member, so moving
 *   that purse in takes the new member's medals back (`voided`).
 * - A reset starts a new era. A copy from an older era gives way to one from
 *   a newer, except for two things no reset forgets: the days the daily bonus
 *   was taken, so that a reset is not a way to take a day's bonus again, and
 *   what has been moved in, which is void from then on. A purse from before
 *   the bank is never moved into a bank that has been reset.
 *
 * What comes back out of storage is not trusted: it is checked field by field
 * and kept within `LIMITS`.
 */

import { addDay, cardOn, hasDay, readDays, unionDays, type BonusCard, type Day, type DaySet } from '../MedalPusher/records';

export const LEDGER_VERSION = 1;

/**
 * Medals a new member is given: what a new Medal Pusher always started with.
 * A player who has a machine from before the bank has its purse instead.
 */
export const WELCOME = 100;
/** Medals a player who has none left is given, free: the cupful the attendant brings. */
export const REFILL = 100;

export const LIMITS = {
  /** Any count in a row, and any purse moved in. Nobody plays near it. */
  medals: 1_000_000_000_000,
  /** Rows a ledger keeps: one for every browser that has played it. A copy with more is not a ledger. */
  devices: 256,
  /** Purses moved in, and games whose machines are kept track of. */
  names: 64,
  /** Times the bank can be reset. */
  eras: 1_000_000,
  /** The longest text that is read at all. */
  length: 64_000,
} as const;

/** One device's row: what it has put into the bank, and what it has taken out, in this era. */
export interface Row {
  got: number;
  spent: number;
}

export interface Ledger {
  v: typeof LEDGER_VERSION;
  /** The device this copy is written on: a name made up at random when the copy was first kept here. */
  device: string;
  /** How many times the bank has been reset. */
  era: number;
  /** Each device's row, in this era. */
  rows: Readonly<Record<string, Row>>;
  /**
   * Medals put in once, under a name for where they came from: purses moved
   * in from machines that had their own before there was a bank, and a new
   * member's medals (`welcomeOf`). In this era.
   */
  imports: Readonly<Record<string, number>>;
  /** What has been moved in and is worth nothing now: everything of an era before this one, and a new member's medals given to a player who was not one. Never moved in again. */
  voided: readonly string[];
  /** The days the daily bonus was taken. No reset forgets them. */
  claimed: DaySet;
  /** The era each game's machines were last started over in: a machine played in an era before the bank's is started again. */
  restarted: Readonly<Record<string, number>>;
}

const DEVICE_SHAPE = /^[a-z0-9]{6,16}$/;
const NAME_SHAPE = /^[a-z0-9@:-]{1,64}$/;
/** Whether a text will do as a device's name. */
export const isDevice = (value: unknown): value is string => typeof value === 'string' && DEVICE_SHAPE.test(value);
/** Whether a text will do as the name of a purse's source or of a game. */
export const isName = (value: unknown): value is string => typeof value === 'string' && NAME_SHAPE.test(value);

const own = (record: Readonly<Record<string, unknown>>, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);
/** A device's row, if the ledger has one. A name is looked up among the ledger's own rows and nowhere else. */
export const rowOf = (ledger: Pick<Ledger, 'rows'>, device: string): Row => (own(ledger.rows, device) ? ledger.rows[device] : { got: 0, spent: 0 });

/** The name a new member's medals are kept under in an era. */
export const welcomeOf = (era: number): string => `welcome:${era}`;

/** A new ledger for a device, with a new member's `welcome` medals in it. */
export function createLedger(device: string, welcome = WELCOME): Ledger {
  return {
    v: LEDGER_VERSION,
    device,
    era: 0,
    rows: {},
    imports: welcome > 0 ? { [welcomeOf(0)]: welcome } : {},
    voided: [],
    claimed: {},
    restarted: {},
  };
}

/** The ledger as it would be kept on another device: its rows and everything else, under that device's name. */
export const asDevice = (ledger: Ledger, device: string): Ledger => ({ ...ledger, device });

/**
 * The medals in the bank: what every row has put in, less what every row has
 * taken out, and the purses moved in. It can be below nothing when two
 * devices spent the same medals before either had heard of the other (see
 * the top of bank.ts); nothing can be taken out then.
 */
export function balanceOf(ledger: Ledger): number {
  let balance = 0;
  for (const row of Object.values(ledger.rows)) balance += row.got - row.spent;
  for (const [source, medals] of Object.entries(ledger.imports)) if (!ledger.voided.includes(source)) balance += medals;
  return balance;
}

/** The medals that can be taken out: the balance, or none when it is below nothing. */
export const spendable = (ledger: Ledger): number => Math.max(0, balanceOf(ledger));

const whole = (medals: number): boolean => Number.isSafeInteger(medals) && medals > 0;

/** The ledger with `medals` put in by its own device. The same ledger comes back for a number that is not a whole number above nothing. */
export function give(ledger: Ledger, medals: number): Ledger {
  if (!whole(medals)) return ledger;
  const row = rowOf(ledger, ledger.device);
  return { ...ledger, rows: { ...ledger.rows, [ledger.device]: { got: Math.min(LIMITS.medals, row.got + medals), spent: row.spent } } };
}

/** The ledger with `medals` taken out by its own device, or null when the bank does not hold that many. */
export function take(ledger: Ledger, medals: number): Ledger | null {
  if (!whole(medals) || spendable(ledger) < medals) return null;
  const row = rowOf(ledger, ledger.device);
  return { ...ledger, rows: { ...ledger.rows, [ledger.device]: { got: row.got, spent: Math.min(LIMITS.medals, row.spent + medals) } } };
}

/** Whether a purse from `source` has been moved in, in this era or one before. */
export const hasImported = (ledger: Ledger, source: string): boolean => own(ledger.imports, source) || ledger.voided.includes(source);

/**
 * The ledger with the purse a machine held before there was a bank moved in,
 * under where it came from. A player who had such a machine was never a new
 * member, so the new member's medals of this era are taken back with it;
 * `machine: false` writes down that there was no machine to move a purse
 * from, so that nobody looks again, and takes nothing back. A source that
 * has been moved in already is not moved in again, and nothing is moved into
 * a bank that has been reset, since a reset throws away everything from
 * before it: the same ledger comes back.
 */
export function importPurse(ledger: Ledger, source: string, medals: number, machine = true): Ledger {
  if (ledger.era > 0 || !isName(source) || source.startsWith('welcome:') || hasImported(ledger, source) || !Number.isSafeInteger(medals) || medals < 0) return ledger;
  const welcome = welcomeOf(ledger.era);
  const imports = { ...ledger.imports, [source]: machine ? Math.min(LIMITS.medals, medals) : 0 };
  if (!machine || ledger.voided.includes(welcome)) return { ...ledger, imports };
  return { ...ledger, imports, voided: [...ledger.voided, welcome].sort() };
}

/** The daily bonus card on `day`, from the days the bonus was taken. */
export const cardOf = (ledger: Pick<Ledger, 'claimed'>, day: Day): BonusCard => cardOn(ledger.claimed, day);

/**
 * Takes the day's bonus, if it is there to take: the day is stamped and its
 * medals are put in, in one ledger, so that one is never written without the
 * other. Nothing changes when there is nothing to take.
 */
export function claimBonus(ledger: Ledger, day: Day): { ledger: Ledger; medals: number } {
  const card = cardOf(ledger, day);
  if (card.state !== 'ready') return { ledger, medals: 0 };
  return { ledger: give({ ...ledger, claimed: addDay(ledger.claimed, day) }, card.medals), medals: card.medals };
}

/** Whether `day`'s bonus has been taken. */
export const tookBonus = (ledger: Pick<Ledger, 'claimed'>, day: Day): boolean => hasDay(ledger.claimed, day);

/** The ledger with the days of another set the bonus was taken on: a record book's, from before the bank paid it. */
export const withClaimed = (ledger: Ledger, days: DaySet): Ledger => {
  const claimed = unionDays(ledger.claimed, days);
  return JSON.stringify(claimed) === JSON.stringify(ledger.claimed) ? ledger : { ...ledger, claimed };
};

/** Whether a free refill is due: the bank holds nothing to play with. */
export const refillDue = (ledger: Ledger): boolean => balanceOf(ledger) <= 0;

/** The ledger with a free refill put in, when one is due; the same ledger when not. */
export const refill = (ledger: Ledger): Ledger => (refillDue(ledger) ? give(ledger, REFILL) : ledger);

/**
 * The bank started over: a new era, with a new member's medals in it, put in
 * by this device. Every medal in it before is gone, on every device, once
 * they hear of it. The days the bonus was taken stay, and so does the
 * knowledge of which old purses have been moved in: they are void now.
 */
export function resetLedger(ledger: Ledger): Ledger {
  const era = Math.min(LIMITS.eras, ledger.era + 1);
  return {
    v: LEDGER_VERSION,
    device: ledger.device,
    era,
    rows: {},
    imports: { [welcomeOf(era)]: WELCOME },
    voided: [...new Set([...ledger.voided, ...Object.keys(ledger.imports)])].sort(),
    claimed: ledger.claimed,
    restarted: ledger.restarted,
  };
}

/** Whether a game's machines are to be started over: the bank has been reset since that game last was. */
export const restartDue = (ledger: Ledger, game: string): boolean => ledger.era > (own(ledger.restarted, game) ? ledger.restarted[game] : 0);

/** The ledger noting that a game's machines have been started over in this era. */
export const restarted = (ledger: Ledger, game: string): Ledger =>
  !isName(game) || !restartDue(ledger, game) ? ledger : { ...ledger, restarted: { ...ledger.restarted, [game]: ledger.era } };

// ── Two copies of one ledger ────────────────────────────────────────────────

function laterRows(a: Readonly<Record<string, Row>>, b: Readonly<Record<string, Row>>): Record<string, Row> {
  const rows: Record<string, Row> = {};
  for (const device of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    const [one, other] = [own(a, device) ? a[device] : null, own(b, device) ? b[device] : null];
    rows[device] = one && other ? { got: Math.max(one.got, other.got), spent: Math.max(one.spent, other.spent) } : (one ?? other)!;
  }
  return rows;
}

function largest(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>): Record<string, number> {
  const joined: Record<string, number> = {};
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
    joined[key] = Math.max(own(a, key) ? a[key] : 0, own(b, key) ? b[key] : 0);
  }
  return joined;
}

/**
 * Two copies of one player's ledger as one, kept as the first one's device.
 * Of two eras the later wins; within one, every row is the later of its two
 * copies and every purse moved in is counted once. See the top of the file.
 */
export function mergeLedgers(a: Ledger, b: Ledger): Ledger {
  const claimed = unionDays(a.claimed, b.claimed);
  const restartedAt = largest(a.restarted, b.restarted);
  const everVoided = new Set([...a.voided, ...b.voided]);
  if (a.era !== b.era) {
    const [newer, older] = a.era > b.era ? [a, b] : [b, a];
    // What the older era moved in is void in the newer.
    const voided = [...new Set([...everVoided, ...Object.keys(older.imports)])].sort();
    return { ...newer, device: a.device, voided, claimed, restarted: restartedAt };
  }
  return {
    v: LEDGER_VERSION,
    device: a.device,
    era: a.era,
    rows: laterRows(a.rows, b.rows),
    imports: largest(a.imports, b.imports),
    voided: [...everVoided].sort(),
    claimed,
    restarted: restartedAt,
  };
}

// ── Text ────────────────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** A stored count: a whole number from nothing up to the most a ledger counts. Anything else is not one. */
const count = (value: unknown): number | null => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= LIMITS.medals ? value : null);

const inOrder = <T>(record: Readonly<Record<string, T>>): Record<string, T> => Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));

/**
 * The ledger as text, always laid out the same way, so two copies that hold
 * the same things are the same text.
 */
export function serializeLedger(ledger: Ledger): string {
  const tidy: Ledger = {
    v: LEDGER_VERSION,
    device: ledger.device,
    era: ledger.era,
    rows: inOrder(Object.fromEntries(Object.entries(ledger.rows).map(([device, row]) => [device, { got: row.got, spent: row.spent }]))),
    imports: inOrder(ledger.imports),
    voided: [...ledger.voided].sort(),
    claimed: inOrder(ledger.claimed),
    restarted: inOrder(ledger.restarted),
  };
  return JSON.stringify(tidy);
}

/** What two copies have in common when they hold the same medals and days, whichever device each is kept on. */
export function printOf(text: string): string {
  const ledger = parseLedger(text);
  return ledger ? serializeLedger({ ...ledger, device: '' }) : text;
}

/**
 * Reads a ledger back. Unlike a record book, a ledger that is damaged
 * anywhere is not a ledger at all: a row left out or a count brought down
 * would change the balance, so the whole text is refused (null) and nothing
 * of it is used. A copy that is refused is never written over (bank.ts).
 */
export function parseLedger(text: unknown): Ledger | null {
  if (typeof text !== 'string' || text.length > LIMITS.length) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== LEDGER_VERSION || !isDevice(value.device)) return null;
  const era = typeof value.era === 'number' && Number.isInteger(value.era) && value.era >= 0 && value.era <= LIMITS.eras ? value.era : null;
  if (era === null || !isRecord(value.rows) || !isRecord(value.imports) || !Array.isArray(value.voided) || !isRecord(value.claimed) || !isRecord(value.restarted)) return null;

  const rowEntries = Object.entries(value.rows);
  if (rowEntries.length > LIMITS.devices) return null;
  const rows: Record<string, Row> = {};
  for (const [device, stored] of rowEntries) {
    if (!isDevice(device) || !isRecord(stored)) return null;
    const got = count(stored.got);
    const spent = count(stored.spent);
    if (got === null || spent === null) return null;
    rows[device] = { got, spent };
  }
  const named = (record: Record<string, unknown>, read: (stored: unknown) => number | null): Record<string, number> | null => {
    const entries = Object.entries(record);
    if (entries.length > LIMITS.names) return null;
    const out: Record<string, number> = {};
    for (const [name, stored] of entries) {
      const amount = read(stored);
      if (!isName(name) || amount === null) return null;
      out[name] = amount;
    }
    return out;
  };
  const imports = named(value.imports, count);
  const restartedAt = named(value.restarted, (stored) => (typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 && stored <= LIMITS.eras ? stored : null));
  if (!imports || !restartedAt) return null;
  if (value.voided.length > LIMITS.names || !value.voided.every(isName)) return null;
  const voided = [...new Set(value.voided as string[])].sort();
  // The days are the record book's own sets, read the way it reads them: a day that is not on the calendar is left out.
  const claimed = readDays(value.claimed);
  return { v: LEDGER_VERSION, device: value.device, era, rows, imports, voided, claimed, restarted: restartedAt };
}
