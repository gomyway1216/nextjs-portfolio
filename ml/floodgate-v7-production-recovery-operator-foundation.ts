/**
 * Non-operational contract for future Floodgate v7 production recovery work.
 *
 * This module is intentionally import-free and unreachable from package
 * scripts. It issues no capability, authorizes no source, starts no process,
 * and accesses no production state. A later, separately reviewed external
 * trust root must authenticate an enrolled commit and tree before any
 * production recovery entrypoint can exist.
 */

export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_FOUNDATION_CONTRACT =
  "shogi-floodgate-v7-production-recovery-operator-non-operational-foundation-v1" as const;

export const FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_EXTERNAL_ATTESTATION_CONTRACT =
  "shogi-floodgate-v7-production-recovery-operator-external-approved-commit-tree-attestation-v1" as const;

export interface FloodgateV7ProductionRecoveryOperatorUnavailableStop {
  readonly contract: typeof FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_FOUNDATION_CONTRACT;
  readonly status: "UNAVAILABLE";
  readonly decision: "STOP";
  readonly future_purpose: "inspect-stale-prefix-100";
  readonly required_external_attestation_contract: typeof FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_EXTERNAL_ATTESTATION_CONTRACT;
  readonly operational_entrypoint_available: false;
  readonly production_issuer_available: false;
  readonly repository_self_authorization_available: false;
  readonly external_trust_root_installed: false;
  readonly approved_revision_enrolled: false;
  readonly approved_tree_enrolled: false;
  readonly source_authorized: false;
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

const UNAVAILABLE_STOP = Object.freeze({
  contract: FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_FOUNDATION_CONTRACT,
  status: "UNAVAILABLE" as const,
  decision: "STOP" as const,
  future_purpose: "inspect-stale-prefix-100" as const,
  required_external_attestation_contract:
    FLOODGATE_V7_PRODUCTION_RECOVERY_OPERATOR_REQUIRED_EXTERNAL_ATTESTATION_CONTRACT,
  operational_entrypoint_available: false as const,
  production_issuer_available: false as const,
  repository_self_authorization_available: false as const,
  external_trust_root_installed: false as const,
  approved_revision_enrolled: false as const,
  approved_tree_enrolled: false as const,
  source_authorized: false as const,
  production_state_inspected: false as const,
  registry_accessed: false as const,
  lease_accessed: false as const,
  stage_accessed: false as const,
  work_accessed: false as const,
  deployment_key_accessed: false as const,
  persistent_mutation_performed: false as const,
  live_weight_changed: false as const,
  sensitive_values_disclosed: false as const,
}) satisfies FloodgateV7ProductionRecoveryOperatorUnavailableStop;

/** Return the one immutable, non-authorizing STOP marker. */
export function readFloodgateV7ProductionRecoveryOperatorUnavailableStop(): Readonly<FloodgateV7ProductionRecoveryOperatorUnavailableStop> {
  return UNAVAILABLE_STOP;
}
