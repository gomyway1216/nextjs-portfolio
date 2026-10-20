/**
 * Goldfish Lantern Pachinko on the medal center's floor: balls lent for the medals every machine of the medal center
 * shares (`MedalCenter/bank.ts`), and counted back into medals at the counter.
 *
 * ## The session
 *
 * What the machine holds for the player (the balls in the tray, the holds and the spin, a hit's rounds, ST or 時短,
 * and the balls drawn ahead) is written down in one record, the session, every slot that changes it: a ball fired is
 * written down before it is seen to fly, so a reload is never a way out of a ball that went OUT. The balls are not
 * medals: only two things move medals, each under a receipt (`bank.apply`; "A machine's rounds" in bank.ts).
 *
 * - **A lend** (玉貸し) takes `LEND_MEDALS` medals and puts `LEND_BALLS` balls in the tray. The session says so
 *   first (`pending`), then the medals go, then the balls go into the tray. Its receipt stands for the session's
 *   medals being out ("Medals out" in ledger.ts): no free refill is given while balls, holds or a hit are left.
 * - **The counter** (計数) turns the balls in the tray into medals, `BALLS_PER_MEDAL` to a medal, rounded down: the
 *   balls left over stay in the tray. The session takes the balls out and says what is owed first, then the medals
 *   go in.
 *
 * A browser can die between any two writes. Whichever page next holds the card squares the session with the
 * receipts: a lend whose medals never went in never happened; a lend whose medals did puts its balls in the tray;
 * a count whose medals never went in is paid now, once.
 *
 * ## A hit left behind
 *
 * A hit's rounds are paid in full whatever happens to the page. As the page gives up the card (hidden, left,
 * reloaded, another tab playing the medals), the rounds still to come are played out at once, at strength 6, which
 * sends every ball into the open attacker (ten balls a round, each paying ten), and nothing is fired between rounds:
 * the same as perfect play. A page killed before it could do so leaves them on record, and the next page that holds
 * the card plays them out the same way before anything else. Either way the player is told on coming back. A tray
 * with no ball in it during a hit fires the machine's own balls at strength 6 while the attacker is open, taken back
 * out of what it pays, so a hit can always be played out.
 *
 * Nothing here touches React or the browser: the bank and storage are passed in, so that the tests can run it
 * against a fake browser.
 */

import type { Move } from '../MedalCenter/bank';
import { floorReport } from '../MedalCenter/floor/reporter';
import {
  BALLS_PER_MEDAL,
  BEST_RIGHT,
  LEND_BALLS,
  LEND_MEDALS,
  attackerOpen,
  busy,
  copyMachine,
  fire,
  hitLabel,
  hitMedals,
  isBallDraw,
  isStrength,
  newMachine,
  parseMachine,
  rushPrize,
  tick,
  type BallDraw,
  type Fired,
  type Machine,
  type Tick,
} from './engine';

/** The game's name at the medal center: its seat, its receipts, and its restarts after a reset. */
export const PACHINKO_GAME = 'pachinko';
/** Where a guest's session is kept on this device. An account's is under its own name (`sessionKey`). */
export const SESSION_KEY = 'pachinko-session-v1';
export const sessionKey = (owner: string | null): string => (owner === null ? SESSION_KEY : `${SESSION_KEY}:${owner}`);
/** The names of the two moves of medals at the bank. */
export const LEND_STEP = 'lend';
export const PAY_STEP = 'pay';
/** Balls drawn ahead at most: a press tops the queue up to this. */
export const QUEUE = 40;
/** The most balls a tray is read back with. Nobody plays near it. */
export const TRAY_MOST = 100_000_000;

export type Pending = { kind: 'lend' | 'count'; id: string; medals: number; balls: number };

/** A hit's rounds played out while the page was away, still to be told. */
export interface AwayNote {
  rounds: number;
  balls: number;
}

