# The formal v9 teacher completed all 24,000 positions

> On July 20, 2026, the local strength-first v9 teacher finished all 24,000
> parent positions and produced the retraining dataset. The corrected
> downstream verifier also passed a full scan of the real artifacts. Three-seed
> training has not started, however, so this is not evidence of improved play
> or high-dan strength. Live weights remain unchanged. Japanese:
> [blog-shogi-floodgate-strength-first-v9-teacher-completion.md](./blog-shogi-floodgate-strength-first-v9-teacher-completion.md)

## What completed

| Item                               | Measured result |
| ---------------------------------- | --------------: |
| Input / completed parents          | 24,000 / 24,000 |
| Parent groups emitted for training |          23,980 |
| Unlabelled skips                   |              20 |
| `search_timeout_no_label`          |              15 |
| `proposal_incomplete_no_label`     |               5 |
| `fewer_than_two_legal_moves`       |               0 |
| Training rows                      |         278,736 |
| Three-seed training processes      |               0 |
| Live-weight changes                |               0 |

The teacher ran 13 YaneuraOu processes locally. Each used one thread and
512 MiB of Hash. Proposal used depth 14 / MultiPV 12, and every candidate was
independently rescored at depth 16 / MultiPV 1. No AWS, GCP, Vercel, or other
cloud compute was used.

The principal completed artifacts are bound to these identities.

| File                      |                     Bytes / rows | SHA-256                                                            |
| ------------------------- | -------------------------------: | ------------------------------------------------------------------ |
| `result.json`             |                     19,911 bytes | `ccdefb750896471e8fca6740801e3b86d8d5a581d00edb0add34a16fa75e5d88` |
| `work.jsonl`              | 331,235,047 bytes / 24,001 lines | `c215e3cbe8b25483a25b0aa8ae7a80a495a7b72b824a4f9313ddcdc607e7da61` |
| `train.jsonl`             | 236,990,586 bytes / 278,736 rows | `4a18b186c255b66dd195ec4c781381bc10d583951acfa8a690a9c152467b9580` |
| `parent-completion.jsonl` |   13,293,512 bytes / 24,000 rows | `b92df8b37287010cd1314df853a0e337881c5cde573f5c3a4be9b4391639444f` |
| `manifest.json`           |                      7,248 bytes | `f75d38211ea9b65ae79db749f0bc240e40221ba367d70362f2d1e82b74d399e3` |
| `staged-result.json`      |                      2,380 bytes | `36ae1ffe3ad2ed1a4af2364eec3f2cbfbe195ae918f70ac649e764acfe33dbf8` |

## The verifier defect found after completion

Independent review reported zero P0 findings, one P1, and zero P2s. The P1 was
not damaged teacher data. The v9 generator correctly recorded the v9 revision
in its artifacts, while three shared downstream-verifier checks still expected
the v8 revision. The first formal plan-candidate attempt therefore stopped
safely at `input-binding`.

After the minimal fix kept v8 on its legacy constant and bound the v9 input
revision exactly across the runner, manifest, and staged result, the fixed
command scanned the formal artifacts in 50.74 seconds with 898,203,648 bytes
maximum RSS and zero swaps. Semantic verification passed for 24,000 parents,
23,980 groups, 20 skips, and 278,736 rows. All six focused tests passed as
well. The fix and this record are being reviewed together; no exact training
plan has been issued yet.

## Training remains at two threads per seed

After the teacher released the CPU, a synthetic QAT benchmark ran seeds 42,
43, and 44 concurrently and compared two versus four threads per process in
`2, 4, 4, 2` order. The pair speedups for four threads were 1.003031× and
0.962423×. Their 0.982727× median missed the 1.05× adoption gate, so the
benchmark selected two threads per seed. More threads were not faster under the
real training calculation; formal training will therefore use six intra-op
threads across the three processes.

The 30,416-byte benchmark receipt has SHA-256
`4903916e4f1770947fad8986a9b0119ab41b5c63b94fffa259c796b46188ec9d`.
It ran at `f0f943e5251bc8b511a050e614561eca3903f8ba`; main was
`e9fed482e4d83a38feddaf6dabf3abd66d09aab9` when the result was checked. The
intervening PR #569 changed only web/blog files. The benchmark, training loss,
fixed-point calculation, plan builder, training bridge, and launcher retained
identical bytes and hashes. This recorded cross-revision equivalence lets the
measurement stand, but does not relabel its execution revision as current main.

## This is not yet a strength improvement

The completed deliverables are teacher labels and a verified handoff into
training. There are still zero new evaluation functions and zero match games.
Next, review and merge the verifier fix, enroll the exact plan, and train seeds
42, 43, and 44 concurrently. Fresh selection, sealed holdouts, formal paired
A/B, and external calibration must follow. Live weights remain unchanged until
that evidence is complete.

Machine-readable record:
[floodgate-strength-first-v9-teacher-completion-2026-07-20.json](./data/floodgate-strength-first-v9-teacher-completion-2026-07-20.json)
