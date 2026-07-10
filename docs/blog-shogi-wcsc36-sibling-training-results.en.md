# Six Runs Completed, Still Not “Stronger” — The WCSC36 Sibling Selection Failure Record

> The [previous report](./blog-shogi-wcsc36-sibling-training.en.md) stopped treating moves from strong games as answers and built a v6 teacher that searches each sibling candidate independently from the same parent. This experiment completed the fresh depth-16 teacher, sealed partition, and all six preregistered warm/scratch runs. The fixed rule selected warm seed 42 provisionally, but it failed top-1 and float-to-int16 pair-delta gates. I therefore emitted no candidate receipt, kept the final holdout closed, and left production on runOp1. Because Lane A work touched all 28 games, the guarantee is not game-level novelty; it is an **exact-row seal since PR4A** after excluding 102 exposed parents and 1,392 semantic position IDs. **This is a rejection record, not an announcement of improved playing strength.** 日本語版: [blog-shogi-wcsc36-sibling-training-results.md](./blog-shogi-wcsc36-sibling-training-results.md)

---

## TL;DR

- Lane A selected fixed depth 16, MultiPV 12, 12 engines, 64 MiB Hash, and a 600-second per-search ceiling as the final teacher policy. A fresh full run completed from a clean revision and its manifest accounts for 3,112 selected = 3,106 completed + 6 skipped, with 36,365 candidate records, 23,813 train rows, and 8,761 validation rows. The partitioner pins raw SHA-256, complete entry accounting, generator revision, strict search map, engine/eval identities, completion accounting, and base-manifest SHA-256; it rejects n=100 as a full teacher
- The tracked receipt covers every committed depth-selection, hard-case, repeat, and node-policy Lane A artifact: 102 parent IDs and 1,392 semantic IDs. A parent or semantic touch removes the whole sibling group from every role
- A fixed depth-16 domain and seed rank the seven validation games into four selection and three holdout games. The same implementation's nonpublishing audit fixed Lane A exposure removals at 307 parents / 3,642 rows for training, 64 / 762 for selection, 49 / 588 for holdout, and seven unmatched parent IDs. The old 416 / 339-parent split is not reused
- Semantic identity is `position_id ∪ child_position_id`. After Lane A exposure exclusion, holdout wins a holdout/selection conflict and the evaluation union wins a conflict with training. A complete **parent group** is dropped, never an individual candidate row
- The sealed six-run series fixes `cpu` as the device. Native MPS failed at `aten::_embedding_bag` on the old PyTorch 2.3.0 environment. Under the planned PyTorch 2.12.1 runtime, native MPS worked and was about 1.9× faster for one process, but two identical runs did not reproduce the same loss or weight hash even in deterministic-error mode. CPU was byte-exact and supports six parallel processes
- All six preregistered CPU runs completed at clean revision `d18d3c43677255c518dce83f4a53caf46057f878`, each with an atomic `shogi-sibling-training-result-v1`. Median-seed selection chose warm 42 and scratch 42 as the series representatives, then warm 42 as the provisional candidate
- The provisional candidate beat stable on int16 pair accuracy (`0.607228 > 0.604897`) but lost on top-1 (`0.263930 < 0.266862`), and its absolute float-to-int16 pair delta exceeded the fixed limit (`0.002720 > 0.002`). The selection audit therefore emitted no successful candidate receipt and kept the final holdout sealed
- Adoption requires every selection, quantization, sealed-holdout, general/opening-retention, known-`P*8f`-regression, 384-game paired-A/B, and production-browser gate. Production still runs runOp1

---

## 0. What this report is allowed to call a “result”

To keep an expectation in progress from turning into a completed result, I use four states.

- **Confirmed**: a fact backed by saved bytes, a hash, a checkpoint line, or a reproducing test
- **In progress**: a process is running with fixed inputs and contract, but its commit-marker manifest does not exist yet
- **Preregistered**: a selection rule or passing condition fixed before seeing the result
- **Not run**: training, holdout opening, A/B, browser adoption, or another stage with no result yet

Under this vocabulary, the two stopped depth-18 attempts, the completed depth-16 teacher, all six training result markers, and the failed selection audit are confirmed. The final holdout, retention suites, 384-game match, and external calibration remain not run.

---

## 1. Why write the decision rules before the results?

The previous failure happened after overwriting `runOp1` with `deep16` and then finding a field regression. Better aggregate MAE did not help when the new evaluator promoted `P*8f` in the position the owner actually encountered. Reusing one validation set to choose epochs, compare warm against scratch, and tune hyperparameters also makes it easy to call a model fitted to that validation set “strong on unseen data.”

PR4A is therefore limited to fixing boundaries, not introducing a supposedly stronger weight file.

1. Complete the full teacher bytes (done)
2. Reproducibly separate training, model selection, and final holdout
3. Physically remove final-holdout labels from the training process
4. Fix the number of warm/scratch trials and representative-selection rule
5. After implementing a candidate-selection receipt, freeze the candidate hash before opening the final holdout once
6. State the quantization, regression, match, and browser conditions for any strength claim

