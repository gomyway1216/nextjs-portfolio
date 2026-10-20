import { test, expect, type Page } from './fixtures';

import { BITE_CELLS, CHEST, CHEST_CELLS, FISH, type FishId } from '../../src/components/game/Fishing/engine';
import { ROUND_KEY, parseRound } from '../../src/components/game/Fishing/medals';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Big Catch Harbor plays with the medal center's medals. A cast is drawn with three numbers from Math.random as CAST
// is pressed (engine.ts): what bites (10,000 cells, each fish's in the order of FISH, then the cells nothing bites),
// whether it is landed (its own share of [0, 1)), and a chest's prize (20 cells). A test that needs a particular cast
// queues the numbers for the press (rigPresses.ts), so nothing else on the page can take them first.

/** The numbers that cast `fish` (null: nothing bites), landed or not, and for a chest landed its prize `prize`. */
function drawn(fish: FishId | null, landed = true, prize = 0): number[] {
  let before = 0;
  for (const entry of FISH) {
    if (entry.id === fish) break;
    before += entry.bites;
  }
  const bite = fish === null ? 0.9999 : (before + 0.5) / BITE_CELLS;
  const land = landed ? 0.001 : 0.999;
  const prizeAt = CHEST.slice(0, prize).reduce((sum, entry) => sum + entry.cells, 0);
  return [bite, land, (prizeAt + 0.5) / CHEST_CELLS];
}

const cabinet = (page: Page) => page.getByTestId('fishing-cabinet');

async function openHarbor(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/fishing');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(cabinet(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** The medals the machine shows, in type. */
async function shown(page: Page): Promise<number> {
  return Number(((await page.getByTestId('fishing-medals').textContent()) ?? '').replace(/,/g, ''));
}

/** Casts once, with the numbers given drawn for it: pressed again only while no cast has begun, so never twice. */
async function cast(page: Page, numbers: number[]) {
  await rigPresses(page, numbers);
  const before = Number(await page.getByTestId('fishing-stat-casts').textContent());
  await pressUntil(page.getByTestId('fishing-cast'), async () => {
    if ((await cabinet(page).getAttribute('data-casting')) === 'true') return true;
    return Number(await page.getByTestId('fishing-stat-casts').textContent()) > before;
  });
}

/** How wide the page is, or any of its tab panels' contents: nothing may be wider than the window. */
const sideways = (page: Page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));

const roundStored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY);

test('a cast takes the bet, plays out to the fish drawn, and pays it once; the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarbor(page);
  await expect(page.getByTestId('fishing-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('fishing-not-money')).toHaveText(NOT_MONEY.en);
  // On the floor jackpot: its best play with the jackpot added stays under 100%.
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await page.getByTestId('fishing-bet-5').click();
  await expect(page.getByTestId('fishing-bet')).toHaveText('5');

  // The harbor's lord, landed, on a 5-medal cast: the medals go in as CAST is pressed.
  await cast(page, drawn('lord'));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 5);
  expect(parseRound(await roundStored(page))?.cast).toEqual({ fish: 'lord', landed: true, prize: null });
  // The lord is announced, bites, is fought and landed: then, and not before, its medals are paid.
  await expect(cabinet(page)).toHaveAttribute('data-step', 'warning');
  await expect(cabinet(page)).toHaveAttribute('data-step', 'fight', { timeout: 10_000 });
  expect(await shown(page)).toBe(WELCOME - 5);
  await expect(cabinet(page)).toHaveAttribute('data-step', 'landed', { timeout: 10_000 });
  await expect(page.getByTestId('fishing-reveal')).toHaveAttribute('data-fish', 'lord');
  await expect(page.getByTestId('fishing-medals')).toHaveText((WELCOME - 5 + 1_500).toLocaleString('en-US'));
  await expect(page.getByTestId('fishing-win')).toHaveText('1500');
  await expect(page.getByTestId('fishing-status')).toHaveText('GET! Moonscale, the Harbor Lord ×300: 1,500 medals');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 1_495);
  expect(await roundStored(page)).toBeNull();

  // A treasure chest, landed on a 1-medal cast: its light runs round and stops on ×50.
  await page.getByTestId('fishing-bet-1').click();
  await cast(page, drawn('chest', true, 2));
  await expect(cabinet(page)).toHaveAttribute('data-step', 'chest', { timeout: 10_000 });
  await expect(page.getByTestId('fishing-chest')).toHaveAttribute('data-lit', '2', { timeout: 5_000 });
  await expect(cabinet(page)).toHaveAttribute('data-step', 'landed', { timeout: 5_000 });
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 1_495 - 1 + 50);

  // After a reload the machine shows the same medals, and so do the medal center's front and My Page.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('fishing-medals')).toHaveText((WELCOME + 1_544).toLocaleString('en-US'));
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText((WELCOME + 1_544).toLocaleString('en-US'));
  await expect(page.getByTestId('center-play-fishing')).toHaveAttribute('href', '/games/fishing');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-fishing')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-fishing-rounds')).toHaveText('2');
  await expect(page.getByTestId('mypage-fishing-won')).toHaveText('1,550');
});

