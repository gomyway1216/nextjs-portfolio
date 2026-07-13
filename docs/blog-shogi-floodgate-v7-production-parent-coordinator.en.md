# Sending one parent through the v7 production runtimes

> The preceding [production runtime owner](./blog-shogi-floodgate-v7-production-runtime-owner.en.md) initialized the fixed stable and teacher production factories concurrently and placed both failure cleanup and orderly shutdown under one deadline-bounded lifecycle. Its public surface was intentionally limited to `receipt`, `close`, and `abortAndDrain`, however, so it could not run even one parent. This change adds a production parent-coordinator boundary that hands off the exact runtimes held by that owner without inferring them from a copied receipt, then composes stable proposal, teacher MultiPV, candidate union, independent rescoring, and the completed-parent projection for one parent. It is not a real-dataset read, teacher-label, checkpoint, training, weight, live evaluation-function / weight activation, match, or playing-strength result. Japanese version: [blog-shogi-floodgate-v7-production-parent-coordinator.md](./blog-shogi-floodgate-v7-production-parent-coordinator.md)

---

## Current boundary

| Item                    | Current implementation and validation                                                                                                     | What this change can establish                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Owner handoff           | Converts the exact owner into a flat operation capability through a module-private single-use claim                                       | Raw runtimes are not exposed, and another object carrying copied receipt digests is not accepted                 |
| One-parent operation    | Stable proposal, teacher proposal, candidate union, independent rescore of every candidate, completed-parent projection                   | One parent's operation graph can be connected to the production runtimes                                         |
| Coordinator surface     | Frozen null-prototype object with exactly five keys: `receipt`, `run_binding`, `produce(request)`, `close()`, and `abortAndDrain()`       | Closes the operation capabilities that a later stage must project into the checkpoint's exact two-key controller |
| v2 run binding          | The coordinator builds it from the fixed plan / producer control and the owner's runtime digests                                          | Callers cannot inject different timeouts or runtime identities                                                   |
| Deadline / cancellation | Carries the per-parent `AbortSignal` and v2 producer-control policy into the operation                                                    | No new search or result assembly starts after terminal observation                                               |
| Cleanup                 | Uses the owner's `abortAndDrain()` on operation failure and keeps orderly completion under the owner lifecycle                            | Stable-worker and teacher-process cleanup do not split into independent caller decisions                         |
| I/O authority           | Holds no `node:fs`, dataset path, checkpoint path, or root key, and rejects extra I/O-shaped test-dependency keys before a factory starts | Gains no data, key, or persistence authority beyond parent operations                                            |
| Trust boundary          | `trusted-current-process-js-realm-and-imported-structural-validator-intrinsics-v1`                                                        | Trusts the process / realm and imported structural validators; it is not a sandbox or attestation                |
| Checkpoint / key        | Not connected                                                                                                                             | Parent input origin, a durable HMAC record, and an official run are not authenticated yet                        |
| Execution evidence      | Measured 30 / 30 synthetic / injected focused tests and 169 / 169 related tests across five files under Node v22.13.0                     | This is not evidence that production assets or a real Floodgate parent completed a search                        |
| Live activation         | Zero evaluation-function / weight activations                                                                                             | Separate from application-code merge / deployment; this receipt carries no code-deployment proof                 |
| Playing strength        | Zero games, Elo measurements, or rank measurements                                                                                        | The change makes zero claim of improvement or stable high-dan strength                                           |

## 1. Why the runtime owner was not enough

The runtime owner starts both production runtime types concurrently, reclaims every known runtime even when either initialization fails, and joins every caller to the first valid lifecycle transition. The owner itself exposes no parent operation. That was the correct stopping boundary in the previous change: exposing operations at the same time would have mixed digest authority, cleanup ownership, parent authentication, and checkpoint authorization.

The next requirement is not an adapter that sees an owner receipt and reconstructs runtimes with the same shape. It is a handoff that gives a narrowly scoped coordinator the **exact runtime objects** currently held by the owner created by the production factories. This keeps four responsibilities separate:

- the owner controls runtime origin, receipt digests, and close / abort lifecycle;
- the parent coordinator controls one parent's proposal / rescore ordering and result assembly;
- the next key-authority stage controls the run ID and HMAC key;
- the checkpoint controls input order, resume, durability, and first-terminal cancellation.

This PR closes the second responsibility. It does not claim that the key and checkpoint are complete too.

## 2. Exact owner handoff

