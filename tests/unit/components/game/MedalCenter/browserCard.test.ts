import { describe, expect, it } from 'vitest';

import { CARD_HANDED_KEY, CARD_HANDED_WAIT_MS, CARD_LOCK, createBrowserCard, type BrowserCardDeps } from '@/components/game/MedalCenter/bank';

// The card as a browser's pages pass it, with what a real browser does that the bank's other tests leave out: each tab
// has its own view of storage, and another tab's writes reach it later, when the test says (`deliver`), as Firefox and
// WebKit hand them over. The lock manager gives the lock in the order it was asked for.

interface Request {
  page: string;
  callback: () => unknown;
  signal?: AbortSignal;
}

class Browser {
  holder: string | null = null;
  queue: Request[] = [];
  /** What each tab asked the lock manager for, in order: the card if it is free, or a place in line for it. */
  requests: string[] = [];
  /** What each tab's storage holds as that tab sees it. */
  views = new Map<string, Map<string, string>>();
  /** Writes on their way to the other tabs. */
  inFlight: { from: string; key: string; value: string }[] = [];
  listeners = new Map<string, ((key: string | null) => void)[]>();
  tasks: (() => void)[] = [];
  timers: { at: number; run: () => void; on: boolean }[] = [];
  clock = 0;
  marks = 0;

  locks(page: string): BrowserCardDeps['locks'] {
    return {
      request: ((name: string, options: { signal?: AbortSignal; ifAvailable?: boolean }, callback: (lock: unknown) => unknown) => {
        expect(name).toBe(CARD_LOCK);
        if (options.ifAvailable) {
          expect(options.signal).toBeUndefined();
          // Given at once if nobody holds it or waits for it; answered with nothing otherwise.
          if (this.holder === null && this.queue.length === 0) {
            this.requests.push(`${page} free`);
            this.holder = page;
            return Promise.resolve(callback({ name })).finally(() => {
              this.holder = null;
              this.pump();
            });
          }
          this.requests.push(`${page} taken`);
          return Promise.resolve(callback(null));
        }
        this.requests.push(`${page} waits`);
        return new Promise((resolve, reject) => {
          const request: Request = { page, signal: options.signal, callback: () => Promise.resolve(callback({ name })).then(resolve, reject) };
          options.signal?.addEventListener('abort', () => {
            this.queue = this.queue.filter((r) => r !== request);
            reject(new DOMException('aborted', 'AbortError'));
          });
          this.queue.push(request);
          queueMicrotask(() => this.pump());
        });
      }) as unknown as LockManager['request'],
      query: (() => Promise.resolve({ held: this.holder ? [{ name: CARD_LOCK, mode: 'exclusive' as const }] : [], pending: [] })) as LockManager['query'],
    };
  }

