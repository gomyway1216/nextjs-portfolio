# Closing result / manifest finalization and durable publication over authenticated work

> The [standalone work verifier](./blog-shogi-floodgate-stable-proposal-work-verifier.en.md) can reauthenticate a complete `work.jsonl` without writer state, the [consumer postflight capability](./blog-shogi-floodgate-consumer-postflight-capability.en.md) closes success of one exact consumer invocation into a single-use object, and the [stage publication transaction](./blog-shogi-floodgate-stage-publication-transaction.en.md) makes a content-agnostic directory publication durable. Kept separate, however, they cannot produce one success contract stating which consumer input was bound to the work used for result / manifest creation and which destination inode received those files. This PR adds a test-only finalizer that consumes an exact lease and exact postflight receipt, then composes HMAC-bearing `result.json`, HMAC-bearing `manifest.json`, exclusive publication, and destination-content revalidation. It does not use or read real training data, selection, or either fresh or legacy final holdout. It is not evidence of teacher labels, training, weight updates, or playing strength. Japanese version: [blog-shogi-floodgate-stable-proposal-finalizer.md](./blog-shogi-floodgate-stable-proposal-finalizer.md)

---

## Current boundary

| Item                           | Current status             | Meaning                                                                                                                     |
| ------------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Runtime authority              | Implemented for tests only | Transfers the exact test lease into a publication transaction and claims one exact test postflight receipt                  |
| Work content                   | Implemented                | Sends complete `work.jsonl` through the standalone verifier under an external run / key / stage context                     |
| Result / manifest              | Implemented                | Builds deterministic canonical JSON with finalizer-specific HMACs, then file-syncs and stage-directory-syncs each in order  |
| Crash resume                   | Implemented                | Distinguishes `{work}`, `{work,result}`, `{work,result,manifest}`, and deterministic byte prefixes of the metadata files    |
| Namespace publication          | Implemented                | Uses the existing transaction for exclusive rename and two-stage parent sync                                                |
| Postpublication audit          | Implemented                | Reopens the destination and all three files, rechecking inode, mode, bytes, SHA-256, work HMACs, and consumer cross-binding |
| Production entry point         | Not implemented            | The only API is `CoreForTests`; it cannot use the production lease / postflight registries or fixed production dependencies |
| Engine / teacher / training    | No evidence                | Does not prove engine-process identity, teacher scores, labels, weights, loss, or QAT / int16                               |
| Real data / holdout / strength | Unread and unmeasured      | No real rows, selection, final holdout, games, Elo, rank, or stable high-dan play were evaluated                            |

The success contract, status, and claim boundary are fixed as follows.

```text
shogi-floodgate-stable-proposal-finalization-publication-v1
verified-consumer-postflight-authenticated-work-durable-manifest-and-exclusive-publication
test-only-synthetic-consumer-work-content-and-private-namespace-publication-evidence-not-teacher-label-training-or-playing-strength-evidence
```

## 1. Why finalization and publication form one lifecycle

Standalone work verification, consumer postflight, and namespace publication are each necessary but insufficient alone. A work-verification receipt carries neither an active lease nor current filesystem authority. A postflight receipt proves no staged output. A publication receipt does not read published file content. A caller-assembled record containing fields from all three is still not bound to the exact successful runtime capabilities.

The finalizer fixes one operation order.

```text
exact test lease -> publication authority transfer
exact test postflight receipt -> single-use claim
work.jsonl -> complete HMAC verification + consumer-input cross-binding
result.json -> file sync -> stage-directory sync
manifest.json -> file sync -> stage-directory sync
exact source-set revalidation
exclusive directory publication
destination reopen -> exact content revalidation
```

On failure before commit begins, it aborts the transaction and does not delete a deterministic prefix that has already become durable. After commit begins, it performs neither a blind retry nor pathname cleanup and requires publication reconciliation. A success receipt therefore excludes the gap in which a manifest exists but its corresponding publication is unknown.

## 2. Single-use composition of the exact lease and postflight capability

