/**
 * match-runtime-ab-ttclear.ts — DIAGNOSTIC copy of match-runtime-ab.ts that
 * clears the transposition table before EVERY move on BOTH sides.
 *
 * Why: the soft time limit was designed on the premise that an iterative
 * deepening iteration cut off by the hard limit is discarded, so the time it
 * consumed bought nothing. That is true for the current move and FALSE for the
 * game — the TT is retained within a game, so the deep entries the aborted
 * iteration wrote are read by the next search. If that carry-over is what the
 * soft limit was destroying, then removing it from BOTH sides should make the
 * candidate's deficit shrink or vanish. This run is a mechanism probe, not a
 * gate; the verdict comes from the normal harness.
 *
 * (original header follows)
 *
 * match-runtime-ab.ts — engine-vs-engine A/B where the two sides may be
 * DIFFERENT WASM runtimes.
 *
 * Split off from match-nnue-vs-v3.ts, which is a pinned instrument: its bytes
 * and SHA-256 are recorded as evidence by the teacher/screen protocols in ml/
 * (ml/direct_teacher_halfkp81_v4_fresh_screen.py pins it outright), so editing
 * it would silently redefine the harness those results claim to have come from.
 * This copy is free to grow the two things a runtime A/B needs:
 *
 *   --wasm-path-b PATH   load side B from a second runtime, turning an eval
 *                        A/B into a candidate-WASM vs production-WASM search
 *                        A/B
 *   game history         both sides are primed with the positions already
 *                        played, the way the browser worker primes the engine,
 *                        so a runtime that understands game history is measured
 *                        the way it will actually be used. A runtime without
 *                        the exports is untouched.
 *
 * Everything else is the original harness: two independent WASM instances,
 * curated 6-ply openings from a deterministic PRNG (--seed offsets the base),
 * colours alternate every game with the same opening reused for the swapped
 * pair, every move from BOTH engines validated against the JS legal move list,
 * and draws by fourfold repetition or 256 plies.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/match-runtime-ab.ts <weights.bin> \
 *     [--vs otherWeights.bin] [--games 16] [--ms 200] [--seed 1] [--k 600] \
 *     [--scale-numer 1] [--scale-denom 1] [--max-plies 256] \
 *     [--wasm-path candidate.wasm] [--wasm-path-b production.wasm] \
 *     [--lazy-picker-a-min-moves 64] [--lazy-picker-b-min-moves 64] \
 *     [--json verdict.json]
 *
 * --json writes the machine-readable verdict: score, Wilson 95% interval,
 * per-game outcomes, and the per-move THINK TIME of both sides. A change to
 * time management is judged on strength AND on the wait it produces, so the
 * wait is measured here rather than assumed from the budget.
 *
 * --vs <weights.bin> replaces the V3 side with a SECOND NNUE instance loaded
 * from that file. Passing the SAME weights to both sides is how a pure search
 * A/B is run: the evaluation is then identical and only the runtime differs.
 *
 * --scale-numer/--scale-denom rescale the NNUE cp output before it enters the
 * search (setNnueOutputScale). Use 37/10 to map true centipawns onto the
 * evaluateV3Full scale (~3.7x cp) that the search margins were tuned for.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import { GOTE, SENTE, Te } from "../src/components/game/ShogiImproved/types";
import { bucketsForByteLength } from "./nnue-ref";
import {
  buildNnueFixedTimeOpening,
  NNUE_FIXED_TIME_OPENING_PLIES,
} from "./nnue-fixed-time-opening";
import {
  loadShogiWasm,
  syncWasm,
  teFromWasmKey,
  type ShogiSearchWasm,
} from "./search-driver";

interface ShogiNnueSearchWasm extends ShogiSearchWasm {
  memory: WebAssembly.Memory;
  getNnueWeightsPtr(): number;
  getNnueWeightsSize(): number;
  setNnueBuckets(buckets: number): void;
  getNnueBuckets(): number;
  setNnueScaleK(k: number): void;
  setNnueOutputScale(numer: number, denom: number): void;
  setNnueEnabled(flag: number): void;
  setResearchLazyMovePicker?: (flag: number, minMoves: number) => void;
  // Game-history repetition priming. Absent on runtimes built before the
  // repetition fix; every call site is guarded so those stay byte-identical.
  clearGameHistory?: () => void;
  pushGameHistoryHash?: (hashA: number, hashB: number) => void;
  getGameHistorySize?: () => number;
}

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  if (i < 0) return def;
  const n = parseInt(process.argv[i + 1], 10);
  if (!Number.isFinite(n)) throw new Error(`${flag} requires a numeric value`);
  return n;
}

function argStr(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  const v = process.argv[i + 1];
  if (!v || v.startsWith("--")) throw new Error(`${flag} requires a value`);
  return v;
}

function argLazyPickerMinMoves(flag: string): number {
  const raw = argStr(flag);
  if (raw === null) return 0;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new Error(`${flag} must be 0 (off) or an integer from 2 through 640`);
  }
  const value = Number(raw);
  if (value !== 0 && (value < 2 || value > 640)) {
    throw new Error(`${flag} must be 0 (off) or an integer from 2 through 640`);
  }
  return value;
}

const weightsPath = process.argv[2];
if (!weightsPath || weightsPath.startsWith("--")) {
  console.error(
    "usage: node -r tsx/cjs wasm-spike/match-runtime-ab.ts <weights.bin> [--vs otherWeights.bin] [--games 16] [--ms 200] [--seed 1] [--k 600] [--scale-numer 1] [--scale-denom 1] [--max-plies 256] [--wasm-path candidate.wasm] [--wasm-path-b production.wasm] [--lazy-picker-a-min-moves 64] [--lazy-picker-b-min-moves 64] [--json verdict.json]",
  );
  process.exit(2);
}
const weightsPathB = argStr("--vs");
const GAMES = argNum("--games", 16);
const MOVE_MS = argNum("--ms", 200);
const SEED_BASE = argNum("--seed", 1);
const SCALE_K = argNum("--k", 600);
const SCALE_NUMER = argNum("--scale-numer", 1);
const SCALE_DENOM = argNum("--scale-denom", 1);
const WASM_PATH = argStr("--wasm-path") ?? undefined;
// Optional second runtime for side B. With it the harness becomes a search
// A/B (candidate WASM vs production WASM) instead of only an eval A/B.
const WASM_PATH_B = argStr("--wasm-path-b") ?? undefined;
const LAZY_PICKER_A_MIN_MOVES = argLazyPickerMinMoves(
  "--lazy-picker-a-min-moves",
);
const LAZY_PICKER_B_MIN_MOVES = argLazyPickerMinMoves(
  "--lazy-picker-b-min-moves",
);
const BUCKETS_A = argNum("--buckets-a", 0);
const BUCKETS_B = argNum("--buckets-b", 0);
const EXPECTED_SHA_A = argStr("--sha-a");
const EXPECTED_SHA_B = argStr("--sha-b");
const EXPECTED_WASM_SHA = argStr("--wasm-sha");
const MAX_PLIES = argNum("--max-plies", 256);
// Optional machine-readable verdict (score + Wilson CI + per-move think time).
const JSON_OUT = argStr("--json");
// Mirror the WASM setter's bounds so a rejected (silently ignored) scale can
// never masquerade as a 1/1 run.
if (
  SCALE_NUMER < 1 ||
  SCALE_DENOM < 1 ||
  SCALE_NUMER > 1_000_000 ||
  SCALE_DENOM > 1_000_000
) {
  throw new Error(
    "--scale-numer/--scale-denom must be between 1 and 1,000,000",
  );
}
if (!Number.isSafeInteger(MAX_PLIES) || MAX_PLIES < 1 || MAX_PLIES > 512) {
  throw new Error("--max-plies must be an integer from 1 through 512");
}
const MAX_DEPTH = 32;
const QUIESCENCE_DEPTH_MAX = 10;

// ---------------------------------------------------------------------------
// Plain WASM player (no book, no mate solver — pure search + eval)
// ---------------------------------------------------------------------------

class WasmPlayer {
  constructor(
    readonly name: string,
    private wasm: ShogiNnueSearchWasm,
  ) {}

  /** True when this runtime knows about already-played positions. */
  get supportsGameHistory(): boolean {
    return (
      typeof this.wasm.clearGameHistory === "function" &&
      typeof this.wasm.pushGameHistoryHash === "function"
    );
  }

  newGame(): void {
    this.wasm.clearTT();
    this.wasm.clearGameHistory?.();
  }

  /**
   * Prime the engine with every position played before the current root, the
   * way the browser worker does. `history` is a flat [primary, secondary, …]
   * list in game order and must stop before the root position (the search
   * contributes the root's own occurrence itself).
   */
  primeGameHistory(history: number[]): void {
    if (!this.supportsGameHistory) return;
    this.wasm.clearGameHistory!();
    for (let i = 0; i + 1 < history.length; i += 2) {
      this.wasm.pushGameHistoryHash!(history[i], history[i + 1]);
    }
  }

  /**
   * Wall-clock ms actually spent inside searchBestMove, one entry per move.
   *
   * A time-management change is only acceptable if it does not make the user
   * wait longer, so the harness measures the wait instead of assuming it: the
   * hard limit is a promise about the WORST case, and the average is what the
   * player actually experiences.
   */
  readonly moveMs: number[] = [];

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    // The whole point of this copy: no search may inherit anything the
    // previous search left behind.
    this.wasm.clearTT();
    syncWasm(this.wasm, k);
    this.wasm.setRootTesu(tesu);
    const t0 = performance.now();
    const key = this.wasm.searchBestMove(
      MOVE_MS,
      MAX_DEPTH,
      QUIESCENCE_DEPTH_MAX,
    );
    this.moveMs.push(performance.now() - t0);
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }
}

