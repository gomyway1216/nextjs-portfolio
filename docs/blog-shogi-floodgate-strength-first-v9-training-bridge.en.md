# Bridging the v9 teacher into three-seed retraining

> On July 20, 2026, we implemented the bridge from completed strength-first v9
> teacher artifacts to retraining seeds 42, 43, and 44, then validated it with a
> production-shaped small fixture. The formal v9 teacher was still running at
> capture time and had no final `result.json`. The exact plan, real retraining,
> candidate selection, and live-weight changes therefore remain at zero.
> Japanese version:
> [blog-shogi-floodgate-strength-first-v9-training-bridge.md](./blog-shogi-floodgate-strength-first-v9-training-bridge.md)

## Conclusion

When the v9 teacher completes, its dataset can move directly into three-seed
training without being regenerated. A matching file hash alone is not enough.
The bridge revalidates the 24,000 raw parents, every work entry, parent
completion, every training group, the manifest, staged result, 100/500
milestones, and outer result as one semantic chain before producing a plan
candidate.

| Item | State at capture |
| --- | --- |
| v9 semantic bridge | implemented; focused validation passed |
| formal v9 teacher | running |
| final v9 result / exact plan | absent / absent |
| real three-seed training | 0 |
| candidate selection / formal A/B | 0 / 0 |
| live-weight changes | 0 |

## Why the v8 bridge could not simply be reused

The training-row format is shared, but the v9 completion evidence has a
different contract.

- v9 reauthenticates the pinned manifest and training bytes before and after
  teacher execution, then commits the result only after exact equality.
- Its authority nests the v9 search policy over the v8 asset authority and the
  fixed asset evidence beneath it.
- Candidate proposal is MultiPV 12 at depth 14; each candidate is independently
  rescored at depth 16.
- The measured production setting uses 13 engines and 512 MiB of Hash per engine.
- `proposal_incomplete_no_label` is a third typed skip reason sharing the
  unchanged recovery cap with timeouts.

The old bridge fixed the v8 schema and postflight, 12 engines, depth-16
proposal, and two skip reasons. A field-renaming adapter would discard the v9
search guarantees. The shared verifier now takes an explicit generation and
enforces the full semantic contract for each generation.

## What is verified

The new argumentless v9 verifier reads only fixed local paths and streams
`work.jsonl`. Its successful output contains only parent counts, emitted-group
counts, per-reason skip counts, and the training-row count. It emits no private
position identifiers or digests.

The semantic chain is checked in this order:

1. validate the outer v9 result, fast-input pre/postflight, nested authority,
   and runner contract;
2. recompute the manifest fingerprint and enforce d14 proposal, d16 exact
   rescoring, 13 engines, and the fast-input policy;
3. return every work row to the existing teacher validator and recheck
   candidate sets, scores, skip reasons, and parent order;
4. bind the 100/500 milestones to the actual work prefixes;
5. reconstruct parent completion and all training groups from the raw input;
6. cross-check every aggregate and file binding across the manifest, staged
   result, and outer result.

An artifact whose declarations and file identity match but whose semantics
changed cannot enter training.

## Plan v3 with v8 compatibility

Reviewed v8-derived plans remain valid under
`shogi-floodgate-strength-first-qat-training-plan-v2`. New v9-derived plans use
`shogi-floodgate-strength-first-qat-training-plan-v3` so the source generation
cannot be confused.

Training-result and final-checkpoint schemas remain v2. The model, loss, warm
initializer, learning rate `1e-4`, 20 epochs, batch size 256, seeds 42/43/44,
and fixed-final-epoch candidate policy are unchanged. Only the authority that
may issue a training plan has changed.

After the formal v9 teacher has a final result, this candidate builder prints
the observed identities to stdout:

```sh
python3 ml/build_strength_first_qat_training_plan_candidate.py
```

Only after review and exact-plan enrollment does this launcher start all three
processes concurrently:

```sh
python3 ml/run_strength_first_three_seed_training.py
```

Seeds 42, 43, and 44 are all spawned before polling begins. One failed seed
stops the remainder. This bridge has no authority to select a candidate, read
holdout labels, or write production weights.

## Validation and limits

The focused Python bridge, builder, and launcher suite passed 31 tests. The
focused TypeScript v8/v9 semantic-chain suite passed six tests. The v9 test
generates a production-shaped small run and covers depth-14 proposal,
depth-16 independent rescoring, fast-input reauthentication, 13 engines, the
third skip aggregate, privacy-safe output, and fail-closed mutation handling.
The same suite keeps the v8 regression path passing.

This proves a safe handoff into retraining after teacher completion; it is not
playing-strength evidence. The formal v9 teacher is not yet complete and
training has not started. Stable high-dan strength still requires three-seed
training, fresh selection, sealed holdouts, formal paired A/B, and external
calibration. Live weights remain unchanged until that evidence exists.

Machine-readable record:
[floodgate-strength-first-v9-training-bridge-2026-07-20.json](./data/floodgate-strength-first-v9-training-bridge-2026-07-20.json)
