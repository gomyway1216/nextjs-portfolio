import { createBank, type Bank, type BankEnv, type BankMessage, type Watchers } from '@/components/game/MedalCenter/bank';

// A browser for the bank's tests: one storage that every page shares, the one card (a lock that is given to the
// pages in the order they asked), a channel between the pages, and storage events. What a browser does later
// (the lock being given, a message arriving, another tab hearing of a write) waits in `tasks` until the test lets
// it happen, in order, with `run`. Nothing is fetched and no real account is named.

let names = 0;

export class FakeBrowser {
  storage = new Map<string, string>();
  /** Storage that is blocked: every call throws. */
  blocked = false;
  /** Whether this browser has Web Locks. */
  apart = true;
  pages: FakePage[] = [];
  holder: FakePage | null = null;
  queue: { page: FakePage; granted: (release: () => void) => void }[] = [];
  tasks: (() => void)[] = [];
  day = '2026-10-14';
  clock = 1_800_000_000_000;
  /**
   * How many more writes reach storage before the browser dies, or null while it lives on. Every write and every
   * removal counts one, the bank's and a machine's alike. Once none are left the browser has died between two writes:
   * nothing more reaches storage, and nothing on its pages is told, as when the browser's process is killed. What it
   * left is opened again with `revive`.
   */
  writesLeft: number | null = null;
  /** The writes and removals that have reached storage. */
  writes = 0;

  /** Whether one more write reaches storage: it is counted, and once the browser has died it does not. */
  lets(): boolean {
    if (this.writesLeft !== null) {
      if (this.writesLeft <= 0) return false;
      this.writesLeft -= 1;
    }
    this.writes += 1;
    return true;
  }

  /** Whether the browser has died (`writesLeft`). */
  get dead(): boolean {
    return this.writesLeft !== null && this.writesLeft <= 0;
  }

  /** The browser started again after it died: its storage as it was left, and nothing else (no page, no lock, no message). */
  revive(): FakeBrowser {
    const next = new FakeBrowser();
    next.storage = new Map(this.storage);
    next.apart = this.apart;
    next.day = this.day;
    next.clock = this.clock;
    return next;
  }
  /** A name no other device, page or mark has, in any browser of the test: names are random in a real one. */
  name(prefix: string): string {
    names += 1;
    return `${prefix}${String(names).padStart(5, '0')}`;
  }

  /** Opens a page with a bank of its own on it. */
  open(): FakePage {
    const page = new FakePage(this);
    this.pages.push(page);
    return page;
  }

  /** Lets everything the browser had waiting happen, in order. */
  run(): void {
    for (let guard = 0; this.tasks.length > 0; guard++) {
      if (guard > 10_000) throw new Error('the browser never settles');
      this.tasks.shift()!();
    }
  }

  /** Gives the card to the page that asked for it, and to the next when that one lets it go. */
  give2(next: { page: FakePage; granted: (release: () => void) => void }): void {
    if (next.page.closed) {
      const after = this.queue.shift();
      if (after) this.give2(after);
      return;
    }
    this.holder = next.page;
    let released = false;
    next.granted(() => {
      if (released || this.holder !== next.page) return;
      released = true;
      this.holder = null;
      const after = this.queue.shift();
      if (after) this.tasks.push(() => this.give2(after));
    });
  }
}

export class FakePage {
  visible = true;
  closed = false;
  /**
   * How many of the browser's tasks a lock request of this page takes to reach the lock manager. A real browser
   * handles a request in parallel, so it can arrive after a message the page posted after making it.
   */
  lockLag = 0;
  watchers: Watchers | null = null;
  readonly name: string;
  readonly bank: Bank;
  readonly env: BankEnv;

