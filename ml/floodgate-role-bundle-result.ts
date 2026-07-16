/**
 * Byte-pinned execution receipt for the published label-free role bundle.
 *
 * This module does not make a playing-strength claim. It authenticates the
 * publish/independent-verify evidence and adds receipt-bound verification
 * around the existing full bundle verifier.
 */

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { isDeepStrictEqual, types as nodeUtilTypes } from "node:util";

import {
  FLOODGATE_GIT_COMMAND_PREFIX,
  FLOODGATE_GIT_EXECUTABLE,
  assertFloodgateGitExactCleanRevision,
  floodgateGitEnvironment,
} from "./floodgate-git";
import {
  FLOODGATE_ROLE_BUNDLE_GIT_BLOB_MAX_BYTES,
  FLOODGATE_ROLE_BUNDLE_SCHEMA,
  serializeFloodgateRoleBundleManifest,
  verifyExistingFloodgateRoleBundle,
  type FloodgateRoleBundleFileIdentity,
  type FloodgateRoleBundleManifest,
  type VerifiedFloodgateRoleBundle,
  type VerifyExistingFloodgateRoleBundleOptions,
} from "./floodgate-role-bundle";

export const FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA =
  "shogi-floodgate-role-bundle-result-v1" as const;
export const FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH =
  "ml/protocols/floodgate-q1-2026-role-bundle-result.json" as const;
export const FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES = 14_735 as const;
export const FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256 =
  "56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf" as const;
export const FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION =
  "313c7699e206332f9d380858d90d0326a0a1fd12" as const;
export const FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION =
  "0f3cadb76ec46eb82d5bc9623277525ce1d2252b" as const;
export const FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY = Object.freeze({
  path: "manifest.json",
  bytes: 7_202,
  sha256: "2bafc01f602c98ea63069e04b8d39c36470bcc6d31e1861fdaa83c6fc50e3cf9",
});

export const FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE = Object.freeze({
  publish: Object.freeze({
    status: Object.freeze({
      path: "ml/protocols/floodgate-q1-2026-role-bundle-publish-status.json",
      bytes: 632,
      sha256:
        "76dc8c7c25ed0f04f73a2735e2843fbf57dea9a78bf689a77a76144aa45ef5d2",
    }),
    output: Object.freeze({
      path: "ml/protocols/floodgate-q1-2026-role-bundle-publish-output.json",
      bytes: 10_126,
      sha256:
        "968148a3fc25cf351ccb2899d8303345e60cb83f57c8c228ace955fb7ddf276e",
    }),
    time: Object.freeze({
      path: "ml/protocols/floodgate-q1-2026-role-bundle-publish-time.log",
      bytes: 764,
      sha256:
        "0609f79275262fa30a4d8ed59fa188493be9df496380b4005cf46a1109855fc8",
    }),
  }),
  verify: Object.freeze({
    status: Object.freeze({
      path: "ml/protocols/floodgate-q1-2026-role-bundle-verify-status.json",
      bytes: 629,
      sha256:
        "87284839df6171b369762499e6f71b8585c71202ff6dc869afecb1454dadcb18",
    }),
    output: Object.freeze({
      path: "ml/protocols/floodgate-q1-2026-role-bundle-verify-output.json",
      bytes: 10_125,
      sha256:
        "b753f4e7213ab6019d5de423ccaca84cd14b3727e778c9835c155b878060526a",
    }),
    time: Object.freeze({
      path: "ml/protocols/floodgate-q1-2026-role-bundle-verify-time.log",
      bytes: 764,
      sha256:
        "70074923b2ab0a102de35e328234dbb81cd7736210b2bc03c8b932afacbbdbc4",
    }),
  }),
});

const REVISION_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const EXPECTED_ROOT_ENTRIES = Object.freeze([
  "fresh-final-holdout.protected-position-ids.txt",
  "fresh-final-holdout.raw.jsonl",
  "fresh-selection.protected-position-ids.txt",
  "fresh-selection.raw.jsonl",
  "manifest.json",
  "replay-excluded-position-ids.txt",
  "replay-exclusion-receipt.json",
  "training.protected-position-ids.txt",
  "training.raw.jsonl",
]);

type RoleBundleExecutionMode =
  keyof typeof FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE;

export interface FloodgateRoleBundleExecutionAttempt {
  readonly sequence: number;
  readonly mode: RoleBundleExecutionMode;
  readonly outcome: "pass";
  readonly cli_schema: "shogi-floodgate-role-bundle-cli-output-v2";
  readonly node: "v22.13.0";
  readonly producer_revision: string;
  readonly verifier_revision: string;
  readonly started_at: string;
  readonly finished_at: string;
  readonly elapsed_ms: number;
  readonly os_time: {
    readonly wall_seconds: number;
    readonly user_cpu_seconds: number;
    readonly system_cpu_seconds: number;
    readonly maximum_resident_set_size_bytes: number;
    readonly peak_memory_footprint_bytes: number;
  };
  readonly process_exit_code: 0;
  readonly manifest_completion_marker: "valid";
  readonly evidence: {
    readonly status: FloodgateRoleBundleFileIdentity;
    readonly output: FloodgateRoleBundleFileIdentity;
    readonly time: FloodgateRoleBundleFileIdentity;
  };
}

