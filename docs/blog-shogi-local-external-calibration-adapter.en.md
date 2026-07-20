# Shogi AI: a local external-calibration match adapter for stable versus YaneuraOu

> As of 2026-07-19, real calibration against YaneuraOu remains at **zero games**, with **zero** claims of improved strength, high-dan strength, or formal A/B success. This change adds only a local adapter that swaps colors from the same openings and returns a result after every game and both cleanups complete. It writes no live weights, holdout data, production results, or network state. [日本語版](./blog-shogi-local-external-calibration-adapter.md)

## Why this is needed

The previous internal match script compared JavaScript V2 through V20. It did not connect the exact currently deployed Worker / WASM / NNUE weights to an independent strong USI engine. Internal metrics therefore could not answer how the current stable engine compares with an external yardstick.

This adapter creates only that measurement path. It does not train, select a candidate, run formal A/B, or deploy weights. A small pilot win would not prove high-dan strength, and a loss would not automatically modify either training data or live weights.

## Exact endpoints

| Side               | Fixed runtime                                           | Search                                                                                                 | Exact identity                                                                                       |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| current stable     | production stable Worker / WASM / NNUE, 12 workers      | depth 11, no book, private TT cleared for each parent, 600-second technical timeout                    | weights: 1,185,988 bytes, SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| external reference | pinned YaneuraOu NNUE 9.60git APPLEM1, 12 USI processes | depth 16, Threads 1, no book, `isready` + `usinewgame` before every move, 600-second technical timeout | engine: 700,048 bytes, SHA-256 `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1`    |

Both runtimes use the existing fixed asset authority. The adapter cannot take replacement paths, engines, weights, or depths. Its pinned function requires one complete request; there is no argumentless entry or CLI.

The stable runtime requires a training-parent-shaped record. For each position, the adapter rederives the canonical SFEN, game ID, SFEN-derived position ID, and move-number-derived ply. It supplies the bytewise-first legal move as the structural `played_move`; the match uses only the independently returned `stable_move`.

## Pairing and completion

The adapter derives two games per opening:

1. stable as sente and YaneuraOu as gote;
2. stable as gote and YaneuraOu as sente from the identical canonical opening.

A caller cannot omit one color or substitute a different opening in the second game. Up to 12 games can run concurrently, while receipt order remains opening order, stable-sente, then stable-gote.

Every move checks:

- SFEN parse and exact canonical re-encoding;
- the rules-complete legal set and rejection of an opposing-king capture;
- canonical USI membership in that exact legal set;
- runtime receipt agreement with the request's fixed depth and timeout; and
- stable TT clearing plus YaneuraOu reset-before-search bindings.

Games end on no legal moves, fourfold position repetition, perpetual-check loss, or the preregistered maximum ply. USI `resign` / `win` and incomplete fixed-depth transcripts that the existing runtime cannot authenticate remain technical faults; the adapter does not guess a result from them.

## No partial result

One illegal move, timeout, engine fault, accounting mismatch, abort failure, or orderly cleanup failure prevents a complete receipt. Previously completed games are discarded. The error exposes only the discarded-game count, `receipt_issued=false`, and `partial_result_publishable=false`; it does not expose a partial W/D/L or win rate.

Even after all games complete, the receipt is returned only after both runtimes close successfully. Its SHA-256 binds:

- the exact request, openings, colors, depths, timeouts, maximum ply, and concurrency;
- both runtime receipts;
- every USI move and per-search receipt;
- final SFENs, termination reasons, and complete W/D/L; and
- exact required/completed game accounting with zero technical faults.

Timestamps and absolute paths are excluded, so identical fake inputs produce the same receipt even with concurrent execution.

## Measured validation

The implementation anchor is `70f9a6d0f1098dd37cb4024691ed92e8336582e9`. Independent review found both that the normal MultiPV proposal path technically faults when exactly one legal move remains and that unreachable openings could be accepted. The fix sends a sole legal move through the same fixed-depth-16 MultiPV-1 `searchmoves` rescore path. Request capture now also requires exactly one king per side, board-plus-hand piece totals within physical limits, neither both kings nor the non-moving king in check, no unpromoted double pawn, and no unpromoted pawn, lance, or knight on an immobile rank. This does not claim a complete proof of game-record reachability. The remaining P2 findings were also fixed: a request with non-pinned depth or timeout now stops before runtime initialization, and diagnostics retain both the primary operation failure and a secondary close failure.

