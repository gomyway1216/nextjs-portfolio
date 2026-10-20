import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JACKPOT_START, nextJackpot } from '@/components/game/MedalCenter/floor/useFloorJackpot';
import { FLOOR_RULES } from '@/lib/medalFloor/games';
import { CLAIM_LEASE_MS, DAILY_PLAYED_MOST, JACKPOT_SEED, jackpotFrom, winChance, type FloorJackpotView, type JackpotPrize } from '@/lib/medalFloor/jackpot';
import type { FloorMe, FloorReportResult, FloorSummary } from '@/lib/medalFloor/types';
import { FakeFirestore, FakeRtdb, fakeAuth, type FakeToken } from './fakeFirebase';

// The floor jackpot's routes, end to end against in-memory fakes of Firestore, the Realtime Database and token checks:
// what feeds the pool, the draw (with the server's random number put in by the test), a win kept until the player's
// browser says it is paid, two winners at once, and the owner's void. Nothing reaches a real server or account.

const fakes = vi.hoisted(() => ({ noCredentials: null as Error | null, db: null as unknown, rtdb: null as unknown, auth: null as unknown, draws: [] as number[], names: [] as string[] }));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => fakes.db,
  getRealtimeDatabase: () => fakes.rtdb,
  getAuth: () => fakes.auth,
}));
// Whether the server has credentials (adminCredentials.ts): yes, unless a test says it has none.
vi.mock('@/lib/adminCredentials', () => ({
  requireAdminCredentials: async () => {
    if (fakes.noCredentials) throw fakes.noCredentials;
  },
}));
vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));
// The server's draw: the next number the test has put in (no win when it has put in none), and the next win's name.
vi.mock('@/lib/medalFloor/draw', () => ({
  drawUniform: () => fakes.draws.shift() ?? 0.999_999,
  drawName: () => fakes.names.shift() ?? 'a1b2c3d4',
}));

const db = () => fakes.db as FakeFirestore;
const rtdb = () => fakes.rtdb as FakeRtdb;

// A Saturday afternoon on the floor (Japan time): 2026-10-17 15:00 JST.
const NOON = Date.UTC(2026, 9, 17, 6, 0, 0);
const BASE = 'https://floor.example.test/api/game/medal-floor';
const POOL = 'medal_floor_jackpot/current';

function request(path: string, init: { method?: string; token?: FakeToken | string; body?: unknown } = {}): NextRequest {
  const headers: Record<string, string> = { 'x-real-ip': '198.51.100.7' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`${BASE}${path}`, { method: init.method ?? 'GET', headers, body });
}

const meRoute = () => import('@/app/api/game/medal-floor/me/route');
const reportRoute = () => import('@/app/api/game/medal-floor/report/route');
const jackpotRoute = () => import('@/app/api/game/medal-floor/jackpot/route');
const winsRoute = () => import('@/app/api/game/medal-floor/jackpot/wins/route');
const adminRoute = () => import('@/app/api/game/medal-floor/admin/route');

async function join(token: FakeToken, name: string | null = null): Promise<void> {
  const { PUT } = await meRoute();
  const response = await PUT(request('/me', { method: 'PUT', token, body: { name } }), undefined as never);
  expect(response?.status).toBe(200);
}

async function me(token: FakeToken): Promise<FloorMe> {
  const { GET } = await meRoute();
  return (await (await GET(request('/me', { token }), undefined as never))!.json()) as FloorMe;
}

async function report(token: FakeToken | string, body: unknown): Promise<{ status: number; body: FloorReportResult & { error?: string } }> {
  const { POST } = await reportRoute();
  const response = await POST(request('/report', { method: 'POST', token, body }), undefined as never);
  return { status: response!.status, body: await response!.json() };
}

async function wins(token: FakeToken | string, body: unknown): Promise<{ status: number; body: { wins?: JackpotPrize[]; done?: boolean; error?: string } }> {
  const { POST } = await winsRoute();
  const response = await POST(request('/jackpot/wins', { method: 'POST', token, body }), undefined as never);
  return { status: response!.status, body: await response!.json() };
}

async function jackpot(): Promise<{ status: number; body: FloorJackpotView; text: string }> {
  vi.resetModules(); // past the route's few seconds of cache
  const { GET } = await jackpotRoute();
  const response = await GET(request('/jackpot'), undefined as never);
  const text = await response!.text();
  return { status: response!.status, body: JSON.parse(text) as FloorJackpotView, text };
}

