# Shogi evaluation: P0 foundation for faster, correct formal A/B

> As of 2026-07-20, production formal A/B remains **0 / 768 games**, the real 2/4/8/12-worker benchmark remains at zero rounds, and live-weight changes remain zero. This change is not a stronger-candidate result. It is the foundation for moving directly from a selected candidate to a local, correctly bounded formal A/B run at the fastest safe concurrency. Japanese version: [blog-shogi-formal-paired-ab-v2-p0-foundation.md](./blog-shogi-formal-paired-ab-v2-p0-foundation.md)

## Conclusion

The prior formal contract had three mismatches:

1. its match binding required YaneuraOu assets, while the real match uses the production browser/WASM engine;
2. Python admitted signed 64-bit seeds, while Node can preserve integer identity only through `Number.MAX_SAFE_INTEGER`; and
3. the real runner was capped at two pair workers, with no selector proving that higher concurrency preserves results.

This P0 leaves the historically published launcher artifact unchanged and adds the WASM-specific contract that the next ready-registry bridge must consume.

## A match binding that describes the real runner

The executable dual-WASM path itself was published in the [real WASM match runtime](./blog-shogi-formal-paired-ab-v2-real-wasm-match-runtime.en.md). This contract enrolls only assets that path actually consumes.

The new contract requires only assets the executable path actually uses:

- candidate and stable NNUE weights;
- the canonical pair entry;
- the WASM match adapter;
- the isolated player child; and
- the embedded WASM module source.

It no longer requires an unused YaneuraOu engine, build receipt, or eval directory. Search is clockless fixed depth 11 with quiescence depth 10, `K=600`, a private TT reset before every move, no book, no fallback, and a 512-ply cap. AWS, GCP, cloud, network, external calibration, and live-weight writes remain forbidden.

## Preflight every opening before a game exists

The new label-blind builder creates 384 openings from source games using one fixed rule:

1. input contains only `source_game_id` and a USI move vector—no winner, score, rating, or candidate/stable label;
2. take the first 16 plies from each source game;
3. rank games by a domain-separated SHA-256 of the source-game ID;
4. actually apply all 16 moves with the production shogi rules;
5. reject an illegal move, fourfold repetition, or a final position with zero legal moves;
6. ignore the SFEN move number and keep only the first hash-ranked occurrence of each semantic final position; and
7. require a distinct source game for every one of the 384 openings.

The manifest preflight proves legality, nonterminal status, source uniqueness, and semantic-final-position uniqueness for all 384 openings, then returns a PASS receipt bound to that exact manifest. It creates no pair journal and starts no engine. The next ready-registry bridge must obtain this PASS before journal creation.

## Reject unsafe seeds and retries before journals

The real WASM launcher now rejects all of the following before it creates a receipt directory:

- `attempt_index > 0`;
- a non-integer seed;
- a seed at or below zero; or
- a seed above `Number.MAX_SAFE_INTEGER`.

This formal operational contract is attempt-zero only. The current journal retains partial outcomes, so attempt one cannot honestly be described as a blind rerun. A future rerun would require a separately preregistered protocol that keeps results hidden from the operator.

## Select full-PC concurrency from 2/4/8/12

The safe cap is now 12 pair workers, and eligible settings are exactly `[2, 4, 8, 12]`. Twelve is not selected unconditionally.

The benchmark harness measures the same two pairs / four games three times per setting in a fixed 12-round order. It selects the largest median throughput only if every ordered transcript SHA-256 vector is exactly identical. One changed hash, one technical fault, a missing round, or a reordered setting forbids selection. An exact timing tie chooses the smaller worker count to avoid unnecessary memory and process load.

This PR has no real candidate or real opening manifest, so it deliberately does not run the heavy real-WASM benchmark. Fixtures verify 12 simultaneous pair callbacks, complete 384-pair / 768-game accounting, and rejection on transcript-hash drift.

## Values checked in this change

| Item                         |           Result |
| ---------------------------- | ---------------: |
| Python focused tests         | 15 pass / 0 fail |
| TypeScript focused tests     | 14 pass / 0 fail |
| Real formal pairs / games    |            0 / 0 |
| Real worker-benchmark rounds |                0 |
| Network / cloud jobs         |            0 / 0 |
| Live-weight changes          |                0 |

The machine-readable boundary is recorded in the [P0 foundation evidence](./data/floodgate-formal-paired-ab-v2-p0-foundation-2026-07-20.json).

## Explicitly deferred to the next change

This PR is the foundation. The next change must add:

- the bridge from a reviewed ready registry to the new WASM contract;
- an argumentless production CLI;
- atomic publication of manifest, benchmark, and result artifacts;
- source-game provenance closure;
- construction of 384 openings from real strong-game sources;
- the real 2/4/8/12 benchmark after candidate selection; and
- formal 384-pair / 768-game execution at the selected worker count.

Retention, regression, and external calibration follow. Live weights remain unchanged until that evidence exists. This P0 alone is not evidence that the engine became stronger or reached high-dan strength.
