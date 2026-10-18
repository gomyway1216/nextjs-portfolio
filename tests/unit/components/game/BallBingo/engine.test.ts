import { describe, expect, it } from 'vitest';

import {
  BALLS_PER_GAME,
  BET_OPTIONS,
  CARD,
  CHANCE_BALLS,
  FREE_GIVES,
  FREE_MOST,
  FULL_CARD,
  FULL_CARD_LINES,
  LINES,
  MOST_LEFT,
  MOST_SHOTS,
  MOST_WIN,
  PAY_TABLE,
  POCKETS,
  START,
  WEIGHT_TOTAL,
  after,
  analyzeMachine,
  drawGame,
  isOpen,
  linesHeld,
  linesOf,
  openPockets,
  over,
  packState,
  paysFor,
  playOut,
  pocketFrom,
  pocketOfNumber,
  randomFor,
  randomsFor,
  reachOf,
  seeded,
  simulateGames,
  stateAfter,
  winOf,
  type GameState,
} from '@/components/game/BallBingo/engine';

// Ball Bingo's rules and their exact odds. The return is pinned to the digit: a change to a pocket's weight, a ball, a
// line's pay or a rule moves it, and has to be made here too.

const idOf = (pocket: number) => POCKETS[pocket].id;
const numberBit = (n: number) => 1 << (n - 1);

describe('the field’s pockets', () => {
  it('are fourteen, out of 144: the numbers 1 to 9 once each, an OUT gutter and a FREE cup on each side, one CHANCE', () => {
    expect(POCKETS).toHaveLength(14);
    expect(WEIGHT_TOTAL).toBe(144);
    expect(POCKETS.filter((p) => p.kind === 'number').map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(POCKETS.filter((p) => p.kind === 'out').map((p) => p.weight)).toEqual([24, 24]);
    expect(POCKETS.filter((p) => p.kind === 'free').map((p) => p.weight)).toEqual([3, 3]);
    expect(POCKETS.filter((p) => p.kind === 'chance').map((p) => p.weight)).toEqual([2]);
    expect(POCKETS.filter((p) => p.kind === 'number').map((p) => p.weight)).toEqual([8, 9, 10, 11, 12, 11, 10, 9, 8]);
    // The middle numbers a little likelier than the ends, the same on either side.
    for (let n = 1; n <= 4; n++) expect(POCKETS[pocketOfNumber(n)].weight).toBe(POCKETS[pocketOfNumber(10 - n)].weight);
    expect(new Set(POCKETS.map((p) => p.id)).size).toBe(14);
  });
});

describe('the card', () => {
  it('is a 3 × 3 card of 1 to 9 whose eight lines each add up to 15', () => {
    expect([...CARD].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(LINES).toHaveLength(8);
    for (const line of LINES) expect(line.reduce((sum, cell) => sum + CARD[cell], 0)).toBe(15);
    // The middle is in four lines, each corner in three, each edge in two.
    const count = (cell: number) => LINES.filter((line) => line.includes(cell)).length;
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map(count)).toEqual([3, 2, 3, 2, 4, 2, 3, 2, 3]);
  });

  it('counts the lines and the REACH numbers of every one of the 512 cards there can be, as the cells say', () => {
    const seen = new Set<number>();
    for (let marks = 0; marks <= FULL_CARD; marks++) {
      const cellMarked = (cell: number) => (marks & numberBit(CARD[cell])) !== 0;
      const held = LINES.filter((line) => line.every(cellMarked)).length;
      expect(linesOf(marks)).toBe(held);
      expect(linesHeld(marks)).toHaveLength(held);
      seen.add(held);
      const reach = new Set<number>();
      for (const line of LINES) {
        const missing = line.filter((cell) => !cellMarked(cell));
        if (missing.length === 1) reach.add(CARD[missing[0]]);
      }
      expect(reachOf(marks)).toEqual([...reach].sort((a, b) => a - b));
    }
    // Seven lines cannot be held: the eighth comes with the seventh.
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 8]);
    expect(linesOf(FULL_CARD)).toBe(FULL_CARD_LINES);
  });

  it('pays by the lines it holds, times the bet: 2, 4, 10, 25, 50, 100, and 500 for the full card', () => {
    expect(PAY_TABLE.map((row) => [row.lines, row.pays])).toEqual([
      [1, 2],
      [2, 4],
      [3, 10],
      [4, 25],
      [5, 50],
      [6, 100],
      [8, 500],
    ]);
    expect(paysFor(0)).toBe(0);
    expect(paysFor(7)).toBe(0);
    expect(BET_OPTIONS).toEqual([1, 2, 3]);
    const topRow = numberBit(2) | numberBit(7) | numberBit(6);
    for (const bet of BET_OPTIONS) {
      expect(winOf(topRow, bet)).toBe(2 * bet);
      expect(winOf(FULL_CARD, bet)).toBe(500 * bet);
      expect(winOf(numberBit(5), bet)).toBe(0);
    }
    expect(MOST_WIN).toBe(1_500);
  });
});

