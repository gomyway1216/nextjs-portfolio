import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { FloodgateTrainingParent } from "./floodgate-training-row-validation";
import { floodgateIdentifierDigest } from "./floodgate-roles";
import {
  SIBLING_TEACHER_LABEL_POLICY,
  SIBLING_TEACHER_WORK_SCHEMA,
  STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON,
  STRENGTH_FIRST_TIMEOUT_SKIP_REASON,
  strengthFirstTimeoutSkipLimit,
  validateWorkEntry,
  type WorkEntry,
} from "./generate-sibling-teacher";
import { compareBytewise } from "./sibling-data";

const PRIVATE_FILE_MODE = 0o600;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;

export interface FreshTeacherArtifactIdentity {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
  readonly schema: string;
}

export interface FreshTeacherPrivateArtifactSnapshot {
  readonly bytes: Uint8Array;
  readonly identity: FreshTeacherArtifactIdentity;
}

export interface FreshTeacherSearchPolicyEvidence {
  readonly teacher: Readonly<{
    readonly proposal: Readonly<{
      readonly multipv: number;
      readonly depth: number;
    }>;
    readonly typed_incomplete_proposal_fallback: Readonly<{
      readonly allowed_only_when_legal_moves_at_most: number;
    }>;
    readonly independent_rescore: Readonly<{ readonly depth: number }>;
  }>;
  readonly runtime: Readonly<{ readonly timeout_ms_per_search: number }>;
}

export interface FreshTeacherStoredCompletionConfig {
  readonly label: string;
  readonly inputGames: number;
  readonly inputParents: number;
  readonly sourceParentIdsSha256: string;
}

export interface FreshTeacherArtifactValidationRequest extends FreshTeacherStoredCompletionConfig {
  readonly datasetBytes: Uint8Array;
  readonly workBytes: Uint8Array;
  readonly sourceRows: readonly Readonly<FloodgateTrainingParent>[];
  readonly sourceRawSha256: string;
  readonly expectedGenerationRunFingerprint: string;
  readonly expectedRevision: string;
  readonly searchPolicy: Readonly<FreshTeacherSearchPolicyEvidence>;
  readonly completion: unknown;
}