Moving thresholds after seeing numbers can manufacture a flattering story for almost any model. This preregistration gives up that freedom first.

---

## 2. Stopped depth 18, Lane A comparison, and depth-16 full run

### 2.1 Inputs already pinned

The first full attempts used depth 18, selected by the [clean depth-16/18 gate in the previous report](./blog-shogi-wcsc36-sibling-training.en.md). The heavy tail below made those attempts unusable, so a separate Lane A comparison included the difficult positions. It **fixed the final teacher search limit at depth 16**. These input identities remain pinned while the final search contract has a new fingerprint.

| Item                             | Fixed value                                                        |
| -------------------------------- | ------------------------------------------------------------------ |
| teacher pipeline source revision | `8e376e887fac19fb31c07f147e17e84b1d5fc4b2`                         |
| WCSC36 raw parent JSONL SHA-256  | `827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa` |
| YaneuraOu engine SHA-256         | `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1` |
| eval-tree SHA-256                | `639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568` |
| stable runOp1 checkpoint SHA-256 | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8` |
| legacy replay source SHA-256     | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb` |

The stopped attempts used depth 18, proposal MultiPV 12, 12 engine processes, and 64 MiB of Hash per engine. Independent candidate searches, candidate order, `isready` resets, and engine/eval snapshots remain mandatory v6 safety properties. Only the final policy changed: fixed depth 16, MultiPV 12, 12 engine processes, 64 MiB Hash, and `timeout=600s` per search.

### 2.2 Attempt 1 — 120 seconds was an operational ceiling, not a bad-label definition

The first full attempt started with `timeout=120s` per search. It durably checkpointed 215 parents, then stopped on a difficult parent. The partial checkpoint was intact, but a run continued under different search settings cannot honestly keep the same identity.

The parent was:

```text
sha256:0e8d5252898368e57b9d330688d3c33ff94518609b8430a8403971134b60ed6c
```

It had 12 sibling candidates. Replaying only the runtime behavior with a wider window took 188.52 seconds for the parent. The timeout decision used candidate count, elapsed time, and process completion—not cp, rank 1, or the played move’s rank.

A timeout is not a label-quality threshold. Dropping positions that exceed 120 seconds would selectively erase difficult positions. Accepting an incomplete search is also invalid. At this stage I widened only the operational ceiling, but the next attempt reproduced the heavy tail, so the policy was then compared again under a separate run identity.

### 2.3 Attempt 2 — 600 seconds also stopped, after 393 parents

Attempt 2 used `timeout=600s`, a different fingerprint, and separate work/output files. It restarted from parent zero, then stopped on another heavy parent after durably saving 393 parents. Neither attempt 1’s 215 entries nor attempt 2’s 393 entries may be mixed into the final teacher.

Running only that heavy parent in an isolated `timeout=3,600s` diagnostic completed eight siblings in **1,693.48 seconds (about 28m13s)**. This does not mean a 3,600-second full run was started. The diagnostic measured the runtime tail and published no final train, validation, or manifest artifacts.

### 2.4 Final teacher policy — Lane A selected fixed depth 16

Lane A freshly generated clean n=100 at depth 16 and compared it with the existing clean depth-18 n=100 under the same preregistered metrics. Rank-1-set overlap was 67%, exact top-1 agreement 65%, candidate-set overlap 68%, and Jaccard 84.926%. Ordinary-cp differences had a 29 cp median, 125.3 cp p90, and 41.688 cp 5% trimmed mean. At the 200 cp threshold, relation agreement was 5,050 / 5,473 = 92.271%; all-pair reversal was 8 / 5,473 = 0.1462%; and 1,288 / 1,296 = 99.3827% of pairs decisive at both depths kept their orientation.

Depth 16 used 1,331,739,463 nodes versus 3,291,077,196 at depth 18, a 2.4713× cost at depth 18. The depth-16 n=100 wall time was 254.15 seconds. Difficult parent `0e8d…` took 43.02 seconds / 40,444,364 nodes at depth 16 versus 188.52 seconds / 181,227,281 nodes at depth 18, while retaining rank-1 `B*6g`. A second parent, `1279…`, completed at depth 16 in 36.46 seconds / 35,711,825 nodes; depth 18 ended after 667.01 seconds with one search hitting its 600-second ceiling and published no label. Repeating both difficult parents at depth 16 reproduced work, train, validation, and manifest byte for byte.

Fixed-node policies were not substitutes. One million nodes missed bestmove / PV1; two million nodes produced duplicate PVs over n=100 and completed only one of the two difficult parents. A node cap was therefore not mislabeled as a quality guarantee; fixed depth 16 won.

