import { test, expect, type Page } from './fixtures';

import { getBanditStrings } from '../../src/components/game/Bandit/i18n';
import { getMiniAdventureStrings } from '../../src/components/game/MiniAdventure/i18n';
import { getShichinarabeStrings } from '../../src/components/game/Shichinarabe/i18n';
import { arrived } from './streamedPage';

// Leftovers from a real-browser check: Mini Adventure's log in Japanese, Shichinarabe's vs-AI badge on the light
// toolbar, and Bandit's "Arms K" field while it is being typed in.

type Language = 'ja' | 'en';

async function open(page: Page, path: string, language: Language) {
  const origin = test.info().project.use.baseURL ?? 'http://localhost:3000';
  await page.context().addCookies([{ name: 'i18nextLng', value: language, url: origin }]);
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);
  await arrived(page);
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

for (const language of ['ja', 'en'] as const) {
  test(`mini adventure: the opening log is in the page's language (${language})`, async ({ page }) => {
    const t = getMiniAdventureStrings(language);
    await open(page, '/games/mini-adventure', language);
    const start = page.getByRole('button', { name: t.start, exact: true });
    await expect(async () => {
      await start.click({ timeout: 1_000 });
      await expect(page.getByText(t.log.welcome, { exact: true })).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 20_000 });
    if (language === 'ja') {
      await expect(page.getByText('Welcome to the dungeon!', { exact: false })).toHaveCount(0);
    } else {
      await expect(page.getByText('Welcome to the dungeon! Find the stairs to descend.', { exact: true })).toBeVisible();
    }
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`shichinarabe: the vs-AI mode badge in the top bar is readable (${theme} theme)`, async ({ page }) => {
    const t = getShichinarabeStrings('ja');
    await page.addInitScript((value) => window.localStorage.setItem('theme', value), theme);
    await open(page, '/games/shichinarabe', 'ja');
    await page.getByRole('button', { name: t.menuVsAi, exact: true }).click();
    await page.getByRole('button', { name: t.start, exact: true }).click();
    const badge = page.getByTestId('shichinarabe-mode-badge');
    await expect(badge).toBeVisible();
    await expect(badge).toHaveCSS('white-space', 'nowrap');
    // The badge draws its own opaque background, so its contrast does not depend on the toolbar behind it.
    const { contrast, alpha } = await badge.evaluate((el) => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).map(Number);
      const luminance = ([r, g, b]: number[]) => {
        const lin = (c: number) => {
          const s = c / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      };
      const style = getComputedStyle(el);
      const bg = channels(style.backgroundColor);
      const [hi, lo] = [luminance(channels(style.color)), luminance(bg)].sort((a, b) => b - a);
      return { contrast: (hi + 0.05) / (lo + 0.05), alpha: bg.length > 3 ? bg[3] : 1 };
    });
    expect(alpha, 'the badge background is opaque').toBe(1);
    expect(contrast, 'badge text contrast').toBeGreaterThanOrEqual(4.5);
  });
}

test('bandit: the Arms K field can be cleared and retyped without dealing new arms on every key', async ({ page }) => {
  const t = getBanditStrings('en');
  await open(page, '/games/bandit', 'en');
  const play = page.getByTestId('bandit-panel-play');
  const arms = play.getByTestId('bandit-arms').getByRole('button');
  const field = play.getByRole('spinbutton', { name: t.armCount });

  // Pull once (retrying until hydration), so a new deal would show.
  const arm1 = arms.first();
  await expect(async () => {
    await arm1.click({ timeout: 1_000 });
    await expect(arm1).not.toHaveAccessibleName(/pulled 0 /, { timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
  const pulled = await arm1.getAttribute('aria-label');

  // Emptying the field changes nothing yet: same three arms, same pulls.
  await field.fill('');
  await expect(field).toHaveValue('');
  await expect(arms).toHaveCount(3);
  await expect(arm1).toHaveAttribute('aria-label', pulled!);

  // A digit in range takes effect at once.
  await field.pressSequentially('4');
  await expect(field).toHaveValue('4');
  await expect(arms).toHaveCount(4);

  // One out of range waits for Enter, then settles on the nearest allowed count.
  await field.fill('9');
  await expect(field).toHaveValue('9');
  await expect(arms).toHaveCount(4);
  await field.press('Enter');
  await expect(field).toHaveValue('5');
  await expect(arms).toHaveCount(5);

  // Left empty, the field goes back to the count in play.
  await field.fill('');
  await field.blur();
  await expect(field).toHaveValue('5');
  await expect(arms).toHaveCount(5);
});
