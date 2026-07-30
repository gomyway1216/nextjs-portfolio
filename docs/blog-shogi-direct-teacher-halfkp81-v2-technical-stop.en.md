# Direct-teacher HalfKP81 v2 ended at a pre-training MPS technical stop

> The July 29, 2026 one-shot attempt ended without creating a trained candidate. The fixed MPS runtime could not execute PyTorch's `aten::_embedding_bag`, so the first initializer-baseline forward stopped before optimizer construction. Optimizer, gradient, training-batch, and performance-metric counts are all zero. This change adds an authoritative terminalizer that neither retries the execution plan nor modifies its old claim or output. [日本語](./blog-shogi-direct-teacher-halfkp81-v2-technical-stop.md)

## Result

This was not a playing-strength rejection. No candidate existed to evaluate.

The run stopped at this exact sequence:

1. It reauthenticated 200,944 training rows, 22,890 validation rows, and all five cross-role overlap sets.
2. It acquired the create-only claim for execution-plan SHA-256 `c6fd910e…e19751`.
3. It exported the frozen initializer as 94,656,708-byte research weights.
4. It moved the model to MPS and began initializer-baseline inference on validation.
5. The first `EmbeddingBag` forward stopped because MPS did not implement `aten::_embedding_bag`.
6. It never entered `train_exactly_one_epoch`.

AdamW construction, `zero_grad`, `backward`, and `optimizer.step` all occur inside `train_exactly_one_epoch`. The authenticated accounting is therefore zero optimizers, steps, training batches, training rows, and metrics. The only old output is `initializer-weights.bin`, whose SHA-256 `2b91060f…b47c` is the known frozen initializer export. There are no candidate weights, final checkpoint, trainer result, or static-sanity result. Live weights remain byte-exact at 1,185,988 bytes / SHA-256 `e4e738f9…e28dc`.

The [machine-readable data memo](./data/shogi-direct-teacher-halfkp81-v2-technical-stop-2026-07-29.json) records every complete value.

## Why the same plan is not retried

The 688-byte claim, SHA-256 `a39863b1…574f7`, is a durable global one-shot keyed only by execution-plan SHA. A different output path does not create another attempt. Deleting the claim or partial output to rerun the plan is not authorized.

The 465-byte failure log, SHA-256 `b8e81e9e…7bd6`, fixes the `aten::_embedding_bag` MPS stop. This was a runtime-capability failure during the initializer's no-gradient baseline forward, not a stop after inspecting candidate performance. That distinction does not create an exception to the one-shot boundary.

## Authoritative terminalizer

`ml/terminalize_direct_teacher_halfkp81_v2_technical_stop.py` is a stdlib CLI dedicated to this single attempt. It does not import torch or open training data, construct an optimizer, or run a model forward.

It reauthenticates:

- exact claim, execution-plan, and failure-log bytes and SHA-256;
- the claim's bindings to the plan, pipeline revision `34729b04…e3cb`, and old output;
- the plan's fixed MPS, seed-42, one-epoch, one-candidate recipe;
- that the old output contains only the exact initializer export;
- byte-exact unchanged live weights; and
- absence of candidate, checkpoint, trainer-result, and static-result artifacts.

Only after two identical authentications does it publish
`~/.codex/shogi-runs/direct-teacher-halfkp81-v2-technical-stop-v1/result.json`
once, using a same-directory temporary file, file `fsync`, create-only hard link, and directory `fsync`. The receipt never authorizes mutation of the old claim or output.

## Boundary for the next training run

Because v2 exposed no candidate performance metric, choosing a technically viable device is not selection based on candidate results. The next run must nevertheless be an independently preregistered successor, not a v2 retry: a new CPU-fixed protocol, execution plan, and claim. Dataset bytes, initializer, seed, batch, learning rate, epoch count, and static thresholds remain unchanged, and an initializer-forward capability check occurs before claim acquisition.

Implicit MPS fallback was not bound by the old plan and was slower than CPU in the existing runtime-only measurement. Native MPS in another environment completed forward/backward but did not reproduce the same weight hash. The successor therefore fixes CPU explicitly and does not use this technical stop as candidate-comparison evidence.

This terminal receipt is not evidence of stronger play, high-dan strength, paired56 authorization, expanded-stage authorization, or a live change.
