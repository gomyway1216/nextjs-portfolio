/**
 * The High & Low Ladder: the rules, the ladder, and its exact odds.
 *
 * ## The rules
 *
 * - **The cards.** Every card is drawn from a full, freshly shuffled deck of
 *   52: any card is as likely as any other, every time, whatever came before.
 *   Only ranks count, aces high: 2 is the lowest, A the highest. So each rank
 *   turns up 4 times in 52, 1 in 13, and nothing is gained by remembering the
 *   cards already seen.
 * - **A game.** START takes the bet and turns a card face up. The player says
 *   whether the next card will be HIGH (a higher rank) or LOW (a lower one).
 *   The first guess has to be made: the bet pays for it.
 * - **Ties lose.** A card of the same rank is a wrong guess, as a pair is on
 *   the higher-or-lower card games of TV and in the High & Low double-up of a
 *   Japanese medal poker machine.
 * - **The ladder.** Each right guess climbs a rung, and the rung lit is what
 *   TAKE pays. After any right guess the player may TAKE it or guess again
 *   from the card just turned. A wrong guess loses the bet and everything on
 *   the ladder. The twelfth right guess reaches the top, which is paid at
 *   once.
 * - **The bet** is 5, 10, 20 or 50 medals, and the ladder pays in proportion:
 *   per 5 medals bet, 6, 8, 10, 12, 15, 20, 28, 40, 55, 80, 120 and 200.
 *
 * ## The maths
 *
 * Nothing but the card shown and the rung reached matters to what is to come,
 * so the best play (TAKE or go on, and HIGH or LOW) is found for every one of
 * the 13 × 12 states by working down from the top (`analyzeLadder`): a state's
 * value is the larger of what TAKE pays there and what guessing the better side
 * is worth, the chance of each next card times the value of the state it
 * leads to. All of it is done in whole numbers (BigInt), scaled by 13 for every
 * card still to come, so the returns are exact fractions, not estimates. Best
 * play brings back 89.965% of the medals bet, and no way of playing brings back
 * more: every way of playing is one of the choices the best play weighs.
 *
 * The cards are drawn as they are needed (`drawCard`), each in the press that
 * turns it, so nothing kept on the device knows a card before it is shown.
 *
 * Nothing here touches React, the browser or the medals.
 */

/** A card: 0 to 51, its rank `Math.floor(card / 4)` (0 for a 2 up to 12 for an ace) and its suit `card % 4`. */
export type Card = number;
export type Guess = 'high' | 'low';
/** What the player does at a rung: take what it pays, or guess. */
export type Move = 'take' | Guess;

export const DECK = 52;
export const RANKS = 13;
/** The ranks' names, lowest first: aces high. */
export const RANK_NAMES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'] as const;
/** The suits, in the order of a card's number: spades, hearts, diamonds, clubs. */
export const SUIT_SIGNS = ['♠', '♥', '♦', '♣'] as const;

export const rankOf = (card: Card): number => Math.floor(card / 4);
export const suitOf = (card: Card): number => card % 4;
export const isCard = (value: unknown): value is Card => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DECK;
export const isGuess = (value: unknown): value is Guess => value === 'high' || value === 'low';

/** A card from a full, freshly shuffled deck: any of the 52, each as likely. One random number in [0, 1). */
export const drawCard = (random: () => number): Card => Math.min(DECK - 1, Math.max(0, Math.floor(random() * DECK)));

/** Whether a guess is right: the next card's rank above the shown card's for HIGH, below it for LOW. The same rank loses. */
export const guessRight = (shown: Card, next: Card, guess: Guess): boolean => (guess === 'high' ? rankOf(next) > rankOf(shown) : rankOf(next) < rankOf(shown));

/** How many of the 13 ranks win each guess from a card of rank `rank`, and how many tie. */
export const ranksFor = (rank: number): { high: number; low: number; tie: number } => ({ high: RANKS - 1 - rank, low: rank, tie: 1 });

/** The side more likely to win from a card of rank `rank`: HIGH from 2 to 8 (on an 8 both win 6 ranks in 13), LOW from 9 to A. */
export const likelier = (rank: number): Guess => (RANKS - 1 - rank >= rank ? 'high' : 'low');

// ── The ladder ──────────────────────────────────────────────────────────────

/** The ladder is priced per this many medals bet. */
export const UNIT = 5;
/** What each rung pays, per `UNIT` medals bet: the first right guess 6, the twelfth (the top) 200. */
export const LADDER = [6, 8, 10, 12, 15, 20, 28, 40, 55, 80, 120, 200] as const;
/** The rungs: the top is reached by this many right guesses in a row. */
export const TOP = LADDER.length;
/** The bets a game can be played for. */
export const BETS = [5, 10, 20, 50] as const;
export type Bet = (typeof BETS)[number];
export const isBet = (value: unknown): value is Bet => (BETS as readonly unknown[]).includes(value);
/** The most a game can take, and the most it can pay. */
export const BET_MOST = Math.max(...BETS);
export const TOP_MULTIPLE = LADDER[TOP - 1] / UNIT;

