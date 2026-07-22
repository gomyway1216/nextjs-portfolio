/**
 * Shichinarabe (七並べ) - AI opponents with real difficulty tiers.
 *
 * Difficulty tiers (mapped from the shared Difficulty scale):
 *  - easy    : plays a random legal card, never passes strategically.
 *  - medium  : greedy — plays whatever extends its own runs, small look-ahead.
 *  - hard    : evaluates each candidate, prefers cards that unblock its own hand
 *              and avoids handing opponents easy plays; passes only when forced.
 *  - expert  : hard + weighs WHO a play would gift (near-winner urgency, corridor
 *              risk) and will strategically pass (spend a pass) to hold back a
 *              key card when it is confident a rival is gated behind it.
 *  - master  : decides by determinized Monte-Carlo rollouts — it deals the
 *              unseen cards to opponents consistent with their public hand
 *              sizes, plays every candidate move (including a voluntary pass)
 *              out with a fast policy, and picks the best average placement.
 *
 * easy..expert are pure heuristics so turns stay instant; master's rollouts
 * still resolve in a few milliseconds. The evaluation captures the real
 * strategic tension of 七並べ: extend your own runs, keep the cards that gate
 * opponents' progress, and don't waste passes.
 *
 * Fair play: the AI never reads another player's concealed cards. Everything it
 * knows about opponents comes from ShichinarabeEstimator, which uses only public
 * information (table runs, its own hand, everyone's hand SIZE, and the play/pass
 * log) to estimate the probability that an opponent holds a given card. Master's
 * rollouts sample hidden hands from that same public unknown pool.
 */

import type { ShichinarabeAction, ShichinarabeNetworkState } from './multiplayerTypes';
import type { Card, CardSuit } from './types';
import { MAX_RANK, MIN_RANK, SEVEN_RANK } from './types';
import { applyAction, getPlayableCardsForPlayer } from './gameLogic';
import { buildShichinarabeEstimator, type ShichinarabeEstimator } from './ShichinarabeEstimator';

export type ShichinarabeAIDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export type ShichinarabeAIDecision =
  | { type: 'play'; cardId: string }
  | { type: 'pass' };

const SUITS: CardSuit[] = ['S', 'H', 'D', 'C'];

interface AIConfig {
  /** Weight for progressing the AI's own contiguous run behind a candidate. */
  ownChain: number;
  /** Penalty for opening a slot that opponents can likely immediately exploit. */
  opponentGift: number;
  /** How willing the AI is to hold back (pass) a blocking key card. 0 = never. */
  blockAggression: number;
  /** Randomness added to scores to make lower tiers less predictable. */
  noise: number;
  /** Whether the AI ever spends a pass voluntarily to keep a blocking card. */
  canStrategicPass: boolean;
  /**
   * How much gifting a NEAR-WINNER (small public hand size) is penalised over
   * gifting a player with a big hand. 0 = all opponents weigh the same.
   */
  giftUrgency: number;
  /**
   * How much the "corridor" beyond a gifted slot matters. A gift is worse when
   * the ranks past the exposed slot (toward the extreme) contain none of MY
   * cards — opponents can keep flowing without ever needing me — and safer
   * when I gate the corridor myself. 0 = ignore corridor depth.
   */
  giftDepth: number;
  /**
   * Whether the tier adapts blocking to the race standings (public hand
   * sizes): when AHEAD it discounts the gift penalty and races to go out;
   * when clearly BEHIND it blocks harder.
   */
  dynamicTempo: boolean;
  /**
   * Determinized Monte-Carlo rollouts per candidate move (0 = pure heuristic).
   * Each rollout deals the UNSEEN cards randomly to the other players in
   * proportion to their public hand sizes (never peeking at real hands), then
   * plays the game out with a fast policy and scores the final placement.
   */
  rollouts: number;
}

const CONFIG: Record<ShichinarabeAIDifficulty, AIConfig> = {
  easy: { ownChain: 0, opponentGift: 0, blockAggression: 0, noise: 100, canStrategicPass: false, giftUrgency: 0, giftDepth: 0, dynamicTempo: false, rollouts: 0 },
  medium: { ownChain: 3, opponentGift: 0, blockAggression: 0, noise: 8, canStrategicPass: false, giftUrgency: 0, giftDepth: 0, dynamicTempo: false, rollouts: 0 },
  hard: { ownChain: 5, opponentGift: 2, blockAggression: 0, noise: 2, canStrategicPass: false, giftUrgency: 0, giftDepth: 0, dynamicTempo: false, rollouts: 0 },
  expert: { ownChain: 6, opponentGift: 3, blockAggression: 1, noise: 0, canStrategicPass: true, giftUrgency: 0.5, giftDepth: 0.5, dynamicTempo: false, rollouts: 0 },
  // master decides by determinized Monte-Carlo rollouts (see decideByRollouts);
  // its heuristic fields only matter as the fallback if rollouts were disabled.
  master: { ownChain: 7, opponentGift: 4, blockAggression: 2, noise: 0, canStrategicPass: true, giftUrgency: 1, giftDepth: 1, dynamicTempo: true, rollouts: 12 },
};

