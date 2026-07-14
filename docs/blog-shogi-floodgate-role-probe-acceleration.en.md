# Shortening the 7 h 51 min Floodgate full-bundle verifier

> The measured 7 h 51 min 20 s full-bundle verifier that remained after [deployment-key instance enrollment](./blog-shogi-floodgate-v7-deployment-key-instance-enrollment.en.md) now uses a shared sampler that removes per-candidate copying, sorting, serialization, and hashing of the huge blocked Set. PR #460 regular-merged after review and CI. The first real-data run failed closed after 448.86 s because six already-materialized retry encounters were recounted in a historical pre-materialization cap counter. A reproducible non-gating diagnostic from the three stored artifacts found the 236,504,991-byte allocation and every game, parent, and protected-ID digest unchanged, so a v1-compatible fix retained retry behavior while correcting only that counter. The production full verifier at clean revision `e8a9197` completed in **17 min 25.52 s: 27.05x faster, 96.30% shorter, exit 0, and exact across all nine bundle files**, passing the 60-minute gate. That exit-zero run—not the diagnostic alone—is the adoption authority. No real teacher, training, weight, live evaluation, match, or playing-strength claim is created yet. Japanese version: [blog-shogi-floodgate-role-probe-acceleration.md](./blog-shogi-floodgate-role-probe-acceleration.md)

## 1. Current status

| Item                                     | Current status             | Meaning                                                |
| ---------------------------------------- | -------------------------- | ------------------------------------------------------ |
| Historical full-bundle verification      | 7:51:20 / 28,280.32 s      | Accepted historical measurement                        |
| One role-lock replay                     | 3:54:19.5                  | The bundle verifier calls it exactly twice             |
| Wall time explained by role-lock replays | About 99.4%                | Bundle-only remainder is about 2 min 41 s              |
| Peak RSS / average CPU                   | 6.23 GB / about 1.06 cores | Evidence to fix the algorithm before adding processes  |
| Optimized sampler source                 | Merged / PR #460           | Does not iterate, clone, or mutate the global Set      |
| First optimized real verification        | 448.86 s / exit 1          | One accounting field: 1930 != 1924                     |
| Stored-input diagnostic replay           | 193.35 s / non-gating      | 236,504,991-byte allocation and SHA exact              |
| v1 accounting compatibility fix          | `e8a9197`                  | Retain retry/caps; do not recount a materialized retry |
| Optimized real full verification         | 1,045.52 s / exit 0        | All nine files exact / stderr 0 / swaps 0              |
| Wall speedup / reduction                 | 27.05x / 96.30%            | 7:51:20 down to 17:25.52                               |
| Maximum RSS                              | 5.63 GB                    | 9.65% below the former 6.23 GB                         |
| Focused source + diagnostic tests        | 4 files / 45 PASS          | Strict decode, retry, cap accounting, replay, parity   |
| Direct related suites                    | 10 files / 167 PASS        | Role lock, bundle, diagnostic, CLI, and result         |
| Full Vitest regression                   | 121 files / 2,170 PASS     | Eight workers / 151.19 s                               |
| Python stdlib                            | 58 / 58 PASS               | py_compile plus unittest                               |
| TypeScript                               | PASS                       | Current local diff                                     |
| ESLint / targeted format / diff          | PASS                       | Existing role-lock whole-file drift excluded           |
| Production build / npm audit             | PASS / 0 vulns             | Full lint: 0 errors / 157 existing warnings            |
| Independent compatibility review         | PASS                       | P0 = P1 = P2 = 0; pair-coverage finding resolved       |
| Algorithm-only 60-minute gate            | PASS                       | No worker follow-up required                           |
| Teacher / training / weight / live       | 0 / 0 / 0 / unchanged      | This is not playing-strength evidence                  |

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
|           0 |                    3.439 ms |    2.636 ms |     1.30x |                true |
|      10,000 |                   48.619 ms |    3.596 ms |    13.52x |                true |
|      50,000 |                  258.069 ms |    3.574 ms |    72.22x |                true |
|     100,000 |                  554.174 ms |    3.693 ms |   150.06x |                true |
|     250,000 |                1,614.940 ms |    3.782 ms |   427.00x |                true |
|   1,000,000 |                8,251.390 ms |    3.744 ms | 2,203.69x |                true |

