# The route from an approved key to the 100, 500, and 24,000-position production gates is now fixed—but it will not run yet — Floodgate v7

> PR #468 was integrated with a regular merge commit. After that merge, a human reviewed the candidate in the private native UI, typed back the full displayed SHA-256, and completed fresh post-approval inspection, create-only approved-key enrollment, stored-record postflight, and fresh current-key binding. An independent current-binding preflight also succeeded. This change connects that approved record to a private immutable run registry and three argumentless production runners dedicated to 100, 500, and 24,000 parent positions. Safety review found one blocker before any real gate can run: if a long-running gate is forcibly terminated, the current empty stage-authorization lease cannot be distinguished safely from a live process or a replacement directory. A separate PR must first add authenticated lease metadata and an OS-backed lifetime lock. This change therefore has not provisioned the registry or invoked a real gate. The current observation finds no production registry and no running gate process. Teacher labels, training, candidate weights, live activation, and strength evidence from this change remain zero, and production still uses runOp1. Japanese version: [blog-shogi-floodgate-v7-production-connector-runner.md](./blog-shogi-floodgate-v7-production-connector-runner.md)

## 1. Result

| Item                                          | Current result                                                        | Meaning                                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| PR #468                                       | 6 checks passed, 0 unresolved review threads, regular merge completed | The private human-review and enrollment path is on the default branch                                                     |
| Production human review                       | Succeeded                                                             | The UI displayed exact canonical JSONL with its terminal LF, and the human typed back the full lowercase SHA-256          |
| Approved-key enrollment                       | Create-only installation and exact loaded-record postflight succeeded | No existing record was overwritten, adopted, or rotated                                                                   |
| Current-key binding                           | Both workflow postflight and independent preflight succeeded          | The approved record exactly matched a freshly inspected current key                                                       |
| Immutable run registry                        | Implemented and tested; not installed in production                   | It will store a private run ID, approved-key binding, and fixed configuration once                                        |
| Registry provisioner                          | Argumentless, implemented, and tested; not run in production          | It makes current binding, installation, and exact private postflight one fail-closed operation                            |
| Production runner                             | Three fixed entry points for 100, 500, and 24,000                     | Operators cannot supply a generic gate, run ID, path, or digest                                                           |
| Runtime                                       | Exact Node `v22.13.0`; all three gates use `caffeinate -dimsu`        | Runtime drift is rejected and ordinary macOS idle sleep is inhibited                                                      |
| Focused validation                            | 6 files, 107 / 107 passed                                             | Registry, installer, provisioner, runner, and both CLI layers were tested                                                 |
| Broader Floodgate v7 validation               | 26 files, 679 / 679 passed                                            | The related key, checkpoint, connector, and runtime scope was revalidated                                                 |
| Full validation / production build            | 136 files, 2,543 / 2,543 passed / build passed                        | The full repository unit suite and Next.js production build were verified                                                 |
| Actual temporary-home E2E                     | Passed                                                                | Real serialization, installation, loading, single-use claim, and provisioner postflight were composed in an isolated home |
| Stale lease                                   | **Unresolved pre-gate blocker**                                       | The empty lease has neither a persistent run binding nor a liveness lock, so automatic reconciliation is unsafe           |
| Current registry / this-change gate runs      | Absent / 0                                                            | Current state was freshly observed; this change stays unexecuted until the blocker PR is merged                           |
| Labels / training / weights / live / strength | 0 / 0 / 0 / 0 / 0                                                     | Neither the evaluation function nor measured playing strength has changed                                                 |

## 2. What succeeded in production after PR #468

The implementation in PR #468 did not itself claim that production approval had succeeded. After the regular merge, the operator inspected the exact candidate through the fixed private native UI and typed back the complete displayed lowercase SHA-256 before approving it. The workflow then inspected the candidate again and called the create-only installer only if the fresh bytes still matched the reviewed bytes. It subsequently claimed the stored record exactly and performed a fresh current-key binding postflight.

The two publishable sanitized outcomes are:

