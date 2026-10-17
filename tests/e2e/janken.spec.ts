import { test, expect, type Page } from '@playwright/test';

import { LAMPS } from '../../src/components/game/Janken/engine';
import { ROUND_KEY } from '../../src/components/game/Janken/round';
import { WELCOME } from '../../src/components/game/MedalCenter/ledger';
import { NOT_MONEY } from '../../src/components/game/MedalCenter/strings';
import { bankBalance, openCenter } from './medalCenterPage';
import { arrived } from './streamedPage';

// Calico Janken plays with the medal center's medals. The cat's hand and the roulette's lamp are drawn with
// Math.random when the player's hand is pressed, so a test that needs a particular throw queues the numbers just
// before it presses (as the craps spec does with its dice): rock, scissors and paper are the thirds of [0, 1), and a
// lamp is a thirtieth of it.

const CAT = { gu: 0.1, choki: 0.5, pa: 0.9 } as const;
const lamp = (at: number) => (at + 0.5) / LAMPS.length;

const cabinet = (page: Page) => page.getByTestId('janken-cabinet');

async function openJanken(page: Page, language: 'en' | 'ja' = 'en') {
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: 'http://localhost:3000' }]);
  const response = await page.goto('/games/janken');
  expect(response?.status()).toBe(200);
  // The page streams in, and for a moment there is a second, hidden copy of it: wait until that is gone.
  await arrived(page);
  await expect(cabinet(page)).toHaveAttribute('data-ready', 'true', { timeout: 20_000 });
}

/** The medals the cabinet shows. */
async function shown(page: Page): Promise<number> {
  return Number(((await page.getByTestId('janken-medals').textContent()) ?? '').replace(/,/g, ''));
}

/** The cat's next draws, queued just before the press that uses them. */
async function cat(page: Page, draws: number[]) {
  await page.evaluate((queue) => {
    const w = window as unknown as { __random?: () => number };
    w.__random ??= Math.random;
    const left = [...queue];
    Math.random = () => (left.length ? left.shift()! : w.__random!());
  }, draws);
}

/** Puts a medal in, retrying until hydration has attached the handler and the machine holds the card. */
async function insert(page: Page) {
  const before = await shown(page);
  await expect(async () => {
    await page.getByTestId('janken-medal-in').click({ timeout: 1_000 });
    expect(await shown(page)).toBe(before - 1);
  }).toPass({ timeout: 20_000 });
  await expect(cabinet(page)).toHaveAttribute('data-phase', 'calling');
}

const roundStored = (page: Page) => page.evaluate((key) => window.localStorage.getItem(key), ROUND_KEY);
/** How wide the page is, or any of its tab panels' contents: nothing may be wider than the window. */
const sideways = (page: Page) =>
  page.evaluate(() => Math.max(document.documentElement.scrollWidth, ...[...document.querySelectorAll('[role="tabpanel"]:not([hidden])')].map((panel) => panel.scrollWidth)));

test('a medal in takes one of your medals; a win gives the roulette’s lamp when it is taken; the medal center shows the same after a reload', async ({ page }) => {
  test.setTimeout(60_000);
  await openJanken(page);
  await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME));
  await expect(page.getByTestId('janken-not-money')).toHaveText(NOT_MONEY.en);
  await insert(page);
  await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);

  // Rock against scissors, and the ring stops on the 5.
  await cat(page, [CAT.choki, lamp(15)]);
  await page.getByTestId('janken-hand-gu').click();
  await expect(page.getByTestId('janken-cat-hand')).toHaveText('Scissors');
  await expect(page.getByTestId('janken-lamp-win')).toHaveAttribute('data-on', 'true');
  // The light runs round and stops on its lamp: then, and not before, the medals are offered.
  await expect(cabinet(page)).toHaveAttribute('data-phase', 'offer', { timeout: 15_000 });
  await expect(page.getByTestId('janken-face')).toHaveAttribute('data-lit', '15');
  await expect(page.getByTestId('janken-win')).toHaveText('5');
  expect(await shown(page)).toBe(WELCOME - 1);
  await page.getByTestId('janken-collect').click();
  await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME - 1 + 5));
  await expect.poll(() => bankBalance(page)).toBe(WELCOME + 4);
  await expect(page.getByTestId('janken-tray')).toHaveAttribute('data-medals', '5');
  expect(await roundStored(page)).toBeNull();

  // After a reload the machine shows the same medals, and so does the medal center's front, where it stands open.
  await page.reload();
  await arrived(page);
  await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME + 4));
  await openCenter(page);
  await expect(page.getByTestId('center-balance')).toHaveText(String(WELCOME + 4));
  await expect(page.getByTestId('center-play-janken')).toHaveAttribute('href', '/games/janken');
});