export interface FloodgateRoleBundleResultReceipt {
  readonly schema: typeof FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA;
  readonly status: "complete-label-free-role-bundle";
  readonly claim_boundary: "integrity-only-not-playing-strength-evidence";
  readonly manifest: {
    readonly identity: FloodgateRoleBundleFileIdentity;
    readonly value: Readonly<FloodgateRoleBundleManifest>;
  };
  readonly execution: {
    readonly attempts: readonly [
      FloodgateRoleBundleExecutionAttempt,
      FloodgateRoleBundleExecutionAttempt,
    ];
  };
  readonly post_run_audit: Readonly<Record<string, unknown>>;
}

export interface VerifiedPinnedFloodgateRoleBundle extends VerifiedFloodgateRoleBundle {
  readonly result: Readonly<FloodgateRoleBundleResultReceipt>;
}

interface ArtifactSnapshot {
  readonly bytes: Uint8Array;
  readonly identity: string;
}

type SnapshotReader = (artifactPath: string) => Promise<ArtifactSnapshot>;
type GitBlobReader = (
  revision: string,
  artifactPath: string,
) => Promise<Uint8Array>;
type RevisionAncestryCheck = (
  ancestor: string,
  descendant: string,
) => Promise<boolean>;

interface PinnedVerificationDependencies {
  readonly readTrackedArtifact: SnapshotReader;
  readonly verifyBundle: () => Promise<Readonly<VerifiedFloodgateRoleBundle>>;
  readonly readGitBlob: GitBlobReader;
  readonly isAncestor: RevisionAncestryCheck;
}

interface PinnedGitClosureDependencies {
  readonly readTrackedArtifact: SnapshotReader;
  readonly readGitBlob: GitBlobReader;
  readonly isAncestor: RevisionAncestryCheck;
}

interface PinnedGitClosureBoundaryDependencies extends PinnedGitClosureDependencies {
  readonly assertExactCleanRevision: (
    repositoryRoot: string,
    verifierRevision: string,
  ) => Promise<void>;
}

interface StartedPinnedVerification {
  readonly verifierRevision: string;
  readonly before: ReadonlyMap<string, ArtifactSnapshot>;
  readonly result: Readonly<FloodgateRoleBundleResultReceipt>;
}

function fail(message: string): never {
  throw new Error(`invalid Floodgate role-bundle result: ${message}`);
}

function sha256Hex(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (value !== null && typeof value === "object") {
    const object = value as object;
    if (!seen.has(object)) {
      seen.add(object);
      for (const key of Reflect.ownKeys(object)) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor && "value" in descriptor) {
          deepFreeze(descriptor.value, seen);
        }
      }
      Object.freeze(object);
    }
  }
  return value;
}

function strictObject(value: unknown, label: string): Record<string, unknown> {
  if (
    nodeUtilTypes.isProxy(value) ||
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    fail(`${label} must be a non-Proxy plain object without symbol keys`);
  }
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !("value" in descriptor) || !descriptor.enumerable) {
      fail(`${label}.${key} must be an enumerable data property`);
    }
  }
  return value as Record<string, unknown>;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    fail(`${label} keys are not exact`);
  }
}

function fatalUtf8(bytes: Uint8Array, label: string): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    return fail(`${label} is not fatal-valid UTF-8`);
  }
  if (text.startsWith("\ufeff") || text.includes("\0") || text.includes("\r")) {
    fail(`${label} contains forbidden framing`);
  }
  return text;
}

function parsePrettyJson(bytes: Uint8Array, label: string): unknown {
  const text = fatalUtf8(bytes, label);
  if (!text.endsWith("\n") || text.endsWith("\n\n")) {
    fail(`${label} must have exactly one final LF`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(0, -1)) as unknown;
  } catch {
    return fail(`${label} is not valid JSON`);
  }
  if (`${JSON.stringify(parsed, null, 2)}\n` !== text) {
    fail(`${label} is not canonical pretty JSON`);
  }
  return deepFreeze(parsed);
}

function fileIdentity(
  value: unknown,
  label: string,
): Readonly<FloodgateRoleBundleFileIdentity> {
  const identity = strictObject(value, label);
  exactKeys(identity, ["bytes", "path", "sha256"], label);
  if (
    typeof identity.path !== "string" ||
    identity.path.length === 0 ||
    identity.path.includes("\0") ||
    path.posix.isAbsolute(identity.path) ||
    path.posix.normalize(identity.path) !== identity.path ||
    identity.path === "." ||
    identity.path.startsWith("../")
  ) {
    fail(`${label}.path is not repository-relative`);
  }
  if (
    typeof identity.bytes !== "number" ||
    !Number.isSafeInteger(identity.bytes) ||
    identity.bytes < 0
  ) {
    fail(`${label}.bytes is invalid`);
  }
  if (typeof identity.sha256 !== "string" || !SHA256_RE.test(identity.sha256)) {
    fail(`${label}.sha256 is invalid`);
  }
  return Object.freeze({
    path: identity.path,
    bytes: identity.bytes,
    sha256: identity.sha256,
  });
}

