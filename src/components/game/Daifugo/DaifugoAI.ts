/**
 * Daifugo (大富豪) - AI opponents
 *
 * Difficulty tiers (easy → master) control how much tactical reasoning the AI
 * applies. The core idea across every tier:
 *   - Enumerate every legal move (singles, pairs/triples/quads, straights, joker).
 *   - Score each move so that weak cards are dumped early and strong cards
 *     (2s, jokers, quads) are saved for when they matter.
 *   - Stronger tiers add: pass discipline (don't waste a beat on a table you
 *     don't need to take), tactical use of revolution / 8-cut, "finish now"
 *     detection, and awareness of how close opponents are to going out.
 */

import type { DaifugoNetworkState } from './multiplayerTypes';
import type { Card } from './types';
import { isJoker, JOKER_RANK, TWO_RANK } from './types';
import { applyAction, getPlayShape, sortHand } from './gameLogic';
import type { DaifugoPlayShape } from './gameLogic';

export type DaifugoDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';

export type DaifugoAIDecision =
  | { type: 'play'; cardIds: string[]; giveCardIds?: string[]; discardCardIds?: string[] }
  | { type: 'pass' };

interface TierConfig {
  /** Probability of picking a clearly worse move (noise), 0 = perfect play. */
  blunderRate: number;
  /** Whether the AI holds cards back when it can safely pass a trick. */
  passDiscipline: boolean;
  /** Whether the AI reasons about revolution / 8-cut tactically. */
  tactical: boolean;
  /** Whether the AI tracks opponents' hand sizes to play more aggressively. */
  opponentAware: boolean;
  /**
   * Own-hand shape planning (weakened subset of `planning`, no hidden-card
   * inference): hand-partition go-out shaping, forbidden-finish (あがり禁止)
   * avoidance, and finish detection through 7渡し/10捨て side effects.
   * Implied by `planning` — enforced by the normalization loop below the TIER
   * table, so a tier can never have full planning without this subset. Set it
   * explicitly to give a mid tier hand-planning without card counting /
   * guaranteed-finish search.
   */
  handPlanning: boolean;
  /**
   * Top-tier planning (A/B-verified via scripts/daifugo-ai-match.ts):
   * hand-partition go-out planning, forbidden-finish (あがり禁止) avoidance,
   * card counting from the public play log, and guaranteed-finish detection.
   */
  planning: boolean;
}

const TIER: Record<DaifugoDifficulty, TierConfig> = {
  easy: { blunderRate: 0.55, passDiscipline: false, tactical: false, opponentAware: false, handPlanning: false, planning: false },
  medium: { blunderRate: 0.28, passDiscipline: false, tactical: false, opponentAware: false, handPlanning: false, planning: false },
  hard: { blunderRate: 0.12, passDiscipline: true, tactical: true, opponentAware: false, handPlanning: true, planning: false },
  expert: { blunderRate: 0.04, passDiscipline: true, tactical: true, opponentAware: true, handPlanning: true, planning: true },
  master: { blunderRate: 0, passDiscipline: true, tactical: true, opponentAware: true, handPlanning: true, planning: true },
};