The basic rule is that a plain receipt is not authority. Even matching `stable_runtime_receipt_sha256` and `teacher_usi_runtime_receipt_sha256` values do not prove the origin of runtime objects. The production path consumes the exact owner identity through `claimFloodgateV7ProductionRuntimeOwnerForParentCoordinator(...)` and gives the coordinator only a flat `FloodgateV7ProductionRuntimeOwnerParentCoordinatorHandoff`, without exposing raw runtimes. Tests use a separate registry and `claimFloodgateV7ProductionRuntimeOwnerForParentCoordinatorCoreForTests(...)`, which grants no production origin.

```text
receipt
stablePropose(parent)
teacherReceipt
teacherPropose(sfen, legalMoveCount)
teacherRescore(sfen, move)
close()
abortAndDrain()
```

The coordinator remains inside the same owner lifecycle after this handoff. No runtime class, pool, worker, or engine path is returned to the caller.

Production and test handoffs live in separate module-private `WeakMap` registries. A claim looks up only an exact non-Proxy owner facade, rejects a Proxy without triggering its traps, and deletes the entry **before** capturing operations. The same owner therefore cannot be claimed twice, crossed between production and test boundaries, or repaired and retried after a malformed test runtime. Stable `propose` must be an own arity-1 function, teacher `propose` / `rescore` must be own arity-2 functions, and the teacher receipt must be an own object data property. The returned handoff is a frozen null-prototype object with exactly seven keys.

The implementation fixes the following details:

- the production entry point accepts no dependency injection;
- a copied owner receipt, Proxy, or same-shaped object is not accepted as handoff authority;
- the stable and teacher runtimes cannot be mixed across owners or initialization runs;
- a claimed owner is not handed to a second coordinator;
- operation failure is recovered through the owner's shared `abortAndDrain()`, not by closing runtimes independently;
- orderly completion does not bypass the owner's first-call-wins lifecycle.

The coordinator receipt also keeps exact production and test literals separate.

| Receipt field        | Production                                                                         | Injected test                                                                    |
| -------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `contract`           | `shogi-floodgate-v7-production-parent-coordinator-v1`                              | Same contract                                                                    |
| `status`             | `initialized-exact-production-owner-parent-operation-coordinator`                  | `initialized-injected-test-parent-operation-coordinator-not-production-evidence` |
| `trust_boundary`     | `trusted-current-process-js-realm-and-imported-structural-validator-intrinsics-v1` | Same trust boundary                                                              |
| `execution_boundary` | `production-exact-runtime-owner-single-use-handoff`                                | `test-only-injected-runtime-owner-single-use-handoff`                            |
| `test_boundary`      | `null`                                                                             | `{ production_factory_execution: false, production_runtime_origin: false }`      |

The production `claim_boundary` is `exact-single-use-production-owner-handoff-direct-stable-teacher-parent-operations-v2-run-binding-and-deadline-bounded-owner-cleanup-not-checkpoint-key-label-training-weight-live-or-playing-strength-evidence`. The test boundary is separately fixed as `injected-owner-parent-operation-composition-not-production-origin-checkpoint-key-label-training-weight-live-or-playing-strength-evidence`. The receipt additionally fixes `exact_owner_facade_claimed_once: true`, `raw_runtime_facades_exposed: false`, `stable_then_teacher_then_union_then_rescore: true`, `candidate_order: "utf8-bytewise-ascending-v1"`, and `completed_parent_core_reverified_before_return: true`.

The `trust_boundary` is not a claim of safety against arbitrary hostile code in the same process. The module captures selected current-realm intrinsics at evaluation so an operation does not return to later-poisoned live `Promise`, `Set`, timer, or `Object.freeze` bindings. Accepted runtime-operation Promises and the internal workflow / lifecycle mirror are pinned to a captured constructor and `then`; public Promises returned to the checkpoint contract deliberately remain exact native values with zero own keys, and their consumption belongs to the checkpoint's trusted current-realm boundary. The module still trusts the current process / JavaScript realm, Node intrinsics, and the imported candidate-union, completed-parent, and SFEN / legality validators. It provides no OS sandbox, process isolation, remote attestation, pre-import-compromise defense, or production-input authentication.

The production receipt has a `null` `test_boundary`. Only the injected core carries `production_factory_execution: false` and `production_runtime_origin: false`. Passing a production-shaped operation in tests therefore proves neither execution of the production factory nor production runtime origin. The eleven nonclaims shared by production and test receipts are all `false`: `checkpoint`, `key_authority`, `input_authentication`, `dataset_read`, `teacher_label`, `training`, `selection_or_holdout_access`, `weight`, `live_evaluation_activation`, `match`, and `playing_strength`.

