import { describe, expect, it } from 'vitest';

import { seededRng } from '@/components/game/MedalPusher/engine';
import {
  BALL_JACKPOT_CHANCE,
  BOARD,
  BOARD_VALUE,
  BOWL,
  BOWLS,
  BOWL_POURED,
  CHAIN_GOAL,
  CHALLENGE_CHANCE,
  CHANCE,
  CHANCE_BONUS,
  CHESTS,
  CHEST_TOWERS_FROM,
  CONTINUE_CHANCE,
  CHEST_VALUE,
  DIE_FACES,
  FALLS,
  FEVER_SQUARE,
  HOLE_JACKPOT_CHANCE,
  JACKPOT_CHANCE,
  JACKPOT_GROWTH,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL,
  JEWEL_CHANCE,
  JEWEL_SET,
  JEWEL_SPIN_VALUE,
  JEWEL_TIER,
  JEWEL_VALUE,
  LONG_REACH,
  POCKET_VALUE,
  REACH_KINDS,
  REACH_RATE,
  ROULETTE,
  SPIN_TABLE,
  SPIN_TOTAL,
  TIERS,
  TIER_BONUS,
  TIER_DIGITS,
  boardAfter,
  bowlChance,
  bowlValue,
  chainChance,
  chanceSpinValue,
  chanceTierValue,
  drawDie,
  drawFall,
  drawPocket,
  drawSpin,
  fallEnd,
  holeChance,
  holePays,
  jewelPays,
  pouredOf,
  reachChance,
  reachHitChance,
  rouletteValue,
  shuffleChests,
  spinValue,
  squareAfter,
  tierChance,
  tierFor,
  tierValue,
} from '@/components/game/MedalPusher/lottery';

/** The table as it was while the machine gave back nearly all it took: the lines came less than half as often. */
const TABLE_BEFORE = { small: 1240, big: 465, seven: 217 } as const;
/** What the board's squares held then. No square holds less now, and the two richest hold more. */
const BOARD_BEFORE = [10, 3, 5, 8, 3, 10, 5, 30, 3, 8, 5, 15];
/** How often each line came while the START pockets were under a console on the lip, before the START plate. */
const TABLE_BEFORE_THE_PLATE = { small: 3125, big: 625, seven: 375 } as const;

describe('the slot', () => {
  it('has a table that adds up', () => {
    expect(TIERS.reduce((sum, tier) => sum + SPIN_TABLE[tier], 0)).toBe(SPIN_TOTAL);
    expect(TIERS.reduce((sum, tier) => sum + tierChance(tier), 0)).toBeCloseTo(1, 12);
    expect(SPIN_TABLE).toEqual({ miss: 21845, small: 2390, big: 480, seven: 285 });
    expect(SPIN_TOTAL).toBe(25000);
    expect(tierChance('seven')).toBe(0.0114);
    expect(tierChance('big')).toBe(0.0192);
    expect(tierChance('small')).toBe(0.0956);
    expect(tierChance('miss')).toBe(0.8738);
    // A sugoroku line about once in 10.5 spins, a treasure line about once in 52, three sevens about once in 88: about one
    // spin in eight wins something.
    expect([SPIN_TOTAL / SPIN_TABLE.small, SPIN_TOTAL / SPIN_TABLE.big].map((spins) => Math.round(spins * 10) / 10)).toEqual([10.5, 52.1]);
    expect(Math.round(SPIN_TOTAL / SPIN_TABLE.seven)).toBe(88);
    expect(1 / (1 - tierChance('miss'))).toBeCloseTo(7.92, 2);
    // Every line comes more often than it did while the machine gave back nearly all it took, and the three together more
    // than one and a half times as often. They came more often still while a START pocket took one medal in eight fed down
    // the middle, where a hole in the START plate takes one in five.
    for (const tier of ['small', 'big', 'seven'] as const) expect(SPIN_TABLE[tier]).toBeGreaterThan(TABLE_BEFORE[tier]);
    expect((SPIN_TOTAL - SPIN_TABLE.miss) / (TABLE_BEFORE.small + TABLE_BEFORE.big + TABLE_BEFORE.seven)).toBeCloseTo(1.6415, 4);
    for (const tier of ['small', 'big', 'seven'] as const) expect(SPIN_TABLE[tier]).toBeLessThan(TABLE_BEFORE_THE_PLATE[tier]);
  });

  it('turns a roll into a tier at the right boundaries', () => {
    const upTo = { seven: tierChance('seven'), big: tierChance('seven') + tierChance('big'), small: tierChance('seven') + tierChance('big') + tierChance('small') };
    expect(upTo.seven).toBeCloseTo(0.0114, 12);
    expect(upTo.big).toBeCloseTo(0.0306, 12);
    expect(upTo.small).toBeCloseTo(0.1262, 12);
    expect(tierFor(0)).toBe('seven');
    expect(tierFor(upTo.seven - 0.0001)).toBe('seven');
    expect(tierFor(upTo.seven + 0.0001)).toBe('big');
    expect(tierFor(upTo.big - 0.0001)).toBe('big');
    expect(tierFor(upTo.big + 0.0001)).toBe('small');
    expect(tierFor(upTo.small - 0.0001)).toBe('small');
    expect(tierFor(upTo.small + 0.0001)).toBe('miss');
    expect(tierFor(0.999999)).toBe('miss');
  });

  it('shows digits that agree with the tier it drew', () => {
    const rng = seededRng(99);
    for (let i = 0; i < 20_000; i++) {
      const { tier, digits, reach, reachKind } = drawSpin(rng);
      const [left, centre, right] = digits;
      expect(digits.every((digit) => Number.isInteger(digit) && digit >= 1 && digit <= 9)).toBe(true);
      // A reach is played one way or the other, and a spin without one has none to play.
      expect(REACH_KINDS).toContain(reachKind);
      expect(reachKind !== 'none').toBe(reach);
      if (tier === 'miss') {
        // A losing spin never lines three up, and a reach is exactly two outer reels alike.
        expect(left === centre && centre === right).toBe(false);
        expect(reach).toBe(left === right);
        if (reach) expect(Math.abs(centre - left) === 1 || Math.abs(centre - left) === 8).toBe(true);
      } else {
        expect(left === centre && centre === right).toBe(true);
        expect(TIER_DIGITS[tier]).toContain(left);
        expect(reach).toBe(true);
      }
    }
  });

  it('draws each tier as often as its table says', () => {
    const rng = seededRng(2025);
    const draws = 400_000;
    const seen = { miss: 0, small: 0, big: 0, seven: 0 };
    let reaches = 0;
    for (let i = 0; i < draws; i++) {
      const spin = drawSpin(rng);
      seen[spin.tier]++;
      if (spin.tier === 'miss' && spin.reach) reaches++;
    }
    for (const tier of TIERS) {
      const p = tierChance(tier);
      // Within five standard errors of the exact chance.
      expect(Math.abs(seen[tier] / draws - p)).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / draws));
    }
    expect(Math.abs(reaches / seen.miss - REACH_RATE)).toBeLessThan(0.004);
  });
});

