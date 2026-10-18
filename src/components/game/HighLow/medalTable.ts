/**
 * The High & Low Ladder on the medal center's floor: a game is played with
 * the medals every machine of the medal center shares (`MedalCenter/bank.ts`).
 *
 * ## A game, once
 *
 * START takes the bet and turns the first card face up. The bet is out of the
 * player's medals from then until the game ends: TAKE pays the rung lit (the
 * bet included), the top pays itself, and a wrong guess ends it with nothing
 * paid. Each card is drawn in the press that turns it (engine.ts), and the
 * game is written down on this device with that card before anything is
 * shown, so:
 *
 * - **A ladder begun stays begun.** A reload, or another tab that takes the
 *   medals over, finds the same card face up and the same rung lit, and the
 *   game goes on from there. The next card has not been drawn yet, so nothing
 *   is known that the player has not been shown.
 * - **A loss is never a free retry.** The card that lost was written down
 *   before it was turned on the screen: a reload finds the game lost.
 * - When storage can be read but will not keep the next card (it is full), no
 *   card is turned (`unsaved`): the guess has not been made, and the game
 *   waits as it was. Storage that cannot be used at all keeps nothing, and the
 *   game is played from this page's memory, as the medals then are too.
 *
 * ## Receipts
 *
 * The game's record and the medals are two writes, and a browser can die
 * between any two writes. So the bet and the pay each go into the medals
 * under a receipt (`bank.apply`; "A machine's rounds" in bank.ts), and
 * whichever page next holds the card squares the record with them:
 *
 * - a game written down whose bet never went in never began, and is thrown
 *   away;
 * - a game written down as taken (or at the top) whose pay never went in is
 *   paid now, once;
 * - a game whose pay went in although the record still has it climbing (the
 *   browser died between the pay and the record, or storage would not take
 *   the record) was taken: it is over.
 *
 * A game's receipts are let go of when the next game's bet goes in. A lost
 * game moves no medals at its end; the medal center is told that its medals
 * are out no more (`bank.settle`).
 *
 * A game belongs to the medals it was bet from: the player's ledger on this
 * device, in the era it was bet in. A reset at the medal center begins a new
 * era, and the game goes with the medals it was bet from. A guest who signs
 * in to an account with no medals yet brings their medals, and the game in
 * play, with them.
 *
 * Nothing here touches React or the browser: the bank and storage are passed
 * in, so that the tests can run it against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import { TOP, guessRight, isBet, isCard, isGuess, payFor, type Bet, type Card, type Guess } from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const HIGH_LOW_GAME = 'high-low';
/** Where a guest's game is written down on this device. An account's is under its own name (`roundKey`). */
export const ROUND_KEY = 'high-low-round-v1';
export const roundKey = (owner: string | null): string => (owner === null ? ROUND_KEY : `${ROUND_KEY}:${owner}`);

/** The names of a game's two moves of medals at the bank. */
export const STAKE_STEP = 'stake';
export const PAY_STEP = 'pay';
/** What the medal floor calls the top of the ladder reached. */
export const FLOOR_TOP = 'ladder-top';

/** A game as it is written down. Only the cards and the guesses are kept; where it stands is worked out from them. */
export interface RoundRecord {
  v: 1;
  id: string;
  /** Whose medals were bet: an account's id, or null for a guest's. It says where the game is kept (`roundKey`). */
  owner: string | null;
  /** The ledger the medals were bet from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals when it was bet: a reset since voids it. */
  era: number;
  bet: Bet;
  /** The first card, then the card each guess turned, in order. */
  cards: Card[];
  guesses: Guess[];
  /** Whether TAKE was pressed (or the top reached): what the ladder shows is to be paid. */
  taken: boolean;
}

// ── Where a game stands ─────────────────────────────────────────────────────

/** The right guesses in a row so far: the rung lit. */
export function rungOf(record: Pick<RoundRecord, 'cards' | 'guesses'>): number {
  let rung = 0;
  for (let i = 0; i < record.guesses.length; i++) {
    if (!guessRight(record.cards[i], record.cards[i + 1], record.guesses[i])) break;
    rung += 1;
  }
  return rung;
}
/** Whether the last guess was wrong. */
export const lostOf = (record: Pick<RoundRecord, 'cards' | 'guesses'>): boolean => rungOf(record) < record.guesses.length;
/** Whether the game has ended: lost, taken, or at the top. */
export const overOf = (record: RoundRecord): boolean => lostOf(record) || record.taken || rungOf(record) >= TOP;
/** Whether the game is still being played: its bet is out, and the next card is to come. */
export const inPlay = (record: RoundRecord): boolean => !overOf(record);
/** The card face up now: the last one turned. */
export const shownOf = (record: Pick<RoundRecord, 'cards'>): Card => record.cards[record.cards.length - 1];
/** What TAKE would pay now: the rung lit, for the bet; nothing once a guess has lost. */
export const offerOf = (record: RoundRecord): number => (lostOf(record) ? 0 : payFor(record.bet, rungOf(record)));
/** What the game pays at its end: the rung it was taken on, or the top; nothing for a loss or a game still climbing. */
export const wonOf = (record: RoundRecord): number => (!lostOf(record) && (record.taken || rungOf(record) >= TOP) ? payFor(record.bet, rungOf(record)) : 0);

