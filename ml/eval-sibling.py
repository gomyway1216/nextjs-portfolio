#!/usr/bin/env python3
"""Compare checkpoints on one leak-free sibling evaluation partition.

Every dataset row is a *child* position after one candidate move.  Its ``cp``
is therefore from the child's side to move, while move choice is made from the
parent.  Ranking metrics flip both teacher and prediction exactly once:

    parent_cp = -child_cp

Value MAE/MSE use the same clamped child-view CP target as ``train.py``.  The
within-parent pair and teacher-top1 metrics use unclamped CP so that mate/high
scores retain their order.  All models are evaluated on the exact same parsed
rows.  By default the report also runs the integer reference implementation
from ``export-weights.py`` and exposes float-to-int16 metric deltas.

Example:

    ml/venv/bin/python ml/eval-sibling.py \
      --data ml/data/wcsc36/siblings.selection.jsonl \
      --sibling-manifest ml/data/wcsc36/sibling-manifest.json \
      --validation-partition-manifest ml/data/wcsc36/eval-partition-manifest.json \
      --data-role selection \
      --checkpoint stable=ml/runs/runOp1/best.pt \
      --checkpoint warm=ml/runs/wcsc36-warm/best.pt
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
import tempfile
from typing import Any, Iterable, Mapping, Sequence

import torch


ML_DIR = os.path.dirname(os.path.abspath(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from checkpoint_compat import expected_arch, validate_arch  # noqa: E402
from sibling_manifest import (  # noqa: E402
    verify_sibling_manifest,
    verify_sibling_validation_partition,
)
from sibling_selection_protocol import (  # noqa: E402
    SELECTION_TIE_BREAK as SEALED_SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA as SEALED_SIX_RUN_PLAN_SCHEMA,
    WCSC36_SIX_RUN_EXECUTION_REVISION as SEALED_SIX_RUN_EXECUTION_REVISION,
    WCSC36_SIX_RUN_PLAN_BYTES as SEALED_SIX_RUN_PLAN_BYTES,
    WCSC36_SIX_RUN_PLAN_SHA256 as SEALED_SIX_RUN_PLAN_SHA256,
    WCSC36_SIX_RUN_TRAINING_RUNTIME as SEALED_SIX_RUN_TRAINING_RUNTIME,
)
from train import (  # noqa: E402
    INPUT_DIM,
    SEALED_EXPERIMENT_CONTRACTS,
    SEALED_EXPERIMENT_SCHEMA,
    SEALED_EXPERIMENT_SEEDS,
    SEALED_REPLAY_ROWS,
    SEALED_REPLAY_SHA256,
    SEALED_WARM_INIT_SHA256,
    DistillNet,
    load_stable_torch_checkpoint,
    load_dataset_with_metadata,
    raw_sibling_cp,
    sibling_metrics,
    validate_partition_dataset_summary,
    validate_sibling_metadata,
)


REPORT_SCHEMA = "shogi-sibling-eval-v1"
SEALED_REPORT_SCHEMA = "shogi-sibling-eval-v2"
DEFAULT_CP_CLAMP = 3000
DEFAULT_PAIR_MIN_CP = 50.0
PRODUCTION_CP_LIMIT = 1_000_000
PRODUCTION_CP_DENOMINATOR = 127 * 64


def _load_export_module():
    """Load the hyphenated exporter without duplicating its integer math."""
    path = os.path.join(ML_DIR, "export-weights.py")
    spec = importlib.util.spec_from_file_location("shogi_export_weights", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load quantization reference: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_checkpoint_specs(values: Sequence[str]) -> list[tuple[str, str]]:
    """Parse repeated ``NAME=PATH`` arguments while preserving CLI order."""
    parsed: list[tuple[str, str]] = []
    names: set[str] = set()
    for value in values:
        name, separator, path = value.partition("=")
        name = name.strip()
        path = path.strip()
        if not separator or not name or not path:
            raise ValueError(f"invalid checkpoint {value!r}; expected NAME=PATH")
        if name in names:
            raise ValueError(f"duplicate checkpoint name: {name}")
        names.add(name)
        parsed.append((name, path))
    if not parsed:
        raise ValueError("at least one checkpoint is required")
    return parsed


def _same_file_or_realpath(left: str, right: str) -> bool:
    left_real = os.path.realpath(os.path.abspath(left))
    right_real = os.path.realpath(os.path.abspath(right))
    if left_real == right_real:
        return True
    try:
        return os.path.exists(left) and os.path.exists(right) and os.path.samefile(left, right)
    except OSError:
        return False


def validate_json_output_path(
    output_path: str,
    data_path: str,
    checkpoint_specs: Sequence[tuple[str, str]],
    manifest_path: str | None = None,
    partition_manifest_path: str | None = None,
    policy_exposure_receipt_path: str | None = None,
    policy_exposed_parent_ids_path: str | None = None,
    policy_exposed_semantic_position_ids_path: str | None = None,
    protected_position_ids_path: str | None = None,
) -> None:
    """Never let a report overwrite any byte source used to produce it."""
    inputs = [("validation data", data_path)] + [
        (f"checkpoint {name}", path) for name, path in checkpoint_specs
    ]
    if manifest_path:
        inputs.append(("sibling manifest", manifest_path))
    if partition_manifest_path:
        inputs.append(("validation partition manifest", partition_manifest_path))
    for label, path in (
        ("policy exposure receipt", policy_exposure_receipt_path),
        ("policy-exposed parent IDs", policy_exposed_parent_ids_path),
        (
            "policy-exposed semantic position IDs",
            policy_exposed_semantic_position_ids_path,
        ),
    ):
        if path:
            inputs.append((label, path))
    if protected_position_ids_path:
        inputs.append(("holdout protected position IDs", protected_position_ids_path))
    for label, input_path in inputs:
        if _same_file_or_realpath(output_path, input_path):
            raise ValueError(f"--json-out must not overwrite {label}: {input_path}")


def atomic_write_json(path: str, serialized: str) -> None:
    """Durably write in the target directory, then atomically replace the target."""
    target = os.path.abspath(path)
    directory = os.path.dirname(target)
    if not os.path.isdir(directory):
        raise ValueError(f"JSON output directory does not exist: {directory}")
    basename = os.path.basename(target) or "report.json"
    descriptor, temporary = tempfile.mkstemp(
        dir=directory,
        prefix=f".{basename}.",
        suffix=".tmp",
        text=True,
    )
    descriptor_open = True
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as target_file:
            descriptor_open = False
            target_file.write(serialized + "\n")
            target_file.flush()
            os.fsync(target_file.fileno())
        os.replace(temporary, target)
        temporary = ""
        try:
            directory_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            # The file itself is already fsynced and atomically installed;
            # directory fsync is unavailable on some filesystems.
            pass
    finally:
        if descriptor_open:
            os.close(descriptor)
        if temporary:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def load_validation_data(path: str, cp_clamp: int):
    """Load once, reject silently skipped rows, and validate sibling groups."""
    if cp_clamp <= 0:
        raise ValueError("cp_clamp must be positive")
    if not os.path.isfile(path):
        raise ValueError(f"validation data does not exist: {path}")

    board, hands, _targets, clamped_cp, bucket, metadata, source_fingerprint = load_dataset_with_metadata(
        path,
        k_sigmoid=600.0,  # Only targets depend on K; they are unused here.
        cp_clamp=cp_clamp,
        features="board",
        strict=True,
        include_fingerprint=True,
    )
    if not metadata:
        raise ValueError("validation data has no usable rows")

    # This is the same contract enforced before sibling-ranking training:
    # required provenance, unique moves, >=2 candidates, and exact sign.
    try:
        groups = validate_sibling_metadata(metadata, "validation")
    except SystemExit as error:
        raise ValueError(str(error)) from error

    raw_child_cp = raw_sibling_cp(metadata)
    for label, tensor in (
        ("clamped child cp", clamped_cp),
        ("raw child cp", raw_child_cp),
        ("hands", hands),
    ):
        if not torch.isfinite(tensor).all():
            raise ValueError(f"validation data contains non-finite {label}")

    return (
        board,
        hands,
        bucket,
        clamped_cp,
        raw_child_cp,
        metadata,
        groups,
        source_fingerprint,
    )


def _checkpoint_arch(checkpoint: Mapping[str, Any], path: str) -> tuple[str, float]:
    """Resolve and strictly constrain the currently deployed board network."""
    arch = checkpoint.get("arch")
    if not isinstance(arch, Mapping):
        raise ValueError(f"{path}: checkpoint arch metadata is missing")
    normalized_arch = dict(arch)
    args = checkpoint.get("args")
    args = args if isinstance(args, Mapping) else {}

    features = normalized_arch.get("features", args.get("features"))
    if features is None and normalized_arch.get("input") == INPUT_DIM:
        # runOp1 predates the explicit feature-name field, but its input size
        # uniquely identifies the current board representation.
        features = "board"
    normalized_arch.setdefault("features", features)
    normalized_arch.setdefault("schema", 1)
    normalized_arch.setdefault("kp_buckets", 1)
    if features != "board":
        raise ValueError(f"{path}: only the current board architecture is supported, got {features!r}")
    if "k" not in normalized_arch:
        normalized_arch["k"] = args.get("k", 600.0)
    raw_k = normalized_arch["k"]
    if type(raw_k) not in (int, float) or not math.isfinite(raw_k) or raw_k <= 0:
        raise ValueError(f"{path}: sigmoid scale K must be finite and positive")
    k_sigmoid = float(raw_k)
    normalized_arch["k"] = k_sigmoid
    expected = expected_arch(
        features="board",
        input_dim=INPUT_DIM,
        h1=DistillNet.H1,
        h2=DistillNet.H2,
        k=k_sigmoid,
        kp_buckets=1,
    )
    try:
        validate_arch(normalized_arch, expected)
    except ValueError as error:
        raise ValueError(f"{path}: {error}") from error
    return features, k_sigmoid


def load_model(path: str) -> tuple[DistillNet, Mapping[str, Any], float, Mapping[str, Any]]:
    if not os.path.isfile(path):
        raise ValueError(f"checkpoint does not exist: {path}")
    try:
        checkpoint, checkpoint_fingerprint = load_stable_torch_checkpoint(
            path,
            weights_only=True,
        )
    except Exception as error:
        raise ValueError(f"cannot load checkpoint {path}: {error}") from error
    if not isinstance(checkpoint, Mapping) or not isinstance(checkpoint.get("model"), Mapping):
        raise ValueError(f"{path}: checkpoint model state is missing")

    features, k_sigmoid = _checkpoint_arch(checkpoint, path)
    model = DistillNet(features)
    try:
        model.load_state_dict(checkpoint["model"], strict=True)
    except RuntimeError as error:
        raise ValueError(f"{path}: incompatible model state: {error}") from error
    for name, parameter in model.named_parameters():
        if not torch.isfinite(parameter).all():
            raise ValueError(f"{path}: model parameter {name} is non-finite")
    model.eval()
    return model, checkpoint, k_sigmoid, checkpoint_fingerprint


def _matching_mapping_fields(
    actual: Mapping[str, Any],
    expected: Mapping[str, Any],
    fields: Sequence[str],
    label: str,
) -> None:
    for field in fields:
        value = actual.get(field)
        wanted = expected.get(field)
        if type(value) is not type(wanted) or value != wanted:
            raise ValueError(f"{label} {field} does not match")


def _is_lower_sha256(value: Any) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(character in "0123456789abcdef" for character in value)
    )


def _verify_experiment_contract(
    checkpoint: Mapping[str, Any], checkpoint_path: str
) -> Mapping[str, Any]:
    sealed_arch = expected_arch(
        features="board",
        input_dim=INPUT_DIM,
        h1=DistillNet.H1,
        h2=DistillNet.H2,
        k=600.0,
        kp_buckets=1,
    )
    try:
        validate_arch(checkpoint.get("arch"), sealed_arch)
    except ValueError as error:
        raise ValueError(
            f"{checkpoint_path}: sealed checkpoint architecture is invalid: {error}"
        ) from error
    contract = checkpoint.get("experiment_contract")
    if not isinstance(contract, Mapping):
        raise ValueError(f"{checkpoint_path}: sealed experiment contract is missing")
    series_name = contract.get("series")
    if series_name not in SEALED_EXPERIMENT_CONTRACTS:
        raise ValueError(f"{checkpoint_path}: invalid experiment series")
    seed = contract.get("seed")
    if type(seed) is not int or seed not in SEALED_EXPERIMENT_SEEDS:
        raise ValueError(f"{checkpoint_path}: experiment seed is outside 42/43/44")
    series = SEALED_EXPERIMENT_CONTRACTS[series_name]
    expected = {
        "schema": SEALED_EXPERIMENT_SCHEMA,
        "series": series_name,
        "seed": seed,
        "loss": "sibling-ranking",
        "init_checkpoint_sha256": series["init_sha256"],
        "replay_sha256": SEALED_REPLAY_SHA256,
        "learning_rate": series["learning_rate"],
        "epochs": series["epochs"],
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": SEALED_REPLAY_ROWS,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": series["allow_legacy_init"],
    }
    if set(contract) != set(expected):
        raise ValueError(f"{checkpoint_path}: experiment contract fields are not exact")
    for field, wanted in expected.items():
        found = contract.get(field)
        if type(found) is not type(wanted) or found != wanted:
            raise ValueError(
                f"{checkpoint_path}: experiment contract {field} mismatch"
            )

    args = checkpoint.get("args")
    if not isinstance(args, Mapping):
        raise ValueError(f"{checkpoint_path}: checkpoint args are missing")
    argument_fields = {
        "experiment_series": series_name,
        "seed": seed,
        "loss": "sibling-ranking",
        "lr": series["learning_rate"],
        "epochs": series["epochs"],
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": SEALED_REPLAY_ROWS,
        "replay_ratio": 1.0,
        "limit": 0,
        "allow_legacy_init": series["allow_legacy_init"],
    }
    for field, wanted in argument_fields.items():
        found = args.get(field)
        if type(found) is not type(wanted) or found != wanted:
            raise ValueError(f"{checkpoint_path}: checkpoint arg {field} mismatch")

    initializer = checkpoint.get("init_checkpoint")
    if series_name == "warm":
        if (
            not isinstance(initializer, Mapping)
            or initializer.get("sha256") != SEALED_WARM_INIT_SHA256
            or not args.get("init_ckpt")
        ):
            raise ValueError(f"{checkpoint_path}: warm initializer identity mismatch")
    elif initializer is not None or args.get("init_ckpt") not in (None, ""):
        raise ValueError(f"{checkpoint_path}: scratch experiment contains an initializer")
    return contract


def _verify_sealed_checkpoint_training_provenance(
    checkpoint: Mapping[str, Any],
    manifest_provenance: Mapping[str, Any],
    partition_provenance: Mapping[str, Any],
    checkpoint_path: str,
    evaluation_role: str,
) -> dict[str, Any]:
    args = checkpoint.get("args")
    args = args if isinstance(args, Mapping) else {}
    if args.get("loss") != "sibling-ranking":
        raise ValueError(
            f"{checkpoint_path}: sealed sibling provenance requires loss=sibling-ranking"
        )
    experiment_contract = _verify_experiment_contract(checkpoint, checkpoint_path)
    data_provenance = checkpoint.get("data_provenance")
    if not isinstance(data_provenance, Mapping):
        raise ValueError(f"{checkpoint_path}: sealed data_provenance is missing")
    if data_provenance.get("experiment_contract") != experiment_contract:
        raise ValueError(
            f"{checkpoint_path}: data/checkpoint experiment contracts differ"
        )

    experiment_plan = checkpoint.get("experiment_plan")
    plan_fields = {
        "path",
        "bytes",
        "sha256",
        "schema",
        "slot_id",
        "slot_output",
        "selection_tie_break",
    }
    expected_slot_id = (
        f"{experiment_contract['series']}-seed-{experiment_contract['seed']}"
    )
    expected_slot_output = f"ml/runs/wcsc36-six-run/{expected_slot_id}"
    if (
        not isinstance(experiment_plan, Mapping)
        or set(experiment_plan) != plan_fields
        or not isinstance(experiment_plan.get("path"), str)
        or not experiment_plan["path"]
        or type(experiment_plan.get("bytes")) is not int
        or experiment_plan["bytes"] != SEALED_SIX_RUN_PLAN_BYTES
        or not isinstance(experiment_plan.get("sha256"), str)
        or experiment_plan["sha256"] != SEALED_SIX_RUN_PLAN_SHA256
        or experiment_plan.get("schema") != SEALED_SIX_RUN_PLAN_SCHEMA
        or experiment_plan.get("slot_id") != expected_slot_id
        or experiment_plan.get("slot_output") != expected_slot_output
        or type(experiment_plan.get("selection_tie_break")) is not list
        or tuple(experiment_plan["selection_tie_break"])
        != SEALED_SELECTION_TIE_BREAK
    ):
        raise ValueError(
            f"{checkpoint_path}: six-run experiment plan provenance is invalid"
        )
    if data_provenance.get("experiment_plan") != experiment_plan:
        raise ValueError(
            f"{checkpoint_path}: six-run experiment plan provenance is inconsistent"
        )

    checkpoint_manifest = data_provenance.get("sibling_manifest")
    if not isinstance(checkpoint_manifest, Mapping):
        raise ValueError(f"{checkpoint_path}: teacher manifest provenance is missing")
    _matching_mapping_fields(
        checkpoint_manifest,
        manifest_provenance,
        (
            "bytes",
            "sha256",
            "schema",
            "record_manifest_schema",
            "label_policy",
            "exact_rescore_mode",
            "search_state_reset_before_proposal",
            "search_state_reset_before_each_candidate",
            "tt_reset_before_proposal",
            "tt_reset_before_each_candidate",
            "candidate_execution_order",
            "synthesized_rank_order",
            "teacher_runtime_snapshot",
            "pipeline",
            "outputs",
        ),
        f"{checkpoint_path}: checkpoint teacher manifest",
    )
    if checkpoint_manifest.get("verified_splits") != []:
        raise ValueError(
            f"{checkpoint_path}: sealed training must not open either base teacher split"
        )

    checkpoint_partition = data_provenance.get("validation_partition")
    if not isinstance(checkpoint_partition, Mapping):
        raise ValueError(f"{checkpoint_path}: validation partition provenance is missing")
    _matching_mapping_fields(
        checkpoint_partition,
        partition_provenance,
        (
            "bytes",
            "sha256",
            "schema",
            "record_schema",
            "pipeline",
            "policy",
            "source",
            "outputs",
            "drops",
            "isolation",
            "replay_exclusion",
        ),
        f"{checkpoint_path}: checkpoint validation partition",
    )
    if checkpoint_partition.get("verified_outputs") != [
        "model_training",
        "model_selection",
        "protected_position_ids",
    ]:
        raise ValueError(
            f"{checkpoint_path}: training did not verify model training, "
            "model selection, and protected IDs"
        )

    expected_teacher_outputs = manifest_provenance["outputs"]
    expected_training = partition_provenance["outputs"]["model_training"]
    train = data_provenance.get("train")
    if not isinstance(train, Mapping):
        raise ValueError(f"{checkpoint_path}: checkpoint train provenance is missing")
    if (
        train.get("role") != "model_training"
        or train.get("bytes") != expected_training["bytes"]
        or train.get("sha256") != expected_training["sha256"]
        or train.get("selection") != "all"
        or train.get("requested_limit") != 0
        or type(train.get("usable_rows")) is not int
        or train["usable_rows"] != expected_training["records"]
    ):
        raise ValueError(
            f"{checkpoint_path}: checkpoint did not use complete filtered model training"
        )

    expected_selection = partition_provenance["outputs"]["model_selection"]
    selection = data_provenance.get("validation")
    if not isinstance(selection, Mapping):
        raise ValueError(f"{checkpoint_path}: model-selection provenance is missing")
    if (
        selection.get("role") != "model_selection"
        or selection.get("bytes") != expected_selection["bytes"]
        or selection.get("sha256") != expected_selection["sha256"]
        or selection.get("selection") != "all"
        or selection.get("requested_limit") != 0
        or type(selection.get("usable_rows")) is not int
        or selection["usable_rows"] != expected_selection["records"]
    ):
        raise ValueError(
            f"{checkpoint_path}: checkpoint did not use the complete model-selection split"
        )

    expected_holdout = partition_provenance["outputs"]["final_holdout"]
    sealed_holdout = data_provenance.get("sealed_holdout")
    if not isinstance(sealed_holdout, Mapping):
        raise ValueError(f"{checkpoint_path}: sealed holdout provenance is missing")
    if sealed_holdout.get("status") != "sealed_not_opened":
        raise ValueError(f"{checkpoint_path}: final holdout was not kept sealed")
    _matching_mapping_fields(
        sealed_holdout,
        expected_holdout,
        tuple(expected_holdout.keys()),
        f"{checkpoint_path}: sealed holdout",
    )

    expected_protected = partition_provenance["outputs"]["protected_position_ids"]
    protected = data_provenance.get("protected_position_ids")
    if not isinstance(protected, Mapping):
        raise ValueError(f"{checkpoint_path}: protected position provenance is missing")
    _matching_mapping_fields(
        protected,
        expected_protected,
        tuple(expected_protected.keys()),
        f"{checkpoint_path}: protected position IDs",
    )
    replay = data_provenance.get("replay")
    if not isinstance(replay, Mapping):
        raise ValueError(f"{checkpoint_path}: sealed replay provenance is missing")
    protected_count = expected_protected["count"]
    expected_policy_semantic = partition_provenance["source"][
        "policy_exposed_semantic_position_ids"
    ]
    expected_replay_exclusion = partition_provenance.get("replay_exclusion")
    if not isinstance(expected_replay_exclusion, Mapping):
        raise ValueError(
            f"{checkpoint_path}: verified replay exclusion union is missing"
        )
    selection_count = replay.get(
        "excluded_model_selection_semantic_position_ids"
    )
    union_count = replay.get("excluded_semantic_position_ids")
    if (
        replay.get("sha256") != SEALED_REPLAY_SHA256
        or replay.get("requested_limit") != SEALED_REPLAY_ROWS
        or type(replay.get("replay_ratio")) is not float
        or replay.get("replay_ratio") != 1.0
        or replay.get("sample_seed") != experiment_contract["seed"] + 2
        or replay.get("selection")
        != "uniform_without_replacement_after_semantic_exclusion"
        or type(replay.get("usable_rows")) is not int
        or replay["usable_rows"] != SEALED_REPLAY_ROWS
        or type(replay.get("eligible_rows_after_semantic_exclusion")) is not int
        or replay["eligible_rows_after_semantic_exclusion"] < SEALED_REPLAY_ROWS
        or type(replay.get("excluded_rows_before_sampling")) is not int
        or replay["excluded_rows_before_sampling"] < 0
        or replay.get("excluded_policy_exposed_semantic_position_ids")
        != expected_policy_semantic["count"]
        or replay.get("policy_exposed_semantic_position_ids_sha256")
        != expected_policy_semantic["identifiers_sha256"]
        or replay.get("policy_exposed_semantic_position_ids_file_sha256")
        != expected_policy_semantic["sha256"]
        or replay.get("excluded_final_holdout_protected_position_ids")
        != protected_count
        or replay.get("final_holdout_protected_position_ids_file_sha256")
        != expected_protected["sha256"]
        or type(selection_count) is not int
        or selection_count
        != expected_selection["semantic_position_ids_count"]
        or replay.get("model_selection_semantic_position_ids_sha256")
        != expected_selection["semantic_position_ids_sha256"]
        or replay.get("final_holdout_protected_position_ids_sha256")
        != expected_holdout["semantic_position_ids_sha256"]
        or type(union_count) is not int
        or union_count
        != expected_replay_exclusion["semantic_position_ids_count"]
        or replay.get("excluded_semantic_position_ids_sha256")
        != expected_replay_exclusion["semantic_position_ids_sha256"]
    ):
        raise ValueError(
            f"{checkpoint_path}: replay identity/isolation violates the sealed experiment"
        )

    training_pipeline = checkpoint.get("training_pipeline")
    if not isinstance(training_pipeline, Mapping):
        raise ValueError(f"{checkpoint_path}: training pipeline revision is missing")
    revision = training_pipeline.get("source_revision")
    if (
        not isinstance(revision, str)
        or len(revision) != 40
        or any(character not in "0123456789abcdef" for character in revision)
        or training_pipeline.get("tracked_tree_clean") is not True
    ):
        raise ValueError(f"{checkpoint_path}: training pipeline provenance is invalid")
    if revision != SEALED_SIX_RUN_EXECUTION_REVISION:
        raise ValueError(
            f"{checkpoint_path}: training pipeline revision differs from the sealed execution"
        )
    if data_provenance.get("training_pipeline") != training_pipeline:
        raise ValueError(f"{checkpoint_path}: training pipeline provenance is inconsistent")
    training_runtime = checkpoint.get("training_runtime")
    runtime_fields = {
        "platform",
        "system",
        "machine",
        "processor",
        "cpu_model",
        "logical_cpu_count",
        "python_version",
        "torch_version",
        "device",
        "torch_threads",
        "torch_interop_threads",
        "deterministic_algorithms",
        "deterministic_debug_mode",
        "mps_built",
        "mps_available",
        "cuda_available",
    }
    if not isinstance(training_runtime, Mapping) or set(training_runtime) != runtime_fields:
        raise ValueError(f"{checkpoint_path}: training runtime provenance is invalid")
    if any(
        not isinstance(training_runtime.get(field), str)
        or not training_runtime[field]
        for field in (
            "platform",
            "system",
            "machine",
            "cpu_model",
            "python_version",
            "torch_version",
            "device",
            "deterministic_debug_mode",
        )
    ) or any(
        type(training_runtime.get(field)) is not bool
        for field in (
            "deterministic_algorithms",
            "mps_built",
            "mps_available",
            "cuda_available",
        )
    ) or not isinstance(training_runtime.get("processor"), str) or (
        type(training_runtime.get("logical_cpu_count")) is not int
        or training_runtime["logical_cpu_count"] <= 0
    ):
        raise ValueError(f"{checkpoint_path}: training runtime provenance is invalid")
    if (
        training_runtime.get("device") != "cpu"
        or training_runtime.get("torch_threads") != 2
        or type(training_runtime.get("torch_threads")) is not int
        or training_runtime.get("torch_interop_threads") != 1
        or type(training_runtime.get("torch_interop_threads")) is not int
        or training_runtime.get("deterministic_algorithms") is not True
        or training_runtime.get("deterministic_debug_mode") != "error"
    ):
        raise ValueError(
            f"{checkpoint_path}: sealed deterministic CPU runtime is not exact"
        )
    if data_provenance.get("training_runtime") != training_runtime:
        raise ValueError(f"{checkpoint_path}: training runtime provenance is inconsistent")
    if training_runtime != SEALED_SIX_RUN_TRAINING_RUNTIME:
        raise ValueError(
            f"{checkpoint_path}: training runtime differs from the sealed execution"
        )
    checkpoint_selection = checkpoint.get("checkpoint_selection")
    if (
        not isinstance(checkpoint_selection, Mapping)
        or checkpoint_selection.get("dataset_role") != "model_selection"
        or checkpoint_selection.get("requested") != "sibling-pair"
        or checkpoint_selection.get("resolved") != "sibling-pair"
    ):
        raise ValueError(f"{checkpoint_path}: checkpoint selection role is not sealed")

    if evaluation_role not in ("selection", "final-holdout"):
        raise ValueError("sealed evaluation role is invalid")
    return {
        "status": (
            "verified_same_model_selection_partition"
            if evaluation_role == "selection"
            else "verified_sealed_final_holdout_from_same_partition"
        ),
        "teacher_manifest_sha256": manifest_provenance["sha256"],
        "validation_partition_sha256": partition_provenance["sha256"],
        "training_pipeline_source_revision": revision,
        "source_train_sha256": expected_teacher_outputs["train_sha256"],
        "model_training_sha256": expected_training["sha256"],
        "model_selection_sha256": expected_selection["sha256"],
        "final_holdout_sha256": expected_holdout["sha256"],
    }


def verify_checkpoint_training_provenance(
    checkpoint: Mapping[str, Any],
    manifest_provenance: Mapping[str, Any],
    checkpoint_path: str,
    *,
    partition_provenance: Mapping[str, Any] | None = None,
    evaluation_role: str | None = None,
) -> dict[str, Any]:
    """Require sealed provenance for candidates; label base models as legacy."""
    args = checkpoint.get("args")
    args = args if isinstance(args, Mapping) else {}
    loss = args.get("loss")
    if loss != "sibling-ranking":
        data_provenance = checkpoint.get("data_provenance")
        checkpoint_selection = checkpoint.get("checkpoint_selection")
        sealed_markers = (
            args.get("experiment_series") is not None,
            checkpoint.get("experiment_contract") is not None,
            isinstance(data_provenance, Mapping)
            and any(
                field in data_provenance
                for field in (
                    "validation_partition",
                    "sealed_holdout",
                    "experiment_contract",
                )
            ),
            isinstance(checkpoint_selection, Mapping)
            and checkpoint_selection.get("dataset_role") == "model_selection",
        )
        if any(sealed_markers):
            raise ValueError(
                f"{checkpoint_path}: hybrid legacy/sealed checkpoint is forbidden"
            )
        return {
            "status": "legacy_unverified",
            "reason": (
                "non-sibling base checkpoint has no sealed candidate provenance; "
                "reported for comparison only"
            ),
        }
    if partition_provenance is None:
        raise ValueError(
            f"{checkpoint_path}: sibling candidate evaluation requires a sealed "
            "validation partition manifest and explicit data role"
        )
    if evaluation_role is None:
        raise ValueError("sealed evaluation requires an explicit data role")
    return _verify_sealed_checkpoint_training_provenance(
        checkpoint,
        manifest_provenance,
        partition_provenance,
        checkpoint_path,
        evaluation_role,
    )


def float_predictions(
    model: DistillNet,
    board: torch.Tensor,
    hands: torch.Tensor,
    bucket: torch.Tensor,
    k_sigmoid: float,
    batch_size: int,
) -> torch.Tensor:
    if batch_size <= 0:
        raise ValueError("batch_size must be positive")
    chunks = []
    with torch.no_grad():
        for start in range(0, board.shape[0], batch_size):
            logits = model(
                board[start : start + batch_size],
                hands[start : start + batch_size],
                bucket[start : start + batch_size],
            )
            chunks.append(logits.to(dtype=torch.float64) * k_sigmoid)
    predictions = torch.cat(chunks)
    if not torch.isfinite(predictions).all():
        raise ValueError("model produced non-finite float predictions")
    return predictions


def quantized_predictions(
    model: DistillNet,
    board: torch.Tensor,
    hands: torch.Tensor,
    k_sigmoid: float,
) -> torch.Tensor:
    exporter = _load_export_module()
    qweights, _metadata = exporter.quantize(model, k_sigmoid)
    values = []
    for index in range(board.shape[0]):
        out_q = exporter.int_forward(
            qweights,
            board[index].tolist(),
            hands[index].tolist(),
            model.pad_idx,
        )
        values.append(production_cp_from_out_q(out_q, k_sigmoid))
    predictions = torch.tensor(values, dtype=torch.float64)
    if not torch.isfinite(predictions).all():
        raise ValueError("model produced non-finite quantized predictions")
    return predictions


def production_cp_from_out_q(out_q: int, k_sigmoid: float) -> int:
    """Mirror production WASM's single i64 division and clamp exactly."""
    if not isinstance(out_q, int):
        raise ValueError("quantized out_q must be an integer")
    if not math.isfinite(k_sigmoid):
        raise ValueError("sigmoid scale K must be finite")
    # wasmEngine.ts passes Math.trunc(scaleK) to the i32 setter.
    k_int = math.trunc(k_sigmoid)
    if k_int <= 0 or k_int > PRODUCTION_CP_LIMIT:
        raise ValueError("production sigmoid scale K must truncate into [1, 1000000]")
    product = out_q * k_int
    # Python // floors negatives; WASM i64 division truncates toward zero.
    cp = product // PRODUCTION_CP_DENOMINATOR if product >= 0 else -((-product) // PRODUCTION_CP_DENOMINATOR)
    return max(-PRODUCTION_CP_LIMIT, min(PRODUCTION_CP_LIMIT, cp))


