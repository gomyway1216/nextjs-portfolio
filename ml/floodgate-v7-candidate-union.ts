/**
 * Pure, synchronous v7 candidate-union validation.
 *
 * This module deliberately authenticates nothing. A later argumentless
 * coordinator must claim the real training consumer input, verify the complete
 * HMAC-authenticated stable work stream, create the fixed production USI pool,
 * and only then pass captured projections through this core. Plain objects can
 * prove internal consistency here, but cannot prove their production origin.
 */

import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

import { FLOODGATE_PRODUCTION_TEACHER_RUNTIME } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  type FloodgateProductionTeacherProposalResult,
  type FloodgateProductionTeacherUsiRuntimeReceipt,
} from "./floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  type FloodgateStableWasmProposalRow,
} from "./floodgate-stable-wasm-proposer";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import { toSfen } from "./generate-teacher";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { positionKeyFromSfen } from "./sibling-data";
import { MAX_NON_MATE_CP, mateToCp } from "./usi-multipv";

export const FLOODGATE_V7_CANDIDATE_UNION_SCHEMA =
  "shogi-floodgate-v7-candidate-union-v1" as const;
export const FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS =
  "validated-candidate-union-awaiting-independent-rescores" as const;
export const FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS =
  "validated-forced-parent-skip" as const;
export const FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY =
  "syntactic-semantic-test-core-only-not-authenticated-runtime-teacher-label-training-holdout-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE =
  "caller-projection-cross-checked-against-core-rules-v1" as const;
export const FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID =
  "YaneuraOu NNUE 9.60git 64APPLEM1" as const;

const CANONICAL_USI_MOVE =
  /^(?:[1-9][a-i][1-9][a-i]\+?|[PLNSGBR]\*[1-9][a-i])$/;
