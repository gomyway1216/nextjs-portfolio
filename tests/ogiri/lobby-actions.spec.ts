import { test, expect } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.77' } });

test('the mobile host can invite, count active players and start without opening settings', async ({ page: host, browser, baseURL }, info) => {
  await host.setViewportSize({ width: 390, height: 844 });
  await host.addInitScript(() => {
    // Simulate a browser that denies access to the clipboard, as some webviews do.
    Object.defineProperty(navigator, 'clipboard', { value: undefined });
  });
  const created = await host.request.post('/api/ogiri', { data: { name: '主催者', avatar: '🐱', hostPlays: false } });
  expect(created.ok()).toBe(true);
  const { code }: RoomView = await created.json();
  const url = `/games/ogiri/${code}`;
  const api = `/api/ogiri/${code}`;
  const guests = await Promise.all(Array.from({ length: 3 }, () => browser.newContext({ baseURL })));
  const tvContext = await browser.newContext({ baseURL });
  try {
    await host.goto(url);
    const start = host.getByRole('button', { name: 'ゲーム開始 →', exact: true });
    await expect(start).toBeDisabled();
    await expect(host.getByText('あと3人で始められます。')).toBeVisible();
    await host.getByRole('button', { name: '招待リンクをコピー', exact: true }).click();
    const invite = host.getByRole('textbox', { name: '招待リンク', exact: true });
    await expect(invite).toHaveValue(new URL(url, baseURL).href);

    const visitor = await guests[0].newPage();
    await visitor.goto(await invite.inputValue());
    await visitor.getByRole('textbox', { name: 'ニックネーム', exact: true }).fill('リンクで参加');
    await visitor.getByRole('button', { name: 'ルームに参加 →', exact: true }).click();
    await expect(visitor.getByText('リンクで参加', { exact: true }).first()).toBeVisible();
    await expect(visitor.getByRole('button', { name: '招待リンクをコピー' })).toHaveCount(0);
    for (let i = 1; i < guests.length; i++) {
      const join = await guests[i].request.post(api, { data: { type: 'join', name: `参加者${i}`, avatar: '🐸' } });
      expect(join.ok()).toBe(true);
    }
    const tv = await tvContext.newPage();
    await tv.goto(`${url}/tv`);
    await expect(tv.getByRole('heading', { name: 'ただいま 3 人', exact: true })).toBeVisible();
    await expect(tv.getByRole('button', { name: 'ゲーム開始 →' })).toHaveCount(0);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(start).toBeEnabled();

    expect((await guests[2].request.post(api, { data: { type: 'leave' } })).ok()).toBe(true);
    await expect(host.getByRole('heading', { name: 'ただいま 2 人', exact: true })).toBeVisible();
    await expect(host.getByText('あと1人で始められます。')).toBeVisible();
    await expect(tv.getByText('休憩中 1 人', { exact: true })).toBeVisible();
    await expect(start).toBeDisabled();
    await host.getByRole('region', { name: '受付の操作' }).screenshot({ path: info.outputPath('host-lobby-390.png') });
    expect((await guests[2].request.post(api, { data: { type: 'return' } })).ok()).toBe(true);
    const settings = host.getByText('主催者の操作');
    await settings.click();
    await expect(host.getByRole('button', { name: '設定を保存' })).toBeHidden();
    await host.getByRole('button', { name: 'ゲーム設定へ ↓' }).click();
    await expect(host.getByRole('button', { name: '設定を保存' })).toBeVisible();
    await settings.click();
    await start.click();
    await expect(host.getByLabel('回答の確定状況')).toBeVisible();
    await expect(tv.getByLabel('回答の確定状況')).toBeVisible();
  } finally {
    await Promise.all([...guests, tvContext].map(context => context.close()));
  }
});
