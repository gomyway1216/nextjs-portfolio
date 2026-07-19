export const EXACT24K_SCANNER_RECEIPT_SCHEMA =
  "floodgate-exact24k-scanner-runtime-receipt-v1";

const CASE_IDS_BY_SHARD = {
  authority: [
    "lease-capture-failure-preserves-active-lease",
    "premature-terminal-reverify-aborts-zeroizes-releases",
    "key-authority-rejection-after-unkeyed-preflight",
  ],
  mutation: [
    "pass-two-sink-failure-aborts-zeroizes",
    "named-path-replacement-rejected-after-held-scan",
    "seal-mac-mutation-rejected-after-parent-stream",
  ],
  replay: [
    "exact-two-pass-receipt-and-facade",
    "production-replay-entrypoint-rejects-test-facade",
    "cloned-facade-rejected",
    "decorated-promise-rejected",
    "replay-single-flight-and-terminal-exclusion",
    "w-wt-wtr-wtrm-exact-replay",
  ],
  cleanup: [
    "terminal-close-failure-zeroizes-and-retries",
    "post-close-cleanup-failure-is-sticky",
    "plan-discard-aggregate-cleanup-failure-is-sticky",
  ],
  production: [
    "production-plan-invalid-input-rejected",
    "exact24k-plan-finalizer-publication-success",
    "result-manifest-forced-accounting",
    "owned-keys-zeroized-and-stage-moved",
  ],
};

export const EXACT24K_SCANNER_CASE_IDS = Object.freeze(
  Object.fromEntries(
    Object.entries(CASE_IDS_BY_SHARD).map(([shardId, caseIds]) => [
      shardId,
      Object.freeze([...caseIds]),
    ]),
  ),
);

function fail(message) {
  throw new Error(`exact-24k scanner runtime receipt failed: ${message}`);
}

export function exact24kScannerCaseIds(shardId) {
  if (
    typeof shardId !== "string" ||
    !Object.hasOwn(EXACT24K_SCANNER_CASE_IDS, shardId)
  ) {
    fail(`unknown shard ${String(shardId)}`);
  }
  const caseIds = EXACT24K_SCANNER_CASE_IDS[shardId];
  return caseIds;
}

export function createExact24kScannerRuntimeReceiptRecorder(shardId) {
  const expected = exact24kScannerCaseIds(shardId);
  const completed = [];
  let sealed = false;

  return Object.freeze({
    pass(caseId) {
      if (sealed) fail(`${shardId} receipt is already sealed`);
      const next = expected[completed.length];
      if (caseId !== next) {
        fail(
          `${shardId} expected case ${String(next)} at index ${completed.length}, received ${String(caseId)}`,
        );
      }
      completed.push(caseId);
    },
    seal() {
      if (sealed) fail(`${shardId} receipt is already sealed`);
      if (completed.length !== expected.length) {
        fail(
          `${shardId} completed ${completed.length} of ${expected.length} immutable cases`,
        );
      }
      sealed = true;
      return Object.freeze({
        schema: EXACT24K_SCANNER_RECEIPT_SCHEMA,
        shard_id: shardId,
        exact_parent_count: 24_000,
        case_ids: Object.freeze([...completed]),
      });
    },
  });
}
