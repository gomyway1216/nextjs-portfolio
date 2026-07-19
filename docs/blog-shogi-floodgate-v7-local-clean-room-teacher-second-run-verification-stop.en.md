# Local teacher attempt two: why it stopped after a correct copy

The second local teacher attempt on July 19, 2026 passed the Git restriction that stopped the first attempt. It then stopped during verification, before any teacher engine started. A complete byte audit and an isolated read-only reproduction proved that the cause was neither corrupt data, AWS, nor a timeout. Two safety contracts were incompatible.

The machine-readable record is pinned in [`data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json`](./data/floodgate-v7-local-clean-room-teacher-second-run-verification-stop-2026-07-19.json).

## 1. How far the attempt progressed

All five materialization operations completed. The raw lock, role lock, role bundle, and teacher assets were copied by value, and the accepted verifier was independently cloned. The standalone legacy file, which can only be created after all five operations fulfill, was present with an 08:21:13Z creation time. The stop therefore occurred in verification, not materialization.

Teacher processes, the 100-parent checkpoint, teacher rows, training, A/B games, and live-weight changes all remained at zero.

## 2. The copied data is not corrupt

The complete four-tree audit produced these results.

| Kind           |  files |         bytes | mismatches |
| -------------- | -----: | ------------: | ---------: |
| raw lock       | 72,698 |   592,412,617 |          0 |
| role lock      |      3 |   273,287,877 |          0 |
| role bundle    |      9 |   295,620,795 |          0 |
| teacher assets |      7 |    66,169,459 |          0 |
| total          | 72,717 | 1,227,490,748 |          0 |

Paths, types, modes, owners, link counts, and every byte matched. Source/destination inode aliases were zero. The verifier passed exact-HEAD, all 1,431 tracked-file byte checks, fsck, and missing-object checks.

## 3. Which verification failed

The same residual asset root passed its read-only authority verification in 36ms. Isolating the remaining role-bundle verification reproduced the failure after 522.211 seconds. This falls inside the original attempt's 503–533 second verification interval.

The safe substage is `role-lock-full-replay-watched-directory-closure-binding`. The classified error is `full-replay watched directories do not bind the live role-lock closure`.

## 4. Root cause

The historical full-replay evidence pins more than content. It records the original parent/root and three target files' `device / inode / ctime`. That is a strong defense against replacement of the live tree during verification.

The clean room independently requires copy-by-value with no source inode sharing. Correct destination files therefore have identical bytes but new inodes and ctimes. The system simultaneously required “must be the historical inode” and “must not share the historical inode,” so every correct clean-room copy was deterministically rejected.

## 5. Relationship to AWS, GCP, and Vercel

This attempt ran only on the local Mac. AWS was not required or used; AWS calls, credentials, and network requests were all zero. Firebase Cloud Functions is the application's GCP backend and Vercel serves the website, but neither participated in teacher generation or this diagnosis.

The CI job named `AWS witness adapter contract (source only)` statically checks an unused adapter contract. It is not evidence that an AWS runtime was started.

## 6. Diagnostic improvement added

The previous CLI exposed only the outer `phase=preparation`. Diagnostic commit `2caf94335d679139b977e9bacdacabca212a2624` adds a fixed `failure_kind` allowlist for five copy/materialization operations and two verification operations. It never publishes private paths, digests, or raw exception messages.

The related six test files pass 60/60 tests. This proves the diagnostic boundary, not teacher completion or playing strength.

The branch then integrated main `9dc5755a…`, including Fresh-QAT safety PR #514, through regular merge `74d825c1…`. The failure-kind implementation paths remained unchanged, the Fresh-QAT implementation paths still match merged main, and the package/evidence pins remain valid. Teacher starts, training runs, and live-weight changes during integration were all zero.

## 7. The next safe remediation

Simply deleting the historical inode check would weaken the evidence. The next change will add a portable transition:

1. Verify the historical full-replay closure against the original fixed role lock.
2. Internally bind that semantic/content authority to the exact copy-by-value receipts.
3. Verify the clean-room destination's fresh filesystem closure and every byte.
4. Reject source replacement, destination mutation, byte changes, forged capabilities, and replay.

Only after review, CI, and a regular merge will the residual clean room be audited and removed and the same local command retried. Live weights remain unchanged.
