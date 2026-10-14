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
        const was = browser.storage.get(key);
        browser.storage.set(key, text);
        if (was !== text) this.tellOthers((other) => other.watchers?.changed(key));
      },
      remove: (key) => {
        if (browser.blocked) throw new Error('blocked');
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
          if (browser.holder === null && browser.queue.length === 0) {
            browser.holder = this;
            browser.tasks.push(() => {
              browser.holder = null;
              browser.give2(request);
            });
          } else {
            browser.queue.push(request);
          }
          return () => {
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
