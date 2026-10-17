import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DAILY_WON_MOST, FLOOR_RULES } from '@/lib/medalFloor/games';
import { periodAt, periodBefore } from '@/lib/medalFloor/periods';
import { FEED_SLOTS, FEED_SPACING_MS, REPORTS_PER_MINUTE } from '@/lib/medalFloor/report';
import type { FloorMe, FloorReportResult, FloorSummary } from '@/lib/medalFloor/types';
import { FakeFirestore, FakeRtdb, fakeAuth, type FakeToken } from './fakeFirebase';

// The medal floor's routes, end to end against in-memory fakes of Firestore, the Realtime Database and token checks.
// What matters as much as what they store is what they refuse, and that nothing they answer names an account.

const fakes = vi.hoisted(() => ({ db: null as unknown, rtdb: null as unknown, auth: null as unknown }));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => fakes.db,
  getRealtimeDatabase: () => fakes.rtdb,
  getAuth: () => fakes.auth,
}));
vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));

const db = () => fakes.db as FakeFirestore;
const rtdb = () => fakes.rtdb as FakeRtdb;

// A Saturday afternoon on the floor (Japan time): 2026-10-17 15:00 JST.
const NOON = Date.UTC(2026, 9, 17, 6, 0, 0);

const BASE = 'https://floor.example.test/api/game/medal-floor';

