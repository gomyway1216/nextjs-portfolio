import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

// Bandit, St. Petersburg, Kelly and the secretary problem: what a phone and a
// keyboard need from them. The games are random, so nothing here depends on an outcome.

async function open(page: Page, path: string, language: 'en' | 'ja' = 'en') {
  const origin = test.info().project.use.baseURL ?? 'http://localhost:3000';
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: origin }]);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await arrived(page);
}

/** What has keyboard focus, as its visible text. */
const focusedText = (page: Page) => page.evaluate(() => (document.activeElement?.textContent ?? '').trim());

const banditPlay = (page: Page) => page.getByTestId('bandit-panel-play');
const banditArms = (page: Page) => page.getByTestId('bandit-arms').getByRole('button');

/** Sets the bandit to its five arms, retrying until hydration has attached the handlers. */
async function fiveArms(page: Page) {
  await expect(async () => {
    await banditPlay(page).getByRole('spinbutton', { name: 'Arms K' }).fill('5', { timeout: 1_000 });
    await expect(banditArms(page)).toHaveCount(5, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]) {
  test(`bandit: five arms in English fit a ${viewport.width}px phone without scrolling sideways`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage();
    try {
      await open(page, '/games/bandit');
      await fiveArms(page);
      // The hint adds a line to one card: the widest the row gets.
      await banditPlay(page).getByRole('button', { name: /Strategy hints/ }).click();
      await expect(banditPlay(page).getByText('UCB1 picks this')).toBeVisible();

      const page_ = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(page_.scrollWidth).toBeLessThanOrEqual(page_.clientWidth);

      for (const arm of await banditArms(page).all()) {
        const box = await arm.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
        // Nothing inside a card spills out of it either.
        const spill = await arm.evaluate((card) => card.scrollWidth - card.clientWidth);
        expect(spill).toBeLessThanOrEqual(0);
      }
    } finally {
      await context.close();
    }
  });
}

test('bandit: the game in progress survives a visit to the Simulation tab', async ({ page }) => {
  await open(page, '/games/bandit');
  const arm1 = banditArms(page).first();
  await expect(async () => {
    await arm1.click({ timeout: 1_000 });
    await expect(arm1).not.toHaveAccessibleName(/pulled 0 /, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await arm1.click();
  await arm1.click();
  const pulled = await arm1.getAttribute('aria-label');
  expect(pulled).toMatch(/^Arm 1, pulled \d+ \/ wins \d+/);
  const left = await banditPlay(page).getByText(/^\d+ \/ 50$/).textContent();

  await page.getByRole('button', { name: 'Simulation' }).click();
  await expect(banditPlay(page)).toBeHidden();
  // While the Play tab is hidden its number keys pull nothing.
  await page.keyboard.press('1');
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  await expect(banditPlay(page)).toBeVisible();
  await expect(arm1).toHaveAttribute('aria-label', pulled!);
  await expect(banditPlay(page).getByText(/^\d+ \/ 50$/)).toHaveText(left!);
});

test('bandit: a pull limit lowered below the pulls made ends the game on those pulls', async ({ page }) => {
  await open(page, '/games/bandit');
  const arm1 = banditArms(page).first();
  await expect(async () => {
    await arm1.click({ timeout: 1_000 });
    await expect(arm1).not.toHaveAccessibleName(/pulled 0 /, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  // The retry above may have pulled more than once; go on to exactly twelve.
  for (let clicks = 0; clicks < 12 && !/pulled 12 /.test((await arm1.getAttribute('aria-label')) ?? ''); clicks += 1) {
    await arm1.click();
  }
  await expect(arm1).toHaveAccessibleName(/pulled 12 /);

  const limit = banditPlay(page).getByRole('spinbutton', { name: 'Pull limit T' });
  await limit.fill('10');
  await expect(limit).toHaveValue('12');
  await expect(banditPlay(page).getByText('0 / 12', { exact: true })).toBeVisible();
  const banner = banditPlay(page).getByTestId('bandit-finished');
  await expect(banner).toContainText(/Done! total \d+ \/ 12 = /);
  await expect(banner).not.toContainText('。');
});

test('kelly: Enter on FLIP keeps flipping without tabbing back to it', async ({ page }) => {
  await open(page, '/games/kelly-criterion');
  const play = page.locator('#kelly-panel-play');
  const flips = play.getByTestId('kelly-flips');
  const flip = play.getByRole('button', { name: 'FLIP', exact: true });
  await expect(async () => {
    await flip.click({ timeout: 1_000 });
    await expect(flips).toHaveText('1 / 300', { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  for (const count of [2, 3]) {
    await page.keyboard.press('Enter');
    // Mid-spin the button still has focus, and a second press does not flip twice.
    await page.keyboard.press('Enter');
    await expect(flips).toHaveText(`${count} / 300`);
    expect(await focusedText(page)).toBe('FLIP');
  }
});

test('petersburg: Enter on "Flip once" keeps playing, and the record survives the Simulate tab', async ({ page }) => {
  await open(page, '/games/petersburg');
  const play = page.locator('#petersburg-panel-play');
  const flipOnce = play.getByRole('button', { name: /Flip once/ });
  const lastGame = play.getByText(/^Last game:/);
  const gamesPlayed = play.locator('div').filter({ hasText: /^Games played\d+$/ });
  await expect(async () => {
    await flipOnce.click({ timeout: 1_000 });
    await expect(lastGame).toBeVisible({ timeout: 6_000 });
  }).toPass({ timeout: 25_000 });
  await expect(flipOnce).toBeVisible();
  expect(await focusedText(page)).toMatch(/Flip once/);
  await expect(lastGame).toHaveText(/: (1 flip|(?!1 )\d+ flips) → payout \$/);
  const played = Number((await gamesPlayed.textContent())!.replace('Games played', ''));

  // Still on the button: Enter plays the next game, and a second Enter mid-flip does not play another.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(gamesPlayed).toHaveText(`Games played${played + 1}`, { timeout: 15_000 });
  await expect(flipOnce).toBeVisible();
  expect(await focusedText(page)).toMatch(/Flip once/);

  const record = await lastGame.textContent();
  await page.getByRole('tab', { name: 'Simulate' }).click();
  await expect(play).toBeHidden();
  await page.getByRole('tab', { name: 'Play' }).click();
  await expect(lastGame).toHaveText(record!);
});

test('secretary problem: focus follows the buttons through a round', async ({ page }) => {
  await open(page, '/games/secretary-problem', 'ja');
  const play = page.locator('#sp-panel-play');
  const start = play.getByRole('button', { name: /面接開始/ });
  await expect(async () => {
    await start.focus({ timeout: 1_000 });
    await page.keyboard.press('Enter');
    await expect(play.getByRole('button', { name: '見送り' })).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  expect(await focusedText(page)).toBe('見送り');

  // Passing every candidate ends the round on the last one; at most 50 candidates.
  const nextRound = play.getByRole('button', { name: /次のラウンド/ });
  for (let pressed = 0; pressed < 50 && !(await nextRound.isVisible()); pressed += 1) {
    await page.keyboard.press('Enter');
  }
  await expect(nextRound).toBeFocused();

  await page.keyboard.press('Enter');
  await expect(play.getByRole('button', { name: '見送り' })).toBeFocused();
});
