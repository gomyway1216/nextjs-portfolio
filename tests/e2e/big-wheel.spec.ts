import { test, expect, type Page } from './fixtures';

import { LAMPS, LAMP_COUNT, NUMBER_SEGMENTS, NUMBER_SEGMENT_COUNT, SEGMENT_COUNT, WHEEL, type Spot } from '../../src/components/game/BigWheel/engine';
import { SPIN_KEY, parseSpinRecord } from '../../src/components/game/BigWheel/medalTable';
import { segmentAt } from '../../src/components/game/BigWheel/physics';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// The Star Festival Big Wheel plays with the medal center's medals. A spin is drawn with three numbers from Math.random
// as SPIN is pressed (engine.ts): the segment the wheel stops on (one of 54), the hub's lamp for a stop on BONUS (one
// of 16), and where the second chance stops (one of the 50 number segments). A test that needs a particular spin
// queues the numbers for the press (rigPresses.ts), so nothing else on the page can take them first.

const BONUS = WHEEL.indexOf('bonus');
/** The numbers that stop the wheel on segment `stop`, and for a stop on BONUS light lamp `lamp` and send the second chance to segment `second`. */
function drawn(stop: number, lamp = 0, second: number = NUMBER_SEGMENTS[0]): number[] {
  return [(stop + 0.5) / SEGMENT_COUNT, (lamp + 0.5) / LAMP_COUNT, (NUMBER_SEGMENTS.indexOf(second) + 0.5) / NUMBER_SEGMENT_COUNT];
}
const at = (spot: Spot) => WHEEL.indexOf(spot);

const machine = (page: Page) => page.getByTestId('bw-machine');

async function openWheel(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/big-wheel');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

/** The medals the machine shows, in type. */
const shown = async (page: Page): Promise<number> => Number(((await page.getByTestId('bw-medals').textContent()) ?? '').replace(/,/g, ''));
const spins = async (page: Page): Promise<number> => Number(await page.getByTestId('bw-stat-spins').textContent());

/** Puts `taps` taps of the step chosen on a number, the first pressed again only while nothing has landed on it. */
async function bet(page: Page, spot: Spot, taps = 1) {
  const target = page.getByTestId(`bw-spot-${spot}`);
  const before = Number(await target.getAttribute('data-amount'));
  await pressUntil(target, async () => Number(await target.getAttribute('data-amount')) > before);
  for (let i = 1; i < taps; i++) await target.click();
}

/** SPIN, with the numbers given drawn for it: pressed again only while no spin has begun, so never twice. */
async function spin(page: Page, numbers: number[]) {
  await rigPresses(page, numbers);
  const before = await spins(page);
  await pressUntil(page.getByTestId('bw-spin'), async () => {
    const phase = await machine(page).getAttribute('data-phase');
    return (phase !== 'idle' && phase !== 'done') || (await spins(page)) > before;
  });
}

/** Where the wheel stands now, read from its own transform: the segment under the pointer. */
const underPointer = (page: Page) =>
  page.getByTestId('bw-rotor').evaluate((rotor) => {
    const [a, b] = getComputedStyle(rotor).transform.match(/-?[\d.e]+/g)!.map(Number);
    return (Math.atan2(b, a) * 180) / Math.PI;
  });

/** Takes the focus off the button last pressed: Space or Enter on a focused button presses that button, as anywhere. */
const unfocus = (page: Page) => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

/** Waits for a step of the show that lasts only a moment: looked for as the page changes, not on a slowing poll. */
const phase = (page: Page, name: string, timeout = 15_000) => page.waitForSelector(`[data-testid="bw-machine"][data-phase="${name}"]`, { timeout });

const spinStored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), SPIN_KEY);

/** How wide the page is, or any of its tab panels' contents: nothing may be wider than the window. */
const sideways = (page: Page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));