The final contract is fixed depth 16, proposal MultiPV 12, 12 engines, 64 MiB Hash, and 600 seconds per search. At 2026-07-10 16:37:45 UTC, a fresh full run started from parent zero at clean revision `8e376e887fac19fb31c07f147e17e84b1d5fc4b2`, in `ml/data/wcsc36/full-depth16-v6-8e376e8/`, and exited 0 after 5,354.31 seconds. Its manifest completely accounts for 3,112 selected entries as 3,106 completed / 6 skipped, with 36,365 candidate records, 21 train games / 7 validation games, and zero overlap. Train has 23,813 rows, 20,286,990 bytes, SHA-256 `909f12a503c240b5bf73bc3f7552d1df525531fc7b2b1b6e1dce2fdef70ad70a`; validation has 8,761 rows, 7,422,900 bytes, SHA-256 `5a2435df0c995a325ed3b4584355aa716dd1c91af7e3099413bb34f99e9ac401`; work has 43,197,235 bytes, SHA-256 `f183d40326192813070b17a963b489776c62c3bad4c9223f840ecb371b21fec5`; and the 4,895-byte manifest SHA-256 is `3381e238d722751a73f50e3e89c332ce7344e443e588ea061946cec4e2d4cecc`. The role audit, sealed partition, and six-run training have now completed; production weights remain unchanged because model selection failed.

---

## 3. Split seven validation games into four selection games and three exact-row-sealed-since-PR4A games

### 3.1 Assignment is fixed, but the three games are not game-level unseen

The original game split is 21 training games and seven validation games. The seven validation games are ranked by this fixed framing:

```text
SHA256(
  UTF8("shogi-sibling-eval-partition-v1") || 0x00 ||
  UTF8("wcsc36-d16-v6-eval-v1")          || 0x00 ||
  UTF8(game_id)
)
```

Ordering is by digest bytes ascending, then by `game_id` UTF-8 bytes if digests tie. The first three games become final holdout; the other four become model selection. The exact 3 / 4 quota does not move after results arrive.

After Lane A exposure and cross-role semantic conflicts are removed, the published partition is:

| Role             | Games | Parents / records | Use                                        |
| ---------------- | ----: | ----------------: | ------------------------------------------ |
| model training   |    21 |    1,725 / 20,123 | passed to warm/scratch                     |
| model selection  |     4 |       341 / 3,912 | used for epoch/checkpoint/series selection |
| final holdout    |     3 |       290 / 3,391 | evaluated only after a candidate receipt   |
| validation total |     7 |       631 / 7,303 | four + three games                         |

Game assignment uses no cp or rank, only game ID and the fixed depth-16 hash. The old depth-18-seed 416 / 339-parent split and the table assigning only 100 pilot parents as 70 / 15 / 15 parents and 830 / 180 / 180 rows are diagnostic history, not current role accounting. Lane A includes the depth-selection pilot plus hard-case, repeat, and node-policy diagnostics spread across all 28 games, so the holdout cannot honestly be called “opened for the first time” or game-level untouched.

The current tracked receipt unions every committed Lane A artifact: 102 parent IDs and 1,392 semantic IDs from `position_id ∪ child_position_id`. Two sorted, unique, LF-terminated ID files and the receipt itself are separately SHA-256-bound. A whole sibling group is removed from training, selection, or holdout if either its parent ID or any position/child ID touches that receipt. At a clean HEAD, `--audit-policy-exposure` published no artifact and exited 2 with 307 parents / 3,642 rows for training, 64 / 762 for selection, 49 / 588 for holdout, and seven unmatched parent IDs. Those values are now pinned in the receipt (4,111 bytes; SHA-256 `083a86e48f1af134b854cdf0e505f0f39cc55ef75d5cbbc0df47c3e1c5013a6f`) and the TypeScript/Python contracts. The defensible guarantee is only an **exact-row seal since PR4A**—not a holdout independent of teacher construction.

At the same clean revision `6d541f1108a22f18751ee009417c3e57e27f8205`, preflight passed with every output still absent, after which publication wrote the manifest last as the commit marker. The Python consumer then reverified every source/output byte binding and every isolation field as zero.

| Partition artifact     | Records / parents |      Bytes | SHA-256                                                            |
| ---------------------- | ----------------: | ---------: | ------------------------------------------------------------------ |
| model training         |    20,123 / 1,725 | 17,154,270 | `f6dcfd6a7ca0b42e730ba0aff46394bf61e772a9b01270c5bfe126daf81c6e26` |
| model selection        |       3,912 / 341 |  3,319,397 | `97b15ba1ee780009986b5e8210cbfdbfc181f93555b7c1a87f4a6a585b7bb5ba` |
| final holdout          |       3,391 / 290 |  2,870,874 | `89b3e2ca1e637a507b4b6559326ada420d205c3967ac33063a9084ee5290e8c8` |
| protected semantic IDs |         3,372 / — |    242,784 | `762b95b52f50223fd484573d7d3823f3d2d7622ea3817f4300ae9fcc95935d26` |
| partition manifest     |                 — |      5,357 | `d95e66239dbf2dcf3979f4cf52a5ed666922f808f82b35aff4ccefc95c0d8ee1` |