The only entry point is `finalizeAndPublishFloodgateStableProposalsCoreForTests(...)`. It first calls `beginFloodgateTeacherStagePublicationCoreForTests(lease, ...)`, synchronously transferring ownership of the exact active test lease into a publication transaction. The existing transaction registry rejects a copy, Proxy, production lease, closed lease, or second begin. The original `lease.close()` cannot recover authority after the transfer.

It then single-use claims the exact test postflight receipt through `claimVerifiedFloodgateTrainingConsumerPostflightCoreForTests(...)`. The receipt must contain all of the following:

- the exact schema, status, and claim boundary issued by the test-only injected bundle verifier
- the training role and consumer-input binding
- callback settlement without a value
- successful post-callback filesystem-snapshot revalidation
- closed raw and root input descriptors

Exact object identity cannot be persisted in a file. `result.json` stores the canonical structural projection strictly captured after the successful claim. During resume, that disk projection does not resurrect the old exact authority. A new invocation must claim a fresh exact test postflight receipt and rederive the same deterministic payload.

There is no production entry point in this PR. It closes only the synthetic composition contract while preserving the separation between production and test authority.

## 3. Cross-binding authenticated work to consumer input

The finalizer opens the stage with `O_NOFOLLOW | O_DIRECTORY` and requires the same device and inode as the authorization receipt, current-EUID ownership, and exact mode `0700`. The initial entry set must be one of the following.

```text
{work.jsonl}
{result.json, work.jsonl}
{manifest.json, result.json, work.jsonl}
```

A manifest preceding its result, a missing `work.jsonl`, or an extra entry is not repaired automatically and requires manual content reconciliation. `work.jsonl` must be a current-EUID-owned, exact-`0600`, single-link regular file no larger than 64 MiB.

The received bytes enter the [standalone verifier](./blog-shogi-floodgate-stable-proposal-work-verifier.en.md), which reauthenticates the header, every proposal, seal, and producer receipt under an external 32-byte root key, `runId`, `keyId`, and exact stage-authorization receipt. The finalizer then compares the semantic projection's `authenticated_training_binding` exactly, as canonical JSON, to the postflight receipt's consumer `binding`. It also requires equality among the input record count, consumer-binding record count, and sealed proposal-output count.

Two kinds of identity remain separate.

- Exact work evidence identifies file bytes / SHA-256, run, key, stage, and the authenticated header / seal.
- The semantic-binding SHA-256 identifies producer input / output meaning without stage, run, key, or operational variation.

Result and manifest bind both in separate fields. Equal semantic bindings do not authorize bytes from another stage, and distinct exact work hashes do not by themselves establish distinct proposal meaning.

## 4. Making `result.json` durable first

The finalizer derives a 32-byte finalizer key from the root key and run ID under HKDF info distinct from the checkpoint key.

```text
HKDF info: shogi-floodgate-stable-proposal-finalizer-key-v1\0
result domain: shogi-floodgate-stable-proposal-result-v1\0
manifest domain: shogi-floodgate-stable-proposal-manifest-v1\0
```

`result.json` is canonical single-line JSON under `shogi-floodgate-stable-proposal-result-v1`. It contains:

- the finalization claim boundary, algorithm, run ID, and key ID
- the strictly captured consumer postflight receipt
- the work-verifier contract / status / claim boundary and exact work / stage evidence
- the checkpoint schema / status
- the proposal schema / status / claim boundary, proposal-receipt SHA-256, and semantic run fingerprint
- the semantic-binding domain / SHA-256
- `result_mac`, a domain-separated HMAC-SHA-256 over the unsigned canonical object

The file is created with `O_CREAT | O_EXCL | O_NOFOLLOW` and mode `0600`, then passes `fchmod(0600)`, deterministic-byte writes, file sync, exact-byte reread, and held stage-directory sync in that order. Its descriptor remains held through source and destination revalidation. If the file already exists, only a byte prefix of the expected payload is resumable. A zero-byte or partial-byte prefix may be completed. A single differing byte, excess length, or wrong owner / mode / type / link count preserves the existing bytes and stops.

Here, `result` means the result of binding consumer postflight to authenticated proposal work. It is not a game result, training result, teacher score, or label.

## 5. Using `manifest.json` as the final content commit marker

The finalizer creates `manifest.json` only after both the file sync and stage-directory sync for `result.json` complete. Its schema is `shogi-floodgate-stable-proposal-manifest-v1`, and it binds:

