import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import type { CompletedWorkEntry } from "./generate-sibling-teacher";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import type { Halfkp81Depth18TeacherFileIdentity } from "./halfkp81-depth18-teacher-runner";
import { verifyHalfkp81Depth18V1R11FormalLike512Artifacts } from "./verify-halfkp81-depth18-v1r11-formal-like-512-artifacts";

export const HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT = 512 as const;
export const HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS = Object.freeze({
  fit: 384,
  tune: 64,
  sealed: 64,
} as const);
export const HALFKP81_V1R11_FORMAL_LIKE_WORK_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-work-v1" as const;
export const HALFKP81_V1R11_FORMAL_LIKE_RAW_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-raw-receipt-v1" as const;
export const HALFKP81_V1R11_FORMAL_LIKE_VERIFIED_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-verified-artifact-receipt-v1" as const;

const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const PARENT_PAYLOAD_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-formal-like-512-parent-v1\0";
const FALSE_AUTHORITY = Object.freeze({
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});

export type Halfkp81V1R11FormalLikeRole = "fit" | "tune" | "sealed";

export interface Halfkp81V1R11FormalLikeNormalRoute {
  readonly mode: "normal-depth18";
  readonly normal_hash_mib: 512;
  readonly normal_limit: Readonly<{
    readonly depth: 18;
    readonly nodes: 2_000_000_000;
    readonly minimum_completed_depth: 1;
  }>;
  readonly fallback: null;
}

export interface Halfkp81V1R11FormalLikeFallbackRoute {
  readonly mode: "hash8192-parent-fallback";
  readonly normal_hash_mib: 512;
  readonly normal_limit: Readonly<{
    readonly depth: 18;
    readonly nodes: 2_000_000_000;
    readonly minimum_completed_depth: 1;
  }>;
  readonly trigger: Readonly<{
    readonly move: string;
    readonly candidate_index_zero_based: number;
    readonly candidate_count: number;
    readonly completed_normal_rescores_discarded: number;
    readonly cap: Readonly<Record<string, unknown>>;
  }>;
  readonly normal_engine_reaped_before_fallback: true;
  readonly fallback: Readonly<{
    readonly hash_mib: 8192;
    readonly depth: 18;
    readonly timeout_ms: 14_400_000;
    readonly semaphore_limit: 2;
    readonly all_candidates_recomputed: true;
    readonly candidate_count: number;
    readonly fallback_reset_retries_used: 0 | 1;
    readonly discarded_completed_rescores_before_retry: number;
    readonly searches_executed: number;
    readonly normal_rescore_rows_reused: 0;
    readonly candidate_omissions: 0;
    readonly engine_quit_before_semaphore_release: true;
  }>;
}

export type Halfkp81V1R11FormalLikeRoute =
  Halfkp81V1R11FormalLikeNormalRoute | Halfkp81V1R11FormalLikeFallbackRoute;

export interface Halfkp81V1R11FormalLikeResetRecovery {
  readonly policy: "recycle-engine-retry-parent-once";
  readonly normal_retries_used: 0 | 1;
  readonly fallback_retries_used: 0 | 1;
  readonly engine_recycles: 0 | 1 | 2;
  readonly events: readonly Readonly<{
    readonly route: "normal" | "fallback";
    readonly attempt: 1;
    readonly error_name: "UsiResetForParentTimeoutError";
    readonly phase: "reset-for-parent";
    readonly timeout_ms: number;
  }>[];
}

export interface Halfkp81V1R11FormalLikeCompletedParent {
  readonly parent_id: string;
  readonly role: Halfkp81V1R11FormalLikeRole;
  readonly teacher_entry: Readonly<CompletedWorkEntry>;
  readonly rescore_route: Readonly<Halfkp81V1R11FormalLikeRoute>;
  readonly reset_timeout_recovery: Readonly<Halfkp81V1R11FormalLikeResetRecovery>;
}

