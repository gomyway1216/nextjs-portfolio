"""Quantized-cell preservation and float/int consistency for v2 retraining.

The v2 lane deliberately supports only the unfactored ``features="board"``
``DistillNet`` contract.  Every optimizer step may move float parameters inside
their deployment quantization cells.  Coordinates that cross a cell boundary
are restored from the captured parent, and the corresponding Adam moments are
cleared so momentum cannot immediately push them across the same boundary.

Call :func:`project_optimizer_step_to_anchor` immediately after
``optimizer.step()``.  It always restores the embedding padding row, projects
all seven deployed tensors, then directly re-quantizes and checks exact
equality with the anchor.  A sealed fast validation avoids rehashing the full
anchor on every batch.
"""

from __future__ import annotations

import ctypes
import hashlib
import json
import math
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

import torch
from torch.nn import functional as F

from int16_forward import quantize_model


QUANTIZED_TENSOR_NAMES = (
    "w1_board",
    "w1_hand",
    "b1",
    "w2",
    "b2",
    "w3",
    "b3",
)
SOURCE_PARAMETER_NAMES = (
    "board.weight",
    "hand.weight",
    "hand.bias",
    "l2.weight",
    "l2.bias",
    "l3.weight",
    "l3.bias",
)

ANCHOR_SCHEMA = "shogi-strength-first-quantized-cell-anchor-v2"
PROJECTION_SCHEMA = "shogi-strength-first-quantized-cell-projection-v2"

DEFAULT_K_SIGMOID = 600.0
DEFAULT_POLICY_TEMPERATURE_CP = 200.0
DEFAULT_HUBER_BETA = 1.0 / 64.0
DEFAULT_POLICY_WEIGHT = 0.25

_WEIGHT_TENSORS = frozenset(("w1_board", "w1_hand", "w2", "w3"))
_BIAS_TENSORS = frozenset(("b1", "b2", "b3"))
_ADAM_MOMENT_NAMES = ("exp_avg", "exp_avg_sq", "max_exp_avg_sq")
_TENSOR_HASH_DOMAIN = b"shogi-strength-first-qcell-v2/tensor\0"
_AGGREGATE_HASH_DOMAIN = b"shogi-strength-first-qcell-v2/aggregate\0"
_FLOAT_TENSOR_HASH_DOMAIN = b"shogi-strength-first-qcell-v2/parent-float-tensor\0"
_FLOAT_AGGREGATE_HASH_DOMAIN = b"shogi-strength-first-qcell-v2/parent-float-aggregate\0"


@dataclass(frozen=True)
class _AnchorRuntimeSeal:
    float_mapping_id: int
    quantized_mapping_id: int
    hash_mapping_id: int
    float_signatures: tuple[tuple[str, int, int], ...]
    quantized_signatures: tuple[tuple[str, int, int], ...]
    hashes: tuple[tuple[str, str], ...]
    aggregate_sha256: str
    float_hashes: tuple[tuple[str, str], ...]
    float_aggregate_sha256: str


@dataclass(frozen=True)
class QuantizedAnchor:
    """Immutable-by-convention snapshot of a parent quantization cell.

    Tensor values are detached, cloned, contiguous CPU tensors.  The mapping
    objects remain public so the captured quantized tensors can be passed
    directly to the shared integer forward implementation.
    """

    schema: str
    board_feats: int
    hand_feats: int
    pad_idx: int
    hidden1: int
    hidden2: int
    float_state: Mapping[str, torch.Tensor]
    quantized: Mapping[str, torch.Tensor]
    per_tensor_sha256: Mapping[str, str]
    aggregate_sha256: str
    _runtime_seal: _AnchorRuntimeSeal | None = field(
        default=None,
        repr=False,
        compare=False,
    )

    @property
    def parent_state(self) -> Mapping[str, torch.Tensor]:
        """Compatibility alias emphasizing that the float state is the parent."""
        return self.float_state

    @property
    def qweights(self) -> Mapping[str, torch.Tensor]:
        """Compatibility alias for consumers using the int16-forward name."""
        return self.quantized

    @property
    def tensor_sha256(self) -> Mapping[str, str]:
        """Compatibility alias for the per-tensor bit hashes."""
        return self.per_tensor_sha256


@dataclass(frozen=True)
class _ModelContract:
    parameters: Mapping[str, torch.nn.Parameter]
    board_feats: int
    hand_feats: int
    pad_idx: int
    hidden1: int
    hidden2: int


def _strict_positive_int(value: Any, label: str) -> int:
    if type(value) is not int or value <= 0:
        raise ValueError(f"{label} must be a positive integer")
    return value


