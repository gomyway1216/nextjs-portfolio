/**
 * Keeping something on the player's account as well as on this device.
 *
 * A guest's machine lives in this browser alone. A player who is signed in
 * has theirs on the account, so that it follows them to another device, and
 * this file is what keeps the two copies in step: the device's, which is
 * what the page opens with at once and plays on when there is no network,
 * and the account's, which it reads once when the game is opened and writes
 * back to as the game is played.
 *
 * Nothing here knows what a machine is. What is kept is a text: `Kept` says
 * where it lives, how to tell that one can be read, when one differs from
 * another enough to be worth sending, and which copy wins. The machine's
 * answers are in savedMachine.ts; a second document, with a slot and a rule
 * of its own, is another `createSync`.
 *
 * It never touches the browser or the network itself. The storage, the
 * account's store, the clock and the marks are all handed in, so the whole of
 * it runs in a test with a fake of each.
 *
 * The rules it keeps to:
 * - A guest's copy and each account's copy have slots of their own on the
 *   device, so two people at one computer never get each other's.
 * - Nothing is written to the account before the account's copy has been
 *   read and the two compared, so an older copy never goes blindly over a
 *   newer one that this device had not seen.
 * - A copy on the account that cannot be read here, because a newer version
 *   of the game wrote it or because it is damaged, is left exactly as it is:
 *   not deleted, and not written over.
 * - Nothing is sent to the account as a player who has signed out. What had
 *   not yet been sent stays in their slot on this device, marked as unsent,
 *   and goes up the next time they open the game here.
 * - The copy on the table is the last thing the account is sent. One write
 *   waits for another to be answered; the one made as the page is left
 *   cannot wait, so a write only settles anything if it was in the air by
 *   itself, and otherwise the copy goes again. Every copy sent carries a
 *   mark that is written down on the device before it goes, so that an
 *   older one of this device's own, found on the account at the next visit
 *   because it landed last or because the page was gone, is known for what
 *   it is and written over.
 * - Failing is ordinary. Whatever goes wrong with the network or the
 *   storage, nothing is thrown: the device's copy plays on, the status says
 *   what is true, and it is tried again later.
 */

import { pack, unpack } from './pack';

// ── What is kept, and who for ───────────────────────────────────────────────

/** Who is playing, as far as the site knows. */
export interface Player {
  /** The account's id, or null for a guest. */
  uid: string | null;
  /** Whether the site has finished finding out. Until it has, `uid` is null even for someone who is signed in. */
  settled: boolean;
  /** Whether the site, still finding out, expects a signed-in player: this browser was signed in last time. */
  expected: boolean;
}

export const GUEST: Player = { uid: null, settled: true, expected: false };

/** The part of the browser's storage that is used. Every call may throw: storage can be blocked, full or switched off. */
export type Slots = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * The account's side: one document for one game key. Every call names the
 * account it is for, and a store must refuse a call for any account but the
 * one that is signed in, so that one player's copy can never be written to
 * another's.
 */
export interface AccountStore {
  /** The account's copy, or null when it has none. Rejects when the account cannot be reached. */
  load(uid: string): Promise<{ state: unknown; updatedAt: string | null; serverTime: string | null } | null>;
  /** Writes the account's copy. Rejects when it could not be written. */
  store(uid: string, state: object): Promise<void>;
  /** Gets ready whatever `storeNow` needs, so that nothing has to be waited for as the page is left. Never rejects. */
  prepare(uid: string): Promise<void>;
  /**
   * The same write, sent at once and in a way that outlives the page. Null
   * when it could not be sent at all; otherwise a promise, which never
   * rejects, of whether the account took it.
   */
  storeNow(uid: string, state: object): Promise<boolean> | null;
  /** Lets go of whatever was got ready for that account: its player has signed out, and nothing more is to be sent as them. */
  forget(uid: string): void;
}

