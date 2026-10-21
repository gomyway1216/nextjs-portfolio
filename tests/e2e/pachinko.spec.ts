import { test, expect, type Page } from './fixtures';

import { BEST_LEFT, FATE_SLOTS, LEND_BALLS, LEND_MEDALS, numbersForBall, spinUnit, type BallDraw } from '../../src/components/game/Pachinko/engine';
import { SESSION_KEY, parseSession } from '../../src/components/game/Pachinko/medalTable';
import { BANK_KEY } from '../../src/components/game/MedalCenter/bank';
import { WELCOME, createLedger, serializeLedger, take } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { instantScroll } from './instantScroll';
import { bankBalance, openCenter } from './medalCenterPage';
import { pressUntil } from './pressUntil';
import { rigPresses } from './rigPresses';
import { arrived } from './streamedPage';

// Goldfish Lantern Pachinko (pachinko) lends balls for the medal center's medals. Everything random about a ball is
// drawn ahead, five numbers of Math.random a ball, in the press of LEND or of the handle (engine.ts `drawBall`), so a
// test queues the numbers that draw the balls it needs (rigPresses.ts). The handle is held by pointer events on it; the
// machine shows itself a ball's flight (1.2 s) behind its rules. The floor's API answers at once (fixtures.ts).

test.beforeEach(async ({ context }) => {
  await instantScroll(context);
});

const machine = (page: Page) => page.getByTestId('pk-machine');
const session = async (page: Page) => parseSession(await page.evaluate((key) => window.localStorage.getItem(key), SESSION_KEY));

/** A ball into the ヘソ at strength 3 whose hold is a hit in any mode, 4 rounds and ST, a normal reach. */
const HIT: BallDraw = { fate: 0, lot: 0, split: 10, show: 0, seed: 1 };
/** A ball into the ヘソ whose hold misses on a plain spin. */
const MISS = (seed: number): BallDraw => ({ fate: 0, lot: 65_535, split: 99, show: 1_023, seed });
const OUT: BallDraw = { fate: FATE_SLOTS - 1, lot: 65_535, split: 99, show: 1_023, seed: 1 };
/** A seed whose plain spin in normal play (a chance of 1 in 16 a slot to end) lasts at least `slots` slots. */
const longSeed = (slots: number): number => {
  for (let seed = 1; ; seed++) if (Array.from({ length: slots }, (_, age) => spinUnit(seed, age + 1)).every((u) => u * 16 >= 1)) return seed;
};

/**
 * A seed whose normal reach comes at the spin's first slot and stops within the two after it: by the time the screen,
 * a ball's flight (two slots) behind the rules, shows the reach, the rules have stopped it and begun the hit's fanfare.
 */
const quickReach = (): number => {
  for (let seed = 1; ; seed++) if (spinUnit(seed, 1) * 4 < 1 && [2, 3].some((age) => spinUnit(seed, age) * 8 < 1)) return seed;
};

async function openMachine(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  expect((await page.goto('/games/pachinko'))?.status()).toBe(200);
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
}

/** LEND with the balls drawn as `balls` first (the rest at random): pressed again only while no lend has been made. */
async function lend(page: Page, balls: BallDraw[] = []) {
  await rigPresses(page, balls.flatMap(numbersForBall));
  const before = (await session(page))?.tray ?? 0;
  await pressUntil(page.getByTestId('pk-lend'), async () => ((await session(page))?.tray ?? 0) >= before + LEND_BALLS);
}

/** Turns the handle to strength `to` (0 to 6, shown 1 to 7). */
async function turnTo(page: Page, to: number) {
  for (let i = 0; i < 8; i++) {
    const now = Number(await machine(page).getAttribute('data-strength'));
    if (now === to) return;
    await page.getByTestId(now < to ? 'pk-harder' : 'pk-softer').click();
  }
  await expect(machine(page)).toHaveAttribute('data-strength', String(to));
}

/** The handle pressed or let go, by a pointer event on it. */
const handle = (page: Page, type: 'pointerdown' | 'pointerup', pointerId = 23) =>
  page.evaluate(([type, pointerId]) => document.querySelector('[data-testid="pk-handle"]')!.dispatchEvent(new PointerEvent(type as string, { pointerId: pointerId as number, isPrimary: true, button: 0, bubbles: true })), [type, pointerId] as const);