- Private workflow: `private-human-reviewed-candidate-create-only-installed-postflight-and-current-binding-validated`
- Independent binding preflight: `approved-record-exactly-matches-fresh-current-key`

The candidate JSON, candidate and record digests, approval identifiers, key-instance identity, local account information, absolute paths, filesystem identity, and key material are deliberately absent from this article and its machine-readable evidence. These successes issue no run or gate authority. They establish only the prerequisite that a separately human-approved record freshly matches the current key.

## 3. Why runtime values belong in a private immutable registry

The production connector must use one coherent set of values across all three gates: the run binding, approved-record binding, fixed verifier revision, repository and dataset namespaces, legacy exclusion input, teacher engine and evaluation assets, and stage and destination namespaces. Reconstructing these values from shell arguments or environment variables for every invocation could mix different runs or revisions between 100, 500, and 24,000, while also leaving private values in command history.

The registry record fixes:

- A private run ID generated from 32 bytes of cryptographically secure randomness.
- A private binding to the approved record's byte length, digest, and key-instance identity.
- One pinned verifier revision.
- Repository, raw lock, role lock, role bundle, legacy exclusion, and production teacher-asset namespaces derived from the current user's home under fixed rules.
- An empty engine-argument list.
- Stage, destination, and publication names derived from the same run ID.

This article records the rules, not the actual run ID, binding values, or local locations. The registry root and runs directory must have exact `0700` modes. The record must be a regular, single-link `0600` file. The loader walks the fixed current-user home without following links and revalidates held descriptors. It derives the stage-authorization and training-row consumer options inside private capability state, and only a successful single-use claim releases them to the same process.

## 4. Create-only installer and argumentless provisioner

The installer does not send an operator-supplied object directly to `JSON.stringify`. It first captures and validates the exact key set, own data descriptors, primitives, paths, revision, and engine arguments, then constructs a new canonical record. It writes canonical JSONL to a `0600` staging file, syncs and reads it back, publishes the final name with a no-clobber hard link, syncs the directory, removes the staging name, syncs the directory again, and reopens the final record to revalidate identity and canonical bytes. It never overwrites or adopts an existing final record, and it never deletes a competing staging name.

The provisioner has one fixed sequence:

1. Exactly validate the sanitized receipt asserting that the approved record freshly matches the current key.
2. Freshly load and claim the approved enrollment capability.
3. Generate the run ID from 32 bytes of secure randomness and zeroize the entropy buffer.
4. Build the fixed configuration from the current-user home and pinned revision.
5. Invoke the create-only installer exactly once.
6. Freshly load and claim the registry, then compare the run binding and complete configuration in private memory.
7. Return a newly constructed fixed success receipt containing no path, run ID, digest, or filesystem identity.

The production CLI stops before lazily loading the production module if it receives any argument or if the runtime is not exactly Node `v22.13.0`. Typed failures are also rebuilt from allowlisted phase, durability, creation-possibility, and retry fields rather than forwarding raw objects. Unknown failures, or serialization and output failures after apparent success, conservatively assume that the registry may already exist and require reconciliation instead of a fresh retry.

## 5. Why the production interface has no generic gate argument

There is no generic production gate operation. The three callable production gate entry points are fixed to:

- `durable-prefix-100`
- `durable-prefix-500`
- `sealed-final-24000`

For each gate, the runner loads and claims the registry, loads and claims the approved enrollment, compares the registry's approved-record binding, validates a fresh current-binding receipt, obtains a separate fresh enrollment for the connector, and invokes the production checkpoint connector exactly once.

The current-binding success is not accepted from a partial object. The runner now requires the exact official contract, status, claim and execution boundaries, algorithm, all six verification fields, and the complete all-false nonclaim set. Proxy-backed, accessor-backed, extra-field, partial, and test-boundary receipts fail closed. The approved binding is likewise captured only from own data descriptors.