  /** Gives the lock to the next tab that asked, once nobody holds it. */
  pump(): void {
    if (this.holder !== null || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.holder = next.page;
    void (next.callback() as Promise<unknown>).finally(() => {
      this.holder = null;
      this.pump();
    });
  }

  view(page: string): Map<string, string> {
    if (!this.views.has(page)) this.views.set(page, new Map());
    return this.views.get(page)!;
  }

  /** Another tab's writes reach the others now, each told of them as storage tells a tab. */
  deliver(): void {
    const writes = this.inFlight;
    this.inFlight = [];
    for (const { from, key, value } of writes) {
      for (const [page, view] of this.views) {
        if (page === from) continue;
        view.set(key, value);
        for (const listener of this.listeners.get(page) ?? []) listener(key);
      }
    }
  }

  /** The tasks the pages have put off, in order. */
  runTasks(): void {
    const tasks = this.tasks;
    this.tasks = [];
    for (const task of tasks) task();
  }

  advance(ms: number): void {
    this.clock += ms;
    for (const timer of [...this.timers]) {
      if (timer.on && timer.at <= this.clock) {
        timer.on = false;
        timer.run();
      }
    }
  }

  page(page: string, { leaving = () => false }: { leaving?: () => boolean } = {}) {
    this.view(page);
    return createBrowserCard({
      locks: this.locks(page),
      read: (key) => this.view(page).get(key) ?? null,
      write: (key, value) => {
        this.view(page).set(key, value);
        this.inFlight.push({ from: page, key, value });
      },
      onStorage: (listener) => {
        this.listeners.set(page, [...(this.listeners.get(page) ?? []), listener]);
        return () => this.listeners.set(page, (this.listeners.get(page) ?? []).filter((l) => l !== listener));
      },
      nextTask: (run) => this.tasks.push(run),
      later: (run, ms) => {
        const timer = { at: this.clock + ms, run, on: true };
        this.timers.push(timer);
        return () => (timer.on = false);
      },
      mark: () => `${page}-${++this.marks}`,
      leaving,
    });
  }
}

/** Lets the promises the lock manager and the cards are waiting on settle. */
const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

/** Asks for the card on a page, noting when it is given and what gives it back. */
function asks(card: ReturnType<Browser['page']>) {
  const got: { release: (() => void) | null } = { release: null };
  card.ask((release) => (got.release = release));
  return got;
}

describe('the card in a browser', () => {
  it('is given to a tab that asked while another held it only once that tab can read what the other wrote', async () => {
    const browser = new Browser();
    const a = asks(browser.page('a'));
    await settle();
    expect(a.release).not.toBeNull();
    const b = asks(browser.page('b'));
    await settle();
    // A writes down its machine and its bank with the card, and lets it go.
    browser.view('a').set('bank', '2');
    browser.inFlight.push({ from: 'a', key: 'bank', value: '2' });
    a.release!();
    // It lets go a task later, its mark written last of all.
    expect(browser.view('a').get(CARD_HANDED_KEY)).toBe('a-1');
    expect(browser.inFlight.map((w) => w.key)).toEqual(['bank', CARD_HANDED_KEY]);
    expect(browser.holder).toBe('a');
    browser.runTasks();
    await settle();
    // The lock is B's, but its storage has not had A's writes yet: the card is not given.
    expect(browser.holder).toBe('b');
    expect(b.release).toBeNull();
    browser.deliver();
    await settle();
    expect(b.release).not.toBeNull();
    expect(browser.view('b').get('bank')).toBe('2');
  });

  it('is given after a while to a tab that waits for a mark that never comes: the tab that held it died', async () => {
    const browser = new Browser();
    const a = asks(browser.page('a'));
    await settle();
    expect(a.release).not.toBeNull();
    const b = asks(browser.page('b'));
    await settle();
    // A's process is killed: the browser takes the lock back, and A wrote no mark.
    browser.holder = null;
    browser.pump();
    await settle();
    expect(browser.holder).toBe('b');
    browser.advance(CARD_HANDED_WAIT_MS - 1);
    await settle();
    expect(b.release).toBeNull();
    browser.advance(1);
    await settle();
    expect(b.release).not.toBeNull();
  });

  it('is given at once where nobody holds it, and to a tab that asks again while its own card is on its way out', async () => {
    const browser = new Browser();
    const page = browser.page('a');
    const first = asks(page);
    await settle();
    expect(first.release).not.toBeNull();
    // Free, it was taken by the first request: the tab never got in line for it.
    expect(browser.requests).toEqual(['a free']);
    // Let go, and asked for again before the task that lets go has run: the card being waited on is this tab's own.
    first.release!();
    const again = asks(page);
    await settle();
    expect(browser.requests).toEqual(['a free', 'a taken', 'a waits']);
    browser.runTasks();
    await settle();
    expect(again.release).not.toBeNull();
  });

  it('says it is in line only once the request that waits has been made', async () => {
    const browser = new Browser();
    asks(browser.page('a'));
    await settle();
    const card = browser.page('b');
    card.ask(() => undefined);
    let answered = false;
    void card.queued?.().then(() => (answered = true));
    await settle();
    expect(answered).toBe(true);
    expect(browser.requests).toEqual(['a free', 'b taken', 'b waits']);
    expect(browser.queue.map((request) => request.page)).toEqual(['b']);
  });

  it('is let go at once by a tab that is being left, which may not run another task', async () => {
    const browser = new Browser();
    let leaving = false;
    const a = asks(browser.page('a', { leaving: () => leaving }));
    await settle();
    leaving = true;
    a.release!();
    expect(browser.view('a').get(CARD_HANDED_KEY)).toBe('a-1');
    await settle();
    expect(browser.holder).toBeNull();
    expect(browser.tasks).toEqual([]);
  });
});