export interface FreshTeacherArtifactValidationReceipt {
  readonly completion: Readonly<Record<string, unknown>>;
  readonly completedEntries: number;
  readonly forcedEntries: number;
  readonly timeoutEntries: number;
  readonly datasetRecords: number;
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonicalFreshTeacherJson(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error("fresh-teacher canonical JSON rejects this number");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalFreshTeacherJson(entry)).join(",")}]`;
  }
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalFreshTeacherJson(object[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error(`fresh-teacher canonical JSON rejects ${typeof value}`);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalFreshTeacherJson(left) === canonicalFreshTeacherJson(right);
}

function prettyJsonBytes(value: unknown): Uint8Array {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function exactFreshTeacherObject(
  value: unknown,
  fields: readonly string[],
  label: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !sameJson(
      Object.keys(value as Record<string, unknown>).sort(),
      [...fields].sort(),
    )
  ) {
    throw new Error(`${label} fields are not exact`);
  }
  return value as Record<string, unknown>;
}

export function freshTeacherPrivateArtifactRelativePath(
  file: string,
  root: string,
  label: string,
): string {
  const absolute = path.resolve(file);
  const absoluteRoot = path.resolve(root);
  const relative = path.relative(absoluteRoot, absolute);
  if (
    absolute !== file ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `${label} artifact is outside its root: ${path.basename(file)}`,
    );
  }
  return relative;
}

export async function readFreshTeacherPrivateArtifact(
  file: string,
  root: string,
  effectiveUserId: number,
  schema: string,
  outputRelativeRoot: string,
  label: string,
): Promise<Readonly<FreshTeacherPrivateArtifactSnapshot>> {
  const relative = freshTeacherPrivateArtifactRelativePath(file, root, label);
  const canonicalFromRoot = path.join(
    await fs.promises.realpath(root),
    relative,
  );
  if ((await fs.promises.realpath(file)) !== canonicalFromRoot) {
    throw new Error(
      `${label} artifact path is not canonical: ${path.basename(file)}`,
    );
  }
  const before = await fs.promises.lstat(file);
  if (
    !before.isFile() ||
    before.uid !== effectiveUserId ||
    (before.mode & 0o7777) !== PRIVATE_FILE_MODE ||
    before.nlink !== 1
  ) {
    throw new Error(
      `${label} artifact is not private single-link 0600: ${path.basename(file)}`,
    );
  }
  const noFollow = "O_NOFOLLOW" in fs.constants ? fs.constants.O_NOFOLLOW : 0;
  const handle = await fs.promises.open(file, fs.constants.O_RDONLY | noFollow);
  let bytes: Buffer;
  let openedBefore: fs.Stats;
  let openedAfter: fs.Stats;
  try {
    openedBefore = await handle.stat();
    bytes = await handle.readFile();
    openedAfter = await handle.stat();
  } finally {
    await handle.close();
  }
  const after = await fs.promises.lstat(file);
  const statIdentity = (value: fs.Stats) => [
    value.dev,
    value.ino,
    value.mode,
    value.uid,
    value.gid,
    value.size,
    value.mtimeMs,
    value.ctimeMs,
    value.nlink,
  ];
  if (
    !sameJson(statIdentity(before), statIdentity(openedBefore)) ||
    !sameJson(statIdentity(before), statIdentity(openedAfter)) ||
    !sameJson(statIdentity(before), statIdentity(after)) ||
    (await fs.promises.realpath(file)) !== canonicalFromRoot ||
    bytes.byteLength !== before.size
  ) {
    throw new Error(
      `${label} artifact changed while read: ${path.basename(file)}`,
    );
  }
  const portableRelative = relative.split(path.sep).join("/");
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    identity: Object.freeze({
      path: `${outputRelativeRoot}/${portableRelative}`,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      schema,
    }),
  });
}

export function parseCanonicalFreshTeacherJson(
  snapshot: Readonly<FreshTeacherPrivateArtifactSnapshot>,
  label: string,
): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(snapshot.bytes).toString("utf8")) as unknown;
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Buffer.from(prettyJsonBytes(value)).equals(Buffer.from(snapshot.bytes))
  ) {
    throw new Error(`${label} is not the exact canonical document`);
  }
  return value as Record<string, unknown>;
}

export function validateFreshTeacherStoredIdentity(
  value: unknown,
  expected: Readonly<FreshTeacherArtifactIdentity>,
  label: string,
): void {
  const identity = exactFreshTeacherObject(
    value,
    ["path", "bytes", "sha256", "schema"],
    label,
  );
  if (!sameJson(identity, expected)) {
    throw new Error(`${label} mismatch`);
  }
}

export function validateFreshTeacherStoredCompletion(
  value: unknown,
  config: Readonly<FreshTeacherStoredCompletionConfig>,
): Readonly<Record<string, unknown>> {
  const completion = exactFreshTeacherObject(
    value,
    [
      "input_games",
      "input_parents",
      "completed_parents",
      "forced_parents_skipped",
      "forced_skip_reasons",
      "parent_accounting",
      "emitted_parent_groups",
      "dataset_records",
      "sealed",
    ],
    `${config.label} stored completion`,
  );
  const reasons = exactFreshTeacherObject(
    completion.forced_skip_reasons,
    ["fewer_than_two_legal_moves", "search_timeout_no_label"],
    `${config.label} stored skip reasons`,
  );
  const accounting = exactFreshTeacherObject(
    completion.parent_accounting,
    [
      "parent_ids_sha256",
      "forced_parent_ids_sha256",
      "emitted_parent_ids_sha256",
      "fewer_than_two_legal_moves_parent_ids_sha256",
      "search_timeout_parent_ids_sha256",
    ],
    `${config.label} stored parent accounting`,
  );
  const forced = completion.forced_parents_skipped;
  const emitted = completion.emitted_parent_groups;
  const records = completion.dataset_records;
  if (
    completion.input_games !== config.inputGames ||
    completion.input_parents !== config.inputParents ||
    completion.completed_parents !== config.inputParents ||
    !Number.isSafeInteger(forced) ||
    (forced as number) < 0 ||
    !Number.isSafeInteger(reasons.fewer_than_two_legal_moves) ||
    (reasons.fewer_than_two_legal_moves as number) < 0 ||
    !Number.isSafeInteger(reasons.search_timeout_no_label) ||
    (reasons.search_timeout_no_label as number) < 0 ||
    (reasons.search_timeout_no_label as number) >
      strengthFirstTimeoutSkipLimit(config.inputParents) ||
    (reasons.fewer_than_two_legal_moves as number) +
      (reasons.search_timeout_no_label as number) !==
      forced ||
    accounting.parent_ids_sha256 !== config.sourceParentIdsSha256 ||
    Object.values(accounting).some(
      (digest) => typeof digest !== "string" || !SHA256_RE.test(digest),
    ) ||
    !Number.isSafeInteger(emitted) ||
    (emitted as number) < 1 ||
    (emitted as number) + (forced as number) !== config.inputParents ||
    !Number.isSafeInteger(records) ||
    (records as number) < 2 * (emitted as number) ||
    completion.sealed !== true
  ) {
    throw new Error(`${config.label} stored completion is invalid`);
  }
  return completion;
}

function parseExactJsonl(bytes: Uint8Array, label: string): readonly string[] {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`${label} is not exact UTF-8`);
  }
  if (
    Buffer.byteLength(text, "utf8") !== bytes.byteLength ||
    text.length === 0 ||
    !text.endsWith("\n") ||
    text.endsWith("\n\n") ||
    text.includes("\r")
  ) {
    throw new Error(`${label} is not exact LF-terminated UTF-8 JSONL`);
  }
  return Object.freeze(text.slice(0, -1).split("\n"));
}

function parseExactWorkLine(
  line: string,
  lineNumber: number,
  label: string,
): unknown {
  let value: unknown;
  try {
    value = JSON.parse(line) as unknown;
  } catch {
    throw new Error(`${label} work line ${lineNumber} is not JSON`);
  }
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(value) !== line
  ) {
    throw new Error(
      `${label} work line ${lineNumber} is not exact compact JSON`,
    );
  }
  return value;
}

function validateExactSearchLimit(value: unknown, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an exact search limit`);
  }
  const row = value as Record<string, unknown>;
  const fields = Object.prototype.hasOwnProperty.call(row, "depth")
    ? ["depth"]
    : ["nodes"];
  exactFreshTeacherObject(row, fields, label);
}

