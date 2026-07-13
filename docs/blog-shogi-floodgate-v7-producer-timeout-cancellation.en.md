# Bounding v7 producer timeouts, cancellation, and USI process reaping

> The [v7 incremental checkpoint scanner](./blog-shogi-floodgate-v7-incremental-checkpoint-scan.en.md) can reverify a 24,000-parent work stream without scanner buffers proportional to file size. A raw producer Promise that never settles can still make both `Promise.allSettled` and the checkpoint wait forever. This change moves the checkpoint to v2, authenticates the per-parent deadline, first-terminal cancellation, and bounded abort drain, and makes [the production teacher USI runtime](./blog-shogi-floodgate-production-teacher-usi-runtime.en.md) own process-group reaping and private-snapshot cleanup. A synthetic v2 24,000-parent scan-load is complete, but it is not evidence for an official receipt, a production coordinator, real labels, training, a weight, matches, or playing strength. Japanese version: [blog-shogi-floodgate-v7-producer-timeout-cancellation.md](./blog-shogi-floodgate-v7-producer-timeout-cancellation.md)

---

## Current boundary

| Item                                     | State                      | What this establishes                                                              |
| ---------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| Checkpoint / run binding                 | Updated to v2              | Binds producer control into the header, HMAC chain, and resume identity            |
| Parent deadline / abort drain            | Code and tests complete    | Bounds the wait for raw producers and controller cleanup with authenticated times  |
| USI runtime lifecycle                    | Code and tests complete    | Completes owner abort only after process-group disappearance and snapshot cleanup  |
| Synthetic v2 24,000-parent scan-load     | Complete                   | Resumed and final-scanned 24,000 / 24,000 v2 parents with zero producer calls      |
| Attempt 6 official receipt / coordinator | Not adopted; wiring absent | A runtime receipt exists, but Attempt 6 has no official digest authority or wiring |
| Real labels / training / strength        | Not run; no evidence       | Claims no weight, A/B, Elo, rating, rank, stable high-dan strength, or live change |

## 1. Discovery: `Promise.allSettled` is not a deadline

`Promise.allSettled(started)` is an aggregator that waits until every supplied Promise settles; it does not create a time bound. A timeout supervisor can reject while the underlying raw producer Promise remains pending, in which case a drain that includes that raw Promise never finishes. `Promise.race` can end the caller's wait, but it does not stop or reap an engine process.

The design therefore separates two objects.

- **Supervisor result:** returns a usable result or timeout to the checkpoint state machine by the authenticated `parent_deadline_ms`.
- **Raw producer Promise:** is observed separately from the moment it starts so cleanup knows when the actual producer settles. A supervisor timeout does not make the raw Promise disappear.

Implementation and adversarial tests fixed the related traps into explicit rules.

| Discovery                                                         | Required rule                                                                                                             |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Promise.allSettled` has no deadline                              | Count the controller and every raw producer separately, stop only the wait at `abort_drain_ms`, and retain late observers |
| Node timers have a representation ceiling and clamp risk          | Restrict timer values to integer `1..2,147,483,647 ms` and authenticate them with HMAC                                    |
| Input-order waiting differs from failure-observation order        | Latch the first globally observed terminal once, not the lowest input index                                               |
| A raw Promise can settle after timeout                            | Consume late settlement only; begin no validation or append                                                               |
| An append started before terminal cannot be rolled back in memory | Allow that it may finish, classify persistence as indeterminate, and rescan the durable prefix on resume                  |
| Reaping only a child PID can leave descendants                    | Reap a dedicated process group with TERM / KILL escalation                                                                |
| Removing engines alone can leave copied assets                    | Revalidate snapshot identity and include private-snapshot removal in cleanup completion                                   |
| Test failure can happen before ordinary `afterEach` coverage      | Close started-Promise observation, group reaping, and temp-root removal in `try/finally`                                  |
| A native Promise with own properties can reject later             | Reject it as a contract violation but best-effort observe only its rejection through a captured intrinsic                 |

## 2. Keep runtime and checkpoint as separate state machines

The checkpoint owns which parents are scheduled, when they are scheduled, and which results may be persisted. The USI runtime owns stopping search, eliminating every engine process group, and removing its private snapshot. Folding both responsibilities into one timeout Promise could end a wait while leaving the resource behind.

```text
authenticated durable prefix
  -> schedule up to 12 parents
  -> observe supervisor result and raw settlement separately
  -> first terminal
       -> latch once / stop scheduling
       -> abort every raw-pending signal once
       -> call producerController.abortAndDrain() once
       -> wait only through authenticated abort_drain_ms