/** Holds the handle until the tray is down to `tray` balls or fewer, lets go, and waits for the screen to show the last ball. */
async function fireDownTo(page: Page, tray: number) {
  await handle(page, 'pointerdown');
  await expect.poll(async () => (await session(page))?.tray ?? 0, { timeout: 30_000 }).toBeLessThanOrEqual(tray);
  await handle(page, 'pointerup');
  const left = (await session(page))!.tray;
  await expect(machine(page)).toHaveAttribute('data-tray', String(left), { timeout: 5_000 });
  return left;
}

/** Opens My Page once the history has been read. */
async function openMyPage(page: Page) {
  await page.goto('/games/medal-center/records');
  await arrived(page);
  await expect(page.getByTestId('mypage-history')).toHaveAttribute('data-loaded', 'true', { timeout: 15_000 });
}

/** Holds the handle for `ms`, by pointer events on it, and lets go. */
const hold = (page: Page, ms: number) =>
  page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const handle = document.querySelector('[data-testid="pk-handle"]')!;
        handle.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 21, isPrimary: true, button: 0, bubbles: true }));
        window.setTimeout(() => {
          handle.dispatchEvent(new PointerEvent('pointerup', { pointerId: 21, isPrimary: true, button: 0, bubbles: true }));
          resolve();
        }, ms);
      }),
    ms,
  );

test('pachinko: a lend takes 5 medals for 50 balls, the handle fires them, and the counter turns them back into medals, rounded down', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await expect(page.getByTestId('pk-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('pk-not-money')).toHaveText(NOT_MONEY.en);
  await expect(page.getByTestId('floor-jackpot-strip')).toHaveAttribute('data-linked', 'true');
  await expect(page.getByTestId('pk-status')).toHaveText(`Press LEND: ${LEND_MEDALS} medals for ${LEND_BALLS} balls.`);
  await lend(page, Array.from({ length: 8 }, () => OUT));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - LEND_MEDALS);
  await expect(machine(page)).toHaveAttribute('data-tray', String(LEND_BALLS));
  // Held for a little over 2.4 s: four or five balls, a ball every 0.6 s, each written down as it is fired.
  await hold(page, 2_500);
  await expect.poll(async () => (await session(page))?.tray).toBeLessThanOrEqual(LEND_BALLS - 4);
  const tray = (await session(page))!.tray;
  expect(tray).toBeGreaterThanOrEqual(LEND_BALLS - 6);
  await expect(machine(page)).toHaveAttribute('data-tray', String(tray), { timeout: 5_000 });
  await page.getByTestId('pk-count').click();
  const medals = Math.floor(tray / 10);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - LEND_MEDALS + medals);
  await expect(machine(page)).toHaveAttribute('data-tray', String(tray % 10));
  await expect(page.getByTestId('pk-message')).toHaveText(`Counted: ${medals} medals back into your medals.`);

  await openCenter(page);
  await expect(page.getByTestId('center-play-pachinko')).toHaveAttribute('href', '/games/pachinko');
  // Fewer than ten balls fired, all OUT: not a medal's worth played yet (the rest are owed to the next balls), and the
  // lend and the count are no play.
  await openMyPage(page);
  await expect(page.getByTestId('mypage-game-pachinko')).toHaveAttribute('data-played', 'false');
});

test('pachinko: a lend counted straight back is no play: My Page shows nothing bet or won, and the medals are the same', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  for (let i = 0; i < 3; i++) {
    await lend(page);
    // The counter is pressed once the screen shows the balls lent.
    await expect(machine(page)).toHaveAttribute('data-tray', String(LEND_BALLS));
    await expect(page.getByTestId('pk-count')).toBeEnabled();
    await page.getByTestId('pk-count').click();
    await expect.poll(() => bankBalance(page)).toBe(WELCOME);
    await expect(machine(page)).toHaveAttribute('data-tray', '0');
  }
  await openMyPage(page);
  await expect(page.getByTestId('mypage-game-pachinko')).toHaveAttribute('data-played', 'false');
  await expect(page.getByTestId('mypage-total-bet')).toHaveText('0');
  await expect(page.getByTestId('mypage-total-won')).toHaveText('0');
  await expect(page.getByTestId('mypage-entry')).toHaveCount(0);
});

