import { test, expect, type BrowserContext } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test('racing duplicate votes, stale host commands, foreign rooms and expired rooms', async ({
  browser,
  baseURL,
  request,
}) => {
  const contexts: BrowserContext[] = [];
  try {
    for (let i = 0; i < 4; i++) contexts.push(await browser.newContext({ baseURL }));
    const host = contexts[0].request;
    const created = await host.post('/api/ogiri', { data: { name: '競合テスト', avatar: '🐱' } });
    expect(created.ok()).toBe(true);
    let room: RoomView = await created.json();
    const path = `/api/ogiri/${room.code}`;
    await Promise.all(
      contexts
        .slice(1)
        .map((c, i) =>
          c.request.post(path, { data: { type: 'join', name: `同時参加${i}`, avatar: '🐶' } }),
        ),
    );
    const start = { type: 'start', turn: room.turn };
    const starts = await Promise.all([
      host.post(path, { data: start }),
      host.post(path, { data: start }),
    ]);
    expect(starts.map((r) => r.status()).sort()).toEqual([200, 409]);
    await Promise.all(
      contexts.map(async (c) => {
        const v: RoomView = await (await c.request.get(path)).json();
        for (const a of v.assignments)
          expect(
            (
              await c.request.post(path, {
                data: { type: 'answer', matchId: a.id, text: '<script>テスト😀</script>' },
              })
            ).ok(),
          ).toBe(true);
      }),
    );
    room = await (await host.get(path)).json();
    expect((await host.post(path, { data: { type: 'next', turn: room.turn } })).ok()).toBe(true);
    const views: RoomView[] = await Promise.all(
      contexts.map(async (c) => (await c.request.get(path)).json()),
    );
    const voters = contexts.filter((_, i) => views[i].match?.canVote);
    const vote = { type: 'vote', matchId: views[0].match!.id, choice: 0 };
    const votes = await Promise.all([
      voters[0].request.post(path, { data: vote }),
      voters[0].request.post(path, { data: vote }),
    ]);
    expect(votes.map((v) => v.status()).sort()).toEqual([200, 409]);
    room = await (await host.get(path)).json();
    expect(room.match?.votesReceived).toBe(1);
    expect((await voters[1].request.post(path, { data: vote })).ok()).toBe(true);
    room = await (await host.get(path)).json();
    expect(room.match?.result?.points).toEqual([400, 0]);
    // Scored-answer moderation rolls back only this match, atomically.
    expect(
      (await host.post(path, { data: { type: 'hide', matchId: room.match!.id, choice: 0 } })).ok(),
    ).toBe(true);
    room = await (await host.get(path)).json();
    expect(room.match?.result?.points).toEqual([0, 0]);
    expect(room.players.reduce((sum, p) => sum + p.score, 0)).toBe(0);
    const other: RoomView = await (
      await contexts[1].request.post('/api/ogiri', { data: { name: '別ルーム', avatar: '🐸' } })
    ).json();
    expect(
      (await host.post(`/api/ogiri/${other.code}`, { data: { type: 'finish' } })).status(),
    ).toBe(401);
    // Only the newly created disposable emulator room is expired; no test hook exists in the application.
    if (!process.env.OGIRI_TEST_URL) {
      const expired = await request.patch(
        `http://127.0.0.1:8088/v1/projects/demo-ogiri/databases/(default)/documents/ogiri_party_rooms/${room.code}?updateMask.fieldPaths=expiresAt`,
        {
          headers: { Authorization: 'Bearer owner' },
          data: { fields: { expiresAt: { integerValue: '1' } } },
        },
      );
      expect(expired.ok()).toBe(true);
      expect((await host.get(path)).status()).toBe(404);
    }
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});
