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
  return { host, path, phone, room };
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

test('a rejection for a stale turn stays readable when the next poll brings that turn', async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [];
  try {
    const { host, path, phone, room } = await started(browser, baseURL, 'ogiri', contexts, 5);
    const answers = phone.getByRole('textbox', { name: '回答', exact: true });
    await expect(answers).toHaveCount(2);
    await answers.first().fill('間に合わない回答');
    await phone.route(`**${path}`, route => route.request().method() === 'POST'
      ? route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: '画面が更新されました。もう一度お試しください。' }) })
      : route.continue());
    await phone.getByRole('button', { name: 'この回答を送る', exact: true }).first().click();
    const notice = phone.getByRole('alert').filter({ hasText: '画面が更新されました。' });
    await expect(notice).toBeVisible();
    expect((await host.request.post(path, { data: { type: 'next', turn: room.turn } })).ok()).toBe(true);
    await expect(answers).toHaveCount(0);
    await expect(notice).toBeVisible();
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('a picture restored from this device after a failed fetch still has to be sent', async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [];
  try {
    const { path, phone } = await started(browser, baseURL, 'drawing', contexts, 6);
    const canvas = phone.getByLabel('絵を描くキャンバス', { exact: true });
    await expect(canvas).toHaveAttribute('aria-disabled', 'false');
    await canvas.scrollIntoViewIfNeeded();
    const stroke = async (y: number) => {
      const box = (await canvas.boundingBox())!;
      await phone.mouse.move(box.x + 40, box.y + y);
      await phone.mouse.down();
      await phone.mouse.move(box.x + 120, box.y + y, { steps: 3 });
      await phone.mouse.up();
    };
    await stroke(40);
    await phone.getByRole('button', { name: 'この絵を送る', exact: true }).click();
    await expect(phone.getByRole('button', { name: '送信済み ✓', exact: true })).toBeVisible();
    await stroke(80);
    await phone.route(`**${path}/drawing**`, route => route.request().method() === 'GET' ? route.abort() : route.continue());
    await phone.reload();
    await expect(phone.getByRole('button', { name: '伝言を更新', exact: true })).toBeEnabled();
    await expect(phone.getByRole('button', { name: 'これでOK！', exact: true })).toBeDisabled();
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('a dropped poll leaves typing and focus alone, and blocks only sending', async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [];
  try {
    const { path, phone } = await started(browser, baseURL, 'ogiri', contexts, 2);
    const answer = phone.getByRole('textbox', { name: '回答', exact: true }).first();
    await answer.fill('書きかけ');
    await answer.focus();
    await phone.route(`**${path}`, route => route.abort());
    await expect(phone.getByText('接続を確認しています。自動で再接続します。回答の下書きは保存されています。', { exact: true })).toBeVisible();
    await expect(answer).toBeEnabled();
    await expect(answer).toBeFocused();
    await expect(phone.getByRole('button', { name: 'この回答を送る', exact: true }).first()).toBeDisabled();
    await answer.pressSequentially('のまま');
    await expect(answer).toHaveValue('書きかけのまま');
    await phone.unroute(`**${path}`);
    await expect(phone.getByRole('button', { name: 'この回答を送る', exact: true }).first()).toBeEnabled();
    await expect(answer).toHaveValue('書きかけのまま');
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('the second answer cannot be tapped into nothing while the first is still sending', async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [];
  try {
    const { path, phone } = await started(browser, baseURL, 'ogiri', contexts, 3);
    const answers = phone.getByRole('textbox', { name: '回答', exact: true });
    await answers.first().fill('ひとつめ');
    await answers.last().fill('ふたつめ');
    let release!: () => void, entered!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const sending = new Promise<void>(resolve => { entered = resolve; });
    await phone.route(`**${path}`, async route => {
      if (route.request().method() === 'POST' && route.request().postDataJSON()?.type === 'answer') { entered(); await held; }
      await route.continue();
    }, { times: 1 });
    await phone.getByRole('button', { name: 'この回答を送る', exact: true }).first().click();
    await sending;
    await expect(phone.getByRole('button', { name: 'この回答を送る', exact: true })).toBeDisabled();
    release();
    await expect(phone.getByRole('button', { name: '送信済み ✓', exact: true })).toHaveCount(1);
    await phone.getByRole('button', { name: 'この回答を送る', exact: true }).click();
    await expect(phone.getByRole('button', { name: '送信済み ✓', exact: true })).toHaveCount(2);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('a second finger does not bend the stroke being drawn', async ({ browser, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const contexts: BrowserContext[] = [];
  try {
    const { phone, room } = await started(browser, baseURL, 'shiritori', contexts, 4);
    const canvas = phone.getByLabel('絵を描くキャンバス', { exact: true });
    await expect(canvas).toHaveAttribute('aria-disabled', 'false');
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await phone.mouse.move(box.x + 40, box.y + 40);
    await phone.mouse.down();
    await phone.mouse.move(box.x + 80, box.y + 40, { steps: 3 });
    await canvas.evaluate(element => {
      const at = (type: string) => element.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 77, pointerType: 'touch', clientX: 5, clientY: 5, button: 0 }));
      at('pointerdown'); at('pointermove'); at('pointerup');
    });
    await phone.mouse.move(box.x + 120, box.y + 40, { steps: 3 });
    await phone.mouse.up();
    const key = Object.keys(await phone.evaluate(() => ({ ...localStorage }))).find(name => name.startsWith(`ogiri:drawing-draft:${room.code}:`) && !name.endsWith(':word'))!;
    const draft = JSON.parse((await phone.evaluate(name => localStorage.getItem(name), key))!);
    expect(draft.strokes).toHaveLength(1);
    const ys = draft.strokes[0].p.filter((_: number, i: number) => i % 2 === 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(2);
    expect(draft.strokes[0].p.length).toBeGreaterThan(6); // The first finger kept drawing afterwards.
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
