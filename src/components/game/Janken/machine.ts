/**
 * The machine at the medal center: a round of `round.ts` played with the
 * player's medals, which are the medal center's (`MedalCenter/bank.ts`).
 *
 * The medals move at two moments only, each once:
 *
 * - **A medal goes in**: one is taken from the player's medals, and the round
 *   is written down as calling, in the same step.
 * - **The medals won are taken**: they are given to the player's medals, and
 *   the round is struck out, in the same step.
 *
 * Between the two the round is written down after every throw, so the
 * medals it holds are always where the machine says they are. The cat's hand
 * and the roulette's lamp are drawn when the player's hand is pressed and
 * written down with the outcome, so nothing about them can be learned or
 * drawn again by leaving and coming back.
 *
 * The round and the medals are two writes, and a browser can die between
 * any two writes. So both moves go into the medals under a receipt
 * (`bank.apply`; "A machine's rounds" in bank.ts), named by the round, and
 * the round is written down before each: as calling before its medal is
 * taken, and as being paid (`paying`) before the medals it ends with go in.
 * The page that next holds the card looks at the round against the
 * receipts: a round whose medal never went in was never played, and is
 * struck out; a round being paid is paid, once, and struck out.
 *
 * **When the page is hidden or left** (a reload among them), the round is
 * settled before the card goes: a medal put in and not yet thrown is given
 * back, and medals won (still spinning, or on offer, or put on a double-up
 * that has not been thrown) are paid. So a reload never loses a medal, never
 * pays one twice, and never gives a throw back once it has been made. A
 * page that was closed without being told (the browser was killed) leaves
 * its round written down, and whichever page next holds the card carries on
 * with it where it stood: the medal still in, the roulette still to stop, the
 * medals still on offer.
 *
 * **Another tab**: only the page that holds the medal center's card plays.
 * When another tab's machine takes the card, this one stops where it is,
 * and the other carries on with the round as written down; when the card
 * comes back, the round is read again.
 *
 * **The medal center's reset**: every medal is thrown away, those at stake in
 * a round among them, and the machine starts over with no round.
 */

import { BANK_KEY, type Bank, type BankEvent, type BankState, type Seat } from '../MedalCenter/bank';
import { drawHand, drawLamp, judge, type Hand, type Outcome } from './engine';
import { canDouble, doubled, owed, packRound, readRound, roundKey, spun, started, thrown, type Round } from './round';

/** The machine's name at the medal center, for its seat at the bank and its restarts. */
export const JANKEN_GAME = 'janken';

/** Where the round is written down: this device's storage. Each call may throw, when storage is blocked. */
export interface RoundStorage {
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
}

/** What the machine needs of the medal center's bank. */
export type MachineBank = Pick<Bank, 'apply' | 'applied' | 'forget' | 'owner' | 'restartDue' | 'restarted' | 'sit' | 'listen' | 'subscribe' | 'getState' | 'balance' | 'refill'>;

/** The names of a round's two moves of medals at the bank: the medal put in, and the medals it ends with. */
export const INSERT_STEP = 'in';
export const PAY_STEP = 'pay';

/** A throw, as the cabinet acts it out. */
export interface Throw {
  player: Hand;
  machine: Hand;
  outcome: Outcome;
  /** The lamp the roulette stops on, for a won play; −1 otherwise. */
  lamp: number;
  /** The kind of round it was thrown in. */
  kind: Round['kind'];
  /** Draws in a row before it. */
  draws: number;
}

/** Something that happened at the machine that the cabinet acts out. */
export type Happening =
  | { type: 'inserted' }
  | { type: 'thrown'; throw: Throw; round: Round | null }
  | { type: 'paid'; medals: number; left: boolean }
  /** A medal put in and not thrown, given back as the page went. */
  | { type: 'returned'; medals: number }
  /** A round found written down: carried on with where it stood. */
  | { type: 'resumed'; round: Round }
  /** The medals were reset at the medal center: the round, if there was one, is gone. */
  | { type: 'restarted' };

export interface MachineView {
  round: Round | null;
  /** Whether this page holds the card and the player's medals have been found: it may play. */
  ready: boolean;
  /** Whether this page holds the card at all. */
  holding: boolean;
}

export interface MachineDeps {
  bank: MachineBank;
  storage: RoundStorage | null;
  /** Random numbers in [0, 1): for the cat's hand and the roulette's lamp. */
  random: () => number;
  /** A new round's name (never from `random`, which draws the cat's hands). */
  newId?: () => string;
}

