# Local teacher checkpoint: fixing runtime-claim ordering and lease cleanup

On July 19, 2026, the existing local runner was re-audited before attempting a real teacher run through the portable-copy path. The audit found that the authenticated training-row runtime claim exists only during the consumer callback's **synchronous invocation**, while the old code awaited asynchronous checkpoint-key preparation inside that callback before calling the checkpoint.

Even after the copy blocker was removed, the first `await` would therefore revoke the claim and the checkpoint could not accept the authenticated rows. A second issue existed on failures before the stage claim: neither the caller nor the checkpoint was guaranteed to close the lease. These are execution-order and safe-retry defects, not playing-strength defects.

The machine-readable record is fixed in [`data/floodgate-v7-local-checkpoint-runtime-claim-order-2026-07-19.json`](./data/floodgate-v7-local-checkpoint-runtime-claim-order-2026-07-19.json).

## 1. Corrected order

The fixed order is:

1. Acquire the private stage lease.
2. Prepare checkpoint-key authorization before entering the consumer.
3. Enter the verified training-row consumer.
4. Invoke the checkpoint directly during the callback's synchronous interval.
5. Await the returned Promise only after the checkpoint has synchronously claimed the stage, training rows, and key.
6. Idempotently discard any unused key authorization on every outcome.
7. Join the same stage-lease close Promise on every outcome.

The syntax `await checkpoint(...)` alone is not treated as proof. The implementation evaluates the checkpoint call first, captures its Promise, and only then awaits it. An integration regression consumes the real production runtime claim exactly once in the synchronous callback and rejects the test-only and second claims.

## 2. Lease and key cleanup

The stage lease's `close()` contract is idempotent and returns the same Promise. If the checkpoint already started closing, the caller joins that Promise. If failure occurs before the stage claim and the checkpoint did not close it, the caller starts the close. A synthetic regression fixes the exact behavior: two `close()` calls perform physical cleanup once.

Consumer verification failure, synchronous checkpoint throw, asynchronous checkpoint rejection, key-discard failure, and lease-close failure are covered separately. When operation, discard, and close all fail, nested `AggregateError` objects preserve all three failures instead of overwriting the primary cause.

## 3. Validation

The implementation commit is `e86cbb5f0673f87121a9d789da6e990fc97a4170`. The changed local-runner and training-row-consumer suites pass 68 / 68 tests. An independent rerun including the teacher checkpoint passes 117 / 117 tests, and the implementation-time Node v22.13.0 run including the evidence suite passes 121 / 121 tests. The pre-PR implementation-correctness review found P0 / P1 / P2 / P3 counts of zero.

In the first pull-request CI run (`29685458867`), Core was the sole substantive root failure and the aggregate `Test and build` job consequently failed too. Both Core failures were stale byte and hash pins in historical machine records for the runner and test changed here; implementation-test failures were zero. PR-readiness review classified that CI block as P1 and found two P2 evidence-reproducibility and review-record issues. The historical execution facts were left intact while only the current-source pins and this follow-up revision were added. System/global Git configuration and optional locking are now explicitly disabled, and the review history records detection, remediation, and rereview. The post-fix Node v22.13.0 focused run passes 82 / 82, and final rereview has zero P0 / P1 / P2 / P3 findings. The response is to repair evidence reproducibility and rerun CI, not to force a real teacher run through the gate.

This proves ordering and cleanup only. Real teacher processes, checkpoint work, label finalization, optimizer training, A/B, external calibration, and live-weight changes all remain zero.

## 4. AWS, GCP, and Vercel

The fix and validation are local-only. AWS is neither required nor used; AWS API calls, credentials, compute, storage, and network requests are all zero. Firebase Cloud Functions is the existing GCP application backend, and Vercel serves the web application, but neither participates in this checkpoint fix.

The CI job named `AWS witness adapter contract (source only)` is a static check of an unused connector contract. It does not mean that teacher generation or training runs on AWS.

## 5. Next

This fix does not start a teacher by itself. The portable-copy witness foundation must pass review, CI, and a regular merge, followed by the semantic bridge that binds source verification authority to the copied destination's exact bytes. Only then will the residual clean room be audited and a fresh local 100 → 500 → 24,000 run begin. Live weights remain unchanged until the complete evidence chain passes.
