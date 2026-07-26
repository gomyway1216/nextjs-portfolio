# Proving a 30-bit position-hash collision and fixing it with a second lock

_July 25, 2026_

[日本語版](./blog-shogi-dual-hash-lock-pilot.md)

## Conclusion first

The next target is neither evaluation-weight tuning nor another history adjustment. We reproduced a case where **two different positions have the same 30-bit production position hash, causing the production WASM search core to reuse the earlier position's move and score and return an illegal move key**.

This is not a theoretical concern. A fixed-seed generator reached a collision at hash `218180606` after 52,067 legal positions. With the production WASM and current live weights, searching position A and then B without clearing TT made B reuse A's `8d8c+` and score `3178`. That move is illegal in B. Clearing TT before B produced the legal `3a3b` and score `-1409`. The current browser host revalidates the returned move and falls back to JavaScript on an illegal key, so this proof does not claim that the live UI actually played the illegal move.

The fix keeps the current 30-bit hash intact and adds an independent 32-bit secondary lock. It will first be tested in an isolated research WASM for correctness, speed, and bounded non-regression. Live weights and production assets remain unchanged until that evidence exists.

## The previous candidate stops

Bounded quiet-history malus finished its formal screen at 26 wins, 25 losses, and one draw: 53/104 observed halfpoints, or 50.96%. Even wins in all four remaining games would have produced 61/112, below the preregistered pass score of 62, so the candidate was rejected. It was not broken, but it did not show a clear gain. There will be no coefficient tuning or extra seeds for that idea.

Dual-hash lock does not inherit that search heuristic. It changes no weight, pruning rule, move ordering, or time limit. It targets only the concrete identity error that can mistake one position's cached value for another's.

## The reproduced collision

Both positions were reached from hirate using only moves returned by `GenerateMovesImproved.generateLegalMoves`. Both round-trip to canonical SFEN, pass physical invariants, and have matching JS and production-WASM legal-move counts.

- A: `1nk1s2n1/l1rs1+P3/+Pgp5N/1P1pp1ppl/p4P3/1GPPS+bP1p/B3P2P1/L3GG3/1NK1RS2L b 2P 89`
- B: `1sk3s1l/2g2r+B2/l1n1pp1+B1/p1p3p2/3p3np/PpP4P1/2NPPPP1P/R2SGG1S1/L4K1NL w GPp 56`

The current key space has only about 1.07 billion values. The engine retains roughly one million TT entries and 262 thousand evaluation-cache entries within a game. When the full primary hashes collide, the indices collide too, and the current primary-only TT cannot distinguish the positions.

The discovery method, asset identities, both positions, exact search results, and claim boundary are fixed in the [machine-readable collision proof](../ml/protocols/dual-hash-lock-collision-preflight-v1.json). The proof does not establish ordinary-game frequency or Elo, and it does not claim that this exact illegal move has been observed in production traffic.

## The isolated fix

The current primary hash and its seed-generation order remain unchanged to preserve opening-book and historical-evidence compatibility. A separately seeded full-32-bit stream supplies a secondary board, hand, and side-to-move lock that is updated incrementally.

With the research candidate enabled, identity checks require both primary and secondary keys in:

- the private transposition table;
- the evaluation cache, including NNUE;
- search-path repetition detection.

Shared TT, JS fallback, mate solver, and opening caches will receive the same rule only in a separate promotion PR after the research gates pass. The primary hash still chooses an index; the secondary lock verifies that the entry belongs to the same position.

## Mandatory pre-play gates

The research toggle defaults OFF. OFF must remain bit-exact with production on all 64 fixed positions for best move, score, depth, nodes, and leaves.

With the toggle ON, the collision fixture must pass in both A→B and B→A order. Keeping cache state must produce the same best move, score, and depth as a clean-cache target search, and the returned move must be legal. Nodes and leaves may differ because valid entries from the first search can still be reused, so they are not part of this ON equality. TT, evaluation cache, and repetition receive separate seams that must each activate on a primary match and secondary mismatch.

The runner does not trust a WASM self-check alone. An independent TypeScript implementation must compare incremental and full secondary hashes over at least 16,384 legal transitions, then resynchronize the initial position after every trajectory and recover all four hashes. Candidate searches on the 64-position fixture must all be legal and deterministic, restore state, and produce zero technical faults.

Performance alternates production, toggle OFF, and candidate ON. Candidate/production aggregate throughput must be at least 0.97, the median at least 0.95, p90 wall regression at most 8%, and additional WASM memory at most 6 MiB. The research candidate does not use the shared TT. These are timing-safety gates, not strength claims.

## Formal correctness and performance result (July 26, 2026)