/** Many spins, counted by the kind of reach each showed and by whether it had won. */
function tallyReaches(seed: number, draws: number) {
  const rng = seededRng(seed);
  const shown = { normal: 0, long: 0 };
  const hit = { normal: 0, long: 0 };
  let wins = 0;
  let teases = 0;
  for (let i = 0; i < draws; i++) {
    const spin = drawSpin(rng);
    if (spin.tier !== 'miss') wins++;
    else if (spin.reach) teases++;
    if (spin.reachKind === 'none') continue;
    shown[spin.reachKind]++;
    if (spin.tier !== 'miss') hit[spin.reachKind]++;
  }
  return { draws, shown, hit, wins, teases };
}

/** Expects `seen` out of `of` to be within five standard errors of the exact chance. */
const near = (seen: number, of: number, chance: number) => expect(Math.abs(seen / of - chance)).toBeLessThan(5 * Math.sqrt((chance * (1 - chance)) / of));

describe('the two kinds of reach', () => {
  it('plays a reach long more often for a spin that has won', () => {
    expect(REACH_KINDS).toEqual(['none', 'normal', 'long']);
    expect(LONG_REACH).toEqual({ win: 0.6, miss: 0.15 });
    expect(LONG_REACH.win).toBeGreaterThan(LONG_REACH.miss);
  });

  it('decides how a reach is played only once the spin itself is settled', () => {
    // The draws up to the last are the same; the last one only picks the kind of reach.
    const spin = (draws: number[]) => {
      const queue = [...draws];
      return drawSpin(() => queue.shift() ?? 0.5);
    };
    const wonLong = spin([0.1, 0.3, 0.59]);
    const wonNormal = spin([0.1, 0.3, 0.61]);
    expect(wonLong).toEqual({ tier: 'small', digits: [4, 4, 4], reach: true, reachKind: 'long' });
    expect(wonNormal).toEqual({ ...wonLong, reachKind: 'normal' });
    const lostLong = spin([0.5, 0.45, 0.1, 0.2, 0.14]);
    const lostNormal = spin([0.5, 0.45, 0.1, 0.2, 0.16]);
    expect(lostLong).toEqual({ tier: 'miss', digits: [5, 6, 5], reach: true, reachKind: 'long' });
    expect(lostNormal).toEqual({ ...lostLong, reachKind: 'normal' });
    // A spin with no reach draws nothing more than it did.
    const queue = [0.5, 0.45, 0.9, 0.3, 0.7];
    const plain = drawSpin(() => {
      const next = queue.shift();
      if (next === undefined) throw new Error('a spin with no reach drew a number too many');
      return next;
    });
    expect(plain).toEqual({ tier: 'miss', digits: [5, 7, 3], reach: false, reachKind: 'none' });
    expect(queue).toHaveLength(0);
  });

  it('plays as many reaches long as it says, and pays as often as it did', () => {
    const { draws, shown, hit, wins, teases } = tallyReaches(4242, 600_000);
    near(hit.long, wins, LONG_REACH.win);
    near(shown.long - hit.long, teases, LONG_REACH.miss);
    // Every winning spin shows a reach of one kind or the other, and so does every tease.
    expect(hit.long + hit.normal).toBe(wins);
    expect(shown.long + shown.normal).toBe(wins + teases);
    // The slot wins as often as it did before reaches came in two kinds, and teases as often.
    near(wins, draws, 1 - SPIN_TABLE.miss / SPIN_TOTAL);
    near(teases, draws - wins, REACH_RATE);
  });
});

