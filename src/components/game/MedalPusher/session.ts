/**
 * A whole machine in play: the field, the credits, the chuckers' held spins,
 * the slot on the centre screen, the games it leads to, the prize balls and
 * the jackpot. Like the field it takes time as a parameter and its random
 * numbers from the machine's seeded generator, so the cabinet on screen and
 * the simulation tab run exactly the same thing.
 */

import { MAX_STEP, START_RIDE, buildTowers, createMachine, dropBall, dropJewel, dropMedal, luckySlot, queuePayout, step, type Arm, type Machine, type StepEvents } from './engine';
import { hopperBusy } from './hopper';
import { stackerBusy } from './stacker';
import { watchWorks, worksEvents, type WorksEvent } from './works';
import {
  BOARD,
  BOWLS,
  CHANCE,
  CHESTS,
  CHAIN_GOAL,
  CHEST_TOWERS_FROM,
  FALLS,
  FEVER_SQUARE,
  JACKPOT_START,
  JACKPOT_STEP,
  JEWEL,
  JEWEL_TIER,
  ROULETTE,
  TIER_BONUS,
  drawDie,
  drawFall,
  drawPocket,
  drawSpin,
  holePays,
  jewelPays,
  pouredOf,
  shuffleChests,
  squareAfter,
  type SpinResult,
  type Tier,
} from './lottery';

export const START_CREDITS = 100;
/**
 * Spins the machine holds while the screen is busy; a medal through a START
 * pocket beyond that starts none. Ten, as the big station pushers hold:
 * Konami's GRAND CROSS and SEGA's GALILEO FACTORY each hold ten spins, and
 * each does something for a medal that finds them all held, as this one
 * does (it turns a held spin gold). It held eight until the screen learnt to
 * hurry through a deep hold.
 */
export const MAX_STOCK = 10;
/**
 * Prize balls lying on the field when a machine is switched on: one, on the
 * lower table.
 *
 * A machine that has been played for a while has a ball lying on it more
 * often than not, and medals its screen has paid on their way to the front.
 * A new one has neither. With no ball on it, a new machine gives back about
 * 72, 76 and 77 of its first three hundred medals, played the best way,
 * where the long run gives 90: it is the meaner for being new. With one
 * ball it gives back about 79, 101 and 87, which is 89 of each hundred: a
 * little under the long run's share, and no head start. It had two balls
 * once, and two jewels, and that was one: about 99 of each hundred at
 * today's odds. `scripts/medal-pusher-tune.ts --first` measures all three.
 */
export const START_BALLS = 1;
/** Jewels lying on the field when a machine is switched on: one, near the front. It is worth a medal or so, and it is the first thing a new player sees collected. */
export const START_JEWELS = 1;
/**
 * How long things take on the screen, in seconds, when it is not hurrying
 * through a deep hold (`HURRY`): a spin, a quicker one when a couple of spins
 * are queueing up, the extra suspense of a reach and what a long reach
 * adds to it, how long a winning line stays up, the die and each hop of the
 * piece, the time to choose a chest and for it to open, one turn of the
 * roulette and the pause before the next, the ball's time in the top bowl,
 * and how long a prize stays up. Then the challenge's own: the ball's time in
 * the middle bowl and in the bottom one, each from the moment it drops out of
 * the bowl above; how long a prize from one of the upper bowls stays up while
 * it is counted out; and how long the jackpot does.
 */
export const TIMING = {
  spin: 1.6,
  quickSpin: 0.9,
  /** A gold spin's reels: quicker again than a spin with others queueing behind it. */
  chanceSpin: 0.45,
  reach: 1.3,
  longReach: 1.6,
  celebrate: 1.2,
  dice: 1.3,
  hop: 0.28,
  choose: 8,
  open: 1.1,
  roulette: 2.8,
  step: 1.1,
  bowl: 6.5,
  prize: 2.2,
  bowlMiddle: 6,
  bowlLast: 4.2,
  bowlPrize: 3.6,
  jackpot: 8,
} as const;

/** The seconds the ball spends in each bowl, the top one first. */
export const BOWL_TIMES: readonly number[] = [TIMING.bowl, TIMING.bowlMiddle, TIMING.bowlLast];

/**
 * How hard the screen hurries: from how many spins are held behind the one it
 * starts, the seconds its reels run before any reach, the share of its usual
 * time a reach takes, and the share of the usual time its winning line, and
 * the board or the chests that line leads to, take.
 */
export interface Hurry {
  from: number;
  reels: number;
  reach: number;
  pace: number;
}

