import { GameError } from './errors';
import type { Phase } from './types';

/** Display-only crowd reactions. They never touch scores, ranks, party points or history. */
export const REACTION_KINDS = ['laugh', 'clap', 'wow'] as const;
export type ReactionKind = (typeof REACTION_KINDS)[number];
export type ReactionCounts = Record<ReactionKind, number>;
export const REACTION_EMOJI: Record<ReactionKind, string> = { laugh: '😂', clap: '👏', wow: '🤯' };
export const REACTION_LABEL: Record<ReactionKind, string> = { laugh: '笑った', clap: '拍手', wow: 'びっくり' };
/** Phones flush taps at most this often; the server rejects faster batches from one player. */
export const REACTION_FLUSH_MS = 3000;
export const REACTION_MIN_INTERVAL_MS = 2500;
/** About five taps a second for one flush window, per kind. */
export const MAX_REACTION_BATCH = 15;
const REACTION_PHASES: Phase[] = ['voting', 'reveal'];

/** Stored on the room. `last` is a private per-player throttle and is never projected. */
export interface ReactionState {
  turn: string;
  counts: ReactionCounts;
  last: Record<string, number>;
}

export const emptyReactionCounts = (): ReactionCounts => ({ laugh: 0, clap: 0, wow: 0 });

export function reactionsOpen(phase: Phase) {
  return REACTION_PHASES.includes(phase);
}

export function reactionInput(value: unknown): ReactionCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new GameError('リアクションを選んでください。');
  const counts = emptyReactionCounts();
  for (const [kind, n] of Object.entries(value)) {
    if (!(REACTION_KINDS as readonly string[]).includes(kind) || !Number.isInteger(n) || n < 0 || n > MAX_REACTION_BATCH)
      throw new GameError('リアクションを確認してください。');
    counts[kind as ReactionKind] = n;
  }
  if (!REACTION_KINDS.some((kind) => counts[kind] > 0)) throw new GameError('リアクションを選んでください。');
  return counts;
}

/** Validates one batch against the stored room and returns how to apply it. A batch in the
 * room's current turn becomes counter increments; the first batch of a new turn resets. */
export function planReaction(
  state: ReactionState | undefined,
  input: { phase: Phase; turn: string; clientTurn: unknown; playerId: string; counts: unknown },
  now: number,
): { reset: boolean; counts: ReactionCounts } {
  if (!reactionsOpen(input.phase) || input.clientTurn !== input.turn)
    throw new GameError('今はリアクションできません。', 409);
  const counts = reactionInput(input.counts);
  const sameTurn = state?.turn === input.turn;
  if (sameTurn && now - (state.last[input.playerId] ?? 0) < REACTION_MIN_INTERVAL_MS)
    throw new GameError('リアクションが速すぎます。', 429);
  return { reset: !sameTurn, counts };
}

/** Applies a plan to an in-memory state, mirroring the Firestore increments. */
export function applyReaction(
  state: ReactionState | undefined,
  turn: string,
  playerId: string,
  plan: { reset: boolean; counts: ReactionCounts },
  now: number,
): ReactionState {
  const base = plan.reset || !state ? { turn, counts: emptyReactionCounts(), last: {} } : state;
  return {
    turn,
    counts: Object.fromEntries(REACTION_KINDS.map((kind) => [kind, base.counts[kind] + plan.counts[kind]])) as ReactionCounts,
    last: { ...base.last, [playerId]: now },
  };
}

/** Only the current turn's anonymous totals reach any screen. */
export function projectReactions(state: ReactionState | undefined, phase: Phase, turn: string): ReactionCounts | null {
  if (!reactionsOpen(phase)) return null;
  if (state?.turn !== turn) return emptyReactionCounts();
  return { ...emptyReactionCounts(), ...state.counts };
}

/** How many new floats to show per kind between two polls of the same turn. */
export function reactionBursts(previous: ReactionCounts | null, next: ReactionCounts, cap = 8): ReactionCounts {
  return Object.fromEntries(
    REACTION_KINDS.map((kind) => [kind, Math.min(cap, Math.max(0, next[kind] - (previous?.[kind] ?? 0)))]),
  ) as ReactionCounts;
}
