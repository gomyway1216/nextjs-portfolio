/**
 * Pure downstream-provenance verifier for the strength-first v8 teacher run.
 *
 * This module accepts already captured bytes and authenticated rows. It has no
 * filesystem, process, network, publication, or live-weight mutation API.
 * Private identifiers and digests never appear in its successful summary or
 * its fail-closed public errors.
 */

import { createHash, type Hash } from "node:crypto";

import { FLOODGATE_PRODUCTION_TEACHER_RUNTIME } from "./floodgate-production-teacher-asset-authority";
import {
  INDEPENDENT_EXACT_RESCORE_MODE,
  PROPOSAL_INCOMPLETE_QUARANTINE_POLICY,
  SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
  SIBLING_TEACHER_LABEL_POLICY,
  SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_PARENT_COMPLETION_FORMAT,
  STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA,
  STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON,
  STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA,
  STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA,
  STRENGTH_FIRST_TRAIN_FORMAT,
  STRENGTH_FIRST_V9_PRODUCTION_ENGINES,
  siblingTeacherRunFingerprint,
  strengthFirstTimeoutSkipLimit,
  validateWorkEntry,
  type CompletedWorkEntry,
  type WorkEntry,
} from "./generate-sibling-teacher";
import { floodgateIdentifierDigest } from "./floodgate-roles";
import {
  FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE,
  FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION,
} from "./floodgate-strength-first-teacher-runner";
import {
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS,
  FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME,
} from "./floodgate-strength-first-v8-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME,
} from "./floodgate-strength-first-v9-teacher-authority";
import {
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY,
} from "./floodgate-strength-first-fast-training-input";
import {
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_MILESTONE_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA,
  FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA,
} from "./floodgate-strength-first-v9-teacher-runner";
import { FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY } from "./floodgate-role-bundle-result";
import {
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA,
  FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS,
  FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
  type AuthenticatedFloodgateTrainingRows,
  type FloodgateTrainingInputBinding,
  type FloodgateTrainingParent,
} from "./floodgate-training-row-consumer";
import { FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT } from "./floodgate-role-bundle";
import { parseAuthenticatedFloodgateTrainingRows } from "./floodgate-training-row-validation";
import {
  compareBytewise,
  validateParentGroups,
  type SiblingRecord,
} from "./sibling-data";
import { USI_TEACHER_ENGINE_CONTRACT } from "./usi-engine";

export const FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA =
  "shogi-floodgate-strength-first-v8-downstream-provenance-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS =
  "verified-v8-teacher-source-ready-for-training-plan-review" as const;
export const FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION =
  "400d3e33e8414cf071cbe3cc053e345bdc668ade" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA =
  "shogi-floodgate-strength-first-v9-downstream-provenance-v1" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS =
  "verified-v9-teacher-source-ready-for-training-plan-review" as const;
export const FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION =
  "682e5a1dd8027519f2277ec311000bfedf4aced3" as const;

type TeacherGeneration = "v8" | "v9";

type SerializedBytesSource = Uint8Array | AsyncIterable<Uint8Array>;

export interface FloodgateStrengthFirstV8DownstreamProvenanceInput {
  readonly result: Uint8Array;
  readonly manifest: Uint8Array;
  readonly stagedResult: Uint8Array;
  readonly milestone100: Uint8Array;
  readonly milestone500: Uint8Array;
  readonly work: SerializedBytesSource;
  readonly parentCompletion: Uint8Array;
  readonly train: Uint8Array;
  readonly authenticatedInput?: Readonly<AuthenticatedFloodgateTrainingRows>;
  readonly authenticatedInputRaw?: Uint8Array;
  readonly expectedAssetAuthority: unknown;
  readonly verifyRevisionDescendant: (
    revision: string,
    minimumRevision: typeof FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION,
  ) => boolean | Promise<boolean>;
  /**
   * Small-fixture seam for unit tests only. Production callers must omit it.
   * The production contract is then exactly 24,000 with 100/500 prefixes.
   */
  readonly testOnlyContract?: Readonly<{
    readonly parentTarget: number;
    readonly milestoneTargets: readonly [number, number];
  }>;
}

export interface FloodgateStrengthFirstV8DownstreamProvenanceSummary {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA;
  readonly status: typeof FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS;
  readonly target_parents: number;
  readonly emitted_parent_groups: number;
  readonly forced_parents_skipped: number;
  readonly fewer_than_two_legal_moves: number;
  readonly search_timeout_no_label: number;
  readonly train_records: number;
  readonly milestone_targets: readonly [number, number];
  readonly local_only: true;
  readonly network_requests: 0;
  readonly cloud_services: 0;
  readonly live_weight_changes: 0;
  readonly training_only: true;
  readonly private_identifiers_disclosed: false;
  readonly private_digests_disclosed: false;
}

export interface FloodgateStrengthFirstV9DownstreamProvenanceInput
  extends Omit<
    FloodgateStrengthFirstV8DownstreamProvenanceInput,
    "verifyRevisionDescendant"
  > {
  readonly verifyRevisionDescendant: (
    revision: string,
    minimumRevision: typeof FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
  ) => boolean | Promise<boolean>;
}

export interface FloodgateStrengthFirstV9DownstreamProvenanceSummary {
  readonly schema: typeof FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA;
  readonly status: typeof FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS;
  readonly target_parents: number;
  readonly emitted_parent_groups: number;
  readonly forced_parents_skipped: number;
  readonly fewer_than_two_legal_moves: number;
  readonly search_timeout_no_label: number;
  readonly proposal_incomplete_no_label: number;
  readonly train_records: number;
  readonly milestone_targets: readonly [number, number];
  readonly local_only: true;
  readonly network_requests: 0;
  readonly cloud_services: 0;
  readonly live_weight_changes: 0;
  readonly training_only: true;
  readonly private_identifiers_disclosed: false;
  readonly private_digests_disclosed: false;
}

interface JsonlLine {
  readonly text: string;
  readonly raw: Buffer;
  readonly bytesWithLf: Buffer;
  readonly number: number;
}

interface JsonlStats {
  bytes: number;
  lines: number;
  sha256?: string;
}

interface PrefixStats {
  readonly targetLines: number;
  readonly hash: Hash;
  bytes: number;
  sha256?: string;
}

interface Reader {
  readonly iterator: AsyncIterator<JsonlLine>;
  readonly stats: JsonlStats;
  readonly prefixes: readonly PrefixStats[];
}

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const V8_RESULT_KEYS = [
  "schema",
  "status",
  "claim_boundary",
  "runner",
  "production_asset_preflight",
  "authenticated_input",
  "consumer_postflight",
  "teacher",
  "milestones",
  "completion",
  "staged_outputs",
  "publication",
] as const;
const V9_RESULT_KEYS = V8_RESULT_KEYS.filter(
  (key) => key !== "consumer_postflight",
);
const INPUT_BINDING_KEYS = [
  "result_receipt_bytes",
  "result_receipt_sha256",
  "bundle_manifest_bytes",
  "bundle_manifest_sha256",
  "bundle_producer_revision",
  "verifier_revision",
  "raw_format",
  "raw_bytes",
  "raw_sha256",
  "records",
  "games",
  "game_ids_sha256",
  "parent_ids_sha256",
  "position_ids_count",
  "position_ids_sha256",
] as const;
const SIBLING_BASE_RECORD_KEYS = [
  "schema",
  "schema_version",
  "game_id",
  "parent_id",
  "position_id",
  "parent_sfen",
  "parent_ply",
  "ply",
  "move",
  "sources",
  "sfen",
  "child_position_id",
  "cp",
  "child_sfen",
  "teacher_child_cp",
  "teacher_parent_cp",
  "teacher_rank",
  "teacher_score_kind",
] as const;

function fail(code: string): never {
  throw new Error(code);
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactRecord(
  value: unknown,
  keys: readonly string[],
  code: string,
): Record<string, unknown> {
  if (!isRecord(value)) fail(code);
  const actual = Object.keys(value);
  if (
    actual.length !== keys.length ||
    actual.some((key) => !keys.includes(key))
  ) {
    fail(code);
  }
  return value;
}

function exactArray(value: unknown, length: number, code: string): unknown[] {
  if (!Array.isArray(value) || value.length !== length) fail(code);
  return value;
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null)
    return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameJson(item, right[index]))
    );
  }
  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key) =>
          Object.prototype.hasOwnProperty.call(right, key) &&
          sameJson(left[key], right[key]),
      )
    );
  }
  return Object.is(left, right);
}

function requireSame(left: unknown, right: unknown, code: string): void {
  if (!sameJson(left, right)) fail(code);
}

function integer(value: unknown, minimum: number, code: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) fail(code);
  return value as number;
}

function digest(value: unknown, code: string): string {
  if (typeof value !== "string" || !SHA256_RE.test(value)) fail(code);
  return value;
}

function text(value: unknown, code: string): string {
  if (typeof value !== "string" || value.length === 0) fail(code);
  return value;
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
    if (!Number.isFinite(value) || Object.is(value, -0)) fail("canonical-json");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  fail("canonical-json");
}

function fatalUtf8(bytes: Uint8Array, code: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code);
  }
}

function parsePrettyJson(
  bytes: Uint8Array,
  code: string,
): Record<string, unknown> {
  const buffer = Buffer.from(bytes);
  if (
    buffer.byteLength === 0 ||
    buffer.at(-1) !== 0x0a ||
    buffer.includes(0x00) ||
    buffer.includes(0x0d) ||
    (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf)
  ) {
    fail(code);
  }
  const string = fatalUtf8(buffer, code);
  let parsed: unknown;
  try {
    parsed = JSON.parse(string);
  } catch {
    fail(code);
  }
  if (!isRecord(parsed) || `${JSON.stringify(parsed, null, 2)}\n` !== string) {
    fail(code);
  }
  return parsed;
}

export function parseFloodgateStrengthFirstV8PrettyJsonForTests(
  bytes: Uint8Array,
): Record<string, unknown> {
  return parsePrettyJson(bytes, "pretty-json");
}

function byteSources(source: SerializedBytesSource): AsyncIterable<Uint8Array> {
  if (source instanceof Uint8Array) {
    return {
      async *[Symbol.asyncIterator]() {
        yield source;
      },
    };
  }
  return source;
}

