import * as crypto from "node:crypto";
import * as path from "node:path";

import { describe, expect, it } from "vitest";

import plan from "../../../ml/halfkp81-hard-depth18-yaneura-only-v1r11-plan.json";
import {
  canonicalHalfkp81Depth18Json,
  validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests,
  validateHalfkp81Depth18V1R11FrozenPowerChainForTests,
  validateHalfkp81Depth18V1R11FrozenDownstreamPlanForTests,
  validateHalfkp81Depth18V1R11FinalLaunchAgentTopologyForTests,
  validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests,
  validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81Depth18PrivateSnapshot,
  type Halfkp81Depth18V1R11FrozenDownstreamDocumentKind,
} from "../../../ml/halfkp81-depth18-teacher-artifact-validation";

const SHA = "a".repeat(64);
const REVISION = "b".repeat(40);
const FINGERPRINT = "c".repeat(64);
const ROOT = "/private/tmp/v1r11-frozen";

function identity(name: string, schema: string) {
  return {
    path: path.join(ROOT, name),
    bytes: 123,
    sha256: SHA,
    schema,
  };
}

function digest(value: string | Uint8Array): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function snapshotBytes(
  file: string,
  bytes: Buffer,
): Readonly<Halfkp81Depth18PrivateSnapshot> {
  return Object.freeze({
    bytes: new Uint8Array(bytes),
    identity: Object.freeze({
      path: path.join(ROOT, file),
      bytes: bytes.byteLength,
      sha256: digest(bytes),
    }),
  });
}

function snapshotValue(
  file: string,
  value: unknown,
): Readonly<Halfkp81Depth18PrivateSnapshot> {
  return snapshotBytes(
    file,
    Buffer.from(`${canonicalHalfkp81Depth18Json(value)}\n`, "utf8"),
  );
}

function rawTranscript(schema: string, text: string) {
  const bytes = Buffer.from(text, "utf8");
  return {
    schema,
    encoding: "base64",
    base64: bytes.toString("base64"),
    decoded_bytes: bytes.byteLength,
    sha256: digest(bytes),
  };
}

function emptyPsCapture(
  startedAt: string,
  finishedAt: string,
  startedNs: bigint,
  finishedNs: bigint,
  stdoutSchema = "text/plain-exact-final-ps-stdout",
  stderrSchema = "text/plain-exact-final-ps-stderr",
) {
  return {
    command: [
      "/bin/ps",
      "-ww",
      "-axo",
      "pid=,ppid=,pgid=,lstart=,command=",
    ],
    started_at_utc: startedAt,
    finished_at_utc: finishedAt,
    started_monotonic_ns: startedNs.toString(),
    finished_monotonic_ns: finishedNs.toString(),
    exit_code: 0,
    signal: null,
    stdout: rawTranscript(stdoutSchema, ""),
    stderr: rawTranscript(stderrSchema, ""),
    parsed_process_rows: [],
  };
}