function validateExactSearchScore(value: unknown, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not exact score metadata`);
  }
  const row = value as Record<string, unknown>;
  exactFreshTeacherObject(
    row,
    row.score_kind === "mate"
      ? ["move", "cp", "score_kind", "mate", "mate_sign"]
      : ["move", "cp", "score_kind"],
    label,
  );
}

function validateExactSearchMetadata(value: unknown, label: string): void {
  const row = exactFreshTeacherObject(
    value,
    [
      "requested_multipv",
      "requested_limit",
      "depth",
      "observed_nodes",
      "bestmove",
      "moves",
      "scores",
    ],
    label,
  );
  validateExactSearchLimit(row.requested_limit, `${label} requested limit`);
  if (!Array.isArray(row.scores)) {
    throw new Error(`${label} scores are not an array`);
  }
  row.scores.forEach((score, index) =>
    validateExactSearchScore(score, `${label} score ${index + 1}`),
  );
}

function validateExactIndependentSearch(value: unknown, label: string): void {
  const row = exactFreshTeacherObject(
    value,
    [
      "mode",
      "candidate_count",
      "synthesized_rank1_move",
      "moves",
      "scores",
      "searches",
      "total_observed_nodes",
    ],
    label,
  );
  if (!Array.isArray(row.scores) || !Array.isArray(row.searches)) {
    throw new Error(`${label} score/search arrays are missing`);
  }
  row.scores.forEach((score, index) =>
    validateExactSearchScore(score, `${label} ranked score ${index + 1}`),
  );
  row.searches.forEach((search, index) =>
    validateExactSearchMetadata(search, `${label} search ${index + 1}`),
  );
}

function validateExactProposalFallback(value: unknown, label: string): void {
  const row = exactFreshTeacherObject(
    value,
    ["mode", "trigger", "legal_moves", "searches", "synthesized_rank_order"],
    label,
  );
  const trigger = exactFreshTeacherObject(
    row.trigger,
    [
      "requested_multipv",
      "requested_limit",
      "final_exact_ranks",
      "final_cp_ranks",
      "final_mate_ranks",
      "missing_or_non_exact_ranks",
    ],
    `${label} trigger`,
  );
  validateExactSearchLimit(
    trigger.requested_limit,
    `${label} trigger requested limit`,
  );
  if (!Array.isArray(row.searches)) {
    throw new Error(`${label} searches are not an array`);
  }
  row.searches.forEach((search, index) =>
    validateExactSearchMetadata(search, `${label} search ${index + 1}`),
  );
}

function validateExactSiblingRecord(value: unknown, label: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an exact sibling record`);
  }
  const row = value as Record<string, unknown>;
  exactFreshTeacherObject(
    row,
    [
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
      ...(row.teacher_score_kind === "mate"
        ? ["teacher_mate", "teacher_mate_sign"]
        : []),
    ],
    label,
  );
}

