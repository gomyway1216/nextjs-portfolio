/**
 * Optional stable-WASM candidate capability for the independent v3 teacher
 * family. Stable search is deliberately bounded and may be omitted. An
 * omitted search never contributes a move or score and never poisons sibling
 * lanes; its worker is reaped and replaced before the omission resolves.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Writable } from "node:stream";

import { withVerifiedPinnedFloodgateProductionStableRuntimeAssets } from "./floodgate-production-teacher-asset-authority";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_QUIESCENCE_DEPTH,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_BYTES,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  FLOODGATE_STABLE_WASM_SHA256,
  FLOODGATE_STABLE_WEIGHTS_BYTES,
  FLOODGATE_STABLE_WEIGHTS_SHA256,
  type FloodgateStableWasmProposalRow,
  type FloodgateStableWasmSearchRequest,
} from "./floodgate-stable-wasm-proposer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  resolveUsiMove,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

export const FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3 =
  "shogi-floodgate-bounded-stable-wasm-runtime-v3" as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3 =
  "shogi-floodgate-bounded-stable-wasm-outcome-v3" as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3 =
  20_000 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3 =
  25_000 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_STARTUP_TIMEOUT_MS_V3 =
  120_000 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_CLOSE_TIMEOUT_MS_V3 = 5_000 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3 = 12 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3 = 48 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SCHEMA_V3 =
  "shogi-floodgate-bounded-stable-wasm-worker-v3" as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3 = 11_382 as const;
export const FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3 =
  "54d04823b44831ecc544dc73f28a8d3a5e54bc7a4c1cd8436673563d4d058f38" as const;

const WORKER_BOOTSTRAP =
  'import { readFileSync } from "node:fs";' +
  "const source=readFileSync(3);" +
  'await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));';
const PARENT_DIGEST_DOMAIN = "shogi-floodgate-bounded-stable-parent-v3\0";
const STABLE_ROW_PARENT_DIGEST_DOMAIN = "shogi-floodgate-stable-parent-v1\0";
const RECEIPT_DIGEST_DOMAIN = "shogi-floodgate-bounded-stable-receipt-v3\0";
const OUTCOME_DIGEST_DOMAIN = "shogi-floodgate-bounded-stable-outcome-v3\0";
const REQUEST_DIGEST_DOMAIN = "shogi-floodgate-bounded-stable-request-v3\0";
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const MAX_PROTOCOL_LINE_BYTES = 8_192;

export type FloodgateBoundedStableWasmOmissionReasonV3 =
  "cooperative-deadline" | "outer-watchdog";

export interface FloodgateBoundedStableWasmRuntimeBindingV3 {
  readonly runtime_receipt_sha256: string;
  readonly parent_payload_sha256: string;
  readonly outcome_sha256: string;
}

export interface FloodgateBoundedStableWasmProposalOutcomeV3 {
  readonly schema: typeof FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3;
  readonly outcome: "proposal";
  readonly row: Readonly<FloodgateStableWasmProposalRow>;
  readonly omission: null;
  readonly runtime_binding: Readonly<FloodgateBoundedStableWasmRuntimeBindingV3>;
}

export interface FloodgateBoundedStableWasmOmissionOutcomeV3 {
  readonly schema: typeof FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3;
  readonly outcome: "omitted";
  readonly row: null;
  readonly omission: Readonly<{
    readonly reason: FloodgateBoundedStableWasmOmissionReasonV3;
    readonly search_budget_ms: typeof FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3;
    readonly completed_depth: number | null;
    readonly partial_result_adopted: false;
    readonly worker_reaped: true;
    readonly worker_replaced: true;
  }>;
  readonly runtime_binding: Readonly<FloodgateBoundedStableWasmRuntimeBindingV3>;
}

export type FloodgateBoundedStableWasmOutcomeV3 =
  | FloodgateBoundedStableWasmProposalOutcomeV3
  | FloodgateBoundedStableWasmOmissionOutcomeV3;

export interface FloodgateBoundedStableWasmRuntimeReceiptV3 {
  readonly contract: typeof FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3;
  readonly status: "initialized-optional-bounded-stable-candidate-capability";
  readonly claim_boundary: "candidate-or-authenticated-omission-only-not-teacher-label-training-holdout-or-playing-strength";
  readonly execution_boundary:
    "production-pinned-asset-authority" | "test-only-injected-workers";
  readonly asset_authority_receipt_sha256: string;
  readonly engine_assets: Readonly<{
    readonly wasm: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly weights: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
    readonly worker_source: Readonly<{
      readonly bytes: number;
      readonly sha256: string;
    }>;
  }>;
  readonly search: Readonly<{
    readonly requested_depth: typeof FLOODGATE_STABLE_REQUESTED_DEPTH;
    readonly quiescence_depth: typeof FLOODGATE_STABLE_QUIESCENCE_DEPTH;
    readonly cooperative_deadline_ms: typeof FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3;
    readonly partial_result_policy: "discard-entire-move-score-and-counters";
    readonly stable_candidate_role: "optional";
  }>;
  readonly operational: Readonly<{
    readonly workers: number;
    readonly queue_bound: number;
    readonly outer_watchdog_ms: typeof FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3;
    readonly omission_policy: "resolve-explicit-bound-outcome-no-pool-poison";
    readonly unexpected_failure_policy: "reap-replace-reject-parent-no-pool-poison";
    readonly replacement_policy: "reap-omitted-or-failed-worker-before-fresh-replacement";
  }>;
}

export interface FloodgateBoundedStableWasmRuntimeV3 {
  readonly receipt: Readonly<FloodgateBoundedStableWasmRuntimeReceiptV3>;
  readonly propose: (
    parent: Readonly<FloodgateTrainingParent>,
  ) => Promise<Readonly<FloodgateBoundedStableWasmOutcomeV3>>;
  readonly close: () => Promise<void>;
}

interface RawProposal {
  readonly outcome: "proposal";
  readonly index: number;
  readonly packed_move: number;
  readonly raw_search_score: number;
  readonly completed_depth: number;
  readonly nodes: number;
  readonly leaves: number;
}

interface RawOmission {
  readonly outcome: "omitted";
  readonly reason: FloodgateBoundedStableWasmOmissionReasonV3;
  readonly completed_depth: number | null;
}

export type FloodgateBoundedStableWasmWorkerResultV3 =
  Readonly<RawProposal> | Readonly<RawOmission>;

export interface FloodgateBoundedStableWasmWorkerLaneV3 {
  readonly search: (
    request: Readonly<FloodgateStableWasmSearchRequest>,
  ) => Promise<Readonly<FloodgateBoundedStableWasmWorkerResultV3>>;
  readonly close: (force: boolean) => Promise<void>;
}

export interface FloodgateBoundedStableWasmWorkerFactoryV3 {
  readonly create: () => Promise<
    Readonly<FloodgateBoundedStableWasmWorkerLaneV3>
  >;
}

export interface FloodgateBoundedStableWasmRuntimeCoreOptionsForTests {
  readonly assetAuthorityReceiptSha256: string;
  readonly workers: number;
  readonly queueBound: number;
  readonly workerFactory: Readonly<FloodgateBoundedStableWasmWorkerFactoryV3>;
}

interface RuntimeJob {
  readonly parent: Readonly<FloodgateTrainingParent>;
  readonly resolve: (
    value: Readonly<FloodgateBoundedStableWasmOutcomeV3>,
  ) => void;
  readonly reject: (error: unknown) => void;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("bounded stable canonical JSON rejects invalid numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort((left, right) =>
        Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
      )
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("bounded stable canonical JSON rejects unsupported values");
}

function frozen<T extends object>(value: T): Readonly<T> {
  return Object.freeze(value);
}

function parentPayload(
  parent: Readonly<FloodgateTrainingParent>,
): Readonly<FloodgateTrainingParent> {
  if (
    parent === null ||
    typeof parent !== "object" ||
    parent.schema_version !== 1 ||
    !SEMANTIC_ID_RE.test(parent.game_id) ||
    !SEMANTIC_ID_RE.test(parent.parent_id) ||
    !SEMANTIC_ID_RE.test(parent.position_id) ||
    !Number.isSafeInteger(parent.ply) ||
    parent.ply < 0
  ) {
    throw new Error("bounded stable parent identity is invalid");
  }
  const parsed = positionFromSfen(parent.parent_sfen);
  const legal = rulesCompleteLegalMoves(parsed.position);
  if (
    legal.length === 0 ||
    !legal.some(
      (entry) =>
        entry.usi === parent.played_move &&
        getKomashu(entry.move.capture) !== OU,
    )
  ) {
    throw new Error("bounded stable parent played move is not legal");
  }
  return frozen({
    schema_version: 1 as const,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_sfen: parent.parent_sfen,
    ply: parent.ply,
    played_move: parent.played_move,
  });
}

function buildRequest(
  parent: Readonly<FloodgateTrainingParent>,
): Readonly<FloodgateStableWasmSearchRequest> {
  const { position } = positionFromSfen(parent.parent_sfen);
  const board: number[] = [];
  const hands: number[] = [];
  for (let file = 1; file <= 9; file += 1) {
    for (let rank = 1; rank <= 9; rank += 1) {
      board.push(position.ban[(file << 4) + rank] | 0);
    }
  }
  for (let piece = 17; piece <= 39; piece += 1) {
    hands.push(position.hand[piece] | 0);
  }
  return frozen({
    index: 0,
    board: Object.freeze(board),
    hands: Object.freeze(hands),
    side_to_move: position.teban,
    root_tesu: parent.ply,
  });
}

function positionId(sfen: string): string {
  const fields = sfen.split(" ");
  return `sha256:${sha256(`sfen-v1\0${fields.slice(0, 3).join(" ")}`)}`;
}

function packedMoveToUsi(packedMove: number, parentSfen: string): string {
  if (
    !Number.isSafeInteger(packedMove) ||
    packedMove <= 0 ||
    packedMove > 0x7fffff
  ) {
    throw new Error("bounded stable packed move is invalid");
  }
  const piece = packedMove & 0x3f;
  const from = (packedMove >> 6) & 0xff;
  const to = (packedMove >> 14) & 0xff;
  const promote = ((packedMove >> 22) & 1) === 1;
  const toFile = to >> 4;
  const toRank = to & 0x0f;
  if (toFile < 1 || toFile > 9 || toRank < 1 || toRank > 9) {
    throw new Error("bounded stable move destination is invalid");
  }
  let usi: string;
  if (from === 0) {
    const letters = ["", "P", "L", "N", "S", "G", "B", "R"];
    const letter = letters[piece & 0x0f];
    if (letter === undefined || letter === "" || promote) {
      throw new Error("bounded stable packed drop is invalid");
    }
    usi = `${letter}*${toFile}${String.fromCharCode(96 + toRank)}`;
  } else {
    const fromFile = from >> 4;
    const fromRank = from & 0x0f;
    if (fromFile < 1 || fromFile > 9 || fromRank < 1 || fromRank > 9) {
      throw new Error("bounded stable move origin is invalid");
    }
    usi = `${fromFile}${String.fromCharCode(96 + fromRank)}${toFile}${String.fromCharCode(96 + toRank)}${promote ? "+" : ""}`;
  }
  const resolved = resolveUsiMove(positionFromSfen(parentSfen).position, usi);
  if ((resolved.koma & 0x3f) !== piece || getKomashu(resolved.capture) === OU) {
    throw new Error("bounded stable packed move is not legal");
  }
  return usi;
}

function proposalRow(
  parent: Readonly<FloodgateTrainingParent>,
  result: Readonly<RawProposal>,
): Readonly<FloodgateStableWasmProposalRow> {
  if (
    result.index !== 0 ||
    !Number.isSafeInteger(result.completed_depth) ||
    result.completed_depth < 1 ||
    result.completed_depth > FLOODGATE_STABLE_REQUESTED_DEPTH ||
    !Number.isSafeInteger(result.raw_search_score) ||
    result.raw_search_score < -FLOODGATE_STABLE_MATE_SCORE_MAX ||
    result.raw_search_score > FLOODGATE_STABLE_MATE_SCORE_MAX ||
    !Number.isSafeInteger(result.nodes) ||
    !Number.isSafeInteger(result.leaves) ||
    result.nodes < 0 ||
    result.leaves < 0 ||
    result.nodes + result.leaves === 0
  ) {
    throw new Error("bounded stable proposal counters are invalid");
  }
  const early = result.completed_depth < FLOODGATE_STABLE_REQUESTED_DEPTH;
  if (
    early &&
    (result.raw_search_score < FLOODGATE_STABLE_MATE_SCORE_MIN ||
      result.raw_search_score > FLOODGATE_STABLE_MATE_SCORE_MAX)
  ) {
    throw new Error("bounded stable incomplete proposal is not winning mate");
  }
  const stableMove = packedMoveToUsi(result.packed_move, parent.parent_sfen);
  const childSfen = childSfenAfterUsi(parent.parent_sfen, stableMove);
  const stableRowParentDigest = sha256(
    `${STABLE_ROW_PARENT_DIGEST_DOMAIN}${canonicalJson(parent)}`,
  );
  return frozen({
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: stableRowParentDigest,
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: positionId(childSfen),
    search: frozen({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: result.completed_depth,
      termination: early
        ? ("winning-mate-band-early" as const)
        : ("requested-depth-complete" as const),
      raw_search_score: result.raw_search_score,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: result.nodes,
      leaves: result.leaves,
      root_tesu: parent.ply,
    }),
  });
}

function bindOutcome(
  receiptDigest: string,
  parentDigest: string,
  body: Omit<FloodgateBoundedStableWasmOutcomeV3, "runtime_binding">,
): Readonly<FloodgateBoundedStableWasmOutcomeV3> {
  const outcomeDigest = sha256(
    `${OUTCOME_DIGEST_DOMAIN}${canonicalJson(body)}`,
  );
  return frozen({
    ...body,
    runtime_binding: frozen({
      runtime_receipt_sha256: receiptDigest,
      parent_payload_sha256: parentDigest,
      outcome_sha256: outcomeDigest,
    }),
  }) as Readonly<FloodgateBoundedStableWasmOutcomeV3>;
}

function exactKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has unexpected or missing keys`);
  }
  return value as Readonly<Record<string, unknown>>;
}

/** Deterministic receipt digest consumed by the v3 teacher plan/runner. */
export function getFloodgateBoundedStableWasmRuntimeReceiptDigestV3(
  receipt: Readonly<FloodgateBoundedStableWasmRuntimeReceiptV3>,
): string {
  return sha256(`${RECEIPT_DIGEST_DOMAIN}${canonicalJson(receipt)}`);
}