/**
 * The screen's hurry, by how deep the hold is. A real slot screen plays held
 * spins faster the more of them there are (高速消化): a pachinko machine
 * shortens its losing spins when its hold is deep, and a station pusher's
 * hold of ten is seldom full while it is played steadily. Its first two steps
 * are the spin and the quicker spin this screen always had; the deeper ones
 * cut the reels, a reach, a winning line and its game short. The reels never
 * run for less than a quarter of a second, so each spin's digits can still
 * be read as they stop. What a spin is drawn from and what it pays are the
 * same at any hurry, the time to pick a chest is the player's and never
 * hurries, and a ball's roulette and the bowls never hurry either.
 *
 * It was tuned with scripts/medal-pusher-tune.ts so that steady fast feeding
 * loses little more than slow feeding does to the screen: before it, at two
 * medals a second one medal in five through a START pocket found a hold of
 * eight full, and holding both buttons returned about 69 of every 100.
 */
export const HURRY: readonly Hurry[] = [
  { from: 0, reels: TIMING.spin, reach: 1, pace: 1 },
  { from: 2, reels: TIMING.quickSpin, reach: 1, pace: 1 },
  { from: 3, reels: 0.5, reach: 0.6, pace: 0.55 },
  { from: 5, reels: 0.3, reach: 0.4, pace: 0.4 },
  { from: 7, reels: 0.25, reach: 0.25, pace: 0.25 },
];

/** The hurry the screen plays at with `held` spins held behind what it starts. */
export function hurryFor(held: number): number {
  let level = 0;
  for (let at = 1; at < HURRY.length; at++) if (held >= HURRY[at].from) level = at;
  return level;
}

/** The seconds a spin's reels run before any reach, at hurry `hurry`: a gold spin's are quicker, but never slower than the hurry's own. */
export const reelTime = (hurry: number, gold: boolean): number => (gold ? Math.min(TIMING.chanceSpin, HURRY[hurry].reels) : HURRY[hurry].reels);

/** How long a winning line stays up at hurry `hurry`. */
export const celebrateTime = (hurry: number): number => TIMING.celebrate * HURRY[hurry].pace;

/** How long a prize from the board or a chest stays up at hurry `hurry`. */
export const prizeTime = (hurry: number): number => TIMING.prize * HURRY[hurry].pace;

/** How long a chest takes to open at hurry `hurry`. */
export const openTime = (hurry: number): number => TIMING.open * HURRY[hurry].pace;

/** How long the die tumbles, and each hop of the piece, at hurry `hurry`. */
export const diceTime = (hurry: number): number => TIMING.dice * HURRY[hurry].pace;
export const hopTime = (hurry: number): number => TIMING.hop * HURRY[hurry].pace;

export interface ActiveSpin {
  result: SpinResult;
  elapsed: number;
  /** When the last reel stops. A winning line then stays up for a moment. */
  duration: number;
  /** Whether the reels have stopped and the line has been counted. */
  done: boolean;
  /** How hard the screen hurries with it: an index into HURRY, settled when it starts. */
  hurry: number;
}

/** A roll on the sugoroku board: the die, then the piece hopping square by square. */
export interface ActiveSugoroku {
  kind: 'sugoroku';
  roll: number;
  from: number;
  elapsed: number;
  /** When the piece lands. The prize then stays up for a moment. */
  duration: number;
  /** Medals it paid; −1 while the piece is still on its way. */
  payout: number;
  /** How hard the screen hurries with it: an index into HURRY, settled when the roll starts. */
  hurry: number;
}

/** A choice of three chests: one is picked, by the player or by the clock, and opens. */
export interface ActiveChest {
  kind: 'chest';
  /** What each chest holds, left to right. */
  prizes: number[];
  /** The chest the clock picks if nobody does. */
  fallback: number;
  /** The chest that was picked; −1 until then. */
  picked: number;
  elapsed: number;
  /** When it was picked, on the game's own clock. */
  pickedAt: number;
  /** Whether the cabinet has been told of the pick. */
  told: boolean;
  /** Medals it paid; −1 until the chest has opened. */
  payout: number;
  /** How hard the screen hurries with it once one is picked: an index into HURRY, settled when the chests come up. The time to choose is the player's, and does not hurry. */
  hurry: number;
}

export type ActiveBonus = ActiveSugoroku | ActiveChest;

/**
 * The jackpot challenge a full run ends in: three bowls, one under another.
 * The ball rolls round a bowl and drops into one of its holes, which lets it
 * down into the bowl below or ends the challenge with a prize. The whole way
 * down is drawn before the ball is let go.
 */
export interface ActiveBowl {
  /** The hole the ball takes in each bowl it gets to, the top bowl's first. The last of them holds its prize. */
  holes: number[];
  /** The bowl the ball is in, counted from the top. */
  stage: number;
  /** Seconds since the ball came into this bowl, and how long it rolls there before it drops. */
  elapsed: number;
  duration: number;
  /** Medals the challenge paid; −1 while the ball is still on its way. */
  payout: number;
}

/**
 * The roulette a ball starts: a run of turns. Each turn the light goes round
 * and stops on a pocket. A number is stacked onto the run’s tower and the
 * roulette turns again; a cross ends the run; enough numbers in a row send the
 * ball into the bowls, with the jackpot at the bottom of them.
 */
