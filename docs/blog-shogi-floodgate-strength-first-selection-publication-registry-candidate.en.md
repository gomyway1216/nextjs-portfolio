# Building the terminal registry candidate that hands selection to fresh final

> On July 20, 2026, we implemented a local builder that binds the selection
> report, receipt, and completion marker to their originating READY registry
> and a deterministic four-model replay, then emits a review-only terminal
> registry candidate to stdout. It has not been run on real selection
> publications, and no live weight has changed.
> [日本語版](./blog-shogi-floodgate-strength-first-selection-publication-registry-candidate.md)

## What this closes

The selection evaluator privately publishes three single-link `0600` files in
one run:

1. `selection-evaluation-report.json`;
2. `selection-receipt.json`;
3. `selection-publication-result.json`, written last.

The fresh-final teacher accepts only the reviewed
`candidate-selected-publication-enrolled` registry state containing all three
identities. Previously there was no dedicated command to safely construct that
terminal state from READY. This builder adds only that missing connection. It
does not edit the tracked registry; it emits one candidate JSON value to
stdout.

The fixed command is:

```sh
~/.codex/shogi-data/floodgate-training-venv/bin/python3 \
  ml/build_strength_first_selection_publication_registry_candidate.py
```

It accepts no arguments or path overrides.

## What is recomputed before output

The builder fails closed in this order:

1. validate that the tracked registry is READY or already the exact terminal state;
2. canonicalize the READY preimage and rebuild its byte and SHA-256 identity;
3. authenticate the current tracked protocol, implementation sources,
   training plan, and three-checkpoint preflight identities;
4. stable-read the report, receipt, and publication result from their fixed
   private paths and derive each byte, SHA-256, and schema identity;
5. prove that the publication result binds the READY preimage, report,
   receipt, selected seed, and selected checkpoint;
6. reevaluate the same selection dataset with stable plus seeds 42, 43, and
   44, require an exact saved-report match, and rebuild every receipt metric
   gate, ranking, median representative, family gate, and selected checkpoint;
7. reread every tracked and private input for drift, then emit the terminal
   candidate to stdout.

If the same terminal registry is already tracked, the recomputation must be
exactly idempotent. Report tampering, report/receipt swaps, deterministic replay
mismatches, and terminal-identity replay drift all fail before candidate output.

## What this command does not read

The builder does not read the fresh-final source or labels, a downstream READY
registry, formal A/B data, external calibration data, or a production weight.
It uses no network, AWS, GCP, or Vercel compute. Its authority ends at producing
a reviewable data-only candidate; it cannot update or merge the tracked
registry, start fresh final, or promote a live weight.

## Validation and present boundary

Standard-library tests used a synthetic READY registry and synthetic
report/receipt/marker bundle to verify exact terminal identities, four-model
replay, stdout-only output, tamper and swap rejection, replay-mismatch
rejection, idempotence, and zero downstream/fresh-final reads. The focused
suite including the selection evaluator and fresh-final preflight passed
31 / 31 tests.

This is not a playing-strength result. At publication, real builder
invocations, real publication reads, fresh-final reads, formal A/B games,
external calibration games, and live-weight changes all remained zero. After
real three-seed training and fresh-selection evaluation finish, the next step
is to review this command's stdout in a normal PR and enroll the terminal
identities. Fresh final may proceed only if that evidence matches.

Machine-readable record:
[floodgate-strength-first-selection-publication-registry-candidate-2026-07-20.json](./data/floodgate-strength-first-selection-publication-registry-candidate-2026-07-20.json)
