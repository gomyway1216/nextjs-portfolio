import { describe, expect, it, vi } from 'vitest';
import { FieldValue } from 'firebase-admin/firestore';
import type { Room } from '@/lib/ogiri/types';

const memory = vi.hoisted(() => ({ room: null as Room | null, writes: [] as Record<string, unknown>[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => ({ collection: () => ({ doc: () => ({
    get: async () => ({ data: () => structuredClone(memory.room), updateTime: {} }),
    update: async (patch: Record<string, unknown>) => { memory.writes.push(patch); },
  }) }) }),
}));
import { act, createRoom, joinRoom, newPlayer, project, turnKey } from '@/lib/ogiri/engine';
import { identity, react } from '@/lib/ogiri/store';
import { prompts } from '@/lib/ogiri/prompts';
import { snapshotHistory } from '@/lib/ogiri/history';
import {
  applyReaction,
  planReaction,
  projectReactions,
  reactionBursts,
  reactionInput,
  type ReactionState,
} from '@/lib/ogiri/reactions';

const now = 1_000_000;
function votingRoom(hostId = 'p0', hostHash = 'secret0', at = now) {
  const room = createRoom('ABC234', newPlayer(hostId, hostHash, '主催者', '🐱', at), at);
  for (let i = 1; i < 4; i++) joinRoom(room, newPlayer(`p${i}`, `secret${i}`, `参加者${i}`, '🐶', at));
  act(room, hostId, { type: 'start' }, at, prompts);
  for (const m of room.matches)
    for (const id of m.players) act(room, id, { type: 'answer', matchId: m.id, text: `回答 ${id}` }, at + 1, prompts);
  act(room, hostId, { type: 'next' }, at + 2, prompts);
  expect(room.phase).toBe('voting');
  return room;
}
const plan = (state: ReactionState | undefined, at: number, extra: Partial<Parameters<typeof planReaction>[1]> = {}) =>
  planReaction(state, { phase: 'voting', turn: 't1', clientTurn: 't1', playerId: 'p1', counts: { laugh: 2 }, ...extra }, at);

describe('reaction rules', () => {
  it('accepts only small batches of known reactions', () => {
    expect(reactionInput({ laugh: 3, wow: 15 })).toEqual({ laugh: 3, clap: 0, wow: 15 });
    for (const bad of [null, [], 'laugh', {}, { laugh: 0 }, { laugh: 16 }, { laugh: -1 }, { laugh: 1.5 }, { cry: 1 }, { laugh: '2' }])
      expect(() => reactionInput(bad)).toThrow();
  });
  it('only opens while voting or revealing, and only for the current turn', () => {
    expect(() => plan(undefined, now, { phase: 'answering' })).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => plan(undefined, now, { phase: 'ranking' })).toThrow(expect.objectContaining({ status: 409 }));
    expect(() => plan(undefined, now, { clientTurn: 't0' })).toThrow(expect.objectContaining({ status: 409 }));
    expect(plan(undefined, now, { phase: 'reveal' }).reset).toBe(true);
  });
  it('throttles each player per turn and resets counters on a new turn', () => {
    const first = applyReaction(undefined, 't1', 'p1', plan(undefined, now), now);
    expect(first.counts).toEqual({ laugh: 2, clap: 0, wow: 0 });
    expect(() => plan(first, now + 1000)).toThrow(expect.objectContaining({ status: 429 }));
    const other = plan(first, now + 1000, { playerId: 'p2', counts: { clap: 1 } });
    expect(other.reset).toBe(false);
    const second = applyReaction(first, 't1', 'p2', other, now + 1000);
    expect(second.counts).toEqual({ laugh: 2, clap: 1, wow: 0 });
    expect(applyReaction(second, 't1', 'p1', plan(second, now + 2600), now + 2600).counts.laugh).toBe(4);
    const nextTurn = plan(second, now + 1000, { turn: 't2', clientTurn: 't2' });
    expect(nextTurn.reset).toBe(true);
    expect(applyReaction(second, 't2', 'p1', nextTurn, now + 1000)).toEqual({
      turn: 't2', counts: { laugh: 2, clap: 0, wow: 0 }, last: { p1: now + 1000 },
    });
  });
  it('projects anonymous totals for the current turn only', () => {
    const state = applyReaction(undefined, 't1', 'p1', plan(undefined, now), now);
    expect(projectReactions(state, 'voting', 't1')).toEqual({ laugh: 2, clap: 0, wow: 0 });
    expect(projectReactions(state, 'reveal', 't2')).toEqual({ laugh: 0, clap: 0, wow: 0 });
    expect(projectReactions(state, 'ranking', 't1')).toBeNull();
    expect(projectReactions(undefined, 'lobby', 't1')).toBeNull();
  });
  it('floats only new reactions, capped per poll', () => {
    expect(reactionBursts({ laugh: 2, clap: 5, wow: 0 }, { laugh: 5, clap: 5, wow: 30 })).toEqual({ laugh: 3, clap: 0, wow: 8 });
    expect(reactionBursts(null, { laugh: 1, clap: 0, wow: 0 })).toEqual({ laugh: 1, clap: 0, wow: 0 });
    expect(reactionBursts({ laugh: 9, clap: 0, wow: 0 }, { laugh: 1, clap: 0, wow: 0 })).toEqual({ laugh: 0, clap: 0, wow: 0 });
  });
});