function finiteNonnegative(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${label} must be a finite nonnegative number`);
  }
  return value;
}

function safeNonnegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a nonnegative safe integer`);
  }
  return value;
}

function fullRevision(value: unknown, label: string): string {
  if (typeof value !== "string" || !REVISION_RE.test(value)) {
    fail(`${label} is not a full lowercase revision`);
  }
  return value;
}

function assertNoAbsolutePaths(value: unknown, label: string): void {
  if (typeof value === "string") {
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value)) {
      fail(`${label} contains an absolute path`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertNoAbsolutePaths(entry, `${label}[${index}]`),
    );
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      assertNoAbsolutePaths(entry, `${label}.${key}`);
    }
  }
}

function parseAttempt(
  value: unknown,
  expectedMode: RoleBundleExecutionMode,
  expectedSequence: number,
): Readonly<FloodgateRoleBundleExecutionAttempt> {
  const label = `execution attempt ${expectedSequence}`;
  const attempt = strictObject(value, label);
  exactKeys(
    attempt,
    [
      "cli_schema",
      "elapsed_ms",
      "evidence",
      "finished_at",
      "manifest_completion_marker",
      "mode",
      "node",
      "os_time",
      "outcome",
      "process_exit_code",
      "producer_revision",
      "sequence",
      "started_at",
      "verifier_revision",
    ],
    label,
  );
  if (
    attempt.sequence !== expectedSequence ||
    attempt.mode !== expectedMode ||
    attempt.outcome !== "pass" ||
    attempt.cli_schema !== "shogi-floodgate-role-bundle-cli-output-v2" ||
    attempt.node !== "v22.13.0" ||
    attempt.process_exit_code !== 0 ||
    attempt.manifest_completion_marker !== "valid"
  ) {
    fail(`${label} fixed semantics differ`);
  }
  const producerRevision = fullRevision(
    attempt.producer_revision,
    `${label}.producer_revision`,
  );
  const verifierRevision = fullRevision(
    attempt.verifier_revision,
    `${label}.verifier_revision`,
  );
  if (
    producerRevision !== FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION ||
    verifierRevision !== FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION
  ) {
    fail(`${label} revisions are not pinned to the audited execution`);
  }
  if (
    typeof attempt.started_at !== "string" ||
    typeof attempt.finished_at !== "string"
  ) {
    fail(`${label} timestamps are invalid`);
  }
  const started = Date.parse(attempt.started_at);
  const finished = Date.parse(attempt.finished_at);
  const elapsedMs = safeNonnegativeInteger(
    attempt.elapsed_ms,
    `${label}.elapsed_ms`,
  );
  if (!Number.isFinite(started) || !Number.isFinite(finished)) {
    fail(`${label} timestamps are not parseable`);
  }
  if (finished - started !== elapsedMs) {
    fail(`${label} elapsed time does not match its UTC timestamps`);
  }
  const osTime = strictObject(attempt.os_time, `${label}.os_time`);
  exactKeys(
    osTime,
    [
      "maximum_resident_set_size_bytes",
      "peak_memory_footprint_bytes",
      "system_cpu_seconds",
      "user_cpu_seconds",
      "wall_seconds",
    ],
    `${label}.os_time`,
  );
  const wall = finiteNonnegative(
    osTime.wall_seconds,
    `${label}.os_time.wall_seconds`,
  );
  if (Math.abs(wall * 1_000 - elapsedMs) > 5_000) {
    fail(`${label} OS wall time is inconsistent with UTC elapsed time`);
  }
  finiteNonnegative(
    osTime.user_cpu_seconds,
    `${label}.os_time.user_cpu_seconds`,
  );
  finiteNonnegative(
    osTime.system_cpu_seconds,
    `${label}.os_time.system_cpu_seconds`,
  );
  safeNonnegativeInteger(
    osTime.maximum_resident_set_size_bytes,
    `${label}.os_time.maximum_resident_set_size_bytes`,
  );
  safeNonnegativeInteger(
    osTime.peak_memory_footprint_bytes,
    `${label}.os_time.peak_memory_footprint_bytes`,
  );
  const evidence = strictObject(attempt.evidence, `${label}.evidence`);
  exactKeys(evidence, ["output", "status", "time"], `${label}.evidence`);
  const parsedEvidence = Object.freeze({
    status: fileIdentity(evidence.status, `${label}.evidence.status`),
    output: fileIdentity(evidence.output, `${label}.evidence.output`),
    time: fileIdentity(evidence.time, `${label}.evidence.time`),
  });
  if (
    !isDeepStrictEqual(
      parsedEvidence,
      FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE[expectedMode],
    )
  ) {
    fail(`${label} evidence identities are not pinned`);
  }
  return attempt as unknown as Readonly<FloodgateRoleBundleExecutionAttempt>;
}