function createJsonlReader(
  source: SerializedBytesSource,
  options: Readonly<{
    readonly code: string;
    readonly allowEmpty?: boolean;
    readonly prefixLines?: readonly number[];
  }>,
): Reader {
  const stats: JsonlStats = { bytes: 0, lines: 0 };
  const prefixes = (options.prefixLines ?? []).map((targetLines) => ({
    targetLines,
    hash: createHash("sha256"),
    bytes: 0,
  }));
  const iterator = (async function* (): AsyncGenerator<JsonlLine> {
    const hash = createHash("sha256");
    let pending = Buffer.alloc(0);
    let endedWithLf = false;
    for await (const rawChunk of byteSources(source)) {
      if (!(rawChunk instanceof Uint8Array)) fail(options.code);
      const chunk = Buffer.from(rawChunk);
      if (chunk.byteLength === 0) continue;
      if (
        chunk.includes(0x00) ||
        chunk.includes(0x0d) ||
        (stats.bytes === 0 &&
          pending.byteLength === 0 &&
          chunk[0] === 0xef &&
          chunk[1] === 0xbb &&
          chunk[2] === 0xbf)
      ) {
        fail(options.code);
      }
      hash.update(chunk);
      stats.bytes += chunk.byteLength;
      pending =
        pending.byteLength === 0 ? chunk : Buffer.concat([pending, chunk]);
      let newline: number;
      while ((newline = pending.indexOf(0x0a)) !== -1) {
        const raw = pending.subarray(0, newline);
        pending = pending.subarray(newline + 1);
        if (raw.byteLength === 0) fail(options.code);
        stats.lines += 1;
        const bytesWithLf = Buffer.concat([raw, Buffer.from([0x0a])]);
        for (const prefix of prefixes) {
          if (stats.lines <= prefix.targetLines) {
            prefix.hash.update(bytesWithLf);
            prefix.bytes += bytesWithLf.byteLength;
            if (stats.lines === prefix.targetLines) {
              prefix.sha256 = prefix.hash.digest("hex");
            }
          }
        }
        endedWithLf = true;
        yield {
          text: fatalUtf8(raw, options.code),
          raw,
          bytesWithLf,
          number: stats.lines,
        };
      }
      if (pending.byteLength > 0) endedWithLf = false;
    }
    if (pending.byteLength !== 0 || (!endedWithLf && stats.bytes !== 0)) {
      fail(options.code);
    }
    if (stats.lines === 0 && options.allowEmpty !== true) fail(options.code);
    if (prefixes.some((prefix) => prefix.sha256 === undefined))
      fail(options.code);
    stats.sha256 = hash.digest("hex");
  })()[Symbol.asyncIterator]();
  return { iterator, stats, prefixes };
}

function parseJsonlLine(
  line: JsonlLine,
  encoding: "json" | "canonical",
  code: string,
): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line.text);
  } catch {
    fail(code);
  }
  if (!isRecord(parsed)) fail(code);
  const expected =
    encoding === "json" ? JSON.stringify(parsed) : canonicalJson(parsed);
  if (line.text !== expected) fail(code);
  return parsed;
}

async function finish(reader: Reader, code: string): Promise<void> {
  const extra = await reader.iterator.next();
  if (!extra.done || reader.stats.sha256 === undefined) fail(code);
}

function fileBinding(
  value: unknown,
  path: string,
  code: string,
): Record<string, unknown> {
  const binding = exactRecord(value, ["path", "bytes", "sha256"], code);
  if (
    binding.path !== path ||
    integer(binding.bytes, 0, code) !== binding.bytes ||
    !SHA256_RE.test(String(binding.sha256))
  ) {
    fail(code);
  }
  return binding;
}

function matchBytes(
  binding: Record<string, unknown>,
  bytes: Uint8Array,
  code: string,
): void {
  if (binding.bytes !== bytes.byteLength || binding.sha256 !== sha256(bytes)) {
    fail(code);
  }
}

function authenticatedInputProjection(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
): Readonly<Record<string, unknown>> {
  return {
    schema: input.schema,
    role: input.role,
    binding: input.binding,
  };
}

function authenticatedInputFromRaw(
  result: Record<string, unknown>,
  raw: Uint8Array,
  generation: TeacherGeneration,
): Readonly<AuthenticatedFloodgateTrainingRows> {
  const input =
    generation === "v8"
      ? exactRecord(
          result.authenticated_input,
          ["schema", "role", "binding"],
          "raw-input-receipt",
        )
      : exactRecord(
          exactRecord(
            result.authenticated_input,
            ["runtime", "generator_projection"],
            "raw-fast-input-envelope",
          ).generator_projection,
          [
            "schema",
            "role",
            "binding",
            "historic_provenance_not_reverified_by_fast_path",
          ],
          "raw-fast-input-projection",
        );
  if (
    generation === "v9" &&
    input.historic_provenance_not_reverified_by_fast_path !== true
  ) {
    fail("raw-fast-input-projection");
  }
  const binding = exactRecord(
    input.binding,
    INPUT_BINDING_KEYS,
    "raw-input-binding",
  ) as unknown as FloodgateTrainingInputBinding;
  const rows = parseAuthenticatedFloodgateTrainingRows(raw, {
    path: "training.raw.jsonl",
    bytes: binding.raw_bytes,
    format: binding.raw_format,
    sha256: binding.raw_sha256,
    records: binding.records,
    games: binding.games,
    game_ids_sha256: binding.game_ids_sha256,
    parent_ids_sha256: binding.parent_ids_sha256,
    position_ids_count: binding.position_ids_count,
    position_ids_sha256: binding.position_ids_sha256,
  });
  return Object.freeze({
    schema: FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA,
    role: "training" as const,
    binding: Object.freeze({ ...binding }),
    rows,
  });
}

function validateAuthenticatedInput(
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  target: number,
): ReadonlyMap<string, FloodgateTrainingParent> {
  exactRecord(input, ["schema", "role", "binding", "rows"], "input-shape");
  if (
    input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    input.role !== "training" ||
    !Array.isArray(input.rows) ||
    input.rows.length !== target
  ) {
    fail("input-contract");
  }
  const binding = exactRecord(
    input.binding,
    INPUT_BINDING_KEYS,
    "input-binding",
  );
  if (
    binding.raw_format !== FLOODGATE_ROLE_BUNDLE_RAW_PARENT_FORMAT ||
    binding.verifier_revision !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION ||
    !REVISION_RE.test(String(binding.bundle_producer_revision)) ||
    integer(binding.records, 1, "input-binding") !== target ||
    integer(binding.raw_bytes, 1, "input-binding") !== binding.raw_bytes ||
    integer(binding.result_receipt_bytes, 1, "input-binding") !==
      binding.result_receipt_bytes ||
    integer(binding.bundle_manifest_bytes, 1, "input-binding") !==
      binding.bundle_manifest_bytes
  ) {
    fail("input-binding");
  }
  for (const field of [
    "result_receipt_sha256",
    "bundle_manifest_sha256",
    "raw_sha256",
    "game_ids_sha256",
    "parent_ids_sha256",
    "position_ids_sha256",
  ]) {
    digest(binding[field], "input-binding");
  }
  const parents = new Map<string, FloodgateTrainingParent>();
  const gameIds = new Set<string>();
  const positionIds = new Set<string>();
  let previousParentId: string | undefined;
  for (const rowValue of input.rows) {
    const row = exactRecord(
      rowValue,
      [
        "schema_version",
        "game_id",
        "parent_id",
        "position_id",
        "parent_sfen",
        "ply",
        "played_move",
      ],
      "input-row",
    ) as unknown as FloodgateTrainingParent;
    if (
      row.schema_version !== 1 ||
      text(row.game_id, "input-row") !== row.game_id ||
      text(row.parent_id, "input-row") !== row.parent_id ||
      text(row.position_id, "input-row") !== row.position_id ||
      text(row.parent_sfen, "input-row") !== row.parent_sfen ||
      text(row.played_move, "input-row") !== row.played_move ||
      integer(row.ply, 0, "input-row") !== row.ply ||
      parents.has(row.parent_id) ||
      (previousParentId !== undefined &&
        compareBytewise(previousParentId, row.parent_id) >= 0)
    ) {
      fail("input-row");
    }
    previousParentId = row.parent_id;
    parents.set(row.parent_id, row);
    gameIds.add(row.game_id);
    positionIds.add(row.position_id);
  }
  if (
    binding.games !== gameIds.size ||
    binding.game_ids_sha256 !== floodgateIdentifierDigest(gameIds) ||
    binding.parent_ids_sha256 !== floodgateIdentifierDigest(parents.keys()) ||
    binding.position_ids_count !== positionIds.size ||
    binding.position_ids_sha256 !== floodgateIdentifierDigest(positionIds)
  ) {
    fail("input-aggregate");
  }
  return parents;
}

function validateEvidence(
  value: unknown,
  code: string,
): Record<string, unknown> {
  const evidence = exactRecord(
    value,
    ["relative_path", "bytes", "sha256", "mode", "identity"],
    code,
  );
  text(evidence.relative_path, code);
  integer(evidence.bytes, 1, code);
  digest(evidence.sha256, code);
  if (evidence.mode !== "0600" && evidence.mode !== "0700") fail(code);
  const identity = exactRecord(evidence.identity, ["dev", "ino"], code);
  if (
    typeof identity.dev !== "string" ||
    !/^(?:0|[1-9][0-9]*)$/u.test(identity.dev) ||
    typeof identity.ino !== "string" ||
    !/^[1-9][0-9]*$/u.test(identity.ino)
  ) {
    fail(code);
  }
  return evidence;
}