/**
 * Strictly validate a bound v3 outcome at the teacher boundary. A proposal
 * returns its legal stable move; an authenticated omission returns undefined.
 * Any forged, partial, differently-budgeted, or cross-parent value throws.
 */
export function validateFloodgateBoundedStableWasmOutcomeV3(
  outcomeValue: unknown,
  parentValue: Readonly<FloodgateTrainingParent>,
  receiptDigest: string,
): string | undefined {
  if (!/^[0-9a-f]{64}$/.test(receiptDigest)) {
    throw new Error("bounded stable validator receipt digest is invalid");
  }
  const parent = parentPayload(parentValue);
  const parentDigest = sha256(
    `${PARENT_DIGEST_DOMAIN}${canonicalJson(parent)}`,
  );
  const outcome = exactKeys(
    outcomeValue,
    ["schema", "outcome", "row", "omission", "runtime_binding"],
    "bounded stable outcome",
  );
  if (outcome.schema !== FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3) {
    throw new Error("bounded stable outcome schema mismatch");
  }
  const binding = exactKeys(
    outcome.runtime_binding,
    ["runtime_receipt_sha256", "parent_payload_sha256", "outcome_sha256"],
    "bounded stable outcome binding",
  );
  if (
    binding.runtime_receipt_sha256 !== receiptDigest ||
    binding.parent_payload_sha256 !== parentDigest ||
    typeof binding.outcome_sha256 !== "string"
  ) {
    throw new Error("bounded stable outcome binding mismatch");
  }
  const body = {
    schema: outcome.schema,
    outcome: outcome.outcome,
    row: outcome.row,
    omission: outcome.omission,
  };
  if (
    binding.outcome_sha256 !==
    sha256(`${OUTCOME_DIGEST_DOMAIN}${canonicalJson(body)}`)
  ) {
    throw new Error("bounded stable outcome digest mismatch");
  }
  if (outcome.outcome === "omitted") {
    if (outcome.row !== null) {
      throw new Error("bounded stable omission contains a proposal row");
    }
    const omission = exactKeys(
      outcome.omission,
      [
        "reason",
        "search_budget_ms",
        "completed_depth",
        "partial_result_adopted",
        "worker_reaped",
        "worker_replaced",
      ],
      "bounded stable omission",
    );
    if (
      !["cooperative-deadline", "outer-watchdog"].includes(
        omission.reason as string,
      ) ||
      omission.search_budget_ms !==
        FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3 ||
      omission.partial_result_adopted !== false ||
      omission.worker_reaped !== true ||
      omission.worker_replaced !== true
    ) {
      throw new Error("bounded stable omission policy mismatch");
    }
    if (
      omission.completed_depth !== null &&
      (!Number.isSafeInteger(omission.completed_depth) ||
        (omission.completed_depth as number) < 0 ||
        (omission.completed_depth as number) >=
          FLOODGATE_STABLE_REQUESTED_DEPTH)
    ) {
      throw new Error("bounded stable omission depth is invalid");
    }
    if (
      omission.reason === "cooperative-deadline" &&
      omission.completed_depth === null
    ) {
      throw new Error("cooperative omission must bind completed depth");
    }
    return undefined;
  }
  if (outcome.outcome !== "proposal" || outcome.omission !== null) {
    throw new Error("bounded stable proposal discriminator mismatch");
  }
  const row = exactKeys(
    outcome.row,
    [
      "schema",
      "game_id",
      "parent_id",
      "position_id",
      "parent_payload_sha256",
      "stable_move",
      "child_sfen",
      "child_position_id",
      "search",
    ],
    "bounded stable proposal row",
  );
  if (
    row.schema !== FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA ||
    row.game_id !== parent.game_id ||
    row.parent_id !== parent.parent_id ||
    row.position_id !== parent.position_id ||
    row.parent_payload_sha256 !==
      sha256(`${STABLE_ROW_PARENT_DIGEST_DOMAIN}${canonicalJson(parent)}`) ||
    typeof row.stable_move !== "string"
  ) {
    throw new Error("bounded stable proposal parent binding mismatch");
  }
  const legal = rulesCompleteLegalMoves(
    positionFromSfen(parent.parent_sfen).position,
  );
  if (
    !legal.some(
      (entry) =>
        entry.usi === row.stable_move && getKomashu(entry.move.capture) !== OU,
    )
  ) {
    throw new Error("bounded stable proposal move is not legal");
  }
  const childSfen = childSfenAfterUsi(
    parent.parent_sfen,
    row.stable_move as string,
  );
  if (
    row.child_sfen !== childSfen ||
    row.child_position_id !== positionId(childSfen)
  ) {
    throw new Error("bounded stable proposal child binding mismatch");
  }
  const search = exactKeys(
    row.search,
    [
      "requested_depth",
      "completed_depth",
      "termination",
      "raw_search_score",
      "score_encoding",
      "nodes",
      "leaves",
      "root_tesu",
    ],
    "bounded stable proposal search",
  );
  if (
    search.requested_depth !== FLOODGATE_STABLE_REQUESTED_DEPTH ||
    search.score_encoding !== FLOODGATE_STABLE_WASM_SCORE_ENCODING ||
    search.root_tesu !== parent.ply ||
    !Number.isSafeInteger(search.completed_depth) ||
    (search.completed_depth as number) < 1 ||
    (search.completed_depth as number) > FLOODGATE_STABLE_REQUESTED_DEPTH ||
    !Number.isSafeInteger(search.raw_search_score) ||
    (search.raw_search_score as number) < -FLOODGATE_STABLE_MATE_SCORE_MAX ||
    (search.raw_search_score as number) > FLOODGATE_STABLE_MATE_SCORE_MAX ||
    !Number.isSafeInteger(search.nodes) ||
    !Number.isSafeInteger(search.leaves) ||
    (search.nodes as number) < 0 ||
    (search.leaves as number) < 0 ||
    (search.nodes as number) + (search.leaves as number) === 0
  ) {
    throw new Error("bounded stable proposal search is invalid");
  }
  const full = search.completed_depth === FLOODGATE_STABLE_REQUESTED_DEPTH;
  if (
    search.termination !==
      (full ? "requested-depth-complete" : "winning-mate-band-early") ||
    (!full &&
      ((search.raw_search_score as number) < FLOODGATE_STABLE_MATE_SCORE_MIN ||
        (search.raw_search_score as number) > FLOODGATE_STABLE_MATE_SCORE_MAX))
  ) {
    throw new Error("bounded stable proposal completion policy mismatch");
  }
  return row.stable_move as string;
}