function validatePostRunAudit(
  value: unknown,
): Readonly<Record<string, unknown>> {
  const audit = strictObject(value, "post_run_audit");
  exactKeys(
    audit,
    [
      "all_entries_mode_octal",
      "all_entries_regular_non_symlink_files",
      "auditor_corrections",
      "bundle_filesystem_closure_unchanged",
      "exact_root_entries",
      "independent_rebuild_and_complete_byte_verification",
      "manifest_published_last",
      "publish_and_verify_manifest_equal",
      "root_mode_octal",
      "source_role_lock_closure_unchanged",
    ],
    "post_run_audit",
  );
  if (
    audit.publish_and_verify_manifest_equal !== true ||
    audit.root_mode_octal !== "0700" ||
    audit.all_entries_mode_octal !== "0600" ||
    audit.all_entries_regular_non_symlink_files !== true ||
    audit.manifest_published_last !== true ||
    audit.independent_rebuild_and_complete_byte_verification !== "pass" ||
    audit.source_role_lock_closure_unchanged !== true ||
    audit.bundle_filesystem_closure_unchanged !== true ||
    !isDeepStrictEqual(audit.exact_root_entries, EXPECTED_ROOT_ENTRIES)
  ) {
    fail("post_run_audit does not record the completed independent audit");
  }
  if (!Array.isArray(audit.auditor_corrections)) {
    fail("post_run_audit.auditor_corrections must be an array");
  }
  if (audit.auditor_corrections.length !== 2) {
    fail("post_run_audit must retain both auditor attempts");
  }
  const first = strictObject(
    audit.auditor_corrections[0],
    "post_run_audit.auditor_corrections[0]",
  );
  const second = strictObject(
    audit.auditor_corrections[1],
    "post_run_audit.auditor_corrections[1]",
  );
  for (const [index, correction] of [first, second].entries()) {
    exactKeys(
      correction,
      ["outcome", "sequence", "summary"],
      `post_run_audit.auditor_corrections[${index}]`,
    );
    if (
      correction.sequence !== index + 1 ||
      typeof correction.summary !== "string" ||
      correction.summary.length === 0
    ) {
      fail(`post_run_audit.auditor_corrections[${index}] is invalid`);
    }
  }
  if (
    first.outcome !== "invalid-auditor-expectation" ||
    second.outcome !== "pass"
  ) {
    fail("post_run_audit auditor outcomes are invalid");
  }
  return audit;
}

function parseRoleBundleResultReceipt(
  bytes: Uint8Array,
): Readonly<FloodgateRoleBundleResultReceipt> {
  const candidate = parsePrettyJson(bytes, "role-bundle result receipt");
  assertNoAbsolutePaths(candidate, "role-bundle result receipt");
  const result = strictObject(candidate, "role-bundle result receipt");
  exactKeys(
    result,
    [
      "claim_boundary",
      "execution",
      "manifest",
      "post_run_audit",
      "schema",
      "status",
    ],
    "role-bundle result receipt",
  );
  if (
    result.schema !== FLOODGATE_ROLE_BUNDLE_RESULT_SCHEMA ||
    result.status !== "complete-label-free-role-bundle" ||
    result.claim_boundary !== "integrity-only-not-playing-strength-evidence"
  ) {
    fail("role-bundle result receipt schema/status/boundary is unsupported");
  }
  const manifest = strictObject(result.manifest, "result.manifest");
  exactKeys(manifest, ["identity", "value"], "result.manifest");
  const identity = fileIdentity(manifest.identity, "result.manifest.identity");
  if (!isDeepStrictEqual(identity, FLOODGATE_ROLE_BUNDLE_MANIFEST_IDENTITY)) {
    fail("result manifest identity is not pinned");
  }
  const manifestValue = strictObject(manifest.value, "result.manifest.value");
  if (
    manifestValue.schema !== FLOODGATE_ROLE_BUNDLE_SCHEMA ||
    manifestValue.status !== "complete-label-free-role-bundle"
  ) {
    fail("result embedded manifest schema/status differs");
  }
  const provenance = strictObject(
    manifestValue.provenance,
    "result.manifest.value.provenance",
  );
  if (
    provenance.teacher_or_candidate_scores_read !== false ||
    provenance.labeled_selection_read !== false ||
    provenance.labeled_final_holdout_read !== false
  ) {
    fail("result embedded manifest crosses the label-free boundary");
  }
  const pipeline = strictObject(
    manifestValue.pipeline,
    "result.manifest.value.pipeline",
  );
  if (
    pipeline.source_revision !==
      FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION ||
    pipeline.tracked_tree_clean !== true
  ) {
    fail("result embedded manifest producer is not pinned");
  }
  const execution = strictObject(result.execution, "result.execution");
  exactKeys(execution, ["attempts"], "result.execution");
  if (!Array.isArray(execution.attempts) || execution.attempts.length !== 2) {
    fail("result.execution.attempts must contain publish then verify");
  }
  const publish = parseAttempt(execution.attempts[0], "publish", 1);
  const verify = parseAttempt(execution.attempts[1], "verify", 2);
  if (Date.parse(verify.started_at) < Date.parse(publish.finished_at)) {
    fail("independent verify began before publish completed");
  }
  validatePostRunAudit(result.post_run_audit);
  return candidate as Readonly<FloodgateRoleBundleResultReceipt>;
}

export function parsePinnedFloodgateRoleBundleResultReceiptCoreForTests(
  bytes: Uint8Array,
): Readonly<FloodgateRoleBundleResultReceipt> {
  if (
    bytes.byteLength !== FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES ||
    sha256Hex(bytes) !== FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_SHA256
  ) {
    fail("role-bundle result receipt identity is not pinned");
  }
  return parseRoleBundleResultReceipt(bytes);
}