### 3.2 The audit found leakage that same-type comparisons missed

The original split made `train.position_id` versus `val.position_id` and `train.child_position_id` versus `val.child_position_id` disjoint. But the following cross-directions are also the same semantic position reappearing:

- `train.position_id` ↔ `evaluation.child_position_id`
- `train.child_position_id` ↔ `evaluation.position_id`

The PR4A cross-audit found that those two directions were not independently enforced. Semantic identity is now uniformly defined as:

```text
position_id ∪ child_position_id
```

Groups touching the Lane A parent/semantic exposure union are removed from every role first. If final holdout and model selection then collide, **final holdout wins** and the complete selection parent group is removed—not an individual candidate row. The surviving selection and holdout unions form the evaluation set. Any source-training parent touching that union is removed as a complete group. **Evaluation wins.**

Training therefore reads `model_training` bound by the partition manifest, not the base manifest’s original train output. Publication fails closed if one of the 21 training games disappears or if the four-selection / three-holdout quota breaks. Training, selection, and holdout JSONL are filtered from original line bytes rather than re-serialized.

### 3.3 The training process never receives holdout labels

The partition publishes five artifacts through fsynced atomic rename, with the manifest written last as the commit marker.

1. Semantic-isolated `model_training` JSONL
2. `model_selection` JSONL
3. `final_holdout` JSONL
4. Protected semantic position IDs for the holdout
5. A partition manifest binding every byte/hash/count and every zero-overlap claim

The protected-ID file contains sorted, unique, LF-terminated UTF-8 `sha256:...` identifiers. It contains no cp, move, rank, or SFEN.

The training CLI receives `model_training`, `model_selection`, the partition manifest, all policy-exposure artifacts, and protected IDs. It receives no `final_holdout` path. Replay first excludes **policy semantics ∪ selection semantics ∪ protected holdout IDs**, then samples exactly 500,000 eligible rows; underfill is fatal. Checkpoints bind each set and the exact union by count/hash.

```bash
node -r tsx/cjs ml/partition-sibling-validation.ts \
  --source-train ml/data/wcsc36/siblings.train.jsonl \
  --source-val ml/data/wcsc36/siblings.val.jsonl \
  --base-manifest ml/data/wcsc36/sibling-manifest.json \
  --policy-exposure-receipt ml/protocols/wcsc36-policy-exposure-receipt.json \
  --policy-exposed-parent-ids ml/protocols/wcsc36-policy-exposed-parent-ids.txt \
  --policy-exposed-semantic-position-ids ml/protocols/wcsc36-policy-exposed-semantic-position-ids.txt \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --out-train ml/data/wcsc36/siblings.model-training.jsonl \
  --out-model-selection ml/data/wcsc36/siblings.model-selection.jsonl \
  --out-final-holdout ml/data/wcsc36/siblings.final-holdout.jsonl \
  --out-protected-position-ids ml/data/wcsc36/final-holdout-position-ids.txt \
  --manifest ml/data/wcsc36/sibling-eval-partition-manifest.json \
  --preflight
```

While receipt `role_accounting` is null, only `--audit-policy-exposure` can run the identical partition logic; it prints observed JSON, publishes nothing, and exits 2. After values are pinned, the audit flag remains strictly read-only, verifies the accounting, prints `Audited (no publish)`, and exits 0. A separate preflight must pass before running without either flag to publish. The base manifest pins selected IDs, fixed depth 16, MultiPV 12, 12 engines, FV scale 20, 64 MiB Hash, timeout 600,000 ms, split-game IDs, and the exact engine receipt.

---

## 4. A warm start is not a verified continuation

runOp1 is the production baseline and its hash is pinned. It predates the sibling manifest, sealed partition, and current train/selection provenance, however.

Warm start permits only the following:

- Explicitly pass `--allow-legacy-init`
- Read network weights only
- Create a fresh optimizer and scheduler
- Preserve legacy-initialization status in checkpoint metadata

Warm is therefore a hypothesis that runOp1’s broad knowledge reduces forgetting. It is not a strict resume of the same experiment. Missing provenance is not retroactively labeled verified.

Scratch shares no initial weights. Warm and scratch do share the same legacy replay source, fixed to 500,000 rows and ratio 1.0. Its SHA-256 is `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb`. Sampling is deterministic after semantic exclusions.

---

## 5. Training matrix and representative-candidate rule

The sealed matrix contained exactly six runs.

| Series  | Initialization    | Seeds      | Learning rate | Epochs | Replay limit / ratio |
| ------- | ----------------- | ---------- | ------------: | -----: | -------------------: |
| warm    | runOp1 model only | 42, 43, 44 |        `1e-4` |     20 |        500,000 / 1.0 |
| scratch | fresh             | 42, 43, 44 |        `1e-3` |     40 |        500,000 / 1.0 |

