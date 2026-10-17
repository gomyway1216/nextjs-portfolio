'use client';

/**
 * The history of the medals in the browser: where `history.ts`, which is only
 * arithmetic, meets storage, the other tabs and the player's account. The
 * bank makes one, tells it what it does with the medals as it does it, and
 * runs it for as long as the bank itself is open (bank.ts). Nothing here
 * moves a medal or is read to decide one.
 *
 * ## Storage
 *
 * A guest's history is kept on this device under `HISTORY_KEY`, and each
 * account's under a name of its own (`historyKey`), beside that account's
 * medals. It is written by the page that holds the medal center's card, as
 * the medals are, so no tab's write lands on top of another's:
 *
 * - while a machine plays, every couple of seconds (`FLUSH_EVERY`), and
 *   when the card is let go, which is also what happens when the page is
 *   hidden or left;
 * - after the hub's moment with the card (a bonus, a refill, a reset), as the
 *   card goes back.
 *
 * Every write reads what storage holds first and joins it in
 * (`mergeHistories`), so what another tab wrote is never written over. A
 * browser that dies between the medals' write and the history's loses the
 * last second or two of history, never a medal.
 *
 * ## The account
 *
 * A player who is signed in has the history on their account too, as a
 * document of its own (`HISTORY_GAME_KEY`), kept in step by `account.ts` as
 * the medals are. Neither copy wins: the two are joined (`settleHistories`).
 * It never writes blind: every write reads the account first and sends the
 * two joined, and nothing is sent in the way that outlives the page, which
 * cannot read first. It is sent at most every five minutes while it changes,
 * at once after a reset, and when the page is hidden. Nothing is sent as a
 * player who has signed out.
 *
 * The guest's history goes with the guest's medals: when a guest's medals
 * become an account's on its first sign-in, so does the guest's history, and
 * it leaves the guest's place (`seat`). When the account has medals of its
 * own already, the guest's history stays the guest's, as the medals do.
 */

import { GUEST, createSync, fromCloud, toCloud, type AccountStore, type Kept, type Player, type Slots, type Standing, type Status, type Sync, type Verdict } from '../MedalPusher/account';
import { createHistory, mergeHistories, parseHistory, printOf, record, serializeHistory, type History, type Observation } from './history';

/** Where a guest's history is kept on this device. */
export const HISTORY_KEY = 'medal-center-history';
/** Where a player's history is kept on this device: a guest's, or an account's. (`medal-center-history:` and the account is the keeper's own slot.) */
export const historyKey = (uid: string | null): string => (uid === null ? HISTORY_KEY : `medal-center-log:${uid}`);
/** The key the history has among a player's saves on the account. */
export const HISTORY_GAME_KEY = 'medal-center-history';

/** How often a history that has changed goes to the account, in seconds: nearly every round changes it, and each write costs the server a document. */
export const HISTORY_SEND_EVERY = 300;
/** How often a page holding the card writes the history while it changes, in seconds. */
export const FLUSH_EVERY = 2;
/** How often the keeper is shown the history, in seconds. */
export const HISTORY_LOOK_EVERY = 10;
/** How long what the account has just said is taken to be what it holds, in milliseconds. */
export const HISTORY_HEARD_FOR = 2000;
/** How long after a write to the account it is read again, to see that no other device's write went over it, in milliseconds; and how long after a check that failed. */
export const HISTORY_CHECK_AFTER = 20_000;
export const HISTORY_CHECK_AGAIN = 60_000;

export interface HistoryState {
  /** Whether the history has been read. Until then, and on the server, nothing is known and nothing is shown. */
  loaded: boolean;
  /** Whose history it is: an account's id, or null for a guest's. It is always the medals' owner's. */
  owner: string | null;
  /** Where else it is kept, as account.ts says. */
  where: Status['where'];
  /** Whether the last write to this device took. */
  kept: boolean;
  history: History | null;
}