All six sizes produced parent-projection SHA-256 `8a7bee9b...40cb3f0`. The command was `npm run shogi:floodgate-role-probe-benchmark -- --sizes 0,10000,50000,100000,250000,1000000 --samples 4`; [the data JSON](./data/floodgate-role-probe-benchmark-2026-07-14.json) preserves every raw sample plus the method, runtime, and fixture hashes. The raw data was remeasured after duplicate PR feedback collapsed the global/local membership checks into one union pass. This parity is between the current full-artifact wrapper and the direct shared sampler, not two independent algorithms. The final pure oracle and integration tests retain independent authority. This microbenchmark is not itself a full-verifier ETA.

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

## 6. Retain retries and restore only the historical counters

Sampling writes only to a local overlay. If it reaches 23 parents and fails its quota, the global Set remains unchanged; global/local OR membership rejects real parent-child and child-child transpositions.

Failure is not monotone as the blocked Set grows. An early-ranked hub parent H can collide with leaves L1 and L2, making set S stop at 23 parents. A later-role superset T that blocks H can skip it and select L1, L2, and 22 disjoint fillers. Retries are therefore necessary. The adversarial fixture locks a first-role failure that later obtains exactly 24 parents and matches the final pure oracle's full projection.

The first real run stopped on historical accounting compatibility, not the retry rule. Previously semantic-rejected games produced 12 later-role encounter events across 11 unique games. Six events across six unique games stopped at the identity cap; the remaining six reprobe and re-rejection events involved five unique games. No pair-cap stop occurred. One game was rejected again in both `fresh_selection` and `training`, so event and unique-game counts are not interchangeable. Selection, parents, protected IDs, and the 236,504,991-byte allocation matched exactly, but recounting the six already-materialized identity-cap events as `skipped_before_materialization` changed the sole manifest field `accounting.identity_cap_role_checks_skipped_before_materialization` from `1924` to `1930`.

The compatibility fix still enforces every role's identity and pair caps and preserves non-monotone retries. It merely avoids incrementing a historical “before materialization” counter when `wasSemanticRejected` is true and the candidate is already materialized. Deterministic regression fixtures lock both the identity-cap case observed in real data and the symmetric pair-cap case.

## 7. No worker follow-up is required

Running the whole verifier as 4 / 8 / 10 / 12 processes would imply about 24.9 / 49.8 / 62.3 / 74.8 GB from the former 6.23 GB peak RSS, which is unsuitable for a 48 GB machine. The algorithmic waste was removed first.

The resulting 1,045.52-second run passed the 60-minute gate by a wide margin, so no worker implementation will be built. If future input growth makes parent semantics dominant again, a parked design would send only SFEN and small parent identities to persistent workers while retaining global selection, ordered commit, raw verification, and filesystem closure on the main thread.

## 8. Validation and real full-run evidence

PR #460 passed 40 focused, 364 related, and 2,165 full-regression tests, Python's 58 tests, the production build, TypeScript, full lint, npm audit, review, and CI. The compatibility fix plus checked-in diagnostic passed four focused files / 45 tests, ten direct-related files / 167 tests, and the full 121 files / 2,170 tests; the full run used eight workers and took 151.19 s. Python's 58 tests, TypeScript, scoped ESLint, full lint with zero errors and 157 existing warnings, npm audit with zero vulnerabilities, formatting, and diff checks also pass. Independent reviews report zero P0, P1, or P2 findings.

The first real attempt at `11c4ce7` exited 1 after 448.86 s and failed closed. Running the [checked-in diagnostic](../ml/diagnose-floodgate-role-lock-accounting.ts) at revision `a13365d` in a clean detached worktree took 193.35 s, exited 0 with zero swaps, and byte-exactly reproduced the stored materialized input and allocation. Its [diagnostic status](./data/floodgate-role-lock-accounting-diagnostic-a13365d-status.json), [raw output](./data/floodgate-role-lock-accounting-diagnostic-a13365d-output.json), and [time record](./data/floodgate-role-lock-accounting-diagnostic-a13365d-time.txt) bind 12 encounters / 11 unique games, 6 / 0 identity- and pair-cap stops, six reprobes / five unique games, and the one-field modeled counterfactual. This is a derived non-gating diagnostic, not a rerun of the old `11c4ce7` executable or independent production-artifact approval. The exit-zero full verifier, raw output and time, and artifact identities are the adoption authority. Zero stdout bytes, a clean worktree, and an unchanged 7,202-byte / SHA-256 `2bafc01f...e3cf9` bundle manifest after failure remain operator observations only and do not gate adoption.

