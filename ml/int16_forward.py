"""Shared fixed-point reference and straight-through forward pass.

This module is deliberately independent of :mod:`train`: it only relies on the
small, duck-typed surface exposed by ``DistillNet``.  The exporter, evaluator,
and quantization-aware training therefore use one definition of the deployed
integer network.

The integer contract is:

* first-layer weights and activations use ``ACT_SCALE == 127``;
* later-layer weights use ``W_SCALE == 64``;
* all quantization uses round-half-to-even;
* weights clamp to int16, biases and accumulators must fit int32;
* the second-layer divide is an arithmetic right shift by six; and
* ``out_q / OUT_SCALE`` is the model logit.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

import torch


ACT_SCALE = 127
W_SCALE = 64
OUT_SCALE = ACT_SCALE * W_SCALE

INT16_MIN = -(2**15)
INT16_MAX = 2**15 - 1
INT32_MIN = -(2**31)
INT32_MAX = 2**31 - 1

_QUANTIZED_NAMES = ("w1_board", "w1_hand", "b1", "w2", "b2", "w3", "b3")
_DUAL_QUANTIZED_NAMES = _QUANTIZED_NAMES + ("w4", "b4")


def _require_finite(value: torch.Tensor, name: str) -> None:
    if not bool(torch.isfinite(value).all().item()):
        raise ValueError(f"{name} contains a non-finite value")


def _check_int32(value: torch.Tensor, name: str) -> torch.Tensor:
    """Reject an integer result that a deployed int32 accumulator cannot hold."""
    if value.numel() == 0:
        return value
    minimum = int(value.min().item())
    maximum = int(value.max().item())
    if minimum < INT32_MIN or maximum > INT32_MAX:
        raise OverflowError(
            f"{name} exceeds the signed int32 range: min={minimum}, max={maximum}"
        )
    return value


def effective_w1(model: Any) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Build the effective first layer without severing autograd.

    Factored KP/HalfKP models store a bucket-local delta plus a shared table.
    Calling their historical materialized_w1 helper would run under no_grad;
    composing here keeps gradients connected to every parameter.
    """
    try:
        board_feats = int(model.board_feats)
        hand_feats = int(model.hand_feats)
        board_weight = model.board.weight
        hand_weight = model.hand.weight
        hand_bias = model.hand.bias
    except (AttributeError, TypeError, ValueError) as exc:
        raise TypeError("model does not expose the DistillNet first-layer contract") from exc

    if board_weight.ndim != 2 or board_weight.shape[0] < board_feats:
        raise ValueError("model.board.weight has an incompatible shape")
    if hand_weight.ndim != 2 or tuple(hand_weight.shape) != (
        board_weight.shape[1],
        hand_feats,
    ):
        raise ValueError("model.hand.weight has an incompatible shape")
    if hand_bias is None or tuple(hand_bias.shape) != (board_weight.shape[1],):
        raise ValueError("model.hand.bias has an incompatible shape")

    w1_board = board_weight[:board_feats]
    w1_hand = hand_weight.transpose(0, 1)

    if bool(getattr(model, "factored", False)):
        try:
            shared_board_weight = model.board_shared.weight
            shared_hand_weight = model.hand_shared.weight
        except AttributeError as exc:
            raise TypeError("factored model is missing its shared first-layer tables") from exc

        shared_board_feats = getattr(model.board_shared, "padding_idx", None)
        if shared_board_feats is None:
            shared_board_feats = shared_board_weight.shape[0] - 1
        shared_board_feats = int(shared_board_feats)
        shared_hand_feats = int(shared_hand_weight.shape[1])
        if (
            shared_board_feats <= 0
            or shared_hand_feats <= 0
            or board_feats % shared_board_feats
            or hand_feats % shared_hand_feats
        ):
            raise ValueError("factored first-layer dimensions do not form complete buckets")
        board_buckets = board_feats // shared_board_feats
        hand_buckets = hand_feats // shared_hand_feats
        if board_buckets != hand_buckets:
            raise ValueError("factored board and hand bucket counts disagree")
        declared_buckets = getattr(model, "bucket_count", board_buckets)
        if type(declared_buckets) is not int or declared_buckets != board_buckets:
            raise ValueError("factored model bucket_count disagrees with its tables")
        hidden = board_weight.shape[1]
        if tuple(shared_board_weight.shape) != (shared_board_feats + 1, hidden):
            raise ValueError("model.board_shared.weight has an incompatible shape")
        if tuple(shared_hand_weight.shape) != (hidden, shared_hand_feats):
            raise ValueError("model.hand_shared.weight has an incompatible shape")

        w1_board = w1_board + shared_board_weight[:shared_board_feats].repeat(
            board_buckets, 1
        )
        w1_hand = w1_hand + shared_hand_weight.transpose(0, 1).repeat(hand_buckets, 1)

    return w1_board, w1_hand, hand_bias