For the connector result, the runner does **not** claim byte-for-byte exactness over every field of the entire raw receipt. It strictly validates the security-critical production and semantic fields: production rather than test execution, connector and checkpoint contracts, the fixed gate target, completion count, seal state, holdout meaning, and required nonclaims. It then constructs a small fixed public receipt and never returns the raw connector receipt, private registry values, or approved binding.

The three CLIs take no gate configuration from arguments, standard input, or environment variables, and reject any non-pinned Node runtime. The long-running npm gate scripts are wrapped with `/usr/bin/caffeinate -dimsu`. This inhibits ordinary sleep; it is not recovery from `SIGKILL`, `SIGTERM`, a kernel failure, battery exhaustion, or power loss.

## 6. Findings fixed during review

The initial implementation was not treated as safe by assertion. Independent review and adversarial tests found and fixed these boundaries before production invocation:

| Finding                                                           | Risk                                                                                   | Fix                                                                                                                    |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Operator-object `toJSON` or coercion                              | Serialization could execute code or swap values before validation                      | Capture exact own-data primitives first, validate them, and serialize a newly built record                             |
| Claims, receipts, or failures containing Proxy objects or getters | Property access could leak a canary or secret, or cause side effects during validation | Reject Proxy and accessor inputs and read only own data descriptors                                                    |
| Forwarding a fulfilled success receipt                            | Extra forged fields or private values could be copied to output                        | Validate the required contract, status, boundary, verification, and nonclaims, then build a fixed public projection    |
| Copying typed error fields                                        | Forged phase or retry strings could contain secrets                                    | Enforce enum allowlists and cross-field durability consistency; otherwise emit a conservative unknown failure          |
| Building sensitive records as ordinary objects                    | Prototype-derived fields or coercion remained possible                                 | Rebuild sensitive captures and public projections as frozen null-prototype records                                     |
| Accepting a malformed fulfilled current-binding receipt           | An empty or partial resolved object could be mistaken for binding success              | Validate the full official receipt shape, both boundaries, algorithm, six verification fields, and all-false nonclaims |
| Accepting a test or partial connector receipt as production       | A test boundary or older incomplete result could be mistaken for production success    | Pin the production boundary, null test boundary, connector and checkpoint contracts, holdout meaning, and nonclaims    |
| Contradictory typed retry metadata                                | A possibly persistent failure could be labeled safe for a fresh retry                  | Enforce an own-data, cross-field consistency matrix and fall back to checkpoint reconciliation                         |

These findings were fixed before this change created a production registry or invoked a gate. They do not improve playing strength, but they prevent a roughly half-day run from starting under the wrong authority or with a receipt that can disclose private state.

## 7. 107 focused tests, 679 broader tests, and an actual temporary-home E2E

Under Node `v22.13.0`, all 107 focused tests across six files passed. The broader rerun also passed all 679 tests across 26 Floodgate v7 files (Vitest 148.62 seconds; wall 149.13 seconds). The full repository run passed 2,543 / 2,543 tests across 136 files in 160.97 seconds, and the Next.js production build completed in 28.37 seconds. The build emitted existing diagnostics for the Firebase build-phase guard and a dynamic route, but its exit status was successful. The tests cover:

- Canonical registry serialization; rejection of `toJSON`, Proxy, accessor, reordered, extra, and invalid records.
- Private owner, mode, link-count, symlink, held-directory replacement, and single-use-claim checks.
- Staged sync, hard-link no-clobber, directory sync, reopen validation, every installer failpoint, and preservation of an existing final or competing staging name.
- Provisioner current binding, enrollment, entropy zeroization, fixed configuration, installer durability, postflight mismatch, and production/test boundaries.
- All three runner gates; binding mismatch; extra, accessor, Proxy, nonclaim, and test-boundary current-binding receipts; typed, forged, and unknown connector failures; critical connector-receipt mismatch; and non-disclosure of private values.
- Provisioner and gate CLI argument checks before lazy loading, exact Node fail-closed behavior, listener cleanup, success and failure projection, and output-stream failure.

