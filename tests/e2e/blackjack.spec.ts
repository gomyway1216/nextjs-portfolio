import { test, expect } from '@playwright/test';

import { handValue, hiLo, type Card } from '../../src/components/game/Blackjack/engine';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { cardsIn, dealButton, finishRound, medalsShown, openBlackjack, playByHint, shownNet } from './blackjackPage';
import { pressUntil } from './pressUntil';
import { bringUnderTopBar, ledNumbers, screenBox, topBarBottom, watchLed, watchedLed } from './tableScreen';
import { bankBalance } from './medalCenterPage';

// Rounds are random: each test reads the cards off the table and checks the
// dealer's play, every total and the medals against the rules. The table plays
// with the player's medals from the medal center (blackjack-medals.spec.ts).

test('every round follows the rules and moves the medals by what it shows', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
  let left: number | null = null;
  for (let round = 0; round < 8; round++) {
    const before = await medalsShown(page);
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

    // The medals moved by exactly the results listed, in whole medals, and the medal center keeps the same count.
    const net = await shownNet(page);
    expect(Number.isInteger(net)).toBe(true);
    await expect.poll(() => medalsShown(page)).toBe(before + net);
    expect(await bankBalance(page)).toBe(before + net);
    await expect(page.getByTestId('bj-on-table')).toHaveText('2');

    // The shoe count drops by exactly the cards on the table (unless it was reshuffled).
    const shownLeft = Number((await page.getByTestId('shoe-info').textContent())?.match(/(\d+) cards left/)?.[1]);
    const onTable = dealer.length + hands.reduce((n, h) => n + h.length, 0);
    if (left !== null && left - onTable >= 0 && shownLeft <= left) expect(shownLeft).toBe(left - onTable);
    left = shownLeft;
  }
  await expect(page.getByTestId('bj-stats')).toContainText('100%');
});

test('1 BET adds a medal up to ten, MAX BET bets ten, and a hand needs a bet', async ({ page }) => {
  await openBlackjack(page);
  await expect(page.getByTestId('bj-bet')).toHaveText('2');
  await page.getByTestId('bj-one-bet').click();
  await expect(page.getByTestId('bj-bet')).toHaveText('3');
  // An odd bet: the table says how a blackjack's half medal is rounded.
  await expect(page.getByTestId('bj-bet-note')).toContainText('a bet of 3 wins 4, not 4½');
  await page.getByTestId('bj-max-bet').click();
  await expect(page.getByTestId('bj-bet')).toHaveText('10');
  await expect(page.getByTestId('bj-one-bet')).toBeDisabled();
  await expect(page.getByTestId('bj-on-table')).toHaveText('10');
  await page.getByRole('button', { name: 'Clear bet' }).click();
  await expect(page.getByTestId('bj-bet')).toHaveText('0');
  await dealButton(page).click();
  await expect(page.getByTestId('bj-message')).toHaveText('Place a bet and deal.');
  expect(await medalsShown(page)).toBe(WELCOME);
});