def _quantize_weight(value: torch.Tensor, scale: int, name: str) -> torch.Tensor:
    _require_finite(value, name)
    # torch.round is round-half-to-even.  Keep the source dtype here so this is
    # byte-for-byte identical to the historical exporter for float32 models.
    return torch.round(value * scale).clamp(INT16_MIN, INT16_MAX).to(torch.int16)


def _deployed_scaled_bias(value: torch.Tensor, scale: int) -> torch.Tensor:
    # Preserve the historical float32 operation order used by export-weights.py.
    # Multiplying by 8128 in one operation can round differently from *127 then
    # *64 for values sitting directly on a half-even boundary.
    if scale == OUT_SCALE:
        return value * ACT_SCALE * W_SCALE
    return value * scale


def _quantize_bias(value: torch.Tensor, scale: int, name: str) -> torch.Tensor:
    _require_finite(value, name)
    rounded = torch.round(_deployed_scaled_bias(value, scale))
    _check_int32(rounded, name)
    return rounded.to(torch.int32)


@torch.no_grad()
def quantize_model(model: Any) -> dict[str, torch.Tensor]:
    """Materialize the exact int16/int32 tensors consumed by production."""
    w1_board, w1_hand, b1 = effective_w1(model)
    dual = bool(getattr(model, "dual", False))
    try:
        w2 = model.l2.weight
        b2 = model.l2.bias
        w3 = model.l3.weight
        b3 = model.l3.bias
    except AttributeError as exc:
        raise TypeError("model does not expose the DistillNet dense-layer contract") from exc
    if b2 is None or b3 is None:
        raise ValueError("fixed-point layers require biases")
    if not dual and (model.l3.weight.ndim != 2 or model.l3.weight.shape[0] != 1):
        raise ValueError("model.l3.weight must have one output row")

    quantized = {
        "w1_board": _quantize_weight(w1_board, ACT_SCALE, "w1_board"),
        "w1_hand": _quantize_weight(w1_hand, ACT_SCALE, "w1_hand"),
        "b1": _quantize_bias(b1, ACT_SCALE, "b1"),
        "w2": _quantize_weight(w2, W_SCALE, "w2"),
        "b2": _quantize_bias(b2, ACT_SCALE * W_SCALE, "b2"),
        "w3": _quantize_weight(w3 if dual else w3.squeeze(0), W_SCALE, "w3"),
        "b3": _quantize_bias(b3, ACT_SCALE * W_SCALE, "b3"),
    }
    if dual:
        try:
            w4 = model.l4.weight
            b4 = model.l4.bias
        except AttributeError as exc:
            raise TypeError("dual model is missing its output layer") from exc
        if w4.ndim != 2 or w4.shape[0] != 1 or b4 is None:
            raise ValueError("dual model.l4 must have one biased output row")
        quantized["w4"] = _quantize_weight(w4.squeeze(0), W_SCALE, "w4")
        quantized["b4"] = _quantize_bias(
            b4, ACT_SCALE * W_SCALE, "b4"
        )
    return quantized


