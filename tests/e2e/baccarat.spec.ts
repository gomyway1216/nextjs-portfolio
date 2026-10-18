import { test, expect } from '@playwright/test';

import { betOdds, exactOdds } from '../../src/components/game/Baccarat/analysis';
import { RANKS, fullShoeCounts, type Rank } from '../../src/components/game/Baccarat/engine';
import { medalsBack } from '../../src/components/game/Baccarat/medals';
import { getStrings } from '../../src/components/game/Baccarat/i18n';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { betStep, cardsOf, dealAndSettle, dealButton, firstBet, handOnTable, medalsShown, onTable, openBaccarat, replay, spot } from './baccaratPage';
import { arrived } from './streamedPage';
import { pressUntil } from './pressUntil';
import { bankBalance } from './medalCenterPage';
import { bringUnderTopBar, ledNumbers, screenBox, topBarBottom, watchLed, watchedLed } from './tableScreen';

// Hands are random: the test reads the dealt cards off the table, replays
// them through the engine's drawing rules and checks the table against it.
// The table plays with the player's medals from the Medal Game Center: a new
// browser is a new guest, with a new member's medals.

test('a dealt hand follows the drawing rules and settles every bet in whole medals', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  expect(await medalsShown(page)).toBe(WELCOME);
  await betStep(page, 5);
  await firstBet(page, /^Banker \(1:1/); // Banker 5
  await spot(page, /^Banker \(1:1/).click(); // Banker 10
  await spot(page, /^Tie \(8:1\)/).click(); // Tie 5
  await spot(page, /^Player Pair/).click(); // Player Pair 5
  expect(await onTable(page)).toBe(20);
  expect(await medalsShown(page)).toBe(WELCOME - 20);
  // Nothing has left the player's medals yet: they go at the deal.
  expect(await bankBalance(page)).toBe(WELCOME);

  await dealAndSettle(page);
  const player = await cardsOf(page, 'player');
  const banker = await cardsOf(page, 'banker');
  const hand = replay(player, banker);
  expect(hand.player).toEqual(player);
  expect(hand.banker).toEqual(banker);
  await expect(page.getByTestId('player-total')).toHaveText(String(hand.playerTotal));
  await expect(page.getByTestId('banker-total')).toHaveText(String(hand.bankerTotal));

  const { returned } = medalsBack({ banker: 10, tie: 5, playerPair: 5 }, hand, 'ez');
  const expected = WELCOME - 20 + returned;
  await expect.poll(() => bankBalance(page)).toBe(expected);
  expect(await medalsShown(page)).toBe(expected);
  expect(await onTable(page)).toBe(0);
  await expect(page.getByTestId('baccarat-won')).toHaveAttribute('data-medals', String(returned));
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  await expect(page.locator(`[data-road="bead"] [data-cell="${hand.winner}"]`)).toHaveCount(1);

  // The live odds for the next hand come from exactly the unseen cards:
  // the shoe minus the exposed burn card and the six (or fewer) dealt cards.
  const info = (await page.getByTestId('shoe-info').textContent()) ?? '';
  const burn = info.match(/Burn card (10|[A2-9JQK])/);
  expect(burn, info).not.toBeNull();
  const counts = fullShoeCounts(8);
  const seen = [burn![1] === '10' ? 'T' : burn![1], ...[...player, ...banker].map((c) => c.rank)] as Rank[];
  for (const rank of seen) counts[RANKS.indexOf(rank)]--;
  const next = exactOdds(counts);
  const bankerWin = `${(betOdds('bankerEz', next).win * 100).toFixed(3)}%`;
  await expect(page.locator('[data-live="banker"] td').nth(1)).toHaveText(bankerWin);
  await expect(page.getByText(`Computed from the ${next.cards} cards`)).toBeVisible();
});

test('rebet and a run of hands keep the medals straight, and the table carries on after a reload', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await betStep(page, 5);
  await firstBet(page, /^Player \(1:1\)/);
  let expected = WELCOME;
  for (let i = 0; i < 8; i++) {
    if (i > 0) await page.getByRole('button', { name: 'Rebet' }).click();
    expect(await onTable(page)).toBe(5);
    expected -= 5;
    await dealAndSettle(page);
    expected += medalsBack({ player: 5 }, await handOnTable(page), 'ez').returned;
    await expect.poll(() => medalsShown(page)).toBe(expected);
  }
  expect(await bankBalance(page)).toBe(expected);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(8);
  await expect(page.getByTestId('shoe-info')).toContainText('Hand 8');
  // The table has no reset of its own: the medals are reset only at the Medal Game Center.
  await expect(page.getByRole('button', { name: 'Reset' })).toHaveCount(0);
  await expect(page.getByTestId('baccarat-center')).toHaveAttribute('href', '/games/medal-center');

  // A reload carries on with the same shoe, scoreboards and medals.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('baccarat-counter')).toHaveAttribute('data-loaded', 'true');
  await expect.poll(() => medalsShown(page)).toBe(expected);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(8);
  await expect(page.getByTestId('shoe-info')).toContainText('Hand 8');
  await expect(page.locator('[data-hand="player"] [data-rank]').first()).toBeVisible();
});

