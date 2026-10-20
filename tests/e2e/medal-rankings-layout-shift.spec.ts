import { test, expect } from './fixtures';

import { getFloorStrings } from '../../src/components/game/MedalCenter/floor/strings';
import { HELD_JACKPOT, SHIFT_BUDGET, describeShifts, loadShifts, phone } from './layoutShift';

// The floor's rankings page holds still on a phone while the floor is read: its boards, the note on when the floor's
// days start, the moments on show and the player's place on the floor are drawn where they will be, and come in
// there. The page is opened at 375 and 320 px as a phone on a slow line meets it (layoutShift.ts), with a floor as
// quiet as production's is today. The floor's API is faked; nothing reaches a real server.

const t = getFloorStrings('en');

test('the rankings page holds still on a phone as the floor is read', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'layout shifts are measured by Chromium only');
  test.setTimeout(90_000);
  for (const width of [375, 320]) {
    const { context, page, errors } = await phone(browser, width);
    const moved = await loadShifts(page, '/games/medal-center/rankings', {
      // Awake: the page knows the visitor is a guest (the floor itself is still held).
      awake: (page) => expect(page.getByTestId('floor-place')).toHaveAttribute('data-state', 'guest', { timeout: 20_000 }),
      answered: async (page) => {
        await expect(page.getByTestId('rankings-jackpot-amount')).toHaveAttribute('data-amount', String(HELD_JACKPOT));
        // The quiet floor's line alone: the floor has answered.
        await expect(page.getByTestId('floor-feed-empty')).toHaveText(t.feedEmpty);
        await expect(page.getByTestId('rankings-best-roulette')).toContainText(t.boardEmpty);
        await expect(page.getByTestId('rankings-period-note')).toContainText('Japan time');
      },
    });
    expect(moved.supported).toBe(true);
    expect(moved.total, `the rankings at ${width} px moved:\n${describeShifts(moved.shifts)}`).toBeLessThan(SHIFT_BUDGET);
    // What was held unseen is seen now, and only once.
    await expect(page.getByTestId('rankings-period-note')).toBeVisible();
    await expect(page.getByTestId('rankings-best-roulette').getByText(t.boardEmpty)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  }
});
