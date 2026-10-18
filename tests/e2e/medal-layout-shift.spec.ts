import { test, expect, type Page } from '@playwright/test';

import { FLOOR_GAMES, type FloorGame } from '../../src/lib/medalFloor/games';
import { HELD_JACKPOT, SHIFT_BUDGET, describeShifts, everythingLoaded, loadShifts, phone } from './layoutShift';

// Nothing on a machine's page moves as it loads on a phone: not the one-time note that the machine plays with the
// player's medals now (drawn by the server, and hidden before the first paint where it has been read), not the medals
// as they are read, not the floor jackpot's strip as its amount comes in. Every machine on the floor is opened at 375
// and 320 px as a phone on a slow line meets it (layoutShift.ts: its scripts held until the server's HTML has been
// painted, the floor's answers until the page has woken up, every layout shift counted from the start), then again
// once its note has been put away. The floor's API is faked; nothing reaches a real server.

/** Machines whose medals are shown some other way than by `data-loaded`. */
const AWAKE: Partial<Record<FloorGame, (page: Page) => Promise<void>>> = {
  // The pusher's field is drawn by the renderer it picks once it is awake; its counter is there from the start.
  'medal-pusher': async (page) => {
    await expect(page.locator('[data-testid="pusher-field"][data-renderer]')).toHaveCount(1, { timeout: 20_000 });
    await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  },
};

/** The strip over every machine shows the floor jackpot's amount. */
const stripAnswered = (page: Page) => expect(page.getByTestId('floor-jackpot-strip-amount')).toHaveAttribute('data-amount', String(HELD_JACKPOT));

for (const game of FLOOR_GAMES) {
  test(`${game}: nothing moves as the machine loads on a phone, on a first visit and once its note has been read`, async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'layout shifts are measured by Chromium only');
    test.setTimeout(120_000);
    const path = `/games/${game}`;
    const steps = { awake: AWAKE[game] ?? everythingLoaded, answered: stripAnswered };
    for (const width of [375, 320]) {
      const { context, page, errors } = await phone(browser, width);
      const first = await loadShifts(page, path, steps);
      expect(first.supported).toBe(true);
      expect(first.total, `${path} at ${width} px, a first visit, moved:\n${describeShifts(first.shifts)}`).toBeLessThan(SHIFT_BUDGET);
      // The machine's one-time note, where it has one, is put away: on the next visit it is not drawn at all.
      const note = page.locator('[data-once-note]');
      if ((await note.count()) > 0) {
        await note.locator('button').first().click();
        await expect(note).toHaveCount(0);
      }
      const again = await loadShifts(page, path, steps);
      expect(again.total, `${path} at ${width} px, its note read, moved:\n${describeShifts(again.shifts)}`).toBeLessThan(SHIFT_BUDGET);
      await expect(page.locator('[data-once-note]')).toHaveCount(0);
      expect(errors, path).toEqual([]);
      await context.close();
    }
  });
}
