# Do not overwrite the evaluator: an execution log for relearning from strong Floodgate games

> The prior exact-int16-aware run improved part of the metric contract for all three seeds but produced `0/3` complete static passes. Stable production therefore remains untouched while Q1 2026 Floodgate games are split into new training, selection, and final roles. This page is a continuing execution log, including failed attempts and intermediate evidence. The frozen plan is documented [here](./blog-shogi-floodgate-fresh-sibling-plan.en.md); [日本語版](./blog-shogi-floodgate-fresh-sibling-run.md).

---

## Current status

As of 2026-07-10, this work has **not** demonstrated high-dan strength. The label-blind public inventory is fixed, all 36,349 raw responses have been acquired by one process, and every reference has been reproduced offline.

| Stage                             | Status      | Evidence                                              |
| --------------------------------- | ----------- | ----------------------------------------------------- |
| preregistration                   | complete    | 10,890 bytes / SHA-256 `ad9e6d7f…b7a0af`              |
| label-blind inventory             | complete    | 90 listings / 36,419 official CSA / 36,168 target CSA |
| source and legal-CSA parsers      | complete    | strict codecs, identity joins, full legal moves       |
| raw CAS lock                      | complete    | PR #415, merge commit `2c272f37`                      |
| process-wide scheduler            | complete    | PR #416, merge commit `b5832cea`                      |
| lease / resume / offline verifier | complete    | PR #417, merge commit `649423d`                       |
| live raw acquisition              | complete    | 36,349 / 36,349, result SHA `f48155a5…0301`           |
| 1,000 / 200 / 200 role lock       | not started | fixed before labels after the next PR merges          |
| teacher / three-seed training     | not started | model, objective, and seeds remain frozen             |
| fresh selection                   | sealed      | only after all three final checkpoints                |
| finals / 384-game A/B / 81Dojo    | sealed      | only after earlier gates pass                         |

## Why the current evaluator is not overwritten

Relearning from strong games is a sound direction. Continuing training directly into the currently deployed weights is not: a failed run would destroy its own control condition. This experiment instead does the following.

1. Preserve runOp1 as stable production
2. Build three independent candidates from fresh Floodgate data
3. Evaluate candidates and stable together on fresh selection
4. Open final labels only after a family pass
5. Consider replacement only after finals, regressions, and the paired 384-game A/B

The operation is therefore not “overwrite stable with strong games.” It is “train separate candidates from strong games while stable remains the control.” Failure costs compute, not the currently available playing strength.

## Public evidence fixed so far

