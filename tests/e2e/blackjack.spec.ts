import { test, expect, type Page } from '@playwright/test';

import { handValue, hiLo, type Card, type Rank, type Suit } from '../../src/components/game/Blackjack/engine';

// Rounds are random: each test reads the cards off the table and checks the
// dealer's play, every total and the payouts against the rules.

async function openBlackjack(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/blackjack');
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('bj-callout')).toBeVisible();
}

const bankroll = async (page: Page) => Number(await page.getByTestId('bj-bankroll').textContent());
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });

/** Clicks the betting circle until hydration has attached handlers. */
async function hydrate(page: Page) {
  await expect(async () => {
    await page.getByRole('radio', { name: 'Chip 5', exact: true }).click({ timeout: 1_000 });
    await page.getByRole('button', { name: /^Betting circle/ }).click({ timeout: 1_000 });
    await expect(page.getByTestId('bj-bet')).toHaveText('15', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function cardsIn(page: Page, selector: string): Promise<Card[]> {
  return page.locator(`${selector} [data-rank]`).evaluateAll((els) =>
    els.map((el) => ({ rank: el.getAttribute('data-rank') as Rank, suit: el.getAttribute('data-suit') as Suit })),
  );
}

/** Deals and plays a round by the basic-strategy hint, declining insurance. */
async function playByHint(page: Page) {
  await dealButton(page).click();
  await finishRound(page);
}

/** Plays the round in progress to the end by the hint. */
async function finishRound(page: Page) {
  for (let step = 0; step < 20; step++) {
    await expect(async () => {
      const done = await dealButton(page).isEnabled();
      const insurance = await page.getByTestId('bj-insurance').isVisible();
      const hinted = await page.locator('button[data-hint="true"][data-action]:enabled').count();
      expect(done || insurance || hinted > 0).toBe(true);
    }).toPass({ timeout: 10_000 });
    if (await dealButton(page).isEnabled()) return;
    if (await page.getByTestId('bj-insurance').isVisible()) {
      await page.getByRole('button', { name: 'No insurance' }).click();
      continue;
    }
    await page.locator('button[data-hint="true"][data-action]:enabled').first().click();
  }
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
}

test('every round follows the rules and pays what it shows', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  await hydrate(page);
  let left: number | null = null;
  for (let round = 0; round < 8; round++) {
    const before = await bankroll(page);
    await playByHint(page);
    const dealer = await cardsIn(page, '[data-area="dealer"]');
    const handCount = await page.locator('[data-hand]').count();
    const hands: Card[][] = [];
    for (let i = 0; i < handCount; i++) hands.push(await cardsIn(page, `[data-hand="${i}"]`));

    const dealerTotal = handValue(dealer).total;
    const naturalEnd = (dealer.length === 2 && dealerTotal === 21) || (handCount === 1 && hands[0].length === 2 && handValue(hands[0]).total === 21);
    const allBust = hands.every((h) => handValue(h).total > 21);
    if (!naturalEnd && !allBust) {
      // The dealer drew to 17 and stopped there (standing on soft 17).
      expect(dealerTotal).toBeGreaterThanOrEqual(17);
      if (dealer.length > 2) expect(handValue(dealer.slice(0, -1)).total).toBeLessThan(17);
    } else {
      expect(dealer).toHaveLength(2);
    }
    await expect(page.getByTestId('dealer-total')).toContainText(String(dealerTotal));
    for (let i = 0; i < handCount; i++) {
      const total = handValue(hands[i]).total;
      if (total <= 21 && !(handCount === 1 && hands[i].length === 2 && total === 21)) {
        await expect(page.getByTestId(`hand-total-${i}`)).toContainText(String(total));
      }
    }

    // The bankroll moved by exactly the results listed.
    const amounts = await page
      .getByTestId('bj-results')
      .locator('li span:last-child')
      .evaluateAll((els) => els.map((el) => el.textContent ?? ''));
    const net = amounts.reduce((sum, a) => sum + (a.startsWith('±') ? 0 : Number(a.replace('−', '-').replace('+', ''))), 0);
    expect(await bankroll(page)).toBeCloseTo(before + net, 6);
    expect(await page.getByTestId('bj-on-table').textContent()).toBe('0');

    // The shoe count drops by exactly the cards on the table (unless it was reshuffled).
    const shownLeft = Number((await page.getByTestId('shoe-info').textContent())?.match(/(\d+) cards left/)?.[1]);
    const onTable = dealer.length + hands.reduce((n, h) => n + h.length, 0);
    if (left !== null && left - onTable >= 0 && shownLeft <= left) expect(shownLeft).toBe(left - onTable);
    left = shownLeft;
  }
  await expect(page.getByTestId('bj-stats')).toContainText('100%');
});

test('the betting circle takes chips and a round needs a bet', async ({ page }) => {
  await openBlackjack(page);
  await hydrate(page); // 10 + 5
  await page.getByRole('radio', { name: 'Chip 25', exact: true }).click();
  await page.getByRole('button', { name: /^Betting circle/ }).click();
  await expect(page.getByTestId('bj-bet')).toHaveText('40');
  await page.getByRole('button', { name: 'Clear bet' }).click();
  await expect(page.getByTestId('bj-bet')).toHaveText('0');
  await dealButton(page).click();
  await expect(page.getByTestId('bj-message')).toHaveText('Place a bet and deal.');
  await expect(page.getByTestId('bj-bankroll')).toHaveText('1000');
});

test('switching tabs mid-deal leaves the round intact', async ({ page }) => {
  await openBlackjack(page);
  await hydrate(page);
  await dealButton(page).click();
  await page.getByRole('tab', { name: 'Odds' }).click();
  await page.waitForTimeout(1_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(async () => {
    const done = await dealButton(page).isEnabled();
    const acting = await page.locator('button[data-action="stand"]:enabled').count();
    const insurance = await page.getByTestId('bj-insurance').isVisible();
    expect(done || acting > 0 || insurance).toBe(true);
  }).toPass({ timeout: 10_000 });
  await expect(page.getByTestId('bj-on-table')).not.toHaveText('');
});

test('the odds tab explains every cell of the chart', async ({ page }) => {
  await openBlackjack(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('bj-house-edge')).toHaveText('0.512%');
  await expect(async () => {
    await page.locator('[data-cell="hard-12-2"]').click({ timeout: 1_000 });
    await expect(page.getByTestId('bj-cell-info')).toContainText('12 対 ディーラーの2', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('[data-cell="hard-12-2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-cell="pairs-8-11"]').click();
  await expect(page.getByTestId('bj-cell-info')).toContainText('8,8 対 ディーラーのA');
  await expect(page.getByTestId('bj-cell-info').locator('[data-best="true"]')).toContainText('スプリット');
  await expect(page.getByTestId('rule-sixFive')).toHaveText('1.865%');
});

test('the simulation tab plays three strategies on the same shoes', async ({ page }) => {
  await openBlackjack(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const strategies = page.locator('section', { has: page.getByRole('heading', { name: 'Three ways to play, same shoes' }) });
  await strategies.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await strategies.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('bj-sim-table')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId('bj-sim-table').locator('tbody tr')).toHaveCount(3);
  await expect(page.getByTestId('bj-sim-table')).toContainText('Simulated (10,000 rounds)');

  // Counting: flat vs spread on the same rounds, bars for every true count.
  const counting = page.locator('section', { has: page.getByRole('heading', { name: 'Counting cards' }) });
  await counting.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('bj-count-table')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('bj-count-table').locator('tbody tr')).toHaveCount(2);
  await expect(counting.locator('[data-tc]')).toHaveCount(12);
});

test('the Hi-Lo count follows every card a player can see', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  await hydrate(page);
  await page.getByLabel('Count cards (Hi-Lo)').check();
  await expect(page.getByTestId('bj-running-count')).toHaveText('0');
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  const tableCount = async () => {
    const all = [...(await cardsIn(page, '[data-area="dealer"]')), ...(await cardsIn(page, '[data-area="player"]'))];
    return all.reduce((n, card) => n + hiLo(card), 0);
  };

  await playByHint(page);
  let count = await tableCount();
  await expect(page.getByTestId('bj-running-count')).toHaveText(signed(count));

  // Mid-round, the face-down hole card is not counted (and not in the DOM as a card).
  await dealButton(page).click();
  await expect(async () => {
    const waiting = (await page.locator('button[data-action="stand"]:enabled').count()) > 0 || (await page.getByTestId('bj-insurance').isVisible());
    expect(waiting || (await dealButton(page).isEnabled())).toBe(true);
  }).toPass({ timeout: 10_000 });
  if (!(await dealButton(page).isEnabled())) {
    expect(await page.locator('[data-hole="true"]').count()).toBe(1);
    await expect(page.getByTestId('bj-running-count')).toHaveText(signed(count + (await tableCount())));
  }
  await finishRound(page);
  count += await tableCount();
  await expect(page.getByTestId('bj-running-count')).toHaveText(signed(count));
});
