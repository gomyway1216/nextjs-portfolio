import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { Room } from '@/lib/ogiri/types';
const memory = vi.hoisted(() => ({ room: null as Room | null, writes: 0, conflict: false }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ data: () => structuredClone(memory.room), updateTime: {} }),
    create: async (room: Room) => { memory.room = structuredClone(room); memory.writes++; },
    update: async (room: Room) => {
      if (memory.conflict) {
        memory.conflict = false;
        // A concurrent recovery-code regeneration revoked this attempt before its CAS.
        memory.room!.players[memory.room!.hostId].recoveryHash = 'changed';
        throw Object.assign(new Error('conflict'), { code: 9 });
      }
      memory.room = structuredClone(room); memory.writes++;
    },
  }) }) }),
}));
import { NextRequest } from 'next/server';
import { act, joinRoom, newPlayer, project } from '@/lib/ogiri/engine';
import { authenticate, command, enterRoom, makeRoom, readRoom, recoverRoom, regenerateRecoveryCode } from '@/lib/ogiri/store';
import { guardRecovery } from '@/lib/ogiri/http';
import { snapshotHistory } from '@/lib/ogiri/history';
import { prompts } from '@/lib/ogiri/prompts';

beforeEach(() => { vi.stubEnv('OGIRI_EMULATOR', ''); memory.room = null; memory.writes = 0; memory.conflict = false; });
afterEach(() => { vi.unstubAllEnvs(); });

it('issues a private readable code, restores exactly the same identity and rotates old sessions', async () => {
  const host = await makeRoom('進行役', 'rabbit', false);
  const entered = await enterRoom(host.view.code, undefined, '参加者', 'pudding');
  const id = entered.view.me!;
  const code = entered.view.recoveryCode!;
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  memory.room!.players[id].score = 450;
  memory.room!.players[id].partyPoints = 17;
  await command(host.view.code, entered.token, { type: 'leave' });
  await command(host.view.code, entered.token, { type: 'heartbeat' });
  expect(memory.room!.players[id].active).toBe(false);
  const restored = await recoverRoom(host.view.code, `${code.slice(0, 4)}-${code.slice(4).toLowerCase()}`);
  expect(restored.view.me).toBe(id);
  expect(restored.view.resting).toBe(true);
  expect(restored.view.players.find(player => player.id === id)).toMatchObject({ name: '参加者', avatar: 'pudding', score: 450, partyPoints: 17 });
  expect(restored.token).not.toBe(entered.token);
  expect(authenticate(memory.room!, entered.token)).toBeNull();
  expect(authenticate(memory.room!, restored.token)).toBe(id);
  await expect(command(host.view.code, entered.token, { type: 'return' })).rejects.toMatchObject({ status: 401 });
  const returned = await command(host.view.code, restored.token, { type: 'return' });
  expect(returned.resting).toBe(false);
  expect(Object.keys(memory.room!.players)).toHaveLength(2);
  const duplicate = await enterRoom(host.view.code, undefined, '参加者', 'pudding');
  expect(duplicate.view.me).not.toBe(id);
  expect(duplicate.view.players.find(player => player.id === duplicate.view.me)?.name).toBe('参加者 2');
  const hostRestored = await recoverRoom(host.view.code, host.view.recoveryCode);
  expect(hostRestored.view).toMatchObject({ me: host.view.me, isHost: true, hostPlays: false });
});

it('never leaks recovery secrets to polls, TV, public views, history or stored plaintext', async () => {
  const host = await makeRoom('主催者', 'rabbit');
  const secret = host.view.recoveryCode!;
  const stored = JSON.stringify(memory.room);
  expect(stored).not.toContain(secret);
  expect(memory.room!.players[host.view.me!].recoveryHash).toMatch(/^[a-f0-9]{64}$/);
  for (const view of [await readRoom(host.view.code, host.token), await readRoom(host.view.code, host.token, true), await readRoom(host.view.code)]) {
    expect(JSON.stringify(view)).not.toMatch(/recoveryCode|recoveryHash|secretHash/);
    expect(JSON.stringify(view)).not.toContain(secret);
  }
  const history = snapshotHistory(memory.room!, 'a'.repeat(32), Date.now(), prompts);
  expect(JSON.stringify(history)).not.toMatch(/recovery|secretHash/);
  expect(JSON.stringify(history)).not.toContain(secret);
});

it('lazily issues codes to old rooms only for authenticated owners and invalidates old codes on reissue', async () => {
  const host = await makeRoom('主催者', 'rabbit');
  delete memory.room!.players[host.view.me!].recoveryHash;
  await expect(regenerateRecoveryCode(host.view.code, undefined)).rejects.toMatchObject({ status: 401 });
  expect(memory.room!.players[host.view.me!].recoveryHash).toBeUndefined();
  const legacy = await enterRoom(host.view.code, host.token, undefined, undefined);
  expect(legacy.view.me).toBe(host.view.me);
  const replaced = await regenerateRecoveryCode(host.view.code, host.token);
  await expect(recoverRoom(host.view.code, legacy.view.recoveryCode)).rejects.toMatchObject({ status: 401 });
  expect((await recoverRoom(host.view.code, replaced.recoveryCode)).view.me).toBe(host.view.me);
});

