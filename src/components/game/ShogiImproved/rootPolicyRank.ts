import { GenerateMovesImproved } from './GenerateMovesImproved';
import { KyokumenImproved } from './KyokumenImproved';
import { MoveListImproved } from './MoveListImproved';
import { Te } from './types';

/**
 * Root-ordering metadata deliberately carries integer ranks, never student CP.
 * The search can therefore use the student only to reorder root moves; no
 * student value is available to leak into evaluation, alpha/beta, pruning or
 * the transposition table.
 */
export interface RootPolicyMoveRank {
  readonly moveKey: number;
  /** Zero is best. Ranks must be the exact permutation [0, moveCount). */
  readonly rank: number;
}

export interface RootPolicyRankProviderInput {
  readonly sequence: number;
  /** The authenticated production root. Providers must never retain or mutate it. */
  readonly position?: KyokumenImproved;
  /** Search ply is structurally fixed to zero at this only call site. */
  readonly searchPly?: 0;
  /** Number of moves already played; used only by the frozen feature contract. */
  readonly gamePly?: number;
  /**
   * Exact production search universe, in the engine's stable input order.
   * This is intentionally not a rules-complete move list: it preserves the
   * production generator's bishop/rook non-promotion omission.
   */
  readonly moves: readonly Te[];
  readonly moveKeys: readonly number[];
}

export type RootPolicyRankProvider = (
  input: RootPolicyRankProviderInput,
) => readonly RootPolicyMoveRank[] | null;

/**
 * An unavailable student returns no rank table. The caller then uses the
 * unchanged stable production ordering.
 */
const unavailableRankProvider: RootPolicyRankProvider = () => null;

let rankProvider: RootPolicyRankProvider = unavailableRankProvider;
const rootMoves = new MoveListImproved();

/** Bit-compatible with wasm-spike/assembly/index.ts::jsMoveKeyOf(). */
export function rootPolicyMoveKey(move: Te): number {
  return (
    (move.koma & 0x3f) |
    ((move.from & 0xff) << 6) |
    ((move.to & 0xff) << 14) |
    (move.promote ? 1 << 22 : 0)
  ) | 0;
}

function isPositiveI32(value: number): boolean {
  return Number.isInteger(value) && value > 0 && value <= 0x7fffffff;
}

/**
 * Invoke the configured rank provider exactly once for one enabled root.
 * Malformed output fails closed to null; callers then search with the stable
 * production ordering.
 */
export function computeRootPolicyRanks(
  position: KyokumenImproved,
  sequence: number,
  studentEnabled: boolean,
  gamePly = 0,
): readonly RootPolicyMoveRank[] | null {
  if (
    !studentEnabled ||
    !isPositiveI32(sequence) ||
    !Number.isInteger(gamePly) ||
    gamePly < 0 ||
    gamePly > 0x7fffffff
  ) {
    return null;
  }

  const moves = GenerateMovesImproved.generateLegalMovesPooled(position, rootMoves);
  const moveKeys = moves.map(rootPolicyMoveKey);
  if (moveKeys.length === 0 || moveKeys.length > 640) return null;

  const universe = new Set(moveKeys);
  if (universe.size !== moveKeys.length || universe.has(0)) return null;

  let output: readonly RootPolicyMoveRank[] | null;
  try {
    output = rankProvider({
      sequence,
      position,
      searchPly: 0,
      gamePly,
      moves,
      moveKeys,
    });
  } catch {
    return null;
  }
  if (!output || output.length !== moveKeys.length) return null;

  const seenKeys = new Set<number>();
  const seenRanks = new Set<number>();
  const captured: RootPolicyMoveRank[] = [];
  for (const item of output) {
    if (!item || typeof item !== 'object') return null;
    const moveKey = item.moveKey;
    const rank = item.rank;
    if (
      !Number.isInteger(moveKey) ||
      !universe.has(moveKey) ||
      seenKeys.has(moveKey) ||
      !Number.isInteger(rank) ||
      rank < 0 ||
      rank >= moveKeys.length ||
      seenRanks.has(rank)
    ) {
      return null;
    }
    seenKeys.add(moveKey);
    seenRanks.add(rank);
    captured.push(Object.freeze({ moveKey: moveKey | 0, rank: rank | 0 }));
  }
  return Object.freeze(captured);
}

/**
 * Runtime injection seam for the frozen student and deterministic tests.
 * Passing null restores the unavailable fail-closed provider.
 */
export function setRootPolicyRankProvider(provider: RootPolicyRankProvider | null): void {
  rankProvider = provider ?? unavailableRankProvider;
}
