/**
 * GTO-inspired local CPU policy.
 *
 * This is intentionally described as "inspired" rather than an exact solver:
 * exact 8-max no-limit Hold'em is not solved. The policy uses solver-shaped
 * ideas that matter in real play — position-dependent preflop ranges, mixed
 * frequencies, pot odds, Monte-Carlo equity, stack-to-pot ratio and polarized
 * bet sizing — without ever reading an opponent's hidden cards.
 */

import {
  cardKey,
  compareHandRanks,
  createDeck,
  evaluateBest,
  getLegalActions,
  rankValue,
  totalPot,
  type Card,
  type GameState,
  type PokerAction,
} from './engine';

const clamp = (value: number, minimum = 0, maximum = 1): number => Math.min(maximum, Math.max(minimum, value));

/** A smooth mixed-strategy frequency around a range threshold. */
function mixFrequency(strength: number, threshold: number, width = 0.14): number {
  return clamp(0.5 + (strength - threshold) / width);
}

/**
 * Compact 0..1 strength model for the 169 canonical preflop hand classes.
 * It preserves the ordering used by common 100bb cash-game opening charts.
 */
export function preflopStrength(hole: readonly Card[]): number {
  if (hole.length !== 2) return 0;
  const first = rankValue(hole[0].rank);
  const second = rankValue(hole[1].rank);
  const high = Math.max(first, second);
  const low = Math.min(first, second);
  if (high === low) return clamp(0.43 + ((high - 2) / 12) * 0.54);

  const suited = hole[0].suit === hole[1].suit;
  const gap = high - low - 1;
  let score = ((high - 2) / 12) * 0.55 + ((low - 2) / 12) * 0.23;
  if (suited) score += 0.055;
  if (gap === 0) score += 0.065;
  else if (gap === 1) score += 0.045;
  else if (gap === 2) score += 0.02;
  else if (gap >= 4) score -= 0.035;
  if (high === 14) score += 0.075;
  if (high === 14 && low <= 5 && suited) score += 0.04; // suited wheel coverage
  return clamp(score);
}

export function estimateEquity(
  hole: readonly Card[],
  board: readonly Card[],
  opponentCount: number,
  rng: () => number = Math.random,
  trials = 120,
): number {
  if (hole.length !== 2 || board.length < 3 || board.length > 5 || opponentCount < 1) return 0;
  const known = new Set([...hole, ...board].map(cardKey));
  const unseen = createDeck().filter((card) => !known.has(cardKey(card)));
  const missingBoard = 5 - board.length;
  let equity = 0;

  for (let trial = 0; trial < trials; trial += 1) {
    const cards = [...unseen];
    const needed = missingBoard + opponentCount * 2;
    for (let index = 0; index < needed; index += 1) {
      const target = index + Math.floor(rng() * (cards.length - index));
      [cards[index], cards[target]] = [cards[target], cards[index]];
    }
    const runout = [...board, ...cards.slice(0, missingBoard)];
    const hero = evaluateBest([...hole, ...runout]);
    let bestOpponents = 0;
    let tiedOpponents = 0;
    for (let opponent = 0; opponent < opponentCount; opponent += 1) {
      const offset = missingBoard + opponent * 2;
      const rank = evaluateBest([cards[offset], cards[offset + 1], ...runout]);
      const comparison = compareHandRanks(rank, hero);
      if (comparison > 0) bestOpponents += 1;
      else if (comparison === 0) tiedOpponents += 1;
    }
    if (bestOpponents === 0) equity += 1 / (tiedOpponents + 1);
  }
  return equity / trials;
}

function relativeToDealer(state: GameState, seatIndex: number): number {
  return (seatIndex - state.dealerIndex + state.players.length) % state.players.length;
}

function openThreshold(state: GameState, seatIndex: number): number {
  const relative = relativeToDealer(state, seatIndex);
  const count = state.players.length;
  if (relative === 0) return 0.47; // button
  if (relative === count - 1) return 0.51; // cutoff
  if (relative === count - 2) return 0.56; // hijack / late middle
  if (relative === 1) return 0.59; // small blind
  if (relative === 2) return 0.53; // big blind option
  return 0.62; // early position
}

function legalRaiseTarget(state: GameState, seatIndex: number, desired: number): number | null {
  const legal = getLegalActions(state, seatIndex);
  if (!legal.canRaise) return null;
  if (legal.maxRaiseTo < legal.minRaiseTo) return legal.maxRaiseTo;
  return Math.max(legal.minRaiseTo, Math.min(legal.maxRaiseTo, Math.round(desired)));
}

