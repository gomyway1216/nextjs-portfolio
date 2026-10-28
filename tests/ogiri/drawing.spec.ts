import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { DrawingData, GameHistory, RoomView } from '../../src/lib/ogiri/types';
import { partyPointsForRank } from '../../src/lib/party/points';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.234' } });

for (const count of [3, 4, 12]) test(`${count} drawing relayers, separate GM and TV finish one private batch and retain its offline history`, async ({ page: host, browser, baseURL, request }, info) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Multi-player drawing checks use the local Firestore emulator only.');
  const contexts: BrowserContext[] = [], phones: Page[] = [], errors: string[] = [];
  let reloading: Page | null = null;
  const watch = (page: Page) => page.on('pageerror', error => {
    // WebKit reports a canceled same-origin poll as an access-control error during reload.
    const url = new URL(page.url()), code = url.pathname.match(/^\/games\/ogiri\/([A-Z2-9]{6})(?:\/tv)?$/)?.[1];
    const api = code && new URL(`/api/ogiri/${code}`, url);
    if (browser.browserType().name() === 'webkit' && reloading === page && api &&
      error.name === `Fetch API cannot load ${api.protocol.slice(0, -1)}` &&
      error.message === `/${api.host}${api.pathname} due to access control checks.` &&
      error.stack?.split('\n')[0] === `Fetch API cannot load ${api.href} due to access control checks.`) return;
    errors.push(error.message);
  });
  watch(host);
  try {
    await host.goto('/games/ogiri');
    await expect(host.getByLabel('遊べる4つのゲーム').getByRole('button', { name: /おえかき伝言便/ })).toBeVisible();
    await host.getByRole('button', { name: '主催する', exact: true }).click();
    await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption('drawing');
    await host.getByRole('textbox', { name: 'ニックネーム' }).fill('伝言の進行役');
    await host.getByRole('button', { name: 'ルームを作成 →', exact: true }).click();
    await expect(host).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
    const code = host.url().split('/').at(-1)!, path = `/api/ogiri/${code}`;
    const read = async (page: Page): Promise<RoomView> => (await page.request.get(path)).json();
    const action = async (page: Page, data: object, drawing = false) => {
      const view = await read(page);
      const response = await page.request.post(`${path}${drawing ? '/drawing' : ''}`, { data: { ...data, turn: view.turn } });
      expect(response.ok(), await response.text()).toBe(true);
      return await response.json() as RoomView;
    };
    const clickAction = async (page: Page, name: string, type: string) => {
      const sent = page.waitForResponse(response => response.request().method() === 'POST' &&
        response.url() === `${baseURL}${path}${type === 'drawingSubmit' ? '/drawing' : ''}` && response.request().postDataJSON()?.type === type);
      await page.getByRole('button', { name, exact: true }).click();
      const response = await sent;
      expect(response.ok(), await response.text()).toBe(true);
      return await response.json() as RoomView;
    };
    await expect(host.getByLabel('ラウンド数', { exact: true })).toHaveCount(0);
    for (let i = 0; i < count; i++) {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce',
        extraHTTPHeaders: { 'x-real-ip': `198.51.${count}.${i + 1}` } });
      contexts.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name: `絵を描く長い名前の参加者${i + 1}`, avatar: 'rabbit' } })).ok()).toBe(true);
      const phone = await context.newPage(); watch(phone); phones.push(phone);
      await phone.goto(`/games/ogiri/${code}`);
    }
    const tv = await host.context().newPage(); watch(tv);
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.emulateMedia({ reducedMotion: 'reduce' });
    await tv.goto(`/games/ogiri/${code}/tv`);
    let room = await clickAction(host, 'ゲーム開始 →', 'start');
    expect(room.hostPlays).toBe(false);
    expect(room.players).toHaveLength(count);
    expect(room.players.some(player => player.id === room.me)).toBe(false);
    expect((await (await tv.request.get(`${path}?view=tv`)).json()).me).toBeNull();
    const stages = count === 3 ? 3 : 4;
    expect(room.drawingGame?.stages).toBe(stages);
    const originalTurn = room.turn;
    let firstDrawing = '', firstAuthor = '';
    const draw = async (phone: Page) => {
      const canvas = phone.getByLabel('絵を描くキャンバス', { exact: true });
      await expect(canvas).toHaveAttribute('aria-disabled', 'false');
      await canvas.scrollIntoViewIfNeeded();
      const box = (await canvas.boundingBox())!;
      await phone.mouse.move(box.x + box.width * .2, box.y + box.height * .3);
      await phone.mouse.down();
      await phone.mouse.move(box.x + box.width * .5, box.y + box.height * .6, { steps: 6 });
      await phone.mouse.move(box.x + box.width * .8, box.y + box.height * .3, { steps: 6 });
      await phone.mouse.up();
    };
    for (let stage = 0; stage < stages; stage++) {
      if (count === 4 && stage === 2) {
        // Reopen the same participant after missing a word turn. The chain rotation is unchanged.
        await action(phones[0], { type: 'join', name: '絵を描く長い名前の参加者1', avatar: 'rabbit' });
        const returned = await contexts[0].newPage(); watch(returned); phones[0] = returned;
        await returned.goto(`/games/ogiri/${code}`);
        const restored = await read(returned);
        expect(restored.me).toBe(firstAuthor);
        expect(restored.players.find(player => player.id === firstAuthor)?.score).toBe(0);
      }
      const views = await Promise.all(phones.map(read));
      expect(views.every(view => view.drawingGame?.stage === stage + 1)).toBe(true);
      expect(new Set(views.map(view => view.drawingGame?.assignment?.key)).size).toBe(count);
      for (let i = 0; i < count; i++) {
        const phone = phones[i], assignment = views[i].drawingGame!.assignment!;
        if (count === 4 && stage === 1 && i === 0) {
          await action(phone, { type: 'leave' });
          await phone.close();
          continue;
        }
        if (stage % 2 === 0) {
          if (count === 4 && stage === 2 && !assignment.prompt)
            await expect(phone.getByRole('heading', { name: '前の伝言はパス！ 想像でつないでみよう。', exact: true })).toBeVisible();
          let mutations = 0;
          const observe = (req: import('@playwright/test').Request) => {
            if (req.url().startsWith(`${baseURL}${path}`) && req.method() === 'POST' && req.postDataJSON()?.type !== 'heartbeat') mutations++;
          };
          phone.on('request', observe);
          await draw(phone);
          phone.off('request', observe);
          expect(mutations).toBe(0); // Pen strokes stay entirely on this device.
          if (stage === 0 && i === 0) {
            const key = `ogiri:drawing-draft:${code}:${assignment.key}`;
            const draft = await phone.evaluate(key => localStorage.getItem(key), key);
            expect(JSON.parse(draft!).strokes[0].p.length).toBeGreaterThan(4);
            reloading = phone;
            try { await phone.reload({ waitUntil: 'domcontentloaded' }); } finally { reloading = null; }
            await expect(phone.getByRole('button', { name: 'この絵を送る', exact: true })).toBeEnabled();
            expect(await phone.evaluate(key => localStorage.getItem(key), key)).toBe(draft);
            await phone.getByRole('button', { name: 'クリア', exact: true }).click();
            await expect(phone.getByRole('button', { name: 'この絵を送る', exact: true })).toBeDisabled();
            await phone.getByRole('button', { name: '戻す', exact: true }).click();
          }
          if (stage === 0 && i === 0) {
            let release!: () => void, entered!: () => void;
            const held = new Promise<void>(resolve => { release = resolve; });
            const intercepted = new Promise<void>(resolve => { entered = resolve; });
            await phone.route(`**${path}/drawing`, async route => { entered(); await held; await route.continue(); }, { times: 1 });
            const submitting = clickAction(phone, 'この絵を送る', 'drawingSubmit');
            await intercepted;
            try {
              await expect(phone.getByLabel('絵を描くキャンバス', { exact: true })).toHaveAttribute('aria-disabled', 'true');
              await expect(phone.getByRole('button', { name: '送信中…', exact: true })).toBeDisabled();
            } finally { release(); }
            room = await submitting;
          } else room = await clickAction(phone, 'この絵を送る', 'drawingSubmit');
          const id = room.drawingGame!.assignment!.savedDrawingId!;
          const asset = await phone.request.get(`${path}/drawings/${id}`);
          expect(asset.ok()).toBe(true);
          expect(asset.headers()['cache-control']).toContain('no-store');
          expect((await asset.json()).strokes[0].p.length).toBeGreaterThan(4);
          if (stage === 0 && i === 0) {
            firstDrawing = id; firstAuthor = room.me!;
            for (const caller of [host.request, phones[1].request, request])
              expect((await caller.get(`${path}/drawings/${id}`)).status()).toBe(403);
            expect(JSON.stringify(await (await tv.request.get(`${path}?view=tv`)).json())).not.toContain('strokes');
            // A saved drawing with unsent edits must not be confirmed.
            await expect(phone.getByRole('button', { name: 'これでOK！', exact: true })).toBeEnabled();
            await draw(phone);
            await expect(phone.getByRole('button', { name: 'これでOK！', exact: true })).toBeDisabled();
            room = await clickAction(phone, '伝言を更新', 'drawingSubmit');
            firstDrawing = room.drawingGame!.assignment!.savedDrawingId!;
            await phone.context().setOffline(true);
            await expect(phone.getByRole('alert').filter({ hasText: 'オフライン' })).toBeVisible();
            await phone.context().setOffline(false);
            await expect(phone.getByRole('button', { name: 'これでOK！', exact: true })).toBeEnabled();
          }
        } else {
          await expect(phone.getByRole('img', { name: '前の人から届いた絵', exact: true })).toBeVisible();
          await phone.getByRole('textbox', { name: '絵を言葉にする', exact: true }).fill(`伝言${stage + 1}・${i + 1} <script>window.drawingXss=true</script>`);
          room = await clickAction(phone, 'この言葉を送る', 'drawingGuess');
        }
        room = await clickAction(phone, 'これでOK！', 'answerReady');
        if (i < count - 1) expect(room.drawingGame?.stage).toBe(stage + 1);
        if (stage === 0 && i === 0) await expect(phone.getByLabel('絵を描くキャンバス', { exact: true })).toHaveAttribute('aria-disabled', 'true');
        expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      const polls = await Promise.all([read(host), ...phones.map(read)]);
      expect(polls.every(view => !JSON.stringify(view).includes('strokes'))).toBe(true);
      if (stage === 0) {
        const recipient = polls.slice(1).findIndex(view => view.drawingGame!.assignment!.inputDrawingId === firstDrawing);
        expect(recipient).toBeGreaterThanOrEqual(0);
        expect((await phones[recipient].request.get(`${path}/drawings/${firstDrawing}`)).ok()).toBe(true);
        expect((await phones[0].request.get(`${path}/drawings/${firstDrawing}`)).status()).toBe(403);
        expect((await tv.request.get(`${path}/drawings/${firstDrawing}`)).status()).toBe(403);
        const stale = { type: 'drawingGuess', text: '古い段からの送信', turn: originalTurn };
        expect((await phones[0].request.post(path, { data: stale })).status()).toBe(409);
        expect((await phones[0].request.post(`${path}/drawing`, { data: { type: 'drawingSubmit', drawing: { v: 1, strokes: [] }, turn: originalTurn } })).status()).toBe(409);
      }
      if (count === 4 && stage === 1) {
        const missing = polls.slice(1).filter(view => view.drawingGame?.assignment?.prompt === null);
        expect(missing).toHaveLength(1);
        expect(polls[0].players.find(player => player.id === firstAuthor)?.active).toBe(false);
      }
    }
    room = await read(host);
    expect(room.phase).toBe('reveal');
    const fitTv = async (label: string) => {
      for (const size of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
        await tv.setViewportSize(size);
        if (count === 12) await tv.screenshot({ path: info.outputPath(`${label}-${size.width}.png`), fullPage: true });
        const bounds = await tv.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, innerWidth, innerHeight }));
        expect(bounds.width, `${label} width ${size.width}`).toBeLessThanOrEqual(bounds.innerWidth + 2);
        expect(bounds.height, `${label} height ${size.width}`).toBeLessThanOrEqual(bounds.innerHeight + 2);
      }
    };
    await expect(tv.getByText('伝言の答え合わせ · 1 / ' + count, { exact: true })).toBeVisible();
    await fitTv('chain');
    for (let chain = 0; chain < count; chain++) {
      room = await read(host);
      expect(room.drawingGame!.chain?.index).toBe(chain + 1);
      expect(room.drawingGame!.chain?.steps).toHaveLength(stages);
      const published = room.drawingGame!.chain!.steps.find(step => step.drawingId)!.drawingId!;
      expect((await request.get(`${path}/drawings/${published}`)).ok()).toBe(true);
      room = await action(host, { type: 'next' });
    }
    expect(room.phase).toBe('voting');
    expect(room.drawingGame!.gallery).toHaveLength(count * 2);
    await expect(tv.getByRole('heading', { name: '好きな絵、ひとつ選んでね。', exact: true })).toBeVisible();
    await expect(tv.getByRole('heading', { name: '好きな絵、ひとつ選んでね。', exact: true })).toHaveCSS('color', 'rgb(255, 253, 243)');
    await fitTv('gallery');
    const views = await Promise.all(phones.map(read)), works = room.drawingGame!.gallery;
    const own = works.find(work => work.author === firstAuthor)!;
    expect((await phones[0].request.post(path, { data: { type: 'drawingVote', choice: own.id, turn: views[0].turn } })).status()).toBe(403);
    const ownIndex = works.findIndex(work => work.id === own.id);
    await phones[0].getByRole('button', { name: `絵${ownIndex + 1}を大きく見る`, exact: true }).click();
    await expect(phones[0].getByRole('button', { name: '自分の絵には投票できません', exact: true })).toBeDisabled();
    await phones[0].keyboard.press('Escape');
    for (let i = 0; i < count; i++) {
      const phone = phones[i], chosenAuthor = views[(i + 1) % count].me!;
      const index = works.findIndex(work => work.author === chosenAuthor);
      await phone.getByRole('button', { name: `絵${index + 1}を大きく見る`, exact: true }).click();
      await expect(phone.getByRole('dialog', { name: '絵を大きく見る', exact: true })).toBeVisible();
      room = await clickAction(phone, 'この絵に1票！', 'drawingVote');
    }
    expect(room.phase).toBe('reveal');
    expect(room.drawingGame?.results).toBe(true);
    expect(room.players.every(player => player.score === 100 && player.rank === 1)).toBe(true);
    await expect(tv.getByRole('heading', { name: 'この絵に、一票入りました。', exact: true })).toBeVisible();
    await fitTv('scores');
    room = await action(host, { type: 'next' });
    expect(room.phase).toBe('ranking');
    room = await action(host, { type: 'next' });
    expect(room.phase).toBe('finished');
    expect(room.partyGames).toBe(1);
    expect(room.players.every(player => player.partyPoints === partyPointsForRank(player.rank))).toBe(true);
    expect(room.players.every(player => player.partyPoints === 10)).toBe(true);
    const reference = room.history![0];
    const history: GameHistory = await (await host.request.get(`/api/ogiri/history/${reference.id}`)).json();
    expect(history.expiresAt - history.finishedAt).toBe(90 * 24 * 60 * 60 * 1000);
    expect(history.drawingChains).toHaveLength(count);
    expect(history.drawingChains!.flatMap(chain => chain.steps).filter(step => step.drawing)).toHaveLength(count * 2);
    expect(JSON.stringify(history)).not.toContain('secretHash');
    const historyPage = await host.context().newPage(); watch(historyPage);
    await historyPage.goto(`/games/ogiri/history/${reference.id}`);
    await expect(historyPage.getByRole('region', { name: '絵の伝言の記録', exact: true })).toBeVisible();
    await expect(historyPage.getByRole('img', { name: /の絵$/ })).toHaveCount(count * 2);
    await expect(historyPage.getByRole('region', { name: '絵の伝言の記録', exact: true }).locator('small').first()).toHaveCSS('color', 'rgb(25, 22, 47)');
    expect(await historyPage.evaluate(() => 'drawingXss' in window)).toBe(false);
    const downloaded = historyPage.waitForEvent('download');
    await historyPage.getByRole('button', { name: '結果をダウンロード', exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(`drawing-${code}-${history.game}.html`);
    const html = await readFile((await file.path())!, 'utf8');
    expect(html.match(/<svg /g)).toHaveLength(count * 2);
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    const archivePath = info.outputPath('drawing-history.html');
    await file.saveAs(archivePath);
    const offline = await browser.newContext({ offline: true }); contexts.push(offline);
    const archive = await offline.newPage(); watch(archive);
    // WebKit's offline transport refuses file: navigation; render the downloaded bytes directly there.
    if (browser.browserType().name() === 'webkit') await archive.setContent(html);
    else await archive.goto(`file://${archivePath}`);
    await expect(archive.getByRole('heading', { name: 'おえかき伝言便 · ゲームの記録', exact: true })).toBeVisible();
    await expect(archive.locator('svg')).toHaveCount(count * 2);
    // A second game in the same room changes mode and retains the finished drawing archive and points.
    room = await action(host, { type: 'settings', settings: { ...room.settings, gameType: 'majority', rounds: 1 } });
    expect(room.gameType).toBe('drawing');
    room = await action(host, { type: 'rematch' });
    expect(room.gameType).toBe('majority');
    expect(room.drawingGame).toBeUndefined();
    expect(room.players.every(player => player.partyPoints === 10 && player.score === 0)).toBe(true);
    room = await action(host, { type: 'start' });
    for (const phone of phones) {
      const view = await read(phone);
      await action(phone, { type: 'partyVote', choice: view.sideGame!.options[0].id });
    }
    room = await action(host, { type: 'next' });
    room = await action(host, { type: 'next' });
    expect(room.phase).toBe('finished');
    expect(room.partyGames).toBe(2);
    expect(room.players.every(player => player.partyPoints === 20)).toBe(true);
    expect(await (await host.request.get(`/api/ogiri/history/${reference.id}`)).json()).toEqual(history);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

test('drawing upload alone has the larger body allowance and rejects unsafe vectors', async ({ request, baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local payload boundary check only.');
  let room: RoomView = await (await request.post('/api/ogiri', { data: { name: '境界の主催者', avatar: 'rabbit', hostPlays: true, gameType: 'drawing' } })).json();
  const path = `/api/ogiri/${room.code}`;
  // Additional players do not need browser pages for an HTTP size/validation boundary.
  const { request: playwrightRequest } = await import('@playwright/test');
  const guests = await Promise.all([0, 1].map(() => playwrightRequest.newContext({ baseURL })));
  try {
    for (const [i, guest] of guests.entries()) expect((await guest.post(path, { data: { type: 'join', name: `境界${i}`, avatar: 'rabbit' } })).ok()).toBe(true);
    room = await (await request.post(path, { data: { type: 'start', turn: room.turn } })).json();
    const drawing: DrawingData = { v: 1, strokes: [{ c: '#201a32', w: 7, p: Array.from({ length: 1440 }, (_, i) => i % 2 ? 383 : 511) }] };
    expect(JSON.stringify(drawing).length).toBeGreaterThan(4096);
    expect((await request.post(path, { data: { type: 'drawingSubmit', drawing, turn: room.turn } })).status()).toBe(413);
    expect((await request.post(`${path}/drawing`, { data: { type: 'drawingSubmit', drawing, turn: room.turn } })).ok()).toBe(true);
    expect((await request.post(`${path}/drawing`, { data: { type: 'drawingSubmit', drawing: '<svg onload="alert(1)">', turn: room.turn } })).status()).toBe(400);
    expect((await request.post(`${path}/drawing`, { data: { type: 'drawingSubmit', padding: 'x'.repeat(12300), turn: room.turn } })).status()).toBe(413);
  } finally { await Promise.all(guests.map(guest => guest.dispose())); }
});
