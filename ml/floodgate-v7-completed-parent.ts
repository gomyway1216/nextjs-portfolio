/**
 * Pure validation and compact capture of one completed Floodgate v7 parent.
 *
 * The function in this module authenticates nothing.  A future coordinator
 * must own the production runtime capabilities and must pass the raw inputs to
 * this core before it HMAC-binds the returned projection.  Persisting the
 * projection or its digest alone does not prove runtime origin or create a
 * teacher label.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
  type FloodgateProductionStableWasmRuntimeBinding,
  type FloodgateProductionStableWasmRuntimeResult,
} from "./floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY,
  FLOODGATE_PRODUCTION_TEACHER_RUNTIME,
} from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  type FloodgateProductionTeacherRescoreResult,
} from "./floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  type FloodgateStableWasmProposalRow,
} from "./floodgate-stable-wasm-proposer";
import {
  FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY,
  FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS,
  FLOODGATE_V7_CANDIDATE_UNION_SCHEMA,
  FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
  FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
  type FloodgateV7CandidateUnionReceipt,
  type FloodgateV7PendingCandidate,
} from "./floodgate-v7-candidate-union";
import { toSfen } from "./generate-teacher";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { positionKeyFromSfen } from "./sibling-data";
import { MAX_NON_MATE_CP, mateToCp } from "./usi-multipv";

export const FLOODGATE_V7_COMPLETED_PARENT_SCHEMA =
  "shogi-floodgate-v7-completed-parent-v1" as const;
export const FLOODGATE_V7_COMPLETED_PARENT_STATUS =
  "validated-compact-complete-parent-evidence-no-label" as const;
export const FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY =
  "pure-structural-test-core-unauthenticated-not-teacher-label-training-holdout-or-playing-strength-evidence" as const;

const COMPLETED_PARENT_DIGEST_DOMAIN =
  "shogi-floodgate-v7-completed-parent-v1\0";
const COMPLETED_STABLE_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-v7-completed-parent-stable-row-v1\0";
const PRODUCTION_STABLE_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-row-v1\0";
const CANDIDATE_UNION_STABLE_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-v7-stable-row-v1\0";
const CANDIDATE_UNION_DIGEST_DOMAIN = "shogi-floodgate-v7-candidate-union-v1\0";
const LEGAL_MOVES_DIGEST_DOMAIN = "shogi-floodgate-v7-legal-moves-v1\0";
const TEACHER_RUNTIME_RECEIPT_DIGEST_DOMAIN =
  "shogi-floodgate-v7-runtime-receipt-v1\0";
const PROPOSAL_ROOT_MOVES_DIGEST_DOMAIN =
  "shogi-floodgate-v7-proposal-root-moves-v1\0";
const STABLE_PARENT_DIGEST_DOMAIN = "shogi-floodgate-stable-parent-v1\0";
const RESCORE_PV_DIGEST_DOMAIN =
  "shogi-floodgate-v7-independent-rescore-pv-v1\0";
const RESCORE_RESULT_DIGEST_DOMAIN =
  "shogi-floodgate-v7-independent-rescore-result-v1\0";

const SHA256_RE = /^[0-9a-f]{64}$/;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/;
const CANONICAL_USI_MOVE_RE =
  /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/;
const MAX_CANDIDATES = 14;
const MAX_PV_MOVES = 16_384;
const MAX_CAPTURE_DEPTH = 24;
const MAX_CAPTURE_ENTRIES = 100_000;

const PARENT_KEYS = Object.freeze([
  "game_id",
  "parent_id",
  "parent_payload_sha256",
  "parent_sfen",
  "ply",
  "position_id",
] as const);
const LEGAL_KEYS = Object.freeze([
  "caller_evidence_cross_checked",
  "count",
  "moves_sha256",
  "source",
] as const);
const STABLE_ROW_KEYS = Object.freeze([
  "child_position_id",
  "child_sfen",
  "game_id",
  "parent_id",
  "parent_payload_sha256",
  "position_id",
  "schema",
  "search",
  "stable_move",
] as const);
const STABLE_SEARCH_KEYS = Object.freeze([
  "completed_depth",
  "leaves",
  "nodes",
  "raw_search_score",
  "requested_depth",
  "root_tesu",
  "score_encoding",
  "termination",
] as const);
const STABLE_RUNTIME_RESULT_KEYS = Object.freeze([
  "row",
  "runtime_binding",
  "schema",
] as const);
const STABLE_RUNTIME_BINDING_KEYS = Object.freeze([
  "claim_boundary",
  "execution_boundary",
  "origin",
  "parent_payload_sha256",
  "plain_result_authentication_claim",
  "reusable_pool_receipt_sha256",
  "row_sha256",
  "runtime_receipt_sha256",
] as const);
const UNION_STABLE_BINDING_KEYS = Object.freeze([
  "parent_payload_sha256",
  "plain_object_stable_authentication_claim",
  "schema",
  "stable_move",
  "stable_row_sha256",
] as const);
const CANDIDATE_KEYS = Object.freeze([
  "child_position_id",
  "child_sfen",
  "independent_rescore",
  "move",
  "proposal_rank",
  "provenance",
] as const);
const PROVENANCE_KEYS = Object.freeze([
  "production_proposal",
  "stable_policy",
  "strong_game_played",
] as const);
const PENDING_UNION_KEYS = Object.freeze([
  "candidate_union_sha256",
  "candidates",
  "claim_boundary",
  "completion",
  "input_authentication_claim",
  "legal",
  "parent",
  "runtime_binding",
  "schema",
  "stable_binding",
  "status",
] as const);
const SKIP_UNION_KEYS = Object.freeze([
  "candidate_union_sha256",
  "candidates",
  "claim_boundary",
  "input_authentication_claim",
  "legal",
  "parent",
  "runtime_binding",
  "schema",
  "skip",
  "stable_binding",
  "status",
] as const);
const PENDING_COMPLETION_KEYS = Object.freeze([
  "independent_rescores_completed",
  "independent_rescores_required",
  "state",
  "teacher_labels_emitted",
] as const);
const SKIP_KEYS = Object.freeze([
  "forced_move",
  "independent_rescore_required",
  "played_move_matches_forced_move",
  "proposal_search_performed",
  "reason",
  "stable_move_matches_forced_move",
  "teacher_labels_emitted",
] as const);
const TEACHER_RUNTIME_BINDING_KEYS = Object.freeze([
  "proposal",
  "receipt",
] as const);
const TEACHER_RECEIPT_BINDING_KEYS = Object.freeze([
  "asset_authority_execution_boundary",
  "claim_boundary",
  "contract",
  "engine_id",
  "execution_boundary",
  "fixed_options",
  "plain_object_production_authentication_claim",
  "runtime",
  "runtime_receipt_sha256",
  "snapshot",
  "status",
] as const);
const TEACHER_RECEIPT_RUNTIME_KEYS = Object.freeze([
  "depth",
  "engine_count",
  "fv_scale",
  "hash_mb_per_engine",
  "independent_rescore_multipv",
  "proposal_multipv_max",
  "threads_per_engine",
] as const);
const TEACHER_RECEIPT_SNAPSHOT_KEYS = Object.freeze([
  "engine",
  "eval",
] as const);
const TEACHER_RECEIPT_SNAPSHOT_FILE_KEYS = Object.freeze([
  "bytes",
  "mode",
  "sha256",
] as const);
const TEACHER_PROPOSAL_BINDING_KEYS = Object.freeze([
  "bestmove",
  "depth",
  "line_count",
  "observed_nodes",
  "proposal_result_sha256",
  "requested_multipv",
  "reset_before_search",
  "result_authentication_claim",
  "root_moves_sha256",
] as const);
const RESCORE_RESULT_KEYS = Object.freeze([
  "bestmove",
  "depth",
  "lines",
  "observedNodes",
  "requested_multipv",
  "reset_before_search",
  "searchmoves",
] as const);
const RESCORE_CP_LINE_KEYS = Object.freeze([
  "cp",
  "depth",
  "move",
  "multipv",
  "nodes",
  "pv",
  "scoreKind",
] as const);
const RESCORE_MATE_LINE_KEYS = Object.freeze([
  ...RESCORE_CP_LINE_KEYS,
  "mate",
  "mateSign",
] as const);
const INPUT_KEYS = Object.freeze([
  "rescores",
  "stable_runtime",
  "union",
] as const);
const COMPLETED_EVIDENCE_KEYS = Object.freeze([
  "candidate_union",
  "claim_boundary",
  "completed_parent_sha256",
  "completion",
  "input_authentication_claim",
  "legal",
  "parent",
  "rescores",
  "schema",
  "stable",
  "stable_runtime_binding",
  "status",
  "strong_game_played_move",
  "teacher_proposal_runtime_binding",
] as const);
const COMPLETED_STABLE_KEYS = Object.freeze([
  "candidate_union_row_sha256",
  "completed_parent_row_sha256",
  "production_runtime_row_sha256",
  "row",
] as const);
const COMPLETED_CANDIDATE_UNION_KEYS = Object.freeze([
  "candidates",
  "schema",
  "sha256",
  "status",
] as const);
const COMPLETED_TEACHER_PROPOSAL_KEYS = Object.freeze([
  "bestmove",
  "depth",
  "line_count",
  "observed_nodes",
  "proposal_result_sha256",
  "requested_multipv",
  "reset_before_search",
  "root_moves_sha256",
  "runtime_receipt_sha256",
] as const);
const COMPLETED_RESCORE_KEYS = Object.freeze([
  "candidate_index",
  "child_position_id",
  "child_sfen",
  "completion",
  "depth",
  "move",
  "nodes",
  "observed_nodes",
  "pv",
  "requested_multipv",
  "reset_before_search",
  "result_sha256",
  "score",
  "searchmoves",
] as const);
const COMPLETED_RESCORE_PV_KEYS = Object.freeze(["moves", "sha256"] as const);
const COMPLETED_RESCORE_CP_SCORE_KEYS = Object.freeze(["cp", "kind"] as const);
const COMPLETED_RESCORE_MATE_SCORE_KEYS = Object.freeze([
  "cp",
  "kind",
  "mate_distance",
  "mate_sign",
] as const);
const COMPLETED_COMPLETION_KEYS = Object.freeze([
  "candidates",
  "independent_rescores_completed",
  "independent_rescores_required",
  "state",
  "teacher_labels_emitted",
] as const);

const FIXED_TEACHER_OPTIONS = Object.freeze([
  "EvalDir=<private-shared-snapshot>/eval",
  "FV_SCALE=20",
  "USI_Hash=64",
  "Threads=1",
  "USI_OwnBook=false",
  "BookFile=no_book",
  "NetworkDelay=0",
  "NetworkDelay2=0",
] as const);

interface ParentProjection {
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
  readonly parent_payload_sha256: string;
}

interface LegalProjection {
  readonly source: "core-rederived-rules-complete-legal-moves-v1";
  readonly caller_evidence_cross_checked: true;
  readonly count: number;
  readonly moves_sha256: string;
}

export interface FloodgateV7CompletedRescoreEvidence {
  readonly candidate_index: number;
  readonly move: string;
  readonly child_sfen: string;
  readonly child_position_id: string;
  readonly depth: number;
  readonly completion:
    | "requested-depth-complete"
    | "exact-terminal-mate-before-requested-depth";
  readonly score: Readonly<
    | { readonly kind: "cp"; readonly cp: number }
    | {
        readonly kind: "mate";
        readonly cp: number;
        readonly mate_distance: number;
        readonly mate_sign: 1 | -1;
      }
  >;
  readonly nodes: number;
  readonly observed_nodes: number;
  readonly pv: Readonly<{
    readonly moves: number;
    readonly sha256: string;
  }>;
  readonly result_sha256: string;
  readonly requested_multipv: 1;
  readonly searchmoves: readonly [string];
  readonly reset_before_search: true;
}

export interface FloodgateV7CompletedParentInput {
  readonly union: Readonly<FloodgateV7CandidateUnionReceipt>;
  readonly stable_runtime: Readonly<
    FloodgateProductionStableWasmRuntimeResult<"production-fixed-asset-authority-and-reusable-pool">
  >;
  readonly rescores: readonly Readonly<FloodgateProductionTeacherRescoreResult>[];
}

export interface FloodgateV7CompletedParentEvidence {
  readonly schema: typeof FLOODGATE_V7_COMPLETED_PARENT_SCHEMA;
  readonly status: typeof FLOODGATE_V7_COMPLETED_PARENT_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY;
  readonly input_authentication_claim: false;
  readonly parent: Readonly<ParentProjection>;
  readonly strong_game_played_move: string;
  readonly legal: Readonly<LegalProjection>;
  readonly stable: Readonly<{
    readonly row: Readonly<FloodgateStableWasmProposalRow>;
    readonly completed_parent_row_sha256: string;
    readonly candidate_union_row_sha256: string;
    readonly production_runtime_row_sha256: string;
  }>;
  readonly stable_runtime_binding: Readonly<
    FloodgateProductionStableWasmRuntimeBinding<"production-fixed-asset-authority-and-reusable-pool">
  >;
  readonly teacher_proposal_runtime_binding: Readonly<{
    readonly runtime_receipt_sha256: string;
    readonly proposal_result_sha256: string;
    readonly root_moves_sha256: string;
    readonly requested_multipv: number;
    readonly depth: number;
    readonly line_count: number;
    readonly bestmove: string;
    readonly observed_nodes: number;
    readonly reset_before_search: true;
  }> | null;
  readonly candidate_union: Readonly<{
    readonly schema: typeof FLOODGATE_V7_CANDIDATE_UNION_SCHEMA;
    readonly status:
      | typeof FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
      | typeof FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS;
    readonly sha256: string;
    readonly candidates: readonly Readonly<FloodgateV7PendingCandidate>[];
  }>;
  readonly rescores: readonly Readonly<FloodgateV7CompletedRescoreEvidence>[];
  readonly completion: Readonly<{
    readonly state: "complete" | "forced-parent-skip";
    readonly candidates: number;
    readonly independent_rescores_required: number;
    readonly independent_rescores_completed: number;
    readonly teacher_labels_emitted: 0;
  }>;
  readonly completed_parent_sha256: string;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate v7 completed parent: ${message}`);
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value)
  ) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (!isPlainRecord(value)) fail(`${label} must be a plain non-Proxy object`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.includes(key))
  ) {
    fail(`${label} has an unexpected key set`);
  }
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable own data property`);
    }
    output[key] = descriptor.value;
  }
  return Object.freeze(output);
}

function strictArray(
  value: unknown,
  maximum: number,
  label: string,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(`${label} must be an ordinary non-Proxy array`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const length = descriptors.length;
  if (
    length === undefined ||
    !("value" in length) ||
    !Number.isSafeInteger(length.value) ||
    length.value < 0 ||
    length.value > maximum
  ) {
    fail(`${label} length is outside the safety bound`);
  }
  const count = length.value as number;
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.length !== count + 1 ||
    keys.some((key) =>
      typeof key !== "string"
        ? true
        : key !== "length" && !/^(?:0|[1-9][0-9]*)$/.test(key),
    )
  ) {
    fail(`${label} must be dense and have no extra keys`);
  }
  const output: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}[${index}] must be an enumerable own data property`);
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  const output = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(value)) {
    output[key] = (value as Record<string, unknown>)[key];
  }
  return Object.freeze(output) as Readonly<T>;
}

function frozenList<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function canonicalJson(value: unknown, depth = 0): string {
  if (depth > MAX_CAPTURE_DEPTH) fail("canonical JSON nesting is too deep");
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      fail("canonical JSON rejects invalid numbers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${strictArray(value, MAX_CAPTURE_ENTRIES, "canonical JSON array")
      .map((entry) => canonicalJson(entry, depth + 1))
      .join(",")}]`;
  }
  if (!isPlainRecord(value)) fail("canonical JSON rejects non-plain objects");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail("canonical JSON rejects symbol keys");
  }
  return `{${(keys as string[])
    .sort(compareBytewise)
    .map((key) => {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !("value" in descriptor) ||
        descriptor.enumerable !== true
      ) {
        fail(`canonical JSON property ${key} is not enumerable data`);
      }
      return `${JSON.stringify(key)}:${canonicalJson(descriptor.value, depth + 1)}`;
    })
    .join(",")}}`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256(`${domain}${canonicalJson(value)}`);
}

function digestLines(domain: string, values: readonly string[]): string {
  return sha256(`${domain}${values.join("\n")}\n`);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} is not the fixed value`);
}

function safeInteger(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    fail(`${label} is outside the supported integer range`);
  }
  return value as number;
}

function canonicalSafeInteger(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const integer = safeInteger(value, label, minimum, maximum);
  return Object.is(integer, -0) ? 0 : integer;
}

function sha256String(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    fail(`${label} is not a lowercase SHA-256 digest`);
  }
  return value;
}

function semanticId(value: unknown, label: string): string {
  if (typeof value !== "string" || !SEMANTIC_ID_RE.test(value)) {
    fail(`${label} is not a semantic identifier`);
  }
  return value;
}

function canonicalMove(value: unknown, label: string): string {
  if (typeof value !== "string" || !CANONICAL_USI_MOVE_RE.test(value)) {
    fail(`${label} is not a canonical USI move`);
  }
  return value;
}

function boundedString(value: unknown, label: string, bytes = 4_096): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    Buffer.byteLength(value, "utf8") > bytes ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail(`${label} is not a bounded control-free string`);
  }
  return value;
}

function captureParent(value: unknown): Readonly<ParentProjection> {
  const parent = strictRecord(value, PARENT_KEYS, "union.parent");
  const gameId = semanticId(parent.game_id, "union.parent.game_id");
  const parentId = semanticId(parent.parent_id, "union.parent.parent_id");
  const positionId = semanticId(parent.position_id, "union.parent.position_id");
  const parentSfen = boundedString(
    parent.parent_sfen,
    "union.parent.parent_sfen",
  );
  const ply = canonicalSafeInteger(
    parent.ply,
    "union.parent.ply",
    0,
    2_147_483_647,
  );
  const payloadSha256 = sha256String(
    parent.parent_payload_sha256,
    "union.parent.parent_payload_sha256",
  );
  return frozenRecord({
    game_id: gameId,
    parent_id: parentId,
    position_id: positionId,
    parent_sfen: parentSfen,
    ply,
    parent_payload_sha256: payloadSha256,
  });
}

function captureLegal(
  value: unknown,
  parent: Readonly<ParentProjection>,
): Readonly<LegalProjection> {
  const legal = strictRecord(value, LEGAL_KEYS, "union.legal");
  exact(
    legal.source,
    "core-rederived-rules-complete-legal-moves-v1",
    "union.legal.source",
  );
  exact(
    legal.caller_evidence_cross_checked,
    true,
    "union.legal.caller_evidence_cross_checked",
  );
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(parent.parent_sfen);
  } catch {
    fail("union.parent.parent_sfen is invalid");
  }
  if (
    toSfen(parsed.position, parsed.moveNumber) !== parent.parent_sfen ||
    parsed.moveNumber !== parent.ply + 1 ||
    positionKeyFromSfen(parent.parent_sfen) !== parent.position_id
  ) {
    fail("union parent SFEN, ply, or position identity is inconsistent");
  }
  const derivedEntries = rulesCompleteLegalMoves(parsed.position);
  if (derivedEntries.some((entry) => getKomashu(entry.move.capture) === OU)) {
    fail("rules-complete legal move set attempts to capture the opposing king");
  }
  const derivedMoves = derivedEntries
    .map((entry) => entry.usi)
    .sort(compareBytewise);
  if (
    derivedMoves.length < 1 ||
    derivedMoves.length > 593 ||
    new Set(derivedMoves).size !== derivedMoves.length
  ) {
    fail("rules-complete legal move set is outside the supported domain");
  }
  const count = safeInteger(legal.count, "union.legal.count", 1, 593);
  exact(count, derivedMoves.length, "union.legal.count");
  const movesSha256 = sha256String(
    legal.moves_sha256,
    "union.legal.moves_sha256",
  );
  exact(
    movesSha256,
    digestLines(LEGAL_MOVES_DIGEST_DOMAIN, derivedMoves),
    "union.legal.moves_sha256",
  );
  return frozenRecord({
    source: "core-rederived-rules-complete-legal-moves-v1" as const,
    caller_evidence_cross_checked: true as const,
    count,
    moves_sha256: movesSha256,
  });
}

function captureCandidates(
  value: unknown,
  parent: Readonly<ParentProjection>,
): readonly Readonly<FloodgateV7PendingCandidate>[] {
  const values = strictArray(value, MAX_CANDIDATES, "union.candidates");
  const candidates: Readonly<FloodgateV7PendingCandidate>[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const candidate = strictRecord(
      values[index],
      CANDIDATE_KEYS,
      `union.candidates[${index}]`,
    );
    const move = canonicalMove(
      candidate.move,
      `union.candidates[${index}].move`,
    );
    if (index > 0 && compareBytewise(candidates[index - 1].move, move) >= 0) {
      fail("union candidates are not unique UTF-8-bytewise ascending moves");
    }
    let childSfen: string;
    try {
      childSfen = childSfenAfterUsi(parent.parent_sfen, move);
    } catch {
      fail(`union.candidates[${index}] is not legal`);
    }
    exact(
      candidate.child_sfen,
      childSfen,
      `union.candidates[${index}].child_sfen`,
    );
    const childPositionId = semanticId(
      candidate.child_position_id,
      `union.candidates[${index}].child_position_id`,
    );
    exact(
      childPositionId,
      positionKeyFromSfen(childSfen),
      `union.candidates[${index}].child_position_id`,
    );
    const proposalRank =
      candidate.proposal_rank === null
        ? null
        : safeInteger(
            candidate.proposal_rank,
            `union.candidates[${index}].proposal_rank`,
            1,
            12,
          );
    const provenance = strictRecord(
      candidate.provenance,
      PROVENANCE_KEYS,
      `union.candidates[${index}].provenance`,
    );
    if (
      typeof provenance.production_proposal !== "boolean" ||
      typeof provenance.strong_game_played !== "boolean" ||
      typeof provenance.stable_policy !== "boolean" ||
      provenance.production_proposal !== (proposalRank !== null)
    ) {
      fail(`union.candidates[${index}] provenance is inconsistent`);
    }
    exact(
      candidate.independent_rescore,
      "required-not-yet-run",
      `union.candidates[${index}].independent_rescore`,
    );
    candidates.push(
      frozenRecord({
        move,
        child_sfen: childSfen,
        child_position_id: childPositionId,
        proposal_rank: proposalRank,
        provenance: frozenRecord({
          production_proposal: provenance.production_proposal as boolean,
          strong_game_played: provenance.strong_game_played as boolean,
          stable_policy: provenance.stable_policy as boolean,
        }),
        independent_rescore: "required-not-yet-run" as const,
      }),
    );
  }
  return frozenList(candidates);
}

function validateStrongGameParentBinding(
  parent: Readonly<ParentProjection>,
  playedMove: string,
): void {
  exact(
    parent.parent_id,
    `sha256:${sha256(
      `parent-occurrence-v1\0${parent.game_id}\0${parent.ply}`,
    )}`,
    "union.parent.parent_id",
  );
  const payload = frozenRecord({
    schema_version: 1 as const,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_sfen: parent.parent_sfen,
    ply: parent.ply,
    played_move: playedMove,
  });
  exact(
    parent.parent_payload_sha256,
    digestCanonical(STABLE_PARENT_DIGEST_DOMAIN, payload),
    "union.parent.parent_payload_sha256",
  );
}

function validatePendingCandidateSemantics(
  candidates: readonly Readonly<FloodgateV7PendingCandidate>[],
  stableMove: string,
  legalCount: number,
): Readonly<{
  readonly strongGamePlayedMove: string;
  readonly proposalMoves: readonly string[];
  readonly requested: number;
}> {
  const requested = Math.min(
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
    legalCount,
  );
  if (
    candidates.length < requested ||
    candidates.length > Math.min(legalCount, requested + 2)
  ) {
    fail(
      "union candidate count is outside proposal-plus-played-plus-stable bounds",
    );
  }
  if (
    candidates.some(
      (candidate) =>
        !candidate.provenance.production_proposal &&
        !candidate.provenance.strong_game_played &&
        !candidate.provenance.stable_policy,
    )
  ) {
    fail("union candidate has no provenance source");
  }
  const stableCandidates = candidates.filter(
    (candidate) => candidate.provenance.stable_policy,
  );
  const playedCandidates = candidates.filter(
    (candidate) => candidate.provenance.strong_game_played,
  );
  if (
    stableCandidates.length !== 1 ||
    stableCandidates[0].move !== stableMove ||
    playedCandidates.length !== 1
  ) {
    fail("union stable/played provenance is not exactly one candidate each");
  }
  const proposalCandidates = candidates
    .filter((candidate) => candidate.proposal_rank !== null)
    .sort(
      (left, right) =>
        (left.proposal_rank as number) - (right.proposal_rank as number),
    );
  if (
    proposalCandidates.length !== requested ||
    proposalCandidates.some(
      (candidate, index) => candidate.proposal_rank !== index + 1,
    )
  ) {
    fail("union proposal ranks are not dense and complete");
  }
  return frozenRecord({
    strongGamePlayedMove: playedCandidates[0].move,
    proposalMoves: frozenList(
      proposalCandidates.map((candidate) => candidate.move),
    ),
    requested,
  });
}

interface CapturedUnion {
  readonly status:
    | typeof FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
    | typeof FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS;
  readonly parent: Readonly<ParentProjection>;
  readonly legal: Readonly<LegalProjection>;
  readonly stableBinding: Readonly<{
    readonly parent_payload_sha256: string;
    readonly stable_move: string;
    readonly stable_row_sha256: string;
  }>;
  readonly candidates: readonly Readonly<FloodgateV7PendingCandidate>[];
  readonly candidateUnionSha256: string;
  readonly teacherProposalBinding: FloodgateV7CompletedParentEvidence["teacher_proposal_runtime_binding"];
  readonly forcedMove: string | null;
  readonly strongGamePlayedMove: string;
}

function captureTeacherProposalBinding(
  value: unknown,
  legalCount: number,
  candidates: readonly Readonly<FloodgateV7PendingCandidate>[],
): NonNullable<
  FloodgateV7CompletedParentEvidence["teacher_proposal_runtime_binding"]
> {
  const binding = strictRecord(
    value,
    TEACHER_RUNTIME_BINDING_KEYS,
    "union.runtime_binding",
  );
  const receipt = strictRecord(
    binding.receipt,
    TEACHER_RECEIPT_BINDING_KEYS,
    "union.runtime_binding.receipt",
  );
  const suppliedRuntimeReceiptSha256 = sha256String(
    receipt.runtime_receipt_sha256,
    "union.runtime_binding.receipt.runtime_receipt_sha256",
  );
  exact(
    receipt.contract,
    FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    "union.runtime_binding.receipt.contract",
  );
  exact(
    receipt.status,
    FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    "union.runtime_binding.receipt.status",
  );
  exact(
    receipt.claim_boundary,
    FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    "union.runtime_binding.receipt.claim_boundary",
  );
  exact(
    receipt.execution_boundary,
    "production-fixed-assets-and-runtime-dependencies",
    "union.runtime_binding.receipt.execution_boundary",
  );
  exact(
    receipt.asset_authority_execution_boundary,
    "production-fixed-registry-and-deployment-root",
    "union.runtime_binding.receipt.asset_authority_execution_boundary",
  );
  exact(
    receipt.plain_object_production_authentication_claim,
    false,
    "union.runtime_binding.receipt.plain_object_production_authentication_claim",
  );
  exact(
    receipt.engine_id,
    FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    "union.runtime_binding.receipt.engine_id",
  );
  const runtime = strictRecord(
    receipt.runtime,
    TEACHER_RECEIPT_RUNTIME_KEYS,
    "union.runtime_binding.receipt.runtime",
  );
  exact(
    runtime.depth,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
    "union.runtime_binding.receipt.runtime.depth",
  );
  exact(
    runtime.proposal_multipv_max,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
    "union.runtime_binding.receipt.runtime.proposal_multipv_max",
  );
  exact(
    runtime.independent_rescore_multipv,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.multipv,
    "union.runtime_binding.receipt.runtime.independent_rescore_multipv",
  );
  exact(
    runtime.engine_count,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
    "union.runtime_binding.receipt.runtime.engine_count",
  );
  exact(
    runtime.threads_per_engine,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.threads_per_engine,
    "union.runtime_binding.receipt.runtime.threads_per_engine",
  );
  exact(
    runtime.hash_mb_per_engine,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine,
    "union.runtime_binding.receipt.runtime.hash_mb_per_engine",
  );
  exact(runtime.fv_scale, 20, "union.runtime_binding.receipt.runtime.fv_scale");
  const fixedOptions = strictArray(
    receipt.fixed_options,
    FIXED_TEACHER_OPTIONS.length,
    "union.runtime_binding.receipt.fixed_options",
  );
  if (
    fixedOptions.length !== FIXED_TEACHER_OPTIONS.length ||
    fixedOptions.some(
      (option, index) => option !== FIXED_TEACHER_OPTIONS[index],
    )
  ) {
    fail("union.runtime_binding.receipt.fixed_options is not pinned");
  }
  const snapshot = strictRecord(
    receipt.snapshot,
    TEACHER_RECEIPT_SNAPSHOT_KEYS,
    "union.runtime_binding.receipt.snapshot",
  );
  const capturedSnapshot: Record<
    "engine" | "eval",
    Readonly<Record<string, unknown>>
  > = Object.create(null) as Record<
    "engine" | "eval",
    Readonly<Record<string, unknown>>
  >;
  for (const key of TEACHER_RECEIPT_SNAPSHOT_KEYS) {
    const file = strictRecord(
      snapshot[key],
      TEACHER_RECEIPT_SNAPSHOT_FILE_KEYS,
      `union.runtime_binding.receipt.snapshot.${key}`,
    );
    safeInteger(
      file.bytes,
      `union.runtime_binding.receipt.snapshot.${key}.bytes`,
      1,
    );
    sha256String(
      file.sha256,
      `union.runtime_binding.receipt.snapshot.${key}.sha256`,
    );
    exact(
      file.mode,
      key === "engine" ? "0500" : "0400",
      `union.runtime_binding.receipt.snapshot.${key}.mode`,
    );
    const expectedIdentity =
      key === "engine"
        ? FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou
        : FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn;
    exact(
      file.bytes,
      expectedIdentity.bytes,
      `union.runtime_binding.receipt.snapshot.${key}.bytes`,
    );
    exact(
      file.sha256,
      expectedIdentity.sha256,
      `union.runtime_binding.receipt.snapshot.${key}.sha256`,
    );
    capturedSnapshot[key] = frozenRecord({
      bytes: file.bytes,
      sha256: file.sha256,
      mode: file.mode,
    });
  }
  const runtimeReceiptProjection = frozenRecord({
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary:
      "production-fixed-assets-and-runtime-dependencies" as const,
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root" as const,
    engine_id: FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    runtime: frozenRecord({
      engine_count: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
      threads_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.threads_per_engine,
      hash_mb_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine,
      fv_scale: 20 as const,
      depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      proposal_multipv_max:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
      independent_rescore_multipv:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.multipv,
      no_process_arguments: true as const,
      shell: false as const,
      minimal_environment: true as const,
      per_worker_private_directories: true as const,
      queue_bound: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines * 4,
    }),
    fixed_options: frozenList([...FIXED_TEACHER_OPTIONS]),
    timeouts: frozenRecord({
      usiMs: 15_000 as const,
      readyMs: 120_000 as const,
      searchMs: 600_000 as const,
      termGraceMs: 500 as const,
      killGraceMs: 1_000 as const,
    }),
    limits: frozenRecord({
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536 as const,
      stderrBytesTotal: 8 * 1024 * 1024,
    }),
    snapshot: frozenRecord({
      one_shared_private_snapshot: true as const,
      source_authority_revalidated: true as const,
      destination_revalidated: true as const,
      engine: capturedSnapshot.engine,
      eval: capturedSnapshot.eval,
    }),
  });
  const runtimeReceiptSha256 = digestCanonical(
    TEACHER_RUNTIME_RECEIPT_DIGEST_DOMAIN,
    runtimeReceiptProjection,
  );
  exact(
    suppliedRuntimeReceiptSha256,
    runtimeReceiptSha256,
    "union.runtime_binding.receipt.runtime_receipt_sha256",
  );

  const proposal = strictRecord(
    binding.proposal,
    TEACHER_PROPOSAL_BINDING_KEYS,
    "union.runtime_binding.proposal",
  );
  const requested = Math.min(
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
    legalCount,
  );
  exact(
    proposal.requested_multipv,
    requested,
    "union.runtime_binding.proposal.requested_multipv",
  );
  exact(
    proposal.depth,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
    "union.runtime_binding.proposal.depth",
  );
  exact(
    proposal.line_count,
    requested,
    "union.runtime_binding.proposal.line_count",
  );
  const bestmove = canonicalMove(
    proposal.bestmove,
    "union.runtime_binding.proposal.bestmove",
  );
  const rankOne = candidates.find((candidate) => candidate.proposal_rank === 1);
  if (rankOne?.move !== bestmove) {
    fail("union proposal bestmove is not candidate proposal rank 1");
  }
  const observedNodes = canonicalSafeInteger(
    proposal.observed_nodes,
    "union.runtime_binding.proposal.observed_nodes",
  );
  const proposalResultSha256 = sha256String(
    proposal.proposal_result_sha256,
    "union.runtime_binding.proposal.proposal_result_sha256",
  );
  const rootMovesSha256 = sha256String(
    proposal.root_moves_sha256,
    "union.runtime_binding.proposal.root_moves_sha256",
  );
  const proposalMoves = candidates
    .filter((candidate) => candidate.proposal_rank !== null)
    .sort(
      (left, right) =>
        (left.proposal_rank as number) - (right.proposal_rank as number),
    )
    .map((candidate) => candidate.move);
  exact(
    rootMovesSha256,
    digestLines(PROPOSAL_ROOT_MOVES_DIGEST_DOMAIN, proposalMoves),
    "union.runtime_binding.proposal.root_moves_sha256",
  );
  exact(
    proposal.reset_before_search,
    true,
    "union.runtime_binding.proposal.reset_before_search",
  );
  exact(
    proposal.result_authentication_claim,
    false,
    "union.runtime_binding.proposal.result_authentication_claim",
  );
  return frozenRecord({
    runtime_receipt_sha256: runtimeReceiptSha256,
    proposal_result_sha256: proposalResultSha256,
    root_moves_sha256: rootMovesSha256,
    requested_multipv: requested,
    depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
    line_count: requested,
    bestmove,
    observed_nodes: observedNodes,
    reset_before_search: true as const,
  });
}

function captureUnion(value: unknown): CapturedUnion {
  const preliminary = isPlainRecord(value)
    ? Object.getOwnPropertyDescriptor(value, "status")
    : undefined;
  if (
    preliminary === undefined ||
    !("value" in preliminary) ||
    preliminary.enumerable !== true
  ) {
    fail("union.status must be an enumerable own data property");
  }
  const pending =
    preliminary.value === FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS;
  const skipped =
    preliminary.value === FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS;
  if (!pending && !skipped) fail("union.status is unsupported");
  const union = strictRecord(
    value,
    pending ? PENDING_UNION_KEYS : SKIP_UNION_KEYS,
    "union",
  );
  exact(union.schema, FLOODGATE_V7_CANDIDATE_UNION_SCHEMA, "union.schema");
  exact(
    union.claim_boundary,
    FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY,
    "union.claim_boundary",
  );
  exact(
    union.input_authentication_claim,
    false,
    "union.input_authentication_claim",
  );
  const parent = captureParent(union.parent);
  const legal = captureLegal(union.legal, parent);
  const stable = strictRecord(
    union.stable_binding,
    UNION_STABLE_BINDING_KEYS,
    "union.stable_binding",
  );
  exact(
    stable.schema,
    FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    "union.stable_binding.schema",
  );
  exact(
    stable.parent_payload_sha256,
    parent.parent_payload_sha256,
    "union.stable_binding.parent_payload_sha256",
  );
  exact(
    stable.plain_object_stable_authentication_claim,
    false,
    "union.stable_binding.plain_object_stable_authentication_claim",
  );
  const stableMove = canonicalMove(
    stable.stable_move,
    "union.stable_binding.stable_move",
  );
  const stableRowSha256 = sha256String(
    stable.stable_row_sha256,
    "union.stable_binding.stable_row_sha256",
  );
  const candidates = captureCandidates(union.candidates, parent);
  const candidateUnionSha256 = sha256String(
    union.candidate_union_sha256,
    "union.candidate_union_sha256",
  );
  const stableBinding = frozenRecord({
    parent_payload_sha256: parent.parent_payload_sha256,
    stable_move: stableMove,
    stable_row_sha256: stableRowSha256,
  });

  if (pending) {
    if (legal.count < 2 || candidates.length < 2) {
      fail("pending union requires at least two legal moves and candidates");
    }
    const completion = strictRecord(
      union.completion,
      PENDING_COMPLETION_KEYS,
      "union.completion",
    );
    exact(completion.state, "incomplete", "union.completion.state");
    exact(
      completion.independent_rescores_required,
      candidates.length,
      "union.completion.independent_rescores_required",
    );
    exact(
      completion.independent_rescores_completed,
      0,
      "union.completion.independent_rescores_completed",
    );
    exact(
      completion.teacher_labels_emitted,
      0,
      "union.completion.teacher_labels_emitted",
    );
    const candidateSemantics = validatePendingCandidateSemantics(
      candidates,
      stableMove,
      legal.count,
    );
    const strongGamePlayedMove = candidateSemantics.strongGamePlayedMove;
    validateStrongGameParentBinding(parent, strongGamePlayedMove);
    const teacherProposalBinding = captureTeacherProposalBinding(
      union.runtime_binding,
      legal.count,
      candidates,
    );
    const expectedDigest = digestCanonical(
      CANDIDATE_UNION_DIGEST_DOMAIN,
      frozenRecord({
        parent_id: parent.parent_id,
        parent_payload_sha256: parent.parent_payload_sha256,
        legal_moves_sha256: legal.moves_sha256,
        stable_row_sha256: stableRowSha256,
        runtime_receipt_sha256: teacherProposalBinding.runtime_receipt_sha256,
        proposal_result_sha256: teacherProposalBinding.proposal_result_sha256,
        state: "awaiting-independent-rescores" as const,
        candidates,
      }),
    );
    exact(candidateUnionSha256, expectedDigest, "union.candidate_union_sha256");
    return frozenRecord({
      status: FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS,
      parent,
      legal,
      stableBinding,
      candidates,
      candidateUnionSha256,
      teacherProposalBinding,
      forcedMove: null,
      strongGamePlayedMove,
    });
  }

  if (
    legal.count !== 1 ||
    candidates.length !== 0 ||
    union.runtime_binding !== null
  ) {
    fail(
      "forced union must have one legal move, no candidates, and no USI binding",
    );
  }
  const skip = strictRecord(union.skip, SKIP_KEYS, "union.skip");
  exact(
    skip.reason,
    "fewer-than-two-rules-complete-legal-moves",
    "union.skip.reason",
  );
  const forcedMove = canonicalMove(skip.forced_move, "union.skip.forced_move");
  exact(forcedMove, stableMove, "union.skip.forced_move");
  exact(
    skip.played_move_matches_forced_move,
    true,
    "union.skip.played_move_matches_forced_move",
  );
  exact(
    skip.stable_move_matches_forced_move,
    true,
    "union.skip.stable_move_matches_forced_move",
  );
  exact(
    skip.proposal_search_performed,
    false,
    "union.skip.proposal_search_performed",
  );
  exact(
    skip.independent_rescore_required,
    false,
    "union.skip.independent_rescore_required",
  );
  exact(skip.teacher_labels_emitted, 0, "union.skip.teacher_labels_emitted");
  validateStrongGameParentBinding(parent, forcedMove);
  const expectedDigest = digestCanonical(
    CANDIDATE_UNION_DIGEST_DOMAIN,
    frozenRecord({
      parent_id: parent.parent_id,
      parent_payload_sha256: parent.parent_payload_sha256,
      legal_moves_sha256: legal.moves_sha256,
      stable_row_sha256: stableRowSha256,
      state: "skipped-forced" as const,
      candidates: frozenList([]),
    }),
  );
  exact(candidateUnionSha256, expectedDigest, "union.candidate_union_sha256");
  return frozenRecord({
    status: FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
    parent,
    legal,
    stableBinding,
    candidates,
    candidateUnionSha256,
    teacherProposalBinding: null,
    forcedMove,
    strongGamePlayedMove: forcedMove,
  });
}

function captureStableRuntime(
  value: unknown,
  union: CapturedUnion,
): Readonly<{
  readonly row: Readonly<FloodgateStableWasmProposalRow>;
  readonly runtimeBinding: Readonly<
    FloodgateProductionStableWasmRuntimeBinding<"production-fixed-asset-authority-and-reusable-pool">
  >;
  readonly completedParentRowSha256: string;
}> {
  const result = strictRecord(
    value,
    STABLE_RUNTIME_RESULT_KEYS,
    "stable_runtime",
  );
  exact(
    result.schema,
    FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
    "stable_runtime.schema",
  );
  const rowValue = strictRecord(
    result.row,
    STABLE_ROW_KEYS,
    "stable_runtime.row",
  );
  exact(
    rowValue.schema,
    FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    "stable_runtime.row.schema",
  );
  exact(rowValue.game_id, union.parent.game_id, "stable_runtime.row.game_id");
  exact(
    rowValue.parent_id,
    union.parent.parent_id,
    "stable_runtime.row.parent_id",
  );
  exact(
    rowValue.position_id,
    union.parent.position_id,
    "stable_runtime.row.position_id",
  );
  exact(
    rowValue.parent_payload_sha256,
    union.parent.parent_payload_sha256,
    "stable_runtime.row.parent_payload_sha256",
  );
  const stableMove = canonicalMove(
    rowValue.stable_move,
    "stable_runtime.row.stable_move",
  );
  exact(stableMove, union.stableBinding.stable_move, "stable runtime move");
  let childSfen: string;
  try {
    childSfen = childSfenAfterUsi(union.parent.parent_sfen, stableMove);
  } catch {
    fail("stable runtime move is not legal");
  }
  exact(rowValue.child_sfen, childSfen, "stable_runtime.row.child_sfen");
  const childPositionId = semanticId(
    rowValue.child_position_id,
    "stable_runtime.row.child_position_id",
  );
  exact(
    childPositionId,
    positionKeyFromSfen(childSfen),
    "stable_runtime.row.child_position_id",
  );
  const search = strictRecord(
    rowValue.search,
    STABLE_SEARCH_KEYS,
    "stable_runtime.row.search",
  );
  exact(
    search.requested_depth,
    FLOODGATE_STABLE_REQUESTED_DEPTH,
    "stable_runtime.row.search.requested_depth",
  );
  const completedDepth = safeInteger(
    search.completed_depth,
    "stable_runtime.row.search.completed_depth",
    1,
    FLOODGATE_STABLE_REQUESTED_DEPTH,
  );
  if (
    search.termination !== "requested-depth-complete" &&
    search.termination !== "winning-mate-band-early"
  ) {
    fail("stable_runtime.row.search.termination is unsupported");
  }
  if (
    (search.termination === "requested-depth-complete") !==
    (completedDepth === FLOODGATE_STABLE_REQUESTED_DEPTH)
  ) {
    fail("stable runtime completion depth and termination disagree");
  }
  const rawScore = canonicalSafeInteger(
    search.raw_search_score,
    "stable_runtime.row.search.raw_search_score",
    -FLOODGATE_STABLE_MATE_SCORE_MAX,
    FLOODGATE_STABLE_MATE_SCORE_MAX,
  );
  const nodes = canonicalSafeInteger(
    search.nodes,
    "stable_runtime.row.search.nodes",
    0,
    2_147_483_647,
  );
  const leaves = canonicalSafeInteger(
    search.leaves,
    "stable_runtime.row.search.leaves",
    0,
    2_147_483_647,
  );
  if (nodes + leaves === 0) fail("stable runtime search did no work");
  if (
    search.termination === "winning-mate-band-early" &&
    !(
      completedDepth < FLOODGATE_STABLE_REQUESTED_DEPTH &&
      rawScore >= FLOODGATE_STABLE_MATE_SCORE_MIN &&
      rawScore <= FLOODGATE_STABLE_MATE_SCORE_MAX
    )
  ) {
    fail("stable runtime early completion is not a winning mate-band result");
  }
  exact(
    search.root_tesu,
    union.parent.ply,
    "stable_runtime.row.search.root_tesu",
  );
  exact(
    search.score_encoding,
    FLOODGATE_STABLE_WASM_SCORE_ENCODING,
    "stable_runtime.row.search.score_encoding",
  );
  const row = frozenRecord({
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: union.parent.game_id,
    parent_id: union.parent.parent_id,
    position_id: union.parent.position_id,
    parent_payload_sha256: union.parent.parent_payload_sha256,
    stable_move: stableMove,
    child_sfen: childSfen,
    child_position_id: childPositionId,
    search: frozenRecord({
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: completedDepth,
      termination: search.termination as
        | "requested-depth-complete"
        | "winning-mate-band-early",
      raw_search_score: rawScore,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes,
      leaves,
      root_tesu: union.parent.ply,
    }),
  }) satisfies Readonly<FloodgateStableWasmProposalRow>;
  const candidateUnionRowSha256 = digestCanonical(
    CANDIDATE_UNION_STABLE_ROW_DIGEST_DOMAIN,
    row,
  );
  exact(
    candidateUnionRowSha256,
    union.stableBinding.stable_row_sha256,
    "candidate-union stable row digest",
  );

  const runtimeBindingValue = strictRecord(
    result.runtime_binding,
    STABLE_RUNTIME_BINDING_KEYS,
    "stable_runtime.runtime_binding",
  );
  exact(
    runtimeBindingValue.claim_boundary,
    FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
    "stable_runtime.runtime_binding.claim_boundary",
  );
  exact(
    runtimeBindingValue.execution_boundary,
    "production-fixed-asset-authority-and-reusable-pool",
    "stable_runtime.runtime_binding.execution_boundary",
  );
  exact(
    runtimeBindingValue.origin,
    "direct-owning-runtime-capability-call-v1",
    "stable_runtime.runtime_binding.origin",
  );
  exact(
    runtimeBindingValue.plain_result_authentication_claim,
    false,
    "stable_runtime.runtime_binding.plain_result_authentication_claim",
  );
  exact(
    runtimeBindingValue.parent_payload_sha256,
    union.parent.parent_payload_sha256,
    "stable_runtime.runtime_binding.parent_payload_sha256",
  );
  const runtimeReceiptSha256 = sha256String(
    runtimeBindingValue.runtime_receipt_sha256,
    "stable_runtime.runtime_binding.runtime_receipt_sha256",
  );
  const poolReceiptSha256 = sha256String(
    runtimeBindingValue.reusable_pool_receipt_sha256,
    "stable_runtime.runtime_binding.reusable_pool_receipt_sha256",
  );
  const runtimeRowSha256 = sha256String(
    runtimeBindingValue.row_sha256,
    "stable_runtime.runtime_binding.row_sha256",
  );
  exact(
    runtimeRowSha256,
    digestCanonical(PRODUCTION_STABLE_ROW_DIGEST_DOMAIN, row),
    "stable_runtime.runtime_binding.row_sha256",
  );
  const runtimeBinding = frozenRecord({
    claim_boundary:
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
    execution_boundary:
      "production-fixed-asset-authority-and-reusable-pool" as const,
    runtime_receipt_sha256: runtimeReceiptSha256,
    reusable_pool_receipt_sha256: poolReceiptSha256,
    parent_payload_sha256: union.parent.parent_payload_sha256,
    row_sha256: runtimeRowSha256,
    origin: "direct-owning-runtime-capability-call-v1" as const,
    plain_result_authentication_claim: false as const,
  });
  return frozenRecord({
    row,
    runtimeBinding,
    completedParentRowSha256: digestCanonical(
      COMPLETED_STABLE_ROW_DIGEST_DOMAIN,
      row,
    ),
  });
}

function captureRescore(
  value: unknown,
  candidate: Readonly<FloodgateV7PendingCandidate>,
  index: number,
): Readonly<FloodgateV7CompletedRescoreEvidence> {
  const result = strictRecord(value, RESCORE_RESULT_KEYS, `rescores[${index}]`);
  const depth = safeInteger(
    result.depth,
    `rescores[${index}].depth`,
    1,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.depth,
  );
  exact(result.requested_multipv, 1, `rescores[${index}].requested_multipv`);
  exact(
    result.reset_before_search,
    true,
    `rescores[${index}].reset_before_search`,
  );
  const searchmoves = strictArray(
    result.searchmoves,
    1,
    `rescores[${index}].searchmoves`,
  );
  if (searchmoves.length !== 1)
    fail(`rescores[${index}] requires one searchmove`);
  exact(searchmoves[0], candidate.move, `rescores[${index}].searchmoves[0]`);
  const lines = strictArray(result.lines, 1, `rescores[${index}].lines`);
  if (lines.length !== 1) fail(`rescores[${index}] requires exactly one line`);
  const preliminary = isPlainRecord(lines[0])
    ? Object.getOwnPropertyDescriptor(lines[0], "scoreKind")
    : undefined;
  if (
    preliminary === undefined ||
    !("value" in preliminary) ||
    preliminary.enumerable !== true ||
    (preliminary.value !== "cp" && preliminary.value !== "mate")
  ) {
    fail(`rescores[${index}].lines[0].scoreKind is invalid`);
  }
  const scoreKind = preliminary.value as "cp" | "mate";
  const line = strictRecord(
    lines[0],
    scoreKind === "mate" ? RESCORE_MATE_LINE_KEYS : RESCORE_CP_LINE_KEYS,
    `rescores[${index}].lines[0]`,
  );
  exact(line.depth, depth, `rescores[${index}].lines[0].depth`);
  exact(line.multipv, 1, `rescores[${index}].lines[0].multipv`);
  exact(line.move, candidate.move, `rescores[${index}].lines[0].move`);
  exact(result.bestmove, candidate.move, `rescores[${index}].bestmove`);
  const nodes = canonicalSafeInteger(
    line.nodes,
    `rescores[${index}].lines[0].nodes`,
  );
  const observedNodes = canonicalSafeInteger(
    result.observedNodes,
    `rescores[${index}].observedNodes`,
  );
  exact(observedNodes, nodes, `rescores[${index}].observedNodes`);
  const pvValues = strictArray(
    line.pv,
    MAX_PV_MOVES,
    `rescores[${index}].lines[0].pv`,
  );
  if (pvValues.length === 0) fail(`rescores[${index}] requires a nonempty PV`);
  const pv = pvValues.map((move, pvIndex) =>
    canonicalMove(move, `rescores[${index}].lines[0].pv[${pvIndex}]`),
  );
  exact(pv[0], candidate.move, `rescores[${index}].lines[0].pv[0]`);

  let score: FloodgateV7CompletedRescoreEvidence["score"];
  if (scoreKind === "cp") {
    const cp = canonicalSafeInteger(
      line.cp,
      `rescores[${index}].lines[0].cp`,
      -MAX_NON_MATE_CP,
      MAX_NON_MATE_CP,
    );
    if (
      depth !== FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.depth
    ) {
      fail(`rescores[${index}] non-mate result did not reach fixed depth`);
    }
    score = frozenRecord({ kind: "cp" as const, cp });
  } else {
    const mate = safeInteger(
      line.mate,
      `rescores[${index}].lines[0].mate`,
      -Number.MAX_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER,
    );
    if (line.mateSign !== 1 && line.mateSign !== -1) {
      fail(`rescores[${index}].lines[0].mateSign is invalid`);
    }
    const mateSign = line.mateSign;
    if (mateSign !== (Object.is(mate, -0) || mate < 0 ? -1 : 1)) {
      fail(`rescores[${index}].lines[0] mate and mateSign disagree`);
    }
    const cp = safeInteger(
      line.cp,
      `rescores[${index}].lines[0].cp`,
      -1_000_000,
      1_000_000,
    );
    exact(cp, mateToCp(mate, mateSign), `rescores[${index}].lines[0].cp`);
    score = frozenRecord({
      kind: "mate" as const,
      cp,
      mate_distance: Math.abs(mate),
      mate_sign: mateSign,
    });
  }
  const requestedDepth =
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.depth;
  const completion =
    depth === requestedDepth
      ? ("requested-depth-complete" as const)
      : ("exact-terminal-mate-before-requested-depth" as const);
  if (depth < requestedDepth && score.kind !== "mate") {
    fail(`rescores[${index}] early completion is not a mate result`);
  }
  const normalizedLine =
    score.kind === "cp"
      ? frozenRecord({
          depth,
          multipv: 1 as const,
          cp: score.cp,
          nodes,
          move: candidate.move,
          pv: frozenList(pv),
          scoreKind: "cp" as const,
        })
      : frozenRecord({
          depth,
          multipv: 1 as const,
          cp: score.cp,
          nodes,
          move: candidate.move,
          pv: frozenList(pv),
          scoreKind: "mate" as const,
          mate_distance: score.mate_distance,
          mate_sign: score.mate_sign,
        });
  const normalizedResult = frozenRecord({
    depth,
    lines: frozenList([normalizedLine]),
    bestmove: candidate.move,
    observedNodes,
    requested_multipv: 1 as const,
    searchmoves: frozenList([candidate.move]) as readonly [string],
    reset_before_search: true as const,
  });
  return frozenRecord({
    candidate_index: index,
    move: candidate.move,
    child_sfen: candidate.child_sfen,
    child_position_id: candidate.child_position_id,
    depth,
    completion,
    score,
    nodes,
    observed_nodes: observedNodes,
    pv: frozenRecord({
      moves: pv.length,
      sha256: digestLines(RESCORE_PV_DIGEST_DOMAIN, pv),
    }),
    result_sha256: digestCanonical(
      RESCORE_RESULT_DIGEST_DOMAIN,
      normalizedResult,
    ),
    requested_multipv: 1 as const,
    searchmoves: frozenList([candidate.move]) as readonly [string],
    reset_before_search: true as const,
  });
}

function captureCompletedTeacherProposalBinding(
  value: unknown,
  candidates: readonly Readonly<FloodgateV7PendingCandidate>[],
  legalCount: number,
): NonNullable<
  FloodgateV7CompletedParentEvidence["teacher_proposal_runtime_binding"]
> {
  const binding = strictRecord(
    value,
    COMPLETED_TEACHER_PROPOSAL_KEYS,
    "evidence.teacher_proposal_runtime_binding",
  );
  const semantics = validatePendingCandidateSemantics(
    candidates,
    candidates.find((candidate) => candidate.provenance.stable_policy)?.move ??
      fail("completed candidate union has no stable move"),
    legalCount,
  );
  const runtimeReceiptSha256 = sha256String(
    binding.runtime_receipt_sha256,
    "evidence.teacher_proposal_runtime_binding.runtime_receipt_sha256",
  );
  const proposalResultSha256 = sha256String(
    binding.proposal_result_sha256,
    "evidence.teacher_proposal_runtime_binding.proposal_result_sha256",
  );
  const rootMovesSha256 = sha256String(
    binding.root_moves_sha256,
    "evidence.teacher_proposal_runtime_binding.root_moves_sha256",
  );
  exact(
    rootMovesSha256,
    digestLines(PROPOSAL_ROOT_MOVES_DIGEST_DOMAIN, semantics.proposalMoves),
    "evidence.teacher_proposal_runtime_binding.root_moves_sha256",
  );
  exact(
    binding.requested_multipv,
    semantics.requested,
    "evidence.teacher_proposal_runtime_binding.requested_multipv",
  );
  exact(
    binding.depth,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
    "evidence.teacher_proposal_runtime_binding.depth",
  );
  exact(
    binding.line_count,
    semantics.requested,
    "evidence.teacher_proposal_runtime_binding.line_count",
  );
  const bestmove = canonicalMove(
    binding.bestmove,
    "evidence.teacher_proposal_runtime_binding.bestmove",
  );
  exact(
    bestmove,
    semantics.proposalMoves[0],
    "evidence.teacher_proposal_runtime_binding.bestmove",
  );
  const observedNodes = canonicalSafeInteger(
    binding.observed_nodes,
    "evidence.teacher_proposal_runtime_binding.observed_nodes",
  );
  exact(
    binding.reset_before_search,
    true,
    "evidence.teacher_proposal_runtime_binding.reset_before_search",
  );
  return frozenRecord({
    runtime_receipt_sha256: runtimeReceiptSha256,
    proposal_result_sha256: proposalResultSha256,
    root_moves_sha256: rootMovesSha256,
    requested_multipv: semantics.requested,
    depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
    line_count: semantics.requested,
    bestmove,
    observed_nodes: observedNodes,
    reset_before_search: true as const,
  });
}

function captureCompletedRescore(
  value: unknown,
  candidate: Readonly<FloodgateV7PendingCandidate>,
  index: number,
): Readonly<FloodgateV7CompletedRescoreEvidence> {
  const rescore = strictRecord(
    value,
    COMPLETED_RESCORE_KEYS,
    `evidence.rescores[${index}]`,
  );
  exact(
    rescore.candidate_index,
    index,
    `evidence.rescores[${index}].candidate_index`,
  );
  exact(rescore.move, candidate.move, `evidence.rescores[${index}].move`);
  exact(
    rescore.child_sfen,
    candidate.child_sfen,
    `evidence.rescores[${index}].child_sfen`,
  );
  exact(
    rescore.child_position_id,
    candidate.child_position_id,
    `evidence.rescores[${index}].child_position_id`,
  );
  const requestedDepth =
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.depth;
  const depth = safeInteger(
    rescore.depth,
    `evidence.rescores[${index}].depth`,
    1,
    requestedDepth,
  );
  const expectedCompletion =
    depth === requestedDepth
      ? ("requested-depth-complete" as const)
      : ("exact-terminal-mate-before-requested-depth" as const);
  exact(
    rescore.completion,
    expectedCompletion,
    `evidence.rescores[${index}].completion`,
  );
  const scorePreliminary = isPlainRecord(rescore.score)
    ? Object.getOwnPropertyDescriptor(rescore.score, "kind")
    : undefined;
  if (
    scorePreliminary === undefined ||
    !("value" in scorePreliminary) ||
    scorePreliminary.enumerable !== true ||
    (scorePreliminary.value !== "cp" && scorePreliminary.value !== "mate")
  ) {
    fail(`evidence.rescores[${index}].score.kind is invalid`);
  }
  const scoreKind = scorePreliminary.value as "cp" | "mate";
  let score: FloodgateV7CompletedRescoreEvidence["score"];
  if (scoreKind === "cp") {
    const scoreValue = strictRecord(
      rescore.score,
      COMPLETED_RESCORE_CP_SCORE_KEYS,
      `evidence.rescores[${index}].score`,
    );
    if (depth !== requestedDepth) {
      fail(`evidence.rescores[${index}] shallow score must be mate`);
    }
    score = frozenRecord({
      kind: "cp" as const,
      cp: canonicalSafeInteger(
        scoreValue.cp,
        `evidence.rescores[${index}].score.cp`,
        -MAX_NON_MATE_CP,
        MAX_NON_MATE_CP,
      ),
    });
  } else {
    const scoreValue = strictRecord(
      rescore.score,
      COMPLETED_RESCORE_MATE_SCORE_KEYS,
      `evidence.rescores[${index}].score`,
    );
    const distance = canonicalSafeInteger(
      scoreValue.mate_distance,
      `evidence.rescores[${index}].score.mate_distance`,
    );
    if (scoreValue.mate_sign !== 1 && scoreValue.mate_sign !== -1) {
      fail(`evidence.rescores[${index}].score.mate_sign is invalid`);
    }
    const mateSign = scoreValue.mate_sign;
    const cp = safeInteger(
      scoreValue.cp,
      `evidence.rescores[${index}].score.cp`,
      -1_000_000,
      1_000_000,
    );
    exact(
      cp,
      mateToCp(distance, mateSign),
      `evidence.rescores[${index}].score.cp`,
    );
    score = frozenRecord({
      kind: "mate" as const,
      cp,
      mate_distance: distance,
      mate_sign: mateSign,
    });
  }
  const nodes = canonicalSafeInteger(
    rescore.nodes,
    `evidence.rescores[${index}].nodes`,
  );
  const observedNodes = canonicalSafeInteger(
    rescore.observed_nodes,
    `evidence.rescores[${index}].observed_nodes`,
  );
  exact(observedNodes, nodes, `evidence.rescores[${index}].observed_nodes`);
  const pv = strictRecord(
    rescore.pv,
    COMPLETED_RESCORE_PV_KEYS,
    `evidence.rescores[${index}].pv`,
  );
  const pvMoves = safeInteger(
    pv.moves,
    `evidence.rescores[${index}].pv.moves`,
    1,
    MAX_PV_MOVES,
  );
  const pvSha256 = sha256String(
    pv.sha256,
    `evidence.rescores[${index}].pv.sha256`,
  );
  const resultSha256 = sha256String(
    rescore.result_sha256,
    `evidence.rescores[${index}].result_sha256`,
  );
  exact(
    rescore.requested_multipv,
    1,
    `evidence.rescores[${index}].requested_multipv`,
  );
  const searchmoves = strictArray(
    rescore.searchmoves,
    1,
    `evidence.rescores[${index}].searchmoves`,
  );
  if (searchmoves.length !== 1) {
    fail(`evidence.rescores[${index}].searchmoves must have one move`);
  }
  exact(
    searchmoves[0],
    candidate.move,
    `evidence.rescores[${index}].searchmoves[0]`,
  );
  exact(
    rescore.reset_before_search,
    true,
    `evidence.rescores[${index}].reset_before_search`,
  );
  return frozenRecord({
    candidate_index: index,
    move: candidate.move,
    child_sfen: candidate.child_sfen,
    child_position_id: candidate.child_position_id,
    depth,
    completion: expectedCompletion,
    score,
    nodes,
    observed_nodes: observedNodes,
    pv: frozenRecord({ moves: pvMoves, sha256: pvSha256 }),
    result_sha256: resultSha256,
    requested_multipv: 1 as const,
    searchmoves: frozenList([candidate.move]) as readonly [string],
    reset_before_search: true as const,
  });
}

/**
 * Revalidate and normalize a persisted compact completed-parent projection.
 *
 * This verifier can rederive every semantic field retained by the compact
 * format.  The PV and normalized full-result digests intentionally retain no
 * raw PV bytes, so their lowercase-SHA shape and HMAC-bound value are checked,
 * but they cannot independently prove what an engine emitted.
 */