async function owner(body: unknown, token: FakeToken = 'fake-token-owner'): Promise<number> {
  const { POST } = await adminRoute();
  return (await POST(request('/admin', { method: 'POST', token, body }), undefined as never))!.status;
}

const pool = () => db().read(POOL) as { amount: number; seq: number; played: number; seed: number; extra: number; v: number; wins: { id: string }[] } | undefined;
const winDoc = (id: string) => db().read(`${POOL}/medal_floor_jackpot_wins/${id}`) as { state: string; uid: string; medals: number; moment?: number } | undefined;
const live = () => rtdb().at('medalFloor/jackpot') as { amount: number; seq: number; v: number; last?: Record<string, unknown> } | undefined;

beforeEach(() => {
  vi.resetModules();
  fakes.noCredentials = null;
  fakes.db = new FakeFirestore();
  fakes.rtdb = new FakeRtdb();
  fakes.auth = fakeAuth();
  fakes.draws = [];
  fakes.names = [];
  vi.useFakeTimers({ toFake: ['Date'], now: NOON });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('what feeds the floor jackpot', () => {
  it('adds a hundredth of every medal a joined player plays, on top, and shows the pool live', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    const answer = await report('fake-token-ann', { game: 'slot-machine', won: 0, played: 400 });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ counted: 0, best: false, shown: false, played: 400 });
    expect(pool()).toMatchObject({ seq: 0, seed: JACKPOT_SEED, played: 400, amount: JACKPOT_SEED + 4 });
    expect(live()).toMatchObject({ amount: JACKPOT_SEED + 4, seq: 0 });
    const v = live()!.v;
    await report('fake-token-ann', { game: 'slot-machine', won: 30, played: 100 });
    expect(pool()?.amount).toBe(JACKPOT_SEED + 5);
    expect(live()?.v).toBeGreaterThan(v);
    // Everybody can read it, and it names nobody's account.
    const shown = await jackpot();
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({ available: true, amount: JACKPOT_SEED + 5, seq: 0, wins: [] });
    expect(shown.text).not.toContain('test-uid');
  });

  it('believes medals played no faster than the machine can be played, and no more than the day’s most', async () => {
    await join('fake-token-ann');
    const rule = FLOOR_RULES.janken;
    expect((await report('fake-token-ann', { game: 'janken', played: rule.playBurst + 1 })).status).toBe(400);
    expect((await report('fake-token-ann', { game: 'janken', played: rule.playBurst })).body.played).toBe(rule.playBurst);
    // The allowance is spent: a minute later, a minute's worth is believed.
    vi.setSystemTime(NOON + 60_000);
    expect((await report('fake-token-ann', { game: 'janken', played: rule.playBurst })).body.played).toBe(rule.perMinute);
    // Past the day's most across every machine, none is believed, and the pool is not fed.
    const roulette = FLOOR_RULES.roulette;
    let left = DAILY_PLAYED_MOST - rule.playBurst - rule.perMinute;
    while (left > 0) {
      vi.setSystemTime(Date.now() + 60_000);
      const asked = Math.min(left, roulette.perMinute);
      expect((await report('fake-token-ann', { game: 'roulette', played: asked })).body.played).toBe(asked);
      left -= asked;
    }
    const before = pool()!.played;
    vi.setSystemTime(Date.now() + 60_000);
    expect((await report('fake-token-ann', { game: 'roulette', played: 500 })).body.played).toBe(0);
    expect(pool()!.played).toBe(before);
    expect(before).toBe(DAILY_PLAYED_MOST);
    // The next floor day starts over.
    vi.setSystemTime(Date.UTC(2026, 9, 17, 15, 0, 0) + 60_000);
    expect((await report('fake-token-ann', { game: 'roulette', played: 500 })).body.played).toBe(500);
  });

  it('takes no part of the medals played at a table that is not linked to it: no share, no draw', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    for (const game of ['blackjack', 'video-poker', 'baccarat', 'craps'] as const) {
      fakes.draws.push(0);
      const answer = await report('fake-token-ann', { game, played: 5 });
      expect(answer.status, game).toBe(200);
      expect(answer.body, game).toEqual({ counted: 0, best: false, shown: false, played: 0 });
    }
    expect(pool()).toBeUndefined();
    expect((await me('fake-token-ann')).due).toBeUndefined();
    // Not even drawn for: the four numbers put in for the draws are all still there.
    expect(fakes.draws).toEqual([0, 0, 0, 0]);
    fakes.draws = [];
    // The same player at a linked machine feeds it.
    await report('fake-token-ann', { game: 'three-card-poker', played: 300 });
    expect(pool()?.amount).toBe(JACKPOT_SEED + 3);
  });

  it('takes nothing from a player who is not on the floor, a guest or a visitor with no token', async () => {
    expect((await report('fake-token-ann', { game: 'slot-machine', played: 90 })).status).toBe(403);
    expect((await report('fake-token-guest', { game: 'slot-machine', played: 90 })).status).toBe(403);
    expect((await report('', { game: 'slot-machine', played: 90 })).status).toBe(401);
    expect(pool()).toBeUndefined();
  });
});

