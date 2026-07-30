# Direct-teacher HalfKP81 v3: isolate the MPS failure in a new fixed-CPU one-shot experiment

> On July 29, 2026, v3 completed its formal fixed-CPU epoch. It trained 200,944 rows in 99 batches and 7.917 seconds, and passed eight of nine static gates. It failed because the quantized maximum CP-delta ratio was 1.1732 against a 1.05 ceiling, so the family is closed. It played zero of the 56 screen games, and the live weights remain unchanged. [日本語](./blog-shogi-direct-teacher-halfkp81-v3-cpu-successor.md)

## What happened to v2

v2 stopped before it created a new evaluator. It acquired its one-shot claim and exported the initializer in the 81-bucket format, then failed during initializer baseline inference—before optimizer creation—because MPS could not execute `aten::_embedding_bag`.

| Measured v2 state | Value |
|---|---:|
| Optimizer creation / steps | 0 / 0 |
| Training batches / rows | 0 / 0 |
| Candidate weights | none |
| Strength observation | none |
| Live-weight change | 0 bytes |

The v2 result therefore says neither that this teacher data will improve strength nor that it will fail: training never began. The consumed claim must not be deleted to retry v2. Its technical stop is closed separately while preserving the old output.

## What v3 changes and preserves

The only training-field difference between v3 and v2 is `device=mps` becoming `device=cpu`.

- Rebind the same 200,944 train and 22,890 validation rows as metadata, without copying or regenerating JSONL bytes.
- Preserve the initializer, seed 42, batch 2048, AdamW, learning rate `3e-6`, weight decay 0, one epoch, and final checkpoint only.
- Preserve direct scalar BCE, K=600, CP clamp=3000, and all-parameter training.
- Preserve all nine static gates and the 28-opening-pair, 56-game, 62/112-half-point decision.
- Bind the v2 terminal receipt, v3 protocol, metadata manifest, execution plan, and CPU probe under new schemas and hashes.
- Create any claim only in `.direct-teacher-halfkp81-v3-cpu-one-shot-claims`; never touch the v2 claim.

This does not assume that CPU execution itself improves playing strength. CPU execution can establish only that the same computation is supported and reproducible. Strength is first observed after the frozen epoch passes the static gates and plays the 56-game screen.

## Real CPU capability probe before the claim

After authenticating inputs, dataset IDs, initializer architecture, and finite parameters—but before creating a claim—the runner selects the first seed-42 batch of 2,048 rows. It performs forward, direct BCE, and backward on two isolated initializer copies on CPU.

The probe requires all of the following:

- finite outputs, loss, and every parameter gradient;
- identical output SHA-256 across both runs;
- identical gradient SHA-256 across both runs;
- no optimizer creation;
- no parameter step;
- no strength metric.

Any failure stops before a v3 claim exists. Only a pass permits one create-only claim keyed by the new execution-plan SHA.

## Actual-data read-only preflight

While the formal terminal receipt remained pending, the new probe implementation was exercised before merge without creating a claim or output. It read the actual 200,944-row training dataset and the frozen initializer.

| Item | Measured |
|---|---:|
| Dataset authentication and tensor construction | 7.929 s |
| Two isolated forward+BCE+backward runs | 0.541 s |
| Total | 8.986 s |
| Peak RSS | 2,294,382,592 bytes |
| Output SHA equality | yes |
| Gradient SHA equality | yes |
| Optimizer / parameter steps | 0 / 0 |

The output SHA-256 was `64ff6dc816d491d8fd5c055b537e7cee62d0c38a75b370c86a3f4f3dd0deb1de`; the gradient SHA-256 was `b43290206b6327e9ddcc2c49cfb20dcbc452df550273694956756a0ec0dd0681`. This is a technical CPU-capability observation, not an authoritative execution receipt or playing-strength result. The measurements are recorded in [`docs/data/shogi-direct-teacher-halfkp81-v3-cpu-preflight-2026-07-29.json`](./data/shogi-direct-teacher-halfkp81-v3-cpu-preflight-2026-07-29.json).

## Formal execution result

After the implementation and v2 terminal receipt reached main, the formal v3 run started exactly once from clean main revision `1f5e4a4a`. The metadata rebind rescanned all 223,834 train and validation rows. It proved zero cross-role overlap for the game, parent, position, child-position, and semantic-position ID sets. It copied, regenerated, and hard-linked zero JSONL files.

The formal CPU probe reproduced the preflight output and gradient hashes in both isolated runs. It passed before any optimizer existed. Only then did the runner acquire the v3 claim and execute the frozen epoch.

| Training measurement | Value |
|---|---:|
| Train rows / batch | 200,944 / 2,048 |
| Optimizer batches / steps | 99 / 99 |
| Epoch time | 7.917 s |
| Train direct scalar BCE | 0.6786804361 |
| Validation rows | 22,890 |
| Candidate checkpoint | 191,659,516 bytes |
| Candidate weights | 94,656,708 bytes |

The static gates produced the following result.

| Static check | Observed | Requirement | Result |
|---|---:|---:|---|
| Finite training / inference | true | true | PASS |
| Technical faults | 0 | at most 0 | PASS |
| Float export mismatches | 0 | at most 0 | PASS |
| WASM parity mismatches | 0 / 512 | at most 0 | PASS |
| Teacher MAE improvement | +8.0133 CP | at least +5 CP | PASS |
| Pair-accuracy delta | +0.0000972 | at least -0.002 | PASS |
| Quantized mean CP-delta ratio | 1.001686 | at most 1.05 | PASS |
| Quantized max CP-delta ratio | 1.173216 | at most 1.05 | **FAIL** |
| Runtime slowdown | 2.4955% | at most 5% | PASS |

The sole failure was a 17.32% increase, relative to the initializer, in the worst single quantization CP delta. Mean quantization error, WASM parity, runtime, teacher MAE, and pair accuracy passed. Teacher MAE and pair accuracy are validation proxies, however, not playing strength. Because one of the preregistered nine gates failed, the candidate did not enter the 56-game screen and v3 does not support a “stronger” claim.

The formal result and every artifact identity are pinned in [`docs/data/shogi-direct-teacher-halfkp81-v3-cpu-result-2026-07-29.json`](./data/shogi-direct-teacher-halfkp81-v3-cpu-result-2026-07-29.json).

## Terminal state and the next valid branch

| Stage | Final value | Authority |
|---|---:|---|
| Formal v3 probe | PASS; 2 / 2 hashes equal | claim acquired |
| v3 training | 1 epoch; 99 steps | complete; retry forbidden |
| Static gates | 8 / 9 PASS | family closed |
| Paired screen | 0 / 56 games | not authorized |
| Expanded stage | 0 games | not authorized |
| Live-weight change | 0 bytes | forbidden and byte-exact unchanged |

The v3 seed, epoch count, learning rate, and threshold must not be changed retrospectively and rerun. A useful next experiment would preregister a separate family that directly controls the worst quantized outlier. Candidate approaches are quantization-aware fine-tuning, quantization-range regularization, or clipping before export. The new plan should first bind the technical hypothesis that it will keep the teacher-MAE gain while reducing the maximum CP-delta ratio to at most 1.05. Only a result that passes all nine static gates should enter the 56-game screen.