describe('a game’s balls', () => {
  it('start at five; a number marks itself and closes, OUT takes the ball, FREE gives it back with one more, CHANCE keeps it and gives four', () => {
    expect(START).toEqual({ marks: 0, left: BALLS_PER_GAME, frees: 0, chance: false, shots: 0 });
    const five = after(START, pocketOfNumber(5));
    expect(five).toMatchObject({ marks: numberBit(5), left: 4, shots: 1 });
    expect(isOpen(five, pocketOfNumber(5))).toBe(false);
    const out = after(START, POCKETS.findIndex((p) => p.id === 'out-l'));
    expect(out).toMatchObject({ marks: 0, left: 4 });
    const free = after(START, POCKETS.findIndex((p) => p.id === 'free-r'));
    expect(free).toMatchObject({ left: BALLS_PER_GAME + FREE_GIVES, frees: 1 });
    const chance = after(START, POCKETS.findIndex((p) => p.id === 'chance'));
    expect(chance).toMatchObject({ left: BALLS_PER_GAME - 1 + CHANCE_BALLS, chance: true });
    expect(isOpen(chance, POCKETS.findIndex((p) => p.id === 'chance'))).toBe(false);
    // After three free balls both FREE cups shut; OUT never does.
    let state: GameState = START;
    for (let i = 0; i < FREE_MOST; i++) state = after(state, POCKETS.findIndex((p) => p.id === 'free-l'));
    expect(openPockets(state).map(idOf)).not.toContain('free-l');
    expect(openPockets(state).map(idOf)).not.toContain('free-r');
    expect(openPockets(state).map(idOf)).toContain('out-r');
    expect(MOST_LEFT).toBe(BALLS_PER_GAME + FREE_MOST * FREE_GIVES + CHANCE_BALLS - 1);
  });

  it('ends when the balls run out, or when every number is marked', () => {
    expect(over({ ...START, left: 0 })).toBe(true);
    expect(over({ ...START, marks: FULL_CARD, left: 3 })).toBe(true);
    expect(over(START)).toBe(false);
  });

  it('go into a pocket by a random number cut into stretches as long as the open pockets’ weights', () => {
    // Every pocket open: 144 numbers spread evenly over [0, 1) land on each pocket as many times as its weight.
    const counts = new Map<string, number>();
    for (let k = 0; k < WEIGHT_TOTAL; k++) {
      const pocket = idOf(pocketFrom(START, (k + 0.5) / WEIGHT_TOTAL));
      counts.set(pocket, (counts.get(pocket) ?? 0) + 1);
    }
    for (const p of POCKETS) expect(counts.get(p.id), p.id).toBe(p.weight);
    // With some pockets closed the open ones share the line in proportion to their weights.
    const some: GameState = { marks: numberBit(5) | numberBit(1), left: 3, frees: FREE_MOST, chance: true, shots: 6 };
    const open = openPockets(some);
    const total = open.reduce((sum, i) => sum + POCKETS[i].weight, 0);
    expect(total).toBe(WEIGHT_TOTAL - 12 - 8 - 6 - 2);
    const tally = new Map<number, number>();
    const steps = total * 20;
    for (let k = 0; k < steps; k++) {
      const pocket = pocketFrom(some, (k + 0.5) / steps);
      tally.set(pocket, (tally.get(pocket) ?? 0) + 1);
    }
    for (const i of open) expect(tally.get(i), idOf(i)).toBe(POCKETS[i].weight * 20);
    for (const i of open) expect(pocketFrom(some, randomFor(some, i))).toBe(i);
    expect(() => randomFor(some, pocketOfNumber(5))).toThrow();
    // The ends of the line stay in it.
    expect(isOpen(some, pocketFrom(some, 0))).toBe(true);
    expect(isOpen(some, pocketFrom(some, 0.9999999999))).toBe(true);
  });

  it('are drawn all at once, a whole game a machine could have drawn, and the numbers for a game draw that game again', () => {
    const random = seeded(20261018);
    for (let g = 0; g < 3000; g++) {
      const draws = drawGame(random);
      const played = playOut(draws);
      expect(played).not.toBeNull();
      expect(draws.length).toBeLessThanOrEqual(MOST_SHOTS);
      expect(over(played!.end)).toBe(true);
      const queue = randomsFor(draws);
      expect(drawGame(() => queue.shift()!)).toEqual(draws);
      expect(stateAfter(draws, draws.length)).toEqual(played!.end);
    }
  });

  it('are refused as a game when they could not have been drawn', () => {
    const five = pocketOfNumber(5);
    const out = POCKETS.findIndex((p) => p.id === 'out-l');
    expect(playOut([out, out, out, out, out])).not.toBeNull();
    // The same number twice; a ball after the game was over; a game not over; something that is not a pocket.
    expect(playOut([five, five, out, out, out])).toBeNull();
    expect(playOut([out, out, out, out, out, out])).toBeNull();
    expect(playOut([out, out, out, out])).toBeNull();
    expect(playOut([out, out, out, out, 99])).toBeNull();
    expect(playOut([out, out, out, out, 1.5])).toBeNull();
    // A fourth free ball, once the FREE cups have shut.
    const free = POCKETS.findIndex((p) => p.id === 'free-l');
    expect(playOut([free, free, free, out, out, out, out, out, out, out, out])).not.toBeNull();
    expect(playOut([free, free, free, free, out, out, out, out, out, out, out, out, out])).toBeNull();
  });
});

