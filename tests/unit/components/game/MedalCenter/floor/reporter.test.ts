import { describe, expect, it } from 'vitest';

import { FLUSH_MS, QUICKEST_MS, createFloorReporter, type FloorAccount } from '@/components/game/MedalCenter/floor/reporter';
import { FLOOR_RULES } from '@/lib/medalFloor/games';

// The one function every machine calls when it pays. What it sends, when, and as whom, against a fake clock, a fake
// network and made-up accounts: nothing here reaches a real server or a real account.

interface Sent {
  url: string;
  body: Record<string, unknown> | null;
  token: string | null;
  keepalive: boolean;
}

function harness(options: { joined?: boolean | null; status?: () => number; due?: number; reply?: (body: Record<string, unknown> | null) => unknown } = {}) {
  let now = 1_000_000;
  let signedIn: FloorAccount | null = null;
  const sent: Sent[] = [];
  const timers: { at: number; run: () => void; id: number }[] = [];
  let nextId = 1;
  let meAnswer = options.joined ?? null;
  const due: string[] = [];
  const reporter = createFloorReporter({
    account: () => signedIn,
    fetch: (async (url: string, init?: RequestInit) => {
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization ?? null;
      sent.push({ url, body: init?.body ? JSON.parse(String(init.body)) : null, token: auth ? auth.slice(7) : null, keepalive: init?.keepalive === true });
      if (url.endsWith('/me')) return Response.json({ joined: meAnswer === true, name: null, tag: '1234', blocked: false, ...(options.due ? { due: options.due } : {}) }, { status: meAnswer === null ? 503 : 200 });
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      return Response.json(options.reply?.(body) ?? { counted: 0, best: false, shown: false }, { status: options.status?.() ?? 200 });
    }) as typeof fetch,
    jackpot: (uid) => due.push(uid),
    now: () => now,
    later: (run, ms) => {
      const id = nextId++;
      timers.push({ at: now + ms, run, id });
      return id;
    },
    cancel: (handle) => {
      const index = timers.findIndex((timer) => timer.id === handle);
      if (index >= 0) timers.splice(index, 1);
    },
  });
  const settle = async () => {
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return {
    reporter,
    sent,
    due,
    reports: () => sent.filter((call) => call.url.endsWith('/report')),
    signIn(uid: string | null) {
      signedIn = uid ? { uid, token: async () => `token-of-${uid}` } : null;
    },
    answerMe(joined: boolean | null) {
      meAnswer = joined;
    },
    /** Lets what is under way finish, moves the clock on, and runs every timer that comes due, as it does. */
    async pass(ms: number) {
      await settle();
      now += ms;
      for (;;) {
        await settle();
        const due = timers.filter((timer) => timer.at <= now).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers.splice(timers.indexOf(due), 1);
        due.run();
      }
    },
    settle,
  };
}

describe('the floor reporter', () => {
  it('sends nothing at all for a guest', async () => {
    const h = harness();
    h.reporter.report('slot-machine', { won: 3_000, prize: { medals: 3_000, label: 'seven3' } });
    await h.pass(FLUSH_MS * 2);
    expect(h.sent).toEqual([]);
    expect(h.reporter.waiting('slot-machine')).toBeNull();
  });

  it('asks once whether a signed-in player is on the floor, and drops their wins if not', async () => {
    const h = harness({ joined: false });
    h.signIn('test-uid-ann');
    h.reporter.report('slot-machine', { won: 30 });
    h.reporter.report('slot-machine', { won: 40 });
    await h.pass(FLUSH_MS * 2);
    h.reporter.report('slot-machine', { won: 3_000, prize: { medals: 3_000, label: 'seven3' } });
    await h.pass(FLUSH_MS * 2);
    expect(h.sent.map((call) => call.url)).toEqual(['/api/game/medal-floor/me']);
    expect(h.sent[0]?.token).toBe('token-of-test-uid-ann');
    expect(h.reporter.waiting('slot-machine')).toBeNull();
  });

  it('adds up small wins and sends them about once a minute, with the biggest among them', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    h.reporter.report('slot-machine', { won: 6, prize: { medals: 6 } });
    h.reporter.report('slot-machine', { won: 50, prize: { medals: 50 } });
    h.reporter.report('slot-machine', { won: 2, prize: { medals: 2 } });
    await h.pass(FLUSH_MS - 1);
    expect(h.reports()).toEqual([]);
    await h.pass(1);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'slot-machine', won: 58, best: 50 }]);
    expect(h.reports()[0]?.token).toBe('token-of-test-uid-ann');
  });

  it('sends a big win at once, but one machine no oftener than every few seconds', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    h.reporter.report('janken', { won: 1, prize: { medals: 1 } });
    await h.settle();
    h.reporter.report('janken', { won: 160, prize: { medals: 160, label: 'double-up' } });
    await h.pass(0);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'janken', won: 161, best: 160, moment: { medals: 160, label: 'double-up' } }]);
    h.reporter.report('janken', { won: 80, prize: { medals: 80, label: 'double-up' } });
    await h.pass(QUICKEST_MS - 1);
    expect(h.reports()).toHaveLength(1);
    await h.pass(1);
    expect(h.reports()[1]?.body).toEqual({ game: 'janken', won: 80, best: 80, moment: { medals: 80, label: 'double-up' } });
  });

  it('tells a prize before its medals land, and the medals as they do', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    h.reporter.report('medal-pusher', { prize: { medals: 523, label: 'jackpot' } });
    await h.pass(0);
    h.reporter.report('medal-pusher', { won: 4 });
    h.reporter.report('medal-pusher', { won: 9 });
    await h.pass(FLUSH_MS);
    expect(h.reports().map((call) => call.body)).toEqual([
      { game: 'medal-pusher', won: 0, best: 523, moment: { medals: 523, label: 'jackpot' } },
      { game: 'medal-pusher', won: 13 },
    ]);
  });

  it('keeps what the floor would refuse from ever being sent', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    // A name the floor does not know for that amount is left off; the win still counts.
    h.reporter.report('slot-machine', { won: 15, prize: { medals: 15, label: 'cherry3' } });
    // More than the machine can pay at all is no prize.
    h.reporter.report('slot-machine', { won: 0, prize: { medals: 9_999 } });
    h.reporter.report('slot-machine', { won: -5 });
    h.reporter.report('pachislot' as never, { won: 5 });
    await h.pass(FLUSH_MS);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'slot-machine', won: 15, best: 15 }]);
    // Never more medals won in one report than the floor believes at once.
    const most = FLOOR_RULES.blackjack.burst;
    h.reporter.report('blackjack', { won: most * 3 });
    await h.pass(0);
    expect(h.reports()[1]?.body).toEqual({ game: 'blackjack', won: most });
  });

  it('keeps what it could not send and tries again; stops for good when the floor says the player is not on it', async () => {
    let status = 429;
    const h = harness({ joined: true, status: () => status });
    h.signIn('test-uid-ann');
    h.reporter.report('roulette', { won: 360, prize: { medals: 360 } });
    await h.pass(0);
    expect(h.reports()).toHaveLength(1);
    expect(h.reporter.waiting('roulette')).toEqual({ won: 360, played: 0, best: 360, moment: { medals: 360 } });
    status = 200;
    await h.pass(FLUSH_MS);
    expect(h.reports()).toHaveLength(2);
    expect(h.reports()[1]?.body).toEqual({ game: 'roulette', won: 360, best: 360, moment: { medals: 360 } });
    status = 403;
    h.reporter.report('roulette', { won: 400, prize: { medals: 400 } });
    await h.pass(0);
    h.reporter.report('roulette', { won: 400, prize: { medals: 400 } });
    await h.pass(FLUSH_MS * 3);
    expect(h.reports()).toHaveLength(3);
  });

  it('never sends one player’s wins as another’s', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    h.reporter.report('craps', { won: 40 });
    // Ann signs out and Ben signs in before the minute is up: Ann's wins are dropped, not sent with Ben's token.
    h.signIn('test-uid-ben');
    h.reporter.report('craps', { won: 7 });
    await h.pass(FLUSH_MS * 2);
    const reports = h.reports();
    expect(reports.every((call) => call.token === 'token-of-test-uid-ben')).toBe(true);
    expect(reports.map((call) => call.body)).toEqual([{ game: 'craps', won: 7 }]);
  });

  it('sends what is left as the page goes, with the token it last had, and only for the player still signed in', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    h.reporter.report('baccarat', { won: 200, prize: { medals: 200 } });
    await h.pass(0);
    h.reporter.report('baccarat', { won: 12 });
    h.reporter.leaving();
    const last = h.reports().at(-1)!;
    expect(last).toMatchObject({ keepalive: true, token: 'token-of-test-uid-ann', body: { game: 'baccarat', won: 12 } });
    // Signed out: nothing is sent with the token that was theirs.
    h.reporter.report('baccarat', { won: 3 });
    h.signIn(null);
    const before = h.reports().length;
    h.reporter.leaving();
    expect(h.reports()).toHaveLength(before);
  });

  it('starts sending at once when the player joins on this page or another tab, and stops when they leave', async () => {
    const h = harness({ joined: false });
    h.signIn('test-uid-ann');
    h.reporter.report('video-poker', { won: 5 });
    await h.settle();
    h.reporter.told('test-uid-ann', true);
    h.reporter.report('video-poker', { won: 4_000, prize: { medals: 4_000, label: 'royal' } });
    await h.pass(0);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'video-poker', won: 4_000, best: 4_000, moment: { medals: 4_000, label: 'royal' } }]);
    h.reporter.told('test-uid-ann', false);
    h.reporter.report('video-poker', { won: 25 });
    await h.pass(FLUSH_MS * 2);
    expect(h.reports()).toHaveLength(1);
  });

  it('asks again later when it could not find out, and keeps the wins meanwhile', async () => {
    const h = harness({ joined: null });
    h.signIn('test-uid-ann');
    h.reporter.report('three-card-poker', { won: 30 });
    await h.settle();
    expect(h.sent.filter((call) => call.url.endsWith('/me'))).toHaveLength(1);
    h.answerMe(true);
    h.reporter.report('three-card-poker', { won: 10 });
    await h.settle();
    expect(h.sent.filter((call) => call.url.endsWith('/me'))).toHaveLength(1);
    await h.pass(60_000);
    h.reporter.report('three-card-poker', { won: 5 });
    await h.pass(0);
    expect(h.sent.filter((call) => call.url.endsWith('/me'))).toHaveLength(2);
    // Small wins, so they go with the minute's.
    expect(h.reports()).toEqual([]);
    await h.pass(FLUSH_MS);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'three-card-poker', won: 45 }]);
  });

  it('adds up the medals played, sends them with the minute’s wins, and never more of them at once than the floor believes', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    for (let spin = 0; spin < 40; spin += 1) h.reporter.report('slot-machine', { played: 3 });
    h.reporter.report('slot-machine', { won: 30, prize: { medals: 30 } });
    await h.pass(FLUSH_MS);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'slot-machine', won: 30, played: 120, best: 30 }]);
    // A burst of play half as big as the floor believes at once goes now, and the rest is never more than it believes.
    const rule = FLOOR_RULES['medal-pusher'];
    h.reporter.report('medal-pusher', { played: rule.playBurst * 3 });
    await h.pass(0);
    expect(h.reports().at(-1)?.body).toEqual({ game: 'medal-pusher', won: 0, played: rule.playBurst });
    expect(h.reporter.waiting('medal-pusher')).toBeNull();
    // Nothing that is not a count of medals is sent.
    h.reporter.report('slot-machine', { played: Number.NaN });
    h.reporter.report('slot-machine', { played: -3 });
    await h.pass(FLUSH_MS);
    expect(h.reports()).toHaveLength(2);
  });

  it('sends no medals played from a table that is not linked to the floor jackpot, only its wins', async () => {
    const h = harness({ joined: true });
    h.signIn('test-uid-ann');
    h.reporter.report('craps', { played: 400 });
    h.reporter.report('blackjack', { played: 10 });
    await h.pass(FLUSH_MS);
    expect(h.reports()).toEqual([]);
    h.reporter.report('craps', { won: 60, played: 30, prize: { medals: 60 } });
    await h.pass(FLUSH_MS);
    expect(h.reports().map((call) => call.body)).toEqual([{ game: 'craps', won: 60, best: 60 }]);
  });

  it('sends a guest’s medals played nowhere', async () => {
    const h = harness();
    h.reporter.report('roulette', { played: 500 });
    await h.pass(FLUSH_MS * 2);
    expect(h.sent).toEqual([]);
  });

  it('tells the page’s payer when a report won the floor jackpot, or the floor says one is waiting', async () => {
    const h = harness({ joined: true, reply: (body) => (body?.played ? { counted: 0, best: false, shown: false, played: body.played, jackpot: { id: '20261017-a1b2c3d4', medals: 3_000, at: 1 } } : undefined) });
    h.signIn('test-uid-ann');
    h.reporter.report('slot-machine', { won: 30 });
    await h.pass(FLUSH_MS);
    expect(h.due).toEqual([]);
    h.reporter.report('slot-machine', { played: 3 });
    await h.pass(FLUSH_MS);
    expect(h.due).toEqual(['test-uid-ann']);
    // A player who is not on the floor any more still has their win waiting: it is theirs.
    const left = harness({ joined: false, due: 1 });
    left.signIn('test-uid-ben');
    left.reporter.report('janken', { played: 1 });
    await left.pass(0);
    expect(left.due).toEqual(['test-uid-ben']);
    expect(left.reports()).toEqual([]);
  });
});