Every checkpoint carries a `shogi-sibling-training-experiment-v1` receipt, and the following values are checked exactly. `--select-metric sibling-pair` is explicit; `auto` is rejected for this experiment. The device is also fixed explicitly as `--device cpu`.

Before freezing that choice, I ran the same 42-row, batch-256, seed-42, one-epoch smoke twice on each path. CPU took real `0.94s` / `1.06s` (mean `1.00s`) with no warning. Native MPS failed immediately because PyTorch `2.3.0` did not implement DistillNet's `aten::_embedding_bag` path. With `PYTORCH_ENABLE_MPS_FALLBACK=1`, the run completed and printed metrics identical to CPU, but took `1.65s` / `1.19s` (mean `1.42s`, `+42%`) and emitted a fallback warning every time, so fallback is not used.

I re-audited the actual planned Python `3.13.0` / PyTorch `2.12.1` runtime before filling the plan. Native MPS now completes EmbeddingBag forward/backward. With a fixed seed and initial state, batch 256, 40 sparse indices, AdamW, 10 warmup and 200 measured steps, two CPU runs at two threads took `0.3476s` / `0.3619s` (575.4 / 552.6 steps/s) and reproduced the exact final loss and weight SHA-256. Two MPS runs took `0.1932s` / `0.1796s` (1,035.0 / 1,113.6 steps/s), about 1.9× faster for one process, but final losses were `0.0441174` / `0.0441200` and the weight hashes differed despite `torch.use_deterministic_algorithms(True)` and deterministic debug mode `error`. This is a runtime microbenchmark, not a playing-strength result. CPU remains sealed because it is repeatable and lets the six comparison runs use two threads each in parallel. The tracked `shogi-sibling-six-run-plan-v1` now pins every platform, system, machine, processor, CPU model, logical CPU count, Python, PyTorch, CPU-device, and input identity. The committed plan is 3,057 bytes with SHA-256 `0e34262f77555897d92b01a3737c71057d8b90cc98cdcb2fe63ad24ec4dde070`; a separate later commit pins those exact bytes in code. Every process fixes two intra-op threads, one inter-op thread, deterministic algorithms, and deterministic debug mode `error`. A dirty/untracked plan or hash mismatch prevents training from starting.

The plan deliberately contains no `training_pipeline_revision`. The plan is committed first and its byte SHA-256 is pinned by a constant in a later commit; embedding that future commit hash inside the plan would create an impossible self-reference. At execution, the code separately verifies the sealed plan hash and tracked/unmodified file, then requires the whole worktree to be clean with `HEAD == --pipeline-revision`. That execution HEAD is recorded in every checkpoint and the completed result marker. Separating the plan seal from the execution-code receipt does not make either optional.

| Common argument / identity                 | Fixed value                                                                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| loss / features / batch                    | `sibling-ranking` / `board` / `256`                                                                                         |
| sigmoid K / cp clamp                       | `600.0` / `3000`                                                                                                            |
| rank weight / pair min / pair max / margin | `1.0` / `50.0` / `600.0` / `50.0cp`                                                                                         |
| policy weight / temperature                | `0.25` / `200.0cp`                                                                                                          |
| selection                                  | CLI and resolved value are both `"sibling-pair"`                                                                            |
| primary limit / device                     | `0` (all rows) / `cpu`                                                                                                      |
| common runtime                             | exact hardware/OS/Python/PyTorch/`cpu`; per process: two intra-op threads, one inter-op thread, deterministic debug `error` |
| replay                                     | required, limit `500000`, ratio `1.0`                                                                                       |
| replay source SHA-256                      | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb`                                                          |
| warm initializer SHA-256                   | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8`                                                          |
| warm legacy flag                           | `true`; safely load model weights only, with fresh optimizer/scheduler                                                      |
| scratch initializer / legacy flag          | none / `false`                                                                                                              |
| teacher / partition / filtered-data hashes | teacher `3381e238…`, partition `d95e6623…`, training `f6dcfd6a…`, selection `97b15ba1…`, protected IDs `762b95b5…`          |

Warm accepts only seeds 42/43/44, `lr=1e-4`, and 20 epochs. Scratch accepts the same three seeds, `lr=1e-3`, and 40 epochs. Six parallel processes therefore have exactly 12 intra-op slots and no hidden inter-op fan-out. The plan fixes six repository-relative output slots and refuses an existing directory. Only a completed run atomically writes `shogi-sibling-training-result-v1` last, binding every checkpoint, `curve.csv`, pipeline revision, and deterministic runtime receipt; a crashed directory has no selectable result marker.

There will be no fourth seed, alternative learning rate, or extra epoch schedule added after looking at results. A new setting requires a new preregistered experiment and cannot reuse this final holdout as if untouched.

Representative selection uses only int16 model-selection metrics. Within each series, its three seed checkpoints are ordered by this lexicographic tuple, and the median-ranked seed becomes the series representative.

1. Within-parent pair accuracy: higher
2. Teacher top-1 accuracy: higher
3. Value MAE: lower

