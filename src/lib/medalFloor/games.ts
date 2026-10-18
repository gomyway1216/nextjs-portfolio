/**
 * The machines on the medal floor, and what the floor believes each of them can pay.
 *
 * The medals themselves live in each player's browser (MedalCenter/bank.ts), so a
 * win the floor is told of is a player's own word. What the floor checks it
 * against is here, shared by the server, which refuses anything outside it, and
 * by the browser, which uses it to decide when a win is worth telling at once:
 *
 * - `most`: the most medals one round (or one prize) of the machine can pay at
 *   all, worked out from the machine's own tables (pinned by tests against the
 *   games' constants). A win above it is refused.
 * - `labels`: the named wins a machine has (three sevens, a royal flush, a
 *   double-up). A named win must be an amount that win can actually pay.
 * - `perMinute`: the medals won a minute the floor will believe, and `burst` the
 *   most it will believe at once after a rest. Medals won past that allowance
 *   are not counted (the player keeps them: only the ranking ignores them).
 * - `feedFrom`: a win this big, or a named win marked `feed`, is shown to the
 *   whole floor.
 * - `stakeMost`: the most medals one round (or one medal fed) of the machine
 *   can take from the player, worked out from its own limits (pinned by tests),
 *   and `playBurst`, the most medals played the floor believes at once after a
 *   rest: the same `perMinute` refill as the medals won, on top of one round
 *   at its biggest. Medals played feed the floor jackpot (jackpot.ts); past the
 *   allowance they do not, and the player loses nothing by it.
 * - `bestReturn`: the most the machine brings back of every medal played, at
 *   its best bet played its best way, from its own exact odds (pinned by tests;
 *   the Medal Pusher's is measured by its simulation). Only a machine whose
 *   best play, with the floor jackpot added, stays at or under 100% is linked
 *   to the floor jackpot (`linked` in jackpot.ts).
 *
 * Nothing here is money, and no word of it reaches a player as money.
 */

export const FLOOR_GAMES = [
  'medal-pusher',
  'slot-machine',
  'janken',
  'roulette',
  'blackjack',
  'video-poker',
  'baccarat',
  'craps',
  'three-card-poker',
  'fishing',
  'horse-race',
  'ball-bingo',
  'big-wheel',
  'high-low',
  'sic-bo',
  'sugoroku',
] as const;

export type FloorGame = (typeof FLOOR_GAMES)[number];

export const isFloorGame = (value: unknown): value is FloorGame => typeof value === 'string' && (FLOOR_GAMES as readonly string[]).includes(value);

/** A named win: the amounts it can pay, as a list or a range, and whether the floor is shown it whatever its size. */
export interface FloorLabelRule {
  amounts?: readonly number[];
  min?: number;
  max?: number;
  feed: boolean;
}

export interface FloorGameRule {
  most: number;
  perMinute: number;
  burst: number;
  feedFrom: number;
  labels: Readonly<Record<string, FloorLabelRule>>;
  stakeMost: number;
  playBurst: number;
  bestReturn: number;
}

const times = (values: readonly number[], by: readonly number[]): number[] => [...new Set(values.flatMap((value) => by.map((factor) => value * factor)))].sort((a, b) => a - b);

/** The Medal Pusher's jackpot starts at 500 and grows a medal for every 20 played, with no top. The floor believes up to this. */
export const PUSHER_JACKPOT_MOST = 10_000;
/** Calico Janken's lamps (1, 2, 3, 5, 10) doubled one to four times: what a double-up can pay. */
const JANKEN_DOUBLE_UPS = times([1, 2, 3, 5, 10], [2, 4, 8, 16]);
/**
 * Every win a hand of video poker pays, on every pay table and every bet of one to five coins: each line of the tables
 * a coin (jacks or better 1, two pair 2, three of a kind 3, a straight 4, a flush 5 or 6, a full house 6 to 9, four of
 * a kind 25, a straight flush 50), and a royal flush 250 a coin, or 4,000 on five.
 */
