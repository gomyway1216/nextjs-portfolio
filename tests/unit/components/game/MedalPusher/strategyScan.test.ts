import { describe, expect, it } from 'vitest';

import { CHECKERS, FIELD, LUCKY, MIDDLE, PUSHER, aimArm, createMachine, dropMedal, luckySlot, step } from '@/components/game/MedalPusher/engine';
import { CHANCE, CHANCE_BONUS, JACKPOT_GROWTH, JACKPOT_START, SPIN_TABLE, spinValue } from '@/components/game/MedalPusher/lottery';
import { MAX_STOCK } from '@/components/game/MedalPusher/session';
import { FLOOR_RULES } from '@/lib/medalFloor/games';
import { EXPECTED_PER_MEDAL, linked } from '@/lib/medalFloor/jackpot';

import { FAMILIES, parsePlay, playMachine } from '../../../../../scripts/medal-pusher-strategy-scan';
import scan from './fixtures/strategy-scan.json';

// Can any way of playing the Medal Pusher beat its published best, a medal every two seconds down the middle?
// scripts/medal-pusher-strategy-scan.ts scanned every choice a player has: each rail's aim, the pace, bursts timed to
// the pusher's stroke and to the lucky lamp, feeding only in part of the stroke or of the lamp's turn, holding back
// while the hold is deep, the screen busy or a tower on its way, feeding faster or slower as the front edge fills,
// chance time, one rail alone, chasing the lamp, and a cabinet that shows nothing moving. None did. What it measured is
// in fixtures/strategy-scan.json.
//
// A full measurement takes hours, so this checks quickly what decides it:
//
// - the machine: short seeded runs of the scan's own player come out exactly as they did when the scan was made, so a
//   change to the field, the pockets, the hold, chance time or the lottery fails here until the scan is made again;
// - the scan: every play the script names was measured, and every play that came out above the best on the first pass
//   (four machines, 40,000 medals) was measured again on twenty other machines (400,000 medals) and came out within the
//   best's interval; the floor is told the highest of them;
// - the two things a player's timing could steer, each checked on its own: the field's share, which no way of feeding
//   down the middle moved, and the lucky lamp, whose worth is bounded by how unevenly the three pockets share what goes
//   through them, measured here directly on the field.

const { best, first, again, method } = scan;
const highest = [best, ...again].reduce((a, b) => (b.return > a.return ? b : a));

/** What the scan's player did on machine 7 in these plays: two batches each, after a warm-up of 20 medals. */
const FINGERPRINTS = {
  // Both rails held until the hold is found full and while chance time lasts: chance time, a tower, the hopper.
  fill: {
    medals: 400,
    batches: [
      { fed: 200, won: 66, lost: 49, spins: 18, gold: 8, hits: 23, wasted: 0, lucky: 8, paidOut: 20, jackpots: 0, time: 18.3333, rushTime: 0 },
      { fed: 200, won: 136, lost: 87, spins: 23, gold: 12, hits: 20, wasted: 2, lucky: 10, paidOut: 64, jackpots: 0, time: 39.7333, rushTime: 4.8167 },
    ],
  },
  // Two a second while the hold has three spins or fewer, on a cabinet that shows nothing moving.
  'p2/h3/still': {
    medals: 80,
    batches: [
      { fed: 40, won: 25, lost: 16, spins: 4, gold: 1, hits: 5, wasted: 0, lucky: 1, paidOut: 8, jackpots: 0, time: 20, rushTime: 0 },
      { fed: 40, won: 30, lost: 23, spins: 6, gold: 3, hits: 6, wasted: 0, lucky: 2, paidOut: 15, jackpots: 0, time: 20, rushTime: 0 },
    ],
  },
  // Two at once each stroke, landing as the pusher is near its front, both rails at 37.
  's1.5:2/x37': {
    medals: 30,
    batches: [
      { fed: 15, won: 24, lost: 12, spins: 9, gold: 4, hits: 9, wasted: 0, lucky: 4, paidOut: 10, jackpots: 0, time: 28.8, rushTime: 0 },
      { fed: 15, won: 7, lost: 10, spins: 0, gold: 0, hits: 0, wasted: 0, lucky: 0, paidOut: 0, jackpots: 0, time: 25.2, rushTime: 0 },
    ],
  },
} as const;

