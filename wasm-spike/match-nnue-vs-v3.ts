/**
 * match-nnue-vs-v3.ts — evaluation A/B: WASM search with NNUE leaf eval
 * (real trained weights) vs the same WASM search with the hand-crafted
 * evaluateV3Full(). Pure engine-vs-engine — no opening book, no mate
 * solver on either side — so the ONLY difference is the leaf evaluation.
 *
 * Setup (mirrors match-wasm-vs-js.ts):
 * - Two independent WASM instances (A = NNUE enabled, B = V3 default).
 * - Curated 6-ply opening lines from a deterministic PRNG (--seed offsets
 *   the base so different batches use disjoint openings), colors alternate
 *   every game, the same opening is reused for each color-swapped pair.
 * - Every move from BOTH engines is validated against the JS legal move
 *   list; an illegal move aborts the run with a non-zero exit code.
 * - Draws: fourfold repetition (JS hash) or 256 plies, same as the other
 *   match harnesses.
 *
 * Usage:
 *   node -r tsx/cjs wasm-spike/match-nnue-vs-v3.ts <weights.bin> \
 *     [--vs otherWeights.bin] [--games 16] [--ms 200] [--seed 1] [--k 600] \
 *     [--scale-numer 1] [--scale-denom 1] [--wasm-path research.wasm] \
 *     [--lazy-picker-a-min-moves 64] [--lazy-picker-b-min-moves 64]
 *
 * --vs <weights.bin> replaces the V3 side with a SECOND NNUE instance loaded
 * from that file (direct NNUE-vs-NNUE A/B; side A = first positional arg,
 * side B = --vs). Original 1,185,988 B, reduced-KP 7,027,908 B, and the
 * HalfKP research formats, including 64,216,260 B BonaPiece format84, are
 * auto-detected independently.
 *
 * --scale-numer/--scale-denom rescale the NNUE cp output before it enters the
 * search (setNnueOutputScale). Use 37/10 to map true centipawns onto the
 * evaluateV3Full scale (~3.7x cp) that the search margins were tuned for.
 * (Applies to side A, and to side B when --vs is given.)
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { GenerateMovesImproved } from "../src/components/game/ShogiImproved/GenerateMovesImproved";
import { KyokumenImproved } from "../src/components/game/ShogiImproved/KyokumenImproved";
import {
  EMPTY,
  FU,
  GOTE,
  OU,
  SENTE,
  Te,
  getKomashu,
} from "../src/components/game/ShogiImproved/types";
import { bucketsForByteLength } from "./nnue-ref";
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
    "usage: node -r tsx/cjs wasm-spike/match-nnue-vs-v3.ts <weights.bin> [--vs otherWeights.bin] [--games 16] [--ms 200] [--seed 1] [--k 600] [--scale-numer 1] [--scale-denom 1] [--wasm-path research.wasm] [--lazy-picker-a-min-moves 64] [--lazy-picker-b-min-moves 64]",
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
const OPENING_PLIES = 6;
const MAX_PLIES = 256;
const MAX_DEPTH = 32;
const QUIESCENCE_DEPTH_MAX = 10;

// ---------------------------------------------------------------------------
// Deterministic RNG + curated opening lines (same policy as match-wasm-vs-js)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickCuratedOpeningMove(
  k: KyokumenImproved,
  moves: Te[],
  rnd: () => number,
): Te {
  const quiet = moves.filter(
    (m) => m.from !== 0 && m.capture === EMPTY && !m.promote,
  );
  const pawnStartDan = k.teban === SENTE ? 7 : 3;
  const pawnNextDan = k.teban === SENTE ? 6 : 4;

  const pawnPush = quiet.filter(
    (m) =>
      getKomashu(m.koma) === FU &&
      (m.from & 0x0f) === pawnStartDan &&
      (m.to & 0x0f) === pawnNextDan,
  );
  if (pawnPush.length > 0) return pawnPush[Math.floor(rnd() * pawnPush.length)];

  const develop = quiet.filter((m) => getKomashu(m.koma) !== OU);
  if (develop.length > 0) return develop[Math.floor(rnd() * develop.length)];
  if (quiet.length > 0) return quiet[Math.floor(rnd() * quiet.length)];
  return moves[Math.floor(rnd() * moves.length)];
}

function buildOpeningLine(pairIndex: number): Te[] {
  const k = new KyokumenImproved();
  k.initHirate();
  const rnd = mulberry32(0x5eed00 + SEED_BASE * 15485863 + pairIndex * 104729);
  const line: Te[] = [];
  for (let ply = 0; ply < OPENING_PLIES; ply++) {
    const moves = GenerateMovesImproved.generateLegalMoves(k);
    if (moves.length === 0) break;
    const te = pickCuratedOpeningMove(k, moves, rnd);
    te.capture = k.get(te.to);
    line.push(te.clone());
    k.move(te);
    k.toggleTeban();
  }
  return line;
}

function openingFingerprint(openingMoves: readonly Te[]): string {
  const canonical = openingMoves.map((move) => [
    move.koma,
    move.from,
    move.to,
    move.promote ? 1 : 0,
  ]);
  return createHash("sha256")
    .update("shogi-nnue-fixed-time-opening-v1\0")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Plain WASM player (no book, no mate solver — pure search + eval)
// ---------------------------------------------------------------------------

class WasmPlayer {
  constructor(
    readonly name: string,
    private wasm: ShogiNnueSearchWasm,
  ) {}

  newGame(): void {
    this.wasm.clearTT();
  }

  getNextTe(k: KyokumenImproved, tesu: number): Te | null {
    syncWasm(this.wasm, k);
    this.wasm.setRootTesu(tesu);
    const key = this.wasm.searchBestMove(
      MOVE_MS,
      MAX_DEPTH,
      QUIESCENCE_DEPTH_MAX,
    );
    if (key === 0) return null;
    return teFromWasmKey(key, k);
  }
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

  for (const opening of openingMoves) {
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

  // Instance B: second NNUE (--vs) or the stock hand-crafted evaluateV3Full.
  const wasmB = loadShogiWasm(WASM_PATH) as ShogiNnueSearchWasm;
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

  console.log(
    `=== match: WASM+NNUE-A(${weightsPath}, buckets=${bucketsA}, K=${SCALE_K}, outScale=${SCALE_NUMER}/${SCALE_DENOM}) ` +
      `vs ${weightsPathB ? `WASM+NNUE-B(${weightsPathB})` : "WASM+V3"} — ${GAMES} games, ${MOVE_MS}ms/move, ` +
      `opening ${OPENING_PLIES} plies (seed base ${SEED_BASE}), no book / no mate solver, ` +
      `runtime=${WASM_PATH ?? "production"}, fixed-time-ms=${MOVE_MS}, ` +
      `lazy-picker=A:${lazyPickerLogValue(LAZY_PICKER_A_MIN_MOVES)},B:${lazyPickerLogValue(LAZY_PICKER_B_MIN_MOVES)}, ` +
      `tt=clear-before-each-game-retain-within-game ===`,
  );

  for (let game = 0; game < GAMES; game++) {
    const nnueIsSente = game % 2 === 0;
    const openingMoves = buildOpeningLine(game >> 1); // same opening for the color-swapped pair
    const opening = openingFingerprint(openingMoves);
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
    console.log(
      `game ${game + 1}/${GAMES}: NNUE=${nnueIsSente ? "SENTE" : "GOTE"} opening=${opening} => ${summary} plies=${result.plies} time=${elapsed}s`,
    );
  }

  const decisive = nnueWins + v3Wins;
  const score = nnueWins + draws / 2;
  console.log(
    `\nresult: ${nnuePlayer.name} ${nnueWins} wins / ${v3Player.name} ${v3Wins} wins / ${draws} draws (all ${movesChecked} moves legal)`,
  );
  console.log(
    `${nnuePlayer.name} score: ${score}/${GAMES} (${((score / GAMES) * 100).toFixed(1)}%)` +
      (decisive > 0
        ? `, decisive-only: ${nnueWins}/${decisive} (${((nnueWins / decisive) * 100).toFixed(1)}%)`
        : ""),
  );
}

main();
