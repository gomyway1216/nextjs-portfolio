# Integrating dual-hash identity into production and migrating the opening book fail-closed

_July 26, 2026_

[日本語版](./blog-shogi-production-dual-hash-integration.md)

## Conclusion

The dual-hash repair proven in the research build has been extended to the production WASM, JavaScript fallback, shared transposition table, repetition and mate-search paths, and external opening book. The purpose is not to retrain the evaluation function. It is to ensure that **two positions with a colliding primary hash are not accepted as the same position**.

The formal 96-game screen finished at 47 wins, 47 losses, two draws, and zero technical faults. That passed the preregistered non-regression floor; it did not prove an improvement. The NNUE weights are also unchanged. The supported claim is therefore improved collision correctness—not higher Elo or high-dan strength.

The exact values are fixed in the [machine-readable production-integration evidence](./data/shogi-production-dual-hash-integration-2026-07-26.json).

## What changed

Previously, a match on the roughly 30-bit primary hash could allow a transposition-table or evaluation-cache entry from another position to be accepted. We reproduced two distinct legal positions colliding and causing the production search WASM to return the earlier position's illegal move key for the later one. The discovery and isolated research repair remain documented in the [dual-hash pilot](./blog-shogi-dual-hash-lock-pilot.en.md).

The production candidate retains the primary hash for index selection but also requires an independent secondary hash when validating position identity. The covered paths are:

- the JavaScript V20 transposition table and evaluation cache;
- repetition identity in JavaScript search and the mate solver;
- private and shared transposition tables in WASM;
- browser-host storage for the shared transposition table; and
- the external opening book.

Keeping the primary avoids an unnecessary indexing change. Accepting an entry as the same position now requires the secondary identity too.

## Concrete assets

| Asset             |     Bytes | SHA-256          | Change                                  |
| ----------------- | --------: | ---------------- | --------------------------------------- |
| Production WASM   |    36,545 | `9142b6b0…4c31`  | Adds dual identity to production search |
| NNUE weights      | 1,185,988 | `e4e738f9…e28dc` | **Unchanged**                           |
| SBK2 opening book | 1,785,509 | `ec41836b…7530`  | Migrates to an independent hash pair    |

The weight byte count and SHA are unchanged from the preceding live candidate. This WASM update repairs cache identity; it does not overwrite evaluation coefficients.

## Why the legacy book was not copied mechanically

Legacy SBK1 contains a primary hash plus a short correlated check. An independent secondary hash cannot be reconstructed uniquely from those bytes, so mechanically copying all 97,767 legacy identities would be unsafe.

The migration script legally replays the book-induced graph from the initial position and emits only independently recovered `(hashA, hashB)` pairs. The result was:

| Category                                       | Legacy identities | Handling                                           |
| ---------------------------------------------- | ----------------: | -------------------------------------------------- |
| Safely migrated to SBK2                        |            97,522 | Independent pair and stored-move legality verified |
| Not recovered from book-induced traversal      |               175 | Omitted                                            |
| One legacy identity resolved to multiple pairs |                68 | Omitted instead of duplicating the payload         |
| Stored move payload was illegal                |                 2 | Omitted                                            |
| Explicit coverage loss                         |               245 | 0.251% of the legacy 97,767                        |

This is a fail-closed loss. An ambiguous entry becomes a book miss and falls through to search rather than returning an unauthenticated book move. It does not prove that the 175 disconnected identities can never occur after arbitrary off-book play.

## Local evidence

| Validation                   |                             Result | Meaning                                                    |
| ---------------------------- | ---------------------------------: | ---------------------------------------------------------- |
| JS ↔ WASM secondary identity |              4,184 / 4,184 matched | Independent implementations agree on position identity     |
| Fixed-depth search           |                      48 / 48 exact | JavaScript V20 and production WASM agree on fixed searches |
| Production browser build     |                               PASS | Both NNUE evaluation and search used the WASM paths        |
| Level-5 interactive game     |                               PASS | 7g7f received 8c8d and returned control to the human       |
| Production WASM identity     |     36,545 bytes / `9142b6b0…4c31` | Pins the actual candidate bytes                            |
| SBK2 identity                | 97,522 positions / `ec41836b…7530` | Pins the safely migrated book bytes                        |