const LETTERS = '0123456789abcdefghijklmnopqrstuvwxyz';
/** A new round's name: twelve letters and digits from the browser's random numbers. */
const randomId = (): string => {
  try {
    return Array.from(globalThis.crypto.getRandomValues(new Uint32Array(12)), (n) => LETTERS[n % LETTERS.length]).join('');
  } catch {
    return Array.from({ length: 12 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  }
};

export type Machine = ReturnType<typeof createMachine>;

export function createMachine({ bank, storage, random, newId = randomId }: MachineDeps) {
  let round: Round | null = null;
  /** Whose round is on the table: the owner of the medals it was read for. */
  let owner: string | null = null;
  let seat: Seat | null = null;
  let view: MachineView = { round: null, ready: false, holding: false };
  const listeners = new Set<() => void>();
  const hearers = new Set<(happening: Happening) => void>();

  const holding = (): boolean => seat?.holding() ?? false;
  const found = (state: BankState): boolean => state.loaded && state.where !== 'checking';
  const ready = (): boolean => holding() && found(bank.getState());

  const publish = (): void => {
    const next: MachineView = { round, ready: ready(), holding: holding() };
    if (next.round === view.round && next.ready === view.ready && next.holding === view.holding) return;
    view = next;
    for (const listener of [...listeners]) listener();
  };
  const tell = (happening: Happening): void => {
    for (const hearer of [...hearers]) {
      try {
        hearer(happening);
      } catch {
        // A cabinet that fails to act something out does not stop the machine.
      }
    }
  };

  /**
   * Rounds this page could not write down (no storage, or storage that refused), under the name they would have
   * been written under. Kept here until a write takes, so that a round is never lost to storage that cannot keep
   * it: a medal put in, or medals won, are still this page's to settle when the card comes back.
   */
  const unsaved = new Map<string, Round | null>();

  /**
   * At sign-in, the medal center moves a guest's medals into an account that has none, and leaves the guest's
   * place empty (bank.ts). A round the guest had in play was played with those medals: it goes with them, so that
   * the account can finish it, and a guest's medals made afterwards never pay for it. When the account had medals
   * of its own, the guest's stay the guest's, and so does the guest's round.
   */
  const adoptGuestRound = (): void => {
    if (owner === null || !storage || !holding()) return;
    const mine = roundKey(owner);
    const guests = roundKey(null);
    if (storage.read(mine) !== null || storage.read(BANK_KEY) !== null) return;
    const text = storage.read(guests);
    if (text === null || readRound(text) === null) return;
    storage.write(mine, text);
    storage.remove(guests);
  };

  /** The round written down for whoever's medals are on the table now. */
  const read = (): void => {
    owner = bank.owner();
    const key = roundKey(owner);
    if (unsaved.has(key)) {
      round = unsaved.get(key) ?? null;
      return;
    }
    if (!storage) {
      round = null;
      return;
    }
    try {
      adoptGuestRound();
      round = readRound(storage.read(key));
    } catch {
      // Storage that cannot be read: the round in memory is all there is.
    }
    square();
  };

  /**
   * Squares the round with its receipts, with the card: a round whose medal never went in (the browser died between
   * the round and the medals) was never played, and is struck out; a round being paid is paid, once, and struck out.
   */
  function square(): void {
    if (!round || !holding()) return;
    if (round.paying !== undefined) {
      finishPaying(round, true);
      return;
    }
    if (round.id !== undefined && !bank.applied({ game: JANKEN_GAME, round: round.id, step: INSERT_STEP })) write(null);
  }
  /** Writes the round down. Storage that refuses still leaves the round in play on this page. */
  const write = (next: Round | null): void => {
    round = next;
    const key = roundKey(owner);
    try {
      if (!storage) throw new Error('nowhere to write');
      if (next === null) storage.remove(key);
      else storage.write(key, packRound(next));
      unsaved.delete(key);
    } catch {
      // Not kept: the page plays on with the round it has, and the medals are where the bank says.
      unsaved.set(key, next);
    }
    publish();
  };

  /** After the medal center's reset, the round goes with every other medal, and the machine starts over. */
  const restartIfDue = (): boolean => {
    if (!holding() || !bank.restartDue(JANKEN_GAME)) return false;
    const had = round !== null;
    write(null);
    bank.restarted(JANKEN_GAME);
    if (had) tell({ type: 'restarted' });
    return true;
  };

  /**
   * Ends a round with `medals` paid: the round is written down as being paid, the medals go in under its receipt, and
   * it is struck out. A browser that dies between any two of those leaves a round being paid, which the next page that
   * holds the card pays, once (`square`). Returns whether it was paid.
   */
  const payOut = (from: Round, medals: number): boolean => {
    const paying: Round = { ...from, id: from.id ?? newId(), paying: medals };
    write(paying);
    if (finishPaying(paying, false)) return true;
    // The bank would not take the move now: the round is as it was, to be paid when it can be.
    write(from);
    return false;
  };

  /** Pays a round being paid, under its receipt, and strikes it out. `found`: it was found so, left by a page that died. */
  function finishPaying(at: Round, found: boolean): boolean {
    const medals = at.paying ?? 0;
    const moved = bank.apply({ game: JANKEN_GAME, round: at.id ?? newId(), step: PAY_STEP, medals });
    if (!moved) return false;
    write(null);
    // Over and struck out: nothing will try its moves again.
    bank.forget(JANKEN_GAME);
    if (found) tell({ type: 'paid', medals, left: true });
    return true;
  }

  /** Settles the round as the page goes: what is at stake and not thrown is given back, what is won is paid. */
  const settle = (): void => {
    if (!round || !holding()) return;
    const medals = owed(round);
    const returned = round.phase === 'calling' && round.kind === 'play';
    if (medals > 0) {
      if (!payOut(round, medals)) return;
    } else write(null);
    tell(returned ? { type: 'returned', medals } : { type: 'paid', medals, left: true });
  };

  /** Pays the medals on offer. */
  const pay = (left: boolean): boolean => {
    if (!round || round.phase !== 'offer' || !holding()) return false;
    const medals = round.win;
    if (!payOut(round, medals)) return false;
    tell({ type: 'paid', medals, left });
    return true;
  };

  return {
    view: (): MachineView => view,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hear(hearer: (happening: Happening) => void): () => void {
      hearers.add(hearer);
      return () => hearers.delete(hearer);
    },

    /** Takes the machine's seat at the medal center: it plays while this page holds the card. Returns what puts it away. */
    open(): () => void {
      const mine = bank.sit(JANKEN_GAME, {
        granted: () => {
          // Whatever another page did with the round while this one did not hold the card is the round now.
          read();
          restartIfDue();
          if (round) tell({ type: 'resumed', round });
          publish();
        },
        yielding: (why) => {
          // A moment's loan of the card (the medal center's front taking the bonus, another tab's machine starting)
          // leaves the round as it is, written down. A page hidden or left settles it first.
          if (why !== 'moment') settle();
          publish();
        },
      });
      seat = mine;
      const unlisten = bank.listen((event: BankEvent) => {
        if (event.type !== 'reset') return;
        // Every medal is gone, those in the round with them: the round is struck out, not paid.
        const had = round !== null;
        if (holding()) {
          write(null);
          bank.restarted(JANKEN_GAME);
        } else round = null;
        if (had) tell({ type: 'restarted' });
        publish();
      });
      const unsubscribe = bank.subscribe(() => {
        // The player's medals found on the account, or another player's on the table after signing in or out: their round.
        if (holding() && bank.owner() !== owner) {
          read();
          if (round) tell({ type: 'resumed', round });
        }
        restartIfDue();
        publish();
      });
      read();
      publish();
      return () => {
        // The seat is left first, while it is still this machine's: leaving lets the card go, and as it goes the round
        // is settled (a medal not thrown given back, medals won paid). Only then is the machine put away.
        mine.leave();
        if (seat === mine) seat = null;
        unsubscribe();
        unlisten();
        publish();
      };
    },

    /** The player plays here: the card is asked back from another tab's machine. */
    play(): void {
      seat?.play();
    },

    /**
     * A medal goes in, if the player has one and no round is in play: the round is written down as calling, and then
     * the medal taken under its receipt (a browser that dies between the two leaves a round that was never played).
     */
    insert(): boolean {
      if (!ready() || round !== null || bank.balance() < 1) return false;
      const next: Round = { ...started(), id: newId() };
      write(next);
      if (bank.apply({ game: JANKEN_GAME, round: next.id!, step: INSERT_STEP, medals: -1 }) !== 'applied') {
        write(null);
        return false;
      }
      // Any round before this one is struck out: nothing will try its moves again.
      bank.forget(JANKEN_GAME, [next.id!]);
      tell({ type: 'inserted' });
      return true;
    },

    /** The player's hand: the cat's is drawn now, and the roulette's lamp with it on a won play. */
    press(player: Hand): Throw | null {
      if (!ready() || !round || round.phase !== 'calling') return null;
      const before = round;
      const machine = drawHand(random);
      const outcome = judge(player, machine);
      const lamp = outcome === 'win' && before.kind === 'play' ? drawLamp(random) : -1;
      const next = thrown(before, outcome, lamp);
      write(next);
      const result: Throw = { player, machine, outcome, lamp, kind: before.kind, draws: before.draws };
      tell({ type: 'thrown', throw: result, round: next });
      // The last double-up there can be is paid at once.
      if (next && next.phase === 'offer' && !canDouble(next)) pay(false);
      return result;
    },

    /** The ring has stopped on its lamp: the medals are offered. */
    stopped(): void {
      if (!round || round.phase !== 'spinning' || !holding()) return;
      write(spun(round));
    },

    /** The medals on offer are taken: they go to the player's medals. */
    collect(): boolean {
      if (round?.phase === 'spinning' && holding()) write(spun(round));
      return pay(false);
    },

    /** The medals on offer are put on a double-up. */
    double(): boolean {
      if (!ready() || !canDouble(round)) return false;
      write(doubled(round!));
      return true;
    },

    /** The free refill, for a player with no medals left and no round in play. */
    refill(): boolean {
      if (round !== null) return false;
      return bank.refill();
    },
  };
}
