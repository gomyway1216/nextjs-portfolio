import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView, GameHistory } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.60' } });

test('a member who sits out a rematch keeps past points without earning a new placement', async ({ browser, baseURL, page }) => {
  const contexts: BrowserContext[] = [];
  try {
    const host = page.request;
    let view: RoomView = await (await host.post('/api/ogiri', {
      data: { name: '主催者', avatar: '🐱', hostPlays: true },
    })).json();
    const path = `/api/ogiri/${view.code}`;
    const action = async (data: Record<string, unknown>) => {
      const response = await host.post(path, { data: { ...data, turn: view.turn } });
      expect(response.ok(), `HTTP ${response.status()}`).toBe(true);
      view = await response.json();
    };
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect((await context.request.post(path, {
        data: { type: 'join', name: i === 2 ? '今回はお休み' : `参加者${i}`, avatar: '🐶' },
      })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...view.settings, rounds: 1, autoAdvance: false } });
    await action({ type: 'start' });
    await action({ type: 'next' });
    await action({ type: 'next' });
    await action({ type: 'finish' });
    expect(view.players.every(p => p.partyPoints === 10)).toBe(true);
    const first = await (await host.get(`/api/ogiri/history/${view.history![0].id}`)).json();
    await action({ type: 'rematch' });
    expect((await contexts[2].request.post(path, { data: { type: 'leave' } })).ok()).toBe(true);
    await action({ type: 'start' });
    const absent = view.players.find(p => p.name === '今回はお休み')!;
    expect(absent.playingThisGame).toBe(false);
    expect(view.players.filter(p => p.playingThisGame)).toHaveLength(3);
    await action({ type: 'next' });
    for (let i = 0; i < 6; i++) await action({ type: 'next' });
    expect(view.phase).toBe('ranking');
    await page.goto(`/games/ogiri/${view.code}/tv`);
    await page.getByRole('button', { name: 'パーティー総合（暫定）', exact: true }).click();
    const row = page.getByLabel('パーティー総合順位', { exact: true }).getByRole('article').filter({ hasText: '今回はお休み' });
    await expect(row).toContainText('暫定 +0pt');
    await expect(row).toContainText('10pt');
    await action({ type: 'next' });
    expect(view.phase).toBe('finished');
    await expect(page.getByRole('heading', { name: '結果、出ました。', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: '同率1位 × 3', exact: true })).toBeVisible();
    await expect(page.getByLabel('このゲームの順位', { exact: true }).getByRole('article')).toHaveCount(3);
    expect(view.players.find(p => p.id === absent.id)).toMatchObject({ partyPoints: 10, partyEarned: 0 });
    expect(view.players.filter(p => p.playingThisGame).every(p => p.partyPoints === 20)).toBe(true);
    const history: GameHistory = await (await host.get(`/api/ogiri/history/${view.history!.at(-1)!.id}`)).json();
    expect(history.partyRankings?.find(p => p.name === '今回はお休み')).toMatchObject({ points: 10, earned: 0 });
    expect(history.rankings.some(p => p.name === '今回はお休み')).toBe(false);
    expect(await (await host.get(`/api/ogiri/history/${view.history![0].id}`)).json()).toEqual(first);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
