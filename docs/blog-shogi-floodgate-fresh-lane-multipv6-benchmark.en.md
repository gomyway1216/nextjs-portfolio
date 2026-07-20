# Measuring 12 versus 13 MultiPV-6 lanes on the same 42 positions

> Status on July 20, 2026. A local-only tool now compares twelve and thirteen YaneuraOu processes under the real fresh-selection search settings. The comparison itself has not run because the formal 24,000-position teacher is active. No model, live weight, or shared search policy has changed. [日本語版](./blog-shogi-floodgate-fresh-lane-multipv6-benchmark.md)

## Conclusion

More processes are not automatically faster. A search within one position is largely serial, while separate positions can be assigned to separate engine processes. Past a useful limit, however, CPU contention, per-process hash memory, and memory bandwidth can reduce throughput. In the earlier MultiPV-12 measurement, fourteen processes were slower than twelve.

The fixed fresh-selection policy uses a MultiPV-6 depth-14 proposal followed by an independent depth-16 rescore of every candidate. A different candidate count can change the best process count, so the earlier MultiPV-12 result for twelve versus thirteen is not inherited. The new tool measures this exact workload:

| Item | Fixed value |
| --- | ---: |
| Authenticated training prefix | the same 42 positions |
| Execution order | 12 → 13 → 13 → 12 |
| Trials / total parent slots | 4 / 168 |
| Proposal | MultiPV 6 / depth 14 |
| Exact incomplete-proposal fallback | search every legal move only when there are at most 6 |
| Independent rescore | MultiPV 1 / depth 16 |
| Threads | 1 per engine |
| Hash | 512 MiB per engine |
| Per-search bound | 600 seconds |

This is a teacher-label throughput comparison, not a playing-strength test.

## The gate for selecting thirteen

The ABBA order reduces one-direction bias from temperature, caches, and background load. The paired comparisons are trial 1 at twelve versus trial 2 at thirteen, then trial 4 at twelve versus trial 3 at thirteen.

Thirteen is recommended only if all three conditions hold:

1. thirteen is at least one percent faster in the first pair;
2. thirteen is at least one percent faster in the second pair; and
3. the median wall time of both thirteen-process trials is at least one percent faster than the median of both twelve-process trials.

Passing the median while missing either pair retains twelve. Every trial must also complete exactly 42 of 42 parents, emit 42 groups, record 43 work rows including the header, and have zero forced skips. The two trials for the same process count must have the same internal work fingerprint, while the twelve- and thirteen-process fingerprints must differ. Fingerprints are never published.

## Never competing with the active formal teacher

The comparison acquires the formal v8/v9 teacher exclusion locks before it can launch an engine. If the 24,000-position teacher is active, the tool fails before starting any engine. It therefore cannot take CPU or roughly 6.0 GiB versus 6.5 GiB of engine hash from the current run.

It also validates:

- macOS arm64, Node v22.13.0, and at least thirteen available logical CPUs;
- one clean Git revision before and after the run;
- the exact tracked 1,349-byte search policy and its SHA-256;
- pinned YaneuraOu and evaluation assets;
- fixed home, repository, asset, and private output roots; and
- an argumentless production entry point.

Each disposable stage is removed before a trial and again after either success or failure. A skip, count mismatch, policy change, source change, or asset change prevents receipt commitment.

## What the result includes

The private `receipt.json` includes only process count, elapsed time, throughput, counts, both pair ratios, the median ratio, and the resulting twelve-or-thirteen recommendation. It excludes positions, games, moves, SFEN, labels, paths, hashes, and internal fingerprints.

The result does not rewrite the shared policy. Even a passing thirteen-process result is only a recommendation for a separately reviewed change. The tool has no model or live-weight write path.

## Current status

Implementation and eight lightweight unit tests are complete. They cover the exact threshold, retaining twelve when only one pair misses, order/count/fingerprint drift, forbidden private fields, cleanup after a skip, and policy/platform/root/CLI drift.

The real comparison is intentionally pending, so this work does not yet claim whether twelve or thirteen is faster for MultiPV 6. It may run only after the active 24,000-position teacher finishes and this implementation is available from a clean merged revision.

The machine-readable implementation status is [here](./data/floodgate-strength-first-fresh-lane-multipv6-benchmark-2026-07-20.json).