test('the 5% table bets the Banker in twenties, pays it 19 for 20, and has no Dragon 7 or Panda 8', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await expect(page.getByRole('radio', { name: 'No commission (EZ)' })).toHaveAttribute('aria-checked', 'true');
  await expect(spot(page, /^Dragon 7 \(40:1\)/)).toBeVisible();
  await firstBet(page, /^Player \(1:1\)/);
  // Can't switch tables with medals on the felt.
  await page.getByRole('radio', { name: '5% commission' }).click();
  await expect(page.getByTestId('baccarat-message')).toHaveText('Take your bets down to switch tables.');
  await page.getByRole('button', { name: 'Clear' }).click();
  expect(await onTable(page)).toBe(0);
  await page.getByRole('radio', { name: '5% commission' }).click();
  await expect(page.getByRole('radio', { name: '5% commission' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByTestId('ez-bets')).toHaveCount(0);
  // One press of BET 1 on the Banker puts 20 medals down: 5% of 20 is a whole medal.
  await spot(page, /^Banker \(0\.95:1 · in 20s\)/).click();
  await expect(page.getByTestId('stake-banker')).toHaveText('20');
  await spot(page, /^Tie \(8:1\)/).click();
  expect(await onTable(page)).toBe(21);
  await dealAndSettle(page);
  const hand = await handOnTable(page);
  const { returned } = medalsBack({ banker: 20, tie: 1 }, hand, 'commission');
  if (hand.winner === 'banker') expect(returned).toBe(39);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 21 + returned);
  // The limits: a Tie takes up to 20 medals.
  await betStep(page, 20);
  await spot(page, /^Tie \(8:1\)/).click();
  await spot(page, /^Tie \(8:1\)/).click();
  await expect(page.getByTestId('baccarat-message')).toHaveText('Tie takes up to 20 medals.');
  await expect(page.getByTestId('stake-tie')).toHaveText('20');
});

test('switching tabs mid-deal does not drop the hand', async ({ page }) => {
  await openBaccarat(page);
  await firstBet(page, /^Player \(1:1\)/);
  await dealButton(page).click();
  await expect(page.getByRole('button', { name: 'Dealing…' })).toBeVisible();
  await page.getByRole('tab', { name: 'Odds' }).click();
  await page.waitForTimeout(3_500);
  await page.getByRole('tab', { name: 'Table' }).click();
  await expect(dealButton(page)).toBeEnabled();
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1);
  expect(await onTable(page)).toBe(0);
});