function validateAssetAuthority(
  value: unknown,
  expected: unknown,
): Record<string, unknown> {
  requireSame(value, expected, "asset-authority-expected");
  const authority = exactRecord(
    value,
    [
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "asset_authority",
      "assets",
      "engine",
      "postverification",
      "runtime",
    ],
    "asset-authority-shape",
  );
  if (
    authority.contract !==
      FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CONTRACT ||
    authority.status !== FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_STATUS ||
    authority.claim_boundary !==
      FLOODGATE_STRENGTH_FIRST_V8_TEACHER_AUTHORITY_CLAIM_BOUNDARY ||
    authority.execution_boundary !==
      "production-fixed-registry-and-deployment-root" ||
    !sameJson(authority.runtime, FLOODGATE_STRENGTH_FIRST_V8_TEACHER_RUNTIME)
  ) {
    fail("asset-authority-contract");
  }
  const legacy = exactRecord(
    authority.asset_authority,
    [
      "contract",
      "status",
      "claim_boundary",
      "trust_boundary",
      "execution_boundary",
      "deployment",
      "assets",
      "engine",
      "runtime",
      "postverification",
    ],
    "asset-authority-legacy",
  );
  if (
    legacy.execution_boundary !== authority.execution_boundary ||
    !sameJson(legacy.runtime, FLOODGATE_PRODUCTION_TEACHER_RUNTIME) ||
    !sameJson(authority.assets, legacy.assets) ||
    !sameJson(authority.engine, legacy.engine) ||
    !sameJson(authority.postverification, legacy.postverification)
  ) {
    fail("asset-authority-alias");
  }
  const assets = exactRecord(
    authority.assets,
    ["engine", "eval", "stable"],
    "assets",
  );
  const engineAssets = exactRecord(
    assets.engine,
    ["yaneuraou", "receipt"],
    "assets-engine",
  );
  validateEvidence(engineAssets.yaneuraou, "assets-engine-bin");
  validateEvidence(engineAssets.receipt, "assets-engine-receipt");
  const evalAssets = exactRecord(
    assets.eval,
    ["nn", "tree_sha256"],
    "assets-eval",
  );
  validateEvidence(evalAssets.nn, "assets-eval-nn");
  digest(evalAssets.tree_sha256, "assets-eval-tree");
  return authority;
}

function validateV9AssetAuthority(
  value: unknown,
  expected: unknown,
): Record<string, unknown> {
  requireSame(value, expected, "v9-asset-authority-expected");
  const authority = exactRecord(
    value,
    [
      "contract",
      "status",
      "claim_boundary",
      "execution_boundary",
      "asset_authority",
      "assets",
      "engine",
      "postverification",
      "runtime",
    ],
    "v9-asset-authority-shape",
  );
  if (
    authority.contract !==
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CONTRACT ||
    authority.status !==
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_STATUS ||
    authority.claim_boundary !==
      FLOODGATE_STRENGTH_FIRST_V9_TEACHER_AUTHORITY_CLAIM_BOUNDARY ||
    authority.execution_boundary !==
      "production-fixed-registry-and-deployment-root" ||
    !sameJson(authority.runtime, FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME)
  ) {
    fail("v9-asset-authority-contract");
  }
  const v8 = validateAssetAuthority(
    authority.asset_authority,
    authority.asset_authority,
  );
  if (
    !sameJson(authority.assets, v8.assets) ||
    !sameJson(authority.engine, v8.engine) ||
    !sameJson(authority.postverification, v8.postverification)
  ) {
    fail("v9-asset-authority-alias");
  }
  return authority;
}

function validateExpectedAssetAuthority(
  value: unknown,
  expected: unknown,
  generation: TeacherGeneration,
): Record<string, unknown> {
  return generation === "v8"
    ? validateAssetAuthority(value, expected)
    : validateV9AssetAuthority(value, expected);
}

function validateInputBinding(
  value: unknown,
  expected: unknown,
  code: string,
): void {
  const input = exactRecord(value, ["schema", "role", "binding"], code);
  if (
    input.schema !== FLOODGATE_TRAINING_ROW_CONSUMER_SCHEMA ||
    input.role !== "training"
  ) {
    fail(code);
  }
  exactRecord(input.binding, INPUT_BINDING_KEYS, code);
  requireSame(input, expected, code);
}

function validatePostflight(value: unknown, expectedInput: unknown): void {
  const receipt = exactRecord(
    value,
    [
      "schema",
      "status",
      "claim_boundary",
      "execution_boundary",
      "input",
      "runtime_claim",
      "postflight",
    ],
    "postflight-shape",
  );
  if (
    receipt.schema !== FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_SCHEMA ||
    receipt.status !== FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_STATUS ||
    receipt.claim_boundary !==
      FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_CLAIM_BOUNDARY ||
    receipt.execution_boundary !== "production-fixed-pinned-bundle-verifier" ||
    receipt.runtime_claim !==
      FLOODGATE_TRAINING_CONSUMER_POSTFLIGHT_RUNTIME_CLAIM
  ) {
    fail("postflight-contract");
  }
  validateInputBinding(receipt.input, expectedInput, "postflight-input");
  const postflight = exactRecord(
    receipt.postflight,
    [
      "callback_settled_without_value",
      "filesystem_snapshot_revalidated_after_callback",
      "input_descriptors_closed",
    ],
    "postflight-flags",
  );
  if (
    postflight.callback_settled_without_value !== true ||
    postflight.filesystem_snapshot_revalidated_after_callback !== true ||
    postflight.input_descriptors_closed !== true
  ) {
    fail("postflight-flags");
  }
}

function validateFastInputBinding(
  value: unknown,
  expectedInput: Readonly<Record<string, unknown>>,
  code: string,
): void {
  const fast = exactRecord(
    value,
    ["schema", "role", "policy", "manifest", "source"],
    code,
  );
  if (
    fast.schema !== FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_SCHEMA ||
    fast.role !== "training" ||
    fast.policy !== FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY
  ) {
    fail(code);
  }
  const manifest = fileBinding(fast.manifest, "manifest.json", code);
  const source = exactRecord(
    fast.source,
    [
      "path",
      "format",
      "bytes",
      "sha256",
      "records",
      "games",
      "game_ids_sha256",
      "parent_ids_sha256",
      "position_ids_count",
      "position_ids_sha256",
    ],
    code,
  );
  const inputBinding = exactRecord(
    expectedInput.binding,
    INPUT_BINDING_KEYS,
    code,
  );
  const inputRecords = integer(inputBinding.records, 1, code);
  if (
    source.path !== "training.raw.jsonl" ||
    source.format !== inputBinding.raw_format ||
    source.bytes !== inputBinding.raw_bytes ||
    source.sha256 !== inputBinding.raw_sha256 ||
    source.records !== inputRecords ||
    source.games !== inputBinding.games ||
    source.game_ids_sha256 !== inputBinding.game_ids_sha256 ||
    source.parent_ids_sha256 !== inputBinding.parent_ids_sha256 ||
    source.position_ids_count !== inputBinding.position_ids_count ||
    source.position_ids_sha256 !== inputBinding.position_ids_sha256 ||
    manifest.bytes !== inputBinding.bundle_manifest_bytes ||
    manifest.sha256 !== inputBinding.bundle_manifest_sha256
  ) {
    fail(code);
  }
  if (
    inputRecords === 24_000 &&
    (!sameJson(source, FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_RAW_IDENTITY) ||
      !sameJson(manifest, FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY))
  ) {
    fail(code);
  }
}

function validateV9AuthenticatedInput(
  value: unknown,
  expectedInput: Readonly<Record<string, unknown>>,
  target: number,
): void {
  const authenticated = exactRecord(
    value,
    ["runtime", "generator_projection"],
    "v9-result-input",
  );
  const projection = exactRecord(
    authenticated.generator_projection,
    [
      "schema",
      "role",
      "binding",
      "historic_provenance_not_reverified_by_fast_path",
    ],
    "v9-result-input-projection",
  );
  if (
    projection.historic_provenance_not_reverified_by_fast_path !== true
  ) {
    fail("v9-result-input-projection");
  }
  validateInputBinding(
    {
      schema: projection.schema,
      role: projection.role,
      binding: projection.binding,
    },
    expectedInput,
    "v9-result-input-projection",
  );
  if (
    !isRecord(expectedInput.binding) ||
    expectedInput.binding.records !== target
  ) {
    fail("v9-result-input-projection");
  }
  const runtime = exactRecord(
    authenticated.runtime,
    ["preflight", "postflight", "equal"],
    "v9-result-fast-input-runtime",
  );
  if (runtime.equal !== true || !sameJson(runtime.preflight, runtime.postflight)) {
    fail("v9-result-fast-input-runtime");
  }
  validateFastInputBinding(
    runtime.preflight,
    expectedInput,
    "v9-result-fast-input-preflight",
  );
  validateFastInputBinding(
    runtime.postflight,
    expectedInput,
    "v9-result-fast-input-postflight",
  );
}

