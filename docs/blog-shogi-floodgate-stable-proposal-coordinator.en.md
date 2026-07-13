# Wiring generate-and-checkpoint into synthetic proposal publication

> The [training-row consumer](./blog-shogi-floodgate-training-row-consumer.en.md), [stable-WASM proposer](./blog-shogi-floodgate-stable-wasm-proposer.en.md), [authenticated checkpoint](./blog-shogi-floodgate-stable-proposal-checkpoint.en.md), [consumer postflight capability](./blog-shogi-floodgate-consumer-postflight-capability.en.md), and [result / manifest finalizer](./blog-shogi-floodgate-stable-proposal-finalizer.en.md) each closed an individual synthetic contract. Passing their separate tests does not establish that exact input claim, checkpoint-lease closure, postflight minting, a fresh finalizer lease, and private publication occur in the right order during one runtime lifecycle. This PR composes the fixed existing `CoreForTests` entry points as a `generate-and-checkpoint` path, adding a test-only coordinator from consumer callback through destination-content audit. It is end-to-end wiring for synthetic stable-proposal publication, not an end-to-end production-engine, teacher-label, training, or playing-strength pipeline. It does not use or read real data, selection, or either fresh or legacy final holdout. Japanese version: [blog-shogi-floodgate-stable-proposal-coordinator.md](./blog-shogi-floodgate-stable-proposal-coordinator.md)

---

## Current boundary

| Item                            | Current status               | Meaning                                                                                                                          |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Coordinator entry point         | Implemented for tests only   | Exposes only `runFloodgateStableProposalCoordinatorCoreForTests(...)`                                                            |
| Execution path                  | `generate-and-checkpoint`    | Always enters consumer, proposer, and checkpoint before finalizer / publication                                                  |
| Boundary selection              | Fixed                        | Coordinator callers cannot replace the consumer / proposer / checkpoint / finalizer functions themselves                         |
| Inner failure seams             | Test-only injection          | Captures each fixed boundary's existing bundle-verifier, search, checkpoint-failpoint, rename, and fsync seams                   |
| Authority handoff               | Implemented                  | Orders the exact input claim, initial checkpoint-lease close, exact postflight mint, and fresh finalizer lease                   |
| Success output                  | Implemented                  | Returns a deeply frozen coordinator receipt containing the finalization receipt                                                  |
| Checkpoint resume               | Narrow                       | When the stage contains only `work.jsonl`, it can reuse checkpoint valid-prefix / complete-work behavior but reruns the proposer |
| Finalization resume             | Next PR                      | No dedicated entry accepts a stage with a `result.json` / `manifest.json` prefix because checkpoint runs first                   |
| Production / teacher / strength | Not implemented; no evidence | Proves no production registry, engine authority, depth-16 label, training, Elo, or rank                                          |

The contract, status, and claim boundary are fixed as follows.

```text
shogi-floodgate-stable-proposal-coordinator-v1
synthetic-consumer-proposal-checkpoint-postflight-finalization-publication-complete
test-only-synthetic-runtime-composition-evidence-not-production-engine-teacher-label-training-or-playing-strength-evidence
```

The success receipt also narrows its execution boundary and path.

```text
test-only-fixed-boundary-composition
generate-and-checkpoint
```

## 1. Passing individual primitives is not runtime composition

The consumer callback's input can be claimed only during synchronous invocation. The checkpoint claims an exact active stage lease, closes `work.jsonl`, and then closes that lease. A postflight receipt cannot be minted until callback settlement, post-callback snapshot verification, and both raw / root descriptor closes succeed. The finalizer needs that exact postflight receipt plus a different fresh active lease.

Caller convention alone leaves these gaps:

- starting the proposer before the input claim;
- returning from the callback before checkpoint-promise settlement;
- entering postflight without closing the checkpoint lease;
- transferring authority into the finalizer before postflight succeeds;
- reusing a closed lease; and
- leaving an exact postflight receipt in its registry after it cannot reach the finalizer.

The coordinator composes only the order without weakening any existing boundary. It does not turn an intermediate artifact into success and returns a coordinator receipt only after the finalizer's destination-content audit and every cleanup complete.

## 2. Synchronous invocation capture and fixed module boundaries

Before its first filesystem or consumer operation, the coordinator captures exact own data properties from options and dependencies. It rejects Proxies, symbol keys, accessors, unexpected fields, shared-backed byte inputs, and Proxy functions.

Captured inputs include:

