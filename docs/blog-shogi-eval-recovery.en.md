# It Wasn't Repetition — Reproducing deep16's Real Regression and Rebuilding How Our Shogi AI Learns

> After replacing our shogi AI's `runOp1` evaluation with `deep16`, a live game showed it playing “△P*8f” over and over. I first blamed missing game-history repetition detection. Reading the game properly showed that the position changed every time. Holding the position and search engine fixed, then swapping only the old and new weights, produced a clean result: the new model ranked the move near the top and selected it at production-like search times; the old model did neither. This was not a cosmetic oddity. It was a reproducible evaluation regression. This post corrects the diagnosis, preserves the intermediate data, and redesigns the next learning cycle.

---

## TL;DR

- The “△P*8f” moves on plies 20, 26, and 32 do **not** repeat the same position. Sente's silver advances 3h→2g→2f, while Gote's rook also changes from 8d to 8e. The explanation that missing game history prevented repetition detection was therefore wrong for this incident
- In the position before ply 32, using the same WASM search and swapping only the weights, `runOp1` ranked △P*8f **16th of 46 legal moves (−194cp)** and chose △S-4b at fixed depths 11 and 12 and at both 2000ms and 4000ms. `deep16` ranked △P*8f **2nd of 46 (−23cp)** and chose **△P*8f** under every one of those conditions
- The adoption A/B was 40 games at 800ms: a 52.5% score with an approximately 37–68% 95% interval. That did not prove “no regression”; it was **too imprecise to decide either way**. The reported move also did not appear at 800ms in this spot check, but did appear at 2000ms and 4000ms
- The current pipeline saves YaneuraOu's `bestmove` in JSONL, then trains on only `SFEN` and `cp`. Its `pair_acc≈0.90` compares **random, unrelated positions**, not sibling moves from the same parent position
- The first step is to restore only the production weights to `runOp1`. The next dataset should draw parent positions from strong games, then have a strong teacher rescore a sibling set containing the played move, teacher MultiPV, the stable model's move, the candidate model's move, and known field failures
- We should not discard every position reached by our own engine. Its new role is DAgger-like error discovery: show us where the learner visits and fails, while the strong teacher still supplies the answers
- “The evaluation picks a bad move” and “the UI shows no score / the timer freezes” are separate workstreams. Fixing either one is not evidence that the other is fixed

---

## 0. Evidence labels used in this log

The most important mistake here was presenting a hypothesis as though it were established fact. This article separates claims into four classes:

- **Confirmed**: checked against the game, source code, saved logs, or a controlled reproduction
- **Refuted**: a reproduction or saved record shows that the claim does not hold
- **Hypothesis**: consistent with the confirmed evidence, but not isolated as the cause
- **Unverified**: reserved for a future experiment; an expectation is not written as a result

One limitation belongs up front. We have confirmed a **clear local regression by deep16 in the reported position**. We have not yet established that runOp1 has higher Elo averaged over every position. Still, when the adoption evidence was weak, a severe field regression is reproducible, and returning to the prior model is reversible, restoring the stable model is justified.

---

## 1. The incident: mistaking repeated notation for a repeated position

The live game sent by the owner included this sequence:

```text
19. ▲K-6h
20. △P*8f
21. ▲Px8f
22. △Rx8f
23. ▲P*8g
24. △R-8d
25. ▲S-2g
26. △P*8f
27. ▲Px8f
28. △Rx8f
29. ▲P*8g
30. △R-8e
31. ▲S-2f
32. △P*8f
33. ▲Px8f
34. △Rx8f
35. ▲P*8g
36. △R-8d
37. ▲S-2e
38. △B-3c
```

My first explanation was: “The engine receives only the current board, so repetition history resets on every move and it cannot recognize that it has returned to the same position.” That failure mode is possible in general. It did not explain this game.

| △P*8f ply | Sente silver | Gote rook before the move | Position |
|---:|---|---|---|
| 20 | 3h | 8d | First occurrence |
| 26 | 2g | 8d | Second occurrence |
| 32 | 2f | 8e | Third occurrence |

**Confirmed**: the silver advances and the rook changes squares. Because the board position is not identical, these three moves cannot be treated as repetitions of the same position. The problem was not repetition. It was **repeatedly overvaluing the same plan in positions that were changing slightly**.