function validateExactWorkEntryFields(value: unknown, label: string): void {
  const row = value as Record<string, unknown>;
  if (row.kind === "parent") {
    const entry = exactFreshTeacherObject(
      row,
      [
        "schema",
        "kind",
        "run_fingerprint",
        "payload_sha256",
        "parent_id",
        "candidate_set_sha256",
        "candidate_moves",
        "initial_search",
        ...(Object.prototype.hasOwnProperty.call(row, "proposal_fallback")
          ? ["proposal_fallback"]
          : []),
        "exact_search",
        "records",
      ],
      label,
    );
    validateExactSearchMetadata(
      entry.initial_search,
      `${label} initial search`,
    );
    if (Object.prototype.hasOwnProperty.call(entry, "proposal_fallback")) {
      validateExactProposalFallback(
        entry.proposal_fallback,
        `${label} proposal fallback`,
      );
    }
    validateExactIndependentSearch(entry.exact_search, `${label} exact search`);
    if (!Array.isArray(entry.records)) {
      throw new Error(`${label} records are not an array`);
    }
    entry.records.forEach((record, index) =>
      validateExactSiblingRecord(record, `${label} record ${index + 1}`),
    );
    return;
  }
  if (row.kind !== "skip") {
    throw new Error(`${label} has unsupported work kind`);
  }
  if (row.reason === STRENGTH_FIRST_PROPOSAL_INCOMPLETE_SKIP_REASON) {
    throw new Error(`${label} contains forbidden proposal-incomplete skip`);
  }
  if (row.reason === "fewer-than-two-legal-moves") {
    exactFreshTeacherObject(
      row,
      [
        "schema",
        "kind",
        "run_fingerprint",
        "payload_sha256",
        "parent_id",
        "reason",
        "legal_moves",
      ],
      label,
    );
    return;
  }
  if (row.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON) {
    exactFreshTeacherObject(
      row,
      [
        "schema",
        "kind",
        "run_fingerprint",
        "payload_sha256",
        "parent_id",
        "reason",
        "legal_moves",
        "timeout",
      ],
      label,
    );
    return;
  }
  throw new Error(`${label} contains unsupported skip reason`);
}

