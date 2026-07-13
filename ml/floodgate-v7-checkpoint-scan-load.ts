/**
 * Standalone, test-only semantic load harness for the v7 checkpoint scanner.
 *
 * It generates deterministic legal positions from synthetic playouts and never
 * accepts a dataset path. The fresh fixture-build child suppresses per-line
 * regular-file fsync calls, restores the native method, and batch-syncs the
 * completed file once. Its checkpoint receipt is deliberately discarded. A
 * separate child then reopens the sealed stream with native sync enabled and a
 * producer that must never run, exercising the production resumable-prefix and
 * sealed-final scanners through their existing public test API.
 */

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import {
  FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  type FloodgateRoleBundleRawIdentity,
  type FloodgateRoleBundleRawParent,
} from "./floodgate-role-bundle";
import {
  FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY,
  FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
  type VerifiedPinnedFloodgateRoleBundle,
} from "./floodgate-role-bundle-result";
import { floodgateCanonicalUrlGameId } from "./floodgate-raw-lock";
import { floodgateIdentifierDigest } from "./floodgate-roles";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
} from "./floodgate-production-stable-wasm-runtime";
import { FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY } from "./floodgate-production-teacher-asset-authority";
import {
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
  FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
  type FloodgateProductionTeacherRescoreResult,
} from "./floodgate-production-teacher-usi-runtime";
import {
  FLOODGATE_STABLE_MAX_ROWS,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
  FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
  FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
} from "./floodgate-stable-wasm-proposer";
import {
  FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  authorizeFloodgateTeacherStageCoreForTests,
  type FloodgateTeacherStageAuthorizationOptions,
} from "./floodgate-teacher-stage-authorization";
import {
  FLOODGATE_TRAINING_RAW_FILENAME,
  FLOODGATE_TRAINING_RAW_MAX_BYTES,
  withVerifiedPinnedFloodgateTrainingRowsCoreForTests,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingParent,
  type FloodgateTrainingRowConsumerDependencies,
  type FloodgateTrainingRowConsumerOptions,
} from "./floodgate-training-row-consumer";
import {
  FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
  FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
  buildFloodgateV7CandidateUnionCoreForTests,
  type FloodgateV7CandidateUnionInput,
} from "./floodgate-v7-candidate-union";
import type { FloodgateV7CompletedParentInput } from "./floodgate-v7-completed-parent";
import {
  FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
  FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
  FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
  FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
  FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
  FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
  checkpointFloodgateV7TeacherParentsCoreForTests,
  checkpointFloodgateV7TeacherParentsV3CoreForTests,
  type FloodgateV7TeacherCheckpointDependencies,
  type FloodgateV7TeacherCheckpointRunBinding,
  type FloodgateV7TeacherCheckpointV3Dependencies,
  type FloodgateV7TeacherCheckpointV3Gate,
  type FloodgateV7TeacherCheckpointV3Receipt,
  type FloodgateV7TeacherMissingParentRequest,
} from "./floodgate-v7-teacher-checkpoint";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import { compareBytewise, positionKeyFromSfen } from "./sibling-data";
import { OU, getKomashu } from "../src/components/game/ShogiImproved/types";

export const FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA =
  "shogi-floodgate-v7-checkpoint-semantic-scan-load-v2" as const;
export const FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS =
  "complete-synthetic-v2-checkpoint-semantic-resume-and-final-scan-evidence" as const;
export const FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_CLAIM_BOUNDARY =
  "synthetic-holdout-free-v2-checkpoint-and-authenticated-producer-control-scanner-load-only-fresh-build-receipt-discarded-native-sync-restored-before-evidence-scan-not-teacher-label-training-weight-or-playing-strength-evidence" as const;
export const FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_SCHEMA =
  "shogi-floodgate-v7-checkpoint-semantic-scan-load-v3" as const;
export const FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_STATUS =
  "complete-synthetic-v3-fixed-gates-semantic-resume-and-final-scan-evidence" as const;
export const FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_CLAIM_BOUNDARY =
  "synthetic-holdout-free-v3-fixed-100-500-24000-gates-checkpoint-and-authenticated-producer-control-scanner-load-only-suppressed-build-receipt-durability-evidence-discarded-receipt-derived-gate-summaries-non-evidence-native-sync-restored-before-sealed-final-retry-evidence-not-teacher-label-training-weight-or-playing-strength-evidence" as const;

const START_SFEN =
  "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1";
const PRODUCER_REVISION = "a".repeat(40);
const VERIFIER_REVISION = "b".repeat(40);
const RUN_ID = "12".repeat(32);
const KEY_ID = "synthetic-v7-scan-load-key-1";
const ROOT_KEY_BYTE = 0x4b;
const CHILD_OUTPUT_MAX_BYTES = 2 * 1024 * 1024;
const CHILD_TIMEOUT_MS = 30 * 60 * 1000;
const READ_CHUNK_BYTES = 64 * 1024;
const MODE_TYPE_MASK = fs.constants.S_IFMT;
const MODE_REGULAR = fs.constants.S_IFREG;
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPOSITORY_ROOT = path.dirname(path.dirname(SCRIPT_PATH));
const REQUIRED_NODE_VERSION = "v22.13.0";
const CAPABILITY_ENV = "FLOODGATE_V7_SCAN_LOAD_CAPABILITY";
const ROOT_ENV = "FLOODGATE_V7_SCAN_LOAD_ROOT";
const CAPABILITY_FILENAME = ".v7-scan-load-capability";
const CAPABILITY_RE = /^[0-9a-f]{64}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;

export interface FloodgateV7CheckpointScanLoadGeneratedParent {
  readonly parent: Readonly<FloodgateTrainingParent>;
  readonly stableMove: string;
  readonly sourceUrl: string;
  readonly gameSha256: string;
}

type GeneratedParent = FloodgateV7CheckpointScanLoadGeneratedParent;

interface HarnessFixture {
  readonly root: string;
  readonly stageRoot: string;
  readonly trainingPath: string;
  readonly identity: Readonly<FloodgateRoleBundleRawIdentity>;
  readonly trainingOptions: FloodgateTrainingRowConsumerOptions;
  readonly authorization: FloodgateTeacherStageAuthorizationOptions;
}

interface LineStatistics {
  readonly records: number;
  readonly header_bytes: number;
  readonly entries: number;
  readonly entry_bytes_total: number;
  readonly entry_bytes_min: number;
  readonly entry_bytes_max: number;
  readonly entry_bytes_mean: number;
  readonly seal_bytes: number;
  readonly maximum_line_bytes: number;
}

interface ReadMeasurements {
  readonly calls: Record<"resumable-prefix" | "sealed-final", number>;
  readonly bytes: Record<"resumable-prefix" | "sealed-final", number>;
  readonly maximum_request_bytes: Record<
    "resumable-prefix" | "sealed-final",
    number
  >;
  readonly first_ms: Partial<
    Record<"resumable-prefix" | "sealed-final", number>
  >;
}

interface BuildChildResult {
  readonly phase: "fixture-build-non-evidence";
  readonly node: typeof REQUIRED_NODE_VERSION;
  readonly parents: number;
  readonly games: number;
  readonly candidates_per_parent: 14;
  readonly raw: Readonly<{ bytes: number; sha256: string }>;
  readonly work: Readonly<{
    bytes: number;
    sha256: string;
    line_statistics: Readonly<LineStatistics>;
  }>;
  readonly sync: Readonly<{
    suppressed_per_line_regular_file_syncs: number;
    expected_suppressed_syncs: number;
    native_method_restored_before_batch_sync: true;
    one_work_batch_sync_completed: true;
    one_stage_directory_batch_sync_completed: true;
  }>;
  readonly timing: Readonly<{
    generation_wall_ms: number;
    fixture_wall_ms: number;
    checkpoint_build_wall_ms: number;
    batch_sync_and_measure_wall_ms: number;
  }>;
  readonly memory: Readonly<{
    baseline_rss_bytes: number;
    final_rss_bytes: number;
    resource_max_rss_bytes: number;
  }>;
}

interface ScanChildResult {
  readonly phase: "native-resume-and-final-scan-evidence";
  readonly node: typeof REQUIRED_NODE_VERSION;
  readonly parents: number;
  readonly producer_calls: 0;
  readonly completed_parents: number;
  readonly resumed_parents: number;
  readonly work: Readonly<{
    bytes: number;
    receipt_sha256: string;
    independent_sha256: string;
    sha256_match: true;
  }>;
  readonly reads: Readonly<ReadMeasurements>;
  readonly timing: Readonly<{
    total_checkpoint_wall_ms: number;
    resumable_prefix_start_to_final_scan_start_wall_ms: number;
    sealed_final_scan_start_to_receipt_wall_ms: number;
    independent_sha256_wall_ms: number;
  }>;
  readonly memory: Readonly<{
    baseline_rss_bytes: number;
    final_rss_bytes: number;
    resource_max_rss_bytes: number;
    sampled_peak_rss_bytes: number;
  }>;
}

interface V3LineStatistics {
  readonly records: number;
  readonly header_bytes: number;
  readonly entries: number;
  readonly entry_bytes_total: number;
  readonly entry_bytes_min: number;
  readonly entry_bytes_max: number;
  readonly entry_bytes_mean: number;
  readonly milestones: 2;
  readonly milestone_100_bytes: number;
  readonly milestone_500_bytes: number;
  readonly milestone_bytes_total: number;
  readonly seal_bytes: number;
  readonly maximum_line_bytes: number;
}

interface ObservedLengthSummary {
  readonly total: number;
  readonly minimum: number;
  readonly maximum: number;
}

interface V3ProducerRange {
  readonly calls: number;
  readonly first_input_index: number;
  readonly last_input_index: number;
}

interface V3GateProgress {
  readonly gate: FloodgateV7TeacherCheckpointV3Gate;
  readonly status:
    | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
    | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS;
  readonly sealed: boolean;
  readonly target_parents: number;
  readonly completed_parents: number;
  readonly resumed_parents: number;
  readonly records: number;
  readonly bytes: number;
  readonly sha256: string;
  readonly milestone_100_mac: string;
  readonly milestone_500_mac: string | null;
  readonly producer: Readonly<V3ProducerRange>;
}

interface V3BuildChildResult {
  readonly phase: "fixture-v3-three-gate-build-non-evidence";
  readonly node: typeof REQUIRED_NODE_VERSION;
  readonly parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly games: number;
  readonly candidates_per_parent: 14;
  readonly raw: Readonly<{ bytes: number; sha256: string }>;
  readonly gates: readonly [
    Readonly<V3GateProgress>,
    Readonly<V3GateProgress>,
    Readonly<V3GateProgress>,
  ];
  readonly work: Readonly<{
    bytes: number;
    sha256: string;
    line_statistics: Readonly<V3LineStatistics>;
  }>;
  readonly sync: Readonly<{
    suppressed_regular_file_syncs: number;
    expected_suppressed_regular_file_syncs: number;
    line_syncs: number;
    expected_line_syncs: number;
    pre_resume_syncs: number;
    expected_pre_resume_syncs: number;
    native_method_restored_before_batch_sync: true;
    one_work_batch_sync_completed: true;
    one_stage_directory_batch_sync_completed: true;
  }>;
  readonly timing: Readonly<{
    generation_wall_ms: number;
    fixture_wall_ms: number;
    durable_prefix_100_wall_ms: number;
    durable_prefix_500_wall_ms: number;
    sealed_final_24000_wall_ms: number;
    batch_sync_and_measure_wall_ms: number;
  }>;
  readonly memory: BuildChildResult["memory"];
}

interface V3ScanChildResult {
  readonly phase: "native-v3-sealed-final-retry-evidence";
  readonly node: typeof REQUIRED_NODE_VERSION;
  readonly parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly gate: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000;
  readonly status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS;
  readonly sealed: true;
  readonly producer_calls: 0;
  readonly completed_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly resumed_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly work: Readonly<{
    records: number;
    target_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
    training_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
    milestone_100_mac: string;
    milestone_500_mac: string;
    bytes: number;
    receipt_sha256: string;
    independent_sha256: string;
    sha256_match: true;
  }>;
  readonly reads: Readonly<ReadMeasurements>;
  readonly timing: ScanChildResult["timing"];
  readonly memory: ScanChildResult["memory"];
}

export interface FloodgateV7CheckpointScanLoadOptions {
  readonly parents: number;
  readonly keepFixture?: boolean;
}

export interface FloodgateV7CheckpointScanLoadResult {
  readonly schema: typeof FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA;
  readonly status: typeof FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_CLAIM_BOUNDARY;
  readonly checkpoint_identity: Readonly<{
    schema: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA;
    status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS;
    claim_boundary: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY;
    algorithm: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM;
    run_binding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
    teacher_usi_runtime: Readonly<{
      contract: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT;
      status: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS;
      claim_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY;
    }>;
  }>;
  readonly data: Readonly<{
    source: "deterministic-synthetic-standard-position-legal-playouts";
    public_dataset_paths_accepted: false;
    network_reads: false;
    parents: number;
    games: number;
    unique_parent_ids: true;
    unique_position_ids: true;
    candidates_per_parent: 14;
  }>;
  readonly bounds: Readonly<{
    theoretical_rejection_cap_bytes: number;
    theoretical_rejection_cap_classification: "conservative-cap-not-valid-stream-size";
    maximum_line_bytes: number;
    maximum_parents: number;
  }>;
  readonly valid_stream: Readonly<{
    actual_bytes: number;
    actual_sha256: string;
    line_statistics: Readonly<LineStatistics>;
    actual_is_not_theoretical_cap: true;
  }>;
  readonly fixture_build: Readonly<{
    classification: "non-evidence-build-receipt-discarded";
    raw: BuildChildResult["raw"];
    sync: BuildChildResult["sync"];
    timing: BuildChildResult["timing"];
    memory: BuildChildResult["memory"];
  }>;
  readonly native_scan: Omit<ScanChildResult, "node" | "parents" | "phase">;
  readonly runtime: Readonly<{
    node: string;
    build_child_node: typeof REQUIRED_NODE_VERSION;
    scan_child_node: typeof REQUIRED_NODE_VERSION;
    platform: NodeJS.Platform;
    architecture: string;
    logical_cpus: number;
  }>;
  readonly preserved_fixture_root?: string;
}

export interface FloodgateV7CheckpointV3ScanLoadOptions {
  readonly parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  readonly keepFixture?: boolean;
}

