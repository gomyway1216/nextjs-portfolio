import { test, expect, type Page } from './fixtures';

import { PRESS_TO_DECK, STEP_RATE, STOCK, nextPocketUnderDrop } from '../../src/components/game/CarouselPusher/engine';
import { LEND } from '../../src/components/game/CarouselPusher/credit';
import { ticketFor } from '../../src/components/game/CarouselPusher/lottery';
import { SESSION_KEY, parseSession } from '../../src/components/game/CarouselPusher/medalTable';
import { PUBLISHED_CAROUSEL } from '../../src/components/game/CarouselPusher/published';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Cherry Blossom Carousel, played as a player plays it: DROP puts a handful of the player's medals into the slot and
// drops them one at a time; a medal timed to a hole rolls the counter; RETURN gives the slot back; the field, the slot
// and the dish survive a reload, and nothing is paid twice. The randomness of a press is drawn in the press, so a test
// chooses it by queueing the numbers (rigPresses.ts); the floor's API is faked (fixtures.ts).

const STEP_MS = 1000 / STEP_RATE;

const machine = (page: Page) => page.getByTestId('cp-machine');
const drop = (page: Page) => page.getByTestId('cp-drop');
const medals = async (page: Page) => Number(((await page.getByTestId('cp-medals').textContent()) ?? '').replace(/[^\d]/g, ''));
const stored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY).then(parseSession);

async function openMachine(page: Page): Promise<void> {
  await page.goto('/games/carousel-pusher');
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

/** A finger on DROP and off it again, as pointer events on it. */
async function tapDrop(page: Page): Promise<void> {
  await page.evaluate(() => {
    const button = document.querySelector('[data-testid="cp-drop"]')!;
    button.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 31, isPrimary: true, button: 0, bubbles: true }));
    button.dispatchEvent(new PointerEvent('pointerup', { pointerId: 31, isPrimary: true, button: 0, bubbles: true }));
  });
}

test('DROP puts a handful of your medals into the slot and drops one down the rail onto the deck; then the machine stands still again', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await expect(machine(page)).toHaveAttribute('data-resting', 'true');
  expect(await medals(page)).toBe(WELCOME);
  await pressUntil(drop(page), async () => (await machine(page).getAttribute('data-fed')) === '1');
  await expect(machine(page)).toHaveAttribute('data-credit', String(LEND - 1));
  await expect.poll(() => medals(page)).toBe(WELCOME - LEND);
  await expect(page.getByTestId('cp-credit')).toHaveText(String(LEND - 1));
  // The medal is on its way: the machine is played a step at a time, and stands still again once all is settled.
  await expect(machine(page)).toHaveAttribute('data-resting', 'false');
  await expect(machine(page)).toHaveAttribute('data-resting', 'true', { timeout: 45_000 });
  // The slot is written down with the field: one medal of the handful fed.
  expect((await stored(page))?.credit).toBe(LEND - 1);
});