test('REEL moves the show on a step and SKIP to its end; neither changes what was drawn', async ({ page }) => {
  test.setTimeout(60_000);
  await openHarbor(page);
  // A Crescent Marlin that gets away.
  await cast(page, drawn('marlin', false));
  await expect(cabinet(page)).toHaveAttribute('data-step', 'wait');
  await page.getByTestId('fishing-reel').click();
  await expect(cabinet(page)).toHaveAttribute('data-step', 'hooked');
  await page.getByTestId('fishing-skip').click();
  await expect(cabinet(page)).toHaveAttribute('data-step', 'away');
  await expect(page.getByTestId('fishing-reveal')).toHaveAttribute('data-result', 'away');
  await expect(page.getByTestId('fishing-status')).toHaveText('The one that got away: Crescent Marlin');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);
  // The keys: 3 sets the bet, Space casts, S skips. Nothing bites this time.
  await page.keyboard.press('3');
  await expect(page.getByTestId('fishing-bet')).toHaveText('3');
  await rigPresses(page, drawn(null));
  await page.keyboard.press('Space');
  await expect(cabinet(page)).toHaveAttribute('data-casting', 'true');
  await page.keyboard.press('s');
  await expect(cabinet(page)).toHaveAttribute('data-step', 'nothing');
  await expect(page.getByTestId('fishing-status')).toHaveText('Nothing bit this time.');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 4);
});

test('a reload in the middle of a cast pays it once as the page goes, and shows it again', async ({ page }) => {
  test.setTimeout(60_000);
  await openHarbor(page);
  await page.getByTestId('fishing-bet-3').click();
  // A Thunder Tuna, landed: ×20 on 3 medals.
  await cast(page, drawn('tuna'));
  await expect(cabinet(page)).toHaveAttribute('data-step', 'wait');
  await page.reload();
  await arrived(page);
  // Paid as the page went: the medals are in, and the cast is played out again from the start, not cast again.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 3 + 60);
  await expect(page.getByTestId('fishing-resumed')).toBeVisible({ timeout: 20_000 });
  await expect(cabinet(page)).toHaveAttribute('data-step', 'landed', { timeout: 15_000 });
  await expect(page.getByTestId('fishing-reveal')).toHaveAttribute('data-fish', 'tuna');
  await expect(page.getByTestId('fishing-medals')).toHaveText(String(WELCOME + 57));
  // Once shown, it is gone: another reload shows nothing again and pays nothing more.
  await page.reload();
  await arrived(page);
  await expect(cabinet(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
  await expect(cabinet(page)).toHaveAttribute('data-casting', 'false');
  await expect(page.getByTestId('fishing-medals')).toHaveText(String(WELCOME + 57));
  expect(await bankBalance(page)).toBe(WELCOME + 57);
});

for (const width of [375, 320]) {
  for (const language of ['en', 'ja'] as const) {
    test(`fits a ${width} px phone in ${language === 'en' ? 'English' : 'Japanese'}, and nothing moves while a cast plays`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 760 });
      await openHarbor(page, language);
      expect(await sideways(page)).toBeLessThanOrEqual(width);
      // Where the screen, the words under it, the counters and the buttons stand, before and all through a cast.
      const where = () =>
        page.evaluate(() =>
          ['fishing-status', 'fishing-medals-led', 'fishing-skip', 'fishing-sound'].map((id) => {
            const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
            return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)}`;
          }),
        );
      const before = await where();
      await page.getByTestId('fishing-bet-5').click();
      await cast(page, drawn('lord'));
      const seen = new Set<string>([JSON.stringify(before)]);
      while ((await cabinet(page).getAttribute('data-casting')) === 'true') {
        seen.add(JSON.stringify(await where()));
        await page.waitForTimeout(150);
      }
      seen.add(JSON.stringify(await where()));
      expect([...seen]).toEqual([JSON.stringify(before)]);
      expect(await sideways(page)).toBeLessThanOrEqual(width);
      // The Odds tab fits too.
      await page.locator('#fishing-tab-odds').click();
      await expect(page.getByTestId('fishing-rtp')).toHaveText('90%');
      expect(await sideways(page)).toBeLessThanOrEqual(width);
    });
  }
}

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a cast is shown in moments, and nothing in the water swims', async ({ page }) => {
    await openHarbor(page);
    const animation = await page.evaluate(() => getComputedStyle(document.querySelector('[data-left]')!).animationName);
    expect(animation).toBe('none');
    await cast(page, drawn('bream'));
    const started = Date.now();
    await expect(cabinet(page)).toHaveAttribute('data-step', 'landed', { timeout: 3_000 });
    expect(Date.now() - started).toBeLessThan(2_500);
    await expect(page.getByTestId('fishing-medals')).toHaveText(String(WELCOME - 1 + 5));
  });
});
