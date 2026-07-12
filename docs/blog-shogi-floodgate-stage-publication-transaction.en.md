# Moving an authorized private stage into durable publication

> [Private-stage authorization](./blog-shogi-floodgate-teacher-stage-authorization.en.md) made it possible to own the exact stage and lease-marker inodes through held descriptors, but the old `lease.close()` contract could not be safely composed with a directory rename. This PR transfers ownership of the exact lease object once into a publication transaction and puts exclusive rename, independent namespace reconciliation, destination reopen, parent fsync, and exact marker removal in one lifecycle. This is only content-agnostic namespace publication. It is not MAC verification of the [proposal checkpoint](./blog-shogi-floodgate-stable-proposal-checkpoint.en.md), consumer postflight, engine authentication, a teacher label, training, or playing-strength evidence. It did not read real training data, selection, or either the fresh or legacy final holdout. Japanese version: [blog-shogi-floodgate-stage-publication-transaction.md](./blog-shogi-floodgate-stage-publication-transaction.md)

---

## 1. Neither `close -> rename` nor `rename -> close` works

The old stage lease revalidates during `close()` that the authorized stage remains at its original `stageRoot` and that the destination is absent, then removes the lease marker. Adding a rename directly to that contract breaks safety on both sides of the ordering.

| Order             | Problem                                                                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `close -> rename` | The marker is removed and the parent, stage, and lease descriptors are closed before rename, losing exclusive ownership and held-inode evidence.                                                        |
| `rename -> close` | The stage is now at the destination, so `close()` fails its requirement that the stage remain at the original path. Marker removal and descriptor cleanup cannot complete through that contract either. |

The solution is not to insert rename before or after `close()`. The parent, stage, and lease descriptors plus marker-removal authority held by the exact lease object must be irreversibly transferred into a new transaction. The transaction keeps the marker after rename and removes it only after verifying the destination and durability.

## 2. Exact lease ownership transfer and first-call-wins

`beginFloodgateTeacherStagePublication(lease)` consumes only an active, unclaimed lease with exact object identity from the production registry. `beginFloodgateTeacherStagePublicationCoreForTests(lease, dependencies)` does the same from the test-only registry. A copy, Proxy, lease from the other registry, closed lease, or second begin does not pass. The test API looks up the exact lease before inspecting the dependency object, avoiding getter execution from a forged lease attempt.

Ownership moves from `lease` to `publication` synchronously when begin succeeds. The transaction exposes only the following fixed safe surface; it does not expose the held descriptors or marker-removal function themselves.

```text
phase
authorizationReceipt
stageRoot
destinationRoot
commit()
abort()
```

The first call to `commit()` or `abort()` synchronously selects the winner before the first `await`. Repeating the winner returns the same Promise, while the loser receives an ownership-transfer error. The original `lease.close()` is also always rejected after begin. That rejection remains in force after the transaction reaches `committed` or `aborted`, preventing re-entry into old authorization cleanup and double handling of descriptors or the marker.

`abort()` does not start rename. It closes the lease through the existing strict stage, destination, and protected-path revalidation. Only `commit()` owns the full publication lifecycle.

## 3. Fix the production primitive and isolate failure seams to tests

The production entry point accepts no dependency injection and always uses the [exclusive directory rename primitive](./blog-shogi-floodgate-exclusive-directory-publication.en.md). The success receipt distinguishes the execution boundary with one of these values.

```text
production-fixed-exclusive-rename
test-only-injected-exclusive-rename
```

Only the test entry point can inject bounded seams for exclusive rename, pre-reconciliation, pre-destination-reopen, both parent syncs, exact marker removal, and descriptor close. This reproduces post-rename throws, fsync failure, path swaps, and cleanup failure with synthetic fixtures without providing production callers an API for substituting a weaker rename.

The production and test runtime registries are also separate. Passing a production lease to test begin, or a test lease to production begin, transfers no authority. Both boundaries are single-use, and transaction start provides no route back to a generic checkpoint claim or the original close authority.

## 4. Evaluate the rename receipt and namespace independently

Commit preflight revalidates the held parent, stage, lease, destination absence, stage-entry metadata, and protected-path identities, then opens a fresh source-directory handle that names the same inode as the authorized stage. It holds that handle across the exclusive rename call.