function request(path: string, init: { method?: string; token?: FakeToken | string; body?: unknown; raw?: string } = {}): NextRequest {
  const headers: Record<string, string> = { 'x-real-ip': '198.51.100.7' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let body: string | undefined;
  if (init.raw !== undefined) body = init.raw;
  else if (init.body !== undefined) body = JSON.stringify(init.body);
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new NextRequest(`${BASE}${path}`, { method: init.method ?? 'GET', headers, body });
}

const floorRoute = () => import('@/app/api/game/medal-floor/route');
const meRoute = () => import('@/app/api/game/medal-floor/me/route');
const reportRoute = () => import('@/app/api/game/medal-floor/report/route');
const adminRoute = () => import('@/app/api/game/medal-floor/admin/route');

async function summary(view: 'hub' | 'full' = 'full'): Promise<FloorSummary> {
  vi.resetModules(); // past the route's few seconds of cache
  const { GET } = await floorRoute();
  const response = await GET(request(`?view=${view}`), undefined as never);
  expect(response?.status).toBe(200);
  return (await response!.json()) as FloorSummary;
}

async function join(token: FakeToken, name: string | null = null): Promise<FloorMe> {
  const { PUT } = await meRoute();
  const response = await PUT(request('/me', { method: 'PUT', token, body: { name } }), undefined as never);
  expect(response?.status).toBe(200);
  return (await response!.json()) as FloorMe;
}

async function report(token: FakeToken | string, body: unknown): Promise<{ status: number; body: FloorReportResult & { error?: string; code?: string } }> {
  const { POST } = await reportRoute();
  const response = await POST(request('/report', { method: 'POST', token, body }), undefined as never);
  return { status: response!.status, body: await response!.json() };
}

async function owner(body: unknown, token: FakeToken = 'fake-token-owner'): Promise<number> {
  const { POST } = await adminRoute();
  const response = await POST(request('/admin', { method: 'POST', token, body }), undefined as never);
  return response!.status;
}

beforeEach(() => {
  vi.resetModules();
  fakes.db = new FakeFirestore();
  fakes.rtdb = new FakeRtdb();
  fakes.auth = fakeAuth();
  vi.useFakeTimers({ toFake: ['Date'], now: NOON });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('GET /api/game/medal-floor', () => {
  it('shows an empty floor for a new site, with today and this week in Japan time', async () => {
    const floor = await summary('hub');
    expect(floor.available).toBe(true);
    expect(floor.feed).toEqual([]);
    expect(floor.day.key).toBe('2026-10-17');
    expect(floor.week.key).toBe('2026-10-12');
    expect(floor.day.won).toEqual([]);
  });

  it('says plainly that it is unavailable, with nothing on it, where the store is not set up', async () => {
    db().failing = new Error('Firebase projectId is required but not found in environment variables');
    const { GET } = await floorRoute();
    const response = await GET(request(''), undefined as never);
    expect(response?.status).toBe(200);
    const floor = (await response!.json()) as FloorSummary;
    expect(floor.available).toBe(false);
    expect(floor.feed).toEqual([]);
  });

  it('does not ask a failing store again for half a minute, and never dials the live database when Firestore is down', async () => {
    db().failing = new Error('fake Firestore: unavailable');
    const dialled: string[] = [];
    const ref = rtdb().ref.bind(rtdb());
    rtdb().ref = (path = '') => {
      dialled.push(path);
      return ref(path);
    };
    const { GET } = await floorRoute();
    expect((await GET(request(''), undefined as never))!.status).toBe(503);
    db().failing = null;
    const readsBefore = db().reads;
    vi.setSystemTime(NOON + 29_000);
    const resting = await GET(request(''), undefined as never);
    expect(resting!.status).toBe(503);
    expect(((await resting!.json()) as FloorSummary).available).toBe(false);
    expect(db().reads).toBe(readsBefore);
    vi.setSystemTime(NOON + 30_000);
    const back = await GET(request(''), undefined as never);
    expect(back!.status).toBe(200);
    expect(((await back!.json()) as FloorSummary).available).toBe(true);
    // The live database was dialled only once Firestore answered.
    expect(dialled).toEqual(['medalFloor/feed']);
  });

  it('gives up a read that hangs, and says the floor cannot be reached', async () => {
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'], now: NOON });
    const ref = rtdb().ref.bind(rtdb());
    rtdb().ref = (path = '') => {
      const real = ref(path);
      real.get = () => new Promise(() => {});
      return real;
    };
    const { GET } = await floorRoute();
    const answer = GET(request(''), undefined as never);
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await answer)!.status).toBe(503);
  });

  it('is cached for a few seconds at the edge, being the same for everybody', async () => {
    const { GET } = await floorRoute();
    const response = await GET(request(''), undefined as never);
    expect(response?.headers.get('cache-control')).toMatch(/public, s-maxage=\d+/);
  });
});

describe('a player’s place on the floor', () => {
  it('is for signed-in accounts only: no token, a bad token and an anonymous guest are all refused', async () => {
    const { GET, PUT } = await meRoute();
    expect((await GET(request('/me'), undefined as never))!.status).toBe(401);
    expect((await GET(request('/me', { token: 'not-a-token' }), undefined as never))!.status).toBe(401);
    expect((await GET(request('/me', { token: 'fake-token-guest' }), undefined as never))!.status).toBe(403);
    expect((await PUT(request('/me', { method: 'PUT', token: 'fake-token-guest', body: { name: null } }), undefined as never))!.status).toBe(403);
    expect(db().docs.size).toBe(0);
  });

  it('starts off: nobody is on the floor until they join', async () => {
    const { GET } = await meRoute();
    const response = await GET(request('/me', { token: 'fake-token-ann' }), undefined as never);
    expect(await response!.json()).toEqual({ joined: false, name: null, tag: null, blocked: false });
  });

  it('joins under four digits, or a chosen name, and the name is checked', async () => {
    const plain = await join('fake-token-ann');
    expect(plain.joined).toBe(true);
    expect(plain.name).toBeNull();
    expect(plain.tag).toMatch(/^\d{4}$/);
    const named = await join('fake-token-ann', '  Lucky   Cat ');
    expect(named).toMatchObject({ joined: true, name: 'Lucky Cat', tag: plain.tag });

    const { PUT } = await meRoute();
    for (const [name, reason] of [
      ['a', 'short'],
      ['someone@example.com', 'contact'],
      ['Admin', 'reserved'],
      ['Player 1234', 'reserved'],
      ['ファック', 'abuse'],
    ] as const) {
      const response = await PUT(request('/me', { method: 'PUT', token: 'fake-token-ann', body: { name } }), undefined as never);
      expect(response!.status).toBe(400);
      expect(await response!.json()).toMatchObject({ code: 'name', reason });
    }
  });

  it('leaving forgets the name and takes the player’s lines and moments off the floor', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 3_000, moment: { medals: 3_000, label: 'seven3' } })).status).toBe(200);
    let floor = await summary();
    expect(floor.feed).toHaveLength(1);
    expect(floor.day.won[0]?.name).toBe('Lucky Cat');

    const { DELETE } = await meRoute();
    const response = await DELETE(request('/me', { method: 'DELETE', token: 'fake-token-ann' }), undefined as never);
    expect(await response!.json()).toMatchObject({ joined: false, name: null });
    floor = await summary();
    expect(floor.feed).toEqual([]);
    expect(floor.day.won).toEqual([]);
    expect(floor.week.won).toEqual([]);
    // Nothing more is counted once they have left.
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 10 })).status).toBe(403);
  });

  it('a new name reaches the player’s lines and moments already on show', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    await report('fake-token-ann', { game: 'slot-machine', won: 3_000, moment: { medals: 3_000, label: 'seven3' } });
    await join('fake-token-ann', 'Night Owl');
    const floor = await summary();
    expect(floor.feed[0]?.name).toBe('Night Owl');
    expect(floor.day.won[0]?.name).toBe('Night Owl');
    expect(floor.week.best['slot-machine']?.[0]?.name).toBe('Night Owl');
  });
});