function makeReceipt(
  authorityDigest: string,
  workers: number,
  queueBound: number,
  executionBoundary: FloodgateBoundedStableWasmRuntimeReceiptV3["execution_boundary"],
): Readonly<FloodgateBoundedStableWasmRuntimeReceiptV3> {
  return frozen({
    contract: FLOODGATE_BOUNDED_STABLE_WASM_RUNTIME_CONTRACT_V3,
    status: "initialized-optional-bounded-stable-candidate-capability" as const,
    claim_boundary:
      "candidate-or-authenticated-omission-only-not-teacher-label-training-holdout-or-playing-strength" as const,
    execution_boundary: executionBoundary,
    asset_authority_receipt_sha256: authorityDigest,
    engine_assets: frozen({
      wasm: frozen({
        bytes: FLOODGATE_STABLE_WASM_BYTES,
        sha256: FLOODGATE_STABLE_WASM_SHA256,
      }),
      weights: frozen({
        bytes: FLOODGATE_STABLE_WEIGHTS_BYTES,
        sha256: FLOODGATE_STABLE_WEIGHTS_SHA256,
      }),
      worker_source: frozen({
        bytes: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3,
        sha256: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3,
      }),
    }),
    search: frozen({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      quiescence_depth: FLOODGATE_STABLE_QUIESCENCE_DEPTH,
      cooperative_deadline_ms:
        FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
      partial_result_policy: "discard-entire-move-score-and-counters" as const,
      stable_candidate_role: "optional" as const,
    }),
    operational: frozen({
      workers,
      queue_bound: queueBound,
      outer_watchdog_ms: FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3,
      omission_policy: "resolve-explicit-bound-outcome-no-pool-poison" as const,
      unexpected_failure_policy:
        "reap-replace-reject-parent-no-pool-poison" as const,
      replacement_policy:
        "reap-omitted-or-failed-worker-before-fresh-replacement" as const,
    }),
  });
}