/**
 * A candidate play is "safe" when its weighted gift cost (expectedOpponentGift:
 * hold probability scaled by near-winner urgency and corridor risk, so it can
 * exceed 1 for expert/master) is below this. The urgency/depth multipliers only
 * ever scale the cost UP from the underlying hold probability, so a cost below
 * this threshold implies the hold probability is below it too. Before any
 * elimination that probability is exactly 0 or 1 (every unseen card is
 * certainly in some active opponent's hand), so any threshold in (0, 1)
 * reproduces the historic `gift === 0` behaviour; after eliminations it
 * tolerates honest uncertainty.
 */
const SAFE_GIFT_THRESHOLD = 0.25;

/**
 * Strategic pass fires when the weighted gift (hold probability x near-winner
 * urgency x corridor risk) times blockAggression reaches this. Calibrated so
 * expert (blockAggression 1) only holds when it is CERTAIN an opponent is
 * gated (p = 1 pre-elimination) AND that opponent is close to going out AND
 * the corridor past the card is ungated — e.g. p 1 x urgency 1.5 x corridor
 * ~1.2 = ~1.8 >= 1.7. Master evaluates holds via rollouts instead.
 */
const STRATEGIC_HOLD_THRESHOLD = 1.7;

function buildSuitRankSets(hand: Card[]): Record<CardSuit, Set<number>> {
  const sets: Record<CardSuit, Set<number>> = { S: new Set(), H: new Set(), D: new Set(), C: new Set() };
  for (const c of hand) sets[c.suit].add(c.rank);
  return sets;
}

/** How long a run continues in `dir` from `start`, using only ranks in `ranks`. */
function consecutiveLengthFrom(ranks: Set<number>, start: number, dir: -1 | 1): number {
  let len = 0;
  let r = start;
  while (r >= MIN_RANK && r <= MAX_RANK && ranks.has(r)) {
    len += 1;
    r += dir;
  }
  return len;
}

/**
 * A card is a "gate" if playing it opens a slot that lets other cards flow, and the
 * distance from 7 measures how many downstream cards it unlocks. Cards near 7 unlock
 * more of the board; extreme cards (A/K) unlock nothing beyond themselves.
 */
function distanceFromSeven(rank: number): number {
  return Math.abs(rank - SEVEN_RANK);
}

/**
 * Estimated cost of the immediate follow-up this candidate would gift: the
 * probability that the slot just past the candidate (away from 7) is held by
 * an active opponent, weighted — for tiers with `giftUrgency` — by how
 * dangerous each likely holder is (opponents with few cards left, a public
 * number, are close to going out, so gifting them is worse) and by corridor
 * risk (`giftDepth`). Computed purely from public information via the
 * estimator; we only look one slot ahead. Returns a weighted COST, not a
 * probability: [0, 1] when giftUrgency and giftDepth are both 0 (hard), and up
 * to (1 + giftUrgency) * (1 + giftDepth) otherwise — e.g. 2.25 for expert's
 * 0.5/0.5 config.
 */
function expectedOpponentGift(
  state: ShichinarabeNetworkState,
  estimator: ShichinarabeEstimator,
  cfg: AIConfig,
  myRanks: Record<CardSuit, Set<number>>,
  suit: CardSuit,
  candidateRank: number,
): number {
  const bounds = state.table[suit];
  // The slot this candidate would newly expose, moving away from centre.
  let exposedRank: number | null = null;
  let dir: -1 | 1 = 1;
  if (candidateRank === bounds.low - 1) {
    exposedRank = candidateRank - 1;
    dir = -1;
  } else if (candidateRank === bounds.high + 1) {
    exposedRank = candidateRank + 1;
  }
  if (exposedRank === null || exposedRank < MIN_RANK || exposedRank > MAX_RANK) return 0;

  let gift = 0;
  for (const { handSize, probability } of estimator.activeOpponentHoldProbabilities(suit, exposedRank)) {
    // Urgency ramps from 1 (holder has >= 6 cards) up to 1 + giftUrgency
    // (holder is one card from going out).
    const urgency = 1 + cfg.giftUrgency * (Math.max(0, 6 - handSize) / 5);
    gift += probability * urgency;
  }

  if (cfg.giftDepth > 0 && gift > 0) {
    // Corridor risk: how far past the exposed slot opponents could keep
    // flowing before they need a card *I* hold. If I gate the corridor
    // immediately the gift is nearly harmless; a long ungated corridor lets
    // rivals dump many cards. Uses only my own hand and the table.
    let corridor = 0;
    for (let r = exposedRank + dir; r >= MIN_RANK && r <= MAX_RANK; r += dir) {
      if (myRanks[suit].has(r)) break;
      corridor += 1;
    }
    gift *= 1 + cfg.giftDepth * (corridor / 11);
  }
  return gift;
}