The return or throw from the rename call does not decide the commit result. After the call, source and destination are each independently `lstat`ed twice, and the transaction locates the authorized stage inode using this truth table.

| Source namespace                                 | Destination namespace                 | Classification                                                                                  |
| ------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Exact authorized stage in both reads             | Absent in both reads                  | `NotCommitted`; preserve the original stage and attempt authorization cleanup.                  |
| Absent in both reads                             | Exact authorized stage in both reads  | Renamed; continue into destination reopen and durability.                                       |
| Replacement, foreign, both present, or otherwise | Anything outside the two states above | `Indeterminate`; conservatively retain the marker and do not blindly retry, delete, or consume. |

When exclusive rename returns success, its receipt must also have the exact contract, trust boundary, `verified-committed` status, parent identity, and destination identity. A correct receipt with the namespace still at source is `NotCommitted`; a receipt mismatch after the stage moved to destination is `Indeterminate`.

By contrast, if the rename helper throws after the exact move, the namespace observation is authoritative evidence for continuing. The transaction neither moves the stage back because of the throw nor reruns the same rename. Receipt validation and namespace validation are separate, and the actual placement is decided by independent namespace reconciliation.

## 5. Reopen the destination and revalidate entries and protected paths

Classifying the exact stage inode at destination is still not publication success. The transaction reopens the destination with `O_NOFOLLOW | O_DIRECTORY` and requires current-EUID ownership, exact `0700`, and the same device and inode as the authorized stage. It also matches descriptor and pathname identities for the held parent, destination, and lease marker.

The stage-entry inspector uses the held directory FD to validate, across two snapshots, allowlisted names, regular-file type, current-EUID ownership, exact `0600`, link count 1, and no inode alias to a protected path. The repository root, raw and role locks, role bundle, legacy protected-position IDs, engine binary and receipt, inspector Python, optional evaluation directory, and absolute engine arguments must retain their authorization-time identities.

These are metadata checks, not content checks. The transaction does not parse the bytes, SHA-256, MAC chain, record schema, or cross-binding of `work.jsonl`, future `result.json` / `manifest.json`, or train / validation artifacts. It assumes a trusted current-EUID writer holds the namespace exclusively during the critical section; it is not an OS-level sandbox against a malicious same-EUID actor racing rename or rewrite operations.

## 6. Sync the parent twice and remove only the exact marker

After destination reopen and revalidation pass, the durability order is fixed.

1. Fsync the held parent directory to make the stage-to-destination rename durable.
2. Revalidate parent, destination, lease, stage-entry metadata, and protected paths again.
3. Close the held lease descriptor.
4. Confirm that the marker path is the authorized lease's current-EUID-owned exact `0700` inode, then `rmdir` only that exact directory.
5. Fsync the held parent directory again to make marker removal durable.
6. Revalidate parent and destination identity and confirm that the source path and marker path are absent.
7. Close every descriptor before returning the frozen receipt.

The state is `renamed-parent-synced` after the first parent fsync and becomes `published-and-lease-removal-durable` only after the second. A replacement inode is not removed merely because it has the same marker name. If the second fsync fails, `leaseMayRemain` conservatively stays `true` even when the marker is currently absent, because crash durability of the removal is not established.

The success receipt has only this field set.

```text
contract, trust_boundary, status, claim_boundary, execution_boundary,
publication_durability, parent_identity, destination_identity,
lease_identity, stage_basename, destination_basename
```

Its status is `verified-durable-exclusive-publication`, and its claim boundary is `namespace-publication-only-not-content-authentication-consumer-postflight-training-teacher-label-or-playing-strength-evidence`.

## 7. Typed failures keep primary and cleanup separate

Only a preflight failure before rename, or independent reconciliation proving that the exact stage remains at source, returns `FloodgateTeacherStagePublicationNotCommittedError`. Both `mayHavePublished` and `mayHaveCommitted` are `false`. Every other post-rename ambiguity, destination-reopen failure, fsync / marker-removal / final-recheck failure, or cleanup failure returns `FloodgateTeacherStagePublicationIndeterminateError`, with both facets set to `true`.

Both errors preserve the facets needed for recovery decisions.

```text
phase
primary
cleanupFailures[]
publicationDurability
destinationReopened
leaseMayRemain
mayHavePublished / mayHaveCommitted
```