async function createRuntime(
  options: Readonly<FloodgateBoundedStableWasmRuntimeCoreOptionsForTests>,
  executionBoundary: FloodgateBoundedStableWasmRuntimeReceiptV3["execution_boundary"],
): Promise<Readonly<FloodgateBoundedStableWasmRuntimeV3>> {
  if (
    !/^[0-9a-f]{64}$/.test(options.assetAuthorityReceiptSha256) ||
    !Number.isSafeInteger(options.workers) ||
    options.workers < 1 ||
    options.workers > FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3 ||
    !Number.isSafeInteger(options.queueBound) ||
    options.queueBound < 1 ||
    options.queueBound > FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3
  ) {
    throw new Error("bounded stable runtime options are invalid");
  }
  const receipt = makeReceipt(
    options.assetAuthorityReceiptSha256,
    options.workers,
    options.queueBound,
    executionBoundary,
  );
  const receiptDigest = sha256(
    `${RECEIPT_DIGEST_DOMAIN}${canonicalJson(receipt)}`,
  );
  const initialLaneSettlements = await Promise.allSettled(
    Array.from({ length: options.workers }, () =>
      options.workerFactory.create(),
    ),
  );
  const lanes: Readonly<FloodgateBoundedStableWasmWorkerLaneV3>[] = [];
  const initializationFailures: unknown[] = [];
  for (const settlement of initialLaneSettlements) {
    if (settlement.status === "fulfilled") lanes.push(settlement.value);
    else initializationFailures.push(settlement.reason);
  }
  if (initializationFailures.length > 0) {
    const cleanupSettlements = await Promise.allSettled(
      lanes.map((lane) => lane.close(true)),
    );
    const cleanupFailures = cleanupSettlements
      .filter(
        (settlement): settlement is PromiseRejectedResult =>
          settlement.status === "rejected",
      )
      .map((settlement) => settlement.reason);
    throw new AggregateError(
      [...initializationFailures, ...cleanupFailures],
      "bounded stable worker initialization failed closed",
    );
  }
  const busy = Array.from({ length: options.workers }, () => false);
  const queue: RuntimeJob[] = [];
  let closing = false;

  const replace = async (index: number): Promise<void> => {
    const previous = lanes[index];
    await previous.close(true);
    if (closing) throw new Error("bounded stable runtime is closing");
    lanes[index] = await options.workerFactory.create();
  };

  const pump = (): void => {
    if (closing) return;
    for (let index = 0; index < lanes.length && queue.length > 0; index += 1) {
      if (busy[index]) continue;
      const job = queue.shift();
      if (job === undefined) break;
      busy[index] = true;
      void (async () => {
        const parentDigest = sha256(
          `${PARENT_DIGEST_DOMAIN}${canonicalJson(job.parent)}`,
        );
        try {
          const result = await lanes[index].search(buildRequest(job.parent));
          if (result.outcome === "proposal") {
            const row = proposalRow(job.parent, result);
            job.resolve(
              bindOutcome(receiptDigest, parentDigest, {
                schema: FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
                outcome: "proposal",
                row,
                omission: null,
              }),
            );
          } else {
            if (
              (result.reason !== "cooperative-deadline" &&
                result.reason !== "outer-watchdog") ||
              (result.reason === "cooperative-deadline" &&
                (!Number.isSafeInteger(result.completed_depth) ||
                  (result.completed_depth as number) < 0 ||
                  (result.completed_depth as number) >=
                    FLOODGATE_STABLE_REQUESTED_DEPTH)) ||
              (result.reason === "outer-watchdog" &&
                result.completed_depth !== null)
            ) {
              throw new Error("bounded stable worker omission is invalid");
            }
            await replace(index);
            job.resolve(
              bindOutcome(receiptDigest, parentDigest, {
                schema: FLOODGATE_BOUNDED_STABLE_WASM_OUTCOME_SCHEMA_V3,
                outcome: "omitted",
                row: null,
                omission: frozen({
                  reason: result.reason,
                  search_budget_ms:
                    FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
                  completed_depth: result.completed_depth,
                  partial_result_adopted: false,
                  worker_reaped: true,
                  worker_replaced: true,
                }),
              }),
            );
          }
        } catch (error) {
          try {
            await replace(index);
            job.reject(error);
          } catch (replacementError) {
            job.reject(
              new AggregateError(
                [error, replacementError],
                "bounded stable worker failure and replacement failure",
              ),
            );
          }
        } finally {
          busy[index] = false;
          pump();
        }
      })();
    }
  };

  const runtime: FloodgateBoundedStableWasmRuntimeV3 = {
    receipt,
    propose(parentValue) {
      if (closing) {
        return Promise.reject(new Error("bounded stable runtime is closed"));
      }
      let parent: Readonly<FloodgateTrainingParent>;
      try {
        parent = parentPayload(parentValue);
      } catch (error) {
        return Promise.reject(error);
      }
      const idle = busy.some((value) => !value);
      if (!idle && queue.length >= options.queueBound) {
        return Promise.reject(
          new Error(`bounded stable queue is full at ${options.queueBound}`),
        );
      }
      return new Promise((resolve, reject) => {
        queue.push(frozen({ parent, resolve, reject }));
        pump();
      });
    },
    async close() {
      if (closing) return;
      closing = true;
      const error = new Error("bounded stable runtime closed");
      for (const job of queue.splice(0)) job.reject(error);
      await Promise.allSettled(lanes.map((lane) => lane.close(true)));
    },
  };
  return frozen(runtime);
}

