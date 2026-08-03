import { execFileSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  appendV1R11CanonicalLedgerRow,
  assertV1R11CreateOnlyTargetAbsent,
  assertV1R11AuthorityDirectory,
  parseV1R11CanonicalObject,
  publishV1R11CreateOnlyCanonical,
  readV1R11HeldFile,
  readV1R11HeldIdentity,
  v1r11CanonicalLine,
  v1r11CanonicalJson,
  v1r11Sha256,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import {
  verifyHalfkp81V1R11FrozenStageBPowerLedger,
  type Halfkp81V1R11FrozenPowerEntry,
} from "./halfkp81-depth18-v1r11-stage-b-power-verifier";
import { Halfkp81V1R11PreformalStageFailure } from "./halfkp81-depth18-v1r11-preformal-stage-failure";
import {
  buildHalfkp81V1R11StageCExpectedPlistForTests,
  HALFKP81_V1R11_FINAL_LAUNCHAGENT_SCHEMA,
  HALFKP81_V1R11_REQUIRED_ASSERTIONS,
  parseHalfkp81V1R11StageCAssertionsForTests,
  parseHalfkp81V1R11StageCBatteryForTests,
  validateHalfkp81V1R11StageCLaunchctlForTests,
  validateHalfkp81V1R11StageCLaunchEvidenceForTests,
  validateHalfkp81V1R11StageCRawCapturesForTests,
} from "./halfkp81-depth18-v1r11-stage-c-live-evidence";
import {
  halfkp81V1R11FormalRunFingerprintV2,
  type Halfkp81V1R11FormalRunIntentInput,
} from "./halfkp81-depth18-v1r11-formal-run-intent";
import {
  buildHalfkp81V1R11ExactPowerGuardianCommand,
  buildHalfkp81V1R11StageBOneShotPlist,
  Halfkp81V1R11StageBLaunchAgentSupervisorError,
  parseHalfkp81V1R11StageBLaunchctlPrintForTests,
  parseHalfkp81V1R11StageBPsForTests,
  superviseHalfkp81V1R11StageBLaunchAgent,
} from "./halfkp81-depth18-v1r11-stage-b-launchagent-supervisor";

const STAGE_A_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11";
const LEDGER_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11";
const RECEIPT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11";
const LEDGER_DOMAIN =
  "shogi-halfkp81-depth18-v1r11-preformal-authority-ledger-entry-v1\0";
const AUTHORITY_DIRECTORY =
  "/Users/yudaiyaguchi/.codex/shogi-runs/halfkp81-hard-depth18-yaneura-only-v1r11-authority";
const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});
const STAGE_A_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: true,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
});
const SHA256_RE = /^[0-9a-f]{64}$/u;
const REVISION_RE = /^[0-9a-f]{40}$/u;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const REQUIRED_ASSERTIONS = HALFKP81_V1R11_REQUIRED_ASSERTIONS;

export const HALFKP81_V1R11_STAGE_B_GATES = Object.freeze([
  "candidate-order-gate",
  "known10-probe",
  "pathological-fallback-probe",
  "mixed-load-gate",
  "formal-like-512",
] as const);

export type Halfkp81V1R11StageBGate =
  (typeof HALFKP81_V1R11_STAGE_B_GATES)[number];

const SOURCE_KINDS = Object.freeze({
  "candidate-order-gate": "candidate-order-receipt-and-transcript-bundle",
  "known10-probe": "known10-probe-receipt-and-transcript-bundle",
  "pathological-fallback-probe":
    "pathological-probe-receipt-and-transcript-bundle",
  "mixed-load-gate": "mixed-load-receipt-and-transcript-bundle",
  "formal-like-512": "formal-like-512-verified-receipt-and-transcript-bundle",
} satisfies Readonly<Record<Halfkp81V1R11StageBGate, string>>);

export interface Halfkp81V1R11RawCommandCapture {
  readonly collector: Readonly<Record<string, unknown>>;
  readonly request_or_command: readonly string[];
  readonly exit_code: number;
  readonly stdout: Buffer;
  readonly stderr: Buffer;
  readonly captured_at_utc: string;
}

export interface Halfkp81V1R11StageBCollector {
  collectGate(
    gate: Halfkp81V1R11StageBGate,
    context: Readonly<{
      sequence: number;
      stage_b_run_fingerprint: string;
      stage_b_epoch_namespace: string;
    }>,
  ): Promise<Readonly<Halfkp81V1R11RawCommandCapture>>;
}

export interface Halfkp81V1R11StageBContext {
  readonly repositoryRoot: string;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly formalRunFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly gateDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly currentLedger: Readonly<V1R11AuthorityFileIdentity>;
  readonly previousGateReceipt: Readonly<V1R11AuthorityFileIdentity>;
  readonly formalRunIntent?: Readonly<Halfkp81V1R11FormalRunIntentInput>;
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  label: string,
): void {
  if (
    v1r11CanonicalJson(Object.keys(value).sort()) !==
    v1r11CanonicalJson([...expected].sort())
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

function integer(value: unknown, minimum: number, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new Error(`${label} differs`);
  }
  return Number(value);
}

function isoUtc(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !ISO_UTC_RE.test(value) ||
    new Date(value).toISOString() !== value
  ) {
    throw new Error(`${label} differs`);
  }
  return value;
}

function assertIdentity(
  value: unknown,
  expectedSchema: string | undefined,
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
    (expectedSchema !== undefined && row.schema !== expectedSchema)
  ) {
    throw new Error(`${label} differs`);
  }
  return row as unknown as Readonly<V1R11AuthorityFileIdentity>;
}

function expectedSourceSchema(
  gate: Halfkp81V1R11StageBGate,
  kind: string,
): string {
  return `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-${kind}-v1`;
}

