# Strength-first downstream playing-strength gates prepared

> On July 19, 2026, we implemented contracts for the final-holdout, retention,
> known-regression, and production-browser-parity receipts used after three-seed training
> and candidate selection. Forty-one focused tests passed. **This is not a training result.
> It is the downstream decision boundary that prevents a weaker candidate from being called
> stronger and entering formal A/B.** Real candidate-selection receipts and artifact
> identities do not exist yet, so the production entry stops before opening holdout labels
> or evaluators. Japanese version:
> [blog-shogi-floodgate-strength-first-downstream-gates.md](./blog-shogi-floodgate-strength-first-downstream-gates.md)

## Current state

| Item                                        | State                                                       |
| ------------------------------------------- | ----------------------------------------------------------- |
| five downstream receipt contracts           | implemented                                                 |
| stored-result reconstruction                | contract implemented; separately verified evidence required |
| production registry                         | closed with no enrolled identities                          |
| argumentless production command             | exit 2 / expected STOP                                      |
| real candidate authorizations consumed      | 0                                                           |
| final-holdout label reads                   | 0                                                           |
| real downstream receipts / formal A/B games | 0 / 0                                                       |
| production / live-weight changes            | 0 / 0                                                       |
| focused unit tests                          | 41/41 PASS in 0.088 seconds                                 |
| full suite / independent rereview           | not run / PASS (P0/P1/P2 = 0/0/0)                           |

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

| Receipt                     | Failure rejected                                       | Pass condition                                                                                               |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| fresh final holdout         | weaker on unused positions                             | both int16 pair accuracy and top-1 accuracy are at least stable                                              |
| legacy final holdout        | regression on the earlier distribution                 | both metrics are at least stable                                                                             |
| general / opening retention | broad or opening damage                                | value MAE is at most 1.05 times stable; both pair metrics are at least stable minus 0.005                    |
| known regression            | return of known bad move `P*8f`                        | static rank, depths 11/12, and three runs at each of 800/2000/4000 ms all reject it                          |
| production parity           | mismatch between the trained candidate and Web runtime | exact candidate weight, fixed worker/WASM, legal in-budget move at every budget, zero console/runtime errors |

Fresh and legacy final results are separate receipts, so passing one cannot substitute for
the other. Retention requires both general and opening results. One `P*8f` observation stops
later receipts and formal readiness. The live core first collects all five authenticated
evidence envelopes and requires their paths and SHA-256 values to be pairwise distinct
before it starts building any receipt. All five passes may prepare formal A/B enrollment,
but production-weight write and live activation remain false.

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

Every role requires its exact schema: the selection receipt, strength-first candidate
checkpoint, stable checkpoint, int16 weights, each final/retention dataset, fixture, worker,
and WASM cannot merely have the same four-field shape. Paths and SHA-256 values across all
12 identities must also be pairwise distinct, preventing one dataset or binary from being
relabelled as another role.

Candidate selection also does not reuse the existing WCSC36 warm/scratch six-run receipt.
Its dedicated schema is warm-only and fixes seeds 42/43/44, exactly three `final.pt`
artifacts, the strength-first plan/training-result/checkpoint schemas, stable recomputation
on the same fresh selection, the metric order, four per-seed gates, the median-ranked seed,
the two-of-three family gate, every seed's quantization-delta gates, and one evaluation per
checkpoint. It is explicitly incompatible with the legacy six-run receipt.

A plain JSON mapping still cannot open a reader. The future production adapter must consume
a typed one-shot authorization issued only when candidate selection succeeds. That adapter
has not landed yet, so rewriting only the registry into a ready-looking shape would still
STOP. At issue time the authorization captures canonical bytes and a SHA-256 identity for
the entire registry, including every role, browser budget, and the selection contract. A
different registry is rejected before the first reader. After capture, every callback gets
role-specific expected inputs from the immutable snapshot and every receipt uses that same
snapshot, so mutating the caller's registry in flight cannot change the result. An evaluator
also cannot return a plain metric mapping. Its one-shot verified
observation binds an exact integer selected seed, selection receipt, candidate/stable
checkpoints and weights, and the dataset, fixture, worker/WASM, or browser budgets actually
measured. Any difference from the registry stops before a receipt. The observation body is
bound to a role-specific content-addressed evidence identity. The synthetic test-only issuer
is a contract fixture, not a real candidate, holdout evaluation, or receipt.

## Revalidating receipts after storage

Every receipt binds the candidate-selection receipt and both candidate/stable checkpoint and
weight digests, plus the entire registry's canonical identity, the evaluation-evidence
identity, and the measured-input digest. Stored
metrics and stored `path_verified=true` values are never reused as authority. Revalidation
also consumes candidate-selection authorization and requires a registry-bound one-shot
bundle issued after production evidence IO separately rereads the original evidence.
Issuing a bundle with an authorization from another registry and consuming a bundle under
another registry are both rejected. Only a test issuer exists now; there is no production
path that can validate a self-asserted stored result.

All five receipts are rebuilt from that separately verified bundle. Tests reject changes to
retention gate text, the candidate-weight digest, a stored metric, or top-level weight
authority. If the bundle says worker-path verification failed, the validator fails parity
instead of synthesizing true from the stored result. Changing evidence content without
changing its identity also breaks the content binding. A future receipt destination must be
a canonical relative path; absolute paths, parent traversal, and backslash aliases are
rejected. The current module produces canonical bytes and an in-memory identity only. It
writes no receipt file.

## Validation and non-claims

The focused stdlib suite passed 41/41 in 0.088 seconds. Python compilation and registry JSON
checks also passed. Coverage includes the closed registry, wrong role schemas and reused identities,
protocol-byte drift, plain candidate/evaluator/stored-evidence mappings, one-shot tokens, a
different measured dataset, changed stored metrics, false browser-path verification,
evidence-content tampering, float seeds, empty or malformed USI bestmoves, each gate
boundary, all five receipts, canonical paths, the argumentless STOP, legacy six-run schema
collisions, cross-registry tokens and bundles, in-callback registry mutation, and live
evidence path/hash collisions. Review follow-up coverage also requires a blocked registry
to fail explicitly before enrollment access and rejects POSIX absolute receipt paths
independently of the host operating system. A later review also led the core to validate
each observation once before passing it to explicitly validated receipt builders, and added
regressions that reject colon-bearing receipt paths including Windows drive-relative forms.
Because all five evidence envelopes are authenticated first,
a gate failure stops later receipts and formal readiness, not later readers. The three
findings from the second independent review are fixed, and the independent final rereview
reported P0/P1/P2 = 0/0/0. The resource-wide suite remains pending.

This change used local tests only. It used no AWS, GCP/Firebase, Vercel, or network service.
It is not evidence of teacher generation, three-seed training, candidate selection, holdout
evaluation, formal A/B, external calibration, improved playing strength, high-dan strength,
or a live-weight change.

The next step is to connect both the branded authorization from the candidate-selection lane
and a production issuer that reauthenticates evaluator evidence from real files. Only
identities produced by real teacher work, three-seed training, and selection are then
enrolled. These five gates run on real data, stored receipts are revalidated against separate
evidence, and only then may the candidate enter formal A/B.

Machine-readable record:
[floodgate-strength-first-downstream-gates-2026-07-19.json](./data/floodgate-strength-first-downstream-gates-2026-07-19.json)
