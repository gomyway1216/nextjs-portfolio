/**
 * Running balance of a play session: after every game the balance moves by
 * (payoff − entry price charged for that game). Nothing here draws random
 * numbers; it only records results that were already played.
 */

/** Sampled points kept for drawing; when this many accumulate, every other one is dropped. */
export const MAX_TRACK_POINTS = 600;

export interface BankrollTrack {
  /** Games recorded so far. */
  games: number;
  /** Balance after the last recorded game (winnings − fees). */
  net: number;
  /** A sample is kept every `stride` games. */
  stride: number;
  /** points[i] is the balance after (i + 1) · stride games. */
  points: number[];
  /** Lowest balance reached (0 before any game) and the game it was reached on. */
  low: number;
  lowAt: number;
  /** Highest balance reached (0 before any game) and the game it was reached on. */
  high: number;
  highAt: number;
  /** Games whose payoff was at least the entry price charged for that game. */
  paidBack: number;
}

export interface BankrollPoint {
  game: number;
  net: number;
}

export function emptyTrack(): BankrollTrack {
  return { games: 0, net: 0, stride: 1, points: [], low: 0, lowAt: 0, high: 0, highAt: 0, paidBack: 0 };
}

/** Returns a new track with `payoffs` appended, each game charged `entryPrice`. */
export function appendGames(
  track: BankrollTrack,
  payoffs: readonly number[],
  entryPrice: number,
): BankrollTrack {
  if (payoffs.length === 0) return track;
  let { games, net, stride, low, lowAt, high, highAt, paidBack } = track;
  let points = track.points.slice();
  for (const payoff of payoffs) {
    games += 1;
    net += payoff - entryPrice;
    if (payoff >= entryPrice) paidBack += 1;
    if (net < low) {
      low = net;
      lowAt = games;
    }
    if (net > high) {
      high = net;
      highAt = games;
    }
    if (games % stride === 0) {
      points.push(net);
      if (points.length >= MAX_TRACK_POINTS) {
        // Keep the samples that fall on multiples of the doubled stride.
        points = points.filter((_, i) => i % 2 === 1);
        stride *= 2;
      }
    }
  }
  return { games, net, stride, points, low, lowAt, high, highAt, paidBack };
}

/**
 * Points to draw, in game order: the start (0, 0), the kept samples, the
 * exact lowest and highest balances, and the current balance.
 */
export function trackPoints(track: BankrollTrack): BankrollPoint[] {
  const byGame = new Map<number, number>();
  byGame.set(0, 0);
  track.points.forEach((net, i) => byGame.set((i + 1) * track.stride, net));
  byGame.set(track.lowAt, track.low);
  byGame.set(track.highAt, track.high);
  byGame.set(track.games, track.net);
  return Array.from(byGame, ([game, net]) => ({ game, net })).sort((a, b) => a.game - b.game);
}

/**
 * Probability that one game pays at least `price`: the payoff 2^(n−1) first
 * reaches `price` at the smallest n with 2^(n−1) ≥ price, and
 * P(first tails on flip n or later) = (1/2)^(n−1).
 */
export function probPayoffAtLeast(price: number): number {
  let payoff = 1;
  let prob = 1;
  while (payoff < price) {
    payoff *= 2;
    prob /= 2;
  }
  return prob;
}
