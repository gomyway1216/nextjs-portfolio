/**
 * Candy Shop Medal Maze on the medal center's floor: a play is played with
 * the medals every machine of the medal center shares (`MedalCenter/bank.ts`).
 *
 * ## A play, once
 *
 * DROP draws the whole play (engine.ts), writes it down and takes the medal,
 * in that order: the play is on record before its medal is gone. Each flick
 * of a lever is written down before the medal is seen to fly, so a reload is
 * never a way out of a gate that was flicked shut. What the play pays is
 * known once it has ended, and it goes into the medals once, whichever comes
 * first:
 *
 * - the medal falls OUT or into a pocket on this page (Skip, once the last
 *   lever has been flicked, only cuts its way there short);
 * - the page gives up the card (it is hidden, left or reloaded, or another
 *   tab needs the medals): the play is finished then, before the card goes:
 *   every lever still to come is flicked blind, at the window drawn for it;
 * - the page was killed before it could do either: the next page that holds
 *   the card for the same player finds the play on record, unfinished, and
 *   finishes it the same way. Its flicks are the ones written down, and the
 *   blind ones were drawn with the play, so whichever page finishes it, it
 *   ends the same, and is paid once.
 *
 * ## Receipts
 *
 * The record and the medals are two writes, and a browser can die between any
 * two writes. So the medal taken and the medals paid each go into the medals
 * under a receipt (`bank.apply`; "A machine's rounds" in bank.ts), and
 * whichever page next holds the card squares the record with them:
 *
 * - a play on record whose medal never went in never happened: it is thrown
 *   away;
 * - a play marked paid whose pay never went in (its medal did) is paid now,
 *   once.
 *
 * A play's receipts are let go of when the next play's medal goes in. A play
 * that pays nothing moves no medals at its end; the medal center is told that
 * its medal is out no more (`bank.settle`).
 *
 * When this browser's storage can be read but will not keep the play, no play
 * is played (`unsaved`). Storage that cannot be used at all keeps nothing,
 * and the play is played from this page's memory, as the medals then are.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { STAGES, STAKE, copyDraw, finishedFlicks, flicksFit, isDraw, isFlick, labelOf, playOf, type Draw, type Play } from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const COIN_MAZE_GAME = 'coin-maze';
/** Where a guest's play is kept on this device. An account's is under its own name (`playKey`). */
export const PLAY_KEY = 'coin-maze-play-v1';
export const playKey = (owner: string | null): string => (owner === null ? PLAY_KEY : `${PLAY_KEY}:${owner}`);

/** The names of a play's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';

/** A play as it is written down: how it was drawn, the flicks made, and whether it has been settled. */
export interface PlayRecord {
  v: 1;
  id: string;
  /** Whose medals: an account's id, or null for a guest's. It says where the play is kept (`playKey`). */
  owner: string | null;
  /** The ledger the medal was played from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was played: a reset since voids it. */
  era: number;
  draw: Draw;
  /** The window each lever reached was flicked in (or the time running out), in order. */
  flicks: number[];
  /** Whether it has been settled: played to its end, and what it pays in (or there was nothing). */
  paid: boolean;
}

/** A play as the page that holds it knows it. */
export interface Staked {
  /** The play as last written: its flicks so far. */
  record: PlayRecord;
  /** Whether it is written down on this device. A play that could not be is finished from what the page knows. */
  stored: boolean;
  /** Whether it has been settled: paid, or found paid by another page. */
  paid: boolean;
  /** Whether a reset came between its medal and its end, or its medal never went in: it pays nothing. */
  void: boolean;
}

/** How a play ended when it was settled. */
export type Settled = 'paid' | 'already' | 'void' | 'later';

export type StakeOutcome =
  | { kind: 'staked'; staked: Staked }
  /** No medal to play, or a draw the machine could not have made. */
  | { kind: 'short' }
  /** A play of these medals is still to be finished: it is finished first. */
  | { kind: 'unfinished' }
  /** Storage can be read but will not keep the play: nothing is taken. */
  | { kind: 'unsaved' }
  /** The medals are in another tab's machine, or are still being read. */
  | { kind: 'away' };

