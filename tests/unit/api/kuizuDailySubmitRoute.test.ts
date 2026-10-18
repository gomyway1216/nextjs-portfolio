import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultDailyName, maxDailyScore } from '@/lib/kuizuDailyResult';
import { calculatePoints } from '@/types/kuizu';
import { FakeFirestore } from './medalFloor/fakeFirebase';

// POST /api/kuizu/daily/submit against an in-memory Firestore and made-up accounts.
// The leaderboard it writes to is public: what matters is what reaches it, and what is refused.

const fakes = vi.hoisted(() => ({
  db: null as unknown,
  // Each token stands for an account that exists only in these tests. The emails are here to
  // show that nothing of them reaches the board.
  accounts: {
    'fake-token-kai': { uid: 'test-uid-kai', email: 'kai.private.inbox@example.test', firebase: { sign_in_provider: 'password' } },
    'fake-token-mio': { uid: 'test-uid-mio', email: 'mio.secret@example.test', firebase: { sign_in_provider: 'google.com' } },
    'fake-token-guest': { uid: 'test-uid-guest', firebase: { sign_in_provider: 'anonymous' } },
  } as Record<string, { uid: string; email?: string }>,
}));

vi.mock('@/lib/firebase-admin', () => ({
  getFirestore: () => fakes.db,
  getServerTimestamp: () => 'fake-server-timestamp',
  getAuth: () => ({
    verifyIdToken: async (token: string) => {
      const account = fakes.accounts[token];
      if (!account) throw new Error('fake auth: not a token of these tests');
      return structuredClone(account);
    },
  }),
}));
vi.mock('@/app/api/_lib/withActivityLog', () => ({
  withActivityLog: (_action: string, handler: unknown) => handler,
}));

type Token = 'fake-token-kai' | 'fake-token-mio' | 'fake-token-guest';

const db = () => fakes.db as FakeFirestore;

// 2026-10-17 06:00 UTC: today's challenge is daily_20261017, yesterday's daily_20261016.
const NOW = Date.UTC(2026, 9, 17, 6, 0, 0);
const TODAY = 'daily_20261017';
const YESTERDAY = 'daily_20261016';
const QUESTIONS = 10;

const LEADERBOARD = 'kuizu_daily_leaderboard';
const STATS = 'kuizu_user_stats';

function seedChallenge(id: string, questions = QUESTIONS): void {
  db().docs.set(`kuizu_daily_challenges/${id}`, {
    date: `${id.slice(6, 10)}-${id.slice(10, 12)}-${id.slice(12, 14)}`,
    quizId: id,
    questionCount: questions,
    questions: Array.from({ length: questions }, (_, i) => ({ id: `q${i}` })),
  });
}

/** What the player sends after answering: right or wrong, and how long each answer took. Scored as SoloQuizPlayer scores it. */
function play(answers: Array<[correct: boolean, ms: number]>) {
  let streak = 0;
  let score = 0;
  for (const [correct, ms] of answers) {
    streak = correct ? streak + 1 : 0;
    score += calculatePoints(correct, ms, 30_000, streak);
  }
  const right = answers.filter(([correct]) => correct).length;
  // Each answer is shown for 1.5 s before the next question.
  const timeTaken = answers.reduce((sum, [, ms]) => sum + ms + 1_500, 0);
  return { score, accuracy: (right / answers.length) * 100, timeTaken };
}

const allRight = (ms = 2_000) => play(Array.from({ length: QUESTIONS }, () => [true, ms] as [boolean, number]));

function request(init: { token?: Token | string; body?: unknown; raw?: string; ip?: string } = {}): NextRequest {
  const headers: Record<string, string> = { 'x-real-ip': init.ip ?? '198.51.100.7', 'content-type': 'application/json' };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const body = init.raw ?? JSON.stringify(init.body ?? {});
  return new NextRequest('https://kuizu.example.test/api/kuizu/daily/submit', { method: 'POST', headers, body });
}

async function submit(token: Token | null, body: unknown, ip?: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import('@/app/api/kuizu/daily/submit/route');
  const response = await POST(request({ token: token ?? undefined, body, ip }), undefined as never);
  return { status: response!.status, body: (await response!.json()) as Record<string, unknown> };
}

const entries = () => [...db().docs.entries()].filter(([path]) => path.startsWith(`${LEADERBOARD}/`)).map(([, data]) => data);

