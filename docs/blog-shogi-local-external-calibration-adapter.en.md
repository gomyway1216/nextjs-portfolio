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

The implementation anchor is `2f32cf36b2d8fa2e40d24523a3d1b892571398d3`.

| Check                                                                                  |                                                      Result |
| -------------------------------------------------------------------------------------- | ----------------------------------------------------------: |
| adapter focused                                                                        |                                                  9 / 9 PASS |
| related SFEN, lightweight USI, production stable, and production Yaneura runtime tests |                                                76 / 76 PASS |
| fake-USI subprocess match                                                              |         one opening pair / two games, four plies each, PASS |
| reset trace                                                                            | one initialization ready + four pre-reference-search resets |
| partial discard after illegal move                                                     |                   one earlier game discarded, zero receipts |
| synthetic 10ms timeout                                                                 |              both players aborted and closed, zero receipts |
| fourfold-position fixture                                                              |                            draw at 12 plies for both colors |
| real YaneuraOu / exact-stable games                                                    |                                                        zero |
| network / AWS / GCP / Firebase / Vercel                                                |                                                        zero |
| live / holdout / production-result writes                                              |                                                        zero |

The two changed code/test files introduce no new type errors. The repository has unrelated pre-existing TypeScript errors, so this evidence does not claim a passing whole-repository typecheck. ESLint, Prettier, and Git diff checks pass.

## Next gate

No real YaneuraOu pilot starts until:

1. independent code review reports zero P0/P1 findings;
2. focused and related validation is green at the reviewed commit;
3. pilot openings and request are fixed before seeing results, preserving the color swap;
4. read-only preflight of the exact private assets is green; and
5. live, holdout, and production writers are reconfirmed closed.

The first pilot calibrates whether the adapter can complete; it is not a high-dan certification. A stable high-dan claim needs a broader preregistered opening set, adequate game count, multiple external references, and preferably a separate bridge to a known rating pool or human ratings. Live weights stay unchanged until both formal A/B and external calibration evidence exist.

Machine-readable values are recorded in the [local external calibration adapter evidence](./data/shogi-local-external-calibration-adapter-2026-07-19.json).
