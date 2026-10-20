import { test, expect } from './fixtures';

import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { WHEEL_GEOMETRY, pocketCenterDeg } from '../../src/components/game/Roulette/ballPhysics';
import { colorOf } from '../../src/components/game/Roulette/engine';
import { bankBalance } from './medalCenterPage';
import { boardNumbers, openRoulette, placeFirstBet, settledResult, shownMedals } from './roulettePage';
import { arrived } from './streamedPage';

// The roulette result is random, so these checks never assume a number: they
// read the drawn result and verify that the wheel, the ball, the payout and the
// results board all agree with it. The table plays with the medal center's
// medals (a new player has WELCOME of them), one medal a tap unless another
// step is picked; roulette-medals.spec.ts covers the medals themselves.

const mod360 = (deg: number) => ((deg % 360) + 360) % 360;

test('the ball lands in the winning pocket, which is paid and posted to the board', async ({ page }) => {
  await openRoulette(page);
  await placeFirstBet(page, /^Straight up \(35:1\) — 17$/);
  // One medal on the felt: off the counter, but not taken from the medals until the wheel spins.
  expect(await shownMedals(page)).toBe(WELCOME - 1);
  expect(await bankBalance(page)).toBe(WELCOME);

  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'true');
  await expect(page.getByText('No more bets')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Spinning…' })).toBeDisabled();
  expect(await bankBalance(page)).toBe(WELCOME - 1);

  // The ball really travels (it is animated, not teleported to the result).
  const ball = page.locator('[data-ball]');
  const early = await ball.getAttribute('transform');
  await page.waitForTimeout(400);
  expect(await ball.getAttribute('transform')).not.toBe(early);

  const result = await settledResult(page);

  // Ball at 12 o'clock, seated at pocket depth…
  const [, bx, by] = (await ball.getAttribute('transform'))!.match(/translate\(([\d.-]+) ([\d.-]+)\)/)!.map(Number);
  expect(bx).toBeCloseTo(150, 0);
  expect(by).toBeCloseTo(150 - WHEEL_GEOMETRY.ballPocket * 150, 0);
  // …and the wheel head has carried the winning pocket to 12 o'clock.
  const head = await wheel.locator('svg').nth(1).evaluate((el) => (el as SVGElement).style.transform);
  const rotation = Number(head.match(/rotate\(([\d.-]+)deg\)/)![1]);
  const offTop = mod360(rotation + pocketCenterDeg(result));
  expect(Math.min(offTop, 360 - offTop)).toBeLessThan(0.05);

  // Payout, winning-number marker and results board agree with the pocket.
  const after = result === 17 ? WELCOME + 35 : WELCOME - 1;
  await expect.poll(() => shownMedals(page)).toBe(after);
  expect(await bankBalance(page)).toBe(after);
  await expect(page.locator('[data-winning="true"]')).toHaveAttribute('aria-label', new RegExp(`— ${result}$`));
  expect(await boardNumbers(page)).toEqual([result]);
  await expect(page.getByText('Last 1 spin', { exact: true })).toBeVisible();

  // A second spin goes on top of the board.
  await page.getByRole('button', { name: /^Straight up \(35:1\) — 17$/ }).click();
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const second = await settledResult(page);
  expect(await boardNumbers(page)).toEqual([second, result]);
});

test('switching tabs mid-spin keeps the spin, the winnings and the medals', async ({ page }) => {
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const wheel = page.locator('[data-spinning]');
  await expect(wheel).toHaveAttribute('data-spinning', 'true');

  // Leave while the ball is still rolling…
  await page.getByRole('tab', { name: 'Martingale' }).click();
  await expect(page.getByRole('button', { name: 'Run simulation' })).toBeVisible();
  // …the spin keeps going on the hidden play tab and settles there.
  await expect(wheel).toHaveAttribute('data-spinning', 'false', { timeout: 15_000 });

  await page.getByRole('tab', { name: 'Play' }).click();
  const n = await settledResult(page);
  expect(await boardNumbers(page)).toEqual([n]);
  const balance = colorOf(n) === 'red' ? WELCOME + 1 : WELCOME - 1;
  await expect.poll(() => shownMedals(page)).toBe(balance);

  // A second round trip leaves the settled state alone.
  await page.getByRole('tab', { name: 'House edge' }).click();
  await page.getByRole('tab', { name: 'Play' }).click();
  expect(await shownMedals(page)).toBe(balance);
  expect(await bankBalance(page)).toBe(balance);
  expect(await boardNumbers(page)).toEqual([n]);
});

