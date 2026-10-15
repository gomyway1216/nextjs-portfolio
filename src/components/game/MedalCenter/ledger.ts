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
 * ## Receipts: a round's medals moved once
 *
 * A machine keeps its round (what was bet, what was drawn, what is owed) in
 * a record of its own, and the medals here. Those are two writes, and a
 * browser can die between any two writes. So a move of medals that belongs to
 * a round is made under a name, its receipt (`receiptOf`: the game, the
 * round, the step), and the receipt is written down in the same ledger, in
 * the same write, as the medals it moved (`applyMove`). A move whose receipt
 * the ledger holds is never made again: a machine can write its record and
 * then move the medals, or move them and then write its record, and after a
 * crash between the two simply try the move again. It is made then if it was
 * not made before, and not if it was.
 *
 * - Each device keeps its own receipts and writes no other's, with a count
 *   of the times it has changed them that only grows: of two copies of a
 *   device's receipts the one with the higher count is the later, as of two
 *   copies of a row the larger count is (`mergeLedgers`).
 * - A receipt is let go of only when the machine says its round is over and
 *   kept no more (`forgetReceipts`), so the receipts a device holds are only
 *   those of the rounds its machines are still in the middle of: a handful.
 *   No more than `RECEIPTS.device` are held at once; a move that would be
 *   one too many is not made.
 * - A copy keeps its own device's receipts whole, and other devices' only
 *   while they fit in `RECEIPTS.total`: every device keeps its own, so what
 *   another copy leaves out of one is never lost to the device whose it is.
 * - A reset throws them all away with the medals: every round from before
 *   it is void.
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
  /** Purses moved in, and sources looked at. */
  names: 64,
  /** Times the bank can be reset. */
  eras: 1_000_000,
  /** The longest text that is read at all. */
  length: 64_000,
} as const;

/**
 * How many receipts a ledger keeps (see the top of the file). A round needs
 * one for each move of its medals, two or three for most games and up to ten
 * for a hand of blackjack split and doubled; a device holds those of the
 * rounds its machines are in the middle of, every machine at once included.
 */
export const RECEIPTS = {
  /** Receipts one device holds at once. */
  device: 32,
  /** Receipts a copy keeps in all: its own device's, and other devices' while they fit. */
  total: 64,
} as const;

/** One device's row: what it has put into the bank, and what it has taken out, in this era. */
export interface Row {
  got: number;
  spent: number;
}

/** One device's receipts, in this era. */
export interface Receipts {
  /** How many times the device has changed them in this era: of two copies, the one with the higher count is the later. */
  n: number;
  /** The moves made and not yet let go of (`receiptOf`), each once, in alphabetical order. */
  ids: readonly string[];
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
  /**
   * What has been moved in and is worth nothing now (every purse of an era
   * before this one, and a new member's medals given to a player who was not
   * one), and what has been looked for and need not be looked for again
   * (`markChecked`). Never moved in again. A new member's medals of an era
   * before this one are not kept here: nothing of that era can come back.
   */
  voided: readonly string[];
  /** The days the daily bonus was taken. No reset forgets them. */
  claimed: DaySet;
  /**
   * For each game and each device, the era that device last started its
   * copy of the game's machine over in (`game@device`). A machine is a copy
   * on every device that has played it, and each copy kept from before a
   * reset has to start over on its own device. Only this era's are kept.
   */
  restarted: Readonly<Record<string, number>>;
  /** Each device's receipts for the moves of medals its machines' rounds have made, in this era. A ledger written before receipts has none. */
  receipts: Readonly<Record<string, Receipts>>;
}

const DEVICE_SHAPE = /^[a-z0-9]{6,16}$/;
const NAME_SHAPE = /^[a-z0-9@:-]{1,64}$/;
/** Whether a text will do as a device's name. */
export const isDevice = (value: unknown): value is string => typeof value === 'string' && DEVICE_SHAPE.test(value);
/** Whether a text will do as the name of a purse's source or of a game. */
export const isName = (value: unknown): value is string => typeof value === 'string' && NAME_SHAPE.test(value);

/** The names voided, once each and in order, without a new member's medals of an era other than `era`: they can never be in the bank again. */
function tidyVoided(voided: Iterable<string>, era: number): string[] {
  const current = welcomeOf(era);
  return [...new Set(voided)].filter((name) => !name.startsWith('welcome:') || name === current).sort();
}

/** The restarts of `era` alone: one from an era before it says nothing now. */
function tidyRestarted(restartedAt: Readonly<Record<string, number>>, era: number): Record<string, number> {
  return Object.fromEntries(
    Object.keys(restartedAt)
      .filter((key) => restartedAt[key] >= era)
      .sort()
      .map((key) => [key, restartedAt[key]]),
  );
}

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
    receipts: {},
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

/** Whether a purse from `source` has been moved in, in this era or one before, or looked for and found to have nothing to move in. */
export const hasImported = (ledger: Ledger, source: string): boolean => own(ledger.imports, source) || ledger.voided.includes(source);

/**
 * The ledger noting that `source` has been looked at, so that nobody looks
 * at it again: kept among the names voided, which no reset forgets.
 */