def _board_model_contract(model: Any) -> _ModelContract:
    if getattr(model, "features", None) != "board":
        raise ValueError('quantized-cell alignment requires features="board"')
    if getattr(model, "kp", None) is not False:
        raise ValueError("quantized-cell alignment does not support KP models")
    if getattr(model, "factored", None) is not False:
        raise ValueError("quantized-cell alignment does not support factored models")

    board_feats = _strict_positive_int(
        getattr(model, "board_feats", None), "model.board_feats"
    )
    hand_feats = _strict_positive_int(
        getattr(model, "hand_feats", None), "model.hand_feats"
    )
    pad_idx = getattr(model, "pad_idx", None)
    if type(pad_idx) is not int or pad_idx != board_feats:
        raise ValueError("model.pad_idx must equal model.board_feats")

    try:
        named_parameters = dict(model.named_parameters())
    except AttributeError as exc:
        raise TypeError("model must expose named DistillNet parameters") from exc
    actual_names = set(named_parameters)
    expected_names = set(SOURCE_PARAMETER_NAMES)
    if actual_names != expected_names:
        missing = sorted(expected_names - actual_names)
        unexpected = sorted(actual_names - expected_names)
        details = []
        if missing:
            details.append(f"missing={missing}")
        if unexpected:
            details.append(f"unexpected={unexpected}")
        raise ValueError(
            "model parameters do not match the board DistillNet contract: "
            + ", ".join(details)
        )
    parameters = {name: named_parameters[name] for name in SOURCE_PARAMETER_NAMES}
    if any(not value.is_floating_point() for value in parameters.values()):
        raise TypeError("every DistillNet source parameter must be floating point")

    board = parameters["board.weight"]
    if board.ndim != 2 or board.shape[0] != board_feats + 1:
        raise ValueError("model.board.weight has an incompatible shape")
    hidden1 = _strict_positive_int(board.shape[1], "first hidden width")
    try:
        board_padding_idx = model.board.padding_idx
        board_mode = model.board.mode
    except AttributeError as exc:
        raise TypeError("model.board must expose the EmbeddingBag contract") from exc
    if board_padding_idx != pad_idx or board_mode != "sum":
        raise ValueError("model.board must be a sum EmbeddingBag with pad_idx padding")

    expected_shapes = {
        "hand.weight": (hidden1, hand_feats),
        "hand.bias": (hidden1,),
    }
    for name, shape in expected_shapes.items():
        if tuple(parameters[name].shape) != shape:
            raise ValueError(f"model.{name} has an incompatible shape")

    l2_weight = parameters["l2.weight"]
    if l2_weight.ndim != 2 or l2_weight.shape[1] != hidden1:
        raise ValueError("model.l2.weight has an incompatible shape")
    hidden2 = _strict_positive_int(l2_weight.shape[0], "second hidden width")
    dense_shapes = {
        "l2.bias": (hidden2,),
        "l3.weight": (1, hidden2),
        "l3.bias": (1,),
    }
    for name, shape in dense_shapes.items():
        if tuple(parameters[name].shape) != shape:
            raise ValueError(f"model.{name} has an incompatible shape")

    return _ModelContract(
        parameters=parameters,
        board_feats=board_feats,
        hand_feats=hand_feats,
        pad_idx=pad_idx,
        hidden1=hidden1,
        hidden2=hidden2,
    )


def _validated_quantized(
    quantized: Mapping[str, torch.Tensor],
) -> dict[str, torch.Tensor]:
    if not isinstance(quantized, Mapping):
        raise TypeError("quantized tensors must be a mapping")
    actual_names = set(quantized)
    expected_names = set(QUANTIZED_TENSOR_NAMES)
    if actual_names != expected_names:
        missing = sorted(expected_names - actual_names)
        unexpected = sorted(actual_names - expected_names)
        raise ValueError(
            "quantized tensor names disagree with the seven-tensor contract: "
            f"missing={missing}, unexpected={unexpected}"
        )
    values = {name: quantized[name] for name in QUANTIZED_TENSOR_NAMES}
    if any(not isinstance(value, torch.Tensor) for value in values.values()):
        raise TypeError("every quantized value must be a torch.Tensor")
    for name in _WEIGHT_TENSORS:
        if values[name].dtype != torch.int16:
            raise TypeError(f"{name} must have dtype torch.int16")
    for name in _BIAS_TENSORS:
        if values[name].dtype != torch.int32:
            raise TypeError(f"{name} must have dtype torch.int32")

    w1_board = values["w1_board"]
    w1_hand = values["w1_hand"]
    if w1_board.ndim != 2 or w1_board.shape[0] <= 0 or w1_board.shape[1] <= 0:
        raise ValueError("w1_board must be a non-empty matrix")
    hidden1 = w1_board.shape[1]
    if (
        w1_hand.ndim != 2
        or w1_hand.shape[0] <= 0
        or w1_hand.shape[1] != hidden1
        or tuple(values["b1"].shape) != (hidden1,)
    ):
        raise ValueError("first-layer quantized shapes disagree")
    w2 = values["w2"]
    if w2.ndim != 2 or w2.shape[0] <= 0 or w2.shape[1] != hidden1:
        raise ValueError("w2 has an incompatible shape")
    hidden2 = w2.shape[0]
    if (
        tuple(values["b2"].shape) != (hidden2,)
        or tuple(values["w3"].shape) != (hidden2,)
        or tuple(values["b3"].shape) != (1,)
    ):
        raise ValueError("second/third-layer quantized shapes disagree")
    return values