export function projectFloodgateRoleBundleResultBindingCoreForTests(
  candidate: unknown,
): Readonly<Record<string, unknown>> {
  const result = strictObject(candidate, "role-bundle result projection");
  return deepFreeze(
    JSON.parse(JSON.stringify(result)) as Record<string, unknown>,
  );
}

export function assertFloodgateRoleBundleResultProjectionCoreForTests(
  candidate: unknown,
  expected: unknown,
): void {
  if (!isDeepStrictEqual(candidate, expected)) {
    fail("role-bundle result projection does not match expected evidence");
  }
}

function assertIdentityBytes(
  identity: Readonly<FloodgateRoleBundleFileIdentity>,
  bytes: Uint8Array,
  label: string,
): void {
  if (
    bytes.byteLength !== identity.bytes ||
    sha256Hex(bytes) !== identity.sha256
  ) {
    fail(`${label} identity differs`);
  }
}

function parseTimeEvidence(bytes: Uint8Array, label: string) {
  const text = fatalUtf8(bytes, label);
  const required = (expression: RegExp, field: string): number => {
    const matches = [...text.matchAll(expression)];
    if (matches.length !== 1)
      fail(`${label} ${field} is missing or duplicated`);
    const value = Number(matches[0][1]);
    if (!Number.isFinite(value) || value < 0) {
      fail(`${label} ${field} is invalid`);
    }
    return value;
  };
  return Object.freeze({
    wall_seconds: required(/^real ([0-9]+(?:\.[0-9]+)?)$/gm, "real"),
    user_cpu_seconds: required(/^user ([0-9]+(?:\.[0-9]+)?)$/gm, "user"),
    system_cpu_seconds: required(/^sys ([0-9]+(?:\.[0-9]+)?)$/gm, "sys"),
    maximum_resident_set_size_bytes: required(
      /^\s*([0-9]+)\s+maximum resident set size$/gm,
      "maximum resident set size",
    ),
    peak_memory_footprint_bytes: required(
      /^\s*([0-9]+)\s+peak memory footprint$/gm,
      "peak memory footprint",
    ),
  });
}

function validateExecutionEvidence(
  result: Readonly<FloodgateRoleBundleResultReceipt>,
  bytesByPath: ReadonlyMap<string, Uint8Array>,
): void {
  for (const attempt of result.execution.attempts) {
    const expected = FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE[attempt.mode];
    const statusBytes = bytesByPath.get(expected.status.path);
    const outputBytes = bytesByPath.get(expected.output.path);
    const timeBytes = bytesByPath.get(expected.time.path);
    if (!statusBytes || !outputBytes || !timeBytes) {
      fail(`${attempt.mode} evidence is incomplete`);
    }
    assertIdentityBytes(expected.status, statusBytes, `${attempt.mode} status`);
    assertIdentityBytes(expected.output, outputBytes, `${attempt.mode} output`);
    assertIdentityBytes(expected.time, timeBytes, `${attempt.mode} time`);
    const status = strictObject(
      parsePrettyJson(statusBytes, `${attempt.mode} status`),
      `${attempt.mode} status`,
    );
    if (
      status.schema !== "shogi-role-bundle-operation-status-v1" ||
      status.operation !== attempt.mode ||
      status.started_at !== attempt.started_at ||
      status.finished_at !== attempt.finished_at ||
      status.process_exit_code !== attempt.process_exit_code ||
      status.verifier_revision !== attempt.verifier_revision
    ) {
      fail(`${attempt.mode} status does not bind the result attempt`);
    }
    const output = strictObject(
      parsePrettyJson(outputBytes, `${attempt.mode} output`),
      `${attempt.mode} output`,
    );
    if (
      output.schema !== attempt.cli_schema ||
      output.mode !== attempt.mode ||
      output.producer_revision !== attempt.producer_revision ||
      output.verifier_revision !== attempt.verifier_revision ||
      !isDeepStrictEqual(output.manifest, result.manifest.value)
    ) {
      fail(`${attempt.mode} output does not bind the result manifest`);
    }
    const timing = parseTimeEvidence(timeBytes, `${attempt.mode} time`);
    if (!isDeepStrictEqual(timing, attempt.os_time)) {
      fail(`${attempt.mode} OS timing does not bind the result attempt`);
    }
  }
}

export function assertFloodgateRoleBundleExecutionEvidenceCoreForTests(
  result: Readonly<FloodgateRoleBundleResultReceipt>,
  bytesByPath: ReadonlyMap<string, Uint8Array>,
): void {
  validateExecutionEvidence(result, bytesByPath);
}

function assertResultBindsVerifiedBundle(
  result: Readonly<FloodgateRoleBundleResultReceipt>,
  verified: Readonly<VerifiedFloodgateRoleBundle>,
): void {
  const manifestText = serializeFloodgateRoleBundleManifest(verified.manifest);
  const identity = Object.freeze({
    path: "manifest.json",
    bytes: Buffer.byteLength(manifestText),
    sha256: sha256Hex(manifestText),
  });
  if (
    verified.manifestText !== manifestText ||
    !isDeepStrictEqual(identity, result.manifest.identity) ||
    !isDeepStrictEqual(verified.manifest, result.manifest.value) ||
    verified.producerRevision !==
      FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION
  ) {
    fail("verified bundle does not match the tracked result receipt");
  }
}