/**
 * A flick written down (`kept`); or not: the play is not this page's to play on (`gone`: it has been settled, here or
 * by another page, or the flick is not the next one), storage will neither keep it nor let go of the play (`unsaved`),
 * or the medals are in another tab (`away`).
 */
export type FlickOutcome = 'kept' | 'gone' | 'unsaved' | 'away';

/** A play on record, played as far as its flicks go; finished (every lever still to come flicked blind) once it is paid. */
export const playOfRecord = (record: PlayRecord): Play => playOf(record.draw, record.flicks, record.paid);

// ── Reading a play back ─────────────────────────────────────────────────────

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A play's name, as the bank takes a round's: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;

/**
 * A play as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is
 * trusted: a draw the machine could have made, flicks that could have been made on it (none after the medal fell OUT),
 * and a play marked paid only once it has been played to its end.
 */
export function parsePlay(text: unknown): PlayRecord | null {
  if (typeof text !== 'string' || text.length > 2_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordLike(data) || data.v !== 1 || typeof data.id !== 'string' || !ID_SHAPE.test(data.id)) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (!isDraw(data.draw) || !Array.isArray(data.flicks) || !data.flicks.every(isFlick) || typeof data.paid !== 'boolean') return null;
  const draw = copyDraw(data.draw);
  const flicks = [...(data.flicks as number[])];
  if (!flicksFit(draw, flicks)) return null;
  if (data.paid && !playOf(draw, flicks).complete) return null;
  return { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, draw, flicks, paid: data.paid };
}