describe('POST /api/game/medal-floor/report', () => {
  it('is for players on the floor only', async () => {
    expect((await report('nobody', { game: 'slot-machine', won: 5 })).status).toBe(401);
    expect((await report('fake-token-guest', { game: 'slot-machine', won: 5 })).status).toBe(403);
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 5 })).body.code).toBe('not-joined');
  });

  it('counts medals won and the biggest win, on today’s and this week’s boards, with the server’s clock', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    await join('fake-token-ben');
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 450, best: 300, at: 0 })).body).toEqual({ counted: 450, best: true, shown: false });
    await report('fake-token-ben', { game: 'janken', won: 160, moment: { medals: 160, label: 'double-up' } });
    await report('fake-token-ann', { game: 'slot-machine', won: 20, best: 15 });
    const floor = await summary();
    expect(floor.day.won.map((row) => [row.rank, row.name, row.score])).toEqual([
      [1, 'Lucky Cat', 470],
      [2, null, 160],
    ]);
    expect(floor.day.won[1]?.tag).toMatch(/^\d{4}$/);
    // The biggest win is the biggest, not the last.
    expect(floor.day.best['slot-machine']?.[0]).toMatchObject({ rank: 1, score: 300, at: NOON });
    expect(floor.week.best.janken?.[0]?.score).toBe(160);
    // The moment, stamped by the server, not by the "at" the browser sent.
    expect(floor.feed).toEqual([{ id: 1, name: null, tag: floor.day.won[1]?.tag, game: 'janken', label: 'double-up', medals: 160, at: NOON }]);
  });

  it('never says which account a line or a moment is', async () => {
    await join('fake-token-ann', 'Lucky Cat');
    await report('fake-token-ann', { game: 'roulette', won: 3_564, moment: { medals: 3_564 } });
    const text = JSON.stringify(await summary());
    expect(text).not.toContain('test-uid-ann');
    expect(text).not.toContain('uid');
    expect(text).not.toContain('pid');
    // What is public in the Realtime Database carries no account either; the slot's owner is kept apart from it.
    expect(JSON.stringify(rtdb().at('medalFloor'))).not.toContain('test-uid-ann');
  });

  it('takes the account from the token, never from the body', async () => {
    await join('fake-token-ann');
    await join('fake-token-ben', 'Ben');
    await report('fake-token-ann', { game: 'slot-machine', won: 30, uid: 'test-uid-ben', pid: 'whatever' });
    const floor = await summary();
    expect(floor.day.won).toHaveLength(1);
    expect(floor.day.won[0]?.name).toBeNull();
  });

  it('refuses what a machine cannot pay at all', async () => {
    await join('fake-token-ann');
    const refused = [
      { game: 'pachinko', won: 5 },
      { game: 'slot-machine', won: -1 },
      { game: 'slot-machine', won: 2.5 },
      { game: 'slot-machine', won: FLOOR_RULES['slot-machine'].burst + 1 },
      { game: 'slot-machine', won: 10, best: 3_001 },
      { game: 'slot-machine', won: 10, moment: { medals: 2_500, label: 'seven3' } },
      { game: 'janken', won: 10, moment: { medals: 161 } },
      { game: 'janken', won: 10, moment: { medals: 7, label: 'double-up' } },
      { game: 'medal-pusher', moment: { medals: 499, label: 'jackpot' } },
      { game: 'video-poker', won: 4_000, moment: { medals: 3_999, label: 'royal' } },
      { game: 'slot-machine', won: 0 },
      { game: 'slot-machine', won: 10, moment: { medals: 10, label: 'toString' } },
      [],
      'slot-machine',
    ];
    for (const body of refused) expect((await report('fake-token-ann', body)).status, JSON.stringify(body)).toBe(400);
    const { POST } = await reportRoute();
    expect((await POST(request('/report', { method: 'POST', token: 'fake-token-ann', raw: '{"game":' }), undefined as never))!.status).toBe(400);
    expect((await POST(request('/report', { method: 'POST', token: 'fake-token-ann', raw: JSON.stringify({ game: 'slot-machine', won: 1, pad: 'x'.repeat(600) }) }), undefined as never))!.status).toBe(413);
    expect((await summary()).day.won).toEqual([]);
  });

  it('believes medals won no faster than the machine can be played, and sets a report past that aside, biggest win and all', async () => {
    await join('fake-token-ann');
    const rule = FLOOR_RULES.blackjack;
    // A full allowance at first.
    expect((await report('fake-token-ann', { game: 'blackjack', won: rule.burst })).body.counted).toBe(rule.burst);
    // Empty now: a minute later, a minute's worth is believed, and the rest is not counted.
    vi.setSystemTime(NOON + 60_000);
    const over = await report('fake-token-ann', { game: 'blackjack', won: rule.perMinute + 500, best: 160, moment: { medals: 160 } });
    expect(over.status).toBe(200);
    expect(over.body).toEqual({ counted: rule.perMinute, best: false, shown: false });
    const floor = await summary();
    expect(floor.day.won[0]?.score).toBe(rule.burst + rule.perMinute);
    expect(floor.day.best.blackjack).toBeUndefined();
    expect(floor.feed).toEqual([]);
    // Each machine has its own allowance.
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 100 })).body.counted).toBe(100);
  });

  it('counts at most a day’s most medals won for one player, across every machine, and starts again the next day', async () => {
    await join('fake-token-ann');
    let counted = 0;
    let at = NOON;
    for (let index = 0; index < 10 && counted < DAILY_WON_MOST; index += 1) {
      at += 600_000;
      vi.setSystemTime(at);
      counted += (await report('fake-token-ann', { game: 'roulette', won: FLOOR_RULES.roulette.burst })).body.counted;
    }
    expect(counted).toBe(DAILY_WON_MOST);
    expect((await report('fake-token-ann', { game: 'craps', won: 100 })).body.counted).toBe(0);
    vi.setSystemTime(periodAt('day', NOON).end + 1_000);
    expect((await report('fake-token-ann', { game: 'craps', won: 100 })).body.counted).toBe(100);
  });

  it(`refuses a player's reports past ${REPORTS_PER_MINUTE} a minute, and takes them again the next minute`, async () => {
    await join('fake-token-ann');
    vi.setSystemTime(Math.floor(NOON / 60_000) * 60_000 + 1_000);
    for (let index = 0; index < REPORTS_PER_MINUTE; index += 1) expect((await report('fake-token-ann', { game: 'janken', won: 1 })).status).toBe(200);
    const refused = await report('fake-token-ann', { game: 'janken', won: 1 });
    expect(refused.status).toBe(429);
    expect(refused.body.code).toBe('too-often');
    vi.setSystemTime(Date.now() + 60_000);
    expect((await report('fake-token-ann', { game: 'janken', won: 1 })).status).toBe(200);
  });

  it('shows big moments, at most one of a player’s every few seconds, and keeps the last ones in a ring', async () => {
    await join('fake-token-ann');
    // Too small for the floor: counted, not shown.
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 50, moment: { medals: 50 } })).body.shown).toBe(false);
    expect((await report('fake-token-ann', { game: 'medal-pusher', moment: { medals: 523, label: 'jackpot' } })).body.shown).toBe(true);
    // Straight after: counted on the boards, but the floor is not given two of one player's in a row.
    const soon = await report('fake-token-ann', { game: 'slot-machine', won: 3_000, moment: { medals: 3_000, label: 'seven3' } });
    expect(soon.body).toEqual({ counted: 3_000, best: true, shown: false });
    vi.setSystemTime(NOON + FEED_SPACING_MS);
    expect((await report('fake-token-ann', { game: 'slot-machine', won: 3_000, moment: { medals: 3_000, label: 'seven3' } })).body.shown).toBe(true);
    const floor = await summary();
    expect(floor.feed.map((entry) => [entry.game, entry.label, entry.medals])).toEqual([
      ['slot-machine', 'seven3', 3_000],
      ['medal-pusher', 'jackpot', 523],
    ]);
    // A prize the pusher announces before its medals land counts as its biggest win.
    expect(floor.day.best['medal-pusher']?.[0]?.score).toBe(523);

    // The ring keeps the last FEED_SLOTS moments, whoever's.
    for (let index = 0; index < FEED_SLOTS + 3; index += 1) {
      vi.setSystemTime(NOON + FEED_SPACING_MS * (index + 2));
      expect((await report('fake-token-ann', { game: 'video-poker', moment: { medals: 4_000, label: 'royal' } })).body.shown).toBe(true);
    }
    const full = await summary();
    expect(full.feed).toHaveLength(FEED_SLOTS);
    expect(full.feed[0]!.id).toBe(FEED_SLOTS + 5);
    expect((await summary('hub')).feed.length).toBeLessThanOrEqual(12);
  });
});

