import { test, expect, type Page } from '@playwright/test';

import { getStrings } from '../../src/components/game/MedalPusher/i18n';
import { BOWLS, CHAIN_GOAL, CHANCE, CHESTS, JACKPOT_START, TIER_BONUS, TIER_DIGITS } from '../../src/components/game/MedalPusher/lottery';
import { PLATE_STEPS, payoutLines } from '../../src/components/game/MedalPusher/plateData';
import { getPlateStrings } from '../../src/components/game/MedalPusher/plateStrings';
import { MAX_STOCK } from '../../src/components/game/MedalPusher/session';

// The cabinet's instruction plate: what the How to play button opens, and the compact one on the cabinet's front.
// The unit tests hold what is printed on it to the lottery's tables. These hold it to the page: that it opens as a
// dialog should, in both languages, and that the compact one is on the cabinet without being in anything's way.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-pusher');
  expect(response?.status()).toBe(200);
  // While the page streams in, React briefly keeps a second, hidden copy of the
  // content in the document. Wait until there is one before looking anything up.
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
}

const machine = (page: Page) => page.locator('#pusher-panel-machine');
const dialog = (page: Page) => page.getByTestId('pusher-plate-dialog');
const plate = (page: Page) => dialog(page).getByTestId('pusher-plate');
/** The compact plate on the cabinet. */
const strip = (page: Page) => machine(page).getByTestId('pusher-plate-strip');

/** Medals fed so far. */
async function played(page: Page): Promise<number> {
  return Number(((await machine(page).getByTestId('pusher-played').textContent()) ?? '').replace(/,/g, ''));
}

