# Floodgate v7 portable copy held role-bundle: reading the exact 9 files through held descriptors

> Conclusion as of 2026-07-19: this change adds the last safety foundation before real labels. A copied role bundle is now read through one held root descriptor and exactly nine held file descriptors, with SHA-256, explicit EOF, and post-callback identity checks. The snapshot exposes no path, FD, device, or inode; it uses a synchronous one-shot claim, zeroizes retained buffers after callback settlement, closes every handle, and finishes with composite postflight. The direct playing-strength effect of this PR / current gate execution is zero. Real teacher work, sealed or final labels, training, candidate selection, formal A/B, and live-weight changes by this PR also remain zero. This is not a claim that no teacher attempt exists anywhere in project history. The next separate step is the first 100 real labels under the existing gates. Japanese version: [blog-shogi-floodgate-v7-portable-copy-held-role-bundle.md](./blog-shogi-floodgate-v7-portable-copy-held-role-bundle.md)

## The added boundary

The `role-bundle-tree` accepts only these nine root files:

1. `fresh-final-holdout.protected-position-ids.txt`
2. `fresh-final-holdout.raw.jsonl`
3. `fresh-selection.protected-position-ids.txt`
4. `fresh-selection.raw.jsonl`
5. `manifest.json`
6. `replay-excluded-position-ids.txt`
7. `replay-exclusion-receipt.json`
8. `training.protected-position-ids.txt`
9. `training.raw.jsonl`

After composite precheck, the implementation opens the root with `O_DIRECTORY | O_NOFOLLOW` and all nine files with `O_NOFOLLOW`. It matches every descriptor to the private inventory, reads every byte, checks SHA-256 and explicit EOF, and performs post-callback `fstat`. It then zeroizes retained buffers, closes all nine file handles and the root handle, and runs composite destination postflight. A partial open, callback failure, zeroization failure, close failure, or postflight failure cannot return success, and every opened handle is drained.

The exact snapshot keys are `files`, `manifestBytes`, and `trainingRawBytes`. Each file identity contains only `filename`, `bytes`, and `sha256`. `manifest.json` is capped at 65,536 bytes and `training.raw.jsonl` at 67,108,864 bytes. A zero-byte non-retained file is valid when its SHA-256 and EOF match. The byte views remain readable until the callback Promise settles and are then zeroized. This does not erase caller-created copies and is not a general secrecy proof.

The low-level claim is synchronous and one-shot. Replay, clones, proxies, microtask-late use, and production/test registry confusion fail closed. The owner path additionally binds one underlying claim to the exact owner and bound bridge, shares serialization with generic borrows, rejects cross-owner use, and invalidates on reentry or revocation.

## Explicit nonclaims

The reported SHA-256 establishes equality with the copied destination inventory. It is not yet the SHA-256 or record identity authenticated by the generic source semantic verifier. This change does not validate manifest semantics or training-row semantics, provide callback-time absolute-path namespace exclusivity, or prevent a callback from reading a separately retained path.

The following counters cover **only this PR / current held role-bundle gate execution**, not cumulative project history:

| Operation                                    | Count |
| -------------------------------------------- | ----: |
| real source semantic verification            |     0 |
| real copy or destination consumer            |     0 |
| teacher process or teacher label             |     0 |
| optimizer training or candidate selection    |     0 |
| holdout, formal A/B, or external calibration |     0 |
| weight change, live activation, or match     |     0 |

AWS was neither required nor used. Firebase Cloud Functions / GCP, Vercel evaluator compute, and runtime or unit-test network use are also zero. GitHub CI and a Vercel web preview are source-control or web-deployment checks, not shogi teacher or training compute.

The known historical context is separate: prefix-100 was started once on 2026-07-16 and stopped safely after 1,597 seconds. That run preserved three authenticated parent records in a four-line file including its header. It did not complete 100, and sealed or final labels, training, formal A/B, and live activation remained zero. This prior run is not added to the current-gate counters above and is not execution performed by this PR.

## Measurements and identity pins

