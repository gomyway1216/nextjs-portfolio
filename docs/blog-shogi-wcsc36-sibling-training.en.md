# Do Not Treat Strong Games as Ground Truth — Rebuilding the WCSC36 Sibling Teacher

> After the `deep16` evaluation regression, we turned “learn again from strong games” into an experiment that cannot silently replace production. Along the way, real-engine tests showed that rescoring a candidate set in one `searchmoves` call was itself sensitive to the candidates' input order. We discarded those labels and rebuilt the pipeline around a v6 one-candidate-at-a-time contract, reproducible provenance, and non-destructive training. This is a ledger of that investigation and its intermediate data, not an announcement of improved playing strength.

---

## TL;DR

- The first position source is the [official WCSC36 game-record release](https://www.computer-shogi.org/kifu/kifu.html), whose reuse terms are explicit. All 28 final games passed legal-move resolution, with zero rejections, and yielded 3,112 parent positions from plies 8 through 120
- A played move supplies a strong position distribution and one candidate; it is not unquestioned truth. The played move and teacher MultiPV moves form a candidate set, and learning compares only siblings from the same parent
- The v1–v3 “rescore every candidate in one joint `searchmoves` search” method was invalid. Merely reordering an unchanged candidate set changed the best move, ranks, and cp, so those labels cannot be used for training
- v4 moved to independent candidate searches, but predates the final mate, provenance, and publication contracts. Every v1–v4 artifact is **diagnostic only**, not training input
- Current v6 resets search state with `isready` before every candidate and evaluates it with `MultiPV=1` and `searchmoves <one move>`. Execution order is ascending UTF-8 bytes; synthesized rank is cp descending, then move UTF-8 bytes ascending
- Mate scores occupy a `±1,000,000` band that cannot collide with ordinary cp. Finishing below the requested depth is allowed only when the final update of a single-candidate search is an exact mate
- An engine receipt, eval hashes, a clean Git revision, a read-only runtime snapshot, a private working directory, and train/validation hashes are bound by one manifest. The trainer rejects data without that manifest
- The depth-14 versus depth-16 100-parent v6 pilot measured 62% rank-1 agreement and 83.013% candidate Jaccard. With 200 cp as the tie threshold, relation agreement over all 5,342 common pairs was 91.01% (including 3,643 pairs tied at both depths), while orientation agreement among the 1,227 pairs decisive at both depths was 99.35%. It predates the clean-pipeline manifest and cannot be used for training. Training, quantization, match play, and any strength gain are not results yet
- A fresh 100-parent depth-16/depth-18 pilot from a clean revision also passed every preregistered gate: 68% top-1-set overlap, 29 cp median and 125.3 cp p90 ordinary-cp difference, 0.146% all-pair reversal at the 200 cp threshold, and 2.471 times the nodes at depth 18. The full labeling depth is now preregistered as 18

---

## 0. How to read the evidence

To keep expected outcomes separate from measured ones, this log uses explicit states.

- **Confirmed**: checked against saved bytes, checksums, parser output, or tests
- **Diagnostic only**: useful for finding a cause, but ineligible for training under the current contract
- **Designed and implemented**: code and contracts exist, but no clean full run has produced a result yet
- **Not run**: training, export, search regression, match play, or another stage has no result yet
- **Adoption condition**: a pass/fail rule fixed before looking at the result

“Imported 3,112 parents,” “generated teacher data,” “improved validation,” and “became stronger in play” are four different claims. This article does not collapse those boundaries.

---

## 1. Why WCSC36 is the first position source

The [Computer Shogi Association game archive](https://www.computer-shogi.org/kifu/kifu.html) permits use of its records and asks articles to identify the programs, date, event, or source. We made those terms part of the data provenance.

| Field | Preserved value |
|---|---|
| Event | 36th World Computer Shogi Championship, final |
| Date | May 5, 2026; CSA start times range from 09:30:50 to 16:10:25 |
| Programs | 氷彗 (Hisui), Ryfamate, dlshogi, 奏乗 (Sojo), 水匠 (Suisho), 六角堂狸 (Rokkakudo Tanuki), ponkotsu, AobaZero |
| Sources | [CSA game archive](https://www.computer-shogi.org/kifu/kifu.html), [WCSC36 final results](https://www.computer-shogi.org/live/wcsc36/final.html) |
| Original archive | [wcsc36_kifu.zip](https://www.computer-shogi.org/kifu/wcsc36_kifu.zip) |

The official ZIP contains 295 games. This first experiment uses only the 28 final-stage files prefixed `F`, a complete round robin among eight programs. The final is not the only “correct” source; it is a small official corpus whose provenance and boundary can be pinned by hash and audited from parser through training.

---

## 2. Pinning the original bytes and importing CSA

| Field | Confirmed value |
|---|---:|
| ZIP bytes | 1,421,658 |
| ZIP SHA-256 | `48ece58b091dbb4df41e6fb55b73600767f77f4c9ee9ff8360474d5b75bb2631` |
| All CSA / final CSA | 295 / 28 |
| Total moves in final games | 5,242 |
| Accepted / rejected games | 28 / 0 |
| Parent occurrences (zero-based plies 8–120) | 3,112 |
| Record-set SHA-256 | `bdb7b19bfb236622ed6e1577631853aea1737d48bb1393c67c06135edbdc37b1` |
| Parent JSONL SHA-256 | `827e912032feac9fd539af58a0e35c1131a1228abedcb1bca9c5f51f214bdfaa` |

CSA includes SHIFT_JIS text, comma-separated statements, comments, and terminal markers. The importer does not rely on text substitution. It resolves every move against legal moves at that position and matches side to move, source and destination, piece type, promotion, and drops from hand. By default, one invalid file prevents publication of the entire dataset.

```bash
mkdir -p ml/data/wcsc36/extracted
curl --fail --location \
  https://www.computer-shogi.org/kifu/wcsc36_kifu.zip \
  --output ml/data/wcsc36/wcsc36_kifu.zip
openssl dgst -sha256 ml/data/wcsc36/wcsc36_kifu.zip
unzip -q ml/data/wcsc36/wcsc36_kifu.zip \
  'wcsc36_kifu/WCSC36-F*.csa' \
  -d ml/data/wcsc36/extracted

node -r tsx/cjs ml/import-csa-games.ts \
  --csa-dir ml/data/wcsc36/extracted/wcsc36_kifu \
  --source wcsc \
  --source-url https://www.computer-shogi.org/kifu/wcsc36_kifu.zip \
  --archive-sha256 48ece58b091dbb4df41e6fb55b73600767f77f4c9ee9ff8360474d5b75bb2631 \
  --archive-file ml/data/wcsc36/wcsc36_kifu.zip \
  --out ml/data/wcsc36/parents.raw.jsonl \
  --report ml/data/wcsc36/import-report.json \
  --min-ply 8 --max-ply 120
```

These 3,112 rows are raw parent positions and played moves. They do not yet contain teacher cp labels.

---

## 3. Labels we discarded, and why

### 3.1 A joint `searchmoves` call did not create equal conditions

The initial design merged the played move with MultiPV moves and passed the full set to one `go depth N searchmoves ...` call. We assumed that one search meant one common condition. Real-engine tests disproved that assumption: for the same parent, candidate set, depth, and reset, changing only argument order changed the result.

At problematic parent `02af34…`, the joint search over 13 candidates changed its leader as follows.

| Input order to `searchmoves` | Joint-search best |
|---|---|
| Proposal order | `4b4a`, -46 cp |
| Ascending UTF-8 bytes | `6b5b`, -11 cp |
| Reverse order | `6b6a` / `8a7a` tied at -36 cp |

Searching one candidate at a time scored `4b4a` at -31 cp. Reversing the execution order of those independent searches produced byte-identical cp and node counts for every candidate. On this parent, independent searches consumed 1,640,405 nodes in about 4.8 seconds, approximately 1.51 times the joint search. At another parent, `00064f…`, the best move stayed the same while score magnitudes and lower ranks changed.

The experiment and source inspection agree: this YaneuraOu build preserved the caller's `searchmoves` order in its root-move list. Finite search allows that order to influence search history and resource allocation. Putting moves into one search therefore did not evaluate them independently of ordering.

We do not train on v1–v3 labels produced by joint `searchmoves`. They remain only as forensic evidence.

The discarded scale is worth recording. The full v1 run completed 3,106 of 3,112 input parents, skipped six with fewer than two legal moves, and produced 36,387 candidate rows. Volume cannot repair an invalid teacher condition, so every one of those rows is non-training data.

### 3.2 v4 remains diagnostic too

v4 switched to independent searches and confirmed that the joint-search ordering effect could be removed. It still predates the final-mate exception, complete runtime provenance, and atomic manifest boundary described below. v4, like v1–v3, is therefore **diagnostic only** and cannot enter training. The intermediate v5 contract is not adopted either. Section 4 records depth sensitivity separately from a pilot using the near-current v6 search policy.

### 3.3 The old mate mapping also inverted ranks

An early version mapped mate around `±30,000` cp. Ordinary real-engine scores reached -35,281, so the bands collided and eight pairs were inverted. v6 restricts ordinary scores to `|cp| ≤ 900,000` and maps mate to `sign × (1,000,000 - distance)`. It also preserves the protocol sign of `mate -0` from the original token.

---

## 4. The current v6 labeling contract

For each parent, the generator now does the following.

1. Reset search state with `isready`, then run MultiPV to propose a candidate set
2. Add the played move if absent, and validate legality and uniqueness
3. Sort candidates by ascending UTF-8 bytes to fix execution order
4. Reset search state with `isready` **before every candidate**
5. Search with `MultiPV=1`, `searchmoves <that one move>`, and the same requested limit
6. Accept exact scores only, then synthesize rank by cp descending and move UTF-8 bytes ascending as the tie-break
7. Record requested limit, actual depth, nodes, and cp/mate metadata for every candidate

```text
WCSC36 parent
  ├─ played move
  └─ proposal MultiPV
         ↓ legality and duplicate checks
    bytewise candidate set
         ↓ one candidate per reset + MultiPV=1 + one searchmove
    independent exact scores
         ↓ cp descending + bytewise tie-break
    sibling rank and child-position value
```

The proposal search must reach the requested depth. Only a one-candidate search may finish early, and only when its final accepted update is an exact mate with no later cp, bound, unexpected rank, or shallower update. In a depth-18 smoke run, move `5h4h` at parent `009fde…` correctly finished at depth 16 as `mate -4`, -999,996 cp, and 1,215 nodes. This narrow exception keeps a forced move from being mislabeled as incomplete; it does not permit ordinary shallow results.

Fixed-node attempts that mixed depths across ranks or produced bound scores failed closed. v6 also stops on bounds, missing or unexpected ranks, stale nodes, malformed `multipv`, or disagreement between `bestmove` and the final PV1 instead of turning any of them into a label.

### Current state of the 100-parent v6 pilots

Depth 14 and depth 16 completed over the same first 100 parents. Their counts are as follows.

| Pilot | Candidate rows before split | Train rows | Validation rows | Leakage removal |
|---|---:|---:|---:|---:|
| Depth 14 | 1,191 | 819 | 360 | 12 rows / 1 parent |
| Depth 16 | 1,190 | 818 | 360 | 12 rows / 1 parent |

Both began with 100 parents and ended with 99: 69 train parents and 30 validation parents, with zero game, parent-position, or child-position overlap. The depth-14 to depth-16 comparison over those same 100 parents produced the following diagnostics.

The depth-stability gate was fixed before reading the result: top-1-set overlap at least 55%; ordinary-cp absolute-difference median at most 35 cp, p90 at most 160 cp, and 5% trimmed mean at most 70 cp; at a 200 cp tie threshold, all-pair relation agreement at least 90%, both-decisive orientation agreement at least 98%, all-pair reversal at most 0.5%, and baseline decisive retention at least 80%; and at a 400 cp tie threshold, all-pair reversal at most 0.1%. Counts are reported below so denominators cannot be swapped after the fact.

| Metric (depth 14 → 16, n=100 parents) | Diagnostic value |
|---|---:|
| Rank-1 agreement / top-1-set overlap | 62% / 63% |
| Exact candidate-set match / micro Jaccard | 29% / 83.013% |
| Ordinary-cp pairs | 1,068 |
| Mean absolute / median ordinary-cp difference | 56.12 / 29 cp |
| Ordinary-cp difference p90 / p95 / 5% trimmed mean | 131.6 / 202 / 43.99 cp |
| Relation agreement across all common pairs with a 200 cp tie threshold | 4,862 / 5,342 = 91.01% (includes 3,643 both-ties) |
| Orientation agreement / reversal among pairs decisive at both depths at 200 cp | 1,219 / 1,227 = 99.35% / 8 / 1,227 = 0.652% |
| 200 cp reversal using all common pairs as denominator | 8 / 5,342 = 0.150% |
| Baseline decisive retention | 1,227 / 1,443 = 85.03% |
| Reversal among pairs decisive at both depths at 400 cp | 2 / 698 = 0.287% (0.037% of all 5,342 pairs) |
| Played move was top-1 | 57% → 55% |
| Observed nodes | 472,801,354 → 1,331,739,463 (2.817×) |

A preliminary depth-16 to depth-18 comparison covers only 20 parents. It measured 95% top-1-set overlap, a 31 cp median ordinary-cp difference, 98.4 cp p90, and a 38.67 cp 5% trimmed mean. With a 200 cp tie threshold, relation agreement was 1,029 / 1,106 = 93.04%, including 825 both-ties. Among the 206 pairs decisive at both depths, 204 / 206 = 99.03% kept their orientation and 2 / 206 = 0.971% reversed; using all 1,106 pairs as denominator gives the separate 0.181% reversal rate. Nodes rose from 268,157,536 to 660,586,146 (2.463×). One search requested depth 18 and correctly ended at actual depth 16 on a terminal exact mate. With n=20, these are reference values rather than sufficient evidence to select a depth.

The depth-14/depth-16 runs and the 20-parent depth-16/depth-18 run above are useful, but they predate mandatory clean pipeline revision and runtime-snapshot fields. They are **pre-pipeline diagnostics**, not training data.

### Depth 16 to depth 18 over 100 parents from a clean pipeline

After committing the implementation and article, we freshly generated 100 parents at each depth from clean revision `debb8b6b02b8a4d2f76d3c19522fd5c00c2ce883`. The Python consumer also verified each manifest through the train/validation bytes. The depth-16 manifest SHA-256 is `7dd47f21f8207a933670248ac4d2721962d570d0a08f8606fcf40429815f887f`; depth 18 is `7214f4bc634348a36658d0bca2075cb4f6f44319791022f591403f7c60147030`.

| Metric (depth 16 → 18, n=100 parents) | Clean-pipeline diagnostic |
|---|---:|
| Rank-1 agreement / top-1-set overlap | 67% / 68% |
| Exact candidate-set match / micro Jaccard | 31% / 84.926% |
| Ordinary-cp pairs | 1,080 |
| Ordinary-cp difference median / p90 / p95 / 5% trimmed mean | 29 / 125.3 / 193.2 / 41.69 cp |
| Relation agreement across all common pairs with a 200 cp tie threshold | 5,050 / 5,473 = 92.27% (includes 3,762 both-ties) |
| Orientation agreement / reversal among pairs decisive at both depths at 200 cp | 1,288 / 1,296 = 99.38% / 8 / 1,296 = 0.617% |
| 200 cp reversal using all common pairs as denominator | 8 / 5,473 = 0.146% |
| Baseline decisive retention | 1,296 / 1,474 = 87.92% |
| Reversal among pairs decisive at both depths at 400 cp | 1 / 750 = 0.133% (0.018% of all 5,473 pairs) |
| Played move was top-1 | 55% → 54% |
| Observed nodes | 1,331,739,463 → 3,291,077,196 (2.471×) |

The mean absolute ordinary-cp difference is 173.71 cp, but it is dominated by four candidates from the same parent at ply 118 that moved from roughly 2,900 cp to 35,281 cp. All four remained below numerous mate candidates at ranks 9–12. The preregistered gate therefore uses the robust median, p90, and trimmed mean. Depth 18 also exercised the narrow early-completion contract once: a terminal exact mate completed at actual depth 16 against requested depth 18.

Every preregistered gate passed. We therefore accept the extra compute cost in favor of the deeper teacher and **fix full-run `LABEL_DEPTH` at 18**. The pilot artifact bytes will not be reused as training input; all 3,112 parents will be regenerated to separate outputs from the clean post-merge revision. The same source positions include those first 100, but they will be searched and verified again under the post-merge contract.

---

## 5. Provenance that freezes runtime bytes, not just startup hashes

Reading hashes at startup is insufficient for a long run. If a binary or eval file changes midway, one JSONL can silently mix two teachers. The current generator enforces the following contract.

- **Engine receipt**: records source repository and commit, build command, compiler, engine ID, binary size, and binary hash, then checks the actual executable against it
- **Clean pipeline revision**: `--pipeline-revision` must equal the full 40-digit Git HEAD. Staged, unstaged, or non-ignored untracked changes prevent startup, and the revision is checked again before publication
- **Protected output paths**: train, validation, manifest, and work paths may not alias one another, protected inputs through hardlinks or symlinks, or Git-tracked paths. In-repository outputs must be Git-ignored
- **Runtime snapshot**: the verified engine binary, file-valued engine arguments, and eval tree are copied to a private temporary directory, verified again after copying, and stripped of write bits. Workers use only these read-only copies and a private working directory, never the mutable originals
- **Fixed options**: Threads 1, no book, zero network delay, and `isready` before each search are both executed and recorded. An eval tree containing `eval_options.txt` is rejected because it could override fixed options
- **Resume binding**: the work checkpoint is fingerprinted to raw data, selected parents, policy, pipeline revision, engine/eval bytes, and search conditions. Every completed parent is `datasync`ed and cannot be resumed under another run contract

Only after every label and split passes validation does the generator atomically rename train and validation outputs and atomically write a manifest containing both byte counts and hashes. The manifest is the commit marker. A train file left behind without that manifest is not accepted. Trainer and evaluator verify the manifest first and bind both train and validation size/SHA-256 values before parsing JSONL.

---

## 6. Split boundaries and score perspective

One row represents one candidate, and `parent_id` groups siblings. A USI root score is from the parent side to move, while the model input is the child position after side-to-move flips. We therefore store `teacher_child_cp = -teacher_parent_cp`, and the trainer rechecks that relationship.

Rows are not shuffled into splits. With seed `42` and validation ratio `0.2`, each whole game and all of its parents and candidates go to one side. Before labeling, the 3,112 raw parents split into 21 train games with 2,357 parents and seven validation games with 755 parents. If the same parent `position_id` or child `child_position_id` appears on both sides after labeling, validation wins and the affected train parent is removed as a whole.

This prevents a parent's best move from entering train while its second-best move appears in validation. But 28 games remain small, and once the same validation set selects epochs or compares warm start against scratch, it is **model-selection validation**, not a final holdout. Adoption still needs a separate fixed holdout never used to choose a model, known-regression positions, post-quantization search checks, and an adequately sized A/B match.

---

## 7. Reproduction command

The clean 100-parent gate above preregistered the full labeling depth as 18. It will not be changed after seeing later results.

```bash
readonly LABEL_DEPTH=18

node -r tsx/cjs ml/generate-sibling-teacher.ts \
  --raw ml/data/wcsc36/parents.raw.jsonl \
  --engine-bin ml/bin/yaneuraou \
  --engine-receipt ml/engine-receipts/yaneuraou-9133c527-applem1.json \
  --eval-dir ml/eval/eval \
  --pipeline-revision "$(git rev-parse HEAD)" \
  --depth "$LABEL_DEPTH" --multipv 12 --engines 12 \
  --seed 42 --val-ratio 0.2 --hash-mb 64 \
  --out-train ml/data/wcsc36/siblings.train.jsonl \
  --out-val ml/data/wcsc36/siblings.val.jsonl \
  --manifest ml/data/wcsc36/sibling-manifest.json \
  --work ml/data/wcsc36/sibling-progress.jsonl
```

This command runs only from a clean worktree, writes to ignored `ml/data/`, and safely resumes when invoked again with the same contract.

---

## 8. Compare stable, warm start, and scratch; overwrite none

Training never writes directly to production `public/shogi-nnue-weights.bin`.

| Track | Initialization | Role |
|---|---|---|
| Stable | unchanged `runOp1` | production baseline and immediate rollback |
| Warm start | `runOp1` checkpoint | adapt existing value knowledge at a low learning rate |
| Scratch | random | control that does not inherit stable's internal biases |

Warm start loads model weights strictly and creates a fresh optimizer and scheduler. Legacy teacher data may be used as train-only replay against forgetting, but it never enters WCSC36 validation. Epoch 0 evaluates the initializer itself, so a fine-tuned checkpoint does not win merely because it is newer.

```bash
ml/venv/bin/python ml/train.py \
  --data ml/data/wcsc36/siblings.train.jsonl \
  --val-data ml/data/wcsc36/siblings.val.jsonl \
  --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
  --loss sibling-ranking --features board \
  --init-ckpt /absolute/path/to/runOp1/best.pt --allow-legacy-init \
  --replay-data /absolute/path/to/runOp1-train.jsonl \
  --replay-limit 500000 --replay-ratio 1.0 \
  --lr 1e-4 --epochs 20 --seed 42 \
  --out ml/runs/wcsc36-warm-seed42

ml/venv/bin/python ml/eval-sibling.py \
  --data ml/data/wcsc36/siblings.val.jsonl \
  --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
  --checkpoint stable=/absolute/path/to/runOp1/best.pt \
  --checkpoint warm=ml/runs/wcsc36-warm-seed42/best-sibling.pt \
  --json-out ml/data/wcsc36/sibling-eval.json
```

The scratch control removes `--init-ckpt` and `--allow-legacy-init` and uses a separate `--out`. A checkpoint claiming sibling-manifest provenance fails closed if its train/validation bytes, policy, or pipeline differs. The pre-manifest stable `runOp1` may be loaded only as the comparison baseline; the report marks it `legacy_unverified` rather than pretending it has provenance equivalent to a new checkpoint.

---

## 9. What the objective optimizes, and what must gate adoption

The objective combines sigmoid MSE for child-position value, pairwise ranking only within the same parent, and a listwise policy loss over that parent's candidates. `val_sibling_pair_acc` and `val_sibling_top1` are useful, but they remain model-selection validation metrics rather than playing strength.

| Gate | Passing principle |
|---|---|
| Provenance | source, archive, engine receipt, eval, pipeline revision, and manifest are complete |
| Data integrity | every move legal, sign consistent, at least two candidates per parent, no duplicates or game/position leakage |
| Model-selection validation | compare stable/warm/scratch and float/int16 on the same split; report the number of settings tried |
| Untouched holdout | verify value and sibling order on separate data unused for model, epoch, or hyperparameter selection |
| Stable retention | legacy-holdout MAE, sign, and decisive positions stay within a prespecified tolerance |
| Known regression | before ply 32, rank △P*8f below the stable good move |
| Search / quantization | avoid the known bad move at fixed depth and 800/2000/4000 ms, before and after export |
| Match play | use the production path and timing, enough games, and a prespecified non-inferiority interval |
| Live browser | on a non-book position, capture path, score, depth, timer, and console together |

An aggregate gain cannot excuse a known-regression failure. A higher validation top-1 cannot turn a set used for model selection into a “final holdout.” Production promotion is a separate PR only for an artifact that passes every gate.

---

## 10. What enters Git, and what does not

The WCSC36 ZIP/CSA, parent JSONL, teacher JSONL, engine binary, eval files, checkpoints, and exported weights stay under ignored locations such as `ml/data/` and are not committed. Git retains source URLs, original hashes, aggregate counts, generated-artifact hashes, the engine receipt, implementation, tests, and this report.

This separation is not meant to hide data. It avoids turning the repository into a binary mirror while preserving source terms and enough evidence to regenerate from the same official bytes and clean revision.

---

## 11. Current ledger

| Stage | State | Evidence / next output |
|---|---|---|
| Download and pin WCSC36 | **Confirmed** | 1,421,658 bytes and fixed ZIP SHA-256 |
| Parse 28 final CSA games | **Confirmed** | 28 accepted, zero rejected |
| Extract plies 8–120 | **Confirmed** | 3,112 parents and fixed JSONL SHA-256 |
| v1–v3 joint labels | **Diagnostic only, rejected** | `searchmoves` input order changed rank and cp |
| v4 independent labels | **Diagnostic only, rejected** | removed the joint ordering effect, but the contract was incomplete |
| v6 depth-14/16, 100 parents | **Diagnostic only** | 62% rank-1 agreement, 83.013% Jaccard, 2.817× node ratio |
| v6 depth-16/18, 20 parents | **Pre-pipeline preliminary diagnostic** | 95% top-1-set overlap, 2.463× node ratio; small n |
| v6 depth-16/18, 100 parents | **Clean-pipeline confirmed** | all preregistered gates passed, 68% top-1 overlap, 2.471× node ratio, full depth fixed at 18 |
| v6 generator contract | **Implemented** | independent search, mate band, receipt, clean revision, snapshot, atomic manifest |
| Full labels from a clean revision | **Not run** | preserve manifest, train/validation counts and hashes, comparison report |
| Warm start / scratch | **Not run** | preserve epoch 0, curves, checkpoint hashes, identical-validation comparison |
| Untouched holdout / export / search regression | **Not run** | separate model selection from final evaluation |
| Production-time A/B | **Not run** | report games, point estimate, interval, and non-inferiority decision |
| Production promotion | **Not run** | separate PR only after every gate passes |

---

## 12. Should strong-game training overwrite the current evaluation?

**No.** Strong games supply useful parent positions, but their played moves are candidates rather than absolute truth. An independent teacher search compares alternatives from the same parent. Stable stays intact while warm start and scratch compete, and old data is limited to train-only replay against forgetting.

The most important result so far is not a new weight file. It is the discovery that the old labels' supposed “common condition” actually depended on candidate order. Scaling training on those labels would only make the learner trust a broken teacher more strongly.

The next report must say more than “training completed.” It must state how many parents a clean revision labeled, how stable ranks were across depths, how warm start and scratch differed on both model-selection validation and an untouched holdout, how much legacy behavior and the known regression they retained, and whether post-quantization search and A/B passed. Only then can we decide whether the engine became stronger.
