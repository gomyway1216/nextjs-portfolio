import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  assertV1R11CreateOnlyTargetAbsent,
  parseV1R11CanonicalObject,
  publishV1R11CreateOnlyCanonical,
  readV1R11HeldIdentity,
  readV1R11HeldFile,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  halfkp81V1R11FormalRunFingerprintV2,
  type Halfkp81V1R11FormalRunIntentInput,
} from "./halfkp81-depth18-v1r11-formal-run-intent";
import {
  Halfkp81V1R11PreformalStageFailure,
  halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure,
} from "./halfkp81-depth18-v1r11-preformal-stage-failure";

const GATES = Object.freeze([
  "ready-pr",
  "all-required-ci-success",
  "regular-merge",
  "clean-main-source-authentication",
  "preformal-authority-implementation-tests-pass",
  "artifact-verifier-implementation-tests-pass",
  "power-guardian-implementation-tests-pass",
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
  "ac-power-start-admission-pass",
] as const);
const REQUIRED_ORDER = Object.freeze([...GATES, "formal-teacher"] as const);
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const RAW_RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11";
const STAGE_A_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11";
const LAUNCH_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11";
const LEDGER_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0";
const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const REQUIRED_ASSERTIONS = Object.freeze([
  "PreventSystemSleep",
  "PreventUserIdleSystemSleep",
  "PreventUserIdleDisplaySleep",
]);
const FINAL_LAUNCH_PS_COMMAND = Object.freeze([
  "/bin/ps",
  "-ww",
  "-axo",
  "pid=,ppid=,pgid=,lstart=,command=",
] as const);
const FORMAL_ENGINE_PATH =
  "/Users/yudaiyaguchi/.codex/shogi-data/floodgate-teacher-assets-v1/bin/yaneuraou";
const PS_LSTART_RE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/u;

type Gate = (typeof GATES)[number];

function expectedSourceKinds(gate: Gate): readonly string[] {
  if (gate === "ready-pr") return ["github-pr-rest-response"];
  if (gate === "all-required-ci-success") {
    return ["github-check-rollup-and-branch-protection-response"];
  }
  if (gate === "regular-merge") {
    return ["git-cat-file-commit-and-github-pr-response"];
  }
  if (gate === "clean-main-source-authentication") {
    return ["fixed-git-command-transcript-bundle"];
  }
  if (
    gate === "preformal-authority-implementation-tests-pass" ||
    gate === "artifact-verifier-implementation-tests-pass" ||
    gate === "power-guardian-implementation-tests-pass"
  ) {
    return ["fixed-vitest-transcript-bundle"];
  }
  const first =
    gate === "candidate-order-gate"
      ? "candidate-order-receipt-and-transcript-bundle"
      : gate === "known10-probe"
        ? "known10-probe-receipt-and-transcript-bundle"
        : gate === "pathological-fallback-probe"
          ? "pathological-probe-receipt-and-transcript-bundle"
          : gate === "mixed-load-gate"
            ? "mixed-load-receipt-and-transcript-bundle"
            : gate === "formal-like-512"
              ? "formal-like-512-verified-receipt-and-transcript-bundle"
              : "formal-launchagent-power-admission-bundle";
  return gate === "ac-power-start-admission-pass"
    ? [first]
    : [first, "stage-b-power-ledger", "stage-b-power-receipt"];
}

export interface Halfkp81V1R11LiveLaunchAgentObservation {
  readonly launchctl_stdout: Buffer;
  readonly launchctl_stderr: Buffer;
  readonly plist_bytes: Buffer;
  readonly ps_stdout: Buffer;
  readonly ps_stderr: Buffer;
}

export interface Halfkp81V1R11LiveLaunchAgentObserver {
  observe(
    request: Readonly<{ uid: number; label: string }>,
  ): Promise<Readonly<Halfkp81V1R11LiveLaunchAgentObservation>>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  label: string,
): void {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...keys].sort())
  ) {
    throw new Error(`${label} keys differ`);
  }
}

function object(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function finalLaunchProcessRow(
  value: unknown,
  role: "runner" | "assertion-holder",
  label: string,
): Readonly<Record<string, unknown>> {
  const row = object(value, label);
  exactKeys(
    row,
    ["pid", "ppid", "pgid", "lstart", "executable", "argv", "role"],
    label,
  );
  if (
    !Number.isSafeInteger(row.pid) ||
    Number(row.pid) < 1 ||
    !Number.isSafeInteger(row.ppid) ||
    Number(row.ppid) < 0 ||
    !Number.isSafeInteger(row.pgid) ||
    Number(row.pgid) < 1 ||
    typeof row.lstart !== "string" ||
    !PS_LSTART_RE.test(row.lstart) ||
    typeof row.executable !== "string" ||
    row.executable.length < 1 ||
    typeof row.argv !== "string" ||
    row.argv.length < 1 ||
    row.role !== role
  ) {
    throw new Error(`${label} differs`);
  }
  return row;
}

function parseFinalLaunchPs(raw: Buffer): readonly Readonly<Record<string, unknown>>[] {
  const text = raw.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(raw) || (text.length > 0 && !text.endsWith("\n"))) {
    throw new Error("final LaunchAgent ps is not exact UTF-8 LF text");
  }
  const rows: Readonly<Record<string, unknown>>[] = [];
  for (const [index, line] of text.split("\n").slice(0, -1).entries()) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4})\s+(.+)$/u.exec(line);
    if (match === null) throw new Error(`final LaunchAgent ps row ${index + 1} differs`);
    const row = Object.freeze({
      pid: Number(match[1]), ppid: Number(match[2]), pgid: Number(match[3]),
      lstart: match[4]!, executable: /^(\S+)(?:\s|$)/u.exec(match[5]!)?.[1] ?? "", argv: match[5]!,
    });
    if (!Number.isSafeInteger(row.pid) || row.pid < 1 ||
        !Number.isSafeInteger(row.ppid) || row.ppid < 0 ||
        !Number.isSafeInteger(row.pgid) || row.pgid < 1 ||
        !PS_LSTART_RE.test(row.lstart) || rows.some((prior) => prior.pid === row.pid)) {
      throw new Error(`final LaunchAgent ps row ${index + 1} semantics differ`);
    }
    rows.push(row);
  }
  return Object.freeze(rows);
}

