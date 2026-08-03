import * as path from "node:path";

import {
  assertV1R11AuthorityDirectory,
  publishV1R11CreateOnlyCanonical,
  readV1R11HeldIdentity,
  v1r11CanonicalJson,
  type V1R11AuthorityDirectoryIdentity,
  type V1R11AuthorityFileIdentity,
} from "./halfkp81-depth18-v1r11-authority-io";
import { buildHalfkp81V1R11RecursiveProducerIdentity } from "./halfkp81-depth18-v1r11-producer-closure";
import type { Halfkp81V1R11PreformalFailurePhase } from "./halfkp81-depth18-v1r11-preformal-stage-failure";
import {
  validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests,
  type Halfkp81V1R11ProcessCleanupValidationContext,
} from "./produce-halfkp81-depth18-v1r11-process-cleanup-evidence";

export const HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-preformal-terminal-fault-v1r11" as const;
export const HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA =
  "shogi-halfkp81-depth18-yaneura-only-process-cleanup-evidence-v1r11" as const;

export interface V1R11ImplementationIdentity {
  readonly source_revision: string;
  readonly entrypoint: string;
  readonly dependency_closure: readonly Readonly<{
    path: string;
    bytes: number;
    sha256: string;
  }>[];
}

export interface V1R11PreformalFaultRequest {
  readonly phase: Halfkp81V1R11PreformalFailurePhase;
  readonly gate: string | null;
  readonly sequence: number | null;
  readonly teacherPlan: Readonly<V1R11AuthorityFileIdentity>;
  readonly sourceRevision: string;
  readonly runFingerprint: string;
  readonly authorityDirectory: Readonly<V1R11AuthorityDirectoryIdentity>;
  readonly ledgerPrefix: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly lastGateReceipt: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly engineGateVerifiedReceipt: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly processCleanupEvidence: Readonly<V1R11AuthorityFileIdentity>;
  readonly processCleanupValidationContext: Readonly<Halfkp81V1R11ProcessCleanupValidationContext>;
  readonly error: Readonly<{
    kind: string;
    message: string;
    exit_code: number | null;
    signal: string | null;
  }>;
  readonly processCleanup: Readonly<{
    scheduling_stopped: boolean;
    engines_terminated: number;
    engines_reaped: number;
    remaining_engine_pids: readonly number[];
  }>;
  readonly faultedAtUtc: string;
  readonly repositoryRoot: string;
}

const FALSE_AUTHORITY = Object.freeze({
  may_execute_preformal_engine_gates: false,
  may_execute_formal_teacher: false,
  may_train: false,
  may_play_formal_games: false,
  may_write_live_weights: false,
} as const);

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
const PHASES = Object.freeze([
  "stage-a-producer",
  "stage-a-verifier",
  "planned-handoff",
  "stage-b-power",
  "final-ac-gate",
  "finalizer",
  "independent-verifier",
] as const);

function producerIdentity(
  repositoryRoot: string,
  sourceRevision: string,
  requireTrackedRevision: boolean,
): Readonly<V1R11ImplementationIdentity> {
  return buildHalfkp81V1R11RecursiveProducerIdentity(
    repositoryRoot,
    sourceRevision,
    "ml/run-halfkp81-depth18-v1r11-preformal-orchestrator.ts",
    { requireTrackedRevision },
  );
}

