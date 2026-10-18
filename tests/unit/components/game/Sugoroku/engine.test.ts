import { describe, expect, it } from 'vitest';

import {
  BETS,
  BET_MOST,
  BLOWHOLE,
  BOARD,
  BOARD_SIZE,
  DRAW_NUMBERS,
  FACES,
  JP_FACE,
  JP_LAMPS,
  JP_MISS_PAYS,
  JP_PAYS,
  LAMPS,
  LAMP_COUNT,
  LANE,
  LANE_SIZE,
  LAP_PAYS,
  RIDE_ROLLS,
  ROLL_WAYS,
  SPECIAL_DEN,
  SPECIAL_NUM,
  STAR,
  START,
  UNIT,
  analyzeBoard,
  checkRolls,
  drawFrom,
  drawPlay,
  faceFrom,
  isArrow,
  isBet,
  isDraw,
  labelOf,
  medalsFor,
  numberForFace,
  numberForLamp,
  outcomesFrom,
  playOf,
  seeded,
  valueOf,
  wonFor,
  type Draw,
  type Fraction,
} from '@/components/game/Sugoroku/engine';

// Whale Isle Sugoroku's rules and its exact odds. The figures pinned here are the machine's published ones (the Odds
// tab, the floor's rules): any change to the board, the lamps, the whale's back or the bets has to change them here.

const ratio = (f: Fraction): string => `${f.num}/${f.den}`;
const draw = (roll: number, extra: Partial<Draw> = {}): Draw => ({ roll, ride: [1, 1, 1], lamp: 0, final: 1, ...extra });
/** The value of a square when the boat stops on it: what it pays, or for a special square what it is worth on average. */
const SPECIAL = SPECIAL_NUM / SPECIAL_DEN;

describe('the board', () => {
  it('is 30 squares in a loop, every sixth one special: START, a lamp chance, the whale, a lamp chance and the JP chance', () => {
    expect(BOARD_SIZE).toBe(30);
    expect(BOARD[START].kind).toBe('start');
    expect([0, 6, 12, 18, 24].map((s) => BOARD[s].kind)).toEqual(['start', 'lamp', 'whale', 'lamp', 'jp']);
    // Between them a shell, a pearl, a palm, a shell and a shell, or an arrow standing in for one of them.
    const worth = (s: number): number => {
      const square = BOARD[s];
      if (isArrow(square.kind)) return worth(square.to!);
      return square.kind === 'start' ? 0 : square.kind === 'lamp' || square.kind === 'jp' || square.kind === 'whale' ? SPECIAL : square.pays;
    };
    for (let s = 0; s < BOARD_SIZE; s++) {
      if (s % 6 === 0) continue;
      expect(worth(s), `square ${s}`).toBe([0, 1, 2, 0, 1, 1][s % 6]);
    }
  });

  it('has arrows that carry the boat only to a square of their own kind, never onto another arrow, and never across START', () => {
    const arrows = BOARD.flatMap((square, s) => (isArrow(square.kind) ? [{ s, square }] : []));
    expect(arrows.map(({ s, square }) => `${s} ${square.kind} → ${square.to}`)).toEqual(['7 tailwind → 10', '9 storm → 3', '15 whirlpool → 0', '17 current → 13', '20 tailwind → 26']);
    for (const { s, square } of arrows) {
      const to = square.to!;
      expect(isArrow(BOARD[to].kind), `${s}`).toBe(false);
      if (square.kind === 'tailwind') expect(to).toBeGreaterThan(s);
      else expect(to).toBeLessThan(s);
    }
  });

  it('pays the lap bonus for sailing past START, or onto it, and not for being sent back to it', () => {
    expect(playOf(28, draw(2))).toMatchObject({ hops: [29, 0], lap: true, landed: 0, to: 0, pays: LAP_PAYS });
    expect(playOf(29, draw(4))).toMatchObject({ hops: [0, 1, 2, 3], lap: true, to: 3, pays: LAP_PAYS });
    expect(playOf(27, draw(5))).toMatchObject({ lap: true, to: 2, pays: LAP_PAYS + 2 });
    // The whirlpool: back to START, ふりだしに戻る.
    expect(playOf(11, draw(4))).toMatchObject({ landed: 15, sent: { kind: 'whirlpool', to: 0, through: [0] }, lap: false, to: 0, pays: 0 });
  });

  it('moves the boat by an arrow square by square, and the square it is carried to counts', () => {
    expect(playOf(4, draw(3))).toMatchObject({ landed: 7, sent: { kind: 'tailwind', to: 10, through: [8, 9, 10] }, stop: 10, pays: 1 });
    expect(playOf(4, draw(5))).toMatchObject({ landed: 9, sent: { kind: 'storm', to: 3, through: [8, 7, 6, 5, 4, 3] }, stop: 3, pays: 0 });
    expect(playOf(13, draw(4))).toMatchObject({ landed: 17, sent: { kind: 'current', to: 13, through: [16, 15, 14, 13] }, pays: 1 });
    expect(playOf(19, draw(1))).toMatchObject({ landed: 20, sent: { kind: 'tailwind', to: 26 }, to: 26, pays: 2 });
  });
});