describe('the draw', () => {
  it('is made on the server with 1 − (1 − q)^played, and a win takes the whole pool and starts it again at the seed', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    await report('fake-token-ann', { game: 'slot-machine', played: 600 });
    // A number just above the chance of 300 medals: no win.
    fakes.draws.push(winChance(300) + 1e-9);
    expect((await report('fake-token-ann', { game: 'slot-machine', played: 300 })).body.jackpot).toBeUndefined();
    // Just under it: a win.
    fakes.draws.push(winChance(300) - 1e-9);
    fakes.names.push('0badcafe');
    const won = await report('fake-token-ann', { game: 'slot-machine', played: 300 });
    expect(won.body.jackpot).toEqual({ id: '20261017-0badcafe', medals: JACKPOT_SEED + 12, at: NOON });
    expect(pool()).toMatchObject({ seq: 1, played: 0, extra: 0, amount: JACKPOT_SEED });
    expect(winDoc('20261017-0badcafe')).toMatchObject({ state: 'pending', uid: 'test-uid-ann', medals: JACKPOT_SEED + 12 });
    // The whole floor sees it.
    const feed = Object.values(rtdb().at('medalFloor/feed') as Record<string, Record<string, unknown>>);
    expect(feed).toContainEqual(expect.objectContaining({ name: 'Lucky Cat', game: 'slot-machine', label: 'floor-jackpot', medals: JACKPOT_SEED + 12 }));
    expect(live()).toMatchObject({ amount: JACKPOT_SEED, seq: 1, last: { name: 'Lucky Cat', tag: expect.any(String), game: 'slot-machine', medals: JACKPOT_SEED + 12 } });
    expect(JSON.stringify(live())).not.toContain('test-uid');
    // It waits to go into their medals.
    expect((await me('fake-token-ann')).due).toBe(1);
    const shown = await jackpot();
    expect(shown.body.wins).toEqual([{ name: 'Lucky Cat', tag: expect.any(String), game: 'slot-machine', medals: JACKPOT_SEED + 12, at: NOON }]);
    expect(shown.text).not.toContain('0badcafe');
  });

  it('gives a player one floor jackpot a floor day at most: their medals still feed it', async () => {
    await join('fake-token-ann');
    fakes.draws.push(0);
    expect((await report('fake-token-ann', { game: 'slot-machine', played: 90 })).body.jackpot).toBeDefined();
    fakes.draws.push(0);
    const again = await report('fake-token-ann', { game: 'slot-machine', played: 200 });
    expect(again.body.jackpot).toBeUndefined();
    expect(pool()).toMatchObject({ seq: 1, played: 200, amount: JACKPOT_SEED + 2 });
    // Tomorrow, they may win again.
    vi.setSystemTime(Date.UTC(2026, 9, 17, 15, 0, 1));
    fakes.draws.push(0);
    expect((await report('fake-token-ann', { game: 'slot-machine', played: 90 })).body.jackpot).toBeDefined();
  });

  it('puts two winners at the same moment one after the other: the first takes the pool, the second only feeds the new one', async () => {
    await join('fake-token-ann', 'Ann');
    await join('fake-token-ben', 'Ben');
    await report('fake-token-ann', { game: 'roulette', played: 4_000 });
    fakes.draws.push(0, 0);
    fakes.names.push('aaaaaaaa', 'bbbbbbbb');
    const [ann, ben] = await Promise.all([
      report('fake-token-ann', { game: 'roulette', played: 1_000 }),
      report('fake-token-ben', { game: 'three-card-poker', played: 400 }),
    ]);
    // The two ran into each other on the pool, and the later one was run again on what the first left.
    expect(db().retries).toBeGreaterThan(0);
    const winners = [ann.body.jackpot, ben.body.jackpot].filter(Boolean);
    expect(winners).toHaveLength(1);
    const first = ann.body.jackpot ? { body: ann.body, other: 400 } : { body: ben.body, other: 1_000 };
    expect(first.body.jackpot?.medals).toBeGreaterThanOrEqual(JACKPOT_SEED + 40);
    expect(pool()).toMatchObject({ seq: 1, played: first.other, amount: JACKPOT_SEED + first.other / 100 });
  });
});