/** True if I hold a card in `suit` further out than `rank` (so extending helps me). */
function iBenefitDownstream(myRanks: Set<number>, suit: CardSuit, candidateRank: number, bounds: { low: number; high: number }): boolean {
  if (candidateRank === bounds.low - 1) {
    for (let r = candidateRank - 1; r >= MIN_RANK; r--) if (myRanks.has(r)) return true;
  } else if (candidateRank === bounds.high + 1) {
    for (let r = candidateRank + 1; r <= MAX_RANK; r++) if (myRanks.has(r)) return true;
  }
  return false;
}

function scoreCard(
  state: ShichinarabeNetworkState,
  estimator: ShichinarabeEstimator | null,
  card: Card,
  myRanks: Record<CardSuit, Set<number>>,
  cfg: AIConfig,
): number {
  const bounds = state.table[card.suit];
  let dir: -1 | 1 = 1;
  let nextRank = card.rank + 1;
  if (card.rank === bounds.low - 1) {
    dir = -1;
    nextRank = card.rank - 1;
  }

  // Length of my own run immediately behind this card — how much playing it unblocks me.
  const ownChain = consecutiveLengthFrom(myRanks[card.suit], nextRank, dir);
  const benefitsMe = iBenefitDownstream(myRanks[card.suit], card.suit, card.rank, bounds);

  // How much this play likely helps opponents (opening a slot they can use next).
  const gift = estimator ? expectedOpponentGift(state, estimator, cfg, myRanks, card.suit, card.rank) : 0;

  let score = 0;
  score += ownChain * cfg.ownChain;
  // Prefer clearing cards closer to 7 first: they gate more of the board and are the
  // cards most likely to trap us if held too long.
  score += (SEVEN_RANK - distanceFromSeven(card.rank)) * 0.6;
  // Playing a card that continues my own chain is strictly good.
  if (benefitsMe) score += 4;
  // Discourage handing opponents free plays (only matters for hard+).
  score -= gift * cfg.opponentGift;

  if (cfg.noise > 0) score += Math.random() * cfg.noise;
  return score;
}

/**
 * Decide whether it's worth *voluntarily passing* to keep a blocking card.
 * A card is "blocking" if an opponent is likely waiting behind it. Holding it
 * stalls them, but every pass spends toward our own elimination, so we only do
 * this when:
 *   - we have passes to spare, and
 *   - we are confident enough (per the public-information estimator) that the
 *     card gates a rival to be worth a pass, and
 *   - we are not so close to going out that racing is better.
 */
function shouldStrategicPass(
  state: ShichinarabeNetworkState,
  estimator: ShichinarabeEstimator,
  meId: string,
  playable: Card[],
  cfg: AIConfig,
): boolean {
  if (!cfg.canStrategicPass) return false;

  const passesUsed = state.passCounts[meId] ?? 0;
  const passesLeft = state.maxPasses - passesUsed;
  // Elimination fires when passCount REACHES maxPasses, so spending a pass at
  // passesLeft === 2 would leave exactly one — and the next forced pass kills
  // us. Keep at least two in reserve so one forced pass is always survivable.
  if (passesLeft <= 2) return false;

  const myHand = state.hands[meId] ?? [];
  // If we're close to winning, just play — racing beats blocking.
  if (myHand.length <= 3) return false;

  const myRanks = buildSuitRankSets(myHand);

  // Weighted gift cost (hold probability x urgency x corridor risk) of each
  // candidate handing an opponent an immediate play.
  let maxGift = 0;
  let bestBenefitsMe = false;
  let hasSafePlay = false;
  for (const card of playable) {
    const bounds = state.table[card.suit];
    const gift = expectedOpponentGift(state, estimator, cfg, myRanks, card.suit, card.rank);
    if (gift > maxGift) maxGift = gift;
    if (iBenefitDownstream(myRanks[card.suit], card.suit, card.rank, bounds)) {
      bestBenefitsMe = true;
    } else if (gift < SAFE_GIFT_THRESHOLD) {
      // A card that neither helps us downstream nor (likely) gifts an opponent
      // is a free, safe way to shed a card while keeping the blockers in hand.
      hasSafePlay = true;
    }
  }

  // Only hold back (pass) when every legal card is bad: none extends our own chain
  // and none is a safe play — so the remaining options all likely gift opponents.
  // Otherwise we'd waste a pass when we could progress harmlessly. Scaled by
  // aggression and confidence: master (blockAggression 2) holds whenever it is
  // sufficiently sure a rival waits behind a card; expert (blockAggression 1)
  // needs more certainty than a single gated rival can provide.
  if (!bestBenefitsMe && !hasSafePlay && maxGift > 0) {
    return maxGift * cfg.blockAggression >= STRATEGIC_HOLD_THRESHOLD;
  }
  return false;
}


