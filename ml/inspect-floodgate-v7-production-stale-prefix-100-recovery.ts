/**
 * Safe placeholder for the isolated production recovery operator.
 *
 * The source and native launch origins are authorized, but inspection is
 * deliberately not implemented in this change. This file does not import or
 * access the production registry, lease, stage, work, or deployment key.
 */

import {
  authorizeFloodgateV7ProductionRecoveryOperatorExecution,
  claimFloodgateV7ProductionRecoveryOperatorExecution,
} from "./floodgate-v7-production-recovery-operator-source-authorization";

export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_STOP_CONTRACT =
  "shogi-floodgate-v7-production-recovery-operator-cli-stop-v1" as const;

const PURPOSE = "inspect-stale-prefix-100" as const;
const jsonStringify = JSON.stringify.bind(JSON);

export interface FloodgateV7ProductionRecoveryOperatorStop {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_STOP_CONTRACT;
  readonly status: "NOT-YET-IMPLEMENTED";
  readonly decision: "STOP";
  readonly purpose: typeof PURPOSE;
  readonly source_authorized: boolean;
  readonly production_state_inspected: false;
  readonly registry_accessed: false;
  readonly lease_accessed: false;
  readonly stage_accessed: false;
  readonly work_accessed: false;
  readonly deployment_key_accessed: false;
  readonly persistent_mutation_performed: false;
  readonly live_weight_changed: false;
  readonly sensitive_values_disclosed: false;
}

export function buildFloodgateV7ProductionRecoveryOperatorStopCoreForTests(
  sourceAuthorized: boolean,
): FloodgateV7ProductionRecoveryOperatorStop {
  if (arguments.length !== 1 || typeof sourceAuthorized !== "boolean") {
    throw new Error("recovery stop capture differs");
  }
  return Object.freeze({
    contract: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_STOP_CONTRACT,
    status: "NOT-YET-IMPLEMENTED" as const,
    decision: "STOP" as const,
    purpose: PURPOSE,
    source_authorized: sourceAuthorized,
    production_state_inspected: false as const,
    registry_accessed: false as const,
    lease_accessed: false as const,
    stage_accessed: false as const,
    work_accessed: false as const,
    deployment_key_accessed: false as const,
    persistent_mutation_performed: false as const,
    live_weight_changed: false as const,
    sensitive_values_disclosed: false as const,
  });
}

async function runCli(): Promise<void> {
  let sourceAuthorized = false;
  try {
    if (process.argv.length !== 2 || process.version !== "v22.13.0") {
      throw new Error("entrypoint differs");
    }
    const capability =
      await authorizeFloodgateV7ProductionRecoveryOperatorExecution(PURPOSE);
    claimFloodgateV7ProductionRecoveryOperatorExecution(
      capability,
      PURPOSE,
      "stop-entry",
    );
    sourceAuthorized = true;
  } catch {
    sourceAuthorized = false;
  }
  process.exitCode = 78;
  try {
    process.stderr.write(
      `${jsonStringify(
        buildFloodgateV7ProductionRecoveryOperatorStopCoreForTests(
          sourceAuthorized,
        ),
      )}\n`,
    );
  } catch {
    // The nonzero exit remains authoritative if stderr is unavailable.
  }
}

if (require.main === module) {
  void runCli();
}
