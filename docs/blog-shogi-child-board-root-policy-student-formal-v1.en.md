# Execution boundary for the root-policy student's formal 768 games

## 2026-07-28: freeze the runner that must not run yet

The root-policy student's formal match cannot reuse the old NNUE-vs-NNUE formal v2 adapter. This experiment does not compare two evaluators. Candidate and stable must share the **same live NNUE, worker, WASM, build, and search controls**; the only parsed difference is whether root student ranking is enabled.

This change therefore adds `child-board-root-policy-student-formal-v1-registry.json` and a dedicated controller first. The registry is deliberately `blocked`: the current CLI creates no output directory, subprocess, or game. That is not a placeholder PASS. Game one remains forbidden until the frozen student tensor, tune, sealed, parity, latency, static/determinism/no-contamination runtime admission, and the same-build candidate/stable adapters are all content-addressed.

## Frozen comparison

| Item                     | Fixed value                                                      |
| ------------------------ | ---------------------------------------------------------------- |
| Opening pairs            | 384                                                              |
| Games                    | 768 (candidate as sente and gote for every opening)              |
| Pair workers             | 12                                                               |
| Search                   | depth 11, quiescence 10, K=600                                   |
| TT                       | cleared before every move                                        |
| Book / fallback / clocks | all disabled                                                     |
| Technical fault          | stop on the first fault; a partial run has no decision authority |
| Authoritative statistic  | complete-run pair bootstrap only                                 |
| Bootstrap                | seed 20260710, 100,000 replicates                                |
| Safety gate              | one-sided 95% lower > 0.45                                       |
| Stronger gate            | two-sided 95% lower > 0.50                                       |

The sequential SPRT is diagnostic only. It cannot make an early strength decision or authorize external calibration. Only all 384 complete, zero-fault pairs can enter the authoritative bootstrap.

## Safety frozen in the runner

The controller validates the complete READY registry, the same-build role binding, color-swapped requests, pair receipts, zero stable-side student tensor reads/inference calls, and positive candidate-side student inference.

It uses bounded submission: at most 12 pairs are in flight instead of queuing all 384 immediately. The first fault stops new submissions, and a partial result can never reach bootstrap analysis. This preserves useful parallelism without continuing a large invalid run after a fault.

## Current nonclaims

This change alone leaves formal progress at 0/768. It does not claim improved strength, high-dan external calibration, a live-weight change, or a production-flag change. A later reviewed commit may enroll the registry only after real student training and the one-shot tune, sealed, and runtime-admission gates succeed.
