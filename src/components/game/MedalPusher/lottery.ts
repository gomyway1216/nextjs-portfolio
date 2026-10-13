/**
 * The digital half of the machine: the number slot on the centre screen and
 * the three games it leads to — a sugoroku board, a choice of treasure chests,
 * and the roulette a prize ball starts when it is pushed over the front, which
 * ends in three bowls with the jackpot at the bottom when its run is full.
 * Unlike the field, these are pure lotteries — every result is drawn first and
 * the screen only acts it out — so their odds are exact and are listed on the
 * Odds tab.
 */

export const TIERS = ['miss', 'small', 'big', 'seven'] as const;
export type Tier = (typeof TIERS)[number];

/**
 * Chances out of 25,000 spins: a sugoroku line about once in 20, a treasure
 * line in 54, three sevens in 115. The three stand to each other as they
 * always have, 40 to 15 to 7, and each comes 1.24 times as often as it did
 * while the START pockets were wider, when it was 40, 15 and 7 in 1,000:
 * fewer medals start a spin now, and each spin is worth more. That multiple
 * is one of the two numbers the machine's return is tuned with, the other
 * being how wide the pockets' wings open (`CHECKERS.wingWidth` in
 * engine.ts): scripts/medal-pusher-tune.ts measures both.
 */
export const SPIN_TABLE: Record<Tier, number> = { miss: 23078, small: 1240, big: 465, seven: 217 };
export const SPIN_TOTAL = 25000;

/** What a line leads to: a roll on the sugoroku board, a choice of chests, or a prize ball on the field. */
export type Bonus = 'sugoroku' | 'chest' | 'ball';
export const TIER_BONUS: Record<Exclude<Tier, 'miss'>, Bonus> = { small: 'sugoroku', big: 'chest', seven: 'ball' };

/** The digits each winning tier can line up. */
export const TIER_DIGITS: Record<Exclude<Tier, 'miss'>, readonly number[]> = {
  small: [2, 4, 6, 8],
  big: [1, 3, 5, 9],
  seven: [7],
};

/** Share of losing spins that tease with two matching digits before missing. */
export const REACH_RATE = 0.15;

/** How a spin's reach is played: not at all, the usual one, or the long one that draws the suspense out. */
export const REACH_KINDS = ['none', 'normal', 'long'] as const;
export type ReachKind = (typeof REACH_KINDS)[number];

/**
 * The chance that a reach is played long: for a spin that has won, and for one
 * that has lost. The spin is drawn first, so this decides only how it is shown.
 */
export const LONG_REACH = { win: 0.6, miss: 0.15 } as const;

export interface SpinResult {
  tier: Tier;
  /** Left, centre and right reel. The centre stops last. */
  digits: [number, number, number];
  /** Whether the left and right reels match, so the centre decides it. */
  reach: boolean;
  /** How that reach is played: 'none' exactly when there is no reach. */
  reachKind: ReachKind;
}

const pick = <T>(items: readonly T[], rng: () => number): T => items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
const digit = (rng: () => number): number => 1 + Math.min(8, Math.floor(rng() * 9));

/** The tier a roll lands on, for a roll in [0, 1). */
export function tierFor(roll: number): Tier {
  let threshold = 0;
  for (const tier of ['seven', 'big', 'small'] as const) {
    threshold += SPIN_TABLE[tier] / SPIN_TOTAL;
    if (roll < threshold) return tier;
  }
  return 'miss';
}

/** How a reach is played, drawn once the spin itself is settled: long more often when the line has won. */
const reachKindFor = (won: boolean, rng: () => number): ReachKind => (rng() < (won ? LONG_REACH.win : LONG_REACH.miss) ? 'long' : 'normal');

