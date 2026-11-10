/**
 * Doubt (ダウト) - Claim history for the post-game bluff report
 *
 * The rules engine's log only stores what was *declared*, because that log is
 * also what online opponents see. For a local game we additionally remember the
 * cards that were really placed face-down on every claim, so that once the game
 * is over the table can be shown what actually happened.
 */

import { applyAction } from './gameLogic';
import type { DoubtAction, DoubtNetworkState } from './multiplayerTypes';
import type { Card, CardRank } from './types';

/**
 * - pending:      waiting for the next player to accept or doubt
 * - accepted:     the next player let it through
 * - doubted:      the next player called Doubt and the cards were revealed
 * - unchallenged: nobody was left to challenge it
 */
export type ClaimOutcome = 'pending' | 'accepted' | 'doubted' | 'unchallenged';

export interface ClaimRecord {
  id: string;
  playerId: string;
  declaredRank: CardRank;
  cards: Card[];
  truthful: boolean;
  outcome: ClaimOutcome;
  challengerId: string | null;
  /** Who picked the pile up, when the claim was doubted. */
  pileTakerId: string | null;
  /** How many cards that player picked up. */
  pileSize: number;
}

export interface TrackedDoubtGame {
  state: DoubtNetworkState;
  history: ClaimRecord[];
}

export interface PlayerClaimSummary {
  claims: number;
  bluffs: number;
  bluffsCaught: number;
  bluffsPassed: number;
  /** Honest claims of this player that somebody wrongly doubted. */
  truthsDoubted: number;
  doubts: number;
  doubtsCorrect: number;
  /** Bluffs this player had the chance to challenge and accepted instead. */
  liesAccepted: number;
  cardsPickedUp: number;
}

export function createTrackedGame(state: DoubtNetworkState): TrackedDoubtGame {
  return { state, history: [] };
}

function resolveLastPending(
  history: ClaimRecord[],
  resolution: Pick<ClaimRecord, 'outcome' | 'challengerId' | 'pileTakerId' | 'pileSize'>,
): ClaimRecord[] {
  const last = history[history.length - 1];
  if (!last || last.outcome !== 'pending') return history;
  return [...history.slice(0, -1), { ...last, ...resolution }];
}

/**
 * Apply an action through the rules engine and record what it revealed about
 * the claim it made or resolved. Pure: returns a new tracked game.
 */
export function applyTrackedAction(
  game: TrackedDoubtGame,
  action: DoubtAction,
): { ok: true; game: TrackedDoubtGame } | { ok: false; error: string } {
  const prev = game.state;
  const result = applyAction(prev, action);
  if (!result.ok) return result;
  const next = result.state;

  if (action.type === 'play') {
    const hand = prev.hands[action.playerId] ?? [];
    const cards = action.cardIds
      .map(id => hand.find(c => c.id === id))
      .filter(Boolean) as Card[];
    const declaredRank = prev.requiredRank;
    const record: ClaimRecord = {
      id: action.actionId,
      playerId: action.playerId,
      declaredRank,
      cards,
      truthful: cards.every(c => c.rank === declaredRank),
      outcome: next.pendingClaim ? 'pending' : 'unchallenged',
      challengerId: null,
      pileTakerId: null,
      pileSize: 0,
    };
    return { ok: true, game: { state: next, history: [...game.history, record] } };
  }

  if (action.type === 'accept') {
    const history = resolveLastPending(game.history, {
      outcome: 'accepted',
      challengerId: action.playerId,
      pileTakerId: null,
      pileSize: 0,
    });
    return { ok: true, game: { state: next, history } };
  }

  const claim = prev.pendingClaim;
  const last = game.history[game.history.length - 1];
  const truthful = last?.truthful ?? false;
  const history = resolveLastPending(game.history, {
    outcome: 'doubted',
    challengerId: action.playerId,
    pileTakerId: truthful ? action.playerId : (claim?.playerId ?? null),
    pileSize: prev.pile.length,
  });
  return { ok: true, game: { state: next, history } };
}

function emptySummary(): PlayerClaimSummary {
  return {
    claims: 0,
    bluffs: 0,
    bluffsCaught: 0,
    bluffsPassed: 0,
    truthsDoubted: 0,
    doubts: 0,
    doubtsCorrect: 0,
    liesAccepted: 0,
    cardsPickedUp: 0,
  };
}

/** Per-player totals. Claims still waiting for a challenge are left out. */
export function summarizeClaims(
  history: ClaimRecord[],
  playerIds: string[],
): Record<string, PlayerClaimSummary> {
  const summary: Record<string, PlayerClaimSummary> = {};
  for (const id of playerIds) summary[id] = emptySummary();
  const of = (id: string): PlayerClaimSummary => (summary[id] ??= emptySummary());

  for (const record of history) {
    if (record.outcome === 'pending') continue;

    const claimant = of(record.playerId);
    claimant.claims++;
    if (!record.truthful) {
      claimant.bluffs++;
      if (record.outcome === 'doubted') claimant.bluffsCaught++;
      else claimant.bluffsPassed++;
    } else if (record.outcome === 'doubted') {
      claimant.truthsDoubted++;
    }

    if (record.challengerId) {
      const challenger = of(record.challengerId);
      if (record.outcome === 'doubted') {
        challenger.doubts++;
        if (!record.truthful) challenger.doubtsCorrect++;
      } else if (!record.truthful) {
        challenger.liesAccepted++;
      }
    }

    if (record.pileTakerId) of(record.pileTakerId).cardsPickedUp += record.pileSize;
  }

  return summary;
}