export function createFloodgateBoundedStableWasmRuntimeV3CoreForTests(
  options: Readonly<FloodgateBoundedStableWasmRuntimeCoreOptionsForTests>,
): Promise<Readonly<FloodgateBoundedStableWasmRuntimeV3>> {
  return createRuntime(options, "test-only-injected-workers");
}

class OuterWatchdogError extends Error {}

class ProductionWorkerLane implements FloodgateBoundedStableWasmWorkerLaneV3 {
  private readonly child: ChildProcessWithoutNullStreams;
  private stdout = "";
  private pending:
    | {
        readonly resolve: (value: Readonly<Record<string, unknown>>) => void;
        readonly reject: (error: unknown) => void;
        readonly timer: ReturnType<typeof setTimeout>;
      }
    | undefined;
  private closed = false;
  private readonly closePromise: Promise<void>;
  private resolveClose!: () => void;

  private constructor(source: Uint8Array) {
    this.closePromise = new Promise((resolve) => {
      this.resolveClose = resolve;
    });
    this.child = spawn(
      process.execPath,
      ["--input-type=module", "--eval", WORKER_BOOTSTRAP],
      {
        shell: false,
        stdio: ["pipe", "pipe", "pipe", "pipe"],
      },
    );
    this.child.on("close", () => {
      this.closed = true;
      this.resolveClose();
      this.pending?.reject(new Error("bounded stable worker exited"));
      if (this.pending !== undefined) clearTimeout(this.pending.timer);
      this.pending = undefined;
    });
    this.child.on("error", (error) => this.fail(error));
    this.child.stdin.on("error", (error) => this.fail(error));
    this.child.stderr.on("data", () =>
      this.fail(new Error("bounded stable worker wrote stderr")),
    );
    this.child.stdout.on("data", (chunk: Buffer) => this.onStdout(chunk));
    const sourcePipe = this.child.stdio[3] as Writable | null;
    if (sourcePipe === null)
      throw new Error("bounded stable source pipe missing");
    sourcePipe.end(source);
  }