export function assertFloodgateRoleBundleResultBindingCoreForTests(
  result: Readonly<FloodgateRoleBundleResultReceipt>,
  verified: Readonly<VerifiedFloodgateRoleBundle>,
): void {
  assertResultBindsVerifiedBundle(result, verified);
}

function pinnedArtifactPaths(): readonly string[] {
  return Object.freeze([
    FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
    ...Object.values(FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE).flatMap(
      (attempt) => Object.values(attempt).map((identity) => identity.path),
    ),
  ]);
}

function pinnedArtifactExpectedBytes(artifactPath: string): number {
  if (artifactPath === FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH) {
    return FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_BYTES;
  }
  for (const attempt of Object.values(
    FLOODGATE_ROLE_BUNDLE_EXECUTION_EVIDENCE,
  )) {
    for (const identity of Object.values(attempt)) {
      if (identity.path === artifactPath) return identity.bytes;
    }
  }
  fail(`tracked artifact is not pinned: ${artifactPath}`);
}

async function readAllSnapshots(
  read: SnapshotReader,
): Promise<ReadonlyMap<string, ArtifactSnapshot>> {
  const output = new Map<string, ArtifactSnapshot>();
  for (const artifactPath of pinnedArtifactPaths()) {
    const snapshot = await read(artifactPath);
    if (
      nodeUtilTypes.isProxy(snapshot) ||
      !snapshot ||
      typeof snapshot !== "object" ||
      !(snapshot.bytes instanceof Uint8Array) ||
      typeof snapshot.identity !== "string"
    ) {
      fail(`tracked artifact snapshot is invalid: ${artifactPath}`);
    }
    output.set(
      artifactPath,
      Object.freeze({
        bytes: new Uint8Array(snapshot.bytes),
        identity: snapshot.identity,
      }),
    );
  }
  return output;
}

function sameSnapshots(
  before: ReadonlyMap<string, ArtifactSnapshot>,
  after: ReadonlyMap<string, ArtifactSnapshot>,
): boolean {
  if (before.size !== after.size) return false;
  for (const [artifactPath, left] of before) {
    const right = after.get(artifactPath);
    if (
      !right ||
      left.identity !== right.identity ||
      !Buffer.from(left.bytes).equals(Buffer.from(right.bytes))
    ) {
      return false;
    }
  }
  return true;
}

async function startPinnedVerificationCore(
  verifierRevision: string,
  dependencies: PinnedGitClosureDependencies,
): Promise<Readonly<StartedPinnedVerification>> {
  fullRevision(verifierRevision, "current verifier revision");
  const before = await readAllSnapshots(dependencies.readTrackedArtifact);
  const resultBytes = before.get(
    FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH,
  )!.bytes;
  const result =
    parsePinnedFloodgateRoleBundleResultReceiptCoreForTests(resultBytes);
  const evidence = new Map<string, Uint8Array>();
  for (const [artifactPath, snapshot] of before) {
    if (artifactPath !== FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PATH) {
      evidence.set(artifactPath, snapshot.bytes);
    }
  }
  validateExecutionEvidence(result, evidence);
  return Object.freeze({ verifierRevision, before, result });
}

async function finalizePinnedVerificationCore(
  started: Readonly<StartedPinnedVerification>,
  dependencies: PinnedGitClosureDependencies,
): Promise<void> {
  const after = await readAllSnapshots(dependencies.readTrackedArtifact);
  if (!sameSnapshots(started.before, after)) {
    fail("tracked result/evidence changed during bundle verification");
  }
  for (const [artifactPath, snapshot] of started.before) {
    const blob = await dependencies.readGitBlob(
      FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
      artifactPath,
    );
    if (!Buffer.from(blob).equals(Buffer.from(snapshot.bytes))) {
      fail(`tracked result/evidence differs from Git: ${artifactPath}`);
    }
  }
  if (
    !(await dependencies.isAncestor(
      FLOODGATE_ROLE_BUNDLE_INDEPENDENT_VERIFIER_REVISION,
      FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
    ))
  ) {
    fail("receipt producer does not descend from the independent verifier");
  }
  if (
    !(await dependencies.isAncestor(
      FLOODGATE_ROLE_BUNDLE_RESULT_RECEIPT_PRODUCER_REVISION,
      started.verifierRevision,
    ))
  ) {
    fail("current verifier does not descend from the receipt producer");
  }
}

async function runPinnedVerificationCore(
  verifierRevision: string,
  dependencies: PinnedVerificationDependencies,
): Promise<Readonly<VerifiedPinnedFloodgateRoleBundle>> {
  const started = await startPinnedVerificationCore(
    verifierRevision,
    dependencies,
  );
  const verified = await dependencies.verifyBundle();
  if (verified.verifierRevision !== verifierRevision) {
    fail("bundle verifier revision differs from the requested revision");
  }
  await finalizePinnedVerificationCore(started, dependencies);
  assertResultBindsVerifiedBundle(started.result, verified);
  return deepFreeze({ ...verified, result: started.result });
}

