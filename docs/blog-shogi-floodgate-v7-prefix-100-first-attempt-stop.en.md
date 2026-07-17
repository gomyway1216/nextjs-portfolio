# Safely stopping the first prefix-100 attempt and preserving its partial checkpoint — Floodgate v7

> [PR #483](https://github.com/gomyway1216/nextjs-portfolio/pull/483) passed every check and was integrated with regular merge commit `9ddcc032329a4a9f3931494f2348c10d9fe2d696`. After aligning the fixed application to that merge, application-source, connector-verifier, and approved/current-binding readiness, create-only registry provisioning, the six-case kill drill, and fresh preflight all passed. Prefix-100 was then started exactly once, but stopped safely after 1,597 seconds without a success receipt. Sanitized failure v2 published `phase = runner`, but that is a projection bug in which the CLI incorrectly rejects a valid true/true `outer-gate-lock` tuple; it does not establish the actual causal phase. An independent read-only audit found an authenticated stale active lease, four complete authenticated records (one header + three parents), no torn tail, no milestone or seal, and zero residual processes. A later same-configuration read-only reproduction completed seven of twelve candidates in 0.8 to 244.9 seconds, while five fell into pool-wide rejection at approximately 600.0 seconds. The current code discards the triggering error, so the typed cause and trigger parent remain unknown, but the fixed ten-minute timing boundary is reproduced. Retry, cleanup, quarantine, resume, teacher generation, training, weight changes, and live activation all remain zero. The production decision is **STOP**. Japanese version: [blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md)

## 1. Result

Prefix-100 did not succeed. It is also inaccurate to say that nothing happened. The fixed production connector was invoked, and the checkpoint contains one complete authenticated header record and three complete authenticated parent records. There is no 100-parent milestone and no seal, so this partial state cannot be treated as prefix-100 success, teacher data, or authority to resume.

| Decision subject                | Established result                                      |
| ------------------------------- | ------------------------------------------------------- |
| prefix-100 attempt              | once, exactly once                                      |
| elapsed time                    | 1,597 seconds                                           |
| success receipt                 | absent                                                  |
| complete authenticated records  | 4 = one header + three parents                          |
| torn tail                       | absent                                                  |
| prefix-100 milestone / seal     | absent / absent                                         |
| public retry disposition        | `checkpoint-reconciliation-required`                    |
| retry / cleanup / resume        | 0 / 0 / 0                                               |
| live evaluator                  | no weight change, no activation                         |
| current operational decision    | **STOP**                                                |

The same command has not been invoked again since the stop. The active lease and partial checkpoint are incident evidence; without reviewed reconciliation authority, they will not be deleted, quarantined, edited, or reused.

## 2. Gates passed before prefix-100

Regularly merging the NSNumber fix did not itself authorize production execution. After alignment to the fixed revision, fresh gates with distinct responsibilities were run in sequence.

| Gate / delivery                           | Result        | Boundary                                                           |
| ----------------------------------------- | ------------- | ------------------------------------------------------------------ |
| NSNumber fix PR                           | PASS / MERGED | #483, regular merge `9ddcc032329a4a9f3931494f2348c10d9fe2d696`   |
| application-source readiness              | PASS          | fresh check of the fixed application source                        |
| connector-verifier readiness              | PASS          | fresh check of the fixed verifier closure                          |
| approved/current-binding readiness        | PASS          | fresh exact binding check of the approved record and current key   |
| immutable registry V2 provision           | PASS          | create-only, postflight PASS                                       |
| prefix-100 kill drill                     | PASS          | three failpoints × SIGTERM / SIGKILL = six cases                   |
| prefix-100 fresh preflight                | PASS          | no persistent mutation and no gate invocation                      |
| prefix-100 durable execution              | **STOPPED**   | 1,597 seconds, no success receipt                                  |

The readiness, provision, kill-drill, and preflight passes are evidence only for the boundary checked by each gate. They do not prove that the later long-running operation must finish, nor do they authorize automatic resumption of a partial checkpoint.

## 3. What the sanitized failure established

The public failure contains no private path, execution identifier, key, digest, position, parent identifier, or raw engine error. Its fixed public fields established only the following.

| Sanitized field               | Value                                                       |
| ----------------------------- | ----------------------------------------------------------- |
| contract                      | `shogi-floodgate-v7-production-connector-cli-failure-v2`     |
| public phase                  | `runner`                                                    |
| connector invoked             | `true`                                                      |
| checkpoint may have persisted | `true`                                                      |
| retry disposition             | `checkpoint-reconciliation-required`                        |
| exact-prefix postflight       | `false`                                                     |

However, `public phase = runner` must not be read as the root cause. A safe `outer-gate-lock` failure returned by the outer lease owner carries `connector invoked = true` and `checkpoint may have persisted = true` when the operation started and may have left a checkpoint. The incident revision's CLI sanitizer did not accept this valid true/true tuple as `outer-gate-lock`, and fell through to the unknown `runner` fallback. This projection bug prevented the public result from distinguishing the exact inner phase.

This bug does not turn a failure into success. The fail-closed decision to withhold a success receipt and stop is correct. In the current PR candidate, exact commit `f5feacd9a24615cb0e75c580181a0cf79419aef8` accepts only the pre-operation false/false tuple and post-operation true/true tuple as `outer-gate-lock`, while an invalid shape with nested fields still falls back to the generic failure. The focused 28 / 28 tests and changed two-file ESLint pass, and the candidate is published as ready-for-review [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484). Final-head CI, review, and regular merge remain PENDING, and this candidate has not been run in production. It restores only the safe outer phase; the exact inner phase of this incident remains unknown.

## 4. Independent read-only audit after the stop

An independent audit that did not mutate production state established only the following from authentication and filesystem metadata. No private value or record content is published in this article.

| State                         | Read-only observation                     |
| ----------------------------- | ----------------------------------------- |
| active lease                  | authenticated, stale                      |
| recorded owner process        | absent                                    |
| common OS lifetime lock       | free                                      |
| quarantine / retired          | empty / empty                             |
| stage work                    | exactly one file                          |
| complete authenticated records | 4                                        |
| record composition            | one header + three parents                |
| torn tail                     | false                                     |
| prefix-100 milestone          | false                                     |
| final seal                    | false                                     |
| residual production processes | 0                                         |

`Stale` does not mean “safe to delete.” Even though the owner process is absent and the OS lock is free, the active lease is authenticated crash evidence and the stage work contains authenticated partial progress. The read-only audit is inspection, not cleanup, quarantine, checkpoint resumption, or authorization for the next gate.

## 5. Same-configuration read-only reproduction and remaining unknowns

Without writing to the production checkpoint, lease, or registry, the fixed application revision authenticated the same input and submitted indices 3 through 14, the twelve candidates that could have been active immediately after the authenticated three-parent prefix, to the same twelve-worker stable runtime.

| Input index | Outcome             | Elapsed seconds |
| ----------: | ------------------- | --------------: |
|           3 | generic pool poison |          ~600.0 |
|           4 | fulfilled           |           5.798 |
|           5 | fulfilled           |          93.027 |
|           6 | generic pool poison |          ~600.0 |
|           7 | generic pool poison |          ~600.0 |
|           8 | fulfilled           |         244.880 |
|           9 | generic pool poison |          ~600.0 |
|          10 | fulfilled           |           1.388 |
|          11 | fulfilled           |           0.839 |
|          12 | fulfilled           |          64.223 |
|          13 | fulfilled           |         105.684 |
|          14 | generic pool poison |          ~600.0 |

Seven candidates completed normally. The other five received the same generic pool-poison error at the fixed 600-second boundary. This reproduces the timing predicted by the ten-minute-timeout hypothesis. The current pool, however, discards the first worker error and distributes one generic error to every active job. It is therefore not valid to claim that all five individually timed out or to identify which parent triggered the poison. The safe classification remains `unknown`; only the timing inference is `search-timeout`. Runtime close succeeded and left zero workers.

| Cause question                  | Current state                                         |
| ------------------------------- | ----------------------------------------------------- |
| stable 600-second boundary      | timing matched in same-configuration read-only replay |
| typed worker failure kind       | `unknown`; the current pool discards the trigger      |
| exact failing inner phase       | unknown; removed from the public result by projection |
| trigger parent                  | not identified among five generic rejections          |
| torn checkpoint write           | ruled out; no torn tail                               |
| prefix-100 completion           | ruled out; no milestone or seal                       |

No claim is therefore made that indices 3, 6, 7, 9, and 14 each timed out independently, that one specific index was the trigger, or that machine resources were insufficient. The next diagnostic boundary must preserve a safe failure kind and timeout value before pool-wide poison, without publishing stderr, process identifiers, positions, or parent identities.

## 6. Changes not executed

Evidence preservation took priority after the stop. None of the following mutations or downstream work has been executed.

| Operation                              | Count / state |
| -------------------------------------- | ------------: |
| prefix-100 retry                       |             0 |
| active-lease cleanup                   |             0 |
| quarantine                             |             0 |
| checkpoint resume                      |             0 |
| teacher generation                     |             0 |
| label finalization                     |             0 |
| retraining / optimizer step            |         0 / 0 |
| candidate selection / promotion        |         0 / 0 |
| formal A/B / external-calibration game |         0 / 0 |
| production weight overwrite            |             0 |
| live activation                        |             0 |

Live weights are unchanged. This attempt therefore did not change playing strength and created no evidence that the evaluator became stronger or reached high-dan strength.

## 7. Why there is no automatic retry

Invoking the same exactly-once command again while a partial checkpoint exists could mishandle at least one of these boundaries:

1. automatically deleting the stale active lease and losing evidence of the failure boundary;
2. ignoring the existing three parent records and creating duplicate work;
3. mistaking an incomplete checkpoint for a completed milestone;
4. reaching the same timeout again without fixing the root cause; or
5. reconciling the outer lease, inner stage, and checkpoint under separate authorities.

There is currently no reviewed fixed production operator flow that can safely resolve this real state. Manually editing the filesystem, deleting the active lease, or reusing the stage through a different command is not a substitute. Authenticated evidence and the exactly-once boundary take precedence over availability.

The V3 header also authenticates, through HMAC, the stable and teacher runtime-receipt hashes and run bindings such as worker count, search timeout, depth, and source. If reproduction or a fix changes any of those bytes or configuration values, the existing three-parent partial cannot be resumed; it requires reviewed quarantine followed by a separately approved fresh run. Identical bytes and configuration make it only a structural resumption candidate. They do not grant resumption authority, and the same timeout may recur. No private hash or binding value is published.

## 8. Safe next order

1. Preserve the current active lease and stage work unchanged; do not retry, clean up, quarantine, or resume.
2. Independently review the CLI projection fix and regressions at exact candidate `f5feacd9a24615cb0e75c580181a0cf79419aef8` in [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484), then pass final-head CI and a regular merge. Do not use an unmerged or production-unpinned candidate as operational evidence.
3. Implement a fixed-origin, zero-argument, read-only production inspector that authenticates the active lease, registry binding, checkpoint records, milestone, seal, and tail, and returns sanitized counts only.
4. Preserve a safe failure kind and timeout value from the worker boundary through pool-wide poison, without exposing stderr, process identifiers, positions, or IDs, then rerun the same twelve candidates.
5. Compare tail latency, timeout, and throughput at 4, 6, 8, and 12 workers on the same read-only input. Choose a cause- and quality-aware configuration instead of blindly extending the timeout or retrying.
6. Only after establishing the root cause, fix it and pass regressions for timeout, cancellation, partial checkpointing, and the resumption boundary. If the fix changes worker count, timeout, depth, a runtime receipt, or source binding, prohibit resumption of the existing partial.
7. Implement a fixed operator reconciliation flow that rechecks the outer lease and inner stage/checkpoint in the same process. Require explicit human confirmation for either resumption or quarantine followed by separately authorized resolution/restart; never choose automatically.
8. Pass final-head CI, independent review, and a regular merge on ready-for-review [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484), which contains the code, tests, Japanese and English articles, and machine-readable evidence.
9. Rerun read-only inspection through the fixed operator from the merged revision. Consider explicit reconciliation only if the fresh evidence matches.
10. Resume from the partial checkpoint only if both exact bytes/configuration and safe resumption authority are established, and address the timeout-recurrence risk even under the same binding. If the binding changes or safety cannot be proved, split authenticated quarantine from a separately approved fresh restart.
11. Even if exact-100 passes postflight, stop once for independent review and informed human approval before advancing to 500 and final-24,000.
12. Only after producing and finalizing the complete teacher data should retraining, candidate selection, formal A/B, and external calibration proceed. Consider live activation only when safety, quality, playing-strength, and rollback evidence all pass.

Any fresh inspection mismatch, authentication failure, indeterminate state, or new quarantine means STOP. Speed is not authority to skip this sequence.

## 9. Current decision

The launcher fix and production-readiness chain passed, but the first durable prefix-100 attempt stopped after 1,597 seconds without a success receipt. Three authenticated parent records are real progress, but they are neither a 100-parent milestone nor playing-strength evidence. The public `runner` phase is also a fallback caused by a projection bug. The same-configuration read-only reproduction matched the fixed 600-second boundary, but the current pool discards the triggering error, so the typed cause and trigger parent remain unknown.

The current decision is therefore **STOP**. The diagnostic projection was regularly merged through PR #484, and safe worker-failure propagation is now implemented, validated, and independently reviewed as the [next candidate](./blog-shogi-floodgate-stable-wasm-failure-kind.en.md). The next valid advance is to take that failure-kind candidate through PR review, CI, and regular merge, complete the 4 / 6 / 8 / 12-worker comparison, and finish the read-only inspector and reviewed reconciliation operator. The [machine-readable evidence](./data/floodgate-v7-prefix-100-first-attempt-stop-2026-07-16.json) separately records the successful prerequisite gates, the single stopped attempt, the authenticated partial state, the read-only reproduction, unexecuted mutations, and nonclaims.