function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

function timingSummary(moveMs: readonly number[]): {
  moves: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
} {
  const total = moveMs.reduce((a, b) => a + b, 0);
  return {
    moves: moveMs.length,
    meanMs: moveMs.length ? total / moveMs.length : 0,
    p50Ms: quantile(moveMs, 0.5),
    p95Ms: quantile(moveMs, 0.95),
    maxMs: moveMs.length ? Math.max(...moveMs) : 0,
  };
}

/** Wilson score interval for a binomial proportion (the project's gate statistic). */
function wilson(successes: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const p = successes / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(centre - half) / d, (centre + half) / d];
}

// ---------------------------------------------------------------------------
// Game loop (same termination rules as match-wasm-vs-js.ts)
// ---------------------------------------------------------------------------

type PlayResult =
  | {
      outcome: "win";
      winner: number;
      plies: number;
      reason: "checkmate" | "noMove";
    }
  | {
      outcome: "draw";
      plies: number;
      reason: "repetition" | "maxPlies" | "stalemate";
    };

let movesChecked = 0;

function playOneGame(
  nnue: WasmPlayer,
  v3: WasmPlayer,
  nnueIsSente: boolean,
  openingMoves: Te[],
): PlayResult {
  const k = new KyokumenImproved();
  k.initHirate();
  k.setTeban(SENTE);

  // Every position played so far, flat [primary, secondary, …] in game order.
  // The opening plies count: they really were on the board.
  const playedHistory: number[] = [];

  for (const opening of openingMoves) {
    playedHistory.push(k.HashVal, k.SecondaryHashVal);
    const te = opening.clone();
    te.capture = k.get(te.to);
    k.move(te);
    k.toggleTeban();
  }

  const repetition = new Map<number, number>();

  for (let ply = openingMoves.length; ply < MAX_PLIES; ply++) {
    repetition.set(k.HashVal, (repetition.get(k.HashVal) ?? 0) + 1);
    if ((repetition.get(k.HashVal) ?? 0) >= 4) {
      return { outcome: "draw", plies: ply, reason: "repetition" };
    }

    const side = k.teban;
    const nnueToMove = nnueIsSente ? side === SENTE : side === GOTE;
    const player = nnueToMove ? nnue : v3;

    player.primeGameHistory(playedHistory);
    const move = player.getNextTe(k, ply);
    const legalMoves = GenerateMovesImproved.generateLegalMoves(k);

    if (!move) {
      if (legalMoves.length > 0) {
        return {
          outcome: "win",
          winner: side === SENTE ? GOTE : SENTE,
          plies: ply,
          reason: "noMove",
        };
      }
      const inCheck = GenerateMovesImproved.isKingInCheck(k, side);
      if (inCheck)
        return {
          outcome: "win",
          winner: side === SENTE ? GOTE : SENTE,
          plies: ply,
          reason: "checkmate",
        };
      return { outcome: "draw", plies: ply, reason: "stalemate" };
    }

    // Strict legality validation for EVERY move from BOTH engines.
    const isLegal = legalMoves.some(
      (te) =>
        te.koma === move.koma &&
        te.from === move.from &&
        te.to === move.to &&
        te.promote === move.promote,
    );
    if (!isLegal) {
      console.error(
        `ILLEGAL MOVE by ${player.name} at ply ${ply}: ${move.toString()} ` +
          `(koma=${move.koma} from=${move.from.toString(16)} to=${move.to.toString(16)} promote=${move.promote})`,
      );
      process.exit(1);
    }
    movesChecked++;

    playedHistory.push(k.HashVal, k.SecondaryHashVal);
    move.capture = k.get(move.to);
    k.move(move);
    k.toggleTeban();
  }

  return { outcome: "draw", plies: MAX_PLIES, reason: "maxPlies" };
}