function validateResultEnvelope(
  result: Record<string, unknown>,
  expectedAuthority: unknown,
  expectedInput: unknown,
  target: number,
  milestoneTargets: readonly [number, number],
  generation: TeacherGeneration,
): {
  readonly revision: string;
  readonly fingerprint: string;
  readonly completion: Record<string, unknown>;
  readonly stagedOutputs: Record<string, unknown>;
} {
  exactRecord(
    result,
    generation === "v8" ? V8_RESULT_KEYS : V9_RESULT_KEYS,
    "result-shape",
  );
  const validResultContract =
    generation === "v8"
      ? result.schema === FLOODGATE_STRENGTH_FIRST_TEACHER_RESULT_SCHEMA &&
        result.status === "complete-training-only-postflight-bound" &&
        result.claim_boundary ===
          "postflight-input-and-staged-output-integrity-not-playing-strength-evidence"
      : result.schema ===
          FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RESULT_SCHEMA &&
        result.status ===
          "complete-training-only-fast-input-postflight-bound" &&
        result.claim_boundary ===
          "fast-input-and-staged-output-integrity-not-playing-strength-evidence";
  if (!validResultContract) {
    fail("result-contract");
  }
  const runner = exactRecord(
    result.runner,
    [
      "schema",
      "revision",
      "node",
      "platform",
      "architecture",
      "local_only",
      "network_requests",
      "cloud_services",
      "live_weight_changes",
    ],
    "runner-shape",
  );
  const revision = text(runner.revision, "runner-revision");
  const expectedRunnerSchema =
    generation === "v8"
      ? FLOODGATE_STRENGTH_FIRST_TEACHER_RUNNER_SCHEMA
      : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNNER_SCHEMA;
  const expectedNodeVersion =
    generation === "v8"
      ? FLOODGATE_STRENGTH_FIRST_TEACHER_NODE_VERSION
      : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_NODE_VERSION;
  if (
    runner.schema !== expectedRunnerSchema ||
    !REVISION_RE.test(revision) ||
    runner.node !== expectedNodeVersion ||
    runner.platform !== "darwin" ||
    runner.architecture !== "arm64" ||
    runner.local_only !== true ||
    runner.network_requests !== 0 ||
    !Array.isArray(runner.cloud_services) ||
    runner.cloud_services.length !== 0 ||
    runner.live_weight_changes !== 0
  ) {
    fail("runner-contract");
  }
  validateExpectedAssetAuthority(
    result.production_asset_preflight,
    expectedAuthority,
    generation,
  );
  if (generation === "v8") {
    validateInputBinding(
      result.authenticated_input,
      expectedInput,
      "result-input",
    );
    validatePostflight(result.consumer_postflight, expectedInput);
  } else {
    validateV9AuthenticatedInput(
      result.authenticated_input,
      expectedInput as Readonly<Record<string, unknown>>,
      target,
    );
  }
  const teacher =
    generation === "v8"
      ? exactRecord(
          result.teacher,
          [
            "engine",
            "parallel_engines",
            "threads_per_engine",
            "proposal",
            "independent_rescore",
            "hash_mb_per_engine",
            "timeout_ms_per_search",
            "engine_environment",
            "stable_assets_verified",
            "stable_engine_or_policy_executions",
          ],
          "result-teacher",
        )
      : exactRecord(
          result.teacher,
          [
            "engine",
            "runtime",
            "engine_environment",
            "stable_assets_verified",
            "stable_engine_or_policy_executions",
          ],
          "result-teacher",
        );
  const validTeacher =
    generation === "v8"
      ? teacher.engine === "YaneuraOu" &&
        teacher.parallel_engines === 12 &&
        teacher.threads_per_engine === 1 &&
        sameJson(teacher.proposal, { multipv: 12, depth: 16 }) &&
        sameJson(teacher.independent_rescore, {
          multipv: 1,
          searchmoves: "exactly-one-candidate",
          depth: 16,
        }) &&
        teacher.hash_mb_per_engine ===
          FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE &&
        teacher.timeout_ms_per_search === 600_000
      : teacher.engine === "YaneuraOu" &&
        sameJson(teacher.runtime, FLOODGATE_STRENGTH_FIRST_V9_TEACHER_RUNTIME);
  if (
    !validTeacher ||
    !sameJson(
      teacher.engine_environment,
      SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    ) ||
    teacher.stable_assets_verified !== true ||
    teacher.stable_engine_or_policy_executions !== 0
  ) {
    fail("result-teacher");
  }
  const milestones = exactRecord(
    result.milestones,
    ["targets", "prefix_100", "prefix_500"],
    "result-milestones",
  );
  requireSame(
    milestones.targets,
    [milestoneTargets[0], milestoneTargets[1], target],
    "result-milestone-targets",
  );
  fileBinding(
    milestones.prefix_100,
    `milestone-${milestoneTargets[0]}.json`,
    "prefix-1",
  );
  fileBinding(
    milestones.prefix_500,
    `milestone-${milestoneTargets[1]}.json`,
    "prefix-2",
  );
  const completion = exactRecord(
    result.completion,
    [
      "input_parents",
      "completed_parents",
      "forced_parents_skipped",
      "forced_skip_reasons",
      "emitted_parent_groups",
      "run_fingerprint",
    ],
    "result-completion",
  );
  if (
    completion.input_parents !== target ||
    completion.completed_parents !== target
  ) {
    fail("result-completion");
  }
  const fingerprint = digest(completion.run_fingerprint, "result-fingerprint");
  const stagedOutputs = exactRecord(
    result.staged_outputs,
    ["work", "train", "parent_completion", "manifest", "staged_result"],
    "result-staged-outputs",
  );
  for (const [field, filename] of [
    ["work", "work.jsonl"],
    ["train", "train.jsonl"],
    ["parent_completion", "parent-completion.jsonl"],
    ["manifest", "manifest.json"],
    ["staged_result", "staged-result.json"],
  ] as const) {
    fileBinding(stagedOutputs[field], filename, "result-staged-output");
  }
  const publication = exactRecord(
    result.publication,
    generation === "v8"
      ? [
          "stage_root_private_0700",
          "stage_files_private_0600",
          "staged_inside_single_authenticated_callback",
          "postflight_exact_receipt_claimed_before_result_commit",
          "result_file_sync_before_rename",
          "result_same_directory_rename",
          "result_directory_sync_after_rename",
        ]
      : [
          "stage_root_private_0700",
          "stage_files_private_0600",
          "fast_input_reauthenticated_after_teacher",
          "postflight_equal_before_result_commit",
          "result_committed_last",
        ],
    "result-publication",
  );
  if (Object.values(publication).some((value) => value !== true)) {
    fail("result-publication");
  }
  return { revision, fingerprint, completion, stagedOutputs };
}

interface WorkProjection {
  readonly payloadSha256: string;
  readonly forced: boolean;
  readonly reason?:
    | "fewer-than-two-legal-moves"
    | "search-timeout-no-label"
    | "proposal-incomplete-no-label";
  readonly trainRecords: number;
  readonly trainSha256: string | null;
}

interface WorkScan {
  readonly projections: ReadonlyMap<string, WorkProjection>;
  readonly completed: number;
  readonly fewerThanTwo: number;
  readonly timedOut: number;
  readonly proposalIncomplete: number;
  readonly trainRecords: number;
  readonly candidateParents: number;
  readonly candidateCount: number;
  readonly minimumCandidates: number;
  readonly maximumCandidates: number;
  readonly candidateSetsSha256: string;
  readonly prefixes: ReadonlyMap<
    number,
    Readonly<{
      readonly forced: number;
      readonly fewerThanTwo: number;
      readonly timedOut: number;
      readonly proposalIncomplete: number;
      readonly emitted: number;
      readonly bytes: number;
      readonly sha256: string;
    }>
  >;
}

function plainBinding(
  value: Record<string, unknown>,
): Readonly<{ path: unknown; bytes: unknown; sha256: unknown }> {
  return {
    path: value.path,
    bytes: value.bytes,
    sha256: value.sha256,
  };
}

function forcedReasons(
  value: unknown,
  target: number,
  forced: number,
  code: string,
  generation: TeacherGeneration = "v8",
): Readonly<{
  fewer: number;
  timedOut: number;
  proposalIncomplete: number;
}> {
  const expectedKeys = [
    "fewer_than_two_legal_moves",
    "search_timeout_no_label",
  ];
  const candidate = exactRecord(
    value,
    generation === "v9" &&
      isRecord(value) &&
      Object.prototype.hasOwnProperty.call(
        value,
        "proposal_incomplete_no_label",
      )
      ? [...expectedKeys, "proposal_incomplete_no_label"]
      : expectedKeys,
    code,
  );
  const reasons = candidate;
  const fewer = integer(reasons.fewer_than_two_legal_moves, 0, code);
  const timedOut = integer(reasons.search_timeout_no_label, 0, code);
  const proposalIncomplete =
    generation === "v9" &&
    Object.prototype.hasOwnProperty.call(
      reasons,
      "proposal_incomplete_no_label",
    )
      ? integer(reasons.proposal_incomplete_no_label, 0, code)
      : 0;
  if (
    fewer + timedOut + proposalIncomplete !== forced ||
    timedOut + proposalIncomplete > strengthFirstTimeoutSkipLimit(target)
  ) {
    fail(code);
  }
  return { fewer, timedOut, proposalIncomplete };
}

export function validateFloodgateStrengthFirstV9ForcedReasonsForTests(
  value: unknown,
  target: number,
  forced: number,
): Readonly<{
  fewer: number;
  timedOut: number;
  proposalIncomplete: number;
}> {
  return forcedReasons(
    value,
    target,
    forced,
    "v9-forced-reasons-test",
    "v9",
  );
}

function fileDigest(value: unknown, code: string): Record<string, unknown> {
  const file = exactRecord(value, ["path", "bytes", "sha256"], code);
  text(file.path, code);
  integer(file.bytes, 0, code);
  digest(file.sha256, code);
  return file;
}