export interface ActiveRoulette {
  /** Index of the pocket this turn will stop on, and of the one the light set off from. */
  pocket: number;
  from: number;
  /** Seconds into this turn, and how long the light takes to stop. */
  elapsed: number;
  duration: number;
  /** Whether this turn's pocket has been reached and paid. */
  landed: boolean;
  /** Numbers in a row so far, and the medals the run has paid, the bowls' prize included. */
  level: number;
  total: number;
  /** Medals the last pocket paid: its number, or 0 for a cross. Once the ball has dropped into its last hole, what that paid. */
  gain: number;
  /** Whether the run has ended, and whether it ended in the jackpot. */
  over: boolean;
  jackpot: boolean;
  /** The ball in the bowls, once the run is complete. */
  bowl: ActiveBowl | null;
}

/**
 * A medal the lip's rule has counted, on its way to its START pocket. It
 * came over the lip with its middle inside the pocket, and from there it
 * rides its tongue out over the well and drops in `START_RIDE` seconds later
 * (catcher.ts shows it). Until it drops the machine has not taken it: it
 * holds no spin, starts none and turns none gold.
 *
 * What was settled at the lip is kept with it: the pocket, and whether that
 * pocket was lit gold as the medal came over, by the lucky lamp or because
 * the wings were open. The lamp may have stepped on by the time it drops,
 * and chance time may have begun or ended; the medal is still the one that
 * came over a lit pocket, or the one that did not.
 */
export interface Rider {
  /** The pocket it is on its way to, from the left. */
  gate: number;
  /** Whether its pocket was lit as it came over the lip: the lucky lamp was on it, or the wings were open. If it is held, the spin it holds is gold from the start. */
  lit: boolean;
  /** Seconds until it drops into the pocket: more than none, and never more than the whole ride. */
  left: number;
}

export interface Session {
  machine: Machine;
  credits: number;
  /** Medals the player has dropped, and what became of the field's medals since. */
  inserted: number;
  won: number;
  lost: number;
  /** Medals the machine has paid onto the field as prizes. */
  paidOut: number;
  stock: number;
  /** Chucker hits, and how many of them found the stock already full. */
  hits: number;
  wasted: number;
  /**
   * Chance time. A medal that finds the hold full starts no spin of its own:
   * it turns one of the held spins gold, if one is left to turn. `gold` is how
   * many of the held spins are gold, never more than `stock`; they are played
   * before the others. `gilded` counts the medals that turned one, which is
   * every gold spin there has been. `chance` says that what is on the screen
   * now is a gold spin, or the game its line led to: its reels are quick, and
   * its sugoroku square or its chest pays `CHANCE.multiplier` times over.
   *
   * A spin can also be gold from the start. A medal that goes through the
   * slot the lucky lamp is on, and is held, holds a gold spin: `lucky`
   * counts those. And from the moment a medal finds the hold full until the
   * last gold spin has been played, which is chance time proper, `rush` is
   * set: the slots' wings are open, they take medals more easily, and every
   * medal that is held holds a gold spin.
   */
  gold: number;
  gilded: number;
  lucky: number;
  rush: boolean;
  chance: boolean;
  jackpot: number;
  /** Medals played since the jackpot last grew. */
  jackpotProgress: number;
  spin: ActiveSpin | null;
  bonus: ActiveBonus | null;
  roulette: ActiveRoulette | null;
  /** The square the sugoroku piece stands on. */
  square: number;
  /** Balls pushed over the front whose roulette has not started yet. */
  balls: number;
  /** Roulettes started, one for every ball that went over. */
  roulettes: number;
  spins: number;
  tiers: Record<Tier, number>;
  fevers: number;
  jackpots: number;
  refills: number;
  /** Whether a chest is picked the moment it is offered, as the simulation's player does. */
  quickPick: boolean;
  /** Jewel lamps that are lit: one for each jewel collected since the lamps last went out. */
  jewels: number;
  /** Jewel bonuses paid since the machine was switched on: one for every full set of lamps. */
  jewelBonuses: number;
  /**
   * The medals the lip's rule has counted that have not dropped into their
   * pockets yet, in the order they came over, which is the order they drop
   * in. None of them is in `hits`, or in anything else here, until it does.
   */
  riding: Rider[];
}