test('a spin takes the board’s medals, stops on the segment drawn and pays it once; the medal center and My Page show the same', async ({ page }) => {
  test.setTimeout(90_000);
  await openWheel(page);
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('bw-not-money')).toHaveText(NOT_MONEY.en);
  // On the floor jackpot: its best play with the jackpot added stays under 100%.
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');

  // Five medals on ×10 (a tap of five), and two on ×2.
  await page.getByTestId('bw-step-5').click();
  await bet(page, 10);
  await page.getByTestId('bw-step-1').click();
  await bet(page, 2, 2);
  await expect(page.getByTestId('bw-spot-10')).toHaveAttribute('data-amount', '5');
  await expect(page.getByTestId('bw-spot-2')).toHaveAttribute('data-amount', '2');
  await expect(page.getByTestId('bw-bet')).toHaveText('7');
  // The board's medals are off the counter; they are taken only at SPIN.
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME - 7));
  expect(await bankBalance(page)).toBe(WELCOME);

  await spin(page, drawn(at(10)));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 7);
  expect(parseSpinRecord(await spinStored(page))).toMatchObject({ spin: { stop: at(10), lamp: null, second: null }, wagered: 7, won: 50, paid: false });
  // The wheel turns, the flapper clacking over the pegs; the medals are paid only as it stops.
  await expect(machine(page)).toHaveAttribute('data-phase', 'spin');
  const flapper = page.locator('[data-testid="bw-wheel"] > svg').nth(3);
  await expect.poll(() => flapper.evaluate((el) => (el as SVGElement).style.transform), { timeout: 5_000 }).toMatch(/rotate\(-[1-9]/);
  expect(await shown(page)).toBe(WELCOME - 7);
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 15_000 });
  // It stopped where it was drawn to, as its own transform says.
  expect(segmentAt(await underPointer(page))).toBe(at(10));
  await expect(machine(page)).toHaveAttribute('data-rest', String(at(10)));
  await expect(machine(page)).toHaveAttribute('data-won', '50');
  await expect(page.getByTestId('bw-spot-10')).toHaveAttribute('data-hit', 'true');
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME - 7 + 50));
  await expect(page.getByTestId('bw-win')).toHaveText('50');
  await expect(page.getByTestId('bw-status')).toHaveText('×10: 50 medals!');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 43);
  expect(parseSpinRecord(await spinStored(page))?.paid).toBe(true);
  // The board is cleared; the same bets go back with one press.
  await expect(page.getByTestId('bw-bet')).toHaveText('0');
  await page.getByTestId('bw-rebet').click();
  await expect(page.getByTestId('bw-bet')).toHaveText('7');
  await page.getByTestId('bw-clear').click();
  await expect(page.getByTestId('bw-bet')).toHaveText('0');

  // After a reload the machine shows the same medals, the wheel where it stopped, and so do the front and My Page.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME + 43));
  await expect(machine(page)).toHaveAttribute('data-rest', String(at(10)));
  expect(segmentAt(await underPointer(page))).toBe(at(10));
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME + 43));
  await expect(page.getByTestId('center-play-big-wheel')).toHaveAttribute('href', '/games/big-wheel');
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-game-big-wheel')).toHaveAttribute('data-played', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('mypage-big-wheel-rounds')).toHaveText('1');
  await expect(page.getByTestId('mypage-big-wheel-won')).toHaveText('50');
});

test('BONUS: the hub’s lamps stop on the multiplier drawn, BONUS goes dark, and the second chance pays its number times it', async ({ page }) => {
  test.setTimeout(90_000);
  await openWheel(page);
  await bet(page, 8);
  await bet(page, 40);
  const lamp = LAMPS.indexOf(3);
  await spin(page, drawn(BONUS, lamp, at(8)));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2);
  await phase(page, 'bonus');
  expect(segmentAt(await underPointer(page))).toBe(BONUS);
  expect(await page.getByTestId('bw-banner').textContent()).toBe('BONUS');
  expect(await page.getByTestId('bw-status').textContent()).toBe('BONUS! The Milky Way Chance!');
  await phase(page, 'chance', 5_000);
  await expect(page.getByTestId('bw-banner')).toHaveText('MILKY WAY CHANCE');
  await phase(page, 'second', 8_000);
  // The lamp drawn is lit, its multiplier in the hub, and BONUS is out of play for the second chance.
  await expect(page.locator('[data-testid="bw-wheel"] g[data-on="true"]')).toHaveCount(1);
  await expect(page.getByTestId('bw-hub')).toHaveText('×3');
  await expect(page.getByTestId('bw-wheel')).toHaveAttribute('data-dark', 'true');
  await expect(page.getByTestId('bw-banner')).toHaveText('SECOND CHANCE ×3');
  expect(await shown(page)).toBe(WELCOME - 2);
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 15_000 });
  expect(segmentAt(await underPointer(page))).toBe(at(8));
  await expect(machine(page)).toHaveAttribute('data-result-multiplier', '3');
  await expect(machine(page)).toHaveAttribute('data-won', '24');
  await expect(page.getByTestId('bw-status')).toHaveText('×8 on the second chance, ×3: 24 medals!');
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME - 2 + 24));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 22);
  await expect(page.getByTestId('bw-history').locator('li').first()).toHaveAttribute('data-bonus', 'true');
});