/** What this device knows about its copy of an account's document. */
interface Copy {
  text: string;
  /** When, by this device's clock, the copy last changed in a way worth sending. */
  changedAt: number;
  /** Whether it has changed since the account last had it. */
  dirty: boolean;
  /** The mark of the account's copy this one was last in step with: read from it, or written to it and confirmed. */
  known: string | null;
  /** The mark of the last copy sent, while it is not known that the account has it, and what this copy looked like then. */
  sent: string | null;
  sentPrint: string | null;
  /**
   * The marks of copies sent before that one and never known to have come to
   * anything. If the account holds one of them, nobody else has written
   * since, and this device's copy is the newer.
   */
  earlier: string[];
}

/** How the two copies stand when the account's has been read. */
export interface Standing {
  /** What the account holds. */
  account: { kind: 'none' } | { kind: 'unreadable' } | { kind: 'save'; text: string; mark: string | null; updatedAt: number | null };
  /** This device's copy for this account, if it has one. */
  device: null | { text: string; dirty: boolean; known: string | null; sent: string | null; sentIsLatest: boolean; changedAt: number };
  /** What is on the table when the device has no copy for the account: a guest's, or one just begun. Null when there is nothing. */
  guest: string | null;
  /** The server's clock less this device's, in milliseconds, as measured when the account's copy was read. */
  skew: number;
}

/** What to do about it. */
export type Verdict =
  /** Leave both copies as they are and write nothing to the account. */
  | { kind: 'hold' }
  /** They are the same: nothing to do. */
  | { kind: 'in-step' }
  /** The device's copy is the one to keep: send it. */
  | { kind: 'send' }
  /** What is on the table becomes the account's: it moves to the account's slot on the device and is sent. */
  | { kind: 'adopt' }
  /** Put this text on the device in place of what is there, and send it too if it is not what the account holds. */
  | { kind: 'take'; text: string; send: boolean };

/** What is being kept. Everything that is the machine's own, and would be another document's own, is here. */
export interface Kept {
  /** A guest's slot on the device. An account's copy is kept beside it, under the account's id. */
  slot: string;
  /** What is on the device now, as text. Null while there is nothing. */
  current(): string | null;
  /** Whether a text is one of these that this code can read. One that is not is never put on the device, and never sent. */
  reads(text: string): boolean;
  /** A short text that is the same for two copies with nothing between them worth sending. */
  print(text: string): string;
  /** Which copy wins. */
  settle(standing: Standing): Verdict;
  /** Asked when the device's copy has to be opened again: another player's, or the account's in place of this one. `open` then says what to open. */
  reopen(): void;
}

/** What the player can be told. */
export interface Status {
  /**
   * Where the copy is kept: on this device alone (a guest); on the account;
   * on this device for now, the account not having been reached; on this
   * device, the account's own copy being one this code cannot read; or still
   * being looked for on the account.
   */
  where: 'device' | 'account' | 'offline' | 'unreadable' | 'checking';
  /** Whether the last write to this device took. */
  kept: boolean;
}

/** Why a copy is being saved: on the clock, at a big moment, as the page is hidden, or as the cabinet is left or its machine changed. */
export type Why = 'tick' | 'moment' | 'hidden' | 'left';

export interface Sync {
  /** Tells it who is playing. It asks for a reopen when that changes whose copy is on the device. */
  player(next: Player): void;
  /** The text to open with: the account's copy, the device's own, a guest's, or null for a new one. */
  open(): string | null;
  /** Writes the current copy to the device and, when it is due, to the account. Returns whether the device's write took. */
  save(why: Why): boolean;
  /** The next `open` starts a new document and throws the old one away, on the device and on the account. */
  fresh(): void;
  /** Stops it: results that arrive later are ignored. */
  close(): void;
}

