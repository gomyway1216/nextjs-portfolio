import { test, expect } from '@playwright/test';

import { getFloorStrings } from '../../src/components/game/MedalCenter/floor/strings';
import { MEDAL_CENTER_PATH, MY_PAGE_PATH } from '../../src/components/game/MedalCenter/paths';
import { getCenterStrings } from '../../src/components/game/MedalCenter/strings';
import { HELD_JACKPOT, SHIFT_BUDGET, describeShifts, loadShifts, phone } from './layoutShift';

// The medal center's front and the player's own page hold still on a phone while the medals are read: a guest's
// counter (the Guest badge, where the medals are kept, the way to sign in) is drawn from the server's first HTML, so
// nothing moves when the medals come in, nor when the floor answers. Each page is opened at 375 and 320 px as a phone
// on a slow line meets it (layoutShift.ts). The floor's API is faked; nothing reaches a real server.

const center = getCenterStrings('en');
const floor = getFloorStrings('en');

test('the medal center’s front holds still on a phone as the medals and the floor come in', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'layout shifts are measured by Chromium only');
  test.setTimeout(90_000);
  for (const width of [375, 320]) {
    const { context, page, errors } = await phone(browser, width);
    const moved = await loadShifts(page, MEDAL_CENTER_PATH, {
      answered: async (page) => {
        await expect(page.getByTestId('floor-jackpot-amount')).toHaveAttribute('data-amount', String(HELD_JACKPOT));
        await expect(page.getByTestId('floor-feed-empty')).toHaveText(floor.feedEmpty);
      },
    });
    expect(moved.supported).toBe(true);
    expect(moved.total, `the medal center at ${width} px moved:\n${describeShifts(moved.shifts)}`).toBeLessThan(SHIFT_BUDGET);
    await expect(page.getByTestId('center-member')).toHaveText(center.memberGuest);
    await expect(page.getByTestId('center-sign-in')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  }
});

test('the player’s own page holds still on a phone as the medals and the history come in', async ({ browser, browserName }) => {
  test.skip(browserName !== 'chromium', 'layout shifts are measured by Chromium only');
  test.setTimeout(90_000);
  for (const width of [375, 320]) {
    const { context, page, errors } = await phone(browser, width);
    const moved = await loadShifts(page, MY_PAGE_PATH, {
      // The page asks the floor nothing that it shows.
      answered: async () => undefined,
    });
    expect(moved.supported).toBe(true);
    expect(moved.total, `My Page at ${width} px moved:\n${describeShifts(moved.shifts)}`).toBeLessThan(SHIFT_BUDGET);
    await expect(page.getByTestId('mypage-member')).toHaveText(center.memberGuest);
    await expect(page.getByTestId('mypage-sign-in')).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  }
});
