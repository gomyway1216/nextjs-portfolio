# Shortening the 7 h 51 min Floodgate full-bundle verifier

> Closing [deployment-key instance enrollment](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.en.md) still leaves a measured 7 h 51 min 20 s full-bundle verifier before the production connector. This note records that two role-lock replays explain about 99.4% of that wall time, while profiling identified the dominant avoidable cost inside those replays: the second one-game probe copying, sorting, serializing, and hashing a blocked-position-ID set that grows to about 2.97 million entries for every candidate. It replaces that work with a shared sampler that makes the same parent selection without generating the huge-blocked-Set artifact; strict zero-quota normalization remains. Source, 40 focused tests, and a reproducible benchmark pass locally; optimized production full verification, PR, and CI remain **pending / 0**. No real teacher, training, weight, live evaluation, match, or playing-strength claim is created. Japanese version: [blog-shogi-floodgate-role-probe-acceleration.md](./blog-shogi-floodgate-role-probe-acceleration.md)

## 1. Current status

| Item                                     | Current status             | Meaning                                               |
| ---------------------------------------- | -------------------------- | ----------------------------------------------------- |
| Historical full-bundle verification      | 7:51:20 / 28,280.32 s      | Accepted historical measurement                       |
| One role-lock replay                     | 3:54:19.5                  | The bundle verifier calls it exactly twice            |
| Wall time explained by role-lock replays | About 99.4%                | Bundle-only remainder is about 2 min 41 s             |
| Peak RSS / average CPU                   | 6.23 GB / about 1.06 cores | Evidence to fix the algorithm before adding processes |
| Optimized sampler source                 | Implemented                | Does not iterate, clone, or mutate the global Set     |
| Focused source + benchmark tests         | 40 / 40 PASS               | Strict decode, rollback, retry, parity, harness       |
| Related suites                           | 14 files / 364 PASS        | Role lock, bundle, consumer, and connector            |
| Full Vitest regression                   | 120 files / 2,165 PASS     | Eight workers / 143.33 s                              |
| Python stdlib                            | 58 / 58 PASS               | py_compile plus unittest                              |
| TypeScript                               | PASS                       | Current local diff                                    |
| ESLint / targeted format / diff          | PASS                       | Existing role-lock whole-file drift excluded          |
| Production build / npm audit             | PASS / 0 vulns             | Full lint: 0 errors / 157 existing warnings           |
| Independent final review                 | PASS                       | Two reviews; P0 = P1 = P2 = 0                         |
| Optimized production full verification   | 0                          | Not yet run against the real bundle                   |
| Teacher / training / weight / live       | 0 / 0 / 0 / unchanged      | This is not playing-strength evidence                 |

## 2. The bottleneck was quadratic recomputation, not a lack of cores

The historical verification recorded wall `28,280.32 s`, user CPU `28,376.91 s`, system CPU `1,564.28 s`, and zero block I/O, for about 1.06 average CPU cores. One role-lock full replay took 3 h 54 min 19.5 s, and the bundle verifier independently reproduces that role lock twice to preserve source closure. Those two calls alone account for 7 h 48 min 39 s, about 99.4% of the full-bundle total.

The role lock lazily materialized 1,825 games, retained 1,619 fully materialized games, and observed semantic or parent-quota rejection for 219 unique games. For every tentative game, the old path did all of the following:

1. copy the entire current `reservedProtectedIds` set into an array;
2. call the complete `allocateFloodgateRolesPure` for one game;
3. copy the legacy IDs into another Set;
4. UTF-8-bytewise sort, JSON-serialize, and SHA-256 every ID for canonical input;
5. clone the blocked Set again for sampling;
6. sort and digest the huge set again for output summaries.

For the 1,400 selected games alone, cumulative blocked-ID scans are about 2.076 billion entries, and at least 4.153 billion elements enter the repeated sorts. `compareBytewise` also creates Buffers for each comparison. This is work to remove before adding cores.

## 3. Reproducible synthetic profile