// ----------------------------------------------------------------------------
// Determinized Monte-Carlo rollouts (master tier)
// ----------------------------------------------------------------------------

/** Policy used to play out determinized rollouts. Medium is estimator-free and fast. */
const ROLLOUT_POLICY: ShichinarabeAIDifficulty = 'medium';
/** Hard cap on rollout length; games end far earlier via the pass limit. */
const ROLLOUT_STEP_CAP = 400;
/** Rollout utility: win is worth 1, plus this much spread across final placement. */
const ROLLOUT_PLACE_WEIGHT = 0.25;

/**
 * Deal the UNSEEN cards (from the public-information estimator's unknown pool)
 * randomly to the other players, consistent with their public hand sizes.
 * The decider's own hand is kept as-is; nobody's real concealed cards are read
 * — this is a sample of what the hidden hands COULD be, not what they are.
 */
function determinize(
  state: ShichinarabeNetworkState,
  meId: string,
  estimator: ShichinarabeEstimator,
): ShichinarabeNetworkState {
  const unknown = [...estimator.unknownCards];
  for (let i = unknown.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = unknown[i]!;
    unknown[i] = unknown[j]!;
    unknown[j] = tmp;
  }
  const hands: Record<string, Card[]> = {};
  let idx = 0;
  for (const pid of state.playerOrder) {
    if (pid === meId) {
      hands[pid] = [...(state.hands[pid] ?? [])];
      continue;
    }
    const size = (state.hands[pid] ?? []).length; // public count only
    const assigned: Card[] = [];
    for (let k = 0; k < size && idx < unknown.length; k++) {
      const c = unknown[idx++]!;
      assigned.push({ id: `sim_${c.suit}_${c.rank}`, suit: c.suit, rank: c.rank });
    }
    hands[pid] = assigned;
  }
  // Empty log: rollouts never build estimators, and it keeps per-step log
  // copying in applyAction cheap.
  return { ...state, hands, log: [] };
}

/** Play a determinized state to the end with the rollout policy; return my utility. */
function rolloutOnce(start: ShichinarabeNetworkState, meId: string): number {
  let s = start;
  for (let step = 0; !s.finished && step < ROLLOUT_STEP_CAP; step++) {
    const pid = s.currentTurnPlayerId;
    const d = decideShichinarabeAction(s, pid, ROLLOUT_POLICY);
    const action: ShichinarabeAction = d.type === 'play'
      ? { actionId: `r${step}`, type: 'play', playerId: pid, cardId: d.cardId, timestamp: 0 }
      : { actionId: `r${step}`, type: 'pass', playerId: pid, timestamp: 0 };
    const res = applyAction(s, action);
    if (res.ok) {
      s = res.state;
      continue;
    }
    const pass = applyAction(s, { actionId: `r${step}p`, type: 'pass', playerId: pid, timestamp: 0 });
    if (!pass.ok) break;
    s = pass.state;
  }
  if (!s.finished) return 0.5;
  const n = s.playerOrder.length;
  const place = s.resultOrder.indexOf(meId) + 1;
  if (place <= 0) return 0;
  return (place === 1 ? 1 : 0) + ROLLOUT_PLACE_WEIGHT * ((n - place) / Math.max(1, n - 1));
}

/**
 * Master decision procedure: for every candidate move (each playable card,
 * plus a voluntary pass when we can safely afford one), average the outcome of
 * `cfg.rollouts` determinized playouts and take the best. Strategic passing is
 * thus DISCOVERED (a pass wins rollouts when holding a blocker pays off)
 * rather than hard-coded, and all inference stays on public information.
 */