/** Something the cabinet should react to, in the order it happened. */
export type SessionEvent =
  | { type: 'bonus'; count: number }
  // The medal now at a pocket takes the hold's last place: the hold fills. One that finds it full already is a `checker` that is not `held`.
  | { type: 'holdFilled' }
  | { type: 'won'; count: number }
  | { type: 'lost'; count: number }
  | { type: 'landed'; count: number }
  | { type: 'toppled'; count: number }
  | { type: 'ball'; count: number }
  /**
   * A medal the lip's rule has counted has come over on to its tongue: it drops into slot `gate` in `seconds`, and
   * the machine takes it then. `lit`: its slot was lit gold as it came over. It is not said of a medal that is taken
   * at once, on a cabinet that shows nothing moving.
   */
  | { type: 'riding'; gate: number; lit: boolean; seconds: number }
  /**
   * A medal has dropped into a slot, and the machine has taken it. `held`: it holds a spin. `gold`: it found the
   * hold full and turned a held spin gold. `lucky`: the spin it holds is gold from the start, because its slot was
   * the lit one, or the wings were open, as it came over the lip.
   */
  | { type: 'checker'; gate: number; held: boolean; gold: boolean; lucky: boolean }
  | { type: 'chanceStart' }
  | { type: 'chanceEnd' }
  | { type: 'spinStart'; result: SpinResult; duration: number }
  | { type: 'spinEnd'; result: SpinResult }
  | { type: 'sugorokuStart'; roll: number; from: number }
  | { type: 'sugorokuEnd'; square: number; payout: number; fever: boolean }
  | { type: 'chestStart' }
  | { type: 'chestPicked'; chest: number }
  | { type: 'chestEnd'; chest: number; payout: number }
  | { type: 'rouletteStart'; pocket: number; duration: number }
  | { type: 'rouletteStep'; pocket: number; medals: number; level: number }
  | { type: 'rouletteEnd'; total: number; level: number }
  | { type: 'bowlStart'; holes: readonly number[]; duration: number }
  // `poured` is how many of the medals paid are thrown onto the field loose: the share that always is, and what the pusher had no free place to stack.
  | { type: 'bowlEnd'; bowl: number; hole: number; payout: number; poured: number; total: number; jackpot: boolean }
  | { type: 'bowlDrop'; bowl: number; hole: number; duration: number }
  | { type: 'jewelDrop' }
  | { type: 'jewel'; lamps: number; payout: number }
  | { type: 'jewelBonus'; payout: number }
  // The payout works: the hopper's doors opening and shutting, and the tubes stacking towers and pushing them out.
  | WorksEvent;

export interface SessionOptions {
  /** Prize balls on the field at the start. */
  balls?: number;
  /** Pick a chest at once instead of waiting for the player. */
  quickPick?: boolean;
  /** Jewels on the field at the start. */
  jewels?: number;
}

export function createSession(seed: number, options: SessionOptions = {}): Session {
  return {
    machine: createMachine(seed, options.balls ?? START_BALLS, options.jewels ?? START_JEWELS),
    credits: START_CREDITS,
    inserted: 0,
    won: 0,
    lost: 0,
    paidOut: 0,
    stock: 0,
    gold: 0,
    gilded: 0,
    lucky: 0,
    rush: false,
    chance: false,
    hits: 0,
    wasted: 0,
    jackpot: JACKPOT_START,
    jackpotProgress: 0,
    spin: null,
    bonus: null,
    roulette: null,
    square: 0,
    balls: 0,
    roulettes: 0,
    spins: 0,
    tiers: { miss: 0, small: 0, big: 0, seven: 0 },
    fevers: 0,
    jackpots: 0,
    refills: 0,
    quickPick: options.quickPick ?? false,
    jewels: 0,
    jewelBonuses: 0,
    riding: [],
  };
}

/** Jewels pushed over the front since the machine was switched on: a full set of lamps for every bonus, and the lamps lit now. */
export const jewelsCollected = (session: Pick<Session, 'jewels' | 'jewelBonuses'>): number => session.jewelBonuses * JEWEL.lamps + session.jewels;

/**
 * Feeds one of the player's medals into an arm, the left (0) or the right (1), wherever that arm is pointed.
 * Returns whether the machine took it: the purse has to hold a medal, and that arm's slot has to be free.
 */
export function insert(session: Session, arm: Arm): boolean {
  if (session.credits <= 0) return false;
  if (!dropMedal(session.machine, arm)) return false;
  session.credits -= 1;
  session.inserted += 1;
  session.jackpotProgress += 1;
  if (session.jackpotProgress >= JACKPOT_STEP) {
    session.jackpotProgress = 0;
    session.jackpot += 1;
  }
  return true;
}

/** Another hundred medals for a player who has run out. */
export function refill(session: Session): boolean {
  if (session.credits > 0) return false;
  session.credits = START_CREDITS;
  session.refills += 1;
  return true;
}

/**
 * Medals given to the player from outside the machine: the day's bonus. They go straight into the purse.
 * They are not fed, won or paid, so no return counts them. Returns whether there was anything to give.
 */
export function grant(session: Session, medals: number, events?: SessionEvent[]): boolean {
  if (!Number.isInteger(medals) || medals <= 0) return false;
  session.credits += medals;
  events?.push({ type: 'bonus', count: medals });
  return true;
}