// Invariant: full `planning` implies its own-hand subset `handPlanning`.
// Normalized here so a future TIER edit cannot enable planning without the
// subset the planning code paths assume.
for (const config of Object.values(TIER)) {
  if (config.planning) config.handPlanning = true;
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

function groupByRank(hand: Card[]): Map<number, Card[]> {
  const map = new Map<number, Card[]>();
  for (const card of hand) {
    if (isJoker(card)) continue;
    const list = map.get(card.rank) ?? [];
    list.push(card);
    map.set(card.rank, list);
  }
  return map;
}

function groupBySuit(hand: Card[]): Map<string, Card[]> {
  const map = new Map<string, Card[]>();
  for (const card of hand) {
    if (isJoker(card)) continue;
    const list = map.get(card.suit) ?? [];
    list.push(card);
    map.set(card.suit, list);
  }
  return map;
}

/** All size-k subsets of `items` (k small — groups are at most 4 cards). */
function combinations<T>(items: T[], k: number): T[][] {
  if (k <= 0) return [[]];
  if (k > items.length) return [];
  const result: T[][] = [];
  const pick = (start: number, chosen: T[]) => {
    if (chosen.length === k) {
      result.push(chosen.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]!);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return result;
}

/**
 * All same-rank groupings, plus the joker as a lone single. (This engine only
 * treats the joker as a single — it does not act as a wild inside groups — so
 * we mirror that here to avoid generating illegal joker combos.)
 *
 * For a given rank we enumerate every suit combination for each size, not just
 * the first `count` cards: under しばり / 激縛り the exact suits matter, so a
 * legal beating play can require a specific suit subset (e.g. locked to ♠♥).
 */
function generateGroupCandidates(hand: Card[]): string[][] {
  const sorted = sortHand(hand);
  const joker = sorted.find(isJoker);
  const groups = groupByRank(sorted);
  const candidates: string[][] = [];

  for (const [, cards] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
    const maxCount = Math.min(4, cards.length);
    for (let count = 1; count <= maxCount; count++) {
      for (const combo of combinations(cards, count)) {
        candidates.push(combo.map(c => c.id));
      }
    }
  }

  if (joker) candidates.push([joker.id]);
  return candidates;
}

function generateStraightCandidates(hand: Card[]): string[][] {
  const bySuit = groupBySuit(hand);
  const candidates: string[][] = [];

  for (const cards of bySuit.values()) {
    const sorted = [...cards].sort((a, b) => a.rank - b.rank);
    const byRank = new Map<number, Card>();
    for (const card of sorted) byRank.set(card.rank, card);

    const ranks = Array.from(byRank.keys()).sort((a, b) => a - b);

    let runStart = 0;
    for (let i = 1; i <= ranks.length; i++) {
      const prev = ranks[i - 1];
      const cur = ranks[i];
      const continues = typeof cur === 'number' && cur === (prev ?? 0) + 1;
      if (continues) continue;

      const run = ranks.slice(runStart, i);
      if (run.length >= 3) {
        for (let start = 0; start <= run.length - 3; start++) {
          for (let len = 3; len <= run.length - start; len++) {
            const seq = run.slice(start, start + len);
            const ids = seq.map(r => byRank.get(r)!.id);
            candidates.push(ids);
          }
        }
      }

      runStart = i;
    }
  }

  return candidates;
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * "Strength" of a single card from the current player's perspective, in a
 * range where higher = harder to get rid of / more valuable to keep.
 * Accounts for revolution (which flips rank order).
 */
function cardStrength(card: Card, reversed: boolean): number {
  if (isJoker(card)) return 100; // Joker is always the strongest asset.
  if (!reversed) {
    if (card.rank === TWO_RANK) return 90; // 2 is the top natural card.
    return card.rank; // 3..A -> 3..14
  }
  // Reversed: low cards are strong.
  if (card.rank === 3) return 90;
  return 20 - card.rank;
}

function shapeStrength(shape: DaifugoPlayShape, cards: Card[], reversed: boolean): number {
  if (shape.kind === 'group' && shape.isJokerSingle) return 100;
  // Use the max card strength in the play as its "cost" to us.
  return Math.max(...cards.map(c => cardStrength(c, reversed)));
}

/**
 * Number of remaining unseen cards that can still beat this play. A move that
 * almost nothing beats is a "control" card worth saving.
 */
function beatabilityPenalty(shape: DaifugoPlayShape, reversed: boolean): number {
  const strength = shape.kind === 'group' && shape.isJokerSingle ? 100 : shape.rankKey;
  // Rough: singles that are 2/joker have very low beatability.
  if (shape.kind === 'group' && shape.isJokerSingle) return -30;
  if (!reversed && strength >= TWO_RANK) return -20;
  if (reversed && strength <= 3) return -20;
  return 0;
}

interface ScoredMove {
  cardIds: string[];
  shape: DaifugoPlayShape;
  cards: Card[];
  score: number; // lower = play earlier (dump); higher = save
}

function buildMoves(state: DaifugoNetworkState, playerId: string): ScoredMove[] {
  const hand = state.hands[playerId] ?? [];
  const reversed = state.revolution !== state.jackBack;
  const byId = new Map(hand.map(c => [c.id, c]));

  const raw = [
    ...generateGroupCandidates(hand),
    ...generateStraightCandidates(hand),
  ];

  const seen = new Set<string>();
  const moves: ScoredMove[] = [];

  for (const cardIds of raw) {
    const key = [...cardIds].sort().join(',');
    if (seen.has(key)) continue;
    seen.add(key);

    const cards = cardIds.map(id => byId.get(id)).filter(Boolean) as Card[];
    if (cards.length !== cardIds.length) continue;
    const shape = getPlayShape(cards);
    if (!shape) continue;

    // Base score: how much strength this play spends. Dump cheap plays first.
    let score = shapeStrength(shape, cards, reversed);
    score += beatabilityPenalty(shape, reversed);

    // Prefer emptying pairs/triples together over breaking them for singles:
    // a bigger group is slightly cheaper per-card to unload.
    score -= (shape.count - 1) * 1.5;

    // Straights unload many cards cheaply -> encourage them.
    if (shape.kind === 'straight') score -= shape.count * 2;

    moves.push({ cardIds, shape, cards, score });
  }

  return moves;
}

// ---------------------------------------------------------------------------
// Legality probe (uses the real engine so the AI can never make illegal moves)
// ---------------------------------------------------------------------------

function isLegalPlay(state: DaifugoNetworkState, playerId: string, move: ScoredMove): boolean {
  const remaining = (state.hands[playerId] ?? []).filter(c => !move.cardIds.includes(c.id));
  const giveCardIds = move.shape.kind === 'group' && move.shape.rankKey === 7
    ? sortHand(remaining).slice(0, Math.min(move.shape.count, remaining.length)).map(c => c.id)
    : undefined;
  const afterGive = giveCardIds ? remaining.filter(c => !giveCardIds.includes(c.id)) : remaining;
  const discardCardIds = move.shape.kind === 'group' && move.shape.containsTen
    ? sortHand(afterGive).slice(0, Math.min(move.shape.count, afterGive.length)).map(c => c.id)
    : undefined;

  const result = applyAction(state, {
    actionId: 'ai_probe',
    type: 'play',
    playerId,
    cardIds: move.cardIds,
    giveCardIds,
    discardCardIds,
    timestamp: 0,
  });
  return result.ok;
}

function auxiliaryIds(state: DaifugoNetworkState, playerId: string, move: ScoredMove) {
  const remaining = (state.hands[playerId] ?? []).filter(c => !move.cardIds.includes(c.id));
  const giveCardIds = move.shape.kind === 'group' && move.shape.rankKey === 7 && remaining.length > 0
    ? sortHand(remaining).slice(0, Math.min(move.shape.count, remaining.length)).map(c => c.id)
    : undefined;
  const afterGive = giveCardIds ? remaining.filter(c => !giveCardIds.includes(c.id)) : remaining;
  const discardCardIds = move.shape.kind === 'group' && move.shape.containsTen && afterGive.length > 0
    ? sortHand(afterGive).slice(0, Math.min(move.shape.count, afterGive.length)).map(c => c.id)
    : undefined;
  return { giveCardIds, discardCardIds };
}

// ---------------------------------------------------------------------------
// Tactical helpers
// ---------------------------------------------------------------------------

function minOpponentHand(state: DaifugoNetworkState, playerId: string): number {
  let min = Infinity;
  for (const pid of state.playerOrder) {
    if (pid === playerId) continue;
    if (state.finishedOrder.includes(pid)) continue;
    min = Math.min(min, (state.hands[pid] ?? []).length);
  }
  return min === Infinity ? 0 : min;
}

/** Would this move let us go out on this play? */
function isFinishingMove(state: DaifugoNetworkState, playerId: string, move: ScoredMove): boolean {
  const hand = state.hands[playerId] ?? [];
  return hand.length === move.cardIds.length;
}

// ---------------------------------------------------------------------------
// Planning helpers (top tier — every addition here is A/B-gated via
// scripts/daifugo-ai-match.ts before it ships)
// ---------------------------------------------------------------------------

/**
 * Hand left after playing `move`, including the cards its automatic
 * 7渡し (give) / 10捨て (discard) side effects would remove. Playing a 7 or 10
 * can therefore empty the hand even when the played set is smaller than it.
 */
function remainingAfterPlay(state: DaifugoNetworkState, playerId: string, move: ScoredMove): Card[] {
  const remaining = (state.hands[playerId] ?? []).filter(c => !move.cardIds.includes(c.id));
  const { giveCardIds, discardCardIds } = auxiliaryIds(state, playerId, move);
  if (!giveCardIds && !discardCardIds) return remaining;
  const removed = new Set([...(giveCardIds ?? []), ...(discardCardIds ?? [])]);
  return remaining.filter(c => !removed.has(c.id));
}

function partitionGroupsOnly(cards: Card[]): Card[][] {
  const combos: Card[][] = [];
  for (const card of cards) {
    if (isJoker(card)) combos.push([card]);
  }
  for (const group of groupByRank(cards).values()) combos.push(group);
  return combos;
}

function partitionWithStraights(cards: Card[]): Card[][] {
  const combos: Card[][] = [];
  const used = new Set<string>();

  for (const suitCards of groupBySuit(cards).values()) {
    const byRank = new Map<number, Card>();
    for (const card of suitCards) byRank.set(card.rank, card);
    const ranks = Array.from(byRank.keys()).sort((a, b) => a - b);

    let runStart = 0;
    for (let i = 1; i <= ranks.length; i++) {
      if (i < ranks.length && ranks[i]! === ranks[i - 1]! + 1) continue;
      const run = ranks.slice(runStart, i);
      if (run.length >= 3) {
        const combo = run.map(r => byRank.get(r)!);
        combos.push(combo);
        for (const card of combo) used.add(card.id);
      }
      runStart = i;
    }
  }

  const rest = cards.filter(c => !used.has(c.id));
  return [...combos, ...partitionGroupsOnly(rest)];
}

/**
 * Greedy partition of a hand into legal combos (straights, same-rank groups,
 * joker single). Its size approximates the minimum number of turns needed to
 * empty the hand — a short go-out path is worth protecting. Two greedy
 * variants (straights-first vs groups-only) are compared because a straight
 * can steal a card from a pair and make the partition worse.
 */
export function partitionHand(hand: Card[]): Card[][] {
  const withStraights = partitionWithStraights(hand);
  const groupsOnly = partitionGroupsOnly(hand);
  return withStraights.length <= groupsOnly.length ? withStraights : groupsOnly;
}

/** Approximate number of plays needed to empty this hand (0 for empty). */
export function estimateTurnsToGo(hand: Card[]): number {
  if (hand.length === 0) return 0;
  return partitionHand(hand).length;
}

/**
 * Count unseen copies of each rank (index 3..15, joker at JOKER_RANK) using
 * only information this player legitimately has: their own hand plus the
 * public play log. Cards moved by 7渡し or discarded by 10捨て are never
 * logged as plays, so they simply stay "unseen" — the estimate errs on the
 * side of assuming opponents still hold cards.
 */
export function countUnseenByRank(state: DaifugoNetworkState, playerId: string): number[] {
  const unseen = new Array<number>(JOKER_RANK + 1).fill(0);
  for (let r = 3; r <= TWO_RANK; r++) unseen[r] = 4;
  unseen[JOKER_RANK] = 1;

  for (const card of state.hands[playerId] ?? []) {
    const r = isJoker(card) ? JOKER_RANK : card.rank;
    if ((unseen[r] ?? 0) > 0) unseen[r]!--;
  }

  for (const entry of state.log) {
    if (entry.type !== 'play') continue;
    // Skip informational entries (revolution/eleven-back notes) which carry no
    // play payload.
    if (!entry.playKind || !entry.cardCount || typeof entry.rankKey !== 'number') continue;
    if (entry.playKind === 'group') {
      unseen[entry.rankKey] = Math.max(0, (unseen[entry.rankKey] ?? 0) - entry.cardCount);
    } else {
      for (let r = entry.rankKey - entry.cardCount + 1; r <= entry.rankKey; r++) {
        unseen[r] = Math.max(0, (unseen[r] ?? 0) - 1);
      }
    }
  }

  return unseen;
}

/** Whether the 3♠ (the only card that beats a lone joker) might still be held by an opponent. */
function isSpade3Unseen(state: DaifugoNetworkState, playerId: string): boolean {
  for (const card of state.hands[playerId] ?? []) {
    if (card.suit === 'S' && card.rank === 3) return false;
  }
  for (const entry of state.log) {
    if (entry.type !== 'play' || !entry.playKind || !entry.cardCount) continue;
    if (typeof entry.rankKey !== 'number' || !entry.signature) continue;
    if (entry.playKind === 'group') {
      if (entry.rankKey === 3 && entry.signature.includes('S')) return false;
    } else {
      const startRank = entry.rankKey - entry.cardCount + 1;
      if (entry.signature.startsWith('S') && startRank <= 3) return false;
    }
  }
  return true;
}

/**
 * True when no combination of unseen cards can beat this play on the trick it
 * starts or continues, i.e. making it wins the trick. Conservative: しばり /
 * 激縛り restrictions (which only shrink opponents' options) and exact suit
 * knowledge for straights are ignored, so this may under-claim but never
 * over-claims... except for cards hidden by 10捨て, which stay counted as
 * unseen and therefore also only make the check stricter.
 */
function isUnbeatablePlay(
  state: DaifugoNetworkState,
  move: ScoredMove,
  unseen: number[],
  spade3Unseen: boolean
): boolean {
  return isUnbeatableShape(move.shape, state.revolution, state.jackBack, unseen, spade3Unseen);
}

/**
 * Core of isUnbeatablePlay, parameterized on the revolution / eleven-back
 * state *before* the play so forced-out lines can be probed several plays
 * ahead (the play's own toggles are applied here).
 */
function isUnbeatableShape(
  shape: DaifugoPlayShape,
  revolutionBefore: boolean,
  jackBackBefore: boolean,
  unseen: number[],
  spade3Unseen: boolean
): boolean {
  // Ordering opponents face after our play (its own revolution toggle and
  // eleven-back included).
  const revolutionAfter = shape.count >= 4 ? !revolutionBefore : revolutionBefore;
  const jackBackAfter = jackBackBefore || (shape.kind !== 'straight' && shape.containsJack);
  const reversedAfter = revolutionAfter !== jackBackAfter;

  if (shape.kind === 'group' && shape.isJokerSingle) {
    return !spade3Unseen; // only 3♠ beats a lone joker
  }

  if (shape.kind === 'straight') {
    // A beating straight needs `count` consecutive unseen ranks whose top rank
    // beats ours. We track counts per rank (not suits): if every rank of some
    // window is still unseen, a same-suit run could exist there.
    for (let top = 3 + shape.count - 1; top <= TWO_RANK; top++) {
      const beats = !reversedAfter ? top > shape.rankKey : top < shape.rankKey;
      if (!beats) continue;
      let possible = true;
      for (let r = top - shape.count + 1; r <= top; r++) {
        if ((unseen[r] ?? 0) < 1) { possible = false; break; }
      }
      if (possible) return false;
    }
    return true;
  }

  // Same-rank group at a natural rank.
  if (shape.count === 1 && (unseen[JOKER_RANK] ?? 0) > 0) return false; // joker beats any single
  if (!reversedAfter) {
    for (let r = shape.rankKey + 1; r <= TWO_RANK; r++) {
      if ((unseen[r] ?? 0) >= shape.count) return false;
    }
  } else {
    for (let r = 3; r < shape.rankKey; r++) {
      if ((unseen[r] ?? 0) >= shape.count) return false;
    }
  }
  return true;
}

/**
 * あがり禁止 check for playing the whole `hand` as the FINAL play when leading
 * a fresh trick (table cleared, so eleven-back is off before the play; only
 * the play's own toggles apply).
 */
function isForbiddenFinishHand(hand: Card[], shape: DaifugoPlayShape, revolutionBefore: boolean): boolean {
  const revolutionFinal = shape.count >= 4 ? !revolutionBefore : revolutionBefore;
  const jackBackFinal = shape.kind !== 'straight' && shape.containsJack;
  const reversedFinal = revolutionFinal !== jackBackFinal;
  if (hand.some(isJoker)) return true;
  if (!reversedFinal && hand.some(c => !isJoker(c) && c.rank === TWO_RANK)) return true;
  if (reversedFinal && hand.some(c => !isJoker(c) && c.rank === 3)) return true;
  if (shape.containsEight) return true;
  return false;
}

/**
 * Can we provably go out leading `hand` within `stepsLeft` plays, where every
 * non-final play must win its trick outright (8切り clears the table, an
 * unbeatable combo forces everyone to pass) and the final play must be a
 * legal, non-forbidden finish?
 *
 * Intermediate 7 (7渡し) and 10 (10捨て) groups are excluded from the search:
 * their automatic give/discard side effects would change the remaining hand
 * mid-line, so lines through them are not provable here.
 */
function canForceOutFromLead(
  hand: Card[],
  revolution: boolean,
  unseen: number[],
  spade3Unseen: boolean,
  stepsLeft: number
): boolean {
  if (hand.length === 0) return true;
  if (stepsLeft <= 0) return false;

  const whole = getPlayShape(hand);
  if (whole && !isForbiddenFinishHand(hand, whole, revolution)) return true;
  if (stepsLeft <= 1) return false;

  const byId = new Map(hand.map(c => [c.id, c]));
  const raw = [...generateGroupCandidates(hand), ...generateStraightCandidates(hand)];
  const dedup = new Set<string>();

  for (const cardIds of raw) {
    const key = [...cardIds].sort().join(',');
    if (dedup.has(key)) continue;
    dedup.add(key);
    if (cardIds.length === hand.length) continue; // finishing handled above

    const cards = cardIds.map(id => byId.get(id)).filter(Boolean) as Card[];
    if (cards.length !== cardIds.length) continue;
    const shape = getPlayShape(cards);
    if (!shape) continue;
    if (shape.kind === 'group' && (shape.rankKey === 7 || shape.containsTen)) continue;

    const winsTrick = shape.containsEight
      || isUnbeatableShape(shape, revolution, false, unseen, spade3Unseen);
    if (!winsTrick) continue;

    const revolutionAfter = shape.count >= 4 ? !revolution : revolution;
    const idSet = new Set(cardIds);
    const rest = hand.filter(c => !idSet.has(c.id));
    if (canForceOutFromLead(rest, revolutionAfter, unseen, spade3Unseen, stepsLeft - 1)) {
      return true;
    }
  }

  return false;
}

/**
 * Mirrors gameLogic's isForbiddenFinish (あがり禁止札) for a play that would
 * empty our hand: joker, 2 (normal order), 3 (reversed), or any 8 as the final
 * play demotes us to last place. Accounts for the play's own revolution toggle
 * and eleven-back effect, exactly like the engine's post-play check.
 */
function isForbiddenFinishPlay(state: DaifugoNetworkState, move: ScoredMove): boolean {
  const revolutionAfter = move.shape.count >= 4 ? !state.revolution : state.revolution;
  const jackBackAfter = state.jackBack || (move.shape.kind !== 'straight' && move.shape.containsJack);
  const reversedAfter = revolutionAfter !== jackBackAfter;

  if (move.cards.some(isJoker)) return true;
  if (!reversedAfter && move.cards.some(c => !isJoker(c) && c.rank === TWO_RANK)) return true;
  if (reversedAfter && move.cards.some(c => !isJoker(c) && c.rank === 3)) return true;
  if (move.shape.containsEight) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main decision
// ---------------------------------------------------------------------------

export function decideDaifugoAction(
  state: DaifugoNetworkState,
  playerId: string,
  difficulty: DaifugoDifficulty = 'medium'
): DaifugoAIDecision {
  if (state.finished) return { type: 'pass' };
  if (state.currentTurnPlayerId !== playerId) return { type: 'pass' };

  const tier = TIER[difficulty];
  const hand = state.hands[playerId] ?? [];
  const reversed = state.revolution !== state.jackBack;
  const oppMin = minOpponentHand(state, playerId);

  const allMoves = buildMoves(state, playerId);
  const legalMoves = allMoves.filter(m => isLegalPlay(state, playerId, m));

  // Leading (empty table): we must play something (pass is illegal).
  const leading = !state.pile;

  if (legalMoves.length === 0) {
    // No legal play. If leading we are forced to play; the engine's group
    // generation always yields at least one single, so this only happens when
    // following and we cannot beat the pile -> pass.
    if (leading && allMoves.length > 0) {
      const forced = allMoves[0]!;
      const aux = auxiliaryIds(state, playerId, forced);
      return { type: 'play', cardIds: forced.cardIds, ...aux };
    }
    return { type: 'pass' };
  }

  // 1) Always take a guaranteed finish if available.
  if (tier.handPlanning) {
    // Hand-planning tiers also see finishes through 7渡し/10捨て emptying the hand,
    // and refuse あがり禁止 finishes (those demote the player to last place).
    const finisher = legalMoves.find(m =>
      remainingAfterPlay(state, playerId, m).length === 0 && !isForbiddenFinishPlay(state, m)
    );
    if (finisher) {
      const aux = auxiliaryIds(state, playerId, finisher);
      return { type: 'play', cardIds: finisher.cardIds, ...aux };
    }
  } else {
    const finisher = legalMoves.find(m => isFinishingMove(state, playerId, m));
    if (finisher) {
      const aux = auxiliaryIds(state, playerId, finisher);
      return { type: 'play', cardIds: finisher.cardIds, ...aux };
    }
  }

  // 1.5) Guaranteed finish lines (full-planning tiers): play a trick-winning move
  //      now — an 8切り clears the table immediately, an unbeatable play wins
  //      the trick once everyone passes — and keep the lead until the hand
  //      can be emptied with a legal, non-forbidden final play.
  const unseen = tier.planning ? countUnseenByRank(state, playerId) : null;
  const s3Unseen = tier.planning ? isSpade3Unseen(state, playerId) : true;
  if (tier.planning && unseen) {
    for (const m of legalMoves) {
      const remaining = remainingAfterPlay(state, playerId, m);
      if (remaining.length === 0) continue; // direct finishes handled above

      const winsTrick = m.shape.containsEight || isUnbeatablePlay(state, m, unseen, s3Unseen);
      if (!winsTrick) continue;

      const revAfterM = m.shape.count >= 4 ? !state.revolution : state.revolution;
      if (canForceOutFromLead(remaining, revAfterM, unseen, s3Unseen, 3)) {
        const aux = auxiliaryIds(state, playerId, m);
        return { type: 'play', cardIds: m.cardIds, ...aux };
      }
    }
  }

  // 2) Pass discipline: when following, sometimes it is better to pass and keep
  //    strong cards, letting the trick come back to us / to a weaker opponent.
  if (!leading && tier.passDiscipline) {
    // Opponent about to win: every passDiscipline tier must defend rather than
    // hoard. (For opponentAware tiers this is the same condition as before —
    // the flag is implied — so expert/master decisions are unchanged.)
    const mustDefend = oppMin <= 2;
    // Tiers without full `planning` (hard, which has only the handPlanning
    // subset): spending a control (2/joker) to seize the lead is exactly how a
    // short hand goes out. Only hoard controls while the hand is still big.
    // Without this, hard NEVER played 2/joker as a follower (mustDefend used
    // to require opponentAware) and hoarded them forever — A/B-measured at
    // −20pp vs medium.
    const nearOut = !tier.planning && hand.length <= 5;
    const cheapMoves = tier.planning
      // Full-planning tiers: a response is only worth a card if it is cheap
      // AND actually shortens the go-out path (does not just break up a combo).
      ? legalMoves.filter(m =>
        m.score < 60 &&
        estimateTurnsToGo(remainingAfterPlay(state, playerId, m)) < estimateTurnsToGo(hand)
      )
      : legalMoves.filter(m => m.score < 60); // not spending 2/joker
    if (cheapMoves.length === 0 && !mustDefend && !nearOut) {
      // Every legal response would burn a premium card. Hold unless the pile is
      // trivial to beat with a low card.
      return { type: 'pass' };
    }
  }

  // 3) Order candidate moves.
  const ranked = rankMoves(legalMoves, {
    leading,
    tier,
    oppMin,
    reversed,
    handSize: hand.length,
    state,
    playerId,
    handTurns: tier.handPlanning ? estimateTurnsToGo(hand) : 0,
  });

  // 4) Blunder / noise: weaker tiers occasionally pick a non-optimal legal move.
  let chosen = ranked[0]!;
  if (tier.blunderRate > 0 && ranked.length > 1 && Math.random() < tier.blunderRate) {
    const idx = 1 + Math.floor(Math.random() * (ranked.length - 1));
    chosen = ranked[idx]!;
  }

  const aux = auxiliaryIds(state, playerId, chosen);
  return { type: 'play', cardIds: chosen.cardIds, ...aux };
}

interface RankContext {
  leading: boolean;
  tier: TierConfig;
  oppMin: number;
  reversed: boolean;
  handSize: number;
  state: DaifugoNetworkState;
  playerId: string;
  /** estimateTurnsToGo(hand) for hand-planning tiers, 0 otherwise. */
  handTurns: number;
}

function rankMoves(moves: ScoredMove[], ctx: RankContext): ScoredMove[] {
  const scored = moves.map((m) => {
    let priority = m.score; // lower = play first

    // Hand-planning tiers: never *choose* a forbidden finish (あがり禁止) if any
    // alternative exists — finishing with joker/2/8 means finishing last.
    // Also prefer plays that keep the remaining hand's go-out path short
    // (avoid breaking pairs/triples/straights needlessly).
    const remainingPlanning = ctx.tier.handPlanning
      ? remainingAfterPlay(ctx.state, ctx.playerId, m)
      : null;
    if (remainingPlanning) {
      if (remainingPlanning.length === 0 && isForbiddenFinishPlay(ctx.state, m)) {
        priority += 500;
      }
      priority += estimateTurnsToGo(remainingPlanning) * 5;

      // Endgame lead with exactly two combos left and no proven finish line:
      // lead the STRONG combo first (it often wins the trick outright), keeping
      // the weak combo as the final play — leading weak instead usually means
      // never regaining the lead. `priority` starts at +m.score, so subtracting
      // 2*score nets out to -score, genuinely inverting the ordering to
      // strong-first (subtracting score once would only cancel the base term).
      if (ctx.leading && ctx.handTurns === 2) {
        priority -= 2 * m.score;
      }
    }

    // 8-cut / revolution tactics (higher tiers only).
    if (ctx.tier.tactical) {
      // Play an 8 (8切り) to seize the lead when an opponent is close to out —
      // clearing the table denies them their setup and hands us control.
      if (m.shape.containsEight && ctx.oppMin <= 3) priority -= 25;

      // Revolution (4+ of a kind): valuable when we hold many low cards, which
      // become strong after a flip. Discourage random revolutions otherwise.
      if (m.shape.count >= 4) {
        priority -= ctx.reversed ? 8 : 30; // toggling on is a committed play
      }
    }

    // When leading, prefer to shed our weakest, longest plays; but keep at least
    // one control card for the endgame if the hand is still large.
    if (ctx.leading) {
      priority -= m.shape.count * 2; // dump volume when we get a free lead
      if (ctx.tier.opponentAware && ctx.oppMin <= 2 && m.score < 40) {
        // Opponent about to win: lead a low card to force them to respond.
        priority -= 10;
      }
    }

    return { move: m, priority };
  });

  scored.sort((a, b) => a.priority - b.priority);
  return scored.map(s => s.move);
}
