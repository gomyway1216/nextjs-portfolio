# Safely branching fresh Floodgate QAT from the sealed WCSC36 run

> As of 2026-07-17, no fresh Floodgate three-seed training has started. This change prepares a separate versioned binding for the future fresh execution plan without weakening the WCSC36 contract. Exact teacher, partition, and training-artifact identities do not exist yet, so the tracked registry deliberately keeps its digest fields `null` and remains closed. This is not a training or playing-strength result. It removes the code change that would otherwise be discovered only after the real data is ready. [日本語版](./blog-shogi-floodgate-fresh-qat-plan-binding.md)

## The blocker found ahead of training

The existing `qat_protocol.py` correctly seals the failed WCSC36 experiment to all of the following:

- `ml/protocols/wcsc36-int16-aware-plan.json`;
- its exact 8,152 bytes and SHA-256;
- WCSC36 teacher, partition, training, replay, and initializer identities;
- seeds 42, 43, and 44; and
- output slots under `ml/runs/wcsc36-int16-aware/seed-*`.

Those restrictions are necessary for reproducibility. They also mean that a fresh Floodgate plan is rejected before the first data read because it is not the exact WCSC36 path. Discovering that only after the 24,000-parent teacher is complete would add another code PR and CI wait directly to the critical path.

## The versioned branch

The historical verifier was not edited. A small dispatcher now sends only the exact fresh path to a separate verifier. Every other path—including historical invalid paths—continues through the old WCSC36 verifier.

```text
--experiment-plan
  |
  +-- exact fresh path
  |     -> fresh_qat_protocol.py
  |          -> tracked registry
  |          -> exact execution-plan snapshot
  |          -> exact real input identities
  |
  +-- everything else
        -> unchanged qat_protocol.py
```

The fresh verifier also requires the plan root schema `shogi-floodgate-fresh-qat-execution-plan-v1`. A file that imitates only the path or only the schema cannot pass.

## Why the registry is closed first

The tracked machine registry is
[`floodgate-q1-2026-fresh-qat-plan-registry.json`](../ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry.json).
Test counts and the scope boundary are also recorded in
[`floodgate-fresh-qat-plan-binding-2026-07-17.json`](./data/floodgate-fresh-qat-plan-binding-2026-07-17.json).
The registry's current state is:

| Field | Current value |
| --- | --- |
| status | `awaiting-exact-tracked-execution-plan-and-artifact-identities` |
| execution-plan bytes | `null` |
| execution-plan SHA-256 | `null` |
| artifact identities registered | `false` |
| training dispatch ready | `false` |

Using all-zero digests or hashes of placeholder files would make unfinished values look like real evidence. Unknown identities therefore remain explicitly `null`, and this state stops with a `data-only blocked` error.

Once the teacher, partition, training JSONL, and label-free ID sets exist, a reviewed data-only change can:

1. add the execution plan at its fixed path;
2. record the real files' bytes, SHA-256 digests, and counts;
3. record the execution plan's own exact bytes and SHA-256 in the registry; and
4. set both readiness fields to `true` in that same review.

No further dispatcher or training-loop change is required.

## What the fresh execution plan freezes

The synthetic contract requires an exact key set for:

| Area | Frozen contract |
| --- | --- |
| upstream plan | the 10,890-byte preregistered Floodgate plan and digest |
| model | board-only `2282-256-32-1` clipped ReLU |
| initializer | fixed warm model only, bound to the runOp1 checkpoint identity |
| objective | 0.5 float full task + 0.5 exact-int16 STE full task |
| optimizer | AdamW, `1e-4`, 20 epochs |
| seeds | exactly `42, 43, 44` |
| output | three fresh create-new slots |
| selection during training | no path and zero evaluations |
| final holdout during training | no labels received |
| replay | 500,000 rows, existing replay identity, fresh isolation union |
| runtime | exact deterministic CPU runtime fields |

A scratch initializer, fourth seed, alternate output, selection JSONL path, or true holdout-label flag is rejected before any input artifact is read.

## Synthetic validation

All tests use temporary synthetic plans, registries, and artifacts. They do not read a real teacher, real checkpoint, production state, or live weights.

| Suite | Result |
| --- | ---: |
| fresh verifier focused tests | 7 passed |
| versioned dispatcher tests | 3 passed |
| unchanged WCSC36 protocol tests | 6 passed |
| preregistered Floodgate-plan tests | 3 passed |
| complete Python stdlib ML suite | 68 passed |
| `py_compile` | passed |
| Ruff | passed |
| Black, four new Python files | passed |

Coverage includes duplicate JSON keys, extra or missing fields, wrong paths, byte and digest mismatches, post-registry tampering, slot mutation, wrong output, seed 45, scratch initialization, a selection path, a holdout-label flag, and invented identities in a blocked registry. The old WCSC36 path, 8,152-byte identity, digest, and seed order are also rechecked.

## What remains unproved

- real teacher generation: incomplete;
- exact fresh execution plan: absent;
- three-seed QAT training: zero runs;
- fresh selection: sealed;
- final holdout: sealed;
- paired 384-game A/B: zero games;
- external 81Dojo calibration: zero games; and
- live-weight or production-evaluator changes: zero.

The accurate conclusion is not “the engine is stronger.” It is: **the QAT-training code blocker has been removed, leaving a data-only wait for exact real artifact identities**.
