import { describe, expect, it } from 'vitest';

import { PAY_RULES, analyzeMachine, resolveSpin, type PayRuleId } from '@/components/game/SlotMachine/engine';
import {
  EMPTY_LOG,
  MIN_SPAN,
  MIN_SPINS,
  POINT_LIMIT,
  chartScale,
  expectedHits,
  expectedNet,
  recordSpin,
  type SessionLog,
} from '@/components/game/SlotMachine/sessionLog';

const ODDS = analyzeMachine();
const rule = (id: PayRuleId) => PAY_RULES.find((r) => r.id === id)!;
const lose = (bet = 1) => ({ bet, win: 0, rule: null });
const win = (id: PayRuleId, bet = 1) => ({ bet, win: rule(id).pays * bet, rule: rule(id) });

describe('recordSpin', () => {
  it('starts at nothing and adds each spin to the net medals, the medals bet and the line that hit', () => {
    expect(EMPTY_LOG.points).toEqual([{ spins: 0, wagered: 0, net: 0 }]);
    expect(Object.keys(EMPTY_LOG.hits)).toEqual(PAY_RULES.map((r) => r.id));

    let log = recordSpin(EMPTY_LOG, lose(3));
    log = recordSpin(log, win('cherry1', 2));
    log = recordSpin(log, win('bar3', 1));
    expect(log.points).toEqual([
      { spins: 0, wagered: 0, net: 0 },
      { spins: 1, wagered: 3, net: -3 },
      { spins: 2, wagered: 5, net: -1 },
      { spins: 3, wagered: 6, net: 148 },
    ]);
    expect(log.spins).toBe(3);
    expect(log.hits).toEqual({ ...EMPTY_LOG.hits, cherry1: 1, bar3: 1 });
    // The log before is left as it was.
    expect(EMPTY_LOG.points).toHaveLength(1);
    expect(EMPTY_LOG.hits.cherry1).toBe(0);
  });

  it('takes a spin as the engine resolves it', () => {
    // Stops 0 / 0 / 0 are the three 7s.
    const log = recordSpin(EMPTY_LOG, resolveSpin([0, 0, 0], 3));
    expect(log.points[1]).toEqual({ spins: 1, wagered: 3, net: 2997 });
    expect(log.hits.seven3).toBe(1);
  });

  it('never keeps more than the limit of points, and keeps the start, the newest spin and exact totals', () => {
    let log: SessionLog = EMPTY_LOG;
    let net = 0;
    let most = 0;
    for (let i = 1; i <= 5000; i++) {
      const spin = i % 7 === 0 ? win('cherry2') : lose();
      net += spin.win - spin.bet;
      log = recordSpin(log, spin);
      most = Math.max(most, log.points.length);
    }
    expect(most).toBeLessThanOrEqual(POINT_LIMIT);
    expect(log.points[0]).toEqual({ spins: 0, wagered: 0, net: 0 });
    expect(log.points[log.points.length - 1]).toEqual({ spins: 5000, wagered: 5000, net });
    expect(log.spins).toBe(5000);
    expect(log.hits.cherry2).toBe(Math.floor(5000 / 7));
    // Oldest first, no spin twice.
    for (let i = 1; i < log.points.length; i++) expect(log.points[i].spins).toBeGreaterThan(log.points[i - 1].spins);
    // Still a line across the whole session, not its tail.
    expect(log.points.length).toBeGreaterThan(POINT_LIMIT / 2 - 1);
    // Evenly spaced from the start to the newest spin.
    expect(log.every).toBe(16);
    expect(log.points.slice(0, -1).map((p) => p.spins)).toEqual(Array.from({ length: log.points.length - 1 }, (_, i) => i * 16));
  });

  it('thins at a small limit as at the default', () => {
    let log: SessionLog = EMPTY_LOG;
    for (let i = 0; i < 9; i++) log = recordSpin(log, lose(), 4);
    expect(log.points.length).toBeLessThanOrEqual(4);
    expect(log.points[0].spins).toBe(0);
    expect(log.points[log.points.length - 1]).toEqual({ spins: 9, wagered: 9, net: -9 });
    expect(log.points.map((p) => p.spins)).toEqual([0, 4, 8, 9]);
  });
});

describe('the averages', () => {
  it('gives the house edge of the medals bet as the average net', () => {
    expect(expectedNet(1000, ODDS.houseEdge)).toBeCloseTo(-1000 * (1 - ODDS.rtp), 10);
    expect(expectedNet(1000, ODDS.houseEdge)).toBeLessThan(0);
  });

  it('gives each line its exact chance times the spins, the lines together the hit frequency', () => {
    const spins = 262144;
    for (const { ways, probability } of ODDS.rules) expect(expectedHits(spins, probability)).toBeCloseTo(ways, 6);
    const all = ODDS.rules.reduce((sum, r) => sum + expectedHits(100, r.probability), 0);
    expect(all).toBeCloseTo(100 * ODDS.hitFrequency, 10);
  });
});

describe('chartScale', () => {
  it('shows a new session over a few spins and a few medals, zero in the middle', () => {
    expect(chartScale(EMPTY_LOG.points, ODDS.houseEdge)).toEqual({ maxSpins: MIN_SPINS, low: -MIN_SPAN / 2, high: MIN_SPAN / 2 });
  });

  it('holds zero, every point and the average line', () => {
    let log: SessionLog = EMPTY_LOG;
    for (let i = 0; i < 30; i++) log = recordSpin(log, lose(3));
    log = recordSpin(log, win('bar3', 3));
    for (let i = 0; i < 400; i++) log = recordSpin(log, win('cherry1', 3));
    const scale = chartScale(log.points, ODDS.houseEdge);
    expect(scale.maxSpins).toBe(431);
    for (const p of log.points) {
      expect(p.net).toBeGreaterThanOrEqual(scale.low);
      expect(p.net).toBeLessThanOrEqual(scale.high);
      expect(expectedNet(p.wagered, ODDS.houseEdge)).toBeGreaterThanOrEqual(scale.low);
    }
    expect(scale.low).toBeLessThanOrEqual(0);
    expect(scale.high).toBeGreaterThan(scale.low);
  });
});