function decideByRollouts(
  state: ShichinarabeNetworkState,
  meId: string,
  playable: Card[],
  estimator: ShichinarabeEstimator,
  cfg: AIConfig,
): ShichinarabeAIDecision {
  const candidates: ShichinarabeAIDecision[] = playable.map(c => ({ type: 'play', cardId: c.id }));
  const passesLeft = state.maxPasses - (state.passCounts[meId] ?? 0);
  // Same safety margin as shouldStrategicPass: keep two passes in reserve, and
  // race (never stall) when close to going out.
  if (passesLeft > 2 && (state.hands[meId] ?? []).length > 3) {
    candidates.push({ type: 'pass' });
  }

  let best = candidates[0]!;
  let bestValue = -Infinity;
  for (const cand of candidates) {
    let total = 0;
    let broken = false;
    for (let k = 0; k < cfg.rollouts; k++) {
      const det = determinize(state, meId, estimator);
      const action: ShichinarabeAction = cand.type === 'play'
        ? { actionId: `c${k}`, type: 'play', playerId: meId, cardId: cand.cardId, timestamp: 0 }
        : { actionId: `c${k}`, type: 'pass', playerId: meId, timestamp: 0 };
      const res = applyAction(det, action);
      if (!res.ok) {
        broken = true;
        break;
      }
      total += rolloutOnce(res.state, meId);
    }
    if (broken) continue;
    const value = total / Math.max(1, cfg.rollouts);
    // Deterministic tie handling: candidates are iterated in a fixed order
    // (playable cards first, pass last), first best wins.
    if (value > bestValue) {
      bestValue = value;
      best = cand;
    }
  }
  return best;
}

export function decideShichinarabeAction(
  state: ShichinarabeNetworkState,
  playerId: string,
  difficulty: ShichinarabeAIDifficulty = 'hard',
): ShichinarabeAIDecision {
  if (state.finished) return { type: 'pass' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'pass' };

  const playable = getPlayableCardsForPlayer(state, playerId);
  if (playable.length === 0) return { type: 'pass' };

  const cfg = CONFIG[difficulty];

  // easy: just play a random legal card.
  if (difficulty === 'easy') {
    const pick = playable[Math.floor(Math.random() * playable.length)]!;
    return { type: 'play', cardId: pick.id };
  }

  // Only the tiers that reason about opponents need the (public-information)
  // card estimator; easy/medium never look beyond their own hand.
  const needsEstimator = cfg.opponentGift > 0 || cfg.canStrategicPass;
  const estimator = needsEstimator ? buildShichinarabeEstimator(state, playerId) : null;

  // master: evaluate candidates by determinized Monte-Carlo rollouts.
  if (cfg.rollouts > 0 && estimator) {
    return decideByRollouts(state, playerId, playable, estimator, cfg);
  }

  // Consider holding a blocking card (expert only; master discovers holds via rollouts).
  if (estimator && shouldStrategicPass(state, estimator, playerId, playable, cfg)) {
    return { type: 'pass' };
  }

  const hand = state.hands[playerId] ?? [];
  const myRanks = buildSuitRankSets(hand);

  // Dynamic tempo (master): adapt the blocking weight to the race standings,
  // read purely from public hand sizes. Ahead => race out, blocking only
  // burns tempo; clearly behind => block harder to slow the leader down.
  let effectiveCfg = cfg;
  if (cfg.dynamicTempo) {
    let minOppSize = Infinity;
    for (const pid of state.playerOrder) {
      if (pid === playerId) continue;
      if (state.finishedOrder.includes(pid) || state.eliminatedOrder.includes(pid)) continue;
      minOppSize = Math.min(minOppSize, (state.hands[pid] ?? []).length);
    }
    if (Number.isFinite(minOppSize)) {
      if (hand.length < minOppSize) {
        effectiveCfg = { ...cfg, opponentGift: cfg.opponentGift * 0.5 };
      } else if (hand.length > minOppSize + 3) {
        effectiveCfg = { ...cfg, opponentGift: cfg.opponentGift * 1.5 };
      }
    }
  }

  let best = playable[0]!;
  let bestScore = -Infinity;
  for (const card of playable) {
    const s = scoreCard(state, estimator, card, myRanks, effectiveCfg);
    if (s > bestScore || (s === bestScore && card.id.localeCompare(best.id) < 0)) {
      bestScore = s;
      best = card;
    }
  }

  return { type: 'play', cardId: best.id };
}

export { SUITS as SHICHINARABE_SUITS };