- run ID, key ID, algorithm, and claim boundary
- authorization contract / trust boundary, parent / stage identity, and stage / destination basenames
- the exact final entry list: `manifest.json`, `result.json`, and `work.jsonl`
- filename, device / inode, mode, bytes, and SHA-256 for `work.jsonl` and `result.json`
- canonical consumer-postflight SHA-256
- proposal-receipt SHA-256
- semantic-binding SHA-256
- `manifest_mac`, computed under a separate domain over the unsigned manifest

The manifest follows the same exclusive-create, deterministic-prefix resume, file sync, exact reread, and stage-directory sync sequence as the result. It does not circularly include its own SHA-256. The outer success receipt records the final manifest file's inode, bytes, and SHA-256 after the file exists.

After manifest directory sync, the finalizer rechecks that the source stage has exactly three entries, that the stage descriptor still names the authorized inode, and that the held descriptors and pathnames for all three files still have the same identity, owner, mode, link count, and bytes. Publication does not begin until this source revalidation succeeds.

## 6. Explicit crash and resume states

The finalizer's resume unit includes a deterministic metadata-file byte prefix, not only a complete file.

| Observed state                                  | Action                                                                                                          |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `{work}`                                        | Reauthenticate and cross-bind work, then create result and manifest in order                                    |
| `{work,result-prefix}`                          | If result is an exact prefix of this invocation's expected bytes, append and sync before proceeding to manifest |
| `{work,result}`                                 | Recheck exact result bytes, then create manifest                                                                |
| `{work,result,manifest-prefix}`                 | Require a complete result, then append an exact expected manifest prefix and revalidate it                      |
| `{work,result,manifest}`                        | Match all three files to expected bytes / identities and proceed to publication without rewriting               |
| Manifest present with incomplete result         | Do not resume automatically; require manual content reconciliation                                              |
| Prefix mismatch / excess length / extra entry   | Preserve existing bytes and require manual content reconciliation                                               |
| Symlink / hard link / wrong mode / owner / type | Fail closed and perform no pathname cleanup                                                                     |

Repairing a partial work prefix or torn work tail is not this finalizer's responsibility. If complete work verification fails, control returns to the checkpoint writer's resume boundary. Result / manifest resume is not anti-rollback either. There is no external monotonic counter, so the finalizer does not claim detection of rollback to an older valid deterministic state.

## 7. Revalidating destination content after exclusive publication

After verifying the complete source set, the finalizer calls `commit()` on the existing publication transaction. That transaction owns exclusive rename, source / destination inode reconciliation, destination-directory reopen, parent fsync #1, exact authorization-marker removal, and parent fsync #2. Because its receipt alone is content-agnostic, the combined finalizer does not return success at that point.

After receiving the publication receipt, the finalizer itself reopens the destination with `O_NOFOLLOW | O_DIRECTORY` and matches the published destination identity, current-EUID owner, and exact mode `0700`. It then:

1. requires the exact entry set `manifest.json`, `result.json`, and `work.jsonl`;
2. reopens each file with `O_NOFOLLOW` and matches the source-held device / inode, exact mode `0600`, link count one, and bytes;
3. reruns standalone verification over the published `work.jsonl` under the root key, run, key, and original authorization receipt;
4. cross-binds the published work to the captured postflight receipt again; and
5. returns the combined receipt only after every destination-side handle closes successfully.

The success receipt closes each file's inode / bytes / SHA-256, consumer-postflight SHA-256, proposal-receipt SHA-256, semantic-binding SHA-256, publication receipt, `destination_reopened: true`, exact entries, and `content_reverified: true` into one deeply frozen object.

## 8. Typed failure separates persistence from publication

`FloodgateStableProposalFinalizerError` retains recovery facets instead of collapsing them into one Boolean.

```text
phase, observedState, workVerified, postflightClaimConsumed,
durability, mayHavePersisted, mayHavePublished,
publicationDurability, destinationReopened, leaseMayRemain,
retryDisposition, primary, cleanupFailures[]
```

Phases distinguish authority transfer, postflight claim, work verification, result / manifest persistence, source revalidation, publication, destination revalidation, and cleanup. Durability also advances in stages from unsynced work through complete-set directory sync.