export interface FloodgateV7CheckpointV3ScanLoadResult {
  readonly schema: typeof FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_SCHEMA;
  readonly status: typeof FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_STATUS;
  readonly claim_boundary: typeof FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_CLAIM_BOUNDARY;
  readonly checkpoint_identity: Readonly<{
    schema: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA;
    status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS;
    prefix_status: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS;
    claim_boundary: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY;
    algorithm: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM;
    gate_contract: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT;
    format: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT;
    durability: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY;
    run_id: typeof RUN_ID;
    key_id: typeof KEY_ID;
    run_binding: Readonly<FloodgateV7TeacherCheckpointRunBinding>;
    teacher_usi_runtime: Readonly<{
      contract: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT;
      status: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS;
      claim_boundary: typeof FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY;
    }>;
  }>;
  readonly data: Readonly<{
    source: "deterministic-synthetic-standard-position-legal-playouts";
    public_dataset_paths_accepted: false;
    network_reads: false;
    parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
    games: number;
    unique_parent_ids: true;
    unique_position_ids: true;
    candidates_per_parent: 14;
  }>;
  readonly bounds: Readonly<{
    theoretical_rejection_cap_bytes: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES;
    theoretical_rejection_cap_classification: "conservative-cap-not-valid-stream-size";
    maximum_line_bytes: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES;
    maximum_parents: typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  }>;
  readonly valid_stream: Readonly<{
    actual_bytes: number;
    actual_sha256: string;
    line_statistics: Readonly<V3LineStatistics>;
    actual_is_not_theoretical_cap: true;
  }>;
  readonly fixture_build: Readonly<{
    classification: "receipt-derived-three-gate-build-summary-not-durability-evidence";
    full_authenticated_input_reused_at_all_gates: true;
    fresh_lease_and_training_claim_per_gate: true;
    same_private_root_stage_and_run_at_all_gates: true;
    raw: V3BuildChildResult["raw"];
    gate_progress: Readonly<{
      "durable-prefix-100": Readonly<V3GateProgress>;
      "durable-prefix-500": Readonly<V3GateProgress>;
      "sealed-final-24000": Readonly<V3GateProgress>;
    }>;
    sync: V3BuildChildResult["sync"];
    timing: V3BuildChildResult["timing"];
    memory: V3BuildChildResult["memory"];
  }>;
  readonly native_scan: Omit<V3ScanChildResult, "node" | "parents" | "phase"> &
    Readonly<{ work_unchanged_since_build: true }>;
  readonly runtime: Readonly<{
    node: string;
    build_child_node: typeof REQUIRED_NODE_VERSION;
    scan_child_node: typeof REQUIRED_NODE_VERSION;
    platform: NodeJS.Platform;
    architecture: string;
    logical_cpus: number;
  }>;
  readonly preserved_fixture_root?: string;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("fixture is not JSON data");
    return encoded;
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort(compareBytewise)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function xorshift32(value: number): number {
  let output = value | 0;
  output ^= output << 13;
  output ^= output >>> 17;
  output ^= output << 5;
  return output >>> 0;
}

/** Test seam for the synthetic CSA URL's monotonically increasing time. */
export function buildFloodgateV7ScanLoadSourceUrlCoreForTests(
  game: number,
): string {
  if (!Number.isSafeInteger(game) || game < 0 || game >= 24 * 60 * 60) {
    throw new Error("synthetic scan-load game must fit one UTC day");
  }
  const hours = Math.floor(game / 3_600);
  const minutes = Math.floor((game % 3_600) / 60);
  const seconds = game % 60;
  const hhmmss = `${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}${String(seconds).padStart(2, "0")}`;
  return `https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/01/01/wdoor+floodgate-300-10F+synthetic-load-a+synthetic-load-b+20260101${hhmmss}.csa`;
}

function sourceUrl(game: number): string {
  return buildFloodgateV7ScanLoadSourceUrlCoreForTests(game);
}

function parentId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

function generateParents(count: number): readonly GeneratedParent[] {
  const generated: GeneratedParent[] = [];
  const seenPositions = new Set<string>();
  let game = 0;
  while (generated.length < count) {
    let sfen = START_SFEN;
    let random = (0x9e3779b9 ^ (game + 1)) >>> 0;
    const url = sourceUrl(game);
    const gameId = floodgateCanonicalUrlGameId(url);
    const gameSha256 = sha256(`synthetic-v7-scan-load-game-v1\0${game}`);
    for (let ply = 0; ply < 512 && generated.length < count; ply += 1) {
      const parsed = positionFromSfen(sfen);
      if (parsed.moveNumber !== ply + 1) {
        throw new Error("synthetic playout move number drifted");
      }
      const legal = rulesCompleteLegalMoves(parsed.position);
      if (
        legal.length === 0 ||
        legal.some((entry) => getKomashu(entry.move.capture) === OU)
      ) {
        break;
      }
      random = xorshift32(random);
      const outsideProposalStart = legal.length >= 14 ? 12 : 0;
      const playedIndex =
        outsideProposalStart +
        (random % Math.max(1, legal.length - outsideProposalStart));
      const playedMove = legal[playedIndex].usi;
      const positionId = positionKeyFromSfen(sfen);
      if (legal.length >= 14 && !seenPositions.has(positionId)) {
        seenPositions.add(positionId);
        const stableIndex = playedIndex === 12 ? 13 : 12;
        if (stableIndex >= legal.length) {
          throw new Error("synthetic parent has no distinct 14th candidate");
        }
        generated.push({
          parent: {
            schema_version: 1,
            game_id: gameId,
            parent_id: parentId(gameId, ply),
            position_id: positionId,
            parent_sfen: sfen,
            ply,
            played_move: playedMove,
          },
          stableMove: legal[stableIndex].usi,
          sourceUrl: url,
          gameSha256,
        });
      }
      sfen = childSfenAfterUsi(sfen, playedMove);
    }
    game += 1;
    if (game > count * 2 + 100) {
      throw new Error("synthetic legal playout generator made no progress");
    }
  }
  generated.sort((left, right) =>
    compareBytewise(left.parent.parent_id, right.parent.parent_id),
  );
  return Object.freeze(generated);
}

function parentPayloadSha256(
  parent: Readonly<FloodgateTrainingParent>,
): string {
  return sha256(`shogi-floodgate-stable-parent-v1\0${canonicalJson(parent)}`);
}

function teacherRuntimeReceipt(): Readonly<Record<string, unknown>> {
  return Object.freeze({
    contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
    status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
    claim_boundary: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
    execution_boundary: "production-fixed-assets-and-runtime-dependencies",
    asset_authority_execution_boundary:
      "production-fixed-registry-and-deployment-root",
    engine_id: FLOODGATE_V7_EXPECTED_PRODUCTION_ENGINE_ID,
    runtime: {
      engine_count: 12,
      threads_per_engine: 1,
      hash_mb_per_engine: 64,
      fv_scale: 20,
      depth: 16,
      proposal_multipv_max: 12,
      independent_rescore_multipv: 1,
      no_process_arguments: true,
      shell: false,
      minimal_environment: true,
      per_worker_private_directories: true,
      queue_bound: 48,
    },
    fixed_options: [
      "EvalDir=<private-shared-snapshot>/eval",
      "FV_SCALE=20",
      "USI_Hash=64",
      "Threads=1",
      "USI_OwnBook=false",
      "BookFile=no_book",
      "NetworkDelay=0",
      "NetworkDelay2=0",
    ],
    timeouts: {
      usiMs: 15_000,
      readyMs: 120_000,
      searchMs: 600_000,
      termGraceMs: 500,
      killGraceMs: 1_000,
    },
    limits: {
      lineBytes: 64 * 1024,
      stdoutBytesPerPhase: 16 * 1024 * 1024,
      stdoutLinesPerPhase: 65_536,
      stderrBytesTotal: 8 * 1024 * 1024,
    },
    snapshot: {
      one_shared_private_snapshot: true,
      source_authority_revalidated: true,
      destination_revalidated: true,
      engine: {
        bytes:
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou.bytes,
        sha256:
          FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.engine.yaneuraou.sha256,
        mode: "0500",
      },
      eval: {
        bytes: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn.bytes,
        sha256: FLOODGATE_PRODUCTION_TEACHER_ASSET_REGISTRY.eval.nn.sha256,
        mode: "0400",
      },
    },
  });
}

const TEACHER_RUNTIME_RECEIPT = teacherRuntimeReceipt();
const TEACHER_RUNTIME_RECEIPT_SHA256 = sha256(
  `shogi-floodgate-v7-runtime-receipt-v1\0${canonicalJson(
    TEACHER_RUNTIME_RECEIPT,
  )}`,
);

function rescore(
  move: string,
  index: number,
): Readonly<FloodgateProductionTeacherRescoreResult> {
  const result: FloodgateProductionTeacherRescoreResult = {
    depth: 16,
    lines: [
      {
        depth: 16,
        multipv: 1,
        cp: index,
        nodes: 100 + index,
        move,
        pv: [move],
        scoreKind: "cp" as const,
      },
    ],
    bestmove: move,
    observedNodes: 100 + index,
    requested_multipv: 1,
    searchmoves: [move] as const,
    reset_before_search: true,
  };
  return Object.freeze(result);
}

function completedParentInput(
  generated: Readonly<GeneratedParent>,
): Readonly<FloodgateV7CompletedParentInput> {
  const parent = generated.parent;
  const legal = rulesCompleteLegalMoves(
    positionFromSfen(parent.parent_sfen).position,
  ).map((entry) => entry.usi);
  const childSfen = childSfenAfterUsi(parent.parent_sfen, generated.stableMove);
  const stable = {
    schema: FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
    game_id: parent.game_id,
    parent_id: parent.parent_id,
    position_id: parent.position_id,
    parent_payload_sha256: parentPayloadSha256(parent),
    stable_move: generated.stableMove,
    child_sfen: childSfen,
    child_position_id: positionKeyFromSfen(childSfen),
    search: {
      requested_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      completed_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
      termination: "requested-depth-complete" as const,
      raw_search_score: 17,
      score_encoding: FLOODGATE_STABLE_WASM_SCORE_ENCODING,
      nodes: 100,
      leaves: 50,
      root_tesu: parent.ply,
    },
  } as const;
  const unionInput: FloodgateV7CandidateUnionInput = {
    parent,
    legal: {
      source: FLOODGATE_V7_RULES_LEGAL_MOVE_EVIDENCE_SOURCE,
      parent_sfen: parent.parent_sfen,
      count: legal.length,
      moves: legal,
    },
    stable,
    runtime: {
      receipt: TEACHER_RUNTIME_RECEIPT as never,
      proposal: {
        depth: 16,
        lines: legal.slice(0, 12).map((move, index) => ({
          depth: 16,
          multipv: index + 1,
          cp: index,
          nodes: 10 + index,
          move,
          pv: [move],
          scoreKind: "cp" as const,
        })),
        bestmove: legal[0],
        observedNodes: 21,
        requested_multipv: 12,
        legal_move_count_evidence: {
          source:
            "caller-supplied-until-authenticated-by-v7-coordinator" as const,
          count: legal.length,
        },
        reset_before_search: true,
      },
    },
  };
  const union = buildFloodgateV7CandidateUnionCoreForTests(unionInput);
  if (union.candidates.length !== 14) {
    throw new Error(
      `synthetic completed parent has ${union.candidates.length}, not 14, candidates`,
    );
  }
  const result: FloodgateV7CompletedParentInput = {
    union,
    stable_runtime: {
      schema: FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
      row: stable,
      runtime_binding: {
        claim_boundary:
          FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
        execution_boundary:
          "production-fixed-asset-authority-and-reusable-pool",
        runtime_receipt_sha256: "c".repeat(64),
        reusable_pool_receipt_sha256: "e".repeat(64),
        parent_payload_sha256: stable.parent_payload_sha256,
        row_sha256: sha256(
          `shogi-floodgate-production-stable-runtime-row-v1\0${canonicalJson(
            stable,
          )}`,
        ),
        origin: "direct-owning-runtime-capability-call-v1",
        plain_result_authentication_claim: false,
      },
    },
    rescores: union.candidates.map((candidate, index) =>
      rescore(candidate.move, index),
    ),
  };
  return Object.freeze(result);
}

function rawRows(
  generated: readonly Readonly<GeneratedParent>[],
): readonly Readonly<FloodgateRoleBundleRawParent>[] {
  return generated.map(({ parent, sourceUrl: url, gameSha256 }) =>
    Object.freeze({
      ...parent,
      source: "floodgate" as const,
      source_url: url,
      game_sha256: gameSha256,
    }),
  );
}

/** Shared synthetic fixture seam for fixed-size v3 checkpoint tests. */
export function generateFloodgateV7CheckpointScanLoadParentsCoreForTests(
  count: number,
): readonly Readonly<FloodgateV7CheckpointScanLoadGeneratedParent>[] {
  return generateParents(validateParentCount(count));
}

/** Build the compact completed-parent value for one shared synthetic parent. */
export function buildFloodgateV7CheckpointScanLoadCompletedParentCoreForTests(
  generated: Readonly<FloodgateV7CheckpointScanLoadGeneratedParent>,
): Readonly<FloodgateV7CompletedParentInput> {
  return completedParentInput(generated);
}

/** Project shared synthetic parents into authenticated raw training rows. */
export function buildFloodgateV7CheckpointScanLoadRawRowsCoreForTests(
  generated: readonly Readonly<FloodgateV7CheckpointScanLoadGeneratedParent>[],
): readonly Readonly<FloodgateRoleBundleRawParent>[] {
  return rawRows(generated);
}

function canonicalRawBytes(
  rows: readonly Readonly<FloodgateRoleBundleRawParent>[],
): Buffer {
  return Buffer.from(`${rows.map((row) => canonicalJson(row)).join("\n")}\n`);
}

function rawIdentity(
  rows: readonly Readonly<FloodgateRoleBundleRawParent>[],
  bytes: Uint8Array,
): Readonly<FloodgateRoleBundleRawIdentity> {
  const games = new Set(rows.map((row) => row.game_id));
  const parents = new Set(rows.map((row) => row.parent_id));
  const positions = new Set(rows.map((row) => row.position_id));
  return Object.freeze({
    path: FLOODGATE_TRAINING_RAW_FILENAME,
    format: FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT,
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
    records: rows.length,
    games: games.size,
    game_ids_sha256: floodgateIdentifierDigest(games),
    parent_ids_sha256: floodgateIdentifierDigest(parents),
    position_ids_count: positions.size,
    position_ids_sha256: floodgateIdentifierDigest(positions),
  });
}

function verifiedBundle(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): Readonly<VerifiedPinnedFloodgateRoleBundle> {
  const manifest = {
    schema: FLOODGATE_ROLE_BUNDLE_SCHEMA,
    status: "complete-label-free-role-bundle",
    provenance: {},
    pipeline: { source_revision: PRODUCER_REVISION, tracked_tree_clean: true },
    sources: {},
    contract: {},
    roles: {
      fresh_final_holdout: {},
      fresh_selection: {},
      training: { protected_position_ids: {}, raw_parents: identity },
    },
    replay_exclusion: {},
    isolation: {},
  };
  const manifestText = `${canonicalJson(manifest)}\n`;
  const manifestIdentity = {
    path: FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY.path,
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256(manifestText),
  };
  return {
    manifest,
    manifestText,
    roleLock: {},
    producerRevision: PRODUCER_REVISION,
    verifierRevision: VERIFIER_REVISION,
    result: {
      schema: FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA,
      status: "complete-label-free-role-bundle",
      claim_boundary: "integrity-only-not-playing-strength-evidence",
      manifest: { identity: manifestIdentity, value: manifest },
      execution: {},
      post_run_audit: {},
    },
  } as unknown as Readonly<VerifiedPinnedFloodgateRoleBundle>;
}

function trainingDependencies(
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): FloodgateTrainingRowConsumerDependencies {
  const bundle = verifiedBundle(identity);
  return Object.freeze({
    verifyBundle: async () => bundle,
    expectedManifestIdentity: bundle.result.manifest.identity,
  });
}

function effectiveUserId(): number {
  if (typeof process.geteuid !== "function") {
    throw new Error(
      "v7 checkpoint load harness requires a POSIX effective uid",
    );
  }
  return process.geteuid();
}

function requireExactNodeRuntime(): void {
  if (process.version !== REQUIRED_NODE_VERSION) {
    throw new Error(
      `v7 checkpoint load evidence requires Node ${REQUIRED_NODE_VERSION}, got ${process.version}`,
    );
  }
}

async function mkdir0700(directory: string): Promise<void> {
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.promises.chmod(directory, 0o700);
}

async function write0600(filePath: string, contents: string): Promise<void> {
  await mkdir0700(path.dirname(filePath));
  await fs.promises.writeFile(filePath, contents, { mode: 0o600 });
  await fs.promises.chmod(filePath, 0o600);
}

interface RunCapability {
  readonly root: string;
  readonly token: string;
}

async function createRunCapability(): Promise<Readonly<RunCapability>> {
  const created = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-scan-load-"),
  );
  try {
    const root = await fs.promises.realpath(created);
    await fs.promises.chmod(root, 0o700);
    const token = randomBytes(32).toString("hex");
    const markerPath = path.join(root, CAPABILITY_FILENAME);
    await fs.promises.writeFile(markerPath, token, {
      flag: "wx",
      mode: 0o600,
    });
    await fs.promises.chmod(markerPath, 0o600);
    return Object.freeze({ root, token });
  } catch (cause) {
    await fs.promises.rm(created, {
      recursive: true,
      force: true,
      maxRetries: 3,
    });
    throw cause;
  }
}

