import { test, expect, request as apiRequest } from '@playwright/test';
import type { RoomView } from '../../src/lib/ogiri/types';

test.use({ extraHTTPHeaders: process.env.OGIRI_TEST_URL ? {} : { 'x-real-ip': '198.51.100.242' } });

const line = { v: 1, strokes: [{ c: '#201a32', w: 7, p: [1, 1, 40, 40] }] };

test('a finished drawing game leaves nothing in the stored room for the next game', async ({ baseURL }) => {
  test.skip(Boolean(process.env.OGIRI_TEST_URL), 'Local Firestore emulator only.');
  const client = (last: number) => apiRequest.newContext({ baseURL, extraHTTPHeaders: { 'x-real-ip': `198.55.0.${last}` } });
  const host = await client(1);
  const players = await Promise.all([2, 3, 4, 5].map(client));
  try {
    let room: RoomView = await (await host.post('/api/ogiri', { data: { name: '進行役', avatar: 'rabbit', hostPlays: false, gameType: 'drawing' } })).json();
    const path = `/api/ogiri/${room.code}`;
    const act = async (data: object) => {
      room = await (await host.get(path)).json();
      const response = await host.post(path, { data: { ...data, turn: room.turn } });
      expect(response.ok(), await response.text()).toBe(true);
      room = await response.json();
    };
    for (const [i, player] of players.entries())
      expect((await player.post(path, { data: { type: 'join', name: `参加者${i}`, avatar: 'pudding' } })).ok()).toBe(true);
    await act({ type: 'settings', settings: { ...room.settings, autoAdvance: false } });
    await act({ type: 'start' });
    const ids: string[] = [];
    for (let stage = 0; stage < 4; stage++) {
      for (const player of players) {
        const view: RoomView = await (await player.get(path)).json();
        ids[players.indexOf(player)] = view.me!;
        const write = view.drawingGame!.assignment!.kind === 'draw'
          ? await player.post(`${path}/drawing`, { data: { type: 'drawingSubmit', drawing: line, turn: view.turn } })
          : await player.post(path, { data: { type: 'drawingGuess', text: '絵のことば', turn: view.turn } });
        expect(write.ok(), await write.text()).toBe(true);
      }
      await act({ type: 'next' });
    }
    for (let step = 0; room.phase !== 'finished' && step < 20; step++) await act({ type: 'next' });
    expect(room.phase).toBe('finished');
    expect(room.partyGames).toBe(1);
    const earned = room.players.map(player => player.partyPoints);

    // Straight from the stored document, as the very next poll would see it.
    await act({ type: 'rematch', gameType: 'ogiri' });
    const stored: RoomView = await (await host.get(path)).json();
    expect(stored.drawingGame).toBeUndefined();
    expect(stored.turn).toBe(room.turn);

    await act({ type: 'start' });
    await act({ type: 'finish' });
    const after: RoomView = await (await host.get(path)).json();
    expect(after.partyGames).toBe(1); // A game with nothing revealed earns nothing.
    expect(after.players.map(player => player.partyPoints)).toEqual(earned);
    expect(ids).toHaveLength(4);
  } finally { await Promise.all([host, ...players].map(context => context.dispose())); }
});