describe('the exact odds', () => {
  const odds = analyzeMachine();

  it('give back 89.974% of every medal bet, worked out over every state a game can be in', () => {
    expect(odds.rtp).toBeCloseTo(0.8997431332867973, 13);
    expect(odds.edge).toBeCloseTo(1 - 0.8997431332867973, 13);
    expect(odds.states).toBe(18_501);
    // About 90%, as medal games are set: never more than 100%, and never far under.
    expect(odds.rtp).toBeGreaterThan(0.89);
    expect(odds.rtp).toBeLessThan(0.91);
  });

  it('give the chance of every count of lines at the end of a game, summing to one', () => {
    const chances = odds.lines.map((row) => row.chance);
    const pinned = [
      0.7299927519526367, 0.21936594110356122, 0.036496049714390674, 0.009689436514049422, 0.002776522291996105, 0.0010117893580298613, 0.000589060926969266, 0,
      0.0000784481383665911,
    ];
    chances.forEach((chance, lines) => expect(chance, `${lines} lines`).toBeCloseTo(pinned[lines], 15));
    expect(chances.reduce((sum, c) => sum + c, 0)).toBeCloseTo(1, 13);
    expect(odds.lines[7].chance).toBe(0);
    expect(odds.hit).toBeCloseTo(1 - pinned[0], 13);
    // The full card: about one game in 12,747.
    expect(Math.round(1 / odds.fullCard)).toBe(12_747);
    // Each line count's share adds up to the return.
    expect(odds.lines.reduce((sum, row) => sum + row.share, 0)).toBeCloseTo(odds.rtp, 13);
    for (const row of odds.lines) expect(row.share).toBeCloseTo(row.chance * row.pays, 15);
  });

  it('give the chance of CHANCE TIME and of a free ball, and what a game shoots and marks on average', () => {
    expect(odds.chanceTime).toBeCloseTo(0.08221498966321465, 13);
    expect(odds.anyFree).toBeCloseTo(0.22206271157133006, 13);
    expect(odds.meanFrees).toBeCloseTo(0.2742606523055076, 13);
    expect(odds.meanShots).toBeCloseTo(5.877361344525222, 12);
    expect(odds.meanMarks).toBeCloseTo(3.309873914389649, 12);
    expect(odds.chanceShare).toBeCloseTo(0.4443728200334188, 12);
    expect(odds.sd).toBeCloseTo(5.602521770976472, 11);
    expect(odds.gamesForOnePercent).toBe(1_205_812);
  });

  it('agree with a reckoning of their own, carried forward a ball at a time from the start', () => {
    // Every state reachable, with its chance, ball by ball; a state where the game is over keeps its chance as an end.
    let layer = new Map<number, { state: GameState; p: number }>([[packState(START), { state: START, p: 1 }]]);
    const ends = new Array<number>(9).fill(0);
    let chanceTime = 0;
    let shots = 0;
    for (let ball = 0; layer.size > 0; ball++) {
      const nextLayer = new Map<number, { state: GameState; p: number }>();
      for (const { state, p } of layer.values()) {
        if (over(state)) {
          ends[linesOf(state.marks)] += p;
          if (state.chance) chanceTime += p;
          continue;
        }
        shots += p;
        const open = openPockets(state);
        const total = open.reduce((sum, i) => sum + POCKETS[i].weight, 0);
        for (const pocket of open) {
          const to = after(state, pocket);
          const key = packState(to) | (to.shots << 16);
          const was = nextLayer.get(key);
          nextLayer.set(key, { state: to, p: (was?.p ?? 0) + (p * POCKETS[pocket].weight) / total });
        }
      }
      layer = nextLayer;
      expect(ball).toBeLessThanOrEqual(MOST_SHOTS);
    }
    ends.forEach((p, lines) => expect(p, `${lines} lines`).toBeCloseTo(odds.lines[lines].chance, 13));
    expect(ends.reduce((sum, p, lines) => sum + p * paysFor(lines), 0)).toBeCloseTo(odds.rtp, 13);
    expect(chanceTime).toBeCloseTo(odds.chanceTime, 13);
    expect(shots).toBeCloseTo(odds.meanShots, 12);
  });

  it('are what games played come to, within their spread (a check on the reckoning, never its source)', () => {
    const games = 40_000;
    const played = simulateGames(games, seeded(77));
    const seen = played.back / games;
    expect(Math.abs(seen - odds.rtp)).toBeLessThan((4 * odds.sd) / Math.sqrt(games));
    for (const lines of [0, 1, 2]) {
      const p = odds.lines[lines].chance;
      expect(Math.abs(played.byLines[lines] / games - p), `${lines} lines`).toBeLessThan(5 * Math.sqrt((p * (1 - p)) / games));
    }
    const pc = odds.chanceTime;
    expect(Math.abs(played.chanceTimes / games - pc)).toBeLessThan(5 * Math.sqrt((pc * (1 - pc)) / games));
  });
});