The warm and scratch representatives are compared by the same ordering to produce one candidate. This selects a real median-seed checkpoint rather than inventing an averaged checkpoint.
If all three metrics tie exactly, the only fallback is **series (warm before scratch), seed (42 before 43 before 44), then checkpoint SHA-256 in bytewise ascending order**.

### 5.1 The six sealed runs completed

All six processes ran concurrently from clean revision `d18d3c43677255c518dce83f4a53caf46057f878`. Every slot finished its exact epoch count and wrote `shogi-sibling-training-result-v1` last. The following numbers come from independent int16 inference on the same 3,912 records / 341 parents / 15,439 eligible pairs in model selection.

| Slot       | Selected epoch | int16 pair | int16 top-1 | int16 MAE (cp) | float→int16 pair delta | result / checkpoint / export / report SHA-256         |
| ---------- | -------------: | ---------: | ----------: | -------------: | ---------------------: | ----------------------------------------------------- |
| warm 42    |             20 |   0.607228 |    0.263930 |        491.990 |              −0.002720 | `374393b6…` / `96863352…` / `8b82fd1a…` / `031991dc…` |
| warm 43    |             18 |   0.606322 |    0.263930 |        486.316 |              −0.003886 | `f04e440a…` / `d0175b68…` / `91a8206a…` / `db3fec24…` |
| warm 44    |             20 |   0.607228 |    0.269795 |        484.685 |              −0.002720 | `b9aa88c7…` / `e5f08d6a…` / `4cbdbebd…` / `d70467d9…` |
| scratch 42 |              8 |   0.601852 |    0.246334 |        581.531 |              −0.001943 | `8ea8531e…` / `c43b8c88…` / `9cdfe900…` / `8df7a3d5…` |
| scratch 43 |              6 |   0.598873 |    0.208211 |        557.270 |              −0.002915 | `83d5ade4…` / `a3b6a8a1…` / `7a0e933b…` / `141561cd…` |
| scratch 44 |              8 |   0.602435 |    0.255132 |        623.181 |              −0.000777 | `0bf6f448…` / `724e509f…` / `123f35bd…` / `942f53e0…` |

The warm order is 44, 42, 43 and the scratch order is 44, 42, 43. The preregistered median rule therefore selects warm 42 and scratch 42 as the two representatives; comparing those representatives selects warm 42 provisionally. Its complete checkpoint SHA-256 is `968633526e0ebd4a9ef0044626ff3e824fc68fee9225850f2b13d01f655d4e51`, and its int16 export SHA-256 is `8b82fd1a46c2ff5511ff4f4401261f01406d48e87c07810c2211db3e8a9e0565`. Warm 44 has the best observed top-1, but replacing the median winner with it after seeing results would violate the experiment.

Stable runOp1 measured `0.6048966902` pair accuracy, `0.2668621701` top-1, and `496.8903cp` MAE in the same int16 selection evaluation. Warm 42 passes the strict pair comparison but fails top-1. Its pair delta from float is also `−0.0027203834`, outside the absolute `0.002` limit; its `+0.0029325513` top-1 delta remains inside the `0.005` limit. Two of four gates therefore fail.

---

## 6. Freeze the candidate hash, then open the holdout once

At model-selection completion, at least these identities are saved:

- Checkpoint bytes / SHA-256
- int16 export bytes / SHA-256
- Series, seed, epoch, and complete training arguments
- Teacher-manifest and partition-manifest SHA-256
- Model-selection report bytes / SHA-256
- Exact six result identities (three warm + three scratch) and run-plan SHA-256

Only after that candidate identity is immutable and every selection gate passes may stable runOp1 and the candidate be evaluated together on the final-holdout JSONL, once. The completed `shogi-sibling-six-run-selection-audit-v1` strict-decodes all six result markers, artifact identities, int16 reports, ordering rules, and stable comparison. It also regenerates all six candidate exports/reports plus stable from the fixed venv and clean exporter/evaluator, requiring byte-exact weights/metadata and exact float/int16 metrics and core provenance. The 27,430-byte audit has SHA-256 `f8a8dc8388e0937cbbfe430e015bc468bb2c127c2c783ddf0690f514e11a27ae`.

Because two selection gates failed, that audit records `not_emitted_selection_gate_failed`; no `shogi-sibling-candidate-selection-receipt-v1` was emitted. It also records `final_holdout.status = sealed_not_opened` and `labels_read = false`. The evaluator continues to reject the `final-holdout` role. This is a selection failure, not a failed holdout, because the holdout was never read.

---

## 7. Adoption gates — numbers fixed before results

### 7.1 Model selection and quantization

| Gate                            | Required condition                               |
| ------------------------------- | ------------------------------------------------ |
| selection int16 pair accuracy   | **greater than stable**                          |
| selection int16 top-1           | **at least stable**                              |
| float → int16 pair degradation  | at most 0.2 percentage points (absolute `0.002`) |
| float → int16 top-1 degradation | at most 0.5 percentage points (absolute `0.005`) |