export const HISTORY_WAITING: HistoryState = { loaded: false, owner: null, where: 'device', kept: true, history: null };

/** What the history needs of the world: storage, the clock, and the medal center's card, all of which the bank has. */
export interface HistoryDeps {
  /** What storage holds under a name. Throws when storage is blocked. */
  read: (key: string) => string | null;
  write: (key: string, text: string) => void;
  remove: (key: string) => void;
  now: () => number;
  /** A mark for a copy sent to the account: any text no other copy will carry. */
  mark: () => string;
  /** Whether this page holds the card, or the browser cannot keep its pages apart: the history is written then. */
  holding: () => boolean;
  /** Does `job` with the card: at once if this page holds it, otherwise as soon as it is given. */
  withCard: (job: () => void) => void;
}

/**
 * Which copy of the history wins when the account's has been read: neither.
 * They are joined, and the joined history is what this device keeps for the
 * account and, if the account lacks any of it, sends.
 *
 * - The account's copy cannot be read here: hold. It is left as it is.
 * - The account has none: this device's copy for the account is taken, and
 *   sent when there is anything in it. A guest's history is not taken here:
 *   it goes with the guest's medals, or not at all (see the top of the file).
 * - Otherwise the two are joined.
 *
 * `name` makes up a device's name, for when this device has no copy.
 */
export function settleHistories({ account, device }: Standing, name: () => string): Verdict {
  if (account.kind === 'unreadable') return { kind: 'hold' };
  const here = device ? parseHistory(device.text) : null;
  if (account.kind === 'none') {
    const mine = here ?? createHistory(name(), 0);
    return { kind: 'take', text: serializeHistory(mine), send: here !== null && (here.entries.length > 0 || here.games.length > 0) };
  }
  const theirs = parseHistory(account.text);
  if (!theirs) return { kind: 'hold' };
  const merged = serializeHistory(mergeHistories(here ?? createHistory(name(), 0), theirs));
  return { kind: 'take', text: merged, send: printOf(merged) !== printOf(account.text) };
}

/** One player's history on the table. */
interface Desk {
  owner: string | null;
  key: string;
  history: History;
  /** Whether it holds something storage may not. */
  unsaved: boolean;
  /** Whether it is an account's that the guest's history has gone into, and the guest's has still to leave its place. */
  moved: boolean;
  /** Whether a copy from elsewhere (the account's, the guest's) has been joined in and is still to be written. */
  joined: boolean;
}

export type HistoryStore = ReturnType<typeof createHistoryStore>;

