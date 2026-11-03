import { test, expect, request as apiRequest, type APIRequestContext, type Page } from '@playwright/test';
import type { DrawingData, RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.245' } });
test.skip(() => Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');

/** A host who does not play, two players by API and this page as the third, already drawing. */
async function drawingRoom(page: Page, baseURL: string, last: number) {
  const contexts: APIRequestContext[] = [];
  const client = async (n: number) => {
    const context = await apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-real-ip': `198.56.${last}.${n}` } });
    contexts.push(context);
    return context;
  };
  const host = await client(1);
  let room: RoomView = await (await host.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false, gameType: 'drawing' } })).json();
  const path = `/api/ogiri/${room.code}`;
  for (const n of [2, 3]) expect((await (await client(n)).post(path, { data: { type: 'join', name: `参加者${n}`, avatar: 'pudding' } })).ok()).toBe(true);
  expect((await page.request.post(path, { data: { type: 'join', name: '描く人', avatar: 'rabbit' } })).ok()).toBe(true);
  room = await (await host.get(path)).json();
  expect((await host.post(path, { data: { type: 'start', turn: room.turn } })).ok()).toBe(true);
  await page.goto(`/games/ogiri/${room.code}`);
  const canvas = page.getByLabel('絵を描くキャンバス', { exact: true });
  await expect(canvas).toHaveAttribute('aria-disabled', 'false');
  await canvas.scrollIntoViewIfNeeded();
  return { code: room.code, canvas, dispose: () => Promise.all(contexts.map(context => context.dispose())) };
}
const draft = (page: Page) => page.evaluate(() => {
  const key = Object.keys(localStorage).find(key => key.startsWith('ogiri:drawing-draft:') && !key.endsWith(':word'));
  return key ? JSON.parse(localStorage.getItem(key)!) as DrawingData : null;
});

test('the canvas stays open while a sent picture is checked on a slow connection', async ({ page, baseURL }) => {
  const room = await drawingRoom(page, baseURL!, 2);
  try {
    await page.route('**/api/ogiri/*/drawings/*', async route => {
      await new Promise(resolve => setTimeout(resolve, 6000));
      await route.continue().catch(() => {});
    });
    const line = async (y: number) => {
      // Pressing the send button can scroll the page, so measure the canvas for every line.
      await room.canvas.scrollIntoViewIfNeeded();
      const box = (await room.canvas.boundingBox())!;
      await page.mouse.move(box.x + box.width * .2, box.y + box.height * y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .8, box.y + box.height * y, { steps: 8 });
      await page.mouse.up();
    };
    await line(.3);
    await page.getByRole('button', { name: 'この絵を送る', exact: true }).click();
    await expect(page.getByRole('button', { name: '送信済み ✓', exact: true })).toBeVisible();
    await expect(room.canvas).toHaveAttribute('aria-disabled', 'false', { timeout: 2000 });
    await line(.7);
    await expect(page.getByRole('button', { name: '伝言を更新', exact: true })).toBeEnabled({ timeout: 2000 });
    expect((await draft(page))?.strokes).toHaveLength(2);
  } finally { await room.dispose(); }
});
