import type {
  FloodgateRawReceipt,
  FloodgateRawReceiptKind,
} from "./floodgate-raw-lock";
import type {
  FloodgateBodyIdentity,
  FloodgatePeriodEndInventoryCounts,
} from "./floodgate-source";

export const FLOODGATE_RAW_VERIFICATION_WORKER_COUNT = 4 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_COUNT_MAX = 12 as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA =
  "shogi-floodgate-raw-verification-worker-task-v1" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA =
  "shogi-floodgate-raw-verification-worker-result-v1" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA =
  "shogi-floodgate-raw-verification-worker-control-v1" as const;
export const FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA =
  "shogi-floodgate-raw-verification-worker-data-v1" as const;

export interface FloodgateRawVerificationTaskInput {
  readonly receipt_kind: FloodgateRawReceiptKind;
  readonly url: string;
}

export interface FloodgateRawVerificationWorkerTask
  extends FloodgateRawVerificationTaskInput {
  readonly schema: typeof FLOODGATE_RAW_VERIFICATION_WORKER_TASK_SCHEMA;
  readonly ordinal: number;
}

export interface FloodgateRawVerificationWorkerData {
  readonly schema: typeof FLOODGATE_RAW_VERIFICATION_WORKER_DATA_SCHEMA;
  readonly lock_root: string;
  readonly runtime: Readonly<{
    readonly node_version: string;
    readonly v8_version: string;
    readonly modules_abi: string;
    readonly executable_path: string;
    readonly platform: NodeJS.Platform;
    readonly architecture: string;
  }>;
}

export interface FloodgateRawVerificationListingResult {
  readonly receipt_kind: "daily_listing";
  readonly receipt: Readonly<FloodgateRawReceipt>;
  readonly evidence: Readonly<{
    readonly url: string;
    readonly body: FloodgateBodyIdentity;
    readonly all_official_csa_urls: readonly string[];
    readonly target_csa_urls: readonly string[];
  }>;
}

export interface FloodgateRawVerificationRatingResult {
  readonly receipt_kind: "daily_rating";
  readonly receipt: Readonly<FloodgateRawReceipt>;
}

export interface FloodgateRawVerificationPeriodResult {
  readonly receipt_kind: "period_end_inventory";
  readonly receipt: Readonly<FloodgateRawReceipt>;
  readonly evidence: Readonly<{
    readonly url: string;
    readonly body: FloodgateBodyIdentity;
    readonly last_modified_at: string;
    readonly counts: FloodgatePeriodEndInventoryCounts;
  }>;
}

export interface FloodgateRawVerificationCsaResult {
  readonly receipt_kind: "csa";
  readonly receipt: Readonly<FloodgateRawReceipt>;
}

export type FloodgateRawVerificationTaskResult =
  | FloodgateRawVerificationListingResult
  | FloodgateRawVerificationRatingResult
  | FloodgateRawVerificationPeriodResult
  | FloodgateRawVerificationCsaResult;

export interface FloodgateRawVerificationWorkerSuccess {
  readonly schema: typeof FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA;
  readonly ordinal: number;
  readonly status: "success";
  readonly result: FloodgateRawVerificationTaskResult;
}

export interface FloodgateRawVerificationWorkerFailure {
  readonly schema: typeof FLOODGATE_RAW_VERIFICATION_WORKER_RESULT_SCHEMA;
  readonly ordinal: number;
  readonly status: "failure";
  readonly error: Readonly<{
    readonly name: string;
    readonly message: string;
  }>;
}

export type FloodgateRawVerificationWorkerResult =
  | FloodgateRawVerificationWorkerSuccess
  | FloodgateRawVerificationWorkerFailure;

export interface FloodgateRawVerificationWorkerShutdown {
  readonly schema: typeof FLOODGATE_RAW_VERIFICATION_WORKER_CONTROL_SCHEMA;
  readonly operation: "shutdown";
}