function validateManifest(
  manifest: Record<string, unknown>,
  revision: string,
  fingerprint: string,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  expectedAuthority: unknown,
  target: number,
  generation: TeacherGeneration,
): Readonly<{
  teacher: Record<string, unknown>;
  search: Record<string, unknown>;
  candidateSets: Record<string, unknown>;
  progress: Record<string, unknown>;
  reasons: unknown;
  completion: Record<string, unknown>;
  train: Record<string, unknown>;
}> {
  exactRecord(
    manifest,
    [
      "schema",
      "status",
      "run_fingerprint",
      "pipeline",
      "authenticated_input",
      "source",
      "teacher",
      "search",
      "candidate_sets",
      "progress_checkpoint",
      "forced_skip_reasons",
      "parent_completion",
      "outputs",
      "publication",
    ],
    "manifest-shape",
  );
  const pipeline = exactRecord(
    manifest.pipeline,
    ["source_revision", "tracked_tree_clean"],
    "manifest-pipeline",
  );
  const authenticated = exactRecord(
    manifest.authenticated_input,
    generation === "v8"
      ? ["bundle_verifier_revision", "binding"]
      : ["bundle_verifier_revision", "binding", "runtime_policy"],
    "manifest-input",
  );
  const source = exactRecord(
    manifest.source,
    [
      "raw_sha256",
      "raw_records",
      "selected_parents",
      "selected_parent_ids_sha256",
    ],
    "manifest-source",
  );
  const teacher = exactRecord(
    manifest.teacher,
    [
      "engine_bin_sha256",
      "engine_bin_bytes",
      "engine_args",
      "engine_arg_files",
      "engine_receipt",
      "eval_sha256",
      "eval_files",
      "runtime_snapshot",
      "engine_environment",
    ],
    "manifest-teacher",
  );
  const search = exactRecord(
    manifest.search,
    [
      "multipv",
      "limit",
      ...(generation === "v9"
        ? [
            "proposal_limit",
            "proposal_incomplete_quarantine_policy",
          ]
        : []),
      "parallel_engines",
      "fv_scale",
      "hash_mb_per_engine",
      "timeout_ms",
      "exact_rescore_mode",
      "label_policy",
      "tt_reset_before_proposal",
      "tt_reset_before_each_candidate",
      "search_state_reset_before_proposal",
      "search_state_reset_before_each_candidate",
      "candidate_execution_order",
      "synthesized_rank_order",
      "engine_options",
    ],
    "manifest-search",
  );
  const candidateSets = exactRecord(
    manifest.candidate_sets,
    [
      "sha256",
      "parents",
      "candidates",
      "min_candidates",
      "max_candidates",
      "skipped_parents",
    ],
    "manifest-candidates",
  );
  const progress = exactRecord(
    manifest.progress_checkpoint,
    [
      "schema",
      "run_fingerprint",
      "entries",
      "completed_parents",
      "skipped_parents",
      "sha256",
    ],
    "manifest-progress",
  );
  const completion = exactRecord(
    manifest.parent_completion,
    [
      "path",
      "format",
      "bytes",
      "sha256",
      "records",
      "forced_parents_skipped",
      "emitted_parent_groups",
      "parent_ids_sha256",
      "forced_parent_ids_sha256",
      "emitted_parent_ids_sha256",
    ],
    "manifest-completion",
  );
  const outputs = exactRecord(manifest.outputs, ["train"], "manifest-outputs");
  const train = exactRecord(
    outputs.train,
    [
      "path",
      "format",
      "bytes",
      "sha256",
      "records",
      "parents",
      "games",
      "game_ids_sha256",
      "parent_ids_sha256",
      "semantic_position_ids_count",
      "semantic_position_ids_sha256",
    ],
    "manifest-train",
  );
  const publication = exactRecord(
    manifest.publication,
    ["staged_inside_authenticated_callback", "consumer_postflight_bound"],
    "manifest-publication",
  );
  const authority = validateExpectedAssetAuthority(
    expectedAuthority,
    expectedAuthority,
    generation,
  );
  const assets = exactRecord(
    authority.assets,
    ["engine", "eval", "stable"],
    "assets",
  );
  const engineAssets = exactRecord(
    assets.engine,
    ["yaneuraou", "receipt"],
    "assets-engine",
  );
  const evalAssets = exactRecord(
    assets.eval,
    ["nn", "tree_sha256"],
    "assets-eval",
  );
  const engineBinary = validateEvidence(
    engineAssets.yaneuraou,
    "assets-engine-bin",
  );
  const receiptEvidence = validateEvidence(
    engineAssets.receipt,
    "assets-engine-receipt",
  );
  const evalNnEvidence = validateEvidence(evalAssets.nn, "assets-eval-nn");
  const engineReceipt = exactRecord(
    teacher.engine_receipt,
    ["file", "content"],
    "manifest-engine-receipt",
  );
  const receiptFile = fileDigest(
    engineReceipt.file,
    "manifest-engine-receipt-file",
  );
  if (!Array.isArray(teacher.engine_args)) fail("manifest-teacher");
  const engineArgFiles = exactArray(
    teacher.engine_arg_files,
    (teacher.engine_arg_files as unknown[])?.length ?? -1,
    "manifest-teacher",
  ).map((value) => fileDigest(value, "manifest-engine-arg"));
  const evalFiles = exactArray(
    teacher.eval_files,
    (teacher.eval_files as unknown[])?.length ?? -1,
    "manifest-teacher",
  ).map((value) => fileDigest(value, "manifest-eval-file"));
  const evalNn = evalFiles.find((value) => value.path === "nn.bin");
  if (
    manifest.schema !== STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA ||
    manifest.status !== "complete-training-only" ||
    manifest.run_fingerprint !== fingerprint ||
    pipeline.source_revision !== revision ||
    pipeline.tracked_tree_clean !== true ||
    authenticated.bundle_verifier_revision !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION ||
    (generation === "v9" &&
      authenticated.runtime_policy !==
        FLOODGATE_STRENGTH_FIRST_FAST_TRAINING_INPUT_POLICY) ||
    !sameJson(authenticated.binding, input.binding) ||
    source.raw_sha256 !== input.binding.raw_sha256 ||
    source.raw_records !== target ||
    source.selected_parents !== target ||
    source.selected_parent_ids_sha256 !== input.binding.parent_ids_sha256 ||
    teacher.engine_bin_sha256 !== engineBinary.sha256 ||
    teacher.engine_bin_bytes !== engineBinary.bytes ||
    receiptFile.sha256 !== receiptEvidence.sha256 ||
    receiptFile.bytes !== receiptEvidence.bytes ||
    evalFiles.length !== 1 ||
    evalNn?.sha256 !== evalNnEvidence.sha256 ||
    evalNn.bytes !== evalNnEvidence.bytes ||
    teacher.eval_sha256 !== evalAssets.tree_sha256 ||
    !sameJson(
      teacher.engine_environment,
      SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    ) ||
    search.multipv !== 12 ||
    !sameJson(search.limit, { depth: 16 }) ||
    (generation === "v9" &&
      (!sameJson(search.proposal_limit, { depth: 14 }) ||
        search.proposal_incomplete_quarantine_policy !==
          PROPOSAL_INCOMPLETE_QUARANTINE_POLICY)) ||
    search.parallel_engines !==
      (generation === "v8" ? 12 : STRENGTH_FIRST_V9_PRODUCTION_ENGINES) ||
    search.hash_mb_per_engine !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_HASH_MB_PER_ENGINE ||
    search.timeout_ms !== 600_000 ||
    search.exact_rescore_mode !== INDEPENDENT_EXACT_RESCORE_MODE ||
    search.label_policy !== SIBLING_TEACHER_LABEL_POLICY ||
    search.tt_reset_before_proposal !== true ||
    search.tt_reset_before_each_candidate !== true ||
    search.search_state_reset_before_proposal !== "isready" ||
    search.search_state_reset_before_each_candidate !== "isready" ||
    search.candidate_execution_order !== "utf8-bytewise-ascending" ||
    search.synthesized_rank_order !== "cp-descending-then-utf8-bytewise-move" ||
    !sameJson(search.engine_options, USI_TEACHER_ENGINE_CONTRACT) ||
    completion.path !== "parent-completion.jsonl" ||
    completion.format !== STRENGTH_FIRST_PARENT_COMPLETION_FORMAT ||
    train.path !== "train.jsonl" ||
    train.format !== STRENGTH_FIRST_TRAIN_FORMAT ||
    publication.staged_inside_authenticated_callback !== true ||
    publication.consumer_postflight_bound !== false
  ) {
    fail("manifest-contract");
  }
  for (const argument of teacher.engine_args)
    text(argument, "manifest-engine-arg");
  const runtimeSnapshot = exactRecord(
    teacher.runtime_snapshot,
    [
      ...Object.keys(SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT),
      "engine_argument_file_count",
      "eval_tree_present",
    ],
    "manifest-runtime-snapshot",
  );
  if (
    !sameJson(
      {
        engine_binary: runtimeSnapshot.engine_binary,
        engine_argument_files: runtimeSnapshot.engine_argument_files,
        eval_tree: runtimeSnapshot.eval_tree,
        eval_options_file: runtimeSnapshot.eval_options_file,
        private_working_directory: runtimeSnapshot.private_working_directory,
      },
      SIBLING_TEACHER_RUNTIME_SNAPSHOT_CONTRACT,
    ) ||
    runtimeSnapshot.engine_argument_file_count !== engineArgFiles.length ||
    runtimeSnapshot.eval_tree_present !== true
  ) {
    fail("manifest-runtime-snapshot");
  }
  const recomputed = siblingTeacherRunFingerprint({
    authenticated_training_binding: input.binding,
    source_raw_sha256: input.binding.raw_sha256,
    selected_parent_ids_sha256: input.binding.parent_ids_sha256,
    pipeline: pipeline as unknown as {
      source_revision: string;
      tracked_tree_clean: true;
    },
    engine_bin_sha256: teacher.engine_bin_sha256 as string,
    engine_args: teacher.engine_args as string[],
    engine_arg_files: engineArgFiles as Array<{
      path: string;
      bytes: number;
      sha256: string;
    }>,
    engine_receipt_sha256: receiptFile.sha256 as string,
    engine_receipt: engineReceipt.content as Record<string, unknown>,
    eval_sha256: teacher.eval_sha256 as string,
    multipv: search.multipv as number,
    limit: search.limit as { depth: number },
    ...(generation === "v9"
      ? {
          proposal_limit: search.proposal_limit as { depth: number },
          authenticated_input_policy: authenticated.runtime_policy as string,
        }
      : {}),
    engine_environment: SIBLING_TEACHER_ENGINE_ENVIRONMENT_CONTRACT,
    parallel_engines: search.parallel_engines as number,
    fv_scale: search.fv_scale as number,
    hash_mb_per_engine: search.hash_mb_per_engine as number,
    timeout_ms: search.timeout_ms as number,
  });
  if (recomputed !== fingerprint) fail("manifest-fingerprint");
  return {
    teacher,
    search,
    candidateSets,
    progress,
    reasons: manifest.forced_skip_reasons,
    completion,
    train,
  };
}

