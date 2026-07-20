# Fresh-final teacher generation now runs only after candidate selection

> On July 20, 2026, we implemented the local path that will generate
> `final.jsonl` from the fixed 4,800-parent / 200-game fresh-final holdout.
> There is no candidate-selection receipt yet, so the real command currently
> stops without opening the source once. This is not evidence of stronger play,
> high-dan calibration, or a live-weight change.
> [日本語版](./blog-shogi-floodgate-strength-first-fresh-final-teacher-runner.md)

## Bottom line

| Item | Observed state |
| --- | --- |
| Fresh-final generator / runner | Implemented; focused validation passed |
| Selected candidate | None |
| Selection receipt | Not published; reads 0 |
| Fresh-final source | Reads 0 |
| YaneuraOu processes | 0 |
| `final.jsonl` | Not generated |
| Live-weight changes | 0 |
| AWS / GCP / Vercel compute | Not used |

The fixed command accepts no arguments:

```sh
npx tsx ml/run-floodgate-fresh-final-teacher.ts
```

Today it exits 2 with `selected-candidate-receipt-not-ready`. The observed
counters were one selection-registry read and zero selection-receipt,
selection-dataset, fresh-final source, fresh-final label, teacher-process,
network, cloud, and live-write operations.

## This gate is directly necessary for a valid strength measurement

Fresh final is unseen evaluation data that may be used only **after** selecting
one candidate from the three seeds. Opening it during selection or tuning would
make it impossible to distinguish genuine generalization from fitting the
final test. The runner therefore fixes this order:

1. validate the tracked selection-evaluator registry;
2. if it is closed, stop before opening the private selection receipt;
3. only in a reviewed READY state, read the fixed receipt once and recompute
   the three-checkpoint preflight hash, all four gates per seed, ranking,
   median representative, family gate, and selected checkpoint;
4. only then open the fresh-final source, engine assets, and search policy;
5. account for all 4,800 parents and revalidate the same evidence after generation;
6. save `manifest.json` and `authority.json`, then save the sole completion
   marker, `result.json`, last.

This preflight does not depend on the later downstream READY registry. It
validates the existing selection registry and published receipt directly,
avoiding a circular requirement in which final generation would depend on a
registry produced only after final evaluation.

## Local parallel configuration

The runner deliberately reuses the fixed search policy from the selection
teacher:

| Setting | Value |
| --- | ---: |
| YaneuraOu processes | 12 |
| Threads per process | 1 |
| Hash per process | 512 MiB |
| Aggregate Hash | 6,144 MiB |
| Proposal | depth 14 / MultiPV 6 |
| Independent rescore | depth 16 / MultiPV 1 / one `searchmoves` move |
| Timeout | 600,000 ms / search |

Twelve of the 14 cores run engines; input supply, durable writes, and the OS
retain the remaining capacity. This runs on the local Mac. It does not use AWS,
Firebase/GCP, or Vercel.

The existing measurement favoring 13 processes used MultiPV 12, so it does not
establish the optimum for this MultiPV 6 policy. Before the first 4,800-parent
run, after the active 24,000-parent run releases the CPU, we will benchmark 12
versus 13 under the exact MultiPV 6 policy on public, non-holdout positions.
The reviewed policy will change only if 13 is measured faster. That benchmark
will keep fresh-final holdout reads at zero.

Only a typed incomplete proposal with at most six legal moves may discard its
partial ranks and retry every legal move separately. Any other incomplete
proposal or timeout is fatal, and neither a partial `final.jsonl` nor a
completion marker is published. The only allowed completed-run skip is
`fewer_than_two_legal_moves`.

## Durable output and tamper-safe idempotency

The fixed output root is
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-fresh-final-teacher-v1`.
Directories are `0700`; files are single-link `0600`. Resumable `work.jsonl`
is separate from the completed `final.jsonl`.

An existing `result.json` is never trusted merely because it exists. The
runner rechecks the dataset's observed hash; the cross-identities of result,
manifest, and authority; every completion type; the selection receipt;
selected checkpoint; search policy; source; run fingerprint; and boundary.
Focused negatives rejected a changed dataset byte, manifest, authority,
completion type, and selected checkpoint.

## Validation and next step

Under Node v22, 19 focused tests covering the fresh-final generator, existing
fresh-selection runner, and fresh-final runner passed. The Python receipt
preflight passed 4 tests, and TypeScript compilation plus the diff check
passed. The real STOP command also produced the all-zero sensitive-operation
counters above. It did not open the 4,800 positions or start the heavy teacher.

The next dependency is to finish the 24,000-parent teacher, three-seed
retraining, and fresh-selection candidate choice, then publish its real
receipt. Only then will this command use 12 local processes to generate
`final.jsonl` for the final selected-candidate-versus-stable comparison.

Machine-readable record:
[floodgate-strength-first-fresh-final-teacher-runner-2026-07-20.json](./data/floodgate-strength-first-fresh-final-teacher-runner-2026-07-20.json)