The 90 daily pages in the official [Floodgate 2026 archive](https://wdoor.c.u-tokyo.ac.jp/shogi/x/2026/) were encoded as exact `URL<TAB>bytes<TAB>SHA-256<LF>` identities.

| Item                           |                                                           Observed |
| ------------------------------ | -----------------------------------------------------------------: |
| daily listings                 |                                                   90 / 90 HTTP 200 |
| listing bytes                  |                                                         10,098,337 |
| listing identity manifest      |                                                       10,963 bytes |
| listing identity SHA-256       | `05d353413f310087316e16cfc1ec29800967886db43f090aee59f713c4bfc822` |
| official CSA URLs              |                                                             36,419 |
| target-event CSA URLs          |                                                             36,168 |
| period inventory body          |                                                      332,094 bytes |
| period inventory SHA-256       | `17bd9969ba31a2b9a723be4b7defb7b3045816b19e325de19e8b65158fbac5b4` |
| group-0 identities             |                                                                316 |
| rating >= 3600 and games >= 30 |                                                                152 |

No winner filter, teacher centipawn value, or candidate-model score was used. The existing final holdout also remains unopened.

## PR #415: a raw lock that does not confuse “present” with “verified”

The first implementation stores exact HTTP bodies as content-addressed objects, with URL-keyed receipts and a final manifest.

```text
raw-lock/
  objects/sha256/ab/<body-sha256>
  receipts/sha256/cd/<url-domain-sha256>.json
  manifest.json  # last write, after complete offline verification
```

Pre-PR adversarial review found four material issues.

- The pinned listing digest was merely copied into the manifest instead of being regenerated from all 90 `url / bytes / sha256` rows
- A directory-fsync failure after publishing an object could be mistaken for an idempotent CAS race
- Duplicate CSA aliases were counted repeatedly in the canonical game-ID digest
- A function that only read a manifest was named like a complete verifier

The fixed implementation pins the 90-row TSV to LF, regenerates the preregistered identity, permits CAS reuse only for typed exact-byte EEXIST races, and derives one canonical game per exact-body group using the lowest UTF-8-bytewise URL.

GitHub review also found an unsafe fallback when `O_NOFOLLOW` is unavailable and a cleanup failure that could hide the primary publication failure. Both now fail safely. A suggestion to silently skip directory fsync on Windows was not accepted: this protocol is pinned to macOS, and recording an unsynced directory entry as durable would weaken the evidence.

## PR #416: more scheduler instances cannot multiply remote load

The production scheduler fixes:

- at most four in-flight requests across every factory instance in one process
- at least 100 ms between actual fetch starts
- `Accept-Encoding: identity`
- redirects rejected
- kind-specific status allowlists
- exact response-URL equality
- Content-Encoding absent or identity
- Content-Length equal to copied body bytes
- no new starts in a run after its first failure

Mutual review reproduced an eight-request aggregate when two scheduler instances were created. It also demonstrated bypasses by changing `Uint8Array.byteLength`, `Reflect.apply`, `Promise.race`, `Object.freeze`, structural descriptors, and Promise observation hooks from callbacks.

The final implementation shares one process-wide production gate, synchronously cancels a failed run's pending permit, requires external results to be native Promises, and adopts them through a captured `then` into sealed internal Promises. Request fields are read once from captured descriptors; validation no longer relies on mutable Set or iterator dispatch.

Twenty scheduler adversarial tests and 120 related Floodgate tests pass. The final independent sub-agent audit reported no remaining P1/P2 findings.

## Acquisition order fixed in PR #417

The runner makes this sequence non-configurable.

1. Verify a clean Git revision before the first write
2. If a manifest already exists, verify every reference without creating a lease or audit file and without using the network
3. Acquire an exclusive sibling lease outside the raw root
4. Recheck for a manifest completed at the concurrency boundary, then fetch only missing entries among the 90 listings
5. Re-read all listing bodies and reproduce the 10,963-byte identity, 10,098,337 bytes, and 36,419 / 36,168 URL counts
6. Permit 90 ratings, one period inventory, and 36,168 CSA requests only after the listing barrier passes
7. Publish object then receipt in fixed batches of 64 responses
8. Reconstruct a candidate manifest from every receipt, object, and body
9. Verify every manifest reference and derived aggregate again without network access
10. Recheck the Git revision and publish `manifest.json` last with no-clobber semantics

There is no automatic retry. A request failure poisons that process's scheduler, so the run stops. A new process may skip only receipts that pass strict verification. A present receipt with a missing or corrupt object is a hard failure, not an invitation to repair evidence by refetching.

The offline verifier closes every receipt and CAS-object reference in the manifest and reproduces listing, period-inventory, duplicate-group, and canonical-game-ID aggregates. It does not claim that crash-orphaned, unreferenced CAS or temporary files are absent. Downstream stages must consume only the verified manifest index rather than scan the storage directory, so an unreferenced artifact cannot enter the training population.

## Live acquisition size and remote policy

The planned request count is:

```text
90 listings
+ 90 daily ratings
+ 1 period inventory
+ 36,168 CSA
= 36,349 requests
```

The 100 ms start interval alone gives a theoretical lower bound of about 60 minutes 35 seconds. Listing verification, network latency, object and receipt fsyncs, and complete offline reproduction make 70–120 minutes a realistic working estimate.

“Full computer power” does not mean launching multiple acquisition processes. The global gate is shared only inside one process; multiple processes would multiply the remote policy. One process holds the exclusive lease. Sub-agents work in parallel on code review, documentation, and the later eligibility stage instead of multiplying HTTP traffic.

The same strict CLI provides acquisition and read-only status. Its output must be an absolute path that has no containment relationship with the Git worktree.

```bash
npm run shogi:floodgate-acquire -- status --output /absolute/path/to/raw-lock
npm run shogi:floodgate-acquire -- run --output /absolute/path/to/raw-lock
```

## Intermediate live-run audit

The run started at `2026-07-11T03:57:40.891Z` from source revision `649423d455b5762a697864610d9e8f606cc327c3`. The milestones below sum only audit JSONL records that are durable through their terminating LF. They do not count receipts merely visible in the filesystem: between batch publication and audit append, those can lead the durable observation by as many as 64 responses.

| UTC time                   | fetched | progress | response bytes | unexpected failure / resume |
| -------------------------- | ------: | -------: | -------------: | --------------------------: |
| around 2026-07-11T04:21:31 |  10,997 |   30.25% |    190,944,202 |                       0 / 0 |
| 2026-07-11T04:31:52        |  15,797 |   43.46% |    258,797,090 |                       0 / 0 |
| 2026-07-11T04:43:37        |  21,365 |   58.78% |    333,234,256 |                       0 / 0 |
| 2026-07-11T04:51:03        |  24,885 |   68.46% |    385,067,521 |                       0 / 0 |
| 2026-07-11T04:55:39        |  27,061 |   74.44% |    415,839,970 |                       0 / 0 |
| 2026-07-11T05:16:18        |  36,349 |     100% |    541,445,115 |                       0 / 0 |

The only HTTP 404s are the two daily-rating responses permitted in advance, so they are not counted as failures in the table. No automatic retry occurred and the run completed with one token. Sub-agents running alongside acquisition did not add network processes; they audited the result summarizer and the next label-blind role-lock stage.

## Final live-run audit

Three paths reproduced the same manifest and aggregates: the acquisition process's own closure, the read-only status command after lease removal, and a result summarizer on a separate branch.

| Item                           |                                                                     Live result |
| ------------------------------ | ------------------------------------------------------------------------------: |
| source revision                |                                      `649423d455b5762a697864610d9e8f606cc327c3` |
| start / finish                 |                         `2026-07-11T03:57:40.891Z` / `2026-07-11T05:16:18.501Z` |
| elapsed                        |                                                     01:18:37.610 / 4,717,610 ms |
| attempts / resumes             |                                                                           1 / 0 |
| fetched / reused receipts      |                                                                      36,349 / 0 |
| daily rating HTTP 200 / 404    |                                                                          88 / 2 |
| total response bytes           |                                                                     541,445,115 |
| unique objects                 |                                                                          36,348 |
| canonical games                |                                                                          36,168 |
| duplicate groups / aliases     |                                                                           0 / 0 |
| audit JSONL                    |                                 573 records / 373,700 bytes / `9412a6d6…44ce52` |
| final manifest bytes / SHA-256 | 23,698,679 / `1479a3a207458c9d3afe6cf9ba88abc6c44fb7b8b0e621aca9d6558637314619` |
| result receipt bytes / SHA-256 |      1,534 / `f48155a5371411f7ea3b27abdf035c86c9df059b5e924620432449c45f650301` |
| offline referential closure    |                            pass / `shogi-floodgate-raw-offline-verification-v1` |

One fewer unique object than receipts is not a missing artifact. The two daily-rating 404 responses have the same exact body and therefore share one CAS object. All 36,168 CSA bodies are distinct, yielding 36,168 canonical games and zero duplicate groups.

Independent review of the result summarizer reproduced five pre-PR defects: verifying a separately read manifest B while reporting A, rejecting empty or torn crash audits, an audit-root ABA substitution, hashing BOM-decoded text instead of raw bytes, and an indefinite block on a token-named FIFO. The fixed path uses descriptor-relative reads, lease checks, double raw-byte snapshots, complete-line prefixes, BigInt inode identities, and a timeout. Final review found zero P1/P2 issues; all 279 ML tests pass.

## Next-stage stop conditions found while acquisition ran

- A parent with only one legal move cannot satisfy the two-sibling contract. Before role lock, rules-complete legal moves >= 2 becomes a label-blind condition, with deterministic replacement under the same hash/fill order
- The search-oriented move generator omits optional rook and bishop non-promotions, so role protected-child IDs and the teacher must share one rules-complete helper
- Allocation does not contain `played_move`. A consumer must reverify raw CAS into role-specific parent bundles and fix the union of the legacy 8,678 IDs plus fresh final/selection IDs before replay sampling
- The preregistered warm initializer `571ca309…65ff8`, replay `2207eba5…a56cb`, and Python 3.13.0 / PyTorch 2.12.1 environment were recovered with exact identities and copied into stable storage

## What remains before a high-dan claim

A valid raw lock is not playing-strength evidence. The next label-blind stage applies rating, embedded game-time rating, legality, `%TORYO`, diversity caps, and semantic isolation before fixing 1,000 / 200 / 200 games. Only then may the training teacher be generated and the unchanged model/objective be trained with seeds 42, 43, and 44.

Only a fresh-selection family pass opens the fresh final, the existing unopened WCSC36 final, regressions, and the paired 384-game A/B. The final 200-game 81Dojo calibration requires an official COM account and client; explicit user confirmation will be requested before any external games are started.

The conclusion is not yet “the evaluator is stronger.” The narrower, auditable conclusion is that the raw acquisition path is complete, allowing a separate candidate to be tested without overwriting the stable evaluator.
