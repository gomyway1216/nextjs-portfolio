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
    await page.setViewportSize({ width: 390, height: 844 });
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
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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

test('manual twelve-player TV, long answers, result spotlight and keyboard close', async ({ browser, baseURL }, info) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  try {
    const hostContext = await browser.newContext({ baseURL, extraHTTPHeaders: { 'x-real-ip': '198.51.100.50' } });
    contexts.push(hostContext);
    const host = hostContext.request;
    let view: RoomView = await (await host.post('/api/ogiri', { data: { name: 'TVの進行役', avatar: '🐱', hostPlays: false } })).json();
    const path = `/api/ogiri/${view.code}`;
    const action = async (data: object) => {
      const response = await host.post(path, { data: { ...data, turn: view.turn } });
      expect(response.ok(), `HTTP ${response.status()}`).toBe(true);
      view = await response.json();
    };
    const phones: BrowserContext[] = [];
    for (let i = 0; i < 12; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      phones.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name: `あいうえおかきくけこさしすせ${String(i).padStart(2,'0')}`, avatar: '🐶' } })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...view.settings, autoAdvance: false, rounds: 1 } });
    await action({ type: 'start' });
    await Promise.all(phones.map(async (context) => {
      const mine: RoomView = await (await context.request.get(path)).json();
      for (const match of mine.assignments) expect((await context.request.post(path, { data: { type: 'answer', matchId: match.id, text: '長い回答でもみんなで笑える。'.repeat(7).slice(0, 100) } })).ok()).toBe(true);
    }));
    const tv = await hostContext.newPage();
    tv.on('pageerror', error => errors.push(error.message));
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.emulateMedia({ reducedMotion: 'reduce' });
    await action({ type: 'next' });
    for (const context of phones) {
      const mine: RoomView = await (await context.request.get(path)).json();
      if (mine.match?.canVote) {
        expect((await context.request.post(path, { data: { type: 'vote', matchId: mine.match.id, choice: 0 } })).ok()).toBe(true);
        break;
      }
    }
    await action({ type: 'next' });
    await tv.goto(`/games/ogiri/${view.code}/tv`);
    await expect(tv.getByRole('heading', { name: 'この一言の作者は…', exact: true })).toBeVisible();
    await expect(tv.getByRole('timer')).toHaveCount(0);
    await tv.screenshot({ path: info.outputPath('manual-long-reveal.png'), fullPage: true });
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
    await tv.setViewportSize({ width: 3840, height: 2160 });
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
    await tv.setViewportSize({ width: 1920, height: 1080 });
    for (let i = 0; i < 23; i++) await action({ type: 'next' });
    expect(view.phase).toBe('ranking');
    await expect(tv.getByRole('heading', { name: 'ここまでの大喜利王', exact: true })).toBeVisible();
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
    await tv.screenshot({ path: info.outputPath('manual-twelve-ranking.png'), fullPage: true });
    await tv.getByRole('button', {name: /ベスト一言/}).click();
    await expect(tv.getByRole('dialog')).toBeVisible();
    await tv.keyboard.press('Escape');
    await expect(tv.getByRole('dialog')).not.toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