test('pachinko: the balls fired are the medals played, ten a medal, carried across a reload; My Page shows them fed, and the count is no win', async ({ page }) => {
  test.setTimeout(120_000);
  await openMachine(page);
  await lend(page, Array.from({ length: 30 }, () => OUT));
  // Fifteen balls or so, then a reload with the balls short of a medal owed in the session.
  const first = await fireDownTo(page, LEND_BALLS - 15);
  expect((await session(page))?.owed.fired).toBe((LEND_BALLS - first) % 10);
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  expect((await session(page))?.owed.fired).toBe((LEND_BALLS - first) % 10);
  // Twenty balls or more in all, every one OUT: the count gives back what is left, rounded down.
  const left = await fireDownTo(page, LEND_BALLS - 20);
  const fired = LEND_BALLS - left;
  expect(fired).toBeGreaterThanOrEqual(20);
  await page.getByTestId('pk-count').click();
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - LEND_MEDALS + Math.floor(left / 10));
  await openMyPage(page);
  await expect(page.getByTestId('mypage-game-pachinko')).toHaveAttribute('data-played', 'true');
  // Medals fed: the balls fired, ten a medal. Won: nothing, as every ball went OUT; the count is no win. No rounds.
  await expect(page.getByTestId('mypage-pachinko-bet')).toHaveText(String(Math.floor(fired / 10)));
  await expect(page.getByTestId('mypage-pachinko-won')).toHaveText('0');
  await expect(page.getByTestId('mypage-pachinko-rounds')).toHaveCount(0);
  await expect(page.getByTestId('mypage-game-pachinko')).toContainText('Medals fed');
  const entries = page.getByTestId('mypage-entry');
  await expect(entries).toHaveCount(1);
  await expect(entries.nth(0)).toHaveAttribute('data-game', 'pachinko');
  await expect(entries.nth(0)).toContainText(`Fed ${Math.floor(fired / 10)} · won 0`);
});

test('pachinko: four holds full, a fifth ball into the ヘソ starts nothing, and the status says to stop firing', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  const seed = longSeed(12);
  await lend(page, [MISS(seed), MISS(2), MISS(3), MISS(4), MISS(5), MISS(6), MISS(7)]);
  await turnTo(page, BEST_LEFT);
  await hold(page, 4_000);
  // The first hold spins at once; the next four wait, and the ones after them start nothing.
  await expect(machine(page)).toHaveAttribute('data-h1', '4', { timeout: 5_000 });
  const after = await session(page);
  expect(after?.machine.q1).toHaveLength(4);
  expect(after?.machine.spin).toMatchObject({ from: 1, hit: false, kind: 'plain' });
  await page.evaluate(() => document.querySelector('[data-testid="pk-handle"]')!.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 22, isPrimary: true, button: 0, bubbles: true })));
  await expect(page.getByTestId('pk-status')).toContainText('stop firing (止め打ち)', { timeout: 5_000 });
  await page.evaluate(() => document.querySelector('[data-testid="pk-handle"]')!.dispatchEvent(new PointerEvent('pointerup', { pointerId: 22, isPrimary: true, button: 0, bubbles: true })));
});

test('pachinko: with fewer medals than a lend takes, LEND is off, the status says where the last ones can go, and a press says why', async ({ page }) => {
  test.setTimeout(60_000);
  const three = take(createLedger('testdevice01'), WELCOME - 3)!;
  await page.addInitScript(
    ([key, text]) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, text);
    },
    [BANK_KEY, serializeLedger(three)],
  );
  await openMachine(page);
  await expect(page.getByTestId('pk-lend')).toBeDisabled();
  await expect(page.getByTestId('pk-status')).toHaveText(`A lend takes ${LEND_MEDALS} medals: play your last 3 on another machine.`);
  await page.keyboard.press('l');
  await expect(page.getByTestId('pk-message')).toHaveText(`Not enough medals: a lend takes ${LEND_MEDALS}.`);
});

