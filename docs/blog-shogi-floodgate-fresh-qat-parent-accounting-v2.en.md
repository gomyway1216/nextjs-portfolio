# Fresh QAT parent accounting v2: separate 24,000 inputs from trainable parents

> As of 2026-07-18, real teacher-label generation, fresh QAT training, and candidate selection remain at zero. This change preserves the existing 10,890-byte plan, role-bundle result, v1 plan/selection registries, historical bilingual articles, and machine evidence byte-for-byte. It adds an append-only pre-result amendment and a closed v2 registry. Live weights are unchanged. [日本語版](./blog-shogi-floodgate-fresh-qat-parent-accounting-v2.md)

## Why v2 was necessary

The preregistered training role contains 1,000 games × 24 parents, so the fixed input has 24,000 parents. In the production teacher pipeline, however, a forced-skip parent is fully processed and accountable but emits no sibling-training row.

These three values are therefore different:

| Value                        | Meaning                                            |
| ---------------------------- | -------------------------------------------------- |
| `input_parents = 24000`      | Fixed role-bundle input sent to the teacher        |
| `forced_parents_skipped = F` | Completed inputs that emitted no training group    |
| `emitted_parent_groups = E`  | Parent groups that actually exist in `train.jsonl` |

V2 requires this exact equation:

```text
F + E = 24000
model_training_parents = E
```

Passing the v1 `parents = 24000` directly into the training contract would claim nonexistent groups when `F > 0`. Silently dropping forced parents would instead lose complete accounting for the 24,000 inputs. V2 reduces neither input: it records forced and emitted parents separately.

## Existing records are not rewritten

The [pre-result amendment](../ml/protocols/floodgate-q1-2026-fresh-qat-parent-accounting-v2-amendment.json) pins these upstream identities:

| Record                         |  Bytes | SHA-256                                                            |
| ------------------------------ | -----: | ------------------------------------------------------------------ |
| Original fresh sibling plan    | 10,890 | `ad9e6d7f2cc7ae2d03913c405d81755d24a0b9f02b84c384b4d641c6c2b7a0af` |
| Role-bundle result             | 14,735 | `56009b1abaf83a75ae66ea8abf62e1f9f7214ad1aa687f7808972679e4af3ccf` |
| V1 QAT plan registry           |    409 | `9a1af8144cda4a222e300676c1475d69314c5ac32fe6a11a58adf7acfe5d9a00` |
| V1 selection registry          |  2,294 | `7593d5675884431e5fbcc71c7925b7f094c3ab48f6de9f74850b195f57aedd39` |
| Parent-accounting v2 amendment |  6,469 | `2a9c6ebb8b7c6d50d606bbdf0f1eb0cb5d971159e2cee836ff26a5d96c8c80d5` |
| Closed v2 registry             |  3,046 | `08f3ebecc880f2e3c97f4591d3a2e68cb186dde8772bcbaf534fe518fdd89130` |

The amendment also pins the two existing plan-binding/selection-preflight machine records and four Japanese/English articles by bytes and SHA-256. The chain validator rejects a missing record or one-byte drift. V1 remains closed with null identities and false dispatch/selection gates.

## The input identity is fixed too

The training input in the role-bundle result has this exact identity:

| Field                       | Value                                                                       |
| --------------------------- | --------------------------------------------------------------------------- |
| Input parents               | 24,000                                                                      |
| Input games                 | 1,000                                                                       |
| Raw bytes                   | 15,369,952                                                                  |
| Raw SHA-256                 | `c9ee90da69135ead5dbb60cbab6eaa82ad018db791132dd4ec122d6088c37b62`          |
| Parent-ID SHA-256           | `6681bd08bb282be04f47bf3157ea07fbbe2bc6a6864a100ce65902dc9cc3f08f`          |
| Game-ID SHA-256             | `97609ce53a9dee1fffd8faadcf408d79bc3e0724c17d52d8a2ac095bc607e3d7`          |
| Position-ID count / SHA-256 | 24,000 / `a97788b608a6687c078b7fbe2172a5c4068c57a42ed322c3997692f697e73b5c` |

The materializer verifies the caller-supplied 24,000 `game_id` / `parent_id` / `position_id` records against that identity. Emitted parents must be an order-preserving subsequence of the input. A parent outside the input, reordered output, or reopened group is rejected. Replacement and resampling therefore remain zero.

