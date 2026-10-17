import type { Page } from '@playwright/test';

// A medal counter's seven-segment windows (MedalPusher/SegmentDisplay.tsx) are pictures: each digit is seven
// polygons, lit or not. These read them back as numbers, the way a player reads them.

/** The numbers in every LED window inside `selector`, left to right (null for a window left dark). */
export const ledNumbers = (page: Page, selector: string): Promise<(number | null)[]> =>
  page.evaluate((sel) => {
    const names = 'abcdefg';
    const digits: Record<string, string> = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcdefg: '8', abcdfg: '9' };
    return [...document.querySelectorAll(`${sel} span[data-tone]`)].map((display) => {
      const text = [...display.querySelectorAll('svg')]
        .map((svg) => digits[[...svg.querySelectorAll('polygon')].map((p, i) => (p.getAttribute('data-on') === 'true' ? names[i] : '')).join('')] ?? '')
        .join('');
      return text === '' ? null : Number(text);
    });
  }, selector);

/**
 * Starts keeping every number the first LED window inside `selector` shows from now on, as it changes, in the page
 * (`watchedLed` reads them back). Watching in the page misses no step of a count, however quick.
 */
export const watchLed = (page: Page, selector: string): Promise<void> =>
  page.evaluate((sel) => {
    const w = window as unknown as { ledSeen: number[]; ledWatch?: MutationObserver };
    w.ledWatch?.disconnect();
    w.ledSeen = [];
    const names = 'abcdefg';
    const digits: Record<string, string> = { abcdef: '0', bc: '1', abdeg: '2', abcdg: '3', bcfg: '4', acdfg: '5', acdefg: '6', abc: '7', abcdefg: '8', abcdfg: '9' };
    const root = document.querySelector(sel);
    const read = () => {
      const display = root?.querySelector('span[data-tone]');
      if (!display) return;
      const text = [...display.querySelectorAll('svg')]
        .map((svg) => digits[[...svg.querySelectorAll('polygon')].map((p, i) => (p.getAttribute('data-on') === 'true' ? names[i] : '')).join('')] ?? '')
        .join('');
      const n = Number(text);
      if (text !== '' && w.ledSeen[w.ledSeen.length - 1] !== n) w.ledSeen.push(n);
    };
    read();
    if (root) {
      w.ledWatch = new MutationObserver(read);
      w.ledWatch.observe(root, { subtree: true, attributes: true });
    }
  }, selector);

/** The numbers the watched window has shown since `watchLed`, in order, each change once. */
export const watchedLed = (page: Page): Promise<number[]> => page.evaluate(() => (window as unknown as { ledSeen: number[] }).ledSeen ?? []);

/** How far down the page's fixed or sticky bar at the top reaches: a table brought up to just under it is in full view. */
export const topBarBottom = (page: Page): Promise<number> =>
  page.evaluate(() =>
    Math.max(
      0,
      ...[...document.querySelectorAll('body *')]
        .filter((el) => {
          const style = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return (style.position === 'fixed' || style.position === 'sticky') && r.top <= 1 && r.height > 0 && r.height < 200;
        })
        .map((el) => el.getBoundingClientRect().bottom),
    ),
  );

/** Scrolls so that the element at `selector` sits just under the bar at the top, as a player brings a table into view. */
export async function bringUnderTopBar(page: Page, selector: string): Promise<void> {
  const top = await topBarBottom(page);
  await page
    .locator(selector)
    .first()
    .evaluate((el, bar) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - bar - 8, behavior: 'instant' }), top);
}

/** Where an element is on the screen, top and bottom. */
export const screenBox = (page: Page, selector: string): Promise<{ top: number; bottom: number }> =>
  page
    .locator(selector)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    });