producerController
  -> owning adapter
  -> teacher USI runtime.abortAndReap()
  -> process groups gone + snapshot revalidated/removed
```

The connection has a type boundary, but the final owning production adapter does not yet exist. The current checkpoint controller is a test-only trusted boundary; the diagram does not claim that production wiring exists.

## 3. The USI runtime lifecycle state machine

Only the first runtime lifecycle transition owns cleanup. Later callers do not begin another cleanup; they join the same raw cleanup Promise.

| Current state    | Event                            | Transition / caller result                                                                                                           |
| ---------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `OPEN`           | Search failure                   | Moves to `POISONED` and starts forced cleanup once                                                                                   |
| `OPEN`           | `abortAndReap()` first           | Moves to `POISONED` with an abort error and proceeds from immediate TERM to bounded KILL escalation                                  |
| `OPEN`           | `close()` first                  | Moves to `CLOSING`, trying orderly quit before TERM / KILL if needed                                                                 |
| `CLOSING`        | Later abort or close             | Joins the same exact close-first Promise without reclassification or poisoning                                                       |
| `POISONED`       | Later operation / lifecycle call | Joins the established terminal error or raw cleanup Promise                                                                          |
| Cleanup fulfills | Every state                      | Every process group is gone and snapshot revalidation and removal have succeeded                                                     |
| Cleanup rejects  | Every state                      | Lifecycle callers receive the raw cleanup error; operation callers receive a terminal error aggregating primary and cleanup failures |

Failure to terminate one engine does not skip the remaining engines, snapshot revalidation, or snapshot removal; cleanup collects the failures in an `AggregateError`. It also removes the `close` listener after fulfilled cleanup and retains a settled guard, so a delayed `close` event cannot signal the process group a second time.

## 4. The checkpoint first-terminal state machine

The rolling window remains at most 12 items, and persistence remains in strict input order. Terminal selection is not in input-index order, however. The checkpoint records exactly once the **first globally observed cause** among producer rejection, authenticated deadline, validation, append, timer setup, and related failures.

After first terminal it schedules no new parent, notifies each raw-pending task's native `AbortSignal` once with that cause, and calls the controller once. An observer attached when each raw task starts consumes late raw settlement, but does not validate its report or append it to the checkpoint.

Drain outcomes are classified as follows.

| At drain completion or bound                       | Result                                                                          |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Controller fulfilled, zero raw pending             | Return the primary failure with no cleanup addendum                             |
| Controller rejected, zero raw pending              | Return primary + controller cleanup failure                                     |
| Controller pending                                 | Cleanup timeout at the bound, even if zero raw producers remain                 |
| Controller fulfilled / rejected, raw still pending | Cleanup timeout at the bound; controller completion alone is insufficient       |
| Raw producer settles after terminal                | Consume only; perform no validation / append                                    |
| Append had started before terminal                 | Permit that it may finish, mark persistence indeterminate, and require a rescan |

If either the controller or any raw producer is still pending at the bound, the result therefore contains `FloodgateV7TeacherAbortDrainTimeoutError`. Sending a signal does not count a raw Promise as reaped.

## 5. Preserve both primary and cleanup failures

A common timeout bug is to overwrite the original producer failure with a later kill error. `FloodgateV7TeacherProducerCleanupError` keeps the first cause in both `.primary` and `.cause`, with a separate cleanup-side `AggregateError` in `.cleanupFailure`.

Cleanup-side failures include a synchronous controller throw, a return that is not an exact native Promise, rejection, abort-drain timer setup / cancellation failure, and drain timeout. It retains all that occur. When cleanup finishes normally, the checkpoint adds no wrapper and returns the primary failure alone.

An exception cannot reveal whether checkpoint `write`, `sync`, or directory sync became durable. In particular, an append already running before terminal may complete after terminal is observed, so forbidding new validation / append alone is insufficient. A failure after persistence may have started becomes `FloodgateV7TeacherCheckpointPersistenceIndeterminateError`, and the next resume rescans the HMAC-authenticated durable prefix. The checkpoint accepts canonical bytes found on disk instead of guessing that a write did not happen.

## 6. Authenticate producer control

Resuming the same work file with another deadline or late-result policy changes execution semantics even if the HMAC remains valid. v2 places the following values in the run binding and header, protected by the strict key set and HMAC chain.

| Field                    | v2 contract                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| Checkpoint schema        | `shogi-floodgate-v7-teacher-work-v2`                                                              |
| Run-binding schema       | `shogi-floodgate-v7-teacher-run-binding-v2`                                                       |
| Producer-control schema  | `shogi-floodgate-v7-teacher-producer-control-v2`                                                  |
| `parent_deadline_ms`     | Integer `1..2,147,483,647`                                                                        |
| `abort_drain_ms`         | Integer `1..2,147,483,647`                                                                        |
| `max_in_flight`          | Exact `12`                                                                                        |
| `cancel_policy`          | `first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2` |
| `late_settlement_policy` | `observe-from-start-consume-after-terminal-without-validation-or-append-v2`                       |
| Runtime identity         | Fixes `stable_runtime_receipt_sha256` and `teacher_usi_runtime_receipt_sha256` as 64 hex each     |

A changed value makes resume reject before a single producer call. The timer ceiling also prevents runtime-dependent delay clamping or overflow from becoming policy. The 24k synthetic evidence uses `parent_deadline_ms = 1,800,000` and `abort_drain_ms = 30,000`, but with zero producer calls it is not a production engine-timeout measurement.

## 7. Reject a decorated Promise without abandoning its rejection

A producer or controller may return only a non-Proxy native Promise from the current Node realm, with exact `Promise.prototype` and zero own keys. Promise subclasses, Proxies, thenables, and decorated native Promises with own properties are rejected as semantic input.

That revealed another problem. If a native Promise carrying an own `trace_id` is rejected immediately as a contract violation, the Promise itself can reject later and become an unhandled rejection. Using ordinary `.then` incautiously could, meanwhile, trust the decorated Promise's `constructor` or `Symbol.species`.

The fix does not change the contract violation. For a value that is still verifiably native, non-Proxy, and exact-prototype, it invokes captured `Promise.prototype.then` through `Reflect.apply`. Both fulfillment and rejection handlers carry no value into the checkpoint, and the species-derived result is ignored. This is best-effort rejection observation only; it never upgrades the decorated Promise to trusted input. Internal supervisor Promises are pinned to the captured native constructor. The current JavaScript realm and intrinsics remain trusted, and this is not a sandbox against hostile same-process code.

## 8. Make process group, snapshot, and test teardown one completion boundary

Fulfilled owner abort means more than “a signal was sent.” It means every dedicated USI engine process group has disappeared and private-snapshot identity revalidation and removal have succeeded. Abort-first skips waiting for orderly quit and proceeds to TERM, escalating to KILL after the bound. Close-first tries orderly quit before applying TERM / KILL only to surviving groups.

Tests must preserve the same ownership. In adversarial cases with detached children, assertion or fixture-setup failure still enters `finally`, observes rejection from started operation / lifecycle Promises, force-reaps process groups, confirms disappearance, and only then removes temporary roots. An `afterEach` dependent only on already registered fixtures can miss a throw before registration or a late settlement. A green test that leaves a child or directory behind is not production-lifecycle evidence.

## 9. Do not re-sign v1 in place as v2

v2 changes the checkpoint schema, run binding, HKDF / HMAC domains, format, producer-control policy, and runtime identities. A v1 header has no v2 producer control, so its bytes cannot retain the same meaning while being presented as v2.

The scanner rejects even a genuinely HMAC-authenticated v1 header as an unsupported schema, with zero producer and controller calls. Operations must archive or quarantine the old stage as immutable historical evidence and fresh-start v2 in a new private stage. A key holder must not re-sign v1 in place as v2 or silently transplant completed parents.

The [old Attempt 5 article](./blog-shogi-floodgate-v7-valid-24k-scan-load.en.md) and [old audit JSON](../ml/protocols/floodgate-v7-valid-24k-scan-load-183e95f-result.json) remain historical v1 evidence. Their values remain source `183e95f409347c37feee72b0509af17317891a36`, harness SHA-256 `d0f8b2f21b26c523949b4026171c35b7158c2509a54d5a81edba56006623d20f`, 443.37 seconds, 429,244,881 bytes, and stream SHA-256 `ea6e9d26e4a7b8ac817c586dec9d2b903dbc798a0324e5c63b2d5adddc10fbac`. None of those values is reused as current v2 resume / acceptance evidence.

## 10. Synthetic v2 24,000-parent evidence

The current v2 raw record is preserved in the [Attempt 6 audit JSON](../ml/protocols/floodgate-v7-valid-24k-scan-load-017692c-result.json). Full audit identities, without abbreviation, follow.

| Audit item           | Confirmed value                                                            |
| -------------------- | -------------------------------------------------------------------------- |
| Source commit        | `017692c7a076babbd40e7be0b14ea27d9988fa6c`                                 |
| Harness SHA-256      | `23578cbf11deafb49cd288f38d9f3ec081e76d0f41a5b2948b3ccf08fabfb9a2`         |
| UTC                  | Started `2026-07-13T11:51:53Z` / finished `2026-07-13T11:59:09Z`           |
| Wrapper / process    | Exit 0 / complete result JSON                                              |
| External time        | Wall 435.60 s / user 442.23 s / system 5.74 s                              |
| External maximum RSS | 483,491,840 bytes                                                          |
| Stream               | 429,245,287 bytes / 24,002 records                                         |
| Stream SHA-256       | `8039ec02f3421d934d0a9f1d10b47a97f273e397ad414e64db50bded13c498ac`         |
| Resume               | Completed 24,000 / resumed 24,000 / producer calls 0                       |
| Cleanup              | Temporary roots before 0 / after 0 / new residual 0                        |
| Source hygiene       | Worktree clean before and after; source commit / harness SHA-256 unchanged |

The LF-inclusive stream arithmetic also matches: `2,957 + 429,217,823 + 505 + 24,002 = 429,245,287`. Resumable-prefix and sealed-final each accepted the same stream in 6,550 reads with a maximum 65,536-byte request, and receipt / independent SHA-256 matched. External wall and CPU time use different clocks, so user time exceeding wall time is not by itself inconsistent.

The run used an Apple M4 Pro with 14 logical CPUs, 51,539,607,552 bytes of memory, macOS 15.1 arm64, and Node v22.13.0. The fresh fixture-build receipt was discarded as non-evidence, and native sync was restored before the evidence scan. RSS is an observation from one machine and fixture, not a scaling guarantee.

The crucial qualification is `producer_calls = 0`. This evidence establishes only that a synthetic, holdout-free checkpoint carrying the v2 header / producer-control identity can resume and final-scan 24,000 parents. It does not measure a real USI timeout, controller drain, official receipt, or production origin.

## 11. Claim boundary and next work

The current checkpoint controller, timer hooks, and 24k fixture are test-only, trusting the current realm / intrinsics and controller. The scan-load uses a dummy stable-runtime digest, and its teacher-runtime digest is not a receipt issued by an official production authority. Production still needs an official digest helper / authority and an owning coordinator that connects checkpoint `abortAndDrain()` to teacher-runtime `abortAndReap()` plus the stable-runtime lifecycle.

The next step is fault injection through that adapter with real processes: timeout, simultaneous failure, controller rejection, raw-never-settles, late close, and snapshot-cleanup cases, recording bounded exit and zero residual groups in a receipt. Only then should a small real-label pilot that opens no holdout proceed, followed by label audit, training, frozen-weight A/B, and rating evaluation.

This change has produced no official teacher label and changed no training row, optimizer, or weight. Evidence for a live-environment change, match A/B, Elo, 81Dojo rating, rank, or stable high-dan play remains zero. It closes the prerequisite that a failed run stops, reaps its resources, and resumes under the same policy; it has not yet measured a playing-strength improvement.
