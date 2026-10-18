import { test, expect, type Page } from '@playwright/test';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { getStrings } from '../../src/components/game/HorseRace/i18n';
import { RACE_KEY, parseRace, type RaceRecord } from '../../src/components/game/HorseRace/medalTable';
import { MY_PAGE_PATH } from '../../src/components/game/MedalCenter/paths';
import { bankBalance, openCenter } from './medalCenterPage';
import { onPageError } from './pageErrors';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Mini Turf Racing on the medal center's floor: tickets bought with the player's medals at the off, a race drawn in the
// press of START and run to that result, what the winning tickets bring back paid once, through a skip and a reload,
// on a phone in both languages. Nothing here signs in: the medals are a guest's, on this device. The draw is rigged
// with rigPresses: four numbers of 0 run the horses home in gate order, 1 then 2.

const IN_GATE_ORDER = [0, 0, 0, 0];

async function openRace(page: Page, language: 'en' | 'ja' = 'en'): Promise<void> {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/horse-race');
  expect(response?.status()).toBe(200);
  await arrived(page);
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

const ticket = (page: Page, key: string) => page.getByTestId(`hr-ticket-${key}`);
const medalsOn = async (page: Page, key: string) => Number(await ticket(page, key).getAttribute('data-medals'));
const oddsOn = async (page: Page, key: string) => Number(await ticket(page, key).getAttribute('data-odds'));
const shownMedals = async (page: Page) => Number(await page.getByTestId('hr-meter').getAttribute('data-medals'));

/** The first press after the page arrives: pressed until it has landed, and never once more. */
async function firstTicket(page: Page, key: string): Promise<void> {
  await pressUntil(ticket(page, key), async () => (await medalsOn(page, key)) > 0);
  expect(await medalsOn(page, key)).toBe(1);
}

async function raceOnRecord(page: Page): Promise<RaceRecord | null> {
  return parseRace(await page.evaluate((key) => window.localStorage.getItem(key), RACE_KEY));
}

const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('tickets are bought at the off, the race is run to the drawn result, and the winning tickets pay once', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  onPageError(page, (error) => errors.push(error.message));
  await openRace(page);
  await expect(page.getByTestId('hr-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('hr-center')).toHaveAttribute('href', '/games/medal-center');
  await expect(page.getByTestId('hr-race')).toHaveText('RACE 1');
  expect(await shownMedals(page)).toBe(WELCOME);

  // A win ticket on 1, a quinella on 1-2 and a win ticket on 6: one medal each.
  await firstTicket(page, 'win:1');
  await ticket(page, 'quinella:1-2').click();
  await ticket(page, 'win:6').click();
  await expect.poll(() => shownMedals(page)).toBe(WELCOME - 3);
  // On the board, not bought yet: the medals are still all there, and betting closes in a minute.
  expect(await bankBalance(page)).toBe(WELCOME);
  await expect(page.getByTestId('hr-status')).toHaveText(getStrings('en').statusCloses(60));
  const win = await oddsOn(page, 'win:1');
  const quinella = await oddsOn(page, 'quinella:1-2');
  expect(win).toBeGreaterThanOrEqual(2);
  expect(quinella).toBeGreaterThanOrEqual(2);

  // START: the result is drawn in the press. 1 wins, 2 is second.
  await rigPresses(page, IN_GATE_ORDER);
  await page.getByTestId('hr-start').click();
  const result = page.getByTestId('hr-result');
  await expect(result).toHaveAttribute('data-shown', 'true', { timeout: 15_000 });
  await expect(result).toHaveAttribute('data-order', '123456');
  const won = win + quinella;
  await expect(result).toHaveAttribute('data-won', String(won));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 3 + won);
  await expect.poll(() => shownMedals(page)).toBe(WELCOME - 3 + won);
  expect(await raceOnRecord(page)).toMatchObject({ race: 1, order: [1, 2, 3, 4, 5, 6], wagered: 3, won, paid: true });
  // The board holds the result for a moment, the winning tickets lit (確定), then the next race is up.
  await expect(ticket(page, 'win:1')).toHaveAttribute('data-won', 'true');
  await expect(ticket(page, 'quinella:1-2')).toHaveAttribute('data-won', 'true');
  await expect(page.getByTestId('hr-status')).toHaveText(getStrings('en').statusResult);
  await expect(page.getByTestId('hr-race')).toHaveText('RACE 2', { timeout: 10_000 });
  await expect(page.getByTestId('hr-status')).toHaveText(getStrings('en').statusOpen);
  await expect(page.getByTestId('hr-history').locator('tbody tr')).toHaveCount(1);
  await expect(page.getByTestId('hr-history').locator('tbody tr').first()).toContainText(`+${won - 3}`);

  // A reload shows the same medals, the last race, and race 2 next; nothing is paid again.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('hr-race')).toHaveText('RACE 2');
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-earlier', 'true');
  expect(await shownMedals(page)).toBe(WELCOME - 3 + won);
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME - 3 + won));
  await expect(page.getByTestId('center-play-horse-race')).toHaveAttribute('href', '/games/horse-race');
  // My Page has the race in the machine's records: one round, three medals played, what came back.
  expect((await page.goto(MY_PAGE_PATH))?.status()).toBe(200);
  await arrived(page);
  const records = page.getByTestId('mypage-game-horse-race');
  await expect(records).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(records).toContainText('Mini Turf Racing');
  expect(errors).toEqual([]);
});

