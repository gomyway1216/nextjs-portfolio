# Connecting the strength-first fresh-selection teacher to real generation

> On July 20, 2026, we implemented the local runner that generates YaneuraOu labels for the
> fixed 4,800-parent / 200-game fresh selection only after strict-loading all three candidate
> checkpoints. The checkpoint registry is still closed, so the real command currently stops
> before opening the selection source. Real selection labels, candidate selections, and live
> weight changes all remain zero. [日本語版](./blog-shogi-floodgate-strength-first-selection-teacher-runner.md)

## Current state

| Item | State |
| --- | --- |
| Fixed runner / real generator adapter | Implemented and locally validated |
| Checkpoint registry | Closed; three checkpoint identities are unregistered |
| Direct preflight | exit 1 / expected STOP |
| Fresh-selection source reads | 0 |
| Real YaneuraOu selection engines | 0 processes |
| Real selection labels / candidate selections | 0 / 0 |
| Live weight changes | 0 |
| Focused TypeScript / Python | 62 / 62 (58 runtime + 4 evidence) and 3 / 3 PASS |

This is not a playing-strength result. It closes the real selection-teacher generation path
needed immediately after three-seed training.

## Strict-load checkpoints before opening selection

The fixed argumentless command is:

```sh
npx tsx ml/run-floodgate-fresh-selection-teacher.ts
```

Its order is fixed:

1. verify the exact clean runner revision;
2. identity-check and strict-load the seed-42, 43, and 44 `result.json` and `final.pt`;
3. only then open the fixed YaneuraOu assets, tracked search policy, and fixed 4,800-parent source;
4. complete the local teacher;
5. revalidate the checkpoints, assets, policy, and source;
6. commit `manifest.json` and `authority.json`, then commit completion marker `result.json` last.

Before that sequence, the runner acquires the formal v8 and v9 run locks in that order, holds
both for the full run on success or failure, and releases v9 then v8. A failed v9 acquisition
also releases the already-held v8 lock. An active formal v8 or v9 run therefore blocks before
checkpoint, selection-source, or engine work. The runner does not change the process-wide
`umask`.

When preflight fails, neither the source reader nor the generator is called. The current tracked
registry keeps the training plan and all three final result/checkpoint identities at `null`.
A direct preflight produced zero stdout bytes and exited 1 with “registry remains closed.”
That STOP opened no selection source, Torch checkpoint, or YaneuraOu process.

## Measured full-use configuration for the 48 GiB Mac

The fresh-selection teacher uses this Mac, not cloud compute:

| Setting | Fixed value |
| --- | ---: |
| YaneuraOu processes | 12 |
| Threads per process | 1 |
| Hash per process | 512 MiB |
| Aggregate Hash | 6,144 MiB |
| Proposal | depth 14 / MultiPV 6 |
| Exact rescore | depth 16 / MultiPV 1 / one `searchmoves` move |
| Timeout | 600,000 ms / search |
| Network / AWS / GCP / Vercel compute | none |

There was no evidence supporting a reduction to 64 MiB Hash, so we did not make one. Existing v8
measurements on the same one-thread YaneuraOu found 512 MiB 2.882% faster than 256 MiB across nine
normal positions. A simultaneous 12-process load completed 12 / 12 in 47.557 seconds, with about
8.0 GiB peak engine RSS, 45% memory free, and zero throttled pages. A 1,024 MiB setting was slower
than 512 MiB on a known case. The fresh run therefore fixes the measured `12 × 512 MiB` setting for
this 48 GiB / 14-core host, leaving two cores for persistence, input supply, and the OS.

## Rescue incomplete MultiPV without mixing ranks

On the normal path, a complete depth-14 proposal supplies up to six moves, and the strong-game
played move is added if absent. Every candidate is then ordered bytewise and independently
rescored at depth 16 with MultiPV 1 and exactly one `searchmoves` move.

Only a typed fixed-depth incomplete proposal with at most six legal moves can use the fallback:

1. discard every partial proposal rank;
2. search every legal move separately at depth 14 and MultiPV 1;
3. use the complete legal-move set as the candidate set;
4. independently exact-rescore every candidate again at depth 16.

Partial and fallback ranks are never mixed. An incomplete proposal with seven or more legal moves,
an untyped incomplete result, or a timeout in proposal, fallback, or rescore is fatal and publishes
neither a dataset nor a completion marker. The only permitted completed-run skip reason is
`fewer_than_two_legal_moves`.

A focused regression traced a synthetic two-legal-move position through one incomplete proposal,
two depth-14 all-legal fallback searches, and two depth-16 exact rescoring searches. Resume
validation also rejects a fallback trigger receipt containing an unknown field.

## Private, resumable, and unable to promote live weights

The output root is fixed as
`~/.codex/shogi-runs/floodgate-q1-2026-strength-first-selection-v1`,
with `0700` directories and `0600` files. Parent-level `work.jsonl` is resumable; canonical
`selection.jsonl` appears only after full completion. Authority, manifest, and result bind the
source, checkpoint preflight, tracked search policy, engine assets, dataset, and accounting for
all 4,800 parents into one run fingerprint.

This runner is authorized only to generate fresh-selection labels. It cannot select a candidate,
open the fresh or legacy final holdout, run formal paired A/B or external calibration, or write a
production weight. It can become runnable only after the 24,000-parent teacher and three-seed
training complete and a data-only review registers their observed identities.

## Validation and dependency

Under Node v22, the focused generator, USI MultiPV, fixed-runner, and v9 diagnostic spawn-failure
suite passed 58 / 58 tests across four files; publication evidence passed 4 / 4, for 62 / 62
across five files. The Python preflight projection passed 3 / 3 tests, and the full ML stdlib
passed 287 / 287; TypeScript compilation and the diff check also passed. No heavy selection run
was started because the real checkpoints do not exist.

The generator includes the same change as strength-first v9 proposal-rescue commit
`a8ec6975113f7feacbc55bb87ba80f2d9b64dbbe`. That exact commit is also a second parent of a
dependency merge in this branch. If this PR merges first, a later v9 PR shares the commit through
Git ancestry instead of applying the patch to main again. The dependency order and final diff
must still be rechecked before publication.

Machine-readable record:
[floodgate-strength-first-selection-teacher-runner-2026-07-20.json](./data/floodgate-strength-first-selection-teacher-runner-2026-07-20.json)