That distinction determines the fix. Passing game history is useful for a real future repetition. It does not lower △P*8f's value while the board keeps changing. Adding a correct feature for the wrong diagnosis would leave the reported bad move intact.

---

## 2. A fixed comparison of the old and new evals before ply 32

Next we removed the UI, opening book, multithreading, and game history. We fixed the board immediately before ply 32, used the same production-family WASM search, and changed only the NNUE weights. We recorded both the one-ply static ranking of every legal child position and the best move under a time-limited search.

### Results

| Evaluation model | Static rank of △P*8f | Fixed depth 11 / 12 | 2000ms search | 4000ms search |
|---|---:|---|---|---|
| `runOp1` | 16th / 46 (−194cp) | △S-4b / △S-4b | △S-4b | △S-4b |
| `deep16` | **2nd / 46 (−23cp)** | **△P*8f / △P*8f** | **△P*8f** | **△P*8f** |

**Confirmed**: with no search-code change, swapping only the weights changes the move. `deep16` promotes △P*8f near the top before search begins, then selects it at fixed depths 11 and 12 and at both 2000ms and 4000ms. `runOp1` places it 16th and selects △S-4b under every condition.

The absolute cp numbers should not be read as ground-truth position evaluations. The relevant evidence is the **relative ranking under the two models, and the fact that the ranking propagated into the searched move**. For this position, we moved beyond “deep16 may have shifted the eval slightly” to a reproducible model-specific regression.

### Reproduction command outline

The parent of adoption commit `27041d3` contains runOp1; the commit itself contains deep16. The following extracts both artifacts and passes the first 31 plies in USI form to the existing spot-check tool:

```bash
git show 27041d3^:public/shogi-nnue-weights.bin > /tmp/runOp1.bin
git show 27041d3:public/shogi-nnue-weights.bin  > /tmp/deep16.bin

MOVES="2g2f 8c8d 2f2e 8d8e 6i7h 4a3b 2e2d 2c2d 2h2d P*2c 2d2h 8e8f 8g8f 8b8f P*8g 8f8d 3i3h 3c3d 5i6h P*8f 8g8f 8d8f P*8g 8f8d 3h2g P*8f 8g8f 8d8f P*8g 8f8e 2g2f"

node -r tsx/cjs wasm-spike/probe-nnue-position.ts \
  --weights /tmp/runOp1.bin \
  --weights /tmp/deep16.bin \
  --moves "$MOVES" --ms 2000 --depth 32 --top 46

node -r tsx/cjs wasm-spike/probe-nnue-position.ts \
  --weights /tmp/runOp1.bin \
  --weights /tmp/deep16.bin \
  --moves "$MOVES" --ms 4000 --depth 32 --top 46

node -r tsx/cjs wasm-spike/probe-nnue-position.ts \
  --weights /tmp/runOp1.bin \
  --weights /tmp/deep16.bin \
  --moves "$MOVES" --ms 0 --depth 11 --top 46
```

The tool bypasses the opening book and external mate routine and calls the production-family NNUE/WASM search directly. That makes it useful for isolating which weights promoted the move. Time-limited search depth can still vary with machine load, but `--ms 0 --depth 11` follows the same production-family path without a time cutoff. **Confirmed**: at both fixed depths 11 and 12, runOp1 chooses `3a4b` and deep16 chooses `P*8f`.

To keep this result from becoming a one-off log, the production asset is pinned to runOp1's SHA-256 `e4e738f99fbd8685bcfe2700e4df364af6274e75b44b298432fc313b9a3e28dc`, and a unit test asserts `3a4b` at fixed depth 11. Replacing the asset with deep16 makes that test choose `P*8f` and fail. The regression gate is therefore independent of machine speed.

---

## 3. Why the 800ms, 40-game A/B missed it

The adoption record for deep16 contained these numbers:

| Metric | runOp1 | deep16 |
|---|---:|---:|
| Holdout MAE | 476.1cp | 443.2cp |
| Holdout `pair_acc` | 0.9001 | 0.9031 |
| 800ms A/B, 40 games | — | 52.5% |
| A/B 95% interval | — | approximately 37–68% |