Before commit begins, a failure attempts transaction abort. If abort becomes durable and the content still matches the expected prefix, a fresh lease and fresh exact postflight authority may resume the preserved result or manifest. If abort or lease cleanup fails with `leaseMayRemain: true`, the error uses `manual-lease-reconciliation-required`. If authority transfer itself could not start, `caller-must-reconcile-existing-lease-authority` records that the original lease may remain caller-owned. A mismatch, extra entry, or manifest / result ordering violation becomes `manual-content-reconciliation-required`.

The wrapper does not classify every exception after commit starts as published. When the existing transaction proves definitely-not-committed, it preserves `mayHavePublished: false`. An indeterminate transaction or an audit failure after successful commit uses `mayHavePublished: true` and `manual-publication-reconciliation-required`. If publication and lease state are both indeterminate, `manual-publication-and-lease-reconciliation-required` requires both checks. Every path carries forward publication durability and lease facets, while storing primary and cleanup failures separately.

## 9. Synthetic evidence and explicit non-claims

Only synthetic fixtures were used for the focused, related-boundary, full-regression, Python-audit, typecheck, lint, and build runs. No real data or holdout was opened.

| Validation                                                        | Measured result                      |
| ----------------------------------------------------------------- | ------------------------------------ |
| Focused finalizer suite                                           | 16 / 16 pass                         |
| Finalizer + checkpoint + postflight + publication boundary suites | 85 / 85 pass                         |
| Full Vitest regression                                            | 1,731 / 1,731 pass                   |
| Python stdlib ML audit                                            | 58 / 58 pass                         |
| TypeScript / scoped ESLint / Prettier                             | pass / 0 warnings / pass             |
| Full ESLint                                                       | 0 errors / 157 pre-existing warnings |
| Next production build                                             | pass                                 |

| What success at this boundary establishes                                                              | What it does not establish                                                                              |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Single-use composition of the exact test lease and exact test postflight receipt                       | Production runtime authority or production-deployment readiness                                         |
| Authentication of complete work under external key / run / stage context and binding to consumer input | Execution of the required search by a particular engine binary / process                                |
| Durable deterministic result / manifest with HMACs and an exact three-file set                         | Correctness of a proposal as a teacher score / label                                                    |
| Revalidation of destination bytes / inodes after exclusive private publication                         | An OS sandbox against hostile same-EUID actors, root, ACLs, or pre-existing capabilities                |
| A synthetic content / namespace composition contract                                                   | A real dataset, weight update, improved loss, QAT / int16, accuracy, Elo, rank, or stable high-dan play |

The HMAC authenticates a canonical binding constructed by a key holder. It proves neither non-repudiation, key secrecy, engine identity, source truth, nor anti-rollback. An exact postflight claim establishes the consumer-input lifecycle, not the truth of staged output or labels. `Publication` means namespace publication inside a private `0700` destination, not public internet availability.

The test core is scoped to synthetic keys, synthetic work, synthetic postflight, and temporary directories. It reads no real Floodgate row, selection label, fresh final holdout, or legacy final holdout. It runs neither YaneuraOu depth-16 v7 search, training, nor an A/B match. It changes no model-weight byte and does not overwrite the existing evaluation function.

## 10. Next: the synthetic coordinator, then the production teacher

This finalizer closes consumer postflight, authenticated proposal work, result / manifest durability, exclusive publication, and destination-content audit into one test-only success receipt. The next step is to connect the training-row consumer, stable proposer, checkpoint writer, standalone verifier, and this finalizer through one synthetic coordinator, then exercise every phase's crash, retry, stale marker, and manual-reconciliation path in an end-to-end failure matrix.

A production entry point, pinned YaneuraOu depth-16 v7 engine authority, a real teacher-label schema, independent rescore, and real-data execution still follow. Only after three-seed retraining, QAT / int16 export, frozen selection, sealed final holdout, paired A/B, and 81Dojo calibration can playing strength be evaluated.

“Complete” here applies only to consumer-work-content-publication composition inside a synthetic test boundary. Neither the teacher nor the evaluation function is complete, and there is still no evidence of stable high-dan strength.