export interface SyncDeps {
  kept: Kept;
  /** The account's store, or null where there is none: then everything is a guest's. */
  store: AccountStore | null;
  /** The browser's storage. Getting it may itself throw. */
  slots: () => Slots;
  /** This device's clock, in milliseconds. */
  now: () => number;
  /** A mark for a copy about to be sent: any text no other copy will carry. */
  mark: () => string;
  /** Told whenever what the player can be told has changed. */
  onStatus: (status: Status) => void;
}

/**
 * How often a changed copy goes to the account, in seconds. Each write costs
 * the server a document written, an entry in the activity log and two
 * functions run, so it is not done on the device's five-second clock.
 */
export const SEND_EVERY = 60;
/** A big moment is sent without waiting for the minute, but not sooner than this after the last write. */
export const MOMENT_GAP = 10;
/** How long to wait before trying again after one, two, three … failures in a row, in seconds. */
export const RETRY_AFTER = [15, 30, 60, 120, 300] as const;
/** The most a copy may come to on its way to the account: the route refuses more with a 413. */
export const ACCOUNT_LIMIT = 64 * 1024;

const retryAfter = (failures: number): number => RETRY_AFTER[Math.min(failures, RETRY_AFTER.length) - 1] * 1000;

// ── The account's copy, as it travels ───────────────────────────────────────

/** The only way a copy is written for the account so far. A copy written another way is one this code cannot read. */
export const CLOUD_FORMAT = 1;

/** What the route stores: the packed text, and the mark that tells one copy from another. */
export interface CloudState {
  format: number;
  mark: string;
  /** When the copy last changed, by the clock of the device that sent it. Only there to be read by a person. */
  changedAt: number;
  data: string;
}

/** A text made ready for the account, or null when it cannot be: not JSON, or too big even when packed. */
export function toCloud(text: string, mark: string, changedAt: number): CloudState | null {
  const data = pack(text);
  if (data === null) return null;
  const state: CloudState = { format: CLOUD_FORMAT, mark, changedAt, data };
  return sizeOf(state) <= ACCOUNT_LIMIT ? state : null;
}

/** The size the route measures: the state as JSON, in bytes. */
export function sizeOf(state: object): number {
  return new TextEncoder().encode(JSON.stringify(state)).length;
}

/** The text and the mark of a copy read from the account, or null when it is not one this code wrote. Never throws. */
export function fromCloud(state: unknown): { text: string; mark: string | null } | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return null;
  const { format, mark, data } = state as Record<string, unknown>;
  if (format !== CLOUD_FORMAT) return null;
  const text = unpack(data);
  return text === null ? null : { text, mark: typeof mark === 'string' ? mark : null };
}

// ── Which copy wins ─────────────────────────────────────────────────────────

/**
 * The rule for a document of which there is one true copy, like the machine:
 * the last one to have been played wins.
 *
 * - The account's copy cannot be read here: hold. It is left as it is.
 * - The account has none: the device's copy for it is sent; with none of
 *   those either, what is on the table (a guest's machine, or a new one)
 *   becomes the account's.
 * - The account has one and the device has none for it: the account's is
 *   taken. A guest's machine stays in its own slot.
 * - The account holds what this device last sent or last read: nobody else
 *   has written since, so the device's copy is the newer if it has changed
 *   and the same if it has not. No clock is asked.
 * - Somebody else has written since. If the device's copy has not changed
 *   it is simply behind, and the account's is taken. If both have changed,
 *   the one that changed last wins, the device's time being put on the
 *   server's clock first (`skew`), so that a device whose clock is wrong is
 *   not believed over one whose clock is right.
 */
export function decide({ account, device, skew }: Standing): Verdict {
  if (account.kind === 'unreadable') return { kind: 'hold' };
  if (account.kind === 'none') return device ? { kind: 'send' } : { kind: 'adopt' };
  const take: Verdict = { kind: 'take', text: account.text, send: false };
  if (!device) return take;
  if (account.mark !== null && account.mark === device.sent) return device.sentIsLatest ? { kind: 'in-step' } : { kind: 'send' };
  if (account.mark !== null && account.mark === device.known) return device.dirty ? { kind: 'send' } : { kind: 'in-step' };
  if (!device.dirty) return take;
  return account.updatedAt !== null && device.changedAt + skew > account.updatedAt ? { kind: 'send' } : take;
}

