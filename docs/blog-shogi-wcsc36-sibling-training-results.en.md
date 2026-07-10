# I Am Not Calling It “Stronger” Yet — Exact-Row Sealing and Preregistration for WCSC36 Sibling Training

> The [previous report](./blog-shogi-wcsc36-sibling-training.en.md) stopped treating moves from strong games as answers and built a v6 teacher that searches each sibling candidate independently from the same parent. This is the next experiment log. The depth-18 full attempts stopped on a heavy runtime tail, so a separate Lane A comparison fixed the final policy at depth 16 and a fresh full run completed. Before seeing training results I am also fixing the boundary between model selection and the final holdout, the warm/scratch comparison, quantization checks, known-regression tests, a 384-game A/B, and the real-browser gate. Because Lane A work touched all 28 games, the guarantee here is not game-level novelty; it is an **exact-row seal since PR4A** after excluding 102 exposed parents and 1,392 semantic position IDs. **This is not an announcement of improved playing strength.** 日本語版: [blog-shogi-wcsc36-sibling-training-results.md](./blog-shogi-wcsc36-sibling-training-results.md)

---

## TL;DR

- Lane A selected fixed depth 16, MultiPV 12, 12 engines, 64 MiB Hash, and a 600-second per-search ceiling as the final teacher policy. A fresh full run completed from a clean revision and its manifest accounts for 3,112 selected = 3,106 completed + 6 skipped, with 36,365 candidate records, 23,813 train rows, and 8,761 validation rows. The partitioner pins raw SHA-256, complete entry accounting, generator revision, strict search map, engine/eval identities, completion accounting, and base-manifest SHA-256; it rejects n=100 as a full teacher
- The tracked receipt covers every committed depth-selection, hard-case, repeat, and node-policy Lane A artifact: 102 parent IDs and 1,392 semantic IDs. A parent or semantic touch removes the whole sibling group from every role
- A fixed depth-16 domain and seed rank the seven validation games into four selection and three holdout games. The same implementation's nonpublishing audit fixed Lane A exposure removals at 307 parents / 3,642 rows for training, 64 / 762 for selection, 49 / 588 for holdout, and seven unmatched parent IDs. The old 416 / 339-parent split is not reused
- Semantic identity is `position_id ∪ child_position_id`. After Lane A exposure exclusion, holdout wins a holdout/selection conflict and the evaluation union wins a conflict with training. A complete **parent group** is dropped, never an individual candidate row
- The sealed six-run series fixes `cpu` as the device. Native MPS fails immediately at `aten::_embedding_bag`; MPS fallback produced the same smoke metrics but averaged 42% slower than CPU and warned on every run
- The training process receives no final-holdout JSONL path. Final-holdout evaluation is also rejected in code until a separate PR produces the preregistered candidate-selection receipt, connects it to the gates, and freezes the candidate hash. Its hashes and results remain `TBD` and unopened
- Warm start and scratch each run seeds 42 / 43 / 44. Warm is fixed at `lr=1e-4, 20 epochs`; scratch at `lr=1e-3, 40 epochs`; both use 500,000 replay rows at ratio 1.0
- Adoption requires every selection, quantization, sealed-holdout, general/opening-retention, known-`P*8f`-regression, 384-game paired-A/B, and production-browser gate. Production still runs runOp1

---

## 0. What this report is allowed to call a “result”

To keep an expectation in progress from turning into a completed result, I use four states.

- **Confirmed**: a fact backed by saved bytes, a hash, a checkpoint line, or a reproducing test
- **In progress**: a process is running with fixed inputs and contract, but its commit-marker manifest does not exist yet
- **Preregistered**: a selection rule or passing condition fixed before seeing the result
- **Not run**: training, holdout opening, A/B, browser adoption, or another stage with no result yet

Under this vocabulary, “the 600-second depth-18 run stopped after 393 parents,” “Lane A selected depth 16,” and “the fresh depth-16 full teacher accounted for all 3,112 entries” are confirmed. “We will run six series” is preregistered; “warm won” is not run.

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

| Item | Fixed value |
|---|---|
| teacher pipeline source revision | `8e376e887fac19fb31c07f147e17e84b1d5fc4b2` |
| WCSC36 raw parent JSONL SHA-256 | `827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa` |
| YaneuraOu engine SHA-256 | `1e4971493f049f1c7d72a7e12555c3c2a3c2233f65a506eecb8ed7136bcdc5d1` |
| eval-tree SHA-256 | `639397609565fc2f113242503483addaf812b39c43a4d813d51b9c68ca51d568` |
| stable runOp1 checkpoint SHA-256 | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8` |
| legacy replay source SHA-256 | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb` |

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