def _validated_qweights(qweights: Mapping[str, torch.Tensor]) -> dict[str, torch.Tensor]:
    dual = "w4" in qweights or "b4" in qweights
    names = _DUAL_QUANTIZED_NAMES if dual else _QUANTIZED_NAMES
    missing = [name for name in names if name not in qweights]
    if missing:
        raise ValueError(f"quantized weights are missing: {', '.join(missing)}")
    q = {name: qweights[name] for name in names}
    if any(not isinstance(value, torch.Tensor) for value in q.values()):
        raise TypeError("every quantized weight must be a torch.Tensor")
    int16_names = ("w1_board", "w1_hand", "w2", "w3") + (
        ("w4",) if dual else ()
    )
    for name in int16_names:
        if q[name].dtype != torch.int16:
            raise TypeError(f"{name} must have dtype torch.int16")
    int32_names = ("b1", "b2", "b3") + (("b4",) if dual else ())
    for name in int32_names:
        if q[name].dtype != torch.int32:
            raise TypeError(f"{name} must have dtype torch.int32")
    if q["w1_board"].ndim != 2 or q["w1_hand"].ndim != 2:
        raise ValueError("first-layer weights must be matrices")
    hidden1 = q["w1_board"].shape[1]
    if q["w1_hand"].shape[1] != hidden1 or tuple(q["b1"].shape) != (hidden1,):
        raise ValueError("first-layer quantized shapes disagree")
    expected_dense_input = hidden1 * (2 if dual else 1)
    if q["w2"].ndim != 2 or q["w2"].shape[1] != expected_dense_input:
        raise ValueError("w2 has an incompatible shape")
    hidden2 = q["w2"].shape[0]
    if tuple(q["b2"].shape) != (hidden2,):
        raise ValueError("second-layer quantized shapes disagree")
    if dual:
        if tuple(q["w3"].shape) != (hidden2, hidden2) or tuple(
            q["b3"].shape
        ) != (hidden2,):
            raise ValueError("dual third-layer quantized shapes disagree")
        if tuple(q["w4"].shape) != (hidden2,) or q["b4"].numel() != 1:
            raise ValueError("dual output-layer quantized shapes disagree")
    else:
        if tuple(q["w3"].shape) != (hidden2,):
            raise ValueError("second/third-layer quantized shapes disagree")
        if q["b3"].numel() != 1:
            raise ValueError("b3 must contain exactly one value")
    devices = {value.device for value in q.values()}
    if len(devices) != 1:
        raise ValueError("all quantized tensors must be on one device")
    return q


def _integer_inputs(
    board_idx: Any,
    hands: Any,
    *,
    device: torch.device,
    board_feats: int,
    hand_feats: int,
    pad_idx: int,
    dual: bool = False,
) -> tuple[torch.Tensor, torch.Tensor]:
    board = torch.as_tensor(board_idx, device=device)
    hand_values = torch.as_tensor(hands, device=device)
    if dual:
        if board.ndim == 2 and board.shape[0] == 2:
            board = board.unsqueeze(0)
        if hand_values.ndim == 2 and hand_values.shape[0] == 2:
            hand_values = hand_values.unsqueeze(0)
        if (
            board.ndim != 3
            or hand_values.ndim != 3
            or board.shape[1] != 2
            or hand_values.shape[1] != 2
        ):
            raise ValueError(
                "dual board_idx and hands must have shapes (batch,2,active) "
                "and (batch,2,features)"
            )
    else:
        if board.ndim == 1:
            board = board.unsqueeze(0)
        if hand_values.ndim == 1:
            hand_values = hand_values.unsqueeze(0)
        if board.ndim != 2 or hand_values.ndim != 2:
            raise ValueError("board_idx and hands must be one- or two-dimensional")
    if board.shape[0] != hand_values.shape[0]:
        raise ValueError("board_idx and hands batch sizes disagree")
    if hand_values.shape[-1] != hand_feats:
        raise ValueError(
            f"hands has {hand_values.shape[-1]} features; expected {hand_feats}"
        )
    if board.is_floating_point():
        if not bool(torch.isfinite(board).all().item()) or not bool(
            (board == torch.round(board)).all().item()
        ):
            raise ValueError("board_idx must contain finite integers")
    if hand_values.is_floating_point():
        if not bool(torch.isfinite(hand_values).all().item()) or not bool(
            (hand_values == torch.round(hand_values)).all().item()
        ):
            raise ValueError("hands must contain finite integer counts")
    board = board.to(torch.int64)
    hand_values = hand_values.to(torch.int64)
    valid_board = (board == pad_idx) | ((board >= 0) & (board < board_feats))
    if not bool(valid_board.all().item()):
        raise ValueError("board_idx contains an out-of-range feature")
    return board, hand_values