test('reduced motion settles quickly and builds hot / cold statistics', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);

  const spins = 10;
  let expectedBalance = WELCOME;
  for (let i = 0; i < spins; i++) {
    if (i > 0) await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
    const startedAt = Date.now();
    await page.getByRole('button', { name: 'SPIN', exact: true }).click();
    const n = await settledResult(page);
    expect(Date.now() - startedAt).toBeLessThan(3_000);
    expectedBalance += colorOf(n) === 'red' ? 1 : -1;
  }

  await expect.poll(() => shownMedals(page)).toBe(expectedBalance);
  expect(await bankBalance(page)).toBe(expectedBalance);
  const board = await boardNumbers(page);
  expect(board).toHaveLength(spins);
  await expect(page.getByText(`Last ${spins} spins`, { exact: true })).toBeVisible();
  const distinct = new Set(board).size;
  await expect(page.getByRole('list', { name: 'Hot' }).locator('li')).toHaveCount(Math.min(5, distinct));
  await expect(page.getByRole('list', { name: 'Cold' }).locator('li')).toHaveCount(5);
  // The hottest number is one that actually came up the most.
  const hottest = Number(await page.getByRole('list', { name: 'Hot' }).locator('li').first().locator('span').first().textContent());
  const counts = board.reduce<Record<number, number>>((acc, n) => ({ ...acc, [n]: (acc[n] ?? 0) + 1 }), {});
  expect(counts[hottest]).toBe(Math.max(...Object.values(counts)));
});

test('the results board is localized', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page, 'ja');
  await expect(page.getByRole('region', { name: '出目履歴' })).toBeVisible();
  await expect(page.getByText('あと 10 回スピンするとホット / コールド数字を表示します。')).toBeVisible();
});

test('winning numbers are saved across reloads and tab switches, and can be cleared', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openRoulette(page);
  await placeFirstBet(page, /^Red \(1:1\)$/);

  for (let i = 0; i < 3; i++) {
    if (i > 0) await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
    await page.getByRole('button', { name: 'SPIN', exact: true }).click();
    await settledResult(page);
  }
  const saved = await boardNumbers(page);
  expect(saved).toHaveLength(3);

  // Survives switching to another tab and back (the play tab remounts).
  await page.getByRole('tab', { name: 'Martingale' }).click();
  await page.getByRole('tab', { name: 'Play' }).click();
  expect(await boardNumbers(page)).toEqual(saved);

  // Survives a reload, and so do the medals: they are the medal center's, kept on this device.
  const medals = await bankBalance(page);
  await page.reload();
  await arrived(page);
  await expect.poll(() => boardNumbers(page)).toEqual(saved);
  await expect(page.getByText('Last 3 spins', { exact: true })).toBeVisible();
  await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-medals', String(medals));

  // New spins keep stacking on top of the saved history.
  await placeFirstBet(page, /^Red \(1:1\)$/);
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  const next = await settledResult(page);
  expect(await boardNumbers(page)).toEqual([next, ...saved]);

  // Clearing asks first, then empties the board for good.
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Clear saved winning numbers' }).click();
  expect(await boardNumbers(page)).toHaveLength(4);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Clear saved winning numbers' }).click();
  await expect.poll(() => boardNumbers(page)).toEqual([]);
  expect(await page.evaluate(() => window.localStorage.getItem('roulette-results-v1'))).toBeNull();
  await page.reload();
  await arrived(page);
  await expect(page.locator('[data-spinning]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear saved winning numbers' })).toBeDisabled();
  expect(await boardNumbers(page)).toEqual([]);
});