def _eligible_pair_count(raw_child_cp: torch.Tensor, groups: Iterable[Sequence[int]], min_cp: float) -> int:
    total = 0
    for indices in groups:
        index = torch.as_tensor(indices, dtype=torch.long, device=raw_child_cp.device)
        parent_cp = -raw_child_cp[index]
        difference = parent_cp.unsqueeze(1) - parent_cp.unsqueeze(0)
        upper_triangle = torch.triu(
            torch.ones_like(difference, dtype=torch.bool), diagonal=1
        )
        eligible = (
            upper_triangle
            & (difference != 0.0)
            & (difference.abs() >= min_cp)
        )
        total += int(eligible.sum().item())
    return total


def calculate_metrics(
    predicted_child_cp: torch.Tensor,
    clamped_child_cp: torch.Tensor,
    raw_child_cp: torch.Tensor,
    metadata: Sequence[Mapping[str, Any]],
    pair_min_cp: float,
) -> dict[str, float]:
    """Value stays child-view; move-choice metrics flip to parent-view once."""
    if predicted_child_cp.shape != clamped_child_cp.shape:
        raise ValueError("prediction/target row count mismatch")
    difference = predicted_child_cp.to(torch.float64) - clamped_child_cp.to(torch.float64)
    mae = float(difference.abs().mean())
    mse = float(difference.square().mean())
    pair_accuracy, top1_accuracy = sibling_metrics(
        predicted_child_cp,
        raw_child_cp,
        metadata,
        pair_min_cp,
    )
    result = {
        "value_mae_cp": mae,
        "value_mse_cp2": mse,
        "within_parent_pair_accuracy": float(pair_accuracy),
        "teacher_top1_accuracy": float(top1_accuracy),
    }
    for field, value in result.items():
        if not math.isfinite(value):
            raise ValueError(f"metric {field} is non-finite; check --pair-min-cp and validation data")
    return result