test('pachinko: a rigged hit — a reach Skip cuts short, a fanfare calling 右打ち, a round played at 6, the rest played out as the page is left, then ST and a hit in it', async ({ page }) => {
  test.setTimeout(120_000);
  await openMachine(page);
  await lend(page, [HIT]);
  await turnTo(page, BEST_LEFT);
  // One ball: into the ヘソ, and its hold spins at once.
  await hold(page, 300);
  await expect(machine(page)).toHaveAttribute('data-spin', 'nr', { timeout: 5_000 });
  await expect(page.getByTestId('pk-stat-fired')).toHaveText('1');
  // Skip waits for the reach, and fires nothing.
  await expect(machine(page)).toHaveAttribute('data-phase', '1', { timeout: 15_000 });
  await expect(page.getByTestId('pk-lcd')).toContainText('REACH!');
  await page.getByTestId('pk-skip').click();
  await expect(machine(page)).toHaveAttribute('data-won', '4-st');
  await expect(machine(page)).toHaveAttribute('data-stage', 'fanfare', { timeout: 5_000 });
  await expect(page.getByTestId('pk-right-sign')).toBeVisible();
  await expect(page.getByTestId('pk-status')).toContainText('BIG HIT!');
  await expect(page.getByTestId('pk-stat-fired')).toHaveText('1');
  await page.getByTestId('pk-skip').click();
  await expect(machine(page)).toHaveAttribute('data-stage', 'open', { timeout: 5_000 });
  // Round 1 at strength 6: every ball goes into the attacker, ten of them, a hundred balls back.
  await turnTo(page, 5);
  await hold(page, 6_500);
  await expect(machine(page)).not.toHaveAttribute('data-round', '1', { timeout: 8_000 });
  const midway = (await session(page))!;
  const bonus = midway.machine.bonus!;
  expect(bonus.round).toBeGreaterThanOrEqual(1);
  // What the rest of the hit leaves in the tray, played out at 6: each ball still to go into this round and every later
  // round fired and paid (ten back for one), nothing fired between rounds. A ball the hand fired between rounds is
  // already out of the tray.
  const rest = (10 - bonus.count) * 9 + (bonus.kind.rounds - bonus.round) * 90;
  // The page is left in the middle of the hit: its rounds are played out at 6, and the player is told on coming back.
  await page.reload();
  await arrived(page);
  await expect(machine(page)).toHaveAttribute('data-playable', 'true', { timeout: 20_000 });
  await expect(page.getByTestId('pk-message')).toContainText('rounds were played out at strength 6');
  // It says what the tray gained, as the tray shows it: the balls paid less the balls fired into the attacker.
  await expect(page.getByTestId('pk-message')).toContainText(`+${rest} balls into the tray`);
  await expect(machine(page)).toHaveAttribute('data-mode', 'st');
  await expect(machine(page)).toHaveAttribute('data-stage', '');
  const after = (await session(page))!;
  // 50 lent, one ball into the ヘソ (3 back), four rounds of ten balls each paying ten, less any ball the hand fired
  // between rounds before the page was left.
  expect(after.tray).toBe(midway.tray + rest);
  expect(after.tray).toBeLessThanOrEqual(LEND_BALLS - 1 + 3 + 4 * 90);
  expect(after.tray).toBeGreaterThanOrEqual(LEND_BALLS - 1 + 3 + 4 * 90 - 3);
  expect(after.machine).toMatchObject({ mode: 'st', left: 30, bonus: null, rush: { hits: 1 } });

  // In ST: a ball into the 電チュー whose hold is a hit starts the next hit: two in a row.
  await turnTo(page, 5);
  await rigPresses(page, numbersForBall(HIT));
  await hold(page, 300);
  await expect(machine(page)).toHaveAttribute('data-h2', /[01]/, { timeout: 5_000 });
  await expect.poll(async () => (await session(page))?.machine.rush?.hits, { timeout: 20_000 }).toBe(2);
  await expect(machine(page)).toHaveAttribute('data-rush', '2', { timeout: 5_000 });
  // This visit's hits: the one in ST (the first was on the page before the reload).
  await expect(page.getByTestId('pk-history').locator('li')).toHaveCount(1, { timeout: 5_000 });
  await expect(page.getByTestId('pk-history').locator('li').first()).toHaveAttribute('data-rounds', '10');
});