describe('the machine the scan was made on', () => {
  it('has the numbers that set the return as they were', () => {
    expect({ sideReach: FIELD.sideReach, CHECKERS, PUSHER, lamp: LUCKY.dwell, SPIN_TABLE, MAX_STOCK, multiplier: CHANCE.multiplier, JACKPOT_START, JACKPOT_GROWTH }).toEqual({
      sideReach: 14,
      CHECKERS: { positions: [28, 39, 50], halfWidth: 1.27, wingWidth: 1.7 },
      PUSHER: { min: 30, max: 46, period: 3.6, height: 6 },
      lamp: 3.6,
      SPIN_TABLE: { miss: 22240, small: 2091, big: 420, seven: 249 },
      MAX_STOCK: 10,
      multiplier: 2,
      JACKPOT_START: 500,
      JACKPOT_GROWTH: 0.05,
    });
    expect(spinValue(JACKPOT_START)).toBeCloseTo(2.129876790123, 10);
    expect(CHANCE_BONUS).toBeCloseTo(1.3404, 10);
  });

  // The field, the pockets, the hold, chance time and the screen: any change to them changes these.
  it.each(Object.entries(FINGERPRINTS))('plays the scan’s short seeded run of %s exactly as it did', (word, expected) => {
    const batches = playMachine(parsePlay(word), 7, expected.medals, expected.medals / 2, 20);
    expect(batches.map((b) => ({ ...b, time: Number(b.time.toFixed(4)), rushTime: Number(b.rushTime.toFixed(4)) }))).toEqual(expected.batches);
  }, 10_000);
});

describe('the scan', () => {
  it('measured every play the script names on the first pass, each on the same four machines', () => {
    const named = [...new Set(Object.values(FAMILIES).flat())].sort();
    expect(first.map((p) => p.play).sort()).toEqual(named);
    expect(method).toEqual({ warmUp: 500, batch: 2_500, first: { machines: 4, medals: 10_000, seed: 30_001 }, again: { machines: 20, medals: 20_000 } });
    for (const play of first) {
      expect(play.medals, play.play).toBe(method.first.machines * method.first.medals);
      expect(FAMILIES[play.family], play.play).toContain(play.play);
      expect(play.half, play.play).toBeGreaterThan(0);
      // Nothing came near 100%.
      expect(play.return + play.half, play.play).toBeLessThan(0.95);
    }
  });

  it('measured the published best for 400,000 medals on twenty machines of its own: about 90%', () => {
    expect(best.play).toBe('p0.5');
    expect(best.medals).toBe(method.again.machines * method.again.medals);
    expect(best.return).toBeGreaterThan(0.895);
    expect(best.return).toBeLessThan(0.91);
    expect(best.half).toBeLessThan(0.006);
    // The first pass's own machines agree with it.
    const firstPass = first.find((p) => p.play === 'p0.5')!;
    expect(Math.abs(firstPass.return - best.return)).toBeLessThan(firstPass.half);
  });

  it('measured again on other machines every play that came out above the best, and none of them is above it', () => {
    const measured = new Map(again.map((p) => [p.play, p]));
    for (const play of first) {
      if (play.return - play.half <= best.return + best.half) continue;
      expect(measured.has(play.play), `${play.play} came out above the best on the first pass, and was not measured again`).toBe(true);
    }
    for (const play of again) {
      expect(first.some((p) => p.play === play.play), play.play).toBe(true);
      expect(play.medals, play.play).toBe(method.again.machines * method.again.medals);
      // On machines of their own, none of the first pass's.
      expect(play.seed, play.play).toBeGreaterThanOrEqual(method.first.seed + method.first.machines);
      // Its interval reaches no higher than the best's.
      expect(play.return - play.half, play.play).toBeLessThanOrEqual(best.return + best.half);
    }
  });

  it('found that no way of feeding down the middle moves the field’s share: only the aim does', () => {
    // Every play aimed down the middle (no d, x, any or chase but d0): the field gives back the same share of what
    // leaves it, within two points, however fast, whenever and in whatever bursts it is fed.
    const middle = first.filter((p) => !/(^|\/)(d\d|x\d|any|chase)/.test(p.play) || p.play.endsWith('/d0'));
    expect(middle.length).toBeGreaterThan(70);
    for (const play of middle) expect(Math.abs(play.fieldShare - best.fieldShare), play.play).toBeLessThan(0.02);
  });

  it('gives the floor the highest return measured precisely, rounded up, and links it to the floor jackpot: with it, under 100%', () => {
    const rule = FLOOR_RULES['medal-pusher'];
    expect(rule.bestReturn).toBe(Math.ceil(highest.return * 10_000) / 10_000);
    expect(highest.return + highest.half + EXPECTED_PER_MEDAL).toBeLessThan(0.95);
    expect(linked('medal-pusher')).toBe(true);
  });
});

