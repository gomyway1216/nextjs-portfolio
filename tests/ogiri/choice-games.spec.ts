import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { GameHistory, RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.160' } });

test('thermometer then minority keep choices private, reveal on TV and share points and history', async ({ page: host, browser, baseURL }, info) => {
  const contexts: BrowserContext[] = [];
  const phones: Page[] = [];
  const errors: string[] = [];
  const watch = (page: Page) => page.on('pageerror', error => errors.push(error.message));
  watch(host);
  try {
    const created = await host.request.post('/api/ogiri', { data: { name: '温度の進行役', avatar: 'rabbit', hostPlays: false, gameType: 'thermometer' } });
    expect(created.ok()).toBe(true);
    let room: RoomView = await created.json();
    const code = room.code;
    const path = `/api/ogiri/${code}`;
    const read = async (page: Page): Promise<RoomView> => (await page.request.get(path)).json();
    const action = async (data: object) => {
      room = await read(host);
      const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok(), `HTTP ${response.status()}`).toBe(true);
      room = await response.json();
    };
    for (const [i, name] of ['ひかり', 'けん', 'あおい'].entries()) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
      contexts.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name, avatar: ['capybara', 'hedgehog', 'pudding'][i] } })).ok()).toBe(true);
      const phone = await context.newPage();
      watch(phone);
      phones.push(phone);
      await phone.goto(`/games/ogiri/${code}`);
    }
    const tv = await host.context().newPage();
    watch(tv);
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.emulateMedia({ reducedMotion: 'reduce' });
    await tv.goto(`/games/ogiri/${code}/tv`);
    await host.goto(`/games/ogiri/${code}`);
    await action({ type: 'settings', settings: { ...room.settings, rounds: 1 } });
    await action({ type: 'start' });
    expect(room).toMatchObject({ gameType: 'thermometer', phase: 'voting' });
    const scale = room.sideGame!.scale!;
    await expect(tv.getByRole('heading', { name: room.sideGame!.prompt, exact: true })).toBeVisible();
    await expect(tv.getByText(`100 · ${scale.high}`, { exact: true })).toBeVisible();
    await expect(tv.getByRole('slider')).toHaveCount(0);

    // Phone 1 drags the slider, phone 2 uses the nudge buttons, phone 3 answers through the API.
    await phones[0].getByRole('slider', { name: '温度（0〜100）' }).fill('80');
    await expect(phones[0].getByText('80度', { exact: false }).first()).toBeVisible();
    await phones[0].getByRole('button', { name: '80度で送る', exact: true }).click();
    await expect(phones[0].getByText('投票済み。みんなの予想を待っています。', { exact: true })).toBeVisible();
    await phones[1].getByRole('button', { name: '-10度', exact: true }).click();
    await phones[1].getByRole('button', { name: '+1度', exact: true }).click();
    await phones[1].getByRole('button', { name: '41度で送る', exact: true }).click();
    const waiting = await read(phones[2]);
    expect(JSON.stringify(waiting)).not.toMatch(/"(80|41)"/);
    expect(waiting.sideGame).toMatchObject({ result: null, votesReceived: 2, eligible: 3 });
    expect((await contexts[2].request.post(path, { data: { type: 'partyVote', choice: '30', turn: waiting.turn } })).ok()).toBe(true);
    await expect.poll(async () => (await read(host)).phase).toBe('reveal');
    room = await read(host);
    // Mean 50.3: 41 is nearest, 30 second and 80 third.
    expect(room.sideGame!.result).toMatchObject({ average: 50.3, counts: { '30': 1, '41': 1, '80': 1 } });
    expect(room.players.map(player => [player.name, player.score])).toEqual(expect.arrayContaining([['けん', 100], ['あおい', 50], ['ひかり', 25]]));
    const distribution = tv.getByRole('figure', { name: 'みんなの温度の分布' });
    await expect(distribution.getByText('平均 50.3', { exact: true })).toBeVisible();
    await expect(tv.getByRole('heading', { name: '平均に近かった人、得点です。', exact: true })).toBeVisible();
    for (const page of [tv, phones[0]]) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await tv.screenshot({ path: info.outputPath('thermometer-reveal-tv.png') });
    await phones[0].screenshot({ path: info.outputPath('thermometer-reveal-phone.png'), fullPage: true });

    await action({ type: 'next' });
    await action({ type: 'next' });
    expect(room.phase).toBe('finished');
    await action({ type: 'rematch', gameType: 'minority' });
    await action({ type: 'start' });
    expect(room).toMatchObject({ gameType: 'minority', phase: 'voting' });
    const [first, second] = room.sideGame!.options;
    await phones[0].getByRole('button', { name: `${first.label}に投票`, exact: true }).click();
    await phones[1].getByRole('button', { name: `${first.label}に投票`, exact: true }).click();
    await phones[2].getByRole('button', { name: `${second.label}に投票`, exact: true }).click();
    await expect.poll(async () => (await read(host)).phase).toBe('reveal');
    room = await read(host);
    expect(room.sideGame!.result!.awards).toEqual([{ id: room.players.find(player => player.name === 'あおい')!.id, points: 100 }]);
    await expect(tv.getByRole('heading', { name: '少数派のみなさん、得点です。', exact: true })).toBeVisible();
    await expect(tv.getByText('1票 · 少数派！', { exact: true })).toBeVisible();
    await tv.screenshot({ path: info.outputPath('minority-reveal-tv.png') });
    await action({ type: 'next' });
    await action({ type: 'next' });
    expect(room.phase).toBe('finished');
    expect(room.partyGames).toBe(2);
    const histories: GameHistory[] = await Promise.all(room.history!.map(async ref => (await host.request.get(`/api/ogiri/history/${ref.id}`)).json()));
    expect(histories.map(history => history.gameType)).toEqual(['thermometer', 'minority']);
    expect(histories[0].matches[0].note).toContain('平均 50.3');
    expect(JSON.stringify(histories)).not.toContain(room.players[0].id);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