/** Draws one spin: the tier first, then digits that show it, then how its reach is played. */
export function drawSpin(rng: () => number): SpinResult {
  const tier = tierFor(rng());
  if (tier !== 'miss') {
    const d = pick(TIER_DIGITS[tier], rng);
    return { tier, digits: [d, d, d], reach: true, reachKind: reachKindFor(true, rng) };
  }
  const left = digit(rng);
  if (rng() < REACH_RATE) {
    // Two alike and a centre reel that stops one short or one past.
    const centre = ((left - 1 + (rng() < 0.5 ? 1 : 8)) % 9) + 1;
    return { tier, digits: [left, centre, left], reach: true, reachKind: reachKindFor(false, rng) };
  }
  let right = digit(rng);
  if (right === left) right = (right % 9) + 1;
  return { tier, digits: [left, digit(rng), right], reach: false, reachKind: 'none' };
}

// ── The sugoroku board ──────────────────────────────────────────────────────

/**
 * The board: a loop of twelve squares, each paying the medals written on it
 * to whoever lands there. The piece stays where it stopped until the next roll.
 */
export const BOARD = [10, 3, 5, 8, 3, 10, 5, 30, 3, 8, 5, 15] as const;
/** The square that pays its medals as a fever: the big one. */
export const FEVER_SQUARE = 7;
export const DIE_FACES = 6;

/** One roll of the die: 1 to 6. */
export const drawDie = (rng: () => number): number => 1 + Math.min(DIE_FACES - 1, Math.floor(rng() * DIE_FACES));

/** The square a piece on `from` reaches with a roll of `roll`. */
export const squareAfter = (from: number, roll: number): number => (from + roll) % BOARD.length;

/**
 * Medals a roll pays on average. A die that moves 1 to 6 round a loop visits
 * every square equally often in the long run, wherever the piece began, so
 * this is simply the average of the board.
 */
export const BOARD_VALUE = BOARD.reduce<number>((sum, medals) => sum + medals, 0) / BOARD.length;

/**
 * The exact chance of standing on each square after `rolls` rolls from `from`:
 * how quickly "every square equally often" becomes true.
 */
export function boardAfter(rolls: number, from = 0): number[] {
  if (!Number.isInteger(rolls) || rolls < 0) throw new Error('rolls must be a whole number');
  let chances: number[] = BOARD.map((_, square) => (square === from ? 1 : 0));
  for (let i = 0; i < rolls; i++) {
    const next: number[] = BOARD.map(() => 0);
    chances.forEach((chance, square) => {
      for (let roll = 1; roll <= DIE_FACES; roll++) next[squareAfter(square, roll)] += chance / DIE_FACES;
    });
    chances = next;
  }
  return chances;
}

// ── The treasure chests ─────────────────────────────────────────────────────

/** What the three chests hold. Which chest holds which is shuffled every time. */
export const CHESTS = [10, 20, 30] as const;
/** A chest holding this much or more is paid as towers; less is thrown on loose. */
export const CHEST_TOWERS_FROM = 20;

/** The three prizes in the order the chests hold them, left to right. */
export function shuffleChests(rng: () => number): number[] {
  const prizes: number[] = [...CHESTS];
  for (let i = prizes.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    [prizes[i], prizes[j]] = [prizes[j], prizes[i]];
  }
  return prizes;
}

/** Medals a choice of chest pays on average: each prize is as likely as the next, whichever chest is picked. */
export const CHEST_VALUE = CHESTS.reduce<number>((sum, medals) => sum + medals, 0) / CHESTS.length;

// ── The ball's roulette ─────────────────────────────────────────────────────

/** One pocket of the roulette: medals for the tower, or the cross that ends the run. */
export type Pocket = 'stop' | number;

/**
 * The twelve pockets in the order they sit on the wheel, each as likely as the
 * next. A number adds that many medals to the towers on the pusher and the
 * roulette turns again; a cross ends the run.
 */
export const ROULETTE: readonly Pocket[] = ['stop', 10, 20, 30, 'stop', 10, 20, 50, 'stop', 10, 20, 'stop'];

/** Numbers in a row, with no cross, that start the jackpot challenge: the ball in the bowl. */
export const CHAIN_GOAL = 4;

/** The jackpot starts here and grows by one medal for every `JACKPOT_STEP` medals played. */
export const JACKPOT_START = 300;
export const JACKPOT_STEP = 40;

