# A Real 6.79% Search-Speed Gain That Still Was Not Good Enough

> We replaced eager move sorting with a research-only stable heap so alpha-beta
> could request moves one at a time. The formal 64-position holdout reproduced
> the exact production search result in all 64 cases and improved aggregate
> throughput by 6.79%. That is a real speed result, but it missed both
> preregistered promotion thresholds. We rejected the candidate, did not run the
> fixed-time match, and changed nothing in production. [日本語版](./blog-shogi-stable-heap-move-picker-formal-v2.md)

## Verdict

Follow-up: the remaining packed-key idea added only 0.38% over this heap in real search and was [rejected under its fixed tuning rule](./blog-shogi-packed-heap-real-search-tuning.en.md).

- The live AI did **not** get stronger from this work.
- The formal candidate matched the production result, score, depth, node count,
  and leaf count in **64/64 positions**.
- Aggregate throughput improved by **6.7915%**, below the preregistered **8%**
  requirement.
- Median per-position throughput improved by **2.9145%**, below the
  preregistered **5%** requirement.
- The p90 wall-time regression and all category, activation, and technical gates
  passed.
- Because the overall formal gate failed, we did not run the planned fixed-time
  56-game screen.
- The production AssemblyScript, production WASM, embedded WASM, NNUE weights,
  and live deployment were not changed.

This is not a case where a useful result was hidden by a technical failure. The
implementation worked, remained exact, and was measurably faster. It simply was
not fast enough, broadly enough, to justify another match and release cycle
under the decision rule fixed before the holdout was opened.

## What the experiment changed

The production search scores every pseudo-legal move and then fully sorts the
move list before searching the first child. Alpha-beta often cuts off before it
needs the whole list, so some of that sorting work may be wasted.

The research candidate still computed every historical move-ordering score at
the same point. For internal main-search nodes with at least 64 moves, however,
it built an in-place max-heap and popped one move at a time. Its comparator was
deliberately stable: score descending, then original generation order
ascending. Root search and quiescence search were unchanged.

```text
production                         research candidate

score every move                   score every move
       │                                  │
       ▼                                  ▼
fully stable-sort the list         build a stable max-heap
       │                                  │
       ▼                                  ▼
search moves in order              pop and search one move at a time
```

The candidate therefore did not introduce a new evaluator, new training data,
or a different search policy. Its only possible benefit was doing less CPU work
before a cutoff. Exact move order also gave us a strong safety check: at fixed
depth, the candidate should visit the same tree and return the same answer.

## Cheap rejection came first

We did not start with a long match. Several implementations and activation
thresholds were measured on a tuning fixture first.

The first idea was a repeated selection scan. It searched the unsorted suffix
for the next best move on every iteration. At minimum-move thresholds of 2, 16,
32, 48, and 64, its preliminary throughput changes were approximately
**-0.96%, -6.55%, -1.03%, -2.35%, and -1.94%**. It was slower and was rejected.
Those rounded figures came from early short-run logs whose raw report was not
retained; they document the stop decision, not a formal effect size.

The heap was promising, but all numbers below are exploratory rather than
formal evidence:

| Tuning candidate                                  | Aggregate |   Median | Decision                              |
| ------------------------------------------------- | --------: | -------: | ------------------------------------- |
| Copying heap, zero-window, threshold 64           |  +5.6780% | +4.8736% | Failed the original aggregate gate    |
| In-place heap, zero-window, threshold 32          |  +6.3861% | +4.0020% | Rejected                              |
| In-place heap, zero-window, threshold 48          |  +4.5873% | +4.2335% | Rejected                              |
| In-place heap, zero-window, threshold 64          |    +6.25% |   +4.78% | Expanded to exact all-window ordering |
| In-place heap, all internal windows, threshold 64 |  +6.8684% | +5.6723% | Selected once for a fresh formal test |

