import { test, expect, type Page } from '@playwright/test';

import { JACKPOT_START } from '../../src/components/game/MedalPusher/lottery';
import { START_CREDITS } from '../../src/components/game/MedalPusher/session';

// The field is physics with a random seed, so the tests check what must hold
// whatever the medals do: the purse, the counters and the controls.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/medal-pusher');
  expect(response?.status()).toBe(200);
  // While the page streams in, React briefly keeps a second, hidden copy of the
  // content in the document. Wait until there is one before looking anything up.
  await expect(page.getByTestId('pusher-credits')).toHaveCount(1);
  await expect(machine(page).getByTestId('pusher-field')).toBeVisible();
}

// Every tab panel stays mounted, so everything is looked up inside its own panel.
const machine = (page: Page) => page.locator('#pusher-panel-machine');
const odds = (page: Page) => page.locator('#pusher-panel-odds');
const sim = (page: Page) => page.locator('#pusher-panel-sim');
const dropButton = (page: Page) => machine(page).getByTestId('pusher-drop');
const autoButton = (page: Page) => machine(page).getByTestId('pusher-auto');
const aimSlider = (page: Page) => machine(page).getByTestId('pusher-aim');

/** A counter of the machine as a number. It is read from the DOM, so it works while the tab is hidden too. */
async function counter(page: Page, id: string): Promise<number> {
  const text = (await machine(page).getByTestId(`pusher-${id}`).textContent()) ?? '';
  return Number(text.replace(/,/g, ''));
}

/** Drops one medal with the button, retrying until hydration has attached the handlers. */
async function dropOne(page: Page) {
  const before = await counter(page, 'played');
  await expect(async () => {
    await dropButton(page).click({ timeout: 1_000 });
    expect(await counter(page, 'played')).toBeGreaterThan(before);
  }).toPass({ timeout: 20_000 });
}

/** The purse always holds what it started with, less what was dropped, plus what was won. */
async function expectPurseToBalance(page: Page) {
  await expect(async () => {
    const [credits, played, won] = await Promise.all([counter(page, 'credits'), counter(page, 'played'), counter(page, 'won')]);
    expect(credits).toBe(START_CREDITS - played + won);
  }).toPass({ timeout: 5_000 });
}

