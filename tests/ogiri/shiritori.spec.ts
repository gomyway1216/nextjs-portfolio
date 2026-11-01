import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { GameHistory, RoomView } from '../../src/lib/ogiri/types';
import { partyPointsForRank } from '../../src/lib/party/points';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.235' } });

const SECRET = 'こねこ';
// Every chain reads: first word → connects → breaks → connects.
const wordFor = (stage: number, sound: string | null) => stage === 0 ? `${sound}ねこ` : ['コネコ', 'まくら', 'らくだ'][stage - 1];

for (const count of [4, 12]) test(`${count} players, separate GM and TV finish a private picture shiritori and keep its offline history`, async ({ page: host, browser, baseURL }, info) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Multi-player shiritori checks use the local Firestore emulator only.');
  const contexts: BrowserContext[] = [], phones: Page[] = [], errors: string[] = [];
  const watch = (page: Page) => page.on('pageerror', error => errors.push(error.message));
  watch(host);
  try {
    await host.goto('/games/ogiri');
    await expect(host.getByLabel('遊べる5つのゲーム').getByRole('button', { name: /おえかきしりとり/ })).toBeVisible();
    if (count === 4) await host.screenshot({ path: info.outputPath('landing.png'), fullPage: true });
    await host.getByRole('button', { name: '主催する', exact: true }).click();
    await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption('shiritori');
    await host.getByRole('textbox', { name: 'ニックネーム' }).fill('しりとりの進行役');
    await host.getByRole('button', { name: 'ルームを作成 →', exact: true }).click();
    await expect(host).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
    const code = host.url().split('/').at(-1)!, path = `/api/ogiri/${code}`;
    const read = async (page: Page): Promise<RoomView> => (await page.request.get(path)).json();
    const action = async (page: Page, data: object) => {
      const view = await read(page);
      const response = await page.request.post(path, { data: { ...data, turn: view.turn } });
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
        extraHTTPHeaders: { 'x-real-ip': `198.52.${count}.${i + 1}` } });
      contexts.push(context);
      expect((await context.request.post(path, { data: { type: 'join', name: `しりとりの参加者${i + 1}`, avatar: 'capybara' } })).ok()).toBe(true);
      const phone = await context.newPage(); watch(phone); phones.push(phone);
      await phone.goto(`/games/ogiri/${code}`);
    }
    const tv = await host.context().newPage(); watch(tv);
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.emulateMedia({ reducedMotion: 'reduce' });
    await tv.goto(`/games/ogiri/${code}/tv`);
    let room = await clickAction(host, 'ゲーム開始 →', 'start');
    expect(room.gameType).toBe('shiritori');
    const stages = room.drawingGame!.stages;
    expect(stages).toBe(count === 12 ? 3 : 4);
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
    const tvFits = () => tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2);
    await expect(tv.getByText(`しりとり 1 / ${stages} · 絵でつなぐ番`, { exact: true })).toBeVisible();
    expect(await tvFits()).toBe(true);
    if (count === 12) await tv.screenshot({ path: info.outputPath('tv-answering.png') });
    await tv.route('**/drawings/**', route => route.abort(), { times: 1 });
    for (let stage = 0; stage < stages; stage++) {
      const views = await Promise.all(phones.map(read));
      expect(new Set(views.map(view => view.drawingGame?.assignment?.key)).size).toBe(count);
      for (let i = 0; i < count; i++) {
        const phone = phones[i], assignment = views[i].drawingGame!.assignment!;
        const reading = phone.getByRole('textbox', { name: '描いた言葉の読み', exact: true });
        if (stage === 0) {
          await expect(phone.getByRole('heading', { name: `はじまりの言葉は「${assignment.prompt}」`, exact: true })).toBeVisible();
          expect(assignment.sound).toBeTruthy();
        } else {
          await expect(phone.getByRole('heading', { name: 'この絵、なんの絵？', exact: true })).toBeVisible();
          await expect(phone.getByRole('img', { name: '前の人から届いた絵', exact: true })).toBeVisible();
          expect(assignment).toMatchObject({ prompt: null, sound: null });
        }
        await draw(phone);
        await reading.fill('らーめん');
        await expect(phone.getByText('「ん」で終わる言葉は使えません。別の言葉にしてね。', { exact: true })).toBeVisible();
        await expect(phone.getByRole('button', { name: 'この絵を送る', exact: true })).toBeDisabled();
        await reading.fill(wordFor(stage, assignment.sound));
        if (stage === 0 && i === 0) {
          // The word draft comes back with the picture draft after a reload.
          await phone.reload({ waitUntil: 'domcontentloaded' });
          await expect(phone.getByRole('textbox', { name: '描いた言葉の読み', exact: true })).toHaveValue(wordFor(stage, assignment.sound));
        }
        if (stage === 1 && i === 0) await phone.screenshot({ path: info.outputPath(`phone-${count}.png`), fullPage: true });
        room = await clickAction(phone, 'この絵を送る', 'drawingSubmit');
        room = await clickAction(phone, 'これでOK！', 'answerReady');
        expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      }
      if (stage === 1) {
        // Words stay private until a chain opens, for every other viewer and the TV.
        const polls = await Promise.all([read(host), ...phones.map(read)]);
        const tvView = await (await tv.request.get(`${path}?view=tv`)).json();
        for (const view of [...polls, tvView]) expect(JSON.stringify(view)).not.toContain(SECRET);
      }
    }
    room = await read(host);
    expect(room.phase).toBe('reveal');
    const fitTv = async (label: string) => {
      for (const size of [{ width: 1920, height: 1080 }, { width: 3840, height: 2160 }]) {
        await tv.setViewportSize(size);
        if (count === 12) await tv.screenshot({ path: info.outputPath(`${label}-${size.width}.png`), fullPage: true, scale: 'css' });
        const bounds = await tv.evaluate(() => ({ width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, innerWidth, innerHeight }));
        expect(bounds.width, `${label} width ${size.width}`).toBeLessThanOrEqual(bounds.innerWidth + 2);
        expect(bounds.height, `${label} height ${size.width}`).toBeLessThanOrEqual(bounds.innerHeight + 2);
      }
    };
    await expect(tv.getByText(`しりとりの答え合わせ · 1 / ${count}`, { exact: true })).toBeVisible();
    await expect(tv.getByRole('img', { name: /^しりとり\d+の絵$/ })).toHaveCount(stages);
    await expect(tv.getByText('つながった！ 2人に+100点', { exact: true })).toHaveCount(stages === 4 ? 2 : 1);
    await expect(tv.getByText('切れた…', { exact: true })).toHaveCount(1);
    await expect(tv.getByText(SECRET, { exact: true }).first()).toBeVisible();
    await fitTv('chain');
    for (let chain = 0; chain < count; chain++) {
      room = await read(host);
      expect(room.drawingGame!.chain?.index).toBe(chain + 1);
      expect(room.drawingGame!.chain?.steps.map(step => step.link)).toEqual([null, true, false, true].slice(0, stages));
      room = await action(host, { type: 'next' });
    }
    const linkPoints = room.players.reduce((sum, player) => sum + player.score, 0);
    expect(linkPoints).toBe(count * (stages === 4 ? 2 : 1) * 200);
    expect(room.phase).toBe('voting');
    expect(room.drawingGame!.gallery).toHaveLength(count * stages);
    await expect(tv.getByRole('heading', { name: '好きな絵、ひとつ選んでね。', exact: true })).toBeVisible();
    await fitTv('gallery');
    const works = room.drawingGame!.gallery, views = await Promise.all(phones.map(read));
    for (let i = 0; i < count; i++) {
      const chosenAuthor = views[(i + 1) % count].me!, index = works.findIndex(work => work.author === chosenAuthor);
      await phones[i].getByRole('button', { name: `絵${index + 1}を大きく見る`, exact: true }).click();
      await expect(phones[i].getByRole('dialog', { name: '絵を大きく見る', exact: true })).toBeVisible();
      room = await clickAction(phones[i], 'この絵に1票！', 'drawingVote');
    }
    expect(room.phase).toBe('reveal');
    expect(room.drawingGame?.results).toBe(true);
    expect(room.players.reduce((sum, player) => sum + player.score, 0)).toBe(linkPoints + count * 100);
    await expect(tv.getByRole('heading', { name: 'この絵に、一票入りました。', exact: true })).toBeVisible();
    await fitTv('scores');
    room = await action(host, { type: 'next' });
    room = await action(host, { type: 'next' });
    expect(room.phase).toBe('finished');
    expect(room.partyGames).toBe(1);
    await expect(tv.getByRole('button', { name: /ウケた一言/ })).toHaveCount(0);
    expect(room.players.every(player => player.partyPoints === partyPointsForRank(player.rank))).toBe(true);
    const reference = room.history![0];
    expect(reference.gameType).toBe('shiritori');
    const history: GameHistory = await (await host.request.get(`/api/ogiri/history/${reference.id}`)).json();
    expect(history.drawingChains).toHaveLength(count);
    const historyPage = await host.context().newPage(); watch(historyPage);
    await historyPage.goto(`/games/ogiri/history/${reference.id}`);
    await expect(historyPage.getByRole('region', { name: '絵しりとりの記録', exact: true })).toBeVisible();
    await expect(historyPage.getByRole('img', { name: /の絵$/ })).toHaveCount(count * stages);
    const downloaded = historyPage.waitForEvent('download');
    await historyPage.getByRole('button', { name: '結果をダウンロード', exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(`shiritori-${code}-${history.game}.html`);
    const html = await readFile((await file.path())!, 'utf8');
    expect(html.match(/<svg /g)).toHaveLength(count * stages);
    expect(html).toContain(SECRET);
    expect(html).toContain('おえかきしりとり · ゲームの記録');
    // The next game starts from a card in the same room, with the party total intact.
    const totals = room.players.map(player => player.partyPoints);
    await expect(host.getByRole('button', { name: 'おえかきしりとりで次のゲームへ', exact: true })).toBeVisible();
    if (count === 4) await host.screenshot({ path: info.outputPath('next-game.png'), fullPage: true });
    room = await clickAction(host, 'だれのひとこと？で次のゲームへ', 'rematch');
    expect(room.gameType).toBe('identity');
    expect(room.drawingGame).toBeUndefined();
    expect(room.players.map(player => player.partyPoints)).toEqual(totals);
    expect((await read(host)).drawingGame).toBeUndefined(); // Gone from the stored room too, not only this reply.
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