/** The session as it is written down. */
export interface SessionRecord {
  v: 1;
  /** Whose medals: an account's id, or null for a guest's. It says where the session is kept (`sessionKey`). */
  owner: string | null;
  /** The ledger the balls were lent from: the name it keeps for this device. */
  ledger: string;
  /** The era of the medals: a reset since voids the session. */
  era: number;
  /** Balls in the tray. */
  tray: number;
  machine: Machine;
  /** Balls drawn ahead, the next first. */
  queue: BallDraw[];
  /** A move of medals written down before it is made. */
  pending: Pending | null;
  /** The round of the last lend: its receipts say the session's medals are out. */
  lent: string | null;
  /** A hit's rounds played out while the page was away. */
  away: AwayNote | null;
}

/** What a slot did, for the page to show. */
export interface Slot {
  /** The ball fired: its strength and draw, what it did, and whether the machine fired it on credit. */
  ball: { strength: number; draw: BallDraw; fired: Fired; credit: boolean } | null;
  ticks: Tick[];
}

// ── Reading a session back ──────────────────────────────────────────────────

const isRecordLike = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isWhole = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const LEDGER_SHAPE = /^[a-z0-9]{1,64}$/;
/** A round's name, as the bank takes it: letters, digits and hyphens, up to 24. */
const ID_SHAPE = /^[a-z0-9-]{1,24}$/;

const parsePending = (value: unknown): Pending | null | undefined => {
  if (value === null) return null;
  if (!isRecordLike(value) || (value.kind !== 'lend' && value.kind !== 'count') || typeof value.id !== 'string' || !ID_SHAPE.test(value.id)) return undefined;
  if (!isWhole(value.medals, 0, TRAY_MOST) || !isWhole(value.balls, 0, TRAY_MOST)) return undefined;
  return { kind: value.kind, id: value.id, medals: value.medals, balls: value.balls };
};

/** A session as it comes back out of storage, or null when the text is not one this machine wrote. Nothing in it is trusted. */
export function parseSession(text: unknown): SessionRecord | null {
  if (typeof text !== 'string' || text.length > 20_000) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecordLike(data) || data.v !== 1) return null;
  const owner = data.owner === null || (typeof data.owner === 'string' && data.owner.length > 0 && data.owner.length <= 128) ? data.owner : undefined;
  if (owner === undefined || typeof data.ledger !== 'string' || !LEDGER_SHAPE.test(data.ledger) || !isWhole(data.era, 0, 1_000_000)) return null;
  if (!isWhole(data.tray, 0, TRAY_MOST)) return null;
  const machine = parseMachine(data.machine);
  if (!machine || !Array.isArray(data.queue) || data.queue.length > QUEUE || !data.queue.every(isBallDraw)) return null;
  const pending = parsePending(data.pending);
  if (pending === undefined) return null;
  if (data.lent !== null && (typeof data.lent !== 'string' || !ID_SHAPE.test(data.lent))) return null;
  let away: AwayNote | null = null;
  if (data.away !== null) {
    if (!isRecordLike(data.away) || !isWhole(data.away.rounds, 1, 1_000) || !isWhole(data.away.balls, 0, TRAY_MOST)) return null;
    away = { rounds: data.away.rounds, balls: data.away.balls };
  }
  const queue = (data.queue as BallDraw[]).map((d) => ({ fate: d.fate, lot: d.lot, split: d.split, show: d.show, seed: d.seed }));
  return { v: 1, owner, ledger: data.ledger, era: data.era, tray: data.tray, machine, queue, pending, lent: data.lent as string | null, away };
}

export const serializeSession = (record: SessionRecord): string => JSON.stringify(record);
const copySession = (record: SessionRecord): SessionRecord => ({
  ...record,
  machine: copyMachine(record.machine),
  queue: record.queue.map((d) => ({ ...d })),
  pending: record.pending ? { ...record.pending } : null,
  away: record.away ? { ...record.away } : null,
});

/** Whether a session has medals out: balls in the tray, or holds, a spin or a hit's rounds to come. */
export const live = (record: SessionRecord): boolean => record.tray > 0 || busy(record.machine) || record.pending !== null;

