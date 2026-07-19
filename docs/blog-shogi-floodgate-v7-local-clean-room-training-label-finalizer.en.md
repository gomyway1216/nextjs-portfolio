# A Mac-local label finalizer that accepts only the sealed 24,000-parent handoff

> The Floodgate v7 clean-room teacher runner advances one authenticated stream through 100, 500, and 24,000 parents, then deliberately stops after writing a sealed handoff. This change adds a separate, explicit Mac-local command that accepts only that handoff and composes the existing production sealed scanner and training-label finalizer. It uses no AWS, Firebase / GCP, Vercel, HTTP, real teacher generation, optimizer training, weight update, match, or live activation. Japanese version: [blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.md](./blog-shogi-floodgate-v7-local-clean-room-training-label-finalizer.md)

## 1. Where AWS is used

AWS is not used by this finalizer. Firebase Cloud Functions belongs to GCP, and Vercel is a Web deployment target, but this operation connects to neither. It handles only a fixed private directory on the Mac, local engine assets, verified training input, and a local stage directory. It imports no network client or cloud SDK.

Other designs in the repository may discuss an AWS witness or an external supervisor. Those are separate external-trust boundaries, not prerequisites for generating and finalizing labels locally. This change does not claim a universal proof that the host is not on AWS; its narrower, testable claim is that this command invokes no AWS API, Firebase / GCP service, Vercel service, or network operation.

## 2. Why finalization is separate

The 100- and 500-parent checkpoints are durable prefixes for validating throughput and resume behavior. They must not be published as training datasets. Even after the same work reaches a sealed 24,000-parent state, letting the teacher runner publish labels in the same long-lived process would mix several boundaries:

- prefix verification and final publication;
- checkpoint-key and label-finalizer authority;
- training-input postflight;
- stage-lease ownership transfer;
- postpublication destination audit.

The teacher runner therefore records the fixed key ID, exact run binding, stage identity, work bytes and SHA-256, and ordered 100 / 500 / 24,000 completion receipts in an HMAC-authenticated private handoff. It exits with `labels_finalized=false`. Only the new command may consume that handoff, and anything other than the sealed 24,000-parent work is rejected.

## 3. Fixed execution boundary

The dedicated package command is argumentless:

```sh
npm run shogi:floodgate-v7-local-clean-room-training-label-finalizer
```

The real handoff command has not been invoked by this change. This is not an instruction to run it before CI, independent review, regular merge, and the safely gated teacher run are complete.

Before opening any private file, the operational entry checks Darwin, a non-root current EUID, the repository root, the dedicated entry file, `require.main`, and the exact no-argument `argv`. Linux, imported calls from another script, and extra arguments stop in the `capture` phase.

Independent review also found that the former exported test seam accepted executable callbacks as dependencies. A caller could supply production-shaped callbacks and bypass both this operational context and the claim described below. The remediated test seam **accepts no executable dependencies**. It accepts only module-defined, fixed in-memory scenario names and cannot reach production authority. The only path to real stage authorization, scanning, and publication now requires a module-private one-shot grant, which is minted only after the operational command context passes and the durable claim is committed. A regression test passes production-shaped functions and confirms that none is called before the safe seam stops.

It then reads exactly two files from fixed private state:

- the 32-byte local integrity key;
- canonical `finalizer-handoff.json`.

The directory must be current-owner `0700`; each file must be current-owner, single-link `0600`. Files are opened with `O_NOFOLLOW`, and the held descriptor is compared with the named path for device, inode, size, mtime, and ctime before and after reading. Public receipts disclose no private path, key, MAC, run ID, or row content.

## 4. Exact handoff validation

Before stage authorization, the finalizer requires all of the following:

| Subject     | Requirement                                                                     |
| ----------- | ------------------------------------------------------------------------------- |
| Framing     | UTF-8, one line, trailing LF, canonical JSON, no extra field                    |
| Integrity   | fixed-domain HMAC-SHA256 with the 32-byte local key                             |
| Deployment  | current fixed deployment-checkpoint key ID                                      |
| Run binding | fixed plan, producer control, runtime receipt digests, canonical binding digest |
| Stage       | fixed basename and exact parent / stage device and inode                        |
| Work        | fixed filename, bytes / SHA-256, 24,000 parents, resume 500, sealed=true        |
| Input       | accepted verifier revision, training role, 24,000 parents                       |
| Completion  | exact prefix 100 → prefix 500 → sealed final 24,000 order                       |
| Claims      | every cloud / network / training / weight / match / strength claim is false     |

Even a correctly re-MACed handoff is rejected if it describes 100 or 500 parents, unsealed work, a different stage, key, or binding, reordered completion, or a cloud-use claim. The fixed handoff is read and compared again immediately after stage authorization and again before the sealed plan is minted.

## 5. Replay rejection across restarts

The first implementation remembered used MACs in a process-local `Set`. A CLI restart clears that set, so the same handoff could be accepted again after a failure that occurred before stage authorization. Independent review found this defect, and the process-local guard was removed.