async function validateRunCapabilityFromEnvironment(): Promise<
  Readonly<RunCapability>
> {
  const rootInput = process.env[ROOT_ENV];
  const token = process.env[CAPABILITY_ENV];
  if (
    rootInput === undefined ||
    token === undefined ||
    !CAPABILITY_RE.test(token) ||
    path.resolve(rootInput) !== rootInput
  ) {
    throw new Error("internal load child has no valid parent capability");
  }
  const root = await fs.promises.realpath(rootInput);
  const temporaryRoot = await fs.promises.realpath(os.tmpdir());
  if (
    root !== rootInput ||
    path.dirname(root) !== temporaryRoot ||
    !path.basename(root).startsWith("floodgate-v7-scan-load-")
  ) {
    throw new Error(
      "internal load child root is outside its private temp scope",
    );
  }
  const rootStat = await fs.promises.lstat(root, { bigint: true });
  if (
    (Number(rootStat.mode) & fs.constants.S_IFMT) !== fs.constants.S_IFDIR ||
    (Number(rootStat.mode) & 0o7777) !== 0o700 ||
    rootStat.uid !== BigInt(effectiveUserId())
  ) {
    throw new Error("internal load child root lost private ownership or mode");
  }
  const marker = await fs.promises.open(
    path.join(root, CAPABILITY_FILENAME),
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = await marker.stat({ bigint: true });
    if (
      (Number(stat.mode) & fs.constants.S_IFMT) !== fs.constants.S_IFREG ||
      (Number(stat.mode) & 0o7777) !== 0o600 ||
      stat.uid !== BigInt(effectiveUserId()) ||
      stat.nlink !== BigInt(1) ||
      stat.size !== BigInt(token.length)
    ) {
      throw new Error("internal load child capability marker is not private");
    }
    const contents = await marker.readFile("utf8");
    if (contents !== token) {
      throw new Error("internal load child capability marker does not match");
    }
  } finally {
    await marker.close();
  }
  return Object.freeze({ root, token });
}

function fixturePaths(root: string): Readonly<{
  outputRoot: string;
  repositoryRoot: string;
  rawLockRoot: string;
  roleLockRoot: string;
  publicationParent: string;
  stageRoot: string;
  legacy: string;
  evalDir: string;
  engineBin: string;
  engineReceipt: string;
  engineArgument: string;
}> {
  const publicationParent = path.join(root, "publication");
  return Object.freeze({
    outputRoot: path.join(root, "role-bundle"),
    repositoryRoot: path.join(root, "repository"),
    rawLockRoot: path.join(root, "raw-lock"),
    roleLockRoot: path.join(root, "role-lock"),
    publicationParent,
    stageRoot: path.join(publicationParent, "teacher-stage"),
    legacy: path.join(root, "legacy-protected-position-ids.txt"),
    evalDir: path.join(root, "eval"),
    engineBin: path.join(root, "engine", "engine"),
    engineReceipt: path.join(root, "engine", "receipt.json"),
    engineArgument: path.join(root, "engine", "argument.bin"),
  });
}

function capturedFixture(
  root: string,
  identity: Readonly<FloodgateRoleBundleRawIdentity>,
): Readonly<HarnessFixture> {
  const paths = fixturePaths(root);
  const trainingPath = path.join(
    paths.outputRoot,
    FLOODGATE_TRAINING_RAW_FILENAME,
  );
  const trainingOptions: FloodgateTrainingRowConsumerOptions = {
    repositoryRoot: paths.repositoryRoot,
    verifierRevision: VERIFIER_REVISION,
    rawLockRoot: paths.rawLockRoot,
    roleLockRoot: paths.roleLockRoot,
    legacyProtectedPositionIdsPath: paths.legacy,
    outputRoot: paths.outputRoot,
  };
  return Object.freeze({
    root,
    stageRoot: paths.stageRoot,
    trainingPath,
    identity,
    trainingOptions,
    authorization: {
      repositoryRoot: paths.repositoryRoot,
      rawLockRoot: paths.rawLockRoot,
      roleLockRoot: paths.roleLockRoot,
      roleBundleRoot: paths.outputRoot,
      legacyProtectedPositionIdsPath: paths.legacy,
      publicationParent: paths.publicationParent,
      stageBasename: "teacher-stage",
      destinationBasename: "teacher-final",
      engineBin: paths.engineBin,
      engineReceipt: paths.engineReceipt,
      engineArgs: [paths.engineArgument],
      evalDir: paths.evalDir,
    },
  });
}

async function makeFixture(
  generated: readonly Readonly<GeneratedParent>[],
  root: string,
): Promise<Readonly<HarnessFixture>> {
  const initialEntries = await fs.promises.readdir(root);
  if (
    initialEntries.length !== 1 ||
    initialEntries[0] !== CAPABILITY_FILENAME
  ) {
    throw new Error("parent-owned fixture root was not initially empty");
  }
  const paths = fixturePaths(root);
  await Promise.all([
    mkdir0700(paths.outputRoot),
    mkdir0700(paths.repositoryRoot),
    mkdir0700(paths.rawLockRoot),
    mkdir0700(paths.roleLockRoot),
    mkdir0700(paths.publicationParent),
    mkdir0700(paths.evalDir),
  ]);
  await Promise.all([
    write0600(paths.legacy, "synthetic\n"),
    write0600(paths.engineBin, "synthetic engine\n"),
    write0600(paths.engineReceipt, '{"synthetic":true}\n'),
    write0600(paths.engineArgument, "synthetic argument\n"),
    write0600(path.join(paths.evalDir, "nn.bin"), "synthetic eval\n"),
  ]);
  const rows = rawRows(generated);
  const bytes = canonicalRawBytes(rows);
  const trainingPath = path.join(
    paths.outputRoot,
    FLOODGATE_TRAINING_RAW_FILENAME,
  );
  await fs.promises.writeFile(trainingPath, bytes, {
    flag: "wx",
    mode: 0o600,
  });
  await fs.promises.chmod(trainingPath, 0o600);
  return capturedFixture(root, rawIdentity(rows, bytes));
}

async function fixtureFromExistingRoot(
  rootInput: string,
): Promise<Readonly<HarnessFixture>> {
  const root = await fs.promises.realpath(rootInput);
  const paths = fixturePaths(root);
  const trainingPath = path.join(
    paths.outputRoot,
    FLOODGATE_TRAINING_RAW_FILENAME,
  );
  const bytes = await fs.promises.readFile(trainingPath);
  const lines = bytes.toString("utf8").slice(0, -1).split("\n");
  const rows = lines.map(
    (line) => JSON.parse(line) as FloodgateRoleBundleRawParent,
  );
  return capturedFixture(root, rawIdentity(rows, bytes));
}

function runBinding(): Readonly<FloodgateV7TeacherCheckpointRunBinding> {
  return Object.freeze({
    schema: FLOODGATE_V7_TEACHER_RUN_BINDING_SCHEMA,
    plan: Object.freeze({
      bytes: FLOODGATE_FRESH_SIBLING_PLAN_BYTES,
      sha256: FLOODGATE_FRESH_SIBLING_PLAN_SHA256,
    }),
    producer_control: Object.freeze({
      schema: FLOODGATE_V7_TEACHER_PRODUCER_CONTROL_SCHEMA,
      parent_deadline_ms: CHILD_TIMEOUT_MS,
      abort_drain_ms: 30_000,
      max_in_flight: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_IN_FLIGHT,
      cancel_policy: FLOODGATE_V7_TEACHER_PRODUCER_CANCEL_POLICY,
      late_settlement_policy:
        FLOODGATE_V7_TEACHER_PRODUCER_LATE_SETTLEMENT_POLICY,
    }),
    stable_runtime_receipt_sha256: "c".repeat(64),
    teacher_usi_runtime_receipt_sha256: TEACHER_RUNTIME_RECEIPT_SHA256,
  });
}

function rootKey(): Uint8Array {
  return new Uint8Array(32).fill(ROOT_KEY_BYTE);
}

async function authorizeFixture(fixture: Readonly<HarnessFixture>) {
  return authorizeFloodgateTeacherStageCoreForTests(fixture.authorization, {
    effectiveUserId: effectiveUserId(),
    inspectorPythonExecutable: FLOODGATE_TEACHER_STAGE_ENTRY_INSPECTOR_PYTHON,
  });
}

async function runCheckpoint(
  fixture: Readonly<HarnessFixture>,
  producer: (
    parent: Readonly<FloodgateTrainingParent>,
  ) => Promise<Readonly<FloodgateV7CompletedParentInput>>,
  dependencyOverrides: Partial<FloodgateV7TeacherCheckpointDependencies> = {},
) {
  const lease = await authorizeFixture(fixture);
  let receipt:
    | Awaited<
        ReturnType<typeof checkpointFloodgateV7TeacherParentsCoreForTests>
      >
    | undefined;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    fixture.trainingOptions,
    async (authenticated: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      receipt = await checkpointFloodgateV7TeacherParentsCoreForTests(
        lease,
        authenticated,
        runBinding(),
        {
          produce: async ({ parent }) => producer(parent),
          abortAndDrain: async () => undefined,
        },
        { runId: RUN_ID, keyId: KEY_ID },
        {
          rootKey: rootKey(),
          effectiveUserId: effectiveUserId(),
          ...dependencyOverrides,
        },
      );
    },
    trainingDependencies(fixture.identity),
  );
  if (receipt === undefined) throw new Error("checkpoint produced no receipt");
  return receipt;
}

async function runV3Checkpoint(
  fixture: Readonly<HarnessFixture>,
  gate: FloodgateV7TeacherCheckpointV3Gate,
  producer: (
    request: Readonly<FloodgateV7TeacherMissingParentRequest>,
  ) => Promise<Readonly<FloodgateV7CompletedParentInput>>,
  dependencyOverrides: Partial<FloodgateV7TeacherCheckpointV3Dependencies> = {},
): Promise<Readonly<FloodgateV7TeacherCheckpointV3Receipt>> {
  const lease = await authorizeFixture(fixture);
  let receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt> | undefined;
  await withVerifiedPinnedFloodgateTrainingRowsCoreForTests(
    fixture.trainingOptions,
    async (authenticated: Readonly<AuthenticatedFloodgateTrainingRows>) => {
      receipt = await checkpointFloodgateV7TeacherParentsV3CoreForTests(
        lease,
        authenticated,
        runBinding(),
        {
          produce: producer,
          abortAndDrain: async () => undefined,
        },
        { gate, runId: RUN_ID, keyId: KEY_ID },
        {
          rootKey: rootKey(),
          effectiveUserId: effectiveUserId(),
          ...dependencyOverrides,
        },
      );
    },
    trainingDependencies(fixture.identity),
  );
  if (receipt === undefined)
    throw new Error("v3 checkpoint produced no receipt");
  return receipt;
}

interface FileHandleSyncPrototype {
  sync(this: fs.promises.FileHandle): Promise<void>;
}

async function fileHandleSyncPrototype(
  filePath: string,
): Promise<FileHandleSyncPrototype> {
  const handle = await fs.promises.open(filePath, fs.constants.O_RDONLY);
  try {
    return Object.getPrototypeOf(handle) as FileHandleSyncPrototype;
  } finally {
    await handle.close();
  }
}

async function withRegularFileSyncSuppressed<T>(
  probePath: string,
  action: (suppressedRegularFileSyncs: () => number) => Promise<T>,
): Promise<Readonly<{ result: T; suppressed: number }>> {
  const prototype = await fileHandleSyncPrototype(probePath);
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "sync");
  if (
    descriptor === undefined ||
    typeof descriptor.value !== "function" ||
    descriptor.configurable !== true
  ) {
    throw new Error("native FileHandle.sync descriptor cannot be isolated");
  }
  const nativeSync = descriptor.value as FileHandleSyncPrototype["sync"];
  const regularByHandle = new WeakMap<fs.promises.FileHandle, boolean>();
  let suppressed = 0;
  Object.defineProperty(prototype, "sync", {
    ...descriptor,
    value: async function (this: fs.promises.FileHandle): Promise<void> {
      let regular = regularByHandle.get(this);
      if (regular === undefined) {
        const stat = await this.stat({ bigint: true });
        regular = (Number(stat.mode) & MODE_TYPE_MASK) === MODE_REGULAR;
        regularByHandle.set(this, regular);
      }
      if (regular) {
        suppressed += 1;
        return;
      }
      await Reflect.apply(nativeSync, this, []);
    },
  });
  try {
    const result = await action(() => suppressed);
    return Object.freeze({ result, suppressed });
  } finally {
    Object.defineProperty(prototype, "sync", descriptor);
    if (prototype.sync !== nativeSync) {
      throw new Error("native FileHandle.sync was not restored exactly");
    }
  }
}