test('a medal timed to a hole rolls the counter, and 7-7-7 tips the treasure dish: its stock is thrown across the field and comes back over the edge', async ({ page }) => {
  test.setTimeout(90_000);
  await page.clock.install();
  await openMachine(page);
  await expect(machine(page)).toHaveAttribute('data-rest-since', /\d/);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 300);
  // The carousel turns on its own from a known step at a known moment: find the next moment a press brings a medal
  // down on the deck as a hole passes under the drop spot, and let the clock run to it.
  const step = Number(await machine(page).getAttribute('data-rest-step'));
  const since = Number(await machine(page).getAttribute('data-rest-since'));
  const now = await page.evaluate(() => performance.now());
  let d = Math.ceil((now - since) / STEP_MS) + 1;
  while (nextPocketUnderDrop(step + d + PRESS_TO_DECK).steps !== 0) d += 1;
  await page.clock.runFor(Math.ceil(since + (d + 0.25) * STEP_MS - now));
  // The press: no scatter (it comes down on the drop spot itself), and the number kept for its spin draws 7-7-7.
  await rigPresses(page, [0.5, 0, ticketFor('jackpot')]);
  await tapDrop(page);
  await expect(machine(page)).toHaveAttribute('data-fed', '1');
  // Down the rail, into the hole, the counter's reach and its fanfare, the dish's stock thrown.
  for (let i = 0; i < 12 && (await machine(page).getAttribute('data-jackpots')) !== '1'; i++) await page.clock.runFor(1_000);
  await expect(machine(page)).toHaveAttribute('data-jackpots', '1');
  await expect(page.getByTestId('cp-counter')).toHaveAttribute('data-result', 'jackpot');
  await expect(page.getByTestId('cp-counter')).toHaveAttribute('data-digits', '777');
  await expect(page.getByTestId('cp-history')).toContainText(`JP ${STOCK.start}`);
  await expect(machine(page)).toHaveAttribute('data-stock', String(STOCK.start));
  // The stock lands on the field, and the carousel pushes medals off its front edge into the tray: they come back.
  for (let i = 0; i < 40 && (await medals(page)) <= WELCOME - LEND; i++) await page.clock.runFor(1_000);
  expect(await medals(page)).toBeGreaterThan(WELCOME - LEND);
  await page.clock.resume();
});

test('RETURN gives back the medals left in the slot, and nothing is out once the machine stands still', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await pressUntil(drop(page), async () => (await machine(page).getAttribute('data-fed')) === '1');
  await expect(machine(page)).toHaveAttribute('data-credit', String(LEND - 1));
  await page.getByTestId('cp-return').click();
  await expect(machine(page)).toHaveAttribute('data-credit', '0');
  await expect(page.getByTestId('cp-message')).toContainText(`${LEND - 1} medals back from the slot`);
  // The medal fed is the machine's now; what comes back for it is still to come off the field.
  await expect.poll(() => medals(page)).toBeGreaterThanOrEqual(WELCOME - 1);
  await expect(page.getByTestId('cp-return')).toBeDisabled();
  await expect(machine(page)).toHaveAttribute('data-resting', 'true', { timeout: 45_000 });
  expect((await stored(page))?.lent).toBeNull();
});

test('held sideways, RETURN keeps its word on one line beside DROP, in English and Japanese', async ({ page }) => {
  test.setTimeout(90_000);
  // The lines a button's words take on the screen.
  const lines = (testId: string, child?: number) =>
    page.getByTestId(testId).evaluate((button, child) => {
      const range = document.createRange();
      range.selectNodeContents(child === undefined ? button : button.children[child]);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    }, child);
  for (const [width, height] of [
    [568, 320],
    [667, 375],
    [932, 430],
  ] as const) {
    for (const language of ['en', 'ja'] as const) {
      await page.setViewportSize({ width, height });
      await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
      await openMachine(page);
      const at = `${width}×${height} ${language}`;
      // RETURN, and DROP's own word, whole; the controls side by side, and nothing pushes the page sideways.
      expect(await lines('cp-return'), at).toBe(1);
      expect(await lines('cp-drop', 0), at).toBe(1);
      const [dropBox, returnBox] = await Promise.all([drop(page).boundingBox(), page.getByTestId('cp-return').boundingBox()]);
      expect(Math.abs(dropBox!.y - returnBox!.y), at).toBeLessThan(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), at).toBe(0);
    }
  }
});