test('pachinko: the day’s bonus taken at the medal center in another window in the middle of a hit leaves the hit the player’s: its rounds are not played out', async ({ context, page }) => {
  test.setTimeout(120_000);
  // The medal center is open in another page first, so that the day's bonus is there to take in the middle of a hit.
  const hub = await context.newPage();
  await openCenter(hub);
  await expect(hub.getByTestId('pusher-bonus-take')).toBeVisible();
  await page.bringToFront();
  await openMachine(page);
  await lend(page, [HIT]);
  await turnTo(page, BEST_LEFT);
  await hold(page, 300);
  await expect(machine(page)).toHaveAttribute('data-spin', 'nr', { timeout: 5_000 });
  await expect(machine(page)).toHaveAttribute('data-phase', '1', { timeout: 15_000 });
  await page.getByTestId('pk-skip').click();
  await expect(machine(page)).toHaveAttribute('data-stage', 'fanfare', { timeout: 5_000 });
  await page.getByTestId('pk-skip').click();
  await expect(machine(page)).toHaveAttribute('data-stage', 'open', { timeout: 5_000 });
  const before = (await session(page))!.machine.bonus!;
  // Taken there, the bonus borrows the medals for a moment: the hit goes on where it was, its rounds the player's.
  await hub.getByTestId('pusher-bonus-take').click();
  await expect(hub.getByTestId('pusher-bonus')).toHaveAttribute('data-state', 'taken');
  await hub.close();
  await expect(machine(page)).toHaveAttribute('data-card', 'here');
  const after = (await session(page))!;
  expect(after.machine.bonus).toMatchObject({ round: before.round, count: before.count, stage: 'open' });
  expect(after.away).toBeNull();
  await expect(machine(page)).toHaveAttribute('data-stage', 'open');
  await expect(page.getByTestId('pk-message')).not.toContainText('played out');
  // And the player's hand plays it on: balls at 6 go into the open attacker.
  await turnTo(page, 5);
  await hold(page, 2_000);
  await expect.poll(async () => (await session(page))?.machine.bonus?.count ?? 0).toBeGreaterThan(before.count);
});

test('pachinko: Skip cuts short what the screen shows: a press on a reach the rules have already stopped leaves the hit’s fanfare to be seen', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await lend(page, [{ ...HIT, seed: quickReach() }]);
  await turnTo(page, BEST_LEFT);
  await hold(page, 300);
  await expect(machine(page)).toHaveAttribute('data-phase', '1', { timeout: 15_000 });
  // The rules are two slots ahead of the screen: the reach shown has stopped there, and the fanfare begun.
  expect((await session(page))!.machine.bonus?.stage).toBe('fanfare');
  await page.getByTestId('pk-skip').click();
  // The screen is brought up to the rules: the hit, and its fanfare shown, not cut short with the reach.
  await expect(machine(page)).toHaveAttribute('data-stage', 'fanfare');
  await expect(machine(page)).toHaveAttribute('data-won', '4-st');
  await expect(page.getByTestId('pk-skip')).toBeEnabled();
  // A second press cuts the fanfare short. Neither fired a ball.
  await page.getByTestId('pk-skip').click();
  await expect(machine(page)).toHaveAttribute('data-stage', 'open');
  await expect(page.getByTestId('pk-stat-fired')).toHaveText('1');
});

test('pachinko: the clock stops while the Odds tab is open, and a held handle is let go there', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await lend(page, Array.from({ length: 30 }, () => OUT));
  await page.evaluate(() => document.querySelector('[data-testid="pk-handle"]')!.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 23, isPrimary: true, button: 0, bubbles: true })));
  await expect(machine(page)).toHaveAttribute('data-held', 'true');
  await page.locator('#pk-tab-odds').click();
  await expect(machine(page)).toHaveAttribute('data-held', 'false');
  const tray = (await session(page))!.tray;
  await page.waitForTimeout(1_500);
  expect((await session(page))!.tray).toBe(tray);
  // The Odds tab: the three hands, exact, perfect play under 95%; the spec, the strengths and the sources.
  await expect(page.getByTestId('pk-perfect')).toHaveText('93.46%');
  await expect(page.getByTestId('pk-typical')).toHaveText('78.24%');
  await expect(page.getByTestId('pk-blind')).toHaveText('25.78%');
  await expect(page.getByTestId('pk-strengths-table').locator('tbody tr')).toHaveCount(7);
  // 保留短縮 is a plain spin's in normal play only: a reach's phases keep their chances however many holds wait.
  await expect(page.locator('#pk-panel-odds')).toContainText('in normal play, a plain spin runs faster the more holds wait');
  await expect(page.getByTestId('pk-sources').locator('a')).toHaveCount(8);
  await page.locator('#pk-tab-machine').click();
  await expect(machine(page)).toHaveAttribute('data-held', 'false');
});