/** Regression seam proving setup cleanup and sync restoration on rejection. */
export async function verifyFloodgateV7ScanLoadSyncRestorationCoreForTests(
  failBeforePrototypeForTests = false,
): Promise<void> {
  requireExactNodeRuntime();
  const root = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "floodgate-v7-sync-restore-"),
  );
  const filePath = path.join(root, "work.jsonl");
  const sentinel = new Error("intentional sync-restoration rejection");
  let handle: fs.promises.FileHandle | undefined;
  let prototype: FileHandleSyncPrototype | undefined;
  let nativeSync: FileHandleSyncPrototype["sync"] | undefined;
  let observed: unknown;
  try {
    await fs.promises.writeFile(filePath, "synthetic\n", { mode: 0o600 });
    handle = await fs.promises.open(filePath, fs.constants.O_RDWR);
    if (failBeforePrototypeForTests) throw sentinel;
    prototype = await fileHandleSyncPrototype(filePath);
    nativeSync = prototype.sync;
    await withRegularFileSyncSuppressed(filePath, async () => {
      await (handle as fs.promises.FileHandle).sync();
      throw sentinel;
    });
  } catch (cause) {
    observed = cause;
  } finally {
    try {
      if (handle !== undefined) await handle.close();
    } finally {
      await fs.promises.rm(root, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
  }
  if (
    observed !== sentinel ||
    (!failBeforePrototypeForTests &&
      (prototype === undefined || prototype.sync !== nativeSync))
  ) {
    throw new Error("sync suppression setup or restoration check failed");
  }
  try {
    await fs.promises.lstat(root);
    throw new Error("sync restoration fixture root was not removed");
  } catch (cause) {
    if (
      !(cause instanceof Error) ||
      !("code" in cause) ||
      cause.code !== "ENOENT"
    ) {
      throw cause;
    }
  }
}

async function batchSyncFixture(
  fixture: Readonly<HarnessFixture>,
): Promise<void> {
  const workPath = path.join(
    fixture.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const work = await fs.promises.open(
    workPath,
    fs.constants.O_RDWR | fs.constants.O_NOFOLLOW,
  );
  try {
    const stat = await work.stat({ bigint: true });
    if (
      (Number(stat.mode) & MODE_TYPE_MASK) !== MODE_REGULAR ||
      (Number(stat.mode) & 0o7777) !== 0o600
    ) {
      throw new Error("fixture work file lost its exact private regular mode");
    }
    await work.sync();
  } finally {
    await work.close();
  }
  const stage = await fs.promises.open(
    fixture.stageRoot,
    fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW,
  );
  try {
    await stage.sync();
  } finally {
    await stage.close();
  }
}

async function streamIdentityAndLineStatistics(
  filePath: string,
  expectedEntries: number,
): Promise<
  Readonly<{
    bytes: number;
    sha256: string;
    lineStatistics: Readonly<LineStatistics>;
  }>
> {
  const digest = createHash("sha256");
  const lineLengths: number[] = [];
  let bytes = 0;
  let currentLineBytes = 0;
  for await (const chunkValue of fs.createReadStream(filePath)) {
    const chunk = Buffer.isBuffer(chunkValue)
      ? chunkValue
      : Buffer.from(chunkValue);
    digest.update(chunk);
    bytes += chunk.byteLength;
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(0x0a, start);
      if (newline === -1) {
        currentLineBytes += chunk.byteLength - start;
        break;
      }
      currentLineBytes += newline - start;
      lineLengths.push(currentLineBytes);
      currentLineBytes = 0;
      start = newline + 1;
      if (start === chunk.byteLength) break;
    }
  }
  if (currentLineBytes !== 0) {
    throw new Error("fixture stream does not end at an LF boundary");
  }
  if (lineLengths.length !== expectedEntries + 2) {
    throw new Error(
      `fixture has ${lineLengths.length} lines, expected ${expectedEntries + 2}`,
    );
  }
  const entryLengths = lineLengths.slice(1, -1);
  const entrySummary = summarizeObservedLengths(entryLengths);
  const lineSummary = summarizeObservedLengths(lineLengths);
  if (lineSummary.maximum > FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES) {
    throw new Error("valid fixture exceeded the checkpoint line bound");
  }
  return Object.freeze({
    bytes,
    sha256: digest.digest("hex"),
    lineStatistics: Object.freeze({
      records: lineLengths.length,
      header_bytes: lineLengths[0],
      entries: entryLengths.length,
      entry_bytes_total: entrySummary.total,
      entry_bytes_min: entrySummary.minimum,
      entry_bytes_max: entrySummary.maximum,
      entry_bytes_mean: Math.round(entrySummary.total / entryLengths.length),
      seal_bytes: lineLengths.at(-1) as number,
      maximum_line_bytes: lineSummary.maximum,
    }),
  });
}

async function streamV3IdentityAndLineStatistics(filePath: string): Promise<
  Readonly<{
    bytes: number;
    sha256: string;
    lineStatistics: Readonly<V3LineStatistics>;
  }>
> {
  const digest = createHash("sha256");
  const lineLengths: number[] = [];
  const entryLengths: number[] = [];
  let milestone100Bytes: number | undefined;
  let milestone500Bytes: number | undefined;
  let bytes = 0;
  let pending = Buffer.alloc(0);

  const acceptLine = (line: Buffer): void => {
    if (
      line.byteLength < 1 ||
      line.byteLength > FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES
    ) {
      throw new Error("v3 fixture contains an empty or oversized line");
    }
    const lineIndex = lineLengths.length;
    const parsed = JSON.parse(line.toString("utf8")) as unknown;
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      throw new Error("v3 fixture line is not a JSON object");
    }
    const record = parsed as Record<string, unknown>;
    if (record.schema !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA) {
      throw new Error("v3 fixture line has the wrong schema");
    }
    if (lineIndex === 0) {
      if (record.kind !== "header") {
        throw new Error("v3 fixture does not begin with its header");
      }
    } else if (lineIndex === 101) {
      if (
        record.kind !== "durable-prefix-milestone" ||
        record.gate !==
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100 ||
        record.completed_parents !== 100 ||
        record.status !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
      ) {
        throw new Error("v3 fixture 100-parent milestone is misplaced");
      }
      milestone100Bytes = line.byteLength;
    } else if (lineIndex === 502) {
      if (
        record.kind !== "durable-prefix-milestone" ||
        record.gate !==
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500 ||
        record.completed_parents !== 500 ||
        record.status !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
      ) {
        throw new Error("v3 fixture 500-parent milestone is misplaced");
      }
      milestone500Bytes = line.byteLength;
    } else if (
      lineIndex ===
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 3
    ) {
      if (
        record.kind !== "seal" ||
        record.entries !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
        record.status !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS
      ) {
        throw new Error("v3 fixture does not end with its exact final seal");
      }
    } else {
      const expectedInputIndex = entryLengths.length;
      if (
        record.kind !== "completed-parent" ||
        record.sequence !== expectedInputIndex ||
        record.input_index !== expectedInputIndex
      ) {
        throw new Error("v3 fixture completed-parent sequence is not exact");
      }
      entryLengths.push(line.byteLength);
    }
    lineLengths.push(line.byteLength);
  };

  for await (const chunkValue of fs.createReadStream(filePath)) {
    const chunk = Buffer.isBuffer(chunkValue)
      ? chunkValue
      : Buffer.from(chunkValue);
    digest.update(chunk);
    bytes += chunk.byteLength;
    const data = pending.byteLength
      ? Buffer.concat([pending, chunk], pending.byteLength + chunk.byteLength)
      : chunk;
    let start = 0;
    for (;;) {
      const newline = data.indexOf(0x0a, start);
      if (newline === -1) break;
      acceptLine(data.subarray(start, newline));
      start = newline + 1;
    }
    pending = Buffer.from(data.subarray(start));
    if (pending.byteLength > FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES) {
      throw new Error("v3 fixture line exceeded its bound before LF");
    }
  }
  if (pending.byteLength !== 0) {
    throw new Error("v3 fixture stream does not end at an LF boundary");
  }
  const expectedRecords = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS + 4;
  if (
    lineLengths.length !== expectedRecords ||
    entryLengths.length !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    milestone100Bytes === undefined ||
    milestone500Bytes === undefined
  ) {
    throw new Error("v3 fixture record or milestone counts are not exact");
  }
  const entrySummary = summarizeObservedLengths(entryLengths);
  const lineSummary = summarizeObservedLengths(lineLengths);
  const milestoneBytesTotal = milestone100Bytes + milestone500Bytes;
  return Object.freeze({
    bytes,
    sha256: digest.digest("hex"),
    lineStatistics: Object.freeze({
      records: lineLengths.length,
      header_bytes: lineLengths[0],
      entries: entryLengths.length,
      entry_bytes_total: entrySummary.total,
      entry_bytes_min: entrySummary.minimum,
      entry_bytes_max: entrySummary.maximum,
      entry_bytes_mean: Math.round(entrySummary.total / entryLengths.length),
      milestones: 2,
      milestone_100_bytes: milestone100Bytes,
      milestone_500_bytes: milestone500Bytes,
      milestone_bytes_total: milestoneBytesTotal,
      seal_bytes: lineLengths.at(-1) as number,
      maximum_line_bytes: lineSummary.maximum,
    }),
  });
}

function summarizeObservedLengths(
  values: readonly number[],
): Readonly<ObservedLengthSummary> {
  const first = values[0];
  if (first === undefined) {
    throw new Error("observed length summary requires a non-empty input");
  }
  let total = 0;
  let minimum = first;
  let maximum = first;
  for (const value of values) {
    total += value;
    if (value < minimum) minimum = value;
    if (value > maximum) maximum = value;
  }
  return Object.freeze({ total, minimum, maximum });
}

/** Regression seam proving large scan-load length sets avoid argument spread. */
export function summarizeFloodgateV7ScanLoadLengthsCoreForTests(
  values: readonly number[],
): Readonly<ObservedLengthSummary> {
  return summarizeObservedLengths(values);
}

function resourceMaxRssBytes(): number {
  return process.resourceUsage().maxRSS * 1024;
}

function startRssSampler(): Readonly<{
  stop: () => number;
}> {
  let peak = process.memoryUsage().rss;
  const interval = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);
  interval.unref();
  return Object.freeze({
    stop: () => {
      clearInterval(interval);
      peak = Math.max(peak, process.memoryUsage().rss);
      return peak;
    },
  });
}

function emptyReadMeasurements(): ReadMeasurements {
  return {
    calls: { "resumable-prefix": 0, "sealed-final": 0 },
    bytes: { "resumable-prefix": 0, "sealed-final": 0 },
    maximum_request_bytes: {
      "resumable-prefix": 0,
      "sealed-final": 0,
    },
    first_ms: {},
  };
}

function v3ProducerRange(
  generated: readonly Readonly<GeneratedParent>[],
  firstInputIndex: number,
  endInputIndexExclusive: number,
): Readonly<{
  produce: (
    request: Readonly<FloodgateV7TeacherMissingParentRequest>,
  ) => Promise<Readonly<FloodgateV7CompletedParentInput>>;
  finish: () => Readonly<V3ProducerRange>;
}> {
  const expectedCalls = endInputIndexExclusive - firstInputIndex;
  const seen = new Uint8Array(expectedCalls);
  let calls = 0;
  return Object.freeze({
    produce: async (request) => {
      const inputIndex = request.input_index;
      const offset = inputIndex - firstInputIndex;
      if (
        !Number.isSafeInteger(inputIndex) ||
        offset < 0 ||
        offset >= seen.length ||
        seen[offset] !== 0
      ) {
        throw new Error("v3 gate producer request is outside its exact range");
      }
      const row = generated[inputIndex];
      if (
        row === undefined ||
        row.parent.parent_id !== request.parent.parent_id
      ) {
        throw new Error("v3 gate producer request does not match full input");
      }
      seen[offset] = 1;
      calls += 1;
      return completedParentInput(row);
    },
    finish: () => {
      if (calls !== expectedCalls || seen.some((value) => value !== 1)) {
        throw new Error("v3 gate did not request every expected input once");
      }
      return Object.freeze({
        calls,
        first_input_index: firstInputIndex,
        last_input_index: endInputIndexExclusive - 1,
      });
    },
  });
}

function assertV3ReceiptIdentity(
  receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
): void {
  if (
    receipt.contract !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA ||
    receipt.claim_boundary !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY ||
    receipt.algorithm !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM ||
    receipt.run_id !== RUN_ID ||
    receipt.key_id !== KEY_ID ||
    receipt.gate_contract.schema !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT.schema ||
    receipt.gate_contract.durable_prefix_100_parents !== 100 ||
    receipt.gate_contract.durable_prefix_500_parents !== 500 ||
    receipt.gate_contract.sealed_final_parents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    receipt.work.filename !== FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME ||
    receipt.work.format !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT ||
    receipt.work.durability !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY
  ) {
    throw new Error("v3 checkpoint receipt identity is not exact");
  }
}

function v3GateProgress(
  receipt: Readonly<FloodgateV7TeacherCheckpointV3Receipt>,
  producer: Readonly<V3ProducerRange>,
  expected: Readonly<{
    gate: FloodgateV7TeacherCheckpointV3Gate;
    status:
      | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
      | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS;
    sealed: boolean;
    targetParents: number;
    resumedParents: number;
    records: number;
  }>,
): Readonly<V3GateProgress> {
  assertV3ReceiptIdentity(receipt);
  if (
    receipt.gate !== expected.gate ||
    receipt.status !== expected.status ||
    receipt.sealed !== expected.sealed ||
    receipt.work.target_parents !== expected.targetParents ||
    receipt.work.completed_parents !== expected.targetParents ||
    receipt.work.resumed_parents !== expected.resumedParents ||
    receipt.work.records !== expected.records ||
    receipt.work.training_parents !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS ||
    !SHA256_RE.test(receipt.work.sha256) ||
    !SHA256_RE.test(receipt.work.milestone_100_mac) ||
    (receipt.work.milestone_500_mac !== null &&
      !SHA256_RE.test(receipt.work.milestone_500_mac))
  ) {
    throw new Error(`v3 ${expected.gate} receipt is not exact`);
  }
  return Object.freeze({
    gate: receipt.gate,
    status: receipt.status,
    sealed: receipt.sealed,
    target_parents: receipt.work.target_parents,
    completed_parents: receipt.work.completed_parents,
    resumed_parents: receipt.work.resumed_parents,
    records: receipt.work.records,
    bytes: receipt.work.bytes,
    sha256: receipt.work.sha256,
    milestone_100_mac: receipt.work.milestone_100_mac,
    milestone_500_mac: receipt.work.milestone_500_mac,
    producer,
  });
}