describe('a win on its way into the player’s medals', () => {
  const win = async (name = 'cafef00d'): Promise<string> => {
    await join('fake-token-ann', 'Lucky Cat');
    fakes.draws.push(0);
    fakes.names.push(name);
    const won = await report('fake-token-ann', { game: 'slot-machine', played: 3 });
    return won.body.jackpot!.id;
  };

  it('is handed to the player’s device until it says the win is in, and saying so twice is done all the same', async () => {
    const id = await win();
    const claimed = await wins('fake-token-ann', { action: 'claim', device: 'phone00001' });
    expect(claimed).toEqual({ status: 200, body: { wins: [{ id, medals: JACKPOT_SEED, at: NOON }] } });
    // A page reloaded halfway is handed it again.
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).body.wins).toHaveLength(1);
    expect((await wins('fake-token-ann', { action: 'ack', id })).body).toEqual({ done: true });
    expect(winDoc(id)?.state).toBe('paid');
    expect((await wins('fake-token-ann', { action: 'ack', id })).status).toBe(200);
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).body.wins).toEqual([]);
    expect((await me('fake-token-ann')).due).toBeUndefined();
  });

  it('goes to one device at a time: another device of the player’s is given it only once the first has let it go', async () => {
    const id = await win();
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).body.wins).toHaveLength(1);
    expect((await wins('fake-token-ann', { action: 'claim', device: 'laptop0001' })).body.wins).toEqual([]);
    vi.setSystemTime(NOON + CLAIM_LEASE_MS);
    expect((await wins('fake-token-ann', { action: 'claim', device: 'laptop0001' })).body.wins?.map((w) => w.id)).toEqual([id]);
    // And now the phone waits for the laptop.
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).body.wins).toEqual([]);
  });

  it('is only ever the winner’s: nobody else is handed it or can say it is paid', async () => {
    const id = await win();
    expect((await wins('fake-token-ben', { action: 'claim', device: 'phone00002' })).body.wins).toEqual([]);
    expect((await wins('fake-token-ben', { action: 'ack', id })).status).toBe(404);
    expect(winDoc(id)?.state).toBe('pending');
    expect((await wins('fake-token-guest', { action: 'claim', device: 'phone00003' })).status).toBe(403);
    expect((await wins('', { action: 'claim', device: 'phone00003' })).status).toBe(401);
  });

  it('refuses what is not a claim or a receipt in shape', async () => {
    await win();
    for (const body of [{ action: 'claim' }, { action: 'claim', device: '../../x' }, { action: 'ack', id: 'nope' }, { action: 'pay', id: '20261017-cafef00d' }, []]) {
      expect((await wins('fake-token-ann', body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it('stays the player’s after they leave the floor', async () => {
    const id = await win();
    const { DELETE } = await meRoute();
    expect((await DELETE(request('/me', { method: 'DELETE', token: 'fake-token-ann' }), undefined as never))!.status).toBe(200);
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).body.wins?.map((w) => w.id)).toEqual([id]);
  });
});

describe('the owner', () => {
  it('sees each win with its state, and can void one that is plainly not real: not paid, off the floor, the pool given back', async () => {
    await join('fake-token-ann', 'Cheater');
    await join('fake-token-ben', 'Ben');
    await report('fake-token-ann', { game: 'roulette', played: 4_000 });
    fakes.draws.push(0);
    fakes.names.push('deadbeef');
    const id = '20261017-deadbeef';
    expect((await report('fake-token-ann', { game: 'slot-machine', played: 60 })).body.jackpot).toEqual({ id, medals: JACKPOT_SEED + 40, at: NOON });
    // The floor plays on into the new pool.
    await report('fake-token-ben', { game: 'three-card-poker', played: 400 });
    expect(pool()?.amount).toBe(JACKPOT_SEED + 4);

    const { GET } = await adminRoute();
    const floor = (await (await GET(request('/admin', { token: 'fake-token-owner' }), undefined as never))!.json()) as FloorSummary;
    expect(floor.jackpot?.owned).toEqual([expect.objectContaining({ id, state: 'pending', name: 'Cheater', game: 'slot-machine', medals: JACKPOT_SEED + 40 })]);
    expect(JSON.stringify(floor.jackpot)).not.toContain('test-uid');

    expect(await owner({ action: 'void-jackpot', id }, 'fake-token-ann')).toBe(403);
    expect(await owner({ action: 'void-jackpot', id: 'nope' })).toBe(400);
    expect(await owner({ action: 'void-jackpot', id })).toBe(200);
    expect(winDoc(id)?.state).toBe('void');
    // The pool gets back what the win took over the seed it was started again at: as if it had never been won.
    expect(pool()).toMatchObject({ seq: 1, amount: JACKPOT_SEED + 4 + 40, wins: [] });
    expect(live()).toMatchObject({ amount: JACKPOT_SEED + 4 + 40 });
    const feed = Object.values((rtdb().at('medalFloor/feed') ?? {}) as Record<string, Record<string, unknown>>);
    expect(feed.some((moment) => moment.label === 'floor-jackpot')).toBe(false);
    // It is not handed to the player, and their device saying it is paid after all is done all the same.
    expect((await me('fake-token-ann')).due).toBeUndefined();
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).body.wins).toEqual([]);
    expect((await wins('fake-token-ann', { action: 'ack', id })).status).toBe(200);
    expect(winDoc(id)?.state).toBe('void');
    // Voided twice: done, and the pool is given back once.
    expect(await owner({ action: 'void-jackpot', id })).toBe(200);
    expect(pool()?.amount).toBe(JACKPOT_SEED + 4 + 40);
  });

  it('a blocked player is handed none of their wins until the owner says what becomes of them', async () => {
    await join('fake-token-ann', 'Cheater');
    fakes.draws.push(0);
    await report('fake-token-ann', { game: 'slot-machine', played: 3 });
    const { GET } = await adminRoute();
    const floor = (await (await GET(request('/admin', { token: 'fake-token-owner' }), undefined as never))!.json()) as FloorSummary;
    const pid = floor.day.won.length === 0 ? (db().read('medal_floor_players/test-uid-ann') as { pid: string }).pid : floor.day.won[0]!.pid!;
    expect(await owner({ action: 'block', pid })).toBe(200);
    expect((await wins('fake-token-ann', { action: 'claim', device: 'phone00001' })).status).toBe(403);
  });
});