// ── Reading a game back ─────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
/** A ledger's name for a device, as the bank makes them. */
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A game's name, as the bank takes a round's: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;

/**
 * A game as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is
 * trusted: a card that is no card, a guess that is no guess, more guesses than cards allow, a guess after a wrong
 * one, a climb past the top or a game taken before its first right guess, and it is no game.
 */
export function parseRound(text: unknown): RoundRecord | null {
  if (typeof text !== 'string' || text.length > 4_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.v !== 1 || typeof data.id !== 'string' || !ID_SHAPE.test(data.id)) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (!isBet(data.bet) || typeof data.taken !== 'boolean' || !Array.isArray(data.cards) || !Array.isArray(data.guesses)) return null;
  const cards = data.cards as unknown[];
  const guesses = data.guesses as unknown[];
  if (cards.length < 1 || cards.length > TOP + 1 || guesses.length !== cards.length - 1 || !cards.every(isCard) || !guesses.every(isGuess)) return null;
  const read: RoundRecord = { v: 1, id: data.id, owner, ledger: data.ledger, era: data.era, bet: data.bet, cards: [...(cards as Card[])], guesses: [...(guesses as Guess[])], taken: data.taken };
  const rung = rungOf(read);
  // A wrong guess can only be the last; a game is taken only once it has a rung lit, and never after it was lost.
  if (rung < read.guesses.length - 1) return null;
  if (read.taken && (rung < 1 || lostOf(read))) return null;
  return read;
}

export const serializeRound = (record: RoundRecord): string => JSON.stringify(record);

// ── The machine ─────────────────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  restartDue(game: string): boolean;
  restarted(game: string): void;
  /** A move of a game's medals under its receipt, once (bank.ts). */
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
  /** Says that every game but those in `keep` has no medals out any more: no refill is given while one does. */
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
  /** A name for a game that no other game has. */
  newId: () => string;
}

export type StartOutcome =
  | { kind: 'started'; record: RoundRecord }
  /** A game is being played already (here, or in another tab): it goes on, and nothing more is bet. */
  | { kind: 'inPlay'; record: RoundRecord }
  /** Not that many medals, or a bet or a card the machine does not take. */
  | { kind: 'short' }
  /** Storage can be read but will neither keep the new game nor let go of the last: nothing is bet. */
  | { kind: 'unsaved' }
  /** The medals are in another tab's machine, or are still being read. */
  | { kind: 'away' };

export type GuessOutcome =
  | { kind: 'right'; record: RoundRecord }
  /** The twelfth right guess: the top is paid at once. */
  | { kind: 'top'; record: RoundRecord; won: number }
  | { kind: 'lost'; record: RoundRecord }
  /** Not the game in play (it has ended, here or in another tab, or a reset threw it away): nothing is guessed. */
  | { kind: 'gone'; record: RoundRecord | null }
  /** Storage will not keep the card: no card is turned, and the game waits as it was. */
  | { kind: 'unsaved' }
  | { kind: 'away' };