At the time, we read that as “slightly better calibration in a typical middlegame, tied A/B, therefore no regression.” The first clause was defensible with caveats. The second misread the statistics.

### 3.1 “Not significant” does not prove equivalence

**Confirmed**: the interval around 52.5% stretches from roughly 37% to 68%. With these 40 games, a substantially worse true strength and a substantially better one both remain plausible. We failed to detect a difference; we did not confirm the absence of regression.

To claim equivalence, we must choose an acceptable regression margin in advance and run enough games to exclude that margin. Treating any interval that crosses 50% as “safe” is not an adoption gate.

### 3.2 We tested the wrong time-control regime

**Confirmed**: in this reported position, △P*8f did not appear at 800ms but did appear at 2000ms and 4000ms. More time does not guarantee that a fixed eval produces a better move. As depth changes, the leaves influenced by the static eval, pruning decisions, move ordering, and principal variation can all change. A bias can become a root decision only at a deeper time regime.

Approving hard-level behavior from an 800ms match was therefore a test-design mismatch. Short matches remain useful for screening candidates, but cannot replace the production-time gate.

### 3.3 Aggregate win rate does not directly measure this failure mode

**Hypothesis**: the 40 starts and their continuations rarely reached positions where repeated pawn exchanges remained available while the board changed gradually. One aggregate score compresses every visited position into a single number; a low-frequency move can be devastating to human experience and still disappear in the average.

The answer is not to replace matches with position tests. Each has a different job. Position tests prevent known regressions from returning. A sufficiently powered production-time A/B estimates broad strength. Human live games discover failures outside the generated distribution. We need all three.

---

## 4. Reading the training pipeline showed that it never learns to imitate the strong move

The current generator does not use a weak evaluator for labels. YaneuraOu evaluates the sampled positions. The problem is **which positions we generate, what the teacher returns, and which part of that return reaches training**.

```text
Low-budget self-play by our engine
       + 20% random moves by default
                  │
                  ▼
            Parent-position SFEN
                  │
          YaneuraOu evaluates it
           save cp + bestmove
                  │
                  ▼
       train.py reads SFEN + cp only
                  │
                  ▼
       Small value net regresses one scalar
```

### 4.1 Our own engine determines the position distribution

The defaults in `ml/generate-teacher.ts` use our short-budget, depth-4 engine to choose moves and `epsilon=0.2` to choose a random legal move. YaneuraOu can attach a strong score afterward, but the generator still determines **which structures are common and which plans are rare**.

Random and post-blunder positions are not worthless. They matter when the engine must recover after leaving strong-game territory. The problem is allowing them to replace the primary distribution of subtle middlegame choices that strong engines actually face.

### 4.2 We save `bestmove`, then throw it away

Each generated JSONL record contains `{sfen, cp, ply, bestmove, depth}`. The loader in `ml/train.py` reads only `rec["sfen"]` and `rec["cp"]`. **Confirmed**: YaneuraOu's selected move never enters the current loss.

So this pipeline does not imitate “what the strong engine played here.” It asks a small `2282 → 256 → 32 → 1` network to approximate one scalar assigned to the whole position. That is a legitimate value-learning objective, but it is not the “learn to choose the move strong games choose” objective the owner expected.

### 4.3 `pair_acc≈0.90` is not 90% move-choice accuracy

`train.py` randomly samples two validation positions and checks whether their predicted ordering agrees when the teacher scores differ by more than 100cp. Even when ranking loss is enabled, pairs come from separate positions that happened to share a mini-batch.

**Confirmed**: there is no parent-position ID and no candidate-move grouping. A value of 0.9031 means the model ordered unrelated position A and position B like the teacher about 90% of the time under this sampling rule. It does not estimate the chance that the model ranks △S-4b above △P*8f at ply 32.

That is the metric-to-game disconnect. Search needs the fine ordering among similar child positions from one parent. The current metric can score well on large differences between entirely unrelated positions.

### 4.4 What created deep16's error?