One confirmation run was also summarized under relaxed thresholds chosen after
seeing earlier results. It showed about +5.85% aggregate throughput, but it
failed the original preregistered +8% gate. It is not a formal pass and was not
used to justify promotion.

After the formal rejection, we tested another low-cost implementation idea:
keeping only compact move indices in the heap rather than swapping the move,
score, and ordinal together. It was slower than the existing in-place heap in
all eight tested conditions and was rejected without spending another holdout
or match. The exploratory raw script and report were not retained, so no exact
percentage range is claimed here.

### The packed-key heap was faster, but not clearly enough

A later AssemblyScript-to-WASM microbenchmark tested a packed representation.
The rejected formal heap swaps three values per heap exchange: a move `i32`,
score `i32`, and ordinal `i32`. The new variant swaps a move `i32` plus one
packed `u64` comparison key. The signed score is normalized into the high 32
bits, while the low 32 bits encode the stable ordinal.

An initial short-block Node 20 run looked much faster, but the gain shrank
substantially on the current Node 22 runtime. We discarded the initial number
and checked in the [benchmark source](../wasm-spike/packed-heap-microbench/bench.ts),
[runner](../wasm-spike/packed-heap-microbench/run.mjs), and
[raw result](../wasm-spike/packed-heap-microbench/result.json). The rerun pins
AssemblyScript 0.28.19 and its build flags, calibrates every block above 100 ms,
uses equal work and seed, alternates ABBA/BAAB order, and repeats three rounds.

Both implementations matched the reference stable sort across 18,000 tie-heavy
vectors and another 12,288 vectors containing `INT32_MIN` and `INT32_MAX`.
Separate nontrivial checksums also matched. Across list sizes 48, 64, 96, and
128 with partial-8, partial-25%, and full-pop workloads, packed elapsed time was
**0.51% to 16.06% lower**, equivalent to **+0.52% to +19.14%** equal-work
throughput.

The large gains came from full-pop workloads. At the actual candidate threshold
of at least 64 moves, taking only the first eight moves improved kernel
throughput by just **+0.52% to +3.65%**. The move picker is only part of total
search cost, so this does not clearly cover the formal v2 shortfall.

These remain heap-kernel measurements, not search or playing-strength evidence.
At most they justify one cheap isolated real-search tuning run. A fresh v3
holdout should not be built unless that end-to-end tuning materially beats the
rejected v2 candidate, and the already opened v2 holdout cannot be reused.

## The formal holdout

Before running the selected heap candidate, we pinned its research-WASM hash,
the production baseline hash, live-weight hash, fixture hash, generator hash,
gate implementation, timing order, and thresholds.

The plan existed locally before the result file and its exact hash is recorded,
but the plan and result are first committed together in this pull request.
There is no third-party timestamp or earlier Git commit, so “preregistered”
below means a locally fixed pre-run plan, not externally time-proven
preregistration. The result was a rejection, so this limitation cannot promote
the candidate; for v3, the plan should be committed before its fresh holdout is
opened.

The holdout contained 64 positions, with 16 each from openings, middlegames,
drop-heavy positions, and check evasions. Every canonical position was disjoint
from the tuning fixture. Browser-derived positions also excluded every source
game used by the tuning fixture. No engine result from this experiment was used
to select the holdout.

Both engines ran fixed depth 5 with quiescence depth 8, a cleared transposition
table before every search, no shared table, and alternating ABBA/BAAB timing
blocks. The formal gates were:

| Gate                             |                                    Required |
| -------------------------------- | ------------------------------------------: |
| Exact fixed-depth agreement      |                      64/64; zero mismatches |
| Candidate activation             | At least once overall and in every category |
| Aggregate throughput gain        |                                At least +8% |
| Median per-position gain         |                                At least +5% |
| p90 per-position wall regression |                                  At most 2% |
| Every category aggregate         |                                 At least 0% |
| Technical faults                 |                                           0 |

## Formal result