  static async create(
    assets: Readonly<{
      readonly wasm: Uint8Array;
      readonly weights: Uint8Array;
    }>,
    source: Uint8Array,
  ): Promise<Readonly<ProductionWorkerLane>> {
    const lane = new ProductionWorkerLane(source);
    const ready = await lane.request(
      {
        schema: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SCHEMA_V3,
        type: "init",
        wasm_base64: Buffer.from(assets.wasm).toString("base64"),
        weights_base64: Buffer.from(assets.weights).toString("base64"),
      },
      FLOODGATE_BOUNDED_STABLE_WASM_STARTUP_TIMEOUT_MS_V3,
      false,
    );
    if (
      ready.schema !== FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SCHEMA_V3 ||
      ready.type !== "ready" ||
      ready.deadline_ms !== FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3 ||
      ready.wasm_sha256 !== FLOODGATE_STABLE_WASM_SHA256 ||
      ready.weights_sha256 !== FLOODGATE_STABLE_WEIGHTS_SHA256
    ) {
      await lane.close(true);
      throw new Error("bounded stable worker ready receipt mismatch");
    }
    return lane;
  }

  private fail(error: unknown): void {
    const pending = this.pending;
    this.pending = undefined;
    if (pending !== undefined) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    if (!this.closed) this.child.kill("SIGKILL");
  }