function validateStagedResult(
  staged: Record<string, unknown>,
  revision: string,
  fingerprint: string,
  target: number,
  resultOutputs: Record<string, unknown>,
  manifestBytes: Uint8Array,
): Readonly<{
  work: Record<string, unknown>;
  train: Record<string, unknown>;
  completion: Record<string, unknown>;
}> {
  exactRecord(
    staged,
    [
      "schema",
      "status",
      "run_fingerprint",
      "runner_revision",
      "bundle_verifier_revision",
      "input_parents",
      "completed_parents",
      "forced_parents_skipped",
      "forced_skip_reasons",
      "emitted_parent_groups",
      "work",
      "train",
      "parent_completion",
      "manifest",
      "publication",
    ],
    "staged-result-shape",
  );
  const work = exactRecord(
    staged.work,
    ["path", "bytes", "sha256", "schema", "records"],
    "staged-work",
  );
  const train = exactRecord(
    staged.train,
    [
      "path",
      "format",
      "bytes",
      "sha256",
      "records",
      "parents",
      "games",
      "game_ids_sha256",
      "parent_ids_sha256",
      "semantic_position_ids_count",
      "semantic_position_ids_sha256",
    ],
    "staged-train",
  );
  const completion = exactRecord(
    staged.parent_completion,
    [
      "path",
      "format",
      "bytes",
      "sha256",
      "records",
      "forced_parents_skipped",
      "emitted_parent_groups",
      "parent_ids_sha256",
      "forced_parent_ids_sha256",
      "emitted_parent_ids_sha256",
    ],
    "staged-completion",
  );
  const manifest = exactRecord(
    staged.manifest,
    ["path", "bytes", "sha256", "schema"],
    "staged-manifest",
  );
  const publication = exactRecord(
    staged.publication,
    ["staged_inside_authenticated_callback", "consumer_postflight_bound"],
    "staged-publication",
  );
  if (
    staged.schema !== STRENGTH_FIRST_SIBLING_TEACHER_RESULT_SCHEMA ||
    staged.status !== "complete-training-only" ||
    staged.run_fingerprint !== fingerprint ||
    staged.runner_revision !== revision ||
    staged.bundle_verifier_revision !==
      FLOODGATE_STRENGTH_FIRST_TEACHER_VERIFIER_REVISION ||
    staged.input_parents !== target ||
    staged.completed_parents !== target ||
    work.path !== "work.jsonl" ||
    work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    work.records !== target + 1 ||
    train.path !== "train.jsonl" ||
    train.format !== STRENGTH_FIRST_TRAIN_FORMAT ||
    completion.path !== "parent-completion.jsonl" ||
    completion.format !== STRENGTH_FIRST_PARENT_COMPLETION_FORMAT ||
    completion.records !== target ||
    manifest.path !== "manifest.json" ||
    manifest.schema !== STRENGTH_FIRST_SIBLING_TEACHER_MANIFEST_SCHEMA ||
    publication.staged_inside_authenticated_callback !== true ||
    publication.consumer_postflight_bound !== false ||
    !sameJson(plainBinding(work), resultOutputs.work) ||
    !sameJson(plainBinding(train), resultOutputs.train) ||
    !sameJson(plainBinding(completion), resultOutputs.parent_completion) ||
    !sameJson(plainBinding(manifest), resultOutputs.manifest)
  ) {
    fail("staged-result-contract");
  }
  matchBytes(manifest, manifestBytes, "staged-manifest-bytes");
  return { work, train, completion };
}

function validateMilestoneDocument(
  value: Record<string, unknown>,
  target: number,
  revision: string,
  fingerprint: string,
  inputProjection: Readonly<Record<string, unknown>>,
  generation: TeacherGeneration,
): Readonly<{
  work: Record<string, unknown>;
  forced: number;
  fewer: number;
  timedOut: number;
  proposalIncomplete: number;
  emitted: number;
}> {
  exactRecord(
    value,
    generation === "v8"
      ? [
          "schema",
          "status",
          "authentication_receipt",
          "playing_strength_evidence",
          "target_parents",
          "completed_parents",
          "runner_revision",
          "authenticated_input",
          "stage",
          "progress",
        ]
      : [
          "schema",
          "status",
          "authentication_receipt",
          "playing_strength_evidence",
          "target_parents",
          "completed_parents",
          "runner_revision",
          "fast_input_preflight",
          "progress",
        ],
    "milestone-shape",
  );
  const stage =
    generation === "v8"
      ? exactRecord(
          value.stage,
          [
            "root",
            "same_stage_for_all_targets",
            "automatically_continue_to_next_target",
          ],
          "milestone-stage",
        )
      : undefined;
  const progress = exactRecord(
    value.progress,
    generation === "v8"
      ? [
          "status",
          "authentication_receipt",
          "target_parents",
          "completed_parents",
          "run_fingerprint",
          "forced_parents_skipped",
          "forced_skip_reasons",
          "emitted_parent_groups",
          "work",
        ]
      : [
          "status",
          "authentication_receipt",
          "run_fingerprint",
          "forced_parents_skipped",
          "forced_skip_reasons",
          "emitted_parent_groups",
          "work",
        ],
    "milestone-progress",
  );
  const work = exactRecord(
    progress.work,
    ["path", "bytes", "sha256", "schema", "records", "binding_scope"],
    "milestone-work",
  );
  const forced = integer(
    progress.forced_parents_skipped,
    0,
    "milestone-progress",
  );
  const reasons = forcedReasons(
    progress.forced_skip_reasons,
    target,
    forced,
    "milestone-reasons",
    generation,
  );
  const emitted = integer(
    progress.emitted_parent_groups,
    0,
    "milestone-progress",
  );
  if (
    value.schema !==
      (generation === "v8"
        ? FLOODGATE_STRENGTH_FIRST_TEACHER_MILESTONE_SCHEMA
        : FLOODGATE_STRENGTH_FIRST_V9_TEACHER_MILESTONE_SCHEMA) ||
    value.status !==
      "local-work-prefix-complete-not-an-authentication-or-playing-strength-receipt" ||
    value.authentication_receipt !== false ||
    value.playing_strength_evidence !== false ||
    value.target_parents !== target ||
    value.completed_parents !== target ||
    value.runner_revision !== revision ||
    (generation === "v8" &&
      (!sameJson(value.authenticated_input, inputProjection) ||
        stage?.root !== "." ||
        stage?.same_stage_for_all_targets !== true ||
        stage?.automatically_continue_to_next_target !== true)) ||
    progress.status !==
      "local-work-prefix-complete-not-an-authentication-receipt" ||
    progress.authentication_receipt !== false ||
    (generation === "v8" &&
      (progress.target_parents !== target ||
        progress.completed_parents !== target)) ||
    progress.run_fingerprint !== fingerprint ||
    forced + emitted !== target ||
    work.path !== "work.jsonl" ||
    work.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    work.records !== target + 1 ||
    work.binding_scope !== "canonical-target-prefix-projection"
  ) {
    fail("milestone-contract");
  }
  if (generation === "v9") {
    validateFastInputBinding(
      value.fast_input_preflight,
      inputProjection,
      "v9-milestone-fast-input",
    );
  }
  return {
    work,
    forced,
    fewer: reasons.fewer,
    timedOut: reasons.timedOut,
    proposalIncomplete: reasons.proposalIncomplete,
    emitted,
  };
}

async function scanWork(
  source: SerializedBytesSource,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  manifest: Record<string, unknown>,
  fingerprint: string,
  target: number,
  milestoneTargets: readonly [number, number],
  expectedBinding: Record<string, unknown>,
  generation: TeacherGeneration,
): Promise<WorkScan> {
  const reader = createJsonlReader(source, {
    code: "work-jsonl",
    prefixLines: milestoneTargets.map((value) => value + 1),
  });
  const headerLine = await reader.iterator.next();
  if (headerLine.done) fail("work-header");
  const header = parseJsonlLine(headerLine.value, "json", "work-header");
  exactRecord(
    header,
    [
      "schema",
      "kind",
      "run_fingerprint",
      "source_raw_sha256",
      "selected_parent_ids_sha256",
      "label_policy",
      "pipeline",
    ],
    "work-header",
  );
  if (
    header.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    header.kind !== "header" ||
    header.run_fingerprint !== fingerprint ||
    header.source_raw_sha256 !== input.binding.raw_sha256 ||
    header.selected_parent_ids_sha256 !== input.binding.parent_ids_sha256 ||
    header.label_policy !== SIBLING_TEACHER_LABEL_POLICY ||
    !sameJson(header.pipeline, manifest.pipeline)
  ) {
    fail("work-header");
  }
  const parents = new Map(
    input.rows.map((row) => [row.parent_id, row] as const),
  );
  const projections = new Map<string, WorkProjection>();
  const prefixMutable = new Map(
    milestoneTargets.map((value) => [
      value,
      {
        forced: 0,
        fewerThanTwo: 0,
        timedOut: 0,
        proposalIncomplete: 0,
        emitted: 0,
      },
    ]),
  );
  const candidateHash = createHash("sha256");
  candidateHash.update("candidate-sets-v1\0");
  let candidateLines = 0;
  let completed = 0;
  let fewerThanTwo = 0;
  let timedOut = 0;
  let proposalIncomplete = 0;
  let trainRecords = 0;
  let candidateCount = 0;
  let minimumCandidates = Number.POSITIVE_INFINITY;
  let maximumCandidates = 0;
  while (true) {
    const next = await reader.iterator.next();
    if (next.done) break;
    const row = parseJsonlLine(next.value, "json", "work-entry");
    const expectedParent = input.rows[completed];
    if (!expectedParent || row.parent_id !== expectedParent.parent_id) {
      fail("work-parent-order");
    }
    let entry: WorkEntry;
    try {
      entry = validateWorkEntry(
        row,
        fingerprint,
        parents,
        "private-work-entry",
        12,
        { depth: 16 },
        600_000,
        generation === "v8" ? { depth: 16 } : { depth: 14 },
      );
    } catch {
      fail("work-entry");
    }
    completed += 1;
    let projection: WorkProjection;
    if (entry.kind === "skip") {
      if (entry.reason === "fewer-than-two-legal-moves") fewerThanTwo += 1;
      else if (entry.reason === "search-timeout-no-label") timedOut += 1;
      else if (
        entry.reason === STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON
      ) {
        proposalIncomplete += 1;
      } else {
        fail("work-entry-reason");
      }
      projection = {
        payloadSha256: entry.payload_sha256,
        forced: true,
        reason: entry.reason,
        trainRecords: 0,
        trainSha256: null,
      };
    } else {
      const trainText = `${entry.records
        .map((record) => canonicalJson({ ...record, split: "train" }))
        .join("\n")}\n`;
      projection = {
        payloadSha256: entry.payload_sha256,
        forced: false,
        trainRecords: entry.records.length,
        trainSha256: sha256(trainText),
      };
      trainRecords += entry.records.length;
      const candidates = entry.candidate_moves.length;
      candidateCount += candidates;
      minimumCandidates = Math.min(minimumCandidates, candidates);
      maximumCandidates = Math.max(maximumCandidates, candidates);
      if (candidateLines > 0) candidateHash.update("\n");
      candidateHash.update(
        `${entry.parent_id}\0${entry.candidate_set_sha256}\0${candidates}`,
      );
      candidateLines += 1;
    }
    projections.set(entry.parent_id, projection);
    for (const [prefixTarget, counts] of prefixMutable) {
      if (completed > prefixTarget) continue;
      if (projection.forced) {
        counts.forced += 1;
        if (projection.reason === "fewer-than-two-legal-moves") {
          counts.fewerThanTwo += 1;
        } else if (projection.reason === "search-timeout-no-label") {
          counts.timedOut += 1;
        } else {
          counts.proposalIncomplete += 1;
        }
      } else {
        counts.emitted += 1;
      }
    }
  }
  await finish(reader, "work-jsonl");
  if (completed !== target || projections.size !== target)
    fail("work-coverage");
  if (
    reader.stats.bytes !== expectedBinding.bytes ||
    reader.stats.sha256 !== expectedBinding.sha256
  ) {
    fail("work-binding");
  }
  const prefixResults = new Map<
    number,
    Readonly<{
      forced: number;
      fewerThanTwo: number;
      timedOut: number;
      proposalIncomplete: number;
      emitted: number;
      bytes: number;
      sha256: string;
    }>
  >();
  milestoneTargets.forEach((prefixTarget, index) => {
    const stats = reader.prefixes[index];
    const counts = prefixMutable.get(prefixTarget);
    if (!counts || stats.sha256 === undefined) fail("work-prefix");
    prefixResults.set(prefixTarget, {
      ...counts,
      bytes: stats.bytes,
      sha256: stats.sha256,
    });
  });
  return {
    projections,
    completed,
    fewerThanTwo,
    timedOut,
    proposalIncomplete,
    trainRecords,
    candidateParents: candidateLines,
    candidateCount,
    minimumCandidates:
      minimumCandidates === Number.POSITIVE_INFINITY ? 0 : minimumCandidates,
    maximumCandidates,
    candidateSetsSha256: candidateHash.digest("hex"),
    prefixes: prefixResults,
  };
}

