import { test, expect, request as apiRequest, type APIRequestContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.247' } });

test('each player acts once: only the actor sees the word, and the TV lists what was guessed', async ({ page, browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: APIRequestContext[] = [];
  const client = async (n: number) => {
    const context = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-real-ip': `198.58.0.${n}` } });
    contexts.push(context);
    return context;
  };
  const host = await client(1);
  const tvContext = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1080 }, reducedMotion: 'reduce' });
  try {
    let room: RoomView = await (await host.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false, gameType: 'gesture' } })).json();
    const path = `/api/ogiri/${room.code}`;
    const players = [await client(2), await client(3)];
    for (const [i, player] of players.entries())
      expect((await player.post(path, { data: { type: 'join', name: `見る人${i + 1}`, avatar: 'pudding' } })).ok()).toBe(true);
    expect((await page.request.post(path, { data: { type: 'join', name: '演じる人', avatar: 'rabbit' } })).ok()).toBe(true);
    const tv = await tvContext.newPage();
    await tv.goto(`/games/ogiri/${room.code}/tv`);
    const post = async (context: APIRequestContext, data: object) => {
      const view: RoomView = await (await context.get(path)).json();
      const response = await context.post(path, { data: { ...data, turn: view.turn } });
      expect(response.ok(), await response.text()).toBe(true);
      return await response.json() as RoomView;
    };
    await post(host, { type: 'start' });
    await page.goto(`/games/ogiri/${room.code}`);

    for (let turn = 1; turn <= 3; turn++) {
      room = await (await page.request.get(path)).json();
      const game = room.gestureGame!;
      expect(game.index).toBe(turn);
      await expect(tv.getByText(`ジェスチャー早当て · ${turn} / 3人目`, { exact: true })).toBeVisible();
      await expect(tv.getByRole('heading', { name: `次は${game.actor.name}さんの番！`, exact: true })).toBeVisible();
      if (game.mine) {
        await page.getByRole('button', { name: 'スタート！（60秒）', exact: true }).click();
        const card = page.getByTestId('gesture-word');
        await expect(card).toBeVisible();
        const first = await card.locator('strong').textContent();
        await expect(tv.getByText(first!, { exact: true })).toHaveCount(0);
        await page.getByRole('button', { name: '当たった！', exact: true }).click();
        await page.getByRole('button', { name: '見る人1が当てた', exact: true }).click();
        await expect(card.locator('strong')).not.toHaveText(first!);
        await expect(tv.getByRole('list', { name: '当たったお題' }).getByText(first!, { exact: true })).toBeVisible();
        await page.getByRole('button', { name: 'パス', exact: true }).click();
        await expect(page.getByText('パス 1', { exact: false })).toBeVisible();
      } else {
        const actor = players.find((_, i) => game.actor.name === `見る人${i + 1}`)!;
        await post(actor, { type: 'gestureStart' });
        await expect(page.getByRole('heading', { name: `${game.actor.name}さんのジェスチャー、なーんだ？`, exact: true })).toBeVisible();
        await expect(page.getByTestId('gesture-word')).toHaveCount(0);
        const me: RoomView = await (await page.request.get(path)).json();
        const acting: RoomView = await (await actor.get(path)).json();
        await post(actor, { type: 'gestureCorrect', by: me.me, word: acting.gestureGame!.dealt });
        await expect(tv.getByRole('list', { name: '当たったお題' }).locator('li')).toHaveCount(1);
      }
      await post(host, { type: 'next' });
      await expect(tv.getByRole('heading', { name: `${game.actor.name}さんの番、おしまい！`, exact: true })).toBeVisible();
      await expect(tv.getByRole('list', { name: 'このターンのお題' }).locator('li')).toHaveCount(game.mine ? 3 : 2);
      await post(host, { type: 'next' });
    }
    await expect(tv.getByRole('heading', { name: 'いま、こうなってます。', exact: true })).toBeVisible();
    room = await (await host.get(path)).json();
    expect(room.players.reduce((sum, player) => sum + player.score, 0)).toBe(3 * 150);
  } finally {
    await tvContext.close();
    await Promise.all(contexts.map(context => context.dispose()));
  }
});