| Metric                                        |     Measured |     Required | Verdict  |
| --------------------------------------------- | -----------: | -----------: | -------- |
| Exact result, score, depth, nodes, and leaves |        64/64 |        64/64 | Pass     |
| Aggregate throughput                          | **+6.7915%** | At least +8% | **Fail** |
| Median per-position throughput                | **+2.9145%** | At least +5% | **Fail** |
| p90 wall-time regression                      |     +1.4342% |  At most +2% | Pass     |
| Technical faults                              |            0 |            0 | Pass     |

The candidate activated 421,752 times during the fixed-depth exactness pass. It
was therefore not a no-op disguised as an exact result.

| Position category | Aggregate throughput change | Category gate |
| ----------------- | --------------------------: | ------------- |
| Opening           |                    +0.0150% | Pass          |
| Middlegame        |                    +0.8008% | Pass          |
| Drop-heavy        |                    +6.1496% | Pass          |
| Check evasion     |                    +8.5061% | Pass          |

The category split explains the rejection. The heap saved meaningful work in
large, tactically constrained move lists, but did almost nothing in openings and
ordinary middlegames. The overall gain was real, yet the median position gained
only 2.91%. That is not broad enough to claim that browser play would become
materially stronger.

## Why there was no match or deployment

The preregistered rule authorized a fixed-time 56-game candidate-on versus
candidate-off screen only after every formal speed gate passed. Two gates
failed, so running the match would have changed the rule after seeing the
answer. We stopped instead.

Even a speed-gate pass would not itself prove stronger play. It would only show
that the same fixed-depth work became cheaper. The next stage would still need
to show that the browser converts the saved time into deeper or better moves,
then wins a direct match with the same live weights.

No such strength evidence exists for this candidate. The live weights remain
the 1,185,988-byte artifact with SHA-256
`e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`.
The production WASM remains the 35,597-byte artifact with SHA-256
`e185df728616b7e7af93232ada5e53c33ec7211bf05a99b1e01f48c4e56d813c`.

## What the earlier process work did—and did not do

The preceding ownership, tamper-evidence, key, CI, and pull-request boundary
work made experiments more reproducible and made accidental live promotion
harder. It helped answer which artifact ran and whether production changed.

It did **not** directly improve evaluation quality, search depth, or playing
strength. Spending days on those controls did not make the AI stronger, and it
was wrong to let that infrastructure work appear interchangeable with strength
progress. A clean audit trail is useful, but it is not the goal.

Future work is therefore narrower:

1. reject ideas with small deterministic benchmarks before generating data or
   scheduling matches;
2. count progress only when it changes move quality, search depth, or direct
   match results;
3. allow the packed-key heap at most one cheap isolated real-search tuning run,
   then stop unless it clearly beats the rejected v2 candidate;
4. open a fresh source-disjoint v3 holdout only after such a clear tuning win—
   the spent v2 holdout cannot provide formal evidence again;
5. leave production untouched until fixed-time play and external calibration
   support a strength claim.

This experiment produced a useful negative result: exact lazy ordering can save
CPU time, especially in drop-heavy and check-evasion positions, but the formal
three-value-swap implementation is not the step that closes the gap to stable
high-dan play. The packed-key kernel helps most when nearly every move is
popped, but its partial-workload gain is too small to call it the next strong
candidate.

The locally fixed pre-run protocol is recorded in
[`ml/protocols/stable-heap-move-picker-formal-v2-plan.json`](../ml/protocols/stable-heap-move-picker-formal-v2-plan.json).
The formal report is preserved with SHA-256
`6ce667e41bcc0f8464c6fbfae47660de48f2050e868675f260e9c877ae2f1b72`;
the [tracked raw report](./data/shogi-stable-heap-move-picker-formal-v2-raw-2026-07-25.json)
retains every fixed-depth and timing row while rewriting only absolute
repository paths as repository-relative paths. The companion
[machine-readable repository evidence](./data/shogi-stable-heap-move-picker-formal-v2-2026-07-25.json)
records the full result identity and gate outcomes.
