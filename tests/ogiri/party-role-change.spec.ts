import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test('a former player-host retains points and thirteen party members fit on paged TV standings', async ({
  browser,
  baseURL,
}, info) => {
  const contexts: BrowserContext[] = [];
  const headers: Record<string, string> = process.env.OGIRI_TEST_URL
    ? {}
    : { 'x-real-ip': '198.51.100.30' };
  try {
    for (let i = 0; i < 13; i++)
      contexts.push(await browser.newContext({ baseURL, extraHTTPHeaders: headers }));
    const host = contexts[0].request;
    let view: RoomView = await (
      await host.post('/api/ogiri', {
        data: { name: 'あ'.repeat(14) + '00', avatar: '🐱', hostPlays: true },
      })
    ).json();
    const hostId = view.me!;
    const path = `/api/ogiri/${view.code}`;
    const action = async (data: Record<string, unknown>) => {
      const result = await host.post(path, { data: { ...data, turn: view.turn } });
      expect(result.ok(), await result.text()).toBe(true);
      view = await result.json();
    };
    for (let i = 1; i < 12; i++)
      expect(
        (
          await contexts[i].request.post(path, {
            data: {
              type: 'join',
              name: 'あ'.repeat(14) + String(i).padStart(2, '0'),
              avatar: '🐶',
            },
          })
        ).ok(),
      ).toBe(true);
    await action({
      type: 'settings',
      settings: { ...view.settings, rounds: 1, autoAdvance: false },
    });
    // One revealed match makes a real game result, even if all players pass.
    await action({ type: 'start' });
    await action({ type: 'next' });
    await action({ type: 'next' });
    await action({ type: 'finish' });
    expect(view.partyGames).toBe(1);
    await action({ type: 'rematch' });
    await action({ type: 'hostParticipation', participating: false });
    expect(
      (
        await contexts[12].request.post(path, {
          data: { type: 'join', name: 'あ'.repeat(14) + '12', avatar: '🐼' },
        })
      ).ok(),
    ).toBe(true);
    await action({ type: 'start' });
    await action({ type: 'next' });
    await action({ type: 'next' });
    await action({ type: 'finish' });
    expect(view.players).toHaveLength(12);
    expect(view.partyPlayers).toHaveLength(13);
    expect(view.partyPlayers?.find((p) => p.id === hostId)?.partyPoints).toBe(10);
    const tv = await contexts[0].newPage();
    await tv.setViewportSize({ width: 1920, height: 1080 });
    await tv.goto(`/games/ogiri/${view.code}/tv`);
    await tv.getByRole('button', { name: 'パーティー総合', exact: true }).click();
    const board = tv.getByLabel('パーティー総合順位', { exact: true });
    await expect(board.locator('article')).toHaveCount(12);
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(
      true,
    );
    await tv.getByRole('button', { name: '次の順位ページ' }).click();
    await expect(board.locator('article')).toHaveCount(1);
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(
      true,
    );
    await tv.setViewportSize({ width: 3840, height: 2160 });
    expect(await tv.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 2)).toBe(
      true,
    );
    await tv.getByRole('button', { name: '次の順位ページ' }).click();
    await expect(board.locator('article')).toHaveCount(12);
    await tv.screenshot({ path: info.outputPath('party-13-members-paged.png'), fullPage: true });
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