function validateStageBGatePayload(
  gate: Halfkp81V1R11StageBGate,
  payload: Readonly<Record<string, unknown>>,
): void {
  const common = [
    "stage_a_verified_receipt",
    "stage_b_power_ledger",
    "stage_b_power_receipt",
  ];
  switch (gate) {
    case "candidate-order-gate": {
      exactKeys(
        payload,
        [
          "parents",
          "candidate_set",
          "normal_candidate_order_digest",
          "fallback_candidate_order_digest",
          "publication_order_digest",
          "mismatches",
          "technical_faults",
          ...common,
        ],
        gate,
      );
      integer(payload.parents, 1, `${gate} parents`);
      if (
        typeof payload.candidate_set !== "string" ||
        payload.candidate_set.length < 1 ||
        !SHA256_RE.test(String(payload.normal_candidate_order_digest)) ||
        payload.normal_candidate_order_digest !==
          payload.fallback_candidate_order_digest ||
        payload.normal_candidate_order_digest !==
          payload.publication_order_digest ||
        payload.mismatches !== 0 ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} semantics differ`);
      }
      return;
    }
    case "known10-probe": {
      exactKeys(
        payload,
        [
          "parents",
          "moves",
          "fixed_expected_identities",
          "actual_exact_depth18_identities",
          "mismatches",
          "technical_faults",
          ...common,
        ],
        gate,
      );
      if (
        payload.parents !== 8 ||
        payload.moves !== 10 ||
        !Array.isArray(payload.fixed_expected_identities) ||
        payload.fixed_expected_identities.length !== 10 ||
        v1r11CanonicalJson(payload.fixed_expected_identities) !==
          v1r11CanonicalJson(payload.actual_exact_depth18_identities) ||
        payload.mismatches !== 0 ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} semantics differ`);
      }
      return;
    }
    case "pathological-fallback-probe": {
      exactKeys(
        payload,
        [
          "parent_id",
          "normal_partial_rows_published",
          "capped_rows_published",
          "fallback_exact_depth18_identity",
          "fixed_hash8192_identity",
          "technical_faults",
          ...common,
        ],
        gate,
      );
      if (
        payload.parent_id !==
          "sha256:622377e74345bfcbe509b903ae89e37dfec48e493db0331780b5423382d926a1" ||
        payload.normal_partial_rows_published !== 0 ||
        payload.capped_rows_published !== 0 ||
        v1r11CanonicalJson(payload.fallback_exact_depth18_identity) !==
          v1r11CanonicalJson(payload.fixed_hash8192_identity) ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} semantics differ`);
      }
      return;
    }
    case "mixed-load-gate": {
      exactKeys(
        payload,
        [
          "normal_engines",
          "normal_hash_mib_each",
          "fallback_engines",
          "fallback_hash_mib_each",
          "maximum_normal_active",
          "maximum_fallback_active",
          "process_observations",
          "technical_faults",
          ...common,
        ],
        gate,
      );
      if (
        payload.normal_engines !== 8 ||
        payload.normal_hash_mib_each !== 512 ||
        payload.fallback_engines !== 2 ||
        payload.fallback_hash_mib_each !== 8_192 ||
        integer(payload.maximum_normal_active, 0, `${gate} normal active`) >
          8 ||
        integer(payload.maximum_fallback_active, 0, `${gate} fallback active`) >
          2 ||
        !Array.isArray(payload.process_observations) ||
        payload.process_observations.length < 1 ||
        payload.technical_faults !== 0
      ) {
        throw new Error(`${gate} semantics differ`);
      }
      return;
    }
    case "formal-like-512": {
      exactKeys(
        payload,
        [
          "parents",
          "completed_parents",
          "technical_faults",
          "teacher_contract_equal_formal",
          "power_semantics_equal_formal",
          "run_specific_identity_fields_excluded_from_equality",
          "artifact_verified_receipt",
          ...common,
        ],
        gate,
      );
      assertIdentity(
        payload.artifact_verified_receipt,
        undefined,
        `${gate} artifact`,
      );
      if (
        payload.parents !== 512 ||
        payload.completed_parents !== 512 ||
        payload.technical_faults !== 0 ||
        payload.teacher_contract_equal_formal !== true ||
        payload.power_semantics_equal_formal !== true ||
        !Array.isArray(
          payload.run_specific_identity_fields_excluded_from_equality,
        ) ||
        payload.run_specific_identity_fields_excluded_from_equality.length < 1
      ) {
        throw new Error(`${gate} semantics differ`);
      }
    }
  }
}

function stageBSourceContent(
  capture: Readonly<Halfkp81V1R11RawCommandCapture>,
): Readonly<Record<string, unknown>> {
  isoUtc(capture.captured_at_utc, "stage B capture time");
  if (
    !Array.isArray(capture.request_or_command) ||
    capture.request_or_command.length < 1 ||
    capture.request_or_command.some(
      (entry) => typeof entry !== "string" || entry.length < 1,
    ) ||
    capture.exit_code !== 0
  ) {
    throw new Error("stage B command capture differs");
  }
  const parsed = parseV1R11CanonicalObject(
    capture.stdout,
    "stage B gate stdout",
  );
  return Object.freeze({
    collector: capture.collector,
    request_or_command: capture.request_or_command,
    exit_code: capture.exit_code,
    stdout_base64: capture.stdout.toString("base64"),
    stdout_bytes: capture.stdout.byteLength,
    stdout_sha256: v1r11Sha256(capture.stdout),
    stderr_base64: capture.stderr.toString("base64"),
    stderr_bytes: capture.stderr.byteLength,
    stderr_sha256: v1r11Sha256(capture.stderr),
    parsed_canonical_json: parsed,
  });
}

function validateStageBLaunchAgentEvidence(
  value: unknown,
  context: Readonly<{
    gate: Halfkp81V1R11StageBGate;
    fingerprint: string;
    epochNamespace: string;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
  }>,
): Readonly<Record<string, unknown>> {
  const evidence = object(
    value,
    `${context.gate} Stage B LaunchAgent evidence`,
  );
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "gate",
      "stage_b_run_fingerprint",
      "stage_b_epoch_namespace",
      "stage_a_verified_receipt",
      "label",
      "uid",
      "xpc_service_name",
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
      "launchctl_stdout_base64",
      "launchctl_stderr_base64",
      "plist_source",
      "plist_snapshot_base64",
      "authority",
    ],
    `${context.gate} Stage B LaunchAgent evidence`,
  );
  const programArguments = evidence.program_arguments;
  const utility = evidence.runner_utility_argv;
  const holder = object(
    evidence.caffeinate_holder,
    `${context.gate} caffeinate holder`,
  );
  exactKeys(
    holder,
    ["pid", "parent_runner_pid", "assertion_owner_pid", "executable", "argv"],
    `${context.gate} caffeinate holder`,
  );
  const stdout = Buffer.from(
    String(evidence.launchctl_stdout_base64),
    "base64",
  );
  const stderr = Buffer.from(
    String(evidence.launchctl_stderr_base64),
    "base64",
  );
  const plist = Buffer.from(String(evidence.plist_snapshot_base64), "base64");
  const plistSource = object(
    evidence.plist_source,
    `${context.gate} Stage B plist source`,
  );
  if (
    evidence.schema !==
      `shogi-halfkp81-depth18-yaneura-only-v1r11-${context.gate}-stage-b-launchagent-evidence-v1` ||
    evidence.status !==
      "preformal-engine-gate-live-LaunchAgent-semantics-verified-no-standalone-authority" ||
    evidence.gate !== context.gate ||
    evidence.stage_b_run_fingerprint !== context.fingerprint ||
    evidence.stage_b_epoch_namespace !== context.epochNamespace ||
    v1r11CanonicalJson(evidence.stage_a_verified_receipt) !==
      v1r11CanonicalJson(context.stageAReceipt) ||
    !Number.isSafeInteger(evidence.uid) ||
    Number(evidence.uid) < 1 ||
    !Number.isSafeInteger(evidence.runner_pid) ||
    Number(evidence.runner_pid) < 1 ||
    typeof evidence.label !== "string" ||
    evidence.xpc_service_name !== evidence.label ||
    !Array.isArray(programArguments) ||
    !Array.isArray(utility) ||
    v1r11CanonicalJson(programArguments) !==
      v1r11CanonicalJson(["/usr/bin/caffeinate", "-dimsu", ...utility]) ||
    holder.pid === evidence.runner_pid ||
    holder.parent_runner_pid !== evidence.runner_pid ||
    holder.assertion_owner_pid !== holder.pid ||
    holder.executable !== "/usr/bin/caffeinate" ||
    v1r11CanonicalJson(holder.argv) !== v1r11CanonicalJson(programArguments) ||
    v1r11CanonicalJson(evidence.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    v1r11CanonicalJson(evidence.launchctl_command) !==
      v1r11CanonicalJson([
        "/bin/launchctl",
        "print",
        `gui/${String(evidence.uid)}/${String(evidence.label)}`,
      ]) ||
    evidence.launchctl_exit_code !== 0 ||
    stdout.toString("base64") !== evidence.launchctl_stdout_base64 ||
    stderr.toString("base64") !== evidence.launchctl_stderr_base64 ||
    plist.toString("base64") !== evidence.plist_snapshot_base64 ||
    stdout.byteLength < 1 ||
    stderr.byteLength !== 0 ||
    plist.byteLength < 1 ||
    v1r11CanonicalJson(evidence.authority) !==
      v1r11CanonicalJson(FALSE_AUTHORITY)
  ) {
    throw new Error(`${context.gate} Stage B LaunchAgent semantics differ`);
  }
  const launchctl = stdout.toString("utf8");
  if (!Buffer.from(launchctl, "utf8").equals(stdout)) {
    throw new Error(`${context.gate} Stage B launchctl is not exact UTF-8`);
  }
  const unique = (key: string): string => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    const matches = [
      ...launchctl.matchAll(new RegExp(`^\\t${escaped} = (.+)$`, "gmu")),
    ];
    if (matches.length !== 1 || matches[0]?.[1] === undefined) {
      throw new Error(`${context.gate} Stage B launchctl ${key} differs`);
    }
    return matches[0][1];
  };
  const argumentsStart = launchctl.indexOf("\n\targuments = {\n");
  const argumentsEnd = launchctl.indexOf("\n\t}\n", argumentsStart + 1);
  if (
    !launchctl.startsWith(
      `gui/${String(evidence.uid)}/${String(evidence.label)} = {\n`,
    ) ||
    argumentsStart < 0 ||
    argumentsEnd < 0 ||
    launchctl.indexOf("\n\targuments = {\n", argumentsStart + 1) !== -1
  ) {
    throw new Error(`${context.gate} Stage B launchctl syntax differs`);
  }
  const launchctlArguments = launchctl
    .slice(argumentsStart + "\n\targuments = {\n".length, argumentsEnd)
    .split("\n")
    .map((line) => /^\t\t(.+)$/u.exec(line)?.[1] ?? "");
  const properties = unique("properties")
    .split("|")
    .map((entry) => entry.trim());
  if (
    v1r11CanonicalJson(launchctlArguments) !==
      v1r11CanonicalJson(programArguments) ||
    unique("state") !== "running" ||
    unique("type") !== "LaunchAgent" ||
    unique("program") !== "/usr/bin/caffeinate" ||
    unique("path") !== plistSource.path ||
    unique("working directory") !== evidence.working_directory ||
    unique("stdout path") !== evidence.stdout_path ||
    unique("stderr path") !== evidence.stderr_path ||
    unique("pid") !== String(evidence.runner_pid) ||
    !properties.includes("launch only once") ||
    properties.includes("keepalive")
  ) {
    throw new Error(`${context.gate} Stage B launchctl semantics differ`);
  }
  return evidence;
}

function stageBExecutionEnvelope(
  value: unknown,
  context: Readonly<{
    gate: Halfkp81V1R11StageBGate;
    sequence: number;
    fingerprint: string;
    epochNamespace: string;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    expectedLabel: string;
    expectedCommand: readonly string[];
    expectedWorkingDirectory: string;
    expectedPlistPath: string;
    expectedStdoutPath: string;
    expectedStderrPath: string;
  }>,
): Readonly<{
  gateResult: Readonly<Record<string, unknown>>;
  launchAgentEvidence: Readonly<Record<string, unknown>>;
  powerEntries: readonly Readonly<Halfkp81V1R11FrozenPowerEntry>[];
  pmsetInterval: Readonly<Record<string, unknown>>;
  verifier: Readonly<Record<string, unknown>>;
  processCleanup: Readonly<Record<string, unknown>>;
  osReapEvidence: Readonly<Record<string, unknown>>;
  observedAuxiliaryRows: readonly Readonly<Record<string, unknown>>[];
}> {
  const parent = validateStageBParentEnvelope(value, context);
  const envelope = parent.inner;
  exactKeys(
    envelope,
    [
      "schema",
      "status",
      "gate",
      "sequence",
      "stage_b_run_fingerprint",
      "stage_b_epoch_namespace",
      "stage_a_verified_receipt",
      "gate_result",
      "launchagent_evidence",
      "power_entries",
      "pmset_interval",
      "verifier",
      "process_cleanup",
      "os_reap_evidence",
    ],
    `${context.gate} fixed executor result`,
  );
  const cleanup = object(envelope.process_cleanup, `${context.gate} cleanup`);
  exactKeys(
    cleanup,
    [
      "scheduling_stopped",
      "engines_started",
      "engines_terminated",
      "engines_reaped",
      "remaining_engine_pids",
      "children_reaped",
      "next_job_started",
    ],
    `${context.gate} cleanup`,
  );
  const osReapEvidence =
    validateHalfkp81V1R11StageBOsReapEvidenceForTests(
      envelope.os_reap_evidence,
      cleanup,
      context.gate,
    );
  if (
    envelope.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-fixed-executor-result-v1" ||
    envelope.status !== "completed-no-formal-authority" ||
    envelope.gate !== context.gate ||
    envelope.sequence !== context.sequence ||
    envelope.stage_b_run_fingerprint !== context.fingerprint ||
    envelope.stage_b_epoch_namespace !== context.epochNamespace ||
    v1r11CanonicalJson(envelope.stage_a_verified_receipt) !==
      v1r11CanonicalJson(context.stageAReceipt) ||
    cleanup.scheduling_stopped !== true ||
    !Number.isSafeInteger(cleanup.engines_started) ||
    !Number.isSafeInteger(cleanup.engines_terminated) ||
    !Number.isSafeInteger(cleanup.engines_reaped) ||
    cleanup.engines_started !== cleanup.engines_reaped ||
    cleanup.engines_terminated !== cleanup.engines_reaped ||
    !Array.isArray(cleanup.remaining_engine_pids) ||
    cleanup.remaining_engine_pids.length !== 0 ||
    cleanup.children_reaped !== true ||
    cleanup.next_job_started !== false ||
    !Array.isArray(envelope.power_entries) ||
    envelope.power_entries.length < 2
  ) {
    throw new Error(`${context.gate} fixed executor/reap handoff differs`);
  }
  const launchAgentEvidence = validateStageBLaunchAgentEvidence(
    envelope.launchagent_evidence,
    {
      gate: context.gate,
      fingerprint: context.fingerprint,
      epochNamespace: context.epochNamespace,
      stageAReceipt: context.stageAReceipt,
    },
  );
  const holder = object(
    launchAgentEvidence.caffeinate_holder,
    `${context.gate} caffeinate holder cross-binding`,
  );
  const parentRows = parent.evidence.observedEngineRows;
  const enginePids = osReapEvidence.engine_pids as readonly number[];
  const enginePgids = osReapEvidence.engine_pgids as readonly number[];
  const engineTokens = osReapEvidence.engine_start_tokens as readonly string[];
  const innerEngineRows = Object.freeze(
    enginePids
      .map((pid, index) =>
        Object.freeze({
          pid,
          pgid: enginePgids[index],
          start_token: engineTokens[index],
        }),
      )
      .sort((left, right) => left.pid - right.pid),
  );
  const outerEngineRows = Object.freeze(
    parentRows
      .map((row) =>
        Object.freeze({
          pid: Number(row.pid),
          pgid: Number(row.pgid),
          start_token: String(row.start_token),
        }),
      )
      .sort((left, right) => left.pid - right.pid),
  );
  const plistSnapshot = Buffer.from(
    String(launchAgentEvidence.plist_snapshot_base64),
    "base64",
  );
  const expectedPlist = buildHalfkp81V1R11StageBOneShotPlist({
    label: context.expectedLabel,
    workingDirectory: context.expectedWorkingDirectory,
    stdoutPath: context.expectedStdoutPath,
    stderrPath: context.expectedStderrPath,
    utilityArgv: context.expectedCommand,
  });
  if (
    launchAgentEvidence.label !== context.expectedLabel ||
    launchAgentEvidence.uid !== parent.evidence.value.uid ||
    launchAgentEvidence.runner_pid !== parent.evidence.runnerPid ||
    launchAgentEvidence.working_directory !== context.expectedWorkingDirectory ||
    launchAgentEvidence.stdout_path !== context.expectedStdoutPath ||
    launchAgentEvidence.stderr_path !== context.expectedStderrPath ||
    v1r11CanonicalJson(launchAgentEvidence.program_arguments) !==
      v1r11CanonicalJson(parent.evidence.programArguments) ||
    holder.pid !== parent.evidence.value.assertion_holder_pid ||
    holder.parent_runner_pid !== parent.evidence.runnerPid ||
    v1r11CanonicalJson(launchAgentEvidence.plist_source) !==
      v1r11CanonicalJson(parent.evidence.plistSource) ||
    plistSnapshot.toString("base64") !==
      launchAgentEvidence.plist_snapshot_base64 ||
    plistSnapshot.byteLength !== parent.evidence.plistSource.bytes ||
    v1r11Sha256(plistSnapshot) !== parent.evidence.plistSource.sha256 ||
    !plistSnapshot.equals(expectedPlist) ||
    osReapEvidence.observer_pid !== parent.evidence.runnerPid ||
    v1r11CanonicalJson(innerEngineRows) !==
      v1r11CanonicalJson(outerEngineRows)
  ) {
    throw new Error(`${context.gate} parent/child job evidence differs`);
  }
  return Object.freeze({
    gateResult: object(envelope.gate_result, `${context.gate} gate result`),
    launchAgentEvidence,
    powerEntries:
      envelope.power_entries as readonly Readonly<Halfkp81V1R11FrozenPowerEntry>[],
    pmsetInterval: object(
      envelope.pmset_interval,
      `${context.gate} pmset interval`,
    ),
    verifier: object(envelope.verifier, `${context.gate} power verifier`),
    processCleanup: cleanup,
    osReapEvidence,
    observedAuxiliaryRows: parent.evidence.observedAuxiliaryRows,
  });
}

export function validateHalfkp81V1R11StageBExecutionEnvelopeForTests(
  value: unknown,
  context: Readonly<{
    gate: Halfkp81V1R11StageBGate;
    sequence: number;
    fingerprint: string;
    epochNamespace: string;
    stageAReceipt: Readonly<V1R11AuthorityFileIdentity>;
    expectedLabel: string;
    expectedCommand: readonly string[];
    expectedWorkingDirectory: string;
    expectedPlistPath: string;
    expectedStdoutPath: string;
    expectedStderrPath: string;
  }>,
) {
  return stageBExecutionEnvelope(value, context);
}

export function validateHalfkp81V1R11StageBOsReapEvidenceForTests(
  value: unknown,
  cleanupValue: unknown,
  gate = "Stage B",
): Readonly<Record<string, unknown>> {
  const evidence = object(value, `${gate} OS reap evidence`);
  const cleanup = object(cleanupValue, `${gate} process cleanup`);
  exactKeys(
    evidence,
    [
      "observer_pid",
      "engine_pids",
      "engine_pgids",
      "engine_start_tokens",
      "direct_parent_matches",
      "dedicated_process_groups_verified",
      "kill_zero_esrch_after_close",
      "ps_rows_absent_after_close",
      "process_group_members_absent_after_close",
      "remaining_descendant_pids",
      "remaining_process_group_pids",
    ],
    `${gate} OS reap evidence`,
  );
  const pids = evidence.engine_pids;
  const pgids = evidence.engine_pgids;
  const startTokens = evidence.engine_start_tokens;
  const remaining = evidence.remaining_descendant_pids;
  const remainingGroup = evidence.remaining_process_group_pids;
  if (
    !Number.isSafeInteger(evidence.observer_pid) ||
    Number(evidence.observer_pid) < 1 ||
    !Array.isArray(pids) ||
    pids.length < 1 ||
    pids.some((pid) => !Number.isSafeInteger(pid) || Number(pid) < 1) ||
    new Set(pids).size !== pids.length ||
    pids.includes(evidence.observer_pid) ||
    !Array.isArray(pgids) ||
    pgids.length !== pids.length ||
    pgids.some((pgid) => !Number.isSafeInteger(pgid) || Number(pgid) < 1) ||
    new Set(pgids).size !== 1 ||
    !Array.isArray(startTokens) ||
    startTokens.length !== pids.length ||
    startTokens.some(
      (token) => typeof token !== "string" || token.length < 20,
    ) ||
    pgids.some((pgid) => pgid !== evidence.observer_pid) ||
    evidence.direct_parent_matches !== pids.length ||
    evidence.dedicated_process_groups_verified !== pids.length ||
    evidence.kill_zero_esrch_after_close !== pids.length ||
    evidence.ps_rows_absent_after_close !== pids.length ||
    evidence.process_group_members_absent_after_close !== pids.length ||
    !Array.isArray(remaining) ||
    remaining.length !== 0 ||
    !Array.isArray(remainingGroup) ||
    remainingGroup.length !== 0 ||
    cleanup.engines_started !== pids.length ||
    cleanup.engines_terminated !== pids.length ||
    cleanup.engines_reaped !== pids.length ||
    v1r11CanonicalJson(cleanup.remaining_engine_pids) !==
      v1r11CanonicalJson(remaining) ||
    cleanup.scheduling_stopped !== true ||
    cleanup.children_reaped !== true ||
    cleanup.next_job_started !== false
  ) {
    throw new Error(`${gate} OS reap evidence differs`);
  }
  return evidence;
}

function stageBParentRawIdentity(
  value: unknown,
  label: string,
  allowEmpty = false,
): Readonly<{ raw: Buffer; value: Readonly<Record<string, unknown>> }> {
  const identity = object(value, label);
  exactKeys(identity, ["bytes", "sha256", "base64"], label);
  const raw = Buffer.from(String(identity.base64), "base64");
  if (
    !Number.isSafeInteger(identity.bytes) ||
    Number(identity.bytes) < (allowEmpty ? 0 : 1) ||
    !SHA256_RE.test(String(identity.sha256)) ||
    raw.byteLength !== identity.bytes ||
    raw.toString("base64") !== identity.base64 ||
    v1r11Sha256(raw) !== identity.sha256
  ) {
    throw new Error(`${label} differs`);
  }
  return Object.freeze({ raw, value: identity });
}

function validateStageBParentProcessRow(
  value: unknown,
  label: string,
): Readonly<Record<string, unknown>> {
  const row = object(value, label);
  exactKeys(
    row,
    ["pid", "ppid", "pgid", "start_token", "state", "command"],
    label,
  );
  if (
    !Number.isSafeInteger(row.pid) ||
    Number(row.pid) < 1 ||
    !Number.isSafeInteger(row.ppid) ||
    Number(row.ppid) < 0 ||
    !Number.isSafeInteger(row.pgid) ||
    Number(row.pgid) < 1 ||
    typeof row.start_token !== "string" ||
    row.start_token.length < 20 ||
    typeof row.state !== "string" ||
    row.state.length < 1 ||
    typeof row.command !== "string" ||
    row.command.length < 1
  ) {
    throw new Error(`${label} differs`);
  }
  return row;
}

function validateStageBParentJobEvidence(
  value: unknown,
  context: Readonly<{
    gate: Halfkp81V1R11StageBGate;
    expectedLabel: string;
    expectedCommand: readonly string[];
    expectedWorkingDirectory: string;
    expectedPlistPath: string;
    expectedStdoutPath: string;
    expectedStderrPath: string;
  }>,
): Readonly<{
  value: Readonly<Record<string, unknown>>;
  runnerPid: number;
  programArguments: readonly string[];
  observedEngineRows: readonly Readonly<Record<string, unknown>>[];
  observedAuxiliaryRows: readonly Readonly<Record<string, unknown>>[];
  plistSource: Readonly<Record<string, unknown>>;
}> {
  const evidence = object(value, `${context.gate} parent job evidence`);
  exactKeys(
    evidence,
    [
      "schema",
      "status",
      "label",
      "uid",
      "launchctl_domain",
      "plist_source",
      "stdout_path",
      "stderr_path",
      "program_arguments",
      "runner_pid",
      "runner_pgid",
      "runner_start_token",
      "assertion_holder_pid",
      "assertion_holder_start_token",
      "running_observations",
      "observed_engine_rows",
      "observed_auxiliary_rows",
      "runner_exit_code",
      "runner_exit_signal",
      "termination_actions",
      "final_ps_first",
      "final_ps_second",
      "remaining_process_group_pids",
      "remaining_descendant_pids",
    ],
    `${context.gate} parent job evidence`,
  );
  const plistSource = object(
    evidence.plist_source,
    `${context.gate} parent plist source`,
  );
  exactKeys(
    plistSource,
    ["path", "bytes", "sha256", "dev", "ino", "uid", "mode", "nlink"],
    `${context.gate} parent plist source`,
  );
  const uid = integer(evidence.uid, 1, `${context.gate} parent uid`);
  const runnerPid = integer(
    evidence.runner_pid,
    1,
    `${context.gate} parent runner pid`,
  );
  const holderPid = integer(
    evidence.assertion_holder_pid,
    1,
    `${context.gate} parent holder pid`,
  );
  const programArguments = evidence.program_arguments;
  const expectedGuardianCommand =
    buildHalfkp81V1R11ExactPowerGuardianCommand(
      context.expectedCommand[0] ?? "",
      context.expectedWorkingDirectory,
    );
  const runningObservationsValue = evidence.running_observations;
  const observedRowsValue = evidence.observed_engine_rows;
  const observedAuxiliaryRowsValue = evidence.observed_auxiliary_rows;
  const actions = evidence.termination_actions;
  if (
    evidence.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-job-evidence-v1" ||
    evidence.status !== "runner-exited-and-job-process-group-reaped" ||
    evidence.label !== context.expectedLabel ||
    evidence.launchctl_domain !== `gui/${uid}` ||
    evidence.runner_pgid !== runnerPid ||
    holderPid === runnerPid ||
    typeof evidence.runner_start_token !== "string" ||
    evidence.runner_start_token.length < 20 ||
    typeof evidence.assertion_holder_start_token !== "string" ||
    evidence.assertion_holder_start_token.length < 20 ||
    evidence.stdout_path !== context.expectedStdoutPath ||
    evidence.stderr_path !== context.expectedStderrPath ||
    !Array.isArray(programArguments) ||
    v1r11CanonicalJson(programArguments) !==
      v1r11CanonicalJson([
        "/usr/bin/caffeinate",
        "-dimsu",
        ...context.expectedCommand,
      ]) ||
    !Array.isArray(runningObservationsValue) ||
    runningObservationsValue.length < 1 ||
    !Array.isArray(observedRowsValue) ||
    observedRowsValue.length < 1 ||
    !Array.isArray(observedAuxiliaryRowsValue) ||
    observedAuxiliaryRowsValue.length !== 1 ||
    evidence.runner_exit_code !== 0 ||
    evidence.runner_exit_signal !== null ||
    !Array.isArray(actions) ||
    actions.length < 1 ||
    !Array.isArray(evidence.remaining_process_group_pids) ||
    evidence.remaining_process_group_pids.length !== 0 ||
    !Array.isArray(evidence.remaining_descendant_pids) ||
    evidence.remaining_descendant_pids.length !== 0 ||
    plistSource.path !== context.expectedPlistPath ||
    !Number.isSafeInteger(plistSource.bytes) ||
    Number(plistSource.bytes) < 1 ||
    !SHA256_RE.test(String(plistSource.sha256)) ||
    !Number.isSafeInteger(plistSource.dev) ||
    Number(plistSource.dev) < 1 ||
    !Number.isSafeInteger(plistSource.ino) ||
    Number(plistSource.ino) < 1 ||
    plistSource.uid !== uid ||
    plistSource.mode !== 0o600 ||
    plistSource.nlink !== 1
  ) {
    throw new Error(`${context.gate} parent job semantics differ`);
  }
  const observedRows = Object.freeze(
    observedRowsValue.map((row, index) =>
      validateStageBParentProcessRow(
        row,
        `${context.gate} parent engine row ${index + 1}`,
      ),
    ),
  );
  const observedAuxiliaryRows = Object.freeze(
    observedAuxiliaryRowsValue.map((row, index) =>
      validateStageBParentProcessRow(
        row,
        `${context.gate} parent auxiliary row ${index + 1}`,
      ),
    ),
  );
  const observedFromRaw = new Map<
    number,
    Readonly<Record<string, unknown>>
  >();
  let previousObservedAt = -1;
  for (const [offset, rawObservation] of runningObservationsValue.entries()) {
    const observation = object(
      rawObservation,
      `${context.gate} parent running observation ${offset + 1}`,
    );
    exactKeys(
      observation,
      [
        "observation_sequence",
        "observed_at_ms",
        "observed_at_utc",
        "launchctl_stdout",
        "launchctl_stderr",
        "ps_stdout",
        "runner",
        "assertion_holder",
        "observed_engine_rows",
        "observed_auxiliary_rows",
      ],
      `${context.gate} parent running observation ${offset + 1}`,
    );
    const observedAt = integer(
      observation.observed_at_ms,
      0,
      `${context.gate} parent running observation time`,
    );
    if (
      observation.observation_sequence !== offset + 1 ||
      observation.observed_at_utc !== new Date(observedAt).toISOString() ||
      observedAt < previousObservedAt
    ) {
      throw new Error(`${context.gate} parent running observation order differs`);
    }
    previousObservedAt = observedAt;
    const rawLaunchctl = stageBParentRawIdentity(
      observation.launchctl_stdout,
      `${context.gate} parent running launchctl stdout ${offset + 1}`,
    ).raw;
    const rawLaunchctlStderr = stageBParentRawIdentity(
      observation.launchctl_stderr,
      `${context.gate} parent running launchctl stderr ${offset + 1}`,
      true,
    ).raw;
    const rawPs = stageBParentRawIdentity(
      observation.ps_stdout,
      `${context.gate} parent running ps ${offset + 1}`,
    ).raw;
    const launchctl = parseHalfkp81V1R11StageBLaunchctlPrintForTests(
      {
        status: 0,
        signal: null,
        stdout: rawLaunchctl,
        stderr: rawLaunchctlStderr,
      },
      context.expectedLabel,
      uid,
    );
    const rows = parseHalfkp81V1R11StageBPsForTests(rawPs);
    const rawRunner = rows.filter((row) => row.pid === runnerPid);
    const runner = validateStageBParentProcessRow(
      observation.runner,
      `${context.gate} parent running runner ${offset + 1}`,
    );
    const holder = validateStageBParentProcessRow(
      observation.assertion_holder,
      `${context.gate} parent running holder ${offset + 1}`,
    );
    const enginesValue = observation.observed_engine_rows;
    const auxiliariesValue = observation.observed_auxiliary_rows;
    if (
      !Array.isArray(enginesValue) ||
      !Array.isArray(auxiliariesValue) ||
      auxiliariesValue.length !== 1
    ) {
      throw new Error(`${context.gate} parent running engines differ`);
    }
    const engines = enginesValue.map((row, index) =>
      validateStageBParentProcessRow(
        row,
        `${context.gate} parent running engine ${offset + 1}.${index + 1}`,
      ),
    );
    const auxiliaries = auxiliariesValue.map((row, index) =>
      validateStageBParentProcessRow(
        row,
        `${context.gate} parent running auxiliary ${offset + 1}.${index + 1}`,
      ),
    );
    const rawHolder = rows.filter((row) => row.pid === holderPid);
    if (
      launchctl.state !== "running" ||
      launchctl.pid !== runnerPid ||
      rawLaunchctlStderr.byteLength !== 0 ||
      rawRunner.length !== 1 ||
      rawHolder.length !== 1 ||
      v1r11CanonicalJson(rawRunner[0]) !== v1r11CanonicalJson(runner) ||
      v1r11CanonicalJson(rawHolder[0]) !== v1r11CanonicalJson(holder) ||
      runner.start_token !== evidence.runner_start_token ||
      holder.start_token !== evidence.assertion_holder_start_token ||
      runner.pgid !== runnerPid ||
      holder.ppid !== runnerPid ||
      holder.pgid !== runnerPid ||
      engines.some(
        (engine) =>
          !rows.some(
            (row) => v1r11CanonicalJson(row) === v1r11CanonicalJson(engine),
          ) ||
          engine.ppid !== runnerPid ||
          engine.pgid !== runnerPid,
      ) ||
      auxiliaries.some(
        (auxiliary) =>
          !rows.some(
            (row) =>
              v1r11CanonicalJson(row) === v1r11CanonicalJson(auxiliary),
          ) ||
          auxiliary.ppid !== runnerPid ||
          auxiliary.pgid !== runnerPid ||
          auxiliary.command !== expectedGuardianCommand ||
          v1r11CanonicalJson(auxiliary) !==
            v1r11CanonicalJson(observedAuxiliaryRows[0]),
      )
    ) {
      throw new Error(`${context.gate} parent running raw observation differs`);
    }
    for (const engine of engines) {
      const prior = observedFromRaw.get(Number(engine.pid));
      if (
        prior !== undefined &&
        v1r11CanonicalJson(prior) !== v1r11CanonicalJson(engine)
      ) {
        throw new Error(`${context.gate} parent running PID identity changed`);
      }
      observedFromRaw.set(Number(engine.pid), engine);
    }
  }
  const rawDerivedObservedRows = Object.freeze(
    [...observedFromRaw.values()].sort(
      (left, right) => Number(left.pid) - Number(right.pid),
    ),
  );
  const rawDerivedAuxiliaryRows = Object.freeze(
    runningObservationsValue
      .flatMap((rawObservation) => {
        const observation = object(
          rawObservation,
          `${context.gate} parent auxiliary union observation`,
        );
        return (observation.observed_auxiliary_rows as readonly unknown[]).map(
          (row) => object(row, `${context.gate} parent auxiliary union row`),
        );
      })
      .filter(
        (row, index, rows) =>
          rows.findIndex((candidate) => candidate.pid === row.pid) === index,
      )
      .sort((left, right) => Number(left.pid) - Number(right.pid)),
  );
  if (
    new Set(observedRows.map((row) => row.pid)).size !== observedRows.length ||
    observedRows.some(
      (row) => row.ppid !== runnerPid || row.pgid !== runnerPid,
    ) ||
    v1r11CanonicalJson(rawDerivedObservedRows) !==
      v1r11CanonicalJson(observedRows) ||
    v1r11CanonicalJson(rawDerivedAuxiliaryRows) !==
      v1r11CanonicalJson(observedAuxiliaryRows)
  ) {
    throw new Error(`${context.gate} parent engine process set differs`);
  }
  actions.forEach((action, index) => {
    const row = object(action, `${context.gate} termination action ${index + 1}`);
    if (index === 0) {
      exactKeys(
        row,
        ["action", "target", "exit_code"],
        `${context.gate} bootout action`,
      );
      if (
        row.action !== "launchctl-bootout" ||
        row.target !== `gui/${uid}/${context.expectedLabel}` ||
        row.exit_code !== 0
      ) {
        throw new Error(`${context.gate} bootout action differs`);
      }
      return;
    }
    exactKeys(
      row,
      ["action", "pgid", "signal", "result"],
      `${context.gate} process-group action ${index + 1}`,
    );
    const expectedSignal = index === 1 ? "SIGTERM" : "SIGKILL";
    if (
      index > 2 ||
      row.action !== "signal-process-group" ||
      row.pgid !== runnerPid ||
      row.signal !== expectedSignal ||
      !["sent", "esrch"].includes(String(row.result))
    ) {
      throw new Error(`${context.gate} process-group action differs`);
    }
  });
  const first = stageBParentRawIdentity(
    evidence.final_ps_first,
    `${context.gate} final ps first`,
  );
  const second = stageBParentRawIdentity(
    evidence.final_ps_second,
    `${context.gate} final ps second`,
  );
  for (const [index, raw] of [first.raw, second.raw].entries()) {
    const rows = parseHalfkp81V1R11StageBPsForTests(raw);
    if (
      rows.some(
        (row) =>
          row.pid === runnerPid ||
          row.pgid === runnerPid ||
          row.ppid === runnerPid ||
          observedRows.some((engine) => engine.pid === row.pid) ||
          observedAuxiliaryRows.some(
            (auxiliary) => auxiliary.pid === row.pid,
          ),
      )
    ) {
      throw new Error(`${context.gate} final ps ${index + 1} retains job rows`);
    }
  }
  return Object.freeze({
    value: evidence,
    runnerPid,
    programArguments: programArguments as readonly string[],
    observedEngineRows: observedRows,
    observedAuxiliaryRows,
    plistSource,
  });
}

function validateStageBParentEnvelope(
  value: unknown,
  context: Readonly<{
    gate: Halfkp81V1R11StageBGate;
    expectedLabel: string;
    expectedCommand: readonly string[];
    expectedWorkingDirectory: string;
    expectedPlistPath: string;
    expectedStdoutPath: string;
    expectedStderrPath: string;
  }>,
): Readonly<{
  inner: Readonly<Record<string, unknown>>;
  evidence: ReturnType<typeof validateStageBParentJobEvidence>;
}> {
  const envelope = object(value, `${context.gate} Stage B parent envelope`);
  exactKeys(
    envelope,
    [
      "schema",
      "status",
      "runtime_stdout_base64",
      "runtime_stdout_bytes",
      "runtime_stdout_sha256",
      "runtime_stderr_base64",
      "runtime_stderr_bytes",
      "runtime_stderr_sha256",
      "parsed_inner_canonical_json",
      "parent_job_evidence",
    ],
    `${context.gate} Stage B parent envelope`,
  );
  const stdout = Buffer.from(String(envelope.runtime_stdout_base64), "base64");
  const stderr = Buffer.from(String(envelope.runtime_stderr_base64), "base64");
  const inner = object(
    envelope.parsed_inner_canonical_json,
    `${context.gate} Stage B inner result`,
  );
  if (
    envelope.schema !==
      "shogi-halfkp81-depth18-yaneura-only-v1r11-stage-b-parent-envelope-v1" ||
    envelope.status !== "fixed-child-output-authenticated-after-job-reap" ||
    stdout.toString("base64") !== envelope.runtime_stdout_base64 ||
    stdout.byteLength !== envelope.runtime_stdout_bytes ||
    v1r11Sha256(stdout) !== envelope.runtime_stdout_sha256 ||
    stderr.toString("base64") !== envelope.runtime_stderr_base64 ||
    stderr.byteLength !== envelope.runtime_stderr_bytes ||
    v1r11Sha256(stderr) !== envelope.runtime_stderr_sha256 ||
    stderr.byteLength !== 0 ||
    !stdout.equals(v1r11CanonicalLine(inner))
  ) {
    throw new Error(`${context.gate} Stage B parent envelope differs`);
  }
  return Object.freeze({
    inner,
    evidence: validateStageBParentJobEvidence(
      envelope.parent_job_evidence,
      context,
    ),
  });
}

function expectedImplementation(
  repositoryRoot: string,
  sourceRevision: string,
): Readonly<Record<string, unknown>> {
  const entrypoint = "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts";
  const closure = Object.freeze([
    entrypoint,
    "ml/floodgate-bounded-stable-wasm-runtime-v3.ts",
    "ml/floodgate-git.ts",
    "ml/floodgate-production-stable-wasm-runtime.ts",
    "ml/floodgate-production-teacher-asset-authority.ts",
    "ml/floodgate-raw-lock-verifier.ts",
    "ml/floodgate-raw-lock.ts",
    "ml/floodgate-raw-verification-worker-pool.ts",
    "ml/floodgate-raw-verification-worker-protocol.ts",
    "ml/floodgate-raw-verification-worker-source.ts",
    "ml/floodgate-replay-exclusion.ts",
    "ml/floodgate-role-bundle-result.ts",
    "ml/floodgate-role-bundle.ts",
    "ml/floodgate-role-lock.ts",
    "ml/floodgate-roles.ts",
    "ml/floodgate-source.ts",
    "ml/floodgate-stable-wasm-proposer.ts",
    "ml/floodgate-training-row-consumer.ts",
    "ml/floodgate-training-row-validation.ts",
    "ml/generate-sibling-teacher.ts",
    "ml/generate-teacher.ts",
    "ml/halfkp81-depth18-one-shot-launch-agent.ts",
    "ml/halfkp81-depth18-teacher-runner.ts",
    "ml/halfkp81-depth18-v1r11-authority-io.ts",
    "ml/halfkp81-depth18-v1r11-preformal-fault.ts",
    "ml/halfkp81-depth18-v1r11-stage-b-engine-gate-core.ts",
    "ml/halfkp81-depth18-v1r11-stage-b-fixed-engine-boundary.ts",
    "ml/halfkp81-depth18-v1r11-stage-b-launchagent-supervisor.ts",
    "ml/halfkp81-depth18-v1r11-stage-b-power-verifier.ts",
    "ml/halfkp81-depth18-v1r11-stage-c-live-evidence.ts",
    "ml/import-csa-games.ts",
    "ml/pipeline-revision.ts",
    "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts",
    "ml/shogi-sfen-codec.ts",
    "ml/shogi-sfen.ts",
    "ml/sibling-data.ts",
    "ml/usi-engine.ts",
    "ml/usi-multipv.ts",
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
          throw new Error(
            `stage B producer ${relativePath} is not tracked source`,
          );
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

async function authenticateStageA(
  context: Readonly<Halfkp81V1R11StageBContext>,
): Promise<
  Readonly<{
    receipt: Readonly<Record<string, unknown>>;
    ledgerPrefix: Readonly<V1R11AuthorityFileIdentity>;
    currentLedgerRaw: Buffer;
  }>
> {
  const raw = await readV1R11HeldIdentity(
    context.stageAReceipt,
    STAGE_A_SCHEMA,
    "Stage A verified receipt",
  );
  const receipt = parseV1R11CanonicalObject(raw, "Stage A verified receipt");
  exactKeys(
    receipt,
    [
      "schema",
      "status",
      "teacher_plan",
      "source_revision",
      "run_fingerprint",
      "ledger_prefix",
      "verified_gates",
      "verifier",
      "authority",
    ],
    "Stage A verified receipt",
  );
  const ledgerPrefix = assertIdentity(
    receipt.ledger_prefix,
    LEDGER_SCHEMA,
    "Stage A ledger prefix",
  );
  if (
    receipt.schema !== STAGE_A_SCHEMA ||
    receipt.status !==
      "control-plane-gates-independently-verified-preformal-engine-only-authority" ||
    v1r11CanonicalJson(receipt.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    receipt.source_revision !== context.sourceRevision ||
    receipt.run_fingerprint !== context.formalRunFingerprint ||
    v1r11CanonicalJson(receipt.authority) !==
      v1r11CanonicalJson(STAGE_A_AUTHORITY) ||
    ledgerPrefix.path !== context.currentLedger.path
  ) {
    throw new Error("Stage A authority binding differs");
  }
  const current = await readV1R11HeldIdentity(
    context.currentLedger,
    LEDGER_SCHEMA,
    "current preformal ledger",
  );
  if (
    current.byteLength < ledgerPrefix.bytes ||
    v1r11Sha256(current.subarray(0, ledgerPrefix.bytes)) !==
      ledgerPrefix.sha256 ||
    current[ledgerPrefix.bytes - 1] !== 0x0a
  ) {
    throw new Error("Stage A immutable ledger prefix differs");
  }
  return Object.freeze({ receipt, ledgerPrefix, currentLedgerRaw: current });
}

async function authenticateHandoff(
  context: Readonly<Halfkp81V1R11StageBContext>,
  nextSequence: number,
): Promise<
  Readonly<{ previousEntrySha256: string; currentLedgerRaw: Buffer }>
> {
  const authenticated = await authenticateStageA(context);
  const lines = authenticated.currentLedgerRaw
    .toString("utf8")
    .trimEnd()
    .split("\n");
  if (
    lines.length !== nextSequence - 1 ||
    authenticated.currentLedgerRaw.at(-1) !== 0x0a
  ) {
    throw new Error("planned handoff ledger row count differs");
  }
  let previous: string | null = null;
  for (const [offset, line] of lines.entries()) {
    const sequence = offset + 1;
    const row = object(JSON.parse(line), `handoff ledger row ${sequence}`);
    if (v1r11CanonicalJson(row) !== line) {
      throw new Error(`handoff ledger row ${sequence} is not canonical`);
    }
    const { entry_sha256: digest, ...preimage } = row;
    if (
      row.sequence !== sequence ||
      row.previous_entry_sha256 !== previous ||
      digest !== v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(preimage)}`)
    ) {
      throw new Error(`handoff ledger row ${sequence} chain differs`);
    }
    previous = String(digest);
  }
  const lastRow = object(
    JSON.parse(lines.at(-1)!),
    "planned handoff last ledger row",
  );
  const expectedPreviousGate =
    nextSequence === 8
      ? "power-guardian-implementation-tests-pass"
      : nextSequence === 13
        ? "formal-like-512"
        : HALFKP81_V1R11_STAGE_B_GATES[nextSequence - 9];
  const lastReceipt = assertIdentity(
    lastRow.gate_receipt,
    RECEIPT_SCHEMA,
    "planned handoff last receipt",
  );
  if (
    lastRow.gate !== expectedPreviousGate ||
    v1r11CanonicalJson(lastReceipt) !==
      v1r11CanonicalJson(context.previousGateReceipt)
  ) {
    throw new Error("planned handoff previous gate differs");
  }
  const receiptRaw = await readV1R11HeldIdentity(
    context.previousGateReceipt,
    RECEIPT_SCHEMA,
    "planned handoff previous receipt",
  );
  const receipt = parseV1R11CanonicalObject(
    receiptRaw,
    "planned handoff previous receipt",
  );
  if (
    receipt.sequence !== nextSequence - 1 ||
    receipt.gate !== expectedPreviousGate ||
    receipt.status !== "pass-no-formal-authority"
  ) {
    throw new Error("planned handoff previous receipt semantics differ");
  }
  return Object.freeze({
    previousEntrySha256: String(previous),
    currentLedgerRaw: authenticated.currentLedgerRaw,
  });
}

