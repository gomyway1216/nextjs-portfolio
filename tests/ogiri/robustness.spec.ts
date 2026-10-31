import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import type { GameType, RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.241' } });

/** Three joined players with one real phone page; returns once the first round is open. */
async function started(browser: Browser, baseURL: string | undefined, gameType: GameType, contexts: BrowserContext[], last: number) {
  const open = async (i: number) => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
      extraHTTPHeaders: { 'x-real-ip': `198.54.${last}.${i}` } });
    contexts.push(context);
    return context;
  };
  const host = await open(0);
  let room: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false, gameType } })).json();
  const path = `/api/ogiri/${room.code}`;
  const guests = await Promise.all([1, 2, 3].map(open));
  for (const [i, guest] of guests.entries())
    expect((await guest.request.post(path, { data: { type: 'join', name: `参加者${i + 1}`, avatar: 'pudding' } })).ok()).toBe(true);
  const phone = await guests[0].newPage();
  await phone.goto(`/games/ogiri/${room.code}`);
  await expect(phone.getByText('このルームの参加者として接続中', { exact: true })).toBeVisible();
  room = await (await host.request.get(path)).json();
  room = await (await host.request.post(path, { data: { type: 'start', turn: room.turn } })).json();
  return { path, phone, room };
}

test('a rejected answer stays on screen past the next poll until it is read', async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [];
  try {
    const { path, phone } = await started(browser, baseURL, 'ogiri', contexts, 1);
    const answers = phone.getByRole('textbox', { name: '回答', exact: true });
    await expect(answers).toHaveCount(2);
    await answers.first().fill('届かない回答');
    await phone.route(`**${path}`, route => route.request().method() === 'POST'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '回答の受付は終了しました。' }) })
      : route.continue());
    await phone.getByRole('button', { name: 'この回答を送る', exact: true }).first().click();
    const notice = phone.getByRole('alert').filter({ hasText: '回答の受付は終了しました。' });
    await expect(notice).toBeVisible();
    await phone.waitForTimeout(4000); // Longer than two polls at 1.5 seconds.
    await expect(notice).toBeVisible();
    await expect(notice).toBeInViewport();
    await phone.getByRole('button', { name: 'お知らせを閉じる', exact: true }).click();
    await expect(notice).toHaveCount(0);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