test('a new machine is drawn, with a full purse and nothing played', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);

  await expect(page.getByRole('heading', { level: 1, name: /Medal Pusher/ })).toBeVisible();
  await expect(machine(page).getByTestId('pusher-credits')).toHaveText(String(START_CREDITS));
  await expect(machine(page).getByTestId('pusher-jackpot')).toHaveText(String(JACKPOT_START));
  await expect(machine(page).getByRole('img', { name: '0 of 4 spins held' })).toBeVisible();
  await expect(machine(page).getByTestId('pusher-played')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-return')).toHaveText('—');
  await expect(machine(page).getByTestId('pusher-caption')).toContainText('7·7·7 ▸ BALL');
  await expect(machine(page).getByTestId('pusher-mode')).toHaveText('NUMBER SLOT');
  // The sugoroku board is always on, the piece on its first square.
  await expect(machine(page).getByTestId('pusher-board')).toHaveAttribute('data-square', '0');
  await expect(machine(page).getByTestId('pusher-board').locator('li')).toHaveCount(12);
  await expect(machine(page).getByTestId('pusher-refill')).toHaveCount(0);

  // The field is painted: its middle is the lower table and its medals, not an empty canvas.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const canvas = document.querySelector<HTMLCanvasElement>('[data-testid="pusher-field"]');
        const context = canvas?.getContext('2d');
        if (!canvas || !context) return -1;
        return context.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height * 0.7), 1, 1).data[3];
      }),
    )
    .toBe(255);

  // A machine nobody feeds keeps its medals.
  await page.waitForTimeout(1_500);
  await expect(machine(page).getByTestId('pusher-won')).toHaveText('0');
  await expect(machine(page).getByTestId('pusher-lost')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('DROP takes a medal from the purse', async ({ page }) => {
  await openGame(page);
  await dropOne(page);
  const played = await counter(page, 'played');
  expect(played).toBeGreaterThanOrEqual(1);
  await expectPurseToBalance(page);
  await expect(machine(page).getByTestId('pusher-return')).not.toHaveText('—');
});

test('clicking the field aims there and drops a medal', async ({ page }) => {
  await openGame(page);
  await dropOne(page);
  const field = machine(page).getByTestId('pusher-field');
  const box = await field.boundingBox();
  if (!box) throw new Error('the field has no box');

  let before = await counter(page, 'played');
  await page.waitForTimeout(300);
  await field.click({ position: { x: box.width * 0.25, y: box.height * 0.12 } });
  await expect.poll(() => counter(page, 'played')).toBe(before + 1);
  expect(Number(await aimSlider(page).inputValue())).toBeLessThan(35);

  before = await counter(page, 'played');
  await page.waitForTimeout(300);
  await field.click({ position: { x: box.width * 0.8, y: box.height * 0.12 } });
  await expect.poll(() => counter(page, 'played')).toBe(before + 1);
  expect(Number(await aimSlider(page).inputValue())).toBeGreaterThan(65);
  await expectPurseToBalance(page);
});

test('holding DROP streams medals and letting go stops them', async ({ page }) => {
  await openGame(page);
  await dropOne(page);
  const before = await counter(page, 'played');
  const box = await dropButton(page).boundingBox();
  if (!box) throw new Error('the button has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => counter(page, 'played'), { timeout: 10_000 }).toBeGreaterThanOrEqual(before + 4);
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await counter(page, 'played');
  await page.waitForTimeout(900);
  // The click that ends a stream does not drop one more.
  expect(await counter(page, 'played')).toBe(after);
  await expectPurseToBalance(page);
});

test('Auto drops medals until it is switched off', async ({ page }) => {
  await openGame(page);
  await dropOne(page);
  const before = await counter(page, 'played');
  await autoButton(page).click();
  await expect(autoButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(before + 4);
  await autoButton(page).click();
  await expect(autoButton(page)).toHaveAttribute('aria-pressed', 'false');
  await page.waitForTimeout(400);
  const after = await counter(page, 'played');
  await page.waitForTimeout(1_200);
  expect(await counter(page, 'played')).toBe(after);
  await expectPurseToBalance(page);
});

test('the aim can be set from the keyboard', async ({ page }) => {
  await openGame(page);
  await dropOne(page);
  await aimSlider(page).focus();
  await expect(aimSlider(page)).toHaveValue('50');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(aimSlider(page)).toHaveValue('53');
  await expect(aimSlider(page)).toHaveAttribute('aria-valuetext', '53% across');
  await page.keyboard.press('Home');
  await expect(aimSlider(page)).toHaveValue('0');
  await page.keyboard.press('End');
  await expect(aimSlider(page)).toHaveValue('100');
});

test('the tabs work from the keyboard and the machine waits while it is out of sight', async ({ page }) => {
  await openGame(page);
  await dropOne(page);
  await autoButton(page).click();
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThanOrEqual(3);

  const tabs = page.getByRole('tab');
  await tabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  await expect(tabs.nth(1)).toBeFocused();
  await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(odds(page)).toBeVisible();
  await expect(machine(page)).toBeHidden();

  await page.waitForTimeout(400);
  const paused = await counter(page, 'played');
  await page.waitForTimeout(1_500);
  expect(await counter(page, 'played')).toBe(paused);

  await page.keyboard.press('End');
  await expect(tabs.nth(2)).toBeFocused();
  await expect(sim(page)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(tabs.nth(0)).toBeFocused();
  await expect(machine(page)).toBeVisible();
  await expect.poll(() => counter(page, 'played'), { timeout: 15_000 }).toBeGreaterThan(paused);
  await expectPurseToBalance(page);
});

test('the odds tab lists the exact chances and works out a return', async ({ page }) => {
  await openGame(page);
  await page.getByRole('tab', { name: 'Odds' }).click();
  await expect(odds(page)).toBeVisible();

  const slot = odds(page).getByTestId('pusher-slot-table');
  await expect(slot.locator('tr[data-tier="seven"]')).toContainText('0.6%');
  await expect(slot.locator('tr[data-tier="seven"]')).toContainText('1 in 167');
  await expect(slot.locator('tr[data-tier="seven"]')).toContainText('A prize ball on the field');
  await expect(slot.locator('tr[data-tier="big"]')).toContainText('A choice of three chests');
  await expect(slot.locator('tr[data-tier="small"]')).toContainText('A roll on the sugoroku board');
  await expect(slot.locator('tr[data-tier="small"]')).toContainText('8.8 medals');
  await expect(odds(page).getByTestId('pusher-board-table').locator('tbody td')).toHaveCount(12);
  await expect(odds(page).getByTestId('pusher-chest-table').locator('tbody tr')).toHaveCount(3);
  await expect(slot.locator('tr[data-tier="miss"]')).toContainText('93.9%');
  await expect(odds(page).getByTestId('pusher-roulette-table').locator('tbody tr')).toHaveCount(4);
  await expect(odds(page).getByTestId('pusher-value-table')).toContainText('1.11 medals');

  // 78% by the front and 0.22 spins a medal at 1.11 medals a spin.
  const result = odds(page).getByTestId('pusher-calc-return');
  await expect(result).toHaveText('97.0%');
  await expect(result).toHaveAttribute('data-sign', 'neg');
  await expect(odds(page).getByTestId('pusher-calc-note')).toContainText('25%');

  const front = odds(page).getByRole('slider', { name: /leave by the front/ });
  await front.focus();
  await page.keyboard.press('End');
  await expect(result).toHaveAttribute('data-sign', 'pos');
  await expect(result).toHaveText('124.4%');
  await page.keyboard.press('Home');
  await expect(result).toHaveText('62.2%');
  await expect(odds(page).getByTestId('pusher-calc-note')).toContainText('90%');
});

test('the simulation measures the four aims and can be cancelled', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  await expect(sim(page)).toBeVisible();
  await sim(page).getByLabel('Medals per aim').selectOption('500');

  const run = sim(page).getByTestId('pusher-sim-run');
  await run.click();
  await expect(sim(page).getByTestId('pusher-sim-result')).toBeVisible({ timeout: 90_000 });
  await expect(run).toHaveText('Run');
  await expect(sim(page).getByRole('heading', { name: '500 medals per aim, 5 a second' })).toBeVisible();

  const rows = sim(page).getByTestId('pusher-sim-table').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  // From the edges no medal can reach a gate; over the centre gate about one in five does.
  const cells = (aim: string) => sim(page).locator(`tr[data-aim="${aim}"] td`);
  await expect(cells('edges').nth(3)).toHaveText('0.0%');
  await expect(cells('edges').nth(5)).toHaveText('0');
  const centreGate = Number(((await cells('centre').nth(3).textContent()) ?? '').replace('%', ''));
  expect(centreGate).toBeGreaterThan(12);
  expect(centreGate).toBeLessThan(32);
  for (const aim of ['centre', 'anywhere', 'between', 'edges']) {
    const front = Number(((await cells(aim).nth(2).textContent()) ?? '').replace('%', ''));
    expect(front).toBeGreaterThan(60);
    expect(front).toBeLessThan(92);
  }
  await expect(sim(page).locator('svg[role="img"] polyline')).toHaveCount(4);
  await expect(sim(page).getByTestId('pusher-sim-slot').locator('tbody tr')).toHaveCount(4);

  // A second run can be stopped, and the first result stays.
  await sim(page).getByLabel('Medals per aim').selectOption('2000');
  await run.click();
  const cancel = sim(page).getByTestId('pusher-sim-cancel');
  await expect(cancel).toBeVisible();
  await cancel.click();
  await expect(cancel).toHaveCount(0);
  await expect(run).toHaveText('Run');
  await expect(run).toBeEnabled();
  await expect(sim(page).getByRole('heading', { name: '500 medals per aim, 5 a second' })).toBeVisible();
});

test('reads in Japanese', async ({ page }) => {
  await openGame(page, 'ja');
  await expect(page.getByRole('heading', { level: 1, name: /メダルプッシャー/ })).toBeVisible();
  await expect(dropButton(page)).toHaveText('落とす');
  await expect(machine(page).getByTestId('pusher-caption')).toContainText('1·3·5·9 ▸ 宝箱');
  await expect(machine(page).getByTestId('pusher-mode')).toHaveText('ナンバースロット');
  await expect(page.getByRole('tab', { name: '確率' })).toBeVisible();
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(odds(page).getByTestId('pusher-slot-table')).toContainText('167回に1回');
  await expect(odds(page).getByTestId('pusher-slot-table')).toContainText('3つの宝箱から1つ選ぶ');
});

test('fits a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGame(page);
  await dropOne(page);
  const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.inner);
  const box = await machine(page).getByTestId('pusher-field').boundingBox();
  expect(box?.width).toBeGreaterThan(300);
  expect(box?.width).toBeLessThanOrEqual(375);
  await expect(dropButton(page)).toBeVisible();
  await page.getByRole('tab', { name: 'Odds' }).click();
  const oddsSizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(oddsSizes.scroll).toBeLessThanOrEqual(oddsSizes.inner);
});