// ── The slots on the device ─────────────────────────────────────────────────

/** The slot of a guest's copy, or of an account's. */
export const slotFor = (slot: string, uid: string | null): string => (uid === null ? slot : `${slot}:${uid}`);
/** Where the device remembers whose account was last played on it, so that the page can open with that player's copy at once. */
const lastPlayerSlot = (slot: string): string => `${slot}@account`;

const COPY_VERSION = 1;
/** How many marks of earlier writes a copy remembers. A handful is plenty: one is added when a write is overtaken, not when it is answered. */
const KEPT_MARKS = 8;

/** An account's copy as it is written on the device: the text, and what is known of how it stands with the account. */
function writeCopy(copy: Copy): string {
  const { text, ...rest } = copy;
  return JSON.stringify({ v: COPY_VERSION, ...rest, text });
}

function readCopy(written: string | null): Copy | null {
  if (written === null) return null;
  try {
    const { v, text, changedAt, dirty, known, sent, sentPrint, earlier } = JSON.parse(written) as Record<string, unknown>;
    if (v !== COPY_VERSION || typeof text !== 'string' || typeof changedAt !== 'number' || !Number.isFinite(changedAt) || typeof dirty !== 'boolean') return null;
    const mark = (value: unknown): string | null => (typeof value === 'string' ? value : null);
    // A copy written before earlier marks were kept has none.
    const marks = Array.isArray(earlier) ? earlier.filter((value): value is string => typeof value === 'string').slice(-KEPT_MARKS) : [];
    return { text, changedAt, dirty, known: mark(known), sent: mark(sent), sentPrint: mark(sentPrint), earlier: marks };
  } catch {
    return null;
  }
}

// ── Keeping them in step ────────────────────────────────────────────────────