Before stage authorization, the finalizer now creates `finalizer-handoff.claimed.json` exactly once in fixed private state:

- `O_NOFOLLOW | O_CREAT | O_EXCL`;
- owner-only `0600`;
- SHA-256 of the handoff MAC, rather than the MAC itself, plus run-binding and work digests;
- file `fsync` after writing;
- directory `fsync`;
- held/named device and inode, mode, link count, size, and canonical content revalidation.

Once one process durably creates the claim, the next process fails at `O_EXCL`. A failed attempt never removes the claim; a fresh authenticated handoff or manual reconciliation is required. A dynamic test starts independent processes and proves that the first claim succeeds while the restart-equivalent replay is rejected.

## 6. Composition of existing production APIs

After handoff validation, the implementation does not duplicate finalization logic. It composes the existing APIs in order:

1. fixed stage authorization;
2. pinned training-row consumption and postflight;
3. authenticated sealed-work scanning and plan minting;
4. exact-prefix training-label finalization;
5. exclusive destination publication and destination-content revalidation.

The success receipt exposes only 24,000 parents, the training-record count, and bytes plus SHA-256 for work, train, result, and manifest. The real file evidence also carries filenames, devices, inodes, and `0600` modes; those fields are checked exactly and then omitted from the public receipt.

There is no path that mints a plan from prefix 100 or 500. Work bytes and SHA-256 come directly from the handoff, while the exact run ID, deployment key ID, and run binding are passed to the production plan composer.

## 7. Failure ownership

| Failure point                                 | Behavior                                                                    |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| Stage binding or before consumer composition  | close the caller-owned lease                                                |
| Plan minted, then consumer postflight fails   | discard the plan through the production discard API                         |
| Plan composer throws without returning a plan | do not guess the ownership transition; require manual reconciliation        |
| After finalizer invocation                    | report that publication may have occurred and require manual reconciliation |
| Final receipt mismatch                        | stop as a publication-sensitive failure                                     |

Before the composer's begin point, the caller owns the lease; after begin, the scanner transaction owns it. A throw does not reveal which side of that transition occurred. Closing from the outer layer could therefore double-close or race publication, so conservative manual reconciliation is the correct behavior.

## 8. Local validation

The prerequisite teacher-preparation PR #512 was regularly merged into `origin/main` at `88afd052` and then integrated into this branch through regular merge commit `4855f099`. Conflict resolution preserved PR #512's fixed Git execution and local-configuration rule that permits only `http.postBuffer`, while retaining the finalizer package command. No real teacher, finalizer, training, or live operation ran during this integration.

| Validation                                |         Result |
| ----------------------------------------- | -------------: |
| Dedicated adversarial and lifecycle tests |   27 / 27 PASS |
| Evidence-pin consistency tests            |     4 / 4 PASS |
| Related test files                        |             21 |
| Related tests                             | 199 / 199 PASS |
| Related-suite wall time                   | 141.35 seconds |
| Targeted ESLint                           |           PASS |
| Prettier check                            |           PASS |
| New source/test TypeScript errors         |              0 |
| Real fixed-path finalizer invocations     |              0 |

The adversarial cases include a wrong MAC, key, binding digest, binding content, stage, prefix 100 / 500, unsealed work, wrong resume point or input role, reordered completion, cloud claim, extra or duplicate keys, noncanonical JSON, mid-flight mutation, cross-process replay, simulated Linux, executable-dependency injection, and consumer / plan / finalizer failures.

The evidence JSON is now executable evidence rather than prose alone. A hermetic test recomputes the integrated implementation commit and tree including PR #512, both merge parents and ancestry, bytes, SHA-256, and Git blobs for four implementation files, required source markers, the aligned Japanese and English boundary statements, and the zero operational state. A stale hash or article therefore fails the test when implementation changes. Because an evidence-only commit cannot pin its own hash without circularity, the pins deliberately identify the immediately preceding final implementation commit.

The default Turbopack build stopped before compilation because this worktree's `node_modules` symlink points outside the worktree root. A webpack build compiled successfully in 28.6 seconds, then stopped during type-checking on the pre-existing unrelated `verifyPasscode` export in `src/app/api/settli/groups/route.ts`. A full repository production-build pass is therefore not claimed.

## 9. Current state and next step

This change has not altered playing strength. Real teacher processes, the 24,000-parent work, final label publication, optimizer training, candidate selection, formal A/B, external calibration, and live-weight activation all remain unexecuted.

This branch, with PR #512 integrated, is now published as ready-for-review [PR #513](https://github.com/gomyway1216/nextjs-portfolio/pull/513), but it has not been merged. The next step is independent review, CI, and a regular merge of PR #513. Only then should the Mac-local clean-room teacher run advance through 100 → 500 → 24,000 and hand the sealed result to this separate command. The resulting dataset must be verified before three-seed retraining, selection, formal A/B, and external calibration. Stable high-dan strength remains unproven until those match results exist.

Machine-readable evidence: [floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json](./data/floodgate-v7-local-clean-room-training-label-finalizer-2026-07-19.json)
