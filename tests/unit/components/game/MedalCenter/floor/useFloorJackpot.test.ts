import { describe, expect, it } from 'vitest';

import { JACKPOT_START, nextJackpot, type FloorJackpotState, type JackpotHeard } from '@/components/game/MedalCenter/floor/useFloorJackpot';
import type { FloorJackpotView, JackpotWinShown } from '@/lib/medalFloor/jackpot';

// What a page shows of the floor jackpot as it hears of it from the route and from the live mirror, in any order: the
// later of the two by the pool's version, and live only while the mirror holds that. Nothing here is fetched or
// listened to.

const NOW = 1_800_000_000_000;
const win = (tag: string, medals: number, at: number): JackpotWinShown => ({ name: null, tag, game: 'slot-machine', medals, at });
const route = (amount: number, v: number, wins: JackpotWinShown[] = [], available = true): JackpotHeard => ({
  kind: 'route',
  view: { now: NOW, available, amount, seq: 2, v, wins } satisfies FloorJackpotView,
  at: NOW - 250,
});
/** The mirror as the server writes it (store.ts `mirrorPool`). */
const mirror = (amount: number, v: number, last?: JackpotWinShown): JackpotHeard => ({
  kind: 'live',
  value: { amount, seq: 2, v, at: NOW, ...(last ? { last: { tag: last.tag, game: last.game, medals: last.medals, at: last.at } } : {}) },
});
const hear = (...heard: JackpotHeard[]): FloorJackpotState => heard.reduce(nextJackpot, JACKPOT_START);

describe('the floor jackpot on a page', () => {
  it('shows the route’s pool and keeps asking it while the mirror has nothing yet, as on a site no report has fed', () => {
    // The database answers with nothing at the path: the node does not exist until the first report.
    const state = hear(route(1_000, 0), { kind: 'live', value: null });
    expect(state).toMatchObject({ amount: 1_000, v: 0, live: false, unavailable: false });
    // In whichever order they come.
    expect(hear({ kind: 'live', value: null }, route(1_000, 0))).toMatchObject({ amount: 1_000, live: false });
    // Something at the path that is not a pool is no pool either.
    expect(hear(route(1_000, 0), { kind: 'live', value: { amount: 'lots' } })).toMatchObject({ amount: 1_000, live: false });
  });

  it('goes live with the mirror once it holds the pool as the route said it, or later', () => {
    expect(hear(route(1_000, 3), mirror(1_000, 3))).toMatchObject({ amount: 1_000, v: 3, live: true });
    expect(hear(route(1_000, 3), mirror(1_004, 4))).toMatchObject({ amount: 1_004, v: 4, live: true });
    // The route answering again with what the mirror said keeps it live.
    expect(hear(mirror(1_004, 4), route(1_004, 4))).toMatchObject({ amount: 1_004, live: true });
  });

  it('does not stay behind with a mirror the server could not write: the route’s later pool is shown, and it is not live', () => {
    // The mirror heard first, then the route, which is later: the mirror has fallen behind.
    const behind = hear(mirror(2_950, 7), route(1_000, 8));
    expect(behind).toMatchObject({ amount: 1_000, seq: 2, v: 8, live: false });
    // The mirror saying its old pool again changes nothing, and it is still not live.
    expect(nextJackpot(behind, mirror(2_950, 7))).toMatchObject({ amount: 1_000, v: 8, live: false });
    // The route heard first, then the stale mirror: the same.
    expect(hear(route(1_000, 8), mirror(2_950, 7))).toMatchObject({ amount: 1_000, v: 8, live: false });
    // Once the server writes it again it catches up, and is live.
    expect(nextJackpot(behind, mirror(1_003, 9))).toMatchObject({ amount: 1_003, v: 9, live: true });
  });

  it('keeps the later pool when the route’s answer is a few seconds old (it is cached), and takes its list of wins', () => {
    const wins = [win('0042', 2_431, NOW - 60_000)];
    const state = hear(mirror(1_010, 12), route(1_002, 11, wins));
    expect(state).toMatchObject({ amount: 1_010, v: 12, live: true, wins });
  });

  it('stops being live when the mirror goes, or the database drops the listener, and the route is asked again', () => {
    const live = hear(route(1_000, 3), mirror(1_001, 4));
    expect(nextJackpot(live, { kind: 'live', value: null })).toMatchObject({ amount: 1_001, live: false });
    expect(nextJackpot(live, { kind: 'lost' })).toMatchObject({ amount: 1_001, live: false });
  });

  it('puts a new win heard live on top of the last wins, once', () => {
    const before = [win('0042', 2_431, NOW - 86_400_000)];
    const hit = win('1234', 2_503, NOW - 1_000);
    const state = hear(route(1_000, 3, before), mirror(1_000, 4, hit), mirror(1_000, 4, hit));
    expect(state.wins).toEqual([hit, ...before]);
  });

  it('says it cannot be reached only while nothing is known, and keeps what it has otherwise', () => {
    expect(hear({ kind: 'failed' })).toMatchObject({ amount: null, unavailable: true });
    expect(hear(route(0, 0, [], false))).toMatchObject({ amount: null, unavailable: true });
    expect(hear(route(1_000, 3), { kind: 'failed' })).toMatchObject({ amount: 1_000, unavailable: false });
    expect(hear(route(1_000, 3), route(0, 0, [], false))).toMatchObject({ amount: 1_000, unavailable: false });
    // Heard live after all: known.
    expect(hear({ kind: 'failed' }, mirror(1_000, 1))).toMatchObject({ amount: 1_000, unavailable: false, live: true });
  });

  it('works the server’s clock out from the route’s answer', () => {
    expect(hear(route(1_000, 0)).skew).toBe(250);
  });
});