describe('the live mirror, as a page reads it', () => {
  /** What a page shows after hearing the route, then the mirror (in that order, and the other). */
  const shown = async () => {
    const view = (await jackpot()).body;
    const value = rtdb().at('medalFloor/jackpot') ?? null;
    return {
      view,
      value,
      routeFirst: nextJackpot(nextJackpot(JACKPOT_START, { kind: 'route', view, at: Date.now() }), { kind: 'live', value }),
      mirrorFirst: nextJackpot(nextJackpot(JACKPOT_START, { kind: 'live', value }), { kind: 'route', view, at: Date.now() }),
    };
  };

  it('is not there until the first report has fed the pool: the page shows the route’s seed, and asks the route', async () => {
    const { view, value, routeFirst, mirrorFirst } = await shown();
    expect(value).toBeNull();
    expect(jackpotFrom(value)).toBeNull();
    expect(view).toMatchObject({ available: true, amount: JACKPOT_SEED, seq: 0, v: 0 });
    for (const state of [routeFirst, mirrorFirst]) expect(state).toMatchObject({ amount: JACKPOT_SEED, v: 0, live: false });
  });

  it('is written in the shape the page reads, with the pool’s version, the same as the route’s', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    await report('fake-token-ann', { game: 'slot-machine', played: 400 });
    const fed = await shown();
    expect(jackpotFrom(fed.value)).toEqual({ amount: JACKPOT_SEED + 4, seq: 0, v: fed.view.v, last: null });
    expect(fed.view.v).toBeGreaterThan(0);
    for (const state of [fed.routeFirst, fed.mirrorFirst]) expect(state).toMatchObject({ amount: JACKPOT_SEED + 4, v: fed.view.v, live: true });
    // A win: the mirror carries it as the page reads it, with no account in it.
    fakes.draws.push(0);
    await report('fake-token-ann', { game: 'roulette', played: 100 });
    const won = await shown();
    expect(jackpotFrom(won.value)).toEqual({ amount: JACKPOT_SEED, seq: 1, v: won.view.v, last: { name: 'Lucky Cat', tag: expect.any(String), game: 'roulette', medals: JACKPOT_SEED + 5, at: NOON } });
    expect(JSON.stringify(won.value)).not.toContain('test-uid');
    expect(won.routeFirst).toMatchObject({ amount: JACKPOT_SEED, seq: 1, live: true, wins: [expect.objectContaining({ name: 'Lucky Cat', medals: JACKPOT_SEED + 5 })] });
  });

  it('left behind when the server could not write it, is not believed over the route: the page shows the pool and asks the route', async () => {
    await join('fake-token-ann');
    await report('fake-token-ann', { game: 'slot-machine', played: 2_000 });
    // The next write of the mirror fails; the report is counted all the same.
    const ref = rtdb().ref.bind(rtdb());
    rtdb().ref = (path = '') => {
      const real = ref(path);
      if (path === 'medalFloor/jackpot') real.transaction = () => Promise.reject(new Error('fake RTDB: unavailable'));
      return real;
    };
    expect((await report('fake-token-ann', { game: 'slot-machine', played: 500 })).status).toBe(200);
    const { view, value, routeFirst, mirrorFirst } = await shown();
    expect(jackpotFrom(value)?.amount).toBe(JACKPOT_SEED + 20);
    expect(view.amount).toBe(JACKPOT_SEED + 25);
    for (const state of [routeFirst, mirrorFirst]) expect(state).toMatchObject({ amount: JACKPOT_SEED + 25, v: view.v, live: false });
  });

  it('is written again after a void, one version on', async () => {
    await join('fake-token-ann', 'Cheater');
    fakes.draws.push(0);
    fakes.names.push('deadbeef');
    await report('fake-token-ann', { game: 'slot-machine', played: 300 });
    const before = jackpotFrom(rtdb().at('medalFloor/jackpot'))!;
    expect(await owner({ action: 'void-jackpot', id: '20261017-deadbeef' })).toBe(200);
    const { view, value, routeFirst } = await shown();
    expect(jackpotFrom(value)).toEqual({ amount: JACKPOT_SEED + 3, seq: 1, v: before.v + 1, last: null });
    expect(view).toMatchObject({ amount: JACKPOT_SEED + 3, v: before.v + 1, wins: [] });
    expect(routeFirst).toMatchObject({ amount: JACKPOT_SEED + 3, live: true });
  });
});