test('every bet on the felt is where it shows, at a phone’s width (upright) and on a desktop (wide)', async ({ page }) => {
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openRoulette(page);
    // What a tap at the centre of each number, split, corner, street and line would press. On a phone the table stands
    // upright (0 on top, 1 2 3 across the first row), so every number is a finger's width.
    const missed = await page.evaluate(() => {
      const buttons = [...document.querySelectorAll<HTMLButtonElement>('button[aria-label]')].filter((b) =>
        /^(Straight up|Split|Corner|Street|Line) /.test(b.getAttribute('aria-label') ?? ''),
      );
      const wrong: string[] = [];
      for (const button of buttons) {
        button.scrollIntoView({ block: 'center', behavior: 'instant' });
        const box = button.getBoundingClientRect();
        const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)?.closest('button');
        if (hit !== button) wrong.push(`${button.getAttribute('aria-label')} → ${hit?.getAttribute('aria-label') ?? 'nothing'}`);
      }
      return { wrong, count: buttons.length };
    });
    expect(missed.count).toBe(37 + 33 + 24 + 22 + 12 + 11);
    expect(missed.wrong).toEqual([]);
    const seventeen = page.getByRole('button', { name: 'Straight up (35:1) — 17', exact: true });
    const box = (await seventeen.boundingBox())!;
    if (width === 375) {
      // Upright: 16 17 18 on one row, each at least 44 px wide.
      const sixteen = (await page.getByRole('button', { name: 'Straight up (35:1) — 16', exact: true }).boundingBox())!;
      expect(Math.abs(sixteen.y - box.y)).toBeLessThan(1);
      expect(box.x).toBeGreaterThan(sixteen.x);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
    // A real tap on 17 puts a medal on 17, and one on the split 17–20 puts it there.
    await placeFirstBet(page, /^Straight up \(35:1\) — 17$/);
    await page.getByRole('button', { name: 'Split (17:1) — 17, 20', exact: true }).click();
    await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-bet', '2');
    await expect(page.getByRole('button', { name: 'Split (17:1) — 17, 20', exact: true })).toHaveText('1');
    await expect(seventeen).toHaveText('171');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('the wheel, wherever it has come to rest, never covers the tabs or anything else a player presses', async ({ page }) => {
  for (const [width, height] of [
    [1280, 720],
    [375, 812],
  ]) {
    await page.setViewportSize({ width, height });
    await openRoulette(page);
    // The wheel's head is a square picture turned to where the wheel stopped, and its corners reach out past the round
    // wheel. Turned to every whole degree, nothing a player presses may have the wheel over its centre (on main the
    // head covered "Martingale sim" at 31–33° and "House edge" at 62°, every quarter turn, at 1280 × 720).
    const covered = await page.evaluate(() => {
      const head = document.querySelector<SVGElement>('[class*="wheelHead"]')!;
      const presses = [...document.querySelectorAll<HTMLElement>('button, [role="tab"]')].filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && !el.closest('[hidden], header, nav, footer');
      });
      const found = new Set<string>();
      for (const scroll of [0, 220]) {
        window.scrollTo({ top: scroll, behavior: 'instant' });
        for (let turn = 0; turn < 360; turn += 1) {
          head.style.transform = `rotate(${turn}deg)`;
          for (const el of presses) {
            const box = el.getBoundingClientRect();
            const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
            if (y < 0 || y > window.innerHeight) continue;
            const top = document.elementFromPoint(x, y);
            if (top && !el.contains(top) && top.closest('[class*="wheel"]')) found.add(`${el.getAttribute('aria-label') ?? el.textContent?.trim()} at ${turn}°`);
          }
        }
      }
      return [...found];
    });
    expect(covered).toEqual([]);
    // And the tab answers a real click with the wheel at rest where it used to cover it.
    await page.evaluate(() => {
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.querySelector<SVGElement>('[class*="wheelHead"]')!.style.transform = 'rotate(32deg)';
    });
    await page.getByRole('tab', { name: 'Martingale' }).click({ timeout: 5_000 });
    await expect(page.getByRole('tab', { name: 'Martingale' })).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Play' }).click({ timeout: 5_000 });
  }
});

test('the medals on a street or a line never cover its label, and no count of medals catches a tap meant for a bet', async ({ page }) => {
  test.setTimeout(60_000);
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await openRoulette(page);
    // A medal on every street and every line, and on a number, a column and red.
    const labels = await page
      .getByRole('button')
      .evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-label') ?? '').filter((l) => /^(Street|Line) /.test(l)));
    expect(labels).toHaveLength(12 + 11);
    await placeFirstBet(page, /^Straight up \(35:1\) — 17$/);
    for (const label of [...labels, 'Column (2:1) 1', 'Red (1:1)']) await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByTestId('roulette-meter')).toHaveAttribute('data-bet', String(1 + 23 + 2));
    const found = await page.evaluate(() => {
      const overlaps: string[] = [];
      const catching: string[] = [];
      // Every bet's label: the cell's own text, before any count of medals on it.
      const labels = [...document.querySelectorAll<HTMLElement>('button[aria-label]')].flatMap((cell) => {
        const text = [...cell.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
        if (!text) return [];
        const range = document.createRange();
        range.selectNodeContents(text);
        return [...range.getClientRects()].map((rect) => ({ cell, rect }));
      });
      for (const badge of document.querySelectorAll<HTMLElement>('[class*="chipBadge"]')) {
        const own = badge.parentElement!;
        if (getComputedStyle(badge).pointerEvents !== 'none') catching.push(own.getAttribute('aria-label') ?? '');
        const b = badge.getBoundingClientRect();
        // Neither its own label nor a neighbour's.
        for (const { cell, rect: r } of labels) {
          const x = Math.min(b.right, r.right) - Math.max(b.left, r.left);
          const y = Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top);
          if (x > 0.5 && y > 0.5) overlaps.push(`${own.getAttribute('aria-label')} over ${cell.getAttribute('aria-label')}: ${x.toFixed(1)} × ${y.toFixed(1)}`);
        }
      }
      return { overlaps, catching, badges: document.querySelectorAll('[class*="chipBadge"]').length };
    });
    expect(found.badges).toBe(1 + 23 + 2);
    expect(found.overlaps, `${width} px`).toEqual([]);
    expect(found.catching, `${width} px`).toEqual([]);
  }
});
