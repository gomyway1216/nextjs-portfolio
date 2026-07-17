# Isolating a fixed production recovery-operator entry as STOP-only — Floodgate v7

> Safely handling the partial prefix-100 checkpoint first requires a fixed origin, native-launch proof, exact-clean-source proof, and a purpose-limited capability separate from the normal application. This candidate implements only that entry boundary and accesses no production state. Its sole executable purpose is `inspect-stale-prefix-100`, but the current entrypoint always returns `NOT-YET-IMPLEMENTED / STOP` with exit 78. It does not yet implement an inspector, reconciliation, retry, cleanup, quarantine, or resumption. Production weights and live activation are unchanged. Japanese version: [blog-shogi-floodgate-v7-production-recovery-operator-foundation.md](./blog-shogi-floodgate-v7-production-recovery-operator-foundation.md)

## 1. Result

This is not a change that performs recovery. Before approaching production incident state, it creates a fail-closed foundation that limits who can start the operator, from which fixed source, and for which single purpose.

| Decision subject                       | Established result                                                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| diagnostic-projection prerequisite     | [PR #484](https://github.com/gomyway1216/nextjs-portfolio/pull/484), regular merge `1c5ec24a8c3a9ad9871bef1621034113112396b5` |
| safe-failure-kind prerequisite         | [PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485), regular merge `4b46fd3761512f38bada4c7c23537a969349a804` |
| foundation implementation              | `dfa295d6bb505652ec4fa39fe9fc71c6205b3834`                                                                                    |
| initial `main` integration             | regular merge `3a12802acc0a538d22a92b76f7e02669fde61ea3`                                                                      |
| latest integrated `main` revision      | `4b46fd3761512f38bada4c7c23537a969349a804`                                                                                    |
| allowed purpose                        | only `inspect-stale-prefix-100`                                                                                               |
| implemented stage                      | only `stop-entry`                                                                                                             |
| CLI status / decision                  | `NOT-YET-IMPLEMENTED` / **STOP**                                                                                              |
| process exit                           | 78                                                                                                                            |
| production-state inspections           | 0                                                                                                                             |
| registry / lease / stage / work access | 0 / 0 / 0 / 0                                                                                                                 |
| persistent mutations                   | 0                                                                                                                             |
| live-weight / activation changes       | 0 / 0                                                                                                                         |

The authenticated stale active lease and four complete records documented in the [first prefix-100 stop article](./blog-shogi-floodgate-v7-prefix-100-first-attempt-stop.en.md) remain preserved evidence. This foundation has not read them and has not rerun that article's read-only audit.

#485 regularly merged code that preserves only an allowlisted `failure_kind` and required `timeout_ms` from the first branded, frozen worker failure through pool-wide poison. The same twelve-candidate read-only reproduction and use against the production incident state both remain zero. The source foundation does not treat this new code availability as a production observation.

## 2. Why isolate the entry first

The prefix-100 incident cannot be retried automatically or cleaned up manually without rechecking the outer lease, inner stage, and checkpoint under one consistent authority. Connecting the inspector first, however, would let a source mix-up or reuse of a normal-application capability lead directly to production access.

This change therefore separates two stages:

1. This candidate creates a fixed entry, launch proof, source proof, and STOP-only capability without importing production data.
2. A later, separate review unit will implement the read-only inspector, followed by another gate for reconciliation authority.

The foundation source root has a fixed suffix distinct from the normal production-application checkout. There is no interface through which a caller selects a path, revision, purpose, entrypoint, or runtime option. It also does not share the normal application's capability registry.

## 3. Fixed launch and source closure

The native helper launches fixed Node v22.13.0 from Darwin JXA and uses standard input as a private one-shot attestation pipe, not operator input. The child checks the nonce, parent process identifier, helper, purpose, entrypoint, and `osascript` parent command, and rejects replay.

Source authorization accepts only the clean revision of the fixed checkout and verifies these nine paths as its tracked closure.

| Closure class   | Fixed target                                                      |
| --------------- | ----------------------------------------------------------------- |
| project binding | `package.json`, `package-lock.json`, and `tsconfig.json`          |
| native launch   | production JXA helper and attestation module                      |
| operator entry  | STOP-only entrypoint, source authorization, and source provenance |
| Git verifier    | fixed Git helper                                                  |

It also checks required-path agreement across HEAD, index, and ordinary files; real paths; absence of symlinks and hardlinks; and absence of group/other write access. Git object directories, common object directories, `info/alternates`, and environment alternates are rejected when they escape the fixed boundary. The entrypoint's working directory, arguments, main module, and loader options must also match an exact tuple before a capability can be issued.

## 4. Boundary guaranteed by the STOP receipt

Even when source authorization succeeds, the current entrypoint can return only this fixed contract.

| Field                              | Value                                                         |
| ---------------------------------- | ------------------------------------------------------------- |
| `contract`                         | `shogi-floodgate-v7-production-recovery-operator-cli-stop-v1` |
| `status`                           | `NOT-YET-IMPLEMENTED`                                         |
| `decision`                         | `STOP`                                                        |
| `purpose`                          | `inspect-stale-prefix-100`                                    |
| `source_authorized`                | authorization result only                                     |
| state-access flags                 | all `false`                                                   |
| mutation / live / disclosure flags | all `false`                                                   |

Authorization failure does not fall back to production. The entrypoint attempts a STOP receipt with `source_authorized = false` while preserving the nonzero exit. Exit 78 remains authoritative even if stderr is unavailable.

The entrypoint does not import the production registry, lease, stage, work, or deployment key. “Correct source” must therefore never be reinterpreted as “incident state inspected,” “cleanup authorized,” or “resumption authorized.”

## 5. Validation

The foundation's focused suite passed 49 / 49 tests. After integration with the latest `main`, including the #484 connector regressions, the combined focused run passed 77 / 77. The real-Darwin JXA integration exercises the native `integerValue` branch with actual Foundation `NSNumber` values and values coercible to numbers.

| Validation                                 | Result        |
| ------------------------------------------ | ------------- |
| foundation unit and source-hardening tests | PASS, 49 / 49 |
| post-`main` focused regression             | PASS, 77 / 77 |
| TypeScript typecheck                       | PASS          |
| changed-file ESLint                        | PASS          |
| TypeScript / JSON / JXA formatting         | PASS          |
| production and fixture JXA compile         | PASS          |
| Git diff whitespace check                  | PASS          |
| public-artifact privacy scan               | PASS          |

Tests cover fail-closed rejection of a wrong root, arguments, loader, or runtime; replayed attestation; symlinks and hardlinks; dirty tracked source; alternate object stores; proxy arguments; and module-loading bypass patterns. These passes are evidence for the source-entry boundary, not evidence that a production inspector is correct or that recovery is safe.

## 6. Work not performed

| Operation                                     | Count / state |
| --------------------------------------------- | ------------: |
| production-operator invocation                |             0 |
| production-state inspection                   |             0 |
| registry / lease / stage / work access        | 0 / 0 / 0 / 0 |
| deployment-key access                         |             0 |
| retry / cleanup / quarantine / resume         | 0 / 0 / 0 / 0 |
| merged failure-kind production rerun          |             0 |
| 4 / 6 / 8 / 12-worker benchmark               |             0 |
| teacher generation / label finalization       |         0 / 0 |
| retraining / optimizer step                   |         0 / 0 |
| candidate selection / promotion               |         0 / 0 |
| formal A/B / external calibration             |         0 / 0 |
| production-weight overwrite / live activation |         0 / 0 |

This change therefore has not altered playing strength. It creates no claim that the evaluator became stronger or reached high-dan strength.

## 7. Safe next order

1. Pass the foundation candidate through final-head CI, independent review, and a regular merge.
2. Deliver that regularly merged revision to the dedicated fixed recovery checkout and pin clean tracked source, but do not run the STOP-only entrypoint as if it were production inspection.
3. Rerun the same twelve candidates read-only on regularly merged [PR #485](https://github.com/gomyway1216/nextjs-portfolio/pull/485). Capture the first safe worker-failure kind and timeout without publishing stderr, process identifiers, positions, or parent identifiers.
4. Compare 4, 6, 8, and 12 workers on the same read-only input and establish the cause of the timeout boundary and tail latency.
5. In a PR separate from the foundation, implement a zero-argument read-only inspector that authenticates the production registry, lease, stage, and checkpoint in one process. Return only sanitized counts and fixed classifications.
6. After the inspector passes final-head CI, independent review, and a regular merge, perform exactly one read-only inspection from that fixed merged revision. Any mismatch, authentication failure, or indeterminate result means STOP.
7. Only if fresh evidence matches, separately review a reconciliation flow in which a human chooses either resumption or quarantine followed by a separately authorized fresh restart. Never select automatically.
8. Even if exact-100 succeeds, stop once, then advance to 500, final-24,000, teacher finalization, retraining, candidate selection, formal A/B, and external calibration only after approval.
9. Consider live activation only after safety, quality, playing-strength, and rollback evidence all pass.

## 8. Current decision

#484 regularly merged the corrected sanitized-outer-phase projection and #485 the safe worker-failure-kind propagation. Neither has been used against the production incident state, and the same twelve candidates remain unrun. This candidate creates the fixed entry needed for a future read-only inspector, but it is deliberately **STOP-only**.

The production decision therefore remains **STOP**. The [machine-readable evidence](./data/floodgate-v7-production-recovery-operator-foundation-2026-07-17.json) separates evidence for the source foundation from unimplemented and unexecuted production operations and playing-strength nonclaims.
