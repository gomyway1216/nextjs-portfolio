# Directly testing one bounded quiet-history malus candidate

_July 25, 2026_

[日本語版](./blog-shogi-bounded-quiet-history-malus-pilot.md)

## The question

The next experiment is a small search-ordering change, not another evaluation-function training run. There is exactly one candidate: **bounded-quiet-history-malus-v1**. Both candidate and production arms will load the same current live weights. Direct play will measure whether changing only the candidate's search shows enough promise to continue.

There is no guarantee. This plan does not claim that a more elaborate history heuristic must be stronger, that fewer nodes must produce a higher win rate, or that passing 56 games establishes high-dan strength. The pilot exists to stop an unpromising idea quickly and to authorize a separate 96-game test only if the signal is large enough.

## This is not the rejected History gravity

The current search adds `depth²` to main history at every beta cutoff and also adds it to continuation history for non-capture cutoffs. It records no negative evidence for quiet moves that were searched earlier at the same node but failed to cause that cutoff.

The previously rejected **History gravity** halved all history between iterative-deepening passes. At short time controls it indiscriminately discarded fresh evidence and performed worse in direct play. This experiment does not revive that method.

Enabling the new candidate replaces those broad historical updates with bounded strict-quiet updates. It rewards the cutoff move and penalizes, in search order, at most the first 32 eligible quiet moves that were actually searched before it at the same node. Later eligible moves are not retained and increment `storageDrops`. Killer and countermove updates remain unchanged. Depth is clamped to `1..32`; reward is fixed at `min(2,048, 16×depth²)` and malus at `-min(1,024, 8×depth²)`. The saturation formula clamps its input bonus to `±16,384`, so updates shrink as a history value approaches the bound. There is no periodic global decay.

Illegal, pruned and unsearched, capture, promotion, checking, check-evasion, and null-move-node moves are excluded from the new history updates. A drop is not excluded merely for being a drop: a non-checking drop that satisfies every other condition is strict quiet and remains eligible. Up to 32 previously searched quiet moves are retained per ply. Dedicated counters verify rewards, maluses, both absolute history bounds, capacity overflow, and every eligibility filter.

## Why B12 stops here

The B12 200,000-position depth-12 run improved static loss and teacher agreement. Its saved execution settings did not match the preregistration, however, its records included nonfinite metrics, and an independently reproduced maximum quantization-error ratio exceeded the fixed limit. The run was invalidated before its 56-game screen. It will not be rerun, expanded to 800,000 positions or depth 16, or followed by extra seed searches.

This candidate does not use the B12 checkpoint. Live weights remain exactly `1,185,988` bytes with SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`. The experiment is therefore independent of B12 and scalar-evaluator retraining.

## Correctness before games

The production AssemblyScript source, production WASM, live weights, and the 64-position fixture v2 are pinned by byte count and SHA-256. The research WASM is built by applying a patch to a temporary copy of the production source and emitting a separate artifact. The implementation and build now exist in the same PR: the research WASM is `37,475` bytes with SHA-256 `8b0469b220ccaf61eb2e4ab6575d73e681e007ab88367e5892a44778ac5f684c`. The remaining runner identities must be fixed before PR merge. The externally visible preregistration point is that merge.

At fixed depth 5 and quiescence depth 8, the fixture has 16 opening, 16 middlegame, 16 drop-heavy, and 16 check-evasion positions. With the research toggle OFF, all 64 must be bit-exact with production for best move, score, depth, nodes, and leaves. With the toggle ON, every returned move must be legal, repeated inputs must be bit-exact, and board, hand, side-to-move, and combined hashes must be restored after every search. Reward and malus must activate in all four categories. Both observed absolute history values must stay at or below `16,384`, at most 32 quiet moves may be retained per ply, and ineligible updates and technical faults must both be zero.

A pre-merge implementation diagnostic using the same depth-5/q8/fixture-v2 settings passed OFF exactness for all 64 cases, ON determinism, legality, state hashes, activation in all four categories, and every bound. It observed `30,361` reward/cutoff events, `28,421` maluses, `58,782` main and continuation updates each, a retained peak of `32`, maximum main magnitude `14,907`, and maximum continuation magnitude `9,312`. This is not the formal result. After merge, the formal gate will run again and bind its result to the merged plan SHA, both WASMs, live weights, fixture, and runner identity.

## The 56-game direct pilot

The sole correctness-passing candidate will face the production WASM under these fixed conditions:

- The same immutable live weights in both arms
- 1.5 seconds per move
- 28 fresh color-swapped pairs, seeds `970002` through `970029`, for 56 games
- 12 pair workers
- No opening book and no mate solver
- TT cleared before each game and retained only within that game
- No other heavy workload during the match

Completed receipts contained 607 prior openings, but regenerating all eleven preregistered manifests, including unplayed entries, found 3,198 enrolled openings. The original first candidate, seed `970001`, collided with prior seed `810127` and was excluded. Without using any strength result, the fixed selection rule scans upward from 970001 and accepts the first 28 fingerprints that are absent from both the prior set and the new set. That produces seeds `970002..970029`. A content-addressed evidence file stores all 3,198 fingerprints and the complete selection trace; the runner must reproduce it and prove intersection zero itself.

The runner also verifies before and after each pair that the candidate research toggle is ON and that production has no such toggle. Every move is revalidated against the legal-move list. Fourfold repetition is a draw unless one side gave continuous check, in which case the checking side loses. The original two-hour deadline, technical faults, and wall stops are durable, so restarting cannot erase a fault or reset the limit. One duplicate, illegal move, asset mismatch, or technical fault invalidates the whole pilot and permits no strength conclusion.

Passing requires at least **62/112** candidate halfpoints. Early stopping is allowed only when even wins in every remaining game cannot reach 62. The wall-clock limit is 2 hours. An incomplete run ends as `STOP`; partial results cannot pass or authorize selective continuation.

## A pass still does not change live

A pass authorizes only a separately preregistered independent 96-game confirmation using unused seeds and openings. The production AssemblyScript, JS fallback, production WASM, embedded base64, and live weights remain untouched throughout the pilot. Neither a PR merge nor live promotion follows automatically without the independent and later formal evidence.

These conditions are fixed in the [machine-readable plan](../ml/protocols/bounded-quiet-history-malus-v1-plan.json). The research build, implementation diagnostic, and full enrolled-opening preflight now exist. The post-merge formal correctness gate and direct games have not started, so there is still no playing-strength result.