describe('reaction projection and history', () => {
  it('never leaks the throttle map, scores or history entries', () => {
    const room = votingRoom();
    const scores = Object.values(room.players).map((p) => p.score);
    room.reactions = applyReaction(undefined, turnKey(room), 'p1', plan(undefined, now, { turn: turnKey(room), clientTurn: turnKey(room) }), now);
    const view = project(room, 'p2', now, prompts);
    expect(view.reactions).toEqual({ laugh: 2, clap: 0, wow: 0 });
    expect(JSON.stringify(view)).not.toContain('"last"');
    expect(project(room, null, now, prompts).reactions).toEqual({ laugh: 2, clap: 0, wow: 0 });
    expect(Object.values(room.players).map((p) => p.score)).toEqual(scores);
    expect(JSON.stringify(snapshotHistory(room, 'a'.repeat(32), now, prompts))).not.toMatch(/reaction|laugh/);
  });
});

describe('react store command', () => {
  function setup() {
    vi.stubEnv('OGIRI_EMULATOR', '');
    const session = identity();
    const room = votingRoom(session.id, session.hash, Date.now());
    memory.room = room;
    memory.writes = [];
    return { session, room, turn: turnKey(room) };
  }
  it('writes field increments only, never the whole room', async () => {
    const { session, room, turn } = setup();
    const first = await react(room.code, session.token, { laugh: 3 }, turn);
    expect(first.reactions).toEqual({ laugh: 3, clap: 0, wow: 0 });
    expect(first.revision).toBe(room.revision + 1);
    expect(memory.writes).toHaveLength(1);
    const [reset] = memory.writes;
    expect(Object.keys(reset).sort()).toEqual(['reactions', 'revision']);
    expect((reset.revision as FieldValue).isEqual(FieldValue.increment(1))).toBe(true);

    memory.room = { ...room, reactions: { turn, counts: { laugh: 3, clap: 0, wow: 0 }, last: { [session.id]: Date.now() - 5000 } } };
    const second = await react(room.code, session.token, { clap: 2, wow: 1 }, turn);
    expect(second.reactions).toEqual({ laugh: 3, clap: 2, wow: 1 });
    const increment = memory.writes[1];
    expect(Object.keys(increment).sort()).toEqual(['reactions.counts.clap', 'reactions.counts.wow', `reactions.last.${session.id}`, 'revision'].sort());
    expect((increment['reactions.counts.clap'] as FieldValue).isEqual(FieldValue.increment(2))).toBe(true);
    vi.unstubAllEnvs();
  });
  it('rejects without writing when unauthenticated, too fast, stale or closed', async () => {
    const { session, room, turn } = setup();
    await expect(react(room.code, undefined, { laugh: 1 }, turn)).rejects.toMatchObject({ status: 401 });
    await expect(react(room.code, session.token, { laugh: 1 }, `${turn}:old`)).rejects.toMatchObject({ status: 409 });
    await expect(react(room.code, session.token, { laugh: 99 }, turn)).rejects.toMatchObject({ status: 400 });
    memory.room = { ...room, reactions: { turn, counts: { laugh: 1, clap: 0, wow: 0 }, last: { [session.id]: Date.now() } } };
    await expect(react(room.code, session.token, { laugh: 1 }, turn)).rejects.toMatchObject({ status: 429 });
    memory.room = { ...room, phase: 'ranking' };
    await expect(react(room.code, session.token, { laugh: 1 }, turn)).rejects.toMatchObject({ status: 409 });
    expect(memory.writes).toHaveLength(0);
    vi.unstubAllEnvs();
  });
});
