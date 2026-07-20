# The formal strength-first three-seed training run is complete

> On July 20, 2026, the seed 42, 43, and 44 retraining jobs over the formal v9
> teacher's 278,736 rows all completed on the local Mac. Each candidate used
> 20 epochs, two CPU threads, and the fixed final epoch as its only candidate.
> This proves that three candidates were produced; it does not yet prove stronger
> play or high-dan strength. Live weights remain unchanged until fresh selection,
> the sealed holdout, formal A/B matches, and external calibration are complete.
> [日本語版](./blog-shogi-floodgate-strength-first-three-seed-training-completion.md)

## Execution result

The three jobs ran concurrently rather than serially. The launcher completed in
1,814.38 seconds (30 minutes 14.38 seconds), and all three process return codes
were zero. `/usr/bin/time -lp` observed 3,524.01 user seconds, 2,918.26 system
seconds, a 2,463,711,232-byte maximum resident set size, and zero swaps.

| seed | epoch | final task loss | `result.json` bytes / SHA-256 | `final.pt` bytes / SHA-256 |
| ---: | ---: | ---: | --- | --- |
| 42 | 20 | 0.6226236975 | 7,700 / `c68c99eadf5081fee9370023dde2d7bd8c3430ba15d28fc0715c8a2a90809763` | 2,383,633 / `84ab533c7bf36183b83228c5dab5817dd730fcfae5d81be645569f45b5622a6a` |
| 43 | 20 | 0.6225629238 | 7,698 / `e9681e76bd1859ebf4af9e7dbb10b2269e5c024c0d58de0e195d2ef0021cc4b6` | 2,383,633 / `6665c7de16c8f9b6b7eb9c3fccc29db58ae12271e548301b25b9233508c4bbb0` |
| 44 | 20 | 0.6214848745 | 7,700 / `65b0df3892c0d86446d7febe896fb4e59bbb086223a7030ccdf8ec1f8c0a5c30` | 2,383,633 / `00b074439f404c1d95e77ed4d0318ab34c85106d4a18c7a18f394e21f6aabcd5` |

All results bind to the fixed 6,242-byte plan with SHA-256
`ab5264f14e2ccde65c2aa4a17e21c3dd20839edd268d6c4aa345291f38c5178c`
and training revision `ba52b872599356063d1c4790a59564bf758cddcc`.
Each run read zero selection labels and performed zero selection evaluations.
Candidate selection, holdout evaluation, and live changes also remain zero.

## Why each candidate did not receive all 14 cores

The pre-run comparison measured two versus four threads per seed. The median
four-thread speed ratio was 0.982727, so four threads were about 1.73% slower
than two. We optimized completion time rather than displayed CPU utilization:
all three seeds ran concurrently while each seed remained fixed at two threads.
Changing that value mid-run would also have violated the fixed plan and
reproducibility boundary.

A future cycle can reduce repeated startup work by parsing common data once into
a hash-bound shared cache. That opportunity was identified after this run's
preprocessing, so stopping and rebuilding the already-running formal job would
have taken longer than completing it unchanged.

## Enrolling the three candidates for the next stage

After training, the registry builder independently strict-loaded all three
`result.json` and `final.pt` pairs twice. Both outputs were byte-for-byte equal:
2,965 bytes with SHA-256
`0526b1633364db4c6e715a612823b1fc2d5375610329f017aff20d810fda88c1`.
That exact output is enrolled in the selection preflight registry. The focused
Python tests passed 20 / 20, and the full Python regression passed 391 / 391.

After review, CI, and a regular merge, the pipeline will strict-load the three
checkpoints again and generate 4,800 unused fresh-selection positions with
12 parallel YaneuraOu processes. Stable and all three candidates will then be
evaluated on the same data. Only a passing candidate can continue to the sealed
holdout and formal matches.

Machine-readable record:
[floodgate-strength-first-three-seed-training-completion-2026-07-20.json](./data/floodgate-strength-first-three-seed-training-completion-2026-07-20.json)