test.describe('with less motion', () => {
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('a draw is thrown again for nothing, and a loss keeps the medal', async ({ page }) => {
    await openJanken(page);
    await insert(page);
    await cat(page, [CAT.gu]);
    await page.getByTestId('janken-hand-gu').click();
    await expect(page.getByTestId('janken-lamp-draw')).toHaveAttribute('data-on', 'true');
    await expect(page.getByTestId('janken-hand-gu')).toBeEnabled();
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'calling');
    expect(await shown(page)).toBe(WELCOME - 1);
    await cat(page, [CAT.pa]);
    await page.getByTestId('janken-hand-gu').click();
    await expect(page.getByTestId('janken-lamp-lose')).toHaveAttribute('data-on', 'true');
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'idle');
    expect(await shown(page)).toBe(WELCOME - 1);
    await expect.poll(() => bankBalance(page)).toBe(WELCOME - 1);
  });

  test('a double-up doubles what was won, and the keys play the machine', async ({ page }) => {
    await openJanken(page);
    await insert(page);
    // Rock against scissors, the ring on a 2 (lamp 3); doubled up with D, paper against rock, taken with T.
    await cat(page, [CAT.choki, lamp(3)]);
    await page.keyboard.press('1');
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'offer', { timeout: 10_000 });
    await expect(page.getByTestId('janken-win')).toHaveText('2');
    await page.keyboard.press('d');
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'calling');
    await cat(page, [CAT.gu]);
    await page.keyboard.press('3');
    await expect(cabinet(page)).toHaveAttribute('data-phase', 'offer');
    await expect(page.getByTestId('janken-win')).toHaveText('4');
    await expect(page.getByTestId('janken-collect')).toBeEnabled();
    await page.keyboard.press('t');
    await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME - 1 + 4));
    // M puts the next medal in.
    await page.keyboard.press('m');
    await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME - 2 + 4));
  });

  test('a reload gives back a medal not yet thrown, and pays a win already drawn, once each', async ({ page }) => {
    await openJanken(page);
    await insert(page);
    await page.reload();
    await arrived(page);
    await expect(cabinet(page)).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME));
    expect(await roundStored(page)).toBeNull();

    // A win on the 10, and the page reloaded before the ring has stopped: the 10 is paid as the page goes.
    await insert(page);
    await cat(page, [CAT.choki, lamp(0)]);
    await page.getByTestId('janken-hand-gu').click();
    await expect.poll(async () => JSON.parse((await roundStored(page)) ?? '{}').phase).toBe('spinning');
    await page.reload();
    await arrived(page);
    await expect(cabinet(page)).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME - 1 + 10));
    expect(await roundStored(page)).toBeNull();
    await page.reload();
    await arrived(page);
    await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME + 9));
    expect(await bankBalance(page)).toBe(WELCOME + 9);
  });
});