The final contract is fixed depth 16, proposal MultiPV 12, 12 engines, 64 MiB Hash, and 600 seconds per search. At 2026-07-10 16:37:45 UTC, a fresh full run started from parent zero at clean revision `8e376e887fac19fb31c07f147e17e84b1d5fc4b2`, in `ml/data/wcsc36/full-depth16-v6-8e376e8/`, and exited 0 after 5,354.31 seconds. Its manifest completely accounts for 3,112 selected entries as 3,106 completed / 6 skipped, with 36,365 candidate records, 21 train games / 7 validation games, and zero overlap. Train has 23,813 rows, 20,286,990 bytes, SHA-256 `909f12a503c240b5bf73bc3f7552d1df525531fc7b2b1b6e1dce2fdef70ad70a`; validation has 8,761 rows, 7,422,900 bytes, SHA-256 `5a2435df0c995a325ed3b4584355aa716dd1c91af7e3099413bb34f99e9ac401`; work has 43,197,235 bytes, SHA-256 `f183d40326192813070b17a963b489776c62c3bad4c9223f840ecb371b21fec5`; and the 4,895-byte manifest SHA-256 is `3381e238d722751a73f50e3e89c332ce7344e443e588ea061946cec4e2d4cecc`. The role audit completed without publication; partition artifacts and training have not run, and production weights remain unchanged.

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

Before labeling, raw parent occurrences are assigned as follows.

| Role | Games | Raw parents | Use |
|---|---:|---:|---|
| model-training source | 21 | `TBD` (partition publish) | passed to warm/scratch after Lane A and semantic exclusion |
| model selection | 4 | `TBD` (partition publish) | used for epoch/checkpoint/series selection |
| final holdout | 3 | `TBD` (partition publish) | evaluated only after a candidate receipt |
| validation total | 7 | fixed by the full manifest; role counts await publish | four + three games |

Game assignment uses no cp or rank, only game ID and the fixed depth-16 hash. The old depth-18-seed 416 / 339-parent split and the table assigning only 100 pilot parents as 70 / 15 / 15 parents and 830 / 180 / 180 rows are diagnostic history, not current role accounting. Lane A includes the depth-selection pilot plus hard-case, repeat, and node-policy diagnostics spread across all 28 games, so the holdout cannot honestly be called “opened for the first time” or game-level untouched.

The current tracked receipt unions every committed Lane A artifact: 102 parent IDs and 1,392 semantic IDs from `position_id ∪ child_position_id`. Two sorted, unique, LF-terminated ID files and the receipt itself are separately SHA-256-bound. A whole sibling group is removed from training, selection, or holdout if either its parent ID or any position/child ID touches that receipt. At a clean HEAD, `--audit-policy-exposure` published no artifact and exited 2 with 307 parents / 3,642 rows for training, 64 / 762 for selection, 49 / 588 for holdout, and seven unmatched parent IDs. Those values are now pinned in the receipt (4,111 bytes; SHA-256 `083a86e48f1af134b854cdf0e505f0f39cc55ef75d5cbbc0df47c3e1c5013a6f`) and the TypeScript/Python contracts. The defensible guarantee is only an **exact-row seal since PR4A**—not a holdout independent of teacher construction.

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

There are exactly six planned runs.

| Series | Initialization | Seeds | Learning rate | Epochs | Replay limit / ratio |
|---|---|---|---:|---:|---:|
| warm | runOp1 model only | 42, 43, 44 | `1e-4` | 20 | 500,000 / 1.0 |
| scratch | fresh | 42, 43, 44 | `1e-3` | 40 | 500,000 / 1.0 |

Every checkpoint carries a `shogi-sibling-training-experiment-v1` receipt, and the following values are checked exactly. `--select-metric sibling-pair` is explicit; `auto` is rejected for this experiment. The device is also fixed explicitly as `--device cpu`.

Before freezing that choice, I ran the same 42-row, batch-256, seed-42, one-epoch smoke twice on each path. CPU took real `0.94s` / `1.06s` (mean `1.00s`) with no warning. Native MPS failed immediately because PyTorch `2.3.0` does not implement DistillNet's `aten::_embedding_bag` path. With `PYTORCH_ENABLE_MPS_FALLBACK=1`, the run completed and printed metrics identical to CPU, but took `1.65s` / `1.19s` (mean `1.42s`, `+42%`) and emitted a fallback warning every time. The tracked `shogi-sibling-six-run-plan-v1` therefore pins platform, system, machine, processor, CPU model, logical CPU count, Python, PyTorch, and CPU device for all six runs. Every process fixes two intra-op threads, one inter-op thread, deterministic algorithms, and deterministic debug mode `error`. A null/TBD binding, unpinned plan hash, or dirty/untracked plan prevents training from starting.