def metric_delta(quantized: Mapping[str, float], floating: Mapping[str, float]) -> dict[str, float]:
    return {field: float(quantized[field] - floating[field]) for field in floating}


def evaluate_checkpoints(
    data_path: str,
    checkpoint_specs: Sequence[tuple[str, str]],
    *,
    sibling_manifest_path: str,
    validation_partition_manifest_path: str | None = None,
    policy_exposure_receipt_path: str | None = None,
    policy_exposed_parent_ids_path: str | None = None,
    policy_exposed_semantic_position_ids_path: str | None = None,
    protected_position_ids_path: str | None = None,
    data_role: str | None = None,
    pair_min_cp: float = DEFAULT_PAIR_MIN_CP,
    cp_clamp: int = DEFAULT_CP_CLAMP,
    batch_size: int = 4096,
    include_quantized: bool = True,
) -> dict[str, Any]:
    if pair_min_cp < 0 or not math.isfinite(pair_min_cp):
        raise ValueError("pair_min_cp must be finite and non-negative")
    if len({name for name, _path in checkpoint_specs}) != len(checkpoint_specs):
        raise ValueError("checkpoint names must be unique")
    if not checkpoint_specs:
        raise ValueError("at least one checkpoint is required")
    if data_role == "final-holdout":
        raise ValueError(
            "final-holdout evaluation is sealed until a candidate-selection receipt "
            "is implemented; use --data-role selection only"
        )

    partition_provenance = None
    if validation_partition_manifest_path is not None:
        if not all(
            (
                policy_exposure_receipt_path,
                policy_exposed_parent_ids_path,
                policy_exposed_semantic_position_ids_path,
                protected_position_ids_path,
            )
        ):
            raise ValueError(
                "sealed evaluation requires all policy-exposure artifacts and "
                "--holdout-protected-position-ids"
            )
        if data_role not in ("selection", "final-holdout"):
            raise ValueError(
                "sealed evaluation requires --data-role selection or final-holdout"
            )
        partition_provenance = verify_sibling_validation_partition(
            validation_partition_manifest_path,
            sibling_manifest_path=sibling_manifest_path,
            data_role=data_role,
            data_path=data_path,
            policy_exposure_receipt_path=policy_exposure_receipt_path,
            policy_exposed_parent_ids_path=policy_exposed_parent_ids_path,
            policy_exposed_semantic_position_ids_path=(
                policy_exposed_semantic_position_ids_path
            ),
            protected_position_ids_path=protected_position_ids_path,
        )
        manifest_provenance = partition_provenance["teacher_manifest"]
        expected_output = partition_provenance["outputs"][
            "model_selection" if data_role == "selection" else "final_holdout"
        ]
        report_schema = SEALED_REPORT_SCHEMA
    else:
        if data_role is not None:
            raise ValueError("--data-role requires --validation-partition-manifest")
        manifest_provenance = verify_sibling_manifest(
            sibling_manifest_path,
            val_path=data_path,
        )
        expected_output = {
            "bytes": manifest_provenance["outputs"]["val_bytes"],
            "sha256": manifest_provenance["outputs"]["val_sha256"],
        }
        report_schema = REPORT_SCHEMA

    (
        board,
        hands,
        bucket,
        clamped_cp,
        raw_cp,
        metadata,
        groups,
        data_fingerprint,
    ) = load_validation_data(data_path, cp_clamp)
    if partition_provenance is not None:
        validate_partition_dataset_summary(
            metadata,
            expected_output,
            f"{data_role} dataset",
        )
    data_bytes = data_fingerprint["bytes"]
    data_sha256 = data_fingerprint["sha256"]
    if (
        data_bytes != expected_output["bytes"]
        or data_sha256 != expected_output["sha256"]
    ):
        raise ValueError("evaluation dataset changed after manifest verification")
    eligible_pairs = _eligible_pair_count(raw_cp, groups, pair_min_cp)
    if eligible_pairs == 0:
        raise ValueError(
            f"validation data has no unequal sibling pairs with |teacher delta| >= {pair_min_cp}cp"
        )

    models = []
    for name, checkpoint_path in checkpoint_specs:
        model, checkpoint, k_sigmoid, checkpoint_fingerprint = load_model(checkpoint_path)
        training_provenance = verify_checkpoint_training_provenance(
            checkpoint,
            manifest_provenance,
            checkpoint_path,
            partition_provenance=partition_provenance,
            evaluation_role=data_role,
        )
        floating_predictions = float_predictions(
            model, board, hands, bucket, k_sigmoid, batch_size
        )
        floating = calculate_metrics(
            floating_predictions, clamped_cp, raw_cp, metadata, pair_min_cp
        )
        quantized = None
        if include_quantized:
            integer_predictions = quantized_predictions(model, board, hands, k_sigmoid)
            integer_metrics = calculate_metrics(
                integer_predictions, clamped_cp, raw_cp, metadata, pair_min_cp
            )
            quantized = {
                **integer_metrics,
                "delta_from_float": metric_delta(integer_metrics, floating),
            }
        models.append(
            {
                "name": name,
                "checkpoint": os.path.abspath(checkpoint_path),
                "checkpoint_sha256": checkpoint_fingerprint["sha256"],
                "checkpoint_bytes": checkpoint_fingerprint["bytes"],
                "checkpoint_epoch": checkpoint.get("epoch"),
                "training_provenance": training_provenance,
                "k_sigmoid": k_sigmoid,
                "production_k_int": math.trunc(k_sigmoid),
                "float": floating,
                "quantized_int16": quantized,
            }
        )

    report = {
        "schema": report_schema,
        "data": {
            "path": os.path.abspath(data_path),
            "sha256": data_sha256,
            "bytes": data_bytes,
            "sibling_manifest_sha256": manifest_provenance["sha256"],
            "sibling_manifest_bytes": manifest_provenance["bytes"],
            "pipeline_source_revision": manifest_provenance["pipeline"][
                "source_revision"
            ],
            "teacher_runtime_snapshot": manifest_provenance[
                "teacher_runtime_snapshot"
            ],
            "sibling_manifest": manifest_provenance,
            "data_role": data_role or "legacy-validation",
            "validation_partition_manifest": partition_provenance,
            "records": len(metadata),
            "parents": len(groups),
            "eligible_pairs": eligible_pairs,
            "pair_min_cp": float(pair_min_cp),
            "value_target": "clamped_child_cp",
            "value_cp_clamp": cp_clamp,
            "ranking_target": "unclamped_parent_cp_equals_negative_child_cp",
        },
        "models": models,
    }
    # Fail here rather than emitting JSON containing implementation-specific NaN.
    json.dumps(report, allow_nan=False)
    return report