export interface Halfkp81V1R11FormalLikeExecutionResult {
  readonly completed: readonly Readonly<Halfkp81V1R11FormalLikeCompletedParent>[];
  readonly normal_engines: 8;
  readonly fallback_engines: 2;
  readonly maximum_normal_active: 8;
  readonly maximum_fallback_active: 2;
  readonly fallback_parents: number;
  readonly fallback_parents_by_role: Readonly<
    Record<Halfkp81V1R11FormalLikeRole, number>
  >;
  readonly fallback_searches: number;
  readonly fallback_searches_by_role: Readonly<
    Record<Halfkp81V1R11FormalLikeRole, number>
  >;
  readonly normal_partial_rows_published: 0;
  readonly capped_rows_published: 0;
  readonly technical_faults: 0;
}

export interface Halfkp81V1R11FormalLikeArtifactContext {
  readonly outputDirectory: string;
  readonly teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly parents: readonly Readonly<FloodgateTrainingParent>[];
  readonly roles: ReadonlyMap<string, Halfkp81V1R11FormalLikeRole>;
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

export function canonicalHalfkp81V1R11FormalLikeJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    !Object.is(value, -0)
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalHalfkp81V1R11FormalLikeJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalHalfkp81V1R11FormalLikeJson(record[key])}`,
      )
      .join(",")}}`;
  }
  throw new Error("formal-like-512 value is not canonicalizable");
}

export function sha256Halfkp81V1R11FormalLike(
  raw: Uint8Array | string,
): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function sealHalfkp81V1R11FormalLikeTeacherEntry(
  entry: Readonly<CompletedWorkEntry>,
  runFingerprint: string,
): Readonly<CompletedWorkEntry> {
  const sealed = {
    ...entry,
    run_fingerprint: runFingerprint,
    payload_sha256: "",
  } as CompletedWorkEntry;
  const payload = { ...sealed } as Record<string, unknown>;
  delete payload.payload_sha256;
  sealed.payload_sha256 = sha256Halfkp81V1R11FormalLike(
    canonicalHalfkp81V1R11FormalLikeJson(payload),
  );
  return Object.freeze(sealed);
}

function identity(
  pathname: string,
  raw: Buffer,
  schema: string,
): Readonly<Halfkp81Depth18TeacherFileIdentity> {
  return Object.freeze({
    path: pathname,
    bytes: raw.byteLength,
    sha256: sha256Halfkp81V1R11FormalLike(raw),
    schema,
  });
}

