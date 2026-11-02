import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test('phone reactions float on the TV, reset per turn and never change scores', async ({ browser, baseURL }) => {
  const contexts: BrowserContext[] = [];
  try {
    const open = async (ip: string, options: Parameters<typeof browser.newContext>[0] = {}) => {
      const context = await browser.newContext({
        baseURL, ...options,
        extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': ip },
      });
      contexts.push(context);
      return context;
    };
    const hostContext = await open('198.51.100.70');
    const host = hostContext.request;
    let view: RoomView = await (await host.post('/api/ogiri', { data: { name: 'リアクション主催', avatar: '🐱', hostPlays: false } })).json();
    const path = `/api/ogiri/${view.code}`;
    const action = async (data: object) => {
      const response = await host.post(path, { data: { ...data, turn: view.turn } });
      expect(response.ok(), await response.text()).toBe(true);
      view = await response.json();
    };
    const guests: BrowserContext[] = [];
    for (let i = 0; i < 4; i++) {
      const guest = await open('198.51.100.71');
      guests.push(guest);
      expect((await guest.request.post(path, { data: { type: 'join', name: `観客${i}`, avatar: '🐶' } })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...view.settings, rounds: 1, autoAdvance: false } });
    await action({ type: 'start' });
    expect(view.reactions).toBeNull();
    const closed = await guests[1].request.post(`${path}/reactions`, { data: { counts: { laugh: 1 }, turn: view.turn } });
    expect(closed.status()).toBe(409);
    await action({ type: 'next' });
    expect(view.phase).toBe('voting');

    const tv = await (await open('198.51.100.72')).newPage();
    await tv.goto(`/games/ogiri/${view.code}/tv`);
    const tally = tv.getByLabel('みんなのリアクション');
    await expect(tally).toContainText('😂 0');

    const phone = await guests[0].newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(`/games/ogiri/${view.code}`);
    const laugh = phone.getByRole('button', { name: '笑った', exact: true });
    for (let i = 0; i < 3; i++) await laugh.click();
    await expect(tally).toContainText('😂 3');
    await expect(tv.locator('[aria-hidden="true"] i', { hasText: '😂' }).first()).toBeAttached();
    expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    const api = guests[1].request;
    expect((await api.post(`${path}/reactions`, { data: { counts: { wow: 2 }, turn: `${view.turn}:old` } })).status()).toBe(409);
    expect((await api.post(`${path}/reactions`, { data: { counts: { wow: 99 }, turn: view.turn } })).status()).toBe(400);
    expect((await api.post(`${path}/reactions`, { data: { counts: { wow: 2 }, turn: view.turn } })).ok()).toBe(true);
    expect((await api.post(`${path}/reactions`, { data: { counts: { wow: 2 }, turn: view.turn } })).status()).toBe(429);
    await expect(tally).toContainText('🤯 2');

    await action({ type: 'next' });
    expect(view.phase).toBe('reveal');
    await expect(tally).toContainText('😂 0');
    await expect(tally).toContainText('🤯 0');
    expect(view.players.every((player) => player.score === 0)).toBe(true);

    const calm = await (await open('198.51.100.73', { reducedMotion: 'reduce' })).newPage();
    await calm.goto(`/games/ogiri/${view.code}/tv`);
    await expect(calm.getByLabel('みんなのリアクション')).toBeVisible();
    expect((await api.post(`${path}/reactions`, { data: { counts: { clap: 4 }, turn: view.turn } })).ok()).toBe(true);
    await expect(calm.getByLabel('みんなのリアクション')).toContainText('👏 4');
    await expect(calm.locator('[aria-hidden="true"] i', { hasText: '👏' })).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