async function scanCompletion(
  bytes: Uint8Array,
  input: Readonly<AuthenticatedFloodgateTrainingRows>,
  work: WorkScan,
  expectedBinding: Record<string, unknown>,
): Promise<
  Readonly<{
    forcedIds: readonly string[];
    emittedIds: readonly string[];
    binding: Readonly<Record<string, unknown>>;
  }>
> {
  const reader = createJsonlReader(bytes, { code: "completion-jsonl" });
  const forcedIds: string[] = [];
  const emittedIds: string[] = [];
  let index = 0;
  while (true) {
    const next = await reader.iterator.next();
    if (next.done) break;
    const row = parseJsonlLine(next.value, "canonical", "completion-row");
    exactRecord(
      row,
      [
        "schema",
        "game_id",
        "parent_id",
        "position_id",
        "completed_parent_sha256",
        "forced_parent_skipped",
        "train_group_records",
        "train_group_sha256",
      ],
      "completion-row",
    );
    const parent = input.rows[index];
    const projection =
      parent === undefined ? undefined : work.projections.get(parent.parent_id);
    if (
      parent === undefined ||
      projection === undefined ||
      row.schema !== STRENGTH_FIRST_PARENT_COMPLETION_RECORD_SCHEMA ||
      row.game_id !== parent.game_id ||
      row.parent_id !== parent.parent_id ||
      row.position_id !== parent.position_id ||
      row.completed_parent_sha256 !== projection.payloadSha256 ||
      row.forced_parent_skipped !== projection.forced ||
      row.train_group_records !== projection.trainRecords ||
      row.train_group_sha256 !== projection.trainSha256
    ) {
      fail("completion-row");
    }
    if (projection.forced) forcedIds.push(parent.parent_id);
    else emittedIds.push(parent.parent_id);
    index += 1;
  }
  await finish(reader, "completion-jsonl");
  const binding = {
    path: "parent-completion.jsonl",
    format: STRENGTH_FIRST_PARENT_COMPLETION_FORMAT,
    bytes: reader.stats.bytes,
    sha256: reader.stats.sha256,
    records: index,
    forced_parents_skipped: forcedIds.length,
    emitted_parent_groups: emittedIds.length,
    parent_ids_sha256: floodgateIdentifierDigest(
      input.rows.map((row) => row.parent_id),
    ),
    forced_parent_ids_sha256: floodgateIdentifierDigest(forcedIds),
    emitted_parent_ids_sha256: floodgateIdentifierDigest(emittedIds),
  };
  if (index !== input.rows.length || !sameJson(binding, expectedBinding)) {
    fail("completion-binding");
  }
  return { forcedIds, emittedIds, binding };
}

function validateTrainRow(value: Record<string, unknown>): SiblingRecord {
  const expected = [
    ...SIBLING_BASE_RECORD_KEYS,
    "split",
    ...(value.teacher_score_kind === "mate"
      ? ["teacher_mate", "teacher_mate_sign"]
      : []),
  ];
  exactRecord(value, expected, "train-row");
  if (value.split !== "train") fail("train-row");
  return value as unknown as SiblingRecord;
}

async function scanTrain(
  bytes: Uint8Array,
  work: WorkScan,
  emittedIds: readonly string[],
  expectedBinding: Record<string, unknown>,
): Promise<Readonly<Record<string, unknown>>> {
  const reader = createJsonlReader(bytes, { code: "train-jsonl" });
  const gameIds = new Set<string>();
  const parentIds = new Set<string>();
  const semanticIds = new Set<string>();
  let currentParent: string | undefined;
  let currentRows: SiblingRecord[] = [];
  let currentHash = createHash("sha256");
  let emittedIndex = 0;
  let records = 0;

  const finishGroup = (): void => {
    if (currentParent === undefined) return;
    const expectedParent = emittedIds[emittedIndex];
    const projection = work.projections.get(currentParent);
    if (
      expectedParent !== currentParent ||
      projection === undefined ||
      projection.forced ||
      projection.trainRecords !== currentRows.length ||
      projection.trainSha256 !== currentHash.digest("hex")
    ) {
      fail("train-group-binding");
    }
    try {
      validateParentGroups(currentRows);
    } catch {
      fail("train-group");
    }
    emittedIndex += 1;
  };

  while (true) {
    const next = await reader.iterator.next();
    if (next.done) break;
    const value = parseJsonlLine(next.value, "canonical", "train-row");
    const row = validateTrainRow(value);
    if (currentParent !== undefined && row.parent_id !== currentParent) {
      finishGroup();
      currentRows = [];
      currentHash = createHash("sha256");
    }
    if (currentParent !== row.parent_id) currentParent = row.parent_id;
    currentRows.push(row);
    currentHash.update(next.value.bytesWithLf);
    gameIds.add(row.game_id);
    parentIds.add(row.parent_id);
    semanticIds.add(row.position_id);
    semanticIds.add(row.child_position_id);
    records += 1;
  }
  if (currentParent !== undefined) finishGroup();
  await finish(reader, "train-jsonl");
  const binding = {
    path: "train.jsonl",
    format: STRENGTH_FIRST_TRAIN_FORMAT,
    bytes: reader.stats.bytes,
    sha256: reader.stats.sha256,
    records,
    parents: parentIds.size,
    games: gameIds.size,
    game_ids_sha256: floodgateIdentifierDigest(gameIds),
    parent_ids_sha256: floodgateIdentifierDigest(parentIds),
    semantic_position_ids_count: semanticIds.size,
    semantic_position_ids_sha256: floodgateIdentifierDigest(semanticIds),
  };
  if (
    emittedIndex !== emittedIds.length ||
    records !== work.trainRecords ||
    !sameJson(binding, expectedBinding)
  ) {
    fail("train-binding");
  }
  return binding;
}

function validateWorkAggregates(
  work: WorkScan,
  manifestParts: ReturnType<typeof validateManifest>,
  target: number,
  fingerprint: string,
  workBinding: Record<string, unknown>,
  generation: TeacherGeneration,
): Readonly<{ forced: number; emitted: number }> {
  const forced =
    work.fewerThanTwo + work.timedOut + work.proposalIncomplete;
  const emitted = target - forced;
  const candidateSets = manifestParts.candidateSets;
  const progress = manifestParts.progress;
  const reasons = forcedReasons(
    manifestParts.reasons,
    target,
    forced,
    "manifest-reasons",
    generation,
  );
  void reasons;
  if (
    reasons.fewer !== work.fewerThanTwo ||
    reasons.timedOut !== work.timedOut ||
    reasons.proposalIncomplete !== work.proposalIncomplete ||
    candidateSets.sha256 !== work.candidateSetsSha256 ||
    candidateSets.parents !== work.candidateParents ||
    candidateSets.candidates !== work.candidateCount ||
    candidateSets.min_candidates !== work.minimumCandidates ||
    candidateSets.max_candidates !== work.maximumCandidates ||
    candidateSets.skipped_parents !== forced ||
    progress.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    progress.run_fingerprint !== fingerprint ||
    progress.entries !== target ||
    progress.completed_parents !== emitted ||
    progress.skipped_parents !== forced ||
    progress.sha256 !== workBinding.sha256
  ) {
    fail("manifest-work-aggregates");
  }
  return { forced, emitted };
}

