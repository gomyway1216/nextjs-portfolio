# Closing prefix 100 from preflight through postflight under one outer lock — Floodgate v7

> PR #471 implemented and validated the [fresh prefix-100 one-shot boundaries](./blog-shogi-floodgate-v7-fresh-prefix-100-one-shot.en.md) and was integrated with regular merge commit `4a14507a5a228cac71c011c94989fa9307f8218a`. This local candidate does not reuse its read-only preflight receipt as later execution authority. It serializes preflight, the active lease, exactly one prefix-100 connector invocation, and the exact-100 postflight inside **the same outer OS lock acquired once**. The low-level scan only checks a caller-supplied anchor. Only the fixed runner's composition of a genuine connector anchor with the same-lock scan promotes it to continuity with the immediately preceding authenticated scan. It is not independent HMAC authentication. This candidate has executed no production command, namespace mutation, gate, teacher generation, training, weight change, match, or live activation. runOp1 is unchanged. Japanese version: [blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.md](./blog-shogi-floodgate-v7-prefix-100-same-lock-one-shot.md)

## 1. Outcome and current position

| Item                 | Local-candidate outcome                                           | Production meaning                                                                               |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| prerequisite         | PR #471 regular-merged                                            | the fresh preflight and disposable kill-drill boundaries are on the default branch               |
| same-lock owner      | source and adversarial tests added                                | a public preflight receipt is not converted into gate authority                                  |
| preflight order      | after acquiring the OS lock and before the first control mutation | a NO-GO starts neither the active lease nor the connector                                        |
| connector            | exactly once from the fixed prefix-100 owner                      | no generic production callback or receipt reuse is introduced                                    |
| postflight           | low-level read-only scan composed inside the fixed runner         | the scan alone is unauthenticated and non-authorizing; only the runner promotes it to continuity |
| production execution | all zero for this candidate                                       | registry provisioning, kill drill, and prefix 100 have not been run                              |
| evaluator            | still runOp1                                                      | this is not evidence of stronger play or high-dan strength                                       |

This candidate is published as ready-for-review PR #472. On the post-review implementation head `da7e9dd`, all 6 reported GitHub checks passed, including 2 / 2 required status checks; all 5 actionable review threads were addressed and zero remain unresolved. The docs-only head that refreshes this article and the [machine-readable evidence](./data/floodgate-v7-prefix-100-same-lock-one-shot-2026-07-16.json) remains separately pending until its own CI rerun completes.

## 2. The prerequisite delivered by PR #471

PR #471 added a fresh zero-work preflight that does not mutate the production namespace and a process-death kill drill isolated from production. Its final local validation passed focused 153 / 153, full 2,680 / 2,680, and production build 193 / 193. Its regular merge commit is `4a14507a5a228cac71c011c94989fa9307f8218a`.

Production observation in that PR was limited to a read-only audit. It returned a sanitized `NO-GO` because the fixed `registry.json` was absent. This candidate does not take that historical receipt as input and has not rerun a production command. It neither recounts the PR #471 read-only audit as a command from this change nor treats the historical `NO-GO` as a current `GO`.

## 3. Why a separate preflight and gate are insufficient

After a public preflight releases its lock, the registry, deployment key, runs namespace, or outer control can change before another process starts the gate. An authentic receipt does not authenticate later filesystem state. The following composition is therefore forbidden:

```text
preflight under lock A -> unlock -> reuse public receipt -> gate under lock B
```

Only the fixed prefix-100 owner acquires the lock once and retains ownership to the end. No public receipt, CLI argument, environment override, or operator-supplied path becomes a gate capability.

## 4. Fixed ordering inside one lock

The successful path has this fixed order:

1. Open the fixed private registry read-only and acquire the common outer OS lock once.
2. Run the fresh prefix-100 preflight through an opaque single-use capability valid only while that lock is held.
3. Accept only the exact frozen null-prototype `GO`, then revalidate the same registry identity and bytes.
4. Freshly reread the deployment key and require exact equality with the initially captured key.
5. Only then prepare the outer control namespace and publish the authenticated active lease.
6. Invoke the fixed prefix-100 runner exactly once with an active-lease-bound single-use connector capability.
7. Have the fixed runner pass its genuine connector final-scan anchor to the low-level read-only exact-100 scan, exactly validate the result, and promote it to continuity.
8. Have the outer owner exactly validate the runner receipt while retaining the same lock, then retire the active lease.
9. Validate the final namespace, close the descriptor, and release the OS lock.

There is no production route that divides preflight, connector, and postflight across separate lock ownership. The existing prefix-500 and final-24000 shapes do not change.

## 5. Preflight before the first mutation and the key-reread repair

Preflight must complete before the first control mutation, including outer-control directory creation or active publication. A NO-GO, malformed receipt, Proxy, accessor, extra field, unclaimed capability, exception, or registry replacement leaves active-lease publication and connector invocation at zero.

The production key is also freshly reread after preflight while the lock remains held, closing a deployment-key replacement race. Its length and bytes are compared in constant time with the first private copy; a mismatch fails closed before mutation. The fresh copy is zeroized after comparison. This reread is not key rotation. It prevents two different keys from being mixed inside one one-shot execution.