async function publishCreateOnly(
  pathname: string,
  raw: Buffer,
  schema: string,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const handle = await fs.promises.open(
    pathname,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      (fs.constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(raw);
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await fs.promises.open(
    path.dirname(pathname),
    fs.constants.O_RDONLY,
  );
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
  const held = await fs.promises.open(
    pathname,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const metadata = await held.stat();
    const reread = await held.readFile();
    if (
      !metadata.isFile() ||
      metadata.nlink !== 1 ||
      metadata.size !== raw.byteLength ||
      (metadata.mode & 0o7777) !== 0o600 ||
      !reread.equals(raw)
    ) {
      throw new Error("formal-like-512 create-only publication differs");
    }
  } finally {
    await held.close();
  }
  return identity(pathname, raw, schema);
}

function validateContext(
  context: Readonly<Halfkp81V1R11FormalLikeArtifactContext>,
): void {
  if (
    !path.isAbsolute(context.outputDirectory) ||
    path.normalize(context.outputDirectory) !== context.outputDirectory ||
    !REVISION_RE.test(context.sourceRevision) ||
    !SHA256_RE.test(context.runFingerprint) ||
    context.parents.length !== HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT ||
    new Set(context.parents.map((parent) => parent.parent_id)).size !==
      HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT
  ) {
    throw new Error("formal-like-512 artifact context differs");
  }
  const recount = { fit: 0, tune: 0, sealed: 0 };
  for (const parent of context.parents) {
    const role = context.roles.get(parent.parent_id);
    if (role === undefined) throw new Error("formal-like-512 role is missing");
    recount[role] += 1;
  }
  if (
    canonicalHalfkp81V1R11FormalLikeJson(recount) !==
    canonicalHalfkp81V1R11FormalLikeJson(HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS)
  ) {
    throw new Error("formal-like-512 role counts differ");
  }
}

function parentWrapper(
  completed: Readonly<Halfkp81V1R11FormalLikeCompletedParent>,
  sequence: number,
  runFingerprint: string,
): Readonly<Record<string, unknown>> {
  const withoutDigest = Object.freeze({
    schema: HALFKP81_V1R11_FORMAL_LIKE_WORK_SCHEMA,
    kind: "parent" as const,
    sequence,
    run_fingerprint: runFingerprint,
    parent_id: completed.parent_id,
    role: completed.role,
    candidate_generation:
      "yaneuraou-depth16-multipv12-plus-recorded-only-hash-fallback-v1",
    rescore_route: completed.rescore_route,
    reset_timeout_recovery: completed.reset_timeout_recovery,
    teacher_entry: completed.teacher_entry,
  });
  return Object.freeze({
    ...withoutDigest,
    payload_sha256: sha256Halfkp81V1R11FormalLike(
      `${PARENT_PAYLOAD_DOMAIN}${canonicalHalfkp81V1R11FormalLikeJson(withoutDigest)}`,
    ),
  });
}

export async function produceHalfkp81Depth18V1R11FormalLike512Artifacts(
  context: Readonly<Halfkp81V1R11FormalLikeArtifactContext>,
  execute: () => Promise<Readonly<Halfkp81V1R11FormalLikeExecutionResult>>,
): Promise<Readonly<Record<string, unknown>>> {
  validateContext(context);
  try {
    await fs.promises.lstat(context.outputDirectory);
    throw new Error("formal-like-512 artifact namespace already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await fs.promises.mkdir(context.outputDirectory, { mode: 0o700 });
  const created = await fs.promises.lstat(context.outputDirectory);
  if (
    !created.isDirectory() ||
    created.isSymbolicLink() ||
    (created.mode & 0o7777) !== 0o700 ||
    (await fs.promises.realpath(context.outputDirectory)) !==
      context.outputDirectory ||
    (await fs.promises.readdir(context.outputDirectory)).length !== 0
  ) {
    throw new Error("formal-like-512 artifact namespace differs");
  }
  const execution = await execute();
  if (
    execution.completed.length !== HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT ||
    execution.normal_engines !== 8 ||
    execution.fallback_engines !== 2 ||
    execution.maximum_normal_active !== 8 ||
    execution.maximum_fallback_active !== 2 ||
    execution.fallback_parents > 8 ||
    execution.normal_partial_rows_published !== 0 ||
    execution.capped_rows_published !== 0 ||
    execution.technical_faults !== 0
  ) {
    throw new Error("formal-like-512 execution result differs");
  }
  for (const [offset, completed] of execution.completed.entries()) {
    const parent = context.parents[offset];
    if (
      parent === undefined ||
      completed.parent_id !== parent.parent_id ||
      completed.role !== context.roles.get(parent.parent_id) ||
      completed.teacher_entry.run_fingerprint !== context.runFingerprint ||
      completed.teacher_entry.parent_id !== parent.parent_id
    ) {
      throw new Error(`formal-like-512 completed parent ${offset + 1} differs`);
    }
  }
  const header = Object.freeze({
    schema: HALFKP81_V1R11_FORMAL_LIKE_WORK_SCHEMA,
    kind: "header" as const,
    status: "formal-like-work-complete-no-authority",
    teacher_plan: context.teacherPlan,
    source_revision: context.sourceRevision,
    run_fingerprint: context.runFingerprint,
    parents: HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT,
    role_parents: HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS,
    teacher_contract: Object.freeze({
      proposal: Object.freeze({
        depth: 16,
        multipv: 12,
        recorded_move_required: true,
      }),
      normal: Object.freeze({
        engines: 8,
        hash_mib_each: 512,
        depth: 18,
        node_cap: 2_000_000_000,
        minimum_completed_depth: 1,
        node_cap_result: "route-whole-parent-never-label",
      }),
      fallback: Object.freeze({
        engines: 2,
        hash_mib_each: 8192,
        depth: 18,
        all_candidates_recomputed: true,
        maximum_parents: 8,
      }),
      timeout_ms_per_search: 14_400_000,
    }),
    authority: FALSE_AUTHORITY,
  });
  const workRaw = Buffer.from(
    `${[
      canonicalHalfkp81V1R11FormalLikeJson(header),
      ...execution.completed.map((completed, offset) =>
        canonicalHalfkp81V1R11FormalLikeJson(
          parentWrapper(completed, offset + 1, context.runFingerprint),
        ),
      ),
    ].join("\n")}\n`,
    "utf8",
  );
  const work = await publishCreateOnly(
    path.join(context.outputDirectory, "formal-like-512-work.jsonl"),
    workRaw,
    HALFKP81_V1R11_FORMAL_LIKE_WORK_SCHEMA,
  );
  const rawReceipt = Object.freeze({
    schema: HALFKP81_V1R11_FORMAL_LIKE_RAW_RECEIPT_SCHEMA,
    status: "complete-awaiting-independent-artifact-verification-no-authority",
    teacher_plan: context.teacherPlan,
    source_revision: context.sourceRevision,
    run_fingerprint: context.runFingerprint,
    work,
    parents: HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT,
    completed_parents: execution.completed.length,
    role_parents: HALFKP81_V1R11_FORMAL_LIKE_ROLE_COUNTS,
    normal_engines: execution.normal_engines,
    fallback_engines: execution.fallback_engines,
    maximum_normal_active: execution.maximum_normal_active,
    maximum_fallback_active: execution.maximum_fallback_active,
    fallback_parents: execution.fallback_parents,
    fallback_parents_by_role: execution.fallback_parents_by_role,
    fallback_searches: execution.fallback_searches,
    fallback_searches_by_role: execution.fallback_searches_by_role,
    normal_partial_rows_published: execution.normal_partial_rows_published,
    capped_rows_published: execution.capped_rows_published,
    technical_faults: execution.technical_faults,
    teacher_contract_equal_formal: true,
    power_semantics_equal_formal: true,
    run_specific_identity_fields_excluded_from_equality: Object.freeze([
      "run_fingerprint",
      "LaunchAgent-label-pid-path-and-time",
      "power-ledger-and-receipt-path-bytes-sha256",
      "artifact-path-bytes-sha256",
    ]),
    authority: FALSE_AUTHORITY,
  });
  const rawReceiptBytes = Buffer.from(
    `${canonicalHalfkp81V1R11FormalLikeJson(rawReceipt)}\n`,
    "utf8",
  );
  const rawReceiptIdentity = await publishCreateOnly(
    path.join(context.outputDirectory, "formal-like-512-raw-receipt.json"),
    rawReceiptBytes,
    HALFKP81_V1R11_FORMAL_LIKE_RAW_RECEIPT_SCHEMA,
  );
  const verified = await verifyHalfkp81Depth18V1R11FormalLike512Artifacts({
    workPath: work.path,
    rawReceiptPath: rawReceiptIdentity.path,
    verifiedReceiptPath: path.join(
      context.outputDirectory,
      "formal-like-512-verified-artifact-receipt.json",
    ),
    teacherPlan: context.teacherPlan,
    sourceRevision: context.sourceRevision,
    runFingerprint: context.runFingerprint,
    parents: context.parents,
    roles: context.roles,
  });
  return Object.freeze({
    parents: HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT,
    completed_parents: HALFKP81_V1R11_FORMAL_LIKE_PARENT_COUNT,
    technical_faults: 0,
    teacher_contract_equal_formal: true,
    power_semantics_equal_formal: true,
    run_specific_identity_fields_excluded_from_equality:
      rawReceipt.run_specific_identity_fields_excluded_from_equality,
    artifact_verified_receipt: verified,
  });
}
