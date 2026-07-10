# Exact int16-aware training helped every seed—and still failed selection

> The [previous WCSC36 sibling-training result](./blog-shogi-wcsc36-sibling-training-results.en.md) rejected warm seed 42 because its deployed int16 model missed the top-1 and quantization-delta gates. This follow-up trained three preregistered seeds against the exact production int16 forward pass through a straight-through estimator (STE). All three improved the deployed sibling-pair score over stable, so the idea produced a real partial gain. None passed all four fixed gates, however. The audit status is **`static_selection_fail`**, the final holdout remains unopened, and production remains unchanged. 日本語版: [blog-shogi-wcsc36-int16-aware-results.md](./blog-shogi-wcsc36-int16-aware-results.md)

---

## TL;DR

- PR [#408](https://github.com/gomyway1216/nextjs-portfolio/pull/408) preregistered and implemented exact int16-aware training before these results existed. It merged as revision `753f90a026dfd6ec837b4444f3220db5648dc212`
- Seeds 42, 43, and 44 each trained for the fixed 20 epochs. Training performed zero selection evaluations and read no selection or final-holdout labels
- Every deployed int16 checkpoint beat stable's sibling-pair accuracy of `0.604897`: seed 42 reached `0.607164`, seed 43 `0.609236`, and seed 44 `0.607358`
- Seed 42 failed the pair quantization-delta limit; seed 43 failed stable top-1; seed 44 failed both quantization-delta limits. Therefore **0/3 seeds passed all four gates**
- The fixed median rule selected seed 44 as the representative. It also failed all-four, so the family gate failed and promotion authorization is `false`
- The one-shot audit reports `final_holdout: not_opened_by_this_command`. No sealed-holdout, match, browser, or high-dan-strength claim follows from this experiment
- The next attempt must use a new preregistered plan and fresh development data. It must not tune another seed, epoch, loss weight, or threshold against this already-used selection set

---

## 1. What changed after the six-run rejection?

The earlier warm model could look better in float while becoming less faithful after export. This experiment moved the deployed arithmetic into the training objective itself. Each batch optimized an equal mixture:

```text
0.5 × full float task + 0.5 × full exact-int16 STE task
```

“Exact int16” here means the same quantized weights, bias rounding, int16 clamping, integer accumulation, clipped activation, and arithmetic right shift used by production inference. The forward result is exact; the STE supplies a usable surrogate gradient through the discrete operations.

The experiment deliberately removed ordinary model-selection conveniences:

- exactly three seeds: 42, 43, and 44
- warm initialization from the unchanged runOp1 checkpoint
- fixed final epoch only; no early stopping or best-epoch choice
- 20 epochs, learning rate `1e-4`, batch 256
- 20,123 primary rows from 1,725 parents
- exactly 500,000 replay rows after semantic exclusion
- zero selection evaluations while training

The 8,152-byte plan was sealed at SHA-256 `bef7863a5f6c85d5d6c5b97cc21aef48d17dae137ffd679efeda764d352a6b6b`. The three result receipts bind the same training revision, plan, initializer, data, exclusion set, runtime, and final-only policy.

### Immutable inputs

| Input                                  | SHA-256                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| stable initializer / production runOp1 | `571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8` |
| isolated model-training data           | `f6dcfd6a7ca0b42e730ba0aff46394bf61e772a9b01270c5bfe126daf81c6e26` |
| one-shot model-selection data          | `97b15ba1ee780009986b5e8210cbfdbfc181f93555b7c1a87f4a6a585b7bb5ba` |
| sealed final holdout                   | `89b3e2ca1e637a507b4b6559326ada420d205c3967ac33063a9084ee5290e8c8` |
| replay source                          | `2207eba555fc0109fe2842ff8f92cb08d42e47893d9aabd863b3f552371a56cb` |
| replay-exclusion ID union              | `1cddfa87218de7c0752acfd6d238d3581103a6051e7f17bf54256bee2586ce5a` |

The holdout hash is an identity receipt, not evidence that its labels were evaluated.

---

## 2. All three runs completed under one runtime contract

Every run emitted the atomic `shogi-int16-aware-training-result-v1` marker and the fixed `final.pt`; every marker says `status: complete`, `completed_epochs: 20`, `early_stopping: false`, `selection_evaluations: 0`, and `selection_labels_read: false`.

The shared runtime was Apple M4 Pro CPU, macOS arm64, Python 3.13.0, and PyTorch 2.12.1. Each process used two Torch intra-op threads and one inter-op thread with deterministic algorithms enabled and deterministic debug mode set to `error`. CUDA was unavailable; MPS was available but was not the sealed device.

Training loss fell similarly for all three seeds. That consistency is useful evidence that the training implementation behaved as intended, but loss is not an adoption gate.

| Seed | Combined loss, epoch 1 → 20 | Final float / STE loss | Checkpoint SHA-256                                                 | Result-marker SHA-256                                              |
| ---: | --------------------------: | ---------------------: | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
|   42 |       `1.000488 → 0.647379` |  `0.647099 / 0.647658` | `2a643831d1a00cb062150fce25d98aca7b773cc82169a903152a8f855c325ac9` | `64a0c43727ba137462885f8e08e5753148327ea8432a51c0f23ff2b7a82398e3` |
|   43 |       `1.000453 → 0.647199` |  `0.646760 / 0.647639` | `2160926e71eee03aaf6038e08699a4bbf907f88aeafe55e6ac7757a18b45924d` | `6cd7f878fb514328911c54d88ebe967efca02a345e9b34fb05d9fa170f86f942` |
|   44 |       `1.001134 → 0.646645` |  `0.646287 / 0.647003` | `6497c81309a5e1273d2d9c013a4cdfe97923e05762e150986309bd8b789c42fb` | `e6cf4e89f027bcf3c454822baef6db615d9b3d1e18e8d2dc7a04ed50e8f39080` |

Each checkpoint is 2,383,313 bytes. Seed 44 has the lowest final combined training loss, but that does not rescue its failed quantization gates.

---

## 3. The sole selection read

The selector was not allowed to inspect the 3,912 selection records until all three final checkpoints and all three atomic result markers already existed. Before that read, it verified:

1. the exact plan bytes and SHA-256
2. all checkpoint and result-marker hashes
3. the fixed architecture, state-dict shapes, training arguments, runtime, provenance, and 20-epoch histories
4. the clean training and audit revision `753f90a026dfd6ec837b4444f3220db5648dc212`

Only then did one command evaluate stable and the three fixed checkpoints over 341 parents and 15,439 eligible sibling pairs. It ranked the seeds once, recomputed every gate, rechecked the artifacts after evaluation, and wrote the audit atomically. There was no per-epoch selection read and no opportunity to replace a checkpoint after seeing its score.

The resulting [immutable selection audit](../ml/protocols/wcsc36-int16-aware-selection-audit.json) is 29,616 bytes with SHA-256 `aab9a6fdb49e4d393ca11132671d5aa433b9a208bfafeaa031f3e9554b148737`.

The fixed rank order was seed 43, seed 44, seed 42. The median-ranked checkpoint—seed 44—therefore became the representative. This was not a claim that seed 44 had the best individual metric.

---

## 4. Per-seed result: a partial success, not a pass

Stable's deployed int16 reference was:

- sibling-pair accuracy: `0.6048966902`
- teacher top-1 accuracy: `0.2668621701`

Each seed had to pass all four checks:

1. int16 pair accuracy strictly above stable
2. int16 top-1 at least stable
3. absolute float-to-int16 pair delta at most `0.002`
4. absolute float-to-int16 top-1 delta at most `0.005`

| Seed | int16 pair | int16 top-1 | Float→int16 pair delta | Float→int16 top-1 delta | Failed gate(s)          | All four |
| ---: | ---------: | ----------: | ---------------------: | ----------------------: | ----------------------- | :------: |
|   42 | `0.607164` |  `0.272727` |            `−0.002461` |              `0.000000` | pair delta              |    no    |
|   43 | `0.609236` |  `0.263930` |            `−0.001360` |             `+0.002933` | stable top-1            |    no    |
|   44 | `0.607358` |  `0.275660` |            `−0.003368` |             `+0.008798` | pair delta, top-1 delta |    no    |

This is the important nuance: **exact-int16-aware training raised deployed pair accuracy in all three seeds**, and seed 43 kept both quantization deltas inside their limits. The method addressed part of the original failure. But the gains were not jointly reliable across pair ordering, top-1 choice, and float-to-int16 stability:

- seed 42 passed pair and top-1 but lost too much pair accuracy during quantization
- seed 43 had the best deployed pair accuracy and passed both delta gates, but its top-1 fell below stable
- representative seed 44 passed the two stable-comparison gates, but failed both delta gates

The family rule was stricter than choosing whichever row looked nicest after the fact. It required the representative to pass all four, at least two seeds to pass all four, and all three seeds to pass both quantization-delta gates. The observed counts were **0/3 all-four**, so every family condition failed.

The audit's final decision is therefore:

```text
status: static_selection_fail
production_promotion_authorized: false
final_holdout: not_opened_by_this_command
```

Production remains on runOp1. No candidate receipt was promoted, and no playing-strength conclusion can be drawn from these static selection metrics alone.

---

## 5. PR and review record

The plan, exact integer reference, STE training path, replay exclusion, final-only receipts, and one-shot selector were reviewed in PR [#408](https://github.com/gomyway1216/nextjs-portfolio/pull/408) before training began. The pull request kept its seven implementation commits and merged with a regular merge commit.

Review raised two concrete invariants:

- whether per-addition int32 checks should be collapsed into one final accumulator check
- whether the cosine scheduler was shifted by one epoch relative to the audited history

The first was kept intentionally because a signed-int32 prefix can overflow and later cancel back into range; a final-only check would miss that deployed-order failure. A prefix-overflow regression test was added. The second was checked against the pinned PyTorch 2.12.1 behavior, and a full 20-epoch scheduler regression test was added. Test/build, security audit, end-to-end smoke, and preview checks all passed before merge.

Most importantly, review changed tests and explanations—not the post-result gates. The plan SHA-256 and four thresholds above were fixed before seeds 42/43/44 produced results.

---

## 6. What this experiment discovered

Three lessons survive the failed promotion.

### 6.1 Training against deployment arithmetic is useful

All three int16 pair scores beat stable. That is substantially better evidence for the idea than a single lucky seed, and seed 43 demonstrates that exact-int16 training can keep both preregistered quantization deltas within bounds.

### 6.2 It did not solve the objective trade-off

Seed 43's stronger pair ordering coincided with weaker top-1. Seeds 42 and 44 cleared the stable top-1 threshold but did not keep pair quantization stable; seed 44 also moved top-1 too far between float and int16. The remaining problem is not simply “remember to quantize.” The data and objective still do not produce the whole behavior reliably.

### 6.3 Training loss cannot select a production evaluator

Seed 44 ended with the lowest combined training loss, yet it failed two deployment-delta gates. Optimizing the declared loss successfully is not the same as meeting the adoption contract, much less demonstrating stable high-dan play.

---

## 7. The next plan must use fresh development evidence

The invalid next move would be to add seed 45, select an earlier epoch, soften `0.002`, change the loss mixture, or repeatedly reopen the same selection rows until something passes. Those choices would tune directly to evidence that has already influenced a decision.

The defensible next experiment is a new preregistered cycle:

1. Build fresh development data from additional strong games and independently searched sibling alternatives, with new game/parent/semantic-position isolation
2. Reserve a new selection role for model and objective development, while keeping the current sealed final holdout unopened
3. Use the new development role to test a stated hypothesis about the pair/top-1 trade-off—such as better coverage of close alternatives and top-ranked tactical errors—rather than blindly adding capacity or epochs
4. Fix the training matrix, seed count, representative rule, quantization gates, and stop condition before running it
5. Open the current final holdout only after a future family passes its own static preregistered gate; then continue through regression, paired-match, browser, and external high-dan calibration gates

The current selection set remains valuable as an audit record, but it is spent for tuning. It may report what happened here; it must not be presented as fresh evidence for the next set of choices.

---

## Conclusion

Exact int16-aware training was not useless. It moved all three deployed pair scores above stable and produced one seed with acceptable float-to-int16 deltas. What it did **not** produce was a seed that simultaneously satisfied pair ordering, top-1, and quantization stability under the fixed rules.

That distinction determines the engineering decision. The result is `static_selection_fail`, 0/3 all-four, unopened final holdout, and unchanged production. Reaching stable high-dan strength now requires fresh data and a fresh preregistered experiment—not another interpretation of these same selection results.