export const markChecked = (ledger: Ledger, source: string): Ledger =>
  !isName(source) || hasImported(ledger, source) ? ledger : { ...ledger, voided: tidyVoided([...ledger.voided, source], ledger.era) };

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
    voided: tidyVoided([...ledger.voided, ...Object.keys(ledger.imports)], era),
    claimed: ledger.claimed,
    restarted: {},
    receipts: {},
  };
}

/** The name a game's machine on this ledger's device is started over under. */
const restartKey = (ledger: Ledger, game: string): string => `${game}@${ledger.device}`;

/**
 * Whether this device's copy of a game's machine is to be started over: the
 * bank has been reset since this device last started it over. Every device
 * starts its own copy over once, so that no copy kept from before a reset is
 * played after it, on whichever device it was kept.
 */
export const restartDue = (ledger: Ledger, game: string): boolean => {
  const key = restartKey(ledger, game);
  return ledger.era > (own(ledger.restarted, key) ? ledger.restarted[key] : 0);
};

/** The ledger noting that this device's copy of a game's machine has been started over in this era. */
export const restarted = (ledger: Ledger, game: string): Ledger =>
  !isName(restartKey(ledger, game)) || !restartDue(ledger, game) ? ledger : { ...ledger, restarted: { ...ledger.restarted, [restartKey(ledger, game)]: ledger.era } };

// ── Receipts ────────────────────────────────────────────────────────────────

const RECEIPT_SHAPE = /^[a-z0-9-]{1,24}:[a-z0-9]{1,24}:[a-z0-9-]{1,16}$/;
/** Whether a text will do as a receipt. */
export const isReceipt = (value: unknown): value is string => typeof value === 'string' && RECEIPT_SHAPE.test(value);

/**
 * The receipt for one move of a round's medals: the game's name, the round's
 * (letters and digits, up to 24) and the step's (`stake`, `pay`…). Null when
 * one of them will not do.
 */
export function receiptOf(game: string, round: string, step: string): string | null {
  const receipt = `${game}:${round}:${step}`;
  return isReceipt(receipt) ? receipt : null;
}

const NO_RECEIPTS: Receipts = { n: 0, ids: [] };
/** A device's receipts, if the ledger keeps any for it. */
export const receiptsOf = (ledger: Pick<Ledger, 'receipts'>, device: string): Receipts => (own(ledger.receipts, device) ? ledger.receipts[device] : NO_RECEIPTS);

/** Whether the move a receipt names has been made in this ledger's era, on any device. */
export const hasReceipt = (ledger: Pick<Ledger, 'receipts'>, receipt: string): boolean => Object.values(ledger.receipts).some(({ ids }) => ids.includes(receipt));

/**
 * The receipts a copy kept on `home` keeps: home's own whole (up to what a
 * device may hold), then other devices' while they fit, the busiest first.
 * Another device's receipts are kept whole or not at all, and an empty set
 * of them is not kept. Home's own are kept even when there are none: their
 * count says that receipts let go of are not to come back from an older copy.
 */
function fitReceipts(receipts: Readonly<Record<string, Receipts>>, home: string): Record<string, Receipts> {
  const kept: Record<string, Receipts> = {};
  let room = RECEIPTS.total;
  if (own(receipts, home)) {
    const mine = receipts[home];
    kept[home] = { n: mine.n, ids: mine.ids.slice(0, RECEIPTS.device) };
    room -= kept[home].ids.length;
  }
  const others = Object.keys(receipts)
    .filter((device) => device !== home && receipts[device].ids.length > 0)
    .sort((a, b) => receipts[b].n - receipts[a].n || (a < b ? -1 : 1));
  for (const device of others) {
    const { n, ids } = receipts[device];
    if (ids.length > Math.min(room, RECEIPTS.device)) continue;
    kept[device] = { n, ids: [...ids] };
    room -= ids.length;
  }
  return Object.fromEntries(Object.keys(kept).sort().map((device) => [device, kept[device]]));
}

/** The ledger with its own device's receipts changed to `mine`, the others fitted around them. */
const withReceipts = (ledger: Ledger, mine: Receipts): Ledger => ({ ...ledger, receipts: fitReceipts({ ...ledger.receipts, [ledger.device]: mine }, ledger.device) });

/**
 * Makes the move a receipt names, once: `medals` given, or taken when below
 * nothing (none for 0), and the receipt written down with them in the same
 * ledger. `applied` false: the receipt was there already, the move was made
 * before, and the same ledger comes back. Null when it cannot be made: a
 * receipt or a number that will not do, more medals taken than the bank
 * holds, or as many receipts held on this device as it may hold.
 */
export function applyMove(ledger: Ledger, receipt: string, medals: number): { ledger: Ledger; applied: boolean } | null {
  if (!isReceipt(receipt) || !Number.isSafeInteger(medals)) return null;
  if (hasReceipt(ledger, receipt)) return { ledger, applied: false };
  const mine = receiptsOf(ledger, ledger.device);
  if (mine.ids.length >= RECEIPTS.device || mine.n >= LIMITS.medals) return null;
  const moved = medals < 0 ? take(ledger, -medals) : medals > 0 ? give(ledger, medals) : ledger;
  if (!moved) return null;
  return { ledger: withReceipts(moved, { n: mine.n + 1, ids: [...mine.ids, receipt].sort() }), applied: true };
}