test('the keys bet, spin, skip, put the same bets back and clear; Skip goes straight to the stop and changes nothing drawn', async ({ page }) => {
  test.setTimeout(60_000);
  await openWheel(page);
  // 5 is the fifth number of the board, ×10.
  await pressUntil(page.getByTestId('bw-spot-10'), async () => (await page.getByTestId('bw-spot-10').getAttribute('data-amount')) !== '0');
  await page.keyboard.press('5');
  await expect(page.getByTestId('bw-spot-10')).toHaveAttribute('data-amount', '2');
  await page.keyboard.press('u');
  await expect(page.getByTestId('bw-spot-10')).toHaveAttribute('data-amount', '1');
  // Space spins: the wheel is drawn to stop on ×4, where nothing is.
  await unfocus(page);
  await rigPresses(page, drawn(at(4)));
  await page.keyboard.press('Space');
  await expect(machine(page)).toHaveAttribute('data-phase', 'spin');
  await page.keyboard.press('s');
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 3_000 });
  expect(segmentAt(await underPointer(page))).toBe(at(4));
  await expect(page.getByTestId('bw-status')).toHaveText('The wheel stopped on ×4. Nothing on it this time.');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);
  await page.keyboard.press('r');
  await expect(page.getByTestId('bw-spot-10')).toHaveAttribute('data-amount', '1');
  await page.keyboard.press('c');
  await expect(page.getByTestId('bw-bet')).toHaveText('0');
  // The Skip button does the same.
  await page.keyboard.press('7');
  await expect(page.getByTestId('bw-spot-40')).toHaveAttribute('data-amount', '1');
  await unfocus(page);
  await rigPresses(page, drawn(at(40)));
  await page.keyboard.press('Enter');
  await expect(machine(page)).toHaveAttribute('data-phase', 'spin');
  await page.getByTestId('bw-skip').click();
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 3_000 });
  await expect(machine(page)).toHaveAttribute('data-won', '40');
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 40);
});

test('a reload while the wheel turns pays the spin once as the page goes, and shows the wheel where it stopped', async ({ page }) => {
  test.setTimeout(60_000);
  await openWheel(page);
  await bet(page, 20, 2);
  await spin(page, drawn(at(20)));
  await expect(machine(page)).toHaveAttribute('data-phase', 'spin');
  await page.reload();
  await arrived(page);
  // Paid as the page went: the medals are in, and the reloaded page shows the wheel stopped where it was drawn to, the
  // spin's result marked as shown again. It is not spun again.
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 2 + 40);
  await expect(page.getByTestId('bw-resumed')).toBeVisible({ timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 15_000 });
  expect(segmentAt(await underPointer(page))).toBe(at(20));
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME + 38));
  // Once shown, it is done with: another reload spins nothing and pays nothing more.
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(machine(page)).toHaveAttribute('data-phase', 'done');
  await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME + 38));
  expect(await bankBalance(page)).toBe(WELCOME + 38);
});

for (const width of [375, 320]) {
  for (const language of ['en', 'ja'] as const) {
    test(`fits a ${width} px phone in ${language === 'en' ? 'English' : 'Japanese'}, and nothing moves through a whole BONUS spin`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 760 });
      await openWheel(page, language);
      expect(await sideways(page)).toBeLessThanOrEqual(width);
      // Where the wheel, the words under it, the counters and the buttons stand, before and all through a spin.
      const where = () =>
        page.evaluate(() =>
          ['bw-wheel', 'bw-status', 'bw-medals-led', 'bw-spot-40', 'bw-spin', 'bw-skip', 'bw-sound'].map((id) => {
            const box = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
            return `${id} ${Math.round(box.top + window.scrollY)} ${Math.round(box.height)}`;
          }),
        );
      await bet(page, 5);
      const before = await where();
      await spin(page, drawn(BONUS, LAMPS.indexOf(10), at(5)));
      const seen = new Set<string>([JSON.stringify(before)]);
      while ((await machine(page).getAttribute('data-phase')) !== 'done') {
        seen.add(JSON.stringify(await where()));
        expect(await sideways(page)).toBeLessThanOrEqual(width);
        await page.waitForTimeout(150);
      }
      seen.add(JSON.stringify(await where()));
      expect([...seen]).toEqual([JSON.stringify(before)]);
      await expect(machine(page)).toHaveAttribute('data-won', '50');
      expect(await sideways(page)).toBeLessThanOrEqual(width);
      // The Odds tab fits too.
      await page.locator('#bw-tab-odds').click();
      await expect(page.getByTestId('bw-rtp')).toHaveText('90%');
      expect(await sideways(page)).toBeLessThanOrEqual(width);
    });
  }
}

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a BONUS spin is shown in moments, the wheel and the lamps put straight where they stop', async ({ page }) => {
    await openWheel(page);
    const animation = await page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="bw-wheel"] circle[data-group]')!).animationName);
    expect(animation).toBe('none');
    await bet(page, 2);
    const started = Date.now();
    await spin(page, drawn(BONUS, LAMPS.indexOf(2), at(2)));
    await expect(machine(page)).toHaveAttribute('data-phase', 'done', { timeout: 4_000 });
    expect(Date.now() - started).toBeLessThan(3_500);
    expect(segmentAt(await underPointer(page))).toBe(at(2));
    await expect(page.getByTestId('bw-medals')).toHaveText(String(WELCOME - 1 + 4));
  });
});