Value MAE breaks ties between representative candidates; it cannot compensate for a failed pair/top-1 gate.

### 7.2 Exact-row sealed since PR4A final holdout (evaluation currently disabled)

Only after candidate-selection receipt support lands must the int16 candidate satisfy **both** conditions against stable:

- Within-parent pair accuracy at least stable
- Teacher top-1 accuracy at least stable

Failure on either is failure. Holdout metrics never flow backward into series or epoch selection.

### 7.3 General / opening retention

The existing general holdout and opening holdout are each measured under the same conditions as stable. Every condition must pass on each dataset.

| Metric                 | Retention floor              |
| ---------------------- | ---------------------------- |
| value MAE              | `candidate ≤ stable × 1.05`  |
| pair accuracy          | `candidate ≥ stable - 0.005` |
| decisive-pair accuracy | `candidate ≥ stable - 0.005` |

Better sibling metrics do not excuse damaging broad or opening behavior by more than the fixed tolerance.

### 7.4 Known `P*8f` regression

The fixed position from the [field-regression report](./blog-shogi-eval-recovery.en.md) must pass every check:

- Static evaluation ranks `P*8f` below `3a4b`
- Fixed depth 11 and 12 never choose `P*8f`
- 800 / 2,000 / 4,000 ms, three runs each and nine total, all choose a move other than `P*8f`

One recurrence of this known bad move rejects the candidate, regardless of aggregate averages.

### 7.5 384-game paired A/B

The candidate plays stable for 384 games: 192 color-swapped opening pairs. Pairing opening and color reduces a favorable one-sided draw.

Intervals treat each two-game color-swapped opening pair as one block, not each game as independent. The block score is the candidate's mean of win=1, draw=0.5, loss=0 across its two games. A paired percentile bootstrap resamples 192 blocks with replacement 100,000 times using Python `random.Random(20260710)`. In sorted replicate means, the 5,000th value (one-based) is the one-sided 95% lower bound and the 2,500th is the two-sided 95% interval's lower bound.

- **Safety**: the one-sided 95% lower bound on score rate exceeds 45%
- **Permission to say “stronger”**: the lower bound of the two-sided 95% interval exceeds 50%

A point estimate barely above 50% is not “stronger.” If safety passes but the interval cannot clear 50%, the conclusion is “non-inferiority supported; improvement unproven.”

### 7.6 Production browser

Finally, the real browser loads weights byte-identical to the frozen candidate SHA-256. Every condition is required:

- Exact candidate hash loaded
- Production Worker / WASM path executed
- Returned move was legal
- No console or runtime error
- Every prescribed time budget completed

No new numeric threshold is invented here. Exact candidate identity, production path, legality, error-free execution, and completion at every time budget are the pass conditions.

### 7.7 External calibration for “stable high-dan” is a separate gate