function stageBFingerprint(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  sequence: number,
): Readonly<{ fingerprint: string; epochNamespace: string }> {
  const prefix = String(sequence).padStart(2, "0");
  const epochNamespace = path.join(
    context.gateDirectory.path,
    `${prefix}-${gate}.stage-b-epoch`,
  );
  const source02 = path.join(
    context.gateDirectory.path,
    `${prefix}-${gate}.source-02.bin`,
  );
  const source03 = path.join(
    context.gateDirectory.path,
    `${prefix}-${gate}.source-03.bin`,
  );
  const fingerprint = v1r11Sha256(
    v1r11CanonicalJson({
      domain: "shogi-halfkp81-depth18-v1r11-stage-b-run-fingerprint-v1",
      gate,
      sequence,
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      formal_run_fingerprint: context.formalRunFingerprint,
      stage_a_verified_receipt: context.stageAReceipt,
      stage_b_epoch_namespace: epochNamespace,
      source_02_path: source02,
      source_03_path: source03,
    }),
  );
  if (fingerprint === context.formalRunFingerprint) {
    throw new Error("Stage B fingerprint equals formal fingerprint");
  }
  return Object.freeze({ fingerprint, epochNamespace });
}

export function validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(
  gate: Halfkp81V1R11StageBGate,
  capture: Readonly<{
    observedAuxiliaryRows: readonly Readonly<Record<string, unknown>>[];
    powerEntries: readonly Readonly<Halfkp81V1R11FrozenPowerEntry>[];
    verifier: Readonly<Record<string, unknown>>;
    independentlyVerified: Readonly<{
      runner_pid: number;
      guardian_pid: number;
    }>;
    expectedGuardianCommand: string;
  }>,
): Readonly<Record<string, unknown>> {
  const guardianValue = capture.observedAuxiliaryRows[0];
  if (
    capture.observedAuxiliaryRows.length !== 1 ||
    guardianValue === undefined
  ) {
    throw new Error(`${gate} external power guardian count differs`);
  }
  const guardian = validateStageBParentProcessRow(
    guardianValue,
    `${gate} external power guardian`,
  );
  if (
    guardian.pid !== capture.independentlyVerified.guardian_pid ||
    guardian.ppid !== capture.independentlyVerified.runner_pid ||
    capture.verifier.guardian_pid !== guardian.pid ||
    capture.powerEntries.length < 2 ||
    capture.powerEntries.some(
      (entry) => entry.observation.guardian_pid !== guardian.pid,
    ) ||
    guardian.command !== capture.expectedGuardianCommand
  ) {
    throw new Error(`${gate} external power guardian binding differs`);
  }
  return guardian;
}

