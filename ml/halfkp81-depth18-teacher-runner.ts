/**
 * Formal HalfKP81 hard-parent depth18 teacher runner.
 *
 * The public plan and selected parents are immutable inputs.  Private work is
 * append-only and durable; the three role artifacts are reconstructed from
 * authenticated work and published without replacement.  The structural
 * receipt is deliberately published last and does not authorize training.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import {
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_LABEL_POLICY,
  labelSiblingParent,
  validateWorkEntry,
  type CompletedWorkEntry,
} from "./generate-sibling-teacher";
import {
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY,
  FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA,
  createFloodgateProductionStableWasmRuntime,
  getFloodgateProductionStableWasmRuntimeReceiptDigest,
  type FloodgateProductionStableWasmRuntimeResult,
} from "./floodgate-production-stable-wasm-runtime";
import {
  FLOODGATE_STABLE_MATE_SCORE_MAX,
  FLOODGATE_STABLE_MATE_SCORE_MIN,
  FLOODGATE_STABLE_REQUESTED_DEPTH,
  FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA,
  FLOODGATE_STABLE_WASM_SCORE_ENCODING,
} from "./floodgate-stable-wasm-proposer";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import {
  childSfenAfterUsi,
  positionFromSfen,
  rulesCompleteLegalMoves,
} from "./shogi-sfen";
import {
  positionKeyFromSfen,
  validateParentGroups,
  type SiblingRecord,
} from "./sibling-data";
import { UsiTeacherEngine, type UsiTeacherEngineOptions } from "./usi-engine";

export const HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-plan-v2" as const;
export const HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-work-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_MILESTONE_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-milestone-v1" as const;
export const HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA =
  "shogi-halfkp81-hard-depth18-teacher-terminal-fault-v1" as const;
export const HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA =
  "halfkp81-depth18-hard-parent-v2" as const;
export const HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA =
  "halfkp81-depth18-hard-parent-selection-manifest-v2" as const;

export const HALFKP81_DEPTH18_TEACHER_PARENT_COUNT = 8_192 as const;
export const HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS = Object.freeze({
  fit: 6_144,
  tune: 1_024,
  sealed: 1_024,
} as const);
export const HALFKP81_DEPTH18_TEACHER_MILESTONES = Object.freeze([
  100, 500,
] as const);
export const HALFKP81_DEPTH18_TEACHER_PROCESSES = 13 as const;
export const HALFKP81_DEPTH18_TEACHER_MULTIPV = 12 as const;
export const HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH = 16 as const;
export const HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH = 18 as const;
export const HALFKP81_DEPTH18_TEACHER_HASH_MIB = 512 as const;
export const HALFKP81_DEPTH18_TEACHER_PARENT_TIMEOUT_MS = 600_000 as const;

export const HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-engine-evaldir-v2" as const;
export const HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH =
  `${HALFKP81_DEPTH18_TEACHER_DEFAULT_DIRECTORY}/teacher-plan.json` as const;
export const HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH =
  "ml/engine-receipts/yaneuraou-9133c527-applem1.json" as const;
export const HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES = 654 as const;
export const HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256 =
  "a448c6be4229216665a34dbc13edf89f486364a57958ba1adad76a7b206f9c4e" as const;

const EXPECTED_ENGINE_BINARY = Object.freeze({
  path: "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou",
  bytes: 700_048,
  sha256: "1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1",
});
const EXPECTED_ENGINE_EVAL = Object.freeze({
  path: "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/eval/eval/nn.bin",
  bytes: 64_217_066,
  sha256: "1141d275bceec911156801f27303dc9ff5beb24f4f59144cc069306c59e80782",
});
const EXPECTED_EVAL_TREE_SHA256 =
  "639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568";
const EXPECTED_ENGINE_SOURCE_REVISION =
  "9133c527791c8b2f5f378a32df29a5e3752bd41b";
const EXPECTED_ENGINE_ID = "YaneuraOu NNUE 9.60git 64APPLEM1";
const EXPECTED_PREREGISTRATION = Object.freeze({
  path: "ml/halfkp81-hard-depth18-strength-v1-plan.json",
  bytes: 5_855,
  sha256: "fc25e155345cb61739e2ef5a9198511501b12340e8d05b56ee77ba267b232971",
  schema: "shogi-halfkp81-hard-depth18-strength-plan-v1",
});
const EXPECTED_TECHNICAL_RECOVERY = Object.freeze({
  path: "ml/halfkp81-hard-depth18-engine-evaldir-v2-plan.json",
  bytes: 5_889,
  sha256: "58410d65bb553486c51c2ab332abba21ddcc8ef743af27378208ffcb3ec8baf2",
  schema: "shogi-halfkp81-hard-depth18-engine-evaldir-recovery-plan-v2",
});

const EXPECTED_TEACHER = Object.freeze({
  engine: EXPECTED_ENGINE_ID,
  proposal_depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH,
  proposal_multipv: HALFKP81_DEPTH18_TEACHER_MULTIPV,
  stable_move_depth: FLOODGATE_STABLE_REQUESTED_DEPTH,
  rescore_depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
  threads_per_process: 1,
  hash_mib_per_process: HALFKP81_DEPTH18_TEACHER_HASH_MIB,
  processes: HALFKP81_DEPTH18_TEACHER_PROCESSES,
  timeout_seconds_per_parent: 600,
  minimum_rows_per_parent: 2,
  maximum_rows_per_parent: 14,
  expected_rows_point: 95_191,
  maximum_rows: 114_688,
});

const EXPECTED_PLAN_OUTPUT_KEYS = Object.freeze([
  "directory",
  "plan_json",
  "fit_jsonl",
  "tune_jsonl",
  "sealed_jsonl",
  "work_jsonl",
  "milestone_100_json",
  "milestone_500_json",
  "terminal_fault_json",
  "receipt_json",
  "verified_artifact_receipt_json",
] as const);
const SHA256_RE = /^[0-9a-f]{64}$/u;
const SEMANTIC_ID_RE = /^sha256:[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const STABLE_PARENT_DIGEST_DOMAIN = "shogi-floodgate-stable-parent-v1\0";
const STABLE_RESULT_ROW_DIGEST_DOMAIN =
  "shogi-floodgate-production-stable-runtime-row-v1\0";
const WORK_FINGERPRINT_DOMAIN = "shogi-halfkp81-hard-depth18-teacher-run-v1\0";
const WORK_ENTRY_DIGEST_DOMAIN =
  "shogi-halfkp81-hard-depth18-teacher-work-entry-v1\0";

export type Halfkp81Depth18TeacherRole = "fit" | "tune" | "sealed";

export interface Halfkp81Depth18TeacherFileIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema?: string;
}

export interface Halfkp81Depth18SelectionRow {
  readonly schema: typeof HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA;
  readonly source_game_id: string;
  readonly game_id: string;
  readonly source_game_sha256: string;
  readonly position_id: string;
  readonly sfen: string;
  readonly recorded_move: string;
  readonly side_to_move: "b" | "w";
  readonly ply: number;
  readonly phase: "opening" | "mid" | "late";
  readonly old_depth12_cp: number;
  readonly old_outcome: 0 | 0.5 | 1;
  readonly old_depth12_signals_usage: "selection_only_never_teacher_target";
  readonly minimum_player_rating: number;
  readonly sente_rating: number;
  readonly gote_rating: number;
  readonly legal_move_count: number;
  readonly hardness_cp_outcome_surprise: number;
  readonly hardness_tiebreak_sha256: string;
  readonly role: Halfkp81Depth18TeacherRole;
}

export interface Halfkp81Depth18AuthenticatedTeacherPlan {
  readonly plan: Readonly<Record<string, unknown>>;
  readonly planIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity> & {
    readonly schema: typeof HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA;
  };
  readonly sourceRevision: string;
  readonly selectionIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity> & {
    readonly rows: number;
    readonly schema: typeof HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA;
  };
  readonly selectionManifestIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly selectionRows: readonly Readonly<Halfkp81Depth18SelectionRow>[];
  readonly parents: readonly Readonly<FloodgateTrainingParent>[];
  readonly roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>;
  readonly outputs: Readonly<
    Record<(typeof EXPECTED_PLAN_OUTPUT_KEYS)[number], string>
  >;
  readonly engine: Readonly<{
    readonly binary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly eval_file: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly eval_tree_sha256: string;
    readonly source_revision: string;
    readonly id: string;
  }>;
  readonly teacher: typeof EXPECTED_TEACHER;
}

export interface Halfkp81Depth18TeacherWorkHeader {
  readonly schema: typeof HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA;
  readonly kind: "header";
  readonly run_fingerprint: string;
  readonly teacher_plan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly source_revision: string;
  readonly selection_jsonl: Readonly<Halfkp81Depth18TeacherFileIdentity> & {
    readonly rows: number;
    readonly schema: typeof HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA;
  };
  readonly selection_manifest: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly engine: Readonly<{
    readonly binary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly eval_file: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    readonly receipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  }>;
  readonly teacher: typeof EXPECTED_TEACHER;
  readonly stable_runtime: Readonly<{
    readonly receipt_sha256: string;
    readonly receipt: Readonly<Record<string, unknown>>;
  }>;
  readonly label_policy: typeof SIBLING_TEACHER_LABEL_POLICY;
}

export interface Halfkp81Depth18TeacherWorkEntry {
  readonly schema: typeof HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA;
  readonly kind: "parent";
  readonly run_fingerprint: string;
  readonly parent_id: string;
  readonly role: Halfkp81Depth18TeacherRole;
  readonly stable_result: Readonly<FloodgateProductionStableWasmRuntimeResult>;
  readonly teacher_entry: Readonly<CompletedWorkEntry>;
  readonly payload_sha256: string;
}

export interface Halfkp81Depth18TeacherStableRuntime {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptDigest: string;
  readonly propose: (
    parent: Readonly<FloodgateTrainingParent>,
  ) => Promise<Readonly<FloodgateProductionStableWasmRuntimeResult>>;
  readonly close: () => Promise<void>;
}

export interface Halfkp81Depth18TeacherEngine {
  readonly resetForParent: UsiTeacherEngine["resetForParent"];
  readonly search: UsiTeacherEngine["search"];
  readonly quit: UsiTeacherEngine["quit"];
}

export interface Halfkp81Depth18TeacherRunnerDependencies {
  readonly createStableRuntime?: () => Promise<Halfkp81Depth18TeacherStableRuntime>;
  readonly createEngine?: (
    options: Readonly<UsiTeacherEngineOptions>,
  ) => Promise<Halfkp81Depth18TeacherEngine>;
  readonly labelParent?: typeof labelSiblingParent;
  readonly authenticateFixedAssets?: (
    authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  ) => Promise<
    Readonly<{
      binary: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      evalFile: Readonly<Halfkp81Depth18TeacherFileIdentity>;
      engineReceipt: Readonly<Halfkp81Depth18TeacherFileIdentity>;
    }>
  >;
  readonly now?: () => number;
  readonly parentTimeoutMs?: number;
  readonly processes?: number;
}

export interface Halfkp81Depth18TeacherCoreContract {
  readonly parentCount: number;
  readonly roleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>;
  readonly milestones: readonly number[];
  readonly maximumRows: number;
}

export interface Halfkp81Depth18TeacherRunResult {
  readonly receipt: Readonly<Record<string, unknown>>;
  readonly receiptIdentity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
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
      throw new Error(
        "canonical JSON rejects non-finite numbers and negative zero",
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

function canonicalJsonLine(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, "utf8");
}

function sha256(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parentOccurrenceId(gameId: string, ply: number): string {
  return `sha256:${sha256(`parent-occurrence-v1\0${gameId}\0${ply}`)}`;
}

async function readHeldStableFile(
  filePath: string,
  label: string,
): Promise<Buffer> {
  const beforePath = await fs.promises.lstat(filePath, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()) {
    throw new Error(`${label} must be a regular non-symlink file`);
  }
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const handle = await fs.promises.open(filePath, flags);
  try {
    const before = await handle.stat({ bigint: true });
    if (
      !before.isFile() ||
      before.dev !== beforePath.dev ||
      before.ino !== beforePath.ino ||
      before.size !== beforePath.size
    ) {
      throw new Error(`${label} changed during safe open`);
    }
    if (before.size > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(`${label} exceeds the safe read bound`);
    }
    const size = Number(before.size);
    const first = Buffer.allocUnsafe(size);
    const second = Buffer.allocUnsafe(size);
    const firstRead = await handle.read(first, 0, size, 0);
    const afterFirst = await handle.stat({ bigint: true });
    const secondRead = await handle.read(second, 0, size, 0);
    const afterSecond = await handle.stat({ bigint: true });
    const afterPath = await fs.promises.lstat(filePath, { bigint: true });
    const signature = (entry: fs.BigIntStats): string =>
      [entry.dev, entry.ino, entry.size, entry.mtimeNs, entry.ctimeNs].join(
        ":",
      );
    if (
      firstRead.bytesRead !== size ||
      secondRead.bytesRead !== size ||
      !first.equals(second) ||
      new Set(
        [before, afterFirst, afterSecond, afterPath].map((entry) =>
          signature(entry),
        ),
      ).size !== 1
    ) {
      throw new Error(`${label} changed during held double read`);
    }
    return first;
  } finally {
    await handle.close();
  }
}

function parseCanonicalJson(
  raw: Buffer,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error(`${label} is invalid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !raw.equals(canonicalJsonLine(value))
  ) {
    throw new Error(`${label} is not canonical JSON with one terminal LF`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort(compareBytewise);
  const expected = [...keys].sort(compareBytewise);
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} fields differ`);
  }
}

function fileIdentity(
  filePath: string,
  raw: Uint8Array,
): Halfkp81Depth18TeacherFileIdentity {
  return { path: filePath, bytes: raw.byteLength, sha256: sha256(raw) };
}

function assertIdentity(
  value: unknown,
  actual: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  label: string,
  schema?: string,
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} identity is missing`);
  }
  const identity = value as Record<string, unknown>;
  exactKeys(
    identity,
    schema === undefined
      ? ["path", "bytes", "sha256"]
      : ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (
    identity.path !== actual.path ||
    identity.bytes !== actual.bytes ||
    identity.sha256 !== actual.sha256 ||
    (schema !== undefined && identity.schema !== schema)
  ) {
    throw new Error(`${label} identity differs`);
  }
}

function teacherSettings(value: unknown): typeof EXPECTED_TEACHER {
  if (canonicalJson(value) !== canonicalJson(EXPECTED_TEACHER)) {
    throw new Error("teacher plan settings differ");
  }
  return EXPECTED_TEACHER;
}

function validateSelectionRows(
  raw: Buffer,
  expectedCount: number,
  expectedRoleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>,
): {
  rows: readonly Readonly<Halfkp81Depth18SelectionRow>[];
  parents: readonly Readonly<FloodgateTrainingParent>[];
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>;
} {
  if (!raw.toString("utf8").endsWith("\n")) {
    throw new Error("selection JSONL must end with LF");
  }
  const lines = raw.toString("utf8").split("\n");
  lines.pop();
  if (lines.length !== expectedCount) {
    throw new Error(`selection must contain exactly ${expectedCount} rows`);
  }
  const expectedKeys = [
    "schema",
    "source_game_id",
    "game_id",
    "source_game_sha256",
    "position_id",
    "sfen",
    "recorded_move",
    "side_to_move",
    "ply",
    "phase",
    "old_depth12_cp",
    "old_outcome",
    "old_depth12_signals_usage",
    "minimum_player_rating",
    "sente_rating",
    "gote_rating",
    "legal_move_count",
    "hardness_cp_outcome_surprise",
    "hardness_tiebreak_sha256",
    "role",
  ] as const;
  const rows: Halfkp81Depth18SelectionRow[] = [];
  const parents: FloodgateTrainingParent[] = [];
  const roles = new Map<string, Halfkp81Depth18TeacherRole>();
  const games = new Set<string>();
  const positions = new Set<string>();
  const roleCounts = { fit: 0, tune: 0, sealed: 0 };
  const phaseSideCounts = {
    opening: { b: 0, w: 0 },
    mid: { b: 0, w: 0 },
    late: { b: 0, w: 0 },
  };
  const roleSideCounts = {
    fit: { b: 0, w: 0 },
    tune: { b: 0, w: 0 },
    sealed: { b: 0, w: 0 },
  };
  const roleOrder = { fit: 0, tune: 1, sealed: 2 };
  const phaseOrder = { opening: 0, mid: 1, late: 2 };
  let previousOrder: readonly (string | number)[] | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      throw new Error(`selection line ${index + 1} is invalid JSON`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`selection line ${index + 1} is not an object`);
    }
    const row = parsed as unknown as Halfkp81Depth18SelectionRow;
    exactKeys(
      row as unknown as Record<string, unknown>,
      expectedKeys,
      `selection line ${index + 1}`,
    );
    // Python's canonical encoder preserves 0.0/1.0 while JSON.parse collapses
    // them to JavaScript numbers.  The held bytes are already SHA-bound by the
    // authenticated plan, so semantic validation is authoritative here.
    const role = row.role;
    const phase =
      row.ply >= 12 && row.ply <= 39
        ? "opening"
        : row.ply >= 40 && row.ply <= 79
          ? "mid"
          : row.ply >= 80 && row.ply <= 119
            ? "late"
            : undefined;
    if (
      row.schema !== HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA ||
      !SEMANTIC_ID_RE.test(row.game_id) ||
      row.source_game_id !== row.game_id ||
      !SHA256_RE.test(row.source_game_sha256) ||
      !SEMANTIC_ID_RE.test(row.position_id) ||
      games.has(row.game_id) ||
      positions.has(row.position_id) ||
      (role !== "fit" && role !== "tune" && role !== "sealed") ||
      phase === undefined ||
      row.phase !== phase ||
      !Number.isSafeInteger(row.ply) ||
      !Number.isSafeInteger(row.legal_move_count) ||
      row.legal_move_count < 2 ||
      !Number.isSafeInteger(row.old_depth12_cp) ||
      Math.abs(row.old_depth12_cp) > 1_000 ||
      ![0, 0.5, 1].includes(row.old_outcome) ||
      row.old_depth12_signals_usage !== "selection_only_never_teacher_target" ||
      row.minimum_player_rating !== Math.min(row.sente_rating, row.gote_rating)
    ) {
      throw new Error(
        `selection line ${index + 1} violates the fixed contract`,
      );
    }
    const fields = row.sfen.split(" ");
    if (
      fields.length !== 4 ||
      fields.some((field) => field === "") ||
      (row.side_to_move !== "b" && row.side_to_move !== "w") ||
      fields[1] !== row.side_to_move ||
      Number(fields[3]) !== row.ply + 1 ||
      positionKeyFromSfen(row.sfen) !== row.position_id
    ) {
      throw new Error(
        `selection line ${index + 1} has inconsistent SFEN identity`,
      );
    }
    const { position } = positionFromSfen(row.sfen);
    const legal = rulesCompleteLegalMoves(position).map((entry) => entry.usi);
    if (
      legal.length !== row.legal_move_count ||
      !legal.includes(row.recorded_move) ||
      new Set(legal).size !== legal.length
    ) {
      throw new Error(
        `selection line ${index + 1} legal-move evidence differs`,
      );
    }
    const target =
      row.old_outcome === 1 ? 1_000 : row.old_outcome === 0 ? -1_000 : 0;
    const tieMaterial =
      `{"game_id":${JSON.stringify(row.game_id)}` +
      `,"minimum_player_rating":${row.minimum_player_rating}` +
      `,"old_depth12_cp":${row.old_depth12_cp}` +
      `,"old_outcome":${Number(row.old_outcome).toFixed(1)}` +
      `,"position_id":${JSON.stringify(row.position_id)}}\n`;
    const surprise = Math.abs(target - row.old_depth12_cp);
    const currentOrder: readonly (string | number)[] = [
      roleOrder[role],
      phaseOrder[phase],
      row.side_to_move,
      -surprise,
      -row.minimum_player_rating,
      row.hardness_tiebreak_sha256,
    ];
    const orderDiff =
      previousOrder === undefined
        ? 0
        : currentOrder.findIndex((value, position) => {
            const previous = previousOrder?.[position] as string | number;
            return value !== previous;
          });
    if (orderDiff >= 0 && previousOrder !== undefined) {
      const left = currentOrder[orderDiff];
      const right = previousOrder[orderDiff];
      const comparison =
        typeof left === "string" && typeof right === "string"
          ? compareBytewise(left, right)
          : Number(left) - Number(right);
      if (comparison < 0) {
        throw new Error(`selection line ${index + 1} ordering differs`);
      }
    }
    if (
      row.hardness_cp_outcome_surprise !== surprise ||
      row.hardness_tiebreak_sha256 !== sha256(tieMaterial)
    ) {
      throw new Error(`selection line ${index + 1} hardness binding differs`);
    }
    const parent: FloodgateTrainingParent = {
      schema_version: 1,
      game_id: row.game_id,
      parent_id: parentOccurrenceId(row.game_id, row.ply),
      position_id: row.position_id,
      parent_sfen: row.sfen,
      ply: row.ply,
      played_move: row.recorded_move,
    };
    games.add(row.game_id);
    positions.add(row.position_id);
    roleCounts[role] += 1;
    phaseSideCounts[phase][row.side_to_move] += 1;
    roleSideCounts[role][row.side_to_move] += 1;
    previousOrder = currentOrder;
    roles.set(parent.parent_id, role);
    rows.push(Object.freeze({ ...row }));
    parents.push(Object.freeze(parent));
  }
  if (canonicalJson(roleCounts) !== canonicalJson(expectedRoleCounts)) {
    throw new Error("selection role counts differ");
  }
  if (
    expectedCount === HALFKP81_DEPTH18_TEACHER_PARENT_COUNT &&
    (canonicalJson(phaseSideCounts) !==
      canonicalJson({
        opening: { b: 1_024, w: 1_024 },
        mid: { b: 1_536, w: 1_536 },
        late: { b: 1_536, w: 1_536 },
      }) ||
      canonicalJson(roleSideCounts) !==
        canonicalJson({
          fit: { b: 3_072, w: 3_072 },
          tune: { b: 512, w: 512 },
          sealed: { b: 512, w: 512 },
        }))
  ) {
    throw new Error("selection phase/side or role/side quotas differ");
  }
  return {
    rows: Object.freeze(rows),
    parents: Object.freeze(parents),
    roles,
  };
}

export function validateHalfkp81Depth18SelectionRowsCoreForTests(
  raw: Uint8Array,
  expectedCount: number,
  expectedRoleCounts: Readonly<Record<Halfkp81Depth18TeacherRole, number>>,
): ReturnType<typeof validateSelectionRows> {
  return validateSelectionRows(
    Buffer.from(raw),
    expectedCount,
    expectedRoleCounts,
  );
}

export async function authenticateHalfkp81Depth18TeacherPlan(
  planPath = HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>> {
  const absolutePlanPath = path.resolve(planPath);
  const planRaw = await readHeldStableFile(absolutePlanPath, "teacher plan");
  const plan = parseCanonicalJson(planRaw, "teacher plan");
  exactKeys(
    plan,
    [
      "schema",
      "status",
      "source_revision",
      "preregistration",
      "technical_recovery",
      "selection_manifest",
      "selection_evidence",
      "selection_roles",
      "engine",
      "teacher",
      "outputs",
      "authority",
    ],
    "teacher plan",
  );
  if (
    plan.schema !== HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA ||
    plan.status !== "sealed-not-executed" ||
    typeof plan.source_revision !== "string" ||
    !REVISION_RE.test(plan.source_revision) ||
    plan.source_revision === "0".repeat(40) ||
    canonicalJson(plan.selection_roles) !==
      canonicalJson(HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS) ||
    canonicalJson(plan.preregistration) !==
      canonicalJson(EXPECTED_PREREGISTRATION) ||
    canonicalJson(plan.technical_recovery) !==
      canonicalJson(EXPECTED_TECHNICAL_RECOVERY) ||
    canonicalJson(plan.authority) !==
      canonicalJson({
        may_execute_teacher: true,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      })
  ) {
    throw new Error("teacher plan authority or fixed accounting differs");
  }
  const teacher = teacherSettings(plan.teacher);
  const engine = plan.engine as Record<string, unknown>;
  exactKeys(
    engine,
    ["binary", "eval_file", "eval_tree_sha256", "source_revision", "id"],
    "teacher engine",
  );
  if (
    canonicalJson(engine.binary) !== canonicalJson(EXPECTED_ENGINE_BINARY) ||
    canonicalJson(engine.eval_file) !== canonicalJson(EXPECTED_ENGINE_EVAL) ||
    engine.eval_tree_sha256 !== EXPECTED_EVAL_TREE_SHA256 ||
    engine.source_revision !== EXPECTED_ENGINE_SOURCE_REVISION ||
    engine.id !== EXPECTED_ENGINE_ID
  ) {
    throw new Error("teacher engine binding differs");
  }
  const outputs = plan.outputs as Record<string, unknown>;
  exactKeys(outputs, EXPECTED_PLAN_OUTPUT_KEYS, "teacher outputs");
  const directory = outputs.directory;
  if (
    typeof directory !== "string" ||
    !path.isAbsolute(directory) ||
    path.normalize(directory) !== directory
  ) {
    throw new Error("teacher output directory is not canonical absolute");
  }
  const capturedOutputs = {} as Record<
    (typeof EXPECTED_PLAN_OUTPUT_KEYS)[number],
    string
  >;
  for (const key of EXPECTED_PLAN_OUTPUT_KEYS) {
    const output = outputs[key];
    if (
      typeof output !== "string" ||
      !path.isAbsolute(output) ||
      path.normalize(output) !== output ||
      (key !== "directory" && path.dirname(output) !== directory)
    ) {
      throw new Error(`teacher output ${key} is not a canonical child`);
    }
    capturedOutputs[key] = output;
  }
  if (
    new Set(
      EXPECTED_PLAN_OUTPUT_KEYS.slice(1).map((key) => capturedOutputs[key]),
    ).size !==
    EXPECTED_PLAN_OUTPUT_KEYS.length - 1
  ) {
    throw new Error("teacher output paths are not distinct");
  }
  if (capturedOutputs.plan_json !== absolutePlanPath) {
    throw new Error("teacher plan path differs from its sealed output path");
  }
  const evidence = plan.selection_evidence as Record<string, unknown>;
  if (!evidence || typeof evidence !== "object") {
    throw new Error("teacher plan selection evidence is missing");
  }
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "source_revision",
      "selection_jsonl",
      "selection_manifest",
      "phase_name_map",
      "accounting",
      "bindings",
      "verification",
    ],
    "selection evidence",
  );
  if (
    evidence.schema !==
      "shogi-halfkp81-depth18-authenticated-selection-evidence-v1" ||
    evidence.status !==
      "authenticated-selection-complete-teacher-plan-eligible" ||
    evidence.source_revision !== plan.source_revision ||
    canonicalJson(evidence.phase_name_map) !==
      canonicalJson({
        "opening-ply12-39": "opening",
        "midgame-ply40-79": "mid",
        "late-ply80-119": "late",
      })
  ) {
    throw new Error("selection evidence authority differs");
  }
  const selectionDeclared = evidence.selection_jsonl as Record<string, unknown>;
  const manifestDeclared = evidence.selection_manifest as Record<
    string,
    unknown
  >;
  if (
    !selectionDeclared ||
    !manifestDeclared ||
    typeof selectionDeclared.path !== "string" ||
    typeof manifestDeclared.path !== "string"
  ) {
    throw new Error("teacher plan selection identities are missing");
  }
  const selectionRaw = await readHeldStableFile(
    selectionDeclared.path,
    "selection JSONL",
  );
  const selectionActual = fileIdentity(selectionDeclared.path, selectionRaw);
  exactKeys(
    selectionDeclared,
    [
      "path",
      "bytes",
      "sha256",
      "held_read_only_descriptor",
      "stable_double_read",
      "rows",
      "schema",
    ],
    "selection JSONL evidence",
  );
  if (
    selectionDeclared.path !== selectionActual.path ||
    selectionDeclared.bytes !== selectionActual.bytes ||
    selectionDeclared.sha256 !== selectionActual.sha256 ||
    selectionDeclared.held_read_only_descriptor !== true ||
    selectionDeclared.stable_double_read !== true ||
    selectionDeclared.schema !== HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA ||
    selectionDeclared.rows !== HALFKP81_DEPTH18_TEACHER_PARENT_COUNT
  ) {
    throw new Error("selection JSONL row count differs");
  }
  const selection = validateSelectionRows(
    selectionRaw,
    HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
    HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
  );
  const manifestRaw = await readHeldStableFile(
    manifestDeclared.path,
    "selection manifest",
  );
  const manifestActual = fileIdentity(manifestDeclared.path, manifestRaw);
  const manifestSchema = manifestDeclared.schema;
  exactKeys(
    manifestDeclared,
    [
      "path",
      "bytes",
      "sha256",
      "held_read_only_descriptor",
      "stable_double_read",
      "schema",
    ],
    "selection manifest evidence",
  );
  if (
    manifestSchema !== HALFKP81_DEPTH18_SELECTION_MANIFEST_SCHEMA ||
    manifestDeclared.path !== manifestActual.path ||
    manifestDeclared.bytes !== manifestActual.bytes ||
    manifestDeclared.sha256 !== manifestActual.sha256 ||
    manifestDeclared.held_read_only_descriptor !== true ||
    manifestDeclared.stable_double_read !== true
  ) {
    throw new Error("selection manifest evidence differs");
  }
  const manifest = parseCanonicalJson(manifestRaw, "selection manifest");
  const manifestOutput = manifest.output as Record<string, unknown>;
  if (
    !manifestOutput ||
    manifestOutput.path !== selectionActual.path ||
    manifestOutput.bytes !== selectionActual.bytes ||
    manifestOutput.sha256 !== selectionActual.sha256 ||
    manifestOutput.rows !== HALFKP81_DEPTH18_TEACHER_PARENT_COUNT
  ) {
    throw new Error("selection manifest output binding differs");
  }
  assertIdentity(
    plan.selection_manifest,
    manifestActual,
    "plan selection manifest",
    manifestSchema,
  );
  const verification = evidence.verification;
  if (
    canonicalJson(verification) !==
    canonicalJson({
      held_descriptor_double_read: true,
      canonical_8192_rows: true,
      phase_side_quotas: true,
      role_side_quotas: true,
      one_game_one_position: true,
      cross_role_game_overlap_zero: true,
      source_overlap_legal_bindings: true,
    })
  ) {
    throw new Error("selection evidence verification differs");
  }
  return Object.freeze({
    plan: Object.freeze({ ...plan }),
    planIdentity: Object.freeze({
      ...fileIdentity(absolutePlanPath, planRaw),
      schema: HALFKP81_DEPTH18_TEACHER_PLAN_SCHEMA,
    }),
    sourceRevision: plan.source_revision,
    selectionIdentity: Object.freeze({
      ...selectionActual,
      rows: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
      schema: HALFKP81_DEPTH18_SELECTION_ROW_SCHEMA,
    }),
    selectionManifestIdentity: Object.freeze({
      ...manifestActual,
      schema: manifestSchema,
    }),
    selectionRows: selection.rows,
    parents: selection.parents,
    roles: selection.roles,
    outputs: Object.freeze(capturedOutputs),
    engine: Object.freeze(
      engine as unknown as Halfkp81Depth18AuthenticatedTeacherPlan["engine"],
    ),
    teacher,
  });
}

async function authenticateFixedFile(
  expected: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  label: string,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const raw = await readHeldStableFile(expected.path, label);
  const actual = fileIdentity(expected.path, raw);
  if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) {
    throw new Error(`${label} differs from the sealed identity`);
  }
  return Object.freeze(actual);
}

async function authenticateEngineReceipt(
  repositoryRoot: string,
  binary: Readonly<Halfkp81Depth18TeacherFileIdentity>,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const receiptPath = path.join(
    repositoryRoot,
    HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_RELATIVE_PATH,
  );
  const raw = await readHeldStableFile(receiptPath, "YaneuraOu engine receipt");
  if (
    raw.byteLength !== HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_BYTES ||
    sha256(raw) !== HALFKP81_DEPTH18_TEACHER_ENGINE_RECEIPT_SHA256
  ) {
    throw new Error("YaneuraOu engine receipt identity differs");
  }
  const receipt = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
  if (
    receipt.schema !== "shogi-teacher-engine-receipt-v1" ||
    receipt.source_commit !== EXPECTED_ENGINE_SOURCE_REVISION ||
    receipt.engine_id !== EXPECTED_ENGINE_ID ||
    receipt.binary_bytes !== binary.bytes ||
    receipt.binary_sha256 !== binary.sha256
  ) {
    throw new Error("YaneuraOu engine receipt does not bind the fixed binary");
  }
  return Object.freeze({
    ...fileIdentity(receiptPath, raw),
    schema: "shogi-teacher-engine-receipt-v1",
  });
}

function sealTeacherEntry(
  entry: CompletedWorkEntry,
  fingerprint: string,
): CompletedWorkEntry {
  const captured = {
    ...entry,
    run_fingerprint: fingerprint,
    payload_sha256: "",
  };
  const payload = { ...captured } as Record<string, unknown>;
  delete payload.payload_sha256;
  captured.payload_sha256 = sha256(canonicalJson(payload));
  return captured;
}

function workEntryDigest(
  entry: Omit<Halfkp81Depth18TeacherWorkEntry, "payload_sha256">,
): string {
  return sha256(`${WORK_ENTRY_DIGEST_DOMAIN}${canonicalJson(entry)}`);
}

function parentPayloadDigest(
  parent: Readonly<FloodgateTrainingParent>,
): string {
  return sha256(
    `${STABLE_PARENT_DIGEST_DOMAIN}${canonicalJson({
      schema_version: parent.schema_version,
      game_id: parent.game_id,
      parent_id: parent.parent_id,
      position_id: parent.position_id,
      parent_sfen: parent.parent_sfen,
      ply: parent.ply,
      played_move: parent.played_move,
    })}`,
  );
}

function validateStableResult(
  result: Readonly<FloodgateProductionStableWasmRuntimeResult>,
  parent: Readonly<FloodgateTrainingParent>,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
): void {
  const row = result.row;
  const binding = result.runtime_binding;
  const stableReceipt = header.stable_runtime.receipt as Record<
    string,
    unknown
  >;
  const operational = stableReceipt.operational as Record<string, unknown>;
  const requestedDepthComplete =
    row.search.completed_depth === FLOODGATE_STABLE_REQUESTED_DEPTH &&
    row.search.termination === "requested-depth-complete";
  const winningMateBandEarly =
    Number.isSafeInteger(row.search.completed_depth) &&
    row.search.completed_depth >= 1 &&
    row.search.completed_depth < FLOODGATE_STABLE_REQUESTED_DEPTH &&
    row.search.termination === "winning-mate-band-early" &&
    row.search.raw_search_score >= FLOODGATE_STABLE_MATE_SCORE_MIN &&
    row.search.raw_search_score <= FLOODGATE_STABLE_MATE_SCORE_MAX;
  if (
    result.schema !== FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_SCHEMA ||
    row.schema !== FLOODGATE_STABLE_WASM_PROPOSAL_ROW_SCHEMA ||
    row.game_id !== parent.game_id ||
    row.parent_id !== parent.parent_id ||
    row.position_id !== parent.position_id ||
    row.parent_payload_sha256 !== parentPayloadDigest(parent) ||
    row.child_sfen !== childSfenAfterUsi(parent.parent_sfen, row.stable_move) ||
    row.child_position_id !== positionKeyFromSfen(row.child_sfen) ||
    row.search.requested_depth !== FLOODGATE_STABLE_REQUESTED_DEPTH ||
    (!requestedDepthComplete && !winningMateBandEarly) ||
    row.search.score_encoding !== FLOODGATE_STABLE_WASM_SCORE_ENCODING ||
    row.search.root_tesu !== parent.ply ||
    !Number.isSafeInteger(row.search.raw_search_score) ||
    row.search.raw_search_score < -FLOODGATE_STABLE_MATE_SCORE_MAX ||
    row.search.raw_search_score > FLOODGATE_STABLE_MATE_SCORE_MAX ||
    !Number.isSafeInteger(row.search.nodes) ||
    row.search.nodes < 0 ||
    !Number.isSafeInteger(row.search.leaves) ||
    row.search.leaves < 0 ||
    row.search.nodes + row.search.leaves <= 0 ||
    binding.runtime_receipt_sha256 !== header.stable_runtime.receipt_sha256 ||
    binding.reusable_pool_receipt_sha256 !==
      operational?.reusable_pool_receipt_sha256 ||
    binding.parent_payload_sha256 !== row.parent_payload_sha256 ||
    binding.row_sha256 !==
      sha256(`${STABLE_RESULT_ROW_DIGEST_DOMAIN}${canonicalJson(row)}`) ||
    binding.claim_boundary !==
      FLOODGATE_PRODUCTION_STABLE_WASM_RUNTIME_RESULT_CLAIM_BOUNDARY ||
    binding.execution_boundary !== stableReceipt.execution_boundary ||
    binding.origin !== "direct-owning-runtime-capability-call-v1" ||
    binding.plain_result_authentication_claim !== false
  ) {
    throw new Error(`stable depth11 evidence differs for ${parent.parent_id}`);
  }
}

function validateFormalWorkEntry(
  value: unknown,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  parents: ReadonlyMap<string, Readonly<FloodgateTrainingParent>>,
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>,
  source: string,
): Halfkp81Depth18TeacherWorkEntry {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${source} must be an object`);
  }
  const entry = value as Halfkp81Depth18TeacherWorkEntry;
  exactKeys(
    entry as unknown as Record<string, unknown>,
    [
      "schema",
      "kind",
      "run_fingerprint",
      "parent_id",
      "role",
      "stable_result",
      "teacher_entry",
      "payload_sha256",
    ],
    source,
  );
  const parent = parents.get(entry.parent_id);
  if (
    entry.schema !== HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA ||
    entry.kind !== "parent" ||
    entry.run_fingerprint !== header.run_fingerprint ||
    parent === undefined ||
    entry.role !== roles.get(entry.parent_id)
  ) {
    throw new Error(`${source} identity or role differs`);
  }
  const payload = { ...entry } as Record<string, unknown>;
  delete payload.payload_sha256;
  if (
    entry.payload_sha256 !==
    sha256(`${WORK_ENTRY_DIGEST_DOMAIN}${canonicalJson(payload)}`)
  ) {
    throw new Error(`${source} payload checksum differs`);
  }
  validateStableResult(entry.stable_result, parent, header);
  const teacher = validateWorkEntry(
    entry.teacher_entry,
    header.run_fingerprint,
    parents,
    `${source} teacher entry`,
    HALFKP81_DEPTH18_TEACHER_MULTIPV,
    { depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH },
    HALFKP81_DEPTH18_TEACHER_PARENT_TIMEOUT_MS,
    { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
    undefined,
    entry.stable_result.row.stable_move,
  );
  if (
    teacher.kind !== "parent" ||
    teacher.records.length < 2 ||
    teacher.records.length > 14 ||
    !teacher.records.some(
      (record) =>
        record.move === entry.stable_result.row.stable_move &&
        record.sources.includes("stable"),
    ) ||
    teacher.records.some(
      (record) =>
        Object.prototype.hasOwnProperty.call(record, "old_depth12_cp") ||
        record.teacher_rank < 1,
    )
  ) {
    throw new Error(`${source} is not a complete stable-union depth18 label`);
  }
  return entry;
}

async function initializeWork(
  workPath: string,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  parents: ReadonlyMap<string, Readonly<FloodgateTrainingParent>>,
  roles: ReadonlyMap<string, Halfkp81Depth18TeacherRole>,
): Promise<Map<string, Halfkp81Depth18TeacherWorkEntry>> {
  let handle: fs.promises.FileHandle;
  try {
    handle = await fs.promises.open(workPath, "wx", 0o600);
    await handle.writeFile(canonicalJsonLine(header));
    await handle.datasync();
    await handle.close();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const raw = await fs.promises.readFile(workPath);
  const hasTerminalLf = raw.length > 0 && raw[raw.length - 1] === 0x0a;
  const text = raw.toString("utf8");
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  const entries = new Map<string, Halfkp81Depth18TeacherWorkEntry>();
  let validBytes = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch {
      if (!hasTerminalLf && index === lines.length - 1) break;
      throw new Error(`work checkpoint line ${index + 1} is invalid JSON`);
    }
    if (index === 0) {
      if (canonicalJson(parsed) !== canonicalJson(header)) {
        throw new Error(
          "work checkpoint header differs from the current fixed run",
        );
      }
    } else {
      const entry = validateFormalWorkEntry(
        parsed,
        header,
        parents,
        roles,
        `work checkpoint line ${index + 1}`,
      );
      if (entries.has(entry.parent_id)) {
        throw new Error(
          `duplicate parent in work checkpoint: ${entry.parent_id}`,
        );
      }
      entries.set(entry.parent_id, entry);
    }
    validBytes += Buffer.byteLength(lines[index], "utf8") + 1;
  }
  if (lines.length === 0) throw new Error("work checkpoint has no header");
  if (validBytes !== raw.byteLength) {
    const repair = await fs.promises.open(workPath, "r+");
    try {
      await repair.truncate(validBytes);
      await repair.datasync();
    } finally {
      await repair.close();
    }
  }
  return entries;
}

async function appendDurable(
  handle: fs.promises.FileHandle,
  entry: Readonly<Halfkp81Depth18TeacherWorkEntry>,
): Promise<void> {
  await handle.appendFile(canonicalJsonLine(entry));
  await handle.datasync();
}

async function fsyncDirectory(directory: string): Promise<void> {
  const handle = await fs.promises.open(directory, fs.constants.O_RDONLY);
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function publishCreateOnly(
  destination: string,
  bytes: Uint8Array,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const directory = path.dirname(destination);
  await fs.promises.mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    const existing = await readHeldStableFile(
      destination,
      "existing create-only output",
    );
    if (!Buffer.from(bytes).equals(existing)) {
      throw new Error(
        `create-only output already exists with different bytes: ${destination}`,
      );
    }
    return Object.freeze(fileIdentity(destination, existing));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const temporary = path.join(
    directory,
    `.${path.basename(destination)}.${process.pid}.${crypto.randomBytes(12).toString("hex")}.tmp`,
  );
  const handle = await fs.promises.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.datasync();
  } finally {
    await handle.close();
  }
  try {
    try {
      await fs.promises.link(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const existing = await readHeldStableFile(
        destination,
        "raced create-only output",
      );
      if (!Buffer.from(bytes).equals(existing)) {
        throw new Error(
          `create-only publication race produced different bytes: ${destination}`,
        );
      }
    }
    await fsyncDirectory(directory);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
  return Object.freeze(fileIdentity(destination, bytes));
}

export const publishHalfkp81Depth18TeacherCreateOnlyCoreForTests =
  publishCreateOnly;

function engineEnvironment(workerCwd: string): NodeJS.ProcessEnv {
  const realCwd = fs.realpathSync.native(workerCwd);
  return Object.fromEntries(
    Object.entries(SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT.variables).map(
      ([name, value]) => [
        name,
        value === "<private-worker-cwd>" ? realCwd : value,
      ],
    ),
  ) as NodeJS.ProcessEnv;
}

async function defaultStableRuntime(): Promise<Halfkp81Depth18TeacherStableRuntime> {
  const runtime = await createFloodgateProductionStableWasmRuntime();
  return {
    receipt: runtime.receipt as unknown as Readonly<Record<string, unknown>>,
    receiptDigest:
      getFloodgateProductionStableWasmRuntimeReceiptDigest(runtime),
    propose: (parent) =>
      runtime.propose(parent) as Promise<
        Readonly<FloodgateProductionStableWasmRuntimeResult>
      >,
    close: () => runtime.close(),
  };
}

async function defaultCreateEngine(
  options: Readonly<UsiTeacherEngineOptions>,
): Promise<Halfkp81Depth18TeacherEngine> {
  const engine = new UsiTeacherEngine(options);
  await engine.init();
  return engine;
}

async function withParentDeadline<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Promise<void>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      void onTimeout().catch(() => undefined);
      reject(new Error(`parent-level timeout after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  operation.catch(() => undefined);
  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (timedOut) operation.catch(() => undefined);
  }
}

function buildMilestone(
  target: number,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  entries: ReadonlyMap<string, Halfkp81Depth18TeacherWorkEntry>,
  parents: readonly Readonly<FloodgateTrainingParent>[],
): Readonly<Record<string, unknown>> {
  const prefix = parents.slice(0, target);
  if (prefix.some((parent) => !entries.has(parent.parent_id))) {
    throw new Error(`milestone ${target} prefix is incomplete`);
  }
  const projected = prefix.map(
    (parent) =>
      entries.get(parent.parent_id) as Halfkp81Depth18TeacherWorkEntry,
  );
  return Object.freeze({
    schema: HALFKP81_DEPTH18_TEACHER_MILESTONE_SCHEMA,
    status: "durable-prefix-complete-not-training-authority",
    target_parents: target,
    run_fingerprint: header.run_fingerprint,
    parent_ids_sha256: sha256(
      prefix.map((parent) => parent.parent_id).join("\n"),
    ),
    work_entry_payloads_sha256: sha256(
      projected.map((entry) => entry.payload_sha256).join("\n"),
    ),
    completed_rows: projected.reduce(
      (sum, entry) => sum + entry.teacher_entry.records.length,
      0,
    ),
    technical_faults: 0,
    authority: {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  });
}

async function publishReadyMilestones(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  contract: Readonly<Halfkp81Depth18TeacherCoreContract>,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  entries: ReadonlyMap<string, Halfkp81Depth18TeacherWorkEntry>,
  published: Set<number>,
): Promise<void> {
  for (const target of contract.milestones) {
    if (published.has(target)) continue;
    const prefix = authenticated.parents.slice(0, target);
    if (
      prefix.length !== target ||
      prefix.some((parent) => !entries.has(parent.parent_id))
    ) {
      continue;
    }
    const key = `milestone_${target}_json` as
      "milestone_100_json" | "milestone_500_json";
    const output = authenticated.outputs[key];
    if (output === undefined)
      throw new Error(`plan omits milestone output ${target}`);
    const milestone = buildMilestone(
      target,
      header,
      entries,
      authenticated.parents,
    );
    await publishCreateOnly(output, canonicalJsonLine(milestone));
    published.add(target);
    process.stderr.write(
      `[halfkp81-depth18-teacher] durable prefix ${target}/${contract.parentCount}, ` +
        `${String(milestone.completed_rows)} depth18 rows, faults=0\n`,
    );
  }
}

async function runWorkers(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  header: Readonly<Halfkp81Depth18TeacherWorkHeader>,
  stable: Readonly<Halfkp81Depth18TeacherStableRuntime>,
  entries: Map<string, Halfkp81Depth18TeacherWorkEntry>,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies>,
  contract: Readonly<Halfkp81Depth18TeacherCoreContract>,
  runtimeRoot: string,
  publishedMilestones: Set<number>,
): Promise<void> {
  const parentMap = new Map(
    authenticated.parents.map((parent) => [parent.parent_id, parent] as const),
  );
  const pending = authenticated.parents.filter(
    (parent) => !entries.has(parent.parent_id),
  );
  const workHandle = await fs.promises.open(
    authenticated.outputs.work_jsonl,
    "a",
    0o600,
  );
  const createEngine = dependencies.createEngine ?? defaultCreateEngine;
  const labelParent = dependencies.labelParent ?? labelSiblingParent;
  const processCount =
    dependencies.processes ?? HALFKP81_DEPTH18_TEACHER_PROCESSES;
  const parentTimeoutMs =
    dependencies.parentTimeoutMs ?? HALFKP81_DEPTH18_TEACHER_PARENT_TIMEOUT_MS;
  let next = 0;
  let failure: Error | undefined;
  let appendTail: Promise<void> = Promise.resolve();
  const persist = async (
    entry: Halfkp81Depth18TeacherWorkEntry,
  ): Promise<void> => {
    const operation = appendTail.then(async () => {
      await appendDurable(workHandle, entry);
      entries.set(entry.parent_id, entry);
      await publishReadyMilestones(
        authenticated,
        contract,
        header,
        entries,
        publishedMilestones,
      );
    });
    appendTail = operation.catch(() => undefined);
    await operation;
  };
  try {
    const workers = Array.from(
      { length: Math.min(processCount, pending.length) },
      async (_unused, workerIndex) => {
        const workerCwd = path.join(runtimeRoot, `worker-${workerIndex}`);
        await fs.promises.mkdir(workerCwd, { recursive: true, mode: 0o700 });
        let generation = 0;
        let engine: Halfkp81Depth18TeacherEngine | undefined;
        const startEngine = async (): Promise<Halfkp81Depth18TeacherEngine> => {
          const cwd = path.join(workerCwd, `engine-${generation++}`);
          await fs.promises.mkdir(cwd, { mode: 0o700 });
          return createEngine({
            engineBin: authenticated.engine.binary.path,
            evalDir: path.dirname(authenticated.engine.eval_file.path),
            cwd,
            env: engineEnvironment(cwd),
            fvScale: 20,
            hashMb: HALFKP81_DEPTH18_TEACHER_HASH_MIB,
            timeoutMs: parentTimeoutMs,
          });
        };
        try {
          engine = await startEngine();
          while (failure === undefined) {
            const parent = pending[next++];
            if (parent === undefined || engine === undefined) break;
            try {
              const operation = (async () => {
                const stableResult = await stable.propose(parent);
                validateStableResult(stableResult, parent, header);
                const legalMoves = rulesCompleteLegalMoves(
                  positionFromSfen(parent.parent_sfen).position,
                ).map((entry) => entry.usi);
                const rawTeacher = await labelParent(
                  engine as UsiTeacherEngine,
                  parent,
                  HALFKP81_DEPTH18_TEACHER_MULTIPV,
                  { depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH },
                  legalMoves,
                  { depth: HALFKP81_DEPTH18_TEACHER_PROPOSAL_DEPTH },
                  undefined,
                  stableResult.row.stable_move,
                );
                const teacherEntry = sealTeacherEntry(
                  rawTeacher,
                  header.run_fingerprint,
                );
                const withoutDigest = {
                  schema: HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA,
                  kind: "parent" as const,
                  run_fingerprint: header.run_fingerprint,
                  parent_id: parent.parent_id,
                  role: authenticated.roles.get(
                    parent.parent_id,
                  ) as Halfkp81Depth18TeacherRole,
                  stable_result: stableResult,
                  teacher_entry: teacherEntry,
                };
                const formalEntry: Halfkp81Depth18TeacherWorkEntry = {
                  ...withoutDigest,
                  payload_sha256: workEntryDigest(withoutDigest),
                };
                return validateFormalWorkEntry(
                  formalEntry,
                  header,
                  parentMap,
                  authenticated.roles,
                  `runtime parent ${parent.parent_id}`,
                );
              })();
              const completed = await withParentDeadline(
                operation,
                parentTimeoutMs,
                async () => {
                  await engine?.quit().catch(() => undefined);
                  engine = undefined;
                },
              );
              await persist(completed);
            } catch (error) {
              failure ??= new Error(
                `teacher labeling failed for parent ${parent.parent_id}: ${
                  error instanceof Error ? error.message : String(error)
                }`,
              );
            }
          }
        } catch (error) {
          failure ??= new Error(
            `YaneuraOu worker initialization failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        } finally {
          await engine?.quit().catch(() => undefined);
        }
      },
    );
    await Promise.all(workers);
    await appendTail;
  } finally {
    await appendTail.catch(() => undefined);
    await workHandle.close();
  }
  if (failure !== undefined) throw failure;
}

function roleArtifactBytes(
  role: Halfkp81Depth18TeacherRole,
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  entries: ReadonlyMap<string, Halfkp81Depth18TeacherWorkEntry>,
): { bytes: Buffer; rows: number; parents: number } {
  const records: SiblingRecord[] = [];
  let parents = 0;
  for (const parent of authenticated.parents) {
    if (authenticated.roles.get(parent.parent_id) !== role) continue;
    const entry = entries.get(parent.parent_id);
    if (entry === undefined)
      throw new Error(`missing ${role} parent ${parent.parent_id}`);
    validateParentGroups(entry.teacher_entry.records);
    records.push(...entry.teacher_entry.records);
    parents += 1;
  }
  const bytes = Buffer.from(
    records.map((record) => canonicalJson(record)).join("\n") +
      (records.length > 0 ? "\n" : ""),
    "utf8",
  );
  return { bytes, rows: records.length, parents };
}

async function publishTerminalFault(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  runFingerprint: string | null,
  message: string,
  completedParents: number,
): Promise<void> {
  await publishCreateOnly(
    authenticated.outputs.terminal_fault_json,
    canonicalJsonLine({
      schema: HALFKP81_DEPTH18_TEACHER_FAULT_SCHEMA,
      status: "terminal-fault-family-stopped",
      teacher_plan: authenticated.planIdentity,
      run_fingerprint: runFingerprint,
      completed_parents: completedParents,
      technical_faults: 1,
      incomplete_parents: authenticated.parents.length - completedParents,
      message,
      authority: {
        may_resume_same_family: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    }),
  );
}

async function existingReceipt(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
): Promise<Halfkp81Depth18TeacherRunResult | undefined> {
  try {
    const raw = await readHeldStableFile(
      authenticated.outputs.receipt_json,
      "existing teacher receipt",
    );
    const receipt = parseCanonicalJson(raw, "existing teacher receipt");
    if (
      receipt.schema !== HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA ||
      receipt.completed_parents !== authenticated.parents.length
    ) {
      throw new Error("existing teacher receipt differs");
    }
    const outputs = receipt.outputs as Record<
      string,
      Halfkp81Depth18TeacherFileIdentity
    >;
    for (const role of ["fit", "tune", "sealed"] as const) {
      const artifact = await readHeldStableFile(
        authenticated.outputs[`${role}_jsonl`],
        `existing ${role} artifact`,
      );
      assertIdentity(
        outputs[role],
        fileIdentity(authenticated.outputs[`${role}_jsonl`], artifact),
        `${role} artifact`,
      );
    }
    return {
      receipt: Object.freeze(receipt),
      receiptIdentity: Object.freeze(
        fileIdentity(authenticated.outputs.receipt_json, raw),
      ),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function runHalfkp81Depth18TeacherCoreForTests(
  authenticated: Readonly<Halfkp81Depth18AuthenticatedTeacherPlan>,
  dependencies: Readonly<Halfkp81Depth18TeacherRunnerDependencies> = {},
  contract: Readonly<Halfkp81Depth18TeacherCoreContract> = {
    parentCount: HALFKP81_DEPTH18_TEACHER_PARENT_COUNT,
    roleCounts: HALFKP81_DEPTH18_TEACHER_ROLE_COUNTS,
    milestones: HALFKP81_DEPTH18_TEACHER_MILESTONES,
    maximumRows: EXPECTED_TEACHER.maximum_rows,
  },
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  if (
    authenticated.parents.length !== contract.parentCount ||
    canonicalJson(
      Object.fromEntries(
        (["fit", "tune", "sealed"] as const).map((role) => [
          role,
          authenticated.parents.filter(
            (parent) => authenticated.roles.get(parent.parent_id) === role,
          ).length,
        ]),
      ),
    ) !== canonicalJson(contract.roleCounts)
  ) {
    throw new Error(
      "authenticated parent or role count differs from the execution contract",
    );
  }
  try {
    await fs.promises.lstat(authenticated.outputs.terminal_fault_json);
    throw new Error(
      "terminal fault already exists; this family may not resume",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const priorReceipt = await existingReceipt(authenticated);
  if (priorReceipt !== undefined) return priorReceipt;
  const repositoryRoot = path.resolve(__dirname, "..");
  const fixedAssets =
    dependencies.authenticateFixedAssets === undefined
      ? await (async () => {
          const binary = await authenticateFixedFile(
            authenticated.engine.binary,
            "YaneuraOu binary",
          );
          const evalFile = await authenticateFixedFile(
            authenticated.engine.eval_file,
            "YaneuraOu eval",
          );
          const engineReceipt = await authenticateEngineReceipt(
            repositoryRoot,
            binary,
          );
          return { binary, evalFile, engineReceipt };
        })()
      : await dependencies.authenticateFixedAssets(authenticated);
  const { binary, evalFile, engineReceipt } = fixedAssets;
  const makeStable = dependencies.createStableRuntime ?? defaultStableRuntime;
  let stable: Halfkp81Depth18TeacherStableRuntime;
  try {
    stable = await makeStable();
  } catch (error) {
    await publishTerminalFault(
      authenticated,
      null,
      error instanceof Error ? error.message : String(error),
      0,
    ).catch(() => undefined);
    throw error;
  }
  let stableClosed = false;
  let runtimeRoot: string | undefined;
  let header: Halfkp81Depth18TeacherWorkHeader | undefined;
  let entries = new Map<string, Halfkp81Depth18TeacherWorkEntry>();
  try {
    const fingerprintPayload = {
      teacher_plan: authenticated.planIdentity,
      selection_jsonl: authenticated.selectionIdentity,
      selection_manifest: authenticated.selectionManifestIdentity,
      source_revision: authenticated.sourceRevision,
      engine: { binary, eval_file: evalFile, receipt: engineReceipt },
      teacher: authenticated.teacher,
      stable_runtime: {
        receipt_sha256: stable.receiptDigest,
        receipt: stable.receipt,
      },
    };
    const runFingerprint = sha256(
      `${WORK_FINGERPRINT_DOMAIN}${canonicalJson(fingerprintPayload)}`,
    );
    header = {
      schema: HALFKP81_DEPTH18_TEACHER_WORK_SCHEMA,
      kind: "header",
      run_fingerprint: runFingerprint,
      ...fingerprintPayload,
      label_policy: SIBLING_TEACHER_LABEL_POLICY,
    };
    const parentMap = new Map(
      authenticated.parents.map(
        (parent) => [parent.parent_id, parent] as const,
      ),
    );
    entries = await initializeWork(
      authenticated.outputs.work_jsonl,
      header,
      parentMap,
      authenticated.roles,
    );
    const publishedMilestones = new Set<number>();
    await publishReadyMilestones(
      authenticated,
      contract,
      header,
      entries,
      publishedMilestones,
    );
    runtimeRoot = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "halfkp81-depth18-teacher-"),
    );
    await fs.promises.chmod(runtimeRoot, 0o700);
    await runWorkers(
      authenticated,
      header,
      stable,
      entries,
      dependencies,
      contract,
      runtimeRoot,
      publishedMilestones,
    );
    if (entries.size !== contract.parentCount) {
      throw new Error(
        `formal work is incomplete: ${entries.size}/${contract.parentCount} parents`,
      );
    }
    const artifacts = {} as Record<
      Halfkp81Depth18TeacherRole,
      {
        identity: Readonly<Halfkp81Depth18TeacherFileIdentity>;
        rows: number;
        parents: number;
      }
    >;
    for (const role of ["fit", "tune", "sealed"] as const) {
      const artifact = roleArtifactBytes(role, authenticated, entries);
      if (artifact.parents !== contract.roleCounts[role]) {
        throw new Error(`${role} parent count differs`);
      }
      artifacts[role] = {
        ...artifact,
        identity: await publishCreateOnly(
          authenticated.outputs[`${role}_jsonl`],
          artifact.bytes,
        ),
      };
    }
    const completedRows = Object.values(artifacts).reduce(
      (sum, artifact) => sum + artifact.rows,
      0,
    );
    if (
      completedRows < 2 * contract.parentCount ||
      completedRows > contract.maximumRows ||
      (["fit", "tune", "sealed"] as const).some(
        (role) => artifacts[role].rows < 2 * artifacts[role].parents,
      )
    ) {
      throw new Error(
        "completed teacher row count is outside the sealed bounds",
      );
    }
    const receipt = {
      schema: HALFKP81_DEPTH18_TEACHER_RECEIPT_SCHEMA,
      status: "structurally-complete-awaiting-artifact-verification",
      teacher_plan: authenticated.planIdentity,
      completed_parents: contract.parentCount,
      completed_rows: completedRows,
      role_parents: Object.fromEntries(
        (["fit", "tune", "sealed"] as const).map((role) => [
          role,
          artifacts[role].parents,
        ]),
      ),
      role_rows: Object.fromEntries(
        (["fit", "tune", "sealed"] as const).map((role) => [
          role,
          artifacts[role].rows,
        ]),
      ),
      depth: HALFKP81_DEPTH18_TEACHER_RESCORE_DEPTH,
      technical_faults: 0,
      incomplete_parents: 0,
      old_depth12_targets: 0,
      outputs: Object.fromEntries(
        (["fit", "tune", "sealed"] as const).map((role) => [
          role,
          artifacts[role].identity,
        ]),
      ),
      artifact_verification: {
        held_descriptor_content_scan: false,
        actual_bytes_sha256_rows_recomputed: false,
        selected_parent_role_membership_recomputed: false,
        every_target_depth18_recomputed: false,
        old_depth12_target_absence_recomputed: false,
      },
      authority: {
        may_build_training_plan: false,
        may_train: false,
        may_play_formal_games: false,
        may_write_live_weights: false,
      },
    };
    await stable.close();
    stableClosed = true;
    await authenticateFixedFile(binary, "YaneuraOu binary postflight");
    await authenticateFixedFile(evalFile, "YaneuraOu eval postflight");
    await authenticateFixedFile(engineReceipt, "YaneuraOu receipt postflight");
    // Receipt publication is intentionally the final write.
    const receiptBytes = canonicalJsonLine(receipt);
    const receiptIdentity = await publishCreateOnly(
      authenticated.outputs.receipt_json,
      receiptBytes,
    );
    return {
      receipt: Object.freeze(receipt),
      receiptIdentity,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await publishTerminalFault(
      authenticated,
      header?.run_fingerprint ?? null,
      message,
      entries.size,
    ).catch(() => undefined);
    throw error;
  } finally {
    if (!stableClosed) await stable.close().catch(() => undefined);
    if (runtimeRoot !== undefined) {
      await fs.promises.rm(runtimeRoot, { recursive: true, force: true });
    }
  }
}

export async function runHalfkp81Depth18Teacher(
  planPath = HALFKP81_DEPTH18_TEACHER_DEFAULT_PLAN_PATH,
): Promise<Readonly<Halfkp81Depth18TeacherRunResult>> {
  const authenticated = await authenticateHalfkp81Depth18TeacherPlan(planPath);
  return runHalfkp81Depth18TeacherCoreForTests(authenticated);
}