async function buildV3ChildPhase(root: string): Promise<V3BuildChildResult> {
  const parents = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  const baselineRss = process.memoryUsage().rss;
  const started = performance.now();
  const generated = generateParents(parents);
  const generatedAt = performance.now();
  let fixture: Readonly<HarnessFixture> | undefined;
  try {
    fixture = await makeFixture(generated, root);
    const fixtureAt = performance.now();
    const built = await withRegularFileSyncSuppressed(
      fixture.trainingPath,
      async (suppressedRegularFileSyncs) => {
        const beforeGate100Syncs = suppressedRegularFileSyncs();
        const gate100Producer = v3ProducerRange(generated, 0, 100);
        const gate100Receipt = await runV3Checkpoint(
          fixture as Readonly<HarnessFixture>,
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
          gate100Producer.produce,
        );
        const gate100At = performance.now();
        const gate100 = v3GateProgress(
          gate100Receipt,
          gate100Producer.finish(),
          {
            gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
            status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
            sealed: false,
            targetParents: 100,
            resumedParents: 0,
            records: 102,
          },
        );
        const afterGate100Syncs = suppressedRegularFileSyncs();

        const gate500Producer = v3ProducerRange(generated, 100, 500);
        const gate500Receipt = await runV3Checkpoint(
          fixture as Readonly<HarnessFixture>,
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
          gate500Producer.produce,
        );
        const gate500At = performance.now();
        const gate500 = v3GateProgress(
          gate500Receipt,
          gate500Producer.finish(),
          {
            gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
            status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
            sealed: false,
            targetParents: 500,
            resumedParents: 100,
            records: 503,
          },
        );
        const afterGate500Syncs = suppressedRegularFileSyncs();

        const finalProducer = v3ProducerRange(generated, 500, parents);
        const finalReceipt = await runV3Checkpoint(
          fixture as Readonly<HarnessFixture>,
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
          finalProducer.produce,
        );
        const finalAt = performance.now();
        const final = v3GateProgress(finalReceipt, finalProducer.finish(), {
          gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
          status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
          sealed: true,
          targetParents: parents,
          resumedParents: 500,
          records: parents + 4,
        });
        const afterFinalSyncs = suppressedRegularFileSyncs();
        const gate100Syncs = afterGate100Syncs - beforeGate100Syncs;
        const gate500Syncs = afterGate500Syncs - afterGate100Syncs;
        const finalSyncs = afterFinalSyncs - afterGate500Syncs;
        if (
          gate100Syncs !== 102 ||
          gate500Syncs !== 402 ||
          finalSyncs !== parents - 500 + 2
        ) {
          throw new Error("v3 per-gate regular-file sync counts are not exact");
        }
        // The two resume gates each sync the existing whole work file once;
        // every other suppressed call corresponds to one appended JSONL line.
        const preResumeSyncs = 2;
        const lineSyncs = gate100Syncs + (gate500Syncs - 1) + (finalSyncs - 1);
        if (
          gate100.milestone_500_mac !== null ||
          gate100.milestone_100_mac !== gate500.milestone_100_mac ||
          gate100.milestone_100_mac !== final.milestone_100_mac ||
          gate500.milestone_500_mac === null ||
          gate500.milestone_500_mac !== final.milestone_500_mac
        ) {
          throw new Error("v3 gate receipts lost milestone MAC continuity");
        }
        const stageIdentity = canonicalJson(gate100Receipt.stage);
        if (
          canonicalJson(gate500Receipt.stage) !== stageIdentity ||
          canonicalJson(finalReceipt.stage) !== stageIdentity
        ) {
          throw new Error("v3 gate receipts did not retain one stage identity");
        }
        return Object.freeze({
          gates: Object.freeze([gate100, gate500, final] as const),
          gate100At,
          gate500At,
          finalAt,
          lineSyncs,
          preResumeSyncs,
        });
      },
    );
    const expectedSuppressed = parents + 6;
    if (
      built.suppressed !== expectedSuppressed ||
      built.result.lineSyncs !== parents + 4 ||
      built.result.preResumeSyncs !== 2 ||
      built.result.lineSyncs + built.result.preResumeSyncs !== built.suppressed
    ) {
      throw new Error(
        `suppressed ${built.suppressed} v3 regular-file syncs, expected ${expectedSuppressed}`,
      );
    }
    await batchSyncFixture(fixture);
    const workPath = path.join(
      fixture.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    );
    const measured = await streamV3IdentityAndLineStatistics(workPath);
    const ended = performance.now();
    const finalGate = built.result.gates[2];
    if (
      finalGate.bytes !== measured.bytes ||
      finalGate.sha256 !== measured.sha256
    ) {
      throw new Error("v3 batch-synced work differs from final gate receipt");
    }
    return Object.freeze({
      phase: "fixture-v3-three-gate-build-non-evidence",
      node: REQUIRED_NODE_VERSION,
      parents,
      games: new Set(generated.map((entry) => entry.parent.game_id)).size,
      candidates_per_parent: 14,
      raw: Object.freeze({
        bytes: fixture.identity.bytes,
        sha256: fixture.identity.sha256,
      }),
      gates: built.result.gates,
      work: Object.freeze({
        bytes: measured.bytes,
        sha256: measured.sha256,
        line_statistics: measured.lineStatistics,
      }),
      sync: Object.freeze({
        suppressed_regular_file_syncs: built.suppressed,
        expected_suppressed_regular_file_syncs: expectedSuppressed,
        line_syncs: built.result.lineSyncs,
        expected_line_syncs: parents + 4,
        pre_resume_syncs: built.result.preResumeSyncs,
        expected_pre_resume_syncs: 2,
        native_method_restored_before_batch_sync: true,
        one_work_batch_sync_completed: true,
        one_stage_directory_batch_sync_completed: true,
      }),
      timing: Object.freeze({
        generation_wall_ms: Math.round(generatedAt - started),
        fixture_wall_ms: Math.round(fixtureAt - generatedAt),
        durable_prefix_100_wall_ms: Math.round(
          built.result.gate100At - fixtureAt,
        ),
        durable_prefix_500_wall_ms: Math.round(
          built.result.gate500At - built.result.gate100At,
        ),
        sealed_final_24000_wall_ms: Math.round(
          built.result.finalAt - built.result.gate500At,
        ),
        batch_sync_and_measure_wall_ms: Math.round(
          ended - built.result.finalAt,
        ),
      }),
      memory: Object.freeze({
        baseline_rss_bytes: baselineRss,
        final_rss_bytes: process.memoryUsage().rss,
        resource_max_rss_bytes: resourceMaxRssBytes(),
      }),
    });
  } catch (cause) {
    if (fixture !== undefined) {
      await fs.promises.rm(fixture.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
    throw cause;
  }
}

async function buildChildPhase(
  parents: number,
  root: string,
): Promise<BuildChildResult> {
  const baselineRss = process.memoryUsage().rss;
  const started = performance.now();
  const generated = generateParents(parents);
  const generatedAt = performance.now();
  let fixture: Readonly<HarnessFixture> | undefined;
  try {
    fixture = await makeFixture(generated, root);
    const fixtureAt = performance.now();
    const byParentId = new Map(
      generated.map((entry) => [entry.parent.parent_id, entry]),
    );
    const built = await withRegularFileSyncSuppressed(
      fixture.trainingPath,
      () =>
        runCheckpoint(fixture as Readonly<HarnessFixture>, async (parent) => {
          const row = byParentId.get(parent.parent_id);
          if (row === undefined) {
            throw new Error("checkpoint requested an unknown synthetic parent");
          }
          return completedParentInput(row);
        }),
    );
    const checkpointAt = performance.now();
    const expectedSuppressed = parents + 2;
    if (built.suppressed !== expectedSuppressed) {
      throw new Error(
        `suppressed ${built.suppressed} work syncs, expected ${expectedSuppressed}`,
      );
    }
    if (
      built.result.work.completed_parents !== parents ||
      built.result.work.resumed_parents !== 0
    ) {
      throw new Error("fresh non-evidence build did not complete every parent");
    }
    // The fresh receipt was produced while per-line work fsync was suppressed.
    // It is intentionally not returned or used as evidence.
    await batchSyncFixture(fixture);
    const workPath = path.join(
      fixture.stageRoot,
      FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
    );
    const measured = await streamIdentityAndLineStatistics(workPath, parents);
    const ended = performance.now();
    return Object.freeze({
      phase: "fixture-build-non-evidence",
      node: REQUIRED_NODE_VERSION,
      parents,
      games: new Set(generated.map((entry) => entry.parent.game_id)).size,
      candidates_per_parent: 14,
      raw: Object.freeze({
        bytes: fixture.identity.bytes,
        sha256: fixture.identity.sha256,
      }),
      work: Object.freeze({
        bytes: measured.bytes,
        sha256: measured.sha256,
        line_statistics: measured.lineStatistics,
      }),
      sync: Object.freeze({
        suppressed_per_line_regular_file_syncs: built.suppressed,
        expected_suppressed_syncs: expectedSuppressed,
        native_method_restored_before_batch_sync: true,
        one_work_batch_sync_completed: true,
        one_stage_directory_batch_sync_completed: true,
      }),
      timing: Object.freeze({
        generation_wall_ms: Math.round(generatedAt - started),
        fixture_wall_ms: Math.round(fixtureAt - generatedAt),
        checkpoint_build_wall_ms: Math.round(checkpointAt - fixtureAt),
        batch_sync_and_measure_wall_ms: Math.round(ended - checkpointAt),
      }),
      memory: Object.freeze({
        baseline_rss_bytes: baselineRss,
        final_rss_bytes: process.memoryUsage().rss,
        resource_max_rss_bytes: resourceMaxRssBytes(),
      }),
    });
  } catch (cause) {
    if (fixture !== undefined) {
      await fs.promises.rm(fixture.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
    throw cause;
  }
}

async function scanChildPhase(root: string): Promise<ScanChildResult> {
  const fixture = await fixtureFromExistingRoot(root);
  const parents = fixture.identity.records;
  const measurements = emptyReadMeasurements();
  const expectedPositions = {
    "resumable-prefix": 0,
    "sealed-final": 0,
  };
  const globalWithGc = globalThis as typeof globalThis & {
    gc?: () => void;
  };
  globalWithGc.gc?.();
  const baselineRss = process.memoryUsage().rss;
  const sampler = startRssSampler();
  let producerCalls = 0;
  const started = performance.now();
  const receipt = await runCheckpoint(
    fixture,
    async () => {
      producerCalls += 1;
      throw new Error("sealed fixture unexpectedly requested a producer");
    },
    {
      readForTests: async (request, read) => {
        const purpose = request.purpose;
        if (request.position !== expectedPositions[purpose]) {
          throw new Error(`${purpose} scan position is not contiguous`);
        }
        if (request.length > READ_CHUNK_BYTES) {
          throw new Error(`${purpose} exceeded the 64 KiB read bound`);
        }
        measurements.first_ms[purpose] ??= performance.now();
        const bytesRead = await read();
        measurements.calls[purpose] += 1;
        measurements.bytes[purpose] += bytesRead;
        measurements.maximum_request_bytes[purpose] = Math.max(
          measurements.maximum_request_bytes[purpose],
          request.length,
        );
        expectedPositions[purpose] += bytesRead;
        return bytesRead;
      },
    },
  );
  const checkpointEnded = performance.now();
  const sampledPeakRss = sampler.stop();
  const scanFinalRss = process.memoryUsage().rss;
  const workPath = path.join(
    fixture.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const hashStarted = performance.now();
  const independent = await streamIdentityAndLineStatistics(workPath, parents);
  const ended = performance.now();
  if (producerCalls !== 0) {
    throw new Error("native evidence scan invoked the forbidden producer");
  }
  if (
    receipt.work.completed_parents !== parents ||
    receipt.work.resumed_parents !== parents
  ) {
    throw new Error("native evidence scan did not resume every sealed parent");
  }
  if (
    receipt.work.bytes !== independent.bytes ||
    receipt.work.sha256 !== independent.sha256
  ) {
    throw new Error("scanner receipt and independent stream identity differ");
  }
  for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
    const expectedCalls = Math.ceil(independent.bytes / READ_CHUNK_BYTES);
    const expectedMaximum = Math.min(independent.bytes, READ_CHUNK_BYTES);
    if (
      measurements.bytes[purpose] !== independent.bytes ||
      measurements.calls[purpose] !== expectedCalls ||
      measurements.maximum_request_bytes[purpose] !== expectedMaximum
    ) {
      throw new Error(`${purpose} did not read the exact bounded stream`);
    }
  }
  const prefixStarted = measurements.first_ms["resumable-prefix"];
  const finalStarted = measurements.first_ms["sealed-final"];
  if (prefixStarted === undefined || finalStarted === undefined) {
    throw new Error("native evidence scan did not execute both scan policies");
  }
  return Object.freeze({
    phase: "native-resume-and-final-scan-evidence",
    node: REQUIRED_NODE_VERSION,
    parents,
    producer_calls: 0,
    completed_parents: receipt.work.completed_parents,
    resumed_parents: receipt.work.resumed_parents,
    work: Object.freeze({
      bytes: receipt.work.bytes,
      receipt_sha256: receipt.work.sha256,
      independent_sha256: independent.sha256,
      sha256_match: true,
    }),
    reads: Object.freeze(measurements),
    timing: Object.freeze({
      total_checkpoint_wall_ms: Math.round(checkpointEnded - started),
      resumable_prefix_start_to_final_scan_start_wall_ms: Math.round(
        finalStarted - prefixStarted,
      ),
      sealed_final_scan_start_to_receipt_wall_ms: Math.round(
        checkpointEnded - finalStarted,
      ),
      independent_sha256_wall_ms: Math.round(ended - hashStarted),
    }),
    memory: Object.freeze({
      baseline_rss_bytes: baselineRss,
      final_rss_bytes: scanFinalRss,
      resource_max_rss_bytes: resourceMaxRssBytes(),
      sampled_peak_rss_bytes: sampledPeakRss,
    }),
  });
}

async function scanV3ChildPhase(root: string): Promise<V3ScanChildResult> {
  const fixture = await fixtureFromExistingRoot(root);
  const parents = fixture.identity.records;
  if (parents !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS) {
    throw new Error("v3 native scan fixture is not the full 24,000 input");
  }
  const measurements = emptyReadMeasurements();
  const expectedPositions = {
    "resumable-prefix": 0,
    "sealed-final": 0,
  };
  const globalWithGc = globalThis as typeof globalThis & {
    gc?: () => void;
  };
  globalWithGc.gc?.();
  const baselineRss = process.memoryUsage().rss;
  const sampler = startRssSampler();
  let producerCalls = 0;
  const started = performance.now();
  const receipt = await runV3Checkpoint(
    fixture,
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
    async () => {
      producerCalls += 1;
      throw new Error("sealed v3 fixture unexpectedly requested a producer");
    },
    {
      readForTests: async (request, read) => {
        const purpose = request.purpose;
        if (purpose === "durable-prefix-final") {
          throw new Error("sealed v3 retry used the prefix-only final scan");
        }
        if (request.position !== expectedPositions[purpose]) {
          throw new Error(`${purpose} v3 scan position is not contiguous`);
        }
        if (request.length > READ_CHUNK_BYTES) {
          throw new Error(`${purpose} v3 scan exceeded the 64 KiB read bound`);
        }
        measurements.first_ms[purpose] ??= performance.now();
        const bytesRead = await read();
        measurements.calls[purpose] += 1;
        measurements.bytes[purpose] += bytesRead;
        measurements.maximum_request_bytes[purpose] = Math.max(
          measurements.maximum_request_bytes[purpose],
          request.length,
        );
        expectedPositions[purpose] += bytesRead;
        return bytesRead;
      },
    },
  );
  const checkpointEnded = performance.now();
  const sampledPeakRss = sampler.stop();
  const scanFinalRss = process.memoryUsage().rss;
  const workPath = path.join(
    fixture.stageRoot,
    FLOODGATE_V7_TEACHER_CHECKPOINT_WORK_FILENAME,
  );
  const hashStarted = performance.now();
  const independent = await streamV3IdentityAndLineStatistics(workPath);
  const ended = performance.now();
  assertV3ReceiptIdentity(receipt);
  if (producerCalls !== 0) {
    throw new Error("native v3 evidence scan invoked the forbidden producer");
  }
  if (
    receipt.gate !==
      FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000 ||
    receipt.status !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS ||
    receipt.sealed !== true ||
    receipt.work.records !== parents + 4 ||
    receipt.work.target_parents !== parents ||
    receipt.work.training_parents !== parents ||
    receipt.work.completed_parents !== parents ||
    receipt.work.resumed_parents !== parents ||
    !SHA256_RE.test(receipt.work.milestone_100_mac) ||
    receipt.work.milestone_500_mac === null ||
    !SHA256_RE.test(receipt.work.milestone_500_mac)
  ) {
    throw new Error("native v3 sealed-final retry receipt is not exact");
  }
  if (
    receipt.work.bytes !== independent.bytes ||
    receipt.work.sha256 !== independent.sha256
  ) {
    throw new Error("v3 scanner receipt and independent identity differ");
  }
  for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
    const expectedCalls = Math.ceil(independent.bytes / READ_CHUNK_BYTES);
    const expectedMaximum = Math.min(independent.bytes, READ_CHUNK_BYTES);
    if (
      measurements.bytes[purpose] !== independent.bytes ||
      measurements.calls[purpose] !== expectedCalls ||
      measurements.maximum_request_bytes[purpose] !== expectedMaximum
    ) {
      throw new Error(`${purpose} did not read the exact bounded v3 stream`);
    }
  }
  const prefixStarted = measurements.first_ms["resumable-prefix"];
  const finalStarted = measurements.first_ms["sealed-final"];
  if (prefixStarted === undefined || finalStarted === undefined) {
    throw new Error("native v3 evidence scan did not execute both policies");
  }
  return Object.freeze({
    phase: "native-v3-sealed-final-retry-evidence",
    node: REQUIRED_NODE_VERSION,
    parents,
    gate: receipt.gate,
    status: receipt.status,
    sealed: true,
    producer_calls: 0,
    completed_parents: receipt.work.completed_parents,
    resumed_parents: receipt.work.resumed_parents,
    work: Object.freeze({
      records: receipt.work.records,
      target_parents: receipt.work.target_parents,
      training_parents: receipt.work.training_parents,
      milestone_100_mac: receipt.work.milestone_100_mac,
      milestone_500_mac: receipt.work.milestone_500_mac,
      bytes: receipt.work.bytes,
      receipt_sha256: receipt.work.sha256,
      independent_sha256: independent.sha256,
      sha256_match: true,
    }),
    reads: Object.freeze(measurements),
    timing: Object.freeze({
      total_checkpoint_wall_ms: Math.round(checkpointEnded - started),
      resumable_prefix_start_to_final_scan_start_wall_ms: Math.round(
        finalStarted - prefixStarted,
      ),
      sealed_final_scan_start_to_receipt_wall_ms: Math.round(
        checkpointEnded - finalStarted,
      ),
      independent_sha256_wall_ms: Math.round(ended - hashStarted),
    }),
    memory: Object.freeze({
      baseline_rss_bytes: baselineRss,
      final_rss_bytes: scanFinalRss,
      resource_max_rss_bytes: resourceMaxRssBytes(),
      sampled_peak_rss_bytes: sampledPeakRss,
    }),
  });
}

function validateParentCount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > FLOODGATE_STABLE_MAX_ROWS
  ) {
    throw new Error(
      `parents must be an integer from 1 through ${FLOODGATE_STABLE_MAX_ROWS}`,
    );
  }
  return value;
}

function strictJsonRecord(
  value: unknown,
  expectedKeys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new Error(`${label} is not a plain JSON object`);
  }
  const actualKeys = Object.keys(value).sort(compareBytewise);
  const sortedExpected = [...expectedKeys].sort(compareBytewise);
  if (
    actualKeys.length !== sortedExpected.length ||
    actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} has an unexpected key set`);
  }
  return value as Record<string, unknown>;
}

function exactInteger(
  value: unknown,
  label: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new Error(`${label} is outside its exact integer bound`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} is not a finite nonnegative number`);
  }
  return value;
}