function validateStageBPower(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  fingerprint: string,
  epochNamespace: string,
  capture: Readonly<{
    launchAgentEvidence: Readonly<Record<string, unknown>>;
    powerEntries: readonly Readonly<Halfkp81V1R11FrozenPowerEntry>[];
    pmsetInterval: Readonly<Record<string, unknown>>;
    verifier: Readonly<Record<string, unknown>>;
    observedAuxiliaryRows: readonly Readonly<Record<string, unknown>>[];
  }>,
): Readonly<{
  ledger: Readonly<Record<string, unknown>>;
  receiptWithoutLedgerIdentity: Readonly<Record<string, unknown>>;
}> {
  exactKeys(
    capture.pmsetInterval,
    [
      "start_anchor",
      "end_anchor",
      "raw_log_base64",
      "raw_log_bytes",
      "raw_log_sha256",
    ],
    `${gate} raw pmset interval`,
  );
  const pmsetRaw = Buffer.from(
    String(capture.pmsetInterval.raw_log_base64),
    "base64",
  );
  if (
    pmsetRaw.toString("base64") !== capture.pmsetInterval.raw_log_base64 ||
    pmsetRaw.byteLength !== capture.pmsetInterval.raw_log_bytes ||
    v1r11Sha256(pmsetRaw) !== capture.pmsetInterval.raw_log_sha256 ||
    pmsetRaw.at(-1) !== 0x0a
  ) {
    throw new Error(`${gate} raw pmset transcript differs`);
  }
  const pmsetRawRows = pmsetRaw.toString("utf8").slice(0, -1).split("\n");
  const result = verifyHalfkp81V1R11FrozenStageBPowerLedger(
    capture.powerEntries,
    {
      teacherPlan: context.teacherPlan,
      sourceRevision: context.sourceRevision,
      stageBRunFingerprint: fingerprint,
      stageAReceipt: context.stageAReceipt,
      launchAgentEvidence: capture.launchAgentEvidence,
      pmsetRawRows,
    },
  );
  validateHalfkp81V1R11ExternalPowerGuardianBindingForTests(gate, {
    observedAuxiliaryRows: capture.observedAuxiliaryRows,
    powerEntries: capture.powerEntries,
    verifier: capture.verifier,
    independentlyVerified: result,
    expectedGuardianCommand: buildHalfkp81V1R11ExactPowerGuardianCommand(
      process.execPath,
      context.repositoryRoot,
    ),
  });
  const admission = capture.powerEntries[0]!;
  const final = capture.powerEntries.at(-1)!;
  const samples = capture.powerEntries.slice(1, -1);
  if (
    v1r11CanonicalJson(capture.pmsetInterval.start_anchor) !==
      v1r11CanonicalJson(admission.observation.pmset_start_anchor) ||
    v1r11CanonicalJson(capture.pmsetInterval.end_anchor) !==
      v1r11CanonicalJson(final.observation.pmset_current_cursor)
  ) {
    throw new Error(`${gate} pmset endpoints differ`);
  }
  const ledger = Object.freeze({
    schema: expectedSourceSchema(gate, "stage-b-power-ledger"),
    status:
      "preformal-engine-gate-power-continuity-complete-no-formal-authority",
    gate,
    stage_b_run_fingerprint: fingerprint,
    stage_b_epoch_namespace: epochNamespace,
    stage_a_verified_receipt: context.stageAReceipt,
    launchagent_evidence: capture.launchAgentEvidence,
    admission_entry: admission,
    samples: Object.freeze(samples),
    final_entry: final,
    previous_entry_hash_chain_verified: true,
  });
  const receiptWithoutLedgerIdentity = Object.freeze({
    schema: expectedSourceSchema(gate, "stage-b-power-receipt"),
    status:
      "preformal-engine-gate-power-continuity-independently-verified-no-formal-authority",
    gate,
    stage_b_run_fingerprint: fingerprint,
    stage_b_epoch_namespace: epochNamespace,
    stage_a_verified_receipt: context.stageAReceipt,
    launchagent_evidence: capture.launchAgentEvidence,
    all_engines_reaped: true,
    pmset_interval: capture.pmsetInterval,
    verifier: Object.freeze({
      ...capture.verifier,
      independent_result: result,
    }),
    authority: FALSE_AUTHORITY,
  });
  return Object.freeze({ ledger, receiptWithoutLedgerIdentity });
}

