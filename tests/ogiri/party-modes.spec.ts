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
      await clickAction(host, `${GAME_TITLES[secondType]}で次のゲームへ`, 'rematch');
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

// Keep the large layout fixture separate from the create budget of the four-player flows.
test.describe('twelve-player TV layout', () => {
  test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.121' } });
  test('twelve long-name players and full-length answers fit both TV sizes and mobile', async ({ page: host, browser, baseURL }, info) => {
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    host.on('pageerror', error => errors.push(error.message));
    const metrics: object[] = [];
    try {
      let room: RoomView = await (await host.request.post('/api/ogiri', {
        data: { name: '画面確認の進行役', avatar: '🐱', hostPlays: false, gameType: 'identity' },
      })).json();
      const path = `/api/ogiri/${room.code}`;
      const read = async (context: BrowserContext): Promise<RoomView> => (await context.request.get(path)).json();
      const action = async (data: object) => {
        room = await read(host.context());
        const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
        expect(response.ok(), await response.text()).toBe(true);
        room = await response.json();
      };
      for (let i = 0; i < 12; i++) {
        const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
        contexts.push(context);
        const name = [...'あいうえおかきくけこさしすせそたち'].slice(0, 14).join('') + String(i).padStart(2, '0');
        expect([...name]).toHaveLength(16);
        const response = await context.request.post(path, { data: { type: 'join', name, avatar: i % 2 ? 'rabbit' : 'pudding' } });
        expect(response.ok()).toBe(true);
      }
      await action({ type: 'settings', settings: { ...room.settings, rounds: 1, autoAdvance: false, voteSeconds: 120 } });
      await action({ type: 'start' });
      for (let i = 0; i < 12; i++) {
        const mine = await read(contexts[i]);
        const text = String(i).padStart(2, '0') + '笑いすぎて朝ごはん忘れた。'.repeat(10).slice(0, 98);
        expect([...text]).toHaveLength(100);
        expect((await contexts[i].request.post(path, { data: { type: 'partyAnswer', text, turn: mine.turn } })).ok()).toBe(true);
        expect((await contexts[i].request.post(path, { data: { type: 'answerReady', ready: true, turn: mine.turn } })).ok()).toBe(true);
      }
      await action({ type: 'next' });
      const views = await Promise.all(contexts.map(read));
      const author = views.findIndex(view => view.sideGame?.isAuthor);
      const viewer = views.findIndex(view => view.sideGame?.canVote);
      expect(author).toBeGreaterThanOrEqual(0);
      const tv = await host.context().newPage();
      tv.on('pageerror', error => errors.push(error.message));
      await tv.emulateMedia({ reducedMotion: 'reduce' });
      const phone = await contexts[viewer].newPage();
      phone.on('pageerror', error => errors.push(error.message));
      await phone.goto(`/games/ogiri/${room.code}`);
      await tv.goto(`/games/ogiri/${room.code}/tv`);
      async function capture(phase: string, page: Page, width: number, height: number, fitVertical: boolean) {
        await page.setViewportSize({ width, height });
        await page.evaluate(() => document.fonts.ready);
        const measure = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
          scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
          clipped: [...document.querySelectorAll('[data-testid="party-anonymous-answer"], [data-testid="party-speaker"], button')]
            .filter(node => { const box = node.getBoundingClientRect(); return box.width > 0 && (box.left < -1 || box.right > innerWidth + 1); })
            .map(node => ({ text: node.textContent, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right })),
        }));
        metrics.push({ phase, ...measure });
        await page.screenshot({ path: info.outputPath(`${phase}-${width}.png`), fullPage: true });
        expect.soft(measure.scrollWidth).toBeLessThanOrEqual(width + 2);
        expect.soft(measure.clipped).toEqual([]);
        if (fitVertical) expect.soft(measure.scrollHeight).toBeLessThanOrEqual(height + 2);
      }
      await expect(tv.getByTestId('party-anonymous-answer')).toContainText('笑いすぎて');
      await expect(phone.getByRole('button', { name: /だと思う$/ })).toHaveCount(12);
      for (const [width, height] of [[1920, 1080], [3840, 2160]]) await capture('identity-voting', tv, width, height, true);
      await capture('identity-voting', phone, 390, 844, false);
      for (let i = 0, voter = 0; i < 12; i++) if (i !== author) {
        const correct = views[author].me!;
        const choice = voter++ === 0 ? views[i].sideGame!.options.find(option => option.id !== correct)!.id : correct;
        expect((await contexts[i].request.post(path, { data: { type: 'partyVote', choice, turn: views[i].turn } })).ok()).toBe(true);
      }
      await action({ type: 'next' });
      await expect(tv.getByLabel('今回の獲得ポイント')).toBeVisible();
      for (const [width, height] of [[1920, 1080], [3840, 2160]]) await capture('identity-reveal', tv, width, height, true);
      await expect(phone.getByLabel('今回の獲得ポイント')).toBeVisible();
      await capture('identity-reveal', phone, 390, 844, false);
      await action({ type: 'finish' });
      await action({ type: 'settings', settings: { ...room.settings, gameType: 'majority' } });
      await action({ type: 'rematch' });
      await action({ type: 'start' });
      await expect(tv.getByRole('heading', { name: '多数派に、まざれ。', exact: true })).toBeVisible();
      for (const [width, height] of [[1920, 1080], [3840, 2160]]) await capture('majority-voting', tv, width, height, true);
      await expect(phone.getByRole('heading', { name: '多数派に、まざれ。', exact: true })).toBeVisible();
      await capture('majority-voting', phone, 390, 844, false);
      const majority = await Promise.all(contexts.map(read));
      for (let i = 0; i < 12; i++) expect((await contexts[i].request.post(path, { data: { type: 'partyVote', choice: majority[i].sideGame!.options[0].id, turn: majority[i].turn } })).ok()).toBe(true);
      await action({ type: 'next' });
      await expect(tv.getByLabel('今回の獲得ポイント')).toBeVisible();
      for (const [width, height] of [[1920, 1080], [3840, 2160]]) await capture('majority-reveal', tv, width, height, true);
      await expect(phone.getByLabel('今回の獲得ポイント')).toBeVisible();
      await capture('majority-reveal', phone, 390, 844, false);
      await info.attach('layout-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });
      expect(errors).toEqual([]);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
});