The dedicated production-build browser harness also reported `crossOriginIsolated=true`, `evaluation_path=nnue-wasm`, `search_path=wasm`, a valid worker response, and a legal result. The embedded WASM and fetched weights matched the byte counts and hashes above. These are implementation and artifact correctness results. They do not measure win rate over a playing distribution or rank.

## Speed of the final production binary

The research WASM used in the formal 96 games is not byte-identical to the final production WASM, so the final 36,545-byte binary was also compared directly with the saved pre-integration production snapshot. The read-only benchmark used the 64-case formal holdout, depth 5 / quiescence 8, identical weights, a TT clear before every position, four warmup passes per arm, and six paired blocks with alternating order. Throughput was normalized by `nodes + quiescence leaves`. The exact [raw blocks](./data/shogi-production-dual-hash-speed-benchmark-raw-2026-07-26.json), [summary](./data/shogi-production-dual-hash-speed-benchmark-result-2026-07-26.json), and matching [reproduction runner](../wasm-spike/benchmark-production-dual-hash-vs-snapshot.ts) are retained.

The all-block aggregate made final look 101.749% as fast, but the first old-production block alone took 33.005 seconds while the other old blocks took 29.018–29.257 seconds. That system-load excursion makes the aggregate optimistic for final. The block was neither hidden nor removed; the central estimate uses the robust median of the paired ratios.

| Metric                                  |             Final / old | Interpretation                                      |
| --------------------------------------- | ----------------------: | --------------------------------------------------- |
| All-block aggregate throughput          |                101.749% | Optimistic due to one slow old block; not decisive  |
| Robust median paired throughput         |                 99.689% | About 0.311% lower                                  |
| Descriptive range of five stable pairs  |        99.048–99.934% | About 0.952–0.066% lower                            |
| p90 wall regression                     |                 -0.036% | No gross wall-time regression                       |
| WASM memory delta                       |                 0 bytes | Both instances used 56,623,104 bytes                |
| Fixed-search decisions                  |                 63 / 64 | One intended, legal collision-correction difference |

The 63 / 64 result does not mean one case broke. Only `checkEvasion-06` changed between the primary-only cache and the dual lock, and the formal correctness evidence already records the dual-lock result as deterministic and legal. It is a position where the intended collision repair changes the search.

This short diagnostic supports only a narrow conclusion: no gross direct-WASM speed regression was observed in the final exact binary. The central estimate is about 0.3% lower throughput, with the conservative measured stable-block floor about 1.0% lower. This is not a strength metric, and it does not measure the browser host, shared TT, JavaScript fallback, or concurrent browser load. The identical-logic runner was tracked after execution, so this result has no preregistered promotion authority.

## What the 96 games do and do not show

The formal direct-play screen between the research candidate and the old production build completed 48 pairs and 96 games. The candidate recorded 47 wins, 47 losses, two draws, and zero technical faults—a 50.00% score that passed the bounded non-regression floor. The research WASM that played those games was 37,538 bytes (`90cbf3ce…8edf`); it is not byte-identical to the integrated 36,545-byte production WASM (`9142b6b0…4c31`).

That result does not support “dual hash made the engine stronger.” The observed match was even. It says only that the known identity bug was repaired without a detected material regression under this limited screen. It is not a 96-game result for the final production binary; that implementation was validated separately through parity, fixed-search, and browser full-path checks above. The distance to stable high-dan strength was not measured by these 96 games.

## Live status

At the time of this record, the production-integration PR, merge, deployment, and post-deployment verification were not complete. The change is therefore not marked live. Completed local assets do not establish that `meetyudai.com` serves the same WASM and SBK2 bytes.

The next gate is to finish integration validation, merge the PR, and then recheck the deployed WASM identity and browser engine path. “Live changed” remains false until that sequence completes.

## Relationship to the next strength work

This repair is not training, so it is not a standalone path to high-dan strength. It still matters before large self-play or retraining runs: leaving a cache-identity bug that mixes search results from different positions adds avoidable noise to candidate comparison and game evaluation.

Future decisions must not count dual hash as an achieved strength gain. It is a correctness foundation. Proving a gain still requires a separately changed weight or search candidate to exceed a preregistered strength threshold against the current engine.
