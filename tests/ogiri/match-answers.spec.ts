import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.248' } });

test('a phone answers in its own words, and the TV groups whoever said the same thing', async ({ page, browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: APIRequestContext[] = [];
  const client = async (n: number) => {
    const context = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-real-ip': `198.59.0.${n}` } });
    contexts.push(context);
    return context;
  };
  const host = await client(1);
  const tvContext = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  try {
    const room: RoomView = await (await host.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false, gameType: 'match' } })).json();
    const path = `/api/ogiri/${room.code}`;
    const post = async (context: APIRequestContext, data: object) => {
      const view: RoomView = await (await context.get(path)).json();
      const response = await context.post(path, { data: { ...data, turn: view.turn } });
      expect(response.ok(), await response.text()).toBe(true);
    };
    const players = [await client(2), await client(3)];
    for (const [i, player] of players.entries())
      expect((await player.post(path, { data: { type: 'join', name: `答える人${i + 1}`, avatar: 'pudding' } })).ok()).toBe(true);
    expect((await page.request.post(path, { data: { type: 'join', name: 'スマホの人', avatar: 'rabbit' } })).ok()).toBe(true);
    const tv = await tvContext.newPage();
    await tv.goto(`/games/ogiri/${room.code}/tv`);
    await post(host, { type: 'start' });
    await page.goto(`/games/ogiri/${room.code}`);
    await page.getByRole('textbox', { name: 'あなたの答え', exact: true }).fill('ツナマヨ');
    await page.getByRole('button', { name: 'この回答を送る', exact: true }).click();
    await page.getByRole('button', { name: 'これでOK！', exact: true }).click();
    await expect(tv.getByText('ツナマヨ')).toHaveCount(0);
    for (const [i, player] of players.entries()) {
      await post(player, { type: 'partyAnswer', text: i === 0 ? 'つなまよ' : '梅' });
      await post(player, { type: 'answerReady', ready: true });
    }
    const groups = tv.getByLabel('みんなの答え', { exact: true });
    await expect(groups.getByText('2人がハモった！', { exact: true })).toBeVisible();
    // The group shows one of its spellings; both answers read the same.
    await expect(groups.getByText(/^(ツナマヨ|つなまよ)$/)).toBeVisible();
    await expect(groups.getByText('ひとりだけ', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'ハモった人、得点です。', exact: true })).toBeVisible();
    const view: RoomView = await (await page.request.get(path)).json();
    expect(view.players.find(player => player.id === view.me)?.score).toBe(100);
  } finally {
    await tvContext.close();
    await Promise.all(contexts.map(context => context.dispose()));
  }
});