describe('the lucky lamp', () => {
  // A spin held through the lit pocket is gold, worth CHANCE_BONUS more than any other. The lamp is read off the clock and
  // lights one pocket a stroke, and what is fed goes over the lip in the stroke it lands in or the next. So a player who
  // timed every medal to come over in the strokes that light the middle pocket would make gold, at the most, the share
  // of the spins that goes through the pocket the most medals go through. Fed down the middle the three pockets share
  // them nearly alike, so no timing makes many more than the third of the spins the lamp makes gold anyway: the scan's
  // timed bursts and windows made 33.3% to 38.2%.
  it('lights each pocket for one stroke in three, whatever is fed', () => {
    const lit = [0, 0, 0];
    for (let n = 0; n < 3 * 30; n++) lit[luckySlot((n + 0.5) * LUCKY.dwell)] += 1;
    expect(lit).toEqual([30, 30, 30]);
    expect(LUCKY.dwell).toBe(PUSHER.period);
  });

  it('is worth too little to steer: fed down the middle, no pocket takes much more than a third of what goes through', () => {
    const machine = createMachine(7);
    aimArm(machine, 0, MIDDLE);
    aimArm(machine, 1, MIDDLE);
    const through = [0, 0, 0];
    let won = 0;
    let lost = 0;
    let fed = 0;
    let arm: 0 | 1 = 0;
    // Five a second by turns, the engine alone (no screen, nothing paid): the first hundred settle the pile.
    for (let clock = 0; fed < 700; clock += 1 / 60) {
      if (clock >= 0.2 && dropMedal(machine, arm)) {
        clock -= 0.2;
        arm = arm === 0 ? 1 : 0;
        fed += 1;
      }
      const events = step(machine, 1 / 60);
      if (fed <= 100) continue;
      for (const pocket of events.checkers) through[pocket] += 1;
      won += events.won;
      lost += events.lost;
    }
    const all = through[0] + through[1] + through[2];
    expect(all).toBeGreaterThan(50);
    // No pocket takes as much as 45% of what goes through.
    const MOST = 0.45;
    expect(Math.max(...through) / all).toBeLessThan(MOST);
    // The field's share, on the field alone, is the scan's.
    expect(Math.abs(won / (won + lost) - best.fieldShare)).toBeLessThan(0.05);
    // So a perfect lamp-timer, at the best's rate of spins and field's share, could add under two points: with it and
    // the floor jackpot the best stays well under 100%.
    const gain = best.spins * (MOST - 1 / 3) * CHANCE_BONUS * best.fieldShare;
    expect(gain).toBeLessThan(0.02);
    expect(best.return + best.half + gain + EXPECTED_PER_MEDAL).toBeLessThan(0.95);
  }, 15_000);
});