function preflopDecision(state: GameState, seatIndex: number, rng: () => number): PokerAction {
  const player = state.players[seatIndex];
  const legal = getLegalActions(state, seatIndex);
  const strength = preflopStrength(player.hole);
  const betInBigBlinds = state.currentBet / state.bigBlind;
  const potOdds = legal.callAmount / Math.max(1, totalPot(state) + legal.callAmount);
  const unopened = betInBigBlinds <= 1;
  const hasLimp = state.players.some((candidate) => candidate.lastAction === 'call');

  if (unopened) {
    const threshold = openThreshold(state, seatIndex);
    const open = rng() < mixFrequency(strength, threshold);
    if (open) {
      const target = legalRaiseTarget(state, seatIndex, state.bigBlind * 2.5);
      if (target !== null) return { type: 'raise', raiseTo: target };
      if (legal.canCall) return { type: 'call' };
    }
    if (legal.canCheck) return { type: 'check' };
    // Solver-shaped ranges are raise-or-fold when first in. Completing is
    // reserved for the small blind and over-limp spots created by the human.
    const canComplete = relativeToDealer(state, seatIndex) === 1 || hasLimp;
    if (canComplete && legal.canCall && strength + potOdds * 0.35 >= threshold - 0.09 && rng() < 0.48) return { type: 'call' };
    return { type: 'fold' };
  }

  const facingThreeBet = betInBigBlinds > 4.2;
  const continueThreshold = (facingThreeBet ? 0.76 : 0.59) + (relativeToDealer(state, seatIndex) > 2 ? -0.025 : 0);
  const adjustedContinue = continueThreshold - clamp((potOdds - 0.25) * 0.35, -0.03, 0.08);
  const raiseThreshold = facingThreeBet ? 0.91 : 0.82;

  if (legal.canRaise && rng() < mixFrequency(strength, raiseThreshold, 0.1) * 0.72) {
    const target = legalRaiseTarget(state, seatIndex, facingThreeBet ? state.currentBet * 2.35 : state.currentBet * 3.1);
    if (target !== null) return { type: 'raise', raiseTo: target };
  }
  if (legal.canCall && rng() < mixFrequency(strength, adjustedContinue, 0.17)) return { type: 'call' };

  // A small blocker-bluff frequency keeps strong opponents from over-folding.
  const hasAce = player.hole.some((card) => card.rank === 'A');
  if (!facingThreeBet && hasAce && legal.canRaise && strength > 0.48 && rng() < 0.045) {
    const target = legalRaiseTarget(state, seatIndex, state.currentBet * 3.05);
    if (target !== null) return { type: 'raise', raiseTo: target };
  }
  if (legal.canCheck) return { type: 'check' };
  return { type: 'fold' };
}

function postflopDecision(state: GameState, seatIndex: number, rng: () => number): PokerAction {
  const player = state.players[seatIndex];
  const legal = getLegalActions(state, seatIndex);
  const opponents = state.players.filter((candidate, index) => index !== seatIndex && !candidate.folded).length;
  const trials = opponents >= 5 ? 80 : opponents >= 3 ? 105 : 140;
  const equity = estimateEquity(player.hole, state.board, opponents, rng, trials);
  const pot = totalPot(state);
  const potOdds = legal.callAmount / Math.max(1, pot + legal.callAmount);
  const effectiveStack = Math.min(
    player.stack,
    ...state.players.filter((candidate, index) => index !== seatIndex && !candidate.folded).map((candidate) => candidate.stack),
  );
  const spr = effectiveStack / Math.max(1, pot);

  if (legal.canCheck) {
    const valueFrequency = equity > 0.78 ? 0.9 : equity > 0.63 ? 0.67 : equity > 0.52 ? 0.27 : 0;
    const bluffFrequency = equity < 0.28 ? (opponents === 1 ? 0.12 : 0.045) : 0;
    if (legal.canRaise && rng() < valueFrequency + bluffFrequency) {
      const fraction = equity > 0.78 && spr < 2.4 ? 0.72 : equity > 0.68 ? 0.58 : 0.34;
      const target = legalRaiseTarget(state, seatIndex, player.streetBet + Math.max(state.bigBlind, pot * fraction));
      if (target !== null) return { type: 'raise', raiseTo: target };
    }
    return { type: 'check' };
  }

  const required = potOdds + (opponents > 2 ? 0.035 : 0);
  const raiseForValue = equity > (spr < 1.4 ? 0.64 : 0.74);
  const semiBluff = equity > required - 0.02 && equity < 0.42 && opponents === 1 && rng() < 0.085;
  if (legal.canRaise && (raiseForValue || semiBluff) && rng() < (raiseForValue ? 0.61 : 1)) {
    const desired = state.currentBet + Math.max(state.minRaise, (pot + legal.callAmount) * (spr < 1.25 ? 1 : 0.68));
    const target = legalRaiseTarget(state, seatIndex, desired);
    if (target !== null) return { type: 'raise', raiseTo: target };
  }
  if (legal.canCall && equity >= required - 0.025) return { type: 'call' };
  return { type: 'fold' };
}

export function decideCpuAction(
  state: GameState,
  seatIndex: number,
  rng: () => number = Math.random,
): PokerAction {
  if (state.currentActor !== seatIndex) throw new Error('CPU was asked to act out of turn');
  return state.street === 'preflop'
    ? preflopDecision(state, seatIndex, rng)
    : postflopDecision(state, seatIndex, rng);
}
