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
| Parent-accounting v2 amendment |  7,571 | `983e89b8e611dbcd42c70c51a4109f879dfffe40fd8b560a99c798b826f86bef` |
| Closed v2 registry             |  3,501 | `97bd6c1839288f505d31e62904ba095a0ccd11a5dc1f5a58d37f21bea11e214c` |

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

The materializer core does not accept an ID set in place of the input. It first verifies the length and SHA-256 of all 15,369,952 raw bytes against the role-bundle identity. It then strict-parses those exact bytes as canonical JSONL to obtain each game / parent / position / SFEN / ply tuple and its order. Reordering the rows or permuting game/position tuples between parents therefore fails the raw SHA-256 check even if all unordered ID-set digests are unchanged.

Emitted parents must be an order-preserving subsequence of that authenticated input order. A parent outside the input, reordered output, or reopened group is rejected. Replacement and resampling remain zero.

## Forced status is never inferred from a missing group

The absence of a parent group from `train.jsonl` does not prove a forced skip. A missing or truncated output and a genuinely completed forced parent are different states.

V2 requires per-parent completion evidence that covers all 24,000 inputs in their exact order. Each record binds:

- The game / parent / position tuple from the input
- `completed_parent_sha256`
- An explicit `forced_parent_skipped` value
- For a non-forced parent, the exact LF-framed train-group record count and SHA-256
- For a forced parent, zero group records and a `null` group SHA-256

The completion stream's own bytes, SHA-256, record count, and forced/emitted ID digests must be enrolled as an independent identity. Its origin must be a projection of the authenticated production-finalizer result, manifest, and `work.jsonl`; a caller-supplied Boolean list is not acceptable. The current v2 registry leaves both finalizer work and completion evidence at `null`, so the production materializer and validator always stop with `authenticated per-parent completion evidence is not enrolled`. A small synthetic core exists only for adversarial tests and carries no production authority.

## What is bound from `train.jsonl`

The stdlib-only core reads supplied exact bytes as strict canonical JSONL. It rejects CR bytes, invalid final-LF framing, blank lines, duplicate JSON keys, `NaN`, noncanonical semantic IDs, game/position substitution, and groups with fewer than two siblings. It also mirrors the important training-consumer invariants: canonical SFEN and position IDs; strict integer ply, CP, and rank fields; parent/child CP aliases; mate bands; unique canonically ordered sources; unique moves; exactly one `played` source per group; ranks contiguous from 1 through N; and monotonic teacher CP by rank.

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

The proposal validator does not merely check a proposal's self-consistency. It regenerates the entire proposal from the exact input, completion, and train byte streams and their independently supplied identities, then requires typed-exact equality. Tampering with a forced digest or train SHA and rebuilding the training contracts around that tamper is therefore rejected.

The materializer does not claim to authenticate teacher or completion origin by itself. A future data-only enrollment must register only a finalizer-authenticated and durable result/manifest/work chain plus its derived completion artifact, then pin the proposal bytes/SHA-256 in a separate PR. This change generates no real artifact, writes no artifact, and opens no registry gate.

## The three cases

| Case                             | Decision                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| `F = 0`, `E = 24000`             | Valid only when authenticated completion marks every parent non-forced and every group matches |
| `0 < F < 24000`, `E = 24000 - F` | Valid only when completion explicitly marks forced parents and every non-forced group matches  |
| `F = 24000`, `E = 0`             | Returns a STOP receipt only when authenticated completion explicitly marks all 24,000 forced   |

All-forced is never inferred from an empty train file. Only authenticated completion evidence explicitly marking all 24,000 parents forced can produce the receipt carrying input/forced/emitted digests, an empty-train identity, false authority, and `no-trainable-parent-groups`. If even one completion is non-forced, an empty or truncated train artifact fails closed instead of being promoted to an accountable STOP.

## The training experiment is unchanged