describe('the chances', () => {
  it('a LAMP CHANCE: 12 lamps of 1 to 20, 37/6 each on average', () => {
    expect(LAMP_COUNT).toBe(12);
    expect(LAMPS.reduce((a, b) => a + b, 0)).toBe(74);
    expect(Math.min(...LAMPS)).toBe(2);
    expect(Math.max(...LAMPS)).toBe(20);
    expect(playOf(0, draw(6, { lamp: 0 }))).toMatchObject({ chance: { kind: 'lamp', lamp: 0, pays: 20 }, pays: 20 });
  });

  it('a JP CHANCE: the star and 11 lamps; at the star the die again, a 6 the jackpot of 100 times the bet', () => {
    expect(JP_LAMPS.filter((lamp) => lamp === STAR)).toHaveLength(1);
    const star = JP_LAMPS.indexOf(STAR);
    const rest = JP_LAMPS.filter((lamp): lamp is number => lamp !== STAR).reduce((a, b) => a + b, 0);
    // The star is worth (200 + 5 × 8) / 6 = 40; with the other lamps' 34, 74 over 12: the same 37/6 as the lamps.
    expect((JP_PAYS + (FACES - 1) * JP_MISS_PAYS) / FACES + rest).toBe(74);
    expect(medalsFor(10, JP_PAYS)).toBe(1_000);
    for (const bet of BETS) expect(medalsFor(bet, JP_PAYS)).toBe(100 * bet);
    expect(playOf(18, draw(6, { lamp: star, final: JP_FACE }))).toMatchObject({ chance: { kind: 'jp', star: true, final: 6, jackpot: true, pays: 200 }, jackpot: true, pays: 200 });
    expect(playOf(18, draw(6, { lamp: star, final: 3 }))).toMatchObject({ chance: { kind: 'jp', star: true, jackpot: false, pays: JP_MISS_PAYS }, jackpot: false });
    expect(playOf(18, draw(6, { lamp: 3 }))).toMatchObject({ chance: { kind: 'jp', star: false, final: null, pays: 0 }, pays: 0 });
  });

  it('a WHALE RIDE: three free rolls up the whale’s back, each square paying, and the JP CHANCE at the blowhole', () => {
    expect(LANE_SIZE).toBe(10);
    expect(RIDE_ROLLS).toBe(3);
    // 2, 3, 4: squares 2 (2), 5 (1) and 9 (1).
    expect(playOf(6, draw(6, { ride: [2, 3, 4] }))).toMatchObject({
      stop: 12,
      ride: { blowhole: false, steps: [{ roll: 2, hops: [1, 2], at: 2, pays: 2 }, { roll: 3, at: 5, pays: 1 }, { roll: 4, at: 9, pays: 1 }] },
      chance: null,
      to: 12,
      pays: 4,
    });
    // 4, 6, then past the tenth: the blowhole, and the JP star's final on a 6.
    const star = JP_LAMPS.indexOf(STAR);
    const jackpot = playOf(6, draw(6, { ride: [4, 6, 5], lamp: star, final: 6 }));
    expect(jackpot.ride?.steps.map((step) => step.at)).toEqual([4, 10, BLOWHOLE]);
    expect(jackpot.ride?.steps[2].hops).toEqual([BLOWHOLE]);
    expect(jackpot).toMatchObject({ jackpot: true, to: 12, pays: LANE[3] + LANE[9] + JP_PAYS });
    expect(labelOf(jackpot)).toBe('sugoroku-jp');
    expect(labelOf(playOf(6, draw(6, { ride: [2, 3, 4] })))).toBe('whale-ride');
    expect(labelOf(playOf(0, draw(1)))).toBeNull();
  });
});