describe('how far to trust a reach', () => {
  const win = 1 - SPIN_TABLE.miss / SPIN_TOTAL;
  const tease = (SPIN_TABLE.miss / SPIN_TOTAL) * REACH_RATE;

  it('works out the chance of each kind of reach and of a win behind it', () => {
    // Every winning spin shows a reach, and a share of the losing ones.
    expect(reachChance()).toBeCloseTo(win + tease, 12);
    expect(reachChance('any')).toBe(reachChance());
    expect(reachChance('long')).toBeCloseTo(win * LONG_REACH.win + tease * LONG_REACH.miss, 12);
    expect(reachChance('normal')).toBeCloseTo(win * (1 - LONG_REACH.win) + tease * (1 - LONG_REACH.miss), 12);
    expect(reachChance('long') + reachChance('normal')).toBeCloseTo(reachChance(), 12);
    // Bayes: the wins among the spins that show the reach.
    expect(reachHitChance()).toBeCloseTo(win / (win + tease), 12);
    expect(reachHitChance('long')).toBeCloseTo((win * LONG_REACH.win) / (win * LONG_REACH.win + tease * LONG_REACH.miss), 12);
    expect(reachHitChance('normal')).toBeCloseTo((win * (1 - LONG_REACH.win)) / (win * (1 - LONG_REACH.win) + tease * (1 - LONG_REACH.miss)), 12);
    // The figures the Odds tab prints.
    expect(reachChance()).toBeCloseTo(0.25727, 6);
    expect(reachChance('long')).toBeCloseTo(0.0953805, 6);
    expect(reachChance('normal')).toBeCloseTo(0.1618895, 6);
    expect(reachHitChance()).toBeCloseTo(0.4905352, 6);
    expect(reachHitChance('long')).toBeCloseTo(0.793873, 6);
    expect(reachHitChance('normal')).toBeCloseTo(0.3118176, 6);
    // A long reach is the better sign, an ordinary one the worse, and neither changes how often a spin wins.
    expect(reachHitChance('long')).toBeGreaterThan(reachHitChance());
    expect(reachHitChance('normal')).toBeLessThan(reachHitChance());
    const overall = reachChance('long') * reachHitChance('long') + reachChance('normal') * reachHitChance('normal');
    expect(overall).toBeCloseTo(win, 12);
  });

  it('draws reaches that come up, and hit, as often as that', () => {
    const { draws, shown, hit } = tallyReaches(90210, 600_000);
    near(shown.long, draws, reachChance('long'));
    near(shown.normal, draws, reachChance('normal'));
    near(shown.long + shown.normal, draws, reachChance());
    near(hit.long, shown.long, reachHitChance('long'));
    near(hit.normal, shown.normal, reachHitChance('normal'));
    near(hit.long + hit.normal, shown.long + shown.normal, reachHitChance());
  });
});