/**
 * Executes one already-admitted Stage-B epoch. The collector supplies raw
 * process transcripts, never a pass/fail decision. This function reparses the
 * raw result, independently verifies the power ledger, publishes all files
 * create-only, then appends and fsyncs exactly one authority-ledger row.
 */
async function executeHalfkp81V1R11StageBEpochInternal(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  collector: Readonly<Halfkp81V1R11StageBCollector>,
): Promise<
  Readonly<{
    stageBRunFingerprint: string;
    stageBEpochNamespace: string;
    evidence: Readonly<V1R11AuthorityFileIdentity>;
    receipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
  }>
> {
  let sequence: number | null = null;
  let stageAPrefix: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let collectorStarted = false;
  let activeLaunchAgent: Readonly<{
    label: string;
    plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  }> | null = null;
  let runnerIdentity: Readonly<{
    pid: number;
    pgid: number;
    lstart: string;
  }> | null = null;
  const partialArtifacts: V1R11AuthorityFileIdentity[] = [];
  try {
    await assertV1R11CreateOnlyTargetAbsent(
      context.authorityDirectory,
      path.join(
        context.authorityDirectory.path,
        "preformal-terminal-fault.json",
      ),
      "Stage B terminal-fault collision",
    );
    const gateIndex = HALFKP81_V1R11_STAGE_B_GATES.indexOf(gate);
    if (
      gateIndex < 0 ||
      !REVISION_RE.test(context.sourceRevision) ||
      !SHA256_RE.test(context.formalRunFingerprint) ||
      context.currentLedger.schema !== LEDGER_SCHEMA ||
      context.previousGateReceipt.schema !== RECEIPT_SCHEMA
    ) {
      throw new Error("Stage B context differs");
    }
    await assertV1R11AuthorityDirectory(context.authorityDirectory);
    await assertV1R11AuthorityDirectory(context.gateDirectory);
    if (
      context.gateDirectory.path !==
        path.join(context.authorityDirectory.path, "preformal-gates") ||
      context.currentLedger.path !==
        path.join(
          context.authorityDirectory.path,
          "preformal-authority-ledger.jsonl",
        )
    ) {
      throw new Error("Stage B namespace differs");
    }
    sequence = gateIndex + 8;
    const producer = expectedImplementation(
      context.repositoryRoot,
      context.sourceRevision,
    );
    await readV1R11HeldIdentity(
      context.teacherPlan,
      context.teacherPlan.schema,
      "Stage B teacher plan",
    );
    if (
      execFileSync("git", ["-C", context.repositoryRoot, "rev-parse", "HEAD"], {
        encoding: "utf8",
      }).trim() !== context.sourceRevision
    ) {
      throw new Error("Stage B authenticated source revision differs");
    }
    const stageA = await authenticateStageA(context);
    stageAPrefix = stageA.ledgerPrefix;
    const handoff = await authenticateHandoff(context, sequence);
    const { fingerprint, epochNamespace } = stageBFingerprint(
      context,
      gate,
      sequence,
    );
    const expectedCommand = fixedStageBCommand(context, gate, {
      sequence,
      stage_b_run_fingerprint: fingerprint,
      stage_b_epoch_namespace: epochNamespace,
    });
    const expectedJob = fixedStageBParentJobPaths(
      context,
      gate,
      sequence,
      fingerprint,
    );
    collectorStarted = true;
    const captured = await collector.collectGate(gate, {
      sequence,
      stage_b_run_fingerprint: fingerprint,
      stage_b_epoch_namespace: epochNamespace,
    });
    const resultContent = stageBSourceContent(captured);
    const parsedCanonical = object(
      resultContent.parsed_canonical_json,
      `${gate} parsed canonical result`,
    );
    const parentJob = object(
      parsedCanonical.parent_job_evidence,
      `${gate} parent job evidence for outer cleanup binding`,
    );
    const plistSource = object(
      parentJob.plist_source,
      `${gate} parent plist source for outer cleanup binding`,
    );
    activeLaunchAgent = Object.freeze({
      label: String(parentJob.label),
      plistSnapshot: Object.freeze({
        path: String(plistSource.path),
        bytes: Number(plistSource.bytes),
        sha256: String(plistSource.sha256),
        schema: "application/x-apple-aspen-config-exact-bytes",
      }),
    });
    runnerIdentity = Object.freeze({
      pid: Number(parentJob.runner_pid),
      pgid: Number(parentJob.runner_pgid),
      lstart: String(parentJob.runner_start_token),
    });
    const execution = stageBExecutionEnvelope(
      resultContent.parsed_canonical_json,
      {
        gate,
        sequence,
        fingerprint,
        epochNamespace,
        stageAReceipt: context.stageAReceipt,
        expectedLabel: expectedJob.label,
        expectedCommand,
        expectedWorkingDirectory: context.repositoryRoot,
        expectedPlistPath: expectedJob.plistPath,
        expectedStdoutPath: expectedJob.stdoutPath,
        expectedStderrPath: expectedJob.stderrPath,
      },
    );
    const rawPayload = execution.gateResult;
    const power = validateStageBPower(
      context,
      gate,
      fingerprint,
      epochNamespace,
      execution,
    );
    const prefix = String(sequence).padStart(2, "0");
    const faultTarget = path.join(
      context.authorityDirectory.path,
      "preformal-terminal-fault.json",
    );
    const assertNamespaceOpen = (label: string) =>
      assertV1R11CreateOnlyTargetAbsent(
        context.authorityDirectory,
        faultTarget,
        label,
      );
    const sourceIdentities: V1R11AuthorityFileIdentity[] = [];
    const sourceKinds = [
      SOURCE_KINDS[gate],
      "stage-b-power-ledger",
      "stage-b-power-receipt",
    ];
    for (let offset = 0; offset < sourceKinds.length; offset += 1) {
      const sourceSequence = offset + 1;
      const sourceKind = sourceKinds[offset]!;
      const sourceSchema = expectedSourceSchema(gate, sourceKind);
      const content =
        offset === 0
          ? resultContent
          : offset === 1
            ? power.ledger
            : Object.freeze({
                ...power.receiptWithoutLedgerIdentity,
                stage_b_power_ledger: sourceIdentities[1],
              });
      const envelope = Object.freeze({
        schema: sourceSchema,
        status: "captured-primary-source-no-authority",
        gate,
        sequence,
        source_sequence: sourceSequence,
        source_kind: sourceKind,
        teacher_plan: context.teacherPlan,
        source_revision: context.sourceRevision,
        run_fingerprint: context.formalRunFingerprint,
        producer,
        content,
        captured_at_utc: captured.captured_at_utc,
      });
      sourceIdentities.push(
        await publishV1R11CreateOnlyCanonical(
          context.gateDirectory,
          path.join(
            context.gateDirectory.path,
            `${prefix}-${gate}.source-${String(sourceSequence).padStart(2, "0")}.bin`,
          ),
          envelope,
          sourceSchema,
        ),
      );
      partialArtifacts.push(sourceIdentities.at(-1)!);
      await assertNamespaceOpen(
        `${gate} post-source-${sourceSequence} fault check`,
      );
    }
    const payload = Object.freeze({
      ...rawPayload,
      stage_a_verified_receipt: context.stageAReceipt,
      stage_b_power_ledger: sourceIdentities[1],
      stage_b_power_receipt: sourceIdentities[2],
    });
    validateStageBGatePayload(gate, payload);
    const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
    const evidence = await publishV1R11CreateOnlyCanonical(
      context.gateDirectory,
      path.join(context.gateDirectory.path, `${prefix}-${gate}.evidence.json`),
      Object.freeze({
        schema: evidenceSchema,
        status: "pass",
        gate,
        sequence,
        teacher_plan: context.teacherPlan,
        source_revision: context.sourceRevision,
        run_fingerprint: context.formalRunFingerprint,
        producer,
        primary_sources: Object.freeze(sourceIdentities),
        payload,
        produced_at_utc: captured.captured_at_utc,
      }),
      evidenceSchema,
    );
    partialArtifacts.push(evidence);
    await assertNamespaceOpen(`${gate} post-evidence fault check`);
    const receipt = await publishV1R11CreateOnlyCanonical(
      context.gateDirectory,
      path.join(context.gateDirectory.path, `${prefix}-${gate}.receipt.json`),
      Object.freeze({
        schema: RECEIPT_SCHEMA,
        status: "pass-no-formal-authority",
        gate,
        sequence,
        teacher_plan: context.teacherPlan,
        source_revision: context.sourceRevision,
        run_fingerprint: context.formalRunFingerprint,
        previous_gate_receipt_sha256: context.previousGateReceipt.sha256,
        evidence,
        producer,
        authority: FALSE_AUTHORITY,
      }),
      RECEIPT_SCHEMA,
    );
    partialArtifacts.push(receipt);
    await assertNamespaceOpen(`${gate} post-receipt fault check`);
    const ledgerPreimage = Object.freeze({
      schema: LEDGER_SCHEMA,
      sequence,
      gate,
      previous_entry_sha256: handoff.previousEntrySha256,
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      run_fingerprint: context.formalRunFingerprint,
      gate_evidence: evidence,
      gate_receipt: receipt,
      status: "pass-no-formal-authority",
      producer,
    });
    const row = Object.freeze({
      ...ledgerPreimage,
      entry_sha256: v1r11Sha256(
        `${LEDGER_DOMAIN}${v1r11CanonicalJson(ledgerPreimage)}`,
      ),
    });
    const stillCurrent = await readV1R11HeldIdentity(
      context.currentLedger,
      LEDGER_SCHEMA,
      `${gate} handoff ledger revalidation`,
    );
    if (!stillCurrent.equals(handoff.currentLedgerRaw)) {
      throw new Error(`${gate} ledger changed during engine epoch`);
    }
    await assertNamespaceOpen(`${gate} pre-ledger-append fault check`);
    const ledger = await appendV1R11CanonicalLedgerRow(
      context.authorityDirectory,
      context.currentLedger.path,
      row,
      context.currentLedger,
      LEDGER_SCHEMA,
      `${gate} authority ledger`,
    );
    await assertNamespaceOpen(`${gate} post-ledger-append fault check`);
    return Object.freeze({
      stageBRunFingerprint: fingerprint,
      stageBEpochNamespace: epochNamespace,
      evidence,
      receipt,
      ledger,
    });
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));
    if (
      error instanceof Halfkp81V1R11StageBLaunchAgentSupervisorError &&
      error.activeBinding !== null
    ) {
      const cleanup = error.activeBinding;
      activeLaunchAgent = Object.freeze({
        label: cleanup.label,
        plistSnapshot: Object.freeze({
          path: cleanup.plistSource.path,
          bytes: cleanup.plistSource.bytes,
          sha256: cleanup.plistSource.sha256,
          schema: "application/x-apple-aspen-config-exact-bytes",
        }),
      });
      runnerIdentity = cleanup.runnerIdentity;
    }
    const runnerWasAdmitted =
      activeLaunchAgent !== null ||
      runnerIdentity !== null ||
      error instanceof Halfkp81V1R11StageBLaunchAgentSupervisorError;
    throw new Halfkp81V1R11PreformalStageFailure({
      phase: runnerWasAdmitted ? "stage-b-power" : "planned-handoff",
      gate,
      sequence,
      runnerState: runnerWasAdmitted ? "active" : "not-created",
      failure,
      artifacts: Object.freeze({
        ledgerPrefix: stageAPrefix,
        lastGateReceipt: context.previousGateReceipt,
        engineGateVerifiedReceipt: context.stageAReceipt,
        launchAgentAuthority: null,
        activeLaunchAgent,
        runnerIdentity,
        partialArtifacts: Object.freeze([...partialArtifacts]),
      }),
    });
  }
}