test('pachinko: a handle held by Space or the mouse is let go as the window loses focus, and fires no ball more', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await lend(page, Array.from({ length: 30 }, () => OUT));
  const away = async () => {
    // Another window brought in front: the key or the button comes up there, never on this page.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(machine(page)).toHaveAttribute('data-held', 'false');
    const tray = (await session(page))!.tray;
    await page.waitForTimeout(1_500);
    expect((await session(page))!.tray).toBe(tray);
  };
  // Space held on the handle.
  await page.getByTestId('pk-handle').focus();
  await page.keyboard.down(' ');
  await expect(machine(page)).toHaveAttribute('data-held', 'true');
  await expect.poll(async () => (await session(page))!.tray).toBeLessThan(LEND_BALLS);
  await away();
  await page.keyboard.up(' ');
  // The mouse held on the handle.
  const box = (await page.getByTestId('pk-handle').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(machine(page)).toHaveAttribute('data-held', 'true');
  await away();
  await page.mouse.up();
});

test('pachinko in Japanese at 320 px: the machine speaks Japanese and nothing pushes the page sideways', async ({ browser }) => {
  test.setTimeout(60_000);
  const context = await browser.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await openMachine(page, 'ja');
  await expect(page.getByTestId('pk-lend')).toHaveAccessibleName(`玉貸し（${LEND_MEDALS}枚で${LEND_BALLS}玉）`);
  await expect(page.getByTestId('pk-status')).toContainText('玉貸し');
  await lend(page, [OUT]);
  // The board, its screen and the handle on screen together once a lend has been pressed (moved on the next frame).
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rect = (id: string) => document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return rect('pk-board').top >= 0 && rect('pk-lcd').top >= 0 && rect('pk-handle').bottom <= window.innerHeight;
      }),
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(page.getByTestId('pk-strength-select')).toHaveValue('3');
  await expect(page.locator('#pk-strength-now')).toHaveText('強さ 4・左打ち');
  // The handle turned straight to 6 by its selector, the shared floor select.
  await page.getByTestId('pk-strength-select').selectOption('5');
  await expect(machine(page)).toHaveAttribute('data-strength', '5');
  await expect(page.locator('#pk-strength-now')).toHaveText('強さ 6・右打ち');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await context.close();
});

test('pachinko: after a hit’s rounds, the status line says what comes next, ST and 右打ち, not the hit again', async ({ page }) => {
  test.setTimeout(60_000);
  await openMachine(page);
  await lend(page, [HIT]);
  await turnTo(page, BEST_LEFT);
  await hold(page, 300);
  await expect(machine(page)).toHaveAttribute('data-stage', 'fanfare', { timeout: 20_000 });
  // The tab put away in the fanfare: the rounds are played out as the page gives up the card, and the player comes back to ST.
  const hidden = (hide: boolean) =>
    page.evaluate((hide) => {
      if (hide) Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      else delete (document as unknown as { visibilityState?: string }).visibilityState;
      document.dispatchEvent(new Event('visibilitychange'));
    }, hide);
  await hidden(true);
  await expect.poll(async () => (await session(page))?.machine.mode).toBe('st');
  await hidden(false);
  await expect(page.getByTestId('pk-message')).toContainText('rounds were played out at strength 6');
  // The hit's lanterns stay on the screen; the line under it says what to do now.
  await expect(machine(page)).toHaveAttribute('data-won', '4-st');
  await expect(page.getByTestId('pk-status')).toHaveText('ST: 30 spins left. Shoot right at the electric tulip.');
});