describe('the owner', () => {
  async function busyFloor() {
    await join('fake-token-ann', 'Lucky Cat');
    await join('fake-token-ben', 'Ben');
    await report('fake-token-ann', { game: 'craps', won: 2_200, moment: { medals: 2_200 } });
    await report('fake-token-ben', { game: 'craps', won: 500, best: 300 });
  }

  it('is the only one who can hide anything or see the hidden', async () => {
    await busyFloor();
    expect(await owner({ action: 'block', pid: '0123456789abcdef' }, 'fake-token-ann')).toBe(403);
    const { GET } = await adminRoute();
    expect((await GET(request('/admin', { token: 'fake-token-ben' }), undefined as never))!.status).toBe(403);
    expect((await GET(request('/admin'), undefined as never))!.status).toBe(401);
  });

  it('hides one line of one board, and can show it again', async () => {
    await busyFloor();
    const { GET } = await adminRoute();
    const seen = (await (await GET(request('/admin', { token: 'fake-token-owner' }), undefined as never))!.json()) as FloorSummary;
    const ann = seen.day.won.find((row) => row.name === 'Lucky Cat');
    expect(ann?.pid).toMatch(/^[0-9a-f]{16}$/);
    const period = periodAt('day', NOON).id;
    expect(await owner({ action: 'hide-line', period, board: 'won', pid: ann!.pid })).toBe(200);
    let floor = await summary();
    expect(floor.day.won.map((row) => [row.rank, row.name])).toEqual([[1, 'Ben']]);
    // Only that board: the same player's biggest win at craps is still up, and this week's lines too.
    expect(floor.day.best.craps?.[0]?.name).toBe('Lucky Cat');
    expect(floor.week.won).toHaveLength(2);
    // The owner still sees it, marked, without a rank.
    const marked = (await (await GET(request('/admin', { token: 'fake-token-owner' }), undefined as never))!.json()) as FloorSummary;
    expect(marked.day.won.map((row) => [row.rank, row.name, row.hidden])).toEqual([
      [0, 'Lucky Cat', true],
      [1, 'Ben', false],
    ]);
    expect(await owner({ action: 'show-line', period, board: 'won', pid: ann!.pid })).toBe(200);
    floor = await summary();
    expect(floor.day.won.map((row) => row.name)).toEqual(['Lucky Cat', 'Ben']);
    expect(await owner({ action: 'hide-line', period, board: 'won', pid: 'fedcba9876543210' })).toBe(404);
    expect(await owner({ action: 'hide-line', period: '../players', board: 'won', pid: ann!.pid })).toBe(400);
  });

  it('takes one moment off the floor', async () => {
    await busyFloor();
    const [moment] = (await summary()).feed;
    expect(await owner({ action: 'hide-moment', id: moment!.id })).toBe(200);
    expect((await summary()).feed).toEqual([]);
    expect(await owner({ action: 'hide-moment', id: moment!.id })).toBe(404);
  });

  it('blocks a player: their lines and moments go, and nothing more of theirs is counted, until unblocked', async () => {
    await busyFloor();
    const { GET } = await adminRoute();
    const seen = (await (await GET(request('/admin', { token: 'fake-token-owner' }), undefined as never))!.json()) as FloorSummary;
    const pid = seen.day.won.find((row) => row.name === 'Lucky Cat')!.pid!;
    expect(await owner({ action: 'block', pid })).toBe(200);
    const floor = await summary();
    expect(floor.day.won.map((row) => row.name)).toEqual(['Ben']);
    expect(floor.day.best.craps?.map((row) => row.name)).toEqual(['Ben']);
    expect(floor.feed).toEqual([]);
    expect((await report('fake-token-ann', { game: 'craps', won: 10 })).body.code).toBe('blocked');
    const { PUT } = await meRoute();
    expect((await PUT(request('/me', { method: 'PUT', token: 'fake-token-ann', body: { name: null } }), undefined as never))!.status).toBe(403);
    expect(await owner({ action: 'unblock', pid })).toBe(200);
    expect((await summary()).day.won.map((row) => row.name)).toEqual(['Lucky Cat', 'Ben']);
  });

  it('refuses actions it does not know', async () => {
    expect(await owner({ action: 'delete-everything' })).toBe(400);
    expect(await owner({ action: 'block', pid: 'test-uid-ann' })).toBe(400);
  });
});