/** Presses something that opens the plate, retrying until hydration has attached its handler. */
async function openPlate(page: Page, opener: ReturnType<Page['getByTestId']>) {
  await expect(async () => {
    await opener.click({ timeout: 1_000 });
    await expect(dialog(page)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Every test id in the page that is there more than once. */
const repeatedTestIds = (page: Page) =>
  page.evaluate(() => {
    const ids = Array.from(document.querySelectorAll<HTMLElement>('[data-testid]'), (element) => element.dataset.testid ?? '');
    return ids.filter((id, index) => ids.indexOf(id) !== index);
  });

test('How to play opens the instruction plate: a named dialog that takes the focus, keeps the keys, and gives the focus back', async ({ page }) => {
  await openGame(page);
  const t = getStrings('en');
  // The button is looked up by its test id and held to its name: the site's own chrome may have buttons of its own.
  const opener = page.getByTestId('pusher-how-to-play');
  await expect(opener).toHaveCount(1);
  await expect(opener).toHaveAccessibleName(t.howToPlay);
  expect(await opener.evaluate((element) => element.tagName)).toBe('BUTTON');

  // Closed, the dialog is in the page with the explanation in sentences, and the plate has not been printed.
  await expect(dialog(page)).toBeHidden();
  await expect(dialog(page).getByTestId('pusher-plate-text')).toContainText(t.infoBody(MAX_STOCK)[0]);
  await expect(page.getByTestId('pusher-plate')).toHaveCount(0);

  await openPlate(page, opener);
  await expect(dialog(page)).toHaveAccessibleName(t.howToPlay);
  expect(await dialog(page).evaluate((element) => element.tagName === 'DIALOG' && (element as HTMLDialogElement).open)).toBe(true);
  await expect(page.getByTestId('pusher-plate-close')).toBeFocused();
  await expect(page.getByTestId('pusher-plate-close')).toHaveAccessibleName(getPlateStrings('en').close);

  // The plate: every step, numbered and drawn, and the payout card with every line of the slot.
  await expect(plate(page)).toBeVisible();
  await expect(plate(page)).toHaveAttribute('data-plate-lang', 'en');
  const steps = plate(page).getByTestId('pusher-plate-steps').locator('li');
  await expect(steps).toHaveCount(PLATE_STEPS.length);
  for (const [index, step] of PLATE_STEPS.entries()) {
    await expect(steps.nth(index)).toHaveAttribute('data-plate-step', step);
    await expect(steps.nth(index).locator('svg').first()).toBeVisible();
    await expect(steps.nth(index)).toContainText(getPlateStrings('en').steps[step].head);
  }
  const payout = plate(page).getByTestId('pusher-plate-payout');
  await expect(payout).toBeVisible();
  const lines = payoutLines();
  await expect(payout.locator('[data-plate-line]')).toHaveCount(lines.length);
  for (const line of lines) {
    const row = payout.locator(`[data-plate-line="${line.tier}"]`);
    await expect(row).toHaveAttribute('data-plate-leads', TIER_BONUS[line.tier]);
    await expect(row.locator('[data-plate-digit]')).toHaveCount(TIER_DIGITS[line.tier].length === 1 ? 3 : TIER_DIGITS[line.tier].length);
    await expect(row).toContainText(getPlateStrings('en').bonusName[line.leads]);
  }
  await expect(payout.locator('[data-plate-prize]')).toHaveText([...CHESTS].sort((a, b) => a - b).map(String));
  // The way to the jackpot: the roulette, and a station for each bowl of the challenge, the jackpot in the last.
  const bowls = payout.locator('[data-plate-station="bowl"]');
  await expect(bowls).toHaveCount(BOWLS.length);
  for (const [index, holes] of BOWLS.entries()) {
    await expect(bowls.nth(index).locator('svg')).toBeVisible();
    await expect(bowls.nth(index)).toHaveAttribute('data-plate-down', String(holes.filter((hole) => hole === 'down').length));
    for (const hole of holes) if (typeof hole === 'number') await expect(bowls.nth(index)).toContainText(String(hole));
  }
  await expect(payout.locator('[data-plate-jackpot]')).toHaveCount(1);
  await expect(bowls.last().locator('[data-plate-jackpot]')).toContainText(`${JACKPOT_START}+`);
  // Chance time is on the card, by the cabinet's own name for it, with what a gold spin pays.
  const chance = payout.locator('[data-plate-note="chance"]');
  await expect(chance).toContainText(t.chanceTitle);
  await expect(chance).toContainText(`×${CHANCE.multiplier}`);
  await expect(payout.locator('[data-plate-gold]')).toHaveCount(payoutLines().filter((line) => line.gold !== null).length);
  await expect(payout).toContainText('The exact chances are on the Odds tab.');

  // A key pressed while the plate is up is not the machine's.
  const before = await played(page);
  await page.keyboard.press('KeyF');
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(400);
  expect(await played(page)).toBe(before);

  // Under the plate, the explanation it replaced.
  await dialog(page).getByTestId('pusher-plate-text').locator('summary').click();
  await expect(dialog(page).getByTestId('pusher-plate-text').locator('p').first()).toBeVisible();
  await expect(dialog(page).getByTestId('pusher-plate-text').locator('p')).toHaveCount(t.infoBody(MAX_STOCK).length);

  // Escape closes it and the focus goes back to what opened it.
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  await expect(opener).toBeFocused();

  // It opens again, and its own button closes it.
  await opener.click();
  await expect(dialog(page)).toBeVisible();
  await page.getByTestId('pusher-plate-close').click();
  await expect(dialog(page)).toBeHidden();
  expect(await repeatedTestIds(page)).toEqual([]);
});

test('the instruction plate reads in Japanese', async ({ page }) => {
  await openGame(page, 'ja');
  const t = getPlateStrings('ja');
  const opener = page.getByTestId('pusher-how-to-play');
  await expect(opener).toHaveAccessibleName(getStrings('ja').howToPlay);
  await openPlate(page, opener);
  await expect(dialog(page)).toHaveAccessibleName(getStrings('ja').howToPlay);
  await expect(plate(page)).toHaveAttribute('data-plate-lang', 'ja');
  await expect(plate(page)).toContainText('遊び方');
  await expect(plate(page)).toContainText('ゲームの流れ');
  const steps = plate(page).getByTestId('pusher-plate-steps').locator('li');
  await expect(steps).toHaveCount(PLATE_STEPS.length);
  for (const [index, step] of PLATE_STEPS.entries()) await expect(steps.nth(index)).toContainText(t.steps[step].head);
  await expect(steps.nth(PLATE_STEPS.indexOf('start'))).toContainText(`保留は${MAX_STOCK}回まで`);
  const payout = plate(page).getByTestId('pusher-plate-payout');
  await expect(payout).toContainText('配当表');
  await expect(payout.locator('[data-plate-line]')).toHaveCount(payoutLines().length);
  await expect(payout).toContainText('宝箱チャンス！');
  await expect(payout).toContainText('すごろくチャンス！');
  await expect(payout).toContainText(`数字が${CHAIN_GOAL}回つづくと`);
  await expect(payout.locator('[data-plate-station="bowl"]')).toHaveCount(BOWLS.length);
  await expect(payout).toContainText(`${BOWLS.length}段目`);
  await expect(payout).toContainText(`${JACKPOT_START}枚〜`);
  await expect(payout.locator('[data-plate-note="chance"]')).toContainText(getStrings('ja').chanceTitle);
  await expect(payout.locator('[data-plate-note="chance"]')).toContainText(`${CHANCE.multiplier}倍`);
  await expect(dialog(page).getByTestId('pusher-plate-text')).toContainText(getStrings('ja').infoBody(MAX_STOCK)[0]);
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeHidden();
  // The compact plate on the cabinet is in Japanese too.
  await expect(strip(page)).toHaveAttribute('data-plate-lang', 'ja');
  await expect(strip(page)).toHaveAccessibleName(t.open);
});

test('on a phone the compact plate is on the cabinet under the controls, covers nothing, and opens the full one', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGame(page);
  const t = getPlateStrings('en');
  await expect(strip(page)).toBeVisible();
  await expect(strip(page)).toHaveAccessibleName(t.open);
  await expect(strip(page).locator('[data-plate-mini]')).toHaveCount(PLATE_STEPS.length);

  // It is on the cabinet's front: under the control panel, across the cabinet, and inside the window.
  await strip(page).scrollIntoViewIfNeeded();
  const box = await strip(page).boundingBox();
  const controls = await machine(page).getByTestId('pusher-controls').boundingBox();
  if (!box || !controls) throw new Error('the compact plate or the controls have no box');
  expect(box.y).toBeGreaterThanOrEqual(controls.y + controls.height);
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(375);
  expect(box.width).toBeGreaterThanOrEqual(300);
  // Compact: it is a strip, not a second panel, and tall enough for a thumb.
  expect(box.height).toBeLessThan(80);
  expect(box.height).toBeGreaterThanOrEqual(40);

  // It covers nothing: no control of the cabinet is under it, and nothing is over it.
  for (const id of ['pusher-feed-left', 'pusher-feed-right', 'pusher-aim-left', 'pusher-aim-right', 'pusher-auto', 'pusher-credits', 'pusher-field']) {
    const other = await machine(page).getByTestId(id).boundingBox();
    if (!other) throw new Error(`${id} has no box`);
    const apart = other.y + other.height <= box.y || other.y >= box.y + box.height || other.x + other.width <= box.x || other.x >= box.x + box.width;
    expect(apart, `${id} and the compact plate overlap`).toBe(true);
  }
  expect(
    await strip(page).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return element.contains(hit);
    }),
  ).toBe(true);
  // The page is no wider for it.
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner);

  // Pressing it opens the full plate, which fits the window.
  await openPlate(page, strip(page));
  await expect(plate(page)).toBeVisible();
  const full = await plate(page).boundingBox();
  if (!full) throw new Error('the plate has no box');
  expect(full.x).toBeGreaterThanOrEqual(0);
  expect(full.x + full.width).toBeLessThanOrEqual(375);
  await expect(plate(page).getByTestId('pusher-plate-steps').locator('li')).toHaveCount(PLATE_STEPS.length);
  await expect(plate(page).getByTestId('pusher-plate-payout')).toBeAttached();
  const open = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(open.scroll).toBeLessThanOrEqual(open.inner);
  expect(await repeatedTestIds(page)).toEqual([]);

  // A press beside the plate, on what is behind it, closes it, and the focus goes back to the compact plate.
  await dialog(page).click({ position: { x: 3, y: 300 } });
  await expect(dialog(page)).toBeHidden();
  await expect(strip(page)).toBeFocused();
});