  private onStdout(chunk: Buffer): void {
    this.stdout += chunk.toString("ascii");
    if (Buffer.byteLength(this.stdout, "ascii") > MAX_PROTOCOL_LINE_BYTES) {
      this.fail(new Error("bounded stable worker response too large"));
      return;
    }
    const newline = this.stdout.indexOf("\n");
    if (newline < 0) return;
    if (
      this.stdout.indexOf("\n", newline + 1) >= 0 ||
      this.pending === undefined
    ) {
      this.fail(new Error("bounded stable worker protocol violation"));
      return;
    }
    const line = this.stdout.slice(0, newline);
    this.stdout = this.stdout.slice(newline + 1);
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
      if (canonicalJson(parsed) !== line) throw new Error("noncanonical");
    } catch {
      this.fail(new Error("bounded stable worker returned invalid JSON"));
      return;
    }
    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.resolve(parsed as Readonly<Record<string, unknown>>);
  }

  private request(
    message: Readonly<Record<string, unknown>>,
    timeout: number,
    watchdog: boolean,
  ): Promise<Readonly<Record<string, unknown>>> {
    if (this.closed || this.pending !== undefined) {
      return Promise.reject(new Error("bounded stable worker is unavailable"));
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const error = watchdog
          ? new OuterWatchdogError("bounded stable outer watchdog")
          : new Error("bounded stable worker startup timeout");
        this.fail(error);
      }, timeout);
      this.pending = { resolve, reject, timer };
      this.child.stdin.write(
        `${canonicalJson(message)}\n`,
        "ascii",
        (error) => {
          if (error !== null && error !== undefined) this.fail(error);
        },
      );
    });
  }

  async search(
    request: Readonly<FloodgateStableWasmSearchRequest>,
  ): Promise<Readonly<FloodgateBoundedStableWasmWorkerResultV3>> {
    const requestPayload = frozen({
      board: request.board,
      cooperative_deadline_ms:
        FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3,
      hands: request.hands,
      index: request.index,
      root_tesu: request.root_tesu,
      schema: FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SCHEMA_V3,
      side_to_move: request.side_to_move,
      type: "search" as const,
    });
    const requestDigest = sha256(
      `${REQUEST_DIGEST_DOMAIN}${canonicalJson(requestPayload)}`,
    );
    let response: Readonly<Record<string, unknown>>;
    try {
      response = await this.request(
        { ...requestPayload, request_sha256: requestDigest },
        FLOODGATE_BOUNDED_STABLE_WASM_OUTER_WATCHDOG_MS_V3,
        true,
      );
    } catch (error) {
      if (error instanceof OuterWatchdogError) {
        return frozen({
          outcome: "omitted",
          reason: "outer-watchdog",
          completed_depth: null,
        });
      }
      throw error;
    }
    if (
      response.schema !== FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SCHEMA_V3 ||
      response.type !== "result" ||
      response.request_sha256 !== requestDigest ||
      response.partial_result_adopted !== false
    ) {
      throw new Error("bounded stable worker result binding mismatch");
    }
    if (response.outcome === "omitted") {
      if (
        response.deadline_ms !==
          FLOODGATE_BOUNDED_STABLE_WASM_SEARCH_BUDGET_MS_V3 ||
        response.worker_replacement_required !== true ||
        !Number.isSafeInteger(response.completed_depth) ||
        (response.completed_depth as number) < 0 ||
        (response.completed_depth as number) >=
          FLOODGATE_STABLE_REQUESTED_DEPTH ||
        "packed_move" in response ||
        "raw_search_score" in response ||
        "nodes" in response ||
        "leaves" in response
      ) {
        throw new Error(
          "bounded stable omission leaked or adopted partial data",
        );
      }
      return frozen({
        outcome: "omitted",
        reason: "cooperative-deadline",
        completed_depth: response.completed_depth as number,
      });
    }
    if (response.outcome !== "proposal") {
      throw new Error("bounded stable worker outcome is invalid");
    }
    return frozen({
      outcome: "proposal",
      index: response.index as number,
      packed_move: response.packed_move as number,
      raw_search_score: response.raw_search_score as number,
      completed_depth: response.completed_depth as number,
      nodes: response.nodes as number,
      leaves: response.leaves as number,
    });
  }

  async close(force: boolean): Promise<void> {
    if (this.closed) return;
    if (force) this.child.kill("SIGKILL");
    else this.child.stdin.end();
    await Promise.race([
      this.closePromise,
      new Promise<void>((_resolve, reject) =>
        setTimeout(
          () => reject(new Error("bounded stable worker close timeout")),
          FLOODGATE_BOUNDED_STABLE_WASM_CLOSE_TIMEOUT_MS_V3,
        ),
      ),
    ]);
  }
}

