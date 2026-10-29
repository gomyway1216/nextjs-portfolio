import { test, expect, request as playwrightRequest, type APIRequestContext, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: { 'x-real-ip': '198.51.100.145' } });

test('closed pages and a second device keep one participant, scores, explicit rest and rematch identity', async ({ browser, baseURL, page: host }, info) => {
  test.skip(!!process.env.OGIRI_TEST_URL, 'Recovery stress and independent-device coverage use the emulator only.');
  const contexts: BrowserContext[] = [];
  const phone = async (storageState?: Awaited<ReturnType<BrowserContext['storageState']>>) => {
    const context = await browser.newContext({ baseURL, storageState, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', extraHTTPHeaders: { 'x-real-ip': '198.51.100.146' } });
    contexts.push(context);
    return context;
  };
  try {
    let room: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false } })).json();
    const path = `/api/ogiri/${room.code}`;
    const action = async (data: object) => {
      room = await (await host.request.get(path)).json();
      const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok(), `host HTTP ${response.status()}`).toBe(true);
      room = await response.json();
    };
    const first = await phone();
    const page = await first.newPage();
    await page.goto(`/games/ogiri/${room.code}`);
    await page.getByRole('textbox', { name: 'ニックネーム', exact: true }).fill('戻るひと');
    await page.getByRole('button', { name: 'ルームに参加 →', exact: true }).click();
    await page.getByText('別の端末で戻るための復帰コード', { exact: true }).click();
    const code = (await page.getByLabel('あなたの復帰コード').innerText()).replace('-', '');
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('disabled'); } } }));
    await page.getByRole('button', { name: '復帰コードをコピー', exact: true }).click();
    await expect(page.getByText('コピーできませんでした。コードを控えてください。', { exact: true })).toBeVisible();
    let own: RoomView = await (await first.request.get(path)).json();
    const id = own.me!;
    const members = [first];
    for (let i = 0; i < 3; i++) {
      const context = await phone();
      members.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name: `参加者${i}`, avatar: 'pudding' } })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...room.settings, rounds: 1, autoAdvance: false } });
    await action({ type: 'start' });
    for (const [i, context] of members.entries()) {
      const view: RoomView = await (await context.request.get(path)).json();
      for (const assignment of view.assignments) expect((await context.request.post(path, { data: { type: 'answer', matchId: assignment.id, text: `答え${i}` } })).ok()).toBe(true);
    }
    await action({ type: 'next' });
    for (let match = 0; match < 4; match++) {
      for (const context of members) {
        const view: RoomView = await (await context.request.get(path)).json();
        const choice = Math.max(0, view.match?.answers.indexOf('答え0') ?? 0);
        if (view.match?.canVote) expect((await context.request.post(path, { data: { type: 'vote', matchId: view.match.id, choice } })).ok()).toBe(true);
      }
      await action({ type: 'next' });
      if (match < 3) await action({ type: 'next' });
    }
    await action({ type: 'finish' });
    own = await (await first.request.get(path)).json();
    const points = own.players.find(player => player.id === id)!;
    expect(points.score).toBeGreaterThan(0);
    expect(points.partyPoints).toBeGreaterThan(0);
    await page.getByRole('button', { name: '休憩する', exact: true }).click();
    await expect(page.getByRole('button', { name: '参加に戻る', exact: true })).toBeVisible();
    expect((await first.request.post(path, { data: { type: 'heartbeat' } })).ok()).toBe(true);
    expect((await (await first.request.get(path)).json()).resting).toBe(true);
    await page.close();
    const reopened = await first.newPage();
    await reopened.goto(`/games/ogiri/${room.code}`);
    await expect(reopened.getByRole('button', { name: '参加に戻る', exact: true })).toBeVisible();
    expect((await (await first.request.get(path)).json()).me).toBe(id);
    const storage = await first.storageState();
    await first.close();
    const sameBrowser = await phone(storage);
    expect((await (await sameBrowser.request.get(path)).json()).me).toBe(id);
    const staleTab = await sameBrowser.newPage();
    await staleTab.goto(`/games/ogiri/${room.code}`);
    await expect(staleTab.getByRole('button', { name: '参加に戻る', exact: true })).toBeVisible();
    const second = await phone();
    const recovered = await second.newPage();
    await recovered.goto(`/games/ogiri/${room.code}`);
    await recovered.getByRole('textbox', { name: 'ニックネーム', exact: true }).fill('あ'.repeat(17));
    await recovered.getByRole('button', { name: '同じ参加者で戻る', exact: true }).click();
    await recovered.getByRole('textbox', { name: '復帰コード', exact: true }).fill('ABCDEFGH');
    await recovered.getByRole('button', { name: '同じ参加者で復帰 →', exact: true }).click();
    await expect(recovered.getByText('復帰コードを確認してください。', { exact: true })).toBeVisible();
    await recovered.getByRole('textbox', { name: '復帰コード', exact: true }).fill(code);
    await recovered.getByRole('button', { name: '同じ参加者で復帰 →', exact: true }).click();
    await expect(recovered.getByRole('button', { name: '参加に戻る', exact: true })).toBeVisible();
    own = await (await second.request.get(path)).json();
    expect(own.me).toBe(id);
    expect(own.players.find(player => player.id === id)).toMatchObject({ name: '戻るひと', avatar: points.avatar, score: points.score, partyPoints: points.partyPoints, active: false });
    expect(own.players).toHaveLength(4);
    expect((await (await sameBrowser.request.get(path)).json()).me).toBeNull();
    expect((await sameBrowser.request.post(path, { data: { type: 'return' } })).status()).toBe(401);
    await expect(staleTab.getByRole('button', { name: '同じ参加者で戻る', exact: true })).toBeVisible();
    await expect(staleTab.getByLabel('あなたの復帰コード')).toHaveCount(0);
    await recovered.getByRole('button', { name: '参加に戻る', exact: true }).click();
    await expect(recovered.getByRole('button', { name: '休憩する', exact: true })).toBeVisible();
    for (const gameType of ['majority', 'identity']) {
      await action({ type: 'rematch' });
      await action({ type: 'settings', settings: { ...room.settings, gameType, rounds: 1, autoAdvance: false } });
      await action({ type: 'start' });
      own = await (await second.request.get(path)).json();
      expect(own.me).toBe(id);
      expect(own.players.find(player => player.id === id)).toMatchObject({ active: true, playingThisGame: true, partyPoints: points.partyPoints });
      const tv = await (await host.request.get(`${path}?view=tv`)).json();
      const publicView = await (await sameBrowser.request.get(path)).json();
      for (const view of [own, tv, publicView]) {
        expect(JSON.stringify(view)).not.toMatch(/recoveryCode|recoveryHash|secretHash/);
        expect(JSON.stringify(view)).not.toContain(code);
      }
      expect(tv.me).toBeNull();
      await action({ type: 'finish' });
    }
    const history = await (await host.request.get(`/api/ogiri/history/${room.history![0].id}`)).json();
    expect(JSON.stringify(history)).not.toMatch(/recovery|secretHash/);
    expect(JSON.stringify(history)).not.toContain(code);
    await recovered.screenshot({ path: info.outputPath('participant-return.png'), fullPage: true });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('wrong recovery attempts are throttled and a kicked participant cannot recover', async ({ page: host, browser, baseURL }, info) => {
  test.skip(!!process.env.OGIRI_TEST_URL, 'Emulator-only recovery abuse coverage.');
  const room: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '主催者', avatar: 'rabbit' } })).json();
  const path = `/api/ogiri/${room.code}`;
  const ipBase = info.project.name === 'webkit' ? 170 : 150;
  const guest = await browser.newContext({ baseURL });
  try {
    const member: RoomView = await (await guest.request.post(path, { data: { type: 'join', name: '退出対象', avatar: 'pudding' } })).json();
    expect((await host.request.post(path, { data: { type: 'kick', playerId: member.me } })).ok()).toBe(true);
    expect((await guest.request.post(path, { data: { type: 'recover', recoveryCode: member.recoveryCode }, headers: { 'x-real-ip': `198.51.100.${ipBase}` } })).status()).toBe(401);
    for (let i = 0; i < 29; i++) {
      const response = await guest.request.post(path, { data: { type: 'recover', recoveryCode: 'INVALID' }, headers: { 'x-real-ip': `198.51.100.${ipBase + 1 + Math.floor(i / 24)}` } });
      expect(response.status()).toBe(401);
    }
    expect((await guest.request.post(path, { data: { type: 'recover', recoveryCode: room.recoveryCode }, headers: { 'x-real-ip': `198.51.100.${ipBase + 4}` } })).status()).toBe(429);
    // A different room is still protected by the stricter per-IP limit.
    const another: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '別の部屋', avatar: 'rabbit' } })).json();
    expect((await guest.request.post(`/api/ogiri/${another.code}`, { data: { type: 'recover', recoveryCode: 'INVALID' }, headers: { 'x-real-ip': `198.51.100.${ipBase + 1}` } })).status()).toBe(429);
  } finally { await guest.close(); }
});

