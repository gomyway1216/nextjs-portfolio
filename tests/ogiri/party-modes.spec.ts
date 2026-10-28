import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { GAME_TITLES, type GameHistory, type GameType, type RoomView } from '../../src/lib/ogiri/types';
import { partyPointsForRank } from '../../src/lib/party/points';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.93' } });

for (const firstType of ['majority', 'identity'] as const)
  test(`${firstType} then another party game share four players, TV, points and history`, async ({ page: host, browser, baseURL }, info) => {
    const contexts: BrowserContext[] = [];
    const phones: Page[] = [];
    const errors: string[] = [];
    let reloading: Page | null = null;
    const watch = (page: Page) => page.on('pageerror', error => {
      const url = new URL(page.url());
      const code = url.pathname.match(/^\/games\/ogiri\/([A-Z2-9]{6})(?:\/tv)?$/)?.[1];
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
      await host.getByRole('button', { name: '主催する', exact: true }).click();
      await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption(firstType);
      await host.getByRole('textbox', { name: 'ニックネーム' }).fill('進行だけの人');
      await host.getByRole('button', { name: 'ルームを作成 →', exact: true }).click();
      await expect(host).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
      const code = host.url().split('/').at(-1)!;
      const path = `/api/ogiri/${code}`;
      const read = async (page: Page): Promise<RoomView> => (await page.request.get(path)).json();
      const clickAction = async (page: Page, name: string, type: string) => {
        const sent = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(path) && response.request().postDataJSON()?.type === type);
        await page.getByRole('button', { name, exact: true }).click();
        expect((await sent).ok()).toBe(true);
      };
      let room = await read(host);
      const action = async (data: object) => {
        room = await read(host);
        const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
        expect(response.ok(), `HTTP ${response.status()}`).toBe(true);
        room = await response.json();
      };
      expect(room.gameType).toBe(firstType);
      expect(room.hostPlays).toBe(false);
      for (let i = 0; i < 4; i++) {
        const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        contexts.push(context);
        expect((await context.request.post(path, { data: { type: 'join', name: ['ひかり', 'けん', 'あおい', 'なな'][i], avatar: ['rabbit', 'capybara', 'alien', 'pudding'][i] } })).ok()).toBe(true);
        const phone = await context.newPage();
        watch(phone);
        phones.push(phone);
        await phone.goto(`/games/ogiri/${code}`);
      }
      const tv = await host.context().newPage();
      watch(tv);
      await tv.setViewportSize({ width: 1920, height: 1080 });
      await tv.emulateMedia({ reducedMotion: 'reduce' });
      await tv.goto(`/games/ogiri/${code}/tv`);
      await host.getByLabel('ラウンド数', { exact: true }).selectOption('1');
      await host.getByRole('button', { name: '設定を保存', exact: true }).click();
      await expect(host.getByRole('status')).toContainText('設定を保存しました');
      const secondType: GameType = firstType === 'majority' ? 'identity' : 'majority';
      // Choosing a mode in an unsaved form must never silently change the game we start.
      await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption(secondType);
      await clickAction(host, 'ゲーム開始 →', 'start');
      room = await read(host);
      expect(room.gameType).toBe(firstType);
      expect(room.players).toHaveLength(4);
      expect(room.players.some(player => player.id === room.me)).toBe(false);
      expect((await (await tv.request.get(`${path}?view=tv`)).json()).me).toBeNull();

      async function play(type: GameType) {
        if (type === 'identity') {
          for (let i = 0; i < 4; i++) {
            const form = phones[i].getByTestId('party-answer-form');
            const text = `秘密のひとこと${i + 1}`;
            await expect(form).toBeVisible();
            await form.getByRole('textbox', { name: 'あなたのひとこと' }).fill(text);
            if (i === 0) {
              reloading = phones[i];
              try { await phones[i].reload({ waitUntil: 'domcontentloaded' }); }
              finally { reloading = null; }
              await expect(form.getByRole('textbox')).toHaveValue(text);
            }
            await form.getByRole('button', { name: 'この回答を送る', exact: true }).click();
            await expect(form.getByRole('button')).toHaveText('送信済み ✓');
            if (i < 3) await clickAction(phones[i], 'これでOK！', 'answerReady');
          }
          expect((await read(host)).phase).toBe('answering');
          const privateTv: RoomView = await (await tv.request.get(`${path}?view=tv`)).json();
          expect(JSON.stringify(privateTv)).not.toContain('秘密のひとこと');
          await expect(tv.getByLabel('回答の確定状況')).toContainText('3 / 4人がOK！');
          await clickAction(phones[3], 'これでOK！', 'answerReady');
        }
        const questions = type === 'identity' ? 4 : 1;
        for (let question = 0; question < questions; question++) {
          room = await read(host);
          expect(room.phase).toBe('voting');
          expect(room.sideGame?.type).toBe(type);
          await expect(tv.getByRole('region', { name: GAME_TITLES[type], exact: true })).toBeVisible();
          const views = await Promise.all(phones.map(read));
          if (type === 'identity') {
            await expect(tv.getByTestId('party-anonymous-answer')).toHaveText(room.sideGame!.revealText!);
            await expect(tv.getByTestId('party-speaker').getByRole('img', { name: '作者はまだ秘密', exact: true })).toBeVisible();
            await expect(tv.getByTestId('party-speaker')).toContainText('？？？');
            const author = views.findIndex(view => view.sideGame?.isAuthor);
            expect(author).toBeGreaterThanOrEqual(0);
            expect((await phones[author].request.post(path, { data: { type: 'partyVote', choice: views[author].me, turn: views[author].turn } })).status()).toBe(403);
            let voter = 0;
            for (let i = 0; i < 4; i++) if (views[i].sideGame?.canVote) {
              await expect(phones[i].getByTestId('party-anonymous-answer')).toHaveText(room.sideGame!.revealText!);
              const choice = views[i].sideGame!.options.find(option => voter === 0 ? option.id === views[author].me : option.id !== views[author].me)!;
              await clickAction(phones[i], `${choice.label}だと思う`, 'partyVote');
              voter++;
            }
          } else {
            expect(room.sideGame?.eligible).toBe(4);
            for (let i = 0; i < 4; i++) {
              const choice = views[i].sideGame!.options[i < 2 ? 0 : 1];
              await clickAction(phones[i], `${choice.label}に投票`, 'partyVote');
            }
          }
          room = await read(host);
          expect(room.phase).toBe('reveal');
          if (type === 'identity') {
            const author = room.players.find(player => player.id === room.sideGame?.result?.correctOption)!;
            await expect(tv.getByTestId('party-speaker')).toContainText(author.name);
            await expect(tv.getByTestId('party-speaker').getByRole('img', { name: '作者はまだ秘密', exact: true })).toHaveCount(0);
          }
          expect(room.sideGame!.result!.awards.reduce((sum, award) => sum + award.points, 0)).toBe(type === 'identity' ? 200 : 400);
          await expect(tv.getByLabel('今回の獲得ポイント')).toBeVisible();
          await expect(tv.getByRole('heading', { name: type === 'majority' ? '多数派のみなさん、得点です。' : '当てた人も、だました人も。', exact: true })).toHaveCSS('color', 'rgb(255, 253, 243)');
          if (type === 'majority') await expect(tv.getByText('2票 · 多数派！', { exact: true }).first()).toHaveCSS('color', 'rgb(25, 22, 47)');
          expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(true);
          if (question === 0) await tv.screenshot({ path: info.outputPath(`${type}-reveal.png`), fullPage: true });
          for (const phone of phones) expect(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await action({ type: 'next' });
        }
        expect(room.phase).toBe('ranking');
        await action({ type: 'next' });
        expect(room.phase).toBe('finished');
        expect(room.players.reduce((sum, player) => sum + player.score, 0)).toBe(type === 'identity' ? 800 : 400);
        await expect(tv.getByRole('heading', { name: '結果、出ました。', exact: true })).toBeVisible();
      }
      await play(firstType);
      expect(room.partyGames).toBe(1);
      const firstHistory = room.history![0].id;
      const firstPoints = Object.fromEntries(room.players.map(player => [player.id, player.partyPoints ?? 0]));
      // Selecting the next mode after finishing must preserve the recorded mode and history.
      await host.getByText('主催者の操作').click();
      await host.getByLabel('遊ぶゲーム', { exact: true }).selectOption(secondType);
      await host.getByRole('button', { name: '設定を保存', exact: true }).click();
      await expect(host.getByRole('status')).toContainText('設定を保存しました');
      expect((await read(host)).gameType).toBe(firstType);
      await clickAction(host, '同じメンバーで再戦 →', 'rematch');
      room = await read(host);
      expect(room.gameType).toBe(secondType);
      expect(room.history?.[0].id).toBe(firstHistory);
      await clickAction(host, 'ゲーム開始 →', 'start');
      await play(secondType);
      expect(room.partyGames).toBe(2);
      for (const player of room.players)
        expect(player.partyPoints).toBe(firstPoints[player.id] + partyPointsForRank(player.rank));
      const histories: GameHistory[] = await Promise.all(room.history!.map(async history => (await host.request.get(`/api/ogiri/history/${history.id}`)).json()));
      expect(histories.map(history => history.gameType)).toEqual([firstType, secondType]);
      expect(histories.find(history => history.gameType === 'majority')?.matches).toHaveLength(1);
      expect(histories.find(history => history.gameType === 'identity')?.matches).toHaveLength(4);
      expect(histories.every(history => history.partyGames && history.partyRankings?.length === 4)).toBe(true);
      const historyPage = await host.context().newPage();
      watch(historyPage);
      for (const history of histories) {
        await historyPage.goto(`/games/ogiri/history/${history.id}`);
        await expect(historyPage.getByRole('heading', { name: 'ゲームの記録', exact: true })).toBeVisible();
        await expect(historyPage.getByText(history.matches[0].note!, { exact: true }).first()).toBeVisible();
        const download = historyPage.waitForEvent('download');
        await historyPage.getByRole('button', { name: '結果をダウンロード', exact: true }).click();
        expect((await download).suggestedFilename()).toBe(`${history.gameType}-${code}-${history.game}.txt`);
      }
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map(context => context.close()));
    }
  });
