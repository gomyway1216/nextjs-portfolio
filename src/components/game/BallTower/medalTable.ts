/**
 * Firework Ball Tower on the medal center's floor: a ball is played with the
 * medals every machine of the medal center shares (`MedalCenter/bank.ts`).
 *
 * ## A run, once
 *
 * START draws the whole run (engine.ts), writes it down and takes its medals,
 * in that order: the run is on record before its medals are gone. What it
 * pays is known from that moment (the pocket on every disc was drawn), and it
 * goes into the medals once, whichever comes first:
 *
 * - the ball comes to rest on this page (Skip only gets it there the sooner);
 * - the page is hidden, left or reloaded: the run is finished then, before
 *   the card goes, and marked as finished away (`away`), so that the page that
 *   shows it next says so;
 * - the page was killed before it could do either: the next page of this
 *   machine that holds the card for the same player finds the run on record,
 *   unfinished, and finishes it, marked the same way.
 *
 * A moment's loan of the card (the medal center's front in another tab taking
 * the day's bonus, a floor jackpot paid in there) finishes nothing: the card
 * comes straight back and the ball comes down as it was coming. Whichever page
 * finishes a run, it ends the same, as it was drawn, and is paid once.
 *
 * ## Receipts
 *
 * The record and the medals are two writes, and a browser can die between any
 * two writes. So the medals taken and the medals paid each go into the medals
 * under a receipt (`bank.apply`; "A machine's rounds" in bank.ts), and
 * whichever page next holds the card squares the record with them:
 *
 * - a run on record whose medals never went in never happened: it is thrown
 *   away;
 * - a run marked paid whose pay never went in (its medals did) is paid now,
 *   once.
 *
 * A run's receipts are let go of when the next run's medals go in. A run that
 * pays nothing moves no medals at its end; the medal center is told that its
 * medals are out no more (`bank.settle`).
 *
 * While START is writing its run down and taking its medals, the run on record
 * is that press's own (`staking`): the bank tells everything that listens to it
 * of each move as it makes it, and a page that looks for a run left unfinished
 * then finds none (`leftover`), so nothing settles a run whose ball has not
 * even gone up.
 *
 * When this browser's storage can be read but will not keep the run, no run is
 * played (`unsaved`). Storage that cannot be used at all keeps nothing, and the
 * run is played from this page's memory, as the medals then are.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { copyDraw, isBet, isDraw, labelOf, runOf, wonOf, type Bet, type Draw, type Run } from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const BALL_TOWER_GAME = 'ball-tower';
/** Where a guest's run is kept on this device. An account's is under its own name (`runKey`). */
export const RUN_KEY = 'ball-tower-run-v1';
export const runKey = (owner: string | null): string => (owner === null ? RUN_KEY : `${RUN_KEY}:${owner}`);

/** The names of a run's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

/** A run as it is written down: the bet, how it was drawn, and whether it has been settled. */
export interface RunRecord {
  v: 1;
  id: string;
  /** Whose medals: an account's id, or null for a guest's. It says where the run is kept (`runKey`). */
  owner: string | null;
  /** The ledger the medals were played from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was played: a reset since voids it. */
  era: number;
  bet: Bet;
  draw: Draw;
  /** Whether it has been settled: the ball at rest, and what it pays in (or there was nothing). */
  paid: boolean;
  /**
   * Whether it was finished away from the player's eyes: by a page that was hidden, left or reloaded mid-run, or by the
   * next page, which found it left unfinished. Left out of a run that came to rest on the page that played it. The page
   * that shows the run later says so (PlayTab.tsx).
   */
  away?: true;
}

/** A run as the page that holds it knows it. */
export interface Staked {
  /** The run as last written. */
  record: RunRecord;
  /** Whether it is written down on this device. A run that could not be is finished from what the page knows. */
  stored: boolean;
  /** Whether it has been settled: paid, or found paid by another page. */
  paid: boolean;
  /** Whether a reset came between its medals and its end, or its medals never went in: it pays nothing. */
  void: boolean;
}