function identity(
  value: unknown,
  schema: string | undefined,
  label: string,
): Readonly<V1R11AuthorityFileIdentity> {
  const row = object(value, label);
  exactKeys(row, ["path", "bytes", "sha256", "schema"], label);
  if (
    typeof row.path !== "string" ||
    !path.isAbsolute(row.path) ||
    path.normalize(row.path) !== row.path ||
    !Number.isSafeInteger(row.bytes) ||
    Number(row.bytes) < 1 ||
    typeof row.sha256 !== "string" ||
    !SHA256_RE.test(row.sha256) ||
    typeof row.schema !== "string" ||
    row.schema.length < 1 ||
    (schema !== undefined && row.schema !== schema)
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

function parseLedger(
  raw: Buffer,
): readonly Readonly<Record<string, unknown>>[] {
  if (raw.at(-1) !== 0x0a || raw.byteLength < 2) {
    throw new Error("preformal ledger terminal LF differs");
  }
  const lines = raw.toString("utf8").slice(0, -1).split("\n");
  if (lines.length !== GATES.length) {
    throw new Error("preformal ledger row count differs");
  }
  return Object.freeze(
    lines.map((line, index) => {
      const row = object(JSON.parse(line), `ledger row ${index + 1}`);
      if (v1r11CanonicalJson(row) !== line) {
        throw new Error(`ledger row ${index + 1} is not canonical`);
      }
      return row;
    }),
  );
}

function decodeRawResult(
  contentValue: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const content = object(contentValue, `${label} command bundle`);
  exactKeys(
    content,
    [
      "collector",
      "request_or_command",
      "exit_code",
      "stdout_base64",
      "stdout_bytes",
      "stdout_sha256",
      "stderr_base64",
      "stderr_bytes",
      "stderr_sha256",
      "parsed_canonical_json",
    ],
    `${label} command bundle`,
  );
  const stdout = Buffer.from(String(content.stdout_base64), "base64");
  const stderr = Buffer.from(String(content.stderr_base64), "base64");
  if (
    stdout.toString("base64") !== content.stdout_base64 ||
    stderr.toString("base64") !== content.stderr_base64 ||
    stdout.byteLength !== content.stdout_bytes ||
    stderr.byteLength !== content.stderr_bytes ||
    v1r11Sha256(stdout) !== content.stdout_sha256 ||
    v1r11Sha256(stderr) !== content.stderr_sha256 ||
    content.exit_code !== 0
  ) {
    throw new Error(`${label} raw transcript differs`);
  }
  const parsed = parseV1R11CanonicalObject(stdout, `${label} stdout`);
  if (
    v1r11CanonicalJson(parsed) !==
    v1r11CanonicalJson(content.parsed_canonical_json)
  ) {
    throw new Error(`${label} caller parsed result differs`);
  }
  return parsed;
}

function validateImplementationIdentity(
  value: unknown,
  repositoryRoot: string,
  sourceRevision: string,
  label: string,
): void {
  const implementation = object(value, label);
  exactKeys(
    implementation,
    ["source_revision", "entrypoint", "dependency_closure"],
    label,
  );
  if (
    implementation.source_revision !== sourceRevision ||
    typeof implementation.entrypoint !== "string" ||
    implementation.entrypoint.startsWith("/") ||
    implementation.entrypoint.split("/").includes("..") ||
    !Array.isArray(implementation.dependency_closure) ||
    implementation.dependency_closure.length < 1
  ) {
    throw new Error(`${label} differs`);
  }
  const paths: string[] = [];
  implementation.dependency_closure.forEach((entryValue, index) => {
    const entry = object(entryValue, `${label} closure ${index}`);
    exactKeys(entry, ["path", "bytes", "sha256"], `${label} closure ${index}`);
    const relativePath = String(entry.path);
    const tracked = execFileSync(
      "git",
      ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
      { encoding: null },
    );
    if (
      relativePath.startsWith("/") ||
      relativePath.split("/").includes("..") ||
      (index === 0 && relativePath !== implementation.entrypoint) ||
      entry.bytes !== tracked.byteLength ||
      entry.sha256 !== v1r11Sha256(tracked)
    ) {
      throw new Error(`${label} closure differs`);
    }
    paths.push(relativePath);
  });
  const tail = paths.slice(1);
  const sorted = [...tail].sort((left, right) =>
    Buffer.compare(Buffer.from(left), Buffer.from(right)),
  );
  if (
    new Set(paths).size !== paths.length ||
    v1r11CanonicalJson(tail) !== v1r11CanonicalJson(sorted)
  ) {
    throw new Error(`${label} closure order differs`);
  }
}

function validateCapturedPayloadBinding(
  contentValue: unknown,
  payload: Readonly<Record<string, unknown>>,
  label: string,
): void {
  const content = object(contentValue, `${label} command bundle`);
  exactKeys(
    content,
    [
      "collector",
      "request_or_command",
      "exit_code",
      "stdout_base64",
      "stdout_bytes",
      "stdout_sha256",
      "stderr_base64",
      "stderr_bytes",
      "stderr_sha256",
      "parsed_canonical_json",
    ],
    `${label} command bundle`,
  );
  const stdout = Buffer.from(String(content.stdout_base64), "base64");
  const stderr = Buffer.from(String(content.stderr_base64), "base64");
  if (
    stdout.toString("base64") !== content.stdout_base64 ||
    stderr.toString("base64") !== content.stderr_base64 ||
    stdout.byteLength !== content.stdout_bytes ||
    stderr.byteLength !== content.stderr_bytes ||
    v1r11Sha256(stdout) !== content.stdout_sha256 ||
    v1r11Sha256(stderr) !== content.stderr_sha256 ||
    content.exit_code !== 0 ||
    v1r11CanonicalJson(content.parsed_canonical_json) !==
      v1r11CanonicalJson(payload)
  ) {
    throw new Error(`${label} captured payload binding differs`);
  }
}

function validateStageBPayload(
  gate: Gate,
  payload: Readonly<Record<string, unknown>>,
  raw: Readonly<Record<string, unknown>>,
): void {
  const projected = { ...payload };
  delete projected.stage_a_verified_receipt;
  delete projected.stage_b_power_ledger;
  delete projected.stage_b_power_receipt;
  if (v1r11CanonicalJson(projected) !== v1r11CanonicalJson(raw)) {
    throw new Error(`${gate} raw result projection differs`);
  }
  if (payload.technical_faults !== 0) {
    throw new Error(`${gate} technical faults differ`);
  }
  if (
    gate === "candidate-order-gate" &&
    (!Number.isSafeInteger(payload.parents) ||
      Number(payload.parents) < 1 ||
      !SHA256_RE.test(String(payload.normal_candidate_order_digest)) ||
      payload.normal_candidate_order_digest !==
        payload.fallback_candidate_order_digest ||
      payload.normal_candidate_order_digest !==
        payload.publication_order_digest ||
      payload.mismatches !== 0)
  ) {
    throw new Error(`${gate} semantics differ`);
  }
  if (
    gate === "known10-probe" &&
    (payload.parents !== 8 ||
      payload.moves !== 10 ||
      !Array.isArray(payload.fixed_expected_identities) ||
      payload.fixed_expected_identities.length !== 10 ||
      v1r11CanonicalJson(payload.fixed_expected_identities) !==
        v1r11CanonicalJson(payload.actual_exact_depth18_identities) ||
      payload.mismatches !== 0)
  ) {
    throw new Error(`${gate} semantics differ`);
  }
  if (
    gate === "pathological-fallback-probe" &&
    (payload.parent_id !==
      "sha256:622377e74345bfcbe509b903ae89e37dfec48e493db0331780b5423382d926a1" ||
      payload.normal_partial_rows_published !== 0 ||
      payload.capped_rows_published !== 0 ||
      v1r11CanonicalJson(payload.fallback_exact_depth18_identity) !==
        v1r11CanonicalJson(payload.fixed_hash8192_identity))
  ) {
    throw new Error(`${gate} semantics differ`);
  }
  if (
    gate === "mixed-load-gate" &&
    (payload.normal_engines !== 8 ||
      payload.normal_hash_mib_each !== 512 ||
      payload.fallback_engines !== 2 ||
      payload.fallback_hash_mib_each !== 8_192 ||
      !Number.isSafeInteger(payload.maximum_normal_active) ||
      Number(payload.maximum_normal_active) > 8 ||
      !Number.isSafeInteger(payload.maximum_fallback_active) ||
      Number(payload.maximum_fallback_active) > 2)
  ) {
    throw new Error(`${gate} semantics differ`);
  }
  if (
    gate === "formal-like-512" &&
    (payload.parents !== 512 ||
      payload.completed_parents !== 512 ||
      payload.teacher_contract_equal_formal !== true ||
      payload.power_semantics_equal_formal !== true ||
      !Array.isArray(
        payload.run_specific_identity_fields_excluded_from_equality,
      ) ||
      payload.run_specific_identity_fields_excluded_from_equality.length < 1)
  ) {
    throw new Error(`${gate} semantics differ`);
  }
}

function validatePowerSources(
  gate: Gate,
  sequence: number,
  teacherPlan: Readonly<V1R11AuthorityFileIdentity>,
  sourceRevision: string,
  gateDirectory: string,
  stageA: Readonly<V1R11AuthorityFileIdentity>,
  source2: Readonly<V1R11AuthorityFileIdentity>,
  ledgerContentValue: unknown,
  receiptContentValue: unknown,
  fingerprints: Set<string>,
  formalRunFingerprint: string,
): void {
  const ledger = object(ledgerContentValue, `${gate} power ledger`);
  const receipt = object(receiptContentValue, `${gate} power receipt`);
  const fingerprint = String(ledger.stage_b_run_fingerprint);
  const epochNamespace = path.join(
    gateDirectory,
    `${String(sequence).padStart(2, "0")}-${gate}.stage-b-epoch`,
  );
  const expectedFingerprint = v1r11Sha256(
    v1r11CanonicalJson({
      domain: "shogi-halfkp81-depth18-v1r11-stage-b-run-fingerprint-v1",
      gate,
      sequence,
      teacher_plan: teacherPlan,
      source_revision: sourceRevision,
      formal_run_fingerprint: formalRunFingerprint,
      stage_a_verified_receipt: stageA,
      stage_b_epoch_namespace: epochNamespace,
      source_02_path: path.join(
        gateDirectory,
        `${String(sequence).padStart(2, "0")}-${gate}.source-02.bin`,
      ),
      source_03_path: path.join(
        gateDirectory,
        `${String(sequence).padStart(2, "0")}-${gate}.source-03.bin`,
      ),
    }),
  );
  if (
    ledger.status !==
      "preformal-engine-gate-power-continuity-complete-no-formal-authority" ||
    ledger.gate !== gate ||
    fingerprint !== expectedFingerprint ||
    ledger.stage_b_epoch_namespace !== epochNamespace ||
    fingerprint === formalRunFingerprint ||
    fingerprints.has(fingerprint) ||
    v1r11CanonicalJson(ledger.stage_a_verified_receipt) !==
      v1r11CanonicalJson(stageA) ||
    ledger.previous_entry_hash_chain_verified !== true ||
    receipt.status !==
      "preformal-engine-gate-power-continuity-independently-verified-no-formal-authority" ||
    receipt.gate !== gate ||
    receipt.stage_b_run_fingerprint !== fingerprint ||
    receipt.stage_b_epoch_namespace !== ledger.stage_b_epoch_namespace ||
    v1r11CanonicalJson(receipt.stage_a_verified_receipt) !==
      v1r11CanonicalJson(stageA) ||
    v1r11CanonicalJson(receipt.stage_b_power_ledger) !==
      v1r11CanonicalJson(source2) ||
    receipt.all_engines_reaped !== true ||
    v1r11CanonicalJson(receipt.authority) !==
      v1r11CanonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error(`${gate} power identity or reaping differs`);
  }
  const entries = [
    ledger.admission_entry,
    ...(Array.isArray(ledger.samples) ? ledger.samples : []),
    ledger.final_entry,
  ].map((entry, index) => object(entry, `${gate} power entry ${index}`));
  if (
    entries.length < 2 ||
    entries[0]?.entry_kind !== "admission" ||
    entries.at(-1)?.entry_kind !== "final"
  ) {
    throw new Error(`${gate} power ledger endpoints differ`);
  }
  const pmset = object(receipt.pmset_interval, `${gate} pmset interval`);
  exactKeys(
    pmset,
    [
      "start_anchor",
      "end_anchor",
      "raw_log_base64",
      "raw_log_bytes",
      "raw_log_sha256",
    ],
    `${gate} pmset interval`,
  );
  const pmsetRaw = Buffer.from(String(pmset.raw_log_base64), "base64");
  if (
    pmsetRaw.toString("base64") !== pmset.raw_log_base64 ||
    pmsetRaw.byteLength !== pmset.raw_log_bytes ||
    v1r11Sha256(pmsetRaw) !== pmset.raw_log_sha256 ||
    pmsetRaw.at(-1) !== 0x0a
  ) {
    throw new Error(`${gate} raw pmset transcript differs`);
  }
  const pmsetRows = pmsetRaw.toString("utf8").slice(0, -1).split("\n");
  let previous: string | null = null;
  let previousObservation: Readonly<Record<string, unknown>> | null = null;
  entries.forEach((entry, index) => {
    const { entry_sha256: digest, ...preimage } = entry;
    const expectedKind =
      index === 0
        ? "admission"
        : index === entries.length - 1
          ? "final"
          : "sample";
    const observation = object(
      entry.observation,
      `${gate} observation ${index}`,
    );
    const anchor = object(
      observation.pmset_start_anchor,
      `${gate} pmset start anchor ${index}`,
    );
    const cursor = object(
      observation.pmset_current_cursor,
      `${gate} pmset cursor ${index}`,
    );
    const anchorOrdinal = Number(anchor.pmset_event_ordinal);
    const cursorOrdinal = Number(cursor.pmset_event_ordinal);
    const previousOrdinal =
      previousObservation === null
        ? anchorOrdinal
        : Number(
            object(
              previousObservation.pmset_current_cursor,
              `${gate} previous cursor`,
            ).pmset_event_ordinal,
          );
    if (
      entry.schema !== "shogi-halfkp81-depth18-power-continuity-ledger-v1r11" ||
      entry.entry_kind !== expectedKind ||
      entry.status !== `${expectedKind}-pass` ||
      entry.run_fingerprint !== fingerprint ||
      v1r11CanonicalJson(entry.preformal_authority_verified_receipt) !==
        v1r11CanonicalJson(stageA) ||
      entry.previous_entry_sha256 !== previous ||
      digest !==
        v1r11Sha256(
          `shogi-halfkp81-depth18-power-continuity-entry-v1r11\0${v1r11CanonicalJson(preimage)}`,
        ) ||
      observation.power_source !== "AC Power" ||
      !Number.isSafeInteger(observation.battery_percentage) ||
      Number(observation.battery_percentage) < 80 ||
      observation.caffeinate_executable !== "/usr/bin/caffeinate" ||
      observation.caffeinate_assertion_holder_pid === observation.runner_pid ||
      observation.caffeinate_assertion_holder_parent_runner_pid !==
        observation.runner_pid ||
      observation.assertion_owner_caffeinate_pid !==
        observation.caffeinate_assertion_holder_pid ||
      v1r11CanonicalJson(observation.required_assertions) !==
        v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
      !Number.isSafeInteger(anchorOrdinal) ||
      !Number.isSafeInteger(cursorOrdinal) ||
      anchorOrdinal < 1 ||
      cursorOrdinal < previousOrdinal ||
      cursorOrdinal > pmsetRows.length ||
      anchor.last_raw_event_line_sha256 !==
        v1r11Sha256(pmsetRows[anchorOrdinal - 1] ?? "") ||
      cursor.last_raw_event_line_sha256 !==
        v1r11Sha256(pmsetRows[cursorOrdinal - 1] ?? "") ||
      pmsetRows
        .slice(previousOrdinal, cursorOrdinal)
        .some((line) =>
          /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}\s+(?:Sleep|DarkWake|Wake|Hibernate)\b/u.test(
            line,
          ),
        ) ||
      (previousObservation !== null &&
        Number(observation.observed_at_ms) -
          Number(previousObservation.observed_at_ms) >
          30_000)
    ) {
      throw new Error(`${gate} power hash chain differs`);
    }
    previous = String(digest);
    previousObservation = observation;
  });
  fingerprints.add(fingerprint);
}

async function verifyLiveLaunchAgent(
  identityValue: Readonly<V1R11AuthorityFileIdentity>,
  observer: Readonly<Halfkp81V1R11LiveLaunchAgentObserver>,
  teacherPlan: Readonly<V1R11AuthorityFileIdentity>,
  sourceRevision: string,
  runFingerprint: string,
  repositoryRoot: string,
): Promise<Readonly<Record<string, unknown>>> {
  const raw = await readV1R11HeldIdentity(
    identityValue,
    LAUNCH_SCHEMA,
    "final LaunchAgent authority",
  );
  const value = parseV1R11CanonicalObject(raw, "final LaunchAgent authority");
  exactKeys(
    value,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "observed_at_utc",
      "uid",
      "xpc_service_name",
      "label",
      "runner_pid",
      "working_directory",
      "stdout_path",
      "stderr_path",
      "program_arguments",
      "runner_utility_argv",
      "caffeinate_holder",
      "required_assertions",
      "launchctl_command",
      "launchctl_exit_code",
      "launchctl_print",
      "launchctl_stderr",
      "plist_source",
      "plist_snapshot",
      "ps_command",
      "ps_exit_code",
      "ps_stdout",
      "ps_stderr",
      "runner_process",
      "assertion_holder_process",
      "observed_process_group_rows",
      "observed_yaneuraou_engine_rows",
      "producer",
    ],
    "final LaunchAgent authority",
  );
  const holder = object(value.caffeinate_holder, "final caffeinate holder");
  const programArguments = value.program_arguments;
  const runnerUtilityArgv = value.runner_utility_argv;
  const plistSource = object(value.plist_source, "final plist source");
  const runnerProcess = finalLaunchProcessRow(
    value.runner_process,
    "runner",
    "final runner process",
  );
  const assertionHolderProcess = finalLaunchProcessRow(
    value.assertion_holder_process,
    "assertion-holder",
    "final assertion-holder process",
  );
  exactKeys(
    holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    "final caffeinate holder",
  );
  exactKeys(
    plistSource,
    [
      "plist_path",
      "realpath",
      "dev",
      "ino",
      "uid",
      "mode",
      "nlink",
      "bytes",
      "sha256",
    ],
    "final plist source",
  );
  if (
    value.schema !== LAUNCH_SCHEMA ||
    value.status !==
      "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority" ||
    v1r11CanonicalJson(value.teacher_plan) !==
      v1r11CanonicalJson(teacherPlan) ||
    value.source_revision !== sourceRevision ||
    value.run_fingerprint !== runFingerprint ||
    !Number.isSafeInteger(value.uid) ||
    Number(value.uid) < 1 ||
    typeof value.label !== "string" ||
    value.label !==
      `com.meetyudai.shogi.halfkp81-depth18-yaneura-only-v1r11-${sourceRevision.slice(0, 8)}` ||
    value.xpc_service_name !== value.label ||
    !Number.isSafeInteger(value.runner_pid) ||
    Number(value.runner_pid) < 1 ||
    !Array.isArray(programArguments) ||
    !Array.isArray(runnerUtilityArgv) ||
    v1r11CanonicalJson(programArguments) !==
      v1r11CanonicalJson(runnerUtilityArgv) ||
    holder.pid === value.runner_pid ||
    holder.parent_runner_pid !== value.runner_pid ||
    holder.assertion_owner_pid !== holder.pid ||
    holder.executable !== "/usr/bin/caffeinate" ||
    v1r11CanonicalJson(holder.argv) !==
      v1r11CanonicalJson([
        "/usr/bin/caffeinate",
        "-dimsu",
        "-w",
        String(value.runner_pid),
      ]) ||
    typeof value.working_directory !== "string" ||
    value.working_directory !== repositoryRoot ||
    typeof value.stdout_path !== "string" ||
    !path.isAbsolute(value.stdout_path) ||
    typeof value.stderr_path !== "string" ||
    !path.isAbsolute(value.stderr_path) ||
    typeof plistSource.plist_path !== "string" ||
    plistSource.plist_path !==
      path.join(
        process.env.HOME ?? "",
        "Library/LaunchAgents",
        `${String(value.label)}.plist`,
      ) ||
    plistSource.realpath !== plistSource.plist_path ||
    !path.isAbsolute(String(plistSource.plist_path)) ||
    plistSource.uid !== value.uid ||
    plistSource.mode !== 0o600 ||
    plistSource.nlink !== 1 ||
    v1r11CanonicalJson(value.ps_command) !==
      v1r11CanonicalJson(FINAL_LAUNCH_PS_COMMAND) ||
    value.ps_exit_code !== 0 ||
    runnerProcess.pid !== value.runner_pid ||
    runnerProcess.pgid !== value.runner_pid ||
    runnerProcess.executable !== runnerUtilityArgv[0] ||
    runnerProcess.argv !== runnerUtilityArgv.join(" ") ||
    assertionHolderProcess.pid !== holder.pid ||
    assertionHolderProcess.ppid !== value.runner_pid ||
    assertionHolderProcess.pgid !== value.runner_pid ||
    assertionHolderProcess.executable !== "/usr/bin/caffeinate" ||
    assertionHolderProcess.argv !==
      [
        "/usr/bin/caffeinate",
        "-dimsu",
        "-w",
        String(value.runner_pid),
      ].join(" ") ||
    !Array.isArray(value.observed_process_group_rows) ||
    v1r11CanonicalJson(value.observed_process_group_rows) !==
      v1r11CanonicalJson([runnerProcess, assertionHolderProcess]) ||
    !Array.isArray(value.observed_yaneuraou_engine_rows) ||
    value.observed_yaneuraou_engine_rows.length !== 0 ||
    v1r11CanonicalJson(value.producer) !==
      v1r11CanonicalJson(
        finalLaunchProducerIdentity(repositoryRoot, sourceRevision),
      )
  ) {
    throw new Error("final LaunchAgent semantic binding differs");
  }
  const printIdentity = identity(
    value.launchctl_print,
    undefined,
    "launchctl print",
  );
  const stderrIdentity = identity(
    value.launchctl_stderr,
    undefined,
    "launchctl stderr",
  );
  const plistIdentity = identity(
    value.plist_snapshot,
    undefined,
    "plist snapshot",
  );
  const psStdoutIdentity = identity(value.ps_stdout, undefined, "ps stdout");
  const psStderrIdentity = identity(value.ps_stderr, undefined, "ps stderr");
  if (
    psStdoutIdentity.path !==
      path.join(path.dirname(identityValue.path), "launchagent-ps.stdout.txt") ||
    psStdoutIdentity.schema !== "text/plain-exact-launchagent-ps-stdout" ||
    psStderrIdentity.path !==
      path.join(path.dirname(identityValue.path), "launchagent-ps.stderr.txt") ||
    psStderrIdentity.schema !== "text/plain-exact-launchagent-ps-stderr"
  ) {
    throw new Error("final LaunchAgent ps identity differs");
  }
  const [
    sealedPrint,
    sealedStderr,
    sealedPlist,
    sealedPsStdout,
    sealedPsStderr,
    live,
  ] = await Promise.all([
    readV1R11HeldIdentity(
      printIdentity,
      printIdentity.schema,
      "launchctl print",
    ),
    readV1R11HeldIdentity(
      stderrIdentity,
      stderrIdentity.schema,
      "launchctl stderr",
    ),
    readV1R11HeldIdentity(
      plistIdentity,
      plistIdentity.schema,
      "plist snapshot",
    ),
    readV1R11HeldIdentity(
      psStdoutIdentity,
      psStdoutIdentity.schema,
      "ps stdout",
    ),
    readV1R11HeldIdentity(
      psStderrIdentity,
      psStderrIdentity.schema,
      "ps stderr",
    ),
    observer.observe({ uid: Number(value.uid), label: String(value.label) }),
  ]);
  const verifyPs = (raw: Buffer) => {
    const rows = parseFinalLaunchPs(raw);
    const runnerRows = rows.filter((row) => row.pid === value.runner_pid);
    const holderRows = rows.filter((row) => row.pid === holder.pid);
    const runner = { ...runnerRows[0], role: "runner" };
    const holderRow = { ...holderRows[0], role: "assertion-holder" };
    const group = rows
      .filter((row) => row.pgid === value.runner_pid)
      .map((row) =>
        row.pid === value.runner_pid
          ? { ...row, role: "runner" }
          : row.pid === holder.pid
            ? { ...row, role: "assertion-holder" }
            : row,
      );
    if (
      runnerRows.length !== 1 || holderRows.length !== 1 ||
      v1r11CanonicalJson(runner) !== v1r11CanonicalJson(runnerProcess) ||
      v1r11CanonicalJson(holderRow) !== v1r11CanonicalJson(assertionHolderProcess) ||
      v1r11CanonicalJson(group) !== v1r11CanonicalJson(value.observed_process_group_rows) ||
      rows.some((row) => row.executable === FORMAL_ENGINE_PATH ||
        row.argv === FORMAL_ENGINE_PATH || String(row.argv).startsWith(`${FORMAL_ENGINE_PATH} `))
    ) throw new Error("final LaunchAgent ps topology differs");
  };
  verifyPs(sealedPsStdout);
  verifyPs(live.ps_stdout);
  if (
    !sealedPrint.equals(live.launchctl_stdout) ||
    !sealedStderr.equals(live.launchctl_stderr) ||
    !sealedPlist.equals(live.plist_bytes) ||
    sealedPsStderr.byteLength !== 0 ||
    live.ps_stderr.byteLength !== 0 ||
    value.launchctl_exit_code !== 0 ||
    v1r11CanonicalJson(value.launchctl_command) !==
      v1r11CanonicalJson([
        "/bin/launchctl",
        "print",
        `gui/${String(value.uid)}/${String(value.label)}`,
      ]) ||
    v1r11CanonicalJson(value.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS)
  ) {
    throw new Error("final LaunchAgent live requery differs");
  }
  return value;
}

