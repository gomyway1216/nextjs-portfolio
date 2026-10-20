import { test, expect } from './fixtures';

// Regression guards for engine-route observability. Book replies must remain
// distinguishable from search, while a Hard bishop-handicap opening guarantees
// an actual out-of-book Worker/WASM request (the AI moves first in handicap
// shogi) and gives us a deterministic timer/eval assertion.

test('a book reply reads as 定跡 (label + eval), not a frozen timer', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/games/shogi');
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  // 7g7f is in book, so GOTE's reply is instant and must read as 定跡.
  await page.getByTestId('cell-7-7').click();
  await page.getByTestId('cell-7-6').click();

  const status = page.getByTestId('shogi-engine-status');
  // The book reply is shown for its 250 ms courtesy pause (ShogiImproved.tsx), and then played. What the page shows
  // during the pause is read in one go, at the frame the book state is drawn, not by one check after another: the
  // pre-effect "your turn" text must not win the race, and on the Ubuntu runner's Firefox five checks in a row
  // outlasted the pause (the evaluation read 評価値 — by the time it was asked).
  const during = await page.waitForFunction(
    () => {
      const shown = document.querySelector('[data-testid="shogi-engine-status"]');
      if (shown?.getAttribute('data-search-path') !== 'book' || shown.getAttribute('data-thinking') !== 'true') return null;
      return {
        status: shown.textContent ?? '',
        evaluation: document.querySelector('[data-testid="shogi-engine-eval"]')?.textContent ?? '',
        scoreCp: shown.getAttribute('data-score-cp'),
        searchDepth: shown.getAttribute('data-search-depth'),
        blockedMs: shown.getAttribute('data-main-thread-blocked-ms'),
      };
    },
    undefined,
    { timeout: 5_000, polling: 'raf' },
  );
  const book = await during.jsonValue();
  expect(book.status).toContain('定跡どおりに指しています');
  expect(book.status).not.toContain('AIが考えています');
  expect(book.evaluation).toContain('定跡');
  expect(book.scoreCp).toBe('');
  expect(book.searchDepth).toBe('');
  expect(book.blockedMs).toBe('0');

  await expect(status).toHaveAttribute('data-thinking', 'false', { timeout: 15_000 });
  await expect(page.getByText('あなたの番です')).toBeVisible();
  // Human 7g-7f is ply 1 and the book answer is ply 2. This pins the historical
  // book-only counter bug where the AI reply did not increment gameState.ply.
  await expect(status).toHaveAttribute('data-ply', '2');

});

test('Hard 角落ち runs a real Worker/WASM search with timer, score, depth, and ply', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/games/shogi');
  await page.getByRole('button', { name: 'Level 3 (Hard)' }).click();
  await page.getByRole('button', { name: '角落ち' }).click();
  await page.getByRole('button', { name: /Start Game/i }).first().click();

  const status = page.getByTestId('shogi-engine-status');
  const timer = page.getByTestId('shogi-engine-timer');
  const evaluation = page.getByTestId('shogi-engine-eval');

  await expect(status).toHaveAttribute('data-search-path', 'worker-pending', { timeout: 5_000 });
  await expect(status).toHaveAttribute('data-thinking', 'true');
  await expect.poll(
    async () => Number(await timer.getAttribute('data-elapsed-ms')),
    { timeout: 15_000, message: 'Hard search timer should pass one second' },
  ).toBeGreaterThan(1_000);

  await expect(status).toHaveAttribute('data-thinking', 'false', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-search-path', 'wasm');
  await expect(status).toHaveAttribute('data-ply', '1');

  const scoreAttr = await status.getAttribute('data-score-cp');
  const depthAttr = await status.getAttribute('data-search-depth');
  expect(scoreAttr, 'WASM result should include data-score-cp').toMatch(/^-?\d+(?:\.\d+)?$/);
  expect(depthAttr, 'WASM result should include data-depth').toMatch(/^\d+$/);
  const scoreCp = Number(scoreAttr);
  const depth = Number(depthAttr);
  expect(Number.isFinite(scoreCp), 'WASM result should expose a numeric SENTE score').toBe(true);
  expect(depth, 'WASM result should expose a completed depth').toBeGreaterThan(0);
  await expect(evaluation).toContainText(/評価値|勝勢/);

  // Successful WASM is the normal path: no compatibility warning is added.
  await expect(status).not.toContainText('互換モード');
});