After the fix, real full verification ran from 2026-07-14 16:01:28Z through 16:18:54Z.

| Metric                |      Historical | Optimized `e8a9197` | Change              |
| --------------------- | --------------: | ------------------: | ------------------- |
| Wall                  |     28,280.32 s |          1,045.52 s | 27.05x / -96.30%    |
| User CPU              |     28,376.91 s |          1,040.35 s | -27,336.56 s        |
| System CPU            |      1,564.28 s |             75.68 s | -1,488.60 s         |
| Maximum RSS           | 6,230,917,120 B |     5,629,476,864 B | -9.65%              |
| Peak memory footprint | 5,380,204,472 B |     5,079,357,328 B | -5.59%              |
| Swaps / block I/O     |           0 / 0 |               0 / 0 | No regression       |
| Exit / stderr         |    0 / accepted |         0 / 0 bytes | Fail-closed success |

The raw-lock manifest, role-lock manifest, legacy exclusion, and all nine bundle files exactly matched their historical bytes and SHA-256 values. A separate confirmation then ran in a clean detached worktree from 2026-07-14 16:35:31Z through 16:53:41Z. It also used `e8a9197`, exited 0 in 1,089.52 s with zero swaps and block I/O, and reproduced every artifact exactly; its tracked-status captures before and after were both zero bytes. The two successful stdout records are identical after removing `repository_root`. The [summary evidence JSON](./data/floodgate-role-bundle-verify-acceleration-2026-07-14.json), [accepted raw output](./data/floodgate-role-bundle-verify-e8a9197-output.json), [accepted time](./data/floodgate-role-bundle-verify-e8a9197-time.txt), [confirmation status](./data/floodgate-role-bundle-verify-e8a9197-confirmation-status.json), [confirmation raw output](./data/floodgate-role-bundle-verify-e8a9197-confirmation-output.json), [confirmation time](./data/floodgate-role-bundle-verify-e8a9197-confirmation-time.txt), and [failed-attempt stderr/time](./data/floodgate-role-bundle-verify-11c4ce7-failed-stderr-time.txt) bind the supported claims.

The raw files contain local absolute paths (the user name and worktree/data/bundle roots) that bind the run to its execution environment. As in the existing protocol evidence, these paths are non-secret execution-provenance metadata; no credential-like value was detected. They remain unredacted to preserve the raw bytes and SHA-256 identities.

The run passed the preregistered under-60-minute, artifact-exactness, and no-swap gates. The algorithmic acceleration is accepted and no worker follow-up is required. The prior 35–60-minute estimate was conservative; the measured 17 min 25.52 s was faster than its lower bound.

## 9. Current nonclaims

- optimized real full-verifier attempts / accepted: **3 / 2** (one failed closed and one was a clean confirmation);
- real role-bundle consumer callbacks: **0**;
- production key provision / inspection / approved enrollment: **0 / 0 / 0**;
- 100 / 500 / 24,000 gates: **0 / 0 / 0**;
- network requests / teacher or candidate scores read: **0 / false**;
- teacher labels / optimizer steps / candidate weights: **0 / 0 / 0**;
- formal games / rating / stable high-dan evidence: **0 / not established / not established**;
- production weight overwrite / live activation: **unchanged**.

Exact artifact parity proves that the verifier preserved existing data; it does not establish label quality or model strength.

## 10. Next execution order

1. Put the compatibility fix, failed and successful raw evidence, and aligned JA/EN articles into a ready PR.
2. Complete focused, related, and full CI plus review, then regular-merge it.
3. Do not build a worker PR: `1,045.52 < 3,600`, all nine files are exact, and swaps are zero.
4. After merge, treat the full-verifier blocker as closed and do not repeat the expensive run unless its inputs or verifier code change.
5. Treat production-key provisioning, inspection, and approved enrollment as a separately authorized operational step.
6. After key pinning, proceed through the 100 → 500 → 24,000 connector gates, then teacher generation, training, selection, formal A/B, and external calibration. Keep live weights unchanged until every adoption gate passes.

This acceleration is data-integrity and performance evidence for the same inputs. It is not evidence that the evaluation function plays more strongly.
