import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Room } from '@/lib/ogiri/types';
const memory = vi.hoisted(() => ({ room: null as Room | null }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ data: () => structuredClone(memory.room), updateTime: {} }),
    create: async (room: Room) => { memory.room = structuredClone(room); },
    update: async (room: Room) => { memory.room = structuredClone(room); },
  }) }) }),
}));
import { act, project, REJOIN_TTL, rejoinSeats, requestRejoin } from '@/lib/ogiri/engine';
import { authenticate, command, enterRoom, makeRoom, readRoom, requestRejoinSeat } from '@/lib/ogiri/store';
import { prompts } from '@/lib/ogiri/prompts';

const QUIET = 70000;
async function party() {
  const host = await makeRoom('進行役', 'rabbit', false);
  const code = host.view.code;
  const members = [];
  for (const name of ['ねこ', 'いぬ', 'ぱんだ']) members.push(await enterRoom(code, undefined, name, 'pudding'));
  await command(code, host.token, { type: 'settings', settings: { ...memory.room!.settings, autoAdvance: false } });
  await command(code, host.token, { type: 'start' }, `1:0:lobby:0`);
  return { code, host, members, id: members[0].view.me! };
}
/** Everyone else stays connected; only this seat's phone went quiet. */
function silence(id: string) {
  for (const player of Object.values(memory.room!.players)) player.lastSeen = Date.now() - (player.id === id ? QUIET : 0);
}

beforeEach(() => { vi.stubEnv('OGIRI_EMULATOR', ''); memory.room = null; });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('returns a player to the same seat mid-game only after the host approves, signing out the old device', async () => {
  const { code, host, members, id } = await party();
  memory.room!.players[id].score = 450;
  memory.room!.players[id].partyPoints = 17;
  const assignments = project(memory.room!, id, Date.now(), prompts).assignments;
  expect(assignments).toHaveLength(2);
  silence(id);
  expect((await readRoom(code)).rejoinSeats?.map(seat => seat.id)).toEqual([id]);

  const asked = await requestRejoinSeat(code, id);
  expect(asked.view).toMatchObject({ me: null, rejoinPending: true });
  // Until the host agrees, the new session is worth nothing and the old one still works.
  expect(authenticate(memory.room!, asked.token)).toBeNull();
  expect(authenticate(memory.room!, members[0].token)).toBe(id);
  await expect(command(code, asked.token, { type: 'heartbeat' })).rejects.toThrow('参加し直して');
  expect(await readRoom(code, asked.token)).toMatchObject({ me: null, rejoinPending: true });
  expect((await readRoom(code)).rejoinPending).toBeUndefined();
  expect((await readRoom(code, host.token)).rejoinRequests).toEqual([{ id, name: 'ねこ', avatar: 'pudding' }]);
  await expect(command(code, members[1].token, { type: 'rejoinAnswer', playerId: id, approve: true })).rejects.toThrow('主催者');

  await command(code, host.token, { type: 'rejoinAnswer', playerId: id, approve: true });
  const back = await readRoom(code, asked.token);
  expect(back.me).toBe(id);
  expect(back.rejoinPending).toBeUndefined();
  expect(back.assignments.map(item => item.id)).toEqual(assignments.map(item => item.id));
  expect(back.players.find(player => player.id === id)).toMatchObject({ name: 'ねこ', score: 450, partyPoints: 17, active: true, connected: true });
  expect(authenticate(memory.room!, members[0].token)).toBeNull();
  expect((await readRoom(code, host.token)).rejoinRequests).toEqual([]);
  expect(Object.keys(memory.room!.players)).toHaveLength(4);
});

it('brings a resting player back too, and leaves everything unchanged when the host declines', async () => {
  const { code, host, members, id } = await party();
  await command(code, members[0].token, { type: 'leave' });
  silence(id);
  const denied = await requestRejoinSeat(code, id);
  await command(code, host.token, { type: 'rejoinAnswer', playerId: id, approve: false });
  expect(await readRoom(code, denied.token)).toMatchObject({ me: null });
  expect((await readRoom(code, denied.token)).rejoinPending).toBeUndefined();
  expect(authenticate(memory.room!, members[0].token)).toBe(id);
  expect(memory.room!.players[id].active).toBe(false);
  const again = await requestRejoinSeat(code, id);
  await command(code, host.token, { type: 'rejoinAnswer', playerId: id, approve: true });
  expect(memory.room!.players[id].active).toBe(true);
  expect(authenticate(memory.room!, again.token)).toBe(id);
});