test('a losing race takes its tickets’ medals and pays nothing, and the same tickets go back on the next card', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRace(page);
  await firstTicket(page, 'win:6');
  await ticket(page, 'quinella:5-6').click();
  await rigPresses(page, IN_GATE_ORDER);
  await page.getByTestId('hr-start').click();
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-order', '123456', { timeout: 15_000 });
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-won', '0');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
  await expect(page.getByTestId('hr-result-line')).toContainText(getStrings('en').lost(2));
  // Race 2: the same tickets, at the new card's odds.
  await expect(page.getByTestId('hr-race')).toHaveText('RACE 2', { timeout: 10_000 });
  await page.getByTestId('hr-rebet').click();
  expect(await medalsOn(page, 'win:6')).toBe(1);
  expect(await medalsOn(page, 'quinella:5-6')).toBe(1);
  expect(await shownMedals(page)).toBe(WELCOME - 4);
});

test('the race runs on the track with the caller and the running order, and can be skipped to the finish', async ({ page }) => {
  await openRace(page);
  await firstTicket(page, 'win:2');
  await rigPresses(page, IN_GATE_ORDER);
  await page.getByTestId('hr-start').click();
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-phase', 'running');
  await expect(page.getByTestId('hr-start')).toBeDisabled();
  // The gate opens, the caller calls it, and the horses move.
  await expect(page.getByTestId('hr-commentary')).toContainText('off', { timeout: 6_000 });
  const before = await page.locator('[data-gate="1"]').getAttribute('transform');
  await page.waitForTimeout(600);
  expect(await page.locator('[data-gate="1"]').getAttribute('transform')).not.toBe(before);
  // Skipped: the finish at once, and the photo of it.
  const skipAt = Date.now();
  await page.getByTestId('hr-skip').click();
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-shown', 'true', { timeout: 3_000 });
  expect(Date.now() - skipAt).toBeLessThan(3_000);
  await expect(page.getByTestId('hr-photo')).toBeVisible();
  await expect(page.getByTestId('hr-order')).toHaveAttribute('data-order', '123456');
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-order', '123456');
  // 2 came second: the win ticket on it lost.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);
});

test('a reload while the horses are running pays the race once, as it was drawn', async ({ page }) => {
  await openRace(page);
  await firstTicket(page, 'win:1');
  const odds = await oddsOn(page, 'win:1');
  await rigPresses(page, IN_GATE_ORDER);
  await page.getByTestId('hr-start').click();
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-phase', 'running');
  // Bought: the medal is out on the race, which is not over yet.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);
  // Left mid-race: the race was settled as the page went (its result was drawn at the off).
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-order', '123456');
  await expect(page.getByTestId('hr-race')).toHaveText('RACE 2');
  expect(await raceOnRecord(page)).toMatchObject({ order: [1, 2, 3, 4, 5, 6], won: odds, paid: true });
  await page.waitForTimeout(1_000);
  expect(await bankBalance(page)).toBe(WELCOME - 1 + odds);
  expect(await shownMedals(page)).toBe(WELCOME - 1 + odds);
});

test('betting closes by itself a minute after the first ticket, and the race is run', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.clock.install();
  await openRace(page);
  await firstTicket(page, 'win:3');
  await expect(page.getByTestId('hr-status')).toHaveText(getStrings('en').statusCloses(60));
  await page.clock.runFor(30_000);
  await expect(page.getByTestId('hr-status')).toHaveText(getStrings('en').statusCloses(30));
  await page.clock.runFor(31_000);
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-shown', 'true', { timeout: 10_000 });
  const record = await raceOnRecord(page);
  expect(record).toMatchObject({ race: 1, wagered: 1, paid: true });
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1 + record!.won);
});