## 6. Active lease and exactly-once connector invocation

Passing preflight is not sufficient to call the connector directly. The outer owner durably publishes the existing authenticated active lease and passes the fixed runner a single-use capability bound to the exact gate. An unclaimed capability, double claim, wrong-gate use, or inexact receipt cannot become success.

After connector start, failures do not deny that a checkpoint may have persisted. They require authenticated evidence and checkpoint reconciliation instead of automatic retry or substitution with a fresh run. A success-stdout failure also does not cause another connector invocation.

## 7. What the exact-100 postflight proves

The prefix-100 connector authenticates the V3 stream under the existing HMAC authority and obtains work bytes, SHA-256, and record count from its final scan. The low-level scan accepts a caller-supplied anchor and read-only observes that:

- The runs directory contains only the target stage.
- The stage contains only `work.jsonl`, while the destination and inner authorization lease are absent.
- Runs, stage, and work have exact private modes, belong to the current EUID, and are not symlinks.
- Work is a regular file with link count one, and its held descriptor matches the named path identity, size, mtime, and ctime.
- Reading exactly the anchored bytes finds no unauthenticated tail or torn final record and yields 102 records / 100 completed parents.
- The recomputed SHA-256 matches the caller-supplied anchor and every descriptor closes.

The low-level scan alone claims neither the outer lock, connector origin, anchor authenticity, authenticated continuity, nor gate authority. Only the fixed runner constructs the private anchor from a genuine connector receipt, invokes the scan while the same outer lock is held, exactly validates its observation, and promotes the composition to `authenticated final scan continuity`. The scan does not possess the deployment HMAC key and performs no `independent HMAC authentication`.

The scan performs no operation that writes file content or the namespace, but it does not claim atime invariance from reads. It also does not claim an atomic filesystem snapshot, power-loss durability, or isolation from an arbitrary hostile same-EUID process.

## 8. Failure, cleanup, and receipt boundaries

An extra entry, destination or lease appearance, symlink, hardlink, owner or mode mismatch, rename, same-size rewrite, record-count/digest/final-newline mismatch, or descriptor-close failure stops the runner at `exact-prefix-100-postflight`. Because the connector has completed and a checkpoint may have persisted, the retry disposition is checkpoint reconciliation.

Only the prefix-100 success receipt gains the runner-promoted continuity confirmation. A low-level scan result is neither a production-authenticated receipt nor gate authority. Prefix 500 and final 24000 retain their existing success and failure shapes, and tests pin that neither gate accidentally invokes the prefix-100 scan. Raw anchors, paths, run IDs, digests, filesystem identities, and key material never enter the public receipt.

## 9. Local-candidate validation

The implementation and article are still an integrating local candidate. Independent audit found a P1 overclaim in which a low-level path/anchor API could issue a production-authenticated-looking receipt, a P2 where `throw undefined` could collide with the no-error sentinel, a P2 where `filesystem_mutated: false` could be read as claiming atime invariance, and a P1 ordering overclaim that mistook the registry revision for current application HEAD and blamed a future finalizer merge for the provisioning blocker. The low-level scan is now non-authorizing, error state uses an explicit sentinel, file-content/namespace writes are separated from the atime nonclaim, and ordering uses the historical verifier/artifact ancestry closure. Every focused audit regression passes.

Under exact Node v22.13.0 on the stable source candidate, the focused run passed 179 / 179 tests across 9 files (2.80 seconds wall, 282,869,760-byte maximum RSS, zero swaps), and a default-concurrency full run passed 2,734 / 2,734 tests across 147 files (159.48 seconds wall, 4,307,124,224-byte maximum RSS, zero swaps). The production build generated 193 / 193 pages (40.61 seconds wall, 2,590,867,456-byte maximum RSS, zero swaps); TypeScript, changed-scope ESLint, Prettier, and diff check passed. ML stdlib passed 58 / 58 and `npm audit` reported zero vulnerabilities. The first full run, build, ML, and audit ran four ways in parallel, so their wall times include that simultaneous load.

Two default-concurrency confirmation runs after the evidence update each failed one unrelated suite. The first hit a 30-second stable-WASM worker startup timeout; the second observed a different retry disposition in a stable-proposal-finalization fixture. Immediate isolated reruns passed 53 / 53 and 11 / 11. Neither failed run is authoritative, and the classification remains a nonfinal concurrency-flake candidate rather than presenting the resource-contention hypothesis as proved. The eight-worker full pass of 2,734 / 2,734 across 147 files (150.96 seconds wall, 4,355,293,184-byte maximum RSS, zero swaps) was the exact tree at head `032a324`. Four review-repair files subsequently changed at `da7e9dd`, so that run is not presented as a current-head local full pass.

