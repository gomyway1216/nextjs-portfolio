/**
 * Ponder ("permanent brain") A/B benchmark.
 *
 * Question: when the worker keeps searching the human's-turn position during
 * the human's thinking time (warming the module-scope WASM TT), how much
 * deeper does the NEXT real search get at the same time budget?
 *
 * Method:
 * 1. Generate one fixed game (opening book + short WASM searches) so both
 *    runs replay the exact same position sequence.
 * 2. Run A (baseline): clear TT, replay; at every AI (gote) turn run a real
 *    search at the production `hard` budget and record depth/score/nodes.
 *    The recorded game move is then applied regardless of the search result,
 *    keeping the sequence identical.
 * 3. Run B (ponder): same, but after each AI move — while the "human is
 *    thinking" for a simulated HUMAN_THINK_MS — ponder the human's-turn
 *    position in PONDER_SLICE_MS slices, exactly like shogi-ai.worker.ts.
 * 4. Compare reached depth and score per measured position.
 *
 * Run: node -r tsx/cjs scripts/shogi-ponder-benchmark.ts
 */

import { getOpeningMoveImproved } from '../src/components/game/ShogiImproved/OpeningBookImproved';
import { InitialPositionImproved } from '../src/components/game/ShogiImproved/InitialPositionImproved';
import { GOTE, Te } from '../src/components/game/ShogiImproved/types';
import {
  clearWasmTT,
  getLastWasmSearchStats,
  isWasmEngineReady,
  wasmSearchBestMove,
  type WasmSearchStats,
} from '../src/components/game/ShogiImproved/wasmEngine';

const GAME_PLIES = 40; // fixed game length used for both runs
const GEN_BUDGET_MS = 400; // per-move budget while generating the fixed game
const SEARCH_BUDGET_MS = 2000; // production `hard` budget (measured searches)
const QUIESCENCE_MAX = 10; // production `hard` quiescence depth
const HUMAN_THINK_MS = 3000; // simulated human thinking time per move
const PONDER_SLICE_MS = 200; // same slice as shogi-ai.worker.ts
const AI_SIDE = GOTE; // AI plays gote (human = sente), like the site

interface Measurement extends WasmSearchStats {
  ply: number;
}

function generateFixedGame(): Te[] {
  const k = InitialPositionImproved.createInitialPosition();
  clearWasmTT();
  const moves: Te[] = [];
  for (let ply = 0; ply < GAME_PLIES; ply++) {
    const move =
      getOpeningMoveImproved(k, 'hard') ?? wasmSearchBestMove(k, ply, GEN_BUDGET_MS, 32, QUIESCENCE_MAX);
    if (!move) break; // mate/stalemate — keep whatever we have
    moves.push(move.clone());
    k.move(move);
    k.toggleTeban();
  }
  return moves;
}

function replayAndMeasure(moves: Te[], withPonder: boolean): Measurement[] {
  const k = InitialPositionImproved.createInitialPosition();
  clearWasmTT();
  const out: Measurement[] = [];

  for (let ply = 0; ply < moves.length; ply++) {
    if (k.teban === AI_SIDE) {
      // The AI's real move search (what the user actually waits for).
      const best = wasmSearchBestMove(k, ply, SEARCH_BUDGET_MS, 32, QUIESCENCE_MAX);
      const stats = getLastWasmSearchStats();
      if (best && stats) out.push({ ply, ...stats });
    } else if (withPonder && ply > 0) {
      // Human's turn following an AI move: the worker would now be pondering
      // this very position in short slices while the human thinks.
      const slices = Math.floor(HUMAN_THINK_MS / PONDER_SLICE_MS);
      for (let s = 0; s < slices; s++) {
        if (wasmSearchBestMove(k, ply, PONDER_SLICE_MS, 32, QUIESCENCE_MAX) === null) break;
      }
    }
    // Advance along the fixed game regardless of what the search returned.
    k.move(moves[ply]);
    k.toggleTeban();
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
}

function main(): void {
  if (!isWasmEngineReady()) {
    console.error('WASM engine unavailable; benchmark aborted.');
    process.exitCode = 1;
    return;
  }
  console.log(`Generating fixed ${GAME_PLIES}-ply game (${GEN_BUDGET_MS}ms/move)...`);
  const moves = generateFixedGame();
  console.log(`Game length: ${moves.length} plies\n`);

  console.log(`Run A: baseline (no ponder), ${SEARCH_BUDGET_MS}ms/search`);
  const a = replayAndMeasure(moves, false);
  console.log(`Run B: ponder ${HUMAN_THINK_MS}ms in ${PONDER_SLICE_MS}ms slices before each AI search`);
  const b = replayAndMeasure(moves, true);

  const paired = a
    .map((ma) => ({ a: ma, b: b.find((mb) => mb.ply === ma.ply) }))
    .filter((p): p is { a: Measurement; b: Measurement } => p.b !== undefined);

  console.log('\n ply | depth A | depth B |  Δd | score A | score B | nodes A    | nodes B');
  console.log('-----+---------+---------+-----+---------+---------+------------+-----------');
  for (const { a: ma, b: mb } of paired) {
    console.log(
      ` ${String(ma.ply).padStart(3)} |` +
        ` ${String(ma.depth).padStart(7)} | ${String(mb.depth).padStart(7)} |` +
        ` ${String(mb.depth - ma.depth).padStart(3)} |` +
        ` ${String(ma.score).padStart(7)} | ${String(mb.score).padStart(7)} |` +
        ` ${String(ma.nodes).padStart(10)} | ${String(mb.nodes).padStart(10)}`
    );
  }

  const dA = paired.map((p) => p.a.depth);
  const dB = paired.map((p) => p.b.depth);
  const deltas = paired.map((p) => p.b.depth - p.a.depth);
  const deeper = deltas.filter((d) => d > 0).length;
  const equal = deltas.filter((d) => d === 0).length;
  const shallower = deltas.filter((d) => d < 0).length;
  const scoreDiff = paired.map((p) => Math.abs(p.b.score - p.a.score));

  console.log(`\nMeasured AI searches: ${paired.length}`);
  console.log(`Mean depth: baseline ${mean(dA).toFixed(2)}  ponder ${mean(dB).toFixed(2)}  (Δ ${(mean(dB) - mean(dA)).toFixed(2)})`);
  console.log(`Depth outcome: deeper ${deeper} / equal ${equal} / shallower ${shallower}`);
  console.log(`Mean |score diff| at same position/budget: ${mean(scoreDiff).toFixed(1)} cp-units`);
  console.log(
    `Mean nodes: baseline ${Math.round(mean(paired.map((p) => p.a.nodes)))}  ponder ${Math.round(mean(paired.map((p) => p.b.nodes)))}`
  );
}

main();
