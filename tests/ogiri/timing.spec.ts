import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.91' } });

test('waits past the answer guide, accepts the last player and keeps results readable', async ({ page: host, browser, baseURL }) => {
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  host.on('pageerror', error => errors.push(error.message));
  try {
    let room: RoomView = await (await host.request.post('/api/ogiri', {
      data: { name: 'ゆっくり進行役', avatar: '🐱', hostPlays: false },
    })).json();
    const path = `/api/ogiri/${room.code}`;
    const read = async (context: BrowserContext): Promise<RoomView> => (await context.request.get(path)).json();
    const action = async (data: object) => {
      room = await read(host.context());
      const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok()).toBe(true);
      room = await response.json();
    };
    expect(room.settings).toMatchObject({ answerSeconds: 180, voteSeconds: 45 });
    for (let i = 0; i < 4; i++) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
      contexts.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name: `ゆっくり${i + 1}`, avatar: '🐶' } })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...room.settings, rounds: 1, answerSeconds: 30 } });
    await host.goto(`/games/ogiri/${room.code}`);
    const tv = await host.context().newPage();
    tv.on('pageerror', error => errors.push(error.message));
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.goto(`/games/ogiri/${room.code}/tv`);
    await action({ type: 'start' });
    const answerTurn = room.turn;
    const late = await contexts[3].newPage();
    late.on('pageerror', error => errors.push(error.message));
    await late.goto(`/games/ogiri/${room.code}`);
    for (const context of contexts.slice(0, 3)) {
      const mine = await read(context);
      for (const assignment of mine.assignments)
        expect((await context.request.post(path, { data: { type: 'answer', matchId: assignment.id, text: 'お先にどうぞ' } })).ok()).toBe(true);
      expect((await context.request.post(path, { data: { type: 'answerReady', ready: true, turn: mine.turn } })).ok()).toBe(true);
    }
    // Use real server time: browser-only clock changes would miss the original server cutoff.
    await host.waitForTimeout(Math.max(0, room.deadline - Date.now() + 1200));
    expect((await read(host.context())).phase).toBe('answering');
    await expect(late.getByRole('timer')).toContainText('待機');
    for (let i = 0; i < 2; i++) {
      const form = late.getByTestId('answer-form').nth(i);
      await expect(form.getByRole('textbox')).toBeEnabled();
      await form.getByRole('textbox').fill(`待ってくれてありがとう${i + 1}`);
      await form.locator('button[type="submit"]').click();
      await expect(form.locator('button[type="submit"]')).toHaveText('送信済み ✓');
    }
    expect((await read(host.context())).phase).toBe('answering');
    await late.getByRole('button', { name: 'これでOK！', exact: true }).click();
    await expect(tv.getByRole('heading', { name: 'どっちで笑った？', exact: true })).toBeVisible();
    room = await read(host.context());
    const voteDeadline = room.deadline;
    expect((await contexts[0].request.post(path, { data: { type: 'extend', turn: room.turn } })).status()).toBe(403);
    await host.getByText('主催者の操作').click();
    await host.getByRole('button', { name: '投票時間を＋30秒', exact: true }).click();
    await expect.poll(async () => (await read(host.context())).deadline).toBe(voteDeadline + 30000);
    for (const context of contexts) {
      const mine = await read(context);
      if (mine.match?.canVote)
        expect((await context.request.post(path, { data: { type: 'vote', matchId: mine.match.id, choice: 0 } })).ok()).toBe(true);
    }
    room = await read(host.context());
    expect(room.phase).toBe('reveal');
    expect(room.deadline - room.serverTime).toBeGreaterThan(12000);
    expect(room.deadline - room.serverTime).toBeLessThanOrEqual(15000);
    // The former eight-second result display must not move on while people are reading.
    await host.waitForTimeout(9200);
    expect((await read(host.context())).phase).toBe('reveal');
    await expect(tv.getByRole('heading', { name: 'これ書いたの、だれ？', exact: true })).toBeVisible();
    expect((await host.request.post(path, { data: { type: 'extend', turn: answerTurn } })).status()).toBe(409);
    await action({ type: 'finish' });
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});