export function verifyFloodgateV7CompletedParentEvidenceCoreForTests(
  evidenceValue: Readonly<FloodgateV7CompletedParentEvidence>,
): Readonly<FloodgateV7CompletedParentEvidence> {
  const evidence = strictRecord(
    evidenceValue,
    COMPLETED_EVIDENCE_KEYS,
    "evidence",
  );
  exact(
    evidence.schema,
    FLOODGATE_V7_COMPLETED_PARENT_SCHEMA,
    "evidence.schema",
  );
  exact(
    evidence.status,
    FLOODGATE_V7_COMPLETED_PARENT_STATUS,
    "evidence.status",
  );
  exact(
    evidence.claim_boundary,
    FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY,
    "evidence.claim_boundary",
  );
  exact(
    evidence.input_authentication_claim,
    false,
    "evidence.input_authentication_claim",
  );
  const parent = captureParent(evidence.parent);
  const legal = captureLegal(evidence.legal, parent);
  const strongGamePlayedMove = canonicalMove(
    evidence.strong_game_played_move,
    "evidence.strong_game_played_move",
  );
  validateStrongGameParentBinding(parent, strongGamePlayedMove);

  const candidateUnionValue = strictRecord(
    evidence.candidate_union,
    COMPLETED_CANDIDATE_UNION_KEYS,
    "evidence.candidate_union",
  );
  exact(
    candidateUnionValue.schema,
    FLOODGATE_V7_CANDIDATE_UNION_SCHEMA,
    "evidence.candidate_union.schema",
  );
  if (
    candidateUnionValue.status !==
      FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS &&
    candidateUnionValue.status !== FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS
  ) {
    fail("evidence.candidate_union.status is unsupported");
  }
  const candidateStatus = candidateUnionValue.status;
  const candidates = captureCandidates(candidateUnionValue.candidates, parent);
  const suppliedCandidateUnionSha256 = sha256String(
    candidateUnionValue.sha256,
    "evidence.candidate_union.sha256",
  );

  const stableValue = strictRecord(
    evidence.stable,
    COMPLETED_STABLE_KEYS,
    "evidence.stable",
  );
  const candidateUnionRowSha256 = sha256String(
    stableValue.candidate_union_row_sha256,
    "evidence.stable.candidate_union_row_sha256",
  );
  const preliminaryStableRow = strictRecord(
    stableValue.row,
    STABLE_ROW_KEYS,
    "evidence.stable.row",
  );
  const stableMove = canonicalMove(
    preliminaryStableRow.stable_move,
    "evidence.stable.row.stable_move",
  );

  let teacherProposalBinding: FloodgateV7CompletedParentEvidence["teacher_proposal_runtime_binding"];
  let forcedMove: string | null;
  if (candidateStatus === FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS) {
    if (legal.count < 2 || candidates.length < 2) {
      fail("completed pending parent requires non-forced candidates");
    }
    const semantics = validatePendingCandidateSemantics(
      candidates,
      stableMove,
      legal.count,
    );
    exact(
      strongGamePlayedMove,
      semantics.strongGamePlayedMove,
      "evidence.strong_game_played_move",
    );
    if (evidence.teacher_proposal_runtime_binding === null) {
      fail("completed pending parent requires a teacher proposal binding");
    }
    teacherProposalBinding = captureCompletedTeacherProposalBinding(
      evidence.teacher_proposal_runtime_binding,
      candidates,
      legal.count,
    );
    forcedMove = null;
  } else {
    if (
      legal.count !== 1 ||
      candidates.length !== 0 ||
      evidence.teacher_proposal_runtime_binding !== null
    ) {
      fail("completed forced parent has proposal or candidate evidence");
    }
    exact(strongGamePlayedMove, stableMove, "evidence.strong_game_played_move");
    teacherProposalBinding = null;
    forcedMove = stableMove;
  }

  const unionForStable: CapturedUnion = frozenRecord({
    status: candidateStatus,
    parent,
    legal,
    stableBinding: frozenRecord({
      parent_payload_sha256: parent.parent_payload_sha256,
      stable_move: stableMove,
      stable_row_sha256: candidateUnionRowSha256,
    }),
    candidates,
    candidateUnionSha256: suppliedCandidateUnionSha256,
    teacherProposalBinding,
    forcedMove,
    strongGamePlayedMove,
  });
  const stable = captureStableRuntime(
    frozenRecord({
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row: stableValue.row,
      runtime_binding: evidence.stable_runtime_binding,
    }),
    unionForStable,
  );
  const completedParentRowSha256 = sha256String(
    stableValue.completed_parent_row_sha256,
    "evidence.stable.completed_parent_row_sha256",
  );
  exact(
    completedParentRowSha256,
    stable.completedParentRowSha256,
    "evidence.stable.completed_parent_row_sha256",
  );
  const productionRuntimeRowSha256 = sha256String(
    stableValue.production_runtime_row_sha256,
    "evidence.stable.production_runtime_row_sha256",
  );
  exact(
    productionRuntimeRowSha256,
    stable.runtimeBinding.row_sha256,
    "evidence.stable.production_runtime_row_sha256",
  );

  const candidateUnionSha256 =
    candidateStatus === FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS
      ? digestCanonical(
          CANDIDATE_UNION_DIGEST_DOMAIN,
          frozenRecord({
            parent_id: parent.parent_id,
            parent_payload_sha256: parent.parent_payload_sha256,
            legal_moves_sha256: legal.moves_sha256,
            stable_row_sha256: candidateUnionRowSha256,
            runtime_receipt_sha256: (
              teacherProposalBinding as NonNullable<
                typeof teacherProposalBinding
              >
            ).runtime_receipt_sha256,
            proposal_result_sha256: (
              teacherProposalBinding as NonNullable<
                typeof teacherProposalBinding
              >
            ).proposal_result_sha256,
            state: "awaiting-independent-rescores" as const,
            candidates,
          }),
        )
      : digestCanonical(
          CANDIDATE_UNION_DIGEST_DOMAIN,
          frozenRecord({
            parent_id: parent.parent_id,
            parent_payload_sha256: parent.parent_payload_sha256,
            legal_moves_sha256: legal.moves_sha256,
            stable_row_sha256: candidateUnionRowSha256,
            state: "skipped-forced" as const,
            candidates: frozenList([]),
          }),
        );
  exact(
    suppliedCandidateUnionSha256,
    candidateUnionSha256,
    "evidence.candidate_union.sha256",
  );

  const rescoreValues = strictArray(
    evidence.rescores,
    MAX_CANDIDATES,
    "evidence.rescores",
  );
  if (rescoreValues.length !== candidates.length) {
    fail("evidence rescore count does not equal candidate count");
  }
  const rescores = frozenList(
    rescoreValues.map((value, index) =>
      captureCompletedRescore(value, candidates[index], index),
    ),
  );
  const completionValue = strictRecord(
    evidence.completion,
    COMPLETED_COMPLETION_KEYS,
    "evidence.completion",
  );
  const expectedState =
    candidateStatus === FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS
      ? ("forced-parent-skip" as const)
      : ("complete" as const);
  exact(completionValue.state, expectedState, "evidence.completion.state");
  exact(
    completionValue.candidates,
    candidates.length,
    "evidence.completion.candidates",
  );
  exact(
    completionValue.independent_rescores_required,
    candidates.length,
    "evidence.completion.independent_rescores_required",
  );
  exact(
    completionValue.independent_rescores_completed,
    rescores.length,
    "evidence.completion.independent_rescores_completed",
  );
  exact(
    completionValue.teacher_labels_emitted,
    0,
    "evidence.completion.teacher_labels_emitted",
  );

  const unsigned = frozenRecord({
    schema: FLOODGATE_V7_COMPLETED_PARENT_SCHEMA,
    status: FLOODGATE_V7_COMPLETED_PARENT_STATUS,
    claim_boundary: FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY,
    input_authentication_claim: false as const,
    parent,
    strong_game_played_move: strongGamePlayedMove,
    legal,
    stable: frozenRecord({
      row: stable.row,
      completed_parent_row_sha256: completedParentRowSha256,
      candidate_union_row_sha256: candidateUnionRowSha256,
      production_runtime_row_sha256: productionRuntimeRowSha256,
    }),
    stable_runtime_binding: stable.runtimeBinding,
    teacher_proposal_runtime_binding: teacherProposalBinding,
    candidate_union: frozenRecord({
      schema: FLOODGATE_V7_CANDIDATE_UNION_SCHEMA,
      status: candidateStatus,
      sha256: candidateUnionSha256,
      candidates,
    }),
    rescores,
    completion: frozenRecord({
      state: expectedState,
      candidates: candidates.length,
      independent_rescores_required: candidates.length,
      independent_rescores_completed: rescores.length,
      teacher_labels_emitted: 0 as const,
    }),
  });
  const completedParentSha256 = sha256String(
    evidence.completed_parent_sha256,
    "evidence.completed_parent_sha256",
  );
  exact(
    completedParentSha256,
    digestCanonical(COMPLETED_PARENT_DIGEST_DOMAIN, unsigned),
    "evidence.completed_parent_sha256",
  );
  return frozenRecord({
    ...unsigned,
    completed_parent_sha256: completedParentSha256,
  });
}

