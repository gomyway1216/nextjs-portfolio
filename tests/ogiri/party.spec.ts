import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

for (const count of [10, 12])
  test(`${count} players + TV: anonymous answers, simultaneous votes, refresh, offline and rematch`, async ({
    browser,
    baseURL,
  }, testInfo) => {
    const contexts: BrowserContext[] = [];
    const errors: string[] = [];
    async function phone() {
      const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
      contexts.push(context);
      const page = await context.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('dialog', (d) => d.accept());
      return page;
    }
    const host = await phone();
    try {
      await host.goto('/games/ogiri', { waitUntil: 'domcontentloaded' });
      await host.getByRole('button', { name: '主催する', exact: true }).click();
      await host.getByRole('textbox', { name: 'ニックネーム' }).fill('あ'.repeat(17));
      await expect(host.getByRole('button', { name: 'ルームを作成 →', exact: true })).toBeDisabled();
      await host.getByRole('textbox', { name: 'ニックネーム' }).fill('😀'.repeat(16));
      await expect(host.getByRole('button', { name: 'ルームを作成 →', exact: true })).toBeEnabled();
      await host.getByRole('textbox', { name: 'ニックネーム' }).fill('主催者🌟');
      await host.getByRole('button', { name: 'ルームを作成 →', exact: true }).click();
      await expect(host).toHaveURL(/\/games\/ogiri\/[A-Z2-9]{6}$/);
      const code = host.url().split('/').at(-1)!;
      const pages = [
        host,
        ...(await Promise.all(Array.from({ length: count - 1 }, () => phone()))),
      ];
      await Promise.all(
        pages.slice(1).map(async (page, i) => {
          await page.goto(`/games/ogiri/${code}`, { waitUntil: 'domcontentloaded' });
          await page.getByRole('textbox', { name: 'ニックネーム' }).fill(
            count === 12 ? `長い日本語の名前です長い日本${String(i).padStart(2, '0')}` : `参加者${i + 1}🐱`,
          );
          await page.getByRole('button', { name: 'ルームに参加 →', exact: true }).click();
          await expect(page.getByRole('textbox', { name: 'ニックネーム' })).toHaveCount(0);
        }),
      );
      const tvContext = await browser.newContext({
        baseURL,
        viewport: { width: 1920, height: 1080 },
      });
      contexts.push(tvContext);
      const tv = await tvContext.newPage();
      await tv.goto(`/games/ogiri/${code}/tv`, { waitUntil: 'domcontentloaded' });
      await expect(tv.getByRole('heading', { name: `ただいま ${count} 人` })).toBeVisible();
      await expect(tv.getByText('主催者の操作')).toHaveCount(0);
      const view = async (page: Page): Promise<RoomView> =>
        (await page.request.get(`/api/ogiri/${code}`)).json();
      const tvRead = await tv.request.get(`/api/ogiri/${code}?view=tv`);
      expect((await tvRead.json()).isHost).toBe(false);
      const attack = await tv.request.post(`/api/ogiri/${code}`, { data: { type: 'finish' } });
      expect(attack.status()).toBe(401);
      const csrf = await host.request.post(`/api/ogiri/${code}`, {
        data: { type: 'finish' },
        headers: { Origin: 'https://evil.example' },
      });
      expect(csrf.status()).toBe(403);
      const impostor = await pages[1].request.post(`/api/ogiri/${code}`, {
        data: { type: 'finish', playerId: (await view(host)).me },
      });
      expect(impostor.status()).toBe(403);
      // A second real room cannot read this room's guest session or affect its membership.
      const other = await tv.request.post('/api/ogiri', {
        data: { name: '別の部屋', avatar: '🐸' },
      });
      expect(other.ok()).toBe(true);
      expect((await other.json()).code).not.toBe(code);
      expect((await view(host)).players).toHaveLength(count);
      if (count === 12) {
        const overflow = await tv.request.post(`/api/ogiri/${code}`, {
          data: { type: 'join', name: '13人目', avatar: '🐸' },
        });
        expect(overflow.status()).toBe(409);
        expect((await overflow.json()).error).toContain('満員');
      }
      await tv.screenshot({ path: testInfo.outputPath('tv-lobby-1080p.png'), fullPage: true });
      await host.getByLabel('ラウンド数', { exact: true }).selectOption('1');
      await host.getByLabel('回答時間（秒）', { exact: true }).selectOption('180');
      await host.getByLabel('投票時間（秒）', { exact: true }).selectOption('45');
      await host.getByRole('button', { name: '設定を保存', exact: true }).click();
      await expect(host.getByRole('status')).toContainText('設定を保存');
      await host.getByRole('button', { name: 'ゲーム開始 →', exact: true }).click();
      await expect(host.getByTestId('answer-form')).toHaveCount(2);
      // A locally saved Japanese IME-style draft survives a real page reload.
      await pages[1]
        .getByTestId('answer-form')
        .first()
        .getByRole('textbox', { name: '回答', exact: true })
        .fill('更新しても残る日本語😀');
      await pages[1].reload({ waitUntil: 'domcontentloaded' });
      await expect(
        pages[1]
          .getByTestId('answer-form')
          .first()
          .getByRole('textbox', { name: '回答', exact: true }),
      ).toHaveValue('更新しても残る日本語😀');
      await host.reload({ waitUntil: 'domcontentloaded' });
      await tv.reload({ waitUntil: 'domcontentloaded' });
      await expect(host.getByText('主催者の操作')).toBeVisible();
      await expect(tv.getByTestId('answer-form')).toHaveCount(0);
      const late = await tv.request.post(`/api/ogiri/${code}`, {
        data: { type: 'join', name: '途中参加', avatar: '🐸' },
      });
      expect(late.status()).toBe(409);
      const hostForm = host.getByTestId('answer-form').first();
      await hostForm.getByRole('textbox', { name: '回答', exact: true }).fill('あ'.repeat(101));
      await expect(hostForm.getByRole('button')).toBeDisabled();
      await hostForm.getByRole('textbox', { name: '回答', exact: true }).fill('😀'.repeat(100));
      await expect(hostForm.getByRole('button')).toBeEnabled();
      await Promise.all(
        pages.map(async (page, i) => {
          for (let j = 0; j < 2; j++) {
            const form = page.getByTestId('answer-form').nth(j);
            await form
              .getByRole('textbox', { name: '回答', exact: true })
              .fill(i === 0 ? '大爆笑の日本語😀🎃'.repeat(10) : `大爆笑の日本語回答 ${i}-${j} 🎃`);
            await form.getByRole('button', { name: 'この回答を送る', exact: true }).click();
            await expect(
              form.getByRole('button', { name: '送信済み ✓', exact: true }),
            ).toBeVisible();
          }
        }),
      );
      const privateTv = await (await tv.request.get(`/api/ogiri/${code}?view=tv`)).json();
      expect(JSON.stringify(privateTv)).not.toContain('大爆笑');
      expect(privateTv.assignments).toEqual([]);
      await host.getByText('主催者の操作').click();
      await host.getByRole('button', { name: '一時停止', exact: true }).click();
      await expect(tv.getByRole('status')).toContainText('一時停止');
      await host.getByRole('button', { name: '再開', exact: true }).click();
      await host.getByRole('button', { name: '次へ進む', exact: true }).click();
      let totalPoints = 0;
      for (let i = 0; i < count; i++) {
        await expect.poll(async () => (await view(host)).phase).toBe('voting');
        const states = await Promise.all(pages.map(view));
        expect(states[0].match?.index).toBe(i + 1);
        expect(states.filter((v) => v.match?.canVote)).toHaveLength(count - 2);
        const author = pages[states.findIndex((v) => !v.match?.canVote)];
        const selfVote = await author.request.post(`/api/ogiri/${code}`, {
          data: { type: 'vote', matchId: states[0].match!.id, choice: 0 },
        });
        expect(selfVote.status()).toBe(403);
        if (i === 0) {
          await contexts[1].setOffline(true);
          await pages[1].waitForTimeout(2000);
          await contexts[1].setOffline(false);
          await pages[1].reload({ waitUntil: 'domcontentloaded' });
          await expect(
            pages[1].getByRole('heading', { name: '笑ったほうに、一票。', exact: true }),
          ).toBeVisible();
          await expect
            .poll(async () =>
              Number((await pages[1].getByRole('timer').innerText()).replace(/\D/g, '')),
            )
            .toBeLessThanOrEqual(45);
          await tv.screenshot({ path: testInfo.outputPath('tv-voting-1080p.png'), fullPage: true });
          await pages[1].screenshot({
            path: testInfo.outputPath('phone-voting.png'),
            fullPage: true,
          });
        }
        const voterIndices = states.flatMap((s, index) => (s.match?.canVote ? [index] : []));
        // Real touch buttons, separate cookie jars, near-simultaneous requests.
        await Promise.all(
          voterIndices.map(async (index, j) => {
            const page = pages[index];
            const choice = j % 2;
            await page
              .getByRole('button', { name: `${choice ? 'B' : 'A'} に投票`, exact: true })
              .click();
          }),
        );
        await expect.poll(async () => (await view(host)).phase).toBe('reveal');
        const result = (await view(host)).match!.result!;
        expect(result.counts.reduce((a, b) => a + b, 0)).toBe(count - 2);
        expect(result.counts[0]).toBe(result.counts[1]); // ties award no win bonus
        expect(result.points).toEqual(result.counts.map((n) => n * 100));
        totalPoints += result.points.reduce((a, b) => a + b, 0);
        const duplicate = await pages[voterIndices[0]].request.post(`/api/ogiri/${code}`, {
          data: { type: 'vote', matchId: states[0].match!.id, choice: 1 },
        });
        expect(duplicate.status()).toBe(409);
        await expect(tv.getByText('引き分け！').first()).toBeVisible();
        await host.getByRole('button', { name: '次へ進む', exact: true }).click();
      }
      await expect.poll(async () => (await view(host)).phase).toBe('ranking');
      expect((await view(host)).players.reduce((sum, p) => sum + p.score, 0)).toBe(totalPoints);
      await host.getByRole('button', { name: '次へ進む', exact: true }).click();
      await expect(
        tv.getByRole('heading', { name: '今夜の大喜利王！', exact: true }),
      ).toBeVisible();
      await tv.screenshot({ path: testInfo.outputPath('tv-results-1080p.png'), fullPage: true });
      expect(await tv.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(
        await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
      ).toBe(true);
      await tv.setViewportSize({ width: 3840, height: 2160 });
      expect(
        await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2),
      ).toBe(true);
      await host.getByRole('button', { name: '同じメンバーで再戦 →', exact: true }).click();
      await expect(tv.getByRole('heading', { name: `ただいま ${count} 人` })).toBeVisible();
      expect((await view(host)).players.every((p) => p.score === 0)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await Promise.all(contexts.map((c) => c.close()));
    }
  });

test('Firestore security rules reject anonymous raw reads and writes', async ({ request }) => {
  const url =
    'http://127.0.0.1:8088/v1/projects/demo-ogiri/databases/(default)/documents/ogiri_party_rooms/ABC234';
  expect((await request.get(url)).status()).toBe(403);
  expect(
    (
      await request.patch(url, { data: { fields: { hostId: { stringValue: 'attacker' } } } })
    ).status(),
  ).toBe(403);
});