const VIDEO_POKER_WINS = [...times([1, 2, 3, 4, 5, 6, 7, 8, 9, 25, 50], [1, 2, 3, 4, 5]), 250, 500, 750, 1_000, 4_000];
/** A video poker win doubled up one to four times (a push keeps it as it is): what a double won can bring back. */
const VIDEO_POKER_DOUBLE_UPS = times(VIDEO_POKER_WINS, [2, 4, 8, 16]);

/**
 * How the allowance is sized: a burst big enough for the machine's biggest win
 * on top of ten minutes' play at the fastest the machine can be played, and a
 * refill of a minute's fastest play. The medals played are sized the same way,
 * from the machine's biggest stake. See each line for where its numbers come from.
 */
const rule = (most: number, perMinute: number, feedFrom: number, stakeMost: number, bestReturn: number, labels: FloorGameRule['labels'] = {}): FloorGameRule => ({
  most,
  perMinute,
  burst: most + 10 * perMinute,
  feedFrom,
  labels,
  stakeMost,
  playBurst: stakeMost + 10 * perMinute,
  bestReturn,
});

/** The most medals one roll of the dice decides at the craps table: every bet the fullest table can hold at once. */
export const CRAPS_DECIDED_MOST = 4_496;

export const FLOOR_RULES: Readonly<Record<FloorGame, FloorGameRule>> = {
  // Prizes come down the bowls: 50 or 100, or the jackpot (from 500, no top; believed to PUSHER_JACKPOT_MOST). Both
  // arms held feed 11 medals a second, and a jackpot is poured by the hopper at up to 36 a second. A medal is fed at a time.
  // Best return: the slowest feed down the middle, as its simulation measures it (about 90%; tuned to stay so).
  'medal-pusher': rule(PUSHER_JACKPOT_MOST, 1_500, 100, 1, 0.902, {
    jackpot: { min: 500, max: PUSHER_JACKPOT_MOST, feed: true },
    bowl: { amounts: [50, 100], feed: false },
  }),
  // 7-7-7 pays 1,000 a medal on a bet of up to 3; about 85 spins a minute at the quickest.
  // Best return: 95.262% (249,724 ÷ 262,144), on any bet.
  'slot-machine': rule(3_000, 750, 150, 3, 0.9527, {
    seven3: { amounts: [1_000, 2_000, 3_000], feed: true },
    bar3: { amounts: [150, 300, 450], feed: true },
  }),
  // The 10 lamp doubled four times: 160. One medal a round, about 20 rounds a minute at the quickest.
  // Best return: 90%, exactly.
  janken: rule(160, 200, 20, 1, 0.9, {
    'double-up': { amounts: JANKEN_DOUBLE_UPS, feed: false },
  }),
  // 99 on each of the 17 bets that cover one middle number: 99 × (36 + 4 × 18 + 4 × 9 + 12 + 2 × 6 + 3 + 3 + 3 × 2) = 99 × 180.
  // The most a spin can take: 99 on every one of the felt's 151 spots.
  // Best return: 36 ÷ 37 (97.30%), every bet alike.
  roulette: rule(17_820, 6_000, 360, 151 * 99, 0.973),
  // Split to four hands, each doubled and won: 4 × 40 = 160. Taken: four hands of 10, each doubled, and the insurance, 5.
  // Best return: 99.49% with the chart's play.
  blackjack: rule(160, 1_500, 60, 4 * 2 * 10 + 5, 0.9949),
  // A royal flush on five coins, 4,000 (250 a coin on fewer), doubled up four times: 64,000. Four of a kind 25 a coin,
  // a straight flush 50; a double won brings back twice what was on it. Played: five coins a hand (a double-up puts
  // back on what was just won, and is not counted as medals played).
  // Best return: 99.54% on 9/6 Jacks or Better, played perfectly.
  'video-poker': rule(64_000, 900, 125, 5, 0.9955, {
    royal: { amounts: [250, 500, 750, 1_000, 4_000], feed: true },
    'straight-flush': { amounts: [50, 100, 150, 200, 250], feed: true },
    'four-kind': { amounts: [25, 50, 75, 100, 125], feed: false },
    'double-up': { amounts: VIDEO_POKER_DOUBLE_UPS, feed: false },
  }),
  // A Dragon 7 with both pairs on the EZ table: 100 pushed + 20 × 41 + 2 × 20 × 12 = 1,400. Taken: every spot at its most, 300.
  // Best return: 98.98% on the Banker at the EZ table.
  baccarat: rule(1_400, 6_000, 200, 300, 0.9899),
  // A seven on the come-out against the fullest table: the Pass Line 100, Any Seven 250, a Don't Come bet with its 6x
  // lay on every number 2 × (550 + 600 + 650) = 3,600, and the odds behind a Come bet on every number, off on the
  // come-out and given back, 2 × (150 + 200 + 250) = 1,200: 5,150. (Aces on the come-out, the most before Come and
  // Don't Come: 2,200.) Played: the medals a roll decides, lost or won and come down, at most every bet the fullest
  // table can hold at once (CRAPS_DECIDED_MOST, pinned by a test against the table's own limits).
  // Best return: 100% on the odds behind a line bet, which pay true odds.
  craps: rule(5_150, 6_000, 300, CRAPS_DECIDED_MOST, 1),
  // A straight flush against a dealer who qualifies: 20 + 20 + 50 + 410 = 500. Taken: an Ante, Pair Plus and Play of 10 each.
  // Best return: 97.99% of every medal wagered on the Ante and Play, played the best way (Pair Plus: 97.68% at most).
  'three-card-poker': rule(500, 900, 100, 30, 0.9799, {
    'straight-flush': { min: 1, max: 500, feed: true },
  }),
  // Big Catch Harbor: the harbor's lord pays ×300 on a cast of up to 5 medals, 1,500; a treasure chest ×10 to ×200.
  // About 120 casts a minute at the quickest, every one skipped to its end, at 5 medals: 600. Taken: one cast at 5.
  // Best return: 90%, exactly, at every bet.
  fishing: rule(1_500, 600, 150, 5, 0.9, {
    'harbor-lord': { amounts: [300, 900, 1_500], feed: true },
    treasure: { amounts: times([10, 20, 50, 200], [1, 3, 5]), feed: false },
  }),
  // Mini Turf Racing: one win ticket and one quinella come in on a race, each at most 99 medals, a win at odds of up to
  // 99 and a quinella up to 999: 99 × (99 + 999) = 108,702. Taken: every one of the 21 tickets at its most, 2,079. A
  // race every twenty seconds or so at the quickest (tickets, START, skip).
  // Best return: 90%, the most any ticket on any race brings back (odds first, every chance R ÷ the odds).
  'horse-race': rule(108_702, 6_000, 300, 2_079, 0.9),
  // A full card pays 500 a medal bet, on a bet of up to 3: 1,500. Taken: three medals a game. A game can be played in a
  // couple of seconds with SKIP: about 180 games a minute at the very quickest.
  // Best return: 89.974% (worked out by dynamic programming over every state a card can be in), on any bet.
  'ball-bingo': rule(1_500, 1_000, 150, 3, 0.8998, {
    'full-card': { amounts: [500, 1_000, 1_500], feed: true },
  }),
  // Star Festival Big Wheel: a second chance's ×10 lamp on the ×40, 400 a medal, on up to 99 medals: 39,600. Every
  // number of the board pays its number a medal (×2 to ×40), and on a second chance that times the lamp (×2, ×3, ×10).
  // A spin every two seconds or so at the quickest (SPIN, then skip): 6,000 a minute, as the other tables. Taken: all
  // seven numbers at their most, 693.
  // Best return: 90%, exactly, on every number.
  // Named: the ×400, and any other second-chance win, each on 1 to 99 medals.
  'big-wheel': rule(39_600, 6_000, 400, 693, 0.9, {
    'wheel-400': { amounts: times([400], Array.from({ length: 99 }, (_, i) => i + 1)), feed: true },
    'wheel-bonus': { amounts: times(times([2, 4, 5, 8, 10, 20, 40], [2, 3, 10]), Array.from({ length: 99 }, (_, i) => i + 1)), feed: false },
  }),
  // High & Low Ladder: the top of the ladder pays 200 a 5 medals bet (×40), on a bet of up to 50: 2,000. A game can end
  // in a couple of seconds (START, one guess skipped to its end, TAKE): about 30 games a minute at the quickest, 1,800
  // medals at most at 60 a game; 3,000 leaves room. Taken: one bet at its biggest, 50.
  // Best return: 89.965% (dynamic programming over the 13 cards on each of the 12 rungs), at every bet.
  // Named: the top of the ladder, on every bet.
  'high-low': rule(2_000, 3_000, 300, 50, 0.8997, {
    'ladder-top': { amounts: [200, 400, 800, 2_000], feed: true },
  }),
  // Moonlit Sic Bo: a triple 2 or 5 with 99 medals on every area that wins it (the triple 181, any triple 31, the double
  // 11, the total 6 or 15 18, the single number three times 4): 245 × 99 = 24,255. A roll every two seconds or so at
  // the quickest (SHAKE, then skip): 6,000 a minute, as the other tables. Taken: all 50 areas at their most, 4,950.
  // Best return: 35/36 (97.22%) on Small or Big, on the Atlantic City paytable (Wizard of Odds), rounded up.
  // Named: a triple bet won (the whole roll's medals back, from 181 on one medal), or else Any Triple won (from 31).
  'sic-bo': rule(24_255, 6_000, 300, 4_950, 0.9723, {
    'sicbo-triple': { min: 181, max: 24_255, feed: true },
    'sicbo-any-triple': { min: 31, max: 24_255, feed: false },
  }),
  // Whale Isle Sugoroku: every figure is per 2 medals bet, on a bet of 2, 4, 6 or 10 (1, 2, 3 or 5 of those). The most
  // a roll pays is the whale ride's: two squares of 2 up the whale's back and the jackpot of 200 at the blowhole, 204
  // per 2 medals, 1,020 on a bet of 10. A roll every second or so at the quickest (ROLL, then skip): 6,000 a minute, as
  // the other quick machines. Taken: one roll at its biggest, 10.
  // Best return: 67/72 (93.06%), the next roll from the best square the boat can stand on, at every bet: the board's
  // Markov chain worked out exactly (steady play brings back 89.74%; betting by the square at most 92.30%).
  // Named: the jackpot, its roll's whole win (200 to 204 per 2 medals); any other whale ride's win (1 to 14 per 2).
  sugoroku: rule(1_020, 6_000, 300, 10, 0.9306, {
    'sugoroku-jp': { amounts: times([200, 201, 202, 203, 204], [1, 2, 3, 5]), feed: true },
    'whale-ride': { amounts: times(Array.from({ length: 14 }, (_, i) => i + 1), [1, 2, 3, 5]), feed: false },
  }),
};

/** The most medals won the floor counts for one player in one day, across every machine. */
export const DAILY_WON_MOST = 200_000;

/** Whether `medals` is an amount the named win `label` of `game` can pay. */
export function labelPays(game: FloorGame, label: string, medals: number): boolean {
  const named = Object.prototype.hasOwnProperty.call(FLOOR_RULES[game].labels, label) ? FLOOR_RULES[game].labels[label] : undefined;
  if (!named) return false;
  if (named.amounts) return named.amounts.includes(medals);
  return medals >= (named.min ?? 1) && medals <= (named.max ?? FLOOR_RULES[game].most);
}

/** Whether a win is one the whole floor is shown. */
export function feedWorthy(game: FloorGame, medals: number, label?: string | null): boolean {
  const named = label && Object.prototype.hasOwnProperty.call(FLOOR_RULES[game].labels, label) ? FLOOR_RULES[game].labels[label] : undefined;
  return (named?.feed ?? false) || medals >= FLOOR_RULES[game].feedFrom;
}
