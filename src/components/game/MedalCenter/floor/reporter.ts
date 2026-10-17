/**
 * The one way a machine tells the medal floor about its wins: `floorReport`.
 *
 *   floorReport('slot-machine', { won: 3000, prize: { medals: 3000, label: 'seven3' } });   // a round's payout
 *   floorReport('medal-pusher', { won: 4 });                                                // medals into the tray
 *   floorReport('medal-pusher', { prize: { medals: 523, label: 'jackpot' } });              // a prize, before its medals land
 *
 * `won` is medals paid back to the player (they count toward "medals won");
 * `prize` is one win, for the biggest-win boards and, when it is big enough,
 * for the floor's feed. A machine calls it where it pays, and nothing else.
 *
 * Nothing is sent unless the player is signed in with an account (not as a
 * guest) and has joined the floor, which they do on the medal center's front:
 * by default nobody is on it. Until then the wins are dropped where they are.
 * Small wins are added up and sent about once a minute; a big one at once (no
 * oftener than every few seconds a machine); whatever is left when the page is
 * hidden or closed, with the page's last token.
 */

import { FLOOR_RULES, feedWorthy, isFloorGame, labelPays, type FloorGame } from '@/lib/medalFloor/games';
import { FLOOR_API } from './api';

export interface FloorWin {
  won?: number;
  prize?: { medals: number; label?: string };
}

/** A signed-in account, as the reporter sees it: its id, and a way to get one of its tokens. */
export interface FloorAccount {
  uid: string;
  token(): Promise<string>;
}

