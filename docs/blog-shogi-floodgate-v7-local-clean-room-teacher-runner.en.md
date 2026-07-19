# An explicit local teacher runner with no AWS — Floodgate v7

> The argumentless `shogi:floodgate-v7-local-clean-room-teacher` command now exists. It is an entry point for teacher generation only inside a home-external clean room on the local Mac; it uses no AWS, Firebase/GCP, Vercel, network, production worktree, or live weight. At final review, real teacher runs, generated parents, network requests, AWS calls, finalizers, training, A/B, and live changes were all zero. Japanese version: [blog-shogi-floodgate-v7-local-clean-room-teacher-runner.md](./blog-shogi-floodgate-v7-local-clean-room-teacher-runner.md)

## 1. Conclusion

The answer to “why AWS?” is that **this runner does not use AWS**. The repository retains a dormant, unconnected, source-only AWS witness-adapter contract that was added only as a possible future option, but the local teacher command does not import it, receive AWS credentials, or give network controls to its child processes. AWS accounts, SDKs, resources, deployments, and costs are all zero.

What now exists is a source boundary that copies fixed inputs by value outside the home directory, revalidates them, owns real stable WASM and real YaneuraOu locally, and advances one authenticated stream through 100 → 500 → 24,000 parents. The command has been added, but it has completed zero real runs. The evaluator and playing strength therefore remain unchanged.

| Item                         | Measured state     |
| ---------------------------- | ------------------ |
| Package command              | Added              |
| Successful real teacher runs | 0                  |
| Completed parents / rows     | 0 / 0              |
| Network / AWS calls          | 0 / 0              |
| Finalizer / training         | 0 / 0              |
| Formal A/B / calibration     | 0 / 0              |
| Live-weight changes          | 0                  |
| Decision                     | `STOP-NOT-YET-RUN` |

## 2. The local-only boundary fixed by the command

There is one entry point, and it accepts no additional arguments.

```text
npm run shogi:floodgate-v7-local-clean-room-teacher
```

Importing its module does not start the runner; only direct invocation reaches the CLI. CLI success requires the exact object that the real runner alone registered in a module-private `WeakMap`, claimed once. A test callback returns an explicitly `operational_evidence: false` receipt. A same-shaped forgery, clone, or replay cannot become operational success.

If a real run starts, it first checks the fixed clean room, pinned verifier revision, post-copy revalidation, role bundle, and teacher assets. Capacity is measured twice—before the private copy and again before the teacher process—but only the fixed 20 GiB threshold result is exposed, never the exact capacity or path.

## 3. 100 → 500 → 24,000 is one stream

The three numbers are not separate datasets totaling 24,600 parents. Three separate single-use authorities extend one authenticated stage/work stream.

| Gate               | Resume | New parents | Reached prefix | Sealed |
| ------------------ | -----: | ----------: | -------------: | :----: |
| durable-prefix-100 |      0 |         100 |            100 |   no   |
| durable-prefix-500 |    100 |         400 |            500 |   no   |
| sealed-final-24000 |    500 |      23,500 |         24,000 |  yes   |

After each gate, the runner requires the same run key, stage identity, and 100/500 milestone chain. Work bytes must increase and its digest must change on every advance. The next authority is not issued until the exact preceding receipt has been claimed. The 100- and 500-parent points are durable checkpoints, not label-finalization inputs.

## 4. The handoff is not the finalizer

The runner still does not publish labels after reaching 24,000. The order is fixed:

1. validate same-stream continuity across all three receipts and the sealed final;
2. await completion of the runtime owner's `close()`; and
3. only then write the private `finalizer-handoff.json`.

If `close()` fails, zero handoffs are published. The handoff binds the sealed work to the local integrity key, but it grants no label, weight, match, or live-activation authority. A separate explicit finalizer command must revalidate the same sealed work before the next stage. Finalizing either the 100- or 500-parent prefix is forbidden.

## 5. Defenses confirmed by exact review

A private file is protected by held parent/file descriptors, `O_NOFOLLOW | O_EXCL`, matching ownership, mode `0600`, `nlink == 1`, and before/after device, inode, path, and parent identity checks. File rename, symlink swap, same-content replacement, parent replacement, and hardlink probes were rejected.

Git and engine child environments are rebuilt from exact allowlists. They inherit no AWS, Firebase, Vercel, proxy, SSH, credential-helper, hook, or filter controls, and the repository check rejects promisor/lazy and missing objects. A closure scan found 51 local modules with only Node built-ins as external imports. Two textual `fetch` definitions were present, but zero were reachable from local-runner execution. An import side-effect trap also observed zero events.

## 6. Measured validation

The reviewed remediation was commit `5e4f42d8a8a38bf7790cbff91dd6cd8a32b6fe49` (tree `6b882b8cea5a3a9322b4649e824ccd524090cfc8`). The post-main-integration snapshot was merge commit `30663f7f496382a0f9082d22cc2c8fb09a10dca7` (tree `1ef5aa8c0626d8b5c08795bf6a9852601a1712be`). The integration merge did not change the reviewed paths.

| Validation                                  | Result                  |
| ------------------------------------------- | ----------------------- |
| Focused Vitest                              | 4 files / 43 tests PASS |
| Changed source/test lint                    | 8 / 8 PASS              |
| Custom adversarial probes                   | 15 / 15 PASS            |
| Import side-effect events                   | 0                       |
| Unresolved findings P0 / P1 / P2            | 0 / 0 / 0               |
| Real teacher / network / AWS / live actions | 0 / 0 / 0 / 0           |

The 15 probes covered test-receipt elevation, CLI/brand forgery, one-shot replay/clone, private parent replacement/hardlink, five Git configurations, a missing object, extra AWS engine environment, and an extra CLI argument. These are source and synthetic/test-seam safety results, not evidence that 24,000 real parents were processed.

## 7. What has not happened

This change connects teacher generation to an **executable safety boundary**. It has not performed:

- the real clean-room copy or 100 → 500 → 24,000 parent generation;
- label publication by a separate finalizer over the sealed work;
- retraining a separate candidate without overwriting live weights;
- candidate selection;
- formal A/B;
- external calibration;
- rollback rehearsal; or
- live deployment or activation.

The next step is to close review and CI for the source, articles, and machine-readable evidence, then invoke the explicit local command. Even after 24,000 labels exist, live weights must remain unchanged until training, candidate selection, formal A/B, external calibration, and rollback evidence are complete.

Machine-readable evidence: [floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json](./data/floodgate-v7-local-clean-room-teacher-runner-2026-07-19.json)