test('the odds tab recomputes the exact odds for each deck count', async ({ page }) => {
  await openBaccarat(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('edge-banker')).toHaveText('1.058%');
  await expect(page.getByTestId('total-ways')).toHaveText('4,998,398,275,503,360');
  await expect(async () => {
    await page.getByRole('radio', { name: '6デッキ' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('edge-banker')).toHaveText('1.056%', { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId('p-tie')).toHaveText('9.5069%');
  await page.getByRole('radio', { name: '1デッキ' }).click();
  await expect(page.getByTestId('edge-banker')).toHaveText('1.012%');
  await expect(page.getByTestId('pair-body')).toContainText('= 1/17');
});

test('the simulation tab runs every simulation through the real rules, and never touches the medals', async ({ page }) => {
  await openBaccarat(page);
  const before = await bankBalance(page);
  await page.getByRole('tab', { name: 'Simulation' }).click();
  const section = (title: string) => page.locator('section', { has: page.getByRole('heading', { name: title }) });

  const lines = section('Every bet on the same cards');
  await lines.getByRole('combobox').selectOption('10000');
  await expect(async () => {
    await lines.getByRole('button', { name: 'Run' }).click({ timeout: 1_000 });
    await expect(page.getByTestId('baccarat-sim-lines')).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByTestId('baccarat-sim-lines').locator('tbody tr')).toHaveCount(7);
  await expect(page.getByTestId('baccarat-sim-lines')).toContainText('Simulated (10,000 hands)');

  const road = section('Chasing the road');
  await road.getByRole('combobox').selectOption('10000');
  await road.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('baccarat-sim-patterns').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('baccarat-sim-patterns').locator('tr[data-pattern="banker"] td').nth(2)).toHaveText('100.0%');
  await expect(page.getByTestId('baccarat-sim-streaks')).toContainText('complete shoes');

  const counting = section('Counting cards');
  await counting.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('baccarat-sim-counting')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('baccarat-sim-counting').locator('tbody tr')).toHaveCount(7);
  // The main bets almost never favor even a perfect counter.
  const bankerFavorable = await page.getByTestId('baccarat-sim-counting').locator('tr[data-line="banker"] td').nth(1).textContent();
  expect(parseFloat(bankerFavorable ?? '')).toBeLessThan(3);
  await expect(page.getByText(/^10 shoes, [\d,]+ hands\./)).toBeVisible();
  // Thousands of simulated hands, and not one medal moved.
  expect(await bankBalance(page)).toBe(before);
});

test('on a phone the cards, the felt and DEAL are on the screen together', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openBaccarat(page);
  await page.getByTestId('baccarat-notice-ok').click();
  await firstBet(page, /^Banker \(1:1/);
  await dealAndSettle(page);
  await bringUnderTopBar(page, '[data-hand="player"]');
  const bar = await topBarBottom(page);
  const cards = await screenBox(page, '[data-hand="player"]');
  const felt = await screenBox(page, 'button[data-bet="banker"]');
  const deal = await screenBox(page, 'button:text-is("DEAL")');
  expect(cards.top).toBeGreaterThanOrEqual(bar);
  expect(felt.top).toBeGreaterThan(cards.bottom);
  expect(deal.bottom).toBeLessThanOrEqual(812);
});

test('the last coup stays on the felt, the win paid beside its stake, and the counter counts the medals back, with the sound on', async ({ page }) => {
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
  await openBaccarat(page);
  await page.getByTestId('baccarat-notice-ok').click();
  // The floor's sound switch: off on every visit, on with a press; the coup is played with it on.
  await expect(page.getByTestId('baccarat-sound')).toHaveAttribute('aria-pressed', 'false');
  await page.getByTestId('baccarat-sound').click();
  await expect(page.getByTestId('baccarat-sound')).toHaveAttribute('aria-pressed', 'true');
  await betStep(page, 5);
  for (let coup = 0; coup < 12; coup++) {
    // Five on the Player and five on the Banker: one of them wins unless the hand is a tie.
    if (coup === 0) await firstBet(page, /^Player \(1:1/);
    else await spot(page, /^Player \(1:1/).click();
    await spot(page, /^Banker \(1:1/).click();
    const before = await medalsShown(page);
    await watchLed(page, '[data-testid="baccarat-counter"]');
    await dealAndSettle(page);
    const hand = await handOnTable(page);
    const { returned, results } = medalsBack({ player: 5, banker: 5 }, hand, 'ez');
    // A tie pushes both; a Banker win on a three-card 7 pushes the Banker and loses the Player: no win to see.
    const won = results.find((r) => r.outcome === 'win');
    if (!won) continue;
    // The winning spot keeps its stake with the medals paid beside it; the losing one is cleared.
    await expect(page.getByTestId(`paid-${won.id}`)).toHaveText(`+${won.profit}`);
    await expect(page.getByTestId(`paid-${won.id === 'player' ? 'banker' : 'player'}`)).toHaveCount(0);
    // The counter ran up through the medals that came back, ending on the medals in hand.
    await expect.poll(async () => (await ledNumbers(page, '[data-testid="baccarat-counter"]'))[0]).toBe(before + returned);
    const seen = await watchedLed(page);
    const climb = seen.slice(seen.indexOf(Math.min(...seen)));
    expect(climb[0]).toBe(before);
    expect(climb[climb.length - 1]).toBe(before + returned);
    expect(climb.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < climb.length; i++) expect(climb[i]).toBeGreaterThan(climb[i - 1]);
    // A new bet clears the last coup off the felt.
    await spot(page, /^Player \(1:1/).click();
    await expect(page.getByTestId(`paid-${won.id}`)).toHaveCount(0);
    // Heard: the switch, the medals put down, every card turned, the fanfare and the medals counted in.
    expect(await heard()).toBeGreaterThanOrEqual(1 + 2 + 4 + 1 + 3);
    expect(errors).toEqual([]);
    return;
  }
  throw new Error('no bet won in twelve coups');
});

test('on a desk the keys play the table as its buttons do: P, B and T bet, U takes one off, Space deals, R puts the bets back', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openBaccarat(page);
  await expect(page.getByTestId('baccarat-keys')).toHaveText('Keys: Space or Enter deals · P Player · B Banker · T Tie · R rebet · U undo');
  // A first medal by a press, once the table holds the card; then the keys, with nothing focused.
  await firstBet(page, /^Player \(1:1\)/); // Player 1
  const blur = () => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await blur();
  await page.keyboard.press('b'); // Banker 1
  await page.keyboard.press('t'); // Tie 1
  await expect.poll(() => onTable(page)).toBe(3);
  await page.keyboard.press('u'); // the Tie off again
  await expect.poll(() => onTable(page)).toBe(2);

  const scrolled = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Space');
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1, { timeout: 10_000 });
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
  // Space dealt; it did not scroll the page.
  expect(await page.evaluate(() => window.scrollY)).toBe(scrolled);
  const first = medalsBack({ player: 1, banker: 1 }, await handOnTable(page), 'ez').returned;
  await expect.poll(() => medalsShown(page)).toBe(WELCOME - 2 + first);

  // R puts the same two medals back, and Enter deals them.
  await page.keyboard.press('r');
  await expect.poll(() => onTable(page)).toBe(2);
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(2, { timeout: 10_000 });
  await expect(dealButton(page)).toBeEnabled({ timeout: 10_000 });
  const second = medalsBack({ player: 1, banker: 1 }, await handOnTable(page), 'ez').returned;
  await expect.poll(() => medalsShown(page)).toBe(WELCOME - 4 + first + second);

  // On the odds tab the keys are the page's again.
  await page.getByRole('tab', { name: 'Odds' }).click();
  await blur();
  await page.keyboard.press('p');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'Table' }).click();
  expect(await onTable(page)).toBe(0);
  await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(2);
});

test('on a phone the shoe line keeps its two lines through a shoe’s first deal and the call-out says any result on one line, so the table and its buttons do not move', async ({ browser }) => {
  test.setTimeout(90_000);
  for (const width of [320, 375]) {
    for (const language of ['en', 'ja'] as const) {
      const context = await browser.newContext({ viewport: { width, height: 740 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await openBaccarat(page, language);
      if (await page.getByTestId('baccarat-notice-ok').isVisible()) await page.getByTestId('baccarat-notice-ok').click();
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
      const shoe = page.getByTestId('shoe-info');
      /** The shoe line's height, how many lines each of its rows takes, and whether any row's words run past its end. */
      const shoeLine = () =>
        shoe.evaluate((el) => ({
          height: Math.round(el.getBoundingClientRect().height * 10) / 10,
          // Lines, as the tops of the row's boxes that are more than half a line apart.
          rows: [...el.children].map((row) => {
            const range = document.createRange();
            range.selectNodeContents(row);
            const tops = [...range.getClientRects()].map((r) => r.top).sort((a, b) => a - b);
            return tops.filter((top, i) => i === 0 || top - tops[i - 1] > 8).length;
          }),
          cut: [...el.children].filter((row) => row.scrollWidth > row.clientWidth).map((row) => row.textContent),
        }));
      /** Where the Player spot starts, on the page. */
      const playerAt = () => page.locator('button[data-bet="player"]:visible').first().evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
      const before = await shoeLine();
      expect(before.rows, `${width} ${language}`).toEqual([1, 1]);
      expect(before.cut, `${width} ${language}`).toEqual([]);
      const spotBefore = await playerAt();
      const player = page.locator('button[data-bet="player"]:visible').first();
      await pressUntil(player, async () => (await onTable(page)) > 0);
      await page.getByRole('button', { name: language === 'en' ? 'DEAL' : 'ディール', exact: true }).click();
      await expect(page.locator('[data-road="bead"] [data-cell]')).toHaveCount(1, { timeout: 10_000 });
      await expect(shoe).toContainText(language === 'en' ? /Burn card .+ burned/ : /バーンカード .+捨て札/);
      const after = await shoeLine();
      expect(after.rows, `${width} ${language}`).toEqual([1, 1]);
      expect(after.cut, `${width} ${language}`).toEqual([]);
      expect(after.height, `${width} ${language}`).toBe(before.height);
      expect(Math.abs((await playerAt()) - spotBefore), `${width} ${language}`).toBeLessThan(1);

      // Whatever a hand ends in, the call-out says it on one line: every result there is, put in its place in turn.
      const t = getStrings(language);
      const said: string[] = [t.placeBets, t.dealing];
      for (const natural of [false, true])
        for (const winner of ['player', 'banker', 'tie'] as const) said.push(t.result(winner, 9, 8, natural));
      said.push(`${t.result('banker', 6, 7, false)} · ${t.dragon7Hit}`, `${t.result('player', 7, 8, false)} · ${t.panda8Hit}`);
      const wrapped = await page
        .getByTestId('baccarat-callout')
        .locator('span')
        .first()
        .evaluate((span, texts) => {
          const kept = span.textContent;
          const out: string[] = [];
          for (const text of texts) {
            span.textContent = text;
            const range = document.createRange();
            range.selectNodeContents(span);
            const tops = [...range.getClientRects()].map((r) => r.top).sort((a, b) => a - b);
            if (tops.filter((top, i) => i === 0 || top - tops[i - 1] > 8).length > 1) out.push(text);
          }
          span.textContent = kept;
          return out;
        }, said);
      expect(wrapped, `${width} ${language}`).toEqual([]);
      await context.close();
    }
  }
});