export function createHistoryStore(deps: HistoryDeps) {
  let state: HistoryState = HISTORY_WAITING;
  let started = false;
  let desk: Desk | null = null;
  let kept = true;
  let ticks = 0;
  const listeners = new Set<() => void>();

  let wanted: Player = GUEST;
  let accounts: AccountStore | null = null;
  let sync: Sync | null = null;
  let where: Status['where'] = 'device';
  let heardAt = Number.NEGATIVE_INFINITY;
  /** The keeper's copy of a player's history, opened before that player's medals are on the table. */
  let pending: { owner: string; history: History } | null = null;
  /** The history of medals that left the table before it was written, to be written the next time the card is here. */
  let leftover: Desk | null = null;

  const publish = (): void => {
    state = { loaded: started && desk !== null, owner: desk?.owner ?? null, where, kept, history: desk?.history ?? null };
    for (const listener of [...listeners]) listener();
  };

  // ── Storage ──

  const read = (key: string): string | null | undefined => {
    try {
      return deps.read(key);
    } catch {
      return undefined;
    }
  };
  const put = (key: string, text: string): boolean => {
    try {
      deps.write(key, text);
      return true;
    } catch {
      return false;
    }
  };
  const drop = (key: string): void => {
    try {
      deps.remove(key);
    } catch {
      // It stays.
    }
  };

  /** The text of a history, kept so that it is not written out again for every question about one history. */
  let printed: { history: History; text: string } | null = null;
  const textOf = (history: History): string => {
    if (printed?.history !== history) printed = { history, text: serializeHistory(history) };
    return printed.text;
  };

  /**
   * Writes a desk's history on top of what storage holds, joined in. Only the
   * page that holds the card does. A history stored there that cannot be read
   * is put aside under a name of its own, not written over.
   */
  const flush = (at: Desk | null = desk): void => {
    if (!at || !at.unsaved) return;
    const text = read(at.key);
    if (text === undefined) {
      if (at === desk) kept = false;
      return;
    }
    const stored = text === null ? null : parseHistory(text);
    if (text !== null && !stored) put(`${at.key}#unread`, text);
    const merged = stored ? mergeHistories(at.history, stored) : at.history;
    const out = textOf(merged);
    if (out !== text) {
      const ok = put(at.key, out);
      if (at === desk) kept = ok;
      if (!ok) return;
    }
    at.history = merged;
    at.unsaved = false;
    at.joined = false;
    // A guest's history that has gone into the account's is safely in the account's place now: it leaves the guest's.
    if (at.moved && at.owner !== null) {
      drop(HISTORY_KEY);
      at.moved = false;
    }
    if (at === desk) publish();
  };

  /** A copy from elsewhere joined into a desk's history. It is written with the card. */
  const join = (at: Desk, theirs: History): void => {
    const merged = mergeHistories(at.history, theirs);
    if (textOf(merged) === serializeHistory(at.history)) return;
    at.history = merged;
    at.unsaved = true;
    at.joined = true;
    if (at === desk) publish();
  };

  /** The guest's history goes into an account's with the guest's medals, and leaves the guest's place once it is written. */
  const carry = (at: Desk): void => {
    const text = read(HISTORY_KEY);
    const guest = typeof text === 'string' ? parseHistory(text) : null;
    // A guest's history this version cannot read stays where it is.
    if (!guest) return;
    // It is written with the medals: the bank writes a guest's medals that have moved with the card, and the history
    // goes as the card does (`yielding`), or with the machine's next writes.
    at.history = mergeHistories(at.history, guest);
    at.unsaved = true;
    at.moved = true;
    sync?.save('moment');
  };

  // ── The account ──

  const keptHistory: Kept = {
    slot: HISTORY_KEY,
    // Only a signed-in player's own history goes to the account, and only once it is the one on the table.
    current: () => (desk && sync && desk.owner !== null && desk.owner === sync.owner() ? textOf(desk.history) : null),
    reads: (text) => parseHistory(text) !== null,
    print: printOf,
    settle(standing) {
      const verdict = settleHistories(standing, () => desk?.history.device ?? 'history0');
      if (verdict.kind !== 'hold') heardAt = deps.now();
      return verdict;
    },
    reopen: () => reopen(),
  };

  /** Storage as the keeper is given it: the guest's history has one home, which only the holder of the card writes. */
  const slots: Slots = {
    getItem: (key) => deps.read(key),
    setItem: (key, value) => {
      if (key !== HISTORY_KEY) deps.write(key, value);
    },
    removeItem: (key) => {
      if (key !== HISTORY_KEY) deps.remove(key);
    },
  };

  /** The account has said what it holds, in answer to a write: it is joined into that player's history here. */
  const hears = (uid: string, theirs: History): void => {
    if (desk && desk.owner === uid) join(desk, theirs);
  };

  /** When the account is to be read again, to see that the last write was not written over by another device's. */
  let checkAt: number | null = null;

  /**
   * The account's store as the keeper is given it: one that never writes
   * blind (see `joining` in bank.ts). A write reads what the account holds
   * first and sends the two joined; and since another device can read and
   * write between this one's read and its write, the account is read again a
   * little after each write (`check`).
   */
  const joining = (base: AccountStore): AccountStore => ({
    load: (uid) => base.load(uid),
    async store(uid, cloud) {
      const written = (going: Promise<void>): Promise<void> =>
        going.then(() => {
          checkAt = deps.now() + HISTORY_CHECK_AFTER;
        });
      const sending = fromCloud(cloud);
      const mine = sending ? parseHistory(sending.text) : null;
      if (!sending || !mine || deps.now() - heardAt < HISTORY_HEARD_FOR) return written(base.store(uid, cloud));
      const found = await base.load(uid);
      if (!found) return written(base.store(uid, cloud));
      const got = fromCloud(found.state);
      const theirs = got ? parseHistory(got.text) : null;
      if (!got || !theirs) throw new Error('The account holds a copy this page cannot read');
      heardAt = deps.now();
      const merged = serializeHistory(mergeHistories(mine, theirs));
      const news = printOf(merged) !== printOf(sending.text);
      if (news) hears(uid, theirs);
      if (printOf(merged) === printOf(got.text)) return undefined;
      const changedAt = (cloud as { changedAt?: unknown }).changedAt;
      const joined = news ? toCloud(merged, sending.mark ?? deps.mark(), typeof changedAt === 'number' ? changedAt : deps.now()) : null;
      return written(base.store(uid, joined ?? cloud));
    },
    prepare: () => Promise.resolve(),
    storeNow: () => null,
    forget: (uid) => base.forget(uid),
  });

  /**
   * Reads the account again after a write, and sends what it lacks of this
   * device's history: what another device wrote over it, having read the
   * account before this device's write landed. Only for the player who is
   * signed in, and only while their history is the one on the table.
   */
  const check = (): void => {
    const at = desk;
    const uid = wanted.uid;
    const base = accounts;
    if (!base || !at || uid === null || at.owner !== uid || where !== 'account') return;
    const later = (): void => {
      checkAt = deps.now() + HISTORY_CHECK_AGAIN;
    };
    base.load(uid).then((found) => {
      if (!started || desk !== at || wanted.uid !== uid || accounts !== base) return;
      const got = found ? fromCloud(found.state) : null;
      const theirs = got ? parseHistory(got.text) : null;
      // A copy that cannot be read is left exactly as it is.
      if (found && (!got || !theirs)) return;
      if (theirs) {
        heardAt = deps.now();
        hears(uid, theirs);
      }
      const merged = serializeHistory(theirs ? mergeHistories(at.history, theirs) : at.history);
      if (got && printOf(merged) === printOf(got.text)) return;
      const cloud = toCloud(merged, deps.mark(), deps.now());
      if (cloud) joining(base).store(uid, cloud).catch(later);
    }, later);
  };

  const keeper = (base: AccountStore): Sync =>
    createSync({
      kept: keptHistory,
      store: joining(base),
      slots: () => slots,
      now: deps.now,
      mark: deps.mark,
      every: HISTORY_SEND_EVERY,
      onStatus: (status) => {
        where = status.where;
        if (started) publish();
      },
    });

  /** What the keeper opens: a copy of a signed-in player's history, joined into theirs when it is on the table. */
  const opened = (text: string | null, owner: string | null): void => {
    const theirs = owner === null || text === null ? null : parseHistory(text);
    if (!theirs || owner === null) return;
    if (desk && desk.owner === owner) join(desk, theirs);
    else pending = { owner, history: theirs };
  };

  function reopen(): void {
    if (!sync) return;
    const text = sync.open();
    const owner = sync.owner();
    if (!started) return;
    opened(text, owner);
    publish();
    sync.save('tick');
  }

  return {
    getState: (): HistoryState => state,

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Whether anything on the page is listening. */
    listening: (): boolean => listeners.size > 0,

    /** The bank is open: the history is read as soon as the bank says whose medals are on the table (`seat`). */
    start(): void {
      if (started) return;
      started = true;
      ticks = 0;
      sync = accounts ? keeper(accounts) : null;
      if (sync) {
        sync.player(wanted);
        opened(sync.open(), sync.owner());
      }
      publish();
    },

    /** The bank is put away. What is unsent goes now, and is heard of or not after the keeper is closed. */
    end(): void {
      if (!started) return;
      sync?.save('moment');
      sync?.close();
      sync = null;
      where = 'device';
      pending = null;
      leftover = null;
      checkAt = null;
      desk = null;
      started = false;
      state = HISTORY_WAITING;
    },

    /** Who is playing, and where their account keeps the history. */
    attend(player: Player, store: AccountStore | null): void {
      wanted = store ? player : GUEST;
      if (store === accounts) {
        sync?.player(wanted);
        return;
      }
      accounts = store;
      checkAt = null;
      if (!started) return;
      sync?.close();
      sync = store ? keeper(store) : null;
      if (sync) {
        sync.player(wanted);
        reopen();
      } else {
        where = 'device';
        publish();
      }
    },

    /**
     * Whose medals are on the table: their history is put beside them. `device`
     * is the medals' own name for this device, which a history begun here
     * takes. `moved`: they are a guest's medals that have become this
     * account's, and the guest's history goes with them.
     */
    seat(owner: string | null, device: string, moved: boolean): void {
      if (!started) return;
      if (!desk || desk.owner !== owner) {
        // The history of the medals that leave the table is written with them, if the card is here; if not, it is
        // written the next time it is (`leftover`). Nothing is asked for here, in the middle of the bank's own change.
        const before = desk;
        if (before?.unsaved) {
          if (deps.holding()) flush(before);
          else leftover = before;
        }
        const key = historyKey(owner);
        const text = read(key);
        kept = text !== undefined;
        const stored = typeof text === 'string' ? parseHistory(text) : null;
        desk = { owner, key, history: stored ?? createHistory(device, deps.now()), unsaved: stored === null, moved: false, joined: false };
        if (pending && pending.owner === owner) {
          join(desk, pending.history);
          pending = null;
        }
      }
      if (moved && owner !== null && !desk.moved) carry(desk);
      publish();
    },

    /** Something happened to the medals on the table. It is written with the card. */
    observe(observation: Observation): void {
      const at = desk;
      if (!started || !at) return;
      const next = record(at.history, observation);
      if (next === at.history) return;
      at.history = next;
      at.unsaved = true;
      publish();
      // A reset reaches the account without waiting for the five minutes.
      if (observation.type === 'reset') sync?.save('moment');
    },

    /** Once a second. */
    tick(): void {
      if (!started) return;
      ticks += 1;
      if (leftover && deps.holding()) {
        flush(leftover);
        leftover = null;
      }
      const at = desk;
      if (at?.unsaved) {
        if (deps.holding()) {
          if (ticks % FLUSH_EVERY === 0 || at.joined) flush(at);
        } else if (at.joined) {
          // A copy from the account joined in on a page that plays no machine: it is written with the card, once.
          at.joined = false;
          deps.withCard(() => flush(at));
        }
      }
      if (ticks % HISTORY_LOOK_EVERY === 0) sync?.save(where === 'offline' ? 'moment' : 'tick');
      if (checkAt !== null && deps.now() >= checkAt) {
        checkAt = null;
        check();
      }
    },

    /** The card is about to go: what has not been written is written while it is still here. */
    yielding(): void {
      if (leftover) {
        flush(leftover);
        leftover = null;
      }
      flush();
    },

    /** The page has been hidden, or is being left: the account is sent what it has not had, if the page lives long enough. */
    hidden(): void {
      sync?.save('moment');
    },

    /** Another tab has written storage: what it wrote of this history is joined in. */
    changed(key: string | null): void {
      const at = desk;
      if (!started || !at || (key !== null && key !== at.key)) return;
      const text = read(at.key);
      const stored = typeof text === 'string' ? parseHistory(text) : null;
      if (!stored) return;
      const merged = mergeHistories(at.history, stored);
      if (textOf(merged) === serializeHistory(at.history)) return;
      at.history = merged;
      publish();
    },
  };
}