| Check                                                                                  |                                                         Result |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------: |
| adapter focused                                                                        |                                                   14 / 14 PASS |
| related SFEN, lightweight USI, production stable, and production Yaneura runtime tests |                                                   81 / 81 PASS |
| pre-P2-fix complete ML suite attempt                                                   | 148 / 149 files, 2,570 PASS, two timeout failures, one skipped |
| isolated rerun of the timed-out file                                                   |                                                   13 / 13 PASS |
| fake-USI subprocess match                                                              |            one opening pair / two games, four plies each, PASS |
| reset trace                                                                            |    one initialization ready + four pre-reference-search resets |
| partial discard after illegal move                                                     |                      one earlier game discarded, zero receipts |
| synthetic 10ms timeout                                                                 |                 both players aborted and closed, zero receipts |
| fourfold-position fixture                                                              |                               draw at 12 plies for both colors |
| perpetual-check fixture                                                                |                   checking side loses at 12 plies, both colors |
| no-legal-moves fixture                                                                 |                          mover wins after one ply, both colors |
| real YaneuraOu / exact-stable games                                                    |                      12 completed in attempt 1, zero claimable |
| network / AWS / GCP / Firebase / Vercel                                                |                                                           zero |
| live / holdout / production-result writes                                              |                                                           zero |

At pre-P2-fix revision `5ff1bb6d`, the complete ML unit suite ran for 212.26 seconds: 148 / 149 files passed, with 2,570 passes, two five-second timeout failures, and one skip. Both failures were in the existing, adapter-independent `siblingTeacherGenerator.test.ts`; its immediate isolated rerun passed 13 / 13 in 18.16 seconds. The record does not rewrite the full attempt as green, and the full suite has not been rerun after the final P2 fixes. The two changed code/test files introduce no new type errors. The repository has unrelated pre-existing TypeScript errors, so this evidence does not claim a passing whole-repository typecheck. ESLint, Prettier, and Git diff checks pass.

## Preregistered 12-game pilot

Before seeing any real-game result, the [pilot request](./data/shogi-local-external-calibration-pilot-request-2026-07-19.json) was fixed at 1,677 bytes and SHA-256 `37cd8ba340566c0b797caf3ead6d95f0094d07d27932f1bc55b9984a2018dbca`. Six public standard opening positions—startpos, Yagura development, ranging-rook development, bishop exchange, double-wing pawn, and central-rook development—each produce one stable-sente and one stable-gote game. The fixed request therefore schedules 12 games at up to 12-way concurrency, stable depth 11, YaneuraOu depth 16, 600-second technical timeouts, and an eight-ply maximum.

This is a technical pilot for proving that the adapter and exact assets complete under 12-way concurrency. With an eight-ply cap, all draws would be unsurprising; it is not a win-rate, Elo, rank, or high-dan experiment.

Independent request review rederived the request identity, all six source-move sequences to SFEN, opening IDs, uniqueness, the 12-game schedule, and validator result, passing with P0 / P1 / P2 = 0 / 0 / 0. The run ID hashes a 46-byte domain, `shogi-local-external-calibration-pilot-run-v1\0` including its trailing NUL, concatenated with the 1,372-byte canonical request body excluding `run_id` (body SHA-256 `0d84be515d14f54d7b7174638459ab58808eb35caab973ddbd18b6025381c0c1`).

The exact-private-asset read-only preflight also passed. YaneuraOu, the 64,217,066-byte eval, and stable weights / WASM / worker matched their pinned identities; exact-tree, private-directory, and post-read revalidation checks were all true. The adapter itself exposes no filesystem, network, live-weight, holdout, or production-result writer.

The first real attempt completed all 12 games with zero technical faults and confirmed runtime cleanup. Its outer result-publication wrapper nevertheless retained a check-then-act race under concurrent launch and used rename semantics that could replace an existing file. It therefore could not prove exactly-once issuance, so attempt 1 is non-issuable. Its W/D/L is not used in this article or any evaluation, and the private artifacts remain preserved. Attempt 2 never started an engine: pre-launch review found missing post-run source revalidation, single-terminal publication, and bounded supervision.

Attempt 3 changes the boundary to an exclusive-directory one-shot claim, pre- and post-run checks of the fixed HEAD, tree, source, request, and wrapper identities, one hard-link-published `terminal.json` containing either receipt or sanitized failure, and a 15-minute supervisor that reaps or terminates children. It is pending independent rereview and is not running while the formal teacher occupies 12 engines, avoiding CPU oversubscription.

## Next gate

The rerun conditions are below. Adapter and asset conditions pass, while independent rereview of the attempt-3 wrapper and a safe idle machine window remain open:

1. independent code review reports zero P0/P1 findings;
2. focused and related validation is green at the reviewed commit;
3. pilot openings and request are fixed before seeing results, preserving the color swap;
4. read-only preflight of the exact private assets is green; and
5. live, holdout, and production writers are reconfirmed closed.

The first pilot calibrates whether the adapter can complete; it is not a high-dan certification. A stable high-dan claim needs a broader preregistered opening set, adequate game count, multiple external references, and preferably a separate bridge to a known rating pool or human ratings. Live weights stay unchanged until both formal A/B and external calibration evidence exist.

Machine-readable values are recorded in the [local external calibration adapter evidence](./data/shogi-local-external-calibration-adapter-2026-07-19.json).
