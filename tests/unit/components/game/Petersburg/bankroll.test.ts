import { describe, expect, it } from 'vitest';
import {
  appendGames,
  emptyTrack,
  MAX_TRACK_POINTS,
  probPayoffAtLeast,
  trackPoints,
} from '@/components/game/Petersburg/bankroll';
import { fmtPercent, fmtSigned } from '@/components/game/Petersburg/BankrollPanel';
import { makeRng, payoffForFlips, playGame, probOfFlips } from '@/components/game/Petersburg/engine';
import { getPetersburgStrings } from '@/components/game/Petersburg/i18n';

describe('Petersburg running balance', () => {
  it('moves by payoff minus the entry price of each game', () => {
    const track = appendGames(emptyTrack(), [1, 2, 16, 1], 5);
    expect(track.games).toBe(4);
    expect(track.net).toBe(1 + 2 + 16 + 1 - 4 * 5);
    expect(track.points).toEqual([-4, -7, 4, 0]);
    expect(track).toMatchObject({ low: -7, lowAt: 2, high: 4, highAt: 3, paidBack: 1 });
  });

  it('charges each batch the price it was played at', () => {
    let track = appendGames(emptyTrack(), [1, 1], 3);
    track = appendGames(track, [8], 10);
    expect(track.net).toBe(-2 - 2 - 2);
    expect(track.paidBack).toBe(0);
    track = appendGames(track, [1], 0);
    expect(track.net).toBe(-5);
    expect(track.paidBack).toBe(1);
  });

  it('does not mutate the track it is given and ignores an empty batch', () => {
    const before = appendGames(emptyTrack(), [4], 1);
    const snapshot = JSON.parse(JSON.stringify(before));
    expect(appendGames(before, [], 5)).toBe(before);
    appendGames(before, [1, 1, 1], 5);
    expect(before).toEqual(snapshot);
  });

  it('starts flat: lowest and highest are 0 until the balance leaves 0', () => {
    expect(emptyTrack()).toMatchObject({ low: 0, lowAt: 0, high: 0, highAt: 0 });
    const up = appendGames(emptyTrack(), [4, 4], 1);
    expect(up).toMatchObject({ low: 0, lowAt: 0, high: 6, highAt: 2 });
    expect(trackPoints(emptyTrack())).toEqual([{ game: 0, net: 0 }]);
  });

  it('thins long sessions but keeps totals, extremes and the end point exact', () => {
    const rng = makeRng(7);
    const payoffs: number[] = [];
    for (let i = 0; i < 25_000; i++) payoffs.push(playGame(rng).payoff);
    const price = 6;

    // Reference: the full balance path.
    const full: number[] = [];
    let net = 0;
    for (const p of payoffs) full.push((net += p - price));

    // Appending in uneven batches must match appending all at once.
    let track = emptyTrack();
    for (let i = 0; i < payoffs.length; i += 777) track = appendGames(track, payoffs.slice(i, i + 777), price);
    expect(track).toEqual(appendGames(emptyTrack(), payoffs, price));

    expect(track.games).toBe(payoffs.length);
    expect(track.net).toBe(full[full.length - 1]);
    expect(track.low).toBe(Math.min(0, ...full));
    expect(track.high).toBe(Math.max(0, ...full));
    if (track.lowAt > 0) expect(full[track.lowAt - 1]).toBe(track.low);
    if (track.highAt > 0) expect(full[track.highAt - 1]).toBe(track.high);
    expect(track.paidBack).toBe(payoffs.filter((p) => p >= price).length);

    expect(track.points.length).toBeLessThan(MAX_TRACK_POINTS);
    expect(track.stride).toBeGreaterThan(1);
    track.points.forEach((v, i) => expect(v).toBe(full[(i + 1) * track.stride - 1]));

    const pts = trackPoints(track);
    expect(pts[0]).toEqual({ game: 0, net: 0 });
    expect(pts[pts.length - 1]).toEqual({ game: track.games, net: track.net });
    for (let i = 1; i < pts.length; i++) expect(pts[i].game).toBeGreaterThan(pts[i - 1].game);
    for (const p of pts.slice(1)) expect(p.net).toBe(full[p.game - 1]);
    expect(pts).toContainEqual({ game: track.lowAt, net: track.low });
    expect(pts).toContainEqual({ game: track.highAt, net: track.high });
  });
});

describe('probPayoffAtLeast', () => {
  it('matches the sum of outcome probabilities whose payoff reaches the price', () => {
    for (let price = 0; price <= 50; price++) {
      let expected = 0;
      for (let n = 1; n <= 60; n++) if (payoffForFlips(n) >= price) expected += probOfFlips(n);
      expect(probPayoffAtLeast(price)).toBeCloseTo(expected, 12);
    }
  });

  it('gives the familiar values', () => {
    expect(probPayoffAtLeast(0)).toBe(1);
    expect(probPayoffAtLeast(1)).toBe(1);
    expect(probPayoffAtLeast(2)).toBe(0.5);
    expect(probPayoffAtLeast(5)).toBe(0.125);
    expect(probPayoffAtLeast(8)).toBe(0.125);
    expect(probPayoffAtLeast(50)).toBe(1 / 64);
  });
});

describe('balance formatting', () => {
  it('formats signed balances', () => {
    expect(fmtSigned(0)).toBe('$0');
    expect(fmtSigned(-0.4)).toBe('$0');
    expect(fmtSigned(-120)).toBe('−$120');
    expect(fmtSigned(999)).toBe('+$999');
    expect(fmtSigned(1234)).toBe('+$1.2k');
    expect(fmtSigned(999_960)).toBe('+$1.0M');
    expect(fmtSigned(-2_500_000)).toBe('−$2.5M');
    expect(fmtSigned(3e12)).toBe('+$3.0e+12');
  });

  it('never prints a non-zero share as 0%', () => {
    expect(fmtPercent(0)).toBe('0%');
    expect(fmtPercent(1)).toBe('100%');
    expect(fmtPercent(0.125)).toBe('12.5%');
    expect(fmtPercent(1 / 64)).toBe('1.56%');
    expect(fmtPercent(1 / 100_000)).toBe('<0.01%');
  });
});

describe('balance strings', () => {
  it('are provided in both languages', () => {
    for (const lang of ['en', 'ja'] as const) {
      const t = getPetersburgStrings(lang);
      expect(t.bankrollAria('10', '−$5', '−$9', '+$2')).toContain('−$9');
      expect(t.bankrollAtGame('12')).toContain('12');
      expect(t.bankrollChance('$5')).toContain('$5');
    }
    expect(getPetersburgStrings('ja').bankrollTitle).not.toBe(getPetersburgStrings('en').bankrollTitle);
  });
});
