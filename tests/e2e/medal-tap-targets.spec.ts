import { test, expect, type Page } from '@playwright/test';

import { FLOOR_GAMES } from '../../src/lib/medalFloor/games';
import { holdFloor } from './layoutShift';
import { arrived } from './streamedPage';

// Everything a player presses on the medal floor is at least 44 × 44 px to hit on a phone: every button, tab, switch,
// select, check box (with its label) and stand-alone link of every machine, the medal center's front, My Page and the
// rankings, at 375 and 320 px. What takes a touch is measured, not what is drawn: a control may look smaller and take
// a touch on a 44 px strip through it (the Medal Pusher's switches do). The floor's API is faked; nothing reaches a
// real server.
//
// Not measured, each for its reason:
// - a link inside a sentence (WCAG 2.5.8's inline exception): the line of text it sits in sets its height;
// - the roulette and craps felts: a casino felt laid out at a table's proportions, its spots and the hit zones on the
//   borders between them as the real table has them (both machines also take their bets from the keyboard, and each
//   spot says what it is to a screen reader);
// - the site's own header, which is not the floor's.

const MIN = 44;
/** A pixel short is layout rounding (fonts differ by fractions between systems), not a small control. */
const SLACK = 1;

const PAGES = [...FLOOR_GAMES.map((game) => `/games/${game}`), '/games/medal-center', '/games/medal-center/records', '/games/medal-center/rankings'];

/** Every control on the page that is too small to hit, with its size as a touch finds it. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(
    async ({ min, slack }) => {
      const root = document.querySelector('main') ?? document.body;
      const felt = '[data-testid="roulette-felt"], [data-testid="craps-table"]';
      const candidates = [...root.querySelectorAll<HTMLElement>('button, [role="tab"], select, summary, a[href], input:not([type="hidden"])')];
      const seen = new Set<HTMLElement>();
      const targets: HTMLElement[] = [];
      for (const el of candidates) {
        // A check box or a radio is hit through its label.
        const target = el instanceof HTMLInputElement && el.closest('label') ? (el.closest('label') as HTMLElement) : el;
        if (seen.has(target)) continue;
        seen.add(target);
        if (target.closest(felt) || target.closest('[hidden], [inert]')) continue;
        if (!target.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        // A link in a sentence: other words share its line box.
        if (target instanceof HTMLAnchorElement && getComputedStyle(target).display === 'inline') {
          const block = target.parentElement;
          if (block && (block.textContent ?? '').trim().length > (target.textContent ?? '').trim().length) continue;
        }
        targets.push(target);
      }
      const small: string[] = [];
      for (const target of targets) {
        target.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const rect = target.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        const hits = (px: number, py: number) => {
          const at = document.elementFromPoint(px, py);
          return at !== null && (target === at || target.contains(at));
        };
        if (!hits(x, y)) continue; // covered by something else at its middle (a note over it): not a target now
        let tall = 1;
        let wide = 1;
        for (const way of [-1, 1]) {
          for (let d = 1; d < 40 && hits(x, y + way * d); d++) tall++;
          for (let d = 1; d < 40 && hits(x + way * d, y); d++) wide++;
        }
        // The strips are counted to 40 px either way of the middle: anything larger is large enough.
        tall = Math.max(tall, Math.min(rect.height, 79));
        wide = Math.max(wide, Math.min(rect.width, 79));
        if (tall + slack < min || wide + slack < min) {
          const name = (target.getAttribute('aria-label') || target.textContent || target.getAttribute('data-testid') || target.tagName).replace(/\s+/g, ' ').trim().slice(0, 40);
          small.push(`${name} [${target.tagName.toLowerCase()}${target.dataset.testid ? ` ${target.dataset.testid}` : ''}]: ${Math.round(wide)} × ${Math.round(tall)}`);
        }
      }
      return small;
    },
    { min: MIN, slack: SLACK },
  );
}

for (const width of [375, 320] as const) {
  for (const path of PAGES) {
    test(`${path} at ${width} px: every control is at least ${MIN} px to hit`, async ({ browser }) => {
      test.setTimeout(60_000);
      const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
      await context.addCookies([{ name: 'i18nextLng', value: 'ja', url: 'http://localhost:3000' }]);
      const page = await context.newPage();
      const floor = await holdFloor(page);
      floor.release();
      expect((await page.goto(path))?.status()).toBe(200);
      await arrived(page);
      await expect(page.locator('[data-loaded="false"]')).toHaveCount(0, { timeout: 20_000 });
      expect(await smallTargets(page), `${path} at ${width} px`).toEqual([]);
      await context.close();
    });
  }
}