export function createSync({ kept, store, slots, now, mark, onStatus }: SyncDeps): Sync {
  /** Who the site says is playing. */
  let wanted: Player = GUEST;
  /** Whose slot the copy on the device is written to: an account's, or null for the guest's. */
  let owner: string | null = null;
  /** The account being kept in step with, once the site is sure of it. */
  let account: string | null = null;
  let opened = false;
  let closed = false;

  /** What is known of the device's copy when it is an account's. The text itself is asked for when it is needed. */
  let known: string | null = null;
  let sent: string | null = null;
  let sentPrint: string | null = null;
  let earlier: string[] = [];
  let dirty = false;
  let changedAt = 0;
  let lastPrint: string | null = null;

  /** How far the first read of the account has got. Nothing is written to the account until it is done. */
  let read: 'none' | 'loading' | 'done' | 'failed' | 'held' = 'none';
  /** Raised whenever a read in flight stops mattering: its answer is then ignored. */
  let reading = 0;
  let readFailures = 0;
  let readAgainAt = 0;

  /** A write of this device's that is in the air: sent, and not yet answered. */
  interface Flight {
    since: number;
    /** Whether its answer is waited for however long it takes. One made as the page is left may never be heard of. */
    awaited: boolean;
    /** Whether another write was in the air with it. Which of the two the account took last is then not known. */
    crossed: boolean;
    /** Whether the copy on the table has been replaced since it went: a reset. What it carried is then not what is here. */
    old: boolean;
  }
  const air = new Set<Flight>();
  /** What the copy looked like when it was last sent, unless that write is known to have come to nothing: it is not said twice as the page is left. */
  let said: string | null = null;
  let sentAt = Number.NEGATIVE_INFINITY;
  let sendFailures = 0;
  let sendAgainAt = 0;
  let urgent = false;

  /** A copy to open with next, in place of the device's own: the account's, or a merge. */
  let incoming: { uid: string; text: string; mark: string | null; send: boolean } | null = null;
  let startFresh = false;
  let skew = 0;
  let keptOnDevice = true;
  let told: Status | null = null;

  // Storage can throw from anywhere, so every use of it goes through these.
  const get = (key: string): string | null => {
    try {
      return slots().getItem(key);
    } catch {
      return null;
    }
  };
  const set = (key: string, value: string): boolean => {
    try {
      slots().setItem(key, value);
      return true;
    } catch {
      return false;
    }
  };
  const remove = (key: string): void => {
    try {
      slots().removeItem(key);
    } catch {
      // It stays; the next write goes over it.
    }
  };

  const tell = (): void => {
    const where: Status['where'] =
      account === null ? 'device' : read === 'held' ? 'unreadable' : read === 'failed' || sendFailures > 0 ? 'offline' : read === 'done' ? 'account' : 'checking';
    if (told && told.where === where && told.kept === keptOnDevice) return;
    told = { where, kept: keptOnDevice };
    onStatus(told);
  };

  /** Notes whether the copy has changed since it was last looked at, and when. */
  const look = (text: string): void => {
    const print = kept.print(text);
    if (print === lastPrint) return;
    if (lastPrint !== null) {
      dirty = true;
      changedAt = now();
    }
    lastPrint = print;
  };

  /** Writes the copy to its slot on the device: as it is for a guest, and with what is known of the account's for an account. */
  const write = (text: string): boolean => {
    keptOnDevice = owner === null ? set(slotFor(kept.slot, null), text) : set(slotFor(kept.slot, owner), writeCopy({ text, changedAt, dirty, known, sent, sentPrint, earlier }));
    return keptOnDevice;
  };

  /** Whether the account may be written to: it is this copy's own, it has been read, and nothing is about to replace the copy. */
  const mayWrite = (): boolean => account !== null && owner === account && read === 'done' && incoming === null && !startFresh;

  /** The marks sent before the last, with one more among them: the oldest makes room. */
  const withMark = (marks: string[], stamp: string | null): string[] => (stamp === null ? marks : [...marks.filter((had) => had !== stamp), stamp].slice(-KEPT_MARKS));

  /**
   * Whether anything of this device's is in the air. A write made as the page
   * was left is given up after a minute without an answer: it has landed or
   * been lost by then, and the page may have been asleep when the answer came.
   */
  const flying = (): boolean => {
    const time = now();
    for (const flight of air) if (!flight.awaited && time - flight.since >= SEND_EVERY * 1000) air.delete(flight);
    return air.size > 0;
  };

  /** A write came to nothing: it is tried again after a wait, and a longer one each time. */
  const failed = (): void => {
    sendFailures += 1;
    sendAgainAt = now() + retryAfter(sendFailures);
    tell();
  };

  /**
   * Sends the copy to the account: and waits to hear, or as the page is left,
   * with what is in hand. Its mark is written down on the device before it
   * goes, since the answer may never be heard.
   */
  const send = (how: 'wait' | 'leaving'): void => {
    const who = account;
    if (!store || who === null) return;
    const text = kept.current();
    if (text === null) return;
    const print = kept.print(text);
    const stamp = mark();
    const state = toCloud(text, stamp, changedAt);
    sentAt = now();
    urgent = false;
    if (!state) {
      // Too big even when packed. It is kept on the device, and tried again when the table may have thinned out.
      failed();
      return;
    }
    const before = { sent, sentPrint, earlier };
    earlier = withMark(earlier, sent);
    sent = stamp;
    sentPrint = print;
    write(text);

    let going: Promise<boolean>;
    if (how === 'leaving') {
      const leaving = store.storeNow(who, state);
      if (!leaving) {
        // Nothing was sent: there was no token in hand, or its player is no longer signed in. The mark never left.
        ({ sent, sentPrint, earlier } = before);
        write(text);
        failed();
        return;
      }
      going = leaving;
    } else {
      going = store.store(who, state).then(
        () => true,
        () => false,
      );
    }

    // Anything else of this device's still in the air makes the order they land in unknown, for it and for this one.
    const flight: Flight = { since: now(), awaited: how === 'wait', crossed: flying(), old: false };
    if (flight.crossed) for (const other of air) other.crossed = true;
    air.add(flight);
    said = print;

    void going.then((took) => {
      // What became of a write is only of interest while it is still waited for and the copy is still this account's.
      if (!air.delete(flight) || closed || owner !== who) return;
      try {
        if (!took) {
          // It may have reached the account all the same, so its mark stays written down.
          if (!flight.old && said === print) said = null;
          failed();
          return;
        }
        sendFailures = 0;
        if (flight.crossed) {
          // Which of the two the account took last is not known. The copy goes again, by itself, as soon as it can.
          dirty = true;
          urgent = true;
          sentAt = Number.NEGATIVE_INFINITY;
        } else {
          // It flew alone: this is what the account holds now.
          known = stamp;
          earlier = earlier.filter((had) => had !== stamp);
          if (!flight.old) {
            sent = null;
            sentPrint = null;
            dirty = lastPrint !== print;
          }
          // An old one carried the copy that a reset has since replaced: what is on the table has still to be sent.
        }
        const latest = kept.current();
        if (latest !== null) write(latest);
        tell();
        // Whatever was waiting for the air to clear goes now: a reset's new copy, or the copy once more.
        sendIfDue();
      } catch {
        // Nothing is thrown from an answer. The copy is still marked as unsent, and goes with a later save.
      }
    });
  };

  /** Sends the copy if it has changed, the wait since the last write is over, and nothing of this device's is in the air. */
  const sendIfDue = (): void => {
    const time = now();
    const waited = time - sentAt;
    if (mayWrite() && dirty && !flying() && time >= sendAgainAt && (waited >= SEND_EVERY * 1000 || (urgent && waited >= MOMENT_GAP * 1000))) send('wait');
  };

  /** Does what the rule says once the account's copy has been read. */
  const settle = (found: Awaited<ReturnType<AccountStore['load']>>): void => {
    const uid = account;
    if (uid === null) return;
    const serverNow = found?.serverTime ? Date.parse(found.serverTime) : Number.NaN;
    skew = Number.isFinite(serverNow) ? serverNow - now() : 0;

    const text = kept.current();
    if (text !== null) look(text);
    const got = found ? fromCloud(found.state) : null;
    const updatedAt = found?.updatedAt ? Date.parse(found.updatedAt) : Number.NaN;
    const readable = got !== null && kept.reads(got.text);
    const theirs = readable ? got.mark : null;
    // The account holds a copy this device sent before its last one: an older write that landed last, or one whose
    // copy a reset has replaced. Nobody else has written since, and what is here is the newer. The rule is told so
    // in the words it knows: the account's mark is one this device knows, and the device's copy has changed.
    const overtaken = theirs !== null && theirs !== sent && theirs !== known && earlier.includes(theirs);
    const standing: Standing = {
      account: !found ? { kind: 'none' } : got && readable ? { kind: 'save', text: got.text, mark: got.mark, updatedAt: Number.isFinite(updatedAt) ? updatedAt : null } : { kind: 'unreadable' },
      device:
        owner === uid && text !== null
          ? { text, dirty: dirty || overtaken, known: overtaken ? theirs : known, sent, sentIsLatest: sent !== null && lastPrint === sentPrint, changedAt }
          : null,
      guest: owner === null ? text : null,
      skew,
    };
    const verdict = kept.settle(standing);
    read = verdict.kind === 'hold' ? 'held' : 'done';
    readFailures = 0;
    switch (verdict.kind) {
      case 'hold':
        break;
      case 'in-step':
        known = theirs ?? known;
        sent = null;
        sentPrint = null;
        dirty = false;
        if (text !== null && owner === uid) write(text);
        break;
      case 'send':
        dirty = true;
        urgent = true;
        break;
      case 'adopt': {
        // With nothing on the table there is nothing to adopt, and nothing is touched: the cabinet has been taken
        // down while the account was being read, and the guest's machine is still in its slot for the next visit.
        if (text === null) break;
        // What is on the table is the account's from here on. A guest's machine is moved, not copied, so that it
        // cannot become a second account's as well; and it is moved only once it is safely in the account's slot.
        const wasGuests = owner === null;
        owner = uid;
        known = null;
        sent = null;
        sentPrint = null;
        earlier = [];
        dirty = true;
        changedAt = now();
        urgent = true;
        if (write(text) && wasGuests) remove(slotFor(kept.slot, null));
        break;
      }
      case 'take':
        incoming = { uid, text: verdict.text, mark: verdict.send ? null : theirs, send: verdict.send };
        break;
    }
    tell();
    if (verdict.kind === 'take') kept.reopen();
    else if (mayWrite() && dirty && !flying()) send('wait');
  };

  const startRead = (): void => {
    if (!store || account === null) return;
    read = 'loading';
    const mine = ++reading;
    store.load(account).then(
      (found) => {
        if (closed || mine !== reading) return;
        try {
          settle(found);
        } catch {
          // A rule that throws has decided nothing: the account is left alone, like one that could not be read.
          read = 'held';
          tell();
        }
      },
      () => {
        if (closed || mine !== reading) return;
        read = 'failed';
        readFailures += 1;
        readAgainAt = now() + retryAfter(readFailures);
        tell();
      },
    );
  };

  /** The account this player's copy would be: the one signed in, or the one that played here last while the site finds out. */
  const expectedUid = (player: Player): string | null => player.uid ?? (!player.settled && player.expected ? get(lastPlayerSlot(kept.slot)) : null);

  /** Whose slot the copy on the table would be written to for this player, if it were opened now. */
  const copyOwner = (player: Player): string | null => {
    const uid = expectedUid(player);
    if (uid === null) return null;
    if (uid === owner) return uid;
    // With no copy of that account's here, the guest's machine stays on the table until the account has answered.
    const copy = readCopy(get(slotFor(kept.slot, uid)));
    return copy && kept.reads(copy.text) ? uid : null;
  };

  /** Takes up, or lets go of, the account the site is now sure of. */
  const enter = (): void => {
    if (store && wanted.uid !== null && wanted.uid !== account) {
      account = wanted.uid;
      read = 'none';
      reading += 1;
      readFailures = 0;
      sendFailures = 0;
      sentAt = Number.NEGATIVE_INFINITY;
      urgent = false;
      set(lastPlayerSlot(kept.slot), account);
    }
    if (wanted.settled && wanted.uid === null) remove(lastPlayerSlot(kept.slot));
    if (account !== null && read === 'none') startRead();
  };

  /**
   * Lets go of the account: its player has signed out, or another has signed
   * in. Nothing is sent on the way, not even what is waiting: a request made
   * as a player after they have signed out is not one this site makes. The
   * copy stays in their slot, marked as unsent, for the next time they are here.
   */
  const leave = (): void => {
    if (store && account !== null) store.forget(account);
    account = null;
    read = 'none';
    reading += 1;
    // Whatever is in the air is waited for no longer, and the next player's copy does not wait behind it: its mark
    // is written down, and the next visit as this player can tell by it.
    air.clear();
    said = null;
    readFailures = 0;
    sendFailures = 0;
  };

  return {
    player(next) {
      wanted = store ? next : GUEST;
      if (!opened || closed) return;
      if (account !== null && wanted.uid !== account && (wanted.settled || wanted.uid !== null)) {
        // Signing out, or another player signing in. What is on the table is written down on the device, in its
        // own slot and with whether the account has had it, and that is all: it is not sent now.
        const text = kept.current();
        if (text !== null) {
          look(text);
          write(text);
        }
        leave();
      }
      if (copyOwner(wanted) !== owner) kept.reopen();
      else enter();
      tell();
    },

    open() {
      opened = true;
      // Whatever was on its way for another player is not for this one.
      if (incoming && incoming.uid !== wanted.uid) incoming = null;
      if (account !== null && wanted.uid !== account && (wanted.settled || wanted.uid !== null)) leave();

      let text: string | null = null;
      if (incoming && !startFresh) {
        // The marks of what this device has sent stay with the account's copy; another account's has none of them.
        earlier = owner === incoming.uid ? withMark(earlier, sent) : [];
        for (const flight of air) flight.old = true;
        said = null;
        owner = incoming.uid;
        text = incoming.text;
        known = incoming.mark;
        sent = null;
        sentPrint = null;
        dirty = incoming.send;
        changedAt = now();
        urgent = incoming.send;
        incoming = null;
        write(text);
      } else if (startFresh) {
        // A reset. The new one is the account's when there is an account, whatever the account holds: the player has said so.
        const sameCopy = wanted.uid === null || wanted.uid === owner;
        if (wanted.uid !== null) owner = wanted.uid;
        remove(slotFor(kept.slot, owner));
        // The old machine may still be on its way to the account, or have been sent and never heard of. Its mark is
        // kept, so that it is known for the old one wherever it turns up, and its answer settles nothing here.
        earlier = sameCopy ? withMark(earlier, sent) : [];
        for (const flight of air) flight.old = true;
        said = null;
        sent = null;
        sentPrint = null;
        dirty = true;
        changedAt = now();
        // It goes to the account with the first save, however lately the old one was sent: at once if nothing is in
        // the air, and otherwise as soon as what is in the air has been answered, so that it is the last to land.
        urgent = true;
        sentAt = Number.NEGATIVE_INFINITY;
        incoming = null;
        if (wanted.uid !== null) {
          account = wanted.uid;
          set(lastPlayerSlot(kept.slot), account);
          reading += 1;
          read = 'done';
          readFailures = 0;
        }
      } else {
        const uid = expectedUid(wanted);
        const copy = uid === null ? null : readCopy(get(slotFor(kept.slot, uid)));
        if (uid !== null && copy && kept.reads(copy.text)) {
          owner = uid;
          ({ text, changedAt, dirty, known, sent, sentPrint, earlier } = copy);
        } else {
          // No copy of that account's on this device: the guest's stays on the table, as the guest's, until the account has answered.
          owner = null;
          text = get(slotFor(kept.slot, null));
          known = null;
          sent = null;
          sentPrint = null;
          earlier = [];
          dirty = false;
          changedAt = now();
        }
      }
      startFresh = false;
      lastPrint = text === null ? null : kept.print(text);
      enter();
      tell();
      return text;
    },

    save(why) {
      if (!opened || closed) return keptOnDevice;
      // A copy that is about to be thrown away or replaced is not worth writing anywhere.
      if (startFresh) return keptOnDevice;
      const text = kept.current();
      if (text !== null) {
        look(text);
        write(text);
      }
      if (store && account !== null && incoming === null) {
        void store.prepare(account);
        if (why === 'moment') urgent = true;
        if (why === 'hidden' || why === 'left') {
          // Once for each state of the books: a page that is hidden and then left has only one thing to say. It does
          // not wait for a write that is in the air, since the page may be gone before that is answered; but what
          // has been sent already is not said twice, and after a failure nothing is sent until the wait is over.
          if (mayWrite() && dirty && lastPrint !== said && now() >= sendAgainAt) send('leaving');
        } else {
          if (read === 'failed' && now() >= readAgainAt) startRead();
          sendIfDue();
        }
      }
      tell();
      return keptOnDevice;
    },

    fresh() {
      startFresh = true;
      incoming = null;
      // Whatever the account was about to answer is no longer the question.
      reading += 1;
    },

    close() {
      closed = true;
    },
  };
}