- stage-authorization and consumer path / revision options;
- a 32-byte root key, 64-character lowercase-hex run ID, opaque key ID, and effective UID;
- private copies of proposer plan, WASM, embedded-WASM, weight, and worker-source bytes;
- worker count, startup timeout, and search timeout;
- a synthetic bundle verifier and expected manifest identity;
- injected proposer search;
- checkpoint write / close / failpoint seams; and
- finalizer failpoint plus publication rename / reconciliation / sync / close seams.

The coordinator copies rather than retains caller views of the root key and proposer assets. Intrinsic TypedArray getters and setters alone establish backing storage, exact length, and copying so a `Uint8Array` subclass cannot forge public `buffer` / `byteLength` getters to bypass SharedArrayBuffer or length checks. The coordinator zeroizes its root-key copy on success and failure before hostile-error inspection or injectable cleanup hooks. It also zeroizes the temporary copies passed into checkpoint and finalizer immediately after those functions synchronously capture them.

Coordinator dependencies do not accept high-level boundary functions. The coordinator calls module-imported fixed entry points for consumer postflight, input claim, proposer, stage authorization, checkpoint, and finalizer. That is why its execution boundary is `test-only-fixed-boundary-composition`. Each entry point still retains its internal seam for reproducing synthetic failures. This is fixed test-boundary wiring, not a production fixed-dependency path.

## 3. Exact authority-handoff order

A clean invocation emits events in this order.

```text
input-claimed
proposal-complete
initial-lease-acquired
checkpoint-complete
fresh-lease-acquired
postflight-complete
before-finalization
```

The actual authority flow is:

```text
enter test consumer postflight boundary
  -> callback receives exact AuthenticatedFloodgateTrainingRows
  -> synchronously claim that exact input before the first await
  -> generate a complete in-memory stable-proposal artifact
  -> authorize the initial checkpoint lease
  -> checkpoint claims the lease, persists / resumes work.jsonl, then closes it
  -> authorize a fresh finalizer lease over the existing private stage
  -> callback settles without a value
consumer revalidates the input snapshot and closes raw / root descriptors
  -> exact postflight receipt is minted
finalizer consumes fresh lease + exact postflight receipt
  -> result / manifest -> private publication -> destination audit
```

The initial lease is not taken before the proposer because the current checkpoint begins persistence only after receiving a complete in-memory artifact. The fresh finalizer lease is acquired after checkpoint closure while still inside the consumer callback. The postflight receipt itself becomes available only after the callback returns and consumer postflight plus descriptor closure complete.

The success receipt's `handoff` closes these facts as `true`:

- the exact input was synchronously claimed;
- the initial checkpoint lease closed before postflight;
- the exact postflight receipt was minted;
- a fresh finalizer lease was acquired; and
- the finalizer contract equals the expected exact constant.

## 4. Scope of the `generate-and-checkpoint` path

Every coordinator invocation enters the consumer and runs the proposer to build a complete artifact in memory. Only then does it authorize an initial stage lease and pass the artifact into checkpoint. The checkpoint HMAC-binds its header, dense proposal entries, and seal to run / key / stage / input / semantic artifact and owns file / directory sync plus valid-prefix resume.

The checkpoint call claims the lease synchronously. The coordinator awaits its returned Promise before setting `checkpoint-complete`. Checkpoint success means the exact `work.jsonl` is complete and lease close also succeeded. The coordinator then authorizes a fresh lease over the same stage path. Because the callback cannot settle before fresh-lease acquisition, stage authority for the finalizer already exists when the postflight receipt is minted.

This path does not checkpoint per-parent progress during stable search. A failure before the proposer returns a complete artifact adds no proposal progress to `work.jsonl`; the next invocation restarts search. Even when a checkpoint prefix already exists, the proposer reruns to rederive the expected transcript.

The proposer is a synthetic core using a dependency-injected `search` adapter. Recording asset bytes, a required tuple, and a semantic fingerprint does not prove that the adapter ran the recorded production engine process.

## 5. From postflight into finalization and publication

After callback settlement, the consumer completes its postflight snapshot and raw / root descriptor closes, then mints the exact test postflight receipt. The coordinator passes through `postflight-complete` and `before-finalization`, then gives the receipt and fresh lease to the finalizer.

The finalizer performs its existing contract:

