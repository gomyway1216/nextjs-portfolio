# Handing the production coordinator to a checkpoint connector exactly once

> The preceding [production parent coordinator](./blog-shogi-floodgate-v7-production-parent-coordinator.en.md) closes the exact production runtime pair into one-parent operations and a v2 `run_binding`. The [deployment key authority](./blog-shogi-floodgate-v7-deployment-key-authority.en.md) can issue a fixed-deployment-key MAC over strictly captured caller-supplied run / stage metadata. The five-key coordinator facade still cannot be passed directly to the checkpoint, and the metadata MAC alone does not prove coordinator origin. This change projects a four-key capability exactly once from a factory-issued exact coordinator identity for a trusted checkpoint connector. It is not evidence of checkpoint execution, key provisioning, dataset reads, teacher labels, training, a weight, live evaluation-function activation, games, or playing strength. Japanese version: [blog-shogi-floodgate-v7-checkpoint-handoff.md](./blog-shogi-floodgate-v7-checkpoint-handoff.md)

---

## 1. Current boundary

| Item                   | Current implementation / validation                                                             | What this change establishes                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Public coordinator     | Retains the existing exact five keys `{ receipt, run_binding, produce, close, abortAndDrain }`  | Expands neither the caller-facing contract nor receipt claims                       |
| Checkpoint handoff     | Frozen null-prototype exact four keys `{ produce, abortAndDrain, close, runBinding }`           | Lets a trusted connector obtain the required exact references once                  |
| Identity authority     | Registers the factory-issued facade as a module-private `WeakMap` key                           | Does not treat a receipt, clone, wrapper, or same-shaped object as origin authority |
| Registry boundary      | Separates production and injected-test registries and claim APIs                                | Does not promote a test handoff into production origin                              |
| Lifecycle              | Invalidates an unclaimed entry when `close()` / `abortAndDrain()` starts                        | Creates no new connector ownership after lifecycle start                            |
| Checkpoint / key / I/O | Adds no checkpoint entrypoint, root key, dataset path, or `node:fs` and performs no related I/O | Separates capability handoff from checkpoint execution                              |
| Focused validation     | **35 / 35 PASS** on Node v22.13.0                                                               | Synthetic / injected coordinator regression, not production checkpoint evidence     |
| Related / full / build | Related **174 / 174**, full **115 files / 2,042 tests**, Python **58 / 58**, build PASS         | Repository regression, not production-handoff success or playing-strength evidence  |
| Live / strength        | Production-weight activation 0, games 0                                                         | Zero claim that the engine became stronger or stable at high-dan level              |

## 2. Why the five-key facade is not passed directly to the checkpoint

The checkpoint producer controller requires exactly two operations, `{ produce, abortAndDrain }`. The coordinator's public facade is an exact five-key contract that also contains a receipt, run binding, and normal-shutdown `close()`. Passing the larger facade directly fails the checkpoint's strict controller capture. Letting a caller assemble a smaller plain object, however, loses exact coordinator origin.

This change adds an intermediate trusted boundary. It leaves the public facade unchanged and, after successful factory completion, binds the exact facade to its internal operation references in a module-private registry. A claim checks neither a receipt digest nor structural equality; only the same object identity carries authority. This separates “obtain coordinator origin” from “project the exact two checkpoint keys” into distinct pull requests.

Obtaining the handoff starts no checkpoint. The connector may close it without calling `produce` once, creating zero checkpoint-file, header, parent-entry, or seal bytes.

## 3. Separate production and test single-use registries

The production path uses `claimFloodgateV7ProductionParentCoordinatorForCheckpoint(...)`; the injected test path uses `claimFloodgateV7ProductionParentCoordinatorForCheckpointCoreForTests(...)`. Each accepts exactly one argument and reads a separate module-private `WeakMap`.

The claim rules are:

1. Reject `null`, non-objects, and Proxies before registry lookup; no Proxy trap runs.
2. Require the exact facade in the matching registry; a valid lifecycle start synchronously deletes the entry first.
3. Delete the registry entry before capability projection.
4. Verify the expected execution boundary and return a fresh frozen four-key handoff.