def int16_forward_batch(
    qweights: Mapping[str, torch.Tensor],
    board_idx: Any,
    hands: Any,
    pad_idx: int,
) -> torch.Tensor:
    """Run a batch through the deployed integer arithmetic.

    The result is an int64 tensor only so Python/PyTorch can return it without a
    narrowing conversion; every deployed accumulator is checked against int32
    before the next operation.
    """
    q = _validated_qweights(qweights)
    dual = "w4" in q
    device = q["w1_board"].device
    board, hand_values = _integer_inputs(
        board_idx,
        hands,
        device=device,
        board_feats=q["w1_board"].shape[0],
        hand_feats=q["w1_hand"].shape[0],
        pad_idx=int(pad_idx),
        dual=dual,
    )

    batch = board.shape[0]
    views = 2 if dual else 1
    board_flat = board.reshape(batch * views, board.shape[-1])
    hands_flat = hand_values.reshape(batch * views, hand_values.shape[-1])
    acc = (
        q["b1"]
        .to(torch.int64)
        .unsqueeze(0)
        .expand(batch * views, -1)
        .clone()
    )
    _check_int32(acc, "b1 accumulator")
    # Check after each logical addition, matching an int32 production
    # accumulator even for adversarial cancellation cases.
    for column in range(board_flat.shape[1]):
        feature = board_flat[:, column]
        active = feature != pad_idx
        safe_feature = torch.where(active, feature, torch.zeros_like(feature))
        term = q["w1_board"][safe_feature].to(torch.int64)
        term = torch.where(active.unsqueeze(1), term, torch.zeros_like(term))
        acc = _check_int32(acc + term, f"first-layer board accumulator[{column}]")
    for feature in range(hands_flat.shape[1]):
        term = (
            q["w1_hand"][feature].to(torch.int64).unsqueeze(0)
            * hands_flat[:, feature].unsqueeze(1)
        )
        acc = _check_int32(acc + term, f"first-layer hand accumulator[{feature}]")
    h1 = acc.clamp(0, ACT_SCALE)
    if dual:
        h1 = h1.reshape(batch, 2 * h1.shape[1])

    a2 = h1 @ q["w2"].to(torch.int64).transpose(0, 1)
    a2 = _check_int32(a2 + q["b2"].to(torch.int64), "second-layer accumulator")
    h2 = arithmetic_shift_six(a2).clamp(0, ACT_SCALE)

    if dual:
        a3 = h2 @ q["w3"].to(torch.int64).transpose(0, 1)
        a3 = _check_int32(
            a3 + q["b3"].to(torch.int64), "third-layer accumulator"
        )
        h3 = arithmetic_shift_six(a3).clamp(0, ACT_SCALE)
        out_q = h3 @ q["w4"].to(torch.int64)
        out_q = _check_int32(
            out_q + q["b4"].to(torch.int64).reshape(()),
            "output accumulator",
        )
    else:
        out_q = h2 @ q["w3"].to(torch.int64)
        out_q = _check_int32(
            out_q + q["b3"].to(torch.int64).reshape(()),
            "output accumulator",
        )
    return out_q


def arithmetic_shift_six(value: torch.Tensor) -> torch.Tensor:
    """Apply the deployed signed arithmetic ``>> 6`` operation."""
    if value.is_floating_point() or value.is_complex():
        raise TypeError("arithmetic_shift_six requires an integer tensor")
    # PyTorch's signed integer right shift is arithmetic, including negatives.
    return torch.bitwise_right_shift(value, 6)


def int16_forward(
    qweights: Mapping[str, torch.Tensor],
    board_idx: Any,
    hands: Any,
    pad_idx: int,
) -> int:
    """Scalar compatibility wrapper around :func:`int16_forward_batch`."""
    out_q = int16_forward_batch(qweights, board_idx, hands, pad_idx)
    if out_q.numel() != 1:
        raise ValueError("int16_forward expects exactly one position")
    return int(out_q.item())


def _ste_quantized_units(
    value: torch.Tensor,
    scale: int,
    *,
    clamp_int16: bool,
) -> torch.Tensor:
    """Integer-valued float64 forward, identity-through-scale backward."""
    _require_finite(value, "STE parameter")
    scaled = value.to(torch.float64) * scale
    # Use source-dtype arithmetic for the exact deployed rounded value.
    exact_source = value * scale if clamp_int16 else _deployed_scaled_bias(value, scale)
    exact = torch.round(exact_source)
    if clamp_int16:
        exact = exact.clamp(INT16_MIN, INT16_MAX)
    else:
        _check_int32(exact, "STE bias")
    exact = exact.to(torch.float64)
    return scaled + (exact - scaled).detach()


def _ste_arithmetic_shift_six(value: torch.Tensor) -> torch.Tensor:
    divided = value / W_SCALE
    shifted = torch.floor(divided)
    return divided + (shifted - divided).detach()