The temporary-home E2E is not a test that merely stubs an installer receipt. In a private isolated home with exact `0700` mode and a test boundary separated from production, the actual provisioner core drives the actual canonical serializer, create-only installer, private loader, and single-use claim through the exact private-claim postflight. The isolation guard reads production-home root metadata, but the test uses real filesystem semantics without modifying the production home or accessing the production registry namespace.

The [machine-readable evidence](./data/floodgate-v7-production-connector-runner-2026-07-15.json) separately records 107 / 107 focused tests, 679 / 679 broader tests, 2,543 / 2,543 full tests, the production build, the temporary-home E2E, production counters, privacy exclusions, and the stale-lease blocker.

## 8. Why execution stopped before the real gates: an empty lease cannot be reconciled safely

The stage authorizer prevents two processes from using the same stage concurrently by creating an empty current-user-owned `0700` authorization-lease directory beside it and holding its descriptor for the authorization or publication lifetime. On a normal exit it revalidates identity and removes the lease. If the process disappears after a forced termination, kernel failure, or power loss, however, only the empty directory remains. The next authorization preserves it and stops because it cannot tell whether the owner is live or stale.

Blind deletion is unsafe. The current persistent state contains no authenticated run binding, original lease identity, nonce, or OS lock held by the owner. A same-user replacement directory is therefore indistinguishable from the original stopped lease using published state alone. PID inspection, open-file observation, age, or repeated snapshots do not eliminate PID reuse and observation races and cannot prove that a live process will never be disrupted.

The separate PR must add at least:

1. Create-only lease metadata binding the run, registry, gate, parent, stage and lease identities, current user, random nonce, boot session, and process identity.
2. An HMAC over that metadata under a separate deployment-key domain, binding it to the original lease object.
3. An OS-backed advisory lock held continuously for the owner's lifetime and released when the parent dies; process IDs remain secondary evidence.
4. Two-phase inspect and manual confirmation, with fresh registry, current binding, checkpoint authentication, held-descriptor, and destination-absence checks in both phases.
5. An exclusive rename of the exact source into a unique quarantine followed by parent-directory sync, without automatically deleting the original lease object.
6. Fail-closed treatment of legacy empty leases that have no metadata.

This blocker does not mean that this change created a stale production lease. This change has not run a real gate or left a production lease. It is a recovery gap found before starting a long production run. Until the separate PR is merged and its reconciliation tests pass, the registry provisioner, prefix 100, prefix 500, and final 24,000 remain on operational hold. That hold is not a runtime interlock added by this PR.

## 9. Residual P2 limitations and explicit nonclaims

Review also recorded lower-severity limitations that do not justify production execution. The low-level create-only installer is an exported in-process primitive and relies on the current-user JavaScript trust boundary; the fixed argumentless provisioner remains its only intended production caller. The test suite does not claim a full real 500-to-24,000 production connector run or real torn-tail recovery. An outer gate-lifetime lock, authenticated lease recovery, and signal/owner handoff belong in the blocking follow-up PR. These are design and coverage limits, not evidence of labels or strength.

The fresh current observation finds no production registry and no running gate process, and this change has invoked none of the three gates. This work does not claim a checkpoint, dataset read, teacher request or label, optimizer step, training run, candidate weight, live evaluator activation, formal match, Elo, rank, or stable high-dan strength. It also does not claim that every noncritical field of a raw connector receipt was checked exactly.

## 10. Playing strength has not changed

The production successes in scope end at human-approved key enrollment and fresh current binding. Because this change created no production registry and ran no connector gate, real parent records, teacher processes, labels, checkpoints, optimizer steps, training runs, candidate weights, formal A/B games, live activation, and external rank observations from this change all remain zero.

The existing evaluator was not overwritten with a candidate. Production and rollback still point to runOp1. The required sequence is: merge the authenticated lease-metadata, lifetime-lock, and manual-quarantine PR with a regular merge commit; provision the registry; run and inspect 100; run and inspect 500; then run 24,000. Even after that, the project must complete checkpoint finalization, QAT and selection, sealed-holdout evaluation, sufficient paired A/B games against runOp1, staged live rollout, and external rank calibration before claiming stable high-dan strength.