## What is bound from `train.jsonl`

The stdlib-only materializer reads supplied exact bytes as strict JSONL. It rejects CR bytes, invalid final-LF framing, blank lines, duplicate JSON keys, `NaN`, noncanonical semantic IDs, game/position substitution, and groups with fewer than two siblings.

The proposal binds all of the following:

- `train.jsonl` bytes and SHA-256
- Record count
- Actual parent-group count `E`
- Actual game count and game-ID-set digest
- Emitted-parent-ID-set digest
- Count and digest of semantic position IDs across parent and child positions
- Forced-parent-ID and forced-position-ID digests
- Verification of `F + E = 24000`
- `model_training_parents = E` for all three seeds

The materializer does not claim to authenticate the teacher output's origin. A future data-only enrollment must supply only an artifact whose authentication and durability were established by the existing production finalizer, then register the proposal bytes/SHA-256 in a separate PR. This change neither seeks nor writes artifacts and never mutates a registry.

## The three cases

| Case                             | Decision                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `F = 0`, `E = 24000`             | Valid; requires an empty forced digest and identical input/emitted digests                              |
| `0 < F < 24000`, `E = 24000 - F` | Valid; accounts for every forced parent and passes `E` to training                                      |
| `F = 24000`, `E = 0`             | Accounts for every input, returns a STOP receipt, and creates no proposal: `no-trainable-parent-groups` |

All-forced is not an ambiguous missing-data failure. The explicit stop receipt carries the input/forced/emitted digests, empty-train identity, and false authority.

## The training experiment is unchanged

Parent accounting is the only change. V2 pins the canonical SHA-256 of the complete training, slot, and selection contracts:

| Contract      | Canonical SHA-256                                                  |
| ------------- | ------------------------------------------------------------------ |
| Training      | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| Seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| Selection     | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

The seeds remain 42 / 43 / 44; architecture remains `2282-256-32-1-clipped-relu`; loss remains `sibling-ranking`; optimizer remains AdamW; learning rate remains `0.0001`; and epochs remain 20. Source or parent replacement, resampling, and model/loss/optimizer/seed/epoch/selection-gate/holdout-policy changes are forbidden.

## The boundary remains closed

The [v2 registry](../ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json) leaves all five enrollments—training result, manifest, `train.jsonl`, parent-accounting proposal, and execution plan v2—at `null`. Its eight gates and seven authority flags are all `false`.

The new Python module does not import Torch and has no teacher, model, holdout, selection reader, network, artifact-enrollment, or training-launch function. Its explicit authorization function always stops with `not implemented; registry remains STOP`.

## Validation

The validated revision is `635d98f1083c0fdbbe8dbf4d2e922eb9d574a739`; its tree is `054f16b85d17697de7288a222d1814ec332fe555`. The core implementation commit is `dd017f8c907b908fc3de1e77ed0b0c4ca67201e9`; the following `800e1c8e…` corrective commit restores the existing byte-pinned `package.json` exactly to the base, and `635d98f1…` hardens bool/int alias and authority/nonclaim field-removal rejection. History was not rewritten.

- Parent-accounting adversarial stdlib tests: 15 / 15 PASS in 0.07 seconds wall time
- V1 fresh QAT + v1 selection preflight + v2 accounting compatibility tests: 41 / 41 PASS in 1.57 seconds wall time
- Full repository stdlib suite: 134 / 134 PASS in 10.73 seconds wall time
- Pinned stable-WASM deadline diagnostic: 11 / 11 PASS in 2.99 seconds wall time; `package.json` exactly matches the base
- Bilingual-article and machine-evidence publication tests: 5 / 5 PASS in 0.35 seconds wall time
- Covered zero/some/all forced, replacement, reorder, reopen, metadata substitution, framing, duplicate JSON, nonfinite values, contract tamper, and authority tamper
- Actual teacher / Torch / artifact / selection / holdout / match / production-weight executions: zero

The machine-readable record is [`floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json`](./data/floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json).

After a production teacher artifact safely completes, the next step is to pass authenticated input metadata and exact `train.jsonl` bytes to the materializer, then review and enroll the resulting proposal in a data-only PR. Training still will not start automatically: STOP remains until exact v2 execution-plan and registry identities, CI, and independent review all pass.
