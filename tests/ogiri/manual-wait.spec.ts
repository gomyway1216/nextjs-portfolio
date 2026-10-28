import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';
test.use({
  extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.40' },
});

test('manual results suspend after idle, hide countdowns and resume on host advance', async ({
  page, browser, baseURL,
}) => {
  const guests: BrowserContext[] = [];
  try {
    const host = page.request;
    let view: RoomView = await (await host.post('/api/ogiri', {
      data: { name: '手動進行の主催者', avatar: '🐱', hostPlays: true },
    })).json();
    const path = `/api/ogiri/${view.code}`;
    const action = async (data: Record<string, unknown>) => {
      const response = await host.post(path, { data: { ...data, turn: view.turn } });
      expect(response.ok(), await response.text()).toBe(true);
      view = await response.json();
    };
    for (let i = 0; i < 2; i++) {
      const guest = await browser.newContext({ baseURL });
      guests.push(guest);
      expect((await guest.request.post(path, {
        data: { type: 'join', name: `参加者${i}`, avatar: '🐶' },
      })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...view.settings, rounds: 1, autoAdvance: false } });
    await action({ type: 'start' });
    await action({ type: 'next' });
    await action({ type: 'next' });
    expect(view.phase).toBe('reveal');

    let reads = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && request.url().includes(path)) reads++;
    });
    await page.clock.install();
    await page.goto(`/games/ogiri/${view.code}`);
    await expect(page.getByText('結果を確認したら、主催者が「次へ進む」を押してください。')).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(0);
    await page.clock.fastForward('16:00');
    await expect(page.getByRole('button', { name: '再接続する', exact: true })).toBeVisible();
    const idleReads = reads;
    await page.waitForTimeout(100);
    expect(reads).toBe(idleReads);

    await page.getByText('主催者の操作').click();
    await page.getByRole('button', { name: '次へ進む', exact: true }).click();
    await expect(page.getByRole('heading', { name: '笑ったほうに、一票。', exact: true })).toBeVisible();
    await expect(page.getByRole('timer')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '再接続する', exact: true })).toHaveCount(0);
  } finally {
    await Promise.all(guests.map((guest) => guest.close()));
  }
});
