# Never confuse `undefined` with success — Floodgate v7 checkpoint failure-state hardening

> The [production checkpoint connector](./blog-shogi-floodgate-v7-production-checkpoint-connector.en.md) closes the coordinator, stage lease, deployment key, 24,000 training rows, V3 checkpoint, and postflight into one ownership boundary. This change fixes an internal failure state that reused the JavaScript value `undefined` as the sentinel for “no failure.” The implementation revision in ready PR [#473](https://github.com/gomyway1216/nextjs-portfolio/pull/473) is `2480ff0d4af4324bee3d79ba7dbace54e69ca34a`; its prerequisite is PR #472's regular merge `6e5197fb9a9200cc1b00db1ee34e072b9de84ea2`. Focused validation passed 127 / 127, related validation passed 252 / 252, full validation passed 2,746 / 2,746, the production build generated 193 / 193 pages, ML passed 58 / 58, npm audit found zero vulnerabilities, and TypeScript, changed-file ESLint, Prettier, and the diff check passed. Final independent-audit residuals are P0 / P1 / P2 = 0 / 0 / 0. All 2 / 2 review comments are fixed, replied to, and resolved with zero unresolved threads; PR CI and merge remain `PENDING`, and no production action ran. Japanese version: [blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.md](./blog-shogi-floodgate-v7-checkpoint-failure-state-hardening.md)

## 1. Outcome and scope

JavaScript permits both `throw undefined` and `Promise.reject(undefined)`. The raw payload itself therefore cannot indicate whether a failure exists. PR #473 adds explicit failure-observed state to the production checkpoint connector and guarantees the following even when the payload is `undefined`.

| Invariant                   | Behavior after the repair                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| Primary failure presence    | Track with `primaryObserved`, separately from the payload                                        |
| Sink failure observation    | Observe the Promise rejection branch itself; never treat its reason value as a presence sentinel |
| Coordinator terminal action | Select `abortAndDrain` after any observed primary, regardless of payload                         |
| Public result               | Never convert the failure into a success receipt                                                 |
| Private evidence            | Only the test seam may observe the raw payload; the production public error does not expose it   |
| Checkpoint ambiguity        | Conservatively set persistence possible immediately before sink invocation                       |

This PR does not change the model, search, teacher, training, or weights. It narrowly strengthens a prerequisite for safely advancing a real run exactly once.

## 2. Root cause — one sentinel represented both value and state

The old implementation declared `let primary: unknown` and interpreted `primary === undefined` as “no primary failure.” That appears to work for an ordinary `Error`, but JavaScript places no type constraint on a thrown value or rejection reason. If a catch receives `undefined`, a real failure has occurred while the variable remains equal to its initial sentinel.

A value sentinel must not make control decisions such as cleanup branch selection, observer invocation, public failure construction, or retry classification. For nested settlement, the Promise's fulfilled or rejected branch supplies observation state. When a later rejection is joined, it is compared directly with the current primary rather than a stale sink cache, preserving a distinct payload as a private compound failure.

The existing contract in which a successful consumer callback fulfills with exact `undefined` is separate and unchanged. The key is to distinguish the Promise's fulfilled or rejected branch and failure presence from the payload value.

## 3. Explicit failure-presence model

The repaired connector retains payload and presence separately.

```text
primaryObserved = false
primary = undefined

catch (payload):
  primary = payload
  primaryObserved = true
```

`primaryObserved` determines coordinator close versus abort, failure-evidence construction, and throwing the public error. `primary` is raw evidence for the test-only observer. A value of `undefined` does not erase its failure state. The production dependency table fixes the observer itself to `undefined`, so the raw payload is never public.

A sink rejection is observed by entering the Promise's rejected branch. If `primaryObserved` is false at the first rejection, the connector stores its reason and sets the bit even when that reason is `undefined`. If a primary already exists, it compares the later reason directly with the current primary. The same payload is not compounded twice, while a different payload becomes the existing private compound failure. No separate sink-presence cache remains.

## 4. Fix the checkpoint-persistence boundary before invocation

The old classification depended heavily on callee-controlled details, such as whether the checkpoint rejection object carried a private `mayHavePersisted` marker or whether the returned Promise shape was invalid. An ordinary `Error` or `undefined` rejection could therefore report `checkpoint_may_have_persisted = false` even after invoking the sink and could suggest a fresh retry.

The repaired order is:

```text
capture exact checkpoint options
        |
        v
checkpointMayHavePersisted = true
        |
        v
invoke checkpoint sink exactly once
```

The sink has not run if option capture fails. Once that step passes, the connector does not deny persistence after a synchronous throw, Promise rejection with any value, invalid Promise shape, receipt-capture failure, consumer-wrapper failure, or postflight failure. The connector cannot safely prove whether the sink wrote internally.

## 5. Lifecycle follows observed state, not payload

Normal coordinator completion is allowed only when no primary failure was observed and no cleanup failure exists—not when the payload happens to equal `undefined`.

| State                                             | Coordinator action                      | Success receipt                             |
| ------------------------------------------------- | --------------------------------------- | ------------------------------------------- |
| No primary observed; zero cleanup failures        | `close`                                 | Possible only after every receipt validates |
| Primary observed with an `Error` payload          | `abortAndDrain`                         | Impossible                                  |
| Primary observed with an `undefined` payload      | `abortAndDrain`                         | Impossible                                  |
| No primary observed; one or more cleanup failures | Attempt every terminal cleanup and fail | Impossible                                  |

Lease close and coordinator close / abort still start and settle through the existing all-settled boundary. The repair does not transfer resource ownership; it corrects the failure branch chosen for that ownership.

## 6. Close callback and sink double settlement

The consumer owner may resolve or reject its own Promise after invoking the callback, while the connector rejoins the callback Promise outside the owner call. The same sink failure can therefore be visible through both the consumer and callback paths.

PR #473 observes each Promise's settlement branch and sets `primaryObserved` regardless of reason value when no primary exists. If one already exists, it compares the later reason directly with that current primary. It avoids compounding the same payload twice, retains a distinct payload, and does not let stale sink-failure cache state suppress a sink rejection that differs from the consumer primary. Explicit primary-failure presence survives cleanup and produces a public failure afterward.

## 7. Fail-closed state matrix

| Failure boundary                               | Sink invocations | Checkpoint persistence | Retry-disposition rule                               |
| ---------------------------------------------- | ---------------: | ---------------------: | ---------------------------------------------------- |
| Capture / enrollment                           |                0 |                  false | Fresh invocation or the fixed control-plane response |
| Readiness                                      |                0 |                  false | Provision or operator reconciliation                 |
| Coordinator-stage / key prepare / key identity |                0 |                  false | Operator reconciliation                              |
| Handoff / consumer before sink                 |                0 |                  false | May be fresh only after successful cleanup           |
| Checkpoint-option capture                      |                0 |                  false | Classified as a pre-sink failure                     |
| Checkpoint sink invocation and later           |                1 |                   true | `checkpoint-reconciliation-required`                 |
| Checkpoint-receipt validation                  |                1 |                   true | `checkpoint-reconciliation-required`                 |
| Postflight claim                               |                1 |                   true | `checkpoint-reconciliation-required`                 |

“Pre-sink” does not mean “always fresh.” Unsafe readiness, key mismatch, and cleanup failure can still require operator reconciliation. The reverse condition is strict: **every failure after invoking the sink requires checkpoint reconciliation and cannot automatically fresh-retry.**

## 8. Adversarial regression coverage

Focused regressions pin at least three `undefined` failure points.

| Injected point                                        | Expected phase | Checkpoint may have persisted | Terminal expectation                             |
| ----------------------------------------------------- | -------------- | ----------------------------: | ------------------------------------------------ |
| Synchronous handoff `throw undefined`                 | `handoff`      |                         false | Coordinator abort; zero success receipts         |
| Checkpoint `Promise.reject(undefined)`                | `checkpoint`   |                          true | Checkpoint reconciliation; zero success receipts |
| Postflight `throw undefined` after a valid checkpoint | `postflight`   |                          true | Checkpoint reconciliation; zero success receipts |

Each case checks the typed public error, cleanup count, key discard, lease close, coordinator abort, and exactly one test-observer call. The observer confirms that the raw primary really is `undefined`, but that evidence remains test-only and never reaches the public surface.

Supplementary regressions verify that a synchronous `throw undefined` from the checkpoint sink still crosses the persistence boundary immediately before invocation, and that a lease-close Promise rejecting with `undefined` increments the cleanup-failure count instead of falling through to public success. The latter is a `cleanup`-phase, `checkpoint-reconciliation-required` failure after a successful checkpoint.

The related ten-file regression also retains coverage for ordinary errors, compound cleanup failure, consumer wrap / ignore, invalid Promise shapes, and post-claim lease-close joining. It checks that presence-state hardening preserves existing ownership behavior.

## 9. Revision-bound validation and pending work

The recorded state for implementation revision `2480ff0d4af4324bee3d79ba7dbace54e69ca34a` and the article-and-evidence validation candidate `bbbe91003245ab11ac224fde8af4f855d0ed5afc` is:

| Validation           | Status    | Measured evidence                                                       |
| -------------------- | --------- | ----------------------------------------------------------------------- |
| Focused Vitest       | PASS      | 2 files, 127 / 127, duration 1.63 s                                     |
| Related Vitest       | PASS      | 10 files, 252 / 252, duration 68.88 s                                   |
| TypeScript           | PASS      | 0 diagnostics                                                           |
| Changed-file ESLint  | PASS      | 0 errors                                                                |
| Prettier             | PASS      | Targeted files                                                          |
| Diff check           | PASS      | 0 whitespace errors                                                     |
| Independent audit    | PASS      | Residual P0 / P1 / P2 = 0 / 0 / 0                                       |
| Ready PR #473 review | PASS      | 2 / 2 actionable comments fixed, replied to, and resolved; 0 unresolved |
| Full Vitest          | PASS      | 148 files, 2,746 / 2,746, duration 155.64 s                             |
| Production build     | PASS      | 193 / 193 pages, wall 35.08 s, zero swaps                               |
| ML stdlib            | PASS      | 58 / 58, unittest duration 0.121 s                                      |
| npm audit            | PASS      | Zero vulnerabilities                                                    |
| PR #473 CI           | `PENDING` | All checks at the ready PR head have not completed                      |
| Regular merge        | `PENDING` | Kept separate from the prerequisite merge                               |

The [machine-readable evidence](./data/floodgate-v7-checkpoint-failure-state-hardening-2026-07-16.json) uses the same revision and status boundaries. Pending fields contain no null, invented count, or value borrowed from an older PR.

## 10. Production counters and nonclaims

Every production or live action count for this change remains zero.

| Action                                    |     Count |
| ----------------------------------------- | --------: |
| Registry provisioning                     |         0 |
| Production gates (100 / 500 / 24,000)     | 0 / 0 / 0 |
| Teacher generation / teacher labels       |     0 / 0 |
| Training / optimizer steps                |     0 / 0 |
| Candidate selection / promotion           |     0 / 0 |
| Candidate weights / production overwrites |     0 / 0 |
| Formal A/B games                          |         0 |
| External-calibration games                |         0 |
| Live-weight writes / activations          |     0 / 0 |

The current production and rollback evaluators both remain `runOp1`, and the live weight is unchanged. This change establishes no playing-strength, rating, high-dan, or stability result.

## 11. Relationship to the high-dan goal

Failure-state hardening does not directly increase Elo. However, incorrectly fresh-retrying prefix-100 after an ambiguous failure could duplicate writes into the checkpoint stream or make provenance uncertain. A corrupted teacher dataset or ambiguous resume state invalidates later training comparisons, so this safety boundary is necessary for the strength pipeline.

Formal strength evidence remains a separate stage: compare the candidate against `runOp1` over 192 color-swapped pairs / 384 games, then run 200 external-calibration games. Selection, known regressions, and production parity remain separate gates. Test passes in this PR are never converted into game results.

## 12. Next sequence

1. Complete review and CI on ready PR #473 and resolve every actionable comment.
2. Run the full suite and production build at the actual ready head, recording only measured values.
3. Integrate PR #473 with a regular merge commit.
4. Close the remaining registry-verifier, training-label-finalizer, and create-only-provisioning safety gates in their established order.
5. Run prefix-100 exactly once through the reviewed same-lock owner; on failure, stop until checkpoint reconciliation completes.
6. Advance teacher generation, retraining, candidate selection, formal A/B, and external calibration as separate evidence boundaries.
7. Leave `runOp1` and the live weight unchanged until all evidence is complete.

The result is narrow and explicit: **a failure payload of `undefined` no longer erases the failure, and every unknown state after sink invocation is routed to checkpoint reconciliation.**