const SEMANTIC_ID = /^sha256:[0-9a-f]{64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MAX_LEGAL_MOVES = 593;
const LEGAL_MOVES_DIGEST_DOMAIN = "shogi-floodgate-v7-legal-moves-v1\0";
const PROPOSAL_ROOT_MOVES_DIGEST_DOMAIN =
  "shogi-floodgate-v7-proposal-root-moves-v1\0";
const PROPOSAL_RESULT_DIGEST_DOMAIN = "shogi-floodgate-v7-proposal-result-v1\0";
const RUNTIME_RECEIPT_DIGEST_DOMAIN = "shogi-floodgate-v7-runtime-receipt-v1\0";
const STABLE_ROW_DIGEST_DOMAIN = "shogi-floodgate-v7-stable-row-v1\0";
const CANDIDATE_UNION_DIGEST_DOMAIN = "shogi-floodgate-v7-candidate-union-v1\0";

const PARENT_KEYS = Object.freeze([
  "game_id",
  "parent_id",
  "parent_sfen",
  "played_move",
  "ply",
  "position_id",
  "schema_version",
] as const);
const LEGAL_KEYS = Object.freeze([
  "count",
  "moves",
  "parent_sfen",
  "source",
] as const);
const STABLE_KEYS = Object.freeze([
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
const RUNTIME_INPUT_KEYS = Object.freeze(["proposal", "receipt"] as const);
const RUNTIME_RECEIPT_KEYS = Object.freeze([
  "asset_authority_execution_boundary",
  "claim_boundary",
  "contract",
  "engine_id",
  "execution_boundary",
  "fixed_options",
  "limits",
  "runtime",
  "snapshot",
  "status",
  "timeouts",
] as const);
const RUNTIME_KEYS = Object.freeze([
  "depth",
  "engine_count",
  "fv_scale",
  "hash_mb_per_engine",
  "independent_rescore_multipv",
  "minimal_environment",
  "no_process_arguments",
  "per_worker_private_directories",
  "proposal_multipv_max",
  "queue_bound",
  "shell",
  "threads_per_engine",
] as const);
const TIMEOUT_KEYS = Object.freeze([
  "killGraceMs",
  "readyMs",
  "searchMs",
  "termGraceMs",
  "usiMs",
] as const);
const LIMIT_KEYS = Object.freeze([
  "lineBytes",
  "stderrBytesTotal",
  "stdoutBytesPerPhase",
  "stdoutLinesPerPhase",
] as const);
const SNAPSHOT_KEYS = Object.freeze([
  "destination_revalidated",
  "engine",
  "eval",
  "one_shared_private_snapshot",
  "source_authority_revalidated",
] as const);
const SNAPSHOT_FILE_KEYS = Object.freeze(["bytes", "mode", "sha256"] as const);
const PROPOSAL_KEYS = Object.freeze([
  "bestmove",
  "depth",
  "legal_move_count_evidence",
  "lines",
  "observedNodes",
  "requested_multipv",
  "reset_before_search",
] as const);
const PROPOSAL_LEGAL_KEYS = Object.freeze(["count", "source"] as const);
const LINE_CP_KEYS = Object.freeze([
  "cp",
  "depth",
  "move",
  "multipv",
  "nodes",
  "pv",
  "scoreKind",
] as const);
const LINE_MATE_KEYS = Object.freeze([
  ...LINE_CP_KEYS,
  "mate",
  "mateSign",
] as const);
const INVOCATION_KEYS = Object.freeze([
  "legal",
  "parent",
  "runtime",
  "stable",
] as const);

const FIXED_OPTIONS = Object.freeze([
  "EvalDir=<private-shared-snapshot>/eval",
  "FV_SCALE=20",
  "USI_Hash=64",
  "Threads=1",
  "USI_OwnBook=false",
  "BookFile=no_book",
  "NetworkDelay=0",
  "NetworkDelay2=0",
] as const);

export interface FloodgateV7RulesLegalMoveEvidence {
  readonly source: typeof FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE;
  readonly parent_sfen: string;
  readonly count: number;
  readonly moves: readonly string[];
}

export interface FloodgateV7CandidateUnionRuntimeInput {
  readonly receipt: Readonly<
    FloodgateProductionTeacherUsiRuntimeReceipt<"production-fixed-assets-and-runtime-dependencies">
  >;
  readonly proposal: Readonly<FloodgateProductionTeacherProposalResult>;
}

export interface FloodgateV7CandidateUnionInput {
  readonly parent: Readonly<FloodgateTrainingParent>;
  readonly legal: Readonly<FloodgateV7RulesLegalMoveEvidence>;
  readonly stable: Readonly<FloodgateStableWasmProposalRow>;
  /** Must be null for a forced one-legal-move parent. */
  readonly runtime: Readonly<FloodgateV7CandidateUnionRuntimeInput> | null;
}

export interface FloodgateV7CandidateProvenance {
  readonly production_proposal: boolean;
  readonly strong_game_played: boolean;
  readonly stable_policy: boolean;
}

export interface FloodgateV7PendingCandidate {
  readonly move: string;
  readonly child_sfen: string;
  readonly child_position_id: string;
  readonly proposal_rank: number | null;
  readonly provenance: Readonly<FloodgateV7CandidateProvenance>;
  readonly independent_rescore: "required-not-yet-run";
}

interface ParentBinding {
  readonly game_id: string;
  readonly parent_id: string;
  readonly position_id: string;
  readonly parent_sfen: string;
  readonly ply: number;
  readonly parent_payload_sha256: string;
}

interface LegalBinding {
  readonly source: "core-rederived-rules-complete-legal-moves-v1";
  readonly caller_evidence_cross_checked: true;
  readonly count: number;
  readonly moves_sha256: string;
}

export interface FloodgateV7CandidateUnionPendingReceipt {
  readonly schema: typeof FLOODGATE_V7_CANDIDATE_UNION_SCHEMA;
  readonly status: typeof FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY;
  readonly input_authentication_claim: false;
  readonly parent: Readonly<ParentBinding>;
  readonly legal: Readonly<LegalBinding>;
  readonly runtime_binding: Readonly<Record<string, unknown>>;
  readonly stable_binding: Readonly<{
    readonly schema: typeof FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA;
    readonly parent_payload_sha256: string;
    readonly stable_move: string;
    readonly stable_row_sha256: string;
    readonly plain_object_stable_authentication_claim: false;
  }>;
  readonly candidates: readonly Readonly<FloodgateV7PendingCandidate>[];
  readonly candidate_union_sha256: string;
  readonly completion: Readonly<{
    readonly state: "incomplete";
    readonly independent_rescores_required: number;
    readonly independent_rescores_completed: 0;
    readonly teacher_labels_emitted: 0;
  }>;
}

export interface FloodgateV7CandidateUnionSkipReceipt {
  readonly schema: typeof FLOODGATE_V7_CANDIDATE_UNION_SCHEMA;
  readonly status: typeof FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY;
  readonly input_authentication_claim: false;
  readonly parent: Readonly<ParentBinding>;
  readonly legal: Readonly<LegalBinding>;
  readonly stable_binding: Readonly<{
    readonly schema: typeof FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA;
    readonly parent_payload_sha256: string;
    readonly stable_move: string;
    readonly stable_row_sha256: string;
    readonly plain_object_stable_authentication_claim: false;
  }>;
  readonly runtime_binding: null;
  readonly candidates: readonly [];
  readonly candidate_union_sha256: string;
  readonly skip: Readonly<{
    readonly reason: "fewer-than-two-rules-complete-legal-moves";
    readonly forced_move: string;
    readonly played_move_matches_forced_move: true;
    readonly stable_move_matches_forced_move: true;
    readonly proposal_search_performed: false;
    readonly independent_rescore_required: false;
    readonly teacher_labels_emitted: 0;
  }>;
}

export type FloodgateV7CandidateUnionReceipt =
  | FloodgateV7CandidateUnionPendingReceipt
  | FloodgateV7CandidateUnionSkipReceipt;

interface CapturedParent extends ParentBinding {
  readonly schema_version: 1;
  readonly played_move: string;
}

interface CapturedRuntime {
  readonly binding: Readonly<Record<string, unknown>>;
  readonly proposalMoves: readonly string[];
  readonly runtimeReceiptSha256: string;
  readonly proposalResultSha256: string;
}

interface CapturedStable {
  readonly move: string;
  readonly rowSha256: string;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate v7 candidate union: ${message}`);
}

function compareBytewise(left: string, right: string): number {
  // Accepted schema keys and canonical USI moves are ASCII, for which JS
  // lexical order is identical to UTF-8 byte order without Buffer allocation.
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function digestLineList(domain: string, values: readonly string[]): string {
  return sha256(`${domain}${values.join("\n")}\n`);
}

function digestCanonical(domain: string, value: unknown): string {
  return sha256(`${domain}${canonicalJson(value)}`);
}

function frozenRecord<T extends object>(value: T): Readonly<T> {
  return Object.freeze(
    Object.assign(Object.create(null), value),
  ) as Readonly<T>;
}

function frozenList<T>(value: T[]): readonly T[] {
  return Object.freeze(value);
}

function strictRecord(
  value: unknown,
  keys: readonly string[],
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(`${label} must be a non-Proxy plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const actual = Reflect.ownKeys(descriptors);
  if (actual.some((key) => typeof key !== "string")) {
    fail(`${label} must not contain symbol keys`);
  }
  const actualStrings = (actual as string[]).sort(compareBytewise);
  const expected = [...keys].sort(compareBytewise);
  if (
    actualStrings.length !== expected.length ||
    actualStrings.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} must contain exactly ${expected.join(", ")}`);
  }
  const output: Record<string, unknown> = Object.create(null);
  for (const key of expected) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
    Object.defineProperty(output, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(output);
}

function strictDataRecord(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    fail(`${label} must be a non-Proxy plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(
    value,
  ) as unknown as Record<PropertyKey, PropertyDescriptor | undefined>;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")) {
    fail(`${label} must not contain symbol keys`);
  }
  if (keys.length > 64) fail(`${label} has too many keys`);
  const output: Record<string, unknown> = Object.create(null);
  for (const key of keys as string[]) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
    Object.defineProperty(output, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(output);
}

function strictArray(
  value: unknown,
  label: string,
  maximum = MAX_LEGAL_MOVES,
): readonly unknown[] {
  if (
    !Array.isArray(value) ||
    nodeUtilTypes.isProxy(value) ||
    Object.getPrototypeOf(value) !== Array.prototype
  ) {
    fail(`${label} must be a non-Proxy ordinary array`);
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
    fail(`${label} must be dense and contain no extra or symbol keys`);
  }
  const output: unknown[] = [];
  for (let index = 0; index < count; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      descriptor === undefined ||
      !("value" in descriptor) ||
      descriptor.enumerable !== true
    ) {
      fail(`${label}[${index}] must be an enumerable data property`);
    }
    output.push(descriptor.value);
  }
  return Object.freeze(output);
}

function canonicalJson(value: unknown): string {
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
    const array = strictArray(value, "canonical JSON array", 100_000);
    return `[${array.map(canonicalJson).join(",")}]`;
  }
  const record = strictDataRecord(value, "canonical JSON object");
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function safeInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(`${label} must be a safe integer >= ${minimum}`);
  }
  // The USI parser deliberately accepts signed decimal tokens, including
  // parser-valid `-0`. Canonical JSON has one representation for zero, so
  // normalize it at capture rather than failing later while hashing.
  return Object.is(value, -0) ? 0 : (value as number);
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (value !== expected) fail(`${label} is not the fixed value`);
}

