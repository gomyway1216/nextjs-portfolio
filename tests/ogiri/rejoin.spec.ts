import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.240' } });

test('a player who lost their phone session scans the TV QR and the host lets them back into the same seat', async ({ page: host, browser, baseURL }, info) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [], errors: string[] = [];
  const watch = (page: Page) => page.on('pageerror', error => errors.push(error.message));
  const phone = async (name: string, last: number) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
      extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': `198.53.0.${last}` } });
    contexts.push(context);
    if (name) {
      const view: RoomView = await (await context.request.post(path, { data: { type: 'join', name, avatar: 'capybara' } })).json();
      return { context, id: view.me! };
    }
    return { context, id: '' };
  };
  watch(host);
  let room: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false } })).json();
  const path = `/api/ogiri/${room.code}`;
  const action = async (data: object) => {
    room = await (await host.request.get(path)).json();
    const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
    expect(response.ok(), `host HTTP ${response.status()}`).toBe(true);
    room = await response.json();
  };
  try {
    const lost = await phone('ねこ', 1), stays = await phone('いぬ', 2), third = await phone('ぱんだ', 3), fourth = await phone('うさぎ', 4);
    await host.goto(`/games/ogiri/${room.code}`);
    const tv = await host.context().newPage(); watch(tv);
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.goto(`/games/ogiri/${room.code}/tv`);
    const qr = tv.getByRole('img', { name: 'スマートフォンで読み取ってルームに入り直す', exact: true });
    await expect(qr).toHaveCount(0); // The lobby already shows its large join QR.
    await action({ type: 'settings', settings: { ...room.settings, autoAdvance: false, rounds: 1 } });
    await action({ type: 'start' });

    await expect(qr).toBeVisible();
    const box = (await qr.boundingBox())!;
    expect(box.x + box.width).toBeGreaterThan(1920 * .7);
    expect(box.y).toBeLessThan(1080 * .3);
    expect(box.width).toBeGreaterThan(120);
    await tv.screenshot({ path: info.outputPath('tv-answering.png') });
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);

    // The rest button asks first, then offers a way back at the top of the screen.
    const resting = await stays.context.newPage(); watch(resting);
    await resting.goto(`/games/ogiri/${room.code}`);
    const rest = resting.getByRole('button', { name: '休憩する', exact: true });
    resting.once('dialog', dialog => dialog.dismiss());
    await rest.click();
    await expect(rest).toBeVisible();
    expect((await (await stays.context.request.get(path)).json()).resting).toBe(false);
    resting.once('dialog', dialog => dialog.accept());
    await rest.click();
    await resting.getByRole('button', { name: '今すぐ戻る', exact: true }).click();
    await expect(rest).toBeVisible();
    await resting.close();

    const before: RoomView = await (await lost.context.request.get(path)).json();
    await lost.context.close();
    // The room shows a seat as quiet about a minute after its phone stopped checking in.
    await expect.poll(async () => (await (await host.request.get(path)).json() as RoomView).players.find(player => player.id === lost.id)?.connected,
      { timeout: 90000, intervals: [3000] }).toBe(false);

    const replacement = await phone('', 5);
    const scanned = await replacement.context.newPage(); watch(scanned);
    await scanned.goto(`/games/ogiri/${room.code}`);
    await scanned.getByRole('group', { name: '戻る参加者を選ぶ', exact: true }).getByRole('button', { name: 'ねこ' }).click();
    await expect(scanned.getByRole('heading', { name: '主催者の許可を待っています', exact: true })).toBeVisible();
    await scanned.screenshot({ path: info.outputPath('phone-waiting.png') });
    await expect(tv.getByText('主催者の画面で許可してね', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: '入れる', exact: true }).click();

    await expect(scanned.getByRole('textbox', { name: '回答', exact: true })).toHaveCount(2);
    await expect(scanned.getByText('このルームの参加者として接続中', { exact: true })).toBeVisible();
    const after: RoomView = await (await replacement.context.request.get(path)).json();
    expect(after.me).toBe(lost.id);
    expect(after.assignments.map(item => item.id)).toEqual(before.assignments.map(item => item.id));
    expect(after.players).toHaveLength(4);
    await expect(host.getByRole('region', { name: '入り直しの依頼', exact: true })).toHaveCount(0);

    await action({ type: 'finish' });
    await expect(qr).toBeVisible();
    expect(third.id && fourth.id).toBeTruthy();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close().catch(() => {}))); }
});