A clone, receipt copy, plain object containing the same function references, or second claim fails. Passing a production facade to the test registry, or a test facade to the production registry, also fails. A wrong-registry lookup does not consume the matching registry entry, so the subsequent correct claim remains available.

Even when the test API returns the same operation shape as production, it proves neither production-factory execution nor production-runtime origin. The existing coordinator receipt's `test_boundary` and nonclaims remain unchanged.

## 4. Invalidating unclaimed authority when lifecycle starts

When the coordinator begins the first valid `close()` or `abortAndDrain()` transition, it publishes the lifecycle Promise before notifying active producers. The same transition deletes any still-unclaimed checkpoint-handoff registry entry. A stale facade therefore cannot mint new connector handoff authority after shutdown begins.

If the claim succeeds first, the handoff holds the same `close` / `abortAndDrain` references as the coordinator. The connector can use `close` for normal completion and `abortAndDrain` for failure / cancellation, but both join the existing coordinator lifecycle. No second lifecycle or separate runtime owner is created for the handoff.

This single-use claim is not a sandbox that revokes operation references from a hostile same-process holder of the original facade. A trusted caller retaining that facade can still invoke the same functions. The guarantee is limited to issuing checkpoint-connector capability once from the exact facade through the module registry and issuing none after lifecycle start.

## 5. Exact four-key projection and identity preservation

The four handoff fields are the exact original-facade values, not copied metadata or wrappers.

| Handoff field   | Identity / next-stage use                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| `produce`       | `handoff.produce === coordinator.produce`; the next PR projects it into the two-key checkpoint controller |
| `abortAndDrain` | `=== coordinator.abortAndDrain`; reclaims started work on the first terminal outcome                      |
| `close`         | `=== coordinator.close`; closes the runtime pair after pre-checkpoint failure or normal completion        |
| `runBinding`    | `=== coordinator.run_binding`; supplies the same binding to the key authority and checkpoint              |

The returned object is null-prototype and frozen with only exact enumerable, non-writable own data keys. It does not bind functions, add Promise wrappers, or reconstruct operations from receipt digests. `runBinding` is not serialized / parsed again; the handoff preserves exact object identity.

This four-key handoff is still not the checkpoint's two-key controller. `close` and `runBinding` remain owned by the trusted connector, while the next PR further narrows what reaches the checkpoint.

## 6. Relationship to the deployment key authority

The deployment key authority issues an HMAC over strictly captured metadata with a fixed private key, but it does not establish the origin of caller-supplied coordinator digests, stage receipts, or an active lease. This handoff does the inverse: it transfers exact coordinator origin / operation references but neither reads a key, issues a MAC, nor claims a stage lease.

The next trusted connector must compose, under one ownership boundary:

1. This single-use exact coordinator handoff.
2. The handoff's exact `runBinding`.
3. An active private-stage lease and exact authorization receipt.
4. The deployment authority with its fixed key ID / key instance.
5. The exact two-key `{ produce, abortAndDrain }` passed to the checkpoint.

This change connects none of them. Production checkpoint invocation, key provisioning / rotation enforcement, input authentication, resume comparison, and file durability all remain later work. The existing coordinator receipt remains fixed at `checkpoint: false`, `key_authority: false`, and `input_authentication: false`.

## 7. Findings, failure matrix, and intermediate data

