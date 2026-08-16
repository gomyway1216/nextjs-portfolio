/**
 * Isolated browser/WASM player used only by the local formal paired A/B v2
 * match adapter.
 *
 * The parent supplies a content-addressed NNUE file identity.  This process
 * independently reads and verifies that file, loads it into its own WASM
 * instance, and serves one fixed search contract over Node IPC.  Candidate
 * and stable players therefore never share module globals, WASM memory, a TT,
 * or NNUE bytes.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  NNUE_WEIGHTS_BYTES,
  clearWasmTT,
  getLastWasmSearchStats,
  isNnueWeightsLoaded,
  loadNnueWeights,
  setWasmNnueEnabled,
  wasmSearchBestMove,
} from "../src/components/game/ShogiImproved/wasmEngineLegacyFormal";
import { SHOGI_WASM_BASE64 } from "../src/components/game/ShogiImproved/wasm/shogiWasmBase64";
import {
  positionFromSfen,
  rulesCompleteLegalMoves,
  teToUsi,
} from "./shogi-sfen";

const SCHEMA = "shogi-formal-paired-ab-v2-wasm-player-ipc-v1";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const SEARCH_DEPTH = 11;
const QUIESCENCE_DEPTH = 10;
const NNUE_SCALE_K = 600;
const WASM_BYTES = 36_545;
const WASM_SHA256 =
  "9142b6b0f0b993596ff3fffa1e05f0d0846bc7672b3f2fc7c90b9f4feaae4c31";
const MATE_SCORE_ABS_MIN = 89_990_000;
const MAX_SEARCH_SCORE = 90_000_000;
const MAX_IPC_TEXT_BYTES = 512 * 1024;

type Role = "candidate" | "stable";

interface InitMessage {
  readonly schema: typeof SCHEMA;
  readonly type: "init";
  readonly request_id: string;
  readonly role: Role;
  readonly weights_path: string;
  readonly weights_bytes: number;
  readonly weights_sha256: string;
  readonly nnue_scale_k: typeof NNUE_SCALE_K;
  readonly search_depth: typeof SEARCH_DEPTH;
  readonly quiescence_depth: typeof QUIESCENCE_DEPTH;
}

interface SearchMessage {
  readonly schema: typeof SCHEMA;
  readonly type: "search";
  readonly request_id: string;
  readonly request_sha256: string;
  readonly sfen: string;
  readonly ply: number;
  readonly legal_moves: readonly string[];
}

interface QuitMessage {
  readonly schema: typeof SCHEMA;
  readonly type: "quit";
  readonly request_id: string;
}

type Message = InitMessage | SearchMessage | QuitMessage;

let phase: "await-init" | "ready" | "done" = "await-init";
let role: Role | undefined;
let weightsSha256: string | undefined;

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message: string): never {
  throw new Error(message);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (
    actual.length !== sortedExpected.length ||
    actual.some((key, index) => key !== sortedExpected[index])
  ) {
    fail(`${label} fields differ`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function validateCommon(message: Record<string, unknown>): void {
  if (
    message.schema !== SCHEMA ||
    typeof message.type !== "string" ||
    typeof message.request_id !== "string" ||
    message.request_id.length === 0 ||
    Buffer.byteLength(message.request_id, "utf8") > 256
  ) {
    fail("IPC message header is invalid");
  }
}

function send(value: Readonly<Record<string, unknown>>): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.send === undefined) {
      reject(new Error("formal A/B player requires an IPC parent"));
      return;
    }
    process.send(value, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function validateInit(message: Record<string, unknown>): InitMessage {
  exactKeys(
    message,
    [
      "nnue_scale_k",
      "quiescence_depth",
      "request_id",
      "role",
      "schema",
      "search_depth",
      "type",
      "weights_bytes",
      "weights_path",
      "weights_sha256",
    ],
    "init message",
  );
  validateCommon(message);
  if (
    message.type !== "init" ||
    (message.role !== "candidate" && message.role !== "stable") ||
    typeof message.weights_path !== "string" ||
    message.weights_path.length === 0 ||
    message.weights_path.includes("\0") ||
    message.weights_bytes !== NNUE_WEIGHTS_BYTES ||
    typeof message.weights_sha256 !== "string" ||
    !SHA256_RE.test(message.weights_sha256) ||
    message.nnue_scale_k !== NNUE_SCALE_K ||
    message.search_depth !== SEARCH_DEPTH ||
    message.quiescence_depth !== QUIESCENCE_DEPTH
  ) {
    fail("init contract is invalid");
  }
  return message as unknown as InitMessage;
}

function initialize(
  messageValue: Record<string, unknown>,
): Record<string, unknown> {
  if (phase !== "await-init") fail("init is permitted exactly once");
  const message = validateInit(messageValue);
  const wasmBytes = Buffer.from(SHOGI_WASM_BASE64, "base64");
  const weights = readFileSync(message.weights_path);
  try {
    if (
      wasmBytes.byteLength !== WASM_BYTES ||
      wasmBytes.toString("base64") !== SHOGI_WASM_BASE64 ||
      digest(wasmBytes) !== WASM_SHA256 ||
      !WebAssembly.validate(wasmBytes)
    ) {
      fail("embedded browser WASM differs from the registered engine");
    }
    if (
      weights.byteLength !== message.weights_bytes ||
      digest(weights) !== message.weights_sha256
    ) {
      fail("NNUE file differs from its enrolled identity");
    }
    if (!loadNnueWeights(weights, message.nnue_scale_k)) {
      fail("browser/WASM engine rejected the enrolled NNUE file");
    }
    if (!isNnueWeightsLoaded() || !setWasmNnueEnabled(true)) {
      fail("browser/WASM engine did not enable the enrolled NNUE file");
    }
    clearWasmTT();
    role = message.role;
    weightsSha256 = message.weights_sha256;
    phase = "ready";
    return {
      schema: SCHEMA,
      type: "ready",
      request_id: message.request_id,
      role,
      weights_bytes: NNUE_WEIGHTS_BYTES,
      weights_sha256: weightsSha256,
      wasm_bytes: WASM_BYTES,
      wasm_sha256: WASM_SHA256,
      nnue_scale_k: NNUE_SCALE_K,
      search_depth: SEARCH_DEPTH,
      quiescence_depth: QUIESCENCE_DEPTH,
      isolated_process: true,
    };
  } finally {
    wasmBytes.fill(0);
    weights.fill(0);
  }
}

function validateSearch(message: Record<string, unknown>): SearchMessage {
  exactKeys(
    message,
    [
      "legal_moves",
      "ply",
      "request_id",
      "request_sha256",
      "schema",
      "sfen",
      "type",
    ],
    "search message",
  );
  validateCommon(message);
  if (
    message.type !== "search" ||
    typeof message.request_sha256 !== "string" ||
    !SHA256_RE.test(message.request_sha256) ||
    typeof message.sfen !== "string" ||
    message.sfen.length === 0 ||
    Buffer.byteLength(message.sfen, "utf8") > 2_048 ||
    !Number.isSafeInteger(message.ply) ||
    (message.ply as number) < 0 ||
    (message.ply as number) > 100_000 ||
    !Array.isArray(message.legal_moves) ||
    message.legal_moves.length === 0 ||
    Buffer.byteLength(JSON.stringify(message.legal_moves), "utf8") >
      MAX_IPC_TEXT_BYTES ||
    message.legal_moves.some(
      (move) => typeof move !== "string" || move.length === 0,
    )
  ) {
    fail("search contract is invalid");
  }
  return message as unknown as SearchMessage;
}

function search(
  messageValue: Record<string, unknown>,
): Record<string, unknown> {
  if (phase !== "ready" || role === undefined || weightsSha256 === undefined) {
    fail("search requires a successfully initialized player");
  }
  const message = validateSearch(messageValue);
  const parsed = positionFromSfen(message.sfen);
  const actualLegalMoves = rulesCompleteLegalMoves(parsed.position).map(
    (entry) => entry.usi,
  );
  if (
    actualLegalMoves.length !== message.legal_moves.length ||
    actualLegalMoves.some((move, index) => move !== message.legal_moves[index])
  ) {
    fail("parent legal-move vector differs from the browser rules engine");
  }

  // This is the registered stable search behavior: no book, no clock, an
  // empty private TT for each decision, depth 11 and quiescence depth 10.
  clearWasmTT();
  const move = wasmSearchBestMove(
    parsed.position,
    message.ply,
    0,
    SEARCH_DEPTH,
    QUIESCENCE_DEPTH,
  );
  if (move === null) fail("WASM returned no move for a nonterminal position");
  const usi = teToUsi(move);
  if (!actualLegalMoves.includes(usi)) {
    fail("WASM returned a move outside the rules-complete legal set");
  }
  const stats = getLastWasmSearchStats();
  if (
    stats === null ||
    !Number.isSafeInteger(stats.score) ||
    stats.score < -MAX_SEARCH_SCORE ||
    stats.score > MAX_SEARCH_SCORE ||
    !Number.isSafeInteger(stats.depth) ||
    stats.depth < 1 ||
    stats.depth > SEARCH_DEPTH ||
    !Number.isSafeInteger(stats.nodes) ||
    stats.nodes < 0 ||
    !Number.isSafeInteger(stats.leaves) ||
    stats.leaves < 0 ||
    stats.nodes + stats.leaves === 0 ||
    (stats.depth !== SEARCH_DEPTH &&
      !(
        stats.depth < SEARCH_DEPTH &&
        Math.abs(stats.score) >= MATE_SCORE_ABS_MIN
      ))
  ) {
    fail("WASM search result differs from the registered depth/mate contract");
  }
  return {
    schema: SCHEMA,
    type: "result",
    request_id: message.request_id,
    request_sha256: message.request_sha256,
    role,
    weights_sha256: weightsSha256,
    usi,
    search_depth: SEARCH_DEPTH,
    quiescence_depth: QUIESCENCE_DEPTH,
    completed_depth: stats.depth,
    score: stats.score,
    nodes: stats.nodes,
    leaves: stats.leaves,
    reset_before_move: true,
    book: false,
  };
}

function quit(message: Record<string, unknown>): Record<string, unknown> {
  exactKeys(message, ["request_id", "schema", "type"], "quit message");
  validateCommon(message);
  if (message.type !== "quit" || phase !== "ready") {
    fail("quit requires a ready player");
  }
  phase = "done";
  return {
    schema: SCHEMA,
    type: "bye",
    request_id: message.request_id,
    role,
    weights_sha256: weightsSha256,
    process_reap_required: true,
  };
}

let handling = false;

process.on("message", (value: unknown) => {
  if (handling || phase === "done") {
    process.exitCode = 1;
    process.disconnect();
    return;
  }
  handling = true;
  let requestId = "unbound";
  void (async () => {
    try {
      const message = record(value, "IPC message");
      if (typeof message.request_id === "string") {
        requestId = message.request_id;
      }
      let response: Record<string, unknown>;
      if (message.type === "init") response = initialize(message);
      else if (message.type === "search") response = search(message);
      else if (message.type === "quit") response = quit(message);
      else fail("unknown IPC message type");
      await send(response);
      if (message.type === "quit") {
        process.disconnect();
        return;
      }
      handling = false;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message.slice(0, 900)
          : "unknown failure";
      try {
        await send({
          schema: SCHEMA,
          type: "fault",
          request_id: requestId,
          message,
        });
      } finally {
        process.exitCode = 1;
        process.disconnect();
      }
    }
  })();
});

process.on("disconnect", () => {
  if (phase !== "done") process.exitCode = 1;
});
