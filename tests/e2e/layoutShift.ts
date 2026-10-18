import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

import type { FloorJackpotView } from '../../src/lib/medalFloor/jackpot';
import { periodAt } from '../../src/lib/medalFloor/periods';
import type { FloorSummary } from '../../src/lib/medalFloor/types';
import { arrived } from './streamedPage';

/**
 * Layout shifts, as a phone on a slow line meets them, for the specs that hold the medal center's pages still.
 *
 * A phone paints the server's HTML long before the page's scripts have arrived and woken it up: everything the page
 * puts in, takes out or resizes then (a note kept in the device's storage, the medals read, an amount asked of the
 * floor) moves what is under it, and the player sees the page jump. On a fast machine the scripts may arrive before
 * the first paint, and nothing is seen to move. So the scripts are held back until the server's HTML has been painted
 * (`holdScripts`), the floor's answers until the page has woken up (`holdFloor`), and every shift is recorded from the
 * start (`recordShifts`). Nothing reaches a real server: the floor's API is faked, and the live database and the
 * sign-in are cut off.
 *
 * Every shift counts, even one Chromium marks as just after the player's input (`hadRecentInput`), which Core Web
 * Vitals leave out: nothing is pressed while a page loads here, and Chromium marks the shifts of a new tab's first
 * page that way for its first half second or so (seen on the slot machine's note, 0.226 marked as input on a first
 * visit and not on a second).
 */

/**
 * The most a page may move as it loads, summed over every shift. Core Web Vitals call a CLS under 0.1 good; the medal
 * pages measure 0.0000–0.0003 with nothing moving, and the smallest real jump found (a line of the floor jackpot strip
 * rewrapping at 320 px) is 0.0115, so the budget sits well between the two.
 */
export const SHIFT_BUDGET = 0.005;

export interface Shift {
  value: number;
  at: number;
  /** Chromium's word that the player had just pressed something; counted all the same (see above). */
  input: boolean;
  /** What moved: a short path to each element, with where it was and where it went. */
  sources: string[];
}

declare global {
  interface Window {
    __shifts?: { list: Shift[]; observer: PerformanceObserver | null; painted: boolean; flush: () => void };
  }
}

/** Records every layout shift on every page of `context` from before anything on it runs, and when it was first painted. */
export async function recordShifts(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const where = (node: Node | null): string => {
      let element = node && node.nodeType === 1 ? (node as Element) : (node?.parentElement ?? null);
      const parts: string[] = [];
      for (let depth = 0; element && depth < 4 && element !== document.body; depth += 1) {
        const testId = element.getAttribute('data-testid');
        const className = typeof element.className === 'string' ? element.className.split(/\s+/)[0] : '';
        parts.unshift(`${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${testId ? `[data-testid="${testId}"]` : className ? `.${className.replace(/-module__[\w-]+__/, '.')}` : ''}`);
        if (testId || element.id) break;
        element = element.parentElement;
      }
      return parts.join(' > ') || '(page)';
    };
    const box = (rect: DOMRectReadOnly) => `${Math.round(rect.x)},${Math.round(rect.y)} ${Math.round(rect.width)}×${Math.round(rect.height)}`;
    const record: NonNullable<Window['__shifts']> = { list: [], observer: null, painted: false, flush: () => undefined };
    window.__shifts = record;
    type LayoutShift = PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources?: { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
    };
    const take = (entries: PerformanceEntryList) => {
      for (const entry of entries as LayoutShift[]) {
        record.list.push({
          value: entry.value,
          at: Math.round(entry.startTime),
          input: entry.hadRecentInput,
          sources: (entry.sources ?? []).map((source) => `${where(source.node)}: ${box(source.previousRect)} → ${box(source.currentRect)}`),
        });
      }
    };
    try {
      record.observer = new PerformanceObserver((list) => take(list.getEntries()));
      record.observer.observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(() => {
        record.painted = true;
      }).observe({ type: 'paint', buffered: true });
    } catch {
      // A browser without layout shifts (only Chromium has them): nothing is recorded, and `shiftsOn` says so.
    }
    // Entries the observer has not handed over yet are taken when they are asked for.
    record.flush = () => take(record.observer?.takeRecords() ?? []);
  });
}

/**
 * Holds every script of the site's own back until `release` is called: the page is painted from the server's HTML
 * first, as on a slow line. Call before the page is opened; release once `painted` says the page has been painted.
 */