The plan deliberately contains no `training_pipeline_revision`. The plan is committed first and its byte SHA-256 is pinned by a constant in a later commit; embedding that future commit hash inside the plan would create an impossible self-reference. At execution, the code separately verifies the sealed plan hash and tracked/unmodified file, then requires the whole worktree to be clean with `HEAD == --pipeline-revision`. That execution HEAD is recorded in every checkpoint and the completed result marker. Separating the plan seal from the execution-code receipt does not make either optional.

| Common argument / identity | Fixed value |
|---|---|
| loss / features / batch | `sibling-ranking` / `board` / `256` |
| sigmoid K / cp clamp | `600.0` / `3000` |
| rank weight / pair min / pair max / margin | `1.0` / `50.0` / `600.0` / `50.0cp` |
| policy weight / temperature | `0.25` / `200.0cp` |
| selection | CLI and resolved value are both `"sibling-pair"` |
| primary limit / device | `0` (all rows) / `cpu` |
| common runtime | exact hardware/OS/Python/PyTorch/`cpu`; per process: two intra-op threads, one inter-op thread, deterministic debug `error` |
| replay | required, limit `500000`, ratio `1.0` |
| replay source SHA-256 | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb` |
| warm initializer SHA-256 | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8` |
| warm legacy flag | `true`; safely load model weights only, with fresh optimizer/scheduler |
| scratch initializer / legacy flag | none / `false` |
| teacher / partition / filtered-data hashes | teacher manifest `3381e238…` confirmed; partition / filtered datasets remain `TBD` |

Warm accepts only seeds 42/43/44, `lr=1e-4`, and 20 epochs. Scratch accepts the same three seeds, `lr=1e-3`, and 40 epochs. Six parallel processes therefore have exactly 12 intra-op slots and no hidden inter-op fan-out. The plan fixes six repository-relative output slots and refuses an existing directory. Only a completed run atomically writes `shogi-sibling-training-result-v1` last, binding every checkpoint, `curve.csv`, pipeline revision, and deterministic runtime receipt; a crashed directory has no selectable result marker.

There will be no fourth seed, alternative learning rate, or extra epoch schedule added after looking at results. A new setting requires a new preregistered experiment and cannot reuse this final holdout as if untouched.

Representative selection uses only int16 model-selection metrics. Within each series, its three seed checkpoints are ordered by this lexicographic tuple, and the median-ranked seed becomes the series representative.

1. Within-parent pair accuracy: higher
2. Teacher top-1 accuracy: higher
3. Value MAE: lower

The warm and scratch representatives are compared by the same ordering to produce one candidate. This selects a real median-seed checkpoint rather than inventing an averaged checkpoint.
If all three metrics tie exactly, the only fallback is **series (warm before scratch), seed (42 before 43 before 44), then checkpoint SHA-256 in bytewise ascending order**.

---

## 6. Freeze the candidate hash, then open the holdout once

At model-selection completion, at least these identities are saved:

- Checkpoint bytes / SHA-256
- int16 export bytes / SHA-256
- Series, seed, epoch, and complete training arguments
- Teacher-manifest and partition-manifest SHA-256
- Model-selection report bytes / SHA-256
- Exact six result identities (three warm + three scratch) and run-plan SHA-256

Only after that candidate identity is immutable are stable runOp1 and candidate evaluated together on the final-holdout JSONL, once. The common schema and strict decoder are preregistered here, but until a separate PR produces the actual receipt and connects it to evaluation and the match gate, the evaluator explicitly rejects the `final-holdout` role. This PR does not open it; receipt hashes and results remain `TBD`.

The future `shogi-sibling-candidate-selection-receipt-v1` exactly lists each of six runs' result marker, checkpoint, int16 export bytes/SHA/bucket count, and int16 selection-report identity, plus the median-ranked-seed strategy, selection metrics and tie-break, selected series/seed/checkpoint, and run-plan SHA. The match gate verifies that the supplied candidate equals the selected export and differs from stable. A failed holdout still cannot move back one epoch, switch series, or tune learning rate.

---

## 7. Adoption gates — numbers fixed before results

### 7.1 Model selection and quantization