test('every lamp’s number can be read as the light runs round, and the way back says Medal Game Center', async ({ page }) => {
  await openJanken(page);
  await expect(page.getByRole('link', { name: /Medal Game Center/ }).first()).toBeVisible();
  await expect(page.getByTestId('janken-face')).toHaveAttribute('data-attract', 'true');
  // While the machine waits, each lamp is lit in turn (3 s round, lamp i lit at i × 100 ms, then fading). Every lamp is
  // put at every 15 ms of its round, and its number must stand out from the bulb at each of them.
  const lamps = await page.evaluate(() => {
    const luminance = (css: string) => {
      const [r, g, b] = (css.match(/\d+(\.\d+)?/g) ?? []).slice(0, 3).map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    return ([...document.querySelectorAll('[data-testid="janken-face"] g[data-tone]')] as SVGGElement[]).map((lamp, i) => {
      const circle = lamp.querySelector('circle')!;
      const text = lamp.querySelector('text')!;
      const animations = [...circle.getAnimations(), ...text.getAnimations()];
      animations.forEach((a) => a.pause());
      const fills = new Set<string>();
      let worst = Infinity;
      for (let ms = 0; ms < 3000; ms += 15) {
        for (const a of animations) a.currentTime = i * 100 + ms;
        fills.add(getComputedStyle(circle).fill);
        worst = Math.min(worst, ratio(getComputedStyle(circle).fill, getComputedStyle(text).fill));
      }
      return { worst, shades: fills.size };
    });
  });
  expect(lamps).toHaveLength(30);
  for (const [i, { worst, shades }] of lamps.entries()) {
    // The bulb really does light and fade…
    expect(shades, `lamp ${i} runs`).toBeGreaterThan(3);
    // …and its number can be read all the way round.
    expect(worst, `lamp ${i}`).toBeGreaterThanOrEqual(3.5);
  }
});

test('another tab takes the card: this machine waits, and plays again here when asked', async ({ page, context }) => {
  await openJanken(page);
  await insert(page);
  const other = await context.newPage();
  await openJanken(other);
  // The round the first tab had is the other tab's to play now, with the medal still in.
  await expect(cabinet(other)).toHaveAttribute('data-phase', 'calling');
  await expect(page.getByTestId('janken-card-away')).toBeVisible({ timeout: 10_000 });
  await page.getByTestId('janken-play-here').click();
  await expect(page.getByTestId('janken-card-away')).toHaveCount(0);
  await expect(cabinet(page)).toHaveAttribute('data-ready', 'true');
  await expect(cabinet(page)).toHaveAttribute('data-phase', 'calling');
  await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME - 1));
  await other.close();
});

test('the medal center’s reset throws away a medal in play with the rest, and the machine starts over', async ({ page, context }) => {
  await openJanken(page);
  await insert(page);
  const hub = await context.newPage();
  await openCenter(hub);
  await hub.getByTestId('center-reset').click();
  await hub.getByTestId('center-reset-confirm').click();
  await expect(hub.getByTestId('center-balance')).toHaveText(String(WELCOME));
  await page.bringToFront();
  await expect(cabinet(page)).toHaveAttribute('data-phase', 'idle', { timeout: 10_000 });
  await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME));
  expect(await roundStored(page)).toBeNull();
  await hub.close();
});

test('a reset in the middle of a win leaves nothing of that win behind: the next win stops on its own lamp', async ({ page, context }) => {
  test.setTimeout(60_000);
  await openJanken(page);
  await insert(page);
  // A win on the 10; while the hands are shown or the light is running, the medals are reset at the medal center.
  await cat(page, [CAT.choki, lamp(0)]);
  await page.getByTestId('janken-hand-gu').click();
  const hub = await context.newPage();
  await openCenter(hub);
  await hub.getByTestId('center-reset').click();
  await hub.getByTestId('center-reset-confirm').click();
  await expect(hub.getByTestId('center-balance')).toHaveText(String(WELCOME));
  await hub.close();
  await expect(cabinet(page)).toHaveAttribute('data-phase', 'idle', { timeout: 10_000 });
  await expect(page.getByTestId('janken-medals')).toHaveText(String(WELCOME));
  // The next round is its own: its light stops on its own lamp and offers its own medals.
  await insert(page);
  await cat(page, [CAT.choki, lamp(15)]);
  await page.getByTestId('janken-hand-gu').click();
  await expect(cabinet(page)).toHaveAttribute('data-phase', 'offer', { timeout: 15_000 });
  await expect(page.getByTestId('janken-face')).toHaveAttribute('data-lit', '15');
  await expect(page.getByTestId('janken-win')).toHaveText('5');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('janken-face')).toHaveAttribute('data-lit', '15');
});

test('fits a phone’s width in both languages, with the odds on their own tab', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openJanken(page);
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await page.getByRole('tab', { name: 'Odds' }).click();
  await expect(page.getByTestId('janken-rtp')).toHaveText('90');
  await page.getByTestId('janken-sim-run').click();
  await expect(page.getByTestId('janken-sim-result')).toBeVisible();
  expect(await sideways(page)).toBeLessThanOrEqual(375);

  await openJanken(page, 'ja');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('みけじゃんけん');
  await expect(page.getByTestId('janken-hand-gu')).toContainText('グー');
  await expect(page.getByTestId('janken-not-money')).toHaveText(NOT_MONEY.ja);
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  await page.getByRole('tab', { name: '確率' }).click();
  expect(await sideways(page)).toBeLessThanOrEqual(375);
  expect(errors).toEqual([]);
});