/** Picks a chest for the player. Returns whether there was a choice to make. */
export function pickChest(session: Session, chest: number): boolean {
  const { bonus } = session;
  if (!bonus || bonus.kind !== 'chest' || bonus.picked >= 0) return false;
  if (!Number.isInteger(chest) || chest < 0 || chest >= bonus.prizes.length) return false;
  bonus.picked = chest;
  bonus.pickedAt = bonus.elapsed;
  return true;
}

/** Whether anything is still in motion on the screen, on an arm, on a tongue, or queued to drop. */
export const isBusy = (session: Session): boolean =>
  session.spin !== null ||
  session.bonus !== null ||
  session.roulette !== null ||
  session.stock > 0 ||
  session.riding.length > 0 ||
  session.balls > 0 ||
  session.machine.payoutQueue > 0 ||
  hopperBusy(session.machine.hopper) ||
  stackerBusy(session.machine.stacker) ||
  session.machine.rolling.length > 0 ||
  session.machine.falling.length > 0;

/**
 * Whether a ball's roulette is running: from its first turn until it comes to
 * a cross, or until the bowls have paid. The towers it pays are stacked onto
 * one tower meanwhile, and that tower waits in its tube until the run is over.
 */
export const gathering = (session: Pick<Session, 'roulette'>): boolean => session.roulette !== null && !session.roulette.over;

/**
 * Pays a prize onto the field: thrown on loose, or stacked in the tubes as
 * towers. With `gather` its towers go on top of the run's tower first.
 */
function pay(session: Session, medals: number, towers: boolean, gather = false): void {
  if (medals <= 0) return;
  if (towers) buildTowers(session.machine, medals, gather);
  else queuePayout(session.machine, medals);
  session.paidOut += medals;
}

/**
 * A jewel has been pushed over the front. It lights a lamp and pays its prize
 * at once, thrown on loose. The one that would light the last lamp pays the
 * bonus instead, as towers, and the lamps go out.
 */
function collectJewel(session: Session, events?: SessionEvent[]): void {
  const { medals, towers } = jewelPays(session.jewels);
  // In the middle of a roulette's run it goes on the run's tower, as everything stacked then does.
  pay(session, medals, towers, gathering(session));
  if (towers) {
    session.jewels = 0;
    session.jewelBonuses += 1;
    events?.push({ type: 'jewelBonus', payout: medals });
  } else {
    session.jewels += 1;
    events?.push({ type: 'jewel', lamps: session.jewels, payout: medals });
  }
}

/** The seconds a roll takes from the die to the piece landing, at hurry `hurry`. */
export const sugorokuDuration = (roll: number, hurry = 0): number => (TIMING.dice + roll * TIMING.hop) * HURRY[hurry].pace;

/** The seconds of suspense a spin's reach adds before the centre reel stops: none, the usual, or the long one. */
export const reachTime = (result: SpinResult, hurry = 0): number =>
  result.reach ? (TIMING.reach + (result.reachKind === 'long' ? TIMING.longReach : 0)) * HURRY[hurry].reach : 0;

function advanceSugoroku(session: Session, bonus: ActiveSugoroku, dt: number, events?: SessionEvent[]): void {
  bonus.elapsed += dt;
  if (bonus.payout < 0 && bonus.elapsed >= bonus.duration) {
    session.square = squareAfter(bonus.from, bonus.roll);
    bonus.payout = BOARD[session.square] * (session.chance ? CHANCE.multiplier : 1);
    const fever = session.square === FEVER_SQUARE;
    if (fever) session.fevers += 1;
    pay(session, bonus.payout, false);
    events?.push({ type: 'sugorokuEnd', square: session.square, payout: bonus.payout, fever });
  }
  if (bonus.elapsed >= bonus.duration + prizeTime(bonus.hurry)) {
    session.bonus = null;
    session.chance = false;
  }
}

function advanceChest(session: Session, bonus: ActiveChest, dt: number, events?: SessionEvent[]): void {
  bonus.elapsed += dt;
  if (bonus.picked < 0 && (session.quickPick || bonus.elapsed >= TIMING.choose)) {
    bonus.picked = bonus.fallback;
    bonus.pickedAt = bonus.elapsed;
  }
  if (bonus.picked < 0) return;
  if (!bonus.told) {
    bonus.told = true;
    events?.push({ type: 'chestPicked', chest: bonus.picked });
  }
  if (bonus.payout < 0 && bonus.elapsed >= bonus.pickedAt + openTime(bonus.hurry)) {
    bonus.payout = bonus.prizes[bonus.picked] * (session.chance ? CHANCE.multiplier : 1);
    pay(session, bonus.payout, bonus.payout >= CHEST_TOWERS_FROM);
    events?.push({ type: 'chestEnd', chest: bonus.picked, payout: bonus.payout });
  }
  if (bonus.payout >= 0 && bonus.elapsed >= bonus.pickedAt + openTime(bonus.hurry) + prizeTime(bonus.hurry)) {
    session.bonus = null;
    session.chance = false;
  }
}

