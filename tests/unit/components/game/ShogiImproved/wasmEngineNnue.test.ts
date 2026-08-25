/**
 * Unit tests for the NNUE weight-loading API of wasmEngine.ts.
 *
 * Uses the REAL active weight file (public/shogi-halfkp81-production-weights.bin) and the
 * real WASM engine, so these tests also pin the deployed asset to the exact
 * size the engine requires. Test order matters: the module-scope loaded/
 * enabled state starts pristine in this file, so the "not loaded yet" paths
 * run first.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GenerateMovesImproved } from '@/components/game/ShogiImproved/GenerateMovesImproved';
import { InitialPositionImproved } from '@/components/game/ShogiImproved/InitialPositionImproved';
import {
  EMPTY,
  FU,
  GI,
  HI,
  KA,
  KE,
  KI,
  KY,
  SENTE,
  Te,
  getKomashu,
  isSente,
} from '@/components/game/ShogiImproved/types';
import {
  buildPositionHistoryHashes,
  type ReplayableMove,
} from '@/components/game/ShogiImproved/positionHistory';
import {
  clearWasmTT,
  isNnueEnabled,
  isNnueWeightsLoaded,
  loadNnueWeights,
  NNUE_WEIGHTS_BYTES,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from '@/components/game/ShogiImproved/wasmEngine';

const weightsPath = join(process.cwd(), 'public', 'shogi-halfkp81-production-weights.bin');
const HALFKP81_PRODUCTION_SHA256 = 'f47717860a1d0959567ad57365d473cd0a51d73ec3f791a7f25b6a8692966aa5';
const DROP_LETTER: Readonly<Record<string, number>> = {
  P: FU,
  L: KY,
  N: KE,
  S: GI,
  G: KI,
  B: KA,
  R: HI,
};

// The reported rook-pawn loop, replayed up to the move BEFORE the AI's first
// P*8f drop (Gote to move). The previous version of this test started 12 plies
// later, with three shuttle cycles already scripted in, and then let the
// engine play only four more moves - far too late to observe a bug that takes
// ~22 plies to build up.
const ROOK_PAWN_LOOP_PREFIX = [
  '2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b', '2e2d', '2c2d', '2h2d', 'P*2c',
  '2d2h', '8e8f', '8g8f', '8b8f', 'P*8g', '8f8d', '3i3h', '3c3d', '5i6h',
] as const;

// Sente's side of the loop is SCRIPTED, not searched. The real opponent was a
// cooperating human who always recaptured on 8f and always re-dropped P*8g;
// self-play (what this test used to do) never produces that pattern, so the
// loop could not form and the test could not fail. Anything outside the
// shuttle is a fixed quiet developing move, so Sente stays a constant.
const SENTE_DEVELOPING_MOVES = [
  '7g7f', '4g4f', '5g5f', '6g6f', '3g3f', '1g1f', '9g9f',
  '4i5h', '7h6g', '3h4g', '6h7i', '2f2e',
] as const;

const P8F = (8 << 4) + 6;
const P8G = (8 << 4) + 7;

function readWeights(): Uint8Array {
  const buf = readFileSync(weightsPath);
  // Copy out of the (possibly pooled) Buffer into a plain Uint8Array.
  const bytes = new Uint8Array(buf.byteLength);
  bytes.set(buf);
  return bytes;
}

function usiSquare(file: string, rank: string): number {
  return ((file.charCodeAt(0) - 48) << 4) + (rank.charCodeAt(0) - 96);
}

function findUsiMoveOrUndefined(usi: string, legal: Te[]): Te | undefined {
  try {
    return findUsiMove(usi, legal);
  } catch {
    return undefined;
  }
}

function findUsiMove(usi: string, legal: Te[]): Te {
  if (usi[1] === '*') {
    const to = usiSquare(usi[2], usi[3]);
    const piece = DROP_LETTER[usi[0]] ?? -1;
    const match = legal.find((move) => move.from === 0 && move.to === to && getKomashu(move.koma) === piece);
    if (!match) throw new Error(`illegal test drop: ${usi}`);
    return match;
  }

  const from = usiSquare(usi[0], usi[1]);
  const to = usiSquare(usi[2], usi[3]);
  const promote = usi.endsWith('+');
  const match = legal.find((move) => move.from === from && move.to === to && move.promote === promote);
  if (!match) throw new Error(`illegal test move: ${usi}`);
  return match;
}

type Position = ReturnType<typeof InitialPositionImproved.createInitialPosition>;

/** Full position identity (sennichite): board cells + both hands + side to move. */
function positionKey(position: Position): string {
  const cells: number[] = [];
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      cells.push(position.get((file << 4) + rank));
    }
  }
  return `${cells.join(',')}|h:${position.hand.join(',')}|t:${position.teban}`;
}