## 3. The one-parent pipeline

The one-parent operation keeps candidate-set construction separate from teacher-score semantics.

“One parent” does not mean that the entire coordinator terminates after one item. One `produce(request)` call handles exactly one parent, while the future checkpoint may manage a rolling window of up to 12 calls. The coordinator never merges multiple parents into one batch result.

1. Before the first `await`, capture the exact three keys `{ input_index, parent, signal }` in the same shape a future authenticated checkpoint will pass. Require a nonnegative safe-integer index, exactly seven parent keys, each of the five strings to contain 1–4,096 code units, and a current-realm non-Proxy `AbortSignal`, then rederive rules-complete legal moves.
2. Ask the fixed production stable WASM runtime for the move selected by the current runOp1 evaluator.
3. When at least two legal moves exist, ask the fixed production teacher runtime for a depth-16 proposal with MultiPV up to 12.
4. Call `buildFloodgateV7CandidateUnionForProductionParentCoordinator(...)` to deduplicate the teacher proposal, the strong game's `played_move`, and the stable move in UTF-8 byte order. The returned plain receipt is not an origin-authentication claim by itself.
5. Check every union candidate in strict UTF-8 byte order, then independently rescore it with MultiPV 1, `searchmoves` containing exactly that move, depth 16, and `isready` / TT reset before each search.
6. Close proposal rank, provenance, child SFEN / position ID, and each rescore's evidence into the completed-parent input, then reverify the entire value with the completed-parent core.
7. Recapture stable, teacher, union, and rescore outputs as JSON-like data under one 100,000-entry, depth-32 snapshot budget, accept only undecorated exact native current-realm operation `Promise` objects, then pin them to the captured constructor and `then`. Finally return exact keys `{ union, stable_runtime, rescores }` as a caller-detached, deeply frozen value. The coordinator itself does not append, seal, or publish a file.

For a forced one-move parent, neither teacher proposal nor independent rescore runs. The rules-complete legal move, played move, and stable move must all be that forced move before the skip projection is created. This is the only search-elision branch; it is not a loophole for shallow ordinary results or missing candidates.

The stable score never enters the candidate union. The stable runtime contributes only the **move** production currently chooses. Only YaneuraOu's independent rescores may become a downstream teacher-target source; this coordinator neither converts nor publishes labels. The played move is another candidate source, not an answer label.

Revalidating the parent schema and rules-complete legality does not automatically establish production input origin or durable authentication for the request. The returned `FloodgateV7CompletedParentInput` is a validated value intended for a checkpoint, and its completed evidence still records `teacher_labels_emitted: 0`. By itself it is not an HMAC-authenticated record, published teacher label, or training row.

## 4. Fix the v2 run binding inside the factory

The [v2 teacher checkpoint](./blog-shogi-floodgate-v7-producer-timeout-cancellation.en.md) includes the following values in its HMAC-chained run binding so that identical work bytes cannot resume under different timeouts or runtimes.

| Binding          | Meaning fixed by the binding                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Plan             | Preregistered fresh-sibling plan, 10,890 bytes / SHA-256 `ad9e6d7f…b7a0af`                                |
| Producer control | `parent_deadline_ms`, `abort_drain_ms`, `max_in_flight = 12`, and cancellation / late-settlement policies |
| Stable runtime   | Exact production stable-runtime receipt SHA-256                                                           |
| Teacher runtime  | Exact production teacher-USI-runtime receipt SHA-256                                                      |

The zero-argument production factory builds a `shogi-floodgate-v7-teacher-run-binding-v2` `run_binding` from both runtime digests in the owner receipt plus the fixed plan and producer control, then exposes it read-only on the facade. Callers do not pass a run binding and cannot replace its deadline, drain, or runtime digests.

Producer control uses schema `shogi-floodgate-v7-teacher-producer-control-v2`, `parent_deadline_ms = 1,800,000`, `abort_drain_ms = 30,000`, and `max_in_flight = 12`. Its cancellation policy is `first-terminal-stop-scheduling-abort-each-running-signal-once-and-call-controller-drain-once-v2`; its late-settlement policy is `observe-from-start-consume-after-terminal-without-validation-or-append-v2`. Only the test core injects the same four dependencies used by the runtime owner; the production factory remains zero-argument.