describe('the roulette a ball starts', () => {
  it('has twelve pockets: eight numbers and four crosses', () => {
    expect(ROULETTE).toHaveLength(12);
    expect(ROULETTE.filter((pocket) => pocket === 'stop')).toHaveLength(4);
    expect(ROULETTE.filter((pocket) => pocket === 10)).toHaveLength(3);
    expect(ROULETTE.filter((pocket) => pocket === 20)).toHaveLength(3);
    expect(ROULETTE.filter((pocket) => pocket === 30)).toHaveLength(1);
    expect(ROULETTE.filter((pocket) => pocket === 50)).toHaveLength(1);
    expect(CONTINUE_CHANCE).toBeCloseTo(2 / 3, 12);
    expect(POCKET_VALUE).toBeCloseTo(21.25, 12);
    expect(CHAIN_GOAL).toBe(4);
  });

  it('draws every pocket equally often', () => {
    const rng = seededRng(8);
    const draws = 240_000;
    const seen = ROULETTE.map(() => 0);
    for (let i = 0; i < draws; i++) seen[drawPocket(rng)]++;
    for (const count of seen) expect(Math.abs(count / draws - 1 / 12)).toBeLessThan(0.003);
    expect(drawPocket(() => 0)).toBe(0);
    expect(drawPocket(() => 0.9999999)).toBe(11);
  });

  it('gets to each level of a run with the chance of that many numbers in a row', () => {
    expect(chainChance(0)).toBe(1);
    expect(chainChance(1)).toBeCloseTo(2 / 3, 12);
    expect(chainChance(CHAIN_GOAL)).toBeCloseTo(16 / 81, 12);
  });

  it('ends a full run in three ways, each as likely as the next, one of them the jackpot', () => {
    expect(BOWL).toEqual(['jackpot', 50, 100]);
    expect(holePays('jackpot', 345)).toBe(345);
    expect(holePays(50, 345)).toBe(50);
    expect(holePays(100, 345)).toBe(100);
    expect(bowlValue(300)).toBeCloseTo(150, 12);
    expect(bowlValue(900)).toBeCloseTo(350, 12);
    // About one ball in five gets to the bowls, and a third of those get down to the jackpot.
    expect(CHALLENGE_CHANCE).toBeCloseTo(16 / 81, 12);
    expect(CHALLENGE_CHANCE).toBeCloseTo(0.1975, 4);
    expect(HOLE_JACKPOT_CHANCE).toBeCloseTo(1 / 3, 12);
    expect(BALL_JACKPOT_CHANCE).toBeCloseTo(16 / 243, 12);
    expect(BALL_JACKPOT_CHANCE).toBeCloseTo(0.0658, 4);
    expect(JACKPOT_CHANCE).toBeCloseTo(tierChance('seven') * (16 / 243), 12);
    expect(JACKPOT_CHANCE).toBeCloseTo((SPIN_TABLE.seven / SPIN_TOTAL) * (16 / 243), 12);
    expect(JACKPOT_CHANCE).toBeCloseTo((285 / 25000) * (16 / 243), 12);
    expect(Math.round(1 / JACKPOT_CHANCE)).toBe(1332);
  });

  it('starts the jackpot at five hundred medals and grows it by one for every twenty played, all of which is paid in the end', () => {
    expect(JACKPOT_START).toBe(500);
    expect(JACKPOT_STEP).toBe(20);
    // What it grows by for each medal played. Every medal of it is paid when the jackpot is won, so over a long run
    // it is part of what the machine returns: five medals for every hundred played, which no spin's average has in it.
    expect(JACKPOT_GROWTH).toBe(1 / JACKPOT_STEP);
    expect(JACKPOT_GROWTH).toBe(0.05);
    expect(spinValue(JACKPOT_START + 1) - spinValue(JACKPOT_START)).toBeCloseTo(JACKPOT_CHANCE, 12);
    // It started at 300 once and grew by one in 40: it starts higher now and grows twice as fast.
    expect(JACKPOT_START).toBeGreaterThan(300);
    expect(40 / JACKPOT_STEP).toBe(2);
  });

  it('gets to those three ends through three bowls, every hole of a bowl as likely as the next', () => {
    // The top bowl: two holes down and fifty. The middle bowl: one hole down and a hundred. The bottom bowl: the jackpot.
    expect(BOWLS).toEqual([['down', 'down', 50], ['down', 100], ['jackpot']]);
    // Every bowl but the last has a way down, and every bowl has one prize: the three of them are the three ends.
    BOWLS.forEach((holes, bowl) => expect(holes.includes('down')).toBe(bowl < BOWLS.length - 1));
    expect(BOWLS.map((holes) => holes.filter((hole) => hole !== 'down')).flat()).toEqual([50, 100, 'jackpot']);
    expect([...BOWL].map(String).sort()).toEqual(BOWLS.flat().filter((hole) => hole !== 'down').map(String).sort());

    // Every fall goes down hole by hole and ends in a hole that holds a prize.
    for (const fall of FALLS) {
      fall.forEach((hole, bowl) => {
        expect(hole).toBeGreaterThanOrEqual(0);
        expect(hole).toBeLessThan(BOWLS[bowl].length);
        expect(BOWLS[bowl][hole] === 'down').toBe(bowl < fall.length - 1);
      });
      expect(BOWL).toContain(fallEnd(fall));
    }
    expect(() => fallEnd([0])).toThrow();
    expect(() => fallEnd([])).toThrow();
    expect(() => fallEnd([0, 0, 0, 0])).toThrow();
    expect(FALLS).toEqual([[0, 0, 0], [1, 0, 0], [2], [2], [0, 1], [1, 1]]);

    // The falls are as likely as each other. Of those that get to a bowl, the same number take each of its holes:
    // that is what makes a hole of a bowl as likely as the one beside it.
    BOWLS.forEach((holes, bowl) => {
      const reach = FALLS.filter((fall) => fall.length > bowl);
      const taken = holes.map((_, hole) => reach.filter((fall) => fall[bowl] === hole).length);
      expect(new Set(taken).size).toBe(1);
      expect(taken[0] * holes.length).toBe(reach.length);
      holes.forEach((_, hole) => expect(holeChance(bowl, hole)).toBeCloseTo(bowlChance(bowl) / holes.length, 12));
    });
    // All of the balls are in the top bowl, two thirds get to the middle one, and one third to the bottom.
    expect(bowlChance(0)).toBe(1);
    expect(bowlChance(1)).toBeCloseTo(2 / 3, 12);
    expect(bowlChance(2)).toBeCloseTo(1 / 3, 12);
    // And so the three ends come out a third each: fifty from the top bowl, a hundred from the middle, the jackpot at the bottom.
    for (const end of BOWL) expect(FALLS.filter((fall) => fallEnd(fall) === end)).toHaveLength(FALLS.length / BOWL.length);
    expect(holeChance(0, 2)).toBeCloseTo(1 / 3, 12);
    expect(holeChance(1, 1)).toBeCloseTo(1 / 3, 12);
    expect(holeChance(2, 0)).toBeCloseTo(1 / 3, 12);
  });

  it('is worth exactly what it was when the challenge was one bowl, to the last digit', () => {
    // These are the figures of the game with one bowl of three holes, as that game worked them out. What a ball is
    // worth at a given jackpot has not changed since: not when the bowls became three, and not when the lottery was
    // made richer, which moved where the jackpot starts and how often a ball comes, and nothing in its roulette.
    expect(CHALLENGE_CHANCE).toBe(0.19753086419753083);
    expect(HOLE_JACKPOT_CHANCE).toBe(0.3333333333333333);
    expect(BALL_JACKPOT_CHANCE).toBe(0.06584362139917693);
    expect(JACKPOT_CHANCE).toBe(0.000750617283950617);
    expect(JACKPOT_CHANCE).toBe(tierChance('seven') * BALL_JACKPOT_CHANCE);
    const then: [jackpot: number, bowl: number, roulette: number][] = [
      [300, 150, 63.734567901234556],
      [301, 150.33333333333334, 63.80041152263374],
      [337, 162.33333333333334, 66.17078189300412],
      [500, 216.66666666666666, 76.90329218106994],
      [1000, 383.3333333333333, 109.82510288065842],
      [2000, 716.6666666666666, 175.66872427983535],
    ];
    for (const [jackpot, bowl, roulette] of then) {
      expect(bowlValue(jackpot)).toBe(bowl);
      expect(rouletteValue(jackpot)).toBe(roulette);
    }
    // What a spin of today's table is worth at the sizes of jackpot the Odds tab lists, added up line by line: the
    // board, the chests with the jewel that comes with them, and the ball.
    const now: [jackpot: number, spin: number][] = [
      [500, 2.4355775308641974],
      [1000, 2.8108861728395063],
      [2000, 3.561503456790123],
    ];
    expect(now[0][0]).toBe(JACKPOT_START);
    for (const [jackpot, spin] of now) {
      expect(spinValue(jackpot)).toBe(spin);
      expect(spinValue(jackpot)).toBeCloseTo(tierChance('small') * BOARD_VALUE + tierChance('big') * (CHEST_VALUE + JEWEL_VALUE) + tierChance('seven') * rouletteValue(jackpot), 12);
    }
    // And for every jackpot there can be, the three prizes added up and divided by three, as that game had it.
    for (let jackpot = JACKPOT_START; jackpot <= 5000; jackpot++) expect(bowlValue(jackpot)).toBe((jackpot + 50 + 100) / 3);
    // Every whole jackpot from where it starts to 5,000 folded into one number.
    let fold = 0;
    for (let jackpot = JACKPOT_START; jackpot <= 5000; jackpot++) fold = (fold * 31 + bowlValue(jackpot) * 7 + rouletteValue(jackpot) * 3 + spinValue(jackpot)) % 1e9;
    expect(fold).toBe(380483287.99269867);
  });

  it('draws the way down so that a draw comes to the end it came to with one bowl', () => {
    // With one bowl the draw picked one of the three holes: the first third of the draws the jackpot, and so on.
    const withOneBowl = (draw: number) => BOWL[Math.min(BOWL.length - 1, Math.floor(draw * BOWL.length))];
    for (let step = 0; step < 6000; step++) {
      const draw = (step + 0.5) / 6000;
      expect(fallEnd(FALLS[drawFall(() => draw)])).toBe(withOneBowl(draw));
    }
    for (const edge of [0, 1 / 6, 1 / 3, 0.5, 2 / 3, 5 / 6, 0.9999999, 1 - Number.EPSILON]) expect(fallEnd(FALLS[drawFall(() => edge)])).toBe(withOneBowl(edge));
    expect(drawFall(() => 0)).toBe(0);
    expect(drawFall(() => 0.5)).toBe(3);
    expect(drawFall(() => 0.9999999)).toBe(FALLS.length - 1);

    // And every way down comes up as often as the next.
    const rng = seededRng(21);
    const draws = 90_000;
    const seen = FALLS.map(() => 0);
    for (let i = 0; i < draws; i++) seen[drawFall(rng)]++;
    for (const count of seen) expect(Math.abs(count / draws - 1 / FALLS.length)).toBeLessThan(0.005);
  });

  it('pours a share of what the bowls pay and stacks the rest', () => {
    expect(BOWL_POURED).toBeCloseTo(0.3, 12);
    expect([50, 100, 300, 337].map(pouredOf)).toEqual([15, 30, 90, 101]);
    for (let medals = 0; medals <= 3000; medals++) {
      const poured = pouredOf(medals);
      expect(Number.isInteger(poured)).toBe(true);
      expect(poured).toBeGreaterThanOrEqual(0);
      expect(poured).toBeLessThanOrEqual(medals);
    }
  });

  it('is worth every number it gets to and the bowls for a full run', () => {
    // Worked out the long way: every run of pockets up to the first cross, or to the goal and then down the bowls, hole by hole.
    const walked = (jackpot: number) => {
      let worth = 0;
      let challenge = 0;
      let won = 0;
      let runs = 0;
      const fall = (bowl: number, chance: number, medals: number) => {
        for (const hole of BOWLS[bowl]) {
          const share = chance / BOWLS[bowl].length;
          if (hole === 'down') {
            fall(bowl + 1, share, medals);
            continue;
          }
          runs += 1;
          worth += share * (medals + (hole === 'jackpot' ? jackpot : hole));
          if (hole === 'jackpot') won += share;
        }
      };
      const walk = (level: number, chance: number, medals: number) => {
        if (level === CHAIN_GOAL) {
          challenge += chance;
          fall(0, chance, medals);
          return;
        }
        for (const pocket of ROULETTE) {
          if (pocket === 'stop') {
            runs += 1;
            worth += (chance / ROULETTE.length) * medals;
          } else walk(level + 1, chance / ROULETTE.length, medals + pocket);
        }
      };
      walk(0, 1, 0);
      return { worth, challenge, won, runs };
    };
    const at300 = walked(300);
    // Four crosses after each of 1, 8, 64 and 512 runs of numbers. After each of the 4,096 full ones, five holes the ball
    // can end in: the top bowl's fifty, and under each of its two ways down the middle bowl's hundred and the jackpot.
    expect(at300.runs).toBe(4 * (1 + 8 + 64 + 512) + 5 * 4096);
    expect(at300.challenge).toBeCloseTo(CHALLENGE_CHANCE, 12);
    expect(at300.won).toBeCloseTo(BALL_JACKPOT_CHANCE, 12);
    expect(rouletteValue(300)).toBeCloseTo(at300.worth, 9);
    expect(rouletteValue(1000)).toBeCloseTo(walked(1000).worth, 9);
    expect(rouletteValue(300)).toBeCloseTo(63.7346, 4);
    // Only the jackpot's hole moves it.
    expect(rouletteValue(1000) - rouletteValue(300)).toBeCloseTo((700 * 16) / 243, 9);
  });

  it('pays what its exact value says over many runs', () => {
    const rng = seededRng(77);
    const runs = 200_000;
    let medals = 0;
    let challenges = 0;
    let jackpots = 0;
    for (let i = 0; i < runs; i++) {
      let level = 0;
      while (level < CHAIN_GOAL) {
        const pocket = ROULETTE[drawPocket(rng)];
        if (pocket === 'stop') break;
        medals += pocket;
        level++;
      }
      if (level < CHAIN_GOAL) continue;
      challenges++;
      const hole = fallEnd(FALLS[drawFall(rng)]);
      if (hole === 'jackpot') jackpots++;
      medals += holePays(hole, 300);
    }
    // Within five standard errors of the exact chances.
    const within = (seen: number, p: number) => Math.abs(seen / runs - p) < 5 * Math.sqrt((p * (1 - p)) / runs);
    expect(within(challenges, CHALLENGE_CHANCE)).toBe(true);
    expect(within(jackpots, BALL_JACKPOT_CHANCE)).toBe(true);
    expect(Math.abs(medals / runs - rouletteValue(300))).toBeLessThan(0.9);
  });

  it('makes a spin worth a little under two and a half medals', () => {
    expect(TIER_BONUS).toEqual({ small: 'sugoroku', big: 'chest', seven: 'ball' });
    expect(tierValue('miss', JACKPOT_START)).toBe(0);
    expect(tierValue('small', JACKPOT_START)).toBe(BOARD_VALUE);
    // A treasure line is worth its chests and the jewel that comes with it.
    expect(tierValue('big', JACKPOT_START)).toBe(CHEST_VALUE + JEWEL_VALUE);
    expect(tierValue('seven', 900)).toBeCloseTo(rouletteValue(900), 12);
    const expected = tierChance('small') * BOARD_VALUE + tierChance('big') * (CHEST_VALUE + JEWEL_VALUE) + tierChance('seven') * rouletteValue(JACKPOT_START);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(expected, 12);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(0.0956 * 10 + 0.0192 * (30 + 1.4) + 0.0114 * rouletteValue(JACKPOT_START), 12);
    // The board is a little under a medal of it, the chests a little over half a medal, and the ball between the two with the jackpot where it starts.
    expect(tierChance('small') * BOARD_VALUE).toBeCloseTo(0.956, 12);
    expect(tierChance('big') * CHEST_VALUE).toBeCloseTo(0.576, 12);
    expect(tierChance('seven') * rouletteValue(JACKPOT_START)).toBeCloseTo(0.8767, 5);
    // The jewels add their exact share to that.
    expect((spinValue(JACKPOT_START) - JEWEL_SPIN_VALUE).toFixed(5)).toBe('2.40870');
    expect(spinValue(900) - JEWEL_SPIN_VALUE).toBeCloseTo(2.70894, 5);
    expect(spinValue(JACKPOT_START).toFixed(5)).toBe('2.43558');
    // It was 1.38526 with the jackpot at the 300 it started at then: a spin is worth more than one and a half times that now.
    expect(spinValue(JACKPOT_START) / 1.38526).toBeGreaterThan(1.7);
  });

  it('makes a gold spin worth what its board and its chests pay twice over, its ball once and, with the chests, one jewel', () => {
    expect(CHANCE.multiplier).toBe(2);
    // Chance time pays the board's square and the chest twice over and nothing else: a ball is a ball, and a jewel a jewel.
    for (const jackpot of [JACKPOT_START, 1000, 2000]) {
      expect(chanceTierValue('miss', jackpot)).toBe(0);
      expect(chanceTierValue('small', jackpot)).toBe(2 * BOARD_VALUE);
      expect(chanceTierValue('big', jackpot)).toBe(2 * CHEST_VALUE + JEWEL_VALUE);
      expect(chanceTierValue('seven', jackpot)).toBe(rouletteValue(jackpot));
      expect(chanceTierValue('seven', jackpot)).toBe(tierValue('seven', jackpot));
      // What being gold adds is the board's and the chests' share of a spin again, whatever the jackpot stands at:
      // what it added before there were jewels, since both spins count the jewels' share once.
      expect(chanceSpinValue(jackpot) - spinValue(jackpot)).toBeCloseTo(tierChance('small') * BOARD_VALUE + tierChance('big') * CHEST_VALUE, 12);
    }
    // The board's 0.956 medals and the chests' 0.576 over again: 1.532 medals, to the last digit.
    expect(CHANCE_BONUS).toBeCloseTo(1.532, 12);
    expect(CHANCE_BONUS.toFixed(5)).toBe('1.53200');
    expect(chanceSpinValue(JACKPOT_START)).toBeCloseTo(spinValue(JACKPOT_START) + CHANCE_BONUS, 12);
    expect(chanceSpinValue(JACKPOT_START).toFixed(5)).toBe('3.96758');
    expect((chanceSpinValue(JACKPOT_START) - JEWEL_SPIN_VALUE).toFixed(5)).toBe('3.94070');
  });
});

