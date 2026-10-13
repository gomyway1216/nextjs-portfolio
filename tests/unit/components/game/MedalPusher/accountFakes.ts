import { fromCloud, toCloud, type AccountStore, type Player, type Slots } from '@/components/game/MedalPusher/account';

// The fakes the tests of everything kept on an account run on: a storage that is a map, and an account that is
// another map behind promises. Nothing is fetched and no real account is named. They are shared by the tests of
// the keeper itself (account.test.ts) and of each document it keeps.

export class FakeSlots implements Slots {
  map = new Map<string, string>();
  /** Storage that is blocked: every call throws. */
  blocked = false;
  /** Storage that is full: nothing more can be written, and what is there can be read and removed. */
  full = false;
  getItem(key: string): string | null {
    if (this.blocked) throw new Error('blocked');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.blocked || this.full) throw new Error(this.full ? 'full' : 'blocked');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.blocked) throw new Error('blocked');
    this.map.delete(key);
  }
}

/** The account's side: one document for each account, a clock of its own, and a way to be down. */
export class FakeAccounts {
  docs = new Map<string, { state: unknown; updatedAt: number }>();
  calls: string[] = [];
  /** The account cannot be reached: reads and writes fail. */
  down = false;
  /** The server's clock less the device's. */
  ahead = 0;
  /** The accounts a token is in hand for, and the ones whose token it has been told to let go of. */
  ready = new Set<string>();
  forgotten: string[] = [];
  /**
   * Writes that have been sent and not yet answered, when the test wants to answer them itself: as taken, as
   * refused, or as taken with the answer lost on its way back. One can also be made to land first and be answered
   * later, with another call.
   */
  held: ((how?: 'taken' | 'refused' | 'answer lost' | 'lands') => void)[] | null = null;
  /** The same for reads: each waits here to be answered. */
  heldReads: (() => void)[] | null = null;
  /** A write made as the page is left is sent and never heard of again. */
  silent = false;

  constructor(private readonly device: () => number) {}

  time(): number {
    return this.device() + this.ahead;
  }
  /** Puts a copy on an account as another device would have. */
  put(uid: string, text: string, mark: string, at = this.time()): void {
    this.docs.set(uid, { state: toCloud(text, mark, at), updatedAt: at });
  }
  /** The text of an account's copy. */
  text(uid: string): string | null {
    const found = this.docs.get(uid);
    return found ? (fromCloud(found.state)?.text ?? null) : null;
  }
  count(kind: 'load' | 'store' | 'storeNow' | 'prepare'): number {
    return this.calls.filter((call) => call.split(' ')[0] === kind).length;
  }

  store: AccountStore = {
    load: async (uid) => {
      this.calls.push(`load ${uid}`);
      if (this.heldReads) {
        const waiting = this.heldReads;
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      if (this.down) throw new Error('unreachable');
      const found = this.docs.get(uid);
      return found ? { state: JSON.parse(JSON.stringify(found.state)) as unknown, updatedAt: new Date(found.updatedAt).toISOString(), serverTime: new Date(this.time()).toISOString() } : null;
    },
    store: (uid, state) => {
      this.calls.push(`store ${uid}`);
      const write = (): void => {
        this.docs.set(uid, { state: JSON.parse(JSON.stringify(state)) as unknown, updatedAt: this.time() });
      };
      if (this.held) {
        const held = this.held;
        let landed = false;
        return new Promise<void>((resolve, reject) => {
          held.push((how = 'taken') => {
            if (how !== 'refused' && !landed) write();
            landed = true;
            if (how === 'lands') return;
            if (how === 'taken') resolve();
            else reject(new Error(how));
          });
        });
      }
      if (this.down) return Promise.reject(new Error('unreachable'));
      write();
      return Promise.resolve();
    },
    prepare: async (uid) => {
      this.calls.push(`prepare ${uid}`);
      if (!this.down) this.ready.add(uid);
    },
    forget: (uid) => {
      this.forgotten.push(uid);
      this.ready.delete(uid);
    },
    storeNow: (uid, state) => {
      if (!this.ready.has(uid)) return null;
      this.calls.push(`storeNow ${uid}`);
      if (this.silent) return new Promise<boolean>(() => undefined);
      if (this.down) return Promise.resolve(false);
      this.docs.set(uid, { state: JSON.parse(JSON.stringify(state)) as unknown, updatedAt: this.time() });
      return Promise.resolve(true);
    },
  };
}

/** Lets everything that has been promised happen. */
export const settled = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

export const signedIn = (uid: string): Player => ({ uid, settled: true, expected: true });
/** The site still restoring a session it expects: nobody yet, and somebody expected. */
export const RESTORING: Player = { uid: null, settled: false, expected: true };