describe('the draw', () => {
  it('takes six numbers in [0, 1), always and in order: the die, the whale’s three rolls, the lamp, the final', () => {
    expect(DRAW_NUMBERS).toBe(6);
    const numbers = [0.99, 0.01, 0.5, 0.7, numberForLamp(5), numberForFace(6)];
    let i = 0;
    const drawn = drawPlay(() => numbers[i++]);
    expect(i).toBe(6);
    expect(drawn).toEqual({ roll: 6, ride: [1, 4, 5], lamp: 5, final: 6 });
    expect(drawFrom(numbers)).toEqual(drawn);
    for (let face = 1; face <= FACES; face++) expect(faceFrom(numberForFace(face))).toBe(face);
    expect(faceFrom(0)).toBe(1);
    expect(faceFrom(0.999999)).toBe(6);
    expect(isDraw(drawn)).toBe(true);
    for (const bad of [null, { ...drawn, roll: 7 }, { ...drawn, ride: [1, 2] }, { ...drawn, lamp: 12 }, { ...drawn, final: 0 }, { ...drawn, ride: [1, 2, 0.5] }]) expect(isDraw(bad)).toBe(false);
    expect(isBet(4)).toBe(true);
    expect(isBet(5)).toBe(false);
    expect(UNIT).toBe(2);
    expect(BET_MOST).toBe(10);
  });

  it('weighs every way a roll can go exactly: the weights from every square add up to every way a roll can be drawn', () => {
    expect(ROLL_WAYS).toBe(6 * 216 * 12 * 6);
    for (let s = 0; s < BOARD_SIZE; s++) expect(outcomesFrom(s).reduce((sum, { weight }) => sum + weight, 0), `square ${s}`).toBe(ROLL_WAYS);
  });

  it('agrees with every one of the 93,312 draws, made as the machine makes them, from the squares before the whale and the JP chance', () => {
    for (const from of [6, 18]) {
      let pays = 0;
      for (let a = 0; a < 6; a++)
        for (let b = 0; b < 216; b++)
          for (let c = 0; c < 12; c++)
            for (let d = 0; d < 6; d++) {
              const numbers = [(a + 0.5) / 6, (Math.floor(b / 36) + 0.5) / 6, ((Math.floor(b / 6) % 6) + 0.5) / 6, ((b % 6) + 0.5) / 6, (c + 0.5) / 12, (d + 0.5) / 6];
              pays += playOf(from, drawFrom(numbers)).pays;
            }
      const byWeights = outcomesFrom(from).reduce((sum, { weight, play }) => sum + weight * play.pays, 0);
      expect(pays, `from ${from}`).toBe(byWeights);
    }
  });
});