Parent accounting is the only change. V2 pins the canonical SHA-256 of the complete training, slot, and selection contracts:

| Contract      | Canonical SHA-256                                                  |
| ------------- | ------------------------------------------------------------------ |
| Training      | `b0bf9dbd2342b8be325fae4d195e9bdd909a702361d229293f30849f1348d8ac` |
| Seeds / slots | `aab83502378adca6557e4ba0d9da4cf545061eed8d15b1aeae0b99b8a41ffeed` |
| Selection     | `9aeade0c64556bd8c3b59bff7b1b1cedb386d2226a4ce60fc7b59677d305352c` |

The seeds remain 42 / 43 / 44; architecture remains `2282-256-32-1-clipped-relu`; loss remains `sibling-ranking`; optimizer remains AdamW; learning rate remains `0.0001`; and epochs remain 20. Source or parent replacement, resampling, and model/loss/optimizer/seed/epoch/selection-gate/holdout-policy changes are forbidden.

## The boundary remains closed

The [v2 registry](../ml/protocols/floodgate-q1-2026-fresh-qat-plan-registry-v2.json) leaves all seven enrollments—training result, manifest, work, per-parent completion evidence, `train.jsonl`, parent-accounting proposal, and execution plan v2—at `null`. Its 12 gates, including raw-input, finalizer-chain, completion-origin, and exact-coverage gates, and all seven authority flags are `false`.

The new Python module does not import Torch and has no teacher, model, holdout, selection reader, network, artifact-enrollment, or training-launch function. Its explicit authorization function always stops with `not implemented; registry remains STOP`.

## Validation

The validated revision is `085023ebae2a5d968b1d8fd7491319856858b056`; its tree is `c4ef0c4dcac2c6a21ba16a2b9362765c4228dc19`. The core implementation commit is `dd017f8c907b908fc3de1e77ed0b0c4ca67201e9`; `800e1c8e…` restores the existing byte-pinned `package.json` exactly to the base, and `635d98f1…` hardens Boolean/integer aliases. Red-team review then found unverified raw input, missing-group-to-forced misclassification, proposal-only self-consistency, and acceptance of skeletal sibling rows. Append-only commit `baab4a9a…` fixes all four. Rereview found that Python's Unicode digit predicate accepted non-ASCII SFEN move numbers such as `٢٤`; append-only commit `085023eb…` restricts that field to ASCII `0` through `9` and adds the adversarial regression. History was not rewritten.

- Parent-accounting adversarial stdlib tests: 19 / 19 PASS in 0.10 seconds wall time
- V1 fresh QAT + v1 selection preflight + v2 accounting compatibility tests: 45 / 45 PASS in 1.92 seconds wall time
- Full repository stdlib suite: 138 / 138 PASS in 11.07 seconds wall time
- Pinned stable-WASM deadline diagnostic: 11 / 11 PASS in 2.99 seconds wall time; `package.json` exactly matches the base
- Bilingual-article and machine-evidence publication tests: 5 / 5 PASS in 0.35 seconds wall time
- Covered zero/some/all forced, raw reorder, cross-parent tuple permutation, completion truncation/flag/tuple/group-hash tamper, missing non-forced groups, forced-group injection, skeletal rows, CP/source/move/rank invariants, non-ASCII SFEN move numbers, every proposal digest, rebuilt contracts, and authority tamper
- Actual teacher / Torch / artifact / selection / holdout / match / production-weight executions: zero

The machine-readable record is [`floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json`](./data/floodgate-fresh-qat-parent-accounting-v2-2026-07-18.json).

After a production teacher artifact safely completes, the next step is to independently verify and enroll the finalizer result/manifest/work chain and its exact derived per-parent completion stream. Until then, the production materializer itself remains STOP. Even after enrollment, the proposal must be regenerated from exact input/completion/train bytes and reviewed in a data-only PR. Training does not start until exact v2 execution-plan and registry identities, CI, and independent review all pass.