/** How a run ended when it was settled. */
export type Settled = 'paid' | 'already' | 'void' | 'later';

export type StakeOutcome =
  | { kind: 'staked'; staked: Staked }
  /** Not medals enough for the bet, or a bet or draw the machine could not have made. */
  | { kind: 'short' }
  /** A run of these medals is still to be finished: it is finished first. */
  | { kind: 'unfinished' }
  /** Storage can be read but will not keep the run: nothing is taken. */
  | { kind: 'unsaved' }
  /** The medals are in another tab's machine, or are still being read. */
  | { kind: 'away' };

/** A run on record, played out from its draw. */
export const runOfRecord = (record: RunRecord): Run => runOf(record.draw);
/** What a run on record pays. */
export const wonOfRecord = (record: RunRecord): number => wonOf(runOf(record.draw), record.bet);

// ── Reading a run back ──────────────────────────────────────────────────────

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A run's name, as the bank takes a round's: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;

/** A run as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is trusted. */
export function parseRun(text: unknown): RunRecord | null {
  if (typeof text !== 'string' || text.length > 1_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordLike(data) || data.v !== 1 || typeof data.id !== 'string' || !ID_SHAPE.test(data.id)) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (!isBet(data.bet) || !isDraw(data.draw) || typeof data.paid !== 'boolean') return null;
  const record: RunRecord = { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, bet: data.bet, draw: copyDraw(data.draw), paid: data.paid };
  if (data.away === undefined) return record;
  // Finished away: only a run that has been settled.
  if (data.away !== true || !data.paid) return null;
  return { ...record, away: true };
}

export const serializeRun = (record: RunRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  /** A move of a run's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every run but those in `keep` has no medals out any more: no refill is given while one does. */
  settle(game: string, keep?: readonly string[]): boolean;
}

/** This device's storage. Every call may throw: storage can be blocked, full or switched off. */
export interface TableStorage {
  read(key: string): string | null;
  write(key: string, text: string): void;
  remove(key: string): void;
}