def _validate_quantized_against_model(
    quantized: Mapping[str, torch.Tensor], contract: _ModelContract
) -> None:
    expected_shapes = {
        "w1_board": (contract.board_feats, contract.hidden1),
        "w1_hand": (contract.hand_feats, contract.hidden1),
        "b1": (contract.hidden1,),
        "w2": (contract.hidden2, contract.hidden1),
        "b2": (contract.hidden2,),
        "w3": (contract.hidden2,),
        "b3": (1,),
    }
    for name in QUANTIZED_TENSOR_NAMES:
        if tuple(quantized[name].shape) != expected_shapes[name]:
            raise ValueError(f"{name} does not match the model shape contract")


def _cpu_clone(value: torch.Tensor) -> torch.Tensor:
    return value.detach().cpu().contiguous().clone()


def _tensor_runtime_signature(name: str, value: torch.Tensor) -> tuple[str, int, int]:
    return name, id(value), int(getattr(value, "_version"))


def _make_runtime_seal(
    float_state: Mapping[str, torch.Tensor],
    quantized: Mapping[str, torch.Tensor],
    per_tensor_sha256: Mapping[str, str],
    aggregate_sha256: str,
    float_per_tensor_sha256: Mapping[str, str],
    float_aggregate_sha256: str,
) -> _AnchorRuntimeSeal:
    return _AnchorRuntimeSeal(
        float_mapping_id=id(float_state),
        quantized_mapping_id=id(quantized),
        hash_mapping_id=id(per_tensor_sha256),
        float_signatures=tuple(
            _tensor_runtime_signature(name, float_state[name])
            for name in SOURCE_PARAMETER_NAMES
        ),
        quantized_signatures=tuple(
            _tensor_runtime_signature(name, quantized[name])
            for name in QUANTIZED_TENSOR_NAMES
        ),
        hashes=tuple(
            (name, per_tensor_sha256[name]) for name in QUANTIZED_TENSOR_NAMES
        ),
        aggregate_sha256=aggregate_sha256,
        float_hashes=tuple(
            (name, float_per_tensor_sha256[name]) for name in SOURCE_PARAMETER_NAMES
        ),
        float_aggregate_sha256=float_aggregate_sha256,
    )