/** Lets the ball go in the top bowl. The whole way down is drawn here, before it moves. */
function startBowl(session: Session, roulette: ActiveRoulette, events?: SessionEvent[]): void {
  const holes = [...FALLS[drawFall(session.machine.rng)]];
  roulette.bowl = { holes, stage: 0, elapsed: 0, duration: BOWL_TIMES[0], payout: -1 };
  roulette.gain = 0;
  events?.push({ type: 'bowlStart', holes, duration: BOWL_TIMES[0] });
}

/** How long what the bowls paid stays up: the jackpot is counted out for longer than a prize from one of the upper bowls. */
export const bowlShowTime = (jackpot: boolean): number => (jackpot ? TIMING.jackpot : TIMING.bowlPrize);

/**
 * The ball rolls round the bowl it is in and drops into its hole. A hole that
 * leads down puts it in the bowl below, where its time starts again. Any
 * other pays what it holds, part of it poured onto the field loose and the
 * rest stacked as towers where the pusher has room for them, and with that
 * the run is over.
 */
function advanceBowl(session: Session, roulette: ActiveRoulette, bowl: ActiveBowl, dt: number, events?: SessionEvent[]): void {
  bowl.elapsed += dt;
  if (bowl.payout < 0 && bowl.elapsed >= bowl.duration) {
    const taken = bowl.holes[bowl.stage];
    const hole = BOWLS[bowl.stage][taken];
    if (hole === 'down') {
      bowl.stage += 1;
      bowl.elapsed = 0;
      bowl.duration = BOWL_TIMES[bowl.stage];
      events?.push({ type: 'bowlDrop', bowl: bowl.stage, hole: taken, duration: bowl.duration });
      return;
    }
    bowl.payout = holePays(hole, session.jackpot);
    roulette.gain = bowl.payout;
    roulette.total += bowl.payout;
    roulette.over = true;
    roulette.jackpot = hole === 'jackpot';
    // A share of it is poured loose and the rest is stacked: on top of the run's tower first, and then as towers of
    // its own. The hopper pours whatever the tubes have no room for, so what is poured is whatever this prize adds to
    // the queue, and that is what is said.
    const queued = session.machine.payoutQueue;
    const loose = pouredOf(bowl.payout);
    pay(session, bowl.payout - loose, true, true);
    pay(session, loose, false);
    const poured = session.machine.payoutQueue - queued;
    if (roulette.jackpot) {
      session.jackpots += 1;
      // It starts over, and the medals played toward its next medal count toward the new one's: none of what the
      // players put toward it is lost when it is won, so it pays exactly `JACKPOT_GROWTH` a medal over a long run.
      session.jackpot = JACKPOT_START;
    }
    events?.push({ type: 'bowlEnd', bowl: bowl.stage, hole: taken, payout: bowl.payout, poured, total: roulette.total, jackpot: roulette.jackpot });
  }
  if (bowl.payout >= 0 && bowl.elapsed >= bowl.duration + bowlShowTime(roulette.jackpot)) session.roulette = null;
}

/** How many gold spins are still to come, the one on the screen and the game it led to included. Chance time lasts while there is one. */
export const chanceLeft = (session: Pick<Session, 'gold' | 'chance'>): number => session.gold + (session.chance ? 1 : 0);

/**
 * Moves the machine forward by `dt` seconds. Events are appended to `events`
 * when it is given.
 *
 * `still` is for a cabinet that shows nothing moving. There a medal is not
 * seen to ride its tongue, so the machine takes it as it comes over the lip:
 * no medal starts a ride in this call. The ones already riding ride on.
 */
export function advance(session: Session, dt: number, events?: SessionEvent[], still = false): void {
  // Chance time begins when a medal finds the hold full, and ends when the last gold spin has been played.
  const before = session.rush;
  const works = events ? watchWorks(session.machine) : null;
  run(session, dt, still, events);
  if (works && events) for (const event of worksEvents(works, session.machine)) events.push(event);
  if (session.rush && chanceLeft(session) === 0) session.rush = false;
  if (!before && session.rush) events?.push({ type: 'chanceStart' });
  else if (before && !session.rush) events?.push({ type: 'chanceEnd' });
}

/**
 * A medal has dropped into a START slot, and the machine takes it. What it
 * finds there is the hold as it stands now. What it brought with it was
 * settled at the lip: its slot, and whether that slot was `lit` gold as it
 * came over.
 */
