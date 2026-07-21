# Preserving the representation bridge v3 STOP and switching to an int16-only candidate lock

> On July 20, 2026, the real representation bridge v3 failed its fixed family gate and
> formally stopped. We do not reinterpret that result as a pass or relax the failed
> threshold. The production int16 tensors are exactly the same before and after alignment,
> however, so more float alignment cannot change production-int16 playing strength. We
> therefore prepared a separate **post-hoc adaptive candidate lock** whose first prospective
> strength gate is the still-sealed fresh final. The real int16 evaluator and runner have not
> run, and no candidate-lock receipt exists. One early broad development `rg` invocation did,
> however, touch the spent selection and mix some raw matching lines into internal tool
> output. Its exact bytes and rows read are unknown. We record that separately from an
> evaluation run rather than hiding it. Japanese version:
> [blog-shogi-floodgate-strength-first-int16-only-candidate-amendment.md](./blog-shogi-floodgate-strength-first-int16-only-candidate-amendment.md)

## The real bridge v3 did not pass

The first authoritative invocation exited 1 after 12.13 seconds. Its stderr was
`representation bridge STOP: representation family gate failed`. Evaluation finished before
the gate decision, but the fail-closed boundary created none of the three private output
files. The next two invocations diagnosed timing and reproduced the failure; they were not
new candidate-selection decisions.

| Invocation                          | Wall time |       Maximum RSS |           Exit | Interpretation                                   |
| ----------------------------------- | --------: | ----------------: | -------------: | ------------------------------------------------ |
| first authoritative invocation      |   12.13 s | 739,557,376 bytes |              1 | formal real bridge v3 STOP                       |
| diagnostic rerun                    |   11.94 s | 777,322,496 bytes |              1 | timing and failure reproduction only             |
| independent diagnostic reproduction |   11.69 s | 771,948,544 bytes |              1 | independent failure and metric reproduction only |
| total                               |   35.76 s |                 — | all three STOP | three total spent-selection read passes          |

The first invocation printed no metrics and left no authenticated bridge output. The exact
metrics below were transcribed by the operator from the diagnostic reproduction and match
the existing public spent-selection reproduction under the same seven-tensor quantized
identity. They are useful diagnostic evidence, but they are not a PASS receipt issued by the
bridge.

## Only seed 42's representation pair delta failed

Applying the existing fixed metric-ordering rule—parent-int16 pair accuracy, top-1 accuracy,
MAE, seed, and checkpoint SHA—produced the observed order `43 -> 42 -> 44`. This specific
order was not preregistered; it is fixed into the adaptive lock after the bridge STOP and
before fresh final is opened. Seed 42 is therefore the median representative. Every
parent-int16 model had both higher pair and top-1 accuracy than stable, as well as lower MAE.

| Model          |         Int16 pair |        Int16 top-1 |     Int16 MAE (cp) | Pair / top-1 versus stable |
| -------------- | -----------------: | -----------------: | -----------------: | -------------------------- |
| stable         | 0.5915841584158416 | 0.3034597749062109 |  526.6006381934217 | reference                  |
| seed 42 parent | 0.6013040328423086 | 0.3153397248853689 |  405.9221193632092 | both above stable          |
| seed 43 parent | 0.6019882476052484 | 0.3161734055856607 |  402.7880987446525 | both above stable          |
| seed 44 parent | 0.6000563470981245 | 0.3186744476865361 | 405.71302335367136 | both above stable          |

Bridge v3 additionally required the aligned-float versus same-parent-int16 absolute pair
delta to be at most 0.002 and the absolute top-1 delta to be at most 0.005. Seed 42's recorded
directional pair delta was `-0.002636239233679505`; its absolute value was
`0.002636239233679505`, exceeding the limit by exactly `0.000636239233679505`. Its absolute
top-1 delta of `0.0033347228011672003` passed. Seeds 43 and 44 passed both representation
delta checks.

| Seed |   Abs(pair delta) / 0.002 limit | Abs(top-1 delta) / 0.005 limit | All four gates |
| ---: | ------------------------------: | -----------------------------: | -------------- |
|   42 | **0.002636239233679505 / FAIL** |   0.0033347228011672003 / PASS | FAIL           |
|   43 |    0.0017306608709650728 / PASS |   0.0027094622759483156 / PASS | PASS           |
|   44 |    0.0017709087981968574 / PASS |   0.0006252605252188292 / PASS | PASS           |

Two of three seeds passed all four gates, satisfying the minimum-seed-count condition. But
the median representative did not pass all four, and not every seed passed both
representation-delta checks. The family gate is therefore false. We preserve that failure
and do not change the bridge v3 thresholds or decision.