1. transfer fresh-lease ownership into a publication transaction;
2. single-use claim the exact postflight receipt;
3. standalone-verify `work.jsonl` and cross-bind it to the consumer binding;
4. file-sync and stage-directory-sync HMAC-bearing `result.json`;
5. file-sync and stage-directory-sync HMAC-bearing `manifest.json`;
6. revalidate the exact source three-file set;
7. publish to the private destination through exclusive rename and two-stage parent sync; and
8. reopen the destination and all three files, revalidating identity, bytes, work authentication, and cross-binding.

The successful coordinator receipt exposes only its contract, status, claim boundary, test-only execution boundary, `generate-and-checkpoint` path, run ID, key ID, handoff facts, and deeply frozen finalization receipt. It adds no coordinator-specific teacher score or engine claim.

## 6. Current resume boundary and the next PR

The current coordinator always runs proposer and checkpoint first. Retry behavior therefore depends on the stage entry set.

| Starting or post-failure state                                | Current handling                                                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| No stage / empty stage                                        | Run consumer and proposer, then create a fresh checkpoint                                                                       |
| Zero-byte or valid `work.jsonl` prefix only                   | Rerun proposer to build the expected artifact, then resume through the checkpoint contract                                      |
| Complete `work.jsonl` only                                    | Rerun proposer, let checkpoint no-rewrite verify exact bytes, then enter finalizer                                              |
| Failure after complete work but before finalizer              | The error may say `resume-finalization-over-complete-authenticated-work`, but the current export is not a dedicated resume path |
| Existing deterministic `result.json` / `manifest.json` prefix | The current generate-and-checkpoint export cannot resume it; checkpoint rejects the extra stage entry                           |
| Publication commit started                                    | Do not retry blindly; require manual publication reconciliation                                                                 |
| Stale authorization marker                                    | Do not steal or delete automatically; require manual lease reconciliation                                                       |

`resume-finalization-over-complete-authenticated-work` is therefore a recovery disposition, not a claim that this same entry point accepts every finalizer prefix. The next PR must add an explicit resume-finalization coordinator. It will obtain a fresh exact postflight receipt from a consumer invocation, standalone-verify complete work, skip checkpoint, and hand the existing result / manifest prefix directly to the finalizer.

Nor can a process recover exact object authority from a persisted postflight projection after a crash. Retry needs a fresh consumer invocation, fresh synchronous input claim, fresh postflight receipt, and fresh stage lease.

## 7. Typed failure and capability cleanup

`FloodgateStableProposalCoordinatorError` separates phase and progress into these facets.

```text
phase,
inputClaimed, proposalComplete,
checkpointStarted, checkpointComplete,
postflightMinted, freshLeaseAcquired, finalizerStarted,
mayHavePublished, leaseMayRemain,
retryDisposition, primary, cleanupFailures[]
```

Phases are `capture`, `consumer-claim-proposer`, `checkpoint-authorization`, `checkpoint`, `consumer-postflight`, `finalization-publication`, and `cleanup`. Capture failure acquires no filesystem authority and can restart with a fresh synthetic invocation.

Coordinator cleanup does not silently leave authority behind.

- It closes an initial lease when checkpoint never started.
- After checkpoint ownership transfer fails, it read-only reconciles the authorization-marker pathname and requires manual lease reconciliation if the marker remains or cannot be observed safely.
- It closes a fresh lease when finalizer never started or failed during authority transfer.
- If a minted postflight receipt was not consumed by the finalizer, the coordinator single-use claims and discards it.
- It carries forward publication / lease facets from a typed finalizer error.
- It treats a Proxy or unknown finalizer failure conservatively as indeterminate for both publication and lease.
- It keeps the primary failure separate from lease / capability cleanup failures.

Retry dispositions distinguish a fresh rerun, finalization resume over complete work, manual content reconciliation, manual lease reconciliation, manual publication reconciliation, and combined manual reconciliation. `checkpointComplete` alone is never coordinator success; absence of a complete finalization receipt always produces an error.

## 8. What isolated synthetic module-pin testing covers

The focused coordinator test pins only the synthetic bundle-manifest identity constant to one shared value across the whole module graph. This test-only alignment lets the exact consumer input flow into the proposer without post-editing an artifact receipt. The actual consumer, proposer, authorization, checkpoint, postflight, and finalizer `CoreForTests` implementations still run over a temporary filesystem.

- exact event order and progress at every hook;
- synchronous input claim before proposer execution;
- initial-lease authorization only after proposal completion;
- fresh-lease authorization only after checkpoint settlement / lease close;
- finalizer start only after postflight minting;
- consistent propagation of run / key, root-key copies, captured assets, and options;
- exact success-receipt keys, deep freeze, execution path, and handoff facts;
- initial / fresh lease and postflight-capability cleanup at selected handoff interruptions;
- containment of hostile-prototype and forged-accessor failures before finalizer start; and
- distinct retry dispositions for complete work, finalizer prefixes, manual content, and authorization markers.