function throughSlot(session: Session, gate: number, lit: boolean, events?: SessionEvent[]): void {
  if (session.stock === MAX_STOCK - 1) events?.push({ type: 'holdFilled' });
  session.hits += 1;
  const held = session.stock < MAX_STOCK;
  // A medal that finds the hold full starts no spin of its own. It turns one of the held spins gold, if one is left to turn.
  const gold = !held && session.gold < session.stock;
  // One that is held holds a gold spin when it came over a lit slot: the one the lucky lamp was on, or any while the wings were open.
  const lucky = held && lit;
  if (held) session.stock += 1;
  else session.wasted += 1;
  if (gold) {
    session.gold += 1;
    session.gilded += 1;
    session.rush = true;
  }
  if (lucky) {
    session.gold += 1;
    session.lucky += 1;
  }
  events?.push({ type: 'checker', gate, held, gold, lucky });
}

/**
 * The medals on their tongues ride on for `dt` seconds, and each one whose
 * ride is up drops into its slot, in the order they came over. A ride that
 * ends within a billionth of a second of the step's end ends with the step,
 * which is the step the catcher stops showing the medal in.
 */
function rideOn(session: Session, dt: number, events?: SessionEvent[]): void {
  const { riding } = session;
  if (riding.length === 0) return;
  for (const rider of riding) rider.left -= dt;
  let dropped = 0;
  while (dropped < riding.length && riding[dropped].left <= 1e-9) dropped += 1;
  // They are taken off the tongues first, so that whoever is told of one finds the machine without it there.
  for (const { gate, lit } of riding.splice(0, dropped)) throughSlot(session, gate, lit, events);
}

/**
 * Moves the field forward by `dt` seconds, and deals with each medal the
 * lip's rule counts: it starts its ride at the moment it comes over, and is
 * taken at the moment it drops into its slot, `START_RIDE` later; or at once
 * if `still` says that nothing is shown moving.
 *
 * The rule the slots go by changes as the machine runs. A medal that finds
 * the hold full opens the wings, and from then on the slots take medals at
 * their wider width; and the lucky lamp steps on with the pusher. A frame
 * that took long is several of the engine's pieces, and a medal late in it
 * has to meet the rule as the medals before it left it. So the session cuts
 * its time into the engine's own pieces and steps the field one at a time:
 * a piece is stepped with the wings as they stand when it begins; the
 * medals whose ride ends in it drop before the next, and the ones that came
 * over in it are settled before the next, with the lamp where the machine's
 * clock then has it. A medal is dealt with the same whether its frame was
 * short or long.
 *
 * What the field did is returned added up, as one step's worth.
 */
function runField(session: Session, dt: number, still: boolean, slots?: SessionEvent[]): StepEvents {
  if (!(dt >= 0) || !Number.isFinite(dt)) throw new Error('the time step must be a non-negative number');
  let total: StepEvents | null = null;
  let remaining = dt;
  while (remaining > 1e-9) {
    const piece = Math.min(MAX_STEP, remaining);
    remaining -= piece;
    // During chance time the slots' wings are open, and they take medals more easily.
    const wings = session.rush;
    // While a ball's roulette is running, its tower waits in its tube for the next number.
    const field = step(session.machine, piece, wings, gathering(session));
    rideOn(session, piece, slots);
    for (const gate of field.checkers) {
      // Settled here, at the lip: which slot, and whether it was lit, by the lucky lamp or by the wings being open.
      const lit = wings || gate === luckySlot(session.machine.time);
      if (still) {
        throughSlot(session, gate, lit, slots);
      } else {
        session.riding.push({ gate, lit, left: START_RIDE });
        slots?.push({ type: 'riding', gate, lit, seconds: START_RIDE });
      }
    }
    if (!total) {
      total = field;
    } else {
      total.won += field.won;
      total.lost += field.lost;
      total.landed += field.landed;
      total.toppled += field.toppled;
      total.balls += field.balls;
      total.jewels += field.jewels;
      for (const gate of field.checkers) total.checkers.push(gate);
    }
  }
  return total ?? step(session.machine, 0);
}