function canonicalMove(value: unknown, label: string): string {
  if (typeof value !== "string" || !CANONICAL_USI_MOVE.test(value)) {
    fail(`${label} is not a canonical USI move`);
  }
  return value;
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function captureParent(value: unknown): CapturedParent {
  const row = strictRecord(value, PARENT_KEYS, "parent");
  exact(row.schema_version, 1, "parent.schema_version");
  for (const key of ["game_id", "parent_id", "position_id"] as const) {
    if (typeof row[key] !== "string" || !SEMANTIC_ID.test(row[key])) {
      fail(`parent.${key} is not a semantic ID`);
    }
  }
  const ply = safeInteger(row.ply, "parent.ply");
  if (ply > 2_147_483_647) fail("parent.ply is outside the i32 range");
  if (row.parent_id !== parentOccurrenceId(row.game_id as string, ply)) {
    fail("parent.parent_id does not match game_id and ply");
  }
  if (typeof row.parent_sfen !== "string" || row.parent_sfen === "") {
    fail("parent.parent_sfen must be non-empty");
  }
  const parentSfen = row.parent_sfen;
  let parsed: ReturnType<typeof positionFromSfen>;
  try {
    parsed = positionFromSfen(parentSfen);
  } catch (error) {
    return fail(`parent.parent_sfen is invalid: ${String(error)}`);
  }
  if (
    toSfen(parsed.position, parsed.moveNumber) !== parentSfen ||
    parsed.moveNumber !== ply + 1 ||
    positionKeyFromSfen(parentSfen) !== row.position_id
  ) {
    fail("parent SFEN identity binding is inconsistent");
  }
  const playedMove = canonicalMove(row.played_move, "parent.played_move");
  const payload = frozenRecord({
    schema_version: 1 as const,
    game_id: row.game_id as string,
    parent_id: row.parent_id as string,
    position_id: row.position_id as string,
    parent_sfen: parentSfen,
    ply,
    played_move: playedMove,
  });
  return frozenRecord({
    ...payload,
    parent_payload_sha256: sha256(
      `shogi-floodgate-stable-parent-v1\0${canonicalJson(payload)}`,
    ),
  });
}

function captureLegal(
  value: unknown,
  parent: CapturedParent,
): readonly string[] {
  const evidence = strictRecord(value, LEGAL_KEYS, "legal evidence");
  exact(
    evidence.source,
    FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
    "legal evidence.source",
  );
  exact(evidence.parent_sfen, parent.parent_sfen, "legal evidence.parent_sfen");
  const values = strictArray(evidence.moves, "legal evidence.moves");
  const supplied = values.map((move, index) =>
    canonicalMove(move, `legal evidence.moves[${index}]`),
  );
  const { position } = positionFromSfen(parent.parent_sfen);
  const derivedEntries = rulesCompleteLegalMoves(position);
  if (derivedEntries.some((entry) => getKomashu(entry.move.capture) === OU)) {
    fail("core-derived legal move set attempts to capture the opposing king");
  }
  const derivedUnsorted = derivedEntries.map((entry) => entry.usi);
  if (new Set(derivedUnsorted).size !== derivedUnsorted.length) {
    fail("core-derived legal move set contains duplicates");
  }
  const derived = [...derivedUnsorted].sort(compareBytewise);
  if (new Set(supplied).size !== supplied.length) {
    fail("caller legal evidence contains duplicate moves");
  }
  const suppliedCanonical = [...supplied].sort(compareBytewise);
  if (derived.length < 1 || derived.length > MAX_LEGAL_MOVES) {
    fail("core-derived legal move count is outside the supported range");
  }
  exact(evidence.count, derived.length, "legal evidence.count");
  if (
    suppliedCanonical.length !== derived.length ||
    suppliedCanonical.some((move, index) => move !== derived[index])
  ) {
    fail("caller legal evidence differs from the core-derived legal move set");
  }
  if (!derived.includes(parent.played_move)) {
    fail("strong-game played move is not rules-complete legal");
  }
  return frozenList([...derived]);
}

function captureStable(
  value: unknown,
  parent: CapturedParent,
  legal: readonly string[],
): Readonly<CapturedStable> {
  const row = strictRecord(value, STABLE_KEYS, "stable proposal row");
  exact(
    row.schema,
    FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    "stable proposal row.schema",
  );
  exact(row.game_id, parent.game_id, "stable proposal row.game_id");
  exact(row.parent_id, parent.parent_id, "stable proposal row.parent_id");
  exact(row.position_id, parent.position_id, "stable proposal row.position_id");
  exact(
    row.parent_payload_sha256,
    parent.parent_payload_sha256,
    "stable proposal row.parent_payload_sha256",
  );
  const move = canonicalMove(
    row.stable_move,
    "stable proposal row.stable_move",
  );
  if (!legal.includes(move))
    fail("stable proposal move is not rules-complete legal");
  const childSfen = childSfenAfterUsi(parent.parent_sfen, move);
  exact(row.child_sfen, childSfen, "stable proposal row.child_sfen");
  exact(
    row.child_position_id,
    positionKeyFromSfen(childSfen),
    "stable proposal row.child_position_id",
  );
  const search = strictRecord(
    row.search,
    STABLE_SEARCH_KEYS,
    "stable proposal row.search",
  );
  exact(
    search.requested_depth,
    FLOODGATE_STABLE_REQUESTED_DEPTH,
    "stable proposal row.search.requested_depth",
  );
  const completedDepth = safeInteger(
    search.completed_depth,
    "stable proposal row.search.completed_depth",
    1,
  );
  if (completedDepth > FLOODGATE_STABLE_REQUESTED_DEPTH) {
    fail("stable proposal completed depth exceeds requested depth");
  }
  if (
    search.termination !== "requested-depth-complete" &&
    search.termination !== "winning-mate-band-early"
  ) {
    fail("stable proposal termination is unsupported");
  }
  if (
    (search.termination === "requested-depth-complete") !==
    (completedDepth === FLOODGATE_STABLE_REQUESTED_DEPTH)
  ) {
    fail("stable proposal termination and completed depth disagree");
  }
  if (!Number.isSafeInteger(search.raw_search_score)) {
    fail("stable proposal raw score is invalid");
  }
  const rawSearchScore = search.raw_search_score as number;
  const nodes = safeInteger(search.nodes, "stable proposal row.search.nodes");
  const leaves = safeInteger(
    search.leaves,
    "stable proposal row.search.leaves",
  );
  if (
    rawSearchScore < -FLOODGATE_STABLE_MATE_SCORE_MAX ||
    rawSearchScore > FLOODGATE_STABLE_MATE_SCORE_MAX ||
    nodes > 2_147_483_647 ||
    leaves > 2_147_483_647 ||
    nodes + leaves === 0
  ) {
    fail("stable proposal search counters or score are invalid");
  }
  if (
    search.termination === "winning-mate-band-early" &&
    !(
      completedDepth < FLOODGATE_STABLE_REQUESTED_DEPTH &&
      rawSearchScore >= FLOODGATE_STABLE_MATE_SCORE_MIN &&
      rawSearchScore <= FLOODGATE_STABLE_MATE_SCORE_MAX
    )
  ) {
    fail(
      "stable proposal early termination is not a positive mate-band result",
    );
  }
  exact(search.root_tesu, parent.ply, "stable proposal row.search.root_tesu");
  exact(
    search.score_encoding,
    FLOODGATE_STABLE_WASM_SCORE_ENCODING,
    "stable proposal row.search.score_encoding",
  );
  const stableProjection = frozenRecord({
    schema: row.schema,
    game_id: row.game_id,
    parent_id: row.parent_id,
    position_id: row.position_id,
    parent_payload_sha256: row.parent_payload_sha256,
    stable_move: move,
    child_sfen: childSfen,
    child_position_id: row.child_position_id,
    search: frozenRecord({
      requested_depth: search.requested_depth,
      completed_depth: completedDepth,
      termination: search.termination,
      raw_search_score: rawSearchScore,
      score_encoding: search.score_encoding,
      nodes,
      leaves,
      root_tesu: search.root_tesu,
    }),
  });
  return frozenRecord({
    move,
    rowSha256: digestCanonical(STABLE_ROW_DIGEST_DOMAIN, stableProjection),
  });
}

function validateExactRecordValues(
  value: unknown,
  keys: readonly string[],
  expected: Readonly<Record<string, unknown>>,
  label: string,
): Readonly<Record<string, unknown>> {
  const record = strictRecord(value, keys, label);
  for (const key of keys) exact(record[key], expected[key], `${label}.${key}`);
  return record;
}

function validateSnapshotFile(
  value: unknown,
  mode: "0500" | "0400",
  label: string,
): Readonly<Record<string, unknown>> {
  const file = strictRecord(value, SNAPSHOT_FILE_KEYS, label);
  safeInteger(file.bytes, `${label}.bytes`, 1);
  if (typeof file.sha256 !== "string" || !SHA256.test(file.sha256)) {
    fail(`${label}.sha256 is invalid`);
  }
  exact(file.mode, mode, `${label}.mode`);
  return file;
}

function captureRuntimeReceipt(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const receipt = strictRecord(value, RUNTIME_RECEIPT_KEYS, "runtime receipt");
  exact(
    receipt.contract,
    FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    "runtime receipt.contract",
  );
  exact(
    receipt.status,
    FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    "runtime receipt.status",
  );
  exact(
    receipt.claim_boundary,
    FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    "runtime receipt.claim_boundary",
  );
  exact(
    receipt.execution_boundary,
    "production-fixed-assets-and-runtime-dependencies",
    "runtime receipt.execution_boundary",
  );
  exact(
    receipt.asset_authority_execution_boundary,
    "production-fixed-registry-and-deployment-root",
    "runtime receipt.asset_authority_execution_boundary",
  );
  exact(
    receipt.engine_id,
    FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    "runtime receipt.engine_id",
  );
  const runtime = validateExactRecordValues(
    receipt.runtime,
    RUNTIME_KEYS,
    {
      engine_count: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines,
      threads_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.threads_per_engine,
      hash_mb_per_engine:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.hash_mb_per_engine,
      fv_scale: 20,
      depth: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      proposal_multipv_max:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
      independent_rescore_multipv:
        FLOODGATE_PRODUCTION_TEACHER_RUNTIME.independent_rescore.multipv,
      no_process_arguments: true,
      shell: false,
      minimal_environment: true,
      per_worker_private_directories: true,
      queue_bound: FLOODGATE_PRODUCTION_TEACHER_RUNTIME.parallel_engines * 4,
    },
    "runtime receipt.runtime",
  );
  const fixedOptions = strictArray(
    receipt.fixed_options,
    "runtime receipt.fixed_options",
    FIXED_OPTIONS.length,
  );
  if (
    fixedOptions.length !== FIXED_OPTIONS.length ||
    fixedOptions.some((option, index) => option !== FIXED_OPTIONS[index])
  ) {
    fail("runtime receipt.fixed_options differs from the pinned transcript");
  }
  const timeouts = validateExactRecordValues(
    receipt.timeouts,
    TIMEOUT_KEYS,
    {
      usiMs: 15_000,
      readyMs: 120_000,
      searchMs: 600_000,
      termGraceMs: 500,
      killGraceMs: 1_000,
    },
    "runtime receipt.timeouts",
  );
  const limits = validateExactRecordValues(
    receipt.limits,
    LIMIT_KEYS,
    {
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536,
      stderrBytesTotal: 8 * 1024 * 1024,
    },
    "runtime receipt.limits",
  );
  const snapshot = strictRecord(
    receipt.snapshot,
    SNAPSHOT_KEYS,
    "runtime receipt.snapshot",
  );
  exact(
    snapshot.one_shared_private_snapshot,
    true,
    "runtime receipt.snapshot.one_shared_private_snapshot",
  );
  exact(
    snapshot.source_authority_revalidated,
    true,
    "runtime receipt.snapshot.source_authority_revalidated",
  );
  exact(
    snapshot.destination_revalidated,
    true,
    "runtime receipt.snapshot.destination_revalidated",
  );
  const engine = validateSnapshotFile(
    snapshot.engine,
    "0500",
    "runtime receipt.snapshot.engine",
  );
  const evaluation = validateSnapshotFile(
    snapshot.eval,
    "0400",
    "runtime receipt.snapshot.eval",
  );
  const runtimeProjection = frozenRecord({
    engine_count: runtime.engine_count,
    threads_per_engine: runtime.threads_per_engine,
    hash_mb_per_engine: runtime.hash_mb_per_engine,
    fv_scale: runtime.fv_scale,
    depth: runtime.depth,
    proposal_multipv_max: runtime.proposal_multipv_max,
    independent_rescore_multipv: runtime.independent_rescore_multipv,
    no_process_arguments: runtime.no_process_arguments,
    shell: runtime.shell,
    minimal_environment: runtime.minimal_environment,
    per_worker_private_directories: runtime.per_worker_private_directories,
    queue_bound: runtime.queue_bound,
  });
  const fixedOptionsProjection = frozenList(
    fixedOptions.map((option) => option as string),
  );
  const timeoutsProjection = frozenRecord({
    usiMs: timeouts.usiMs,
    readyMs: timeouts.readyMs,
    searchMs: timeouts.searchMs,
    termGraceMs: timeouts.termGraceMs,
    killGraceMs: timeouts.killGraceMs,
  });
  const limitsProjection = frozenRecord({
    lineBytes: limits.lineBytes,
    stdoutBytesPerPhase: limits.stdoutBytesPerPhase,
    stdoutLinesPerPhase: limits.stdoutLinesPerPhase,
    stderrBytesTotal: limits.stderrBytesTotal,
  });
  const snapshotProjection = frozenRecord({
    one_shared_private_snapshot: snapshot.one_shared_private_snapshot,
    source_authority_revalidated: snapshot.source_authority_revalidated,
    destination_revalidated: snapshot.destination_revalidated,
    engine: frozenRecord({
      bytes: engine.bytes,
      sha256: engine.sha256,
      mode: engine.mode,
    }),
    eval: frozenRecord({
      bytes: evaluation.bytes,
      sha256: evaluation.sha256,
      mode: evaluation.mode,
    }),
  });
  const receiptProjection = frozenRecord({
    contract: receipt.contract,
    status: receipt.status,
    claim_boundary: receipt.claim_boundary,
    execution_boundary: receipt.execution_boundary,
    asset_authority_execution_boundary:
      receipt.asset_authority_execution_boundary,
    engine_id: receipt.engine_id,
    runtime: runtimeProjection,
    fixed_options: fixedOptionsProjection,
    timeouts: timeoutsProjection,
    limits: limitsProjection,
    snapshot: snapshotProjection,
  });
  return frozenRecord({
    runtime_receipt_sha256: digestCanonical(
      RUNTIME_RECEIPT_DIGEST_DOMAIN,
      receiptProjection,
    ),
    contract: receipt.contract,
    status: receipt.status,
    claim_boundary: receipt.claim_boundary,
    execution_boundary: receipt.execution_boundary,
    asset_authority_execution_boundary:
      receipt.asset_authority_execution_boundary,
    engine_id: receipt.engine_id,
    runtime: frozenRecord({
      engine_count: runtime.engine_count,
      threads_per_engine: runtime.threads_per_engine,
      hash_mb_per_engine: runtime.hash_mb_per_engine,
      fv_scale: runtime.fv_scale,
      depth: runtime.depth,
      proposal_multipv_max: runtime.proposal_multipv_max,
      independent_rescore_multipv: runtime.independent_rescore_multipv,
    }),
    fixed_options: fixedOptionsProjection,
    snapshot: frozenRecord({
      engine: frozenRecord({
        bytes: engine.bytes,
        sha256: engine.sha256,
        mode: engine.mode,
      }),
      eval: frozenRecord({
        bytes: evaluation.bytes,
        sha256: evaluation.sha256,
        mode: evaluation.mode,
      }),
    }),
    plain_object_production_authentication_claim: false,
  });
}

function captureProposal(
  value: unknown,
  legal: readonly string[],
): Readonly<{
  readonly moves: readonly string[];
  readonly binding: Readonly<Record<string, unknown>>;
}> {
  const proposal = strictRecord(value, PROPOSAL_KEYS, "runtime proposal");
  const requested = Math.min(
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.multipv,
    legal.length,
  );
  exact(
    proposal.requested_multipv,
    requested,
    "runtime proposal.requested_multipv",
  );
  exact(
    proposal.depth,
    FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
    "runtime proposal.depth",
  );
  exact(
    proposal.reset_before_search,
    true,
    "runtime proposal.reset_before_search",
  );
  const legalEvidence = strictRecord(
    proposal.legal_move_count_evidence,
    PROPOSAL_LEGAL_KEYS,
    "runtime proposal.legal_move_count_evidence",
  );
  exact(
    legalEvidence.source,
    "caller-supplied-until-authenticated-by-v7-coordinator",
    "runtime proposal.legal_move_count_evidence.source",
  );
  exact(
    legalEvidence.count,
    legal.length,
    "runtime proposal.legal_move_count_evidence.count",
  );
  const lines = strictArray(proposal.lines, "runtime proposal.lines", 12);
  if (lines.length !== requested)
    fail("runtime proposal line count is not exact");
  const moves: string[] = [];
  const capturedLines: Readonly<Record<string, unknown>>[] = [];
  let maximumNodes = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const preliminary = strictDataRecord(
      lines[index],
      `runtime proposal.lines[${index}]`,
    );
    const scoreKind = preliminary.scoreKind;
    const line = strictRecord(
      lines[index],
      scoreKind === "mate" ? LINE_MATE_KEYS : LINE_CP_KEYS,
      `runtime proposal.lines[${index}]`,
    );
    if (scoreKind !== "cp" && scoreKind !== "mate") {
      fail(`runtime proposal.lines[${index}].scoreKind is invalid`);
    }
    exact(
      line.depth,
      FLOODGATE_PRODUCTION_TEACHER_RUNTIME.proposal.depth,
      `runtime proposal.lines[${index}].depth`,
    );
    exact(line.multipv, index + 1, `runtime proposal.lines[${index}].multipv`);
    const nodes = safeInteger(
      line.nodes,
      `runtime proposal.lines[${index}].nodes`,
    );
    maximumNodes = Math.max(maximumNodes, nodes);
    const move = canonicalMove(
      line.move,
      `runtime proposal.lines[${index}].move`,
    );
    if (!legal.includes(move)) {
      fail(`runtime proposal.lines[${index}].move is not rules-complete legal`);
    }
    if (moves.includes(move))
      fail("runtime proposal contains duplicate root moves");
    const pv = strictArray(
      line.pv,
      `runtime proposal.lines[${index}].pv`,
      1_024,
    );
    if (pv.length < 1 || pv[0] !== move) {
      fail(`runtime proposal.lines[${index}].pv does not start with its move`);
    }
    for (let pvIndex = 0; pvIndex < pv.length; pvIndex += 1) {
      canonicalMove(
        pv[pvIndex],
        `runtime proposal.lines[${index}].pv[${pvIndex}]`,
      );
    }
    if (!Number.isSafeInteger(line.cp)) {
      fail(`runtime proposal.lines[${index}].cp is invalid`);
    }
    const cp = Object.is(line.cp, -0) ? 0 : (line.cp as number);
    let mate: number | undefined;
    if (scoreKind === "cp") {
      if (Math.abs(cp) > MAX_NON_MATE_CP) {
        fail(`runtime proposal.lines[${index}].cp exceeds the non-mate bound`);
      }
    } else {
      mate = Object.is(line.mate, -0) ? 0 : (line.mate as number);
      if (
        !Number.isSafeInteger(line.mate) ||
        (line.mateSign !== 1 && line.mateSign !== -1) ||
        cp !== mateToCp(mate, line.mateSign as 1 | -1)
      ) {
        fail(`runtime proposal.lines[${index}] mate score is inconsistent`);
      }
    }
    moves.push(move);
    capturedLines.push(
      scoreKind === "cp"
        ? frozenRecord({
            depth: line.depth,
            multipv: line.multipv,
            cp,
            nodes,
            move,
            pv: frozenList(pv.map((entry) => entry as string)),
            scoreKind: "cp" as const,
          })
        : frozenRecord({
            depth: line.depth,
            multipv: line.multipv,
            cp,
            nodes,
            move,
            pv: frozenList(pv.map((entry) => entry as string)),
            scoreKind: "mate" as const,
            mate: mate as number,
            mateSign: line.mateSign,
          }),
    );
  }
  const bestmove = canonicalMove(
    proposal.bestmove,
    "runtime proposal.bestmove",
  );
  if (bestmove !== moves[0]) fail("runtime proposal bestmove differs from PV1");
  exact(proposal.observedNodes, maximumNodes, "runtime proposal.observedNodes");
  const frozenMoves = frozenList(moves);
  const resultProjection = frozenRecord({
    depth: proposal.depth,
    lines: frozenList(capturedLines),
    bestmove,
    observedNodes: maximumNodes,
    requested_multipv: requested,
    legal_move_count_evidence: frozenRecord({
      source: legalEvidence.source,
      count: legalEvidence.count,
    }),
    reset_before_search: true as const,
    completion: "requested-depth-complete" as const,
  });
  return frozenRecord({
    moves: frozenMoves,
    binding: frozenRecord({
      requested_multipv: requested,
      depth: proposal.depth,
      line_count: lines.length,
      bestmove,
      observed_nodes: maximumNodes,
      root_moves_sha256: digestLineList(
        PROPOSAL_ROOT_MOVES_DIGEST_DOMAIN,
        frozenMoves,
      ),
      proposal_result_sha256: digestCanonical(
        PROPOSAL_RESULT_DIGEST_DOMAIN,
        resultProjection,
      ),
      reset_before_search: true,
      result_authentication_claim: false,
    }),
  });
}