The internal 384-game A/B establishes only whether the candidate is stronger than stable under fixed conditions; it does not prove a human rank. External calibration refers to the [current 81Dojo table](https://system.81dojo.com/pages/ranks), checked on 2026-07-10: 5-dan is 2050–2199, 6-dan is 2200–2399, and 7-dan is 2400+. That is an external scale, not a conversion inferred from the internal A/B.

The [81Dojo Terms of Use](https://81dojo.com/en/terms.html) require a `COM_*` special account for software-assisted play and prohibit server access through tools other than the official apps. Even after every internal gate passes, play therefore begins only after preregistering the candidate SHA-256, time control, nonselective pairing, minimum game count, and rating-stability rule, coordinating operations with the user, and obtaining explicit permission; only the official app may be used. This PR starts neither those numeric commitments nor any ladder game—it records the external-ladder plan only. [Shogi Club 24](https://www.shogidojo.net/) ended service on 2025-12-31 and is not a calibration option.

---

## 8. Current result ledger

| Stage                                             | State                                | Current evidence / unresolved output                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| full attempt 1, timeout 120s                      | **Confirmed, rejected**              | stopped after 215 parents; never resumed as another condition                                                                                                        |
| difficult-parent runtime diagnostic 1             | **Confirmed**                        | 12 siblings, 188.52 seconds; label scores unused for selection                                                                                                       |
| full attempt 2, timeout 600s                      | **Confirmed, rejected**              | stopped on another heavy parent after 393 parents                                                                                                                    |
| isolated heavy-parent diagnostic                  | **Confirmed**                        | eight siblings took 1,693.48 seconds inside a 3,600s ceiling; not a full run                                                                                         |
| training-device smoke                             | **Confirmed**                        | Torch 2.12.1 MPS is ~1.9× faster for one process but two identical runs diverged in loss/hash; CPU is exact and supports six-way parallelism; sealed device is `cpu` |
| Lane A teacher-policy comparison                  | **Confirmed**                        | selected fixed depth 16; n=100 ordinary-cp median 29 / p90 125.3, all-pair reversal 0.1462%, depth-18 node ratio 2.4713×                                             |
| fresh final-policy full teacher                   | **Confirmed, complete**              | exit 0 after 5,354.31s; 3,112 selected = 3,106 completed + 6 skipped, 36,365 candidates, 21/7 games, zero overlap                                                    |
| full teacher manifest / train / val / work hashes | **Confirmed**                        | manifest `3381e238…` / train `909f12a5…` / val `5a2435df…` / work `f183d403…`; bytes and row counts recorded above                                                   |
| sealed partition manifest / five artifact hashes  | **Confirmed, published**             | training `f6dcfd6a…` / selection `97b15ba1…` / holdout `89b3e2ca…` / protected `762b95b5…` / manifest `d95e6623…`; Python reverified, every overlap zero             |
| policy-exposure receipt                           | **Audited and pinned**               | 102 parent / 1,392 semantic IDs; removals are training 307 parents/3,642 rows, selection 64/762, holdout 49/588, unmatched 7                                         |
| model-training cross-semantic isolation           | **Implemented and tested**           | after Lane A exposure exclusion, evaluation union wins, whole-parent drop, 21 games required                                                                         |
| six-run plan                                      | **Sealed and completed**             | 3,057 bytes / `0e34262f…e070`; all six slots completed at clean revision `d18d3c4…` with deterministic two-thread CPU receipts                                       |
| external high-dan calibration                     | **Plan only; not authorized**        | confirmed 81Dojo COM-account / official-app constraints; candidate/time control/pairing/minimum games/stability rule must be frozen before play                      |
| warm seeds 42/43/44                               | **Complete**                         | int16 pair `0.607228 / 0.606322 / 0.607228`; median representative seed 42                                                                                           |
| scratch seeds 42/43/44                            | **Complete**                         | int16 pair `0.601852 / 0.598873 / 0.602435`; median representative seed 42                                                                                           |
| provisional candidate                             | **Selected, then rejected by gates** | warm 42 checkpoint `96863352…`, export `8b82fd1a…`; pair beats stable, top-1 and pair-quantization gates fail                                                        |
| selection audit                                   | **Confirmed failure receipt**        | 27,430 bytes / `f8a8dc83…a27ae`; seven-model export/report reproduction exact; no success candidate receipt emitted                                                  |
| exact-row final holdout                           | **Unopened; rejected in code**       | audit says `sealed_not_opened`, `labels_read=false`; no result exists                                                                                                |
| general / opening retention                       | **Not run**                          | compare three preregistered metrics with stable                                                                                                                      |
| `P*8f` regression suite                           | **Not run**                          | static, depth 11/12, and nine timed runs                                                                                                                             |
| paired A/B                                        | **Not run**                          | 384 games / 192 color-swapped pairs                                                                                                                                  |
| production browser                                | **Not run**                          | exact hash, Worker/WASM, legal/error/time checks                                                                                                                     |
| production promotion                              | **Not run**                          | keep runOp1; separate PR only if every gate passes                                                                                                                   |

The blank downstream stages mean neither zero nor secret. They were not reached because selection failed before the holdout boundary.

---

## 9. What we learned now, and what the next report may claim

The intermediate result is not a weight file. It is the removal of convenient escape hatches.

- The 120-second full run stopped after 215 parents; the 600-second full run also stopped after 393, and a second isolated heavy parent needed 1,693.48 seconds for eight siblings
- Lane A selected depth 16: n=100 retained a 0.1462% all-pair reversal rate while depth 18 cost 2.4713× the nodes, and only depth 18 hit the 600-second ceiling on the second heavy parent
- The final-policy fresh full run completed with exit 0 from a clean revision and committed 3,112 selected entries, 3,106 completed, six skipped, and all train/validation/work/manifest byte identities
- The three holdout games were assigned deterministically, but the pilot had touched all 28 games, so the game-level-unseen claim was withdrawn
- A tracked receipt removes every group touching the 102-parent / 1,392-semantic Lane A exposure union, limiting the claim to an exact-row seal since PR4A
- The nonpublishing audit pinned per-role exposure removals at 307 parents/3,642 rows, 64/762, 49/588, and seven unmatched IDs
- Parent↔child cross-semantic leakage was found, so base train is no longer consumed directly
- All six sealed runs completed. Warm consistently exceeded scratch on pair/top-1, but the median warm seed still failed stable top-1 and the fixed quantization-delta limit
- The 27,430-byte selection audit binds the provisional warm-42 identity, reproduces all seven exports/reports exactly, and records that no success candidate receipt was emitted; holdout labels remain unread

None proves stronger play. They do make it harder to excuse a weaker model with an aggregate metric or a tiny match.

The next experiment will be separately preregistered around int16-aware or quantization-aware training, with its inputs, seeds, schedule, export regeneration, and selection thresholds fixed before it runs. It will not swap in warm 44 post hoc and it will not open the final holdout. Until a later candidate passes every static gate, production remains on runOp1.