function exactSha256(value: unknown, label: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) {
    throw new Error(`${label} is not a lowercase SHA-256 digest`);
  }
  return value;
}

function exactTrue(value: unknown, label: string): true {
  if (value !== true) throw new Error(`${label} must be true`);
  return true;
}

function validateMemory(value: unknown, label: string, sampled: boolean): void {
  const keys = [
    "baseline_rss_bytes",
    "final_rss_bytes",
    "resource_max_rss_bytes",
    ...(sampled ? ["sampled_peak_rss_bytes"] : []),
  ];
  const memory = strictJsonRecord(value, keys, label);
  const baseline = exactInteger(
    memory.baseline_rss_bytes,
    `${label}.baseline_rss_bytes`,
    1,
  );
  const final = exactInteger(
    memory.final_rss_bytes,
    `${label}.final_rss_bytes`,
    1,
  );
  const resourcePeak = exactInteger(
    memory.resource_max_rss_bytes,
    `${label}.resource_max_rss_bytes`,
    1,
  );
  if (resourcePeak < baseline || resourcePeak < final) {
    throw new Error(`${label} process-lifetime RSS peak is inconsistent`);
  }
  if (sampled) {
    const sampledPeak = exactInteger(
      memory.sampled_peak_rss_bytes,
      `${label}.sampled_peak_rss_bytes`,
      1,
    );
    if (sampledPeak < baseline || resourcePeak < sampledPeak) {
      throw new Error(`${label} sampled RSS peak is inconsistent`);
    }
  }
}

/** Strict memory-validator seam for sampler ordering regressions. */
export function validateFloodgateV7ScanLoadMemoryCoreForTests(
  value: unknown,
): void {
  validateMemory(value, "test memory", true);
}