function finalLaunchProducerIdentity(
  repositoryRoot: string,
  sourceRevision: string,
) {
  const entrypoint =
    "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts";
  const closure = Object.freeze([
    entrypoint,
    "ml/halfkp81-depth18-v1r11-authority-io.ts",
  ]);
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(
      closure.map((relativePath) => {
        const working = fs.readFileSync(path.join(repositoryRoot, relativePath));
        const tracked = execFileSync(
          "git",
          ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
          { encoding: null },
        );
        if (!working.equals(tracked)) {
          throw new Error(`final LaunchAgent producer ${relativePath} is not tracked source`);
        }
        return Object.freeze({
          path: relativePath,
          bytes: working.byteLength,
          sha256: v1r11Sha256(working),
        });
      }),
    ),
  });
}

function finalizerIdentity(repositoryRoot: string, sourceRevision: string) {
  const entrypoint = "ml/finalize-halfkp81-depth18-v1r11-staged-authority.ts";
  const closure = Object.freeze([
    entrypoint,
    "ml/halfkp81-depth18-v1r11-authority-io.ts",
  ]);
  return Object.freeze({
    source_revision: sourceRevision,
    entrypoint,
    dependency_closure: Object.freeze(
      closure.map((relativePath) => {
        const working = fs.readFileSync(
          path.join(repositoryRoot, relativePath),
        );
        const tracked = execFileSync(
          "git",
          ["-C", repositoryRoot, "show", `${sourceRevision}:${relativePath}`],
          { encoding: null },
        );
        if (!working.equals(tracked)) {
          throw new Error(`finalizer ${relativePath} is not tracked source`);
        }
        return Object.freeze({
          path: relativePath,
          bytes: working.byteLength,
          sha256: v1r11Sha256(working),
        });
      }),
    ),
  });
}

