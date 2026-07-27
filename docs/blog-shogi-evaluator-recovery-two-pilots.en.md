# Shogi evaluator recovery: two honest static rejections

> Two local experiments have now completed: a warm-start retraining run over all legal moves and a separate residual move-ordering head. Both were rejected by their preregistered static gates. They produced useful measurements and exposed several experiment bugs before optimization, but neither produced a candidate eligible for browser integration, match play, or live promotion. The deployed collision-safety work is a correctness improvement only; the live NNUE remains exactly 1,185,988 bytes with SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`. [日本語版](./blog-shogi-evaluator-recovery-two-pilots.md)

## Bottom line

The site is safer against hash-collision contamination, but these two pilots have not made its shogi AI stronger. The live strength weights are unchanged. No screen match, formal A/B, or external calibration was authorized because neither candidate cleared its static gate.

This is not evidence of high-dan strength or an Elo gain. It is also not evidence that improving the engine is impossible. It shows that these two exact training recipes did not create a sufficiently large and consistent improvement, so repeating them with extra epochs, seeds, or relaxed thresholds would not be justified.

## What reached production: collision safety, not stronger weights

The live engine now uses the collision-safety integration across its relevant caches and search state. That prevents unrelated positions with the same compact hash from being treated as the same position. This matters for correctness and for the reliability of later measurements.

It does not change what the evaluator learned. The before, after, and current live weight bytes are identical:

| Live artifact | Value |
| --- | --- |
| Size | 1,185,988 bytes |
| SHA-256 | `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc` |
| Strength-weight write attempts in these pilots | 0 |

Security, provenance, and collision checks were therefore useful guardrails, but they must not be counted as playing-strength gains.

## Pilot 1: all-legal warm-start

The first pilot warm-started from the live evaluator and trained against all legal sibling moves, rather than learning only from one played move. It used 112,011 sibling-training rows across 1,334 parents, 57,658 validation rows across 643 parents, 500,000 replay examples, and 2,959 preservation-validation examples. The final semantic overlap between training and validation was zero.

Training used Apple MPS, seed 42, and three epochs. The epoch times were 25.52, 11.89, and 10.95 seconds, for 48.35 seconds of optimizer time.

The quantized production-format candidate improved several value and ranking measurements, but it failed five required checks:

| Static measurement | Live | Candidate | Required | Result |
| --- | ---: | ---: | ---: | --- |
| Top-1 accuracy | 63/643 (9.80%) | 61/643 (9.49%) | at least 73/643 (11.35%) | Fail: 12 parents short; 2 below live |
| Recall@3 | 23.64% | 25.51% | no regression | Pass: +1.87 points |
| Recall@5 | 37.79% | 36.24% | live +2.00 points | Fail: 3.56 points below the gate |
| NDCG@5 | 0.37356 | 0.37839 | live +0.01000 | Fail: 0.00517 below the gate |
| Pairwise accuracy, 50 cp | 0.66756 | 0.66973 | 0.67259 | Fail: 0.00286 below the gate |
| Pairwise accuracy, 200 cp | 0.69226 | 0.69480 | no regression | Pass: +0.00254 |
| Value loss | 0.06424 | 0.06061 | ratio within limit | Pass: ratio 0.94348 |
| Value MAE | 609.36 cp | 580.63 cp | improve | Pass: 28.73 cp lower |

The exact failed checks were top-1 count, top-1 accuracy, recall@5, NDCG@5, and 50-cp pairwise accuracy. Export and production-format verification were healthy: the artifact was exactly 1,185,988 bytes, its SHA-256 was `75bad23fe5fef2e646bdde7549293d774e4fce2d488d5d6261e5e68faf35dbdb`, all 200 round-trip checks passed, and the fault and overlap counts were zero.

That is not enough to admit the candidate. The recorded status is `complete-static-rejected`; no selected `best.pt` or promotable `candidate-weights.bin` was produced. The registered next action is to stop this exact lane without further tuning.

## Pilot 2: an explicit residual move-ordering head

The second pilot left the live NNUE frozen and trained a separate, collision-free parent/move residual intended only for root move ordering. It used explicit features rather than hash buckets. The quantized head is 70,614 bytes, below its 131,072-byte cap.

The selection run completed eight epochs in 159.76 seconds and selected epoch 1. A one-epoch refit took 78.13 seconds, for 237.89 seconds of optimizer time in total. The fit/tune split contained 19,459/4,348 V9 examples and 922/298 browser examples, with zero game or semantic overlap.

The head moved the large V9 set slightly in the right direction, but barely changed the browser distribution that it was required to improve:

| Static measurement | Baseline | Candidate | Required | Result |
| --- | ---: | ---: | ---: | --- |
| Browser top-1 | 63/643 | 63/643 | at least 96/643 | Fail: 33 parents short |
| Browser pairwise accuracy | 0.66756 | 0.66789 | at least 0.68756 | Fail: 0.01966 short |
| Browser regret | 11,533.30 cp | 11,532.11 cp | no regression | Pass: 1.20 cp lower |
| V9 top-1 | 1,456/4,798 | 1,460/4,798 | no regression | Pass: +4 parents |
| V9 pairwise accuracy | 0.59158 | 0.59231 | no regression | Pass: +0.00072 |
| V9 regret | 7,316.75 cp | 7,316.58 cp | no regression | Pass: 0.16 cp lower |

Quantized-parity and artifact-size checks passed. The export SHA-256 was `df6065d1215c476f4f9339ccb536648205e511ee9dcc1cff89529344edf911ef`.

The browser top-1 and pairwise gates failed, so the status is again `complete-static-rejected`. The head was not integrated into the browser or WASM, and no node-count, speed, direct-play, or match evidence exists. Teacher generation and live-weight changes were also zero.

## Experiment bugs caught before optimization

Several parts of the original experiment setup would have made the results invalid or needlessly wasteful. They were corrected before the optimizer was allowed to run:

- The first all-legal runner contained stale live baselines and a fractional output conversion that did not match production's exact integer-centipawn truncation.
- Parent-to-child move transitions were not being validated.
- The first fit/tune split leaked four semantic identities across the browser partitions. It was replaced with a transitive game-plus-semantic component split: 29 browser components and 1,000 V9 components, with zero game and semantic overlap.
- The proposed residual-head refit silently shortened its cosine schedule and did not cover all retained parents as the plan claimed. It was changed to the registered eight-epoch schedule and complete one-pass parent coverage.
- Exact baselines and identities were checked before optimization, so a mismatch could stop the run before spending training time.

These fixes improved the trustworthiness of the evidence. They did not themselves improve the evaluator.

## What was useful, and what was not

Useful outcomes include exact production arithmetic, leak-free splits, legal-transition validation, immutable live identities, reproducible run receipts, and one-shot gates that prevented weak candidates from reaching matches or production. The first pilot also established a real pattern: value error and some pairwise metrics can improve while top-move selection gets worse. The second established that this small explicit residual representation has too little effect on the target browser distribution.

What did not produce strength was the candidates themselves. There was no admitted model, no browser runtime experiment, no 56-game screen, no formal match, and no live promotion. More tuning of these exact rejected recipes would turn the held-out gates into tuning targets and weaken the evidence. That lane is closed.

## Next evidence-based direction

The next experiment should be a new, preregistered hypothesis rather than a rerun of either rejected recipe. The leading options are:

1. Build a fresh, strictly isolated all-legal dataset with stronger and deeper teacher labels targeted at the browser's actual position distribution. Its selection and final sets must remain unseen.
2. Design a move-policy or root-ordering representation with materially more capacity than the rejected 70 KB residual head, while keeping it separate from the scalar value evaluator until static evidence supports integration.
3. If the compute budget permits, run an iterative self-play and learning cycle for the project's own engine, with direct paired-play tests built into each generation.

None guarantees a particular rank. A new candidate must first improve the target static distribution, then pass an off-by-default runtime check for nodes and speed, then a paired screening match, and finally a larger formal A/B before any live change. At present there is no candidate at the first of those gates.

## Claim boundary

The honest current conclusion is:

- collision safety is deployed;
- live evaluator weights and measured live playing strength are unchanged;
- two local training pilots completed and were statically rejected;
- their exact recipes should not be repeated;
- no Elo or high-dan claim can be made;
- the evidence narrows the next experiment toward stronger fresh labels, a more capable policy representation, or a measured self-play loop.

Rejecting weak candidates is not the same as making the engine stronger. It is the point where we stop counting infrastructure and tiny offline movements as strength, and require direct evidence before changing the live game.

The machine-readable record of input and artifact hashes, split receipts, training time, and every static-gate result is [shogi-evaluator-recovery-two-pilots-2026-07-26.json](./data/shogi-evaluator-recovery-two-pilots-2026-07-26.json).

Update: this direction is now preregistered as a 5,953,522-parameter capacity diagnostic—168.6 times the rejected residual—with known-evaluation exclusions, leak-free fit/tune partitions, a still-unlabeled sealed derivative, and explicit stop gates. See the [large policy/value capacity plan](./blog-shogi-capacity-policy-value-plan.en.md).