function validateBuildChildResult(
  value: unknown,
  expectedParents: number,
): Readonly<BuildChildResult> {
  const build = strictJsonRecord(
    value,
    [
      "candidates_per_parent",
      "games",
      "memory",
      "node",
      "parents",
      "phase",
      "raw",
      "sync",
      "timing",
      "work",
    ],
    "build child result",
  );
  if (
    build.phase !== "fixture-build-non-evidence" ||
    build.node !== REQUIRED_NODE_VERSION ||
    build.parents !== expectedParents ||
    build.candidates_per_parent !== 14
  ) {
    throw new Error("build child identity or count is invalid");
  }
  exactInteger(build.games, "build.games", 1, expectedParents);
  const raw = strictJsonRecord(build.raw, ["bytes", "sha256"], "build.raw");
  exactInteger(
    raw.bytes,
    "build.raw.bytes",
    1,
    FLOODGATE_TRAINING_RAW_MAX_BYTES,
  );
  exactSha256(raw.sha256, "build.raw.sha256");
  const work = strictJsonRecord(
    build.work,
    ["bytes", "line_statistics", "sha256"],
    "build.work",
  );
  const workBytes = exactInteger(
    work.bytes,
    "build.work.bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES - 1,
  );
  exactSha256(work.sha256, "build.work.sha256");
  const lines = strictJsonRecord(
    work.line_statistics,
    [
      "entries",
      "entry_bytes_max",
      "entry_bytes_mean",
      "entry_bytes_min",
      "entry_bytes_total",
      "header_bytes",
      "maximum_line_bytes",
      "records",
      "seal_bytes",
    ],
    "build.work.line_statistics",
  );
  const records = exactInteger(
    lines.records,
    "build.lines.records",
    expectedParents + 2,
    expectedParents + 2,
  );
  exactInteger(
    lines.entries,
    "build.lines.entries",
    expectedParents,
    expectedParents,
  );
  const headerBytes = exactInteger(
    lines.header_bytes,
    "build.lines.header_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const sealBytes = exactInteger(
    lines.seal_bytes,
    "build.lines.seal_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const entryTotal = exactInteger(
    lines.entry_bytes_total,
    "build.lines.entry_bytes_total",
    expectedParents,
  );
  const entryMin = exactInteger(
    lines.entry_bytes_min,
    "build.lines.entry_bytes_min",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const entryMax = exactInteger(
    lines.entry_bytes_max,
    "build.lines.entry_bytes_max",
    entryMin,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const entryMean = exactInteger(
    lines.entry_bytes_mean,
    "build.lines.entry_bytes_mean",
    entryMin,
    entryMax,
  );
  const lineMax = exactInteger(
    lines.maximum_line_bytes,
    "build.lines.maximum_line_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  if (
    entryTotal < entryMin * expectedParents ||
    entryTotal > entryMax * expectedParents ||
    entryMean !== Math.round(entryTotal / expectedParents) ||
    lineMax !== Math.max(headerBytes, entryMax, sealBytes) ||
    workBytes !== headerBytes + entryTotal + sealBytes + records
  ) {
    throw new Error("build child line and byte aggregates are inconsistent");
  }
  const sync = strictJsonRecord(
    build.sync,
    [
      "expected_suppressed_syncs",
      "native_method_restored_before_batch_sync",
      "one_stage_directory_batch_sync_completed",
      "one_work_batch_sync_completed",
      "suppressed_per_line_regular_file_syncs",
    ],
    "build.sync",
  );
  const expectedSyncs = expectedParents + 2;
  exactInteger(
    sync.suppressed_per_line_regular_file_syncs,
    "build.sync.suppressed",
    expectedSyncs,
    expectedSyncs,
  );
  exactInteger(
    sync.expected_suppressed_syncs,
    "build.sync.expected",
    expectedSyncs,
    expectedSyncs,
  );
  exactTrue(
    sync.native_method_restored_before_batch_sync,
    "build.sync.native_restored",
  );
  exactTrue(sync.one_work_batch_sync_completed, "build.sync.work_batch");
  exactTrue(
    sync.one_stage_directory_batch_sync_completed,
    "build.sync.stage_batch",
  );
  const timing = strictJsonRecord(
    build.timing,
    [
      "batch_sync_and_measure_wall_ms",
      "checkpoint_build_wall_ms",
      "fixture_wall_ms",
      "generation_wall_ms",
    ],
    "build.timing",
  );
  for (const key of Object.keys(timing)) {
    exactInteger(timing[key], `build.timing.${key}`);
  }
  validateMemory(build.memory, "build.memory", false);
  return build as unknown as Readonly<BuildChildResult>;
}

function validateScanChildResult(
  value: unknown,
  build: Readonly<BuildChildResult>,
): Readonly<ScanChildResult> {
  const scan = strictJsonRecord(
    value,
    [
      "completed_parents",
      "memory",
      "node",
      "parents",
      "phase",
      "producer_calls",
      "reads",
      "resumed_parents",
      "timing",
      "work",
    ],
    "scan child result",
  );
  if (
    scan.phase !== "native-resume-and-final-scan-evidence" ||
    scan.node !== REQUIRED_NODE_VERSION ||
    scan.parents !== build.parents ||
    scan.producer_calls !== 0 ||
    scan.completed_parents !== build.parents ||
    scan.resumed_parents !== build.parents
  ) {
    throw new Error(
      "scan child identity, count, or producer evidence is invalid",
    );
  }
  const work = strictJsonRecord(
    scan.work,
    ["bytes", "independent_sha256", "receipt_sha256", "sha256_match"],
    "scan.work",
  );
  if (work.bytes !== build.work.bytes || work.sha256_match !== true) {
    throw new Error("scan child work bytes or SHA match flag is invalid");
  }
  const receiptSha = exactSha256(
    work.receipt_sha256,
    "scan.work.receipt_sha256",
  );
  const independentSha = exactSha256(
    work.independent_sha256,
    "scan.work.independent_sha256",
  );
  if (receiptSha !== independentSha || receiptSha !== build.work.sha256) {
    throw new Error("scan child SHA identities disagree");
  }
  const reads = strictJsonRecord(
    scan.reads,
    ["bytes", "calls", "first_ms", "maximum_request_bytes"],
    "scan.reads",
  );
  const calls = strictJsonRecord(
    reads.calls,
    ["resumable-prefix", "sealed-final"],
    "scan.reads.calls",
  );
  const bytes = strictJsonRecord(
    reads.bytes,
    ["resumable-prefix", "sealed-final"],
    "scan.reads.bytes",
  );
  const maximums = strictJsonRecord(
    reads.maximum_request_bytes,
    ["resumable-prefix", "sealed-final"],
    "scan.reads.maximum_request_bytes",
  );
  const first = strictJsonRecord(
    reads.first_ms,
    ["resumable-prefix", "sealed-final"],
    "scan.reads.first_ms",
  );
  const expectedCalls = Math.ceil(build.work.bytes / READ_CHUNK_BYTES);
  const expectedMaximum = Math.min(build.work.bytes, READ_CHUNK_BYTES);
  for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
    exactInteger(
      calls[purpose],
      `scan.reads.calls.${purpose}`,
      expectedCalls,
      expectedCalls,
    );
    exactInteger(
      bytes[purpose],
      `scan.reads.bytes.${purpose}`,
      build.work.bytes,
      build.work.bytes,
    );
    exactInteger(
      maximums[purpose],
      `scan.reads.maximum_request_bytes.${purpose}`,
      expectedMaximum,
      expectedMaximum,
    );
    finiteNumber(first[purpose], `scan.reads.first_ms.${purpose}`);
  }
  const timing = strictJsonRecord(
    scan.timing,
    [
      "independent_sha256_wall_ms",
      "resumable_prefix_start_to_final_scan_start_wall_ms",
      "sealed_final_scan_start_to_receipt_wall_ms",
      "total_checkpoint_wall_ms",
    ],
    "scan.timing",
  );
  for (const key of Object.keys(timing)) {
    exactInteger(timing[key], `scan.timing.${key}`);
  }
  validateMemory(scan.memory, "scan.memory", true);
  return scan as unknown as Readonly<ScanChildResult>;
}

function validateV3GateProgressValue(
  value: unknown,
  expected: Readonly<{
    gate: FloodgateV7TeacherCheckpointV3Gate;
    status:
      | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS
      | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS;
    sealed: boolean;
    targetParents: number;
    resumedParents: number;
    records: number;
    producerCalls: number;
    firstInputIndex: number;
    lastInputIndex: number;
    milestone500: boolean;
  }>,
): Readonly<V3GateProgress> {
  const gate = strictJsonRecord(
    value,
    [
      "bytes",
      "completed_parents",
      "gate",
      "milestone_100_mac",
      "milestone_500_mac",
      "producer",
      "records",
      "resumed_parents",
      "sealed",
      "sha256",
      "status",
      "target_parents",
    ],
    `v3 build gate ${expected.gate}`,
  );
  if (
    gate.gate !== expected.gate ||
    gate.status !== expected.status ||
    gate.sealed !== expected.sealed
  ) {
    throw new Error(`v3 build gate ${expected.gate} discriminants differ`);
  }
  exactInteger(
    gate.target_parents,
    `${expected.gate}.target_parents`,
    expected.targetParents,
    expected.targetParents,
  );
  exactInteger(
    gate.completed_parents,
    `${expected.gate}.completed_parents`,
    expected.targetParents,
    expected.targetParents,
  );
  exactInteger(
    gate.resumed_parents,
    `${expected.gate}.resumed_parents`,
    expected.resumedParents,
    expected.resumedParents,
  );
  exactInteger(
    gate.records,
    `${expected.gate}.records`,
    expected.records,
    expected.records,
  );
  exactInteger(
    gate.bytes,
    `${expected.gate}.bytes`,
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES - 1,
  );
  exactSha256(gate.sha256, `${expected.gate}.sha256`);
  exactSha256(gate.milestone_100_mac, `${expected.gate}.milestone_100_mac`);
  if (expected.milestone500) {
    exactSha256(gate.milestone_500_mac, `${expected.gate}.milestone_500_mac`);
  } else if (gate.milestone_500_mac !== null) {
    throw new Error(`${expected.gate}.milestone_500_mac must be null`);
  }
  const producer = strictJsonRecord(
    gate.producer,
    ["calls", "first_input_index", "last_input_index"],
    `${expected.gate}.producer`,
  );
  exactInteger(
    producer.calls,
    `${expected.gate}.producer.calls`,
    expected.producerCalls,
    expected.producerCalls,
  );
  exactInteger(
    producer.first_input_index,
    `${expected.gate}.producer.first_input_index`,
    expected.firstInputIndex,
    expected.firstInputIndex,
  );
  exactInteger(
    producer.last_input_index,
    `${expected.gate}.producer.last_input_index`,
    expected.lastInputIndex,
    expected.lastInputIndex,
  );
  return gate as unknown as Readonly<V3GateProgress>;
}

function validateV3LineStatistics(
  value: unknown,
  workBytes: number,
): Readonly<V3LineStatistics> {
  const lines = strictJsonRecord(
    value,
    [
      "entries",
      "entry_bytes_max",
      "entry_bytes_mean",
      "entry_bytes_min",
      "entry_bytes_total",
      "header_bytes",
      "maximum_line_bytes",
      "milestone_100_bytes",
      "milestone_500_bytes",
      "milestone_bytes_total",
      "milestones",
      "records",
      "seal_bytes",
    ],
    "v3 build.work.line_statistics",
  );
  const parents = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  const records = exactInteger(
    lines.records,
    "v3 lines.records",
    parents + 4,
    parents + 4,
  );
  exactInteger(lines.entries, "v3 lines.entries", parents, parents);
  exactInteger(lines.milestones, "v3 lines.milestones", 2, 2);
  const headerBytes = exactInteger(
    lines.header_bytes,
    "v3 lines.header_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const entryTotal = exactInteger(
    lines.entry_bytes_total,
    "v3 lines.entry_bytes_total",
    parents,
  );
  const entryMin = exactInteger(
    lines.entry_bytes_min,
    "v3 lines.entry_bytes_min",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const entryMax = exactInteger(
    lines.entry_bytes_max,
    "v3 lines.entry_bytes_max",
    entryMin,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const entryMean = exactInteger(
    lines.entry_bytes_mean,
    "v3 lines.entry_bytes_mean",
    entryMin,
    entryMax,
  );
  const milestone100 = exactInteger(
    lines.milestone_100_bytes,
    "v3 lines.milestone_100_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const milestone500 = exactInteger(
    lines.milestone_500_bytes,
    "v3 lines.milestone_500_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const milestoneTotal = exactInteger(
    lines.milestone_bytes_total,
    "v3 lines.milestone_bytes_total",
    2,
    2 * FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const sealBytes = exactInteger(
    lines.seal_bytes,
    "v3 lines.seal_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  const lineMax = exactInteger(
    lines.maximum_line_bytes,
    "v3 lines.maximum_line_bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
  );
  if (
    entryTotal < entryMin * parents ||
    entryTotal > entryMax * parents ||
    entryMean !== Math.round(entryTotal / parents) ||
    milestoneTotal !== milestone100 + milestone500 ||
    lineMax !==
      Math.max(headerBytes, entryMax, milestone100, milestone500, sealBytes) ||
    workBytes !==
      headerBytes + entryTotal + milestoneTotal + sealBytes + records
  ) {
    throw new Error("v3 build line and byte aggregates are inconsistent");
  }
  return lines as unknown as Readonly<V3LineStatistics>;
}

function validateV3BuildChildResult(
  value: unknown,
): Readonly<V3BuildChildResult> {
  const build = strictJsonRecord(
    value,
    [
      "candidates_per_parent",
      "games",
      "gates",
      "memory",
      "node",
      "parents",
      "phase",
      "raw",
      "sync",
      "timing",
      "work",
    ],
    "v3 build child result",
  );
  const parents = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  if (
    build.phase !== "fixture-v3-three-gate-build-non-evidence" ||
    build.node !== REQUIRED_NODE_VERSION ||
    build.parents !== parents ||
    build.candidates_per_parent !== 14
  ) {
    throw new Error("v3 build child identity or count is invalid");
  }
  exactInteger(build.games, "v3 build.games", 1, parents);
  const raw = strictJsonRecord(build.raw, ["bytes", "sha256"], "v3 build.raw");
  exactInteger(
    raw.bytes,
    "v3 build.raw.bytes",
    1,
    FLOODGATE_TRAINING_RAW_MAX_BYTES,
  );
  exactSha256(raw.sha256, "v3 build.raw.sha256");
  if (!Array.isArray(build.gates) || build.gates.length !== 3) {
    throw new Error("v3 build gates must be the exact ordered triple");
  }
  const gates = [
    validateV3GateProgressValue(build.gates[0], {
      gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
      sealed: false,
      targetParents: 100,
      resumedParents: 0,
      records: 102,
      producerCalls: 100,
      firstInputIndex: 0,
      lastInputIndex: 99,
      milestone500: false,
    }),
    validateV3GateProgressValue(build.gates[1], {
      gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
      sealed: false,
      targetParents: 500,
      resumedParents: 100,
      records: 503,
      producerCalls: 400,
      firstInputIndex: 100,
      lastInputIndex: 499,
      milestone500: true,
    }),
    validateV3GateProgressValue(build.gates[2], {
      gate: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000,
      status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
      sealed: true,
      targetParents: parents,
      resumedParents: 500,
      records: parents + 4,
      producerCalls: parents - 500,
      firstInputIndex: 500,
      lastInputIndex: parents - 1,
      milestone500: true,
    }),
  ] as const;
  if (
    gates[0].milestone_100_mac !== gates[1].milestone_100_mac ||
    gates[0].milestone_100_mac !== gates[2].milestone_100_mac ||
    gates[1].milestone_500_mac !== gates[2].milestone_500_mac ||
    !(gates[0].bytes < gates[1].bytes && gates[1].bytes < gates[2].bytes)
  ) {
    throw new Error("v3 build gate progression is inconsistent");
  }
  const work = strictJsonRecord(
    build.work,
    ["bytes", "line_statistics", "sha256"],
    "v3 build.work",
  );
  const workBytes = exactInteger(
    work.bytes,
    "v3 build.work.bytes",
    1,
    FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES - 1,
  );
  const workSha = exactSha256(work.sha256, "v3 build.work.sha256");
  validateV3LineStatistics(work.line_statistics, workBytes);
  if (workBytes !== gates[2].bytes || workSha !== gates[2].sha256) {
    throw new Error("v3 build final gate and measured work disagree");
  }
  const sync = strictJsonRecord(
    build.sync,
    [
      "expected_line_syncs",
      "expected_pre_resume_syncs",
      "expected_suppressed_regular_file_syncs",
      "line_syncs",
      "native_method_restored_before_batch_sync",
      "one_stage_directory_batch_sync_completed",
      "one_work_batch_sync_completed",
      "pre_resume_syncs",
      "suppressed_regular_file_syncs",
    ],
    "v3 build.sync",
  );
  const expectedSyncs = parents + 6;
  const suppressedSyncs = exactInteger(
    sync.suppressed_regular_file_syncs,
    "v3 build.sync.suppressed_regular_file_syncs",
    expectedSyncs,
    expectedSyncs,
  );
  exactInteger(
    sync.expected_suppressed_regular_file_syncs,
    "v3 build.sync.expected_suppressed_regular_file_syncs",
    expectedSyncs,
    expectedSyncs,
  );
  const lineSyncs = exactInteger(
    sync.line_syncs,
    "v3 build.sync.line_syncs",
    parents + 4,
    parents + 4,
  );
  exactInteger(
    sync.expected_line_syncs,
    "v3 build.sync.expected_line_syncs",
    parents + 4,
    parents + 4,
  );
  const preResumeSyncs = exactInteger(
    sync.pre_resume_syncs,
    "v3 build.sync.pre_resume_syncs",
    2,
    2,
  );
  exactInteger(
    sync.expected_pre_resume_syncs,
    "v3 build.sync.expected_pre_resume_syncs",
    2,
    2,
  );
  if (lineSyncs + preResumeSyncs !== suppressedSyncs) {
    throw new Error("v3 build sync breakdown does not equal its total");
  }
  exactTrue(
    sync.native_method_restored_before_batch_sync,
    "v3 build.sync.native_restored",
  );
  exactTrue(sync.one_work_batch_sync_completed, "v3 build.sync.work_batch");
  exactTrue(
    sync.one_stage_directory_batch_sync_completed,
    "v3 build.sync.stage_batch",
  );
  const timing = strictJsonRecord(
    build.timing,
    [
      "batch_sync_and_measure_wall_ms",
      "durable_prefix_100_wall_ms",
      "durable_prefix_500_wall_ms",
      "fixture_wall_ms",
      "generation_wall_ms",
      "sealed_final_24000_wall_ms",
    ],
    "v3 build.timing",
  );
  for (const key of Object.keys(timing)) {
    exactInteger(timing[key], `v3 build.timing.${key}`);
  }
  validateMemory(build.memory, "v3 build.memory", false);
  return build as unknown as Readonly<V3BuildChildResult>;
}

function validateV3ScanChildResult(
  value: unknown,
  build: Readonly<V3BuildChildResult>,
): Readonly<V3ScanChildResult> {
  const scan = strictJsonRecord(
    value,
    [
      "completed_parents",
      "gate",
      "memory",
      "node",
      "parents",
      "phase",
      "producer_calls",
      "reads",
      "resumed_parents",
      "sealed",
      "status",
      "timing",
      "work",
    ],
    "v3 scan child result",
  );
  const parents = FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
  if (
    scan.phase !== "native-v3-sealed-final-retry-evidence" ||
    scan.node !== REQUIRED_NODE_VERSION ||
    scan.parents !== parents ||
    scan.gate !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000 ||
    scan.status !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS ||
    scan.sealed !== true ||
    scan.producer_calls !== 0 ||
    scan.completed_parents !== parents ||
    scan.resumed_parents !== parents
  ) {
    throw new Error("v3 scan child identity, count, or retry is invalid");
  }
  const work = strictJsonRecord(
    scan.work,
    [
      "bytes",
      "independent_sha256",
      "milestone_100_mac",
      "milestone_500_mac",
      "receipt_sha256",
      "records",
      "sha256_match",
      "target_parents",
      "training_parents",
    ],
    "v3 scan.work",
  );
  exactInteger(work.records, "v3 scan.work.records", parents + 4, parents + 4);
  exactInteger(
    work.target_parents,
    "v3 scan.work.target_parents",
    parents,
    parents,
  );
  exactInteger(
    work.training_parents,
    "v3 scan.work.training_parents",
    parents,
    parents,
  );
  if (work.bytes !== build.work.bytes || work.sha256_match !== true) {
    throw new Error("v3 scan child work bytes or SHA flag is invalid");
  }
  const receiptSha = exactSha256(
    work.receipt_sha256,
    "v3 scan.work.receipt_sha256",
  );
  const independentSha = exactSha256(
    work.independent_sha256,
    "v3 scan.work.independent_sha256",
  );
  const milestone100 = exactSha256(
    work.milestone_100_mac,
    "v3 scan.work.milestone_100_mac",
  );
  const milestone500 = exactSha256(
    work.milestone_500_mac,
    "v3 scan.work.milestone_500_mac",
  );
  const finalGate = build.gates[2];
  if (
    receiptSha !== independentSha ||
    receiptSha !== build.work.sha256 ||
    milestone100 !== finalGate.milestone_100_mac ||
    milestone500 !== finalGate.milestone_500_mac
  ) {
    throw new Error("v3 scan and build stream identities disagree");
  }
  const reads = strictJsonRecord(
    scan.reads,
    ["bytes", "calls", "first_ms", "maximum_request_bytes"],
    "v3 scan.reads",
  );
  const calls = strictJsonRecord(
    reads.calls,
    ["resumable-prefix", "sealed-final"],
    "v3 scan.reads.calls",
  );
  const bytes = strictJsonRecord(
    reads.bytes,
    ["resumable-prefix", "sealed-final"],
    "v3 scan.reads.bytes",
  );
  const maximums = strictJsonRecord(
    reads.maximum_request_bytes,
    ["resumable-prefix", "sealed-final"],
    "v3 scan.reads.maximum_request_bytes",
  );
  const first = strictJsonRecord(
    reads.first_ms,
    ["resumable-prefix", "sealed-final"],
    "v3 scan.reads.first_ms",
  );
  const expectedCalls = Math.ceil(build.work.bytes / READ_CHUNK_BYTES);
  const expectedMaximum = Math.min(build.work.bytes, READ_CHUNK_BYTES);
  for (const purpose of ["resumable-prefix", "sealed-final"] as const) {
    exactInteger(
      calls[purpose],
      `v3 scan.reads.calls.${purpose}`,
      expectedCalls,
      expectedCalls,
    );
    exactInteger(
      bytes[purpose],
      `v3 scan.reads.bytes.${purpose}`,
      build.work.bytes,
      build.work.bytes,
    );
    exactInteger(
      maximums[purpose],
      `v3 scan.reads.maximum_request_bytes.${purpose}`,
      expectedMaximum,
      expectedMaximum,
    );
    finiteNumber(first[purpose], `v3 scan.reads.first_ms.${purpose}`);
  }
  const timing = strictJsonRecord(
    scan.timing,
    [
      "independent_sha256_wall_ms",
      "resumable_prefix_start_to_final_scan_start_wall_ms",
      "sealed_final_scan_start_to_receipt_wall_ms",
      "total_checkpoint_wall_ms",
    ],
    "v3 scan.timing",
  );
  for (const key of Object.keys(timing)) {
    exactInteger(timing[key], `v3 scan.timing.${key}`);
  }
  validateMemory(scan.memory, "v3 scan.memory", true);
  return scan as unknown as Readonly<V3ScanChildResult>;
}

/** Strict V3 child-result seam for fast schema and aggregate unit tests. */
export function validateFloodgateV7CheckpointV3ScanLoadChildrenCoreForTests(
  buildValue: unknown,
  scanValue: unknown,
): void {
  const build = validateV3BuildChildResult(buildValue);
  validateV3ScanChildResult(scanValue, build);
}

async function runChild(
  args: readonly string[],
  capability: Readonly<RunCapability>,
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--expose-gc", "-r", "tsx/cjs", SCRIPT_PATH, ...args],
      {
        cwd: REPOSITORY_ROOT,
        env: {
          ...process.env,
          [CAPABILITY_ENV]: capability.token,
          [ROOT_ENV]: capability.root,
        },
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;
    let terminationReason: Error | undefined;
    const finish = (action: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      action();
    };
    const terminateAfterClose = (reason: Error): void => {
      if (terminationReason !== undefined) return;
      terminationReason = reason;
      child.kill("SIGKILL");
    };
    child.stdout.on("data", (chunkValue: Buffer | string) => {
      const chunk = Buffer.isBuffer(chunkValue)
        ? chunkValue
        : Buffer.from(chunkValue);
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > CHILD_OUTPUT_MAX_BYTES) {
        terminateAfterClose(new Error("load harness child stdout overflow"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunkValue: Buffer | string) => {
      const chunk = Buffer.isBuffer(chunkValue)
        ? chunkValue
        : Buffer.from(chunkValue);
      stderrBytes += chunk.byteLength;
      if (stderrBytes > CHILD_OUTPUT_MAX_BYTES) {
        terminateAfterClose(new Error("load harness child stderr overflow"));
        return;
      }
      stderr.push(chunk);
    });
    child.once("error", (cause) => finish(() => reject(cause)));
    child.once("close", (code, signal) => {
      finish(() => {
        const stderrText = Buffer.concat(stderr).toString("utf8");
        if (terminationReason !== undefined) {
          reject(terminationReason);
          return;
        }
        if (code !== 0 || signal !== null) {
          reject(
            new Error(
              `load harness child failed (code=${String(code)}, signal=${String(signal)}): ${stderrText}`,
            ),
          );
          return;
        }
        try {
          resolve(
            JSON.parse(Buffer.concat(stdout).toString("utf8")) as unknown,
          );
        } catch (cause) {
          reject(
            new Error(
              `load harness child returned invalid JSON: ${stderrText}`,
              { cause },
            ),
          );
        }
      });
    });
    const timeout = setTimeout(() => {
      terminateAfterClose(new Error("load harness child timed out"));
    }, CHILD_TIMEOUT_MS);
    timeout.unref();
  });
}

export async function runFloodgateV7CheckpointScanLoadHarness(
  options: Readonly<FloodgateV7CheckpointScanLoadOptions>,
): Promise<Readonly<FloodgateV7CheckpointScanLoadResult>> {
  requireExactNodeRuntime();
  const parents = validateParentCount(options.parents);
  const keepFixture = options.keepFixture === true;
  const capability = await createRunCapability();
  let succeeded = false;
  try {
    const build = validateBuildChildResult(
      await runChild(
        ["--internal-phase", "build", "--parents", String(parents)],
        capability,
      ),
      parents,
    );
    const scan = validateScanChildResult(
      await runChild(["--internal-phase", "scan"], capability),
      build,
    );
    if (
      build.work.bytes !== scan.work.bytes ||
      build.work.sha256 !== scan.work.receipt_sha256
    ) {
      throw new Error("fixture-build and native-scan child evidence disagree");
    }
    const nativeScan = {
      producer_calls: scan.producer_calls,
      completed_parents: scan.completed_parents,
      resumed_parents: scan.resumed_parents,
      work: scan.work,
      reads: scan.reads,
      timing: scan.timing,
      memory: scan.memory,
    } as const;
    const binding = runBinding();
    const result: FloodgateV7CheckpointScanLoadResult = {
      schema: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_SCHEMA,
      status: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_STATUS,
      claim_boundary: FLOODGATE_V7_CHECKPOINT_SCAN_LOAD_CLAIM_BOUNDARY,
      checkpoint_identity: Object.freeze({
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_SCHEMA,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_STATUS,
        claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_CLAIM_BOUNDARY,
        algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_ALGORITHM,
        run_binding: binding,
        teacher_usi_runtime: Object.freeze({
          contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
          status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
          claim_boundary:
            FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
        }),
      }),
      data: Object.freeze({
        source: "deterministic-synthetic-standard-position-legal-playouts",
        public_dataset_paths_accepted: false,
        network_reads: false,
        parents,
        games: build.games,
        unique_parent_ids: true,
        unique_position_ids: true,
        candidates_per_parent: 14,
      }),
      bounds: Object.freeze({
        theoretical_rejection_cap_bytes:
          FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_TOTAL_BYTES,
        theoretical_rejection_cap_classification:
          "conservative-cap-not-valid-stream-size",
        maximum_line_bytes: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
        maximum_parents: FLOODGATE_STABLE_MAX_ROWS,
      }),
      valid_stream: Object.freeze({
        actual_bytes: scan.work.bytes,
        actual_sha256: scan.work.receipt_sha256,
        line_statistics: build.work.line_statistics,
        actual_is_not_theoretical_cap: true,
      }),
      fixture_build: Object.freeze({
        classification: "non-evidence-build-receipt-discarded",
        raw: build.raw,
        sync: build.sync,
        timing: build.timing,
        memory: build.memory,
      }),
      native_scan: Object.freeze(nativeScan),
      runtime: Object.freeze({
        node: process.version,
        build_child_node: build.node,
        scan_child_node: scan.node,
        platform: process.platform,
        architecture: process.arch,
        logical_cpus: os.cpus().length,
      }),
      ...(keepFixture ? { preserved_fixture_root: capability.root } : {}),
    };
    succeeded = true;
    return Object.freeze(result);
  } finally {
    if (!keepFixture || !succeeded) {
      await fs.promises.rm(capability.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
  }
}

export async function runFloodgateV7CheckpointV3ScanLoadHarness(
  options: Readonly<FloodgateV7CheckpointV3ScanLoadOptions>,
): Promise<Readonly<FloodgateV7CheckpointV3ScanLoadResult>> {
  if (options?.parents !== FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS) {
    throw new Error("v3 scan-load parents must be exactly 24000");
  }
  requireExactNodeRuntime();
  const keepFixture = options.keepFixture === true;
  const capability = await createRunCapability();
  let succeeded = false;
  try {
    const build = validateV3BuildChildResult(
      await runChild(["--internal-v3-phase", "build"], capability),
    );
    const scan = validateV3ScanChildResult(
      await runChild(["--internal-v3-phase", "scan"], capability),
      build,
    );
    if (
      build.work.bytes !== scan.work.bytes ||
      build.work.sha256 !== scan.work.receipt_sha256
    ) {
      throw new Error("v3 fixture-build and native-scan evidence disagree");
    }
    const [gate100, gate500, finalGate] = build.gates;
    const result: FloodgateV7CheckpointV3ScanLoadResult = {
      schema: FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_SCHEMA,
      status: FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_STATUS,
      claim_boundary: FLOODGATE_V7_CHECKPOINT_V3_SCAN_LOAD_CLAIM_BOUNDARY,
      checkpoint_identity: Object.freeze({
        schema: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_SCHEMA,
        status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_STATUS,
        prefix_status: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_PREFIX_STATUS,
        claim_boundary: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_CLAIM_BOUNDARY,
        algorithm: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_ALGORITHM,
        gate_contract: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_CONTRACT,
        format: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FORMAT,
        durability: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_DURABILITY,
        run_id: RUN_ID,
        key_id: KEY_ID,
        run_binding: runBinding(),
        teacher_usi_runtime: Object.freeze({
          contract: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CONTRACT,
          status: FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_STATUS,
          claim_boundary:
            FLOODGATE_PRODUCTION_TEACHER_USI_RUNTIME_CLAIM_BOUNDARY,
        }),
      }),
      data: Object.freeze({
        source: "deterministic-synthetic-standard-position-legal-playouts",
        public_dataset_paths_accepted: false,
        network_reads: false,
        parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
        games: build.games,
        unique_parent_ids: true,
        unique_position_ids: true,
        candidates_per_parent: 14,
      }),
      bounds: Object.freeze({
        theoretical_rejection_cap_bytes:
          FLOODGATE_V7_TEACHER_CHECKPOINT_V3_MAX_TOTAL_BYTES,
        theoretical_rejection_cap_classification:
          "conservative-cap-not-valid-stream-size",
        maximum_line_bytes: FLOODGATE_V7_TEACHER_CHECKPOINT_MAX_LINE_BYTES,
        maximum_parents: FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS,
      }),
      valid_stream: Object.freeze({
        actual_bytes: scan.work.bytes,
        actual_sha256: scan.work.receipt_sha256,
        line_statistics: build.work.line_statistics,
        actual_is_not_theoretical_cap: true,
      }),
      fixture_build: Object.freeze({
        classification:
          "receipt-derived-three-gate-build-summary-not-durability-evidence",
        full_authenticated_input_reused_at_all_gates: true,
        fresh_lease_and_training_claim_per_gate: true,
        same_private_root_stage_and_run_at_all_gates: true,
        raw: build.raw,
        gate_progress: Object.freeze({
          "durable-prefix-100": gate100,
          "durable-prefix-500": gate500,
          "sealed-final-24000": finalGate,
        }),
        sync: build.sync,
        timing: build.timing,
        memory: build.memory,
      }),
      native_scan: Object.freeze({
        gate: scan.gate,
        status: scan.status,
        sealed: scan.sealed,
        producer_calls: scan.producer_calls,
        completed_parents: scan.completed_parents,
        resumed_parents: scan.resumed_parents,
        work: scan.work,
        reads: scan.reads,
        timing: scan.timing,
        memory: scan.memory,
        work_unchanged_since_build: true,
      }),
      runtime: Object.freeze({
        node: process.version,
        build_child_node: build.node,
        scan_child_node: scan.node,
        platform: process.platform,
        architecture: process.arch,
        logical_cpus: os.cpus().length,
      }),
      ...(keepFixture ? { preserved_fixture_root: capability.root } : {}),
    };
    succeeded = true;
    return Object.freeze(result);
  } finally {
    if (!keepFixture || !succeeded) {
      await fs.promises.rm(capability.root, {
        recursive: true,
        force: true,
        maxRetries: 3,
      });
    }
  }
}

function requiredOptionValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function canonicalParentCount(value: string, label: string): number {
  if (!/^[1-9][0-9]{0,4}$/.test(value)) {
    throw new Error(`${label} must be canonical positive decimal text`);
  }
  return validateParentCount(Number(value));
}

function parsePublicOptions(
  args: readonly string[],
): FloodgateV7CheckpointScanLoadOptions {
  let parents: number | undefined;
  let keepFixture = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--parents") {
      if (parents !== undefined) throw new Error("--parents is duplicated");
      const value = requiredOptionValue(args, index, argument);
      parents = canonicalParentCount(value, argument);
      index += 1;
    } else if (argument === "--keep-fixture") {
      if (keepFixture) throw new Error("--keep-fixture is duplicated");
      keepFixture = true;
    } else {
      throw new Error(`unknown load harness option: ${argument}`);
    }
  }
  if (parents === undefined) {
    throw new Error("--parents is required (use --parents 24000 manually)");
  }
  return Object.freeze({
    parents: validateParentCount(parents),
    keepFixture,
  });
}

function canonicalV3ParentCount(value: string, label: string): 24_000 {
  if (value !== "24000") {
    throw new Error(`${label} must be the canonical fixed value 24000`);
  }
  return FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS;
}

function parseV3PublicOptions(
  args: readonly string[],
): FloodgateV7CheckpointV3ScanLoadOptions {
  let mode = false;
  let parents:
    typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_FINAL_PARENTS | undefined;
  let keepFixture = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--v3-gates") {
      if (mode) throw new Error("--v3-gates is duplicated");
      mode = true;
    } else if (argument === "--parents") {
      if (parents !== undefined) throw new Error("--parents is duplicated");
      parents = canonicalV3ParentCount(
        requiredOptionValue(args, index, argument),
        argument,
      );
      index += 1;
    } else if (argument === "--keep-fixture") {
      if (keepFixture) throw new Error("--keep-fixture is duplicated");
      keepFixture = true;
    } else {
      throw new Error(`unknown v3 load harness option: ${argument}`);
    }
  }
  if (!mode || args[0] !== "--v3-gates") {
    throw new Error("--v3-gates must be the first explicit v3 mode option");
  }
  if (parents === undefined) {
    throw new Error("--parents 24000 is required for the fixed v3 gates");
  }
  return Object.freeze({ parents, keepFixture });
}

/** Strict public CLI parser seam for fast fail-closed regression tests. */
export function parseFloodgateV7CheckpointScanLoadOptionsCoreForTests(
  args: readonly string[],
): Readonly<FloodgateV7CheckpointScanLoadOptions> {
  return Object.freeze(parsePublicOptions(args));
}

/** Strict explicit V3 CLI parser; legacy V2 parsing remains independent. */
export function parseFloodgateV7CheckpointV3ScanLoadOptionsCoreForTests(
  args: readonly string[],
): Readonly<FloodgateV7CheckpointV3ScanLoadOptions> {
  return Object.freeze(parseV3PublicOptions(args));
}

type InternalPhaseOptions =
  Readonly<{ phase: "build"; parents: number }> | Readonly<{ phase: "scan" }>;

function parseInternalPhaseOptions(
  args: readonly string[],
): InternalPhaseOptions {
  if (
    args.length === 4 &&
    args[0] === "--internal-phase" &&
    args[1] === "build" &&
    args[2] === "--parents"
  ) {
    return Object.freeze({
      phase: "build" as const,
      parents: canonicalParentCount(args[3], "internal --parents"),
    });
  }
  if (
    args.length === 2 &&
    args[0] === "--internal-phase" &&
    args[1] === "scan"
  ) {
    return Object.freeze({ phase: "scan" as const });
  }
  throw new Error("internal load child argv is not exact");
}

/** Exact hidden-child argv parser seam; it deliberately accepts no root. */
export function parseFloodgateV7CheckpointScanLoadInternalOptionsCoreForTests(
  args: readonly string[],
): InternalPhaseOptions {
  return parseInternalPhaseOptions(args);
}

type V3InternalPhaseOptions = Readonly<{ phase: "build" | "scan" }>;

function parseV3InternalPhaseOptions(
  args: readonly string[],
): V3InternalPhaseOptions {
  if (
    args.length === 2 &&
    args[0] === "--internal-v3-phase" &&
    (args[1] === "build" || args[1] === "scan")
  ) {
    return Object.freeze({ phase: args[1] });
  }
  throw new Error("internal v3 load child argv is not exact");
}

/** Exact V3 hidden-child argv parser; it deliberately accepts no root. */
export function parseFloodgateV7CheckpointV3ScanLoadInternalOptionsCoreForTests(
  args: readonly string[],
): V3InternalPhaseOptions {
  return parseV3InternalPhaseOptions(args);
}

async function commandLine(args: readonly string[]): Promise<void> {
  requireExactNodeRuntime();
  if (args[0] === "--internal-v3-phase") {
    const internal = parseV3InternalPhaseOptions(args);
    const capability = await validateRunCapabilityFromEnvironment();
    process.stdout.write(
      JSON.stringify(
        internal.phase === "build"
          ? await buildV3ChildPhase(capability.root)
          : await scanV3ChildPhase(capability.root),
      ),
    );
    return;
  }
  if (args[0] === "--internal-phase") {
    const internal = parseInternalPhaseOptions(args);
    const capability = await validateRunCapabilityFromEnvironment();
    if (internal.phase === "build") {
      process.stdout.write(
        JSON.stringify(
          await buildChildPhase(internal.parents, capability.root),
        ),
      );
      return;
    }
    process.stdout.write(JSON.stringify(await scanChildPhase(capability.root)));
    return;
  }
  if (args[0] === "--v3-gates") {
    const result = await runFloodgateV7CheckpointV3ScanLoadHarness(
      parseV3PublicOptions(args),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const result = await runFloodgateV7CheckpointScanLoadHarness(
    parsePublicOptions(args),
  );
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === SCRIPT_PATH) {
  void commandLine(process.argv.slice(2)).catch((cause: unknown) => {
    const message =
      cause instanceof Error ? (cause.stack ?? cause.message) : String(cause);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
