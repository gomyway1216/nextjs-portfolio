import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { GAME_TITLES, type GameType, type RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.150' } });

test('result cards select every next game in the same room with one request', async ({ page: host, browser, baseURL }, info) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const watch = (page: Page) => page.on('pageerror', error => errors.push(error.message));
  watch(host);
  try {
    const created = await host.request.post('/api/ogiri', { data: { name: '次ゲームの進行役', avatar: 'rabbit', hostPlays: false } });
    expect(created.ok()).toBe(true);
    let room: RoomView = await created.json();
    const code = room.code;
    const path = `/api/ogiri/${code}`;
    const action = async (data: object) => {
      room = await (await host.request.get(path)).json();
      const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok(), `host HTTP ${response.status()}`).toBe(true);
      room = await response.json();
    };
    for (const name of ['ねこ', 'いぬ', 'ぱんだ']) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
        extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.151' } });
      contexts.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name, avatar: 'pudding' } })).ok()).toBe(true);
    }
    const participant = await contexts[0].newPage(); watch(participant);
    const tv = await host.context().newPage(); watch(tv);
    await host.goto(`/games/ogiri/${code}`);
    await participant.goto(`/games/ogiri/${code}`);
    await tv.goto(`/games/ogiri/${code}/tv`);
    await action({ type: 'settings', settings: { ...room.settings, rounds: 1, autoAdvance: false } });
    await action({ type: 'start' });
    for (let step = 0; room.phase !== 'finished' && step < 20; step++) await action({ type: 'next' });
    expect(room.phase).toBe('finished');
    const members = room.players.map(player => ({ id: player.id, name: player.name, avatar: player.avatar, partyPoints: player.partyPoints }));
    expect(members.every(player => player.partyPoints === 10)).toBe(true);
    const history = await (await host.request.get(`/api/ogiri/history/${room.history![0].id}`)).json();
    const chooser = host.getByRole('region', { name: '次のゲーム', exact: true });
    const sent: unknown[] = [];
    host.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === path) sent.push(request.postDataJSON());
    });
    for (const [index, gameType] of (['majority', 'identity', 'drawing', 'minority', 'thermometer', 'wordwolf', 'bluff', 'ogiri'] satisfies GameType[]).entries()) {
      await expect(chooser.getByRole('heading', { name: '次、なにやる？', exact: true })).toBeVisible();
      await expect(chooser.getByRole('button')).toHaveCount(Object.keys(GAME_TITLES).length);
      await expect(chooser.getByRole('button').first().locator('small')).toHaveCSS('color', 'rgb(25, 22, 47)');
      await chooser.scrollIntoViewIfNeeded();
      await expect.poll(() => chooser.locator('img').evaluateAll((images, cards) => images.length === cards && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0), Object.keys(GAME_TITLES).length)).toBe(true);
      await expect(participant.getByRole('region', { name: '次のゲーム', exact: true })).toHaveCount(0);
      await expect(tv.getByRole('region', { name: '次のゲーム', exact: true })).toHaveCount(0);
      if (index === 0) {
        for (const [width, height] of [[1280, 900], [390, 844]]) {
          await host.setViewportSize({ width, height });
          await chooser.scrollIntoViewIfNeeded();
          expect(await host.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await chooser.screenshot({ path: info.outputPath(`next-game-cards-${width}.png`) });
        }
      }
      const previousTurn = room.turn;
      const before = sent.length;
      const response = host.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === path);
      await chooser.getByRole('button', { name: `${GAME_TITLES[gameType]}で次のゲームへ`, exact: true }).click();
      const selected = await response;
      expect(selected.ok()).toBe(true);
      room = await selected.json();
      expect(sent.slice(before)).toHaveLength(1);
      expect(sent.at(-1)).toMatchObject({ type: 'rematch', gameType });
      expect(room).toMatchObject({ code, phase: 'lobby', gameType });
      expect(room.players.map(player => ({ id: player.id, name: player.name, avatar: player.avatar, partyPoints: player.partyPoints }))).toEqual(members);
      expect((await host.request.post(path, { data: { type: 'rematch', gameType, turn: previousTurn } })).status()).toBe(409);
      expect(await (await host.request.get(`/api/ogiri/history/${history.id}`)).json()).toEqual(history);
      await expect(host.getByLabel('遊ぶゲーム', { exact: true })).toHaveValue(gameType);
      await host.getByRole('button', { name: 'ゲーム開始 →', exact: true }).click();
      await expect.poll(async () => (await (await host.request.get(path)).json()).phase).not.toBe('lobby');
      room = await (await host.request.get(path)).json();
      expect(room.gameType).toBe(gameType);
      await action({ type: 'finish' });
    }
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