function cleanupEvidenceFixture(
  teacherPlanIdentity: Readonly<Record<string, unknown>>,
  plistIdentity: Readonly<Record<string, unknown>>,
  producer: Readonly<Record<string, unknown>>,
) {
  const label = "com.meetyudai.v1r11";
  const uid = 501;
  const runnerIdentity = {
    pid: 410,
    pgid: 410,
    lstart: "Sun Aug 2 12:00:00 2026",
  };
  const preCleanupRows = [
    {
      pid: 410,
      ppid: 1,
      pgid: 410,
      lstart: runnerIdentity.lstart,
      executable: "/usr/bin/node",
      argv: "/usr/bin/node runner.ts",
      role: "runner",
    },
    {
      pid: 412,
      ppid: 410,
      pgid: 410,
      lstart: "Sun Aug 2 12:00:01 2026",
      executable: "/usr/bin/caffeinate",
      argv: "/usr/bin/caffeinate -dimsu -w 410",
      role: "assertion-holder",
    },
  ];
  const preCleanupStdout =
    "410 1 410 Sun Aug 2 12:00:00 2026 /usr/bin/node runner.ts\n" +
    "412 410 410 Sun Aug 2 12:00:01 2026 /usr/bin/caffeinate -dimsu -w 410\n";
  const bootoutProbe = emptyPsCapture(
    "2026-08-02T12:00:00.040Z",
    "2026-08-02T12:00:00.050Z",
    40n,
    50n,
  );
  const termProbe = emptyPsCapture(
    "2026-08-02T12:00:00.080Z",
    "2026-08-02T12:00:00.090Z",
    80n,
    90n,
  );
  const killProbe = emptyPsCapture(
    "2026-08-02T12:00:00.120Z",
    "2026-08-02T12:00:00.130Z",
    120n,
    130n,
  );
  return {
    schema:
      "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11",
    status: "cleanup-independently-recomputable-no-authority",
    scope: "post-formal-environment",
    teacher_plan: teacherPlanIdentity,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    launchagent: { label, plist_snapshot: plistIdentity },
    runner_identity: runnerIdentity,
    pre_cleanup_ps: {
      ...emptyPsCapture(
        "2026-08-02T12:00:00.000Z",
        "2026-08-02T12:00:00.010Z",
        0n,
        10n,
        "text/plain-exact-pre-cleanup-ps-stdout",
        "text/plain-exact-pre-cleanup-ps-stderr",
      ),
      stdout: rawTranscript(
        "text/plain-exact-pre-cleanup-ps-stdout",
        preCleanupStdout,
      ),
      parsed_process_rows: preCleanupRows,
    },
    pre_cleanup_process_rows: preCleanupRows,
    ordered_cleanup_commands: [
      {
        sequence: 1,
        phase: "bootout",
        argv: ["/bin/launchctl", "bootout", `gui/${uid}/${label}`],
        target_pid: runnerIdentity.pid,
        target_pgid: runnerIdentity.pgid,
        target_lstart: runnerIdentity.lstart,
        started_at_utc: "2026-08-02T12:00:00.020Z",
        finished_at_utc: "2026-08-02T12:00:00.030Z",
        started_monotonic_ns: "20",
        finished_monotonic_ns: "30",
        exit_code: 0,
        signal: null,
        disposition: "executed",
        stdout: rawTranscript("text/plain-exact-command-stdout", ""),
        stderr: rawTranscript("text/plain-exact-command-stderr", ""),
        absence_probe: bootoutProbe,
      },
      {
        sequence: 2,
        phase: "TERM",
        argv: ["/bin/kill", "-TERM", "--", `-${runnerIdentity.pgid}`],
        target_pid: runnerIdentity.pid,
        target_pgid: runnerIdentity.pgid,
        target_lstart: runnerIdentity.lstart,
        started_at_utc: "2026-08-02T12:00:00.060Z",
        finished_at_utc: "2026-08-02T12:00:00.070Z",
        started_monotonic_ns: "60",
        finished_monotonic_ns: "70",
        exit_code: null,
        signal: null,
        disposition: "not-required-after-held-post-bootout-absence-probe",
        stdout: null,
        stderr: null,
        absence_probe: termProbe,
      },
      {
        sequence: 3,
        phase: "KILL",
        argv: ["/bin/kill", "-KILL", "--", `-${runnerIdentity.pgid}`],
        target_pid: runnerIdentity.pid,
        target_pgid: runnerIdentity.pgid,
        target_lstart: runnerIdentity.lstart,
        started_at_utc: "2026-08-02T12:00:00.100Z",
        finished_at_utc: "2026-08-02T12:00:00.110Z",
        started_monotonic_ns: "100",
        finished_monotonic_ns: "110",
        exit_code: null,
        signal: null,
        disposition: "not-required-after-held-absence-probe",
        stdout: null,
        stderr: null,
        absence_probe: killProbe,
      },
    ],
    service_absence: {
      command: ["/bin/launchctl", "print", `gui/${uid}/${label}`],
      started_at_utc: "2026-08-02T12:00:00.140Z",
      finished_at_utc: "2026-08-02T12:00:00.150Z",
      started_monotonic_ns: "140",
      finished_monotonic_ns: "150",
      exit_code: 113,
      signal: null,
      stdout: rawTranscript("text/plain-exact-command-stdout", ""),
      stderr: rawTranscript(
        "text/plain-exact-command-stderr",
        `Bad request.\nCould not find service "${label}" in domain for user gui: ${uid}\n`,
      ),
      parsed_service_absent: true,
    },
    pid_reuse_rejection: {
      identity_tuple_fields: ["pid", "pgid", "lstart", "executable"],
      checked_pids: [410, 412],
      rejected_reuse_rows: [],
      all_reuse_rejected: true,
    },
    final_ps_first: emptyPsCapture(
      "2026-08-02T12:00:00.160Z",
      "2026-08-02T12:00:00.170Z",
      160n,
      170n,
    ),
    final_ps_second: emptyPsCapture(
      "2026-08-02T12:00:01.170Z",
      "2026-08-02T12:00:01.180Z",
      1_000_000_170n,
      1_000_000_180n,
    ),
    remaining_process_rows: [],
    remaining_process_group_rows: [],
    process_cleanup: {
      scheduling_stopped: true,
      engines_terminated: 0,
      engines_reaped: 0,
      remaining_engine_pids: [],
    },
    producer,
    captured_at_utc: "2026-08-02T12:00:01.200Z",
    authority: {
      may_execute_preformal_engine_gates: false,
      may_execute_formal_teacher: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  };
}

const teacherPlan = identity(
  "teacher-plan.json",
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
);
const launch = identity(
  "launchagent-authority-evidence.json",
  "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
);
const preformal = identity(
  "preformal-authority-verified-receipt.json",
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11",
);
const preformalLedger = identity(
  "preformal-authority-ledger.jsonl",
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
);
const preformalRaw = identity(
  "preformal-authority-receipt.json",
  "shogi-halfkp81-depth18-yaneura-only-preformal-authority-receipt-v1r11",
);
const powerLedger = identity(
  "power-continuity.jsonl",
  "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
);
const powerReceipt = identity(
  "power-continuity-receipt.json",
  "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
);
const cleanupEvidence = identity(
  "environment-process-cleanup-evidence.json",
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11",
);
const work = identity(
  "teacher-work.jsonl",
  "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11",
);
const rawTeacher = identity(
  "teacher-receipt.json",
  "shogi-halfkp81-hard-depth18-teacher-receipt-v1r11",
);
const output = {
  fit: identity("fit.jsonl", "canonical-shogi-sibling-v1-jsonl-one-lf-per-row"),
  tune: identity(
    "tune.jsonl",
    "canonical-shogi-sibling-v1-jsonl-one-lf-per-row",
  ),
  sealed: identity(
    "sealed.jsonl",
    "canonical-shogi-sibling-v1-jsonl-one-lf-per-row",
  ),
};
const implementation = {
  source_revision: REVISION,
  entrypoint: "ml/verifier.ts",
  dependency_closure: [{ path: "ml/verifier.ts", bytes: 123, sha256: SHA }],
};

const powerEntry = {
  schema: "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
  status: "admission-pass",
  entry_kind: "admission",
  timestamp_utc: "2026-08-02T12:00:00.000Z",
  teacher_plan: teacherPlan,
  source_revision: REVISION,
  run_fingerprint: FINGERPRINT,
  launchagent_authority_evidence: launch,
  preformal_authority_verified_receipt: preformal,
  observation: {},
  environment_fault: null,
  previous_entry_sha256: null,
  entry_sha256: SHA,
};

const documents: Readonly<
  Record<Halfkp81Depth18V1R11FrozenDownstreamDocumentKind, unknown>
> = {
  "launchagent-authority": {
    schema:
      "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    status:
      "live-one-shot-LaunchAgent-semantics-verified-no-standalone-formal-authority",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    observed_at_utc: "2026-08-02T12:00:00.000Z",
    uid: 501,
    xpc_service_name: "com.meetyudai.v1r11",
    label: "com.meetyudai.v1r11",
    runner_pid: 123,
    working_directory: "/private/tmp/repo",
    stdout_path: path.join(ROOT, "stdout.log"),
    stderr_path: path.join(ROOT, "stderr.log"),
    program_arguments: ["npx", "tsx"],
    runner_utility_argv: ["npx", "tsx"],
    caffeinate_holder: {},
    required_assertions: [],
    launchctl_command: ["/bin/launchctl", "print", "gui/501/label"],
    launchctl_exit_code: 0,
    launchctl_print: identity(
      "launchctl.txt",
      "text/plain-utf8-exact-command-stdout",
    ),
    launchctl_stderr: identity(
      "launchctl.stderr.txt",
      "text/plain-utf8-exact-command-stderr",
    ),
    plist_source: {},
    plist_snapshot: identity(
      "launchagent.plist.snapshot",
      "application/x-apple-aspen-config-exact-bytes",
    ),
    ps_command: [
      "/bin/ps",
      "-ww",
      "-axo",
      "pid=,ppid=,pgid=,lstart=,command=",
    ],
    ps_exit_code: 0,
    ps_stdout: identity(
      "launchagent-ps.stdout.txt",
      "text/plain-exact-launchagent-ps-stdout",
    ),
    ps_stderr: identity(
      "launchagent-ps.stderr.txt",
      "text/plain-exact-launchagent-ps-stderr",
    ),
    runner_process: {},
    assertion_holder_process: {},
    observed_process_group_rows: [],
    observed_yaneuraou_engine_rows: [],
    producer: implementation,
  },
  "preformal-verified": {
    schema:
      "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11",
    status:
      "all-required-preformal-gates-independently-verified-formal-only-authority",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    required_order: [],
    ledger: preformalLedger,
    raw_receipt: preformalRaw,
    gates: {},
    launchagent_authority: launch,
    verifier: implementation,
    authority: {
      may_execute_formal_teacher: true,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  },
  "teacher-work-header": {
    schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-work-v1r11",
    status: "formal-work-ledger-open",
    record_kind: "header",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    launchagent_authority_evidence: launch,
    preformal_authority_verified_receipt: preformal,
    power_admission_entry: powerEntry,
    opened_at_utc: "2026-08-02T12:00:00.000Z",
  },
  "power-ledger-entry": powerEntry,
  "power-receipt": {
    schema: "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
    status: "power-continuity-verified",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    power_ledger: powerLedger,
    admission_entry: powerEntry,
    final_entry: { ...powerEntry, status: "final-pass", entry_kind: "final" },
    launchagent_authority_evidence: launch,
    preformal_authority_verified_receipt: preformal,
    pmset_start_anchor: {},
    pmset_end_anchor: {},
    environment_fault_preimage_sha256: null,
    producer: implementation,
  },
  "raw-teacher-receipt": {
    schema: "shogi-halfkp81-hard-depth18-teacher-receipt-v1r11",
    status: "complete-unverified-no-training-authority",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    teacher_work: work,
    teacher_output: output,
    preformal_authority_ledger: preformalLedger,
    preformal_authority_raw_receipt: preformalRaw,
    preformal_authority_verified_receipt: preformal,
    launchagent_authority_evidence: launch,
    power_continuity_ledger: powerLedger,
    power_continuity_receipt: powerReceipt,
    finalizer: implementation,
    authority: {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  },
  "verified-artifact-receipt": {
    schema:
      "shogi-halfkp81-hard-depth18-teacher-verified-artifact-receipt-v1r11",
    status:
      "teacher-artifacts-and-authority-chain-independently-verified-training-only-authority",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    raw_teacher_receipt: rawTeacher,
    teacher_work: work,
    teacher_output: output,
    preformal_authority_ledger: preformalLedger,
    preformal_authority_raw_receipt: preformalRaw,
    preformal_authority_verified_receipt: preformal,
    launchagent_authority_evidence: launch,
    power_continuity_ledger: powerLedger,
    power_continuity_receipt: powerReceipt,
    verifier: implementation,
    authority: {
      may_train_fixed_v1r11_candidate: true,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  },
  "environment-terminal-fault": {
    schema:
      "shogi-halfkp81-hard-depth18-yaneura-only-environment-terminal-fault-v1r11",
    status: "environment-continuity-fault-family-closed",
    teacher_plan: teacherPlan,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    preformal_authority_verified_receipt: preformal,
    launchagent_authority_evidence: launch,
    power_continuity_ledger: powerLedger,
    power_continuity_receipt: powerReceipt,
    fault_preimage_sha256: SHA,
    fault: {},
    process_cleanup_evidence: cleanupEvidence,
    process_cleanup: {},
    faulted_at_utc: "2026-08-02T12:00:00.000Z",
    authority: {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  },
};

function frozenPowerFixture(kind: "success" | "fault") {
  const planSnapshot = snapshotValue("teacher-plan.json", {
    schema: "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
    source_revision: REVISION,
  });
  const launchAgentPlist = snapshotBytes(
    "launchagent.plist.snapshot",
    Buffer.from(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<plist><dict>",
        "<key>Label</key><string>com.meetyudai.v1r11</string>",
        "<key>ProgramArguments</key><array>",
        "<string>/usr/bin/node</string>",
        "<string>runner.ts</string>",
        "</array>",
        "</dict></plist>",
        "",
      ].join("\n"),
      "utf8",
    ),
  );
  const launchSnapshot = snapshotValue("launch.json", {
    label: "com.meetyudai.v1r11",
    uid: 501,
    runner_pid: 410,
    runner_utility_argv: ["/usr/bin/node", "runner.ts"],
    program_arguments: ["/usr/bin/node", "runner.ts"],
    runner_process: {
      pid: 410,
      ppid: 1,
      pgid: 410,
      lstart: "Sun Aug 2 12:00:00 2026",
      executable: "/usr/bin/node",
      argv: "/usr/bin/node runner.ts",
      role: "runner",
    },
    assertion_holder_process: {
      pid: 412,
      ppid: 410,
      pgid: 410,
      lstart: "Sun Aug 2 12:00:01 2026",
      executable: "/usr/bin/caffeinate",
      argv: "/usr/bin/caffeinate -dimsu -w 410",
      role: "assertion-holder",
    },
    caffeinate_holder: {
      pid: 412,
      parent_runner_pid: 410,
      assertion_owner_pid: 412,
      executable: "/usr/bin/caffeinate",
      argv: [
        "/usr/bin/caffeinate",
        "-dimsu",
        "-w",
        "410",
      ],
    },
  });
  const preformalSnapshot = snapshotValue("preformal.json", {
    held: "preformal",
  });
  const fullIdentity = (
    held: Readonly<Halfkp81Depth18PrivateSnapshot>,
    schema: string,
  ) => ({ ...held.identity, schema });
  const teacherPlanIdentity = fullIdentity(
    planSnapshot,
    "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r11",
  );
  const launchIdentity = fullIdentity(
    launchSnapshot,
    "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
  );
  const preformalIdentity = fullIdentity(
    preformalSnapshot,
    "shogi-halfkp81-depth18-yaneura-only-preformal-authority-verified-receipt-v1r11",
  );
  const plistIdentity = fullIdentity(
    launchAgentPlist,
    "application/x-apple-aspen-config-exact-bytes",
  );
  const cleanupProducer = {
    source_revision: REVISION,
    entrypoint:
      "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
    dependency_closure: [
      {
        path: "ml/produce-halfkp81-depth18-v1r11-process-cleanup-evidence.ts",
        bytes: 123,
        sha256: SHA,
      },
    ],
  };
  const cleanupSnapshot = snapshotValue(
    "environment-process-cleanup-evidence.json",
    cleanupEvidenceFixture(
      teacherPlanIdentity,
      plistIdentity,
      cleanupProducer,
    ),
  );
  const cleanupIdentity = fullIdentity(
    cleanupSnapshot,
    "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11",
  );
  const pmsetRows = [
    "2026-08-02 12:00:00 -0700 Assertions admission",
    "2026-08-02 12:00:30 -0700 Assertions final",
  ];
  const anchor = (ordinal: number, timestamp: string) => ({
    boot_session_identity: "boot-v1r11",
    timestamp_utc: timestamp,
    timezone_offset: "-07:00",
    pmset_event_ordinal: ordinal,
    last_raw_event_line_sha256: digest(pmsetRows[ordinal - 1]!),
  });
  const start = anchor(1, "2026-08-02T12:00:00.000Z");
  const observation = (
    timestamp: string,
    ordinal: number,
    powerSource: string,
    battery: number,
  ) => ({
    timestamp_utc: timestamp,
    power_source: powerSource,
    battery_percentage: battery,
    runner_pid: 410,
    guardian_pid: 411,
    caffeinate_assertion_holder_pid: 412,
    caffeinate_assertion_holder_parent_runner_pid: 410,
    caffeinate_executable: "/usr/bin/caffeinate",
    caffeinate_argv: [
      "/usr/bin/caffeinate",
      "-dimsu",
      "-w",
      "410",
    ],
    runner_utility_argv: ["/usr/bin/node", "runner.ts"],
    launchagent_authority_evidence: launchIdentity,
    preformal_authority_verified_receipt: preformalIdentity,
    assertion_owner_caffeinate_pid: 412,
    required_assertions: [
      "PreventSystemSleep",
      "PreventUserIdleSystemSleep",
      "PreventUserIdleDisplaySleep",
    ],
    boot_session_identity: "boot-v1r11",
    pmset_start_anchor: start,
    pmset_current_cursor: anchor(ordinal, timestamp),
  });
  const seal = (entry: Record<string, unknown>) => {
    const preimage = { ...entry };
    delete preimage.entry_sha256;
    return {
      ...preimage,
      entry_sha256: digest(
        `shogi-halfkp81-depth18-power-continuity-entry-v1r11\0${canonicalHalfkp81Depth18Json(preimage)}`,
      ),
    };
  };
  const admission = seal({
    schema: "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
    status: "admission-pass",
    entry_kind: "admission",
    timestamp_utc: "2026-08-02T12:00:00.000Z",
    teacher_plan: teacherPlanIdentity,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    launchagent_authority_evidence: launchIdentity,
    preformal_authority_verified_receipt: preformalIdentity,
    observation: observation("2026-08-02T12:00:00.000Z", 1, "AC Power", 95),
    environment_fault: null,
    previous_entry_sha256: null,
  });
  const environmentFault = {
    kind: "environment-continuity" as const,
    message: "AC lost",
  };
  const faultIntent = {
    schema:
      "shogi-halfkp81-hard-depth18-yaneura-only-environment-fault-intent-v1r11",
    status: "runner-closed-power-fault-awaiting-outer-cleanup",
    teacher_plan: teacherPlanIdentity,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    preformal_authority_verified_receipt: preformalIdentity,
    launchagent_authority_evidence: launchIdentity,
    fault: environmentFault,
    authority: {
      may_publish_terminal_fault: false,
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  };
  const faultPreimage = digest(canonicalHalfkp81Depth18Json(faultIntent));
  const final = seal({
    schema: "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
    status: kind === "success" ? "final-pass" : "environment-fault",
    entry_kind: kind === "success" ? "final" : "environment-fault",
    timestamp_utc: "2026-08-02T12:00:30.000Z",
    teacher_plan: teacherPlanIdentity,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    launchagent_authority_evidence: launchIdentity,
    preformal_authority_verified_receipt: preformalIdentity,
    observation: observation(
      "2026-08-02T12:00:30.000Z",
      2,
      kind === "success" ? "AC Power" : "Battery Power",
      kind === "success" ? 94 : 79,
    ),
    environment_fault:
      kind === "success"
        ? null
        : {
            ...environmentFault,
            intent_sha256: faultPreimage,
          },
    previous_entry_sha256: admission.entry_sha256,
  });
  const ledgerSnapshot = snapshotBytes(
    "power-continuity.jsonl",
    Buffer.from(
      `${canonicalHalfkp81Depth18Json(admission)}\n${canonicalHalfkp81Depth18Json(final)}\n`,
      "utf8",
    ),
  );
  const ledgerIdentity = fullIdentity(
    ledgerSnapshot,
    "shogi-halfkp81-depth18-power-continuity-ledger-v1r11",
  );
  const producer = {
    source_revision: REVISION,
    entrypoint: "ml/power-producer.ts",
    dependency_closure: [
      { path: "ml/power-producer.ts", bytes: 123, sha256: SHA },
    ],
  };
  const faultBase = {
    schema:
      "shogi-halfkp81-hard-depth18-yaneura-only-environment-terminal-fault-v1r11",
    status: "environment-continuity-fault-family-closed",
    teacher_plan: teacherPlanIdentity,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    preformal_authority_verified_receipt: preformalIdentity,
    launchagent_authority_evidence: launchIdentity,
    fault: environmentFault,
    process_cleanup_evidence: cleanupIdentity,
    process_cleanup: {
      scheduling_stopped: true,
      engines_terminated: 0,
      engines_reaped: 0,
      remaining_engine_pids: [],
    },
    faulted_at_utc: "2026-08-02T12:00:30.000Z",
    authority: {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    },
  };
  const receiptSnapshot = snapshotValue("power-continuity-receipt.json", {
    schema: "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
    status:
      kind === "success"
        ? "power-continuity-verified"
        : "environment-fault-closed",
    teacher_plan: teacherPlanIdentity,
    source_revision: REVISION,
    run_fingerprint: FINGERPRINT,
    power_ledger: ledgerIdentity,
    admission_entry: admission,
    final_entry: final,
    launchagent_authority_evidence: launchIdentity,
    preformal_authority_verified_receipt: preformalIdentity,
    pmset_start_anchor: start,
    pmset_end_anchor: anchor(2, "2026-08-02T12:00:30.000Z"),
    environment_fault_preimage_sha256:
      kind === "success" ? null : faultPreimage,
    producer,
  });
  const terminalFault =
    kind === "fault"
      ? snapshotValue("terminal-fault.json", {
          ...faultBase,
          power_continuity_ledger: ledgerIdentity,
          power_continuity_receipt: fullIdentity(
            receiptSnapshot,
            "shogi-halfkp81-depth18-power-continuity-receipt-v1r11",
          ),
          fault_preimage_sha256: faultPreimage,
        })
      : undefined;
  return {
    request: {
      plan: planSnapshot,
      ledger: ledgerSnapshot,
      receipt: receiptSnapshot,
      launchAgentAuthority: launchSnapshot,
      launchAgentPlist,
      processCleanupEvidence: cleanupSnapshot,
      preformalAuthority: preformalSnapshot,
      currentPmsetLogRows: pmsetRows,
      runFingerprint: FINGERPRINT,
      ...(terminalFault === undefined ? {} : { terminalFault }),
    },
    admission,
    final,
    receiptSnapshot,
  };
}

describe("HalfKP81 v1r11 frozen downstream schemas", () => {
  it("pins the frozen plan as the primary downstream contract", () => {
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamPlanForTests(plan),
    ).not.toThrow();
    const changed = structuredClone(plan);
    changed.preformal_authority.downstream_binding_contracts.raw_teacher_receipt.status_values =
      ["legacy-status"];
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamPlanForTests(changed),
    ).toThrow(/frozen downstream binding contract/u);

    const prematureLiveAuthority = structuredClone(plan);
    prematureLiveAuthority.preformal_authority.outer_orchestrator_contract.runner_null_launchagent_binding[
      "live-launchagent-authority-evidence-required"
    ] = true;
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamPlanForTests(
        prematureLiveAuthority,
      ),
    ).toThrow(/outer orchestrator contract differs/u);

    for (const [field, drift] of [
      [
        "entrypoint_exact",
        "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts",
      ],
      ["preformal_component_entrypoint_exact", "ml/other-preformal.ts"],
      ["formal_child_entrypoint_exact", "ml/other-child.ts"],
      ["postformal_component_entrypoint_exact", "ml/other-postformal.ts"],
    ] as const) {
      const changedEntrypoint = structuredClone(plan);
      changedEntrypoint.preformal_authority.outer_orchestrator_contract[field] =
        drift;
      expect(() =>
        validateHalfkp81Depth18V1R11FrozenDownstreamPlanForTests(
          changedEntrypoint,
        ),
      ).toThrow(/outer orchestrator contract differs/u);
    }
  });

  it("accepts only the exact frozen key and status sets", () => {
    for (const [kind, document] of Object.entries(documents)) {
      expect(() =>
        validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
          kind as Halfkp81Depth18V1R11FrozenDownstreamDocumentKind,
          document,
        ),
      ).not.toThrow();
      expect(() =>
        validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
          kind as Halfkp81Depth18V1R11FrozenDownstreamDocumentKind,
          { ...(document as object), legacy_extra: true },
        ),
      ).toThrow(/fields are not exact/u);
    }
  });

  it("rejects schema-less identities and provisional authority/status values", () => {
    const workHeader = structuredClone(documents["teacher-work-header"]);
    delete (workHeader as Record<string, Record<string, unknown>>)
      .launchagent_authority_evidence.schema;
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "teacher-work-header",
        workHeader,
      ),
    ).toThrow(/fields are not exact/u);

    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "raw-teacher-receipt",
        {
          ...(documents["raw-teacher-receipt"] as object),
          status: "structurally-complete-awaiting-artifact-verification",
        },
      ),
    ).toThrow(/schema\/status differs/u);

    const verified = structuredClone(documents["verified-artifact-receipt"]);
    (verified as Record<string, unknown>).authority = {
      may_train: false,
      may_play_formal_games: false,
      may_write_live_weights: false,
    };
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "verified-artifact-receipt",
        verified,
      ),
    ).toThrow(/authority differs/u);

    const crossFamily = structuredClone(documents["teacher-work-header"]);
    (
      crossFamily as Record<string, Record<string, unknown>>
    ).teacher_plan.schema =
      "shogi-halfkp81-hard-depth18-yaneura-only-teacher-plan-v1r10";
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenDownstreamDocumentForTests(
        "teacher-work-header",
        crossFamily,
      ),
    ).toThrow(/teacher_plan differs/u);
  });

  it("recomputes the frozen success ledger hashes, invariants and embedded receipt rows", () => {
    const fixture = frozenPowerFixture("success");
    expect(
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests(fixture.request),
    ).toMatchObject({ status: "power-continuity-verified", rows: 2 });

    const receipt = JSON.parse(
      Buffer.from(fixture.receiptSnapshot.bytes).toString("utf8"),
    ) as Record<string, unknown>;
    const final = structuredClone(receipt.final_entry) as Record<
      string,
      unknown
    >;
    final.entry_sha256 = "f".repeat(64);
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests({
        ...fixture.request,
        receipt: snapshotValue("power-continuity-receipt.json", {
          ...receipt,
          final_entry: final,
        }),
      }),
    ).toThrow(/power receipt differs/u);

    const rows = Buffer.from(fixture.request.ledger.bytes)
      .toString("utf8")
      .trimEnd()
      .split("\n")
      .map((row) => JSON.parse(row) as Record<string, unknown>);
    rows[1]!.entry_sha256 = "e".repeat(64);
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests({
        ...fixture.request,
        ledger: snapshotBytes(
          "power-continuity.jsonl",
          Buffer.from(
            `${rows.map(canonicalHalfkp81Depth18Json).join("\n")}\n`,
            "utf8",
          ),
        ),
      }),
    ).toThrow(/digest differs/u);

    expect(() =>
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests({
        ...fixture.request,
        ledger: snapshotBytes(
          "power-continuity.jsonl",
          Buffer.from(
            `${[fixture.final, fixture.admission]
              .map(canonicalHalfkp81Depth18Json)
              .join("\n")}\n`,
            "utf8",
          ),
        ),
      }),
    ).toThrow(/row 1 differs/u);
  });

  it("rejects low-battery admission and row-to-row argv drift before trusting hashes", () => {
    const fixture = frozenPowerFixture("success");
    for (const mutation of [
      (rows: Record<string, unknown>[]) => {
        const observation = rows[0]!.observation as Record<string, unknown>;
        observation.battery_percentage = 79;
      },
      (rows: Record<string, unknown>[]) => {
        const observation = rows[1]!.observation as Record<string, unknown>;
        observation.runner_utility_argv = ["node", "other-runner.ts"];
        observation.caffeinate_argv = [
          "/usr/bin/caffeinate",
          "-dimsu",
          "-w",
          "410",
        ];
      },
    ]) {
      const rows = Buffer.from(fixture.request.ledger.bytes)
        .toString("utf8")
        .trimEnd()
        .split("\n")
        .map((row) => JSON.parse(row) as Record<string, unknown>);
      mutation(rows);
      expect(() =>
        validateHalfkp81Depth18V1R11FrozenPowerChainForTests({
          ...fixture.request,
          ledger: snapshotBytes(
            "power-continuity.jsonl",
            Buffer.from(
              `${rows.map(canonicalHalfkp81Depth18Json).join("\n")}\n`,
              "utf8",
            ),
          ),
        }),
      ).toThrow(/admission battery|semantics differ|continuity differs/u);
    }
  });

  it("cross-binds the non-circular environment-fault preimage and full receipt identity", () => {
    const fixture = frozenPowerFixture("fault");
    expect(
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests(fixture.request),
    ).toMatchObject({ status: "environment-fault-closed", rows: 2 });
    const terminalFault = JSON.parse(
      Buffer.from(fixture.request.terminalFault!.bytes).toString("utf8"),
    ) as Record<string, unknown>;
    expect(() =>
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests({
        ...fixture.request,
        terminalFault: snapshotValue("terminal-fault.json", {
          ...terminalFault,
          fault: { kind: "power-source-not-AC-Power", message: "tampered" },
        }),
      }),
    ).toThrow(/cross-binding differs/u);
  });

  it("independently recomputes rich cleanup evidence and rejects old or caller-authored forms", () => {
    const fixture = frozenPowerFixture("fault");
    const request = fixture.request;
    const validate = (
      evidence: Readonly<Halfkp81Depth18PrivateSnapshot>,
      launchAgentAuthority = request.launchAgentAuthority,
      launchAgentPlist = request.launchAgentPlist,
    ) =>
      validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests({
        evidence,
        plan: request.plan,
        launchAgentAuthority,
        launchAgentPlist,
        sourceRevision: REVISION,
        runFingerprint: FINGERPRINT,
        scope: "post-formal-environment",
      });
    expect(validate(request.processCleanupEvidence)).toEqual({
      scheduling_stopped: true,
      engines_terminated: 0,
      engines_reaped: 0,
      remaining_engine_pids: [],
    });

    const original = JSON.parse(
      Buffer.from(request.processCleanupEvidence.bytes).toString("utf8"),
    ) as Record<string, unknown>;
    const mutation = (
      change: (value: Record<string, unknown>) => void,
      file = "environment-process-cleanup-evidence.json",
    ) => {
      const value = structuredClone(original);
      change(value);
      return snapshotValue(file, value);
    };
    const rejected = [
      mutation((value) => {
        value.schema =
          "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r10";
      }),
      mutation(() => undefined, "preformal-cleanup-evidence.json"),
      mutation((value) => {
        (value.service_absence as Record<string, unknown>).exit_code = 0;
      }),
      mutation((value) => {
        (value.final_ps_second as Record<string, unknown>).started_monotonic_ns =
          "999999999";
      }),
      mutation((value) => {
        (value.process_cleanup as Record<string, unknown>).engines_reaped = 1;
      }),
      mutation((value) => {
        (value.runner_identity as Record<string, unknown>).pid = 411;
      }),
      mutation((value) => {
        (value.runner_identity as Record<string, unknown>).pgid = 411;
      }),
      mutation((value) => {
        (value.runner_identity as Record<string, unknown>).lstart =
          "Sun Aug 2 12:30:00 2026";
      }),
      mutation((value) => {
        (value.pre_cleanup_process_rows as Record<string, unknown>[])[0]!.role =
          "assertion-holder";
      }),
      mutation((value) => {
        (value.ordered_cleanup_commands as Record<string, unknown>[])[0]!.legacy_extra =
          true;
      }),
    ];
    for (const evidence of rejected) {
      expect(() => validate(evidence)).toThrow();
    }

    const launchValue = JSON.parse(
      Buffer.from(request.launchAgentAuthority.bytes).toString("utf8"),
    ) as Record<string, unknown>;
    const changedLaunch = (
      change: (value: Record<string, unknown>) => void,
    ) => {
      const value = structuredClone(launchValue);
      change(value);
      return snapshotValue("launch.json", value);
    };
    for (const launchAgentAuthority of [
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).pid = 999;
      }),
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).ppid = 999;
      }),
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).pgid = 999;
      }),
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).lstart =
          "Sun Aug 2 12:30:00 2026";
      }),
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).executable =
          "/usr/bin/other-node";
      }),
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).argv =
          "/usr/bin/node other-runner.ts";
      }),
      changedLaunch((value) => {
        (value.runner_process as Record<string, unknown>).role =
          "assertion-holder";
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).pid = 999;
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).ppid = 1;
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).pgid = 999;
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).lstart =
          "Sun Aug 2 12:30:00 2026";
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).executable =
          "/usr/bin/other-caffeinate";
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).argv =
          "/usr/bin/caffeinate -d /usr/bin/node runner.ts";
      }),
      changedLaunch((value) => {
        (value.assertion_holder_process as Record<string, unknown>).role =
          "runner";
      }),
    ]) {
      expect(() =>
        validate(request.processCleanupEvidence, launchAgentAuthority),
      ).toThrow(/held LaunchAgent|runner identity|pre-cleanup ps differs/u);
    }

    const alteredPlist = snapshotBytes(
      "launchagent.plist.snapshot",
      Buffer.from(
        Buffer.from(request.launchAgentPlist.bytes)
          .toString("utf8")
          .replace("<string>runner.ts</string>", "<string>other.ts</string>"),
        "utf8",
      ),
    );
    const alteredEvidence = mutation((value) => {
      (value.launchagent as Record<string, unknown>).plist_snapshot = {
        ...alteredPlist.identity,
        schema: "application/x-apple-aspen-config-exact-bytes",
      };
    });
    expect(() =>
      validate(
        alteredEvidence,
        request.launchAgentAuthority,
        alteredPlist,
      ),
    ).toThrow(/process topology differs|not uniquely recomputed/u);

    expect(() =>
      validateHalfkp81Depth18V1R11FrozenPowerChainForTests({
        ...request,
        processCleanupEvidence: undefined,
      }),
    ).toThrow(/cleanup held evidence is missing/u);
  });

  it("recomputes the final LaunchAgent process topology from held ps bytes", () => {
    const runner = {
      pid: 123,
      ppid: 1,
      pgid: 123,
      lstart: "Sun Aug 2 12:00:00 2026",
      executable: "/usr/bin/node",
      argv: "/usr/bin/node tsx",
      role: "runner",
    };
    const holder = {
      pid: 124,
      ppid: 123,
      pgid: 123,
      lstart: "Sun Aug 2 12:00:01 2026",
      executable: "/usr/bin/caffeinate",
      argv: "/usr/bin/caffeinate -dimsu -w 123",
      role: "assertion-holder",
    };
    const basePs =
      "123 1 123 Sun Aug 2 12:00:00 2026 /usr/bin/node tsx\n" +
      "124 123 123 Sun Aug 2 12:00:01 2026 /usr/bin/caffeinate -dimsu -w 123\n";
    const planSnapshot = snapshotValue("launch-process-plan.json", {
      engine: {
        binary: {
          path: "/private/YaneuraOu",
          bytes: 1,
          sha256: SHA,
        },
      },
    });
    const requestFor = (
      psText: string,
      mutate?: (launch: Record<string, unknown>) => void,
      stderrText = "",
    ) => {
      const psStdout = snapshotBytes(
        "launchagent-ps.stdout.txt",
        Buffer.from(psText, "utf8"),
      );
      const psStderr = snapshotBytes(
        "launchagent-ps.stderr.txt",
        Buffer.from(stderrText, "utf8"),
      );
      const launch = structuredClone(
        documents["launchagent-authority"],
      ) as Record<string, unknown>;
      Object.assign(launch, {
        runner_pid: runner.pid,
        runner_utility_argv: ["/usr/bin/node", "tsx"],
        program_arguments: ["/usr/bin/node", "tsx"],
        caffeinate_holder: {
          pid: holder.pid,
          parent_runner_pid: runner.pid,
          assertion_owner_pid: holder.pid,
          executable: holder.executable,
          argv: [
            "/usr/bin/caffeinate",
            "-dimsu",
            "-w",
            String(runner.pid),
          ],
        },
        ps_stdout: {
          ...psStdout.identity,
          schema: "text/plain-exact-launchagent-ps-stdout",
        },
        ps_stderr: {
          ...psStderr.identity,
          schema: "text/plain-exact-launchagent-ps-stderr",
        },
        runner_process: structuredClone(runner),
        assertion_holder_process: structuredClone(holder),
        observed_process_group_rows: [
          structuredClone(runner),
          structuredClone(holder),
        ],
        observed_yaneuraou_engine_rows: [],
      });
      mutate?.(launch);
      return {
        launchAgentAuthority: snapshotValue("launchagent-authority.json", launch),
        launchAgentPsStdout: psStdout,
        launchAgentPsStderr: psStderr,
        plan: planSnapshot,
      };
    };
    const finalTopologyRequest = (launchctlText: string) => {
      const base = requestFor(basePs);
      const launch = JSON.parse(
        Buffer.from(base.launchAgentAuthority.bytes).toString("utf8"),
      ) as Record<string, unknown>;
      const plist = snapshotBytes(
        "launchagent.plist.snapshot",
        Buffer.from(
          [
            '<?xml version="1.0" encoding="UTF-8"?>',
            "<plist><dict>",
            "<key>ProgramArguments</key><array>",
            "<string>/usr/bin/node</string>",
            "<string>tsx</string>",
            "</array>",
            "</dict></plist>",
            "",
          ].join("\n"),
          "utf8",
        ),
      );
      const launchctlPrint = snapshotBytes(
        "launchctl.txt",
        Buffer.from(launchctlText, "utf8"),
      );
      launch.plist_snapshot = {
        ...plist.identity,
        schema: "application/x-apple-aspen-config-exact-bytes",
      };
      launch.launchctl_print = {
        ...launchctlPrint.identity,
        schema: "text/plain-utf8-exact-command-stdout",
      };
      return {
        ...base,
        launchAgentAuthority: snapshotValue(
          "launchagent-authority.json",
          launch,
        ),
        launchAgentPlist: plist,
        launchctlPrint,
      };
    };
    const nodeDirectLaunchctl = [
      "gui/501/com.meetyudai.v1r11 = {",
      "\tprogram = /usr/bin/node",
      "\targuments = {",
      "\t\t/usr/bin/node",
      "\t\ttsx",
      "\t}",
      "\tpid = 123",
      "}",
      "",
    ].join("\n");
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
        requestFor(basePs),
      ),
    ).not.toThrow();
    expect(() =>
      validateHalfkp81Depth18V1R11FinalLaunchAgentTopologyForTests(
        finalTopologyRequest(nodeDirectLaunchctl),
      ),
    ).not.toThrow();
    expect(() =>
      validateHalfkp81Depth18V1R11FinalLaunchAgentTopologyForTests(
        finalTopologyRequest(
          nodeDirectLaunchctl
            .replace("\tprogram = /usr/bin/node", "\tprogram = /usr/bin/caffeinate")
            .replace(
              "\t\t/usr/bin/node\n\t\ttsx",
              "\t\t/usr/bin/caffeinate\n\t\t-dimsu\n\t\t/usr/bin/node\n\t\ttsx",
            ),
        ),
      ),
    ).toThrow(/launchctl node-direct topology differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
        requestFor(basePs, (launch) => {
          launch.program_arguments = [
            "/usr/bin/caffeinate",
            "-dimsu",
            "/usr/bin/node",
            "tsx",
          ];
          (launch.caffeinate_holder as Record<string, unknown>).argv =
            launch.program_arguments;
          (launch.assertion_holder_process as Record<string, unknown>).argv =
            "/usr/bin/caffeinate -dimsu /usr/bin/node tsx";
        }),
      ),
    ).toThrow(/process topology differs|not uniquely recomputed/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
        requestFor(
          `${basePs}125 123 999 Sun Aug 2 12:00:02 2026 /usr/bin/sh child\n`,
        ),
      ),
    ).toThrow(/process group differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
        requestFor(
          `${basePs}900 1 900 Sun Aug 2 12:00:02 2026 /private/YaneuraOu --usi\n`,
        ),
      ),
    ).toThrow(/contains an engine/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
        requestFor(basePs, (launch) => {
          (launch.runner_process as Record<string, unknown>).role =
            "assertion-holder";
        }),
      ),
    ).toThrow(/runner process differs/u);
    expect(() =>
      validateHalfkp81Depth18V1R11LaunchAgentProcessEvidenceForTests(
        requestFor(basePs, undefined, "unexpected stderr"),
      ),
    ).toThrow(/stderr is not empty/u);
  });
});
