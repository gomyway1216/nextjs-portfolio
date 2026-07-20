# Strength-first downstream playing-strength gates prepared

> On July 19, 2026, we implemented contracts for the final-holdout, retention,
> known-regression, and production-browser-parity receipts used after three-seed training
> and candidate selection. Eighteen focused tests passed. **This is not a training result.
> It is the downstream decision boundary that prevents a weaker candidate from being called
> stronger and entering formal A/B.** Real candidate-selection receipts and artifact
> identities do not exist yet, so the production entry stops before opening holdout labels
> or evaluators. Japanese version:
> [blog-shogi-floodgate-strength-first-downstream-gates.md](./blog-shogi-floodgate-strength-first-downstream-gates.md)

## Current state

| Item | State |
| --- | --- |
| five downstream receipt contracts | implemented |
| stored-result reconstruction and tamper rejection | implemented |
| production registry | closed with no enrolled identities |
| argumentless production command | exit 2 / expected STOP |
| real candidate authorizations consumed | 0 |
| final-holdout label reads | 0 |
| real downstream receipts / formal A/B games | 0 / 0 |
| production / live-weight changes | 0 / 0 |
| focused unit tests | 18/18 PASS in 0.006 seconds |
| full suite / independent review | not run / pending |

The entry point verifies the fixed registry and the bytes of the existing protocols it
references. The registry currently contains no identity for a candidate-selection receipt,
candidate or stable checkpoint, candidate or stable weights, either final holdout, either
retention dataset, the known-regression fixture, the production worker or WASM, or the
browser time budgets. This command therefore cannot reach candidate authorization, a
holdout reader, or an evaluation callback:

```sh
python3 ml/strength_first_downstream_gates.py
```

The observed result was exit 2 with `status=STOP`. It consumed zero candidate
authorizations, read zero final labels, emitted zero real receipts, played zero formal A/B
games, and changed zero live weights. There is no argument that can substitute another
registry or artifact.

## Why this is part of improving playing strength

Training loss and selection score cannot establish that the AI actually playing on the site
became stronger. The five receipts freeze independent ways a post-selection candidate can
fail:

| Receipt | Failure rejected | Pass condition |
| --- | --- | --- |
| fresh final holdout | weaker on unused positions | both int16 pair accuracy and top-1 accuracy are at least stable |
| legacy final holdout | regression on the earlier distribution | both metrics are at least stable |
| general / opening retention | broad or opening damage | value MAE is at most 1.05 times stable; both pair metrics are at least stable minus 0.005 |
| known regression | return of known bad move `P*8f` | static rank, depths 11/12, and three runs at each of 800/2000/4000 ms all reject it |
| production parity | mismatch between the trained candidate and Web runtime | exact candidate weight, fixed worker/WASM, legal in-budget move at every budget, zero console/runtime errors |

Fresh and legacy final results are separate receipts, so passing one cannot substitute for
the other. Retention requires both general and opening results. One `P*8f` observation stops
before the browser-parity reader. All five passes may prepare formal A/B enrollment, but
production-weight write and live activation remain false.

This change therefore improves playing strength by zero on its own. Its role is to make sure
only a genuinely stronger retrained candidate reaches formal games. It was prepared in a
separate lane from teacher generation and training.

## No invented candidate can open the gates

The production registry is data-only and does not fill missing real artifacts with
provisional hashes. In the closed state, every enrollment must be null and every candidate,
label-read, evaluation, formal-A/B, and weight-write gate must be false.

A future ready registry must enroll all of the following exact identities together:

- the real selection receipt issued by the candidate-selection lane;
- candidate and stable checkpoints and weights;
- fresh and legacy final datasets, general and opening retention datasets, and the
  known-regression fixture; and
- the production worker and WASM actually used by the site, plus fixed browser budgets.

A plain JSON mapping still cannot open a reader. The future production adapter must consume
a typed one-shot authorization issued only when candidate selection succeeds. That adapter
has not landed yet, so rewriting only the registry into a ready-looking shape would still
STOP. Synthetic identities and callbacks used by the test-only core are contract fixtures,
not real candidates, holdout evaluations, or receipts.

## Revalidating receipts after storage

Every receipt binds the candidate-selection receipt and both candidate/stable checkpoint and
weight digests. Stored aggregate results are not trusted as assertions. The validator
reconstructs all five receipts from the exact registry enrollments and stored metrics, then
requires exact fields, types, gate text, dataset identities, metrics, and weight authority.

Tests reject changes to retention gate text, the candidate-weight digest, a metric, or the
top-level weight authority. A future receipt destination must also be a canonical relative
path; absolute paths, parent traversal, and backslash aliases are rejected. The current
module produces canonical bytes and an in-memory identity only. It writes no receipt file.

## Validation and non-claims

The focused stdlib suite passed 18/18 in 0.006 seconds. Python compilation and the diff check
also passed. Coverage includes the closed registry, protocol-byte drift, plain-mapping
authority forgery, one-shot tokens, each gate boundary, early stop, all five receipts,
stored-result tampering, canonical paths, and the argumentless STOP. This lane did not run
the resource-wide full suite, and independent review remains pending.

This change used local tests only. It used no AWS, GCP/Firebase, Vercel, or network service.
It is not evidence of teacher generation, three-seed training, candidate selection, holdout
evaluation, formal A/B, external calibration, improved playing strength, high-dan strength,
or a live-weight change.

The next step is to connect the branded authorization interface from the candidate-selection
lane and enroll only identities produced by the real teacher, three-seed training, and
selection. These five gates then run on real data, their stored receipts are revalidated,
and only then may the candidate enter formal A/B.

Machine-readable record:
[floodgate-strength-first-downstream-gates-2026-07-19.json](./data/floodgate-strength-first-downstream-gates-2026-07-19.json)