The failure phase is one of `preflight`, `rename`, `reconcile`, `destination-reopen`, `parent-sync-before-lease-removal`, `lease-removal`, `parent-sync-after-lease-removal`, or `cleanup`. The first semantic or durability failure remains `primary`. Later descriptor-close failures are collected separately in `cleanupFailures`, and every handle is closed at most once.

`leaseMayRemain` is deliberately more conservative than whether a path is visible now. It generally remains `true` until exact marker removal and the second parent fsync finish. If destination, stage, or parent close fails after the second fsync, publication durability is already complete, so a `cleanup` Indeterminate retains `leaseMayRemain: false`.

## 8. The receipt is content-agnostic and the trust boundary is narrow

This transaction verifies only a namespace lifecycle: inside a current-EUID-owned exact-private parent, the authorized stage inode moved exclusively to the destination and authorization-marker removal became durable in the parent directory. The receipt is frozen and binds the parent, destination, and lease identities plus basenames, but it carries no artifact content digest.

| What this PR demonstrates                                             | What this PR does not demonstrate                                                   |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Single-use authority transfer from the exact lease into a transaction | Authentication of the checkpoint MAC chain or result / manifest content             |
| Source / destination reconciliation after exclusive rename            | Successful training-row consumer callback and postflight / close                    |
| Destination reopen and metadata / protected-path revalidation         | Execution of the engine or correctness of a teacher score / label                   |
| Two-stage parent-directory durability for rename and marker removal   | A real dataset, trained weights, production int16, accuracy, Elo, rank, or strength |

Exact `0700` / `0600` and current-EUID checks reduce accidental exposure and writers under another UID, but they do not prove exclusion of root, ACL or pre-existing capabilities, or a hostile same-EUID actor. The caller must establish a separate trusted-writer critical section.

Therefore a valid publication receipt alone must not authorize consumption of the published directory as a teacher artifact. A later content finalizer must authenticate the checkpoint, result, manifest, and input / output bindings and revalidate the complete set after consumer postflight.

## 9. Synthetic evidence and current position

This change was tested only with temporary directories and a synthetic `work.jsonl`. The publication transaction suite passes 32 / 32 tests; the related stage-authorization, exclusive-rename, and proposal-checkpoint suites together pass 180 / 180. Coverage includes copied / proxied / duplicate claims, production / test registry isolation, close / begin ordering, commit / abort first-call-wins, throws before and after rename, receipt mismatch, every namespace truth-table branch, destination symlink / replacement / wrong mode, parent swap, both fsync failures, marker-removal failure, and descriptor-cleanup failure.

| Validation                                               | Result    |
| -------------------------------------------------------- | --------- |
| `floodgateTeacherStagePublication.test.ts`               | 32 / 32   |
| Publication + authorization + rename + checkpoint suites | 180 / 180 |

The fixture uses one synthetic private `work.jsonl` and verifies byte preservation only. It does not mean that this transaction verified the checkpoint MAC. No real Floodgate row, selection label, fresh final holdout, or legacy final holdout was provided as input. No engine search, teacher generation, training, or A/B match ran, so these test counts are not playing-strength evidence.

## 10. Next: an authenticated finalizer, then a synthetic coordinator

The next independent PR should build the post-consumer result and manifest from a MAC-authenticated proposal checkpoint and validate the exact file set, bytes, digests, and run / input / proposal / output cross-bindings. Its contract should allow only artifacts that pass that content finalizer to reach this transaction.

The following PR can then connect the training-row consumer, stable proposer, durable checkpoint, authenticated result / manifest finalizer, and publication transaction through one synthetic coordinator. Its synthetic failure matrix must close crash, retry, and stale-marker recovery before proceeding to production engine authority and a real teacher runner.

This PR's conclusion is narrow. It resolves the inability to compose `lease.close()` with rename by using exact ownership transfer and a first-call-wins transaction, then makes rename, namespace truth, destination reopen, parent fsync #1, exact marker removal, parent fsync #2, and final rechecks one durable namespace lifecycle. Content authentication, consumer postflight, engine, teacher, training, and strength remain incomplete. Do not overwrite evaluation weights yet; first close the authenticated finalizer and synthetic coordinator.
