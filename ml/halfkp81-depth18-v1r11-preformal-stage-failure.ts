import type { V1R11AuthorityFileIdentity } from "./halfkp81-depth18-v1r11-authority-io";

function object(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} differs`);
  }
  return value as Readonly<Record<string, unknown>>;
}

export function halfkp81V1R11ActiveLaunchBindingFromEvidenceForFailure(
  value: unknown,
): Readonly<{
  activeLaunchAgent: NonNullable<Halfkp81V1R11PreformalFailureArtifacts["activeLaunchAgent"]>;
  runnerIdentity: NonNullable<Halfkp81V1R11PreformalFailureArtifacts["runnerIdentity"]>;
}> {
  const evidence = object(value, "active LaunchAgent failure evidence");
  const plist = object(
    evidence.plist_snapshot,
    "active LaunchAgent failure plist snapshot",
  );
  const runner = object(
    evidence.runner_process,
    "active LaunchAgent failure runner process",
  );
  if (
    typeof evidence.label !== "string" ||
    evidence.label.length < 3 ||
    typeof plist.path !== "string" ||
    !Number.isSafeInteger(plist.bytes) ||
    Number(plist.bytes) < 1 ||
    typeof plist.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(plist.sha256) ||
    typeof plist.schema !== "string" ||
    plist.schema.length < 1 ||
    !Number.isSafeInteger(runner.pid) ||
    Number(runner.pid) < 1 ||
    !Number.isSafeInteger(runner.pgid) ||
    Number(runner.pgid) < 1 ||
    typeof runner.lstart !== "string" ||
    runner.lstart.length < 1
  ) {
    throw new Error("active LaunchAgent failure binding differs");
  }
  return Object.freeze({
    activeLaunchAgent: Object.freeze({
      label: evidence.label,
      plistSnapshot: Object.freeze({
        path: plist.path,
        bytes: Number(plist.bytes),
        sha256: plist.sha256,
        schema: plist.schema,
      }),
    }),
    runnerIdentity: Object.freeze({
      pid: Number(runner.pid),
      pgid: Number(runner.pgid),
      lstart: runner.lstart,
    }),
  });
}

export type Halfkp81V1R11PreformalFailurePhase =
  | "stage-a-producer"
  | "stage-a-verifier"
  | "planned-handoff"
  | "stage-b-power"
  | "final-ac-gate"
  | "finalizer"
  | "independent-verifier";

export interface Halfkp81V1R11PreformalFailureArtifacts {
  readonly ledgerPrefix: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly lastGateReceipt: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly engineGateVerifiedReceipt: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly launchAgentAuthority: Readonly<V1R11AuthorityFileIdentity> | null;
  readonly activeLaunchAgent: Readonly<{
    label: string;
    plistSnapshot: Readonly<V1R11AuthorityFileIdentity>;
  }> | null;
  readonly runnerIdentity: Readonly<{
    pid: number;
    pgid: number;
    lstart: string;
  }> | null;
  /**
   * Create-only artifacts published by the failing stage but not necessarily
   * committed to the authority ledger. The outer orchestrator must hold-read
   * every identity before binding it into a terminal fault.
   */
  readonly partialArtifacts: readonly Readonly<V1R11AuthorityFileIdentity>[];
}

/**
 * In-process stages may report what they observed and which immutable files
 * they created, but they never claim OS cleanup or close the terminal-fault
 * namespace. Only the fixed outer orchestrator can reap the complete job and
 * publish independently verified process-cleanup evidence.
 */
export class Halfkp81V1R11PreformalStageFailure extends Error {
  readonly phase: Halfkp81V1R11PreformalFailurePhase;
  readonly gate: string | null;
  readonly sequence: number | null;
  readonly runner_state: "not-created" | "active";
  readonly error: Readonly<{
    kind: string;
    message: string;
    exit_code: number | null;
    signal: string | null;
  }>;
  readonly artifacts: Readonly<Halfkp81V1R11PreformalFailureArtifacts>;

  constructor(
    input: Readonly<{
      phase: Halfkp81V1R11PreformalFailurePhase;
      gate: string | null;
      sequence: number | null;
      runnerState: "not-created" | "active";
      failure: Error;
      artifacts: Readonly<
        Omit<Halfkp81V1R11PreformalFailureArtifacts, "activeLaunchAgent"> & {
          activeLaunchAgent?: Halfkp81V1R11PreformalFailureArtifacts["activeLaunchAgent"];
        }
      >;
      exitCode?: number | null;
      signal?: string | null;
    }>,
  ) {
    super(input.failure.message, { cause: input.failure });
    this.name = "Halfkp81V1R11PreformalStageFailure";
    this.phase = input.phase;
    this.gate = input.gate;
    this.sequence = input.sequence;
    this.runner_state = input.runnerState;
    this.error = Object.freeze({
      kind: input.failure.name || "Error",
      message: input.failure.message || "unknown preformal stage failure",
      exit_code: input.exitCode ?? null,
      signal: input.signal ?? null,
    });
    this.artifacts = Object.freeze({
      ledgerPrefix: input.artifacts.ledgerPrefix,
      lastGateReceipt: input.artifacts.lastGateReceipt,
      engineGateVerifiedReceipt: input.artifacts.engineGateVerifiedReceipt,
      launchAgentAuthority: input.artifacts.launchAgentAuthority,
      activeLaunchAgent: input.artifacts.activeLaunchAgent ?? null,
      runnerIdentity: input.artifacts.runnerIdentity,
      partialArtifacts: Object.freeze([...input.artifacts.partialArtifacts]),
    });
  }
}