export interface TableOptions {
  bank: TableBank;
  storage: TableStorage;
  /** Whether this page holds the card, so that it may take and give medals. */
  holding: () => boolean;
  /** A name for a run that no other run has. */
  newId: () => string;
}

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /** The run, where storage cannot be used at all (or would not keep it): this page's memory alone keeps it. */
  let memory: RunRecord | null = null;
  /** The runs settled on this page, whether or not storage took the record saying so. */
  const settledHere = new Set<string>();
  /**
   * The run this table is staking at this moment: from its record being written until its medals are in and the runs
   * before it are let go of. The bank tells everything that listens to it of each of those moves as it makes it, inside
   * `stake`: a page that looks for a run left unfinished then is looking at its own press, not at a run left unfinished
   * (`leftover`).
   */
  let staking: string | null = null;

  /** The medals on the table: which ledger, in which era. */
  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };
  const belongs = (record: RunRecord): boolean => {
    const medals = onTable();
    return medals !== null && record.ledger === medals.device && record.era === medals.era;
  };

  /** Storage's text at `key`; undefined when storage cannot be read at all. */
  const read = (key: string): string | null | undefined => {
    try {
      return storage.read(key);
    } catch {
      return undefined;
    }
  };
  const write = (key: string, text: string): boolean => {
    try {
      storage.write(key, text);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (key: string): boolean => {
    try {
      storage.remove(key);
      return true;
    } catch {
      return false;
    }
  };

  /** A move of a run's medals, under its receipt. */
  const move = (record: RunRecord, step: string, medals: number) => bank.apply({ game: BALL_TOWER_GAME, round: record.id, step, medals, era: record.era });
  const moved = (record: RunRecord, step: string): boolean => bank.applied({ game: BALL_TOWER_GAME, round: record.id, step });

  /** A run's winnings, in under their receipt; the medal floor hears of them once, as they go in, the jackpot and a run to the jackpot disc by name. */
  const payWinnings = (record: RunRecord): void => {
    const run = runOf(record.draw);
    const won = wonOf(run, record.bet);
    if (won <= 0 || move(record, PAY_STEP, won) !== 'applied') return;
    const label = labelOf(run);
    floorReport(BALL_TOWER_GAME, { won, prize: label ? { medals: won, label } : { medals: won } });
  };

  /** Whether a run is still to be finished: its medals went in (or may have), and it has not been settled. */
  const unfinished = (record: RunRecord | null): record is RunRecord => record !== null && !record.paid && !settledHere.has(record.id);

  /**
   * The run of the medals on the table, wherever it is kept, and the key it is kept under (null for this page's
   * memory): under the player's name, or, for an account whose medals were this device's guest's until the first
   * sign-in moved them in, under the guest's, from where the page that holds the card moves it to the account's place.
   * A run of these medals from before a reset, and text that is not a run, are thrown away by that page. Runs of other
   * medals are left as they are. Undefined: storage cannot be read, and memory holds no run of these medals.
   */
  const find = (): { record: RunRecord; key: string | null } | null | undefined => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const mine = holding();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const key = runKey(place);
      const text = read(key);
      if (text === undefined) return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : undefined;
      if (text === null) continue;
      const found = parseRun(text);
      if (!found) {
        // Text that is not a run this machine can read: not a run, and not one to keep.
        if (mine && place === owner) remove(key);
        continue;
      }
      if (found.ledger !== medals.device) continue;
      if (found.era !== medals.era) {
        // From these medals before a reset: it went with them.
        if (mine) remove(key);
        continue;
      }
      if (place === owner) return { record: found, key };
      if (!mine) return { record: { ...found, owner }, key };
      const adopted: RunRecord = { ...found, owner };
      if (!write(runKey(owner), serializeRun(adopted))) return { record: found, key };
      remove(key);
      return { record: adopted, key: runKey(owner) };
    }
    return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : null;
  };

  /**
   * Squares a run found with its receipts, by the page that holds the card: a run whose medals never went in never
   * happened, and is thrown away; a run marked paid whose pay never went in, though its medals did, is paid now.
   * Returns the run as it stands, or null for none.
   */
  const square = (found: { record: RunRecord; key: string | null }): RunRecord | null => {
    const { record, key } = found;
    if (settledHere.has(record.id) || record.id === staking) return record;
    const staked = moved(record, STAKE_STEP);
    if (!record.paid) {
      if (staked) return record;
      if (key === null) memory = null;
      else remove(key);
      return null;
    }
    if (staked && !moved(record, PAY_STEP) && wonOfRecord(record) > 0) payWinnings(record);
    return record;
  };

  /** The run of the medals on the table as it stands, squared with its receipts when this page holds the card. */
  const look = (): RunRecord | null | undefined => {
    const found = find();
    if (!found) return found;
    return holding() ? square(found) : found.record;
  };

  return {
    /**
     * START: `draw` (drawn in the press) is written down with the bet, and the medals are taken. Nothing is taken when it
     * cannot be: the card is not here, there are not medals enough, the bet or the draw is not one the machine makes, a
     * run of these medals is still to be finished, or storage will not keep the run.
     */
    stake(bet: Bet, draw: Draw): StakeOutcome {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null) return { kind: 'away' };
      if (!isBet(bet) || !isDraw(draw) || bank.balance() < bet) return { kind: 'short' };
      const found = find();
      const now = found ? square(found) : null;
      if (unfinished(now)) return { kind: 'unfinished' };
      const owner = bank.owner();
      const record: RunRecord = { v: 1, id: newId(), owner, ledger: medals.device, era: medals.era, bet, draw: copyDraw(draw), paid: false };
      const key = runKey(owner);
      const before = memory;
      staking = record.id;
      try {
        const stored = write(key, serializeRun(record));
        if (stored) memory = null;
        else if (read(key) !== undefined) return { kind: 'unsaved' };
        else memory = record;
        // The medals go in under their receipt after the run is written down: a browser that dies between the two
        // leaves a run whose medals the medals do not hold, which never happened (`square`).
        if (move(record, STAKE_STEP, -bet) !== 'applied') {
          if (stored) {
            if (now) write(key, serializeRun(now));
            else remove(key);
          }
          memory = before;
          return { kind: 'short' };
        }
        // The medals played feed the floor jackpot, once, as they go in: from here they are at risk, and nothing gives
        // them back.
        floorReport(BALL_TOWER_GAME, { played: bet });
        // The run before this one is no longer on record: nothing will look at its receipts again.
        bank.forget(BALL_TOWER_GAME, [record.id]);
        return { kind: 'staked', staked: { record, stored, paid: false, void: false } };
      } finally {
        staking = null;
      }
    },

    /**
     * Finishes a run and puts its winnings into the medals, once: as it was drawn. `away`: finished out of the player's
     * sight (the page going, or a run found left unfinished), and written down so. `later`: not now (the card is not
     * here, or the medals on the table are not the ones it was played from), and the run stays on record to be
     * finished. `already`: another page settled it. `void`: the medals were reset since it was played, or its medals
     * never went in.
     */
    settle(staked: Staked, away = false): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = runKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parseRun(there)?.id === record.id) remove(key);
        if (memory?.id === record.id) memory = null;
        return 'void';
      }
      if (!holding()) return 'later';
      if (staked.stored) {
        const there = read(key);
        if (there !== undefined) {
          const found = there === null ? null : parseRun(there);
          // Not on record any more, or another run in its place: another page has settled it, or a reset cleared it.
          if (!found || found.id !== record.id || found.paid) {
            staked.paid = true;
            if (found && found.id === record.id) staked.record = found;
            return 'already';
          }
        }
      }
      if (!moved(record, STAKE_STEP)) {
        // Its medals never went in: it never happened.
        staked.void = true;
        staked.paid = true;
        if (staked.stored) remove(key);
        if (memory?.id === record.id) memory = null;
        return 'void';
      }
      // Marked paid first, so that nothing that hears of the medals moving finds the run still to finish; then its
      // winnings go in under their receipt. A page that dies between the two leaves a run marked paid whose winnings the
      // next page that holds the card puts in, once (`square`).
      const paid: RunRecord = { ...record, paid: true, ...(away ? { away: true as const } : {}) };
      if (staked.stored) write(key, serializeRun(paid));
      if (memory?.id === record.id) memory = paid;
      settledHere.add(record.id);
      staked.record = paid;
      staked.paid = true;
      payWinnings(paid);
      // The ball is at rest: none of the run's medals are out any more, a run that paid nothing included.
      bank.settle(BALL_TOWER_GAME);
      return 'paid';
    },

    /**
     * A run this device left unfinished with the medals on the table, which the page that holds the card now is to
     * finish: null when there is none.
     */
    leftover(): RunRecord | null {
      // While START stakes, the run on record is that press's own: nothing is left unfinished, and nothing is settled.
      if (!holding() || !bank.getState().loaded || staking !== null) return null;
      const now = look();
      const left = unfinished(now ?? null) ? now! : null;
      // Only a run still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(BALL_TOWER_GAME, left ? [left.id] : []);
      return left;
    },

    /** The last run of the medals on the table, to show: null for none. */
    last(): RunRecord | null {
      return look() ?? null;
    },

    /** Forgets the run kept for the player on the table: the medals have been reset. */
    clear(): void {
      remove(runKey(bank.owner()));
      memory = null;
      settledHere.clear();
    },
  };
}

/**
 * A name for a run: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the draw's alone.
 */
export const runId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