  constructor(readonly browser: FakeBrowser) {
    this.name = browser.name('page');
    this.env = {
      read: (key) => {
        if (browser.blocked) throw new Error('blocked');
        return browser.storage.get(key) ?? null;
      },
      write: (key, text) => {
        if (browser.blocked) throw new Error('blocked');
        if (!browser.lets()) return;
        const was = browser.storage.get(key);
        browser.storage.set(key, text);
        if (was !== text) this.tellOthers((other) => other.watchers?.changed(key));
      },
      remove: (key) => {
        if (browser.blocked) throw new Error('blocked');
        if (!browser.lets()) return;
        const had = browser.storage.delete(key);
        if (had) this.tellOthers((other) => other.watchers?.changed(key));
      },
      today: () => browser.day,
      device: () => browser.name('device'),
      now: () => browser.clock,
      mark: () => browser.name('mark'),
      visible: () => this.visible,
      watch: (watchers) => {
        this.watchers = watchers;
        return () => {
          if (this.watchers === watchers) this.watchers = null;
        };
      },
      post: (message: BankMessage) => this.tellOthers((other) => other.watchers?.heard(message)),
      card: {
        get apart() {
          return browser.apart;
        },
        ask: (granted) => {
          if (!browser.apart) {
            granted(() => undefined);
            return () => undefined;
          }
          const request = { page: this as FakePage, granted };
          let withdrawn = false;
          const arrive = () => {
            if (withdrawn || this.closed) return;
            if (browser.holder === null && browser.queue.length === 0) {
              browser.holder = this;
              browser.tasks.push(() => {
                browser.holder = null;
                browser.give2(request);
              });
            } else {
              browser.queue.push(request);
            }
          };
          const after = (lag: number): void => {
            if (lag <= 0) arrive();
            else browser.tasks.push(() => after(lag - 1));
          };
          after(this.lockLag);
          return () => {
            withdrawn = true;
            const at = browser.queue.indexOf(request);
            if (at >= 0) browser.queue.splice(at, 1);
          };
        },
      },
      page: this.name,
    };
    this.bank = createBank(this.env);
  }

  /** Something every other open page hears of, a moment later. */
  tellOthers(what: (other: FakePage) => void): void {
    for (const other of this.browser.pages) if (other !== this && !other.closed) this.browser.tasks.push(() => what(other));
  }

  hide(why: 'hidden' | 'left' = 'hidden'): void {
    this.visible = false;
    this.watchers?.hidden(why);
  }

  show(): void {
    this.visible = true;
    this.watchers?.shown();
  }

  /** The page is closed: whatever it held is let go, as a browser lets go of a closed page's locks. */
  close(): void {
    this.hide('left');
    this.closed = true;
    if (this.browser.holder === this) {
      this.browser.holder = null;
      const next = this.browser.queue.shift();
      if (next) this.browser.tasks.push(() => this.browser.give2(next));
    }
    this.browser.queue = this.browser.queue.filter((request) => request.page !== this);
  }
}

/** Lets everything promised and everything the browser has waiting happen, until nothing more does. */
export async function quiet(...browsers: FakeBrowser[]): Promise<void> {
  for (let round = 0; round < 30; round++) {
    for (const browser of browsers) browser.run();
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }
  for (const browser of browsers) browser.run();
}

/**
 * Plays `play` in a browser made by `setUp`, once through to count its writes, and then once for every moment the
 * browser could die in it: before its first write, between each two, and after its last. Each time `check` is handed
 * what the browser left, started again (`revive`), and how many of the writes reached storage. `play` must make the
 * same writes each time.
 */
export async function atEveryWrite(
  setUp: () => Promise<FakeBrowser>,
  play: (browser: FakeBrowser) => Promise<void> | void,
  check: (revived: FakeBrowser, reached: number, writes: number) => Promise<void> | void,
): Promise<number> {
  const counting = await setUp();
  const from = counting.writes;
  await play(counting);
  const writes = counting.writes - from;
  for (let reached = 0; reached <= writes; reached++) {
    const browser = await setUp();
    browser.writesLeft = reached;
    await play(browser);
    await check(browser.revive(), reached, writes);
  }
  return writes;
}