/**
 * Lets go of this device's receipts for `game`'s rounds, except those of the
 * rounds in `keep`: rounds that are over and kept no more, whose moves can
 * never be tried again. The same ledger comes back when there is nothing to
 * let go of.
 */
export function forgetReceipts(ledger: Ledger, game: string, keep: readonly string[] = []): Ledger {
  const mine = receiptsOf(ledger, ledger.device);
  const prefix = `${game}:`;
  const ids = mine.ids.filter((receipt) => !receipt.startsWith(prefix) || keep.includes(receipt.slice(prefix.length, receipt.indexOf(':', prefix.length))));
  if (ids.length === mine.ids.length || mine.n >= LIMITS.medals) return ledger;
  return withReceipts(ledger, { n: mine.n + 1, ids });
}

/** Two copies of the receipts: for each device the later (the higher count), and both together where the counts are the same. */
function laterReceipts(a: Readonly<Record<string, Receipts>>, b: Readonly<Record<string, Receipts>>, home: string): Record<string, Receipts> {
  const joined: Record<string, Receipts> = {};
  for (const device of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const [one, other] = [own(a, device) ? a[device] : null, own(b, device) ? b[device] : null];
    if (one && other && one.n === other.n) joined[device] = { n: one.n, ids: [...new Set([...one.ids, ...other.ids])].sort() };
    else joined[device] = one && other ? (one.n > other.n ? one : other) : (one ?? other)!;
  }
  return fitReceipts(joined, home);
}

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
  const everVoided = [...a.voided, ...b.voided];
  if (a.era !== b.era) {
    const [newer, older] = a.era > b.era ? [a, b] : [b, a];
    // What the older era moved in is void in the newer.
    const voided = tidyVoided([...everVoided, ...Object.keys(older.imports)], newer.era);
    // The older era's receipts go with its medals: every round of that era is void.
    return { ...newer, device: a.device, voided, claimed, restarted: tidyRestarted(restartedAt, newer.era), receipts: fitReceipts(newer.receipts, a.device) };
  }
  return {
    v: LEDGER_VERSION,
    device: a.device,
    era: a.era,
    rows: laterRows(a.rows, b.rows),
    imports: largest(a.imports, b.imports),
    voided: tidyVoided(everVoided, a.era),
    claimed,
    restarted: tidyRestarted(restartedAt, a.era),
    receipts: laterReceipts(a.receipts, b.receipts, a.device),
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
    receipts: inOrder(Object.fromEntries(Object.entries(ledger.receipts).map(([device, { n, ids }]) => [device, { n, ids: [...ids] }]))),
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
  const named = (record: Record<string, unknown>, read: (stored: unknown) => number | null, most: number = LIMITS.names): Record<string, number> | null => {
    const entries = Object.entries(record);
    if (entries.length > most) return null;
    const out: Record<string, number> = {};
    for (const [name, stored] of entries) {
      const amount = read(stored);
      if (!isName(name) || amount === null) return null;
      out[name] = amount;
    }
    return out;
  };
  const imports = named(value.imports, count);
  // One for each game on each device that has started its machine over since the last reset.
  const restartedAt = named(value.restarted, (stored) => (typeof stored === 'number' && Number.isInteger(stored) && stored >= 0 && stored <= LIMITS.eras ? stored : null), LIMITS.devices);
  if (!imports || !restartedAt) return null;
  if (value.voided.length > LIMITS.names || !value.voided.every(isName)) return null;
  const voided = tidyVoided(value.voided as string[], era);
  // The days are the record book's own sets, read the way it reads them: a day that is not on the calendar is left out.
  const claimed = readDays(value.claimed);
  const receipts = readReceipts(value.receipts, value.device);
  return { v: LEDGER_VERSION, device: value.device, era, rows, imports, voided, claimed, restarted: tidyRestarted(restartedAt, era), receipts };
}

/**
 * Stored receipts, read the way the days are: none in a ledger written before
 * there were any, and a device's that are not in shape, or a receipt that is
 * not one, left out. Unlike a row, a receipt changes no balance: leaving one
 * out loses no medal, where refusing the whole ledger would put every medal
 * in it aside.
 */
function readReceipts(value: unknown, home: string): Record<string, Receipts> {
  const receipts: Record<string, Receipts> = {};
  if (!isRecord(value)) return receipts;
  for (const [device, stored] of Object.entries(value).slice(0, LIMITS.devices)) {
    if (!isDevice(device) || !isRecord(stored) || !Array.isArray(stored.ids)) continue;
    const n = count(stored.n);
    if (n === null) continue;
    const ids = [...new Set(stored.ids.slice(0, RECEIPTS.total).filter(isReceipt))].sort();
    receipts[device] = { n, ids };
  }
  return fitReceipts(receipts, home);
}