On Node v22.13.0, the pre-evidence related regression passed 94 / 94 tests across six files in 3.21 seconds. The owner file passed 37 / 37 in 1.66 seconds, and the dedicated held test passed 11 / 11. The focused regression with evidence passed 99 / 99 tests across seven files. Independent review of the validated base found P0 / P1 / P2 / P3 = 0 / 0 / 0 / 0.

A later Gemini Code Assist medium finding identified that a legal short read from a normal file descriptor was rejected immediately. Review-fix revision `177e4b88a2a7fc830269f5e38b8ff65498c9875c` now accumulates positive positional reads until the requested chunk is complete and rejects only zero progress or a count beyond the request. It adds a regression test, and seven files passed 100 / 100 tests on Node v22.13.0. The implementation is fixed, but the GitHub thread remained unresolved at recording time, so its status is `fixed-awaiting-thread-resolution`; zero unresolved threads remains required before merge.

The low-level introduction revision is `7418a4f8262137e058eafd081eeae3d72dd01fca`; the validated revision including owner binding is `4aac34df6b65beeade12722fd116f6ce39a2105a`. Evidence preserves the five historical file pins from that validated revision, never mutable HEAD, and adds the two review-fix files as a separate layer instead of overwriting the base.

| File                                                          |   Bytes | SHA-256                                                            | Git blob                                   |
| ------------------------------------------------------------- | ------: | ------------------------------------------------------------------ | ------------------------------------------ |
| `ml/floodgate-v7-clean-room-copy.ts`                          | 101,566 | `71059b52666292654a6d1f556dbb6aa1aad97e915d603aaffca3945f4c2503f4` | `1b5cc466b9bdc19be2f77253090faa7930061e75` |
| `ml/floodgate-v7-portable-copy-owner.ts`                      |  43,192 | `c781320bc91dae97b87c8bfbb9ac31ac5f169dec4000bf4d800cb72b662b5312` | `72aa74d709b957dabeac76364c129a9e7ca06219` |
| `tests/unit/ml/floodgateV7PortableCopyWitness.test.ts`        |  38,656 | `8db59f7f3261f16f38ac498e215d8df7611a18c041ab30a3ca97634b563f5570` | `db6b2ca96760f4c979542dd607eb8e5280d409a8` |
| `tests/unit/ml/floodgateV7PortableCopyOwner.test.ts`          |  47,856 | `de728a71209cc841a4691c14cd3a6b121c9d85c6959c0eae1edf7893d009a3f8` | `059767f9a9e15c1d93d229d38634b439076bf7d7` |
| `tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts` |  25,719 | `fb87bd1229c0e9c4ad1c134fc03bb8ad19eeaecebf2e440eef7cdafe1a544418` | `07f1f8d4fdc7597c4ca9625ed030007fde0158aa` |

| Review-fix file                                               |   Bytes | SHA-256                                                            | Git blob                                   |
| ------------------------------------------------------------- | ------: | ------------------------------------------------------------------ | ------------------------------------------ |
| `ml/floodgate-v7-clean-room-copy.ts`                          | 101,810 | `ac9f6c17de6f984d19bbffa72b84370be4f5492b2847e591d5fa92ccd9ae64eb` | `e9ac75cedab0a56c01031999eeddc45dc92b48d4` |
| `tests/unit/ml/floodgateV7PortableCopyHeldRoleBundle.test.ts` |  27,799 | `591c853e58644a90081eb023d5354dcafdb8afb694afb6d436a75ce292ec9433` | `c6af4d9471dd1641d33c07ccf85df93135e2d68f` |

Machine-readable evidence is in [`floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json`](./data/floodgate-v7-portable-copy-held-role-bundle-2026-07-19.json).

## Next step

This is the final safety foundation before 100 real labels. A separate runtime gate must bind the generic source verifier's authenticated identity to this held snapshot, generate only the first 100 real labels, and inspect receipts, failure classification, and replay exclusion. This pull request itself runs no teacher or training, and even a successful 100-label gate does not authorize candidate training, A/B, or live activation.