async function publishHalfkp81V1R11PreformalTerminalFaultCore(
  request: Readonly<V1R11PreformalFaultRequest>,
  requireTrackedRevision: boolean,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  await assertV1R11AuthorityDirectory(request.authorityDirectory);
  const expectedGate =
    request.sequence === null ? null : (GATES[request.sequence - 1] ?? null);
  if (
    !PHASES.includes(request.phase) ||
    !/^[0-9a-f]{40}$/u.test(request.sourceRevision) ||
    !/^[0-9a-f]{64}$/u.test(request.runFingerprint) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      request.faultedAtUtc,
    ) ||
    new Date(request.faultedAtUtc).toISOString() !== request.faultedAtUtc ||
    (request.sequence === null) !== (request.gate === null) ||
    (request.gate !== null && request.gate !== expectedGate) ||
    request.processCleanup.scheduling_stopped !== true ||
    !Number.isSafeInteger(request.processCleanup.engines_terminated) ||
    request.processCleanup.engines_terminated < 0 ||
    !Number.isSafeInteger(request.processCleanup.engines_reaped) ||
    request.processCleanup.engines_reaped < 0 ||
    request.processCleanup.engines_terminated !==
      request.processCleanup.engines_reaped ||
    request.processCleanup.remaining_engine_pids.length !== 0 ||
    request.processCleanup.remaining_engine_pids.some(
      (pid) => !Number.isSafeInteger(pid) || pid < 1,
    ) ||
    typeof request.error.kind !== "string" ||
    request.error.kind.length < 1 ||
    typeof request.error.message !== "string" ||
    request.error.message.length < 1 ||
    (request.error.exit_code !== null &&
      !Number.isSafeInteger(request.error.exit_code)) ||
    (request.error.signal !== null && typeof request.error.signal !== "string")
  ) {
    throw new Error("v1r11 preformal terminal-fault request differs");
  }
  await readV1R11HeldIdentity(
    request.teacherPlan,
    request.teacherPlan.schema,
    "v1r11 preformal fault teacher plan",
  );
  const producer = producerIdentity(
    request.repositoryRoot,
    request.sourceRevision,
    requireTrackedRevision,
  );
  const available = [
    {
      identity: request.ledgerPrefix,
      expectedPath: path.join(
        request.authorityDirectory.path,
        "preformal-authority-ledger.jsonl",
      ),
      expectedSchema:
        "shogi-halfkp81-depth18-yaneura-only-preformal-authority-ledger-v1r11",
    },
    {
      identity: request.lastGateReceipt,
      expectedPath: request.lastGateReceipt?.path ?? "",
      expectedSchema:
        "shogi-halfkp81-depth18-yaneura-only-preformal-gate-receipt-v1r11",
    },
    {
      identity: request.engineGateVerifiedReceipt,
      expectedPath: path.join(
        request.authorityDirectory.path,
        "preformal-engine-gate-authority-verified-receipt.json",
      ),
      expectedSchema:
        "shogi-halfkp81-depth18-yaneura-only-preformal-engine-gate-authority-verified-receipt-v1r11",
    },
    {
      identity: request.launchAgentAuthority,
      expectedPath: path.join(
        request.authorityDirectory.path,
        "launchagent-authority-evidence.json",
      ),
      expectedSchema:
        "shogi-halfkp81-depth18-yaneura-only-launchagent-authority-evidence-v1r11",
    },
    {
      identity: request.processCleanupEvidence,
      expectedPath: path.join(
        request.authorityDirectory.path,
        "preformal-process-cleanup-evidence.json",
      ),
      expectedSchema: HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
    },
  ];
  for (const [index, item] of available.entries()) {
    if (item.identity === null) continue;
    const isLastReceipt = index === 1;
    if (
      item.identity.schema !== item.expectedSchema ||
      (isLastReceipt
        ? path.dirname(item.identity.path) !==
            path.join(request.authorityDirectory.path, "preformal-gates") ||
          !/^(?:0[1-9]|1[0-3])-[a-z0-9-]+\.receipt\.json$/u.test(
            path.basename(item.identity.path),
          )
        : item.identity.path !== item.expectedPath)
    ) {
      throw new Error(`v1r11 preformal fault prefix ${index + 1} differs`);
    }
    await readV1R11HeldIdentity(
      item.identity,
      item.expectedSchema,
      `v1r11 preformal fault prefix ${index + 1}`,
    );
  }
  const cleanupRaw = await readV1R11HeldIdentity(
    request.processCleanupEvidence,
    HALFKP81_V1R11_PROCESS_CLEANUP_EVIDENCE_SCHEMA,
    "v1r11 preformal process cleanup evidence",
  );
  const cleanupValue = JSON.parse(cleanupRaw.toString("utf8")) as unknown;
  const recomputedProcessCleanup =
    validateHalfkp81Depth18V1R11ProcessCleanupEvidenceForTests(
      cleanupValue,
      request.processCleanupValidationContext,
    );
  if (
    v1r11CanonicalJson(recomputedProcessCleanup) !==
    v1r11CanonicalJson(request.processCleanup)
  ) {
    throw new Error("v1r11 preformal process cleanup summary differs");
  }
  const value = Object.freeze({
    schema: HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA,
    status: "preformal-terminal-fault-family-closed-no-authority",
    phase: request.phase,
    gate: request.gate,
    sequence: request.sequence,
    teacher_plan: request.teacherPlan,
    source_revision: request.sourceRevision,
    run_fingerprint: request.runFingerprint,
    authority_directory: request.authorityDirectory,
    ledger_prefix: request.ledgerPrefix,
    last_gate_receipt: request.lastGateReceipt,
    engine_gate_verified_receipt: request.engineGateVerifiedReceipt,
    launchagent_authority: request.launchAgentAuthority,
    process_cleanup_evidence: request.processCleanupEvidence,
    error: request.error,
    process_cleanup: request.processCleanup,
    faulted_at_utc: request.faultedAtUtc,
    producer,
    authority: FALSE_AUTHORITY,
  });
  return publishV1R11CreateOnlyCanonical(
    request.authorityDirectory,
    path.join(request.authorityDirectory.path, "preformal-terminal-fault.json"),
    value,
    HALFKP81_V1R11_PREFORMAL_TERMINAL_FAULT_SCHEMA,
  );
}

export async function publishHalfkp81V1R11PreformalTerminalFault(
  request: Readonly<V1R11PreformalFaultRequest>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return publishHalfkp81V1R11PreformalTerminalFaultCore(request, true);
}

/** Test-only source seam. Production requires a clean tracked recursive closure. */
export async function publishHalfkp81V1R11PreformalTerminalFaultForTests(
  request: Readonly<V1R11PreformalFaultRequest>,
): Promise<Readonly<V1R11AuthorityFileIdentity>> {
  return publishHalfkp81V1R11PreformalTerminalFaultCore(request, false);
}
