import { test, expect } from '@playwright/test';

test('TV stops hidden and idle polling, resumes explicitly, and stops on expiry', async ({ page, request }) => {
  const created = await request.post('/api/ogiri', { data: { name: '省通信の確認', avatar: '🐱' } });
  expect(created.ok()).toBe(true);
  const { code } = await created.json();
  let reads = 0;
  page.on('request', (req) => {
    if (req.method() === 'GET' && req.url().includes(`/api/ogiri/${code}`)) reads++;
  });
  await page.clock.install();
  await page.goto(`/games/ogiri/${code}/tv`);
  await expect(page.getByRole('heading', { name: 'ただいま 1 人' })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenReads = reads;
  await page.waitForTimeout(3500);
  expect(reads).toBe(hiddenReads);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => reads).toBeGreaterThan(hiddenReads);
  await page.clock.fastForward('16:00');
  await expect(page.getByRole('button', { name: '再接続する', exact: true })).toBeVisible();
  const idleReads = reads;
  await page.waitForTimeout(3500);
  expect(reads).toBe(idleReads);
  await page.getByRole('button', { name: '再接続する', exact: true }).click();
  await expect.poll(() => reads).toBeGreaterThan(idleReads);
  await expect(page.getByRole('button', { name: '再接続する', exact: true })).toHaveCount(0);

  // Exercise the client response to a terminal HTTP status; room-expiry rules have separate API tests.
  await page.route(`**/api/ogiri/${code}?view=tv`, (route) => route.fulfill({
    status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'ルームの有効期限が切れています。' }),
  }));
  await page.reload();
  await expect(page.getByText('このルームへの自動更新を終了しました。')).toBeVisible();
  const expiredReads = reads;
  await page.waitForTimeout(3500);
  expect(reads).toBe(expiredReads);
});