| Finding / validation target                             | Current meaning                                                                                       |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Retains the exact five-key public facade                | Does not mix checkpoint-specific authority into a public-API expansion                                |
| Handoff has exactly four keys                           | Retains connector cleanup and binding while leaving checkpoint two-key projection to the next stage   |
| Separates production and test registries                | Does not turn injected success into production origin                                                 |
| Wrong-registry claim preserves the correct entry        | Only matching authority can consume the handoff                                                       |
| Entry is consumed before projection                     | Does not issue two connector authorities from one facade                                              |
| Lifecycle-first deletes the unclaimed entry             | Rejects a late handoff after shutdown starts                                                          |
| Handoff acquisition makes zero proposal / rescore calls | Does not promote a capability test into teacher-execution evidence                                    |
| Source owns no checkpoint / key / dataset I/O           | Separates ownership projection from durable execution                                                 |
| Node v22.13.0 focused 35 / 35                           | Includes invalid-arity lifecycle, both valid lifecycle methods, and production-API arity              |
| Related five files 174 / 174                            | Regression across owner, candidate union, completed parent, and checkpoint                            |
| Full Vitest 115 files / 2,042 tests                     | Passed with `maxWorkers = 2`, favoring reproducibility around an existing WASM initialization timeout |
| Python ML 58 / 58, TypeScript / ESLint / build          | All passed; the Next production build used 13 workers                                                 |

Focused coverage targets clones, zero Proxy traps, wrong registries, exact production / test claim arity, double claims, exact own descriptors, function / binding identity, retention of the claim after invalid-arity lifecycle calls, invalidation by both valid `close` and `abortAndDrain`, and zero-work close. The production-registry happy path remains unexecuted because no production assets were started; it stays blocking evidence for the next connector's production smoke.

## 8. Test boundary and explicit nonclaims

On Node v22.13.0, **35 / 35** focused coordinator tests, **174 / 174** tests across five related files, full Vitest at **115 / 115 files and 2,042 / 2,042 tests**, Python ML at **58 / 58**, TypeScript, scoped ESLint / Prettier / diff-check, and the 13-worker Next production build all passed. These are code evidence over injected stable / teacher runtime fixtures and repository regression. They do not execute the successful production-coordinator-factory-to-production-registry claim path, a production key, a real filesystem checkpoint, or real Floodgate input. Existing Firebase build-phase / dynamic-route warnings remained during the exit-zero build and were not failures caused by this change.

Execution and generated output for this change are:

- Production checkpoint execution / durable prefix / seal: **0**
- Production deployment-key provisioning / key-authority execution: **0**
- Production dataset read: **0 games / 0 parents / 0 bytes**
- Real stable / teacher searches: **0 parents**
- Teacher labels / teacher JSONL: **0**
- Training / optimizer steps / checkpoints: **0**
- Candidate weights / production-weight overwrite: **0 / 0 bytes**
- Live evaluation-function / weight activation: **0**
- Matches / Elo / rating / rank / playing-strength evidence: **0**
- Formal A/B: **0 / 192 color-swapped pairs, 0 / 384 games**
- 81Dojo rated games: **0**

This PR therefore closes only the code boundary that can project trusted-checkpoint-connector capability once from a factory-issued exact coordinator. It makes zero claim that the evaluation function improved, avoided regression, or reached stable high-dan strength.

## 9. Next: exact two-key connector, v3 milestones, and a 24,000-only seal

The next PR implements a separate trusted connector rather than expanding this handoff's responsibilities.

1. Project only the exact two-key `{ produce, abortAndDrain }` checkpoint controller from the exact four-key handoff.
2. Pass the same exact `runBinding` to the deployment authority and checkpoint invocation.
3. Exactly compare active stage, run ID, fixed key ID / key instance, and resume context.
4. Freeze the v3 milestone contract's schema and MAC binding.
5. Close timeout, late-settlement, cleanup-failure, key / binding mismatch, and resume behavior with a synthetic fault matrix.
6. Using the same authenticated 24,000-parent training input, record the 100-parent milestone as an unsealed durable prefix.
7. Record the 500-parent milestone under the same run / input as an unsealed durable prefix.
8. Issue a full authenticated seal only after all 24,000 parents are present.

No separate 100 / 500 dataset slice or identity is created, and no holdout is opened. The 100 / 500 / 24,000 milestones measure teacher-data throughput, failure, resume, and durability; none is a playing-strength result. Seed-42 / 43 / 44 QAT, fresh selection, fresh / legacy final, known regressions, production parity, and the formal 192-pair / 384-game A/B all remain afterward. Only a candidate that passes every internal gate may proceed to separately authorized 81Dojo calibration.