export async function runPinnedFloodgateRoleBundleVerificationCoreForTests(
  verifierRevision: string,
  dependencies: PinnedVerificationDependencies,
): Promise<Readonly<VerifiedPinnedFloodgateRoleBundle>> {
  return runPinnedVerificationCore(verifierRevision, dependencies);
}

function snapshotIdentity(stat: fs.BigIntStats): string {
  return JSON.stringify({
    dev: String(stat.dev),
    ino: String(stat.ino),
    mode: String(stat.mode),
    nlink: String(stat.nlink),
    uid: String(stat.uid),
    gid: String(stat.gid),
    rdev: String(stat.rdev),
    size: String(stat.size),
    mtime_ns: String(stat.mtimeNs),
    ctime_ns: String(stat.ctimeNs),
    birthtime_ns: String(stat.birthtimeNs),
  });
}

async function readTrackedSnapshot(
  repositoryRoot: string,
  artifactPath: string,
): Promise<ArtifactSnapshot> {
  const expectedBytes = pinnedArtifactExpectedBytes(artifactPath);
  const absolute = path.join(repositoryRoot, artifactPath);
  if (
    path.resolve(absolute) !== absolute ||
    path.relative(repositoryRoot, absolute).startsWith("..")
  ) {
    fail(`tracked artifact escapes repository: ${artifactPath}`);
  }
  if ((await fs.promises.realpath(absolute)) !== absolute) {
    fail(`tracked artifact traverses a symbolic link: ${artifactPath}`);
  }
  const noFollow = fs.constants.O_NOFOLLOW;
  const nonblock = fs.constants.O_NONBLOCK;
  if (typeof noFollow !== "number" || typeof nonblock !== "number") {
    fail("production requires O_NOFOLLOW/O_NONBLOCK");
  }
  const handle = await fs.promises.open(
    absolute,
    fs.constants.O_RDONLY | noFollow | nonblock,
  );
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile())
      fail(`tracked artifact is not regular: ${artifactPath}`);
    if (before.size !== BigInt(expectedBytes)) {
      fail(`tracked artifact size differs: ${artifactPath}`);
    }
    const bytes = new Uint8Array(expectedBytes);
    let offset = 0;
    while (offset < bytes.byteLength) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.byteLength - offset,
        null,
      );
      if (bytesRead === 0) {
        fail(`tracked artifact shortened while read: ${artifactPath}`);
      }
      offset += bytesRead;
    }
    const extra = new Uint8Array(1);
    if ((await handle.read(extra, 0, 1, null)).bytesRead !== 0) {
      fail(`tracked artifact grew while read: ${artifactPath}`);
    }
    const after = await handle.stat({ bigint: true });
    const current = await fs.promises.lstat(absolute, { bigint: true });
    if (
      !after.isFile() ||
      current.isSymbolicLink() ||
      !current.isFile() ||
      snapshotIdentity(before) !== snapshotIdentity(after) ||
      snapshotIdentity(after) !== snapshotIdentity(current) ||
      BigInt(bytes.byteLength) !== after.size
    ) {
      fail(`tracked artifact changed while read: ${artifactPath}`);
    }
    return Object.freeze({ bytes, identity: snapshotIdentity(after) });
  } finally {
    await handle.close();
  }
}

/** Test-only direct exercise of the bounded tracked-artifact read boundary. */
export async function readPinnedFloodgateRoleBundleArtifactSnapshotCoreForTests(
  repositoryRoot: string,
  artifactPath: string,
): Promise<Readonly<{ bytes: Uint8Array; identity: string }>> {
  return readTrackedSnapshot(repositoryRoot, artifactPath);
}

async function readGitBlob(
  repositoryRoot: string,
  revision: string,
  artifactPath: string,
): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    execFileCallback(
      FLOODGATE_GIT_EXECUTABLE,
      [
        ...FLOODGATE_GIT_COMMAND_PREFIX,
        "cat-file",
        "blob",
        `${revision}:${artifactPath}`,
      ],
      {
        cwd: repositoryRoot,
        encoding: null,
        env: floodgateGitEnvironment(),
        maxBuffer: FLOODGATE_ROLE_BUNDLE_GIT_BLOB_MAX_BYTES,
      },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        if (typeof stdout === "string") {
          reject(new Error("Git blob reader unexpectedly decoded stdout"));
          return;
        }
        resolve(new Uint8Array(stdout));
      },
    );
  });
}

async function isGitAncestor(
  repositoryRoot: string,
  ancestor: string,
  descendant: string,
): Promise<boolean> {
  return await new Promise<boolean>((resolve, reject) => {
    execFileCallback(
      FLOODGATE_GIT_EXECUTABLE,
      [
        ...FLOODGATE_GIT_COMMAND_PREFIX,
        "merge-base",
        "--is-ancestor",
        ancestor,
        descendant,
      ],
      {
        cwd: repositoryRoot,
        env: floodgateGitEnvironment(),
      },
      (error) => {
        try {
          resolve(interpretGitIsAncestorExitCoreForTests(error));
        } catch (cause) {
          reject(cause);
        }
      },
    );
  });
}