export interface ReporterDeps {
  /** Who is signed in with an account right now (null for nobody, or a guest), asked without waiting. */
  account(): FloorAccount | null;
  fetch: typeof fetch;
  now(): number;
  later(run: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  /** What this device last heard of an account's place on the floor. */
  remembered?(uid: string): boolean | null;
  /** Keeps what this page found out, so that the next page need not ask. */
  remember?(uid: string, joined: boolean): void;
}

/** Small wins are sent this often. */
export const FLUSH_MS = 60_000;
/** A big win is sent at once, but not sooner than this after the machine's last report. */
export const QUICKEST_MS = 5_000;
/** After a failed check of the player's place, it is not asked again for this long. */
const RECHECK_MS = 60_000;

type Moment = { medals: number; label?: string };
interface Pending {
  won: number;
  best: number;
  moment: Moment | null;
}

const empty = (): Pending => ({ won: 0, best: 0, moment: null });
const weight = (game: FloorGame, moment: Moment): number => (feedWorthy(game, moment.medals, moment.label) ? 1e9 : 0) + moment.medals;
const better = (game: FloorGame, a: Moment | null, b: Moment | null): Moment | null => (!a ? b : !b ? a : weight(game, b) > weight(game, a) ? b : a);

export function createFloorReporter(deps: ReporterDeps) {
  let owner: string | null = null;
  let place: 'unknown' | 'checking' | 'joined' | 'out' = 'unknown';
  let checkedAt = -Infinity;
  const pending = new Map<FloorGame, Pending>();
  const lastSent = new Map<FloorGame, number>();
  const timers = new Map<FloorGame | 'all', unknown>();
  let inHand: { uid: string; token: string } | null = null;

  const forget = () => {
    pending.clear();
    for (const handle of timers.values()) deps.cancel(handle);
    timers.clear();
  };

  /** Starts over for a different account (or nobody): what was waiting was somebody else's. */
  const meet = (uid: string | null) => {
    if (uid === owner) return;
    forget();
    owner = uid;
    inHand = null;
    const known = uid ? (deps.remembered?.(uid) ?? null) : null;
    place = known === null ? 'unknown' : known ? 'joined' : 'out';
    checkedAt = -Infinity;
  };

  const putBack = (game: FloorGame, sent: Pending) => {
    const now = pending.get(game) ?? empty();
    pending.set(game, {
      won: Math.min(FLOOR_RULES[game].burst, now.won + sent.won),
      best: Math.max(now.best, sent.best),
      moment: better(game, now.moment, sent.moment),
    });
  };

  const take = (game: FloorGame): Pending | null => {
    const waiting = pending.get(game);
    if (!waiting || (waiting.won === 0 && waiting.best === 0 && !waiting.moment)) return null;
    const won = Math.min(waiting.won, FLOOR_RULES[game].burst);
    const sent: Pending = { won, best: waiting.best, moment: waiting.moment };
    const left = waiting.won - won;
    if (left > 0) pending.set(game, { won: left, best: 0, moment: null });
    else pending.delete(game);
    return sent;
  };

  const bodyOf = (game: FloorGame, sent: Pending): string => {
    const body: Record<string, unknown> = { game, won: sent.won };
    if (sent.best > 0) body.best = sent.best;
    if (sent.moment) body.moment = sent.moment;
    return JSON.stringify(body);
  };

  /** Sends what one machine has waiting, as the account it was won by. */
  async function send(game: FloorGame): Promise<void> {
    const account = deps.account();
    if (!account || account.uid !== owner || place !== 'joined') return;
    const sent = take(game);
    if (!sent) return;
    lastSent.set(game, deps.now());
    let status = 0;
    try {
      const token = await account.token();
      // Signed out, or somebody else, while the token was on its way: none of it is theirs to send.
      if (deps.account()?.uid !== account.uid) return;
      inHand = { uid: account.uid, token };
      const response = await deps.fetch(`${FLOOR_API}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: bodyOf(game, sent) });
      status = response.status;
    } catch {
      status = 0;
    }
    if (owner !== account.uid) return;
    if (status === 403) {
      // Not on the floor (left on another tab or device), or taken off it: nothing more is sent.
      place = 'out';
      forget();
    } else if (status === 0 || status === 429 || status >= 500) {
      putBack(game, sent);
      wait('all', FLUSH_MS);
    }
    // 200 is done; 400 or 401 is not tried again.
  }

  const sendAll = () => {
    for (const game of [...pending.keys()]) void send(game);
  };

  function wait(key: FloorGame | 'all', ms: number) {
    if (timers.has(key)) return;
    timers.set(
      key,
      deps.later(() => {
        timers.delete(key);
        if (key === 'all') sendAll();
        else void send(key);
      }, ms),
    );
  }

  /** Finds out whether the player is on the floor, once, and then sends or drops what is waiting. */
  async function check(account: FloorAccount): Promise<void> {
    place = 'checking';
    checkedAt = deps.now();
    let joined: boolean | null = null;
    try {
      const token = await account.token();
      const response = await deps.fetch(`${FLOOR_API}/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (response.ok) joined = ((await response.json()) as { joined?: unknown }).joined === true;
      else if (response.status === 403 || response.status === 401) joined = false;
    } catch {
      joined = null;
    }
    if (owner !== account.uid) return;
    if (joined === null) {
      // Could not be asked: what is waiting stays, and is sent once it is known.
      place = 'unknown';
      return;
    }
    deps.remember?.(account.uid, joined);
    place = joined ? 'joined' : 'out';
    // On the floor: a big win waiting goes now, small ones with the minute's.
    if (joined) wait('all', [...pending.values()].some((waiting) => waiting.moment) ? 0 : FLUSH_MS);
    else forget();
  }

  return {
    report(game: string, win: FloorWin): void {
      if (!isFloorGame(game)) return;
      const account = deps.account();
      meet(account?.uid ?? null);
      if (!account || place === 'out') return;
      const rule = FLOOR_RULES[game];
      const won = typeof win.won === 'number' && Number.isFinite(win.won) ? Math.max(0, Math.floor(win.won)) : 0;
      let moment: Moment | null = null;
      if (win.prize && Number.isSafeInteger(win.prize.medals) && win.prize.medals >= 1 && win.prize.medals <= rule.most) {
        // A name the floor does not know the amount for is left off; the win itself still counts.
        moment = win.prize.label && labelPays(game, win.prize.label, win.prize.medals) ? { medals: win.prize.medals, label: win.prize.label } : { medals: win.prize.medals };
      }
      if (won === 0 && !moment) return;
      const waiting = pending.get(game) ?? empty();
      pending.set(game, {
        won: Math.min(rule.burst, waiting.won + won),
        best: Math.max(waiting.best, moment?.medals ?? 0),
        moment: moment && feedWorthy(game, moment.medals, moment.label) ? better(game, waiting.moment, moment) : waiting.moment,
      });
      if (place === 'unknown' && deps.now() - checkedAt >= RECHECK_MS) {
        void check(account);
        return;
      }
      if (place !== 'joined') return;
      const now = deps.now();
      if (pending.get(game)?.moment) {
        const since = now - (lastSent.get(game) ?? -Infinity);
        if (since >= QUICKEST_MS) void send(game);
        else wait(game, QUICKEST_MS - since);
      } else if ((pending.get(game)?.won ?? 0) >= rule.burst / 2) void send(game);
      else wait('all', FLUSH_MS);
    },

    /** What this page has been told of the player's place: by the medal center when they join or leave, or by another tab. */
    told(uid: string, joined: boolean): void {
      if (owner !== uid) meet(uid);
      place = joined ? 'joined' : 'out';
      if (joined) wait('all', 0);
      else forget();
    },

    /**
     * Sends what is waiting as the page is hidden or closed, with the token this
     * page last had for the player, so nothing is waited for. Only while that
     * player is still the one signed in.
     */
    leaving(): void {
      const account = deps.account();
      if (!account || account.uid !== owner || place !== 'joined' || inHand?.uid !== account.uid) return;
      for (const game of [...pending.keys()]) {
        const sent = take(game);
        if (!sent) continue;
        try {
          void deps
            .fetch(`${FLOOR_API}/report`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${inHand.token}` }, body: bodyOf(game, sent), keepalive: true })
            .catch(() => undefined);
        } catch {
          // The page is going: what could not be sent is not counted.
        }
      }
    },

    /** For tests: what is waiting for one machine. */
    waiting(game: FloorGame): Pending | null {
      return pending.get(game) ?? null;
    },
  };
}

export type FloorReporter = ReturnType<typeof createFloorReporter>;

// ── The page's own reporter ──────────────────────────────────────────────────

/** Where this device keeps what it last heard of the signed-in player's place on the floor, so that a game page need not ask. */
export const PLACE_KEY = 'medal-floor:place';
/** What is remembered is trusted for this long; after that the page asks again. */
const PLACE_FRESH_MS = 60 * 60_000;

type AuthModule = typeof import('@/lib/firebaseConnect');
let authModule: AuthModule | null = null;
let page: FloorReporter | null = null;

function remembered(uid: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(PLACE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { uid?: unknown; joined?: unknown; at?: unknown };
    if (value.uid !== uid || typeof value.joined !== 'boolean' || typeof value.at !== 'number' || Date.now() - value.at > PLACE_FRESH_MS) return null;
    return value.joined;
  } catch {
    return null;
  }
}

function remember(uid: string, joined: boolean): void {
  try {
    window.localStorage.setItem(PLACE_KEY, JSON.stringify({ uid, joined, at: Date.now() }));
  } catch {
    // Not kept: the next page asks for itself.
  }
}

function pageReporter(): FloorReporter | null {
  if (typeof window === 'undefined') return null;
  if (page) return page;
  // Firebase's own module, which the site has loaded already: who is signed in is read from it without waiting.
  void import('@/lib/firebaseConnect').then((module) => {
    authModule = module;
  });
  page = createFloorReporter({
    account: () => {
      const user = authModule?.auth.currentUser;
      return user && !user.isAnonymous ? { uid: user.uid, token: () => user.getIdToken() } : null;
    },
    fetch: (...args) => window.fetch(...args),
    now: () => Date.now(),
    later: (run, ms) => window.setTimeout(run, ms),
    cancel: (handle) => window.clearTimeout(handle as number),
    remembered,
    remember,
  });
  const reporter = page;
  window.addEventListener('pagehide', () => reporter.leaving());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') reporter.leaving();
  });
  window.addEventListener('storage', (event) => {
    if (event.key !== PLACE_KEY || !event.newValue) return;
    try {
      const value = JSON.parse(event.newValue) as { uid?: unknown; joined?: unknown };
      if (typeof value.uid === 'string' && typeof value.joined === 'boolean') reporter.told(value.uid, value.joined);
    } catch {
      // Not ours to read.
    }
  });
  return page;
}

/** Tells the floor about a machine's win. Does nothing for a guest, or a player who has not joined the floor. */
export function floorReport(game: FloorGame, win: FloorWin): void {
  try {
    pageReporter()?.report(game, win);
  } catch {
    // The floor is for fun: nothing about it may ever stop a machine paying.
  }
}

/** Says, on this page and every other tab of this device, where the signed-in player stands on the floor. */
export function announceFloorPlace(uid: string, joined: boolean): void {
  remember(uid, joined);
  pageReporter()?.told(uid, joined);
}
