/**
 * Neutral key-derivation contract shared by the deployment-key authority and
 * the v3 checkpoint implementation. This module owns no key material and
 * performs no filesystem, dataset, runtime, or checkpoint operation.
 */

export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100 =
  "durable-prefix-100" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500 =
  "durable-prefix-500" as const;
export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000 =
  "sealed-final-24000" as const;

export type FloodgateV7TeacherCheckpointV3Gate =
  | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_100
  | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_DURABLE_PREFIX_500
  | typeof FLOODGATE_V7_TEACHER_CHECKPOINT_V3_GATE_SEALED_FINAL_24000;

export const FLOODGATE_V7_TEACHER_CHECKPOINT_V3_HKDF_INFO =
  "shogi-floodgate-v7-teacher-checkpoint-key-v3\0" as const;