describe('the exact odds', () => {
  const odds = analyzeBoard();

  it('makes every special square worth the same, 37/12 of the bet: the lamps, the JP chance and the whale ride', () => {
    for (const value of [odds.lampChance, odds.jpChance, odds.whaleRide]) expect(ratio(value)).toBe('37/12');
  });

  it('brings back 67/72 (93.06%) on the next roll from every square but the six before START', () => {
    const expected: Record<number, string> = { 24: '1/2', 25: '7/12', 26: '2/3', 27: '3/4', 28: '5/6', 29: '11/12' };
    for (const s of odds.standing) expect(ratio(odds.returns[s]), `square ${s}`).toBe(expected[s] ?? '67/72');
    expect(odds.standing).toEqual(BOARD.flatMap((square, s) => (isArrow(square.kind) ? [] : [s])));
  });

  it('pins the best and the worst square, and keeps every square’s next roll under 95%', () => {
    expect(ratio(odds.best)).toBe('67/72');
    expect(valueOf(odds.best)).toBeCloseTo(0.930556, 6);
    expect(valueOf(odds.best)).toBeLessThanOrEqual(0.95);
    expect(odds.worstSquares).toEqual([24]);
    expect(ratio(odds.worst)).toBe('1/2');
    for (const s of odds.standing) expect(valueOf(odds.returns[s])).toBeLessThanOrEqual(valueOf(odds.best));
  });

  it('brings back 89.74% in the long run of steady play, from the chain’s stationary distribution, solved exactly', () => {
    expect(ratio(odds.longRun)).toBe('40054856905809077/44632478427254550');
    expect(valueOf(odds.longRun)).toBeCloseTo(0.897437, 6);
    // The stationary distribution is one: it adds up to 1, nobody stands on an arrow, and it is left as it is by a roll.
    const total = odds.rests.reduce((sum, rest) => sum + valueOf(rest), 0);
    expect(total).toBeCloseTo(1, 12);
    for (let s = 0; s < BOARD_SIZE; s++) expect(valueOf(odds.rests[s]) === 0, `square ${s}`).toBe(isArrow(BOARD[s].kind));
  });

  it('agrees with the chain worked out a second way: plain numbers, the boat’s whereabouts rolled forward until they settle', () => {
    let where = new Array<number>(BOARD_SIZE).fill(0);
    where[START] = 1;
    for (let round = 0; round < 2_000; round++) {
      const next = new Array<number>(BOARD_SIZE).fill(0);
      for (let s = 0; s < BOARD_SIZE; s++) {
        if (where[s] === 0) continue;
        for (let roll = 1; roll <= FACES; roll++) next[playOf(s, draw(roll)).to] += where[s] / FACES;
      }
      // Averaged with the last, so that the walk settles whatever its period.
      where = next.map((v, i) => (v + where[i]) / 2);
    }
    const back = where.reduce((sum, rest, s) => sum + rest * valueOf(odds.returns[s]), 0);
    expect(back).toBeCloseTo(valueOf(odds.longRun), 9);
    for (let s = 0; s < BOARD_SIZE; s++) expect(where[s]).toBeCloseTo(valueOf(odds.rests[s]), 9);
  });

  it('lets no choice of bet by the square beat the machine: the best brings back 92.30%, betting 10 on every square but the six before START', () => {
    expect(ratio(odds.betting.value)).toBe('904645916935578143/980099071737322878');
    expect(valueOf(odds.betting.value)).toBeCloseTo(0.923015, 6);
    expect(odds.betting.bigOn).toEqual(odds.standing.filter((s) => s < 24));
    expect(valueOf(odds.betting.value)).toBeLessThan(1);
  });

  it('pays the lap bonus about once in 11 rolls, a chance or the whale most rolls between, and the jackpot about once in 1,879 rolls', () => {
    const every = (f: Fraction) => 1 / valueOf(f);
    expect(every(odds.chances.lap)).toBeCloseTo(11.109, 3);
    expect(valueOf(odds.chances.paid)).toBeCloseTo(0.8418, 4);
    expect(every(odds.chances.lamp)).toBeCloseTo(11.739, 3);
    expect(every(odds.chances.ride)).toBeCloseTo(28.052, 3);
    expect(every(odds.chances.jackpot)).toBeCloseTo(1878.93, 2);
    expect(odds.mostPays).toBe(204);
    expect(medalsFor(BET_MOST, odds.mostPays)).toBe(1_020);
  });

  it('a check by play comes close to the exact figure', () => {
    const check = checkRolls(60_000, seeded(7));
    expect(check.rolls).toBe(60_000);
    expect(Math.abs(check.back - valueOf(odds.longRun))).toBeLessThan(0.03);
    expect(check.laps / check.rolls).toBeCloseTo(valueOf(odds.chances.lap), 2);
  });

  it('pays every roll in whole medals on every bet', () => {
    for (let s = 0; s < BOARD_SIZE; s++) for (const { play } of outcomesFrom(s)) for (const bet of BETS) expect(Number.isInteger(wonFor(bet, play))).toBe(true);
  });
});
