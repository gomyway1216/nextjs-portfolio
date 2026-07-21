# Measuring 12 versus 13 MultiPV-6 lanes on the same 42 positions

> Status on July 20, 2026. I measured twelve and thirteen local YaneuraOu processes under the fresh-selection teacher's exact search settings. The preregistered gate passed, so **thirteen processes are selected for this workload**. No model, live weight, or shared search policy changed. [日本語版](./blog-shogi-floodgate-fresh-lane-multipv6-benchmark.md)

## Conclusion

The same 42 positions ran in the ABBA order `12 → 13 → 13 → 12`:

| Trial | Processes | Time for 42 positions | Forced skips |
| ----: | --------: | --------------------: | -----------: |
|     1 |        12 |        35.430 seconds |            0 |
|     2 |        13 |        32.941 seconds |            0 |
|     3 |        13 |        31.332 seconds |            0 |
|     4 |        12 |        31.376 seconds |            0 |

The median was 33.403 seconds at twelve processes and 32.137 seconds at thirteen. The same-workload speed ratio was 1.039394, or about 3.94% higher throughput at thirteen. Expressed as wall-time reduction, it was about 3.79%.

The paired speed ratios were 1.075559 and 1.001404. The second pair was close, but thirteen was strictly faster in both pairs and cleared the preregistered one-percent median threshold. The resulting selection is thirteen.

This is not a playing-strength result. It changes only the parallel process count for teacher-label generation; MultiPV, search depths, hash size, and threads per engine remain fixed.

## Fixed comparison conditions

A search within one position is largely serial, while separate positions can be assigned to separate processes. Too many processes can still lose time to CPU contention, per-process hash memory, and memory bandwidth, so the lane count was selected by measurement.

| Item                               |                                           Fixed value |
| ---------------------------------- | ----------------------------------------------------: |
| Authenticated training prefix      |                                 the same 42 positions |
| Execution order                    |                                     12 → 13 → 13 → 12 |
| Trials / total parent slots        |                                               4 / 168 |
| Proposal                           |                                  MultiPV 6 / depth 14 |
| Exact incomplete-proposal fallback | search every legal move only when there are at most 6 |
| Independent rescore                |                                  MultiPV 1 / depth 16 |
| Threads                            |                                          1 per engine |
| Hash                               |                                    512 MiB per engine |
| Per-search bound                   |                                           600 seconds |

All four trials completed 42 of 42 positions, for 168 of 168 in total. There were zero forced skips and 168 emitted groups. Each trial had exactly 43 work records including its header.

## The rule for selecting thirteen

The ABBA order reduces one-direction bias from temperature, caches, and background load. The paired comparisons are trial 1 at twelve versus trial 2 at thirteen, then trial 4 at twelve versus trial 3 at thirteen.

Thirteen is selected only if all three conditions hold:

1. thirteen is strictly faster in the first pair (a tie does not pass);
2. thirteen is strictly faster in the second pair (a tie does not pass); and
3. the median wall time of the two thirteen-process trials is at least one percent faster than the median of the two twelve-process trials.

This run passed all three. The decision therefore applies the rule fixed before execution rather than selecting whichever summary happened to look favorable afterward.

## Runtime and resource use

The complete benchmark measured 140.28 seconds wall time, 1002.86 seconds user time, 30.16 seconds system time, and zero process swaps. The trial search times sum to 131.079 seconds; the remainder includes authentication, preflight and postflight checks, exclusion, and disposable-stage cleanup.

The benchmark acquires the formal v8/v9 teacher exclusion locks before launching an engine, so it cannot compete with a formal teacher for CPU or engine hash memory. It also revalidated one clean Git revision, the tracked search policy, the authenticated training input, and pinned YaneuraOu and evaluation assets before and after execution. Every disposable trial stage was removed before the trial and again after success.

## Information that remains private

The private receipt was read-only verified as a current-user regular file with mode 0600 and one hard link. Its schema, status, four trials, selection rule, and aggregate values matched, and it emitted zero private payload fields.

The public evidence contains no private path, receipt digest, internal work fingerprint, position, game, move, SFEN, label, or score. It publishes only process counts, timings, throughput, completion counts, and the selection outcome.

## What changes next

This result is measured support for using thirteen processes in the MultiPV-6 fresh-teacher workload. It does not rewrite the shared search policy automatically, and it did not modify any model or live weight. Adopting thirteen in shared policy remains a separate reviewed change.

In addition to the existing eleven benchmark unit tests, a new evidence test freezes the published measurements, selection arithmetic, 168-of-168 completion, and privacy boundary. The machine-readable measured evidence is [here](./data/floodgate-strength-first-fresh-lane-multipv6-benchmark-2026-07-20.json).
