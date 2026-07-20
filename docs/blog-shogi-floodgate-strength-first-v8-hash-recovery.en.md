# Why v7 stopped at parent 500, and why v8 restarts with a 512 MB hash

> Status on July 19, 2026. This records the real v7 failure, focused diagnostics with the same YaneuraOu assets, and the v8 recovery implementation. The formal v8 teacher run, retraining, playing-strength gain, and live promotion are not complete. [日本語版](./blog-shogi-floodgate-strength-first-v8-hash-recovery.md)

## v7 stopped safely, but it did not finish

v7 authenticated all 24,000 training parents and completed its 100-parent milestone. It later stopped on the second search timeout inside the 500-parent prefix. The registered timeout-skip allowance at 500 was one, so the runner failed closed without saving the second timeout as either a label or another skip.

| v7 state at exit | Measurement |
| --- | ---: |
| `work.jsonl` | 500 records including its header; 6,818,743 bytes |
| Non-timeout parent entries | 498 |
| Persisted timeout skips | 1 |
| Second timeout entry / partial label | 0 / 0 |
| Milestone 100 / 500 | Complete / incomplete |
| Final result / training / live changes | None / not started / 0 |

Every runner and YaneuraOu process was reaped. The retained lock file is not an active lock; retaining that private inode is the normal locking protocol.

## The problem was pathological search growth with a 64 MB TT, not unused CPU

Twelve one-thread YaneuraOu processes were already running concurrently. Under the formal `USI_Hash=64` setting, however, a few depth-16 searches repeatedly collided and replaced transposition-table entries and ran beyond 600 seconds. Adding more parallel jobs cannot accelerate one pathological single-thread search.

We reran only the two v7-stopping positions with the same pinned engine, evaluation data, and depth 16 from private temporary directories. Positions, parent identities, and candidate moves remain private.

| Diagnostic | Hash 64 | Hash 256 | Hash 512 |
| --- | ---: | ---: | ---: |
| First independent rescore | 870.566 s / 707,909,200 nodes | 132.162 s / 130,950,979 nodes | 157.325 s / 162,457,860 nodes |
| Full label for the second parent | Still incomplete after 1,007.432 s; 900 s rescore timeout | 88.063 s | 70.316 s |
| Aggregate for nine normal positions | — | 212.208 s | 206.092 s |

Hash 256 was faster on the first case. Hash 512 was 2.882% faster across the nine normal positions and 20.153% faster on the second failed parent. Both 256 and 512 completed the two known failures within the formal 600-second bound. These measurements do not prove that every future timeout has been eliminated.

## v8 fixes `512 MB × 12 processes`

The v8 candidate fixes:

- Twelve processes with one thread each
- 512 MB of hash per process, 6,144 MiB total
- MultiPV 12 at depth 16 for proposals
- MultiPV 1, exactly one `searchmoves` move, and depth 16 for every independent rescore
- A 600,000 ms bound for each search
- The unchanged timeout-skip cap `ceil(target / 1000)`

The Mac has 48 GiB of memory. A diagnostic peak with 15 concurrent processes reached 1,258% aggregate CPU while 47% of memory remained free and zero pages were throttled. Twelve 512 MB hashes consume 12.5% of physical memory, and roughly 92 GiB of free storage was not a bottleneck.

A production-like load test then labeled twelve normal parents concurrently with twelve 512 MB processes. It completed 12 / 12 with zero failures in 47.557 seconds wall time; individual parents took 11.894–47.520 seconds. Peak RSS across the twelve engines was approximately 8.0 GiB, system memory remained 45% free, and zero pages were throttled. After cleanup there were zero engines, zero private test directories, and 49% free memory. This verifies `12 × 512 MB` under simultaneous load on the 48 GiB, 14-core host rather than relying on configuration arithmetic alone.

We did not simply keep increasing the hash to 1,024 MB. It was slower than 512 MB on the first known case while consuming more memory. The decision uses measured headroom and normal-position throughput, not the largest possible number.

## Never copy the 498 v7 entries into v8

Hash size is not merely a performance knob. It can change search order, TT hits, proposed candidates, and scores at the same nominal depth; the diagnostics changed both node counts and timings. The run fingerprint binds the hash setting and the exact runner revision. A 64 MB v7 label therefore has no authority inside the 512 MB v8 run.

The implementation enforces that separation:

- New output root `~/.codex/shogi-runs/floodgate-q1-2026-strength-first-v8`
- v2 runner, milestone, result, and public-receipt schemas
- The downstream training bridge rejects the v7 path and v1 result
- Full reauthentication of all 24,000 inputs into an empty v8 root
- No modification or deletion of the failed v7 artifacts

The public JSON contains only aggregate counts, byte sizes, timings, and protocol configuration. Exact parent identities, positions, moves, and private work/prefix digests stay in a local mode-`0600` receipt that is not committed to Git.

## This is not yet a strength claim

The completed work reproduces the known timeouts, chooses a measured hash setting, and implements an isolated v8 entrypoint, downstream boundary, and regression tests. This change does not launch the formal v8 teacher. That run begins only after review, CI, a regular merge, and capture of the exact clean merged revision.

The accurate conclusion today is “a v8 candidate removes the known completion blocker,” not “the AI now plays at a high-dan level.” A strength claim still requires the complete 24,000-parent teacher, three-seed retraining, candidate selection, sealed holdouts, formal paired A/B, and external calibration.

The [public aggregate evidence](./data/floodgate-strength-first-v8-hash-recovery-2026-07-19.json) is machine-readable, and the change was preregistered in the [v8 hash-recovery amendment](../ml/protocols/floodgate-q1-2026-strength-first-v8-hash-recovery-amendment.json).