The checked-in harness ran on an Apple M4 Pro with 48 GB and Node `v22.13.0`. Its cheap-semantics fixture selects exactly 24 parents from 32 candidates. Blocked-Set construction is outside the timer; the protocol uses three warm-up pairs, four raw samples per path, alternating order, explicit GC before the timer, and medians below. The baseline explicitly emulates the one former sampler Set clone, while the current full allocator performs the remaining array conversion, canonicalization, and digest work.

| Blocked IDs | Emulated removed full probe | New sampler |   Speedup | Exact parent parity |
| ----------: | --------------------------: | ----------: | --------: | ------------------: |
|           0 |                    2.842 ms |    2.763 ms |     1.03x |                true |
|      10,000 |                   50.131 ms |    3.695 ms |    13.57x |                true |
|      50,000 |                  277.091 ms |    3.672 ms |    75.46x |                true |
|     100,000 |                  588.496 ms |    3.706 ms |   158.79x |                true |
|     250,000 |                1,640.254 ms |    3.538 ms |   463.68x |                true |
|   1,000,000 |                8,272.226 ms |    3.674 ms | 2,251.83x |                true |

All six sizes produced parent-projection SHA-256 `8a7bee9b...40cb3f0`. The command was `npm run shogi:floodgate-role-probe-benchmark -- --sizes 0,10000,50000,100000,250000,1000000 --samples 4`; [the data JSON](./data/floodgate-role-probe-benchmark-2026-07-14.json) preserves every raw sample plus the method, runtime, and fixture hashes. This parity is between the current full-artifact wrapper and the direct shared sampler, not two independent algorithms. The final pure oracle and integration tests retain independent authority. This microbenchmark is not itself a full-verifier ETA.

An earlier random-order synthetic attributed 1.412 s of a 1.525 s 250,000-ID run to the two sorts alone, or 92.6%. That result and the worker-count comparison were exploratory one-shot runs whose source command and raw log were not preserved in the repository; they are not gating evidence.

## 4. The replacement boundary

The new `sampleFloodgatePlannedGameParentsForRoleLock(game, blockedSet)` fixes:

- the same production seed, phase and fill rank domains, 6 / 12 / 6 quotas, and exactly 24 parents;
- recapture of the untrusted game through the same strict `decodePureGames` boundary;
- rules-complete expansion of each parent into the parent plus every legal child;
- collision checks through `globalBlocked.has(id) || localOverlay.has(id)`;
- no iteration, clone, or mutation of the global Set during tentative sampling;
- global commit by the caller only after all 24 parents succeed;
- no second canonical artifact, byte count, SHA, or summary tied to the multi-million-ID blocked Set.

`normalizeMaterializedGame` still performs one zero-quota pure allocation with empty role counts and empty legacy IDs per candidate to strictly capture and canonically snapshot untrusted callback output. It does not carry the multi-million-ID blocked Set. The final `allocateFloodgateRolesPure` also remains mandatory. It generates canonical input and output once from every materialized game, then compares the manual lazy result not only by game ID but by identities, every parent field, phase and sampling stage, position ID, and protected-ID list via `isDeepStrictEqual`. Authority over historical artifact bytes and SHA remains with this final oracle.

## 5. Strict decode must survive serialization removal

The old canonical JSON path was the last rejection point for some values. In particular, `Number.isSafeInteger(-0)` is true, so `ply: -0` and role count `-0` survived until serialization. The new path rejects all of the following before semantic sampling:

- negative-zero, negative, or non-safe-integer plies and counts;
- top-level and nested Proxies without invoking their traps;
- accessors, symbols, hidden or extra score-like keys, and custom prototypes;
- sparse arrays and duplicate parent IDs or plies;
- wrong game or parent-occurrence binding and invalid identities;
- noncanonical SFEN and move-number mismatch.

A TypeScript-typed object is not trusted evidence. Runtime capture, not the argument type, is authoritative.

## 6. A failed candidate must not poison global state

Sampling writes only to a local overlay. If it accumulates 23 parents and then fails its quota, the global Set must remain byte-for-byte unchanged. Real parent-child and child-child transpositions are rejected through the OR of global and local membership.

Failure is also not monotone as the blocked Set grows. If an early-ranked hub parent H collides with leaves L1 and L2, set S may greedily select H and stop at 23 parents. In a later role, a superset T that blocks H itself can skip H and select L1, L2, and 22 disjoint fillers for exactly 24. A semantic failure therefore cannot become a permanent cross-role rejection.