beforeEach(() => {
  vi.resetModules(); // a fresh rate limiter for every test
  fakes.db = new FakeFirestore();
  seedChallenge(TODAY);
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('POST /api/kuizu/daily/submit', () => {
  it('puts a real result on the board under the name the player has, and counts it in their stats', async () => {
    const result = play([[true, 3_000], [true, 4_000], [false, 30_000], [true, 2_500], [true, 1_200], [true, 9_000], [true, 800], [false, 6_000], [true, 5_000], [true, 2_000]]);
    const { status, body } = await submit('fake-token-kai', { challengeId: TODAY, userId: 'test-uid-kai', displayName: 'Kai', ...result });
    expect(status).toBe(200);
    expect(body.displayName).toBe('Kai');
    expect(entries()).toEqual([
      { challengeId: TODAY, userId: 'test-uid-kai', displayName: 'Kai', score: result.score, accuracy: 80, timeTaken: result.timeTaken, completedAt: 'fake-server-timestamp' },
    ]);
    expect(db().read(`${STATS}/test-uid-kai`)).toMatchObject({ dailyChallengesCompleted: 1, totalPoints: result.score });
  });

  it.each(['Kai', 'みお', '山田 太郎', 'Taro Yamada', 'quiz_fan-7'])('keeps a name that passes the checks: %s', async (name) => {
    const { status } = await submit('fake-token-kai', { challengeId: TODAY, displayName: name, ...allRight() });
    expect(status).toBe(200);
    expect(entries()[0].displayName).toBe(name);
  });

  it.each([
    ['empty', ''],
    ['missing', undefined],
    ['null', null],
    ['not text', 1234],
  ])('never publishes the email prefix when the name is %s, and shows "Player" and four digits instead', async (_case, displayName) => {
    const { status, body } = await submit('fake-token-kai', { challengeId: TODAY, displayName, ...allRight() });
    expect(status).toBe(200);
    const stored = JSON.stringify([...db().docs.values()]);
    expect(stored).not.toContain('kai.private.inbox');
    expect(stored).not.toContain('@');
    expect(entries()[0].displayName).toMatch(/^Player \d{4}$/);
    expect(body.displayName).toBe(defaultDailyName('test-uid-kai'));
  });

  it('gives a player the same default name every day, and other players their own', async () => {
    seedChallenge(YESTERDAY);
    expect((await submit('fake-token-kai', { challengeId: YESTERDAY, displayName: '', ...allRight() })).status).toBe(200);
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: '', ...allRight() })).status).toBe(200);
    expect((await submit('fake-token-mio', { challengeId: TODAY, displayName: '', ...allRight() })).status).toBe(200);
    const [yesterday, today, other] = entries().map((entry) => entry.displayName);
    expect(today).toBe(yesterday);
    expect(today).toBe(defaultDailyName('test-uid-kai'));
    expect(other).toBe(defaultDailyName('test-uid-mio'));
    expect(other).not.toBe(today);
  });

  it.each([
    ['an email', 'kai@example.test'],
    ['an email prefix with a domain', 'kai.private.inbox.com'],
    ['a link', 'https://spam.example'],
    ['a phone number', '090 1234 5678'],
    ['the site owner', 'Yudai'],
    ['staff', 'Admin'],
    ['somebody else\'s default name', 'Player 0042'],
    ['abuse', 'fuck you'],
    ['abuse in Japanese', 'しね'],
    ['markup', '<b>Kai</b>'],
    ['one character', 'K'],
    ['too long', 'A Very Long Display Name'],
  ])('shows the default name instead of %s', async (_case, displayName) => {
    const { status } = await submit('fake-token-kai', { challengeId: TODAY, displayName, ...allRight() });
    expect(status).toBe(200);
    expect(entries()[0].displayName).toBe(defaultDailyName('test-uid-kai'));
  });

  it('takes the best result the challenge can produce, and the worst', async () => {
    // (1,000 + 500 time bonus) × the streak multiplier: 1.0, 1.2, 1.5, then 2.0 for the other seven.
    expect(maxDailyScore(QUESTIONS)).toBe(1_500 + 1_800 + 2_250 + 7 * 3_000);
    const best = play(Array.from({ length: QUESTIONS }, () => [true, 0] as [boolean, number]));
    expect(best.score).toBe(maxDailyScore(QUESTIONS));
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...best })).status).toBe(200);
    const worst = play(Array.from({ length: QUESTIONS }, () => [false, 30_000] as [boolean, number]));
    expect(worst).toMatchObject({ score: 0, accuracy: 0 });
    expect((await submit('fake-token-mio', { challengeId: TODAY, displayName: 'Mio', ...worst })).status).toBe(200);
    expect(entries().map((entry) => entry.score)).toEqual([maxDailyScore(QUESTIONS), 0]);
  });

  it.each([
    ['more points than ten instant right answers earn', { score: maxDailyScore(10) + 1, accuracy: 100 }, 'score'],
    ['a perfect accuracy with fewer points than ten right answers earn', { score: 9_999, accuracy: 100 }, 'score'],
    ['points with no right answers', { score: 1_000, accuracy: 0 }, 'score'],
    ['more points than three right answers can earn', { score: maxDailyScore(3) + 1, accuracy: 30 }, 'score'],
    ['a fractional score', { score: 1_500.5, accuracy: 10 }, 'score'],
    ['a score sent as text', { score: '26550', accuracy: 100 }, 'score'],
    ['a negative score', { score: -1, accuracy: 0 }, 'score'],
    ['an accuracy that is not a whole number of answers', { score: 10_000, accuracy: 75 }, 'accuracy'],
    ['an accuracy above 100%', { score: 26_550, accuracy: 120 }, 'accuracy'],
    ['a negative accuracy', { score: 0, accuracy: -10 }, 'accuracy'],
    ['no accuracy', { score: 0, accuracy: null }, 'accuracy'],
    ['a time quicker than the answers can be shown', { timeTaken: 5_000 }, 'time'],
    ['a negative time', { timeTaken: -1 }, 'time'],
    ['a time longer than a day', { timeTaken: 24 * 60 * 60 * 1000 + 1 }, 'time'],
    ['a time sent as text', { timeTaken: '60000' }, 'time'],
  ])('refuses %s, and stores nothing', async (_case, claim, reason) => {
    const { status, body } = await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight(), ...claim });
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: 'result', reason });
    expect(entries()).toEqual([]);
    expect(db().read(`${STATS}/test-uid-kai`)).toBeUndefined();
  });

  it('reads the question count from the challenge', async () => {
    seedChallenge(TODAY, 5);
    // 100% of ten questions is not possible from five.
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() })).body).toMatchObject({ reason: 'score' });
    const five = play(Array.from({ length: 5 }, () => [true, 1_000] as [boolean, number]));
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...five })).status).toBe(200);
  });

  it('keeps one entry per player per challenge', async () => {
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() })).status).toBe(200);
    const again = await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight(1_000) });
    expect(again.status).toBe(400);
    expect(again.body.error).toMatch(/already submitted/);
    expect(entries()).toHaveLength(1);
    expect(db().read(`${STATS}/test-uid-kai`)).toMatchObject({ dailyChallengesCompleted: 1, totalPoints: allRight().score });
  });

  it('takes yesterday\'s challenge, for a game begun before midnight, but no other day\'s', async () => {
    seedChallenge(YESTERDAY);
    seedChallenge('daily_20261015');
    seedChallenge('daily_20261018');
    expect((await submit('fake-token-kai', { challengeId: YESTERDAY, displayName: 'Kai', ...allRight() })).status).toBe(200);
    expect((await submit('fake-token-mio', { challengeId: 'daily_20261015', displayName: 'Mio', ...allRight() })).status).toBe(400);
    expect((await submit('fake-token-mio', { challengeId: 'daily_20261018', displayName: 'Mio', ...allRight() })).status).toBe(400);
    expect((await submit('fake-token-mio', { challengeId: `${TODAY}/x/y`, displayName: 'Mio', ...allRight() })).status).toBe(400);
    expect(entries()).toHaveLength(1);
  });

  it('says so when today\'s challenge was never made', async () => {
    db().docs.clear();
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() })).status).toBe(404);
    expect(entries()).toEqual([]);
  });

  it('turns away a request without an account', async () => {
    expect((await submit(null, { challengeId: TODAY, displayName: 'Kai', ...allRight() })).status).toBe(401);
    expect(entries()).toEqual([]);
  });

  it('takes a guest\'s result under the default name', async () => {
    const { status } = await submit('fake-token-guest', { challengeId: TODAY, displayName: '', ...allRight() });
    expect(status).toBe(200);
    expect(entries()[0]).toMatchObject({ userId: 'test-uid-guest', displayName: defaultDailyName('test-uid-guest') });
  });

  it('refuses a body that is not JSON, not an object, missing fields, or too large', async () => {
    const { POST } = await import('@/app/api/kuizu/daily/submit/route');
    const status = async (raw: string) => (await POST(request({ token: 'fake-token-kai', raw }), undefined as never))!.status;
    expect(await status('{"challengeId":')).toBe(400);
    expect(await status('[1,2,3]')).toBe(400);
    expect(await status(JSON.stringify({ challengeId: TODAY, displayName: 'Kai' }))).toBe(400);
    expect(await status(JSON.stringify({ challengeId: TODAY, displayName: 'Kai', ...allRight(), pad: 'x'.repeat(3_000) }))).toBe(413);
    expect(entries()).toEqual([]);
  });

  it('limits how often one player can send, and lets them in again after ten minutes', async () => {
    const tooFast = { challengeId: TODAY, displayName: 'Kai', ...allRight(), timeTaken: 1 };
    for (let i = 0; i < 5; i += 1) expect((await submit('fake-token-kai', tooFast)).status).toBe(400);
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() })).status).toBe(429);
    // Another player on the same address is not held up.
    expect((await submit('fake-token-mio', { challengeId: TODAY, displayName: 'Mio', ...allRight() })).status).toBe(200);
    vi.setSystemTime(NOW + 10 * 60 * 1000);
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() })).status).toBe(200);
    expect(entries()).toHaveLength(2);
  });

  it('limits how often one address can send, before any account is checked', async () => {
    for (let i = 0; i < 20; i += 1) expect((await submit(null, {}, '203.0.113.9')).status).toBe(401);
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() }, '203.0.113.9')).status).toBe(429);
    expect((await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() }, '203.0.113.10')).status).toBe(200);
  });

  it('answers a store failure with a plain error', async () => {
    db().failing = new Error('fake Firestore: unavailable');
    const { status, body } = await submit('fake-token-kai', { challengeId: TODAY, displayName: 'Kai', ...allRight() });
    expect(status).toBe(500);
    expect(body).toEqual({ error: 'Failed to submit daily challenge result' });
  });
});