function run(session: Session, dt: number, still: boolean, events?: SessionEvent[]): void {
  // What is said of the START slots is said after what the field itself did, as it always was.
  const slots: SessionEvent[] | undefined = events && [];
  const field = runField(session, dt, still, slots);
  if (field.won > 0) {
    session.won += field.won;
    session.credits += field.won;
    events?.push({ type: 'won', count: field.won });
  }
  if (field.lost > 0) {
    session.lost += field.lost;
    events?.push({ type: 'lost', count: field.lost });
  }
  if (field.landed > 0) events?.push({ type: 'landed', count: field.landed });
  if (field.toppled > 0) events?.push({ type: 'toppled', count: field.toppled });
  if (field.balls > 0) {
    session.balls += field.balls;
    events?.push({ type: 'ball', count: field.balls });
  }
  for (let i = 0; i < field.jewels; i++) collectJewel(session, events);
  if (events && slots) for (const event of slots) events.push(event);

  // One thing at a time on the screen, and nothing that has started is cut short.
  // A winning line and the game it leads to are one turn: the game follows its
  // line at once, even if a ball has gone over in the meantime. When the screen
  // is free, a ball's roulette comes next, and only then a held spin.
  const { roulette, bonus, spin } = session;
  if (roulette?.bowl) {
    advanceBowl(session, roulette, roulette.bowl, dt, events);
    return;
  }
  if (roulette) {
    roulette.elapsed += dt;
    if (!roulette.landed && roulette.elapsed >= roulette.duration) {
      roulette.landed = true;
      const pocket = ROULETTE[roulette.pocket];
      if (pocket === 'stop') {
        roulette.gain = 0;
        roulette.over = true;
      } else {
        // The number is stacked at once, on top of the run's tower: it goes out when the run is over.
        roulette.level += 1;
        roulette.gain = pocket;
        roulette.total += pocket;
        pay(session, pocket, true, true);
        events?.push({ type: 'rouletteStep', pocket: roulette.pocket, medals: pocket, level: roulette.level });
      }
      if (roulette.over) events?.push({ type: 'rouletteEnd', total: roulette.total, level: roulette.level });
    }
    if (roulette.landed) {
      if (roulette.over) {
        if (roulette.elapsed >= roulette.duration + TIMING.prize) session.roulette = null;
      } else if (roulette.elapsed >= roulette.duration + TIMING.step) {
        if (roulette.level >= CHAIN_GOAL) {
          // A full run: the ball goes into the top bowl.
          startBowl(session, roulette, events);
          return;
        }
        // The light sets off again from where it stopped.
        roulette.from = roulette.pocket;
        roulette.pocket = drawPocket(session.machine.rng);
        roulette.elapsed = 0;
        roulette.landed = false;
        roulette.gain = 0;
      }
    }
    return;
  }

  if (bonus) {
    if (bonus.kind === 'sugoroku') advanceSugoroku(session, bonus, dt, events);
    else advanceChest(session, bonus, dt, events);
    return;
  }

  if (spin) {
    spin.elapsed += dt;
    const { tier } = spin.result;
    if (!spin.done && spin.elapsed >= spin.duration) {
      spin.done = true;
      session.tiers[tier] += 1;
      events?.push({ type: 'spinEnd', result: spin.result });
    }
    if (spin.elapsed < spin.duration + (tier === 'miss' ? 0 : celebrateTime(spin.hurry))) return;
    session.spin = null;
    if (tier === 'miss') {
      session.chance = false;
      return;
    }
    // The line stays up, then the game it leads to begins. A roulette that is
    // waiting on a ball waits for that game too, so the screen never announces
    // one game and plays another.
    const leadsTo = TIER_BONUS[tier];
    if (leadsTo === 'ball') {
      // A ball is a ball, gold spin or not.
      dropBall(session.machine);
      session.chance = false;
    } else if (leadsTo === 'sugoroku') {
      // The game hurries as hard as the hold now behind it says.
      const roll = drawDie(session.machine.rng);
      const hurry = hurryFor(session.stock);
      session.bonus = { kind: 'sugoroku', roll, from: session.square, elapsed: 0, duration: sugorokuDuration(roll, hurry), payout: -1, hurry };
      events?.push({ type: 'sugorokuStart', roll, from: session.square });
    } else {
      const prizes = shuffleChests(session.machine.rng);
      const fallback = Math.min(CHESTS.length - 1, Math.floor(session.machine.rng() * CHESTS.length));
      session.bonus = { kind: 'chest', prizes, fallback, picked: -1, elapsed: 0, pickedAt: -1, told: false, payout: -1, hurry: hurryFor(session.stock) };
      events?.push({ type: 'chestStart' });
    }
    // A treasure line also lets a jewel go from the hatch: one, whether the spin was gold or not.
    if (tier === JEWEL_TIER) {
      dropJewel(session.machine);
      events?.push({ type: 'jewelDrop' });
    }
    return;
  }

  // The screen is free. A ball that has gone over the front has its roulette before any held spin.
  if (session.balls > 0) {
    session.balls -= 1;
    session.roulettes += 1;
    const pocket = drawPocket(session.machine.rng);
    session.roulette = { pocket, from: 0, elapsed: 0, duration: TIMING.roulette, landed: false, level: 0, total: 0, gain: 0, over: false, jackpot: false, bowl: null };
    events?.push({ type: 'rouletteStart', pocket, duration: TIMING.roulette });
    return;
  }

  if (session.stock > 0) {
    session.stock -= 1;
    session.spins += 1;
    // The gold spins are played first.
    session.chance = session.gold > 0;
    if (session.chance) session.gold -= 1;
    const result = drawSpin(session.machine.rng);
    // With spins held behind it the screen hurries, the harder the more there are; and a gold spin's reels are quick at any hurry.
    const hurry = hurryFor(session.stock);
    const duration = reelTime(hurry, session.chance) + reachTime(result, hurry);
    session.spin = { result, elapsed: 0, duration, done: false, hurry };
    events?.push({ type: 'spinStart', result, duration });
  }
}