function productionWorkerSource(): Uint8Array {
  const bytes = readFileSync(
    new URL("./floodgate-bounded-stable-wasm-worker-v3.mjs", import.meta.url),
  );
  if (
    bytes.byteLength !== FLOODGATE_BOUNDED_STABLE_WASM_WORKER_BYTES_V3 ||
    sha256(bytes) !== FLOODGATE_BOUNDED_STABLE_WASM_WORKER_SHA256_V3
  ) {
    bytes.fill(0);
    throw new Error("bounded stable worker source identity mismatch");
  }
  return bytes;
}

export function createFloodgateBoundedStableWasmRuntimeV3(): Promise<
  Readonly<FloodgateBoundedStableWasmRuntimeV3>
> {
  if (arguments.length !== 0) {
    return Promise.reject(
      new Error("bounded stable production runtime accepts no arguments"),
    );
  }
  return withVerifiedPinnedFloodgateProductionStableRuntimeAssets(
    async (authorityAssets) => {
      const authorityDigest = sha256(canonicalJson(authorityAssets.receipt));
      const factory: FloodgateBoundedStableWasmWorkerFactoryV3 = frozen({
        create: () =>
          withVerifiedPinnedFloodgateProductionStableRuntimeAssets(
            async (freshAssets) => {
              if (
                sha256(canonicalJson(freshAssets.receipt)) !== authorityDigest
              ) {
                throw new Error(
                  "bounded stable replacement authority receipt drifted",
                );
              }
              const source = productionWorkerSource();
              try {
                return await ProductionWorkerLane.create(
                  {
                    wasm: freshAssets.bytes.wasm,
                    weights: freshAssets.bytes.weights,
                  },
                  source,
                );
              } finally {
                source.fill(0);
              }
            },
          ),
      });
      return createRuntime(
        {
          assetAuthorityReceiptSha256: authorityDigest,
          workers: FLOODGATE_BOUNDED_STABLE_WASM_WORKERS_V3,
          queueBound: FLOODGATE_BOUNDED_STABLE_WASM_QUEUE_BOUND_V3,
          workerFactory: factory,
        },
        "production-pinned-asset-authority",
      );
    },
  );
}