def format_table(report: Mapping[str, Any]) -> str:
    data = report["data"]
    lines = [
        (
            f"data: records={data['records']} parents={data['parents']} "
            f"eligible_pairs={data['eligible_pairs']} min_cp={data['pair_min_cp']:g}"
        ),
        "model\tmode\ttraining_provenance\tMAE(cp)\tMSE(cp^2)\t"
        "pair_acc\tteacher_top1\tDelta_pair\tDelta_top1",
    ]
    for model in report["models"]:
        floating = model["float"]
        provenance_status = model["training_provenance"]["status"]
        lines.append(
            f"{model['name']}\tfloat\t{provenance_status}\t"
            f"{floating['value_mae_cp']:.3f}\t"
            f"{floating['value_mse_cp2']:.3f}\t"
            f"{floating['within_parent_pair_accuracy']:.6f}\t"
            f"{floating['teacher_top1_accuracy']:.6f}\t0.000000\t0.000000"
        )
        quantized = model["quantized_int16"]
        if quantized is not None:
            delta = quantized["delta_from_float"]
            lines.append(
                f"{model['name']}\tint16\t{provenance_status}\t"
                f"{quantized['value_mae_cp']:.3f}\t"
                f"{quantized['value_mse_cp2']:.3f}\t"
                f"{quantized['within_parent_pair_accuracy']:.6f}\t"
                f"{quantized['teacher_top1_accuracy']:.6f}\t"
                f"{delta['within_parent_pair_accuracy']:+.6f}\t"
                f"{delta['teacher_top1_accuracy']:+.6f}"
            )
    return "\n".join(lines)


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", required=True, help="pre-split sibling validation JSONL")
    parser.add_argument(
        "--sibling-manifest",
        required=True,
        help=(
            "v6-policy teacher manifest bound by the sealed partition "
            "(or full val for base-only legacy reports)"
        ),
    )
    parser.add_argument(
        "--validation-partition-manifest",
        help="sealed selection/final-holdout derivation bound to the teacher manifest",
    )
    parser.add_argument(
        "--data-role",
        choices=["selection", "final-holdout"],
        help="explicit role of --data inside the sealed validation partition",
    )
    parser.add_argument("--policy-exposure-receipt")
    parser.add_argument("--policy-exposed-parent-ids")
    parser.add_argument("--policy-exposed-semantic-position-ids")
    parser.add_argument(
        "--holdout-protected-position-ids",
        help="sealed final-holdout semantic union without holdout labels",
    )
    parser.add_argument(
        "--checkpoint",
        action="append",
        required=True,
        metavar="NAME=PATH",
        help="checkpoint to compare; repeat for every model",
    )
    parser.add_argument("--pair-min-cp", type=float, default=DEFAULT_PAIR_MIN_CP)
    parser.add_argument("--cp-clamp", type=int, default=DEFAULT_CP_CLAMP)
    parser.add_argument("--batch-size", type=int, default=4096)
    parser.add_argument("--no-quantized", action="store_true", help="skip int16 reference inference")
    parser.add_argument("--json", action="store_true", help="write machine-readable JSON to stdout")
    parser.add_argument("--json-out", help="also write machine-readable JSON to this path")
    args = parser.parse_args(argv)

    try:
        specs = parse_checkpoint_specs(args.checkpoint)
        if args.json_out:
            validate_json_output_path(
                args.json_out,
                args.data,
                specs,
                args.sibling_manifest,
                args.validation_partition_manifest,
                args.policy_exposure_receipt,
                args.policy_exposed_parent_ids,
                args.policy_exposed_semantic_position_ids,
                args.holdout_protected_position_ids,
            )
        report = evaluate_checkpoints(
            args.data,
            specs,
            sibling_manifest_path=args.sibling_manifest,
            validation_partition_manifest_path=args.validation_partition_manifest,
            policy_exposure_receipt_path=args.policy_exposure_receipt,
            policy_exposed_parent_ids_path=args.policy_exposed_parent_ids,
            policy_exposed_semantic_position_ids_path=(
                args.policy_exposed_semantic_position_ids
            ),
            protected_position_ids_path=args.holdout_protected_position_ids,
            data_role=args.data_role,
            pair_min_cp=args.pair_min_cp,
            cp_clamp=args.cp_clamp,
            batch_size=args.batch_size,
            include_quantized=not args.no_quantized,
        )
        serialized = json.dumps(
            report, ensure_ascii=False, indent=2, sort_keys=True, allow_nan=False
        )
        if args.json_out:
            atomic_write_json(args.json_out, serialized)
    except (OSError, RuntimeError, ValueError) as error:
        parser.error(str(error))

    print(serialized if args.json else format_table(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