class _ExactForwardSurrogateBackward(torch.autograd.Function):
    @staticmethod
    def forward(  # type: ignore[override]
        ctx: Any, exact: torch.Tensor, surrogate: torch.Tensor
    ) -> torch.Tensor:
        if exact.shape != surrogate.shape or exact.dtype != surrogate.dtype:
            raise ValueError("exact and surrogate logits must have the same shape and dtype")
        return exact

    @staticmethod
    def backward(ctx: Any, grad_output: torch.Tensor) -> tuple[None, torch.Tensor]:
        return None, grad_output


def _expanded_hands(
    model: Any,
    hands: torch.Tensor,
    bucket: Any,
) -> torch.Tensor:
    hand_feats = int(model.hand_feats)
    dual = bool(getattr(model, "dual", False))
    if hands.shape[-1] == hand_feats:
        return hands
    raw_hand_feats = hands.shape[-1]
    if raw_hand_feats <= 0 or hand_feats % raw_hand_feats:
        raise ValueError("raw hand width does not divide the model hand width")
    bucket_count = hand_feats // raw_hand_feats
    declared_buckets = getattr(model, "bucket_count", bucket_count)
    if type(declared_buckets) is not int or declared_buckets != bucket_count:
        raise ValueError("model bucket_count disagrees with expanded hand width")
    if bucket is None:
        raise ValueError("bucket is required for bucketed hand features")
    buckets = torch.as_tensor(bucket, device=hands.device)
    if dual:
        if hands.ndim != 3 or hands.shape[1] != 2:
            raise ValueError("dual raw hands must have shape (batch,2,features)")
        if buckets.ndim != 2 or buckets.shape != hands.shape[:2]:
            raise ValueError("dual bucket must have shape (batch,2)")
        if buckets.is_floating_point() and not bool(
            (buckets == torch.round(buckets)).all().item()
        ):
            raise ValueError("bucket must contain integers")
        buckets = buckets.to(torch.int64)
        if not bool(((buckets >= 0) & (buckets < bucket_count)).all().item()):
            raise ValueError("bucket contains an out-of-range index")
        expanded = hands.new_zeros(
            hands.shape[0], 2, bucket_count, raw_hand_feats
        )
        rows = torch.arange(hands.shape[0], device=hands.device).unsqueeze(1).expand(-1, 2)
        views = torch.arange(2, device=hands.device).unsqueeze(0).expand(hands.shape[0], -1)
        expanded[rows, views, buckets] = hands
        return expanded.reshape(hands.shape[0], 2, hand_feats)
    if buckets.ndim == 0:
        buckets = buckets.unsqueeze(0)
    if buckets.ndim != 1 or buckets.shape[0] != hands.shape[0]:
        raise ValueError("bucket must have one entry per position")
    if buckets.is_floating_point() and not bool(
        (buckets == torch.round(buckets)).all().item()
    ):
        raise ValueError("bucket must contain integers")
    buckets = buckets.to(torch.int64)
    if not bool(((buckets >= 0) & (buckets < bucket_count)).all().item()):
        raise ValueError("bucket contains an out-of-range index")
    expanded = hands.new_zeros(hands.shape[0], bucket_count, raw_hand_feats)
    expanded[torch.arange(hands.shape[0], device=hands.device), buckets] = hands
    return expanded.reshape(hands.shape[0], hand_feats)