test('all twelve participants can recover from independent devices sharing one party Wi-Fi IP', async ({ page: host, baseURL }, info) => {
  test.skip(!!process.env.OGIRI_TEST_URL, 'Emulator-only twelve-participant recovery coverage.');
  const room: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false } })).json();
  const path = `/api/ogiri/${room.code}`;
  const clients: APIRequestContext[] = [];
  const extraHTTPHeaders = { 'x-real-ip': `198.51.100.${info.project.name === 'webkit' ? 185 : 165}` };
  const device = async () => {
    const client = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders });
    clients.push(client);
    return client;
  };
  try {
    const participants = await Promise.all(Array.from({ length: 12 }, async (_, i) => {
      const original = await device();
      const joined = await original.post(path, { data: { type: 'join', name: `WiFi参加者${i + 1}`, avatar: 'pudding' } });
      expect(joined.ok()).toBe(true);
      const view: RoomView = await joined.json();
      return { original, id: view.me, code: view.recoveryCode };
    }));
    expect((await (await host.request.get(path)).json()).players).toHaveLength(12);
    const ids = await Promise.all(participants.map(async participant => {
      const fresh = await device();
      const recovered = await fresh.post(path, { data: { type: 'recover', recoveryCode: participant.code } });
      expect(recovered.status()).toBe(200);
      const view: RoomView = await recovered.json();
      expect(view.me).toBe(participant.id);
      expect(view.players).toHaveLength(12);
      expect((await (await participant.original.get(path)).json()).me).toBeNull();
      return view.me;
    }));
    expect(new Set(ids).size).toBe(12);
  } finally { await Promise.all(clients.map(client => client.dispose())); }
});