export function validateFreshTeacherArtifacts(
  request: Readonly<FreshTeacherArtifactValidationRequest>,
): Readonly<FreshTeacherArtifactValidationReceipt> {
  const completion = validateFreshTeacherStoredCompletion(
    request.completion,
    request,
  );
  if (
    request.sourceRows.length !== request.inputParents ||
    !SHA256_RE.test(request.sourceRawSha256) ||
    !SHA256_RE.test(request.expectedGenerationRunFingerprint) ||
    !REVISION_RE.test(request.expectedRevision)
  ) {
    throw new Error(`${request.label} validation evidence is incomplete`);
  }
  const sourceParentIds = request.sourceRows.map((row) => row.parent_id);
  const sourceGameIds = new Set(request.sourceRows.map((row) => row.game_id));
  if (
    sourceParentIds.some(
      (parentId) => typeof parentId !== "string" || parentId.length === 0,
    ) ||
    new Set(sourceParentIds).size !== sourceParentIds.length ||
    sourceParentIds.some(
      (parentId, index) =>
        index > 0 && compareBytewise(sourceParentIds[index - 1], parentId) >= 0,
    ) ||
    sourceGameIds.size !== request.inputGames ||
    floodgateIdentifierDigest(sourceParentIds) !== request.sourceParentIdsSha256
  ) {
    throw new Error(`${request.label} source parent identity is invalid`);
  }
  const expectedWorkParentIds = [...sourceParentIds].sort(compareBytewise);
  const parentMap = new Map(
    request.sourceRows.map((row) => [row.parent_id, row] as const),
  );
  const lines = parseExactJsonl(request.workBytes, `${request.label} work`);
  if (lines.length !== request.inputParents + 1) {
    throw new Error(
      `${request.label} work must contain one header and every parent`,
    );
  }
  const header = exactFreshTeacherObject(
    parseExactWorkLine(lines[0], 1, request.label),
    [
      "schema",
      "kind",
      "run_fingerprint",
      "source_raw_sha256",
      "selected_parent_ids_sha256",
      "label_policy",
      "pipeline",
    ],
    `${request.label} work header`,
  );
  const pipeline = exactFreshTeacherObject(
    header.pipeline,
    ["source_revision", "tracked_tree_clean"],
    `${request.label} work pipeline`,
  );
  if (
    header.schema !== SIBLING_TEACHER_WORK_SCHEMA ||
    header.kind !== "header" ||
    header.run_fingerprint !== request.expectedGenerationRunFingerprint ||
    header.source_raw_sha256 !== request.sourceRawSha256 ||
    header.selected_parent_ids_sha256 !== sha256(sourceParentIds.join("\n")) ||
    header.label_policy !== SIBLING_TEACHER_LABEL_POLICY ||
    pipeline.source_revision !== request.expectedRevision ||
    pipeline.tracked_tree_clean !== true
  ) {
    throw new Error(
      `${request.label} work header does not match current evidence`,
    );
  }

  const entries: WorkEntry[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const value = parseExactWorkLine(lines[index], index + 1, request.label);
    validateExactWorkEntryFields(
      value,
      `${request.label} work line ${index + 1}`,
    );
    const entry = validateWorkEntry(
      value,
      request.expectedGenerationRunFingerprint,
      parentMap,
      index + 1,
      request.searchPolicy.teacher.proposal.multipv,
      { depth: request.searchPolicy.teacher.independent_rescore.depth },
      request.searchPolicy.runtime.timeout_ms_per_search,
      { depth: request.searchPolicy.teacher.proposal.depth },
      request.searchPolicy.teacher.typed_incomplete_proposal_fallback
        .allowed_only_when_legal_moves_at_most,
    );
    if (entry.parent_id !== expectedWorkParentIds[index - 1]) {
      throw new Error(`${request.label} work parent order or coverage drifted`);
    }
    entries.push(entry);
  }

  const completed = entries.filter((entry) => entry.kind === "parent");
  const forced = entries.filter((entry) => entry.kind === "skip");
  const forcedMove = forced.filter(
    (entry) => entry.reason === "fewer-than-two-legal-moves",
  );
  const timeouts = forced.filter(
    (entry) => entry.reason === STRENGTH_FIRST_TIMEOUT_SKIP_REASON,
  );
  if (
    timeouts.length > strengthFirstTimeoutSkipLimit(request.inputParents) ||
    forcedMove.length + timeouts.length !== forced.length
  ) {
    throw new Error(
      `${request.label} work contains forbidden forced-skip accounting`,
    );
  }
  const reasons = completion.forced_skip_reasons as Record<string, unknown>;
  const accounting = completion.parent_accounting as Record<string, unknown>;
  const forcedParentIds = forced.map((entry) => entry.parent_id);
  const emittedParentIds = completed.map((entry) => entry.parent_id);
  const forcedMoveParentIds = forcedMove.map((entry) => entry.parent_id);
  const timeoutParentIds = timeouts.map((entry) => entry.parent_id);
  const records = completed.flatMap((entry) => entry.records);
  if (
    completion.forced_parents_skipped !== forced.length ||
    completion.emitted_parent_groups !== completed.length ||
    completion.dataset_records !== records.length ||
    reasons.fewer_than_two_legal_moves !== forcedMove.length ||
    reasons.search_timeout_no_label !== timeouts.length ||
    accounting.parent_ids_sha256 !==
      floodgateIdentifierDigest(sourceParentIds) ||
    accounting.forced_parent_ids_sha256 !==
      floodgateIdentifierDigest(forcedParentIds) ||
    accounting.emitted_parent_ids_sha256 !==
      floodgateIdentifierDigest(emittedParentIds) ||
    accounting.fewer_than_two_legal_moves_parent_ids_sha256 !==
      floodgateIdentifierDigest(forcedMoveParentIds) ||
    accounting.search_timeout_parent_ids_sha256 !==
      floodgateIdentifierDigest(timeoutParentIds)
  ) {
    throw new Error(`${request.label} work and completion accounting drifted`);
  }
  const expectedDataset = Buffer.from(
    records.length === 0
      ? ""
      : `${records.map((record) => canonicalFreshTeacherJson(record)).join("\n")}\n`,
    "utf8",
  );
  if (!expectedDataset.equals(Buffer.from(request.datasetBytes))) {
    throw new Error(
      `${request.label} dataset does not exactly match validated work`,
    );
  }
  return Object.freeze({
    completion,
    completedEntries: completed.length,
    forcedEntries: forced.length,
    timeoutEntries: timeouts.length,
    datasetRecords: records.length,
  });
}