function captureRuntime(
  value: unknown,
  legal: readonly string[],
): CapturedRuntime {
  const input = strictRecord(value, RUNTIME_INPUT_KEYS, "runtime input");
  const receipt = captureRuntimeReceipt(input.receipt);
  const proposal = captureProposal(input.proposal, legal);
  return frozenRecord({
    proposalMoves: proposal.moves,
    runtimeReceiptSha256: receipt.runtime_receipt_sha256 as string,
    proposalResultSha256: proposal.binding.proposal_result_sha256 as string,
    binding: frozenRecord({
      receipt,
      proposal: proposal.binding,
    }),
  });
}

function parentBinding(parent: CapturedParent): Readonly<ParentBinding> {
  return frozenRecord({
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_sfen: parent.parent_sfen,
    ply: parent.ply,
    parent_payload_sha256: parent.parent_payload_sha256,
  });
}

function legalBinding(legal: readonly string[]): Readonly<LegalBinding> {
  return frozenRecord({
    source: "core-rederived-rules-complete-legal-moves-v1" as const,
    caller_evidence_cross_checked: true as const,
    count: legal.length,
    moves_sha256: digestLineList(LEGAL_MOVES_DIGEST_DOMAIN, legal),
  });
}

/**
 * Validate and union one parent's proposal/played/stable candidates.
 *
 * This test core is intentionally synchronous so every caller-owned value is
 * captured before control can return. It emits no score and performs no
 * independent rescore; every non-forced candidate therefore remains pending.
 */