describe('what is kept', () => {
  it('a line carries when its period ends plus two weeks, for a TTL policy to delete it', async () => {
    await join('fake-token-ann');
    await report('fake-token-ann', { game: 'janken', won: 3 });
    const lines = [...db().docs.entries()].filter(([path]) => path.startsWith('medal_floor_periods/'));
    expect(lines).toHaveLength(2);
    for (const [path, data] of lines) {
      const kind = path.includes('/day-') ? 'day' : 'week';
      expect((data.expireAt as Date).getTime()).toBe(periodAt(kind, NOON).end + 14 * 86_400_000);
    }
  });

  it('leaving deletes the last period’s lines too', async () => {
    await join('fake-token-ann');
    vi.setSystemTime(periodBefore('day', NOON).start + 3_600_000);
    await report('fake-token-ann', { game: 'janken', won: 3 });
    vi.setSystemTime(NOON);
    const { DELETE } = await meRoute();
    await DELETE(request('/me', { method: 'DELETE', token: 'fake-token-ann' }), undefined as never);
    expect([...db().docs.keys()].filter((path) => path.startsWith('medal_floor_periods/'))).toEqual([]);
  });
});

describe('a report the floor has counted', () => {
  it('still succeeds when its moment cannot be put on show, so the browser does not send the same medals twice', async () => {
    await join('fake-token-ann');
    const failing = rtdb();
    const ref = failing.ref.bind(failing);
    failing.ref = (path = '') => {
      const real = ref(path);
      if (path.endsWith('/seq')) real.transaction = async () => Promise.reject(new Error('fake RTDB: unreachable'));
      return real;
    };
    const answer = await report('fake-token-ann', { game: 'slot-machine', won: 3_000, moment: { medals: 3_000, label: 'seven3' } });
    expect(answer.status).toBe(200);
    expect(answer.body).toEqual({ counted: 3_000, best: true, shown: false });
    failing.ref = ref;
    expect((await summary()).day.won[0]?.score).toBe(3_000);
  });
});