test('on the keyboard: 1 to 6 buy a win ticket, U takes the last one back, and Space starts', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRace(page);
  await firstTicket(page, 'win:4');
  await page.locator('body').click({ position: { x: 2, y: 2 } });
  await page.keyboard.press('4');
  await page.keyboard.press('5');
  await expect.poll(() => medalsOn(page, 'win:4')).toBe(2);
  expect(await medalsOn(page, 'win:5')).toBe(1);
  await page.keyboard.press('u');
  await expect.poll(() => medalsOn(page, 'win:5')).toBe(0);
  await rigPresses(page, IN_GATE_ORDER);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('hr-result')).toHaveAttribute('data-order', '123456', { timeout: 15_000 });
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
});

for (const width of [375, 320]) {
  for (const language of ['en', 'ja'] as const) {
    test(`fits a ${width}px phone in ${language === 'en' ? 'English' : 'Japanese'}, and nothing on it moves as a race starts`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await openRace(page, language);
      const t = getStrings(language);
      expect(await sideways(page)).toBeLessThanOrEqual(0);
      await expect(page.getByTestId('hr-not-money')).toHaveText(NOT_MONEY[language]);
      await expect(page.locator('[data-testid^="hr-ticket-"]')).toHaveCount(21);
      await expect(page.getByRole('tab', { name: t.tabRace })).toHaveAttribute('aria-selected', 'true');
      // Every ticket is inside the screen's width.
      for (const box of await page.locator('[data-testid^="hr-ticket-"]').evaluateAll((all) => all.map((el) => el.getBoundingClientRect().toJSON()))) {
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
      }
      await firstTicket(page, 'win:1');
      const places = () =>
        page.evaluate(() => {
          const at = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
          const stage = at('hr-board');
          return ['hr-track', 'hr-commentary', 'hr-result', 'hr-meter', 'hr-win-tickets', 'hr-quinella-tickets', 'hr-start', 'hr-skip'].map((id) => {
            const box = at(id);
            return [id, Math.round(box.top - stage.top), Math.round(box.height), Math.round(box.left)];
          });
        });
      const before = await places();
      await rigPresses(page, IN_GATE_ORDER);
      await page.getByTestId('hr-start').click();
      await expect(page.getByTestId('hr-machine')).toHaveAttribute('data-phase', 'running');
      expect(await places()).toEqual(before);
      await expect(page.getByTestId('hr-result')).toHaveAttribute('data-shown', 'true', { timeout: 15_000 });
      expect(await places()).toEqual(before);
      expect(await sideways(page)).toBeLessThanOrEqual(0);
    });
  }
}

test('the Odds tab shows this race’s exact chances, every ticket of a kind bringing back the same 89.5% to 90%', async ({ page }) => {
  await openRace(page, 'ja');
  await page.getByRole('tab', { name: '確率' }).click();
  const odds = page.getByTestId('hr-odds');
  await expect(odds).toBeVisible();
  await expect(odds.getByRole('heading', { level: 2 })).toHaveText('第1レース：正確な確率');
  await expect(page.getByTestId('hr-odds-win').locator('tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('hr-odds-quinella').locator('tbody tr')).toHaveCount(15);
  for (const id of ['hr-odds-win-return', 'hr-odds-quinella-return']) {
    const text = (await page.getByTestId(id).locator('strong').textContent()) ?? '';
    const share = Number(/([\d.]+)%$/.exec(text)?.[1]);
    expect(share, text).toBeGreaterThanOrEqual(89.5);
    expect(share, text).toBeLessThanOrEqual(90);
  }
  // The tab's own check: races run on the card come back near the exact figure.
  await page.getByTestId('hr-odds-check').click();
  await expect(page.getByTestId('hr-odds-checked')).toBeVisible();
  // The board's card is the tab's: the same odds for gate 1.
  await page.getByRole('tab', { name: 'レース' }).click();
  const board = await oddsOn(page, 'win:1');
  await page.getByRole('tab', { name: '確率' }).click();
  await expect(page.getByTestId('hr-odds-win').locator('tbody tr').first()).toContainText(`${board}倍`);
  expect(await sideways(page)).toBeLessThanOrEqual(0);
});

test('on the narrowest phone the race caller’s every line fits its box, in Japanese', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 700 });
  await openRace(page, 'ja');
  await firstTicket(page, 'win:1');
  await page.getByTestId('hr-start').click();
  // Every line the caller says, sampled as the race runs: none spills out of the two lines kept for it.
  const lines = new Set<string>();
  const clipped: string[] = [];
  const box = page.getByTestId('hr-commentary');
  while ((await page.getByTestId('hr-result').getAttribute('data-shown')) !== 'true') {
    const seen = await box.evaluate((el) => ({ text: el.textContent ?? '', over: el.scrollHeight > el.clientHeight + 1 }));
    lines.add(seen.text);
    if (seen.over) clipped.push(seen.text);
    await page.waitForTimeout(150);
  }
  expect(clipped).toEqual([]);
  expect(lines.size).toBeGreaterThanOrEqual(5);
});