export function buildFloodgateV7CandidateUnionCoreForTests(
  inputValue: FloodgateV7CandidateUnionInput,
): Readonly<FloodgateV7CandidateUnionReceipt> {
  const input = strictRecord(inputValue, INVOCATION_KEYS, "input");
  const parent = captureParent(input.parent);
  const legal = captureLegal(input.legal, parent);
  const capturedStable = captureStable(input.stable, parent, legal);
  const stableMove = capturedStable.move;
  const parentOutput = parentBinding(parent);
  const legalOutput = legalBinding(legal);
  const stableOutput = frozenRecord({
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    parent_payload_sha256: parent.parent_payload_sha256,
    stable_move: stableMove,
    stable_row_sha256: capturedStable.rowSha256,
    plain_object_stable_authentication_claim: false as const,
  });

  if (legal.length < 2) {
    if (input.runtime !== null) {
      fail("forced parent must skip the production proposal runtime");
    }
    const forcedMove = legal[0];
    if (parent.played_move !== forcedMove || stableMove !== forcedMove) {
      fail("forced parent played/stable moves must equal the sole legal move");
    }
    return frozenRecord({
      schema: FLOODGATE_V7_CANDIDATE_UNION_SCHEMA,
      status: FLOODGATE_V7_CANDIDATE_UNION_SKIP_STATUS,
      claim_boundary: FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY,
      input_authentication_claim: false as const,
      parent: parentOutput,
      legal: legalOutput,
      stable_binding: stableOutput,
      runtime_binding: null,
      candidates: frozenList([]) as readonly [],
      candidate_union_sha256: digestCanonical(
        CANDIDATE_UNION_DIGEST_DOMAIN,
        frozenRecord({
          parent_id: parent.parent_id,
          parent_payload_sha256: parent.parent_payload_sha256,
          legal_moves_sha256: legalOutput.moves_sha256,
          stable_row_sha256: capturedStable.rowSha256,
          state: "skipped-forced" as const,
          candidates: frozenList([]),
        }),
      ),
      skip: frozenRecord({
        reason: "fewer-than-two-rules-complete-legal-moves" as const,
        forced_move: forcedMove,
        played_move_matches_forced_move: true as const,
        stable_move_matches_forced_move: true as const,
        proposal_search_performed: false as const,
        independent_rescore_required: false as const,
        teacher_labels_emitted: 0 as const,
      }),
    });
  }

  if (input.runtime === null) {
    fail("non-forced parent requires a production-shaped runtime proposal");
  }
  const runtime = captureRuntime(input.runtime, legal);
  const byMove = new Map<
    string,
    { proposalRank: number | null; played: boolean; stable: boolean }
  >();
  for (let index = 0; index < runtime.proposalMoves.length; index += 1) {
    byMove.set(runtime.proposalMoves[index], {
      proposalRank: index + 1,
      played: false,
      stable: false,
    });
  }
  const played = byMove.get(parent.played_move) ?? {
    proposalRank: null,
    played: false,
    stable: false,
  };
  played.played = true;
  byMove.set(parent.played_move, played);
  const stable = byMove.get(stableMove) ?? {
    proposalRank: null,
    played: false,
    stable: false,
  };
  stable.stable = true;
  byMove.set(stableMove, stable);

  const candidates = frozenList(
    [...byMove.keys()].sort(compareBytewise).map((move) => {
      const provenance = byMove.get(move);
      if (provenance === undefined) fail("candidate provenance disappeared");
      const childSfen = childSfenAfterUsi(parent.parent_sfen, move);
      return frozenRecord({
        move,
        child_sfen: childSfen,
        child_position_id: positionKeyFromSfen(childSfen),
        proposal_rank: provenance.proposalRank,
        provenance: frozenRecord({
          production_proposal: provenance.proposalRank !== null,
          strong_game_played: provenance.played,
          stable_policy: provenance.stable,
        }),
        independent_rescore: "required-not-yet-run" as const,
      });
    }),
  );
  const candidateUnionSha256 = digestCanonical(
    CANDIDATE_UNION_DIGEST_DOMAIN,
    frozenRecord({
      parent_id: parent.parent_id,
      parent_payload_sha256: parent.parent_payload_sha256,
      legal_moves_sha256: legalOutput.moves_sha256,
      stable_row_sha256: capturedStable.rowSha256,
      runtime_receipt_sha256: runtime.runtimeReceiptSha256,
      proposal_result_sha256: runtime.proposalResultSha256,
      state: "awaiting-independent-rescores" as const,
      candidates,
    }),
  );
  return frozenRecord({
    schema: FLOODGATE_V7_CANDIDATE_UNION_SCHEMA,
    status: FLOODGATE_V7_CANDIDATE_UNION_PENDING_STATUS,
    claim_boundary: FLOODGATE_V7_CANDIDATE_UNION_CLAIM_BOUNDARY,
    input_authentication_claim: false as const,
    parent: parentOutput,
    legal: legalOutput,
    runtime_binding: runtime.binding,
    stable_binding: stableOutput,
    candidates,
    candidate_union_sha256: candidateUnionSha256,
    completion: frozenRecord({
      state: "incomplete" as const,
      independent_rescores_required: candidates.length,
      independent_rescores_completed: 0 as const,
      teacher_labels_emitted: 0 as const,
    }),
  });
}
