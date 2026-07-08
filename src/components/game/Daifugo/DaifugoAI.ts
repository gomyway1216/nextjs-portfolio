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
import { isJoker, TWO_RANK } from './types';
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
}

const TIER: Record<DaifugoDifficulty, TierConfig> = {
  easy: { blunderRate: 0.55, passDiscipline: false, tactical: false, opponentAware: false },
  medium: { blunderRate: 0.28, passDiscipline: false, tactical: false, opponentAware: false },
  hard: { blunderRate: 0.12, passDiscipline: true, tactical: true, opponentAware: false },
  expert: { blunderRate: 0.04, passDiscipline: true, tactical: true, opponentAware: true },
  master: { blunderRate: 0, passDiscipline: true, tactical: true, opponentAware: true },
};

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

/**
 * All same-rank groupings, plus the joker as a lone single. (This engine only
 * treats the joker as a single — it does not act as a wild inside groups — so
 * we mirror that here to avoid generating illegal joker combos.)
 */
function generateGroupCandidates(hand: Card[]): string[][] {
  const sorted = sortHand(hand);
  const joker = sorted.find(isJoker);
  const groups = groupByRank(sorted);
  const candidates: string[][] = [];

  for (const [, cards] of Array.from(groups.entries()).sort((a, b) => a[0] - b[0])) {
    const maxCount = Math.min(4, cards.length);
    for (let count = 1; count <= maxCount; count++) {
      candidates.push(cards.slice(0, count).map(c => c.id));
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
  const finisher = legalMoves.find(m => isFinishingMove(state, playerId, m));
  if (finisher) {
    const aux = auxiliaryIds(state, playerId, finisher);
    return { type: 'play', cardIds: finisher.cardIds, ...aux };
  }

  // 2) Pass discipline: when following, sometimes it is better to pass and keep
  //    strong cards, letting the trick come back to us / to a weaker opponent.
  if (!leading && tier.passDiscipline) {
    const cheapMoves = legalMoves.filter(m => m.score < 60); // not spending 2/joker
    const mustDefend = tier.opponentAware && oppMin <= 2; // opponent about to win
    if (cheapMoves.length === 0 && !mustDefend) {
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
}

function rankMoves(moves: ScoredMove[], ctx: RankContext): ScoredMove[] {
  const scored = moves.map((m) => {
    let priority = m.score; // lower = play first

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