/**
 * Strictly capture one candidate union, its direct stable-runtime result, and
 * every independent USI rescore into a compact immutable projection.
 *
 * The digest is an unkeyed semantic identity.  It is deliberately not an
 * authentication claim, teacher label, holdout result, or strength claim.
 */
export function buildFloodgateV7CompletedParentCoreForTests(
  inputValue: FloodgateV7CompletedParentInput,
): Readonly<FloodgateV7CompletedParentEvidence> {
  const input = strictRecord(inputValue, INPUT_KEYS, "input");
  const union = captureUnion(input.union);
  const stable = captureStableRuntime(input.stable_runtime, union);
  const rescoreValues = strictArray(input.rescores, MAX_CANDIDATES, "rescores");
  if (rescoreValues.length !== union.candidates.length) {
    fail("rescore count does not exactly equal candidate count");
  }
  if (
    union.status === FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS &&
    rescoreValues.length !== 0
  ) {
    fail("forced parent must contain zero USI rescores");
  }
  const rescores = frozenList(
    rescoreValues.map((value, index) =>
      captureRescore(value, union.candidates[index], index),
    ),
  );
  const unsigned = frozenRecord({
    schema: FLOODGATE_V7_COMPLETED_PARENT_SCHEMA,
    status: FLOODGATE_V7_COMPLETED_PARENT_STATUS,
    claim_boundary: FLOODGATE_V7_COMPLETED_PARENT_CLAIM_BOUNDARY,
    input_authentication_claim: false as const,
    parent: union.parent,
    strong_game_played_move: union.strongGamePlayedMove,
    legal: union.legal,
    stable: frozenRecord({
      row: stable.row,
      completed_parent_row_sha256: stable.completedParentRowSha256,
      candidate_union_row_sha256: union.stableBinding.stable_row_sha256,
      production_runtime_row_sha256: stable.runtimeBinding.row_sha256,
    }),
    stable_runtime_binding: stable.runtimeBinding,
    teacher_proposal_runtime_binding: union.teacherProposalBinding,
    candidate_union: frozenRecord({
      schema: FLOODGATE_V7_CANDIDATE_UNION_SCHEMA,
      status: union.status,
      sha256: union.candidateUnionSha256,
      candidates: union.candidates,
    }),
    rescores,
    completion: frozenRecord({
      state:
        union.status === FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS
          ? ("forced-parent-skip" as const)
          : ("complete" as const),
      candidates: union.candidates.length,
      independent_rescores_required: union.candidates.length,
      independent_rescores_completed: rescores.length,
      teacher_labels_emitted: 0 as const,
    }),
  });
  return verifyFloodgateV7CompletedParentEvidenceCoreForTests(
    frozenRecord({
      ...unsigned,
      completed_parent_sha256: digestCanonical(
        COMPLETED_PARENT_DIGEST_DOMAIN,
        unsigned,
      ),
    }),
  );
}