// ---------------------------------------------------------------------------

/** Load a weights.bin (either format, auto-detected) into a WASM instance and enable NNUE. */
function setupNnueInstance(
  wasm: ShogiNnueSearchWasm,
  path: string,
  label: string,
  bucketOverride: number,
  expectedSha256: string | null,
): number {
  const weightsBin = readFileSync(path);
  if (
    expectedSha256 !== null &&
    createHash("sha256").update(weightsBin).digest("hex") !== expectedSha256
  ) {
    throw new Error(
      `${label}: weights SHA-256 differs from the preregistered asset`,
    );
  }
  const buckets =
    bucketOverride > 0
      ? bucketOverride
      : bucketsForByteLength(weightsBin.byteLength);
  if (!Number.isInteger(buckets) || buckets < 1 || buckets > 65_535) {
    throw new Error(
      `${label}: bucket selector must be an integer from 1 through 65535`,
    );
  }
  wasm.setNnueBuckets(buckets);
  if (weightsBin.byteLength !== wasm.getNnueWeightsSize()) {
    console.error(
      `${label}: weights.bin size mismatch: file=${weightsBin.byteLength} wasm=${wasm.getNnueWeightsSize()}`,
    );
    process.exit(1);
  }
  new Uint8Array(
    wasm.memory.buffer,
    wasm.getNnueWeightsPtr(),
    weightsBin.byteLength,
  ).set(weightsBin);
  wasm.setNnueScaleK(SCALE_K);
  wasm.setNnueOutputScale(SCALE_NUMER, SCALE_DENOM);
  wasm.setNnueEnabled(1);
  return buckets;
}

