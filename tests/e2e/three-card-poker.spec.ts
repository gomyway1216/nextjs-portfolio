import { test, expect, type Page } from '@playwright/test';

import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { WELCOME, createLedger, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { createSession } from '../../src/components/game/MedalPusher/session';
import { STORAGE_KEY, serialize } from '../../src/components/game/MedalPusher/storage';
import { handOdds } from '../../src/components/game/ThreeCardPoker/analysis';
import { decide, evaluate, settle, type Bets, type Card, type Decision, type Rank, type Suit } from '../../src/components/game/ThreeCardPoker/engine';
import { NOTICE_KEY, TABLE_KEY, TCP_GAME, parseHand, serializeHand, tableKey } from '../../src/components/game/ThreeCardPoker/medalTable';
import { bankBalance, openCenter, resetAtCenter, storedBank } from './medalCenterPage';
import { arrived } from './streamedPage';
import { bringUnderTopBar, ledNumbers, screenBox, topBarBottom, watchLed, watchedLed } from './tableScreen';

// Hands are random: the tests read the dealt cards off the table, settle them
// with the engine and check the table against it. The table plays with the
// medal center's medals (a new member's 100 in a fresh browser), so every
// check of what a hand took and gave is made against the medals the browser
// keeps, read the way the medal center reads them.

async function openGame(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/three-card-poker');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(page.getByTestId('tcp-callout')).toBeVisible();
  // The medals have been read.
  await expect(page.getByTestId('tcp-counter')).toHaveAttribute('data-loaded', 'true');
}

/** The medals on the table's counter. */
async function medals(page: Page): Promise<number> {
  return Number(((await page.getByTestId('tcp-medals').textContent()) ?? '').replace(/,/g, ''));
}

/** The name the seeded guest's medals are kept under. */
const SEEDED = 'seedtable01';

/** Medals for this browser's guest, as the medal center keeps them, put in before the page opens. */
async function seedMedals(page: Page, count: number, hand: string | null = null) {
  const ledger = take(createLedger(SEEDED), WELCOME - count);
  expect(ledger).not.toBeNull();
  await page.addInitScript(
    ([bankKey, bank, tableKey, table]) => {
      if (window.localStorage.getItem(bankKey) !== null) return;
      window.localStorage.setItem(bankKey, bank);
      if (table !== null) window.localStorage.setItem(tableKey, table);
    },
    [BANK_KEY, serializeLedger(ledger!), tableKey(SEEDED), hand] as const,
  );
}

/** The hand kept for this browser's guest's medals, as text, or null. */
async function storedHand(page: Page): Promise<string | null> {
  const ledger = await storedBank(page);
  return ledger ? page.evaluate((key) => window.localStorage.getItem(key), tableKey(ledger.device)) : null;
}

const onTable = (page: Page) => page.getByTestId('tcp-on-table');
const message = (page: Page) => page.getByTestId('tcp-message');
const anteSpot = (page: Page) => page.getByRole('button', { name: /^Ante \(1:1\)/ });
const pairPlusSpot = (page: Page) => page.getByRole('button', { name: /^Pair Plus \(/ });
const dealButton = (page: Page) => page.getByRole('button', { name: 'DEAL', exact: true });
const playButton = (page: Page) => page.getByRole('button', { name: 'PLAY', exact: true });
const foldButton = (page: Page) => page.getByRole('button', { name: 'FOLD', exact: true });
const stepOf = (page: Page, n: number) => page.getByRole('radio', { name: `Bet ${n} ${n === 1 ? 'medal' : 'medals'} per press` });

/** Picks how many medals a press bets, until hydration has attached the handlers. */
async function chooseStep(page: Page, n: number) {
  await expect(async () => {
    await stepOf(page, n).click({ timeout: 1_000 });
    await expect(stepOf(page, n)).toHaveAttribute('aria-checked', 'true', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

/** Clicks the Ante until hydration has attached handlers and the table holds the member's card. */
async function firstAnte(page: Page) {
  await expect(async () => {
    await anteSpot(page).click({ timeout: 1_000 });
    await expect(onTable(page)).not.toHaveText('0', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
}

async function cardsOf(page: Page, side: 'player' | 'dealer'): Promise<Card[]> {
  return page
    .locator(`[data-hand="${side}"] [data-rank]`)
    .evaluateAll((els) => els.map((el) => ({ rank: el.getAttribute('data-rank'), suit: el.getAttribute('data-suit') })))
    .then((cards) => cards.map((c) => ({ rank: c.rank as Rank, suit: c.suit as Suit })));
}

/** Deals and waits until the player may act; the dealer's cards must still be hidden. */
async function deal(page: Page): Promise<Card[]> {
  await dealButton(page).click();
  await expect(playButton(page)).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(3);
  await expect(page.locator('[data-hand="dealer"] [data-hole]')).toHaveCount(3);
  await expect(page.locator('[data-hand="dealer"] [data-rank]')).toHaveCount(0);
  return cardsOf(page, 'player');
}

/** Plays or folds and waits until the dealer's cards are up and the bets are paid. */
async function act(page: Page, decision: Decision): Promise<Card[]> {
  await (decision === 'play' ? playButton(page) : foldButton(page)).click();
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
  await expect(page.locator('[data-hand="dealer"] [data-rank]')).toHaveCount(3);
  await expect(page.locator('[data-hand="dealer"] [data-hole]')).toHaveCount(0);
  return cardsOf(page, 'dealer');
}

/** The counter and the medals the browser keeps both say `count`. */
async function medalsAre(page: Page, count: number) {
  await expect.poll(() => medals(page)).toBe(count);
  await expect.poll(() => bankBalance(page)).toBe(count);
}

const signed = (v: number, digits: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(digits)}`;
const signedCount = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth);

test('a played hand shows its exact value and settles every bet by the rules, in medals taken and given once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await medalsAre(page, WELCOME);
  await chooseStep(page, 5);
  await firstAnte(page); // Ante 5
  await anteSpot(page).click(); // Ante 10
  await pairPlusSpot(page).click(); // Pair Plus 5
  await expect(onTable(page)).toHaveText('15');
  // Nothing is taken until the deal.
  await medalsAre(page, WELCOME);
  // Each spot tells screen readers what is on it, next to its name.
  await expect(anteSpot(page)).toHaveAccessibleDescription('10');
  await expect(pairPlusSpot(page)).toHaveAccessibleDescription('5');

  const player = await deal(page);
  expect(new Set(player.map((c) => `${c.rank}${c.suit}`)).size).toBe(3);
  // The Ante and Pair Plus came out at the deal.
  await medalsAre(page, WELCOME - 15);

  // The live panel is the exact enumeration for these three cards.
  const odds = handOdds(player);
  await expect(page.locator('[data-ev="play"]')).toContainText(signed(odds.evPlay, 3));
  await expect(page.locator('[data-ev="fold"]')).toContainText('−1.000');
  // Those are the Ante & Play bets only, and the panel says so: Pair Plus is on the table too.
  await expect(page.getByTestId('tcp-ev').getByRole('heading')).toHaveText('This hand — exact value of the Ante & Play bets');
  await expect(page.getByTestId('tcp-ev')).toContainText('Pair Plus is not included');
  await expect(page.locator(`[data-ev="${odds.best}"]`)).toHaveAttribute('data-best', 'true');
  await expect(page.locator('[data-case="notQualified"] dd')).toHaveText(`${((odds.notQualified / 18424) * 100).toFixed(2)}%`);
  // … and the hint is the Q-6-4 rule applied to them.
  await expect(page.getByTestId('tcp-hint')).toHaveAttribute('data-decision', decide('optimal', player));

  const dealer = await act(page, 'play');
  expect(new Set([...player, ...dealer].map((c) => `${c.rank}${c.suit}`)).size).toBe(6);
  const bets: Bets = { ante: 10, pairPlus: 5 };
  const result = settle(bets, 'play', player, dealer);
  // 85 after the deal, 10 more for the Play bet, then whatever comes back: in the counter and in the medals kept.
  await medalsAre(page, WELCOME - 15 - 10 + result.returned);
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('tcp-hand-net')).toHaveText(signedCount(result.net));
  await expect(page.getByTestId('tcp-net')).toHaveText(result.net === 0 ? '0' : signedCount(result.net));
  await expect(page.getByTestId('dealer-hand')).toHaveAttribute('data-qualifies', String(result.dealerQualifies));
  const lines = page.getByTestId('tcp-results').locator('li[data-outcome]');
  await expect(lines).toHaveCount(result.lines.length);
  for (const [i, line] of result.lines.entries()) {
    await expect(lines.nth(i)).toHaveAttribute('data-line', line.id);
    await expect(lines.nth(i)).toHaveAttribute('data-outcome', line.outcome);
  }
  // The Ante Bonus appears exactly when the hand is a straight or better.
  const category = evaluate(player).category;
  const bonus = category === 'straight' || category === 'threeOfAKind' || category === 'straightFlush';
  await expect(page.locator('li[data-line="anteBonus"]')).toHaveCount(bonus ? 1 : 0);
  // The hand is kept as paid: nothing pays it again.
  await expect.poll(async () => parseHand(await storedHand(page))?.paid).toBe(true);
});

test('folding forfeits the Ante and Pair Plus and still shows the dealer', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStep(page, 5);
  await firstAnte(page);
  await pairPlusSpot(page).click();
  await medalsAre(page, WELCOME);

  const player = await deal(page);
  await medalsAre(page, WELCOME - 10);
  const dealer = await act(page, 'fold');
  expect(settle({ ante: 5, pairPlus: 5 }, 'fold', player, dealer).returned).toBe(0);
  await medalsAre(page, WELCOME - 10);
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('tcp-callout')).toHaveText('You folded · lost 10 medals');
  // Readable red on the light panel (6.4:1), not the felt's brighter one.
  await expect(page.getByTestId('tcp-callout').locator('span')).toHaveCSS('color', 'rgb(185, 28, 28)');
  await expect(page.getByTestId('tcp-results').locator('li[data-outcome]')).toHaveCount(2);
  await expect(page.locator('li[data-line="ante"]')).toHaveAttribute('data-outcome', 'lose');
  await expect(page.locator('li[data-line="pairPlus"]')).toHaveAttribute('data-outcome', 'lose');
  await expect(page.locator('li[data-line="play"]')).toHaveCount(0);
});

test('rebet and a run of hands on the strategy keep the medals straight', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  // One medal a press to begin with, as a cabinet's 1BET button.
  await expect(stepOf(page, 1)).toHaveAttribute('aria-checked', 'true');
  await firstAnte(page);
  let expected = WELCOME;
  let played = 0;
  for (let i = 0; i < 10; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    await expect(onTable(page)).toHaveText('1');
    const player = await deal(page);
    const decision = decide('optimal', player);
    await expect(page.getByTestId('tcp-hint')).toHaveAttribute('data-decision', decision);
    const dealer = await act(page, decision);
    expected += settle({ ante: 1, pairPlus: 0 }, decision, player, dealer).net;
    if (decision === 'play') played++;
    await medalsAre(page, expected);
    await expect(onTable(page)).toHaveText('0');
  }
  const stats = page.getByTestId('tcp-stats');
  await expect(stats).toContainText('Hands10');
  await expect(stats).toContainText(`Played${played}`);
  await expect(stats).toContainText('Agreed with the strategy100%');
  await expect(page.getByTestId('tcp-net')).toHaveText(expected === WELCOME ? '0' : signedCount(expected - WELCOME));
  // The medals are reset only at the Medal Game Center: the table has no reset of its own.
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0);
});

test('the table asks for an Ante, keeps the Play bet behind, and takes up to 10 medals a spot', async ({ page }) => {
  await seedMedals(page, 12);
  await openGame(page);
  await medalsAre(page, 12);
  await expect(async () => {
    await dealButton(page).click({ timeout: 1_000 });
    await expect(message(page)).toHaveText('Bet at least 1 medal on the Ante first.', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(playButton(page)).toBeDisabled();
  await expect(foldButton(page)).toBeDisabled();
  // The bet per press is one tab stop, and the arrow keys move along it.
  await stepOf(page, 1).focus();
  await page.keyboard.press('ArrowRight');
  await expect(stepOf(page, 5)).toHaveAttribute('aria-checked', 'true');
  await expect(stepOf(page, 5)).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(stepOf(page, 1)).toHaveAttribute('aria-checked', 'true');

  // Pair Plus alone is not enough to be dealt in.
  await pairPlusSpot(page).click();
  await dealButton(page).click();
  await expect(message(page)).toHaveText('Bet at least 1 medal on the Ante first.');
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(onTable(page)).toHaveText('0');

  // Ten a spot at most, and no more than the medals there are.
  await chooseStep(page, 10);
  await anteSpot(page).click();
  await expect(onTable(page)).toHaveText('10');
  await anteSpot(page).click();
  await expect(message(page)).toHaveText('Up to 10 medals on each spot.');
  await expect(onTable(page)).toHaveText('10');
  await pairPlusSpot(page).click();
  await expect(message(page)).toHaveText('Not enough medals for that bet.');
  await page.getByRole('button', { name: 'Clear' }).click();

  // 5 on the Ante and 5 on Pair Plus leaves 2 of the 5 the Play bet needs.
  await chooseStep(page, 5);
  await anteSpot(page).click();
  await pairPlusSpot(page).click();
  await dealButton(page).click();
  await expect(message(page)).toHaveText('Keep 5 medals for the Play bet — lower the Ante or the Pair Plus bet.');
  await medalsAre(page, 12);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(onTable(page)).toHaveText('5');
  await deal(page);
  await medalsAre(page, 7);
});

test('switching tabs mid-hand does not drop the hand', async ({ page }) => {
  await openGame(page);
  await firstAnte(page);
  await dealButton(page).click();
  await expect(page.getByRole('button', { name: 'Dealing…' })).toBeVisible();
  await page.getByRole('tab', { name: 'Odds' }).click();
  await page.waitForTimeout(2_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  // The deal finished while the tab was hidden and is waiting for a decision.
  await expect(playButton(page)).toBeEnabled();
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(3);
  await expect(onTable(page)).toHaveText('1');

  await playButton(page).click();
  await page.getByRole('tab', { name: 'Simulation' }).click();
  await page.waitForTimeout(2_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(dealButton(page)).toBeEnabled();
  await expect(page.locator('[data-hand="dealer"] [data-rank]')).toHaveCount(3);
  await expect(onTable(page)).toHaveText('0');
  await expect(page.getByTestId('tcp-stats')).toContainText('Hands1');
});

test('a bet takes medals and a win adds them, and the Medal Game Center shows the same count after a reload', async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await firstAnte(page);
  await pairPlusSpot(page).click();
  let count = WELCOME;
  // Hands of 1 + 1 on the strategy until one wins: most do within a few.
  for (let hand = 0; hand < 40; hand++) {
    if (hand > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    const player = await deal(page);
    count -= 2;
    await medalsAre(page, count);
    const decision = decide('optimal', player);
    if (decision === 'play') {
      await playButton(page).click();
      count -= 1;
    } else {
      await foldButton(page).click();
    }
    await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
    const dealer = await cardsOf(page, 'dealer');
    const result = settle({ ante: 1, pairPlus: 1 }, decision, player, dealer);
    count += result.returned;
    await medalsAre(page, count);
    if (result.net > 0) {
      await expect(page.getByTestId('tcp-callout')).toContainText(`won ${result.net} ${result.net === 1 ? 'medal' : 'medals'}`);
      break;
    }
  }
  expect(await page.getByTestId('tcp-results').count()).toBe(1);

  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('tcp-counter')).toHaveAttribute('data-loaded', 'true');
  await medalsAre(page, count);
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(count.toLocaleString('en-US'));
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('center-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('center-balance')).toHaveText(count.toLocaleString('en-US'));
  // And the hub shows the table open, with a way in.
  await expect(page.locator('li[data-machine="three-card-poker"]')).toHaveAttribute('data-open', 'true');
  await expect(page.getByTestId('center-play-three-card-poker')).toHaveAttribute('href', '/games/three-card-poker');
});

test('a reload mid-hand keeps the hand: the stakes are not given back, the cards are the same, and Play is taken once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStep(page, 5);
  await firstAnte(page);
  const player = await deal(page);
  await medalsAre(page, WELCOME - 5);

  await page.reload();
  await arrived(page);
  await expect(playButton(page)).toBeEnabled({ timeout: 10_000 });
  await expect(message(page)).toHaveText('Your hand was kept as it was: play or fold.');
  expect(await cardsOf(page, 'player')).toEqual(player);
  await expect(page.locator('[data-hand="dealer"] [data-hole]')).toHaveCount(3);
  await expect(onTable(page)).toHaveText('5');
  await medalsAre(page, WELCOME - 5);
  // Nothing new can be dealt over it.
  await expect(dealButton(page)).toBeDisabled();

  const dealer = await act(page, 'play');
  const result = settle({ ante: 5, pairPlus: 0 }, 'play', player, dealer);
  await medalsAre(page, WELCOME - 10 + result.returned);
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('tcp-counter')).toHaveAttribute('data-loaded', 'true');
  // The paid hand is shown as it ended, and is not paid again.
  await expect(page.getByTestId('tcp-hand-net')).toHaveText(signedCount(result.net));
  await medalsAre(page, WELCOME - 10 + result.returned);
});

test('a hand decided just before the page went away is paid once when it comes back', async ({ page }) => {
  // Q-K-A of spades against 7-high: Ante 1:1, Play pushes, the Ante Bonus 5:1 and Pair Plus 40:1. The Ante, Pair
  // Plus and Play bets (5 each) have been taken; nothing has been paid.
  const cards = (texts: string[]) => texts.map((text) => ({ rank: text[0] as Rank, suit: text[1] as Suit }));
  const hand = { v: 1 as const, era: 0, device: SEEDED, player: cards(['Q♠', 'K♠', 'A♠']), dealer: cards(['2♥', '5♦', '7♣']), bets: { ante: 5, pairPlus: 5 }, decision: 'play' as const, paid: false };
  const won = settle(hand.bets, 'play', hand.player, hand.dealer).returned;
  expect(won).toBe(245);
  await seedMedals(page, WELCOME - 15, serializeHand(hand));
  await openGame(page);
  await medalsAre(page, WELCOME - 15 + won);
  await expect(page.getByTestId('tcp-callout')).toHaveText('Dealer doesn’t qualify — Ante pays, Play pushes · won 230 medals');
  await expect(page.locator('li[data-line="anteBonus"]')).toHaveCount(1);
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('tcp-counter')).toHaveAttribute('data-loaded', 'true');
  await page.waitForTimeout(1_000);
  await medalsAre(page, WELCOME - 15 + won);
});

test('when another tab takes the medals the table stops taking bets and says so, and Play here brings them back', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await firstAnte(page);
  const other = await context.newPage();
  await other.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(other);
  // The first tab waits, and says why, with a button to play there again.
  await expect(page.getByTestId('tcp-card-away')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('tcp-play-here')).toHaveText('Play here');
  await expect(dealButton(page)).toBeDisabled();
  await expect(anteSpot(page)).toBeDisabled();
  // The second plays a hand with the same medals.
  await firstAnte(other);
  const player = await deal(other);
  const dealer = await act(other, 'fold');
  expect(settle({ ante: 1, pairPlus: 0 }, 'fold', player, dealer).returned).toBe(0);
  await medalsAre(other, WELCOME - 1);
  // Back to the first: it has the medals again, as the second left them, and the second waits.
  await page.bringToFront();
  await page.getByTestId('tcp-play-here').click();
  await expect(page.getByTestId('tcp-card-away')).toHaveCount(0);
  await expect(other.getByTestId('tcp-card-away')).toBeVisible({ timeout: 10_000 });
  await medalsAre(page, WELCOME - 1);
  // It shows the hand the other tab played, as that tab left it.
  expect(await cardsOf(page, 'player')).toEqual(player);
  await expect(dealButton(page)).toBeEnabled();
  await page.getByRole('button', { name: 'Clear' }).click();
  await firstAnte(page);
  await deal(page);
  await medalsAre(page, WELCOME - 2);
});

test('leaving for another page while the dealer turns over pays the hand as the table is put away', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);
  await chooseStep(page, 5);
  await firstAnte(page);
  await pairPlusSpot(page).click();
  const player = await deal(page);
  await medalsAre(page, WELCOME - 10);
  // Play, and at once go to the games list by the site's own link: the page is not reloaded, the table is taken down
  // in the middle of the dealer's turning over (it pays at the end of it, more than a second later).
  await playButton(page).click();
  const leftAt = Date.now();
  await page.locator('a[href="/games"]').first().click();
  await page.waitForURL(/\/games$/);
  const tookMs = Date.now() - leftAt;
  const dealer = await (async () => {
    const hand = parseHand(await storedHand(page));
    expect(hand?.paid).toBe(true);
    return hand!.dealer;
  })();
  const result = settle({ ante: 5, pairPlus: 5 }, 'play', player, dealer);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 15 + result.returned);
  test.info().annotations.push({ type: 'left after', description: `${tookMs} ms` });
});

test('a reset heard in a tab whose medals are away starts that tab over too', async ({ page, context }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await firstAnte(page);
  const player = await deal(page);
  await act(page, decide('optimal', player));
  await expect(page.getByTestId('tcp-stats')).toContainText('Hands1');
  // Another tab takes the medals, and resets them at the Medal Game Center.
  const other = await context.newPage();
  await openGame(other);
  await expect(page.getByTestId('tcp-card-away')).toBeVisible({ timeout: 10_000 });
  await resetAtCenter(other);
  // This tab's session and the bets to repeat are gone, although it never had the medals back.
  await expect(page.getByTestId('tcp-stats')).toContainText('Hands0', { timeout: 10_000 });
  await expect(message(page)).toHaveText('The medals have been reset at the Medal Game Center: this table starts over.');
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(0);
  await page.bringToFront();
  await page.getByTestId('tcp-play-here').click();
  await expect(page.getByTestId('tcp-card-away')).toHaveCount(0);
  await medalsAre(page, WELCOME);
  await page.getByRole('button', { name: 'Rebet' }).click();
  await expect(onTable(page)).toHaveText('0');
});

test('after the Medal Game Center’s reset the table starts over: a hand from before is gone, and nothing of it is paid', async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openGame(page);
  await chooseStep(page, 10);
  await firstAnte(page);
  await deal(page);
  await medalsAre(page, WELCOME - 10);
  await resetAtCenter(page);
  await openGame(page);
  await medalsAre(page, WELCOME);
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(0);
  await expect(page.getByTestId('tcp-callout')).toHaveText('Place your Ante, then deal.');
  await expect(dealButton(page)).toBeEnabled();
  // This device's table is written down as started over in the new era, and the old hand is gone.
  await expect.poll(async () => {
    const ledger = await storedBank(page);
    return ledger ? (ledger.restarted[`${TCP_GAME}@${ledger.device}`] ?? -1) : -1;
  }).toBe(1);
  expect(await storedHand(page)).toBeNull();
  await firstAnte(page);
  await deal(page);
  await medalsAre(page, WELCOME - 1);
});

test('old saved state crashes nothing, an old Medal Pusher purse is the medals, and the notice is shown once', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // What the table might find: nothing it ever wrote (it kept its chips in memory), so a text it cannot read under
  // its own name; and a Medal Pusher saved before the medal center, with 1,234 medals in its own purse.
  const session = createSession(5, { balls: 0 });
  session.credits = 1234;
  await page.addInitScript(
    ([machineKey, machine, tableKey]) => {
      if (window.localStorage.getItem('tcp-test-seeded') !== null) return;
      window.localStorage.setItem('tcp-test-seeded', '1');
      window.localStorage.setItem(machineKey, machine);
      window.localStorage.setItem(tableKey, '{"bankroll":1000,"chips":[1,5,25,100,500],"bets":{"ante":5}}');
    },
    [STORAGE_KEY, serialize(session), TABLE_KEY] as const,
  );
  await openGame(page);
  await medalsAre(page, 1234);
  await expect(page.getByTestId('tcp-medals')).toHaveText('1,234');
  await expect(page.locator('[data-hand="player"] [data-rank]')).toHaveCount(0);
  // The notice that the table plays with medals now, with the way to the Medal Game Center.
  const notice = page.getByTestId('tcp-medals-notice');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('The 1,000 practice chips this table used to start you with are retired');
  await expect(page.getByTestId('tcp-notice-center')).toHaveAttribute('href', '/games/medal-center');
  await page.getByTestId('tcp-notice-ok').click();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), NOTICE_KEY)).toBe('1');
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('tcp-counter')).toHaveAttribute('data-loaded', 'true');
  await expect(page.getByTestId('tcp-medals-notice')).toHaveCount(0);
  // The table deals over the text it could not read.
  await firstAnte(page);
  await deal(page);
  await medalsAre(page, 1233);
  expect(errors).toEqual([]);
});

test('the medal counter, its note and the table fit a phone in both languages, light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  await expect(page.getByTestId('tcp-not-money')).toHaveText(
    'Medals are for playing the games on this site only. They are not money: they cannot be bought, cashed out or exchanged for anything.',
  );
  await expect(page.getByTestId('tcp-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('tcp-counter-center')).toHaveAttribute('href', '/games/medal-center');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await openGame(page, 'ja');
  await expect(page.getByTestId('tcp-not-money')).toHaveText('メダルはこのサイトのゲームで遊ぶためだけのものです。お金ではなく、購入・換金・景品との交換はできません。');
  await expect(page.getByTestId('tcp-counter').getByRole('heading')).toHaveText('持ちメダル');
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await page.evaluate(() => document.documentElement.classList.add('dark'));
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});

test('the odds tab shows the exact counts and reprices Pair Plus', async ({ page }) => {
  await openGame(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('edge-ante')).toHaveText('3.37%');
  await expect(page.getByTestId('element-of-risk')).toHaveText('2.01%');
  await expect(page.getByTestId('dealer-qualifies')).toHaveText('69.59%');
  await expect(page.getByTestId('play-rate')).toHaveText('67.42%');
  await expect(page.getByTestId('total-combinations')).toHaveText('407,170,400');
  await expect(page.getByTestId('ways-straightFlush')).toHaveText('48');
  await expect(page.getByTestId('ways-highCard')).toHaveText('16,440');
  await expect(page.getByTestId('edge-strategy-always')).toHaveText('7.65%');
  await expect(page.locator('tr[data-hand="Q64"]')).toHaveAttribute('data-best', 'play');
  await expect(page.locator('tr[data-hand="Q63"]')).toHaveAttribute('data-best', 'fold');
  await expect(page.getByTestId('tcp-ev-curve')).toBeVisible();
  // The same edges in medals.
  await expect(page.getByTestId('tcp-medals-note')).toContainText('平均16.74枚を賭け、そのうち0.34枚を失います');

  await expect(page.getByTestId('pairplus-return')).toHaveText('−7.28%');
  await expect(async () => {
    await page.getByRole('radio', { name: '1-4-6-30-40（元の配当）' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('pairplus-return')).toHaveText('−2.32%', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.locator('tr[data-category="flush"] td').nth(3)).toHaveText('4:1');
  // Both edges stay on show whichever table is selected.
  await expect(page.getByTestId('edge-pairplus-standard')).toHaveText('7.28%');
  await expect(page.getByTestId('edge-pairplus-old')).toHaveText('2.32%');
});

test('the simulation tab plays the three strategies through the real rules, and leaves the medals alone', async ({ page }) => {
  await openGame(page);
  await medalsAre(page, WELCOME);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const section = page.locator('section', { has: page.getByRole('heading', { name: 'Three strategies on the same cards' }) });
  await section.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await section.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('tcp-sim-table')).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  const table = page.getByTestId('tcp-sim-table');
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table).toContainText('Simulated (10,000 hands)');
  // Exact edges alongside, and the never-fold strategy plays every hand.
  await expect(table.locator('tr[data-strategy="optimal"] td').nth(2)).toHaveText('3.373%');
  await expect(table.locator('tr[data-strategy="mimic"] td').nth(2)).toHaveText('3.449%');
  await expect(table.locator('tr[data-strategy="always"] td').nth(2)).toHaveText('7.654%');
  await expect(table.locator('tr[data-strategy="always"] td').nth(3)).toHaveText('100.00%');
  const optimalPlayed = await table.locator('tr[data-strategy="optimal"] td').nth(3).textContent();
  expect(parseFloat(optimalPlayed ?? '')).toBeGreaterThan(64);
  expect(parseFloat(optimalPlayed ?? '')).toBeLessThan(71);
  await expect(page.locator('[data-series]')).toHaveCount(3);
  await expect(page.getByTestId('tcp-sim-note')).toContainText('exact: 69.59%');
  // Dark label on the green Run button.
  await expect(section.getByRole('button', { name: 'Run' })).toHaveCSS('color', 'rgb(4, 20, 10)');
  // Ten thousand hands, and not a medal moved.
  await medalsAre(page, WELCOME);
});

test('on a phone the cards and PLAY / FOLD are on the screen together when the player decides', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openGame(page);
  await page.getByTestId('tcp-notice-ok').click();
  await firstAnte(page);
  await deal(page);
  await bringUnderTopBar(page, '[data-hand="dealer"]');
  const bar = await topBarBottom(page);
  const dealer = await screenBox(page, '[data-hand="dealer"]');
  const player = await screenBox(page, '[data-hand="player"]');
  const fold = await screenBox(page, 'button[data-action="fold"]');
  expect(dealer.top).toBeGreaterThanOrEqual(bar);
  expect(fold.top).toBeGreaterThan(player.bottom);
  expect(fold.bottom).toBeLessThanOrEqual(812);
});

test('the last hand stays on the felt, a win paid beside its stake, and the counter counts the medals back; the sound switch is kept', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openGame(page);
  await page.getByTestId('tcp-notice-ok').click();
  await expect(page.getByTestId('tcp-sound')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('tcp-sound').click();
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('tcp-sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tcp-counter')).toHaveAttribute('data-loaded', 'true');
  for (let hand = 0; hand < 30; hand++) {
    if (hand === 0) await firstAnte(page);
    else await anteSpot(page).click();
    const before = await medals(page);
    // The last hand's return (a tie's, passed over below) has been counted out, so the watch sees this hand's count
    // alone: a bet here takes no medals, so it does not cut a count short.
    await expect.poll(async () => (await ledNumbers(page, '[data-testid="tcp-counter"]'))[0]).toBe(before);
    await watchLed(page, '[data-testid="tcp-counter"]');
    const player = await deal(page);
    const decision = decide('optimal', player);
    const dealer = await act(page, decision);
    const result = settle({ ante: 1, pairPlus: 0 }, decision, player, dealer);
    if (result.net <= 0) continue;
    const ante = result.lines.find((l) => l.id === 'ante')!;
    const bonus = result.lines.find((l) => l.id === 'anteBonus')?.profit ?? 0;
    // The Ante keeps its stake with the medals paid beside it (its bonus with it).
    await expect(page.getByTestId('paid-ante')).toHaveText(`+${ante.profit + bonus}`);
    // The counter ran up through the medals that came back, ending on the medals the player holds.
    await expect.poll(async () => (await ledNumbers(page, '[data-testid="tcp-counter"]'))[0]).toBe(before + result.net);
    const seen = await watchedLed(page);
    const climb = seen.slice(seen.indexOf(Math.min(...seen)));
    expect(climb[climb.length - 1]).toBe(before + result.net);
    expect(climb.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
    // The WIN window ends on what came back.
    expect((await ledNumbers(page, '[data-testid="tcp-counter"]'))[2]).toBe(result.returned);
    // A new bet clears the last hand off the felt.
    await anteSpot(page).click();
    await expect(page.getByTestId('paid-ante')).toHaveCount(0);
    expect(errors).toEqual([]);
    return;
  }
  throw new Error('no winning hand in 30');
});