/**
 * Test-only OS-boundary seam. The collector may supply captured process bytes,
 * but all Stage-B authentication, reparsing, power verification, publication
 * and ledger append logic is the same implementation used in production.
 */
export async function executeHalfkp81V1R11StageBEpochWithOsBoundaryForTests(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  collector: Readonly<Halfkp81V1R11StageBCollector>,
) {
  return executeHalfkp81V1R11StageBEpochInternal(context, gate, collector);
}

export interface Halfkp81V1R11StageCAdmissionCapture {
  readonly result: Readonly<Halfkp81V1R11RawCommandCapture>;
  readonly launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  readonly activeLaunchAgent: Readonly<{
    label: string;
    plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  }>;
  readonly runnerIdentity: Readonly<{
    pid: number;
    pgid: number;
    lstart: string;
  }>;
}

export interface Halfkp81V1R11StageCArtifactProgress {
  source: Readonly<V1R11AuthorityFileIdentity> | null;
  evidence: Readonly<V1R11AuthorityFileIdentity> | null;
  receipt: Readonly<V1R11AuthorityFileIdentity> | null;
}

function stageCArtifactSpecifications(gateDirectory: string) {
  const gate = "ac-power-start-admission-pass";
  return Object.freeze([
    Object.freeze({
      key: "source" as const,
      path: path.join(gateDirectory, `13-${gate}.source-01.bin`),
      schema: `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-formal-launchagent-power-admission-bundle-v1`,
    }),
    Object.freeze({
      key: "evidence" as const,
      path: path.join(gateDirectory, `13-${gate}.evidence.json`),
      schema: `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`,
    }),
    Object.freeze({
      key: "receipt" as const,
      path: path.join(gateDirectory, `13-${gate}.receipt.json`),
      schema: RECEIPT_SCHEMA,
    }),
  ]);
}

/**
 * Recovers create-only gate-13 artifacts through held descriptors. This also
 * closes the tiny failure window where a durable publish succeeded but its
 * promise rejected before the returned identity reached the caller.
 */