The coordinator does not capture or compare a caller-supplied binding; it only exposes the one v2 `run_binding` it constructs. The checkpoint accepts only an exact two-key `{ produce, abortAndDrain }` controller, so the exact five-key coordinator facade cannot be passed to it directly. A future trusted connector must project only those two operations into a new frozen controller and pass the coordinator's exact `run_binding` to the key authority and checkpoint. That boundary must then fail closed instead of combining a different digest, v1 binding, unknown key, extra field, or different producer policy with the same resume. This PR does not yet implement that projection, comparison, or resume authentication.

This change is not the deployment key authority that issues an HMAC over the run binding. Supplying a same-shaped binding is different from an official key holder authorizing that run. The coordinator must not be connected to an official production run until the next PR closes the key authority.

## 5. Put deadlines, cancellation, and cleanup under one terminal

Each `produce` installs a one-shot listener on the current-realm signal and a 1,800,000 ms timer. This supervises the entire operation for one parent; it does not replace the USI runtime's 600,000 ms per-search timeout or the owner's 30,000 ms cleanup timeout. Once any stage observes a terminal condition, the coordinator starts no later proposal, rescore, or assembly step and removes the listener and timer.

| Terminal condition                                    | Coordinator behavior                                                                             |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Caller signal abort                                   | Stop new operations, observe started work, then enter owner abort                                |
| Stable proposal failure                               | Start no teacher search, reclaim the initialized teacher runtime, and retain the primary failure |
| Teacher proposal / rescore failure                    | Schedule no remaining candidate and enter owner abort                                            |
| Candidate-union / completed-parent validation failure | Return no engine result as a checkpoint value and enter owner abort                              |
| Owner abort failure / timeout                         | Preserve primary and cleanup failures separately                                                 |
| Success                                               | Return only the completed-parent input; checkpoint durability remains a later stage              |

If owner handoff fails inside the factory, the acquired owner is still sent through `abortAndDrain()`, while handoff primary and cleanup failure remain separate. Operation phases are fixed as `capture`, `owner-handoff`, `stable-proposal`, `teacher-proposal`, `candidate-union`, `independent-rescore`, `completed-parent`, `deadline`, `cancellation`, and `cleanup`. `FloodgateV7ProductionParentCoordinatorError` retains the phase and primary; when owner cleanup fails too, it stores that failure separately in `cleanup_failures`.

Ending the caller's wait with `Promise.race` does not make a raw engine process disappear. A settlement observer remains on the started workflow, and the owner's `abortAndDrain()` sends stable close and teacher `abortAndReap()` through one deadline-bounded cleanup. A settled guard discards late fulfillment instead of reusing it as a new candidate or checkpoint append. The coordinator's `close()` and `abortAndDrain()` also share the first valid transition and send active `produce` calls to the same terminal.

## 6. Findings and intermediate data

| Finding or intermediate value                                                                                 | Current meaning                                                                                     |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| The production owner deliberately exposed zero parent-operation methods                                       | Exact handoff is required; runtimes must not be reconstructed from a receipt copy                   |
| Production and test handoff registries are separate, and claim deletes before capture                         | Reject cross-boundary claims, double claims, and repair-and-retry of a malformed runtime            |
| The freeze candidate passed 30 / 30 focused and 169 / 169 related cases across five files under Node v22.13.0 | Synthetic / injected regression only, not production-runtime or playing-strength evidence           |
| The fixed plan identity is 10,890 bytes / `ad9e6d7f…b7a0af`                                                   | Callers cannot replace the plan in the coordinator's `run_binding`                                  |
| The request becomes a detached snapshot before the first `await`, while a Proxy is rejected with zero traps   | Caller mutation or a hostile request cannot enter later engine work                                 |
| Parent strings are capped at 4,096 code units and runtime snapshots at 100,000 entries / depth 32             | Fail closed on oversized or deeply nested data before runtime work or during result assembly        |
| Selected intrinsics are captured at module evaluation and the runtime union is resnapshotted / frozen         | Post-import live-intrinsic poisoning defense, not evidence against pre-import or process compromise |
| The coordinator source imports or accepts no filesystem, dataset, checkpoint, or root-key authority           | Separates the one-parent operation boundary from durable authority                                  |
| The stable runtime has 12 workers and the teacher runtime has 12 engines                                      | This matches checkpoint `max_in_flight = 12`                                                        |
| The width-12 stable smoke measured a 2,187 ms median and 5.49 positions/s                                     | Reference evidence that stable proposal is lighter than teacher rescoring, not real-data throughput |
| The synthetic v2 24,000-parent scan took 435.60 s for 429,245,287 bytes with 483,491,840-byte maximum RSS     | Checkpoint-scanner evidence only; producer calls were zero                                          |
| The role bundle contains 24,000 training, 4,800 selection, and 4,800 fresh-final label-free parents           | This PR opens none of them                                                                          |
| The formal A/B remains 192 color-swapped pairs / 384 games                                                    | The canonical preregistration remains unchanged                                                     |