test('a reload finds the field, the slot and the dish where they were, and pays nothing twice', async ({ page }) => {
  test.setTimeout(90_000);
  await openMachine(page);
  await pressUntil(drop(page), async () => (await machine(page).getAttribute('data-fed')) === '1');
  await tapDrop(page);
  await tapDrop(page);
  await expect(machine(page)).toHaveAttribute('data-fed', '3');
  await expect(machine(page)).toHaveAttribute('data-resting', 'true', { timeout: 45_000 });
  const before = (await stored(page))!;
  const medalsBefore = await medals(page);
  expect(before.credit).toBe(LEND - 3);
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-credit', String(LEND - 3));
  await expect(machine(page)).toHaveAttribute('data-resting', 'true', { timeout: 20_000 });
  const after = (await stored(page))!;
  expect(after.machine.ids).toEqual(before.machine.ids);
  expect(after.machine.stock).toBe(before.machine.stock);
  expect(after.machine.xy.length).toBe(before.machine.xy.length);
  for (let i = 0; i < after.machine.xy.length; i++) expect(Math.abs(after.machine.xy[i] - before.machine.xy[i])).toBeLessThan(0.01);
  expect(await medals(page)).toBe(medalsBefore);
});

test('a second tab takes the medals: this one stands with “Play here”, and takes them back with it', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  const other = await context.newPage();
  await openMachine(other);
  await expect(page.getByTestId('cp-card-away')).toBeVisible({ timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-playable', 'false');
  await page.getByTestId('cp-play-here').click();
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(other.getByTestId('cp-card-away')).toBeVisible({ timeout: 20_000 });
  await other.close();
});

test('keys on a desk: Space drops a medal, held it keeps dropping, and R gives the slot back', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openMachine(page);
  await expect(page.getByTestId('cp-keys')).toBeVisible();
  await page.locator('body').click({ position: { x: 5, y: 300 } });
  await expect(async () => {
    await page.keyboard.down(' ');
    await page.waitForTimeout(700);
    await page.keyboard.up(' ');
    expect(Number(await machine(page).getAttribute('data-fed'))).toBeGreaterThanOrEqual(2);
  }).toPass({ timeout: 20_000 });
  await page.keyboard.press('r');
  await expect(machine(page)).toHaveAttribute('data-credit', '0');
});

test('standing unplayed it asks the browser for no frames: the carousel turns on the compositor', async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __frames: number };
    w.__frames = 0;
    const ask = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      ask((time) => {
        w.__frames += 1;
        callback(time);
      });
  });
  const frames = () => page.evaluate(() => (window as unknown as { __frames: number }).__frames);
  await openMachine(page);
  await expect(machine(page)).toHaveAttribute('data-resting', 'true');
  await page.waitForTimeout(1_000);
  const idle = await frames();
  await page.waitForTimeout(2_000);
  expect((await frames()) - idle, 'frames asked for in 2 s standing unplayed').toBeLessThanOrEqual(2);
  // The deck and the skirt are turned by animations the compositor runs.
  const running = await page.evaluate(() => ['cp-stage-deck', 'cp-stage-skirt'].map((id) => document.querySelector(`[data-testid="${id}"]`)!.getAnimations().filter((a) => a.playState === 'running').length));
  expect(running).toEqual([1, 1]);
  // A medal wakes the machine; it asks for frames while anything moves.
  await pressUntil(drop(page), async () => (await machine(page).getAttribute('data-fed')) === '1');
  await expect.poll(async () => (await frames()) - idle).toBeGreaterThan(20);
  await expect(machine(page)).toHaveAttribute('data-resting', 'true', { timeout: 45_000 });
});

test('the Odds tab shows the returns measured over millions of medals, with their intervals, and what the machine is built from', async ({ page }) => {
  await openMachine(page);
  await page.getByRole('tab', { name: 'Odds' }).click();
  const { timed, steady, held } = PUBLISHED_CAROUSEL.ways;
  const percent = (v: number) => `${(v * 100).toFixed(2)}%`;
  await expect(page.getByTestId('cp-best')).toHaveText(percent(timed.return));
  await expect(page.getByTestId('cp-steady')).toHaveText(percent(steady.return));
  await expect(page.getByTestId('cp-held')).toHaveText(percent(held.return));
  await expect(page.getByTestId('cp-where-table')).toBeVisible();
  await expect(page.getByTestId('cp-counter-table').locator('tbody tr')).toHaveCount(5);
  await expect(page.getByTestId('cp-sources').locator('a')).toHaveCount(5);
});