export async function recoverHalfkp81V1R11StageCArtifactProgressForTests(
  gateDirectory: string,
  existing: Readonly<Halfkp81V1R11StageCArtifactProgress>,
): Promise<Halfkp81V1R11StageCArtifactProgress> {
  const recovered: Halfkp81V1R11StageCArtifactProgress = {
    source: existing.source,
    evidence: existing.evidence,
    receipt: existing.receipt,
  };
  for (const specification of stageCArtifactSpecifications(gateDirectory)) {
    let raw: Buffer;
    try {
      raw = await readV1R11HeldFile(
        specification.path,
        `Stage C partial ${specification.key}`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    const value = parseV1R11CanonicalObject(
      raw,
      `Stage C partial ${specification.key}`,
    );
    if (value.schema !== specification.schema) {
      throw new Error(`Stage C partial ${specification.key} schema differs`);
    }
    const identity = Object.freeze({
      path: specification.path,
      bytes: raw.byteLength,
      sha256: v1r11Sha256(raw),
      schema: specification.schema,
    });
    const prior = recovered[specification.key];
    if (
      prior !== null &&
      v1r11CanonicalJson(prior) !== v1r11CanonicalJson(identity)
    ) {
      throw new Error(`Stage C partial ${specification.key} identity changed`);
    }
    recovered[specification.key] = identity;
  }
  for (const [key, identity] of Object.entries(recovered)) {
    if (identity !== null) {
      await readV1R11HeldIdentity(
        identity,
        identity.schema,
        `Stage C recovered ${key}`,
      );
    }
  }
  return recovered;
}

export function halfkp81V1R11StageCTerminalFaultMessageForTests(
  failure: Readonly<Error>,
  progress: Readonly<Halfkp81V1R11StageCArtifactProgress>,
): string {
  return `${failure.message || "unknown Stage C admission failure"}; stage_c_partial_artifacts=${v1r11CanonicalJson(progress)}`;
}

export function halfkp81V1R11StageCLatestReceiptForTests(
  previous: Readonly<V1R11AuthorityFileIdentity>,
  progress: Readonly<Halfkp81V1R11StageCArtifactProgress>,
): Readonly<V1R11AuthorityFileIdentity> {
  return progress.receipt ?? previous;
}

/**
 * Reauthenticates the gate-12 handoff at the last possible point before the
 * gate-13 ledger append. This deliberately rereads both the receipt and its
 * evidence instead of trusting the earlier live-admission handoff check.
 */
async function authenticateHalfkp81V1R11StageCHandoffBeforeAppend(
  context: Readonly<Halfkp81V1R11StageBContext>,
  expectedProducer: Readonly<Record<string, unknown>>,
): Promise<string> {
  const ledgerRaw = await readV1R11HeldIdentity(
    context.currentLedger,
    LEDGER_SCHEMA,
    "gate 13 immediate pre-append ledger",
  );
  if (ledgerRaw.at(-1) !== 0x0a) {
    throw new Error("gate 13 immediate pre-append ledger is not newline closed");
  }
  const lines = ledgerRaw.toString("utf8").slice(0, -1).split("\n");
  if (lines.length !== 12) {
    throw new Error("gate 13 immediate pre-append ledger row count differs");
  }
  const row11 = object(JSON.parse(lines[10]!), "gate 11 ledger row");
  const row12 = object(JSON.parse(lines[11]!), "gate 12 ledger row");
  if (
    v1r11CanonicalJson(row11) !== lines[10] ||
    v1r11CanonicalJson(row12) !== lines[11]
  ) {
    throw new Error("gate 12 ledger suffix is not canonical");
  }
  const { entry_sha256: row11Digest, ...row11Preimage } = row11;
  const { entry_sha256: row12Digest, ...row12Preimage } = row12;
  if (
    !SHA256_RE.test(String(row11Digest)) ||
    !SHA256_RE.test(String(row12Digest)) ||
    row11Digest !==
      v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(row11Preimage)}`) ||
    row12.previous_entry_sha256 !== row11Digest ||
    row12Digest !==
      v1r11Sha256(`${LEDGER_DOMAIN}${v1r11CanonicalJson(row12Preimage)}`)
  ) {
    throw new Error("gate 12 ledger suffix hash chain differs");
  }
  const row11Receipt = assertIdentity(
    row11.gate_receipt,
    RECEIPT_SCHEMA,
    "gate 11 ledger receipt",
  );
  const row12Receipt = assertIdentity(
    row12.gate_receipt,
    RECEIPT_SCHEMA,
    "gate 12 ledger receipt",
  );
  if (
    row11.sequence !== 11 ||
    row11.gate !== "mixed-load-gate" ||
    row12.schema !== LEDGER_SCHEMA ||
    row12.sequence !== 12 ||
    row12.gate !== "formal-like-512" ||
    row12.status !== "pass-no-formal-authority" ||
    v1r11CanonicalJson(row12.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    row12.source_revision !== context.sourceRevision ||
    row12.run_fingerprint !== context.formalRunFingerprint ||
    v1r11CanonicalJson(row12Receipt) !==
      v1r11CanonicalJson(context.previousGateReceipt)
  ) {
    throw new Error("gate 12 ledger handoff semantics differ");
  }

  const receiptRaw = await readV1R11HeldIdentity(
    context.previousGateReceipt,
    RECEIPT_SCHEMA,
    "gate 12 immediate pre-append receipt",
  );
  const receipt = parseV1R11CanonicalObject(
    receiptRaw,
    "gate 12 immediate pre-append receipt",
  );
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
    "gate 12 immediate pre-append receipt",
  );
  const evidenceIdentity = assertIdentity(
    receipt.evidence,
    "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-like-512-evidence-v1",
    "gate 12 receipt evidence",
  );
  if (
    receipt.schema !== RECEIPT_SCHEMA ||
    receipt.status !== "pass-no-formal-authority" ||
    receipt.gate !== "formal-like-512" ||
    receipt.sequence !== 12 ||
    receipt.previous_gate_receipt_sha256 !== row11Receipt.sha256 ||
    v1r11CanonicalJson(receipt.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    receipt.source_revision !== context.sourceRevision ||
    receipt.run_fingerprint !== context.formalRunFingerprint ||
    v1r11CanonicalJson(receipt.authority) !==
      v1r11CanonicalJson(FALSE_AUTHORITY) ||
    v1r11CanonicalJson(receipt.producer) !==
      v1r11CanonicalJson(expectedProducer) ||
    v1r11CanonicalJson(row12.gate_evidence) !==
      v1r11CanonicalJson(evidenceIdentity)
  ) {
    throw new Error("gate 12 receipt chain or semantics differ");
  }

  const evidenceRaw = await readV1R11HeldIdentity(
    evidenceIdentity,
    evidenceIdentity.schema,
    "gate 12 immediate pre-append evidence",
  );
  const evidence = parseV1R11CanonicalObject(
    evidenceRaw,
    "gate 12 immediate pre-append evidence",
  );
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
    "gate 12 immediate pre-append evidence",
  );
  if (
    evidence.schema !== evidenceIdentity.schema ||
    evidence.status !== "pass" ||
    evidence.gate !== "formal-like-512" ||
    evidence.sequence !== 12 ||
    v1r11CanonicalJson(evidence.teacher_plan) !==
      v1r11CanonicalJson(context.teacherPlan) ||
    evidence.source_revision !== context.sourceRevision ||
    evidence.run_fingerprint !== context.formalRunFingerprint ||
    v1r11CanonicalJson(evidence.producer) !==
      v1r11CanonicalJson(receipt.producer) ||
    !Array.isArray(evidence.primary_sources) ||
    evidence.primary_sources.length !== 3
  ) {
    throw new Error("gate 12 evidence semantics differ");
  }
  validateStageBGatePayload(
    "formal-like-512",
    object(evidence.payload, "gate 12 evidence payload"),
  );
  return String(row12Digest);
}

export async function authenticateHalfkp81V1R11StageCHandoffBeforeAppendForTests(
  context: Readonly<Halfkp81V1R11StageBContext>,
  expectedProducer: Readonly<Record<string, unknown>>,
): Promise<string> {
  return authenticateHalfkp81V1R11StageCHandoffBeforeAppend(
    context,
    expectedProducer,
  );
}

/** Appends gate 13 only; it never starts the formal teacher. */
async function executeHalfkp81V1R11StageCAdmissionInternal(
  context: Readonly<Halfkp81V1R11StageBContext>,
  capture: Readonly<Halfkp81V1R11StageCAdmissionCapture>,
  progress: Halfkp81V1R11StageCArtifactProgress,
): Promise<
  Readonly<{
    evidence: Readonly<V1R11AuthorityFileIdentity>;
    receipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  }>
> {
  await authenticateStageA(context);
  const sequence = 13;
  const gate = "ac-power-start-admission-pass";
  const resultContent = stageBSourceContent(capture.result);
  const rawPayload = object(
    resultContent.parsed_canonical_json,
    `${gate} result`,
  );
  exactKeys(
    rawPayload,
    [
      "power_source",
      "battery_percentage",
      "required_assertions",
      "assertion_owner_matches_caffeinate_pid",
      "launchagent_authority",
      "power_admission_preimage",
      "observed_at_utc",
    ],
    `${gate} payload`,
  );
  if (
    rawPayload.power_source !== "AC Power" ||
    integer(rawPayload.battery_percentage, 80, `${gate} battery`) > 100 ||
    v1r11CanonicalJson(rawPayload.required_assertions) !==
      v1r11CanonicalJson(REQUIRED_ASSERTIONS) ||
    rawPayload.assertion_owner_matches_caffeinate_pid !== true ||
    v1r11CanonicalJson(rawPayload.launchagent_authority) !==
      v1r11CanonicalJson(capture.launchAgentAuthority)
  ) {
    throw new Error(`${gate} semantics differ`);
  }
  isoUtc(rawPayload.observed_at_utc, `${gate} observed_at_utc`);
  await readV1R11HeldIdentity(
    capture.launchAgentAuthority,
    "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    "final LaunchAgent authority",
  );
  const producer = expectedImplementation(
    context.repositoryRoot,
    context.sourceRevision,
  );
  const sourceKind = "formal-launchagent-power-admission-bundle";
  const sourceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-primary-source-${sourceKind}-v1`;
  const prefix = "13";
  const faultTarget = path.join(
    context.authorityDirectory.path,
    "preformal-terminal-fault.json",
  );
  const assertNamespaceOpen = (label: string) =>
    assertV1R11CreateOnlyTargetAbsent(
      context.authorityDirectory,
      faultTarget,
      label,
    );
  const source = await publishV1R11CreateOnlyCanonical(
    context.gateDirectory,
    path.join(context.gateDirectory.path, `${prefix}-${gate}.source-01.bin`),
    Object.freeze({
      schema: sourceSchema,
      status: "captured-primary-source-no-authority",
      gate,
      sequence,
      source_sequence: 1,
      source_kind: sourceKind,
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      run_fingerprint: context.formalRunFingerprint,
      producer,
      content: resultContent,
      captured_at_utc: capture.result.captured_at_utc,
    }),
    sourceSchema,
  );
  progress.source = source;
  await assertNamespaceOpen("Stage C post-source fault check");
  const evidenceSchema = `shogi-halfkp81-depth18-yaneura-only-v1r11-${gate}-evidence-v1`;
  const evidence = await publishV1R11CreateOnlyCanonical(
    context.gateDirectory,
    path.join(context.gateDirectory.path, `${prefix}-${gate}.evidence.json`),
    Object.freeze({
      schema: evidenceSchema,
      status: "pass",
      gate,
      sequence,
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      run_fingerprint: context.formalRunFingerprint,
      producer,
      primary_sources: Object.freeze([source]),
      payload: rawPayload,
      produced_at_utc: capture.result.captured_at_utc,
    }),
    evidenceSchema,
  );
  progress.evidence = evidence;
  await assertNamespaceOpen("Stage C post-evidence fault check");
  const receipt = await publishV1R11CreateOnlyCanonical(
    context.gateDirectory,
    path.join(context.gateDirectory.path, `${prefix}-${gate}.receipt.json`),
    Object.freeze({
      schema: RECEIPT_SCHEMA,
      status: "pass-no-formal-authority",
      gate,
      sequence,
      teacher_plan: context.teacherPlan,
      source_revision: context.sourceRevision,
      run_fingerprint: context.formalRunFingerprint,
      previous_gate_receipt_sha256: context.previousGateReceipt.sha256,
      evidence,
      producer,
      authority: FALSE_AUTHORITY,
    }),
    RECEIPT_SCHEMA,
  );
  progress.receipt = receipt;
  await assertNamespaceOpen("Stage C post-receipt fault check");
  const previousEntrySha256 =
    await authenticateHalfkp81V1R11StageCHandoffBeforeAppend(
      context,
      producer,
    );
  const preimage = Object.freeze({
    schema: LEDGER_SCHEMA,
    sequence,
    gate,
    previous_entry_sha256: previousEntrySha256,
    teacher_plan: context.teacherPlan,
    source_revision: context.sourceRevision,
    run_fingerprint: context.formalRunFingerprint,
    gate_evidence: evidence,
    gate_receipt: receipt,
    status: "pass-no-formal-authority",
    producer,
  });
  const ledger = await appendV1R11CanonicalLedgerRow(
    context.authorityDirectory,
    context.currentLedger.path,
    Object.freeze({
      ...preimage,
      entry_sha256: v1r11Sha256(
        `${LEDGER_DOMAIN}${v1r11CanonicalJson(preimage)}`,
      ),
    }),
    context.currentLedger,
    LEDGER_SCHEMA,
    "gate 13 authority ledger",
  );
  await assertNamespaceOpen("Stage C post-ledger fault check");
  return Object.freeze({
    evidence,
    receipt,
    ledger,
    launchAgentAuthority: capture.launchAgentAuthority,
  });
}

/**
 * Test-only OS-boundary seam for gate 13. The supplied capture represents the
 * launchd/pmset/ps boundary; gate semantics and the create-only authority
 * chain are still produced by the production Stage-C implementation.
 */
export async function executeHalfkp81V1R11StageCAdmissionWithOsBoundaryForTests(
  context: Readonly<Halfkp81V1R11StageBContext>,
  capture: Readonly<Halfkp81V1R11StageCAdmissionCapture>,
) {
  return executeHalfkp81V1R11StageCAdmissionInternal(context, capture, {
    source: null,
    evidence: null,
    receipt: null,
  });
}

/**
 * Resolves the effective user's home from Darwin's passwd record. HOME is an
 * equality assertion only; it never selects the LaunchAgent path.
 */
export function resolveHalfkp81V1R11StageCHomeDirectoryForTests(
  passwdRaw: Buffer,
  environmentHome: string | undefined,
  expectedUid: number,
): string {
  if (
    !Buffer.isBuffer(passwdRaw) ||
    !Number.isSafeInteger(expectedUid) ||
    expectedUid < 1 ||
    passwdRaw.byteLength < 2 ||
    passwdRaw.at(-1) !== 0x0a
  ) {
    throw new Error("Stage C Darwin passwd capture differs");
  }
  const text = passwdRaw.toString("utf8");
  if (
    !Buffer.from(text, "utf8").equals(passwdRaw) ||
    text.includes("\r") ||
    text.includes("\0") ||
    text.slice(0, -1).includes("\n")
  ) {
    throw new Error("Stage C Darwin passwd bytes differ");
  }
  const fields = text.slice(0, -1).split(":");
  if (fields.length !== 10) {
    throw new Error("Stage C Darwin passwd field count differs");
  }
  const [username, password, uidRaw, gidRaw, accountClass, changeRaw, expireRaw, gecos, passwdHome, shell] =
    fields as [string, string, string, string, string, string, string, string, string, string];
  void accountClass;
  if (
    username.length < 1 ||
    password.length < 1 ||
    gecos.includes("\n") ||
    !/^\d+$/u.test(uidRaw) ||
    !/^\d+$/u.test(gidRaw) ||
    !/^\d+$/u.test(changeRaw) ||
    !/^\d+$/u.test(expireRaw) ||
    Number(uidRaw) !== expectedUid ||
    !Number.isSafeInteger(Number(gidRaw)) ||
    !Number.isSafeInteger(Number(changeRaw)) ||
    !Number.isSafeInteger(Number(expireRaw)) ||
    !path.isAbsolute(passwdHome) ||
    path.normalize(passwdHome) !== passwdHome ||
    !path.isAbsolute(shell) ||
    path.normalize(shell) !== shell ||
    environmentHome !== passwdHome
  ) {
    throw new Error("Stage C Darwin passwd semantics or HOME differs");
  }
  const metadata = fs.lstatSync(passwdHome);
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== expectedUid ||
    fs.realpathSync.native(passwdHome) !== passwdHome
  ) {
    throw new Error("Stage C Darwin passwd home filesystem identity differs");
  }
  return passwdHome;
}

async function collectFixedStageCAdmission(
  context: Readonly<Halfkp81V1R11StageBContext>,
): Promise<Readonly<Halfkp81V1R11StageCAdmissionCapture>> {
  const evidencePath = path.join(
    context.authorityDirectory.path,
    "launchagent-authority-evidence.json",
  );
  const evidenceRaw = await readV1R11HeldFile(
    evidencePath,
    "Stage C final LaunchAgent authority",
  );
  const launchAgentAuthority = Object.freeze({
    path: evidencePath,
    bytes: evidenceRaw.byteLength,
    sha256: v1r11Sha256(evidenceRaw),
    schema:
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
  });
  const evidence = parseV1R11CanonicalObject(
    evidenceRaw,
    "Stage C final LaunchAgent authority",
  );
  const uid = process.geteuid?.();
  if (!Number.isSafeInteger(uid) || Number(uid) < 1) {
    throw new Error("Stage C effective user identity differs");
  }
  const passwdRaw = execFileSync(
    "/usr/bin/id",
    ["-P", String(uid)],
    { encoding: null, stdio: ["ignore", "pipe", "pipe"] },
  );
  const homeDirectory =
    resolveHalfkp81V1R11StageCHomeDirectoryForTests(
      passwdRaw,
      process.env.HOME,
      Number(uid),
    );
  const parsedEvidence =
    validateHalfkp81V1R11StageCLaunchEvidenceForTests(evidence, {
      repositoryRoot: context.repositoryRoot,
      authorityDirectory: context.authorityDirectory.path,
      homeDirectory,
      expectedUid: Number(uid),
      sourceRevision: context.sourceRevision,
      runFingerprint: context.formalRunFingerprint,
      formalRunIntent: context.formalRunIntent,
      teacherPlan: context.teacherPlan,
      expectedNodePath: fs.realpathSync(process.execPath),
    });
  const commands = Object.freeze([
    Object.freeze(["/usr/bin/pmset", "-g", "batt"]),
    Object.freeze(["/usr/bin/pmset", "-g", "assertions"]),
    Object.freeze([
      "/bin/launchctl",
      "print",
      `gui/${String(parsedEvidence.uid)}/${parsedEvidence.label}`,
    ]),
  ]);
  const batteryRaw = execFileSync(commands[0]![0]!, commands[0]!.slice(1), {
    encoding: null,
  });
  const assertionsRaw = execFileSync(commands[1]![0]!, commands[1]!.slice(1), {
    encoding: null,
  });
  const launchctlResult = spawnSync(
    commands[2]![0]!,
    commands[2]!.slice(1),
    {
      encoding: null,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (
    launchctlResult.error !== undefined ||
    launchctlResult.signal !== null ||
    launchctlResult.status !== 0 ||
    !Buffer.isBuffer(launchctlResult.stdout) ||
    !Buffer.isBuffer(launchctlResult.stderr)
  ) {
    throw new Error("Stage C live launchctl command differs");
  }
  const launchctlRaw = launchctlResult.stdout;
  const launchctlStderrRaw = launchctlResult.stderr;
  const launchctlText = launchctlRaw.toString("utf8");
  if (!Buffer.from(launchctlText, "utf8").equals(launchctlRaw)) {
    throw new Error("Stage C launchctl stdout is not exact UTF-8");
  }
  validateHalfkp81V1R11StageCLaunchctlForTests(
    launchctlText,
    parsedEvidence,
  );
  const battery = parseHalfkp81V1R11StageCBatteryForTests(
    batteryRaw.toString("utf8"),
  );
  parseHalfkp81V1R11StageCAssertionsForTests(
    assertionsRaw.toString("utf8"),
    parsedEvidence.holderPid,
  );
  if (
    battery.powerSource !== "AC Power" ||
    battery.batteryPercentage < 80 ||
    battery.batteryPercentage > 100
  ) {
    throw new Error("Stage C fixed AC admission differs");
  }
  const [
    sealedLaunchctl,
    sealedLaunchctlStderr,
    sealedPlist,
    livePlist,
    sealedPsStdout,
    sealedPsStderr,
  ] =
    await Promise.all([
      readV1R11HeldIdentity(
        parsedEvidence.launchctlPrint,
        parsedEvidence.launchctlPrint.schema,
        "Stage C launchctl snapshot",
      ),
      readV1R11HeldFile(
        parsedEvidence.launchctlStderr.path,
        "Stage C launchctl stderr snapshot",
      ),
      readV1R11HeldIdentity(
        parsedEvidence.plistSnapshot,
        parsedEvidence.plistSnapshot.schema,
        "Stage C plist snapshot",
      ),
      readV1R11HeldFile(
        parsedEvidence.plistSource.plist_path,
        "Stage C live plist source",
      ),
      readV1R11HeldIdentity(
        parsedEvidence.psStdout,
        parsedEvidence.psStdout.schema,
        "Stage C ps stdout snapshot",
      ),
      readV1R11HeldIdentity(
        parsedEvidence.psStderr,
        parsedEvidence.psStderr.schema,
        "Stage C ps stderr snapshot",
      ),
    ]);
  const plistMetadata = await fs.promises.lstat(
    parsedEvidence.plistSource.plist_path,
  );
  const expectedPlist =
    buildHalfkp81V1R11StageCExpectedPlistForTests(parsedEvidence);
  validateHalfkp81V1R11StageCRawCapturesForTests(parsedEvidence, {
    sealedLaunchctl,
    liveLaunchctl: launchctlRaw,
    sealedLaunchctlStderr,
    liveLaunchctlStderr: launchctlStderrRaw,
    sealedPlist,
    livePlist,
    sealedPsStdout,
    sealedPsStderr,
  });
  if (
    !sealedPlist.equals(expectedPlist) ||
    plistMetadata.dev !== parsedEvidence.plistSource.dev ||
    plistMetadata.ino !== parsedEvidence.plistSource.ino ||
    plistMetadata.uid !== parsedEvidence.plistSource.uid ||
    (plistMetadata.mode & 0o7777) !== parsedEvidence.plistSource.mode ||
    plistMetadata.nlink !== parsedEvidence.plistSource.nlink ||
    plistMetadata.size !== parsedEvidence.plistSource.bytes ||
    (await fs.promises.realpath(parsedEvidence.plistSource.plist_path)) !==
      parsedEvidence.plistSource.realpath
  ) {
    throw new Error("Stage C held LaunchAgent/plist evidence differs");
  }
  const observedAtUtc = new Date().toISOString();
  const powerAdmissionPreimage = Object.freeze({
    schema:
      "shogi-halfkp81-depth18-yaneura-only-v1r11-formal-power-admission-preimage-v1",
    status: "fresh-fixed-raw-capture-no-formal-authority",
    commands,
    battery_stdout_base64: batteryRaw.toString("base64"),
    battery_stdout_bytes: batteryRaw.byteLength,
    battery_stdout_sha256: v1r11Sha256(batteryRaw),
    assertions_stdout_base64: assertionsRaw.toString("base64"),
    assertions_stdout_bytes: assertionsRaw.byteLength,
    assertions_stdout_sha256: v1r11Sha256(assertionsRaw),
    launchctl_stdout_base64: launchctlRaw.toString("base64"),
    launchctl_stdout_bytes: launchctlRaw.byteLength,
    launchctl_stdout_sha256: v1r11Sha256(launchctlRaw),
    runner_pid: parsedEvidence.runnerPid,
    caffeinate_assertion_holder_pid: parsedEvidence.holderPid,
    assertion_owner_caffeinate_pid: parsedEvidence.holderPid,
    observed_at_utc: observedAtUtc,
  });
  const payload = Object.freeze({
    power_source: battery.powerSource,
    battery_percentage: battery.batteryPercentage,
    required_assertions: REQUIRED_ASSERTIONS,
    assertion_owner_matches_caffeinate_pid: true,
    launchagent_authority: launchAgentAuthority,
    power_admission_preimage: powerAdmissionPreimage,
    observed_at_utc: observedAtUtc,
  });
  const stdout = v1r11CanonicalLine(payload);
  return Object.freeze({
    result: Object.freeze({
      collector: Object.freeze({
        schema:
          "shogi-halfkp81-depth18-yaneura-only-v1r11-fixed-stage-c-live-collector-v1",
        status: "fixed-production-collector",
        entrypoint: "ml/produce-halfkp81-depth18-v1r11-stage-bc.ts",
      }),
      request_or_command: Object.freeze(commands.flat()),
      exit_code: 0,
      stdout,
      stderr: Buffer.alloc(0),
      captured_at_utc: observedAtUtc,
    }),
    launchAgentAuthority,
    activeLaunchAgent: Object.freeze({
      label: parsedEvidence.label,
      plistSnapshot: parsedEvidence.plistSnapshot,
    }),
    runnerIdentity: Object.freeze({
      pid: parsedEvidence.runnerProcess.pid,
      pgid: parsedEvidence.runnerProcess.pgid,
      lstart: parsedEvidence.runnerProcess.lstart,
    }),
  });
}

/**
 * Production gate-13 admission. It captures fixed live OS evidence and appends
 * gate 13, but deliberately returns no formal-teacher capability; the distinct
 * finalizer and independent verifier still have to publish the final receipt.
 */
export async function executeHalfkp81V1R11ProductionStageCAdmission(
  context: Readonly<Halfkp81V1R11StageBContext>,
): Promise<
  Readonly<{
    evidence: Readonly<V1R11AuthorityFileIdentity>;
    receipt: Readonly<V1R11AuthorityFileIdentity>;
    ledger: Readonly<V1R11AuthorityFileIdentity>;
    launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity>;
  }>
> {
  const gate = "ac-power-start-admission-pass";
  const sequence = 13;
  const faultPath = path.join(
    context.authorityDirectory.path,
    "preformal-terminal-fault.json",
  );
  let stageAPrefix: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity> | null = null;
  let activeLaunchAgent: Halfkp81V1R11StageCAdmissionCapture["activeLaunchAgent"] | null = null;
  let runnerIdentity: Halfkp81V1R11StageCAdmissionCapture["runnerIdentity"] | null = null;
  let artifactProgress: Halfkp81V1R11StageCArtifactProgress = {
    source: null,
    evidence: null,
    receipt: null,
  };
  try {
    if (
      context.formalRunIntent === undefined ||
      halfkp81V1R11FormalRunFingerprintV2(context.formalRunIntent) !==
        context.formalRunFingerprint
    ) {
      throw new Error("production Stage C formal-run-intent-v2 differs");
    }
    await assertV1R11CreateOnlyTargetAbsent(
      context.authorityDirectory,
      faultPath,
      "Stage C terminal-fault collision",
    );
    if (context.authorityDirectory.path !== AUTHORITY_DIRECTORY) {
      throw new Error("production Stage C authority namespace differs");
    }
    expectedImplementation(context.repositoryRoot, context.sourceRevision);
    await readV1R11HeldIdentity(
      context.teacherPlan,
      context.teacherPlan.schema,
      "Stage C teacher plan",
    );
    const stageA = await authenticateStageA(context);
    stageAPrefix = stageA.ledgerPrefix;
    const handoff = await authenticateHandoff(context, sequence);
    const capture = await collectFixedStageCAdmission(context);
    launchAgentAuthority = capture.launchAgentAuthority;
    activeLaunchAgent = capture.activeLaunchAgent;
    runnerIdentity = capture.runnerIdentity;
    await assertV1R11CreateOnlyTargetAbsent(
      context.authorityDirectory,
      faultPath,
      "Stage C post-live-admission fault collision",
    );
    const current = await readV1R11HeldIdentity(
      context.currentLedger,
      LEDGER_SCHEMA,
      "Stage C handoff ledger revalidation",
    );
    if (!current.equals(handoff.currentLedgerRaw)) {
      throw new Error("Stage C ledger changed during live admission");
    }
    const result = await executeHalfkp81V1R11StageCAdmissionInternal(
      context,
      capture,
      artifactProgress,
    );
    await assertV1R11CreateOnlyTargetAbsent(
      context.authorityDirectory,
      faultPath,
      "Stage C post-append fault collision",
    );
    return Object.freeze({ ...result, launchAgentAuthority });
  } catch (error) {
    let failure = error instanceof Error ? error : new Error(String(error));
    try {
      artifactProgress =
        await recoverHalfkp81V1R11StageCArtifactProgressForTests(
          context.gateDirectory.path,
          artifactProgress,
        );
    } catch (recoveryError) {
      const recoveryFailure =
        recoveryError instanceof Error
          ? recoveryError
          : new Error(String(recoveryError));
      failure = new Error(
        `${failure.message}; Stage C partial-artifact recovery failed: ${recoveryFailure.message}`,
      );
    }
    const reportedFailure = new Error(
      halfkp81V1R11StageCTerminalFaultMessageForTests(
        failure,
        artifactProgress,
      ),
      { cause: failure },
    );
    const partialArtifacts = [
      artifactProgress.source,
      artifactProgress.evidence,
      artifactProgress.receipt,
    ].filter(
      (identity): identity is Readonly<V1R11AuthorityFileIdentity> =>
        identity !== null,
    );
    throw new Halfkp81V1R11PreformalStageFailure({
      phase: "final-ac-gate",
      gate,
      sequence,
      runnerState: runnerIdentity === null ? "not-created" : "active",
      failure: reportedFailure,
      artifacts: Object.freeze({
        ledgerPrefix: stageAPrefix,
        lastGateReceipt: halfkp81V1R11StageCLatestReceiptForTests(
          context.previousGateReceipt,
          artifactProgress,
        ),
        engineGateVerifiedReceipt: context.stageAReceipt,
        launchAgentAuthority,
        activeLaunchAgent,
        runnerIdentity,
        partialArtifacts: Object.freeze(partialArtifacts),
      }),
    });
  }
}

function fixedStageBCommand(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  stage: Readonly<{
    sequence: number;
    stage_b_run_fingerprint: string;
    stage_b_epoch_namespace: string;
  }>,
): readonly string[] {
  return Object.freeze([
    process.execPath,
    "-r",
    path.join(context.repositoryRoot, "node_modules/tsx/dist/cjs/index.cjs"),
    path.join(
      context.repositoryRoot,
      "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts",
    ),
    "--gate",
    gate,
    "--sequence",
    String(stage.sequence),
    "--stage-b-run-fingerprint",
    stage.stage_b_run_fingerprint,
    "--stage-b-epoch-namespace",
    stage.stage_b_epoch_namespace,
    "--stage-a-receipt",
    context.stageAReceipt.path,
  ]);
}

function fixedStageBParentJobPaths(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  sequence: number,
  fingerprint: string,
): Readonly<{
  label: string;
  directory: string;
  plistPath: string;
  stdoutPath: string;
  stderrPath: string;
}> {
  const label = `com.meetyudai.shogi.v1r11-stage-b-${String(sequence).padStart(2, "0")}-${gate}-${fingerprint.slice(0, 12)}`;
  const directory = path.join(
    path.dirname(context.authorityDirectory.path),
    ".halfkp81-depth18-yaneura-only-v1r11-stage-b-private",
    `${String(sequence).padStart(2, "0")}-${gate}-${fingerprint}`,
  );
  return Object.freeze({
    label,
    directory,
    plistPath: path.join(directory, `${label}.plist`),
    stdoutPath: path.join(directory, `${label}.stdout`),
    stderrPath: path.join(directory, `${label}.stderr`),
  });
}

export function fixedHalfkp81V1R11StageBParentJobPathsForTests(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
  sequence: number,
  fingerprint: string,
) {
  return fixedStageBParentJobPaths(
    context,
    gate,
    sequence,
    fingerprint,
  );
}

function fixedProductionStageBCollector(
  context: Readonly<Halfkp81V1R11StageBContext>,
): Readonly<Halfkp81V1R11StageBCollector> {
  return Object.freeze({
    async collectGate(
      gate: Halfkp81V1R11StageBGate,
      stage: Readonly<{
        sequence: number;
        stage_b_run_fingerprint: string;
        stage_b_epoch_namespace: string;
      }>,
    ) {
      const command = fixedStageBCommand(context, gate, stage);
      const faultPath = path.join(
        context.authorityDirectory.path,
        "preformal-terminal-fault.json",
      );
      const privateJob = fixedStageBParentJobPaths(
        context,
        gate,
        stage.sequence,
        stage.stage_b_run_fingerprint,
      );
      const privateBase = path.dirname(privateJob.directory);
      fs.mkdirSync(privateBase, { recursive: true, mode: 0o700 });
      const baseMetadata = fs.lstatSync(privateBase);
      if (
        !baseMetadata.isDirectory() ||
        baseMetadata.isSymbolicLink() ||
        fs.realpathSync.native(privateBase) !== privateBase ||
        baseMetadata.uid !== process.getuid?.() ||
        (baseMetadata.mode & 0o077) !== 0
      ) {
        throw new Error("fixed Stage B private LaunchAgent base differs");
      }
      fs.mkdirSync(privateJob.directory, { mode: 0o700 });
      const jobMetadata = fs.lstatSync(privateJob.directory);
      if (
        !jobMetadata.isDirectory() ||
        jobMetadata.isSymbolicLink() ||
        fs.realpathSync.native(privateJob.directory) !== privateJob.directory ||
        jobMetadata.uid !== process.getuid?.() ||
        (jobMetadata.mode & 0o777) !== 0o700
      ) {
        throw new Error("fixed Stage B private LaunchAgent directory differs");
      }
      const uid = process.getuid?.();
      if (!Number.isSafeInteger(uid) || Number(uid) < 1) {
        throw new Error("fixed Stage B LaunchAgent uid differs");
      }
      const completed = await superviseHalfkp81V1R11StageBLaunchAgent({
        label: privateJob.label,
        uid: Number(uid),
        workingDirectory: context.repositoryRoot,
        plistPath: privateJob.plistPath,
        stdoutPath: privateJob.stdoutPath,
        stderrPath: privateJob.stderrPath,
        utilityArgv: command,
        pollIntervalMs: 1_000,
        timeoutMs: 24 * 60 * 60 * 1_000,
        abortIfPathExists: faultPath,
      });
      await assertV1R11CreateOnlyTargetAbsent(
        context.authorityDirectory,
        faultPath,
        "Stage B post-reap terminal-fault collision",
      );
      return Object.freeze({
        collector: Object.freeze({
          schema:
            "shogi-halfkp81-depth18-v1r11-fixed-stage-b-launchagent-parent-collector-v1",
          status: "fixed-production-launchagent-parent-collector",
          entrypoint: "ml/run-halfkp81-depth18-v1r11-stage-b-engine-gate.ts",
        }),
        request_or_command: command,
        exit_code: 0,
        stdout: v1r11CanonicalLine(completed),
        stderr: Buffer.alloc(0),
        captured_at_utc: new Date().toISOString(),
      });
    },
  });
}

/** Production wrapper has no injected collector or caller-authored result seam. */
export async function executeHalfkp81V1R11ProductionStageBEpoch(
  context: Readonly<Halfkp81V1R11StageBContext>,
  gate: Halfkp81V1R11StageBGate,
) {
  if (context.authorityDirectory.path !== AUTHORITY_DIRECTORY) {
    throw new Error("production Stage B authority namespace differs");
  }
  return executeHalfkp81V1R11StageBEpochInternal(
    context,
    gate,
    fixedProductionStageBCollector(context),
  );
}