/** What TAKE pays on rung `rung` (1 to `TOP`) for a bet of `bet`; nothing below the first rung. */
export const payFor = (bet: number, rung: number): number => (rung < 1 || rung > TOP ? 0 : (LADDER[rung - 1] * bet) / UNIT);
/** The ladder for a bet, rung 1 first. */
export const ladderFor = (bet: number): number[] => LADDER.map((_, i) => payFor(bet, i + 1));

// ── Exact fractions ─────────────────────────────────────────────────────────

export interface Fraction {
  num: bigint;
  den: bigint;
}

// Written with BigInt() rather than literals: the site's TypeScript targets a version before BigInt literals.
const ZERO = BigInt(0);
const ONE = BigInt(1);
const THIRTEEN = BigInt(13);
/** 13 to the power `n`. */
const pow13 = (n: number): bigint => {
  let out = ONE;
  for (let i = 0; i < n; i++) out *= THIRTEEN;
  return out;
};

const gcd = (a: bigint, b: bigint): bigint => {
  let x = a < ZERO ? -a : a;
  let y = b < ZERO ? -b : b;
  while (y !== ZERO) [x, y] = [y, x % y];
  return x;
};
export const fraction = (num: bigint, den: bigint): Fraction => {
  const g = gcd(num, den) || ONE;
  return { num: num / g, den: den / g };
};
/** A fraction as a number, to the double's precision. */
export const valueOf = (f: Fraction): number => {
  // Scaled down first, so that a numerator and denominator past 2^53 still divide accurately.
  const shift = BigInt(Math.max(0, f.den.toString(2).length - 52));
  return Number(f.num >> shift) / Number(f.den >> shift);
};

// ── The analysis ────────────────────────────────────────────────────────────

/** A way of playing: what to do at rung `rung` (0 to TOP − 1) with a card of rank `rank` showing. At rung 0 a take is not allowed. */
export type Policy = (rung: number, rank: number) => Move;

/**
 * The value of every state under a way of playing, exactly: `scaled[rung][rank]` is the medals it is worth per
 * `UNIT` medals bet, times 13^(TOP − rung). A state at the top is worth the top's pay; below it, a take is worth
 * its rung, and a guess the sum of the states it can lead to (each next rank is 1 in 13, which the scale absorbs).
 */
function valuesUnder(choose: (rung: number, rank: number, take: bigint | null, high: bigint, low: bigint) => Move): { scaled: bigint[][]; moves: Move[][] } {
  const scaled: bigint[][] = Array.from({ length: TOP + 1 }, () => new Array<bigint>(RANKS).fill(ZERO));
  const moves: Move[][] = Array.from({ length: TOP }, () => new Array<Move>(RANKS).fill('high'));
  for (let rank = 0; rank < RANKS; rank++) scaled[TOP][rank] = BigInt(LADDER[TOP - 1]);
  let scale = ONE;
  for (let rung = TOP - 1; rung >= 0; rung--) {
    scale *= THIRTEEN;
    for (let rank = 0; rank < RANKS; rank++) {
      let high = ZERO;
      let low = ZERO;
      for (let next = 0; next < RANKS; next++) {
        if (next > rank) high += scaled[rung + 1][next];
        else if (next < rank) low += scaled[rung + 1][next];
      }
      const take = rung === 0 ? null : BigInt(LADDER[rung - 1]) * scale;
      const move = choose(rung, rank, take, high, low);
      moves[rung][rank] = move;
      scaled[rung][rank] = move === 'take' ? take! : move === 'high' ? high : low;
    }
  }
  return { scaled, moves };
}

/** The return of the values of rung 0, per medal bet, as an exact fraction. */
const returnOf = (scaled: bigint[][]): Fraction => {
  const sum = scaled[0].reduce((a, b) => a + b, ZERO);
  // Each first card is 1 in 13, the values carry 13^TOP, and the ladder is per UNIT medals.
  return fraction(sum, pow13(TOP + 1) * BigInt(UNIT));
};

/** A way of playing that names a guess where only a guess will do: a take at rung 0 is the likelier side. */
const guarded =
  (policy: Policy): Policy =>
  (rung, rank) => {
    const move = policy(rung, rank);
    return rung === 0 && move === 'take' ? likelier(rank) : move;
  };

/** The exact return of a way of playing, per medal bet. */
export function returnUnder(policy: Policy): Fraction {
  const safe = guarded(policy);
  return returnOf(valuesUnder((rung, rank) => safe(rung, rank)).scaled);
}

/** How games end under a way of playing: the chance of losing, of taking at each rung, and of reaching the top. */
export interface Endings {
  lose: Fraction;
  /** `take[rung - 1]`: the chance of taking rung `rung`; the last is reaching the top. */
  take: Fraction[];
  /** The chance of reaching each rung at all, rung 1 first. */
  reach: Fraction[];
}