After the preregistered plan in [PR #625](https://github.com/gomyway1216/nextjs-portfolio/pull/625) was merged, the formal result bound to plan SHA `dfb82a42…de63` passed all 27 of 27 registered gates. The tracked [raw receipt](./data/shogi-dual-hash-lock-correctness-raw-2026-07-26.json) is 34,210 bytes with SHA-256 `5529d03c…314e`; its output bytes are preserved without reformatting, separately from the [readable summary](./data/shogi-dual-hash-lock-correctness-result-2026-07-26.json). Because the raw receipt does not include an execution-time envelope with start and finish timestamps, this article makes no runtime-duration claim.

Both collision positions retain primary hash `218180606`, while the secondary lock separates A=`3957758389` from B=`1939556287`. Toggle OFF matched production exactly for best-move key, score, depth, nodes, and leaves in both A→B and B→A order. Production left the first position's key and score on the second position, whereas toggle ON matched the target's clean-cache key, score, and depth in both orders and returned legal moves. As preregistered, nodes and leaves are excluded from ON clean parity because valid cached entries may change them.

The independent evaluation-cache and repetition seams also passed. Secondary mismatches activated 16 TT rejections, three evaluation-cache rejections, and three repetition rejections. The independent TypeScript full recomputation matched the incremental WASM secondary hash on all 16,384 legal transitions, with zero resynchronization failures. Across the fixed 64-position holdout—16 positions in each category—OFF achieved 64/64 five-field exact parity, while ON achieved 64/64 determinism, legality, state restoration, and incremental-hash agreement.

| Performance or memory metric   |      Required | Observed |
| ------------------------------ | ------------: | -------: |
| aggregate candidate/production |  at least 97% |  99.622% |
| median candidate/production    |  at least 95% |  99.424% |
| p90 wall regression            |    at most 8% |  -0.171% |
| additional WASM memory         | at most 6 MiB |  0 bytes |

The negative p90 means the candidate wall time was 0.171% shorter in this measurement. This is fixed-depth, fixed-work performance safety—not a playing-strength measurement. The receipt authorizes only the fixed 96-game non-regression screen. It does not authorize a live change, production integration, weight update, promotion, or a claim that the engine became stronger.

## The 96 games are a non-regression gate

A correctness- and performance-passing candidate will face production in 48 fresh color-swapped pairs. The match runner must reauthenticate an all-passing correctness receipt bound to the same fixed plan SHA. The match uses 96 games, identical live weights, 1.5 seconds per move, 12 pair workers, no book, and no mate solver.

The pinned union combines 3,198 fingerprints from the enrolled-opening evidence with 28 from the immediately preceding fixed plan. It contains 3,226 fingerprints. Seeds `980001..980048` are all fresh with intersection zero.

The floor is 82/192 candidate halfpoints, or 42.71%. This is not a “stronger” threshold. A known correctness repair should not be discarded only because a short match fluctuates, while a material strength regression still needs to stop promotion. PASS requires all 96 games to complete with zero faults, illegal moves, and opening duplicates. Only rejection may stop early, after wins in every remaining game can no longer reach 82.

## Formal 96-game result (July 26, 2026)

The fixed research WASM completed all 96 games at 47 wins, 47 losses, and two draws: 96/192 halfpoints, or 50.00%. It cleared the 82/192 floor by 14 halfpoints. All 48 openings were unique and the technical-fault count was zero. The candidate scored 27 wins, 20 losses, and one draw as sente, and 20 wins, 27 losses, and one draw as gote. All 11,163 move keys checked by the fixed runner belonged to the legal-move set at that point.

| Metric                 |                        Result |
| ---------------------- | ----------------------------: |
| completed              |           48 pairs / 96 games |
| candidate record       | 47 wins / 47 losses / 2 draws |
| halfpoints             |                      96 / 192 |
| pass floor             |                      82 / 192 |
| duplicate openings     |                             0 |
| technical faults       |                             0 |
| runner legality checks |               11,163 / 11,163 |

The [readable summary](./data/shogi-dual-hash-lock-match-result-2026-07-26.json) is separate from the unformatted [run, terminal-result, and 48 pair receipts](./data/shogi-dual-hash-lock-match-raw-2026-07-26/). Without importing the runner, an independent test recomputes the fixed-plan and correctness-receipt bindings, all 48 seed and opening-fingerprint assignments, each pair's domain seal, the aggregate, and the decision. `result_sha256` is an internal seal over a domain-prefixed canonical body that excludes that field; it is not the SHA of the complete JSON file. The file SHA is recorded separately.

The evidence has limits. Pair receipts contain the plan SHA but not the correctness-receipt SHA or a run identifier, while the terminal result contains neither the run SHA nor a manifest root for the 48 pairs. The tracked test links them independently, but this is not a cryptographic proof that every receipt came from one uninterrupted run. Pair receipts retain outcomes, termination, plies, and legality-check counts rather than complete move transcripts, so the evidence cannot independently replay every move. The terminal receipt also has no authenticated finish timestamp, and no exact runtime is claimed.

The 47-47-2 record supports only the conclusion that this bounded direct-play screen detected no material regression and that the candidate passed its preregistered floor. It does not show a strength gain, Elo increase, high-dan level, or full-browser-path strength. The PASS permits work on a separate production implementation and browser-validation PR. `promotion_authorized=false` remains authoritative: live changes, deployment, and weight updates are still unauthorized.

## After a pass

Even passing every gate does not change live from this research PR. A separate promotion PR must apply dual identity to the production AssemblyScript, WASM, embedded base64, JS V20 fallback, shared TT, mate solver, and opening caches, followed by real-browser and rollback checks.

This fix cannot guarantee high-dan strength. It does remove a reproduced hole that can reuse another position's search result and make the search core emit an illegal move key—a concrete foundation to repair before spending more compute on training.
