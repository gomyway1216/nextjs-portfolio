import { test, expect, type Browser, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.237' } });

// QR-reader and in-app browsers can run without DOM storage. Android WebView leaves it null by default.
const blockers: [string, () => void][] = [
  ['null', () => Object.defineProperty(window, 'localStorage', { value: null })],
  ['throwing', () => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('denied', 'SecurityError'); } })],
];
async function guest(browser: Browser, baseURL: string | undefined, path: string, name: string, contexts: BrowserContext[]) {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
    extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.238' } });
  contexts.push(context);
  expect((await context.request.post(path, { data: { type: 'join', name, avatar: 'rabbit' } })).ok()).toBe(true);
}

for (const [label, block] of blockers) test(`a phone with ${label} localStorage keeps playing when ogiri prompts arrive`, async ({ page: host, browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [], errors: string[] = [];
  try {
    let room: RoomView = await (await host.request.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false } })).json();
    const path = `/api/ogiri/${room.code}`;
    await guest(browser, baseURL, path, 'いぬ', contexts);
    await guest(browser, baseURL, path, 'ぱんだ', contexts);
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
      extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.239' } });
    contexts.push(context);
    await context.addInitScript(block);
    const phone = await context.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(`/games/ogiri/${room.code}`);
    await phone.getByRole('textbox', { name: 'ニックネーム' }).fill('ねこ');
    await phone.getByRole('button', { name: 'ルームに参加 →', exact: true }).click();
    await expect(phone.getByText('このルームの参加者として接続中', { exact: true })).toBeVisible();
    room = await (await host.request.get(path)).json();
    room = await (await host.request.post(path, { data: { type: 'start', turn: room.turn } })).json();
    expect(room.phase).toBe('answering');
    const answers = phone.getByRole('textbox', { name: '回答', exact: true });
    await expect(answers).toHaveCount(2);
    await answers.first().fill('ねこの回答');
    await phone.getByRole('button', { name: 'この回答を送る', exact: true }).first().click();
    await expect(phone.getByRole('button', { name: '送信済み ✓', exact: true })).toBeVisible();
    await answers.last().fill('ふたつめの回答');
    await phone.getByRole('button', { name: 'この回答を送る', exact: true }).click();
    await expect(phone.getByRole('button', { name: 'これでOK！', exact: true })).toBeEnabled();
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