describe('a store that is not set up', () => {
  it('shows no pool and does not ask again for half a minute', async () => {
    db().failing = new Error('Firebase projectId is required but not found in environment variables');
    const { GET } = await jackpotRoute();
    const first = await GET(request('/jackpot'), undefined as never);
    expect(first!.status).toBe(200);
    expect(((await first!.json()) as FloorJackpotView).available).toBe(false);
    db().failing = null;
    const reads = db().reads;
    vi.setSystemTime(NOON + 29_000);
    expect(((await (await GET(request('/jackpot'), undefined as never))!.json()) as FloorJackpotView).available).toBe(false);
    expect(db().reads).toBe(reads);
    vi.setSystemTime(NOON + 30_000);
    expect(((await (await GET(request('/jackpot'), undefined as never))!.json()) as FloorJackpotView).available).toBe(true);
  });

  it('where the server has no credentials at all (CI): shows no pool at once, reads nothing, and says nothing in the log', async () => {
    fakes.noCredentials = new Error('Could not load the default credentials. Browse to https://cloud.google.com/docs/authentication/getting-started for more information.');
    const { status, body } = await jackpot();
    expect(status).toBe(200);
    expect(body.available).toBe(false);
    expect(db().reads).toBe(0);
    expect(console.error).not.toHaveBeenCalled();
  });
});
