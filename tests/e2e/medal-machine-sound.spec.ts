import { test, expect, type Page } from './fixtures';

import { arrived } from './streamedPage';

// The table machines' sound (MedalCenter/machineSounds.ts): off until the player switches it on, and then heard as the
// machine is played. A headless browser has nothing to listen with, so the sounds are counted as they start: every
// AudioBufferSourceNode started on the page is noted, with the length of what it plays.

/** Notes every sound the page starts: how many, and how many short chirps (a medal counted in). */
async function listen(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __sounds: number[] };
    w.__sounds = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
      w.__sounds.push(this.buffer?.duration ?? 0);
      return start.apply(this, args);
    };
  });
}
const heard = (page: Page) => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds);

async function open(page: Page, path: string, ready: string) {
  await page.context().addCookies([{ name: 'i18nextLng', value: 'en', url: 'http://localhost:3000' }]);
  await page.goto(path);
  await arrived(page);
  await expect(page.locator(ready)).toBeVisible({ timeout: 20_000 });
}

test('the slot machine is silent until its sound is switched on; then a jackpot is heard going in, medal by medal', async ({ page }) => {
  await listen(page);
  await open(page, '/games/slot-machine', '[data-testid="slot-medals"][data-loaded="true"]');
  const spin = page.getByRole('button', { name: 'SPIN', exact: true });
  const toggle = page.getByTestId('slot-sound');
  await expect(toggle).toHaveAccessibleName('Sound off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  // A spin with the sound off: nothing is heard.
  await spin.click();
  await expect(page.locator('[role="img"][data-spinning="false"]')).toBeVisible({ timeout: 10_000 });
  expect(await heard(page)).toEqual([]);

  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Sound on');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await heard(page)).length).toBe(1);
  // A jackpot at one medal: the medal, the lever, three reels, the fanfare, and a chirp for the medals counted in.
  await page.evaluate(() => {
    const w = window as unknown as { __r: () => number };
    w.__r = Math.random;
    Math.random = () => 0.001;
  });
  await spin.click();
  await page.evaluate(() => {
    Math.random = (window as unknown as { __r: () => number }).__r;
  });
  await expect(page.locator('[role="img"][data-spinning="false"]')).toBeVisible({ timeout: 10_000 });
  // Until the count has run in to the medals the player has.
  const medals = ((await page.getByTestId('slot-medals').textContent()) ?? '').replace(/,/g, '');
  await expect(page.getByTestId('slot-medals-led')).toHaveAttribute('data-shown', medals, { timeout: 5_000 });
  const sounds = await heard(page);
  const chirps = sounds.filter((d) => d < 0.05).length;
  expect(sounds.length - 1 - chirps).toBeGreaterThanOrEqual(1 + 1 + 3 + 1);
  // 1,000 medals run in over 2.4 s: a chirp for every step of the count, no closer than 50 ms apart.
  expect(chirps).toBeGreaterThan(20);
  expect(chirps).toBeLessThanOrEqual(2400 / 50 + 1);

  // Switched off again, nothing more is heard.
  await toggle.click();
  await expect(toggle).toHaveAccessibleName('Sound off');
  const before = (await heard(page)).length;
  await spin.click();
  await expect(page.locator('[role="img"][data-spinning="false"]')).toBeVisible({ timeout: 10_000 });
  expect((await heard(page)).length).toBe(before);
});

test('roulette is heard as a medal is set on the felt and the ball is launched, once the sound is on', async ({ page }) => {
  await listen(page);
  await open(page, '/games/roulette', '[data-testid="roulette-meter"][data-loaded="true"]');
  const toggle = page.getByTestId('roulette-sound');
  await expect(toggle).toHaveAccessibleName('Sound off');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await heard(page)).length).toBe(1);
  await page.getByRole('button', { name: /^Red \(1:1\)$/ }).click();
  await expect.poll(async () => (await heard(page)).length).toBe(2);
  await page.getByRole('button', { name: 'SPIN', exact: true }).click();
  await expect.poll(async () => (await heard(page)).length).toBe(3);
  // The ball drops into its pocket when the wheel stops.
  await expect(page.locator('[data-spinning="false"]')).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await heard(page)).length).toBeGreaterThanOrEqual(4);
});

test('video poker is heard dealing, holding and drawing, once the sound is on', async ({ page }) => {
  await listen(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '/games/video-poker', '[data-testid="vp-machine"][data-playable="true"]');
  const toggle = page.getByTestId('vp-sound');
  await expect(toggle).toHaveAccessibleName('Sound off');
  await page.getByRole('button', { name: 'DEAL', exact: true }).click();
  await expect(page.getByRole('button', { name: 'DRAW', exact: true })).toBeVisible();
  expect(await heard(page)).toEqual([]);
  await toggle.click();
  await expect.poll(async () => (await heard(page)).length).toBe(1);
  await page.locator('[data-slot="0"]').click();
  await expect.poll(async () => (await heard(page)).length).toBe(2);
  await page.getByRole('button', { name: 'DRAW', exact: true }).click();
  // Four cards turn over.
  await expect.poll(async () => (await heard(page)).length).toBeGreaterThanOrEqual(6);
  // The next deal: five medals in, five cards out.
  const before = (await heard(page)).length;
  await page.getByRole('button', { name: 'DEAL', exact: true }).click();
  await expect.poll(async () => (await heard(page)).length - before).toBe(10);
});