export const drawPocket = (rng: () => number): number => Math.min(ROULETTE.length - 1, Math.floor(rng() * ROULETTE.length));

const NUMBERS = ROULETTE.filter((pocket): pocket is number => pocket !== 'stop');
/** The chance that a turn lands on a number, so the run goes on. */
export const CONTINUE_CHANCE = NUMBERS.length / ROULETTE.length;
/** The average a numbered pocket pays. */
export const POCKET_VALUE = NUMBERS.reduce((sum, medals) => sum + medals, 0) / NUMBERS.length;

/** The chance that a run gets as far as `level` numbers in a row. */
export const chainChance = (level: number): number => CONTINUE_CHANCE ** level;

// ── The jackpot challenge: three bowls, one under another ───────────────────

/** What the challenge can end in: the jackpot, or that many medals. */
export type Hole = 'jackpot' | number;

/**
 * The three ends the challenge can come to, each as likely as the next. They
 * are what they were when the challenge was one bowl with a hole for each.
 */
export const BOWL: readonly Hole[] = ['jackpot', 50, 100];

/** A hole of one of the bowls: it lets the ball down into the bowl below, or ends the challenge with what it holds. */
export type BowlHole = 'down' | Hole;

/**
 * The bowls a full run ends in, the top one first, and what each of their
 * holes does. The ball rolls round a bowl and drops into one of its holes,
 * each as likely as the next: through to the bowl below, or out with a prize.
 * Two of the top bowl's three holes lead down and one of the middle bowl's
 * two, so a third of the balls get to the bottom bowl, whose one hole is the
 * jackpot's. The top bowl's other hole takes a third of them, and the middle
 * bowl's other hole half of the two thirds it is left with. So the three
 * ends in BOWL are as likely as each other, as they always were.
 */
export const BOWLS: readonly (readonly BowlHole[])[] = [['down', 'down', 50], ['down', 100], ['jackpot']];

/** One way down the bowls: the hole the ball takes in each bowl it gets to, the top bowl's first. */
export type Fall = readonly number[];

/** What a fall ends in: what the last hole it takes holds. */
export function fallEnd(fall: Fall): Hole {
  const hole = BOWLS[fall.length - 1]?.[fall[fall.length - 1]];
  if (hole === undefined || hole === 'down') throw new Error('a fall ends in a hole that holds a prize');
  return hole;
}

/**
 * Every way down, listed so that each entry is as likely as the next: a fall
 * that ends in the top bowl stands twice, once for each hole of the middle
 * bowl it never gets to. A fall is drawn by picking one of the six. They are
 * in the order of the ends in BOWL, two for each, so a draw comes to the end
 * it came to when the challenge was one bowl: the first third of the draws to
 * the jackpot, the next to 50 and the last to 100.
 */
export const FALLS: readonly Fall[] = [[0, 0, 0], [1, 0, 0], [2], [2], [0, 1], [1, 1]];

/** Draws the way the ball will go down the bowls, as an index into FALLS. */
export const drawFall = (rng: () => number): number => Math.min(FALLS.length - 1, Math.floor(rng() * FALLS.length));

/** The chance that the ball, once it is in the top bowl, gets as far as `bowl`, counted from the top. */
export const bowlChance = (bowl: number): number => FALLS.filter((fall) => fall.length > bowl).length / FALLS.length;
/** The chance that it gets there and drops into that bowl's hole `hole`. */
export const holeChance = (bowl: number, hole: number): number => FALLS.filter((fall) => fall[bowl] === hole).length / FALLS.length;

/** Medals a hole pays when the jackpot stands at `jackpot`. */
export const holePays = (hole: Hole, jackpot: number): number => (hole === 'jackpot' ? jackpot : hole);

/**
 * The share of what the bowls pay that the machine pours onto the field
 * loose. The rest goes up on the pusher as towers, as far as the pusher has
 * free places for them: what those cannot hold is poured as well.
 */
