import { test, expect, type BrowserContext } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { GameHistory, RoomView } from '../../src/lib/ogiri/types';
import { partyPointsForRank } from '../../src/lib/party/points';

test('the default host and TV are separate from phone answerers', async ({
  browser,
  baseURL,
}, testInfo) => {
  const contexts: BrowserContext[] = [];
  try {
    const hostContext = await browser.newContext({ baseURL });
    contexts.push(hostContext);
    const host = await hostContext.newPage();
    await host.goto('/games/ogiri');
    await host.getByRole('button', { name: '主催する', exact: true }).click();
    await expect(host.getByLabel('主催者もこの端末で回答する')).not.toBeChecked();
    await host.getByRole('textbox', { name: 'ニックネーム' }).fill('テレビの進行役');
    await host.getByRole('button', { name: 'ルームを作成 →' }).click();
    await expect(host).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
    const code = host.url().split('/').at(-1)!;
    const path = `/api/ogiri/${code}`;
    await expect(host.getByRole('heading', { name: 'ただいま 0 人' })).toBeVisible();
    const phones = [];
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({ baseURL });
      contexts.push(context);
      expect(
        (
          await context.request.post(path, {
            data: { type: 'join', name: `スマホ${i + 1}`, avatar: '🐶' },
          })
        ).ok(),
      ).toBe(true);
      phones.push(context);
    }
    await expect(host.getByRole('heading', { name: 'ただいま 3 人' })).toBeVisible();
    await host.getByRole('button', { name: 'ゲーム開始 →' }).click();
    await expect(
      host.getByRole('heading', { name: 'あなたのスマホに、2つのお題。' }),
    ).toBeVisible();
    await expect(host.getByTestId('answer-form')).toHaveCount(0);
    const tv = await hostContext.newPage();
    await tv.goto(`/games/ogiri/${code}/tv`);
    await expect(tv.getByRole('heading', { name: 'あなたのスマホに、2つのお題。' })).toBeVisible();
    await expect(tv.getByTestId('answer-form')).toHaveCount(0);
    await expect(tv.getByText('主催者の操作')).toHaveCount(0);
    const views: RoomView[] = await Promise.all(
      phones.map(async (c) => (await c.request.get(path)).json()),
    );
    expect(views.every((v) => v.assignments.length === 2)).toBe(true);
    const occurrences = views.flatMap((v) => v.assignments.map((a) => a.id));
    expect(new Set(occurrences).size).toBe(3);
    for (const id of new Set(occurrences))
      expect(occurrences.filter((a) => a === id)).toHaveLength(2);
    const phone = await phones[0].newPage();
    await phone.goto(`/games/ogiri/${code}`);
    await expect(phone.getByTestId('answer-form')).toHaveCount(2);
    await host.screenshot({ path: testInfo.outputPath('display-host.png'), fullPage: true });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('two rounds survive rematch and room expiry; history is static, shareable and downloadable', async ({
  browser,
  baseURL,
  request,
}, testInfo) => {
  const contexts: BrowserContext[] = [];
  try {
    for (let i = 0; i < 3; i++)
      contexts.push(await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } }));
    const host = contexts[0].request;
    let room: RoomView = await (
      await host.post('/api/ogiri', { data: { name: '履歴の主催者', avatar: '🐱' } })
    ).json();
    const path = `/api/ogiri/${room.code}`;
    const action = async (data: Record<string, unknown>) => {
      const response = await host.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok(), await response.text()).toBe(true);
      room = await response.json();
    };
    await Promise.all(
      contexts.slice(1).map((c, i) =>
        c.request.post(path, {
          data: { type: 'join', name: `履歴の参加者${i + 1}`, avatar: '🐶' },
        }),
      ),
    );
    await action({
      type: 'settings',
      settings: { ...room.settings, rounds: 2, autoAdvance: false },
    });
    await action({ type: 'start' });
    expect(room.history).toEqual([]);
    for (let round = 1; round <= 2; round++) {
      for (const [index, c] of contexts.entries()) {
        const view: RoomView = await (await c.request.get(path)).json();
        for (const assignment of view.assignments) {
          expect(
            (
              await c.request.post(path, {
                data: {
                  type: 'answer',
                  matchId: assignment.id,
                  text: `第${round}回の回答${index} <script>window.historyXss=true</script>😀`,
                },
              })
            ).ok(),
          ).toBe(true);
        }
      }
      await action({ type: 'next' });
      for (let match = 0; match < 3; match++) {
        for (const c of contexts) {
          const view: RoomView = await (await c.request.get(path)).json();
          if (view.match?.canVote)
            expect(
              (
                await c.request.post(path, {
                  data: { type: 'vote', matchId: view.match.id, choice: 0 },
                })
              ).ok(),
            ).toBe(true);
        }
        await action({ type: 'next' });
        await action({ type: 'next' });
      }
      if (round === 1) await action({ type: 'next' });
    }
    // Competing final transitions must persist exactly one immutable result with the room.
    const endings = await Promise.all([
      host.post(path, { data: { type: 'next', turn: room.turn } }),
      host.post(path, { data: { type: 'next', turn: room.turn } }),
    ]);
    expect(endings.map((r) => r.status()).sort()).toEqual([200, 409]);
    room = await (await host.get(path)).json();
    expect(room.phase).toBe('finished');
    expect(room.history).toHaveLength(1);
    expect(room.partyGames).toBe(1);
    expect(room.players.every((p) => p.partyPoints === partyPointsForRank(p.rank))).toBe(true);
    const ref = room.history![0];
    const historyPath = `/api/ogiri/history/${ref.id}`;
    const historyResponse = await host.get(historyPath);
    expect(historyResponse.headers()['cache-control']).toContain('private, max-age=');
    const history: GameHistory = await historyResponse.json();
    expect(history.matches).toHaveLength(6);
    expect(history.matches.map((m) => m.round)).toEqual([1, 1, 1, 2, 2, 2]);
    expect(
      history.matches.every((m) => m.answers[0].votes === 1 && m.answers[0].points === 300),
    ).toBe(true);
    expect(history.rankings.map((p) => [p.name, p.rank, p.score])).toEqual(
      room.players.map((p) => [p.name, p.rank, p.score]),
    );
    const page = await contexts[0].newPage();
    await page.goto(`/games/ogiri/${room.code}`);
    const resultLink = page.getByRole('link', { name: '直前の結果を見る ↗', exact: true });
    await expect(resultLink).toBeVisible();
    await page.getByRole('button', { name: 'パーティー総合', exact: true }).click();
    await expect(page.getByLabel('パーティー総合順位', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /ベスト一言/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('window.historyXss=true');
    expect(await page.evaluate(() => 'historyXss' in window)).toBe(false);
    await page.getByRole('button', { name: '発表を閉じる' }).click();
    const firstTotals = new Map(room.players.map((p) => [p.id, p.partyPoints ?? 0]));
    await action({ type: 'rematch' });
    expect(room.players.every((p) => p.score === 0)).toBe(true);
    expect(room.players.every((p) => p.partyPoints === firstTotals.get(p.id))).toBe(true);
    expect(await (await host.get(historyPath)).json()).toEqual(history);
    await action({ type: 'start' });
    for (const c of contexts) {
      const v: RoomView = await (await c.request.get(path)).json();
      for (const assignment of v.assignments)
        expect(
          (
            await c.request.post(path, {
              data: { type: 'answer', matchId: assignment.id, text: '再戦の一言😀' },
            })
          ).ok(),
        ).toBe(true);
    }
    await action({ type: 'next' });
    for (const c of contexts) {
      const v: RoomView = await (await c.request.get(path)).json();
      if (v.match?.canVote)
        expect(
          (
            await c.request.post(path, { data: { type: 'vote', matchId: v.match.id, choice: 0 } })
          ).ok(),
        ).toBe(true);
    }
    await action({ type: 'next' });
    await action({ type: 'finish' });
    expect(room.partyGames).toBe(2);
    expect(
      room.players.every(
        (p) => p.partyPoints === firstTotals.get(p.id)! + partyPointsForRank(p.rank),
      ),
    ).toBe(true);
    const afterSecond = structuredClone(room.players);
    await action({ type: 'finish' });
    expect(room.partyGames).toBe(2);
    expect(room.players).toEqual(afterSecond);
    expect(await (await host.get(historyPath)).json()).toEqual(history);
    const latest: GameHistory = await (
      await host.get(`/api/ogiri/history/${room.history!.at(-1)!.id}`)
    ).json();
    expect(latest.partyGames).toBe(2);
    expect(latest.partyRankings?.reduce((sum, p) => sum + p.points, 0)).toBe(
      room.players.reduce((sum, p) => sum + (p.partyPoints ?? 0), 0),
    );
    await page.goto('/games/ogiri/history');
    await page.getByRole('link', { name: new RegExp(`${room.code} · 第1ゲーム`) }).click();
    await expect(page.getByRole('heading', { name: '👑 最終順位' })).toBeVisible();
    await expect(page.getByText('第1回の回答', { exact: false }).first()).toBeVisible();
    await expect(page.getByText('第2回の回答', { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => 'historyXss' in window)).toBe(false);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '結果をダウンロード' }).click();
    const download = await downloadPromise;
    const content = await readFile((await download.path())!, 'utf8');
    expect(content).toContain('第1回の回答');
    expect(content).toContain('第2回の回答');
    expect(content).toContain('1票');
    expect(content).toContain('【最終順位】');
    expect(content).toContain('【パーティー総合順位');
    await page.screenshot({ path: testInfo.outputPath('history-phone.png'), fullPage: true });
    let historyReads = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/ogiri/')) historyReads++;
    });
    await page.clock.install();
    await page.clock.fastForward(20 * 60 * 1000);
    expect(historyReads).toBe(0);
    // A shared link works in a new guest session, without a live room or its cookie.
    const guest = await browser.newContext({ baseURL });
    contexts.push(guest);
    const shared = await guest.newPage();
    await shared.goto(`/games/ogiri/history/${ref.id}`);
    await expect(shared.getByRole('heading', { name: '👑 最終順位' })).toBeVisible();
    if (!process.env.OGIRI_TEST_URL) {
      const root = 'http://127.0.0.1:8088/v1/projects/demo-ogiri/databases/(default)/documents';
      const expire = (collection: string, id: string) =>
        request.patch(`${root}/${collection}/${id}?updateMask.fieldPaths=expiresAt`, {
          headers: { Authorization: 'Bearer owner' },
          data: { fields: { expiresAt: { integerValue: '1' } } },
        });
      expect((await expire('ogiri_party_rooms', room.code)).ok()).toBe(true);
      expect((await host.get(path)).status()).toBe(404);
      expect(await (await host.get(historyPath)).json()).toEqual(history);
      expect((await request.get(`${root}/ogiri_party_history/${ref.id}`)).status()).toBe(403);
      expect((await expire('ogiri_party_history', ref.id)).ok()).toBe(true);
      expect((await host.get(historyPath)).status()).toBe(404);
    }
    expect((await host.get('/api/ogiri/history/ABC234')).status()).toBe(400);
    expect((await host.get(`/api/ogiri/history/${'0'.repeat(32)}`)).status()).toBe(404);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