The adversarial integration fixture proves:

- candidate C greedily takes the hub in the first role and fails at 23 parents;
- predecessor game B is selected in the first role, and its only overlap with C's candidate semantic groups is legal child H;
- C is retried in the second role and succeeds with exactly 24 parents;
- C and B are materialized only twice, with C's validated snapshot reused;
- the final pure oracle matches the full projection of first-role B and second-role C.

## 7. Workers remain a follow-up

Running the current verifier as 4 / 8 / 10 / 12 whole processes would imply roughly 24.9 / 49.8 / 62.3 / 74.8 GB from the historical 6.23 GB peak RSS, which is unsuitable for a 48 GB machine.

If parent semantics still dominate after the algorithmic fix, persistent workers will receive only SFEN and small parent identities. Raw paths, keys, the 23 MB raw manifest, the 236 MB allocation, and the multi-million-ID blocked Set will not cross into workers. Global selection and ordered commit, raw verification, and filesystem closure stay on the main thread. An exploratory ad-hoc one-shot found 6.51x / about 624 MB peak at eight workers, 6.65x / 763 MB at ten, and 6.51x / 898 MB at twelve. Because its source command and raw log were not preserved, this is only a design clue for starting a follow-up at eight workers, not adoption or reproducible evidence. That follow-up must add a checked-in harness.

## 8. Validation and stop conditions

The 40 focused tests pass. They cover direct-versus-full-wrapper parent parity, global Set non-iteration, 23-parent rollback, negative zero, Proxy and accessor traps, score-like extras, sparse arrays, actual semantic transpositions, non-monotone cross-role retry, caller mutation after snapshot, the full-projection oracle, and the benchmark raw-sample contract. The related 14 files / 364 tests, TypeScript, scoped ESLint, targeted formatting, and diff checks also pass. `ml/floodgate-role-lock.ts` has whole-file Prettier drift predating this PR; a whole-file write would create large unrelated churn, so it is excluded. The modified hunks and `git diff --check` are clean.

Required remaining evidence is:

1. ready-PR review and CI followed by a regular merge;
2. one real production full-verifier run from the clean merged revision, with manifest and artifact identities checked against historical bytes;
3. phase wall, CPU, and RSS records against the algorithm-only target of **under 60 minutes**.

The first 12-worker full regression had one unrelated stable-proposal resume state-classification mismatch among 119 files / 2,163 tests. That file then passed 11 / 11 in isolation, and the lower-contention eight-worker full rerun after adding the benchmark file passed all 120 files / 2,165 tests. Python's 58 tests, the production build, TypeScript, full lint, and npm audit also exited zero; full lint reported 157 existing warnings and no errors. Before measurement, the modeled full-run ETA is approximately 45 minutes centrally, 35–60 minutes as the working range, and 75 minutes pessimistically. Those are estimates, not measurements.

Stop if the real run exceeds 60 minutes, any artifact or selection differs by one byte, filesystem closure weakens, memory pressure swaps, or a fail-closed error is lost. A run over 60 minutes triggers the separate worker follow-up.

## 9. Current nonclaims

- optimized production full-verifier executions: **0**;
- real role-bundle consumer callbacks: **0**;
- production key provision / inspection / enrollment: **0 / 0 / 0**;
- 100 / 500 / 24,000 gates: **0 / 0 / 0**;
- teacher labels / optimizer steps / candidate weights: **0 / 0 / 0**;
- formal games / rating / stable high-dan evidence: **0 / 0 / not established**;
- production weight overwrite / live activation: **unchanged**.

## 10. Next execution order

1. Put the algorithmic parity PR through focused, related, and full validation plus independent review.
2. Open a ready PR, complete review and CI, and regular-merge it.
3. Time one optimized real full verifier from the clean merged revision.
4. Adopt the algorithm-only version if it stays under 60 minutes with exact artifact parity.
5. Only if needed, implement and validate a separate eight-worker parent-semantics PR.
6. Even after the verifier blocker closes, do not write or inspect the production key without separate explicit approval.

This optimization verifies the same inputs faster. It is not evidence that the evaluation function plays more strongly.