Intermediate values must not be mixed with playing-strength results. Stable smoke throughput, synthetic scan time, and focused-test counts do not measure real depth-16 teacher throughput, label quality, weight improvement, or match strength.

## 7. Test evidence

This section records only values measured against the 2026-07-13 freeze candidate under the repository-required Node v22.13.0.

| Check                                        | Result                                         | Boundary                                                                                      |
| -------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Focused production-parent coordinator tests  | **PASS: 30 / 30**                              | Includes exact handoff, bounds, foreign Promise, intrinsic poisoning, and lifecycle           |
| Related regression tests (five files)        | **PASS: 169 / 169**                            | Includes owner handoff, checkpoint, candidate union, and completed-parent                     |
| TypeScript `--noEmit`                        | **PASS**                                       | Node v22.13.0; type closure                                                                   |
| Scoped ESLint / Prettier / diff-check        | **PASS**                                       | Changed TypeScript / test files and both articles                                             |
| Full Vitest (final maxWorkers = 2 run)       | **PASS: 114 / 114 files; 2,026 / 2,026 tests** | Repository regression                                                                         |
| Python ML stdlib                             | **PASS: 58 / 58**                              | Regression of the unchanged training verifier                                                 |
| Next production build                        | **PASS: exit 0; 13 workers**                   | Existing Firebase build-phase / dynamic-route warnings remained; they were not build failures |
| Production factory / origin in focused tests | Zero production executions / no origin         | Matches the injected receipt's `test_boundary`; not production evidence                       |
| Real Floodgate parents / labels / weights    | 0                                              | Outside this PR's execution scope                                                             |

Before the two Promise-hardening tests were added, the first full run at maxWorkers = 4 timed out one existing WASM-initialization test at 3,000 ms, producing 2,023 / 2,024. The target then passed 1 / 1 in isolation, and that revision's maxWorkers = 2 rerun passed 2,024 / 2,024. After hardening, the final branch passed 114 / 114 files and 2,026 / 2,026 tests at maxWorkers = 2. The initial flaky timeout remains in the history, and synthetic results must not be promoted to production-runtime-origin evidence.

## 8. Explicit nonclaims

This change executed or produced the following totals:

- production input authentications: **0**;
- real Floodgate dataset reads and training / selection / final parent accesses: **0**;
- real proposals / rescores by production YaneuraOu: **0**;
- official teacher labels or teacher JSONL rows: **0**;
- HMAC checkpoints or official completion receipts: **0**;
- optimizer steps, `final.pt` files, or candidate weights: **0**;
- production-weight overwrite: **0 bytes**;
- live evaluation-function / weight activations: **0**;
- application-code merge / deployment: separate from the activation count above; this article carries neither a deployment receipt nor a zero / PASS claim;
- matches executed: **0**;
- formal A/B: **0 / 192 pairs and 0 / 384 games**;
- 81Dojo rated games, Elo, rating, or rank measurements: **0**.

The boundary closed by this PR is only that an operation graph for one parent can be connected to the exact runtime pair held by the owner. It makes zero claim that the evaluation function improved, avoided regression, or reached stable high-dan strength.

## 9. Next: key authority, checkpoint, then 100 / 500-parent pilots

The next order remains fixed.

1. Add deployment key authority and bind the run ID, key ID, v2 run binding, and stage to an official HMAC capability.
2. Connect that authority and the production parent coordinator to the v2 checkpoint, closing input order, resume, first-terminal handling, fsync, and the final seal.
3. Revalidate timeout, simultaneous failure, raw-never-settles, late settlement, cleanup failure, and resume with synthetic fault injection.
4. Run a holdout-free 100-parent real pilot and audit failures, throughput, candidate count, score / mate distributions, resume, and residual processes.
5. Expand to 500 parents under the same fixed policy and start the 24,000 training parents only after that pass.

Passing the 100 / 500-parent pilots is not a playing-strength result. The remaining stages are the 24,000-parent training teacher, fixed-seed 42 / 43 / 44 QAT, fresh selection, fresh and legacy final holdouts, known regressions, production parity, and the formal 192-pair / 384-game A/B. Only a candidate that passes every internal gate may proceed to separately authorized 81Dojo calibration.