describe('the sugoroku board', () => {
  it('is a loop of twelve squares with one fever on it', () => {
    expect(BOARD).toHaveLength(12);
    expect(BOARD[FEVER_SQUARE]).toBe(40);
    expect(Math.max(...BOARD)).toBe(BOARD[FEVER_SQUARE]);
    expect(BOARD.filter((medals) => medals === BOARD[FEVER_SQUARE])).toHaveLength(1);
    expect(BOARD.every((medals) => Number.isInteger(medals) && medals > 0)).toBe(true);
    // Its squares come to 120 medals, ten a roll. They came to 105: the two richest pay 40 and 20 where they paid 30 and 15, and the rest what they did.
    expect([...BOARD]).toEqual([10, 3, 5, 8, 3, 10, 5, 40, 3, 8, 5, 20]);
    expect(BOARD_VALUE).toBe(10);
    expect(BOARD_BEFORE.reduce((sum, medals) => sum + medals, 0)).toBe(105);
    BOARD.forEach((medals, square) => expect(medals).toBeGreaterThanOrEqual(BOARD_BEFORE[square]));
    expect(BOARD.flatMap((medals, square) => (medals > BOARD_BEFORE[square] ? [[square, BOARD_BEFORE[square], medals]] : []))).toEqual([
      [FEVER_SQUARE, 30, 40],
      [11, 15, 20],
    ]);
    expect(squareAfter(0, 3)).toBe(3);
    expect(squareAfter(9, 6)).toBe(3);
    expect(squareAfter(11, 1)).toBe(0);
  });

  it('rolls every face of the die equally often', () => {
    const rng = seededRng(64);
    const rolls = 120_000;
    const seen = Array.from({ length: DIE_FACES + 1 }, () => 0);
    for (let i = 0; i < rolls; i++) seen[drawDie(rng)]++;
    expect(seen[0]).toBe(0);
    for (let face = 1; face <= DIE_FACES; face++) expect(Math.abs(seen[face] / rolls - 1 / DIE_FACES)).toBeLessThan(0.005);
    expect(drawDie(() => 0)).toBe(1);
    expect(drawDie(() => 0.9999999)).toBe(6);
  });

  it('comes to stand on every square equally often, whatever square it started from', () => {
    expect(boardAfter(0)).toEqual([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    const one = boardAfter(1);
    expect(one.slice(1, 7).every((chance) => Math.abs(chance - 1 / 6) < 1e-12)).toBe(true);
    expect(one[0] + one.slice(7).reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(0, 12);
    for (const rolls of [1, 2, 6, 40]) expect(boardAfter(rolls).reduce((sum, chance) => sum + chance, 0)).toBeCloseTo(1, 12);
    const even = 1 / BOARD.length;
    const spread = (rolls: number, from = 0) => Math.max(...boardAfter(rolls, from).map((chance) => Math.abs(chance - even)));
    expect(spread(6)).toBeLessThan(0.013);
    expect(spread(10)).toBeLessThan(0.003);
    expect(spread(60)).toBeLessThan(1e-9);
    expect(spread(60, 7)).toBeLessThan(1e-9);
    // So the long-run worth of a roll is the plain average of the board.
    const worth = boardAfter(200).reduce((sum, chance, square) => sum + chance * BOARD[square], 0);
    expect(worth).toBeCloseTo(BOARD_VALUE, 9);
    expect(() => boardAfter(-1)).toThrow();
    expect(() => boardAfter(1.5)).toThrow();
  });
});

describe('the treasure chests', () => {
  it('hold fifteen, thirty and forty-five medals in an order shuffled every time', () => {
    // Half as much again as the 10, 20 and 30 they held once.
    expect(CHESTS).toEqual([15, 30, 45]);
    expect(CHESTS.map((medals) => medals / 1.5)).toEqual([10, 20, 30]);
    expect(CHEST_VALUE).toBe(30);
    expect(CHEST_TOWERS_FROM).toBe(20);
    const rng = seededRng(5);
    const draws = 60_000;
    const orders = new Map<string, number>();
    const firstChest = new Map<number, number>();
    for (let i = 0; i < draws; i++) {
      const prizes = shuffleChests(rng);
      expect([...prizes].sort((a, b) => a - b)).toEqual([15, 30, 45]);
      orders.set(prizes.join(), (orders.get(prizes.join()) ?? 0) + 1);
      firstChest.set(prizes[0], (firstChest.get(prizes[0]) ?? 0) + 1);
    }
    // All six orders turn up equally often, so every chest holds every prize a third of the time.
    expect(orders.size).toBe(6);
    for (const count of orders.values()) expect(Math.abs(count / draws - 1 / 6)).toBeLessThan(0.008);
    for (const count of firstChest.values()) expect(Math.abs(count / draws - 1 / 3)).toBeLessThan(0.01);
    expect(shuffleChests(() => 0.9999999)).toEqual([15, 30, 45]);
  });
});

describe('the jewels', () => {
  it('come with the treasure line, five to a set, the last of a set paying the bonus as towers', () => {
    expect(JEWEL.lamps).toBe(5);
    expect(JEWEL_TIER).toBe('big');
    expect(TIER_BONUS[JEWEL_TIER]).toBe('chest');
    expect(JEWEL_CHANCE).toBe(tierChance('big'));
    expect(JEWEL_CHANCE).toBeCloseTo(SPIN_TABLE.big / SPIN_TOTAL, 12);
    expect(JEWEL_CHANCE).toBeCloseTo(480 / 25000, 12);
    for (let lit = 0; lit < JEWEL.lamps - 1; lit++) expect(jewelPays(lit)).toEqual({ medals: JEWEL.prize, towers: false });
    expect(jewelPays(JEWEL.lamps - 1)).toEqual({ medals: JEWEL.bonus, towers: true });
    // A small prize at once, and a bonus worth collecting a set for.
    expect(JEWEL.prize).toBe(1);
    expect(JEWEL.bonus).toBe(3);
    expect(JEWEL.bonus).toBeLessThan(CHEST_TOWERS_FROM);
  });

  it('pay a set its medals exactly, which is what a jewel that is collected is worth on average', () => {
    let lit = 0;
    let paid = 0;
    const sets = 40;
    for (let jewel = 0; jewel < sets * JEWEL.lamps; jewel++) {
      const { medals, towers } = jewelPays(lit);
      paid += medals;
      lit = towers ? 0 : lit + 1;
    }
    expect(lit).toBe(0);
    expect(paid).toBe(sets * JEWEL_SET);
    expect(JEWEL_SET).toBe((JEWEL.lamps - 1) * JEWEL.prize + JEWEL.bonus);
    expect(JEWEL_SET).toBe(7);
    expect(JEWEL_VALUE).toBe(JEWEL_SET / JEWEL.lamps);
    expect(JEWEL_VALUE).toBe(1.4);
    // Every jewel is collected in the end, so this is what they add to a spin, exactly.
    expect(JEWEL_SPIN_VALUE).toBeCloseTo(0.0192 * 1.4, 12);
    expect(JEWEL_SPIN_VALUE).toBeCloseTo(0.02688, 12);
  });

  it('are part of what the treasure line and a spin are worth, and a small part: a quarter of a point of return for the best a player can do', () => {
    expect(tierValue(JEWEL_TIER, JACKPOT_START)).toBe(CHEST_VALUE + JEWEL_VALUE);
    for (const tier of TIERS) if (tier !== JEWEL_TIER && tier !== 'miss') expect(tierValue(tier, JACKPOT_START)).toBe(tier === 'small' ? BOARD_VALUE : rouletteValue(JACKPOT_START));
    // Fed down the middle a medal every two seconds, about 58 medals in 100 leave by the front and a spin starts for about one in six.
    const worth = (front: number, spins: number) => front * spins * JEWEL_SPIN_VALUE;
    expect(worth(0.58, 0.167)).toBeGreaterThan(0.0025);
    expect(worth(0.58, 0.167)).toBeLessThan(0.003);
    // Whatever the field does it is under a point.
    expect(worth(1, 0.25)).toBeLessThan(0.01);
  });
});