function configureResearchLazyMovePicker(
  wasm: ShogiNnueSearchWasm,
  label: "A" | "B",
  minMoves: number,
): void {
  if (minMoves === 0) return;
  if (WASM_PATH === undefined) {
    throw new Error(
      `lazy picker ${label} requires an explicit --wasm-path whose runtime exports setResearchLazyMovePicker`,
    );
  }
  if (typeof wasm.setResearchLazyMovePicker !== "function") {
    throw new Error(
      `lazy picker ${label}: explicit WASM does not export setResearchLazyMovePicker`,
    );
  }
  wasm.setResearchLazyMovePicker(1, minMoves);
}

function lazyPickerLogValue(minMoves: number): string {
  return minMoves === 0 ? "off" : String(minMoves);
}

function main(): void {
  if (
    WASM_PATH !== undefined &&
    EXPECTED_WASM_SHA !== null &&
    createHash("sha256").update(readFileSync(WASM_PATH)).digest("hex") !==
      EXPECTED_WASM_SHA
  ) {
    throw new Error(
      "research WASM SHA-256 differs from the preregistered asset",
    );
  }
  // Instance A: NNUE with real trained weights.
  const wasmA = loadShogiWasm(WASM_PATH) as ShogiNnueSearchWasm;
  const bucketsA = setupNnueInstance(
    wasmA,
    weightsPath,
    "A",
    BUCKETS_A,
    EXPECTED_SHA_A,
  );
  configureResearchLazyMovePicker(wasmA, "A", LAZY_PICKER_A_MIN_MOVES);

  // Instance B: second NNUE (--vs) or the stock hand-crafted evaluateV3Full,
  // optionally on a different runtime (--wasm-path-b) for a search A/B.
  const wasmB = loadShogiWasm(WASM_PATH_B ?? WASM_PATH) as ShogiNnueSearchWasm;
  let opponentName = "V3";
  if (weightsPathB) {
    const bucketsB = setupNnueInstance(
      wasmB,
      weightsPathB,
      "B",
      BUCKETS_B,
      EXPECTED_SHA_B,
    );
    opponentName = `NNUE-B(buckets=${bucketsB})`;
  }
  configureResearchLazyMovePicker(wasmB, "B", LAZY_PICKER_B_MIN_MOVES);

  const nnuePlayer = new WasmPlayer(
    weightsPathB ? `NNUE-A(buckets=${bucketsA})` : "NNUE",
    wasmA,
  );
  const v3Player = new WasmPlayer(opponentName, wasmB);

  let nnueWins = 0;
  let v3Wins = 0;
  let draws = 0;
  const gameRecords: {
    game: number;
    aIsSente: boolean;
    opening: string;
    outcome: "A" | "B" | "draw";
    reason: string;
    plies: number;
  }[] = [];

  console.log(
    `=== match: WASM+NNUE-A(${weightsPath}, buckets=${bucketsA}, K=${SCALE_K}, outScale=${SCALE_NUMER}/${SCALE_DENOM}) ` +
      `vs ${weightsPathB ? `WASM+NNUE-B(${weightsPathB})` : "WASM+V3"} — ${GAMES} games, ${MOVE_MS}ms/move, ` +
      `opening ${NNUE_FIXED_TIME_OPENING_PLIES} plies (seed base ${SEED_BASE}), no book / no mate solver, ` +
      `runtimeA=${WASM_PATH ?? "production"}, runtimeB=${WASM_PATH_B ?? WASM_PATH ?? "production"}, ` +
      `game-history=A:${nnuePlayer.supportsGameHistory ? "on" : "off"},B:${v3Player.supportsGameHistory ? "on" : "off"}, ` +
      `fixed-time-ms=${MOVE_MS}, ` +
      `max-plies=${MAX_PLIES}, ` +
      `lazy-picker=A:${lazyPickerLogValue(LAZY_PICKER_A_MIN_MOVES)},B:${lazyPickerLogValue(LAZY_PICKER_B_MIN_MOVES)}, ` +
      `tt=clear-before-each-game-retain-within-game ===`,
  );

  for (let game = 0; game < GAMES; game++) {
    const nnueIsSente = game % 2 === 0;
    const generatedOpening = buildNnueFixedTimeOpening(SEED_BASE, game >> 1);
    const openingMoves = [...generatedOpening.moves]; // reused for the swapped pair
    const opening = generatedOpening.fingerprint;
    nnuePlayer.newGame();
    v3Player.newGame();

    const start = performance.now();
    const result = playOneGame(nnuePlayer, v3Player, nnueIsSente, openingMoves);
    const elapsed = ((performance.now() - start) / 1000).toFixed(1);

    let summary: string;
    if (result.outcome === "win") {
      const nnueWon = nnueIsSente
        ? result.winner === SENTE
        : result.winner === GOTE;
      if (nnueWon) nnueWins++;
      else v3Wins++;
      summary = `WIN ${nnueWon ? nnuePlayer.name : v3Player.name} (${result.reason}, ${result.winner === SENTE ? "SENTE" : "GOTE"})`;
    } else {
      draws++;
      summary = `DRAW (${result.reason})`;
    }
    gameRecords.push({
      game,
      aIsSente: nnueIsSente,
      opening,
      outcome:
        result.outcome === "draw"
          ? "draw"
          : (nnueIsSente ? result.winner === SENTE : result.winner === GOTE)
            ? "A"
            : "B",
      reason: result.reason,
      plies: result.plies,
    });
    console.log(
      `game ${game + 1}/${GAMES}: NNUE=${nnueIsSente ? "SENTE" : "GOTE"} opening=${opening} => ${summary} plies=${result.plies} time=${elapsed}s`,
    );
  }

  const decisive = nnueWins + v3Wins;
  const score = nnueWins + draws / 2;
  console.log(
    `\nresult: ${nnuePlayer.name} ${nnueWins} wins / ${v3Player.name} ${v3Wins} wins / ${draws} draws (all ${movesChecked} moves legal)`,
  );
  const [lo, hi] = wilson(score, GAMES);
  console.log(
    `${nnuePlayer.name} score: ${score}/${GAMES} (${((score / GAMES) * 100).toFixed(1)}%)` +
      ` Wilson95 [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]` +
      (decisive > 0
        ? `, decisive-only: ${nnueWins}/${decisive} (${((nnueWins / decisive) * 100).toFixed(1)}%)`
        : ""),
  );

  const timingA = timingSummary(nnuePlayer.moveMs);
  const timingB = timingSummary(v3Player.moveMs);
  for (const [label, t] of [
    [nnuePlayer.name, timingA],
    [v3Player.name, timingB],
  ] as const) {
    console.log(
      `think-time ${label}: n=${t.moves} mean=${t.meanMs.toFixed(1)}ms ` +
        `p50=${t.p50Ms.toFixed(1)}ms p95=${t.p95Ms.toFixed(1)}ms max=${t.maxMs.toFixed(1)}ms (budget ${MOVE_MS}ms)`,
    );
  }

  if (JSON_OUT) {
    writeFileSync(
      JSON_OUT,
      `${JSON.stringify(
        {
          sideA: { name: nnuePlayer.name, wasm: WASM_PATH ?? "production", weights: weightsPath },
          sideB: {
            name: v3Player.name,
            wasm: WASM_PATH_B ?? WASM_PATH ?? "production",
            weights: weightsPathB ?? null,
          },
          games: GAMES,
          moveMs: MOVE_MS,
          seed: SEED_BASE,
          maxPlies: MAX_PLIES,
          aWins: nnueWins,
          bWins: v3Wins,
          draws,
          scoreA: score,
          wilson95: [lo, hi],
          perGame: gameRecords,
          timing: { A: timingA, B: timingB },
        },
        null,
        2,
      )}\n`,
    );
    console.log(`verdict written to ${JSON_OUT}`);
  }
}

main();