async function finalizeHalfkp81V1R11StagedAuthorityInternal(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
    liveLaunchAgentObserver: Readonly<Halfkp81V1R11LiveLaunchAgentObserver>;
  }>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  if (
    !REVISION_RE.test(request.sourceRevision) ||
    !SHA256_RE.test(request.runFingerprint) ||
    request.ledger.schema !== LEDGER_SCHEMA ||
    request.stageAReceipt.schema !== STAGE_A_SCHEMA ||
    request.launchAgentAuthority.schema !== LAUNCH_SCHEMA
  ) {
    throw new Error("finalizer context differs");
  }
  await assertV1R11AuthorityDirectory(request.authorityDirectory);
  await assertV1R11AuthorityDirectory(request.gateDirectory);
  const [ledgerRaw, stageARaw] = await Promise.all([
    readV1R11HeldIdentity(request.ledger, LEDGER_SCHEMA, "closed ledger"),
    readV1R11HeldIdentity(
      request.stageAReceipt,
      STAGE_A_SCHEMA,
      "Stage A receipt",
    ),
  ]);
  const stageA = parseV1R11CanonicalObject(stageARaw, "Stage A receipt");
  const prefix = identity(
    stageA.ledger_prefix,
    LEDGER_SCHEMA,
    "Stage A prefix",
  );
  if (
    stageA.status !==
      "control-plane-gates-independently-verified-preformal-engine-only-authority" ||
    stageA.source_revision !== request.sourceRevision ||
    stageA.run_fingerprint !== request.runFingerprint ||
    v1r11CanonicalJson(stageA.teacher_plan) !==
      v1r11CanonicalJson(request.teacherPlan) ||
    ledgerRaw.byteLength <= prefix.bytes ||
    v1r11Sha256(ledgerRaw.subarray(0, prefix.bytes)) !== prefix.sha256 ||
    ledgerRaw[prefix.bytes - 1] !== 0x0a
  ) {
    throw new Error("finalizer Stage A prefix differs");
  }
  const launch = await verifyLiveLaunchAgent(
    request.launchAgentAuthority,
    request.liveLaunchAgentObserver,
    request.teacherPlan,
    request.sourceRevision,
    request.runFingerprint,
    request.repositoryRoot,
  );
  const rows = parseLedger(ledgerRaw);
  const verifiedStageA = object(
    stageA.verified_gates,
    "Stage A verified gates",
  );
  const fingerprints = new Set<string>();
  const payloads = new Map<Gate, Readonly<Record<string, unknown>>>();
  const gates: Record<string, unknown> = {};
  let previousEntry: string | null = null;
  let previousReceipt: string | null = null;
  for (const [offset, gate] of GATES.entries()) {
    const sequence = offset + 1;
    const prefixName = String(sequence).padStart(2, "0");
    const row = rows[offset]!;
    exactKeys(
      row,
      [
        "schema",
        "sequence",
        "gate",
        "previous_entry_sha256",
        "teacher_plan",
        "source_revision",
        "run_fingerprint",
        "gate_evidence",
        "gate_receipt",
        "status",
        "producer",
        "entry_sha256",
      ],
      `${gate} ledger row`,
    );
    const { entry_sha256: entryDigest, ...entryPreimage } = row;
    if (
      row.schema !== LEDGER_SCHEMA ||
      row.sequence !== sequence ||
      row.gate !== gate ||
      row.previous_entry_sha256 !== previousEntry ||
      row.source_revision !== request.sourceRevision ||
      row.run_fingerprint !== request.runFingerprint ||
      row.status !== "pass-no-formal-authority" ||
      v1r11CanonicalJson(row.teacher_plan) !==
        v1r11CanonicalJson(request.teacherPlan) ||
      entryDigest !==
        v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(entryPreimage)}`)
    ) {
      throw new Error(`${gate} ledger chain differs`);
    }
    const receiptIdentity = identity(
      row.gate_receipt,
      RECEIPT_SCHEMA,
      `${gate} receipt`,
    );
    if (
      receiptIdentity.path !==
      path.join(
        request.gateDirectory.path,
        `${prefixName}-${gate}.receipt.json`,
      )
    ) {
      throw new Error(`${gate} receipt path differs`);
    }
    const receiptRaw = await readV1R11HeldIdentity(
      receiptIdentity,
      RECEIPT_SCHEMA,
      `${gate} receipt`,
    );
    const receipt = parseV1R11CanonicalObject(receiptRaw, `${gate} receipt`);
    exactKeys(
      receipt,
      [
        "schema",
        "status",
        "gate",
        "sequence",
        "teacher_plan",
        "source_revision",
        "run_fingerprint",
        "previous_gate_receipt_sha256",
        "evidence",
        "producer",
        "authority",
      ],
      `${gate} receipt`,
    );
    if (
      receipt.gate !== gate ||
      receipt.sequence !== sequence ||
      receipt.status !== "pass-no-formal-authority" ||
      receipt.previous_gate_receipt_sha256 !== previousReceipt ||
      receipt.source_revision !== request.sourceRevision ||
      receipt.run_fingerprint !== request.runFingerprint ||
      v1r11CanonicalJson(receipt.teacher_plan) !==
        v1r11CanonicalJson(request.teacherPlan) ||
      v1r11CanonicalJson(receipt.producer) !==
        v1r11CanonicalJson(row.producer) ||
      v1r11CanonicalJson(receipt.authority) !==
        v1r11CanonicalJson(FALSE_AUTHORITY)
    ) {
      throw new Error(`${gate} receipt chain differs`);
    }
    const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
    const evidenceIdentity = identity(
      receipt.evidence,
      evidenceSchema,
      `${gate} evidence`,
    );
    if (
      v1r11CanonicalJson(evidenceIdentity) !==
      v1r11CanonicalJson(row.gate_evidence)
    ) {
      throw new Error(`${gate} evidence ledger binding differs`);
    }
    const evidenceRaw = await readV1R11HeldIdentity(
      evidenceIdentity,
      evidenceSchema,
      `${gate} evidence`,
    );
    const evidence = parseV1R11CanonicalObject(evidenceRaw, `${gate} evidence`);
    exactKeys(
      evidence,
      [
        "schema",
        "status",
        "gate",
        "sequence",
        "teacher_plan",
        "source_revision",
        "run_fingerprint",
        "producer",
        "primary_sources",
        "payload",
        "produced_at_utc",
      ],
      `${gate} evidence`,
    );
    if (
      evidence.status !== "pass" ||
      evidence.gate !== gate ||
      evidence.sequence !== sequence ||
      evidence.source_revision !== request.sourceRevision ||
      evidence.run_fingerprint !== request.runFingerprint ||
      v1r11CanonicalJson(evidence.teacher_plan) !==
        v1r11CanonicalJson(request.teacherPlan) ||
      v1r11CanonicalJson(evidence.producer) !==
        v1r11CanonicalJson(row.producer) ||
      !Array.isArray(evidence.primary_sources)
    ) {
      throw new Error(`${gate} evidence binding differs`);
    }
    const expectedSources = sequence >= 8 && sequence <= 12 ? 3 : 1;
    const expectedKinds = expectedSourceKinds(gate);
    if (evidence.primary_sources.length !== expectedSources) {
      throw new Error(`${gate} primary source count differs`);
    }
    const sourceValues: Readonly<Record<string, unknown>>[] = [];
    for (
      let sourceOffset = 0;
      sourceOffset < expectedSources;
      sourceOffset += 1
    ) {
      const sourceSequence = sourceOffset + 1;
      const sourceIdentity = identity(
        evidence.primary_sources[sourceOffset],
        undefined,
        `${gate} source ${sourceSequence}`,
      );
      if (
        sourceIdentity.path !==
        path.join(
          request.gateDirectory.path,
          `${prefixName}-${gate}.source-${String(sourceSequence).padStart(2, "0")}.bin`,
        )
      ) {
        throw new Error(`${gate} primary source path differs`);
      }
      const sourceRaw = await readV1R11HeldIdentity(
        sourceIdentity,
        sourceIdentity.schema,
        `${gate} source ${sourceSequence}`,
      );
      const source = parseV1R11CanonicalObject(
        sourceRaw,
        `${gate} source ${sourceSequence}`,
      );
      const expectedKind = expectedKinds[sourceOffset]!;
      const expectedSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-${expectedKind}-v1`;
      exactKeys(
        source,
        [
          "schema",
          "status",
          "gate",
          "sequence",
          "source_sequence",
          "source_kind",
          "teacher_plan",
          "source_revision",
          "run_fingerprint",
          "producer",
          "content",
          "captured_at_utc",
        ],
        `${gate} source ${sourceSequence}`,
      );
      if (
        sourceIdentity.schema !== expectedSchema ||
        source.schema !== expectedSchema ||
        source.gate !== gate ||
        source.sequence !== sequence ||
        source.source_sequence !== sourceSequence ||
        source.source_revision !== request.sourceRevision ||
        source.run_fingerprint !== request.runFingerprint ||
        source.status !== "captured-primary-source-no-authority" ||
        source.source_kind !== expectedKind ||
        v1r11CanonicalJson(source.teacher_plan) !==
          v1r11CanonicalJson(request.teacherPlan) ||
        v1r11CanonicalJson(source.producer) !== v1r11CanonicalJson(row.producer)
      ) {
        throw new Error(`${gate} source envelope differs`);
      }
      sourceValues.push(source);
    }
    const payload = object(evidence.payload, `${gate} payload`);
    validateImplementationIdentity(
      row.producer,
      request.repositoryRoot,
      request.sourceRevision,
      `${gate} producer`,
    );
    payloads.set(gate, payload);
    if (sequence <= 7) {
      validateCapturedPayloadBinding(sourceValues[0]!.content, payload, gate);
      const stageASummary = object(
        verifiedStageA[gate],
        `${gate} Stage A summary`,
      );
      if (
        stageASummary.sequence !== sequence ||
        stageASummary.status !== "independently-verified" ||
        v1r11CanonicalJson(stageASummary.evidence) !==
          v1r11CanonicalJson(evidenceIdentity) ||
        v1r11CanonicalJson(stageASummary.receipt) !==
          v1r11CanonicalJson(receiptIdentity)
      ) {
        throw new Error(`${gate} Stage A verification binding differs`);
      }
    } else {
      const rawResult = decodeRawResult(sourceValues[0]!.content, gate);
      if (sequence <= 12) {
        validateStageBPayload(gate, payload, rawResult);
        validatePowerSources(
          gate,
          sequence,
          request.teacherPlan,
          request.sourceRevision,
          request.gateDirectory.path,
          request.stageAReceipt,
          evidence.primary_sources[1] as Readonly<V1R11AuthorityFileIdentity>,
          sourceValues[1]!.content,
          sourceValues[2]!.content,
          fingerprints,
          request.runFingerprint,
        );
      } else if (
        v1r11CanonicalJson(rawResult) !== v1r11CanonicalJson(payload) ||
        payload.power_source !== "AC Power" ||
        !Number.isSafeInteger(payload.battery_percentage) ||
        Number(payload.battery_percentage) < 80 ||
        v1r11CanonicalJson(payload.required_assertions) !==
          v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
        payload.assertion_owner_matches_caffeinate_pid !== true ||
        v1r11CanonicalJson(payload.launchagent_authority) !==
          v1r11CanonicalJson(request.launchAgentAuthority)
      ) {
        throw new Error("final AC admission semantics differ");
      }
    }
    gates[gate] = Object.freeze({
      sequence,
      status: "semantically-finalized",
      primary_sources: evidence.primary_sources,
      evidence: evidenceIdentity,
      receipt: receiptIdentity,
      ledger_entry_sha256: entryDigest,
    });
    previousEntry = String(entryDigest);
    previousReceipt = receiptIdentity.sha256;
  }
  const ready = payloads.get("ready-pr")!;
  const ci = payloads.get("all-required-ci-success")!;
  const merge = payloads.get("regular-merge")!;
  const clean = payloads.get("clean-main-source-authentication")!;
  if (
    ready.head_revision !== ci.head_revision ||
    ready.head_revision !== merge.authenticated_pr_head_revision ||
    ready.head_revision !== merge.second_parent_revision ||
    ready.base_revision !== merge.authenticated_base_revision ||
    ready.base_revision !== merge.first_parent_revision ||
    ready.pr_number !== ci.pr_number ||
    ready.base_branch !== "main" ||
    ready.base_branch !== merge.base_branch ||
    ready.base_branch !== clean.branch ||
    !Array.isArray(ci.required_checks) ||
    ci.required_checks.some(
      (entry) =>
        object(entry, "required CI check").head_revision !== ci.head_revision,
    ) ||
    ready.merge_revision !== request.sourceRevision ||
    merge.merge_revision !== request.sourceRevision ||
    clean.head_revision_before !== request.sourceRevision ||
    clean.main_revision !== request.sourceRevision ||
    clean.head_revision_after !== request.sourceRevision ||
    launch.runner_pid !==
      object(
        payloads.get("ac-power-start-admission-pass")!.power_admission_preimage,
        "power admission preimage",
      ).runner_pid
  ) {
    throw new Error("finalizer cross-gate equations differ");
  }
  return publishV1R11CreateOnlyCanonical(
    request.authorityDirectory,
    path.join(
      request.authorityDirectory.path,
      "preformal-authority-receipt.json",
    ),
    Object.freeze({
      schema: RAW_RECEIPT_SCHEMA,
      status:
        "all-required-preformal-gates-semantically-finalized-no-formal-authority",
      teacher_plan: request.teacherPlan,
      source_revision: request.sourceRevision,
      run_fingerprint: request.runFingerprint,
      required_order: REQUIRED_ORDER,
      ledger: request.ledger,
      gates: Object.freeze(gates),
      launchagent_authority: request.launchAgentAuthority,
      finalizer: finalizerIdentity(
        request.repositoryRoot,
        request.sourceRevision,
      ),
      authority: FALSE_AUTHORITY,
    }),
    RAW_RECEIPT_SCHEMA,
  );
}

