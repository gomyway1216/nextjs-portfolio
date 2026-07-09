import { test, expect } from '@playwright/test';

// Regression guard for the "timer stuck at 0.4秒 / 評価値 —" report. The timer
// was never broken: an opening-BOOK reply is instant, so it was shown as
// "AIが考えています… 0.4秒" — indistinguishable from a frozen timer — and with a
// ~30-ply book that covers much of the opening it looked stuck the whole game.
// The fix makes a book reply read as "定跡どおりに指しています" (eval strip "定跡",
// no seconds), while a real search still shows the "考えています" label with a
// climbing timer and, once it finishes, a numeric eval. This pins both halves.

const spanTexts = (page: import('@playwright/test').Page) =>
  page.evaluate(() => Array.from(document.querySelectorAll('span')).map((s) => (s.textContent || '').trim()));

test('a book reply reads as 定跡 (label + eval), not a frozen timer', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/games/shogi');
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  // 7g7f is in book, so GOTE's reply is instant and must read as 定跡.
  await page.getByTestId('cell-7-7').click();
  await page.getByTestId('cell-7-6').click();

  const seen = { bookLabel: false, bookEval: false, thinkingLabel: false };
  for (let i = 0; i < 30; i++) {
    const texts = await spanTexts(page);
    if (texts.some((t) => t.includes('定跡どおりに指しています'))) seen.bookLabel = true;
    if (texts.includes('定跡')) seen.bookEval = true;
    if (texts.some((t) => t.includes('AIが考えています'))) seen.thinkingLabel = true;
    if (texts.some((t) => t.includes('あなたの番です'))) break;
    await page.waitForTimeout(40);
  }
  await expect(page.getByText('あなたの番です')).toBeVisible({ timeout: 15_000 });

  expect(seen.bookLabel, 'book reply should show the 定跡 status label').toBe(true);
  expect(seen.bookEval, 'eval strip should read 定跡 during the book reply').toBe(true);
  // A book reply must NOT masquerade as an engine search.
  expect(seen.thinkingLabel, 'book reply must not show the "考えています" search label').toBe(false);
});

test('a real (out-of-book) search shows the 考えています label with a running timer', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/games/shogi');
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  // Push pawns until GOTE leaves book and does a real search — detected by the
  // "AIが考えています…" label appearing (a book reply never shows it). We only
  // assert the label + a visible seconds counter, not the search duration, so
  // the test stays fast and robust under load.
  const pushes: Array<[string, string]> = [
    ['cell-7-7', 'cell-7-6'], ['cell-2-7', 'cell-2-6'], ['cell-2-6', 'cell-2-5'],
    ['cell-1-7', 'cell-1-6'], ['cell-9-7', 'cell-9-6'], ['cell-4-7', 'cell-4-6'],
  ];
  let sawThinkingWithTimer = false;
  for (const [f, t] of pushes) {
    await page.getByTestId(f).click();
    await page.getByTestId(t).click();
    const ok = await page.evaluate(async () => {
      const thinking = () => Array.from(document.querySelectorAll('span')).some((s) => (s.textContent || '').includes('AIが考えています'));
      const timerVisible = () => Array.from(document.querySelectorAll('span')).some((s) => {
        const el = s as HTMLElement;
        return /^\d+\.\d秒$/.test((el.textContent || '').trim()) && el.style.visibility !== 'hidden';
      });
      const done = () => Array.from(document.querySelectorAll('span')).some((s) => (s.textContent || '').includes('あなたの番です'));
      const t0 = performance.now();
      let hit = false;
      while (performance.now() - t0 < 12000) {
        if (thinking() && timerVisible()) { hit = true; break; }
        if (done() && performance.now() - t0 > 500) break; // this move was book; move on
        await new Promise((r) => setTimeout(r, 50));
      }
      return hit;
    });
    if (ok) { sawThinkingWithTimer = true; break; }
    await expect(page.getByText('あなたの番です')).toBeVisible({ timeout: 45_000 });
  }

  expect(sawThinkingWithTimer, 'an out-of-book search should show "考えています" with a visible timer').toBe(true);
});