export const serializePlay = (record: PlayRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  /** A move of a play's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every play but those in `keep` has no medals out any more: no refill is given while one does. */
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
  /** A name for a play that no other play has. */
  newId: () => string;
}

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /** The play, where storage cannot be used at all (or would not keep it): this page's memory alone keeps it. */
  let memory: PlayRecord | null = null;
  /** The plays settled on this page, whether or not storage took the record saying so. */
  const settledHere = new Set<string>();
  /**
   * The play this table is staking at this moment: from its record being written until its medal is in and the plays
   * before it are let go of. The bank tells everything that listens to it of each of those moves as it makes it, inside
   * `stake`: a page that looks for a play left unfinished then is looking at its own press, not at a play left
   * unfinished (`leftover`).
   */
  let staking: string | null = null;

  /** The medals on the table: which ledger, in which era. */
  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };
  const belongs = (record: PlayRecord): boolean => {
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

  /** A move of a play's medals, under its receipt. */
  const move = (record: PlayRecord, step: string, medals: number) => bank.apply({ game: COIN_MAZE_GAME, round: record.id, step, medals, era: record.era });
  const moved = (record: PlayRecord, step: string): boolean => bank.applied({ game: COIN_MAZE_GAME, round: record.id, step });

  /** A play's winnings, in under their receipt; the medal floor hears of them once, as they go in, a WIN and a BIG WIN by name. */
  const payWinnings = (record: PlayRecord): void => {
    const play = playOf(record.draw, record.flicks, true);
    if (play.won <= 0 || move(record, PAY_STEP, play.won) !== 'applied') return;
    const label = labelOf(play);
    floorReport(COIN_MAZE_GAME, { won: play.won, prize: label ? { medals: play.won, label } : { medals: play.won } });
  };

  /** Whether a play is still to be finished: its medal went in (or may have), and it has not been settled. */
  const unfinished = (record: PlayRecord | null): record is PlayRecord => record !== null && !record.paid && !settledHere.has(record.id);

  /**
   * The play of the medals on the table, wherever it is kept, and the key it is kept under (null for this page's
   * memory): under the player's name, or, for an account whose medals were this device's guest's until the first
   * sign-in moved them in, under the guest's, from where the page that holds the card moves it to the account's place.
   * A play of these medals from before a reset, and text that is not a play, are thrown away by that page. Plays of
   * other medals are left as they are. Undefined: storage cannot be read, and memory holds no play of these medals.
   */
  const find = (): { record: PlayRecord; key: string | null } | null | undefined => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const mine = holding();
    const places = owner === null ? [null] : [owner, null];
    for (const place of places) {
      const key = playKey(place);
      const text = read(key);
      if (text === undefined) return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : undefined;
      if (text === null) continue;
      const found = parsePlay(text);
      if (!found) {
        // Text that is not a play this machine can read: not a play, and not one to keep.
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
      const adopted: PlayRecord = { ...found, owner };
      if (!write(playKey(owner), serializePlay(adopted))) return { record: found, key };
      remove(key);
      return { record: adopted, key: playKey(owner) };
    }
    return memory && memory.owner === owner && belongs(memory) ? { record: memory, key: null } : null;
  };

  /**
   * Squares a play found with its receipts, by the page that holds the card: a play whose medal never went in never
   * happened, and is thrown away; a play marked paid whose pay never went in, though its medal did, is paid now.
   * Returns the play as it stands, or null for none.
   */
  const square = (found: { record: PlayRecord; key: string | null }): PlayRecord | null => {
    const { record, key } = found;
    if (settledHere.has(record.id) || record.id === staking) return record;
    const staked = moved(record, STAKE_STEP);
    if (!record.paid) {
      if (staked) return record;
      if (key === null) memory = null;
      else remove(key);
      return null;
    }
    if (staked && !moved(record, PAY_STEP) && playOf(record.draw, record.flicks).won > 0) payWinnings(record);
    return record;
  };

  /** The play of the medals on the table as it stands, squared with its receipts when this page holds the card. */
  const look = (): PlayRecord | null | undefined => {
    const found = find();
    if (!found) return found;
    return holding() ? square(found) : found.record;
  };

  return {
    /**
     * DROP: `draw` (drawn in the press) is written down, and the medal is taken. Nothing is taken when it cannot be:
     * the card is not here, there is no medal to play, the draw is not one the machine makes, a play of these medals is
     * still to be finished, or storage will not keep the play.
     */
    stake(draw: Draw): StakeOutcome {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null) return { kind: 'away' };
      if (!isDraw(draw) || bank.balance() < STAKE) return { kind: 'short' };
      const found = find();
      const now = found ? square(found) : null;
      if (unfinished(now)) return { kind: 'unfinished' };
      const owner = bank.owner();
      const record: PlayRecord = { v: 1, id: newId(), owner, ledger: medals.device, era: medals.era, draw: copyDraw(draw), flicks: [], paid: false };
      const key = playKey(owner);
      const before = memory;
      staking = record.id;
      try {
        const stored = write(key, serializePlay(record));
        if (stored) memory = null;
        else if (read(key) !== undefined) return { kind: 'unsaved' };
        else memory = record;
        // The medal goes in under its receipt after the play is written down: a browser that dies between the two
        // leaves a play whose medal the medals do not hold, which never happened (`square`).
        if (move(record, STAKE_STEP, -STAKE) !== 'applied') {
          if (stored) {
            if (now) write(key, serializePlay(now));
            else remove(key);
          }
          memory = before;
          return { kind: 'short' };
        }
        // The medal played feeds the floor jackpot, once, as it goes in.
        floorReport(COIN_MAZE_GAME, { played: STAKE });
        // The play before this one is no longer on record: nothing will look at its receipts again.
        bank.forget(COIN_MAZE_GAME, [record.id]);
        return { kind: 'staked', staked: { record, stored, paid: false, void: false } };
      } finally {
        staking = null;
      }
    },

    /**
     * A flick of lever `stage` in `window` (or the time running out): written down before anything is shown of it, so
     * that what it did stands whatever happens to the page.
     */
    flick(staked: Staked, stage: number, window: number): FlickOutcome {
      if (staked.void || staked.paid) return 'gone';
      if (!holding()) return 'away';
      const { record } = staked;
      if (!isFlick(window) || stage !== record.flicks.length || stage >= STAGES || playOf(record.draw, record.flicks).complete || !belongs(record)) return 'gone';
      const key = playKey(record.owner);
      if (staked.stored) {
        const there = read(key);
        if (there !== undefined) {
          const found = there === null ? null : parsePlay(there);
          // Not on record any more, or another play in its place, or settled: another page has finished it.
          if (!found || found.id !== record.id || found.paid || found.flicks.length !== stage) return 'gone';
        }
      }
      const next: PlayRecord = { ...record, flicks: [...record.flicks, window] };
      if (staked.stored) {
        if (!write(key, serializePlay(next))) {
          // Storage will not take the flick: what it holds of the play is taken away instead, so that a reload never
          // finds the play as it was before this flick, and this page plays it on from memory.
          if (!remove(key)) return 'unsaved';
          staked.stored = false;
          memory = next;
        }
      } else memory = next;
      staked.record = next;
      return 'kept';
    },

    /**
     * Finishes a play and puts its winnings into the medals, once: every lever not flicked yet is flicked blind, at the
     * window drawn for it. `later`: not now (the card is not here, or the medals on the table are not the ones it was
     * played from), and the play stays on record to be finished. `already`: another page settled it. `void`: the
     * medals were reset since it was played, or its medal never went in.
     */
    settle(staked: Staked): Settled {
      if (staked.void) return 'void';
      if (staked.paid) return 'already';
      const { record } = staked;
      const medals = onTable();
      if (!medals || record.ledger !== medals.device) return 'later';
      const key = playKey(record.owner);
      if (record.era !== medals.era) {
        staked.void = true;
        staked.paid = true;
        const there = read(key);
        if (typeof there === 'string' && parsePlay(there)?.id === record.id) remove(key);
        if (memory?.id === record.id) memory = null;
        return 'void';
      }
      if (!holding()) return 'later';
      if (staked.stored) {
        const there = read(key);
        if (there !== undefined) {
          const found = there === null ? null : parsePlay(there);
          // Not on record any more, or another play in its place: another page has settled it, or a reset cleared it.
          if (!found || found.id !== record.id || found.paid) {
            staked.paid = true;
            if (found && found.id === record.id) staked.record = found;
            return 'already';
          }
        }
      }
      if (!moved(record, STAKE_STEP)) {
        // Its medal never went in: it never happened.
        staked.void = true;
        staked.paid = true;
        if (staked.stored) remove(key);
        if (memory?.id === record.id) memory = null;
        return 'void';
      }
      // Played to its end and marked paid first, so that nothing that hears of the medals moving finds the play still
      // to finish; then its winnings go in under their receipt. A page that dies between the two leaves a play marked
      // paid whose winnings the next page that holds the card puts in, once (`square`).
      const paid: PlayRecord = { ...record, flicks: finishedFlicks(record.draw, record.flicks), paid: true };
      if (staked.stored) write(key, serializePlay(paid));
      if (memory?.id === record.id) memory = paid;
      settledHere.add(record.id);
      staked.record = paid;
      staked.paid = true;
      payWinnings(paid);
      // The medal has come to rest: none of the play's medals are out any more, a play that paid nothing included.
      bank.settle(COIN_MAZE_GAME);
      return 'paid';
    },

    /**
     * A play this device left unfinished with the medals on the table, which the page that holds the card now is to
     * finish: null when there is none.
     */
    leftover(): PlayRecord | null {
      // While DROP stakes, the play on record is that press's own: nothing is left unfinished, and nothing is settled.
      if (!holding() || !bank.getState().loaded || staking !== null) return null;
      const now = look();
      const left = unfinished(now ?? null) ? now! : null;
      // Only a play still to be finished has medals out: one settled has none, even if the page that settled it died
      // before it could say so.
      bank.settle(COIN_MAZE_GAME, left ? [left.id] : []);
      return left;
    },

    /** The last play of the medals on the table, to show: null for none. */
    last(): PlayRecord | null {
      return look() ?? null;
    },

    /** Forgets the play kept for the player on the table: the medals have been reset. */
    clear(): void {
      remove(playKey(bank.owner()));
      memory = null;
      settledHere.clear();
    },
  };
}

/**
 * A name for a play: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the draw's alone.
 */
export const playId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