def int16_forward_ste(
    model: Any,
    board_idx: Any,
    hands: Any,
    bucket: Any = None,
) -> tuple[torch.Tensor, torch.Tensor]:
    """Fixed-point forward values with a differentiable STE surrogate.

    Returns ``(logits, out_q)`` with shape ``(batch,)``.  ``logits`` is exactly
    ``out_q.float64() / 8128`` in the forward pass; its backward pass follows
    quantized parameters, clipping, and a straight-through arithmetic shift.
    """
    try:
        reference_parameter = next(model.parameters())
        device = reference_parameter.device
        board_feats = int(model.board_feats)
        pad_idx = int(model.pad_idx)
    except (AttributeError, StopIteration, TypeError, ValueError) as exc:
        raise TypeError("model does not expose the DistillNet fixed-point contract") from exc

    board = torch.as_tensor(board_idx, device=device)
    raw_hands = torch.as_tensor(hands, device=device)
    dual = bool(getattr(model, "dual", False))
    if dual:
        if board.ndim == 2 and board.shape[0] == 2:
            board = board.unsqueeze(0)
        if raw_hands.ndim == 2 and raw_hands.shape[0] == 2:
            raw_hands = raw_hands.unsqueeze(0)
        if (
            board.ndim != 3
            or raw_hands.ndim != 3
            or board.shape[0] != raw_hands.shape[0]
            or board.shape[1] != 2
            or raw_hands.shape[1] != 2
        ):
            raise ValueError("dual board_idx and hands must be compatible batched views")
    else:
        if board.ndim == 1:
            board = board.unsqueeze(0)
        if raw_hands.ndim == 1:
            raw_hands = raw_hands.unsqueeze(0)
        if board.ndim != 2 or raw_hands.ndim != 2 or board.shape[0] != raw_hands.shape[0]:
            raise ValueError("board_idx and hands must be compatible batched matrices")
    if board.is_floating_point() and (
        not bool(torch.isfinite(board).all().item())
        or not bool((board == torch.round(board)).all().item())
    ):
        raise ValueError("board_idx must contain finite integers")
    board = board.to(torch.int64)
    hands_expanded = _expanded_hands(model, raw_hands, bucket)

    # The exact branch is the single shared production reference.  It is
    # detached by construction and cannot leak a false integer gradient.
    qweights = quantize_model(model)
    out_q = int16_forward_batch(qweights, board, hands_expanded.detach(), pad_idx)

    w1_board, w1_hand, b1 = effective_w1(model)
    qw1_board = _ste_quantized_units(w1_board, ACT_SCALE, clamp_int16=True)
    qw1_hand = _ste_quantized_units(w1_hand, ACT_SCALE, clamp_int16=True)
    qb1 = _ste_quantized_units(b1, ACT_SCALE, clamp_int16=False)
    qw2 = _ste_quantized_units(model.l2.weight, W_SCALE, clamp_int16=True)
    qb2 = _ste_quantized_units(
        model.l2.bias, ACT_SCALE * W_SCALE, clamp_int16=False
    )
    qw3 = _ste_quantized_units(
        model.l3.weight if dual else model.l3.weight.squeeze(0),
        W_SCALE,
        clamp_int16=True,
    )
    qb3 = _ste_quantized_units(
        model.l3.bias, ACT_SCALE * W_SCALE, clamp_int16=False
    )

    valid_board = (board == pad_idx) | ((board >= 0) & (board < board_feats))
    if not bool(valid_board.all().item()):
        raise ValueError("board_idx contains an out-of-range feature")
    pad_row = qw1_board.new_zeros(1, qw1_board.shape[1])
    qw1_with_pad = torch.cat((qw1_board, pad_row), dim=0)
    a1 = qw1_with_pad[board].sum(dim=-2)
    a1 = a1 + hands_expanded.to(torch.float64) @ qw1_hand + qb1
    h1 = a1.clamp(0, ACT_SCALE)
    if dual:
        h1 = h1.reshape(h1.shape[0], 2 * h1.shape[-1])
    a2 = h1 @ qw2.transpose(0, 1) + qb2
    h2 = _ste_arithmetic_shift_six(a2).clamp(0, ACT_SCALE)
    if dual:
        qw4 = _ste_quantized_units(
            model.l4.weight.squeeze(0), W_SCALE, clamp_int16=True
        )
        qb4 = _ste_quantized_units(
            model.l4.bias, ACT_SCALE * W_SCALE, clamp_int16=False
        )
        a3 = h2 @ qw3.transpose(0, 1) + qb3
        h3 = _ste_arithmetic_shift_six(a3).clamp(0, ACT_SCALE)
        surrogate_logits = (h3 @ qw4 + qb4.reshape(())) / OUT_SCALE
    else:
        surrogate_logits = (h2 @ qw3 + qb3.reshape(())) / OUT_SCALE
    _require_finite(surrogate_logits, "STE logits")

    exact_logits = out_q.to(dtype=torch.float64) / OUT_SCALE
    logits = _ExactForwardSurrogateBackward.apply(exact_logits, surrogate_logits)
    return logits, out_q


__all__ = [
    "ACT_SCALE",
    "W_SCALE",
    "OUT_SCALE",
    "arithmetic_shift_six",
    "effective_w1",
    "quantize_model",
    "int16_forward",
    "int16_forward_batch",
    "int16_forward_ste",
]