it('offers only quiet seats: never a connected player, the host, or someone removed', async () => {
  const { code, host, members, id } = await party();
  await expect(requestRejoinSeat(code, id)).rejects.toThrow('戻れません');
  await expect(requestRejoinSeat(code, memory.room!.hostId)).rejects.toThrow('戻れません');
  await expect(requestRejoinSeat(code, 'not-a-player')).rejects.toThrow('参加者を選んで');
  await expect(requestRejoinSeat(code, undefined)).rejects.toThrow('参加者を選んで');
  const hostSeat = memory.room!.players[memory.room!.hostId];
  hostSeat.spectator = false;
  for (const player of Object.values(memory.room!.players)) player.lastSeen = 0;
  expect(rejoinSeats(memory.room!, Date.now()).some(seat => seat.id === hostSeat.id)).toBe(false);
  await expect(requestRejoinSeat(code, hostSeat.id)).rejects.toThrow('戻れません');
  memory.room!.players[members[1].view.me!].lastSeen = Date.now();
  await command(code, host.token, { type: 'kick', playerId: id });
  silence(members[2].view.me!);
  await expect(requestRejoinSeat(code, id)).rejects.toThrow('戻れません');
  expect((await readRoom(code)).rejoinSeats?.map(seat => seat.id)).toEqual([members[2].view.me]);
  // A session-holding participant is not offered other people's seats.
  expect((await readRoom(code, members[1].token)).rejoinSeats).toBeUndefined();
});

it('withdraws a request when the old phone comes back or the request goes stale', async () => {
  const { code, host, members, id } = await party();
  silence(id);
  const asked = await requestRejoinSeat(code, id);
  await command(code, members[0].token, { type: 'heartbeat' });
  expect((await readRoom(code, host.token)).rejoinRequests).toEqual([]);
  expect((await readRoom(code, asked.token)).rejoinPending).toBeUndefined();
  await expect(command(code, host.token, { type: 'rejoinAnswer', playerId: id, approve: true })).rejects.toThrow('終了');
  expect(authenticate(memory.room!, members[0].token)).toBe(id);
  silence(id);
  const stale = await requestRejoinSeat(code, id);
  memory.room!.rejoinRequests![id].at = Date.now() - REJOIN_TTL;
  expect((await readRoom(code, host.token)).rejoinRequests).toEqual([]);
  await expect(command(code, host.token, { type: 'rejoinAnswer', playerId: id, approve: true })).rejects.toThrow('終了');
  expect(authenticate(memory.room!, stale.token)).toBeNull();
});

it('keeps session material out of every view and works while the game is paused', async () => {
  const { code, host, id } = await party();
  await command(code, host.token, { type: 'pause' });
  silence(id);
  const asked = await requestRejoinSeat(code, id);
  const secret = memory.room!.rejoinRequests![id].secretHash;
  for (const view of [await readRoom(code), await readRoom(code, host.token), await readRoom(code, asked.token), await readRoom(code, undefined, true), asked.view])
    expect(JSON.stringify(view)).not.toMatch(new RegExp(`${secret}|secretHash`));
  await command(code, host.token, { type: 'rejoinAnswer', playerId: id, approve: true });
  expect(memory.room!.pausedAt).toBeGreaterThan(0);
  expect((await readRoom(code, asked.token)).me).toBe(id);
});

it('shares the durable recovery throttle and does not let a retried write duplicate a request', async () => {
  const { code, id } = await party();
  silence(id);
  for (let i = 0; i < 30; i++) await requestRejoinSeat(code, id);
  await expect(requestRejoinSeat(code, id)).rejects.toThrow('多すぎます');
  expect(Object.keys(memory.room!.rejoinRequests!)).toEqual([id]);
});

it('rejects an engine request for an unknown key without touching the prototype', () => {
  const room = structuredClone({ players: {}, hostId: 'host', revision: 1 }) as unknown as Room;
  expect(() => requestRejoin(room, '__proto__', 'hash', 1000)).toThrow('戻れません');
  expect(() => act({ ...room, players: { host: { id: 'host', kicked: false } } } as unknown as Room, 'host',
    { type: 'rejoinAnswer', playerId: '__proto__', approve: true }, 1000, prompts)).toThrow('終了');
});