it('persists wrong-code attempts across instances without extending room expiry and refuses kicked identities', async () => {
  const host = await makeRoom('主催者', 'rabbit');
  const member = await enterRoom(host.view.code, undefined, '参加者', 'pudding');
  await command(host.view.code, host.token, { type: 'kick', playerId: member.view.me! });
  const expiry = memory.room!.expiresAt;
  await expect(recoverRoom(host.view.code, member.view.recoveryCode)).rejects.toMatchObject({ status: 401 });
  for (let i = 0; i < 29; i++) await expect(recoverRoom(host.view.code, 'WRONG')).rejects.toMatchObject({ status: 401 });
  expect(memory.room!.recoveryAttempts?.count).toBe(30);
  expect(memory.room!.expiresAt).toBe(expiry);
  await expect(recoverRoom(host.view.code, host.view.recoveryCode)).rejects.toMatchObject({ status: 429 });
  memory.room!.recoveryAttempts!.resetAt = Date.now() - 1;
  expect((await recoverRoom(host.view.code, host.view.recoveryCode)).view.isHost).toBe(true);
  const request = new NextRequest('https://meetyudai.com/api/ogiri/ABC234', { headers: { 'x-real-ip': 'recovery-test' } });
  for (let i = 0; i < 24; i++) guardRecovery(request);
  expect(() => guardRecovery(request)).toThrow('1分');
});

it('revalidates the code after a concurrent CAS conflict rather than accepting a revoked session', async () => {
  const host = await makeRoom('主催者', 'rabbit');
  memory.conflict = true;
  await expect(recoverRoom(host.view.code, host.view.recoveryCode)).rejects.toMatchObject({ status: 401 });
  expect(authenticate(memory.room!, host.token)).toBe(host.view.me);
});

it('does not return an uncommitted legacy issuance after another tab wins the conditional update', async () => {
  const host = await makeRoom('主催者', 'rabbit');
  delete memory.room!.players[host.view.me!].recoveryHash;
  memory.conflict = true;
  const joined = await enterRoom(host.view.code, host.token, undefined, undefined);
  expect(joined.view.recoveryCode).toBeUndefined();
  expect(memory.room!.players[host.view.me!].recoveryHash).toBe('changed');
});

it.each(['ogiri', 'majority', 'identity'] as const)('keeps rest/return assignments and points stable in %s and rematches', async gameType => {
  const host = await makeRoom('主催者', 'rabbit', true, gameType);
  const member = await enterRoom(host.view.code, undefined, '休憩する人', 'pudding');
  for (const id of ['b', 'c']) joinRoom(memory.room!, newPlayer(id, id, id, 'rabbit', Date.now()));
  memory.room!.settings.autoAdvance = false;
  memory.room!.players[member.view.me!].partyPoints = 17;
  await command(host.view.code, member.token, { type: 'leave' });
  let view = await readRoom(host.view.code, host.token);
  view = await command(host.view.code, host.token, { type: 'start' }, view.turn);
  const ids = JSON.stringify([memory.room!.matches, memory.room!.sideRounds]);
  const restored = await recoverRoom(host.view.code, member.view.recoveryCode);
  view = await command(host.view.code, restored.token, { type: 'return' });
  expect(JSON.stringify([memory.room!.matches, memory.room!.sideRounds])).toBe(ids);
  expect(view.players.find(player => player.id === member.view.me)).toMatchObject({ active: true, playingThisGame: false, answeringThisRound: false, partyPoints: 17 });
  expect(view.assignments).toHaveLength(0);
  expect(view.match?.canVote ?? view.sideGame?.canVote ?? false).toBe(false);
  if (gameType === 'ogiri') {
    act(memory.room!, host.view.me!, { type: 'next' }, Date.now(), prompts);
    expect(project(memory.room!, member.view.me!, Date.now(), prompts).match?.canVote).toBe(false);
  }
  act(memory.room!, host.view.me!, { type: 'finish' }, Date.now(), prompts);
  // This test is concerned with rematch lifecycle, not archive persistence (covered separately).
  memory.room!.archivedGame = memory.room!.game;
  view = await readRoom(host.view.code, host.token);
  view = await command(host.view.code, host.token, { type: 'rematch' }, view.turn);
  expect(memory.room!.players[member.view.me!]).toMatchObject({ partyPoints: 17, active: true });
  await command(host.view.code, host.token, { type: 'start' }, view.turn);
  expect(project(memory.room!, member.view.me!, Date.now(), prompts).players.find(player => player.id === member.view.me)?.playingThisGame).toBe(true);
});

it('reserves resting participants within the twelve slots, permits their return, and lets a host rest without losing controls', async () => {
  const host = await makeRoom('主催者', 'rabbit');
  for (let i = 0; i < 11; i++) joinRoom(memory.room!, newPlayer(`p${i}`, `p${i}`, `参加者${i}`, 'rabbit', Date.now()));
  act(memory.room!, 'p0', { type: 'leave' }, Date.now(), prompts);
  await expect(enterRoom(host.view.code, undefined, '追加', 'rabbit')).rejects.toThrow('満員');
  act(memory.room!, 'p0', { type: 'return' }, Date.now(), prompts);
  await command(host.view.code, host.token, { type: 'leave' });
  await command(host.view.code, host.token, { type: 'heartbeat' });
  expect((await readRoom(host.view.code, host.token))).toMatchObject({ isHost: true, resting: true });
  await command(host.view.code, host.token, { type: 'finish' });
  expect(memory.room!.phase).toBe('finished');
  expect(Object.keys(memory.room!.players)).toHaveLength(12);
});