/** How games end under a way of playing, exactly: the cards' chances followed through every state. */
export function endingsUnder(policy: Policy): Endings {
  const safe = guarded(policy);
  // Chances are carried as whole numbers over 13^(rung + 1): the first card is 1 in 13, each next card 1 in 13 more.
  let here = new Array<bigint>(RANKS).fill(ONE);
  const take: Fraction[] = [];
  const reach: Fraction[] = [];
  let lost = ZERO;
  let scale = THIRTEEN;
  for (let rung = 0; rung < TOP; rung++) {
    const next = new Array<bigint>(RANKS).fill(ZERO);
    let took = ZERO;
    for (let rank = 0; rank < RANKS; rank++) {
      const weight = here[rank];
      if (weight === ZERO) continue;
      const move = safe(rung, rank);
      if (move === 'take') {
        took += weight;
        continue;
      }
      for (let card = 0; card < RANKS; card++) {
        if (move === 'high' ? card > rank : card < rank) next[card] += weight;
        else lost += weight * pow13(TOP - rung - 1);
      }
    }
    if (rung > 0) take.push(fraction(took, scale));
    here = next;
    scale *= THIRTEEN;
    reach.push(fraction(here.reduce((a, b) => a + b, ZERO), scale));
  }
  take.push(reach[TOP - 1]);
  return { lose: fraction(lost, pow13(TOP + 1)), take, reach };
}

/** Guess the likelier side, and take as soon as `rung` right guesses are on the ladder (the top for `TOP`: climb all the way). */
export const takeAfter =
  (rung: number): Policy =>
  (at, rank) =>
    at >= rung ? 'take' : likelier(rank);

/** The rule of thumb: go on only from a card within `ends` ranks of an end (2, 3, 4 and Q, K, A for 3), and take from any other. */
export const nearTheEnds =
  (ends: number): Policy =>
  (_, rank) =>
    rank < ends || rank >= RANKS - ends ? likelier(rank) : 'take';

/** The rule of thumb the Odds tab gives: take from 5 to J, go on from 2, 3, 4 and Q, K, A. */
export const RULE_OF_THUMB_ENDS = 3;

export interface LadderOdds {
  /** Best play's return per medal bet: the most any way of playing brings back. */
  best: Fraction;
  /** Best play at every state: `moves[rung][rank]` (a take is never chosen at rung 0). Where taking and going on are worth the same, it takes. */
  moves: Move[][];
  /** How games end under best play. */
  bestEndings: Endings;
  /** Guess the likelier side and take after `rung` right guesses: `takeAfter[rung - 1]`, the last climbing to the top. */
  takeAfter: Fraction[];
  /** The rule of thumb: take from 5 to J. */
  thumb: Fraction;
  /** Climbing to the top every game: how often it gets there. */
  climbTop: Fraction;
}

let odds: LadderOdds | null = null;

/** The ladder's exact odds: best play, its endings, and the simple ways of playing beside it. Worked out once, when first asked for. */
export function analyzeLadder(): LadderOdds {
  if (odds) return odds;
  const { scaled, moves } = valuesUnder((rung, rank, take, high, low) => {
    const guess: Guess = high >= low ? 'high' : 'low';
    const going = guess === 'high' ? high : low;
    return take !== null && take >= going ? 'take' : guess;
  });
  const best = returnOf(scaled);
  const bestPolicy: Policy = (rung, rank) => moves[rung][rank];
  odds = {
    best,
    moves,
    bestEndings: endingsUnder(bestPolicy),
    takeAfter: Array.from({ length: TOP }, (_, i) => returnUnder(takeAfter(i + 1))),
    thumb: returnUnder(nearTheEnds(RULE_OF_THUMB_ENDS)),
    climbTop: endingsUnder(takeAfter(TOP)).take[TOP - 1],
  };
  return odds;
}

/** Best play's move at a state. */
export const bestMove = (rung: number, rank: number): Move => analyzeLadder().moves[rung][rank];

// ── A check by play ─────────────────────────────────────────────────────────

/** Random numbers in [0, 1) from a seed, the same every time: for the check, never for the machine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CheckResult {
  games: number;
  /** Medals back per medal bet, playing the best way. */
  back: number;
  /** Games that reached the top. */
  tops: number;
  /** Games lost. */
  lost: number;
}

/** Plays `games` games of one unit each, the best way, with cards drawn from `random`: what came back, to set beside the exact figures. */
export function checkGames(games: number, random: () => number): CheckResult {
  const { moves } = analyzeLadder();
  let back = 0;
  let tops = 0;
  let lost = 0;
  for (let g = 0; g < games; g++) {
    let shown = drawCard(random);
    let rung = 0;
    for (;;) {
      if (rung === TOP) {
        back += LADDER[TOP - 1];
        tops += 1;
        break;
      }
      const move = moves[rung][rankOf(shown)];
      if (move === 'take') {
        back += LADDER[rung - 1];
        break;
      }
      const next = drawCard(random);
      if (!guessRight(shown, next, move)) {
        lost += 1;
        break;
      }
      shown = next;
      rung += 1;
    }
  }
  return { games, back: back / (games * UNIT), tops, lost };
}
