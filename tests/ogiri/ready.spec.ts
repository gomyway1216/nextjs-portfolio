import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { RoomView, GameHistory } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.90' } });
for (const automatic of [true, false])
  test(`five players confirm answers, fair plan, author exclusion and comic presentation (${automatic ? 'auto' : 'manual'})`, async ({ page: host, browser, baseURL }, info) => {
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    try {
      let room: RoomView = await (await host.request.post('/api/ogiri', {
        data: { name: '進行だけの人', avatar: '🐱', hostPlays: false },
      })).json();
      const path = `/api/ogiri/${room.code}`;
      const read = async (page: Page): Promise<RoomView> => (await page.request.get(path, { maxRetries: 1 })).json();
      const action = async (data: Record<string, unknown>) => {
        room = await read(host);
        const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
        expect(response.ok(), `HTTP ${response.status()}`).toBe(true);
        room = await response.json();
      };
      const phones: Page[] = [];
      for (let i = 0; i < 5; i++) {
        const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        contexts.push(context);
        expect((await context.request.post(path, { data: { type: 'join', name: `参加者${i + 1}`, avatar: '🐶' } })).ok()).toBe(true);
        const phone = await context.newPage();
        phone.on('pageerror', error => errors.push(error.message));
        phones.push(phone);
      }
      await action({ type: 'settings', settings: { ...room.settings, rounds: 1, answerSeconds: 180, voteSeconds: 45, autoAdvance: automatic } });
      await host.goto(`/games/ogiri/${room.code}`);
      const tv = await host.context().newPage();
      await tv.setViewportSize({ width: 1920, height: 1080 });
      await tv.goto(`/games/ogiri/${room.code}/tv`);
      tv.on('pageerror', error => errors.push(error.message));
      const plan = tv.getByLabel('人数に合わせたお題と配点', { exact: true });
      await expect(plan).toContainText('回答者5人 × 1ラウンドなら、全5お題');
      await expect(plan.getByText('1お題の投票者').locator('..')).toContainText('3人');
      await tv.evaluate(() => document.fonts.ready);
      expect(await tv.evaluate(() => document.fonts.check('24px "Ogiri Display"'))).toBe(true);
      await tv.screenshot({ path: info.outputPath('pop-lobby.png'), fullPage: true });
      await action({ type: 'start' });
      const answeringTurn = room.turn;
      await Promise.all(phones.map(async (phone, i) => {
        await phone.goto(`/games/ogiri/${room.code}`);
        await expect(phone.getByRole('button', { name: 'これでOK！', exact: true })).toBeDisabled();
        for (let j = 0; j < 2; j++) {
          const form = phone.getByTestId('answer-form').nth(j);
          await form.getByRole('textbox', { name: '回答', exact: true }).fill(`ボケ${i + 1}の${j + 1}`);
          await form.locator('button[type="submit"]').click();
          await expect(form.locator('button[type="submit"]')).toHaveText('送信済み ✓');
        }
      }));
      expect((await read(host)).phase).toBe('answering');
      const firstForm = phones[0].getByTestId('answer-form').first();
      await firstForm.getByRole('textbox', { name: '回答', exact: true }).fill('まだ送ってない変更');
      await expect(phones[0].getByRole('button', { name: 'これでOK！', exact: true })).toBeDisabled();
      await firstForm.locator('button[type="submit"]').click();
      await expect(firstForm.locator('button[type="submit"]')).toHaveText('送信済み ✓');
      await phones[0].getByRole('button', { name: 'これでOK！', exact: true }).click();
      await expect(firstForm.getByRole('textbox', { name: '回答', exact: true })).toBeDisabled();
      const mine = await read(phones[0]);
      expect((await phones[0].request.post(path, { data: { type: 'answer', matchId: mine.assignments[0].id, text: '確定後の変更' } })).status()).toBe(409);
      await phones[0].getByRole('button', { name: '回答を直す', exact: true }).click();
      await expect(firstForm.getByRole('textbox', { name: '回答', exact: true })).toBeEnabled();
      for (const phone of phones.slice(0, 4)) await phone.getByRole('button', { name: 'これでOK！', exact: true }).click();
      await expect(tv.getByLabel('回答の確定状況')).toContainText('4 / 5人がOK！');
      expect((await read(host)).phase).toBe('answering');
      await tv.screenshot({ path: info.outputPath('four-of-five-ready.png'), fullPage: true });
      await phones[4].getByRole('button', { name: 'これでOK！', exact: true }).click();
      if (!automatic) {
        await expect(host.getByRole('button', { name: '投票へ進む →', exact: true })).toBeVisible();
        expect((await read(host)).phase).toBe('answering');
        await host.getByRole('button', { name: '投票へ進む →', exact: true }).click();
      }
      await expect(tv.getByRole('heading', { name: 'どっちで笑った？', exact: true })).toBeVisible();
      expect((await phones[4].request.post(path, { data: { type: 'answerReady', ready: true, turn: answeringTurn } })).status()).toBe(409);
      for (let match = 0; match < 5; match++) {
        const views = await Promise.all(phones.map(read));
        const authors = views.flatMap((view, i) => view.match?.isAuthor ? [i] : []);
        const voters = views.flatMap((view, i) => view.match?.canVote ? [i] : []);
        expect(authors).toHaveLength(2);
        expect(voters).toHaveLength(3);
        if (match === 0) {
          for (const index of authors) {
            await expect(phones[index].getByText('あなたの回答があるお題です。今回は投票をお休みして、みんなの票を待とう。')).toBeVisible();
            await expect(phones[index].getByRole('button', { name: /に投票$/ })).toHaveCount(0);
          }
          expect((await phones[authors[0]].request.post(path, { data: { type: 'vote', matchId: views[0].match!.id, choice: 0 } })).status()).toBe(403);
          const cards = tv.locator('article').filter({ has: tv.locator('span').filter({ hasText: /^A$/ }) });
          await expect(cards).toHaveCount(1);
          expect(await cards.evaluate(node => getComputedStyle(node).animationName)).not.toBe('none');
          expect(await cards.evaluate(node => getComputedStyle(node, '::after').content)).not.toBe('none');
          const speakers = tv.getByTestId('answer-speaker');
          await expect(speakers.getByRole('img', { name: '作者はまだ秘密', exact: true })).toHaveCount(2);
          await expect(speakers.locator('b')).toHaveText(['？？？', '？？？']);
          const speaker = await speakers.first().elementHandle();
          expect(await speaker!.evaluate(node => getComputedStyle(node).animationName)).not.toBe('none');
          const animation = await speaker!.evaluateHandle(node => node.getAnimations()[0]);
          await tv.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname === path);
          expect(await speaker!.evaluate(node => node === document.querySelector('[data-testid="answer-speaker"]'))).toBe(true);
          expect(await speaker!.evaluate((node, previous) => node.getAnimations()[0] === previous, animation)).toBe(true);
          await tv.screenshot({ path: info.outputPath('speech-bubbles-tv.png'), fullPage: true });
          await tv.emulateMedia({ reducedMotion: 'reduce' });
          expect(await cards.evaluate(node => getComputedStyle(node).animationName)).toBe('none');
          expect(await speakers.evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === 'none'))).toBe(true);
        }
        await Promise.all(voters.map(async (index, j) => {
          if (match === 0) {
            await expect(phones[index].getByText('お題 1 / 5', { exact: true })).toBeVisible();
            const response = phones[index].waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(path) && r.request().postDataJSON()?.type === 'vote');
            await phones[index].getByRole('button', { name: `${j % 2 ? 'B' : 'A'} に投票`, exact: true }).click();
            expect((await response).ok()).toBe(true);
          } else expect((await phones[index].request.post(path, { data: { type: 'vote', matchId: views[index].match!.id, choice: j % 2 } })).ok()).toBe(true);
        }));
        if (!automatic) await action({ type: 'next' });
        room = await read(host);
        expect(room.phase).toBe('reveal');
        expect(room.match?.result?.points).toEqual([400, 100]);
        if (match === 0) {
          await expect(tv.getByRole('heading', { name: 'これ書いたの、だれ？', exact: true })).toBeVisible();
          await expect(tv.getByText('+400 点', { exact: true })).toBeVisible();
          const speakers = tv.getByTestId('answer-speaker');
          await expect(speakers.getByRole('img', { name: '作者はまだ秘密', exact: true })).toHaveCount(0);
          await expect(speakers.locator('b')).toHaveText(room.match!.result!.authors);
        }
        await action({ type: 'next' });
      }
      expect(room.phase).toBe('ranking');
      await action({ type: 'next' });
      await expect(tv.getByRole('heading', { name: '結果、出ました。', exact: true })).toBeVisible();
      expect(room.players.reduce((sum, p) => sum + p.score, 0)).toBe(2500);
      const history: GameHistory = await (await host.request.get(`/api/ogiri/history/${room.history![0].id}`)).json();
      expect(history.matches).toHaveLength(5);
      await tv.screenshot({ path: info.outputPath('pop-finish.png'), fullPage: true });
      expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
      await action({ type: 'rematch' });
      expect(room.players.every(p => !p.answerReady)).toBe(true);
      expect(errors).toEqual([]);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
