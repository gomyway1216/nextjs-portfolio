/**
 * What is printed on the cabinet's instruction plate, as tables.
 *
 * A real cabinet carries a printed card: the game's flow in a few numbered
 * steps, each a small drawing with one line of words, and beside it a card
 * that shows every line of the slot and what it leads to. This file is what
 * that card is printed from. Nothing on it is typed in by hand: the steps are
 * rows of `PLATE_STEPS`, the payout card is worked out from the lottery's own
 * tables by `payoutLines` and `jackpotPath`, and every number a caption
 * mentions comes out of `PLATE_RULES`.
 *
 * So a new rule is a new row. To add a step, add its id to `PLATE_STEPS` and
 * its words to plateStrings.ts in both languages (and a drawing in
 * PlateArt.tsx if it has one: a step without one is printed with its number
 * alone). A new line of the slot, another bowl or another hole is on the card
 * as soon as the lottery lists it. To add a rule that changes what the lines
 * pay, add its id to `PLATE_NOTES` and its words beside the others; if it has
 * a number in it, add that number to `PlateRules`, so that the card takes it
 * from the machine.
 */

import {
  BOARD,
  BOWLS,
  CHAIN_GOAL,
  CHANCE,
  CHESTS,
  CHEST_TOWERS_FROM,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  ROULETTE,
  TIERS,
  TIER_BONUS,
  TIER_DIGITS,
  chanceTierValue,
  reachHitChance,
  tierValue,
  type Bonus,
  type BowlHole,
  type Pocket,
  type Tier,
} from './lottery';
import { MAX_STOCK } from './session';

/** A line of the slot that wins something. */
export type WinTier = Exclude<Tier, 'miss'>;

/**
 * The rules the plate is printed from: the lottery's tables and the session's
 * limits, gathered so that a test can print a plate from other rules and see
 * every number on it follow.
 */
export interface PlateRules {
  /** The slot's lines, worst first, as the lottery lists them. */
  tiers: readonly Tier[];
  tierDigits: Readonly<Record<WinTier, readonly number[]>>;
  tierBonus: Readonly<Record<WinTier, Bonus>>;
  board: readonly number[];
  feverSquare: number;
  chests: readonly number[];
  chestTowersFrom: number;
  roulette: readonly Pocket[];
  chainGoal: number;
  /** The bowls a full run ends in, the top one first, and what each of their holes does. */
  bowls: readonly (readonly BowlHole[])[];
  jackpotStart: number;
  jackpotStep: number;
  /** How far each kind of reach can be trusted: the chance that it hits. */
  reachHits: Readonly<Record<'normal' | 'long', number>>;
  /** Spins the machine holds at a time. */
  hold: number;
  /** Chance time: how many times over a gold spin pays, and the lines it pays that on. */
  chance: { multiplier: number; tiers: readonly WinTier[] };
}

const WIN_TIERS = TIERS.filter((tier): tier is WinTier => tier !== 'miss');

export const PLATE_RULES: PlateRules = {
  tiers: TIERS,
  tierDigits: TIER_DIGITS,
  tierBonus: TIER_BONUS,
  board: BOARD,
  feverSquare: FEVER_SQUARE,
  chests: CHESTS,
  chestTowersFrom: CHEST_TOWERS_FROM,
  roulette: ROULETTE,
  chainGoal: CHAIN_GOAL,
  bowls: BOWLS,
  jackpotStart: JACKPOT_START,
  jackpotStep: JACKPOT_STEP,
  reachHits: { normal: reachHitChance('normal'), long: reachHitChance('long') },
  hold: MAX_STOCK,
  chance: {
    multiplier: CHANCE.multiplier,
    // The lottery says which lines a gold spin pays more on, by what it makes each of them worth.
    tiers: WIN_TIERS.filter((tier) => chanceTierValue(tier, JACKPOT_START) > tierValue(tier, JACKPOT_START)),
  },
};

// ── The steps ───────────────────────────────────────────────────────────────

/**
 * The numbered steps, in the order they are printed. Each has words under its
 * id in plateStrings.ts, and a drawing under its id in PlateArt.tsx.
 */
export const PLATE_STEPS = ['insert', 'aim', 'push', 'start', 'match', 'jackpot'] as const;
export type StepId = (typeof PLATE_STEPS)[number];

// ── The payout card ─────────────────────────────────────────────────────────