## Why further float alignment stops here

Constrained alignment v2 moved float parameters only within the parent's quantization cells.
After independent strict reloads, all 3 seeds x 7 tensors = 21 comparisons matched their
epoch-20 parents exactly. Further training of an epoch-24 aligned checkpoint could reduce a
float delta, but it cannot change the production int16 weights, integer evaluation, or move
chosen from that evaluation.

More alignment might satisfy the old representation gate, but it would not strengthen the
int16 evaluator. Repeating it against an already-opened selection set would instead continue
adapting a diagnostic representation without changing deployed play. For the high-dan goal,
evaluating the deployed representation on unused data and in real games is the more direct
next step.

## The new decision is an adaptive lock, not an old-gate pass

Removing the float-delta checks and calling the same experiment a pass would be a post-hoc
gate relaxation. That is not what this amendment does. It closes bridge v3 as a failed
experiment, limits the spent selection to development evidence, and defines a separate
protocol that freezes one int16 candidate before the sealed fresh final is opened.

| Fixed item                          | Value                                                              |
| ----------------------------------- | ------------------------------------------------------------------ |
| decision class                      | `post-hoc-adaptive-candidate-lock-not-selection-pass`              |
| parent-int16 order                  | `43 -> 42 -> 44`                                                   |
| locked candidate                    | median seed 42, epoch 20                                           |
| checkpoint SHA-256                  | `84ab533c7bf36183b83228c5dab5817dd730fcfae5d81be645569f45b5622a6a` |
| epoch-24 aligned checkpoint         | no deployment authority                                            |
| fallback to seed 43 / 44            | forbidden                                                          |
| action if seed 42 fails fresh final | retrain the entire three-seed family                               |
| first prospective strength gate     | sealed fresh final                                                 |

`candidate_locked` and `candidate_strength_selected` are different claims. Freezing a model
for future independent evaluation does not yet mean that a stronger candidate was selected.
If seed 42 fails fresh final, the process may neither switch to seed 43 or 44 after seeing the
same final nor change the threshold. The complete family must be retrained and evaluated in
a new experiment with new unused data.

## Current read and execution boundary

The real int16 evaluator, model evaluation, and argumentless runner have not run, while fresh
final, legacy holdout, and retention remain unread. One early broad
`rg ... ~/.codex/shogi-runs` invocation nevertheless touched the already-spent selection and
mixed some raw matching lines into internal tool output. Exact bytes and rows read were not
observed and are unknown. The search output was not used to parse an evaluation, compute
metrics, change the ordering, or make a candidate decision, but it means private-data reads
cannot honestly be reported as zero. This `development-search-1` accidental non-evaluation
text scan is separate from the three historical evaluator passes counted by the STOP evidence
and outside that machine STOP record's boundary.

Only a later invocation of the reviewed and merged argumentless runner may re-authenticate
the already-spent selection for exactly one evaluator pass. That run evaluates stable and
the three epoch-20 parents once each through production int16, with zero float evaluations
and zero aligned-checkpoint loads.

| Item                                                           |        Current value |
| -------------------------------------------------------------- | -------------------: |
| historical bridge / diagnostic spent-selection evaluator reads |             3 passes |
| accidental non-evaluation searches during PR development       |         1 invocation |
| exact bytes / rows read by that search                         |              unknown |
| destination of raw matching lines                              | internal tool output |
| metrics computed / candidate decisions from that search        |                0 / 0 |
| int16 model evaluations / runner invocations / lock receipts   |            0 / 0 / 0 |
| fresh-final / legacy-holdout / retention label reads           |            0 / 0 / 0 |
| formal A/B / external calibration                              |    0 games / 0 games |
| candidate strength selected                                    |                false |
| live weights changed                                           |                false |

Even a successful future re-authentication produces only a candidate-lock receipt, not a
strength pass. Fresh final preserves the existing gate: on the same data through the exact
int16 path, candidate pair accuracy must be strictly above stable and candidate top-1
accuracy must be at least stable. Legacy final, general/opening retention, known regression,
and production-browser parity still follow; none may be skipped before the fixed formal A/B
v2 run of 384 color-swapped pairs / 768 games. A formal win over stable would still not
establish a high-dan rank without separate external calibration, and live weights remain
unchanged until that evidence exists.

Machine-readable records:

- [representation bridge v3 STOP](./data/floodgate-strength-first-representation-bridge-v3-stop-2026-07-20.json)
- [int16-only candidate amendment readiness](./data/floodgate-strength-first-int16-only-candidate-amendment-readiness-2026-07-20.json)