export type TakeOutcome =
  | { kind: 'taken'; record: RoundRecord; won: number }
  /** Not the game in play, or no rung lit to take. */
  | { kind: 'gone'; record: RoundRecord | null }
  /** Storage will not keep the game as taken: nothing is paid yet, and the game waits as it was. */
  | { kind: 'unsaved' }
  | { kind: 'away' };

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId }: TableOptions) {
  /**
   * A game that only this page holds, because storage would not keep it, and the name it would have been kept under
   * (whose it is). Such a game is in no storage for a reload or another tab to find.
   */
  let memory: { key: string; record: RoundRecord } | null = null;

  const key = (): string => roundKey(bank.owner());
  /** The medals on the table: which ledger, in which era. */
  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };
  /** Whether a game was bet from the medals on the table now: the same ledger, in the same era. */
  const belongs = (record: RoundRecord): boolean => {
    const medals = onTable();
    return medals !== null && record.ledger === medals.device && record.era === medals.era;
  };
  const remembered = (): RoundRecord | null => (memory && memory.key === key() && belongs(memory.record) ? memory.record : null);

  const removeKey = (name: string): boolean => {
    try {
      storage.remove(name);
      return true;
    } catch {
      return false;
    }
  };

  /** A move of a game's medals, under its receipt. */
  const move = (record: RoundRecord, step: string, medals: number) => bank.apply({ game: HIGH_LOW_GAME, round: record.id, step, medals, era: record.era });
  const moved = (record: RoundRecord, step: string): boolean => bank.applied({ game: HIGH_LOW_GAME, round: record.id, step });

  /** A game's pay, in under its receipt; the medal floor hears of it once, as it goes in, the top by name. */
  const pay = (record: RoundRecord): void => {
    const won = wonOf(record);
    if (won <= 0 || move(record, PAY_STEP, won) !== 'applied') return;
    const top = rungOf(record) >= TOP;
    floorReport(HIGH_LOW_GAME, { won, prize: top ? { medals: won, label: FLOOR_TOP } : { medals: won } });
  };

  /**
   * Writes a game down under the player's own name (taking away the guest's copy it came from, if it did). When
   * storage will not take it, what storage holds of the game is taken away instead, so that a reload finds no game
   * rather than one that has moved on since, and this page plays it from memory. `failed`: storage would do neither.
   */
  const write = (record: RoundRecord, from: string | null): 'stored' | 'cleared' | 'failed' => {
    const own = key();
    try {
      storage.write(own, serializeRound(record));
      memory = null;
      if (from !== null && from !== own) removeKey(from);
      return 'stored';
    } catch {
      const names = from !== null && from !== own ? [own, from] : [own];
      if (!names.map(removeKey).every(Boolean)) return 'failed';
      memory = { key: own, record };
      return 'cleared';
    }
  };

  /**
   * The game of the medals on the table, and where it was read from: under the player's own name, under the guest's
   * (the guest's medals having become this account's), or from this page's memory (null). A game of these medals
   * from before a reset is thrown away.
   */
  const lookUp = (): { ok: true; record: RoundRecord | null; from: string | null } | { ok: false } => {
    const medals = onTable();
    const own = key();
    const owner = bank.owner();
    const places = owner === null ? [own] : [own, roundKey(null)];
    for (const place of places) {
      let text: string | null;
      try {
        text = storage.read(place);
      } catch {
        return { ok: false };
      }
      const found = parseRound(text);
      if (found && medals && found.ledger === medals.device) {
        if (found.era === medals.era) return { ok: true, record: found, from: place };
        // Bet from these medals before a reset: it went with them.
        removeKey(place);
      } else if (typeof text === 'string' && !found && place === own) {
        // Text that is not a game this machine can read: an unreadable copy, not a bet, and not one to keep.
        removeKey(place);
      }
      if (place === own) {
        const kept = remembered();
        if (kept) return { ok: true, record: kept, from: null };
      }
    }
    return { ok: true, record: null, from: null };
  };

  /**
   * Squares a game found with its receipts, by the page that holds the card: one whose bet never went in never began,
   * and is thrown away; one whose pay went in is over; one over and owed its pay is paid now. Returns the game as it
   * stands, or null for none.
   */
  const square = (record: RoundRecord, from: string | null): RoundRecord | null => {
    if (!moved(record, STAKE_STEP)) {
      if (from !== null) removeKey(from);
      else memory = null;
      return null;
    }
    if (!overOf(record) && moved(record, PAY_STEP)) {
      const taken: RoundRecord = { ...record, taken: true };
      if (from !== null) write(taken, from);
      else memory = { key: key(), record: taken };
      return taken;
    }
    if (overOf(record) && wonOf(record) > 0 && !moved(record, PAY_STEP)) pay(record);
    return record;
  };

  /** The game of the medals on the table as it stands, squared with its receipts when this page holds the card. */
  const look = (): { ok: true; record: RoundRecord | null; from: string | null } | { ok: false } => {
    const found = lookUp();
    if (!found.ok) return found;
    if (!holding() || !found.record) return found;
    const record = square(found.record, found.from);
    // Only a game in play has medals out: one over has none, even if the page that ended it died before it could say so.
    bank.settle(HIGH_LOW_GAME, record && inPlay(record) ? [record.id] : []);
    return { ok: true, record, from: record ? found.from : null };
  };

  /** Writes a game's next state: to storage where it was read from storage, or to memory for a game only this page holds. */
  const keep = (next: RoundRecord, from: string | null): boolean => {
    if (from !== null) return write(next, from) !== 'failed';
    memory = { key: key(), record: next };
    try {
      storage.write(key(), serializeRound(next));
      memory = null;
    } catch {
      // Played from memory.
    }
    return true;
  };

  /** The game in play now, wherever it is read from, for a page that may not be able to read storage at all. */
  const inHand = (): { record: RoundRecord | null; from: string | null } | null => {
    const now = look();
    if (now.ok) return { record: now.record, from: now.from };
    const kept = remembered();
    return kept ? { record: kept, from: null } : null;
  };

  return {
    /** The game of the medals on the table: one still climbing, or the last one played, to show; null for none. */
    read(): RoundRecord | null {
      const now = look();
      return now.ok ? now.record : remembered();
    },

    /**
     * START: takes `bet` medals and turns `card` face up. The game is written down first and the medals taken after,
     * so that no game is kept that was not bet for. A game in play is never played over: it goes on.
     */
    start(bet: number, card: Card): StartOutcome {
      if (!holding() || !bank.getState().loaded) return { kind: 'away' };
      const medals = onTable();
      if (!medals) return { kind: 'away' };
      if (!isBet(bet) || !isCard(card)) return { kind: 'short' };
      const before = look();
      if (before.ok && before.record && inPlay(before.record)) return { kind: 'inPlay', record: before.record };
      if (!before.ok) {
        const kept = remembered();
        if (kept && inPlay(kept)) return { kind: 'inPlay', record: kept };
      }
      if (bank.balance() < bet) return { kind: 'short' };
      const record: RoundRecord = { v: 1, id: newId(), owner: bank.owner(), ledger: medals.device, era: medals.era, bet, cards: [card], guesses: [], taken: false };
      const kept = write(record, null);
      if (kept === 'failed') {
        // Storage that can be read, but will neither take this game nor let go of the last one, would show that one in
        // its place: nothing is bet. Storage that cannot even be read keeps nothing, and the game is played from memory.
        if (before.ok) return { kind: 'unsaved' };
        memory = { key: key(), record };
      }
      // The bet goes in under its receipt after the game is written down: a browser that dies between the two leaves a
      // game whose bet the medals do not hold, which is thrown away unplayed (`square`).
      if (move(record, STAKE_STEP, -bet) !== 'applied') {
        memory = null;
        if (before.ok && before.record) write(before.record, null);
        else removeKey(key());
        return { kind: 'short' };
      }
      // The medals played feed the floor jackpot, once, as the bet goes in.
      floorReport(HIGH_LOW_GAME, { played: bet });
      // The game before this one is no longer on record: nothing will look at its receipts again.
      bank.forget(HIGH_LOW_GAME, [record.id]);
      return { kind: 'started', record };
    },

    /**
     * HIGH or LOW on the game `id`, with the next card `card` (drawn in the press). The card is written down before
     * anything else happens: a wrong guess ends the game, its medals out no more; the twelfth right guess is paid the
     * top at once.
     */
    guess(id: string, guess: Guess, card: Card): GuessOutcome {
      if (!holding()) return { kind: 'away' };
      if (!isGuess(guess) || !isCard(card)) return { kind: 'gone', record: null };
      const found = inHand();
      if (!found) return { kind: 'unsaved' };
      const current = found.record;
      if (!current || current.id !== id || !inPlay(current)) return { kind: 'gone', record: current };
      const shown = shownOf(current);
      const right = guessRight(shown, card, guess);
      const climbed: RoundRecord = { ...current, cards: [...current.cards, card], guesses: [...current.guesses, guess] };
      const next: RoundRecord = right && rungOf(climbed) >= TOP ? { ...climbed, taken: true } : climbed;
      if (!keep(next, found.from)) return { kind: 'unsaved' };
      if (!right) {
        // Lost: the bet is the machine's, and the game has no medals out any more.
        bank.settle(HIGH_LOW_GAME);
        return { kind: 'lost', record: next };
      }
      if (next.taken) {
        pay(next);
        bank.settle(HIGH_LOW_GAME);
        return { kind: 'top', record: next, won: wonOf(next) };
      }
      return { kind: 'right', record: next };
    },

    /** TAKE on the game `id`: what the rung lit shows is paid, the bet included, and the game ends. Written down as taken first. */
    take(id: string): TakeOutcome {
      if (!holding()) return { kind: 'away' };
      const found = inHand();
      if (!found) return { kind: 'unsaved' };
      const current = found.record;
      if (!current || current.id !== id || !inPlay(current) || rungOf(current) < 1) return { kind: 'gone', record: current };
      const next: RoundRecord = { ...current, taken: true };
      if (!keep(next, found.from)) return { kind: 'unsaved' };
      pay(next);
      bank.settle(HIGH_LOW_GAME);
      return { kind: 'taken', record: next, won: wonOf(next) };
    },

    /**
     * After a reset at the medal center the machine starts over: the game kept is thrown away, with the medals it was
     * bet from, and the medal center is told. Only with the card. Returns whether it started over.
     */
    restartIfDue(): boolean {
      if (!holding() || !bank.restartDue(HIGH_LOW_GAME)) return false;
      memory = null;
      removeKey(key());
      bank.restarted(HIGH_LOW_GAME);
      return true;
    },
  };
}

/**
 * A name for a game: the time and a random part, in letters and digits. The page takes the random part from the
 * browser's crypto, not from Math.random, which is the cards' alone.
 */
export const roundId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
