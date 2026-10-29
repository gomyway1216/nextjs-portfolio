import { test, expect, type BrowserContext } from '@playwright/test';
import type { GameType, RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.148' } });

test('a chosen passphrase restores one resting participant and follows all four party games', async ({ page: host, browser, baseURL }, info) => {
  const contexts: BrowserContext[] = [];
  const phone = async () => {
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    contexts.push(context);
    return context;
  };
  try {
    const created = await host.request.post('/api/ogiri', { data: { name: '合言葉の確認係', avatar: 'rabbit', hostPlays: false } });
    expect(created.ok()).toBe(true);
    let room: RoomView = await created.json();
    const path = `/api/ogiri/${room.code}`;
    const action = async (data: object) => {
      room = await (await host.request.get(path)).json();
      const response = await host.request.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok(), `host HTTP ${response.status()}`).toBe(true);
      room = await response.json();
    };
    const finishGame = async () => {
      // Exercise identity/points through normal phase transitions with passes.
      // Full answering/voting play is covered by the existing mode-specific cases.
      for (let step = 0; room.phase !== 'finished' && step < 30; step++) await action({ type: 'next' });
      expect(room.phase).toBe('finished');
    };
    const first = await phone();
    const oldPage = await first.newPage();
    await oldPage.goto(`/games/ogiri/${room.code}`);
    await oldPage.getByRole('textbox', { name: 'ニックネーム', exact: true }).fill('あいことばの人');
    await oldPage.getByRole('button', { name: 'ルームに参加 →', exact: true }).click();
    await expect(oldPage.getByText('自分で決めた合言葉で戻る', { exact: true })).toBeVisible();
    const before: RoomView = await (await first.request.get(path)).json();
    const id = before.me!;
    expect(id).toBeTruthy();
    const player = before.players.find(player => player.id === id)!;
    const passphrase = 'みんなでぽっぷにあそぶ';
    await oldPage.getByText('自分で決めた合言葉で戻る', { exact: true }).click();
    await oldPage.getByLabel('設定する合言葉', { exact: true }).fill(passphrase);
    await oldPage.getByLabel('合言葉の確認', { exact: true }).fill('かくにんをまちがえた');
    await oldPage.getByRole('button', { name: '合言葉を設定', exact: true }).click();
    await expect(oldPage.getByText('確認用の合言葉が一致していません。', { exact: true })).toBeVisible();
    await oldPage.getByLabel('合言葉の確認', { exact: true }).fill(passphrase);
    await oldPage.getByRole('button', { name: '合言葉を設定', exact: true }).click();
    await expect(oldPage.getByText('合言葉を設定しました。別端末では「同じ参加者で戻る」→「合言葉」を選んでください。', { exact: true })).toBeVisible();
    expect(await oldPage.getByLabel('設定する合言葉', { exact: true }).inputValue()).toBe('');
    for (const name of ['いっしょに遊ぶ人', 'もうひとり']) {
      const context = await phone();
      expect((await context.request.post(path, { data: { type: 'join', name, avatar: 'pudding' } })).ok()).toBe(true);
    }
    await action({ type: 'settings', settings: { ...room.settings, autoAdvance: false, rounds: 1 } });
    await action({ type: 'start' });
    await finishGame();
    expect(room.partyGames).toBe(1);
    expect(room.players.find(player => player.id === id)?.partyPoints).toBe(10);
    await oldPage.getByRole('button', { name: '休憩する', exact: true }).click();
    await expect(oldPage.getByRole('button', { name: '参加に戻る', exact: true })).toBeVisible();
    await oldPage.close();

    const second = await phone();
    const returned = await second.newPage();
    const errors: string[] = [];
    returned.on('pageerror', error => errors.push(error.message));
    await returned.goto('/games/ogiri');
    await returned.getByRole('button', { name: '同じ参加者で戻る', exact: true }).click();
    await returned.getByRole('radio', { name: '合言葉', exact: true }).check();
    await returned.getByRole('textbox', { name: 'ルームコード', exact: true }).fill(room.code);
    await returned.getByRole('textbox', { name: 'ニックネーム', exact: true }).fill(player.name);
    await returned.locator('input[type="password"]').fill('まちがえたあいことば');
    await returned.getByRole('button', { name: '同じ参加者で復帰 →', exact: true }).click();
    await expect(returned.getByRole('alert').filter({ hasText: 'ニックネームと合言葉を確認してください。' })).toBeVisible();
    await returned.locator('input[type="password"]').fill(passphrase);
    await returned.getByRole('button', { name: '同じ参加者で復帰 →', exact: true }).click();
    await expect(returned.getByRole('button', { name: '参加に戻る', exact: true })).toBeVisible();
    let own: RoomView = await (await second.request.get(path)).json();
    expect(own).toMatchObject({ me: id, resting: true, hasPassphrase: true });
    expect(own.players).toHaveLength(3);
    expect(own.players.find(player => player.id === id)).toMatchObject({ name: player.name, avatar: player.avatar, partyPoints: 10 });
    expect((await (await first.request.get(path)).json()).me).toBeNull();
    await returned.getByRole('button', { name: '参加に戻る', exact: true }).click();
    await expect(returned.getByRole('button', { name: '休憩する', exact: true })).toBeVisible();
    for (const gameType of ['majority', 'identity', 'drawing'] satisfies GameType[]) {
      await action({ type: 'rematch' });
      await action({ type: 'settings', settings: { ...room.settings, gameType } });
      await action({ type: 'start' });
      own = await (await second.request.get(path)).json();
      expect(own).toMatchObject({ me: id, gameType, hasPassphrase: true });
      expect(own.players.find(player => player.id === id)).toMatchObject({ playingThisGame: true, partyPoints: 10 });
      // This regression tests the recovered identity across modes, not replaying
      // their existing full gameplay tests. Cancelling must retain earned points.
      await action({ type: 'finish' });
    }
    own = await (await second.request.get(path)).json();
    expect(own.partyGames).toBe(1);
    expect(own.players.find(player => player.id === id)).toMatchObject({ name: player.name, avatar: player.avatar, partyPoints: 10 });
    expect(own.history).toHaveLength(4);
    await returned.getByText('自分で決めた合言葉で戻る', { exact: true }).click();
    await expect(returned.getByRole('button', { name: '合言葉を変更', exact: true })).toBeVisible();
    expect(await returned.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(errors).toEqual([]);
    await returned.screenshot({ path: info.outputPath('passphrase-and-four-games-phone.png'), fullPage: true });
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