| Gate | Required condition |
|---|---|
| selection int16 pair accuracy | **greater than stable** |
| selection int16 top-1 | **at least stable** |
| float → int16 pair degradation | at most 0.2 percentage points (absolute `0.002`) |
| float → int16 top-1 degradation | at most 0.5 percentage points (absolute `0.005`) |

Value MAE breaks ties between representative candidates; it cannot compensate for a failed pair/top-1 gate.

### 7.2 Exact-row sealed since PR4A final holdout (evaluation currently disabled)

Only after candidate-selection receipt support lands must the int16 candidate satisfy **both** conditions against stable:

- Within-parent pair accuracy at least stable
- Teacher top-1 accuracy at least stable

Failure on either is failure. Holdout metrics never flow backward into series or epoch selection.

### 7.3 General / opening retention

The existing general holdout and opening holdout are each measured under the same conditions as stable. Every condition must pass on each dataset.

| Metric | Retention floor |
|---|---|
| value MAE | `candidate ≤ stable × 1.05` |
| pair accuracy | `candidate ≥ stable - 0.005` |
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

| Stage | State | Current evidence / unresolved output |
|---|---|---|
| full attempt 1, timeout 120s | **Confirmed, rejected** | stopped after 215 parents; never resumed as another condition |
| difficult-parent runtime diagnostic 1 | **Confirmed** | 12 siblings, 188.52 seconds; label scores unused for selection |
| full attempt 2, timeout 600s | **Confirmed, rejected** | stopped on another heavy parent after 393 parents |
| isolated heavy-parent diagnostic | **Confirmed** | eight siblings took 1,693.48 seconds inside a 3,600s ceiling; not a full run |
| training-device smoke | **Confirmed** | CPU mean 1.00s; native MPS failed immediately; fallback mean 1.42s (+42%) with warnings every run; sealed device is `cpu` |
| Lane A teacher-policy comparison | **Confirmed** | selected fixed depth 16; n=100 ordinary-cp median 29 / p90 125.3, all-pair reversal 0.1462%, depth-18 node ratio 2.4713× |
| fresh final-policy full teacher | **Confirmed, complete** | exit 0 after 5,354.31s; 3,112 selected = 3,106 completed + 6 skipped, 36,365 candidates, 21/7 games, zero overlap |
| full teacher manifest / train / val / work hashes | **Confirmed** | manifest `3381e238…` / train `909f12a5…` / val `5a2435df…` / work `f183d403…`; bytes and row counts recorded above |
| sealed partition manifest / five artifact hashes | **Not run** | `TBD` — run after full-manifest completion |
| policy-exposure receipt | **Audited and pinned** | 102 parent / 1,392 semantic IDs; removals are training 307 parents/3,642 rows, selection 64/762, holdout 49/588, unmatched 7 |
| model-training cross-semantic isolation | **Implemented and tested** | after Lane A exposure exclusion, evaluation union wins, whole-parent drop, 21 games required |
| external high-dan calibration | **Plan only; not authorized** | confirmed 81Dojo COM-account / official-app constraints; candidate/time control/pairing/minimum games/stability rule must be frozen before play |
| warm seeds 42/43/44 | **Not run** | `TBD` checkpoint/report hashes |
| scratch seeds 42/43/44 | **Not run** | `TBD` checkpoint/report hashes |
| frozen candidate | **Not selected** | `TBD` checkpoint/export SHA-256 |
| exact-row final holdout | **Unopened; rejected in code** | disabled until candidate-selection receipt PR; hash/result `TBD` |
| general / opening retention | **Not run** | compare three preregistered metrics with stable |
| `P*8f` regression suite | **Not run** | static, depth 11/12, and nine timed runs |
| paired A/B | **Not run** | 384 games / 192 color-swapped pairs |
| production browser | **Not run** | exact hash, Worker/WASM, legal/error/time checks |
| production promotion | **Not run** | keep runOp1; separate PR only if every gate passes |

The remaining `TBD` entries mean neither zero nor secret. They mean the later stage has no manifest-committed result yet. Completion updates this table with bytes, hashes, denominators, and intervals.

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
- Holdout labels were removed from training, and final-holdout evaluation is disabled until candidate-selection receipt support exists
- The number of warm/scratch trials, median candidate, and numeric gates were fixed first

None proves stronger play. They do make it harder to excuse a weaker model with an aggregate metric or a tiny match.

The next update may report partition hashes, six training curves, candidate-selection receipt, frozen candidate, exact-row holdout, retention, known regression, the 384-game interval, and browser evidence. Until every item exists and every gate passes, production remains on runOp1.