/**
 * Identity of the AI's OWN position: its pieces on the board, its hand, and
 * whose turn it is. The shuttle bug returns the AI to an identical setup while
 * the opponent keeps developing, so the full key above never repeats and could
 * never detect it. This one does.
 */
function aiSidePositionKey(position: Position): string {
  const cells: number[] = [];
  for (let file = 1; file <= 9; file++) {
    for (let rank = 1; rank <= 9; rank++) {
      const koma = position.get((file << 4) + rank);
      cells.push(koma !== EMPTY && !isSente(koma) ? koma : EMPTY);
    }
  }
  return `${cells.join(',')}|g:${position.hand.slice(0x10).join(',')}|t:${position.teban}`;
}

/** Sente's scripted reply: keep the shuttle available, otherwise just develop. */
function scriptedSenteReply(
  position: Position,
  lastAiMove: Te,
  developingIndex: { value: number }
): Te {
  const legal = GenerateMovesImproved.generateLegalMoves(position);
  let reply: Te | undefined;
  if (lastAiMove.from === 0 && lastAiMove.to === P8F) {
    // The AI dropped a pawn on 8f — take it, exactly as the human did.
    reply = legal.find((m) => m.from === P8G && m.to === P8F);
  } else if (lastAiMove.to === P8F) {
    // The AI recaptured on 8f — re-drop P*8g and offer the cycle again.
    reply = legal.find((m) => m.from === 0 && m.to === P8G && getKomashu(m.koma) === FU);
  }
  while (!reply && developingIndex.value < SENTE_DEVELOPING_MOVES.length) {
    const usi = SENTE_DEVELOPING_MOVES[developingIndex.value];
    developingIndex.value += 1;
    reply = findUsiMoveOrUndefined(usi, legal);
  }
  return reply ?? legal[0];
}

