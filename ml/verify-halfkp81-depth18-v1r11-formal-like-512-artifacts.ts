import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import { validateWorkEntry } from "./generate-sibling-teacher";
import type { FloodgateTrainingParent } from "./floodgate-training-row-consumer";
import type { Halfkp81Depth18TeacherFileIdentity } from "./halfkp81-depth18-teacher-runner";
import { USI_RESET_FOR_PARENT_TIMEOUT_MS } from "./usi-engine";

const WORK_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-work-v1";
const RAW_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-raw-receipt-v1";
const VERIFIED_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-verified-artifact-receipt-v1";
const PARENT_PAYLOAD_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-formal-like-512-parent-v1\0";
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const FALSE_AUTHORITY = Object.freeze({
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});

type Role = "fit" | "tune" | "sealed";

interface VerifyContext {
  readonly workPath: string;
  readonly rawReceiptPath: string;
  readonly verifiedReceiptPath: string;
  readonly teacherPlan: Readonly<Halfkp81Depth18TeacherFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly parents: readonly Readonly<FloodgateTrainingParent>[];
  readonly roles: ReadonlyMap<string, Role>;
}

function compareBytewise(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function canonicalJson(value: unknown): string {
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
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort(compareBytewise)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new Error("formal-like-512 verifier rejects non-canonical value");
}

function sha256(raw: Uint8Array | string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function object(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  if (
    canonicalJson(Object.keys(value).sort(compareBytewise)) !==
    canonicalJson([...keys].sort(compareBytewise))
  ) {
    throw new Error(`${label} keys differ`);
  }
}

async function readHeld(pathname: string, label: string): Promise<Buffer> {
  if (!path.isAbsolute(pathname) || path.normalize(pathname) !== pathname) {
    throw new Error(`${label} path differs`);
  }
  const handle = await fs.promises.open(
    pathname,
    fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    const linked = await fs.promises.lstat(pathname);
    const real = await fs.promises.realpath(pathname);
    const raw = await handle.readFile();
    const after = await handle.stat();
    const linkedAfter = await fs.promises.lstat(pathname);
    const euid = process.geteuid?.();
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.nlink !== 1 ||
      (before.mode & 0o7777) !== 0o600 ||
      !Number.isSafeInteger(euid) ||
      before.uid !== euid ||
      linked.dev !== before.dev ||
      linked.ino !== before.ino ||
      real !== pathname ||
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      linkedAfter.dev !== before.dev ||
      linkedAfter.ino !== before.ino ||
      linkedAfter.size !== before.size ||
      raw.byteLength !== before.size
    ) {
      throw new Error(`${label} held identity differs`);
    }
    return raw;
  } finally {
    await handle.close();
  }
}

function identity(
  pathname: string,
  raw: Buffer,
  schema: string,
): Readonly<Halfkp81Depth18TeacherFileIdentity> {
  return Object.freeze({
    path: pathname,
    bytes: raw.byteLength,
    sha256: sha256(raw),
    schema,
  });
}

function assertIdentity(
  value: unknown,
  expected: Readonly<Halfkp81Depth18TeacherFileIdentity>,
  label: string,
): void {
  const record = object(value, label);
  exactKeys(record, ["path", "bytes", "sha256", "schema"], label);
  if (canonicalJson(record) !== canonicalJson(expected)) {
    throw new Error(`${label} identity differs`);
  }
}

function validateCap(
  value: Readonly<Record<string, unknown>>,
  label: string,
): void {
  exactKeys(
    value,
    [
      "termination_reason",
      "requested_depth",
      "node_cap",
      "minimum_completed_depth",
      "deepest_complete_exact_depth",
      "selected_snapshot_nodes",
      "maximum_observed_nodes",
      "maximum_observed_depth",
      "selected_snapshot_bound",
      "discarded_at_or_above_node_cap_updates",
      "observed_lowerbound_updates",
      "observed_upperbound_updates",
      "cap_witness_depth",
      "cap_witness_nodes",
      "selected_precedes_witness",
      "completed_iteration_witness_depth",
    ],
    label,
  );
  if (
    value.termination_reason !== "node-cap" ||
    value.requested_depth !== 18 ||
    value.node_cap !== 2_000_000_000 ||
    value.minimum_completed_depth !== 1 ||
    !Number.isSafeInteger(value.deepest_complete_exact_depth) ||
    Number(value.deepest_complete_exact_depth) < 1 ||
    Number(value.deepest_complete_exact_depth) >= 18 ||
    !Number.isSafeInteger(value.selected_snapshot_nodes) ||
    Number(value.selected_snapshot_nodes) < 0 ||
    Number(value.selected_snapshot_nodes) >= 2_000_000_000 ||
    !Number.isSafeInteger(value.maximum_observed_nodes) ||
    Number(value.maximum_observed_nodes) < 2_000_000_000 ||
    !Number.isSafeInteger(value.maximum_observed_depth) ||
    Number(value.maximum_observed_depth) < Number(value.cap_witness_depth) ||
    Number(value.maximum_observed_depth) > 18 ||
    !Number.isSafeInteger(value.discarded_at_or_above_node_cap_updates) ||
    Number(value.discarded_at_or_above_node_cap_updates) < 1 ||
    !Number.isSafeInteger(value.observed_lowerbound_updates) ||
    Number(value.observed_lowerbound_updates) < 0 ||
    !Number.isSafeInteger(value.observed_upperbound_updates) ||
    Number(value.observed_upperbound_updates) < 0 ||
    !Number.isSafeInteger(value.cap_witness_depth) ||
    Number(value.cap_witness_depth) <=
      Number(value.deepest_complete_exact_depth) ||
    Number(value.cap_witness_depth) > 18 ||
    !Number.isSafeInteger(value.cap_witness_nodes) ||
    Number(value.cap_witness_nodes) < 2_000_000_000 ||
    Number(value.maximum_observed_nodes) < Number(value.cap_witness_nodes) ||
    value.selected_snapshot_bound !== "exact" ||
    value.selected_precedes_witness !== true ||
    value.completed_iteration_witness_depth !==
      value.deepest_complete_exact_depth
  ) {
    throw new Error(`${label} semantics differ`);
  }
}

async function publishVerified(
  pathname: string,
  value: Readonly<Record<string, unknown>>,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  const raw = Buffer.from(`${canonicalJson(value)}\n`, "utf8");
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
  const reread = await readHeld(pathname, "formal-like-512 verified receipt");
  if (!reread.equals(raw)) {
    throw new Error("formal-like-512 verified receipt reread differs");
  }
  return identity(pathname, reread, VERIFIED_RECEIPT_SCHEMA);
}

export async function verifyHalfkp81Depth18V1R11FormalLike512Artifacts(
  context: Readonly<VerifyContext>,
): Promise<Readonly<Halfkp81Depth18TeacherFileIdentity>> {
  if (
    !REVISION_RE.test(context.sourceRevision) ||
    !SHA256_RE.test(context.runFingerprint) ||
    context.parents.length !== 512 ||
    new Set(context.parents.map((parent) => parent.parent_id)).size !== 512 ||
    path.dirname(context.workPath) !== path.dirname(context.rawReceiptPath) ||
    path.dirname(context.workPath) !==
      path.dirname(context.verifiedReceiptPath) ||
    path.basename(context.workPath) !== "formal-like-512-work.jsonl" ||
    path.basename(context.rawReceiptPath) !==
      "formal-like-512-raw-receipt.json" ||
    path.basename(context.verifiedReceiptPath) !==
      "formal-like-512-verified-artifact-receipt.json"
  ) {
    throw new Error("formal-like-512 verifier context differs");
  }
  const contextRoleCounts = { fit: 0, tune: 0, sealed: 0 };
  for (const parent of context.parents) {
    const role = context.roles.get(parent.parent_id);
    if (role === undefined) {
      throw new Error("formal-like-512 verifier context role is missing");
    }
    contextRoleCounts[role] += 1;
  }
  if (
    canonicalJson(contextRoleCounts) !==
    canonicalJson({ fit: 384, tune: 64, sealed: 64 })
  ) {
    throw new Error("formal-like-512 verifier context role counts differ");
  }
  const workRaw = await readHeld(context.workPath, "formal-like-512 work");
  if (workRaw.byteLength < 1 || workRaw.at(-1) !== 0x0a) {
    throw new Error("formal-like-512 work is not LF terminated");
  }
  const lines = workRaw.toString("utf8").slice(0, -1).split("\n");
  if (lines.length !== 513) {
    throw new Error("formal-like-512 work line count differs");
  }
  const values = lines.map((line, index) => {
    const parsed = object(
      JSON.parse(line),
      `formal-like-512 line ${index + 1}`,
    );
    if (canonicalJson(parsed) !== line) {
      throw new Error(`formal-like-512 line ${index + 1} is not canonical`);
    }
    return parsed;
  });
  const header = values[0]!;
  exactKeys(
    header,
    [
      "schema",
      "kind",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "parents",
      "role_parents",
      "teacher_contract",
      "authority",
    ],
    "formal-like-512 header",
  );
  if (
    header.schema !== WORK_SCHEMA ||
    header.kind !== "header" ||
    header.status !== "formal-like-work-complete-no-authority" ||
    canonicalJson(header.teacher_plan) !== canonicalJson(context.teacherPlan) ||
    header.source_revision !== context.sourceRevision ||
    header.run_fingerprint !== context.runFingerprint ||
    header.parents !== 512 ||
    canonicalJson(header.role_parents) !==
      canonicalJson({ fit: 384, tune: 64, sealed: 64 }) ||
    canonicalJson(header.authority) !== canonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error("formal-like-512 header semantics differ");
  }
  const expectedContract = {
    proposal: { depth: 16, multipv: 12, recorded_move_required: true },
    normal: {
      engines: 8,
      hash_mib_each: 512,
      depth: 18,
      node_cap: 2_000_000_000,
      minimum_completed_depth: 1,
      node_cap_result: "route-whole-parent-never-label",
    },
    fallback: {
      engines: 2,
      hash_mib_each: 8192,
      depth: 18,
      all_candidates_recomputed: true,
      maximum_parents: 8,
    },
    timeout_ms_per_search: 14_400_000,
  };
  if (
    canonicalJson(header.teacher_contract) !== canonicalJson(expectedContract)
  ) {
    throw new Error("formal-like-512 teacher contract differs");
  }

  const parentMap = new Map(
    context.parents.map((parent) => [parent.parent_id, parent] as const),
  );
  const fallbackByRole = { fit: 0, tune: 0, sealed: 0 };
  const fallbackSearchesByRole = { fit: 0, tune: 0, sealed: 0 };
  let rows = 0;
  for (let offset = 0; offset < 512; offset += 1) {
    const wrapper = values[offset + 1]!;
    const parent = context.parents[offset]!;
    const role = context.roles.get(parent.parent_id);
    exactKeys(
      wrapper,
      [
        "schema",
        "kind",
        "sequence",
        "run_fingerprint",
        "parent_id",
        "role",
        "candidate_generation",
        "rescore_route",
        "reset_timeout_recovery",
        "teacher_entry",
        "payload_sha256",
      ],
      `formal-like-512 parent ${offset + 1}`,
    );
    const { payload_sha256: payloadDigest, ...payload } = wrapper;
    if (
      wrapper.schema !== WORK_SCHEMA ||
      wrapper.kind !== "parent" ||
      wrapper.sequence !== offset + 1 ||
      wrapper.run_fingerprint !== context.runFingerprint ||
      wrapper.parent_id !== parent.parent_id ||
      role === undefined ||
      wrapper.role !== role ||
      wrapper.candidate_generation !==
        "yaneuraou-depth16-multipv12-plus-recorded-only-hash-fallback-v1" ||
      payloadDigest !==
        sha256(`${PARENT_PAYLOAD_DOMAIN}${canonicalJson(payload)}`)
    ) {
      throw new Error(`formal-like-512 parent ${offset + 1} binding differs`);
    }
    const route = object(
      wrapper.rescore_route,
      `formal-like-512 route ${offset + 1}`,
    );
    const recovery = object(
      wrapper.reset_timeout_recovery,
      `formal-like-512 recovery ${offset + 1}`,
    );
    exactKeys(
      recovery,
      [
        "policy",
        "normal_retries_used",
        "fallback_retries_used",
        "engine_recycles",
        "events",
      ],
      `formal-like-512 recovery ${offset + 1}`,
    );
    if (
      recovery.policy !== "recycle-engine-retry-parent-once" ||
      (recovery.normal_retries_used !== 0 &&
        recovery.normal_retries_used !== 1) ||
      (recovery.fallback_retries_used !== 0 &&
        recovery.fallback_retries_used !== 1) ||
      recovery.engine_recycles !==
        Number(recovery.normal_retries_used) +
          Number(recovery.fallback_retries_used) ||
      !Array.isArray(recovery.events) ||
      recovery.events.length !== recovery.engine_recycles
    ) {
      throw new Error(`formal-like-512 recovery ${offset + 1} differs`);
    }
    let normalRecoveryEvents = 0;
    let fallbackRecoveryEvents = 0;
    for (const [eventOffset, candidate] of recovery.events.entries()) {
      const event = object(
        candidate,
        `formal-like-512 recovery ${offset + 1} event ${eventOffset + 1}`,
      );
      exactKeys(
        event,
        ["route", "attempt", "error_name", "phase", "timeout_ms"],
        `formal-like-512 recovery ${offset + 1} event ${eventOffset + 1}`,
      );
      if (
        (event.route !== "normal" && event.route !== "fallback") ||
        event.attempt !== 1 ||
        event.error_name !== "UsiResetForParentTimeoutError" ||
        event.phase !== "reset-for-parent" ||
        event.timeout_ms !== USI_RESET_FOR_PARENT_TIMEOUT_MS
      ) {
        throw new Error(
          `formal-like-512 recovery ${offset + 1} event ${eventOffset + 1} differs`,
        );
      }
      if (event.route === "normal") normalRecoveryEvents += 1;
      else fallbackRecoveryEvents += 1;
    }
    if (
      normalRecoveryEvents !== recovery.normal_retries_used ||
      fallbackRecoveryEvents !== recovery.fallback_retries_used
    ) {
      throw new Error(
        `formal-like-512 recovery ${offset + 1} route counts differ`,
      );
    }
    const normalRouteLimit = {
      depth: 18,
      nodes: 2_000_000_000,
      minimum_completed_depth: 1,
    };
    let expectedLimit:
      | Readonly<{ depth: 18 }>
      | Readonly<{
          depth: 18;
          nodes: 2_000_000_000;
          minimumCompletedDepth: 1;
        }>;
    if (route.mode === "normal-depth18") {
      exactKeys(
        route,
        ["mode", "normal_hash_mib", "normal_limit", "fallback"],
        `formal-like-512 normal route ${offset + 1}`,
      );
      if (
        route.normal_hash_mib !== 512 ||
        canonicalJson(route.normal_limit) !== canonicalJson(normalRouteLimit) ||
        route.fallback !== null ||
        recovery.fallback_retries_used !== 0
      ) {
        throw new Error(`formal-like-512 normal route ${offset + 1} differs`);
      }
      expectedLimit = {
        depth: 18,
        nodes: 2_000_000_000,
        minimumCompletedDepth: 1,
      };
    } else if (route.mode === "hash8192-parent-fallback") {
      exactKeys(
        route,
        [
          "mode",
          "normal_hash_mib",
          "normal_limit",
          "trigger",
          "normal_engine_reaped_before_fallback",
          "fallback",
        ],
        `formal-like-512 fallback route ${offset + 1}`,
      );
      const trigger = object(
        route.trigger,
        `formal-like-512 trigger ${offset + 1}`,
      );
      const fallback = object(
        route.fallback,
        `formal-like-512 fallback ${offset + 1}`,
      );
      exactKeys(
        trigger,
        [
          "move",
          "candidate_index_zero_based",
          "candidate_count",
          "completed_normal_rescores_discarded",
          "cap",
        ],
        `formal-like-512 trigger ${offset + 1}`,
      );
      exactKeys(
        fallback,
        [
          "hash_mib",
          "depth",
          "timeout_ms",
          "semaphore_limit",
          "all_candidates_recomputed",
          "candidate_count",
          "fallback_reset_retries_used",
          "discarded_completed_rescores_before_retry",
          "searches_executed",
          "normal_rescore_rows_reused",
          "candidate_omissions",
          "engine_quit_before_semaphore_release",
        ],
        `formal-like-512 fallback ${offset + 1}`,
      );
      validateCap(
        object(trigger.cap, `formal-like-512 cap ${offset + 1}`),
        `formal-like-512 cap ${offset + 1}`,
      );
      if (
        route.normal_hash_mib !== 512 ||
        canonicalJson(route.normal_limit) !== canonicalJson(normalRouteLimit) ||
        route.normal_engine_reaped_before_fallback !== true ||
        !Number.isSafeInteger(trigger.candidate_index_zero_based) ||
        Number(trigger.candidate_index_zero_based) < 0 ||
        !Number.isSafeInteger(trigger.candidate_count) ||
        Number(trigger.candidate_count) < 2 ||
        Number(trigger.candidate_count) > 13 ||
        trigger.completed_normal_rescores_discarded !==
          trigger.candidate_index_zero_based ||
        fallback.hash_mib !== 8192 ||
        fallback.depth !== 18 ||
        fallback.timeout_ms !== 14_400_000 ||
        fallback.semaphore_limit !== 2 ||
        fallback.all_candidates_recomputed !== true ||
        fallback.candidate_count !== trigger.candidate_count ||
        fallback.fallback_reset_retries_used !==
          recovery.fallback_retries_used ||
        fallback.searches_executed !==
          Number(fallback.candidate_count) +
            Number(fallback.discarded_completed_rescores_before_retry) ||
        fallback.normal_rescore_rows_reused !== 0 ||
        fallback.candidate_omissions !== 0 ||
        fallback.engine_quit_before_semaphore_release !== true
      ) {
        throw new Error(`formal-like-512 fallback route ${offset + 1} differs`);
      }
      fallbackByRole[role] += 1;
      fallbackSearchesByRole[role] += Number(fallback.searches_executed);
      expectedLimit = { depth: 18 };
    } else {
      throw new Error(`formal-like-512 route ${offset + 1} mode differs`);
    }
    const teacher = validateWorkEntry(
      wrapper.teacher_entry,
      context.runFingerprint,
      parentMap,
      `formal-like-512 teacher ${offset + 1}`,
      12,
      expectedLimit,
      14_400_000,
      { depth: 16 },
      undefined,
      undefined,
    );
    if (route.mode === "hash8192-parent-fallback") {
      const trigger = object(
        route.trigger,
        `formal-like-512 verified trigger ${offset + 1}`,
      );
      const fallback = object(
        route.fallback,
        `formal-like-512 verified fallback ${offset + 1}`,
      );
      const candidateIndex = Number(trigger.candidate_index_zero_based);
      if (
        candidateIndex >= teacher.candidate_moves.length ||
        trigger.candidate_count !== teacher.candidate_moves.length ||
        trigger.move !== teacher.candidate_moves[candidateIndex] ||
        fallback.candidate_count !== teacher.candidate_moves.length ||
        teacher.exact_search.searches.length !==
          teacher.candidate_moves.length ||
        teacher.exact_search.searches.some((search) =>
          Object.hasOwn(search, "dual_bound"),
        )
      ) {
        throw new Error(
          `formal-like-512 fallback teacher ${offset + 1} alignment differs`,
        );
      }
    } else if (
      teacher.exact_search.searches.some((search) => {
        const dual = search.dual_bound;
        return (
          dual === undefined ||
          (dual.termination_reason !== "depth" &&
            dual.termination_reason !== "terminal-mate") ||
          (dual.termination_reason === "depth" &&
            dual.deepest_complete_exact_depth !== 18)
        );
      })
    ) {
      throw new Error(
        `formal-like-512 normal teacher ${offset + 1} contains a capped label`,
      );
    }
    if (
      teacher.records.length < 2 ||
      teacher.records.length > 13 ||
      teacher.records.some((record) =>
        record.sources.some(
          (source) => source !== "teacher" && source !== "played",
        ),
      ) ||
      !teacher.records.some(
        (record) =>
          record.move === parent.played_move &&
          record.sources.includes("played"),
      )
    ) {
      throw new Error(`formal-like-512 teacher ${offset + 1} rows differ`);
    }
    rows += teacher.records.length;
  }
  if (
    fallbackByRole.fit > 6 ||
    fallbackByRole.tune > 1 ||
    fallbackByRole.sealed > 1 ||
    fallbackSearchesByRole.fit > 78 ||
    fallbackSearchesByRole.tune > 13 ||
    fallbackSearchesByRole.sealed > 13
  ) {
    throw new Error("formal-like-512 fallback budgets differ");
  }
  const work = identity(context.workPath, workRaw, WORK_SCHEMA);
  const rawReceiptRaw = await readHeld(
    context.rawReceiptPath,
    "formal-like-512 raw receipt",
  );
  if (rawReceiptRaw.at(-1) !== 0x0a) {
    throw new Error("formal-like-512 raw receipt is not LF terminated");
  }
  const rawReceiptLine = rawReceiptRaw.toString("utf8").slice(0, -1);
  const rawReceipt = object(
    JSON.parse(rawReceiptLine),
    "formal-like-512 raw receipt",
  );
  if (canonicalJson(rawReceipt) !== rawReceiptLine) {
    throw new Error("formal-like-512 raw receipt is not canonical");
  }
  exactKeys(
    rawReceipt,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "work",
      "parents",
      "completed_parents",
      "role_parents",
      "normal_engines",
      "fallback_engines",
      "maximum_normal_active",
      "maximum_fallback_active",
      "fallback_parents",
      "fallback_parents_by_role",
      "fallback_searches",
      "fallback_searches_by_role",
      "normal_partial_rows_published",
      "capped_rows_published",
      "technical_faults",
      "teacher_contract_equal_formal",
      "power_semantics_equal_formal",
      "run_specific_identity_fields_excluded_from_equality",
      "authority",
    ],
    "formal-like-512 raw receipt",
  );
  assertIdentity(rawReceipt.work, work, "formal-like-512 receipt work");
  const fallbackParents = Object.values(fallbackByRole).reduce(
    (sum, count) => sum + count,
    0,
  );
  const fallbackSearches = Object.values(fallbackSearchesByRole).reduce(
    (sum, count) => sum + count,
    0,
  );
  if (
    rawReceipt.schema !== RAW_RECEIPT_SCHEMA ||
    rawReceipt.status !==
      "complete-awaiting-independent-artifact-verification-no-authority" ||
    canonicalJson(rawReceipt.teacher_plan) !==
      canonicalJson(context.teacherPlan) ||
    rawReceipt.source_revision !== context.sourceRevision ||
    rawReceipt.run_fingerprint !== context.runFingerprint ||
    rawReceipt.parents !== 512 ||
    rawReceipt.completed_parents !== 512 ||
    canonicalJson(rawReceipt.role_parents) !==
      canonicalJson({ fit: 384, tune: 64, sealed: 64 }) ||
    rawReceipt.normal_engines !== 8 ||
    rawReceipt.fallback_engines !== 2 ||
    rawReceipt.maximum_normal_active !== 8 ||
    rawReceipt.maximum_fallback_active !== 2 ||
    rawReceipt.fallback_parents !== fallbackParents ||
    canonicalJson(rawReceipt.fallback_parents_by_role) !==
      canonicalJson(fallbackByRole) ||
    rawReceipt.fallback_searches !== fallbackSearches ||
    canonicalJson(rawReceipt.fallback_searches_by_role) !==
      canonicalJson(fallbackSearchesByRole) ||
    rawReceipt.normal_partial_rows_published !== 0 ||
    rawReceipt.capped_rows_published !== 0 ||
    rawReceipt.technical_faults !== 0 ||
    rawReceipt.teacher_contract_equal_formal !== true ||
    rawReceipt.power_semantics_equal_formal !== true ||
    !Array.isArray(
      rawReceipt.run_specific_identity_fields_excluded_from_equality,
    ) ||
    canonicalJson(
      rawReceipt.run_specific_identity_fields_excluded_from_equality,
    ) !==
      canonicalJson([
        "run_fingerprint",
        "LaunchAgent-label-pid-path-and-time",
        "power-ledger-and-receipt-path-bytes-sha256",
        "artifact-path-bytes-sha256",
      ]) ||
    canonicalJson(rawReceipt.authority) !== canonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error("formal-like-512 raw receipt semantics differ");
  }
  const rawReceiptIdentity = identity(
    context.rawReceiptPath,
    rawReceiptRaw,
    RAW_RECEIPT_SCHEMA,
  );
  return publishVerified(
    context.verifiedReceiptPath,
    Object.freeze({
      schema: VERIFIED_RECEIPT_SCHEMA,
      status: "independently-verified-complete-no-formal-authority",
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      run_fingerprint: context.runFingerprint,
      raw_receipt: rawReceiptIdentity,
      work,
      parents: 512,
      completed_parents: 512,
      completed_rows: rows,
      fallback_parents: fallbackParents,
      fallback_parents_by_role: Object.freeze(fallbackByRole),
      fallback_searches: fallbackSearches,
      fallback_searches_by_role: Object.freeze(fallbackSearchesByRole),
      normal_partial_rows_published: 0,
      capped_rows_published: 0,
      technical_faults: 0,
      teacher_contract_equal_formal: true,
      artifact_bytes_sha256_rows_and_routes_recomputed: true,
      authority: FALSE_AUTHORITY,
    }),
  );
}
