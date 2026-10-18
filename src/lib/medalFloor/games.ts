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
 * refill of a minute's fastest play. See each line for where its numbers come from.
 */
const rule = (most: number, perMinute: number, feedFrom: number, labels: FloorGameRule['labels'] = {}): FloorGameRule => ({
  most,
  perMinute,
  burst: most + 10 * perMinute,
  feedFrom,
  labels,
});

export const FLOOR_RULES: Readonly<Record<FloorGame, FloorGameRule>> = {
  // Prizes come down the bowls: 50 or 100, or the jackpot (from 500, no top; believed to PUSHER_JACKPOT_MOST). Both
  // arms held feed 11 medals a second, and a jackpot is poured by the hopper at up to 36 a second.
  'medal-pusher': rule(PUSHER_JACKPOT_MOST, 1_500, 100, {
    jackpot: { min: 500, max: PUSHER_JACKPOT_MOST, feed: true },
    bowl: { amounts: [50, 100], feed: false },
  }),
  // 7-7-7 pays 1,000 a medal on a bet of up to 3; about 85 spins a minute at the quickest.
  'slot-machine': rule(3_000, 750, 150, {
    seven3: { amounts: [1_000, 2_000, 3_000], feed: true },
    bar3: { amounts: [150, 300, 450], feed: true },
  }),
  // The 10 lamp doubled four times: 160. One medal a round, about 20 rounds a minute at the quickest.
  janken: rule(160, 200, 20, {
    'double-up': { amounts: JANKEN_DOUBLE_UPS, feed: false },
  }),
  // 99 on each of the 17 bets that cover one middle number: 99 × (36 + 4 × 18 + 4 × 9 + 12 + 2 × 6 + 3 + 3 + 3 × 2) = 99 × 180.
  roulette: rule(17_820, 6_000, 360),
  // Split to four hands, each doubled and won: 4 × 40 = 160.
  blackjack: rule(160, 1_500, 60),
  // A royal flush on five coins, 4,000 (250 a coin on fewer), doubled up four times: 64,000. Four of a kind 25 a coin,
  // a straight flush 50; a double won brings back twice what was on it.
  'video-poker': rule(64_000, 900, 125, {
    royal: { amounts: [250, 500, 750, 1_000, 4_000], feed: true },
    'straight-flush': { amounts: [50, 100, 150, 200, 250], feed: true },
    'four-kind': { amounts: [25, 50, 75, 100, 125], feed: false },
    'double-up': { amounts: VIDEO_POKER_DOUBLE_UPS, feed: false },
  }),
  // A Dragon 7 with both pairs on the EZ table: 100 pushed + 20 × 41 + 2 × 20 × 12 = 1,400.
  baccarat: rule(1_400, 6_000, 200),
  // A seven on the come-out against the fullest table: the Pass Line 100, Any Seven 250, a Don't Come bet with its 6x
  // lay on every number 2 × (550 + 600 + 650) = 3,600, and the odds behind a Come bet on every number, off on the
  // come-out and given back, 2 × (150 + 200 + 250) = 1,200: 5,150. (Aces on the come-out, the most before Come and
  // Don't Come: 2,200.)
  craps: rule(5_150, 6_000, 300),
  // A straight flush against a dealer who qualifies: 20 + 20 + 50 + 410 = 500.
  'three-card-poker': rule(500, 900, 100, {
    'straight-flush': { min: 1, max: 500, feed: true },
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
