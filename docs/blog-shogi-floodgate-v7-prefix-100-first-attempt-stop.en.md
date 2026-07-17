# Safely stopping the first prefix-100 attempt and preserving its partial checkpoint — Floodgate v7

> [PR #483](https://github.com/gomyway1216/nextjs-portfolio/pull/483) passed every check and was integrated with regular merge commit `9ddcc032329a4a9f3931494f2348c10d9fe2d696`. After aligning the fixed application to that merge, application-source, connector-verifier, and approved/current-binding readiness, create-only registry provisioning, the six-case kill drill, and fresh preflight all passed. Prefix-100 was then started exactly once, but stopped safely after 1,597 seconds without a success receipt. Sanitized failure v2 published `phase = runner`, but that is a projection bug in which the CLI incorrectly rejects a valid true/true `outer-gate-lock` tuple; it does not establish the actual causal phase. An independent read-only audit found an authenticated stale active lease, four complete authenticated records (one header + three parents), no torn tail, no milestone or seal, and zero residual processes. A later same-configuration read-only reproduction completed seven of twelve candidates in 0.8 to 244.9 seconds, while five fell into pool-wide rejection at approximately 600.0 seconds. The incident revision's pool discarded the triggering error, so the typed cause and trigger parent remain unknown, but the fixed ten-minute timing boundary is reproduced. Retry, cleanup, quarantine, resume, teacher generation, training, weight changes, and live activation all remain zero. The production decision is **STOP**. Japanese version: [blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.md)

> **2026-07-17 update:** Projection-fix [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484) completed all checks and review responses at final head `e9451cb2e3e673ce930f9a40645d1aecb9f8df3f`, then entered `main` through regular merge commit `1c5ec24a8c3a9ad9871bef1621034113112396b5`. That fix has not been run against the production incident state. The former recovery entry in [PR #486](https://github.com/gomyway1216/nextjs-portfolio/pull/486) was deleted after an independent post-green audit found a circular bootstrap; it is now a [non-operational recovery design contract](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.en.md). There is no package command, JXA, `tsx/cjs` preload, source authorizer, production issuer, or CLI. Its fixed marker is `UNAVAILABLE / STOP`. It neither implements nor performs production-state inspection, reconciliation, retry, cleanup, quarantine, or resumption.

> **Same-day addition:** Safe stable-WASM failure-kind propagation [PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485) also completed every check and review response at final head `6a804a7954a9685361944aeb2be32494638fae2e`, then entered `main` through regular merge commit `4b46fd3761512f38bada4c7c23537a969349a804`. The same twelve-candidate read-only diagnostic began on that exact final head before merge and continued across the merge. Seven succeeded, and all five rejections received genuine `search-timeout`, `timeout_ms = 600000`. Evidence [PR #487](https://github.com/gomyway1216/nextjs-portfolio/pull/487) also entered `main` from final head `cb3fd9697a8d5dfc5402c0a73b2a1e110a6adbff` through regular merge commit `bf643ceedb78c5103019609f7991f1a9f9664fef`. This is not evidence of a post-merge deployment start, five independent timeouts, or a retroactive typed cause for the incident attempt itself.

## 1. Result

Prefix-100 did not succeed. It is also inaccurate to say that nothing happened. The fixed production connector was invoked, and the checkpoint contains one complete authenticated header record and three complete authenticated parent records. There is no 100-parent milestone and no seal, so this partial state cannot be treated as prefix-100 success, teacher data, or authority to resume.

| Decision subject               | Established result                   |
| ------------------------------ | ------------------------------------ |
| prefix-100 attempt             | once, exactly once                   |
| elapsed time                   | 1,597 seconds                        |
| success receipt                | absent                               |
| complete authenticated records | 4 = one header + three parents       |
| torn tail                      | absent                               |
| prefix-100 milestone / seal    | absent / absent                      |
| public retry disposition       | `checkpoint-reconciliation-required` |
| retry / cleanup / resume       | 0 / 0 / 0                            |
| live evaluator                 | no weight change, no activation      |
| current operational decision   | **STOP**                             |

The same command has not been invoked again since the stop. The active lease and partial checkpoint are incident evidence; without reviewed reconciliation authority, they will not be deleted, quarantined, edited, or reused.

## 2. Gates passed before prefix-100

Regularly merging the NSNumber fix did not itself authorize production execution. After alignment to the fixed revision, fresh gates with distinct responsibilities were run in sequence.

| Gate / delivery                    | Result        | Boundary                                                         |
| ---------------------------------- | ------------- | ---------------------------------------------------------------- |
| NSNumber fix PR                    | PASS / MERGED | #483, regular merge `9ddcc032329a4a9f3931494f2348c10d9fe2d696`   |
| application-source readiness       | PASS          | fresh check of the fixed application source                      |
| connector-verifier readiness       | PASS          | fresh check of the fixed verifier closure                        |
| approved/current-binding readiness | PASS          | fresh exact binding check of the approved record and current key |
| immutable registry V2 provision    | PASS          | create-only, postflight PASS                                     |
| prefix-100 kill drill              | PASS          | three failpoints × SIGTERM / SIGKILL = six cases                 |
| prefix-100 fresh preflight         | PASS          | no persistent mutation and no gate invocation                    |
| prefix-100 durable execution       | **STOPPED**   | 1,597 seconds, no success receipt                                |

The readiness, provision, kill-drill, and preflight passes are evidence only for the boundary checked by each gate. They do not prove that the later long-running operation must finish, nor do they authorize automatic resumption of a partial checkpoint.

## 3. What the sanitized failure established

The public failure contains no private path, execution identifier, key, digest, position, parent identifier, or raw engine error. Its fixed public fields established only the following.

| Sanitized field               | Value                                                    |
| ----------------------------- | -------------------------------------------------------- |
| contract                      | `shogi-floodgate-v7-production-connector-cli-failure-v2` |
| public phase                  | `runner`                                                 |
| connector invoked             | `true`                                                   |
| checkpoint may have persisted | `true`                                                   |
| retry disposition             | `checkpoint-reconciliation-required`                     |
| exact-prefix postflight       | `false`                                                  |

However, `public phase = runner` must not be read as the root cause. A safe `outer-gate-lock` failure returned by the outer lease owner carries `connector invoked = true` and `checkpoint may have persisted = true` when the operation started and may have left a checkpoint. The incident revision's CLI sanitizer did not accept this valid true/true tuple as `outer-gate-lock`, and fell through to the unknown `runner` fallback. This projection bug prevented the public result from distinguishing the exact inner phase.

This bug does not turn a failure into success. The fail-closed decision to withhold a success receipt and stop is correct. Final head `e9451cb2e3e673ce930f9a40645d1aecb9f8df3f` of [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484) accepts only the pre-operation false/false tuple and post-operation true/true tuple as `outer-gate-lock`, while an invalid shape with nested fields still falls back to the generic failure. Final-head GitHub CI, Security Audit, and Vercel checks all passed, and all three review threads were addressed and resolved. The PR was integrated through regular merge commit `1c5ec24a8c3a9ad9871bef1621034113112396b5`. That merged fix has not been run against the production incident state. It restores only the safe outer phase; the exact inner phase of this incident remains unknown.

## 4. Independent read-only audit after the stop

An independent audit that did not mutate production state established only the following from authentication and filesystem metadata. No private value or record content is published in this article.

| State                          | Read-only observation      |
| ------------------------------ | -------------------------- |
| active lease                   | authenticated, stale       |
| recorded owner process         | absent                     |
| common OS lifetime lock        | free                       |
| quarantine / retired           | empty / empty              |
| stage work                     | exactly one file           |
| complete authenticated records | 4                          |
| record composition             | one header + three parents |
| torn tail                      | false                      |
| prefix-100 milestone           | false                      |
| final seal                     | false                      |
| residual production processes  | 0                          |

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

Seven candidates completed normally. The other five received the same generic pool-poison error at the fixed 600-second boundary. This reproduces the timing predicted by the ten-minute-timeout hypothesis. The incident revision's pool, however, discarded the first worker error and distributed one generic error to every active job. It is therefore not valid to claim that all five individually timed out or to identify which parent triggered the poison. The safe classification remains `unknown`; only the timing inference is `search-timeout`. Runtime close succeeded and left zero workers.

| Cause question             | Current state                                          |
| -------------------------- | ------------------------------------------------------ |
| stable 600-second boundary | timing matched in same-configuration read-only replay  |
| typed worker failure kind  | `unknown`; the incident revision discarded the trigger |
| exact failing inner phase  | unknown; removed from the public result by projection  |
| trigger parent             | not identified among five generic rejections           |
| torn checkpoint write      | ruled out; no torn tail                                |
| prefix-100 completion      | ruled out; no milestone or seal                        |

No claim is therefore made that indices 3, 6, 7, 9, and 14 each timed out independently, that one specific index was the trigger, or that machine resources were insufficient. [PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485) regularly merged an implementation that preserves a safe worker failure kind and timeout through pool-wide poison without publishing stderr, process identifiers, positions, or parent identities.

The exact-final-head diagnostic in regularly merged [PR #487](https://github.com/gomyway1216/nextjs-portfolio/pull/487) completed seven of twelve candidates in 0.855 to 264.590 seconds; the remaining five rejected in 599.997 to 600.003 seconds. It established that the first genuine `search-timeout`, `timeout_ms = 600000`, was broadcast to all five rejections through pool-wide poison, not that all five timed out independently or which input triggered first. Public commit times and the 1,704.974-second duration derive that the run began before merge, crossed the merge, and was recorded afterward. It therefore confirms bytes that were later regularly merged, not post-merge deployment execution or a production-incident-state reinspection. The historical incident attempt remains classified as `unknown`.

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

One separately managed exact-final-head twelve-candidate read-only diagnostic completed. Production-gate invocations, incident-state mutations, and diagnostics started from a post-merge deployment all remain zero.

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
2. Pin regularly merged [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484) as a diagnostic prerequisite. Because it has not run in production, do not treat it as a fresh observation of the incident state.
3. Pin regularly merged [PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485) as the safe-failure-kind prerequisite. Because it has not run in production, do not reinterpret the historical generic rejections as typed causes.
4. Start the same twelve-candidate read-only diagnostic on the exact final head (complete; it began before regular merge).
5. Regular-merge that same final head while the run is active, then record the first safe kind and timeout after merge (complete: `search-timeout` / 600,000 ms).
6. Take the new head of [non-operational contract PR #486](https://github.com/gomyway1216/nextjs-portfolio/pull/486) through the full suite, final-head CI, independent review, and regular merge. Do not deploy or run it as an operator.
7. Compare tail latency, timeout, and throughput at 4, 6, 8, and 12 workers on the same read-only input. Choose a cause- and quality-aware configuration instead of blindly extending the timeout or retrying.
8. Only after establishing the root cause, fix it and pass regressions for timeout, cancellation, partial checkpointing, and the resumption boundary. If the fix changes worker count, timeout, depth, a runtime receipt, or source binding, prohibit resumption of the existing partial.
9. Implement an outside-repository launcher, approved commit/tree enrollment, a no-preload bundle, and owner/mode/Git-directory closure in a separate PR.
10. Only after that external trust root passes review, CI, and regular merge, implement a zero-argument read-only inspector in another PR.
11. Only after the inspector passes final-head CI, independent review, and regular merge, perform one read-only inspection. Consider explicit reconciliation only if the fresh evidence matches.
12. Separately implement reconciliation that rechecks the outer lease and inner stage/checkpoint in one process. Require explicit human confirmation for resumption or quarantine followed by a fresh restart.
13. Even if exact-100 passes postflight, stop once for independent review and informed human approval before advancing to 500 and final-24,000.
14. Only after producing and finalizing the complete teacher data should retraining, candidate selection, formal A/B, and external calibration proceed. Consider live activation only when safety, quality, playing-strength, and rollback evidence all pass.

Any fresh inspection mismatch, authentication failure, indeterminate state, or new quarantine means STOP. Speed is not authority to skip this sequence.

## 9. Current decision

The launcher fix and production-readiness chain passed, but the first durable prefix-100 attempt stopped after 1,597 seconds without a success receipt. Three authenticated parent records are real progress, but they are neither a 100-parent milestone nor playing-strength evidence. The public `runner` phase is also a fallback caused by a projection bug. The same-configuration read-only reproduction matched the fixed 600-second boundary, but the incident revision's pool discarded the triggering error, so the typed cause and trigger parent remain unknown.

The current decision is therefore **STOP**. The diagnostic projection was regularly merged through PR #484 and safe worker-failure propagation through PR #485. The exact-final-head twelve-candidate diagnostic began before merge, crossed the merge, and established `search-timeout` as the first pool failure kind, but it did not run against the production incident state. PR #486 is now an `UNAVAILABLE / STOP` contract with no execution path or issuer. The next valid advance is not a retry; it is the 4 / 6 / 8 / 12-worker comparison followed by separately reviewed gates for an external trust root, a read-only inspector, and reconciliation. The [machine-readable evidence](./data/floodgate-v7-prefix-100-first-attempt-stop-2026-07-16.json) separately records the stopped attempt, partial state, two read-only diagnostics, corrected chronology, zero mutations, and nonclaims.