/** Interpret only Git's documented non-ancestor exit as a negative result. */
export function interpretGitIsAncestorExitCoreForTests(
  error: Readonly<{ code?: string | number }> | null,
): boolean {
  if (error === null) return true;
  if (error.code === 1) return false;
  throw error;
}

function pinnedGitClosureOptions(
  optionsInput: unknown,
): Readonly<{ repositoryRoot: string; verifierRevision: string }> {
  const candidate = strictObject(optionsInput, "receipt Git-closure options");
  exactKeys(
    candidate,
    ["repositoryRoot", "verifierRevision"],
    "receipt Git-closure options",
  );
  const repositoryRoot = candidate.repositoryRoot;
  if (
    typeof repositoryRoot !== "string" ||
    repositoryRoot.includes("\0") ||
    path.resolve(repositoryRoot) !== repositoryRoot
  ) {
    fail("receipt Git-closure repository root is not canonical");
  }
  const verifierRevision = fullRevision(
    candidate.verifierRevision,
    "receipt Git-closure verifier revision",
  );
  return Object.freeze({ repositoryRoot, verifierRevision });
}

async function assertPinnedGitClosureCore(
  optionsInput: unknown,
  dependencies: PinnedGitClosureBoundaryDependencies,
): Promise<void> {
  const options = pinnedGitClosureOptions(optionsInput);
  await dependencies.assertExactCleanRevision(
    options.repositoryRoot,
    options.verifierRevision,
  );
  const started = await startPinnedVerificationCore(
    options.verifierRevision,
    dependencies,
  );
  await finalizePinnedVerificationCore(started, dependencies);
  await dependencies.assertExactCleanRevision(
    options.repositoryRoot,
    options.verifierRevision,
  );
}

export async function assertPinnedFloodgateRoleBundleReceiptGitClosureCoreForTests(
  optionsInput: unknown,
  dependencies: PinnedGitClosureBoundaryDependencies,
): Promise<void> {
  await assertPinnedGitClosureCore(optionsInput, dependencies);
}

/**
 * Authenticate a Git-clean (under standard ignore rules), exact-revision
 * dedicated verifier tracked source tree; compare the tracked result receipt
 * and its six execution-evidence files with their producer blobs; and prove
 * fixed ancestry. This does not open external role-bundle output files or
 * authorize a gate.
 */
export async function assertPinnedFloodgateRoleBundleReceiptGitClosure(
  options: Readonly<{ repositoryRoot: string; verifierRevision: string }>,
): Promise<void> {
  const canonical = pinnedGitClosureOptions(options);
  await assertPinnedGitClosureCore(canonical, {
    assertExactCleanRevision: assertFloodgateGitExactCleanRevision,
    readTrackedArtifact: (artifactPath) =>
      readTrackedSnapshot(canonical.repositoryRoot, artifactPath),
    readGitBlob: (revision, artifactPath) =>
      readGitBlob(canonical.repositoryRoot, revision, artifactPath),
    isAncestor: (ancestor, descendant) =>
      isGitAncestor(canonical.repositoryRoot, ancestor, descendant),
  });
}

/**
 * Receipt-bound verification only. The underlying verifier remains
 * receipt-independent so a historical bundle can still be reproduced without
 * a self-reference. This function does not hold a training-row file descriptor
 * after it returns and therefore does not authorize reopening training.raw by
 * pathname. The FD-held callback consumer is a separate, required boundary.
 */
export async function verifyPinnedFloodgateRoleBundleReceipt(
  optionsInput: VerifyExistingFloodgateRoleBundleOptions,
): Promise<Readonly<VerifiedPinnedFloodgateRoleBundle>> {
  const candidate = strictObject(optionsInput, "receipt-verification options");
  exactKeys(
    candidate,
    [
      "legacyProtectedPositionIdsPath",
      "outputRoot",
      "rawLockRoot",
      "repositoryRoot",
      "roleLockRoot",
      "verifierRevision",
    ],
    "receipt-verification options",
  );
  const options = Object.freeze({
    repositoryRoot: candidate.repositoryRoot,
    verifierRevision: candidate.verifierRevision,
    rawLockRoot: candidate.rawLockRoot,
    roleLockRoot: candidate.roleLockRoot,
    legacyProtectedPositionIdsPath: candidate.legacyProtectedPositionIdsPath,
    outputRoot: candidate.outputRoot,
  }) as Readonly<VerifyExistingFloodgateRoleBundleOptions>;
  if (
    typeof options.repositoryRoot !== "string" ||
    path.resolve(options.repositoryRoot) !== options.repositoryRoot ||
    typeof options.verifierRevision !== "string" ||
    !REVISION_RE.test(options.verifierRevision)
  ) {
    fail("receipt-verification options are not canonical");
  }
  return runPinnedVerificationCore(options.verifierRevision, {
    readTrackedArtifact: (artifactPath) =>
      readTrackedSnapshot(options.repositoryRoot, artifactPath),
    verifyBundle: () => verifyExistingFloodgateRoleBundle(options),
    readGitBlob: (revision, artifactPath) =>
      readGitBlob(options.repositoryRoot, revision, artifactPath),
    isAncestor: (ancestor, descendant) =>
      isGitAncestor(options.repositoryRoot, ancestor, descendant),
  });
}