def _canonical_json(value: Mapping[str, Any]) -> bytes:
    return json.dumps(
        value,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("ascii")


def _little_endian_tensor_bytes(value: torch.Tensor) -> bytes:
    snapshot = _cpu_clone(value)
    width = snapshot.element_size()
    expected_length = snapshot.numel() * width
    # ``bytes(untyped_storage)`` iterates through Python and costs roughly one
    # second for the real first-layer table.  ``string_at`` performs the same
    # bounded copy in C and deliberately uses only the cloned tensor's logical
    # byte length, so unused backing storage remains excluded.
    raw = ctypes.string_at(snapshot.data_ptr(), expected_length)
    if sys.byteorder == "big" and width > 1:
        raw = b"".join(
            raw[offset : offset + width][::-1] for offset in range(0, len(raw), width)
        )
    return raw


def canonical_quantized_bit_hashes(
    quantized: Mapping[str, torch.Tensor],
) -> tuple[dict[str, str], str]:
    """Return canonical SHA-256 hashes of the seven exact integer tensors.

    Each tensor hash covers a versioned domain, canonical name/dtype/shape
    metadata, and C-order little-endian bytes with explicit length framing.
    The aggregate hash covers the seven binary digests in deployment order.
    This excludes unused backing storage and is independent of tensor views.
    """
    values = _validated_quantized(quantized)
    per_tensor: dict[str, str] = {}
    for name in QUANTIZED_TENSOR_NAMES:
        value = values[name]
        metadata = _canonical_json(
            {
                "dtype": str(value.dtype).removeprefix("torch."),
                "name": name,
                "shape": list(value.shape),
            }
        )
        raw = _little_endian_tensor_bytes(value)
        digest = hashlib.sha256()
        digest.update(_TENSOR_HASH_DOMAIN)
        digest.update(len(metadata).to_bytes(8, "big"))
        digest.update(metadata)
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
        per_tensor[name] = digest.hexdigest()

    aggregate = hashlib.sha256()
    aggregate.update(_AGGREGATE_HASH_DOMAIN)
    for name in QUANTIZED_TENSOR_NAMES:
        encoded_name = name.encode("ascii")
        aggregate.update(len(encoded_name).to_bytes(8, "big"))
        aggregate.update(encoded_name)
        aggregate.update(bytes.fromhex(per_tensor[name]))
    return per_tensor, aggregate.hexdigest()


def canonical_float_parent_bit_hashes(
    float_state: Mapping[str, torch.Tensor],
) -> tuple[dict[str, str], str]:
    """Hash the seven exact parent float tensors in a separate domain."""

    if not isinstance(float_state, Mapping):
        raise TypeError("parent float tensors must be a mapping")
    if set(float_state) != set(SOURCE_PARAMETER_NAMES):
        raise ValueError("parent float tensor names are incomplete or unexpected")
    per_tensor: dict[str, str] = {}
    for name in SOURCE_PARAMETER_NAMES:
        value = float_state[name]
        if (
            not isinstance(value, torch.Tensor)
            or not value.is_floating_point()
            or value.layout != torch.strided
        ):
            raise TypeError(f"parent float tensor {name} is invalid")
        metadata = _canonical_json(
            {
                "dtype": str(value.dtype).removeprefix("torch."),
                "name": name,
                "shape": list(value.shape),
            }
        )
        raw = _little_endian_tensor_bytes(value)
        digest = hashlib.sha256()
        digest.update(_FLOAT_TENSOR_HASH_DOMAIN)
        digest.update(len(metadata).to_bytes(8, "big"))
        digest.update(metadata)
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
        per_tensor[name] = digest.hexdigest()

    aggregate = hashlib.sha256()
    aggregate.update(_FLOAT_AGGREGATE_HASH_DOMAIN)
    for name in SOURCE_PARAMETER_NAMES:
        encoded_name = name.encode("ascii")
        aggregate.update(len(encoded_name).to_bytes(8, "big"))
        aggregate.update(encoded_name)
        aggregate.update(bytes.fromhex(per_tensor[name]))
    return per_tensor, aggregate.hexdigest()


def _validate_anchor_integrity(anchor: QuantizedAnchor) -> None:
    if not isinstance(anchor, QuantizedAnchor):
        raise TypeError("anchor must be a QuantizedAnchor")
    if anchor.schema != ANCHOR_SCHEMA:
        raise ValueError("anchor schema is not the v2 quantized-cell schema")
    for value, label in (
        (anchor.board_feats, "anchor.board_feats"),
        (anchor.hand_feats, "anchor.hand_feats"),
        (anchor.hidden1, "anchor.hidden1"),
        (anchor.hidden2, "anchor.hidden2"),
    ):
        _strict_positive_int(value, label)
    if type(anchor.pad_idx) is not int or anchor.pad_idx != anchor.board_feats:
        raise ValueError("anchor.pad_idx must equal anchor.board_feats")

    quantized = _validated_quantized(anchor.quantized)
    expected_q_shapes = {
        "w1_board": (anchor.board_feats, anchor.hidden1),
        "w1_hand": (anchor.hand_feats, anchor.hidden1),
        "b1": (anchor.hidden1,),
        "w2": (anchor.hidden2, anchor.hidden1),
        "b2": (anchor.hidden2,),
        "w3": (anchor.hidden2,),
        "b3": (1,),
    }
    for name, shape in expected_q_shapes.items():
        if tuple(quantized[name].shape) != shape:
            raise ValueError(f"anchor {name} has an incompatible shape")

    if not isinstance(anchor.float_state, Mapping):
        raise TypeError("anchor.float_state must be a mapping")
    if set(anchor.float_state) != set(SOURCE_PARAMETER_NAMES):
        raise ValueError("anchor.float_state names are incomplete or unexpected")
    expected_float_shapes = {
        "board.weight": (anchor.board_feats + 1, anchor.hidden1),
        "hand.weight": (anchor.hidden1, anchor.hand_feats),
        "hand.bias": (anchor.hidden1,),
        "l2.weight": (anchor.hidden2, anchor.hidden1),
        "l2.bias": (anchor.hidden2,),
        "l3.weight": (1, anchor.hidden2),
        "l3.bias": (1,),
    }
    for name in SOURCE_PARAMETER_NAMES:
        value = anchor.float_state[name]
        if not isinstance(value, torch.Tensor) or not value.is_floating_point():
            raise TypeError(f"anchor float state {name} must be a floating tensor")
        if tuple(value.shape) != expected_float_shapes[name]:
            raise ValueError(f"anchor float state {name} has an incompatible shape")
        if not bool(torch.isfinite(value).all().item()):
            raise ValueError(f"anchor float state {name} contains a non-finite value")

    per_tensor, aggregate = canonical_quantized_bit_hashes(quantized)
    if dict(anchor.per_tensor_sha256) != per_tensor:
        raise ValueError("anchor per-tensor hashes do not match its quantized bits")
    if anchor.aggregate_sha256 != aggregate:
        raise ValueError("anchor aggregate hash does not match its quantized bits")


def _validate_anchor_for_model(
    anchor: QuantizedAnchor, contract: _ModelContract
) -> None:
    _validate_anchor_integrity(anchor)
    dimensions = (
        (anchor.board_feats, contract.board_feats, "board_feats"),
        (anchor.hand_feats, contract.hand_feats, "hand_feats"),
        (anchor.pad_idx, contract.pad_idx, "pad_idx"),
        (anchor.hidden1, contract.hidden1, "hidden1"),
        (anchor.hidden2, contract.hidden2, "hidden2"),
    )
    mismatch = [name for captured, current, name in dimensions if captured != current]
    if mismatch:
        raise ValueError(
            "anchor dimensions do not match the current model: " + ", ".join(mismatch)
        )


def _validate_captured_anchor_fast(
    anchor: QuantizedAnchor, contract: _ModelContract
) -> None:
    """Validate the capture seal and authoritative quantized bits every batch."""
    if not isinstance(anchor, QuantizedAnchor):
        raise TypeError("anchor must be a QuantizedAnchor")
    if anchor.schema != ANCHOR_SCHEMA:
        raise ValueError("anchor schema is not the v2 quantized-cell schema")
    dimensions = (
        (anchor.board_feats, contract.board_feats, "board_feats"),
        (anchor.hand_feats, contract.hand_feats, "hand_feats"),
        (anchor.pad_idx, contract.pad_idx, "pad_idx"),
        (anchor.hidden1, contract.hidden1, "hidden1"),
        (anchor.hidden2, contract.hidden2, "hidden2"),
    )
    mismatch = [name for captured, current, name in dimensions if captured != current]
    if mismatch:
        raise ValueError(
            "anchor dimensions do not match the current model: " + ", ".join(mismatch)
        )

    seal = anchor._runtime_seal
    if seal is None:
        raise ValueError(
            "projection requires an anchor produced by capture_quantized_anchor"
        )
    if (
        id(anchor.float_state) != seal.float_mapping_id
        or id(anchor.quantized) != seal.quantized_mapping_id
        or id(anchor.per_tensor_sha256) != seal.hash_mapping_id
        or anchor.aggregate_sha256 != seal.aggregate_sha256
    ):
        raise ValueError("captured anchor metadata was replaced after capture")
    try:
        float_signatures = tuple(
            _tensor_runtime_signature(name, anchor.float_state[name])
            for name in SOURCE_PARAMETER_NAMES
        )
        quantized_signatures = tuple(
            _tensor_runtime_signature(name, anchor.quantized[name])
            for name in QUANTIZED_TENSOR_NAMES
        )
        hashes = tuple(
            (name, anchor.per_tensor_sha256[name]) for name in QUANTIZED_TENSOR_NAMES
        )
    except (KeyError, TypeError) as exc:
        raise ValueError("captured anchor mappings changed after capture") from exc
    if (
        set(anchor.float_state) != set(SOURCE_PARAMETER_NAMES)
        or set(anchor.quantized) != set(QUANTIZED_TENSOR_NAMES)
        or set(anchor.per_tensor_sha256) != set(QUANTIZED_TENSOR_NAMES)
        or float_signatures != seal.float_signatures
        or quantized_signatures != seal.quantized_signatures
        or hashes != seal.hashes
    ):
        raise ValueError("captured anchor tensors changed after capture")
    observed_hashes, observed_aggregate = canonical_quantized_bit_hashes(
        anchor.quantized
    )
    if (
        tuple((name, observed_hashes[name]) for name in QUANTIZED_TENSOR_NAMES)
        != seal.hashes
        or observed_aggregate != seal.aggregate_sha256
    ):
        raise ValueError("captured anchor quantized bits changed after capture")
    observed_float_hashes, observed_float_aggregate = canonical_float_parent_bit_hashes(
        anchor.float_state
    )
    if (
        tuple((name, observed_float_hashes[name]) for name in SOURCE_PARAMETER_NAMES)
        != seal.float_hashes
        or observed_float_aggregate != seal.float_aggregate_sha256
    ):
        raise ValueError("captured anchor parent float bits changed after capture")


def capture_quantized_anchor(model: Any) -> QuantizedAnchor:
    """Capture parent float values and all seven deployed quantized tensors."""
    contract = _board_model_contract(model)
    current_quantized = _validated_quantized(quantize_model(model))
    _validate_quantized_against_model(current_quantized, contract)
    float_state = {
        name: _cpu_clone(contract.parameters[name]) for name in SOURCE_PARAMETER_NAMES
    }
    for name, value in float_state.items():
        if not bool(torch.isfinite(value).all().item()):
            raise ValueError(f"model parent state {name} contains a non-finite value")
    quantized = {
        name: _cpu_clone(current_quantized[name]) for name in QUANTIZED_TENSOR_NAMES
    }
    per_tensor, aggregate = canonical_quantized_bit_hashes(quantized)
    float_per_tensor, float_aggregate = canonical_float_parent_bit_hashes(float_state)
    runtime_seal = _make_runtime_seal(
        float_state,
        quantized,
        per_tensor,
        aggregate,
        float_per_tensor,
        float_aggregate,
    )
    return QuantizedAnchor(
        schema=ANCHOR_SCHEMA,
        board_feats=contract.board_feats,
        hand_feats=contract.hand_feats,
        pad_idx=contract.pad_idx,
        hidden1=contract.hidden1,
        hidden2=contract.hidden2,
        float_state=float_state,
        quantized=quantized,
        per_tensor_sha256=per_tensor,
        aggregate_sha256=aggregate,
        _runtime_seal=runtime_seal,
    )


def anchor_identity(anchor: QuantizedAnchor) -> dict[str, Any]:
    """Return the canonical, JSON-serializable anchor provenance identity."""
    _validate_anchor_integrity(anchor)
    tensors = {}
    for name in QUANTIZED_TENSOR_NAMES:
        value = anchor.quantized[name]
        tensors[name] = {
            "dtype": str(value.dtype).removeprefix("torch."),
            "shape": list(value.shape),
            "sha256": anchor.per_tensor_sha256[name],
        }
    return {
        "schema": ANCHOR_SCHEMA,
        "aggregate_sha256": anchor.aggregate_sha256,
        "tensors": tensors,
    }


def assert_quantized_anchor(
    model: Any, anchor: QuantizedAnchor, context: str = "quantized anchor"
) -> None:
    """Assert exact ``torch.equal`` equality for every deployed tensor."""
    if not isinstance(context, str) or not context:
        raise ValueError("context must be a non-empty string")
    contract = _board_model_contract(model)
    _validate_anchor_for_model(anchor, contract)
    current = _validated_quantized(quantize_model(model))
    _validate_quantized_against_model(current, contract)
    mismatches = []
    for name in QUANTIZED_TENSOR_NAMES:
        actual = _cpu_clone(current[name])
        expected = anchor.quantized[name]
        if not torch.equal(actual, expected):
            count = int(torch.count_nonzero(actual != expected).item())
            mismatches.append(f"{name}({count})")
    if mismatches:
        raise AssertionError(
            f"{context}: quantized tensors left the anchor cells: "
            + ", ".join(mismatches)
        )


def _source_masks(
    contract: _ModelContract,
    mismatches: Mapping[str, torch.Tensor],
) -> dict[str, torch.Tensor]:
    parameters = contract.parameters
    board_mask = torch.zeros_like(parameters["board.weight"], dtype=torch.bool)
    board_mask[: contract.board_feats].copy_(mismatches["w1_board"])
    board_mask[contract.pad_idx].fill_(True)
    return {
        "board.weight": board_mask,
        "hand.weight": mismatches["w1_hand"].transpose(0, 1).contiguous(),
        "hand.bias": mismatches["b1"],
        "l2.weight": mismatches["w2"],
        "l2.bias": mismatches["b2"],
        "l3.weight": mismatches["w3"].unsqueeze(0),
        "l3.bias": mismatches["b3"].reshape(1),
    }


def _validate_optimizer_state(
    optimizer: Any,
    contract: _ModelContract,
) -> None:
    try:
        parameter_groups = optimizer.param_groups
        optimizer_state = optimizer.state
    except AttributeError as exc:
        raise TypeError("optimizer must expose the torch optimizer contract") from exc
    owned_ids = {
        id(parameter)
        for group in parameter_groups
        for parameter in group.get("params", ())
    }
    missing = [
        name
        for name, parameter in contract.parameters.items()
        if id(parameter) not in owned_ids
    ]
    if missing:
        raise ValueError(
            "optimizer does not own every aligned model parameter: "
            + ", ".join(missing)
        )
    for name, parameter in contract.parameters.items():
        state = optimizer_state.get(parameter, {})
        if not isinstance(state, Mapping):
            raise TypeError(f"optimizer state for {name} must be a mapping")
        for moment_name in _ADAM_MOMENT_NAMES:
            if moment_name not in state:
                continue
            moment = state[moment_name]
            if not isinstance(moment, torch.Tensor):
                raise TypeError(f"optimizer {moment_name} for {name} must be a tensor")
            if tuple(moment.shape) != tuple(parameter.shape):
                raise ValueError(
                    f"optimizer {moment_name} for {name} has an incompatible shape"
                )
            if moment.layout != torch.strided:
                raise ValueError(
                    f"optimizer {moment_name} for {name} must be a dense tensor"
                )


def project_optimizer_step_to_anchor(
    model: Any,
    optimizer: Any,
    anchor: QuantizedAnchor,
) -> dict[str, Any]:
    """Project one completed optimizer step back into the parent cells.

    This function must be called immediately after ``optimizer.step()``.  It
    compares newly quantized coordinates with the captured parent, restores
    only crossed source coordinates (plus the full padding row), clears Adam
    moments at those source masks, and directly re-quantizes for the exact
    post-projection invariant.
    """
    contract = _board_model_contract(model)
    _validate_captured_anchor_fast(anchor, contract)
    current = _validated_quantized(quantize_model(model))
    _validate_quantized_against_model(current, contract)
    mismatches = {
        name: current[name] != anchor.quantized[name].to(device=current[name].device)
        for name in QUANTIZED_TENSOR_NAMES
    }
    masks = _source_masks(contract, mismatches)
    _validate_optimizer_state(optimizer, contract)

    cleared_moments = {name: 0 for name in _ADAM_MOMENT_NAMES}
    with torch.no_grad():
        for name in SOURCE_PARAMETER_NAMES:
            parameter = contract.parameters[name]
            mask = masks[name]
            parent_value = anchor.float_state[name].to(
                device=parameter.device, dtype=parameter.dtype
            )
            parameter.copy_(torch.where(mask, parent_value, parameter))

            state = optimizer.state.get(parameter, {})
            restored_count = int(torch.count_nonzero(mask).item())
            for moment_name in _ADAM_MOMENT_NAMES:
                if moment_name not in state:
                    continue
                moment = state[moment_name]
                moment.masked_fill_(mask.to(device=moment.device), 0)
                cleared_moments[moment_name] += restored_count

    projected = _validated_quantized(quantize_model(model))
    _validate_quantized_against_model(projected, contract)
    for name in QUANTIZED_TENSOR_NAMES:
        expected = anchor.quantized[name].to(device=projected[name].device)
        if not torch.equal(projected[name], expected):
            count = int(torch.count_nonzero(projected[name] != expected).item())
            raise AssertionError(
                "post-step projection left quantized tensor "
                f"{name} outside the anchor at {count} coordinates"
            )

    quantized_counts = {
        name: int(torch.count_nonzero(mismatches[name]).item())
        for name in QUANTIZED_TENSOR_NAMES
    }
    total_quantized_crossings = sum(quantized_counts.values())
    return {
        "schema": PROJECTION_SCHEMA,
        "anchor_aggregate_sha256": anchor.aggregate_sha256,
        "quantized_crossing_coordinates": quantized_counts,
        "total_quantized_crossing_coordinates": total_quantized_crossings,
        # The pad row is not deployed and therefore has no q-cell crossing.
        # It is nevertheless restored unconditionally after every step.
        "forced_padding_coordinates": contract.hidden1,
        "total_restored_coordinates": total_quantized_crossings + contract.hidden1,
        "cleared_moment_coordinates": cleared_moments,
    }


def _validated_hyperparameter(value: Any, label: str, *, allow_zero: bool) -> float:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a finite number")
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{label} must be a finite number") from exc
    if not math.isfinite(parsed) or parsed < 0 or (not allow_zero and parsed == 0):
        qualifier = "non-negative" if allow_zero else "positive"
        raise ValueError(f"{label} must be finite and {qualifier}")
    return parsed


def _parent_slices(group_sizes: Sequence[int], row_count: int) -> tuple[slice, ...]:
    try:
        sizes = tuple(group_sizes)
    except TypeError as exc:
        raise ValueError("group_sizes must be an exact parent partition") from exc
    if not sizes or any(type(size) is not int or size <= 0 for size in sizes):
        raise ValueError("group_sizes must contain positive integer parent sizes")
    if sum(sizes) != row_count:
        raise ValueError("group_sizes must partition every logit row exactly")
    result = []
    start = 0
    for size in sizes:
        result.append(slice(start, start + size))
        start += size
    return tuple(result)


def alignment_consistency_loss(
    float_logits: torch.Tensor,
    exact_int_logits: torch.Tensor,
    group_sizes: Sequence[int],
    *,
    k_sigmoid: float = DEFAULT_K_SIGMOID,
    policy_temperature_cp: float = DEFAULT_POLICY_TEMPERATURE_CP,
    huber_beta: float = DEFAULT_HUBER_BETA,
    policy_weight: float = DEFAULT_POLICY_WEIGHT,
) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Align float logits to detached exact integer-network logits.

    Both inputs are normalized logits (the exact values are
    ``out_q / OUT_SCALE``).  SmoothL1 is row-mean.  Policy KL is first summed
    within each exact contiguous parent group, then averaged equally across
    parents.  The policy softmax uses parent-view scores, hence the single
    ``-logit * K / T`` sign conversion on both student and target.
    """
    if not isinstance(float_logits, torch.Tensor) or not isinstance(
        exact_int_logits, torch.Tensor
    ):
        raise TypeError("float_logits and exact_int_logits must be tensors")
    if float_logits.ndim != 1 or exact_int_logits.ndim != 1:
        raise ValueError("alignment logits must be one-dimensional")
    if float_logits.shape != exact_int_logits.shape:
        raise ValueError("float and exact integer logits must have identical shapes")
    if float_logits.numel() == 0:
        raise ValueError("alignment logits must not be empty")
    if not float_logits.is_floating_point() or not exact_int_logits.is_floating_point():
        raise TypeError("alignment inputs must contain normalized floating logits")
    if float_logits.device != exact_int_logits.device:
        raise ValueError("alignment logits must be on the same device")
    if not bool(torch.isfinite(float_logits).all().item()) or not bool(
        torch.isfinite(exact_int_logits).all().item()
    ):
        raise ValueError("alignment logits must be finite")

    k_value = _validated_hyperparameter(k_sigmoid, "k_sigmoid", allow_zero=False)
    temperature = _validated_hyperparameter(
        policy_temperature_cp,
        "policy_temperature_cp",
        allow_zero=False,
    )
    beta = _validated_hyperparameter(huber_beta, "huber_beta", allow_zero=False)
    weight = _validated_hyperparameter(policy_weight, "policy_weight", allow_zero=True)
    parent_slices = _parent_slices(group_sizes, float_logits.shape[0])

    target = exact_int_logits.detach()
    huber = F.smooth_l1_loss(float_logits, target, reduction="mean", beta=beta)
    parent_scale = -(k_value / temperature)
    policy_losses = []
    for parent_slice in parent_slices:
        student_log_policy = F.log_softmax(
            float_logits[parent_slice] * parent_scale,
            dim=0,
        )
        target_policy = F.softmax(target[parent_slice] * parent_scale, dim=0)
        policy_losses.append(
            F.kl_div(
                student_log_policy,
                target_policy,
                reduction="sum",
            )
        )
    policy = torch.stack(policy_losses).mean()
    total = huber + weight * policy
    return total, huber, policy


__all__ = [
    "ANCHOR_SCHEMA",
    "DEFAULT_HUBER_BETA",
    "DEFAULT_K_SIGMOID",
    "DEFAULT_POLICY_TEMPERATURE_CP",
    "DEFAULT_POLICY_WEIGHT",
    "PROJECTION_SCHEMA",
    "QUANTIZED_TENSOR_NAMES",
    "QuantizedAnchor",
    "alignment_consistency_loss",
    "anchor_identity",
    "assert_quantized_anchor",
    "canonical_quantized_bit_hashes",
    "canonical_float_parent_bit_hashes",
    "capture_quantized_anchor",
    "project_optimizer_step_to_anchor",
]
