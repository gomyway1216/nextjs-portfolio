# Direct-teacher HalfKP81 v3: isolate the MPS failure in a new fixed-CPU one-shot experiment

> As of July 29, 2026, v2 ended in a technical stop before training because an MPS operation was unsupported. Optimizer steps, trained rows, candidates, and strength observations are all zero. v3 does not retry v2: it is a separate family that preserves the training recipe and changes only the device to CPU. A read-only actual-data CPU probe passed, but training and measured strength gain remain zero, and the live weights are unchanged. [日本語](./blog-shogi-direct-teacher-halfkp81-v3-cpu-successor.md)

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

## Current state and sequence

| Stage | Current value | Authority |
|---|---:|---|
| v2 training | 0 batches / 0 rows | technical stop; retry forbidden |
| v2 terminal receipt | fixed slot pending | mandatory v3 input |
| v3 metadata rebind | implemented, unpublished | only after terminal |
| v3 execution plan | implemented, unpublished | only after rebind |
| Actual-data CPU preflight | PASS | no claim or training authority |
| v3 optimizer / epoch | 0 / 0 | only after merge, formal plan, and probe |
| Static gates | 0 / 9 | only after the epoch |
| Paired screen | 0 / 56 games | only after 9/9 static pass |
| Live-weight change | 0 bytes | forbidden |

Next, publish the v2 technical-stop receipt in its fixed slot, metadata-rebind the same dataset bytes, and create the formal v3 execution plan. After this implementation and its CI are merged, rerun the real CPU probe under that plan. Only a pass can consume the one claim and run the frozen epoch. A static or 56-game failure closes this family; it does not justify retrospectively changing the seed, epoch count, learning rate, or threshold.