describe('wasmEngine NNUE loading', () => {
  it.each([
    ['P', FU],
    ['L', KY],
    ['N', KE],
    ['S', GI],
    ['G', KI],
    ['B', KA],
    ['R', HI],
  ] as const)('parses a %s drop in USI test positions', (letter, piece) => {
    const move = new Te(SENTE + piece, 0, usiSquare('5', 'e'));

    expect(findUsiMove(`${letter}*5e`, [move])).toBe(move);
  });

  it('ships a weight asset of exactly the size the engine expects', () => {
    expect(readFileSync(weightsPath).byteLength).toBe(NNUE_WEIGHTS_BYTES);
  });

  it('pins the production asset to the shipped HalfKP81 weights', () => {
    const digest = createHash('sha256').update(readFileSync(weightsPath)).digest('hex');
    expect(digest).toBe(HALFKP81_PRODUCTION_SHA256);
  });

  it('cannot be enabled before weights are loaded (stays on V3)', () => {
    expect(isNnueWeightsLoaded()).toBe(false);
    expect(setWasmNnueEnabled(true)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
  });

  it('rejects weights with a wrong byte size', () => {
    expect(loadNnueWeights(new Uint8Array(1), 1)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(23_665_376), 1)).toBe(false);
    expect(loadNnueWeights(new Uint8Array(0), 600)).toBe(false);
    expect(isNnueWeightsLoaded()).toBe(false);
  });

  it('rejects an invalid sigmoid scale K', () => {
    const bytes = readWeights();
    expect(loadNnueWeights(bytes, 0)).toBe(false);
    expect(loadNnueWeights(bytes, -5)).toBe(false);
    expect(loadNnueWeights(bytes, Number.NaN)).toBe(false);
    expect(isNnueWeightsLoaded()).toBe(false);
  });

  it('loads the shipped HalfKP81 production weights', () => {
    expect(loadNnueWeights(readWeights(), 600)).toBe(true);
    expect(isNnueWeightsLoaded()).toBe(true);
    // Loading alone must not flip the evaluation.
    expect(isNnueEnabled()).toBe(false);
  });

  it('enables NNUE after loading and searches a legal move with it', () => {
    expect(setWasmNnueEnabled(true)).toBe(true);
    expect(isNnueEnabled()).toBe(true);

    const k = InitialPositionImproved.createInitialPosition();
    const te = wasmSearchBestMove(k, 0, 200, 32, 8);
    expect(te).not.toBeNull();
    const legal = GenerateMovesImproved.generateLegalMoves(k);
    expect(
      legal.some((m) => m.koma === te!.koma && m.from === te!.from && m.to === te!.to && m.promote === te!.promote)
    ).toBe(true);
  });

  it(
    'does not restart the rook-pawn shuttle against a cooperating opponent',
    () => {
      expect(loadNnueWeights(readWeights(), 600)).toBe(true);
      expect(setWasmNnueEnabled(true)).toBe(true);

      // Two trials, because a time-budgeted search is not deterministic and
      // the bug showed up as a RATE, not as a certainty (measured 2/5 on the
      // pre-fix runtime, 0/24 after). Asserting per trial keeps a single
      // relapse visible instead of averaging it away.
      const TRIALS = 2;
      const AI_MOVES = 20;
      // Production budget shape: a wall clock, not a fixed depth. The previous
      // version searched to a FIXED depth 11 with no time limit, which both
      // missed the production search profile and once made this file take
      // ~350s on CI. Twenty 300ms searches per trial is bounded by
      // construction, whatever the evaluator does.
      const MOVE_MS = 300;

      for (let trial = 0; trial < TRIALS; trial++) {
        // Warm, not cleared, exactly like production: the TT is cleared once
        // per game and then carries over between moves (the old test cleared
        // it immediately before the continuation, which is the opposite).
        clearWasmTT();

        const position = InitialPositionImproved.createInitialPosition();
        const startPosition = InitialPositionImproved.createInitialPosition();
        const played: ReplayableMove[] = [];
        const applyMove = (move: Te): void => {
          played.push({ koma: move.koma, from: move.from, to: move.to, promote: move.promote });
          move.capture = position.get(move.to);
          position.move(move);
          position.toggleTeban();
        };

        for (const usi of ROOK_PAWN_LOOP_PREFIX) {
          applyMove(findUsiMove(usi, GenerateMovesImproved.generateLegalMoves(position)));
        }

        const fullCounts = new Map<string, number>();
        const aiSideCounts = new Map<string, number>();
        const developingIndex = { value: 0 };
        let pawnDrops8f = 0;

        for (let move = 0; move < AI_MOVES; move++) {
          const full = positionKey(position);
          fullCounts.set(full, (fullCounts.get(full) ?? 0) + 1);
          expect(fullCounts.get(full)).toBeLessThan(4); // sennichite
          const aiSide = aiSidePositionKey(position);
          aiSideCounts.set(aiSide, (aiSideCounts.get(aiSide) ?? 0) + 1);

          // The engine gets the real game history, the way the worker sends it.
          const history = buildPositionHistoryHashes(startPosition, played, position);
          expect(history).toHaveLength(played.length * 2);

          const aiMove = wasmSearchBestMove(position, played.length, MOVE_MS, 32, 8, null, history);
          expect(aiMove).not.toBeNull();
          if (aiMove!.from === 0 && aiMove!.to === P8F) pawnDrops8f++;
          applyMove(aiMove!);

          if (GenerateMovesImproved.generateLegalMoves(position).length === 0) break;
          applyMove(scriptedSenteReply(position, aiMove!, developingIndex));
        }

        // Spending the pawn once is a judgement call the evaluator is allowed
        // to make. Doing it twice is the shuttle restarting.
        expect(pawnDrops8f).toBeLessThanOrEqual(1);
        // And the AI's own setup must not keep coming back either, which is
        // what the shuttle looks like once the opponent varies.
        expect(Math.max(...aiSideCounts.values())).toBeLessThanOrEqual(2);
      }
    },
    // Bounded by construction: TRIALS * AI_MOVES * MOVE_MS is 12s of search.
    120_000,
  );

  it('can be switched back to V3', () => {
    expect(setWasmNnueEnabled(false)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
    // Weights stay loaded; re-enabling works without another load.
    expect(setWasmNnueEnabled(true)).toBe(true);
    setWasmNnueEnabled(false);
  });
});