On `da7e9dd`, the post-review focused run passed 80 / 80 across 5 files, TypeScript and Prettier passed, and ESLint reported zero errors. A local full run on that head reached 2,733 / 2,734, with only the same 30-second stable-WASM startup timeout (170.59 seconds wall, 4,349,165,568-byte maximum RSS, zero swaps); the immediate isolated suite passed 53 / 53. That local full run is not counted as an authoritative success. In an independent GitHub environment on the same `da7e9dd`, Ubuntu unit tests completed 144 passing and 3 Darwin-skipped files, with 2,636 passing and 98 Darwin-skipped tests out of 2,734; ML passed 58 / 58, the build generated 193 / 193 pages, and the Darwin same-lock job passed. All 6 reported checks and both required status checks passed. Current evidence status is `implementation-head-ci-green-evidence-refresh-head-pending`.

The minimum matrix covers one-lock ordering, runner blocking during preflight contention, zero mutation on NO-GO, deployment-key replacement during reread, registry revalidation, single-use claims, postflight namespace/identity/SHA/record/close checks, prefix-500/final non-regression, private-value nondisclosure, aligned twelve-section articles, duplicate JSON keys, privacy, and rejection of stale A/B sizing.

The same-lock owner and real-boundary integration include Darwin-only `runIf` paths, so an Ubuntu full-suite pass must not claim coverage for paths it skips. Required evidence is pinned to the `Run Darwin prefix-100 same-lock one-shot adversarial tests` step on `macos-latest` in `.github/workflows/ci.yml`, which runs `tests/unit/ml/floodgateV7ProductionPrefix100SameLockOneShot.test.ts` and `tests/unit/ml/floodgateV7ProductionPrefix100RealBoundariesIntegration.test.ts` together. That job passed on `da7e9dd` and will run again on the docs-only evidence-refresh head before merge.

## 10. Production execution and nonclaims for this change

This same-lock local candidate has run zero new production commands. Production registry provisioning, the reviewed kill drill, prefix 100, prefix 500, final 24000, teacher generation, training, selection, candidate weights, formal A/B, external calibration, live activation, and rollback activation are all zero. It has neither read nor mutated the production namespace.

That does not erase the historical read-only audit recorded by PR #471. It means action classes and change scopes remain separate and local source/test execution is not counted as a production gate. No game, row, position, label, or private registry value appears in this article.

## 11. Do not provision before compatible verifier closure or start the real gate before the finalizer

The current `FLOODGATE_V7_PRODUCTION_CONNECTOR_VERIFIER_REVISION` is fixed to historical revision `b086243781396e2c197cc9e1cfab1fc6b773ae2a`, not the current merged application HEAD. The pinned role-bundle verifier used by the production training consumer requires the fixed repository's clean HEAD to equal `verifier_revision` exactly. It also requires the producer of the byte-pinned result-verifier receipt and evidence to be an ancestor of the selected verifier revision. Those receipt and evidence files first appeared at producer revision `0f3cadb76ec46eb82d5bc9623277525ce1d2252b`.

`b086243` predates `0f3cadb`, lacks the required receipt and evidence files, and does not descend from `0f3cadb`. Provisioning the create-only registry with the current configuration would therefore pin it to a `verifier_revision` that cannot satisfy the clean-HEAD requirement and the required artifact/producer-ancestry closure at the same time. A future finalizer merge changing the application HEAD is not the reason for this blocker.

Independent registry audit confirmed `e8a9197608cb48b1160b6707d97b0c4f78f90a1d` as an evidence-backed viable candidate. `0f3cadb` is its ancestor, it contains the required artifacts, and both the accepted and confirmation production full-verifier runs exited zero from clean detached worktrees. The provisioner still pins `b086243`, however, so a separate repair PR must bind `e8a9197` as the reviewed compatible closure and fail closed on source/artifact/ancestry closure before entropy acquisition or installation.

The authenticated finalizer that converts the 24,000 work set into training labels must also be implemented, reviewed, and regular-merged before the real gate starts, as an operational-completeness requirement. It is not required to make `verifier_revision` equal the application HEAD.

The safe planned order is therefore:

1. Complete final validation and review of the same-lock one-shot candidate, then regular-merge it.
2. Implement, review, and regular-merge a separate repair PR for the `e8a9197` candidate binding and fail-before-install closure check.
3. Implement and review the authenticated training-label finalizer in a separate PR, then regular-merge it before the real gate starts.
4. Only after both prerequisites are confirmed, provision the create-only registry once, bound to the compatible closure, and complete its postflight.
5. Run the reviewed disposable kill drill and inspect its evidence.
6. Run prefix 100 once and stop at the exact-100 evidence boundary.

Overwriting, adopting, or rotating an existing registry is not an acceptable shortcut.

Live weights remain unchanged until the required evidence exists.

## 12. Strength target and next decisions

runOp1 remains both the production evaluator and rollback. This change closes an execution-safety boundary; it produces no label, optimizer step, candidate, game, Elo, or rank evidence. It therefore cannot yet claim stronger play or stable high-dan strength.

After independent review of the prefix-100 evidence, the pipeline advances through 500, 24,000 finalization, warm-only QAT seeds, selection and sealed holdout, and candidate selection. The canonical formal A/B size is **192 color-swapped pairs / 384 games**. Only after passing the safety, quality, and playing-strength gates against runOp1, external 200-game calibration, and staged 0% live gate / rollback rehearsal can a live change be considered.
