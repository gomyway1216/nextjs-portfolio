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

// The reported game, exactly as it was played: Sente a human 2-dan, Gote the
// shipped AI. Moves 24, 30, 36 and 44 (1-indexed) are the four points at which
// the AI dropped P*8f and restarted the rook-pawn shuttle, and they are the
// positions this test puts back in front of the engine.
//
// An earlier version of this test tried to synthesise the scenario instead: it
// scripted a "cooperating" Sente that always took on 8f and re-dropped P*8g.
// That does not reproduce anything - a scripted opponent hangs material, the
// engine simply wins it and mates in about fourteen moves, and the test passed
// on the buggy engine as happily as on the fixed one. The real board is the
// only board on which this bug is known to appear.
const REPORTED_GAME = [
  '2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b', '2e2d', '2c2d', '2h2d', 'P*2c',
  '2d2h', '8e8f', '8g8f', '8b8f', 'P*8g', '8f8d', '3i3h', '3c3d', '5i6h', '7a7b',
  '3h2g', '2b4d', '2g3f', 'P*8f', '8g8f', '8d8f', 'P*8g', '8f8e', '4g4f', 'P*8f',
  '8g8f', '8e8f', 'P*8g', '8f8e', '4i5h', 'P*8f', '8g8f', '8e8f', 'P*8g', '8f8d',
  '3f4e', '4d3e', '2h4h', 'P*8f', '8g8f',
] as const;

/** 1-indexed move numbers at which the shipped AI dropped P*8f. */
const SHUTTLE_MOVES = [24, 30, 36, 44] as const;

const P8F = (8 << 4) + 6;

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
    'does not re-drop the rook pawn at the four positions where the shipped engine did',
    () => {
      expect(loadNnueWeights(readWeights(), 600)).toBe(true);
      expect(setWasmNnueEnabled(true)).toBe(true);

      // Production shape, not a laboratory one:
      // - the table is cleared ONCE, when the game starts, and stays warm
      //   between moves (the version of this test before the fix cleared it
      //   immediately before the measured search, which is the opposite of
      //   what the browser does),
      // - the engine ponders on the opponent's time in the slices the worker
      //   uses, which is what leaves a deep entry sitting on the very root it
      //   is about to be asked about,
      // - the search runs on a wall clock, not to a fixed depth. The version
      //   before the fix used fixed depth 11 with no time limit and once took
      //   ~350s on a shared CI runner.
      //
      // Power and threshold, measured rather than assumed. Replaying this game
      // and asking at these four positions produced P*8f at:
      //
      //   hard   (2000ms, q10)   pre-fix 6/96    post-fix 1/96
      //   master (5000ms, q12)   pre-fix 2/32    post-fix 1/32
      //
      // (the hard figures are two independent 48-measurement passes per side;
      // the pre-fix engine produced 3/48 in both, so the rate is stable)
      //
      // Every single one of them, before and after, was the move-30 position;
      // the other three never relapse. So the fix REDUCES the shuttle, it does
      // not abolish it, and demanding zero here would flake on CI roughly one
      // run in twelve. The assertion is therefore "not twice": spending the
      // pawn once at one of four positions is a judgement call the evaluator
      // is allowed to make, doing it repeatedly is the shuttle.
      //
      // That makes this a smoke test on the real board, not the primary lock.
      // The locks that fail outright on the pre-fix engine are
      // rootTtCutoff.test.ts (the root is searched instead of answered from
      // the table) and positionHistory.test.ts (primed occurrences count
      // towards repetition, in both the WASM and the JS engine). The deterministic locks are
      // rootTtCutoff.test.ts (the root is searched instead of answered from
      // the table) and positionHistory.test.ts (primed occurrences count
      // towards repetition). If this one ever fails, believe it.
      const MOVE_MS = 1000;
      const PONDER_SLICE_MS = 200;
      const PONDER_SLICES = 10;

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

      const counts = new Map<string, number>();
      let pawnDrops8f = 0;

      for (let index = 0; index < REPORTED_GAME.length; index++) {
        const moveNumber = index + 1;

        if ((SHUTTLE_MOVES as readonly number[]).includes(moveNumber)) {
          // Everything already on the board, exactly as the worker sends it.
          const history = buildPositionHistoryHashes(startPosition, played, position);
          expect(history).toHaveLength(played.length * 2);

          const aiMove = wasmSearchBestMove(
            position.clone(),
            played.length,
            MOVE_MS,
            32,
            10,
            null,
            history
          );
          expect(aiMove).not.toBeNull();
          if (aiMove!.from === 0 && aiMove!.to === P8F) pawnDrops8f++;
        }

        applyMove(findUsiMove(REPORTED_GAME[index], GenerateMovesImproved.generateLegalMoves(position)));

        const key = positionKey(position);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        // The real game never actually reached sennichite; if the replay says
        // otherwise the move list has drifted and every measurement below is
        // about some other game.
        expect(count).toBeLessThan(4);

        // Ponder the position now in front of the engine, in the worker's
        // slice size. Only pondering shortly before a measured position can
        // prime that position's root entry, so the rest is skipped.
        const nextShuttle = (SHUTTLE_MOVES as readonly number[]).find((m) => m > moveNumber);
        if (nextShuttle !== undefined && nextShuttle - moveNumber <= 2) {
          const pondered = position.clone();
          for (let slice = 0; slice < PONDER_SLICES; slice++) {
            if (wasmSearchBestMove(pondered, played.length, PONDER_SLICE_MS, 32, 10, null, []) === null) {
              break;
            }
          }
        }
      }

      // The engine is never forced into this move at any of the four, so more
      // than one is the shuttle restarting rather than a one-off judgement.
      expect(pawnDrops8f).toBeLessThanOrEqual(1);
    },
    // Bounded by construction: 4 searches of MOVE_MS plus 8 pondered positions
    // of PONDER_SLICES * PONDER_SLICE_MS is ~20s of search.
    180_000,
  );

  it('can be switched back to V3', () => {
    expect(setWasmNnueEnabled(false)).toBe(false);
    expect(isNnueEnabled()).toBe(false);
    // Weights stay loaded; re-enabling works without another load.
    expect(setWasmNnueEnabled(true)).toBe(true);
    setWasmNnueEnabled(false);
  });
});