export const BOWL_POURED = 0.3;
/** How many of `medals` paid by the bowls are poured loose whatever room the pusher has: the fewest that ever are. */
export const pouredOf = (medals: number): number => Math.round(medals * BOWL_POURED);

/** Medals the bowls pay on average when the jackpot stands at `jackpot`. */
export const bowlValue = (jackpot: number): number => FALLS.reduce<number>((sum, fall) => sum + holePays(fallEnd(fall), jackpot), 0) / FALLS.length;

/** The chance that a ball's run gets as far as the bowls. */
export const CHALLENGE_CHANCE = chainChance(CHAIN_GOAL);
/** The chance that a ball in the top bowl gets down to the jackpot's hole. */
export const HOLE_JACKPOT_CHANCE = FALLS.filter((fall) => fallEnd(fall) === 'jackpot').length / FALLS.length;
/** The chance that a ball pushed over the front wins the jackpot: a full run, then all the way down. */
export const BALL_JACKPOT_CHANCE = CHALLENGE_CHANCE * HOLE_JACKPOT_CHANCE;

// ── Exact odds ──────────────────────────────────────────────────────────────

/** The chance of each tier on one spin. */
export const tierChance = (tier: Tier): number => SPIN_TABLE[tier] / SPIN_TOTAL;

/** A reach as the player meets it: the usual one, the long one, or either. */
export type ReachShown = Exclude<ReachKind, 'none'> | 'any';

/** The share of reaches that are of this kind, among spins that have won or among those that have lost with a reach. */
const kindShare = (kind: ReachShown, won: boolean): number => {
  const long = won ? LONG_REACH.win : LONG_REACH.miss;
  return kind === 'any' ? 1 : kind === 'long' ? long : 1 - long;
};

/** The chance that one spin shows a reach of this kind and wins, and that it shows one and misses. */
const reachAndWin = (kind: ReachShown): number => (1 - tierChance('miss')) * kindShare(kind, true);
const reachAndMiss = (kind: ReachShown): number => tierChance('miss') * REACH_RATE * kindShare(kind, false);

/** The chance that one spin shows a reach of this kind. */
export const reachChance = (kind: ReachShown = 'any'): number => reachAndWin(kind) + reachAndMiss(kind);

/**
 * How far a reach can be trusted: the chance that a spin has won, given that
 * it shows a reach of this kind. Every winning spin shows a reach and only
 * some losing ones do, and a winning one is played long more often, so a reach
 * is a hint at what was already drawn, and a long one a stronger hint.
 */
export const reachHitChance = (kind: ReachShown = 'any'): number => reachAndWin(kind) / reachChance(kind);

/**
 * Medals a ball's roulette pays on average when the jackpot stands at
 * `jackpot`: every number it gets to, each worth the average pocket, and the
 * bowls for the runs that reach the goal.
 */
export function rouletteValue(jackpot: number): number {
  let numbers = 0;
  for (let level = 1; level <= CHAIN_GOAL; level++) numbers += chainChance(level);
  return numbers * POCKET_VALUE + CHALLENGE_CHANCE * bowlValue(jackpot);
}

/** The chance that one spin leads to the jackpot: three sevens for a ball, a full run once it falls, then the jackpot's hole. */
export const JACKPOT_CHANCE = tierChance('seven') * BALL_JACKPOT_CHANCE;

// ── Jewels ──────────────────────────────────────────────────────────────────

/**
 * Jewels. The machine lets one go from the hatch with every treasure line,
 * and it lies on the field among the medals. Pushed over the front it is
 * collected: it lights one of the jewel lamps and pays `prize` medals at
 * once. The one that would light the last lamp pays `bonus` medals instead,
 * stacked on the pusher as towers, and the lamps go out. No jewel is lost:
 * it does not fit through an open side.
 */
export const JEWEL = { lamps: 5, prize: 1, bonus: 3 } as const;
/** The line a jewel comes with. */
export const JEWEL_TIER: Exclude<Tier, 'miss'> = 'big';
/** The chance that one spin lets a jewel go. */
export const JEWEL_CHANCE = tierChance(JEWEL_TIER);

