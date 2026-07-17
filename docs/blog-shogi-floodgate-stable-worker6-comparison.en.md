# Shogi evaluator: six workers did not remove the 600-second tail

> This read-only comparison changed only the worker count from 12 to 6 while keeping the same twelve parents, fixed assets, depth 11 / quiescence depth 10, and 600-second timeout used by the [exact-final-head twelve-worker confirmation](./blog-shogi-floodgate-stable-timeout-confirmation.en.md). The outcome remained seven fulfilled / five rejected, typical successful latency became worse, and parent peak RSS did not decrease. Production, incident state, teacher data, training, and live weights were unchanged. Japanese version: [blog-shogi-floodgate-stable-worker6-comparison.md](./blog-shogi-floodgate-stable-worker6-comparison.md)

## 1. Conclusion

This fixed twelve-parent sample does not support the hypothesis that halving concurrency would reduce memory pressure enough to remove the 600-second timeout.

| Metric                   |  12 workers |   6 workers | Interpretation                             |
| ------------------------ | ----------: | ----------: | ------------------------------------------ |
| fulfilled / rejected     |       7 / 5 |       7 / 5 | no completion-count improvement            |
| fulfilled median         |     66.382s |     91.617s | six workers are 38.0% slower               |
| fulfilled mean           |     77.398s |    132.708s | six workers are 71.5% slower               |
| fulfilled maximum        |    264.590s |    255.621s | only the longest success is 8.969s shorter |
| post-preprocessing total |    601.281s |    601.243s | effectively identical, a 0.038s difference |
| parent peak RSS          | 6,781.5 MiB | 6,822.3 MiB | 40.8 MiB higher, not lower                 |

The six-worker run is 40.726 seconds shorter overall only because authenticated input preprocessing happened to be 40.688 seconds faster. That difference is not attributed to worker count.

## 2. Comparison boundary

The six-worker run used detached merged `main` commit `ce33913014eb0e990dfaabe344e2e7c8d5e393d5`, tree `c49276cb15568677c65780ddd188f6a4c3fdb247`, and Node `v22.13.0`.

Only the worker count changed from the twelve-worker baseline. These remained fixed:

- authenticated training-input logical indices 3 through 14, exactly twelve parents
- fixed stable WASM / weight / worker assets
- depth 11 and quiescence depth 10
- queue bound 48
- startup timeout 120 seconds, search timeout 600 seconds, close timeout 15 seconds
- no shared TT, private TT cleared per parent, internal max time 0
- a read-only wrapper that invokes no production gate, lease cleanup, checkpoint resume, or quarantine

The inline diagnostic wrapper itself was not executed as a tracked artifact. This comparison establishes observations over fixed tracked modules and parameters; it is not a production deployment run or restart authority.

## 3. Six-worker measurements

Authenticated preprocessing took 1,063.005 seconds, pool initialization took 0.113 seconds, and the total was 1,664.248 seconds. Parent peak RSS was 6,822.3 MiB.

The seven fulfilled safe elapsed times, sorted in seconds, were:

`5.391, 89.634, 90.887, 91.617, 153.173, 242.635, 255.621`

The remaining five rejected at `600.000, 600.001, 600.002, 600.002, 600.004` seconds. Every rejection carried merged safe metadata `search-timeout` / `timeout_ms = 600000`. This must not be interpreted as five independently established timeouts: the first terminal error was broadcast by pool-wide poison to active wrappers, and the first triggering worker / input index remains unidentified.

## 4. Difference from twelve workers

With six workers, only the first six tasks start immediately and later tasks wait in the FIFO queue. The worse fulfilled median and mean are consistent with that queue delay. All five long searches eventually reached workers, but none completed before the first 600-second terminal boundary.

Post-preprocessing totals were 601.281 seconds for twelve workers and 601.243 seconds for six, so terminal wall time is effectively unchanged. A 3.4% shorter maximum fulfilled time does not change the completed count, timeout count, or safe terminal boundary.

Parent peak RSS was 0.6% higher with six workers. One run per setting cannot establish that six workers inherently use more memory, but it also provides no evidence of parent-memory savings.

## 5. What we learned

This comparison weakens the case for treating concurrency alone as the cause.

1. Completion stayed at seven after reducing workers from 12 to 6.
2. Five requests remained at the same 600-second terminal boundary.
3. Typical fulfilled latency worsened because of queueing.
4. Parent peak RSS did not decrease.
5. The 40.726-second overall reduction is explained by preprocessing, not search.

Therefore, automatically trying four workers is not the next step. We first need privacy-safe phase / node / queue milestones that identify where long-tail searches spend time, followed by optimizations that preserve the same depth and candidate semantics. Increasing timeout, lowering depth, or accepting a fallback move changes teacher-label meaning and requires a separate plan and review before any production use.

## 6. Safety checks and nonclaims

Pool close fulfilled. Residual diagnostic roots, stable workers, and YaneuraOu processes were all zero.

Before/after fingerprints for registry state, authenticated training-input metadata, fixed assets, the approved control plane, and deployment-key metadata all had mutation counter zero. No key bytes, private paths or digests, SFEN, moves, game / parent / position IDs, raw stderr, or raw error messages are published.

This result does not establish the complete timeout root cause, an optimal worker count, a completed teacher dataset, evaluator improvement, or human rank. Live weights, incident lease / stage / checkpoint / quarantine state, teacher data, and training output were unchanged.

## 7. Next safe steps

1. Review and regular-merge this six-vs-twelve comparison as Japanese / English articles, machine JSON, and regression tests.
2. Add privacy-safe phase / node / queue milestones to the stable worker.
3. Compare long-tail optimizations under the same fixed depth and candidate semantics in synthetic and read-only runs.
4. Review a new runtime binding before one holdout-free small pilot.
5. Only after complete teacher data is sealed, proceed to seed-42 / 43 / 44 retraining, fresh selection, final holdouts, and the 384-game A/B.

The operational decision remains `STOP`. The six-worker setting is not promoted into the production binding, and live weights remain unchanged.