The module-pin suite exercises the real test-only file-sync, HMAC-verification, consumer-filesystem-snapshot, and injected exclusive-rename paths. It does not use the fixed production rename, production bundle verifier, or a production engine, and it does not duplicate every lower-level adversarial matrix. Coordinator evidence therefore combines the focused wiring suite with the related-boundary suites.

## 9. Synthetic evidence and explicit non-claims

The source contract and bilingual claim boundary were audited, and the focused module-pin test, related boundary suites, full regression, typecheck, lint, and build were run to completion. The following measured results are evidence only for the synthetic wiring boundary.

| Validation                                     | Current result                                        |
| ---------------------------------------------- | ----------------------------------------------------- |
| Coordinator source / contract audit            | No unresolved blocker / high / medium finding         |
| Isolated coordinator module-pin suite          | 16 / 16 PASS                                          |
| Coordinator + related boundary suites          | 7 files, 246 / 246 PASS                               |
| Full Vitest / Python audit                     | 104 files, 1747 / 1747 PASS; stdlib 58 / 58 PASS      |
| TypeScript / scoped and full ESLint / Prettier | PASS; full ESLint has 0 errors, 157 existing warnings |
| Production build                               | PASS                                                  |

| What coordinator success establishes                                                                 | What it does not establish                                                                |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Fixed test boundaries were wired in exact authority order                                            | A production coordinator, production registry, or production-deployment readiness         |
| Synthetic consumer input handed off through proposal, checkpoint, postflight, and finalization       | Execution of a particular engine binary / evaluation asset by the injected search adapter |
| Complete authenticated work, HMAC result / manifest, and private publication closed into one receipt | Correctness of a stable proposal as a teacher score, centipawn truth, or label            |
| Success returned only after destination-content audit                                                | An OS sandbox against hostile same-EUID actors, root, ACLs, or pre-existing capabilities  |
| Enumerated failure / cleanup / retry dispositions were preserved                                     | Mid-search resume, automatic stale-lock takeover, or exactly-once behavior across crashes |
| Synthetic runtime composition was exercised                                                          | A real dataset, training, QAT / int16, accuracy, Elo, rank, or stable high-dan play       |

Checkpoint / result / manifest HMACs establish integrity of bindings constructed by a key holder. They do not establish engine identity, source truth, non-repudiation, key secrecy, or anti-rollback. Exact object claims are single-use authority within one process and do not persist across a crash. The trusted-current-EUID private `0700` / `0600` boundary is not a sandbox against hostile same-EUID writers or root.

Tests read the tracked plan / WASM / embedded-WASM / existing-weight / worker-source bytes as identity fixtures and use synthetic rows, keys, a search adapter, stage engine placeholders, and temporary stages. They read no real Floodgate training row, selection, fresh final holdout, or legacy final holdout, and run neither production YaneuraOu depth-16 v7 search, training, nor an A/B match. They change no model-weight byte and do not overwrite the existing evaluation function. Test counts and synthetic elapsed time are neither playing-strength nor production-throughput evidence.

## 10. Next: explicit finalization resume, then the production teacher

The next PR should handle a complete-work state that also contains a deterministic `result.json` / `manifest.json` prefix. It must obtain a fresh exact input claim and postflight receipt from a consumer invocation, standalone-verify work, skip checkpoint, and hand the prefix directly to the finalizer. Publication ambiguity and stale markers remain manual reconciliation cases.

After that, the project still needs an entry point using production registries and fixed dependencies only, pinned YaneuraOu binary / evaluation authority, the MultiPV 12 + strong-game played move + stable-move v7 union, depth-16 independent rescore of every unique candidate, a teacher-label / result schema, and possibly per-parent durable progress.

Even after labeling real training-only parents, three-seed fresh retraining with seeds 42 / 43 / 44, QAT / production-int16 export, frozen selection, sealed final holdout, production parity, known regressions, a fixed 384-color-swapped-pair / 768-game A/B, and separately authorized 81Dojo calibration remain.

“Complete” here means only that a test-only `generate-and-checkpoint` invocation reached successful finalization and private publication. Neither the production teacher nor a stronger evaluation function is complete, and there is still no evidence of stable high-dan strength.