/** Medals a jewel pays when it is collected with `lit` lamps already lit, and whether they go up as towers: the last lamp's is the bonus. */
export const jewelPays = (lit: number): { medals: number; towers: boolean } => (lit >= JEWEL.lamps - 1 ? { medals: JEWEL.bonus, towers: true } : { medals: JEWEL.prize, towers: false });

/** Medals a full set of jewels pays: the prize for every lamp but the last, and the bonus. */
export const JEWEL_SET = (JEWEL.lamps - 1) * JEWEL.prize + JEWEL.bonus;

/**
 * Medals a jewel pays on average: a set's medals shared among its jewels. It
 * is exact in the long run, whatever the lamps show now.
 */
export const JEWEL_VALUE = JEWEL_SET / JEWEL.lamps;

/**
 * Medals the jewels add to one spin on average. Every jewel the machine lets
 * go is collected in the end, so this is exact too.
 */
export const JEWEL_SPIN_VALUE = JEWEL_CHANCE * JEWEL_VALUE;

/** Medals the game a line leads to is worth on average with the jackpot at `jackpot`: the board, the chests, or the roulette a ball will start. */
function gameValue(tier: Tier, jackpot: number): number {
  if (tier === 'miss') return 0;
  return tier === 'small' ? BOARD_VALUE : tier === 'big' ? CHEST_VALUE : rouletteValue(jackpot);
}

/** Medals the jewel that comes with a line is worth: what it pays once it is collected. Only a treasure line has one. */
const jewelValue = (tier: Tier): number => (tier === JEWEL_TIER ? JEWEL_VALUE : 0);

/**
 * Medals each line is worth on average with the jackpot at `jackpot`, counting
 * a ball as the roulette it will start and a jewel as what it pays once it is
 * collected.
 */
export function tierValue(tier: Tier, jackpot: number): number {
  return gameValue(tier, jackpot) + jewelValue(tier);
}

/** Medals one spin is worth on average with the jackpot at `jackpot`. */
export function spinValue(jackpot: number): number {
  return TIERS.reduce((sum, tier) => sum + tierChance(tier) * tierValue(tier, jackpot), 0);
}

/**
 * Gold spins. A spin is gold in one of two ways. A medal that goes through
 * the START slot the lucky lamp is on, or through any slot while the wings
 * are open, holds a gold spin from the start. And a medal that goes through
 * a slot when the hold is full starts no spin of its own: it turns one of
 * the held spins gold, and chance time begins. A gold spin is drawn from the
 * same table as any other, and what its line pays on the spot, the sugoroku
 * square or the chest, is paid `multiplier` times over. A ball is a ball:
 * three sevens are worth what they always are. And a jewel is a jewel: a
 * gold treasure line lets one go, as any treasure line does, and what a
 * jewel pays when it is collected is never paid twice over.
 *
 * A spin turned gold by a full hold has cost two medals through a slot, and
 * is worth less than the two spins they would have been with room in the
 * hold. So filling the hold on purpose still returns less than not filling
 * it, wings and all: scripts/medal-pusher-tune.ts measures by how much.
 */
export const CHANCE = { multiplier: 2 } as const;

/** Medals each line of a gold spin is worth on average with the jackpot at `jackpot`. */
export function chanceTierValue(tier: Tier, jackpot: number): number {
  return gameValue(tier, jackpot) * (tier === 'small' || tier === 'big' ? CHANCE.multiplier : 1) + jewelValue(tier);
}

/** Medals one gold spin is worth on average with the jackpot at `jackpot`. */
export function chanceSpinValue(jackpot: number): number {
  return TIERS.reduce((sum, tier) => sum + tierChance(tier) * chanceTierValue(tier, jackpot), 0);
}

/** What turning a spin gold adds to it, on average. It is the same at any size of jackpot, since the ball's prize is not touched. */
export const CHANCE_BONUS = chanceSpinValue(JACKPOT_START) - spinValue(JACKPOT_START);