// ── The machine at the bank ─────────────────────────────────────────────────

/** What the machine needs of the medals: the medal center's bank, or a fake one. */
export interface TableBank {
  owner(): string | null;
  balance(): number;
  getState(): { loaded: boolean; ledger: { era: number; device: string } | null };
  apply(move: Move): 'applied' | 'already' | null;
  applied(move: Pick<Move, 'game' | 'round' | 'step'>): boolean;
  forget(game: string, keep?: readonly string[]): boolean;
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
  /** A name for a lend or a count that no other has. */
  newId: () => string;
  /** Random numbers for a ball drawn outside a press (the queue ran out while the handle was held). */
  random: () => number;
  /** A ball's draw from random numbers (engine.ts `drawBall`). */
  draw: (random: () => number) => BallDraw;
}

export type LendOutcome = 'lent' | 'short' | 'away' | 'unsaved';

export type Table = ReturnType<typeof createTable>;

export function createTable({ bank, storage, holding, newId, random, draw }: TableOptions) {
  /** The session where storage cannot be used at all, or will not keep it: this page's memory alone keeps it. */
  let memory: SessionRecord | null = null;
  /**
   * Whether a lend or a count is moving medals at this moment. The bank tells everything that listens to it of each
   * move as it makes it, inside the press: a page that squares the session then is looking at its own press (`open`).
   */
  let staking = false;

  const onTable = (): { device: string; era: number } | null => {
    const ledger = bank.getState().ledger;
    return ledger ? { device: ledger.device, era: ledger.era } : null;
  };

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

  /** Writes the session down: in storage, or in this page's memory where storage cannot be used. False: storage can be read but would not keep it. */
  const keep = (record: SessionRecord): boolean => {
    const key = sessionKey(record.owner);
    if (write(key, serializeSession(record))) {
      memory = null;
      return true;
    }
    if (read(key) !== undefined) {
      // Storage is there but full: what it holds of the session is taken away, so that a reload never finds the
      // session as it was before this write; the page plays on from memory.
      remove(key);
      memory = copySession(record);
      return false;
    }
    memory = copySession(record);
    return true;
  };

  const move = (record: SessionRecord, round: string, step: string, medals: number) => bank.apply({ game: PACHINKO_GAME, round, step, medals, era: record.era });
  const moved = (round: string, step: string): boolean => bank.applied({ game: PACHINKO_GAME, round, step });

  /**
   * The session of the medals on the table, wherever it is kept: under the player's name, or, for an account whose
   * medals were this device's guest's until the first sign-in moved them in, under the guest's (moved to the
   * account's place by the page that holds the card). Sessions from before a reset, and text that is not a session,
   * are thrown away by that page. Undefined: storage cannot be read, and memory holds none.
   */
  const find = (): { record: SessionRecord; key: string | null } | null | undefined => {
    const medals = onTable();
    if (!medals) return null;
    const owner = bank.owner();
    const mine = holding();
    const inMemory = () => (memory && memory.owner === owner && memory.ledger === medals.device && memory.era === medals.era ? { record: copySession(memory), key: null } : null);
    for (const place of owner === null ? [null] : [owner, null]) {
      const key = sessionKey(place);
      const text = read(key);
      if (text === undefined) return inMemory() ?? undefined;
      if (text === null) continue;
      const found = parseSession(text);
      if (!found) {
        if (mine && place === owner) remove(key);
        continue;
      }
      if (found.ledger !== medals.device) continue;
      if (found.era !== medals.era) {
        if (mine) remove(key);
        continue;
      }
      if (place === owner) return { record: found, key };
      if (!mine) return { record: { ...found, owner }, key };
      const adopted: SessionRecord = { ...found, owner };
      if (!write(sessionKey(owner), serializeSession(adopted))) return { record: found, key };
      remove(key);
      return { record: adopted, key: sessionKey(owner) };
    }
    return inMemory();
  };

  /** A count's medals, in under their receipt, once; the floor hears of them as they go in. */
  const payCount = (record: SessionRecord, pending: Pending): void => {
    if (move(record, pending.id, PAY_STEP, pending.medals) === 'applied') floorReport(PACHINKO_GAME, { won: pending.medals });
  };

  /** Lets go of the medals out, once nothing is left of the session: no balls, holds, spin or hit. */
  const settleIfDone = (record: SessionRecord): SessionRecord => {
    if (live(record) || record.lent === null) return record;
    const done = { ...record, lent: null };
    keep(done);
    bank.settle(PACHINKO_GAME);
    bank.forget(PACHINKO_GAME);
    return done;
  };

  /**
   * A hit's rounds still to come, played out at once at strength 6: a ball a slot while the attacker is open (on
   * credit when the tray is empty), none between rounds; the 電チュー's run begins after them, and waits for the player.
   */
  const playOut = (record: SessionRecord): SessionRecord => {
    if (!record.machine.bonus) return record;
    const next = copySession(record);
    const kind = next.machine.bonus!.kind;
    let paid = 0;
    // A hit's rounds end within a bounded number of slots: ten balls a round, each one in.
    for (let guard = 0; next.machine.bonus && guard < 10_000; guard++) {
      if (attackerOpen(next.machine)) {
        const ball = next.queue.shift() ?? draw(random);
        const fired = fire(next.machine, BEST_RIGHT, ball);
        next.tray += fired.paid - 1;
        paid += fired.paid;
      }
      tick(next.machine);
    }
    next.tray = Math.max(0, next.tray);
    next.away = { rounds: (record.away?.rounds ?? 0) + kind.rounds, balls: (record.away?.balls ?? 0) + paid };
    return next;
  };

  /** Squares a session found with its receipts, by the page that holds the card. Returns the session as it stands. */
  const square = (found: { record: SessionRecord; key: string | null }): SessionRecord => {
    let record = found.record;
    if (staking) return record;
    staking = true;
    try {
      record = squared(record);
    } finally {
      staking = false;
    }
    return settleIfDone(record);
  };
  const squared = (found: SessionRecord): SessionRecord => {
    let record = found;
    const pending = record.pending;
    if (pending?.kind === 'lend') {
      // The session was written down before the medals went: the balls go in only if the medals did.
      const lent = moved(pending.id, LEND_STEP);
      record = { ...record, pending: null, tray: record.tray + (lent ? pending.balls : 0), lent: lent ? pending.id : record.lent };
      keep(record);
      if (lent) bank.forget(PACHINKO_GAME, [pending.id]);
    } else if (pending?.kind === 'count') {
      // The balls came out of the tray before the medals went in: the medals are owed, once.
      if (!moved(pending.id, PAY_STEP)) payCount(record, pending);
      record = { ...record, pending: null };
      keep(record);
      bank.forget(PACHINKO_GAME, record.lent ? [record.lent] : []);
    }
    return record;
  };

  /** The session as it stands, squared when this page holds the card; null for none. */
  const look = (): SessionRecord | null => {
    const found = find();
    if (!found) return null;
    return holding() && !staking ? square(found) : found.record;
  };

  /** A session for the medals on the table: the one there is, or a new empty one. */
  const current = (): SessionRecord | null => {
    const medals = onTable();
    if (!medals) return null;
    return look() ?? { v: 1, owner: bank.owner(), ledger: medals.device, era: medals.era, tray: 0, machine: newMachine(), queue: [], pending: null, lent: null, away: null };
  };

  return {
    /** The session as it stands, squared with its receipts by the page that holds the card: after a lend or a count. */
    session(): SessionRecord | null {
      if (!bank.getState().loaded) return null;
      return look();
    },

    /**
     * The session as a page that has just taken the card finds it: squared with its receipts, and a hit's rounds left
     * behind (by a page killed in them) played out, by the page that holds the card.
     */
    open(): SessionRecord | null {
      if (!bank.getState().loaded) return null;
      const found = look();
      if (!found || !found.machine.bonus || !holding() || found.pending) return found;
      const done = playOut(found);
      keep(done);
      return settleIfDone(done);
    },

    /**
     * A press of the lend: `LEND_MEDALS` medals for `LEND_BALLS` balls. `draws` (drawn in the press) top the balls
     * drawn ahead up. Nothing is taken when it cannot be: the card is not here, too few medals, or storage that can be
     * read will not keep the session.
     */
    lend(draws: readonly BallDraw[]): LendOutcome {
      const medals = onTable();
      if (!holding() || !bank.getState().loaded || medals === null) return 'away';
      if (bank.balance() < LEND_MEDALS) return 'short';
      const now = current();
      if (!now || now.pending) return 'away';
      const id = newId();
      staking = true;
      try {
        const before: SessionRecord = { ...copySession(now), queue: topped(now.queue, draws) };
        const asked: SessionRecord = { ...before, pending: { kind: 'lend', id, medals: LEND_MEDALS, balls: LEND_BALLS } };
        if (!keep(asked)) {
          memory = copySession(now);
          return 'unsaved';
        }
        if (move(asked, id, LEND_STEP, -LEND_MEDALS) !== 'applied') {
          keep(before);
          return 'short';
        }
        floorReport(PACHINKO_GAME, { played: LEND_MEDALS });
        keep({ ...asked, pending: null, tray: asked.tray + LEND_BALLS, lent: id });
        // Every lend and count before this one is over: only this lend's receipts say the session's medals are out.
        bank.forget(PACHINKO_GAME, [id]);
        return 'lent';
      } finally {
        staking = false;
      }
    },

    /** The counter: the balls in the tray into medals, rounded down (the rest stay). The medals counted, or null for none. */
    count(): number | null {
      if (!holding() || !bank.getState().loaded) return null;
      const now = current();
      if (!now || now.pending || now.machine.bonus) return null;
      const medals = Math.floor(now.tray / BALLS_PER_MEDAL);
      if (medals <= 0) return null;
      const id = newId();
      staking = true;
      try {
        const pending: Pending = { kind: 'count', id, medals, balls: medals * BALLS_PER_MEDAL };
        const asked: SessionRecord = { ...copySession(now), tray: now.tray - pending.balls, pending };
        if (!keep(asked)) {
          memory = copySession(now);
          return null;
        }
        payCount(asked, pending);
        const done: SessionRecord = { ...asked, pending: null };
        keep(done);
        bank.forget(PACHINKO_GAME, done.lent ? [done.lent] : []);
        settleIfDone(done);
        return medals;
      } finally {
        staking = false;
      }
    },

    /** Tops the balls drawn ahead up with `draws`, drawn in a press: the next balls fired use them first. */
    topUp(draws: readonly BallDraw[]): void {
      if (!holding()) return;
      const now = look();
      if (!now || now.queue.length >= QUEUE) return;
      keep({ ...now, queue: topped(now.queue, draws) });
    },

    /**
     * One slot: the ball, if `strength` is given and there is one to fire, then the machine. Written down before it
     * is shown. Null: not this page's to play now.
     */
    step(strength: number | null, session: SessionRecord): { record: SessionRecord; slot: Slot } | null {
      if (!holding() || session.pending) return null;
      const next = copySession(session);
      let ball: Slot['ball'] = null;
      const credit = next.tray <= 0 && attackerOpen(next.machine);
      if (strength !== null && isStrength(strength) && (next.tray > 0 || credit)) {
        const shot = credit ? BEST_RIGHT : strength;
        const drawn = next.queue.shift() ?? draw(random);
        const fired = fire(next.machine, shot, drawn);
        next.tray = Math.max(0, next.tray - 1 + fired.paid);
        ball = { strength: shot, draw: drawn, fired, credit };
      }
      const ticks = tick(next.machine);
      reportTicks(ticks);
      keep(next);
      return { record: settleIfDone(next), slot: { ball, ticks } };
    },

    /**
     * Skip: a reach's spin, or the fanfare, the wait between rounds or the ending, cut short. It fires no ball, and it
     * changes nothing the spin or the hit was going to come to. Null: nothing to skip, or not this page's to play now.
     */
    skip(session: SessionRecord): { record: SessionRecord; ticks: Tick[] } | null {
      if (!holding() || session.pending || !skippable(session.machine)) return null;
      const next = copySession(session);
      const ticks: Tick[] = [];
      const spin = next.machine.spin;
      const stage = next.machine.bonus?.stage;
      for (let guard = 0; guard < 20; guard++) {
        if (spin ? next.machine.spin !== spin : next.machine.bonus?.stage !== stage) break;
        ticks.push(...tick(next.machine, () => true));
      }
      reportTicks(ticks);
      keep(next);
      return { record: settleIfDone(next), ticks };
    },

    /** The page gives up the card: a hit's rounds still to come are played out now. */
    leaving(): SessionRecord | null {
      if (!holding()) return null;
      const found = find();
      if (!found || !found.record.machine.bonus || found.record.pending) return found?.record ?? null;
      const done = playOut(found.record);
      keep(done);
      return settleIfDone(done);
    },

    /** The note of a hit played out while the page was away has been shown. */
    told(): void {
      if (!holding()) return;
      const now = look();
      if (now?.away) keep({ ...now, away: null });
    },

    /** Forgets the session kept for the player on the table: the medals have been reset. */
    clear(): void {
      remove(sessionKey(bank.owner()));
      memory = null;
    },
  };
}