test('switching tabs mid-deal leaves the round intact', async ({ page }) => {
  await openBlackjack(page);
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

test('the odds tab explains every cell of the chart and the edge of every bet in medals', async ({ page }) => {
  await openBlackjack(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('bj-house-edge')).toHaveText('0.512%');
  await pressUntil(page.locator('[data-cell="hard-12-2"]'), async () => (await page.getByTestId('bj-cell-info').allTextContents()).some((text) => text.includes('12 対 ディーラーの2')));
  await expect(page.locator('[data-cell="hard-12-2"]')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('[data-cell="pairs-8-11"]').click();
  await expect(page.getByTestId('bj-cell-info')).toContainText('8,8 対 ディーラーのA');
  await expect(page.getByTestId('bj-cell-info').locator('[data-best="true"]')).toContainText('スプリット');
  await expect(page.getByTestId('rule-sixFive')).toHaveText('1.865%');
  await expect(page.getByTestId('bj-medal-table').locator('tbody tr')).toHaveCount(10);
  await expect(page.getByTestId('medal-edge-2')).toHaveText('0.512%');
  await expect(page.getByTestId('medal-edge-1')).toHaveText('2.767%');
});

test('the simulation tab plays three strategies on the same shoes, and never with the player’s medals', async ({ page }) => {
  await openBlackjack(page);
  const medals = await bankBalance(page);
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
  // Tens of thousands of rounds, and not one medal moved.
  expect(await bankBalance(page)).toBe(medals);
  await page.getByRole('tab', { name: 'Table' }).click();
  expect(await medalsShown(page)).toBe(medals);
});

test('the Hi-Lo count follows every card a player can see', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBlackjack(page);
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

test('on a phone the cards and the buttons that play them are on the screen together', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBlackjack(page);
  await page.getByTestId('bj-notice-dismiss').click();
  // How far below the table's top the buttons start: the same before a deal, in a hand and after it, so nothing moves
  // under the player's finger.
  const buttonsDrop = () =>
    page.evaluate(
      () => document.querySelector('[data-testid="bj-buttons"]')!.getBoundingClientRect().top - document.querySelector('[data-testid="bj-table"]')!.getBoundingClientRect().top,
    );
  const idleDrop = await buttonsDrop();
  for (let attempt = 0; attempt < 20; attempt++) {
    await dealButton(page).click();
    await expect(async () => {
      const acting = (await page.locator('button[data-action="stand"]:enabled').count()) > 0;
      const insurance = await page.getByTestId('bj-insurance').isVisible();
      expect(acting || insurance || (await dealButton(page).isEnabled())).toBe(true);
    }).toPass({ timeout: 10_000 });
    if ((await page.locator('button[data-action="stand"]:enabled').count()) > 0) break;
    await finishRound(page);
  }
  // The table brought up to just under the site's header, as a player scrolls to it.
  await bringUnderTopBar(page, '[data-testid="bj-table"]');
  const header = await topBarBottom(page);
  const box = (selector: string) => screenBox(page, selector);
  const table = await box('[data-testid="bj-table"]');
  const lastButton = await box('button[data-action="split"]');
  const betButton = await box('[data-testid="bj-max-bet"]');
  expect(table.top).toBeGreaterThanOrEqual(header);
  expect(lastButton.bottom).toBeLessThanOrEqual(812);
  expect(betButton.top).toBeGreaterThan(table.bottom);
  // Every card on the table is on the screen with them.
  const cards = await page
    .locator('[data-area="player"] [data-rank], [data-area="dealer"] [data-rank], [data-hole]')
    .evaluateAll((els) => els.map((el) => el.getBoundingClientRect().bottom));
  expect(cards.length).toBeGreaterThanOrEqual(3);
  for (const bottom of cards) expect(bottom).toBeLessThanOrEqual(lastButton.top);
  expect(Math.abs((await buttonsDrop()) - idleDrop)).toBeLessThanOrEqual(1);
  // Settled by standing: one hand, one line of results, and the buttons where they were.
  await page.locator('button[data-action="stand"]').click();
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
  await expect(page.getByTestId('bj-results').locator('li')).toHaveCount(1);
  expect(Math.abs((await buttonsDrop()) - idleDrop)).toBeLessThanOrEqual(1);
});

test('a win is paid beside the stake and counted up on the counter, with the sound on', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A headless browser has nothing to listen with: every sound the page starts is counted instead (as in
  // medal-machine-sound.spec.ts).
  await page.addInitScript(() => {
    const w = window as unknown as { __sounds: number };
    w.__sounds = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
      w.__sounds++;
      return start.apply(this, args);
    };
  });
  const heard = () => page.evaluate(() => (window as unknown as { __sounds: number }).__sounds);
  await openBlackjack(page);
  await page.getByTestId('bj-notice-dismiss').click();
  // The floor's sound switch: off on every visit, on with a press; the hands are played with it on.
  await expect(page.getByTestId('bj-sound')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('bj-sound').click();
  await expect(page.getByTestId('bj-sound')).toHaveAttribute('aria-pressed', 'true');

  for (let round = 0; round < 25; round++) {
    const before = await medalsShown(page);
    // The last round's win (a split one, passed over below) has been counted out, so the watch sees this round's
    // count alone: the next deal cuts a count short, and the digits jumping up to the medals is not this count.
    await expect.poll(async () => (await ledNumbers(page, '[data-testid="bj-counter"]'))[0]).toBe(before);
    await watchLed(page, '[data-testid="bj-counter"]');
    await playByHint(page);
    const hands = await page.locator('[data-hand]').count();
    const net = await shownNet(page);
    if (hands !== 1 || net <= 0) continue;
    // The dealer's payment lies beside the stake.
    await expect(page.getByTestId('hand-paid-0')).toHaveText(`+${net}`);
    // The counter ran up through the medals that came back, step by step, and ended on the medals the player holds.
    await expect.poll(async () => (await ledNumbers(page, '[data-testid="bj-counter"]'))[0]).toBe(before + net);
    const seen = await watchedLed(page);
    const climb = seen.slice(seen.indexOf(Math.min(...seen)));
    expect(climb[climb.length - 1]).toBe(before + net);
    expect(climb.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
    // The WIN digits end on the win.
    expect((await ledNumbers(page, '[data-testid="bj-counter"]'))[2]).toBe(net);
    // Heard: the switch, four cards dealt, the hole card turned, the jingle and the medals counted in.
    expect(await heard()).toBeGreaterThanOrEqual(1 + 4 + 1 + 1 + 3);
    expect(errors).toEqual([]);
    return;
  }
  throw new Error('no single-hand win in 25 rounds');
});

test('on a desktop the keys play the table: Space deals, B and M bet, H, S, D and P play the hand, I and N answer the insurance', async ({ page }) => {
  test.setTimeout(60_000);
  await openBlackjack(page);
  await page.getByTestId('bj-notice-dismiss').click();
  await expect(page.getByTestId('bj-keys')).toContainText('Space or Enter deals');
  // Keys go to the table from anywhere on the page but a field or a button (where Space presses the button).
  await page.locator('h1').click();
  await page.keyboard.press('b');
  await expect(page.getByTestId('bj-bet')).toHaveText('3');
  await page.keyboard.press('m');
  await expect(page.getByTestId('bj-bet')).toHaveText('10');
  for (let attempt = 0; attempt < 20; attempt++) {
    const before = await medalsShown(page);
    await page.keyboard.press('Space');
    await expect.poll(() => medalsShown(page)).toBeLessThan(before);
    await expect(async () => {
      const acting = (await page.locator('button[data-action="stand"]:enabled').count()) > 0;
      const insurance = await page.getByTestId('bj-insurance').isVisible();
      expect(acting || insurance || (await dealButton(page).isEnabled())).toBe(true);
    }).toPass({ timeout: 10_000 });
    if (await page.getByTestId('bj-insurance').isVisible()) {
      // N declines it, as the button does.
      await page.keyboard.press('n');
      await expect(page.getByTestId('bj-insurance')).toHaveCount(0);
    }
    if ((await page.locator('button[data-action="stand"]:enabled').count()) === 0) {
      await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
      continue;
    }
    // H draws a card; S stands and the dealer plays the hand out.
    const cards = await page.locator('[data-hand="0"] [data-rank]').count();
    await page.keyboard.press('h');
    await expect(page.locator('[data-hand="0"] [data-rank]')).toHaveCount(cards + 1);
    if ((await page.locator('button[data-action="stand"]:enabled').count()) > 0) await page.keyboard.press('s');
    await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
    await expect(page.getByTestId('bj-results')).toBeVisible();
    return;
  }
  throw new Error('no hand to play in 20 deals');
});

test('on a phone nothing over the buttons changes height as a shoe’s first hand is dealt: the call-out stays one line in either language (the insurance question, a dealer blackjack), so does the shoe line, and every button’s words fit it', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const width of [320, 375]) {
    for (const language of ['en', 'ja'] as const) {
      // The shoe is shuffled from Math.random on the first deal, so a constant one deals what the test needs: 0.01 an ace
      // over a 6 against 5 5 (insurance is offered), 0.048 a jack over an ace against 3 6 (a dealer blackjack at once).
      for (const [shuffle, shown] of [
        [0.01, 'insurance'],
        [0.048, 'blackjack'],
      ] as const) {
        const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true });
        const page = await context.newPage();
        await page.addInitScript(() => {
          const random = Math.random;
          const w = window as unknown as { __shuffle?: number };
          Math.random = () => w.__shuffle ?? random();
        });
        await openBlackjack(page, language);
        if (await page.getByTestId('bj-notice-dismiss').isVisible()) await page.getByTestId('bj-notice-dismiss').click();
        const callout = page.getByTestId('bj-callout').locator('span').first();
        /** How many lines the call-out takes. */
        const lines = () =>
          callout.evaluate((el) => {
            const range = document.createRange();
            range.selectNodeContents(el);
            return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
          });
        /** Where the buttons under the table start, on the page. */
        const buttonsAt = () => page.getByTestId('bj-buttons').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
        // The page's fonts are in, so what is measured is what stays.
        await page.evaluate(() => document.fonts.ready.then(() => undefined));
        expect(await lines()).toBe(1);
        // Every button's words fit inside it.
        const overflowing = () =>
          page
            .getByTestId('bj-buttons')
            .locator('button')
            .evaluateAll((els) => els.filter((el) => el.getBoundingClientRect().width > 0 && el.scrollWidth > el.clientWidth).map((el) => el.textContent));
        expect(await overflowing(), `${width} ${language}`).toEqual([]);
        const before = await buttonsAt();
        await pressUntil(page.getByTestId('bj-max-bet'), async () => (await page.getByTestId('bj-bet').textContent())?.trim() === '10');
        await page.evaluate((value) => ((window as unknown as { __shuffle?: number }).__shuffle = value), shuffle);
        await dealButton(page).click();
        if (shown === 'insurance') {
          await expect(page.getByTestId('bj-insurance')).toBeVisible();
          await expect(callout).toHaveText(language === 'en' ? 'The dealer shows an ace.' : 'ディーラーのアップカードはA。');
          await expect(page.getByTestId('bj-insurance')).toContainText(language === 'en' ? 'Insurance for 5 medals?' : 'インシュランスは5枚です。');
          // Its two answers side by side, as a machine's YES and NO.
          const answers = page.getByTestId('bj-insurance').getByRole('button');
          await expect(answers).toHaveText(language === 'en' ? ['Yes', 'No'] : ['掛ける', '掛けない']);
          const rows = await answers.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
          expect(new Set(rows).size, `${width} ${language}`).toBe(1);
        } else {
          await expect(callout).toHaveText(language === 'en' ? 'Dealer blackjack · −10 medals' : 'ディーラーのブラックジャック・−10枚');
        }
        await page.evaluate(() => delete (window as unknown as { __shuffle?: number }).__shuffle);
        expect(await lines(), `${width} ${language} ${shown}`).toBe(1);
        // The shoe line said a fresh shoe would be shuffled; now it counts the cards left, in the same room.
        await expect(page.getByTestId('shoe-info')).toContainText(language === 'en' ? 'cards left' : '残り');
        expect(Math.abs((await buttonsAt()) - before), `${width} ${language} ${shown}`).toBeLessThan(1);
        expect(await overflowing(), `${width} ${language} ${shown}`).toEqual([]);
        await context.close();
      }
    }
  }
});