/** One line of the payout card: the symbols that make it, and what three of them lead to. */
export interface PayoutLine {
  tier: WinTier;
  /** The digits whose pictures make this line: three of any one of them. */
  digits: readonly number[];
  leads: Bonus;
  /**
   * The medals the game it leads to can pay, smallest first, each once: what
   * the chests hold, or what the squares of the board pay apart from its
   * fever square. A ball pays nothing by itself, so it has none.
   */
  prizes: readonly number[];
  /** What the board's fever square pays, on the line that leads to the board. */
  fever: number | null;
  /** A prize this big or bigger goes up on the pusher as towers, on the line that leads to the chests. */
  towersFrom: number | null;
  /** How many times over a gold spin pays this line, in chance time; null on a line it pays no more on. */
  gold: number | null;
}

const ascending = (values: readonly number[]): number[] => [...new Set(values)].sort((a, b) => a - b);

/** What the game a line leads to can pay. */
function prizesOf(leads: Bonus, rules: PlateRules): Pick<PayoutLine, 'prizes' | 'fever' | 'towersFrom'> {
  if (leads === 'chest') return { prizes: ascending(rules.chests), fever: null, towersFrom: rules.chestTowersFrom };
  if (leads === 'sugoroku') {
    return { prizes: ascending(rules.board.filter((_medals, square) => square !== rules.feverSquare)), fever: rules.board[rules.feverSquare], towersFrom: null };
  }
  return { prizes: [], fever: null, towersFrom: null };
}

/** The lines of the payout card, best first: every line of the slot that wins, with its symbols and where it leads. */
export function payoutLines(rules: PlateRules = PLATE_RULES): PayoutLine[] {
  return [...rules.tiers]
    .reverse()
    .filter((tier): tier is WinTier => tier !== 'miss')
    .map((tier) => ({
      tier,
      digits: rules.tierDigits[tier],
      leads: rules.tierBonus[tier],
      ...prizesOf(rules.tierBonus[tier], rules),
      gold: rules.chance.multiplier > 1 && rules.chance.tiers.includes(tier) ? rules.chance.multiplier : null,
    }));
}

/** One bowl of the jackpot challenge, as the card shows it. */
export interface BowlStage {
  /** How many holes it has, and how many of them let the ball down into the bowl below. */
  holes: number;
  down: number;
  /** What its other holes pay in medals, smallest first, and how many of them are the jackpot's. */
  prizes: number[];
  jackpot: number;
}

/** The way from a prize ball to the jackpot, as the card draws it: the roulette's run, then the bowls. */
export interface JackpotPath {
  /** The numbers on the roulette's pockets, smallest first, each once. */
  pockets: number[];
  /** How many of its pockets are crosses, and how many pockets it has. */
  crosses: number;
  size: number;
  /** Numbers in a row that send the ball to the bowls. */
  chainGoal: number;
  /** The bowls, the top one first. */
  bowls: BowlStage[];
  jackpotStart: number;
  /** Medals played for the jackpot to grow by one. */
  jackpotStep: number;
}

export function jackpotPath(rules: PlateRules = PLATE_RULES): JackpotPath {
  const numbers = rules.roulette.filter((pocket): pocket is number => pocket !== 'stop');
  return {
    pockets: ascending(numbers),
    crosses: rules.roulette.length - numbers.length,
    size: rules.roulette.length,
    chainGoal: rules.chainGoal,
    bowls: rules.bowls.map((holes) => ({
      holes: holes.length,
      down: holes.filter((hole) => hole === 'down').length,
      prizes: ascending(holes.filter((hole): hole is number => typeof hole === 'number')),
      jackpot: holes.filter((hole) => hole === 'jackpot').length,
    })),
    jackpotStart: rules.jackpotStart,
    jackpotStep: rules.jackpotStep,
  };
}

/** Which kind of reach hits more often, so the card can say which one to hope for: null when neither does. */
export function hotterReach(rules: PlateRules = PLATE_RULES): 'normal' | 'long' | null {
  const { normal, long } = rules.reachHits;
  return long > normal ? 'long' : normal > long ? 'normal' : null;
}

/**
 * The notes the payout card carries under its lines, in the order they are
 * printed: what else there is to know about the slot. Each has its words
 * under its id in plateStrings.ts, worked out from the rules, and a note with
 * nothing to say for the rules as they stand is left off the card.
 */
export const PLATE_NOTES = ['reach', 'chance'] as const;
export type NoteId = (typeof PLATE_NOTES)[number];