- **Confirmed**: deep16 raised △P*8f sharply relative to runOp1 in the reported position
- **Confirmed**: deep16 improved aggregate holdout MAE relative to runOp1
- **Hypothesis**: deeper relabeling and the data mixture improved aggregate regression while damaging candidate ordering around this position
- **Hypothesis**: with a roughly 443cp MAE, this small net may struggle to preserve the narrow candidate differences that matter to search
- **Unverified**: which dataset component, loss term, or quantization effect contributed most to △P*8f's rise

Not having isolated a single root training cause does not negate the regression. The incident reproduction is complete; causal ablation is the next experiment.

---

## 5. Translating “learn from strong games” into data this search engine can use

The owner's proposal is directionally right: source the main parent positions from games that strong players or engines actually reached, not from a weak learner's unguided self-play. The [Floodgate public game archive](https://wdoor.c.u-tokyo.ac.jp/shogi/x/), for example, exposes games by year.

But copying only the move recorded in a game gives one positive example per position. It does not tell us why the alternatives are worse or how large the gap is. The played move also reflects that game's time control and may not remain the top move under a deeper later analysis.

The game record should therefore improve the **quality of parent positions**, while we rebuild the move supervision at each parent.

### Sibling candidate data

For every parent position, include at least:

- the move played in the game
- YaneuraOu's best move and top MultiPV moves
- the move selected by stable runOp1
- the move selected by the new candidate model
- the move selected by deep16
- known field failures such as △P*8f
- tactical candidates such as checks, captures, and defensive replies when useful

Play each move to form a **child position** and evaluate every child under the same teacher settings. The data gains an explicit parent/child structure:

```json
{
  "parent_id": "game-id:ply-31",
  "parent_sfen": "...",
  "move": "P*8f",
  "child_sfen": "...",
  "sources": ["deep16", "field_failure"],
  "teacher_cp": -412,
  "teacher_rank": 9,
  "teacher_engine": "YaneuraOu+eval-id",
  "teacher_limit": { "depth": 18, "multipv": 12 }
}
```

The numbers above illustrate the schema; they are not a teacher score for the reported △P*8f. The important properties are grouping by `parent_id`, normalizing side-to-move perspective, and recording the teacher evaluation file and search limit.

Training can retain scalar value regression while adding pairwise or listwise ranking only within a shared `parent_id`. Validation must split by parent, so siblings from one position cannot leak across train and validation. The primary new metrics become sibling top-1 agreement, recall of teacher-top moves, and the rate at which known bad moves rank below the best move.

### A DAgger-like loop: make our engine the problem setter

Restricting everything to strong games creates another hole: after the AI makes one error and leaves the strong-game distribution, it may have no coverage. We should let each candidate play and collect the positions it actually visits—but give our engine a different role than before.

```text
Position reached by candidate model
        │
        ├─ Agrees with stable/teacher → low priority
        │
        └─ Move disagreement or eval collapse → high-priority sibling analysis
                                               │
                                               ▼
                                      Add to aggregated data
```

This follows the central idea of [DAgger](https://arxiv.org/abs/1011.0686): aggregate teacher labels on the state distribution induced by the learner itself. We do not copy our engine's move as truth. We ask our engine to submit the positions where it fails, then ask the strong teacher for the answers.

---

## 6. Do not overwrite: compare a stable model, a warm start, and a scratch model

We should stop writing a newly trained artifact directly over production. Each artifact needs an immutable name and metadata, and only a candidate that passes comparison should be promoted.

### The three recommended tracks

| Track | Initialization | Purpose |
|---|---|---|
| stable | `runOp1` | Immediate safe baseline and production rollback target |
| warm-start | `runOp1` | Preserve broad prior knowledge and adapt to sibling data at a low learning rate |
| scratch | random | Control for old biases inherited from runOp1 |

**Confirmed**: the current `train.py` constructs a fresh `DistillNet(...)` on every run and has no option to load a checkpoint as initialization. A warm-start track first requires an explicit `--init-checkpoint`-style feature.

We should not initialize from deep16 because the candidate ordering we need to repair is already encoded there. Enough counterexamples might correct it, but there is no reason to accept that extra risk when a stable predecessor exists.

Nor should we discard all old data. It provides replay coverage for endgames, lopsided positions, and recovery after bad moves. But its mixture ratio with new sibling data must be explicit, with separate validation reported per data source. Otherwise another aggregate improvement can hide another field-distribution regression.

---

## 7. Recovery plan and adoption gates

### Phase 0 — Stabilize

- Restore only the production NNUE weights from deep16 to runOp1
- Do not roll back the Improved search, UI, and opening book in the same change; vary one factor
- Preserve deep16's binary, metadata, and adoption logs as regression evidence
- Pin the production weight SHA-256 to runOp1 and freeze the position before ply 32 as a fixed-depth-11 regression fixture

### Phase 1 — Build the data foundation

- Import strong games and build deduplicated parent positions with `parent_id`
- Build sibling sets from played moves, MultiPV, runOp1, the new candidate, and field failures
- Persist legal-move validation, side-to-move perspective, teacher version, and search limits
- Decide corpus usage terms, collection period, and engine-strength filters

### Phase 2 — Train

- Combine value regression with within-parent ranking
- Train runOp1 warm-start and scratch models on the same splits and seed set
- Ablate the replay ratio for old data
- Measure whether quantization changes sibling ordering

### Phase 3 — Offline adoption gates

| Gate | What it measures |
|---|---|
| Data integrity | Legal moves, perspective, duplicates, parent-level train/validation split |
| Sibling holdout | Top-1, teacher-top recall, within-parent pair accuracy |
| Known-regression suite | Does the model place △P*8f below the stable good move at ply 32? |
| Search suite | Does it avoid the move at 800/2000/4000ms and fixed depth? |
| Broad value | Does it preserve legacy holdout MAE, sign, and decisive-position behavior? |
| Match play | Production path, production time controls, enough games for an interval estimate |

We should not choose “30 games” or “40 games” by habit. First set the maximum acceptable regression and the improvement worth detecting; then size the sample for those targets. Report intervals, not just point estimates, and freeze the pass criteria before the experiment.

### Phase 4 — Live verification

- Log the weight hash, worker startup, WASM load, thread count, fallback reason, depth, evaluation, and elapsed time
- Open the production URL in a real browser and play through an out-of-book position
- Record the score display, thinking timer, selected move, and console errors together
- Roll out gradually, retaining a one-step weight-only return to stable

---

## 8. Do not mix the evaluation regression with the live UI failure

In the same field report, the owner also saw the evaluation remain at `—`, the “AI is thinking” timer stop around 0.4 seconds, and multithreading appear inactive. Those are serious symptoms, but we must not assume they share a cause with deep16's △P*8f ranking.

### Evidence so far

- **Confirmed**: in the owner's live environment, all three symptoms were visible at the time of the report
- **Confirmed**: a separate production-browser check completed an out-of-book hard search in about 3.5 seconds at depth 13 with an evaluation of −183, while the timer advanced from 0.7 to 3.3 seconds
- **What that establishes**: the worker is not guaranteed to fail in every browser at every time
- **Hypothesis**: a worker failure followed by synchronous JS fallback can explain the cluster of missing eval, frozen UI timer, and shallow play
- **Unverified**: which fallback path ran in the owner's failing session; diagnostic telemetry did not exist, so the cause cannot be claimed as confirmed

The work therefore splits into two tracks:

| Track | Failure | Primary verification |
|---|---|---|
| Shogi decision quality | deep16 ranks △P*8f too highly | Fixed position, sibling rank, search, matches |
| Execution and display | Eval `—`, frozen timer, worker/fallback | Real browser, console, telemetry, visible execution path |

Restoring runOp1 does not fix worker startup. Fixing the worker does not fix deep16's candidate ranking. Separate PRs and separate evidence prevent us from concluding “the AI is stronger because the UI moved” or “the UI is fixed because the move changed.”

---

## 9. Evidence ledger at this checkpoint

| Claim | Status | Evidence / next check |
|---|---|---|
| Plies 20, 26, and 32 are not repetition | **Confirmed** | Silver and rook squares differ |
| deep16 promotes △P*8f in the reported position | **Confirmed** | Static 2/46; selected at fixed depth 11/12 and 2000/4000ms |
| runOp1 suppresses the move in the same position | **Confirmed** | Static 16/46; △S-4b at fixed depth 11/12 and 2000/4000ms |
| deep16 also has lower aggregate Elo than runOp1 | **Unverified** | Needs production conditions and adequate sample size |
| The 800ms, 40-game A/B proved no regression | **Refuted** | Approximate 37–68% interval and wrong time regime |
| Current training uses `bestmove` | **Refuted** | JSONL saves it; `train.py` ignores it |
| `pair_acc≈0.90` measures move choice in one position | **Refuted** | Random pairs of unrelated validation positions |
| Strong games plus sibling learning will improve play | **Unverified** | Compare warm-start and scratch next cycle |
| Every position from our own engine should be discarded | **Refuted** | Needed for DAgger-like failure-state coverage |
| The worker is broken in every live environment | **Refuted** | At least one browser completed normally |
| Fallback caused the reported UI failure | **Hypothesis** | Needs execution-path logs from a failing session |

### Decisions still open

- Which game corpus to use and how to satisfy its usage terms
- How many MultiPV lines and which depth/node budget to use
- The sibling-loss weight and old-data replay ratio
- Whether warm-start or scratch ultimately wins
- Whether to keep or increase the quantized network capacity
- The formal hard-level non-inferiority margin and required game count

We leave undecided fields visibly undecided. Filling them with “probably fine” is how the deep16 adoption gate failed.

---

## 10. Conclusion at this checkpoint

deep16 moved closer to the teacher on the aggregate holdout. Yet at the owner's ply-32 failure, it raised △P*8f—avoided by runOp1—to second place and caused a production-like search to choose it. **Better approximation accuracy is not the same as better ordering of the candidates that matter.**

The diagnosis also failed before the model did: I saw the same notation three times and jumped to repetition. The silver and rook had moved; the positions were different. The first response should have tabulated those differences, then swapped only the old and new weights in a fixed position—not reached for a general explanation.

The recovery order is now concrete:

1. Restore only the weights to runOp1 and stop the regression
2. Source high-quality parent positions from strong games
3. Compare sibling candidates from the same parent with a strong teacher
4. Turn our engine into a submitter of its own failure states
5. Compete a runOp1 warm start against a scratch model as separate artifacts
6. Keep fixed-position regression, production-time A/B, and live-browser checks as separate gates

This is not as simple as “copy strong games and we are done.” But it connects the objective to actual move choice, unlike saving `bestmove`, discarding it, and hoping an unrelated-position `pair_acc` means move selection improved.

The next adoption needs no story like “52.5%, therefore no regression.” It needs four records: where △P*8f ranks, how well sibling candidates from one parent are ordered, what the production-time interval actually excludes, and which execution path ran in a real browser. We will keep the intermediate data for all four.

---

## 11. Execution-path checkpoint: never hide which engine answered

In a PR separate from the evaluation rollback, we reproduced the stopping symptom seen live and its major failure shapes, then made every move traceable to the route that produced it. This investigation and independent review found seven state-update and fallback problems, none of them caused by the NNUE weights.

### 11.1 The seven operational bugs we found

| Area | Behavior before the fix | Impact |
|---|---|---|
| Opening-book branch | Human moves and searched replies incremented `ply`, but the book reply alone did not | The board advanced while the internal move count remained one ply behind, skewing later diagnostics and the ply passed into search |
| Worker construction | `getWorker()` ran outside the code that created the Promise, so a synchronous throw from the Worker constructor could not reach the later `.catch()` | No path cleared `isAIThinking`, allowing the UI to remain stuck on “thinking” |
| Evaluation display | Evaluation state was updated only when a new response contained a `score` | A scoreless response such as a book move could retain the previous response's score and depth |
| JS fallbacks | Worker-side JS and main-thread JS returned only a move, not the actual score and completed depth | The game could advance while evaluation remained `—`, with no way to distinguish WASM failure from JS execution |
| Worker respawn | After a hard deadline, the client respawned the Worker before rejecting the request | If the replacement constructor also threw synchronously, the original Promise stayed pending forever |
| Page exit | Unmount terminated the Worker but did not invalidate the 250/500ms delay and request ID | A new Worker or main-thread fallback could start after leaving the page |
| Persistent failure | When both the Worker and main-thread JS failed, only `isAIThinking` was cleared while the position remained Gote to move | The same position could retry every 500ms and repeatedly block the UI thread |

**Confirmed**: these failures are independent of deep16's candidate ordering. Fixing Worker construction, for example, does not change △P*8f's rank, while restoring runOp1 does not repair a synchronous Worker-constructor throw.

After the fix, JS V20 search returns the score and depth actually completed by iterative deepening, not just its move. When search falls all the way back to synchronous main-thread JS, it also records the time for which it blocked the UI as `blockedMainThreadMs`. Evaluation state is no longer patched field by field: route, score, depth, and blocked time are replaced together as one snapshot for every request. A scoreless response therefore cannot inherit an old number.

### 11.2 Route vocabulary after the fix

| `searchPath` | Meaning |
|---|---|
| `idle` | DOM initial state before any answer and while no search is running |
| `book` | Returned immediately from the opening book |
| `worker-pending` | An out-of-book request has been sent to the Worker and is awaiting a reply |
| `mate` | The dedicated mate solver returned the move |
| `wasm` | Worker-side WASM search returned the move. NNUE versus V3 is separate configuration state and is not guaranteed by this route alone |
| `worker-js` | The Worker ran, but WASM search did not return a move, so it fell back to JS inside the Worker |
| `main-thread-js` | The Worker was unavailable and search fell back to JS on the UI thread |
| `engine-error` | A terminal error prevented the move from being committed safely. Automatic retry stops and waits for a manual Retry |
| `unknown` | An old or malformed Worker response did not identify its route |

The same status element now exposes the route together with `ply`, whether the engine is thinking, score, depth, and main-thread blocked time. A successful normal `wasm` search looks unchanged to the player. Compatibility routes show “compatibility mode” or “slow compatibility mode,” while `engine-error` explicitly shows the terminal failure and a Retry action. The diagnostics add no warning or visual noise to the healthy route.

### 11.3 A real-browser regression test that cannot escape into the book

The earlier browser test could declare success after only the book reply to ▲P-7f. It could therefore pass without ever using the Worker or WASM. The new test uses **Hard + bishop handicap**. In handicap shogi the AI plays the first move and the opening-book branch is deliberately skipped, so the test reaches real search without relying on a brittle sequence of moves.

| Scenario | Conditions pinned in the browser |
|---|---|
| Normal out-of-book search | Passes through `worker-pending`, advances the timer beyond 1000ms, completes through `wasm`, and returns a numeric score, positive depth, and `ply=1` |
| Synchronous Worker failure | Forces the Worker constructor to throw synchronously, yet completes through `main-thread-js`, clears thinking, and returns a numeric score, positive depth, positive blocked time, and `ply=1` |
| Opening-book reply | In a normal even game, records the reply to ▲P-7f as `book` and reports `ply=2` for the human first move plus the AI second move |
| Page exit | Returning to Games during the 500ms pre-search delay does not construct a Worker after unmount |
| Persistent failure | Forces both Worker and main-thread JS failure, stops at `engine-error`, and confirms the attempt count does not increase after another 1.2 seconds. After removing the fault, Retry Game (starts a new game with the same settings) recovers through `wasm` to `ply=1` |
| Failed respawn after a Worker fault | Triggers a running Worker failure, then fails the replacement Worker construction so the client becomes disabled. After removing the fault, Retry Game starts a new game, discards the disabled client, and recovers through a fresh Worker's `wasm` path to `ply=1` |

The E2E now establishes more than “the screen did not freeze”: one run verifies the route, thinking elapsed time (including the 500ms pre-search delay), evaluation, depth, and move count together.

### 11.4 Verification ledger for this checkpoint

| Check | Result |
|---|---:|
| Unit tests | **69 files / 972 tests passed** |
| Targeted Shogi Playwright E2E (2 specs) | **11 / 11 passed** |
| TypeScript type check | **passed** |
| Full-repository ESLint | **passed (0 errors / 157 existing warnings)** |
| Production build | **passed** |

This checkpoint proves that a real browser can traverse the normal WASM route, that failures terminate instead of hanging, that a successful fallback preserves measurements while a terminal failure preserves its route, and that opening-book plies are counted correctly. **This PR improves observability and operational reliability; it does not prove stronger play.** Elo, sibling-candidate ordering, suppression of known bad moves, and production-time A/B remain separate gates for the trained candidates.