/**
 * Test-only live-observation seam. The observer owns only launchctl/plist/ps
 * capture; all thirteen-row finalization equations and receipt publication
 * remain the production implementation.
 */
export async function finalizeHalfkp81V1R11StagedAuthorityWithOsBoundaryForTests(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  }>,
  observer: Readonly<Halfkp81V1R11LiveLaunchAgentObserver>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return finalizeHalfkp81V1R11StagedAuthorityInternal({
    ...request,
    liveLaunchAgentObserver: observer,
  });
}

function fixedLiveLaunchAgentObserver(
  authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>,
): Readonly<Halfkp81V1R11LiveLaunchAgentObserver> {
  return Object.freeze({
    async observe(request: Readonly<{ uid: number; label: string }>) {
      const command = ["print", `gui/${String(request.uid)}/${request.label}`];
      const launchctl_stdout = execFileSync("/bin/launchctl", command, {
        encoding: null,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const plistPath = path.join(
        process.env.HOME ?? "",
        "Library/LaunchAgents",
        `${request.label}.plist`,
      );
      const plist_bytes = await readV1R11HeldFile(
        plistPath,
        "finalizer live LaunchAgent plist",
      );
      const ps = spawnSync(
        FINAL_LAUNCH_PS_COMMAND[0],
        [...FINAL_LAUNCH_PS_COMMAND.slice(1)],
        { encoding: null, stdio: ["ignore", "pipe", "pipe"] },
      );
      if (
        ps.error !== undefined ||
        ps.status !== 0 ||
        ps.signal !== null ||
        !Buffer.isBuffer(ps.stdout) ||
        !Buffer.isBuffer(ps.stderr)
      ) {
        throw new Error("finalizer live ps command differs");
      }
      await assertV1R11CreateOnlyTargetAbsent(
        authorityDirectory,
        path.join(authorityDirectory.path, "preformal-terminal-fault.json"),
        "finalizer live requery terminal-fault collision",
      );
      return Object.freeze({
        launchctl_stdout,
        launchctl_stderr: Buffer.alloc(0),
        plist_bytes,
        ps_stdout: ps.stdout,
        ps_stderr: ps.stderr,
      });
    },
  });
}

/** Production entrypoint has a fixed live observer and no injected evidence seam. */
export async function finalizeHalfkp81V1R11ProductionStagedAuthority(
  request: Readonly<{
    repositoryRoot: string;
    teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
    sourceRevision: string;
    runFingerprint: string;
    authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
    formalRunIntent?: Readonly<Halfkp81V1R11FormalRunIntentInput>;
  }>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  if (
    request.formalRunIntent === undefined ||
    halfkp81V1R11FormalRunFingerprintV2(request.formalRunIntent) !==
      request.runFingerprint
  ) {
    throw new Error("production finalizer formal-run-intent-v2 differs");
  }
  const faultPath = path.join(
    request.authorityDirectory.path,
    "preformal-terminal-fault.json",
  );
  let ledgerPrefix: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let lastGateReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let rawReceipt: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let activeBinding: ReturnType<
    typeof halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure
  > | null = null;
  try {
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      faultPath,
      "finalizer terminal-fault collision",
    );
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      path.join(
        request.authorityDirectory.path,
        "preformal-authority-receipt.json",
      ),
      "finalizer raw receipt collision",
    );
    if (
      request.authorityDirectory.path !==
      "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority"
    ) {
      throw new Error("production finalizer authority namespace differs");
    }
    if (
      request.gateDirectory.path !==
        path.join(request.authorityDirectory.path, "preformal-gates") ||
      request.ledger.path !==
        path.join(
          request.authorityDirectory.path,
          "preformal-authority-ledger.jsonl",
        ) ||
      execFileSync("git", ["-C", request.repositoryRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim() !== request.sourceRevision
    ) {
      throw new Error("production finalizer source or paths differ");
    }
    await readV1R11HeldIdentity(
      request.teacherPlan,
      request.teacherPlan.schema,
      "production finalizer teacher plan",
    );
    const launchAuthorityRaw = await readV1R11HeldIdentity(
      request.launchAgentAuthority,
      request.launchAgentAuthority.schema,
      "production finalizer active LaunchAgent authority",
    );
    activeBinding = halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure(
      parseV1R11CanonicalObject(
        launchAuthorityRaw,
        "production finalizer active LaunchAgent authority",
      ),
    );
    finalizerIdentity(request.repositoryRoot, request.sourceRevision);
    const stageARaw = await readV1R11HeldIdentity(
      request.stageAReceipt,
      STAGE_A_SCHEMA,
      "finalizer Stage A receipt",
    );
    ledgerPrefix = identity(
      parseV1R11CanonicalObject(stageARaw, "finalizer Stage A receipt")
        .ledger_prefix,
      LEDGER_SCHEMA,
      "finalizer Stage A ledger prefix",
    );
    const ledgerRaw = await readV1R11HeldIdentity(
      request.ledger,
      LEDGER_SCHEMA,
      "finalizer closed ledger",
    );
    const ledgerRows = parseLedger(ledgerRaw);
    lastGateReceipt = identity(
      ledgerRows.at(-1)!.gate_receipt,
      RECEIPT_SCHEMA,
      "finalizer gate 13 receipt",
    );
    await readV1R11HeldIdentity(
      lastGateReceipt,
      RECEIPT_SCHEMA,
      "finalizer gate 13 receipt",
    );
    rawReceipt = await finalizeHalfkp81V1R11StagedAuthorityInternal({
      ...request,
      liveLaunchAgentObserver: fixedLiveLaunchAgentObserver(
        request.authorityDirectory,
      ),
    });
    await assertV1R11CreateOnlyTargetAbsent(
      request.authorityDirectory,
      faultPath,
      "finalizer post-publication terminal-fault collision",
    );
    return rawReceipt;
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    throw new Halfkp81V1R11PreformalStageFailure({
      phase: "finalizer",
      gate: "ac-power-start-admission-pass",
      sequence: 13,
      runnerState: "active",
      failure,
      artifacts: Object.freeze({
        ledgerPrefix,
        lastGateReceipt,
        engineGateVerifiedReceipt: request.stageAReceipt,
        launchAgentAuthority: request.launchAgentAuthority,
        activeLaunchAgent: activeBinding?.activeLaunchAgent ?? null,
        runnerIdentity: activeBinding?.runnerIdentity ?? null,
        partialArtifacts: Object.freeze(
          rawReceipt === null ? [] : [rawReceipt],
        ),
      }),
    });
  }
}
