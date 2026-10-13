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
  JACKPOT_START,
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

describe('the slot', () => {
  it('has a table that adds up', () => {
    expect(TIERS.reduce((sum, tier) => sum + SPIN_TABLE[tier], 0)).toBe(SPIN_TOTAL);
    expect(TIERS.reduce((sum, tier) => sum + tierChance(tier), 0)).toBeCloseTo(1, 12);
    expect(SPIN_TABLE).toEqual({ miss: 7380, small: 400, big: 150, seven: 70 });
    expect(SPIN_TOTAL).toBe(8000);
    expect(tierChance('seven')).toBe(0.00875);
    expect(tierChance('big')).toBe(0.01875);
    expect(tierChance('small')).toBe(0.05);
    expect(tierChance('miss')).toBe(0.9225);
    // Every winning line comes a quarter more often than it did when the table was 7, 15 and 40 in 1,000.
    expect(tierChance('seven')).toBeCloseTo(1.25 * 0.007, 12);
    expect(tierChance('big')).toBeCloseTo(1.25 * 0.015, 12);
    expect(tierChance('small')).toBeCloseTo(1.25 * 0.04, 12);
    expect(1 - tierChance('miss')).toBeCloseTo(1.25 * (1 - 0.938), 12);
  });

  it('turns a roll into a tier at the right boundaries', () => {
    const upTo = { seven: tierChance('seven'), big: tierChance('seven') + tierChance('big'), small: tierChance('seven') + tierChance('big') + tierChance('small') };
    expect(upTo.seven).toBeCloseTo(0.00875, 12);
    expect(upTo.big).toBeCloseTo(0.0275, 12);
    expect(upTo.small).toBeCloseTo(0.0775, 12);
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
    const wonLong = spin([0.03, 0.3, 0.59]);
    const wonNormal = spin([0.03, 0.3, 0.61]);
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
    expect(reachChance()).toBeCloseTo(0.215875, 6);
    expect(reachChance('long')).toBeCloseTo(0.067256, 6);
    expect(reachChance('normal')).toBeCloseTo(0.148619, 6);
    expect(reachHitChance()).toBeCloseTo(0.359004, 6);
    expect(reachHitChance('long')).toBeCloseTo(0.691386, 6);
    expect(reachHitChance('normal')).toBeCloseTo(0.208587, 6);
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
    expect(JACKPOT_CHANCE).toBeCloseTo((70 / 8000) * (16 / 243), 12);
    expect(Math.round(1 / JACKPOT_CHANCE)).toBe(1736);
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
    // worth has not changed since. What a spin is worth has: `spinThen` is that game's sum, with its table of 40, 15
    // and 7 lines in 1,000 spins, and the spin of today's table is next to it.
    expect(CHALLENGE_CHANCE).toBe(0.19753086419753083);
    expect(HOLE_JACKPOT_CHANCE).toBe(0.3333333333333333);
    expect(BALL_JACKPOT_CHANCE).toBe(0.06584362139917693);
    expect(0.007 * BALL_JACKPOT_CHANCE).toBe(0.00046090534979423856);
    expect(JACKPOT_CHANCE).toBe(0.0005761316872427982);
    const spinThen = (jackpot: number): number => 0.04 * BOARD_VALUE + 0.015 * CHEST_VALUE + 0.007 * rouletteValue(jackpot);
    const then: [jackpot: number, bowl: number, roulette: number, spin: number, spinNow: number][] = [
      [300, 150, 63.734567901234556, 1.0961419753086419, 1.3701774691358024],
      [301, 150.33333333333334, 63.80041152263374, 1.0966028806584363, 1.3707536008230452],
      [337, 162.33333333333334, 66.17078189300412, 1.1131954732510287, 1.391494341563786],
      [500, 216.66666666666666, 76.90329218106994, 1.1883230452674898, 1.4854038065843622],
      [1000, 383.3333333333333, 109.82510288065842, 1.418775720164609, 1.7734696502057612],
      [2000, 716.6666666666666, 175.66872427983535, 1.8796810699588473, 2.3496013374485596],
    ];
    for (const [jackpot, bowl, roulette, spin, spinNow] of then) {
      expect(bowlValue(jackpot)).toBe(bowl);
      expect(rouletteValue(jackpot)).toBe(roulette);
      expect(spinThen(jackpot)).toBe(spin);
      expect(spinValue(jackpot)).toBe(spinNow);
      // Every line a quarter more often is a spin worth a quarter more.
      expect(spinValue(jackpot)).toBeCloseTo(1.25 * spin, 12);
    }
    // And for every jackpot there can be, the three prizes added up and divided by three, as that game had it.
    for (let jackpot = JACKPOT_START; jackpot <= 5000; jackpot++) expect(bowlValue(jackpot)).toBe((jackpot + 50 + 100) / 3);
    // Every whole jackpot from 300 to 5,000 folded into one number, which that game's figures come to as well, and
    // the same fold with a spin of today's table.
    let fold = 0;
    let foldNow = 0;
    for (let jackpot = 300; jackpot <= 5000; jackpot++) {
      fold = (fold * 31 + bowlValue(jackpot) * 7 + rouletteValue(jackpot) * 3 + spinThen(jackpot)) % 1e9;
      foldNow = (foldNow * 31 + bowlValue(jackpot) * 7 + rouletteValue(jackpot) * 3 + spinValue(jackpot)) % 1e9;
    }
    expect(fold).toBe(811751721.9670362);
    expect(foldNow).toBe(795111504.2236023);
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

  it('makes a spin worth a little over a medal and a third', () => {
    expect(TIER_BONUS).toEqual({ small: 'sugoroku', big: 'chest', seven: 'ball' });
    expect(tierValue('miss', JACKPOT_START)).toBe(0);
    expect(tierValue('small', JACKPOT_START)).toBe(BOARD_VALUE);
    expect(tierValue('big', JACKPOT_START)).toBe(CHEST_VALUE);
    expect(tierValue('seven', 900)).toBeCloseTo(rouletteValue(900), 12);
    const expected = tierChance('small') * BOARD_VALUE + tierChance('big') * CHEST_VALUE + tierChance('seven') * rouletteValue(JACKPOT_START);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(expected, 12);
    expect(spinValue(JACKPOT_START)).toBeCloseTo(0.05 * 8.75 + 0.01875 * 20 + 0.00875 * rouletteValue(JACKPOT_START), 12);
    expect(spinValue(JACKPOT_START).toFixed(5)).toBe('1.37018');
    expect(spinValue(900)).toBeCloseTo(1.715856, 5);
  });

  it('makes a gold spin worth what its board and its chests pay twice over, and its ball once', () => {
    expect(CHANCE.multiplier).toBe(2);
    for (const jackpot of [JACKPOT_START, 500, 1000, 2000]) {
      expect(chanceTierValue('miss', jackpot)).toBe(0);
      expect(chanceTierValue('small', jackpot)).toBe(2 * BOARD_VALUE);
      expect(chanceTierValue('big', jackpot)).toBe(2 * CHEST_VALUE);
      expect(chanceTierValue('seven', jackpot)).toBe(rouletteValue(jackpot));
      // What being gold adds is the board's and the chests' share of a spin again, whatever the jackpot stands at.
      expect(chanceSpinValue(jackpot) - spinValue(jackpot)).toBeCloseTo(tierChance('small') * BOARD_VALUE + tierChance('big') * CHEST_VALUE, 12);
    }
    expect(CHANCE_BONUS).toBeCloseTo(0.8125, 12);
    expect(CHANCE_BONUS.toFixed(5)).toBe('0.81250');
    expect(chanceSpinValue(JACKPOT_START).toFixed(5)).toBe('2.18268');
    // A quarter more than they were with the table of 40, 15 and 7 in 1,000, like everything a spin is worth.
    expect(CHANCE_BONUS).toBeCloseTo(1.25 * 0.65, 12);
    expect(chanceSpinValue(JACKPOT_START)).toBeCloseTo(1.25 * 1.7461419753086419, 12);
  });
});

describe('the sugoroku board', () => {
  it('is a loop of twelve squares with one fever on it', () => {
    expect(BOARD).toHaveLength(12);
    expect(BOARD[FEVER_SQUARE]).toBe(30);
    expect(Math.max(...BOARD)).toBe(BOARD[FEVER_SQUARE]);
    expect(BOARD.filter((medals) => medals === 30)).toHaveLength(1);
    expect(BOARD.every((medals) => Number.isInteger(medals) && medals > 0)).toBe(true);
    expect(BOARD_VALUE).toBeCloseTo(105 / 12, 12);
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
  it('hold ten, twenty and thirty medals in an order shuffled every time', () => {
    expect(CHESTS).toEqual([10, 20, 30]);
    expect(CHEST_VALUE).toBe(20);
    expect(CHEST_TOWERS_FROM).toBe(20);
    const rng = seededRng(5);
    const draws = 60_000;
    const orders = new Map<string, number>();
    const firstChest = new Map<number, number>();
    for (let i = 0; i < draws; i++) {
      const prizes = shuffleChests(rng);
      expect([...prizes].sort((a, b) => a - b)).toEqual([10, 20, 30]);
      orders.set(prizes.join(), (orders.get(prizes.join()) ?? 0) + 1);
      firstChest.set(prizes[0], (firstChest.get(prizes[0]) ?? 0) + 1);
    }
    // All six orders turn up equally often, so every chest holds every prize a third of the time.
    expect(orders.size).toBe(6);
    for (const count of orders.values()) expect(Math.abs(count / draws - 1 / 6)).toBeLessThan(0.008);
    for (const count of firstChest.values()) expect(Math.abs(count / draws - 1 / 3)).toBeLessThan(0.01);
    expect(shuffleChests(() => 0.9999999)).toEqual([10, 20, 30]);
  });
});