/** What the floor hears of a slot: each hit by name, and a long run of them as it ends. */
function reportTicks(ticks: readonly Tick[]): void {
  for (const t of ticks) {
    if (t.type === 'stop' && t.kind) floorReport(PACHINKO_GAME, { prize: { medals: hitMedals(t.kind), label: hitLabel(t.kind) } });
    if (t.type === 'mode' && t.mode === 'normal' && t.rush) {
      const medals = rushPrize(t.rush);
      if (medals !== null) floorReport(PACHINKO_GAME, { prize: { medals, label: 'pachinko-rush' } });
    }
  }
}

/** Whether Skip has anything to cut short: a reach (from its reach on), or a hit's fanfare, interval or ending. */
export const skippable = (m: Machine): boolean => (m.spin ? m.spin.kind !== 'plain' && m.spin.phase >= 1 : m.bonus !== null && m.bonus.stage !== 'open');

/**
 * Whether the rules (`rules`) are still at the point Skip would cut short on the screen (`shown`, a ball's flight
 * behind them): the same spin's reach, or the same stage of the same round. Not where the rules have gone on past it:
 * the reach shown has stopped, and the hit's fanfare has begun.
 */
export const sameSkip = (shown: Machine, rules: Machine): boolean => {
  if (!skippable(shown) || !skippable(rules)) return false;
  if (shown.spin) {
    const a = shown.spin;
    const b = rules.spin;
    return b !== null && b.from === a.from && b.hold.lot === a.hold.lot && b.hold.split === a.hold.split && b.hold.show === a.hold.show && b.hold.seed === a.hold.seed;
  }
  return shown.bonus !== null && rules.bonus !== null && rules.bonus.stage === shown.bonus.stage && rules.bonus.round === shown.bonus.round;
};

/** The balls drawn ahead, topped up to `QUEUE` with `draws`. */
const topped = (queue: readonly BallDraw[], draws: readonly BallDraw[]): BallDraw[] => [...queue, ...draws].slice(0, QUEUE).map((d) => ({ ...d }));

/**
 * A name for a lend or a count: the time and a random part, in letters and digits. The page takes the random part
 * from the browser's crypto, not from Math.random, which is the draw's alone.
 */
export const roundId = (now: number, random: () => number): string => `${now.toString(36)}${Math.floor(random() * 36 ** 6).toString(36)}`;