function validateAggregateBindings(
  resultCompletion: Record<string, unknown>,
  staged: Record<string, unknown>,
  manifest: ReturnType<typeof validateManifest>,
  aggregates: Readonly<{ forced: number; emitted: number }>,
  work: WorkScan,
  completionBinding: Readonly<Record<string, unknown>>,
  trainBinding: Readonly<Record<string, unknown>>,
  target: number,
  generation: TeacherGeneration,
): void {
  const stagedForced = integer(
    staged.forced_parents_skipped,
    0,
    "staged-aggregates",
  );
  const stagedEmitted = integer(
    staged.emitted_parent_groups,
    0,
    "staged-aggregates",
  );
  const outerForced = integer(
    resultCompletion.forced_parents_skipped,
    0,
    "result-aggregates",
  );
  const outerEmitted = integer(
    resultCompletion.emitted_parent_groups,
    0,
    "result-aggregates",
  );
  const outerReasons = forcedReasons(
    resultCompletion.forced_skip_reasons,
    target,
    outerForced,
    "result-reasons",
    generation,
  );
  const stagedReasons = forcedReasons(
    staged.forced_skip_reasons,
    target,
    stagedForced,
    "staged-reasons",
    generation,
  );
  if (
    aggregates.forced !== outerForced ||
    aggregates.forced !== stagedForced ||
    aggregates.emitted !== outerEmitted ||
    aggregates.emitted !== stagedEmitted ||
    outerForced + outerEmitted !== target ||
    outerReasons.fewer !== work.fewerThanTwo ||
    outerReasons.timedOut !== work.timedOut ||
    outerReasons.proposalIncomplete !== work.proposalIncomplete ||
    stagedReasons.fewer !== work.fewerThanTwo ||
    stagedReasons.timedOut !== work.timedOut ||
    stagedReasons.proposalIncomplete !== work.proposalIncomplete ||
    !sameJson(manifest.completion, completionBinding) ||
    !sameJson(manifest.train, trainBinding)
  ) {
    fail("aggregate-bindings");
  }
}

function validateMilestoneAgainstWork(
  milestone: ReturnType<typeof validateMilestoneDocument>,
  prefix: WorkScan["prefixes"] extends ReadonlyMap<number, infer T> ? T : never,
): void {
  if (
    milestone.forced !== prefix.forced ||
    milestone.fewer !== prefix.fewerThanTwo ||
    milestone.timedOut !== prefix.timedOut ||
    milestone.proposalIncomplete !== prefix.proposalIncomplete ||
    milestone.emitted !== prefix.emitted ||
    milestone.work.bytes !== prefix.bytes ||
    milestone.work.sha256 !== prefix.sha256
  ) {
    fail("milestone-work-binding");
  }
}

function contract(
  value:
    | FloodgateStrengthFirstV8DownstreamProvenanceInput["testOnlyContract"]
    | FloodgateStrengthFirstV9DownstreamProvenanceInput["testOnlyContract"],
): Readonly<{
  target: number;
  milestones: readonly [number, number];
}> {
  if (value === undefined) {
    return { target: 24_000, milestones: [100, 500] };
  }
  const captured = exactRecord(
    value,
    ["parentTarget", "milestoneTargets"],
    "test-contract",
  );
  const target = integer(captured.parentTarget, 3, "test-contract");
  const targets = exactArray(captured.milestoneTargets, 2, "test-contract");
  const first = integer(targets[0], 1, "test-contract");
  const second = integer(targets[1], 1, "test-contract");
  if (!(first < second && second < target)) fail("test-contract");
  return { target, milestones: [first, second] };
}

async function verifyCore(
  input:
    | FloodgateStrengthFirstV8DownstreamProvenanceInput
    | FloodgateStrengthFirstV9DownstreamProvenanceInput,
  generation: TeacherGeneration,
): Promise<
  | FloodgateStrengthFirstV8DownstreamProvenanceSummary
  | FloodgateStrengthFirstV9DownstreamProvenanceSummary
> {
  if (!isRecord(input)) fail("input-shape");
  const { target, milestones } = contract(input.testOnlyContract);
  for (const value of [
    input.result,
    input.manifest,
    input.stagedResult,
    input.milestone100,
    input.milestone500,
    input.parentCompletion,
    input.train,
  ]) {
    if (!(value instanceof Uint8Array)) fail("serialized-input");
  }
  const result = parsePrettyJson(input.result, "result-json");
  const hasAuthenticated = input.authenticatedInput !== undefined;
  const hasRaw = input.authenticatedInputRaw !== undefined;
  if (hasAuthenticated === hasRaw) fail("input-source");
  const authenticated = hasRaw
    ? authenticatedInputFromRaw(
        result,
        input.authenticatedInputRaw as Uint8Array,
        generation,
      )
    : (input.authenticatedInput as Readonly<AuthenticatedFloodgateTrainingRows>);
  validateAuthenticatedInput(authenticated, target);
  const inputProjection = authenticatedInputProjection(authenticated);
  const envelope = validateResultEnvelope(
    result,
    input.expectedAssetAuthority,
    inputProjection,
    target,
    milestones,
    generation,
  );
  const revisionVerified =
    generation === "v8"
      ? await (
          input as FloodgateStrengthFirstV8DownstreamProvenanceInput
        ).verifyRevisionDescendant(
          envelope.revision,
          FLOODGATE_STRENGTH_FIRST_V8_MERGE_REVISION,
        )
      : await (
          input as FloodgateStrengthFirstV9DownstreamProvenanceInput
        ).verifyRevisionDescendant(
          envelope.revision,
          FLOODGATE_STRENGTH_FIRST_V9_MERGE_REVISION,
        );
  if (
    typeof input.verifyRevisionDescendant !== "function" ||
    revisionVerified !== true
  ) {
    fail("runner-revision-ancestry");
  }
  const manifest = parsePrettyJson(input.manifest, "manifest-json");
  const staged = parsePrettyJson(input.stagedResult, "staged-result-json");
  const milestoneFirstValue = parsePrettyJson(
    input.milestone100,
    "milestone-first-json",
  );
  const milestoneSecondValue = parsePrettyJson(
    input.milestone500,
    "milestone-second-json",
  );
  matchBytes(
    fileBinding(
      envelope.stagedOutputs.manifest,
      "manifest.json",
      "result-manifest-binding",
    ),
    input.manifest,
    "result-manifest-bytes",
  );
  matchBytes(
    fileBinding(
      envelope.stagedOutputs.staged_result,
      "staged-result.json",
      "result-staged-binding",
    ),
    input.stagedResult,
    "result-staged-bytes",
  );
  const resultMilestones = exactRecord(
    result.milestones,
    ["targets", "prefix_100", "prefix_500"],
    "result-milestones",
  );
  matchBytes(
    fileBinding(
      resultMilestones.prefix_100,
      `milestone-${milestones[0]}.json`,
      "result-prefix-first",
    ),
    input.milestone100,
    "result-prefix-first-bytes",
  );
  matchBytes(
    fileBinding(
      resultMilestones.prefix_500,
      `milestone-${milestones[1]}.json`,
      "result-prefix-second",
    ),
    input.milestone500,
    "result-prefix-second-bytes",
  );
  const manifestParts = validateManifest(
    manifest,
    envelope.revision,
    envelope.fingerprint,
    authenticated,
    input.expectedAssetAuthority,
    target,
    generation,
  );
  const stagedParts = validateStagedResult(
    staged,
    envelope.revision,
    envelope.fingerprint,
    target,
    envelope.stagedOutputs,
    input.manifest,
  );
  const firstMilestone = validateMilestoneDocument(
    milestoneFirstValue,
    milestones[0],
    envelope.revision,
    envelope.fingerprint,
    inputProjection,
    generation,
  );
  const secondMilestone = validateMilestoneDocument(
    milestoneSecondValue,
    milestones[1],
    envelope.revision,
    envelope.fingerprint,
    inputProjection,
    generation,
  );
  const work = await scanWork(
    input.work,
    authenticated,
    manifest,
    envelope.fingerprint,
    target,
    milestones,
    stagedParts.work,
    generation,
  );
  const aggregates = validateWorkAggregates(
    work,
    manifestParts,
    target,
    envelope.fingerprint,
    stagedParts.work,
    generation,
  );
  const firstPrefix = work.prefixes.get(milestones[0]);
  const secondPrefix = work.prefixes.get(milestones[1]);
  if (!firstPrefix || !secondPrefix) fail("work-prefix");
  validateMilestoneAgainstWork(firstMilestone, firstPrefix);
  validateMilestoneAgainstWork(secondMilestone, secondPrefix);
  const completion = await scanCompletion(
    input.parentCompletion,
    authenticated,
    work,
    stagedParts.completion,
  );
  const train = await scanTrain(
    input.train,
    work,
    completion.emittedIds,
    stagedParts.train,
  );
  validateAggregateBindings(
    envelope.completion,
    staged,
    manifestParts,
    aggregates,
    work,
    completion.binding,
    train,
    target,
    generation,
  );
  const common = {
    target_parents: target,
    emitted_parent_groups: aggregates.emitted,
    forced_parents_skipped: aggregates.forced,
    fewer_than_two_legal_moves: work.fewerThanTwo,
    search_timeout_no_label: work.timedOut,
    train_records: work.trainRecords,
    milestone_targets: Object.freeze([...milestones]) as readonly [
      number,
      number,
    ],
    local_only: true,
    network_requests: 0,
    cloud_services: 0,
    live_weight_changes: 0,
    training_only: true,
    private_identifiers_disclosed: false,
    private_digests_disclosed: false,
  } as const;
  return generation === "v8"
    ? Object.freeze({
        schema: FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_SCHEMA,
        status: FLOODGATE_STRENGTH_FIRST_V8_DOWNSTREAM_PROVENANCE_STATUS,
        ...common,
      })
    : Object.freeze({
        schema: FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_SCHEMA,
        status: FLOODGATE_STRENGTH_FIRST_V9_DOWNSTREAM_PROVENANCE_STATUS,
        ...common,
        proposal_incomplete_no_label: work.proposalIncomplete,
      });
}

export async function verifyFloodgateStrengthFirstV8DownstreamProvenance(
  input: FloodgateStrengthFirstV8DownstreamProvenanceInput,
): Promise<FloodgateStrengthFirstV8DownstreamProvenanceSummary> {
  try {
    return (await verifyCore(
      input,
      "v8",
    )) as FloodgateStrengthFirstV8DownstreamProvenanceSummary;
  } catch {
    throw new Error("v8-downstream-provenance-verification-failed");
  }
}

export async function verifyFloodgateStrengthFirstV9DownstreamProvenance(
  input: FloodgateStrengthFirstV9DownstreamProvenanceInput,
): Promise<FloodgateStrengthFirstV9DownstreamProvenanceSummary> {
  try {
    return (await verifyCore(
      input,
      "v9",
    )) as FloodgateStrengthFirstV9DownstreamProvenanceSummary;
  } catch {
    throw new Error("v9-downstream-provenance-verification-failed");
  }
}