export async function holdScripts(page: Page): Promise<{ release: () => void }> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/_next\/static\/.*\.js(\?|$)/, async (route) => {
    await released;
    await route.continue();
  });
  return { release };
}

/** Waits until the page has been painted (its first contentful paint), while its scripts may still be held. */
export async function painted(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.__shifts?.painted ?? false), { message: 'the page was never painted' }).toBe(true);
  // Two frames more: what is on the screen now is what the player saw first.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

/** The shifts so far, and their sum. Waits two frames first, so that a shift just made has been measured. */
export async function shiftsOn(page: Page): Promise<{ total: number; shifts: Shift[]; supported: boolean }> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  return page.evaluate(() => {
    const record = window.__shifts;
    if (!record) return { total: 0, shifts: [], supported: false };
    record.flush();
    return { total: record.list.reduce((sum, shift) => sum + shift.value, 0), shifts: record.list, supported: record.observer !== null };
  });
}

/** The shifts, written out for a failed assertion. */
export const describeShifts = (shifts: Shift[]): string =>
  shifts.map((shift) => `${shift.value.toFixed(4)} at ${shift.at} ms${shift.input ? ' (marked as after input)' : ''}\n${shift.sources.map((source) => `    ${source}`).join('\n')}`).join('\n') || '(none)';

/** The floor's jackpot, as the faked API gives it. */
export const HELD_JACKPOT = 1_000;

/** A floor with no wins on it yet, as production has it today. */
export function emptyFloor(now = Date.now()): FloorSummary {
  const day = periodAt('day', now);
  const week = periodAt('week', now);
  return {
    now,
    available: true,
    feed: [],
    day: { kind: 'day', key: day.key, start: day.start, end: day.end, won: [], best: {} },
    week: { kind: 'week', key: week.key, start: week.start, end: week.end, won: [], best: {} },
  };
}

/** The floor's API, held until `release` (then a quiet floor and its jackpot), and the live database and the sign-in cut off. */
export async function holdFloor(page: Page, summary: () => FloorSummary = emptyFloor): Promise<{ release: () => void }> {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.routeWebSocket(/firebaseio\.com/, (socket) => socket.close());
  await page.route(/firebaseio\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|firestore\.googleapis\.com/, (route) => route.abort());
  await page.route(/\/api\/game\/medal-floor(\?|$)/, async (route) => {
    await released;
    await route.fulfill({ json: summary() });
  });
  await page.route(/\/api\/game\/medal-floor\/jackpot(\?|$)/, async (route) => {
    await released;
    const jackpot: FloorJackpotView = { now: Date.now(), available: true, amount: HELD_JACKPOT, seq: 1, v: 7, wins: [] };
    await route.fulfill({ json: jackpot });
  });
  return { release };
}

/** A phone's browser that records every layout shift, in English, with nothing kept from an earlier visit. */
export async function phone(browser: Browser, width: number) {
  const context = await browser.newContext({ viewport: { width, height: 812 }, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await recordShifts(context);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return { context, page, errors };
}

export interface LoadSteps {
  /** The page has woken up and read the medals: by default, something says `data-loaded="true"` and nothing `"false"`. */
  awake?: (page: Page) => Promise<void>;
  /** The page shows what the floor answered. */
  answered: (page: Page) => Promise<void>;
}

/** Waits until something on the page says `data-loaded="true"` and nothing says `"false"` any more. */
export async function everythingLoaded(page: Page): Promise<void> {
  await expect(page.locator('[data-loaded="true"]').first(), 'the page says when it has read what it shows').toBeAttached({ timeout: 20_000 });
  await expect(page.locator('[data-loaded="false"]'), 'the page has read what it shows').toHaveCount(0, { timeout: 20_000 });
}

/** Opens `path` on `page` as a phone on a slow line meets it, and returns how far the page moved. */
export async function loadShifts(page: Page, path: string, { awake = everythingLoaded, answered }: LoadSteps) {
  const scripts = await holdScripts(page);
  const floor = await holdFloor(page);
  expect((await page.goto(path, { waitUntil: 'commit' }))?.status(), path).toBe(200);
  // The server's HTML, painted with no script run: what the player sees first.
  await expect(page.locator('h1').first()).toBeVisible();
  await arrived(page);
  await painted(page);
  // The scripts arrive, the page wakes up and reads the medals.
  scripts.release();
  await awake(page);
  // The floor answers.
  floor.release();
  await answered(page);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  return shiftsOn(page);
}
