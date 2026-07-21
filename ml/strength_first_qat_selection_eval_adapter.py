"""Real local metric adapter for strength-first fresh selection.

The historical sealed-selection wrapper in ``eval-sibling.py`` assumes that
the training and selection rows share one teacher/partition manifest.  The
strength-first protocol deliberately generates fresh-selection labels only
after all three final checkpoints have strict-loaded, so its selection teacher
has a later, distinct authority.

This adapter reuses the real tensor loading, exact int16 emulation, and metric
implementation from ``eval-sibling.py`` while leaving authority, ordering, and
artifact revalidation to ``strength_first_qat_selection_evaluator``.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import stat
import tempfile
from types import ModuleType
from typing import Any


STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA = (
    "shogi-floodgate-strength-first-selection-evaluation-report-v1"
)
STRENGTH_FIRST_SELECTION_EVALUATION_STATUS = (
    "complete-stable-and-three-candidates-evaluated-once"
)
STRENGTH_FIRST_SELECTION_MODEL_ORDER = (
    "stable",
    "floodgate-strength-first-int16-aware-seed-42",
    "floodgate-strength-first-int16-aware-seed-43",
    "floodgate-strength-first-int16-aware-seed-44",
)
STRENGTH_FIRST_SELECTION_PAIR_MIN_CP = 50.0
STRENGTH_FIRST_SELECTION_CP_CLAMP = 3_000
STRENGTH_FIRST_SELECTION_BATCH_SIZE = 4_096
STRENGTH_FIRST_SELECTION_MAX_WORKERS = 2
_METRIC_FIELDS = {
    "value_mae_cp",
    "value_mse_cp2",
    "within_parent_pair_accuracy",
    "teacher_top1_accuracy",
}
_CHECKPOINT_SPEC_FIELDS = {
    "name",
    "path",
    "bytes",
    "sha256",
    "epoch",
}


def _load_real_eval_module() -> ModuleType:
    source = Path(__file__).with_name("eval-sibling.py")
    spec = importlib.util.spec_from_file_location(
        "strength_first_qat_real_eval",
        source,
    )
    if spec is None or spec.loader is None:
        raise ValueError("cannot load the pinned sibling evaluator")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _exact_dict(
    value: Any,
    fields: set[str],
    label: str,
) -> dict[str, Any]:
    if (
        type(value) is not dict
        or any(type(key) is not str for key in value)
        or set(value) != fields
    ):
        raise ValueError(f"{label} fields are not exact")
    return value


def _sha256(value: Any, label: str) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or value == "0" * 64
        or any(character not in "0123456789abcdef" for character in value)
    ):
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _checkpoint_specs(
    specs: Sequence[Mapping[str, Any]],
) -> list[dict[str, Any]]:
    if type(specs) not in (list, tuple) or len(specs) != 4:
        raise ValueError(
            "strength-first selection requires stable plus exactly three candidates"
        )
    normalized = []
    for index, (value, expected_name) in enumerate(
        zip(specs, STRENGTH_FIRST_SELECTION_MODEL_ORDER)
    ):
        spec = _exact_dict(
            dict(value) if isinstance(value, Mapping) else value,
            _CHECKPOINT_SPEC_FIELDS,
            f"checkpoint_specs[{index}]",
        )
        if (
            spec["name"] != expected_name
            or type(spec["path"]) is not str
            or not spec["path"]
            or os.path.realpath(spec["path"]) != os.path.abspath(spec["path"])
            or type(spec["bytes"]) is not int
            or spec["bytes"] < 1
            or type(spec["epoch"]) is not int
            or spec["epoch"] < 1
        ):
            raise ValueError(f"checkpoint_specs[{index}] is invalid")
        _sha256(spec["sha256"], f"checkpoint_specs[{index}].sha256")
        normalized.append(spec)
    if (
        len({spec["path"] for spec in normalized}) != 4
        or len({spec["sha256"] for spec in normalized}) != 4
    ):
        raise ValueError("selection checkpoint paths and hashes must be distinct")
    if normalized[0]["epoch"] != 27 or any(
        spec["epoch"] != 20 for spec in normalized[1:]
    ):
        raise ValueError("selection checkpoint epochs are not exact")
    return normalized


def _metric_set(value: Any, label: str) -> dict[str, float]:
    metrics = _exact_dict(value, _METRIC_FIELDS, label)
    normalized: dict[str, float] = {}
    for field in _METRIC_FIELDS:
        metric = metrics[field]
        if type(metric) not in (int, float) or not math.isfinite(metric):
            raise ValueError(f"{label}.{field} is not finite")
        normalized[field] = float(metric)
    if (
        normalized["value_mae_cp"] < 0.0
        or normalized["value_mse_cp2"] < 0.0
        or not 0.0 <= normalized["within_parent_pair_accuracy"] <= 1.0
        or not 0.0 <= normalized["teacher_top1_accuracy"] <= 1.0
    ):
        raise ValueError(f"{label} is outside its metric domain")
    return normalized


def _canonical_json_payload(value: dict[str, Any]) -> bytes:
    if type(value) is not dict:
        raise ValueError("fresh-selection row root must be an exact object")
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    ).encode("utf-8")


def _strict_json_object(raw: bytes, label: str) -> dict[str, Any]:
    def object_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"{label} contains a duplicate JSON key")
            result[key] = value
        return result

    def reject_constant(value):
        raise ValueError(f"{label} contains a non-finite value: {value}")

    try:
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=object_pairs,
            parse_constant=reject_constant,
        )
    except (UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(f"{label} is not strict UTF-8 JSON") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an exact object")
    return value


def _stable_stat_identity(metadata: os.stat_result) -> tuple[int, ...]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_size,
        metadata.st_mtime_ns,
        metadata.st_ctime_ns,
        metadata.st_nlink,
        metadata.st_uid,
    )


def _private_regular_source(metadata: os.stat_result) -> None:
    if (
        not stat.S_ISREG(metadata.st_mode)
        or metadata.st_uid != os.geteuid()
        or metadata.st_nlink != 1
        or stat.S_IMODE(metadata.st_mode) & 0o077
    ):
        raise ValueError(
            "fresh-selection dataset must be a private current-user regular file"
        )


def _load_splitless_fresh_selection_as_validation(
    *,
    evaluator: ModuleType,
    data_path: str,
    dataset_bytes: int,
    dataset_sha256: str,
    expected_records: int,
) -> tuple[Any, ...]:
    """Project the role-bound splitless artifact to a private ``val`` view.

    Fresh-selection role ownership is bound by its outer manifest/result, so
    its exact canonical rows intentionally have no ``split`` field.  The
    historical metric loader accepts only already-partitioned sibling rows.
    This projection supplies that loader-only compatibility field without
    changing, republishing, or reporting the registered source artifact.
    """

    flags = os.O_RDONLY
    flags |= getattr(os, "O_CLOEXEC", 0)
    flags |= getattr(os, "O_NOFOLLOW", 0)
    try:
        source_descriptor = os.open(data_path, flags)
    except OSError as error:
        raise ValueError("fresh-selection dataset cannot be opened safely") from error

    try:
        with os.fdopen(source_descriptor, "rb") as source:
            source_descriptor = -1
            source_before = os.fstat(source.fileno())
            path_before = os.lstat(data_path)
            _private_regular_source(source_before)
            if _stable_stat_identity(source_before) != _stable_stat_identity(
                path_before
            ):
                raise ValueError("fresh-selection dataset path changed before read")

            with tempfile.TemporaryDirectory(
                prefix="shogi-strength-first-selection-"
            ) as temporary_directory:
                os.chmod(temporary_directory, 0o700)
                if stat.S_IMODE(os.stat(temporary_directory).st_mode) != 0o700:
                    raise ValueError(
                        "fresh-selection projection directory is not private 0700"
                    )
                projected_path = os.path.join(
                    temporary_directory,
                    "selection-val.jsonl",
                )
                projection_flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
                projection_flags |= getattr(os, "O_CLOEXEC", 0)
                projected_descriptor = -1
                try:
                    projected_descriptor = os.open(
                        projected_path,
                        projection_flags,
                        0o600,
                    )
                    os.fchmod(projected_descriptor, 0o600)
                    projection = os.fdopen(projected_descriptor, "wb")
                    projected_descriptor = -1

                    source_digest = hashlib.sha256()
                    projected_digest = hashlib.sha256()
                    source_size = 0
                    projected_size = 0
                    records = 0
                    with projection:
                        for line in source:
                            records += 1
                            source_size += len(line)
                            source_digest.update(line)
                            if (
                                source_size > dataset_bytes
                                or records > expected_records
                            ):
                                raise ValueError(
                                    "fresh-selection dataset exceeds its "
                                    "registered identity"
                                )
                            if line == b"\n" or not line.endswith(b"\n"):
                                raise ValueError(
                                    "fresh-selection dataset row "
                                    f"{records} is not one-LF JSONL"
                                )
                            payload = line[:-1]
                            row = _strict_json_object(
                                payload,
                                f"fresh-selection dataset row {records}",
                            )
                            if payload != _canonical_json_payload(row):
                                raise ValueError(
                                    "fresh-selection dataset row "
                                    f"{records} is not canonical JSON"
                                )
                            if "split" in row:
                                raise ValueError(
                                    "fresh-selection dataset row "
                                    f"{records} must not declare split"
                                )
                            projected_line = (
                                _canonical_json_payload({**row, "split": "val"}) + b"\n"
                            )
                            projection.write(projected_line)
                            projected_digest.update(projected_line)
                            projected_size += len(projected_line)

                        source_after = os.fstat(source.fileno())
                        if _stable_stat_identity(
                            source_before
                        ) != _stable_stat_identity(source_after):
                            raise ValueError(
                                "fresh-selection dataset changed while projected"
                            )
                        projection.flush()
                        os.fsync(projection.fileno())
                        if stat.S_IMODE(os.fstat(projection.fileno()).st_mode) != 0o600:
                            raise ValueError(
                                "fresh-selection projection is not private 0600"
                            )
                finally:
                    if projected_descriptor >= 0:
                        os.close(projected_descriptor)

                original_identity = {
                    "bytes": source_size,
                    "sha256": source_digest.hexdigest(),
                }
                if (
                    records != expected_records
                    or original_identity["bytes"] != dataset_bytes
                    or original_identity["sha256"] != dataset_sha256
                ):
                    raise ValueError(
                        "fresh-selection dataset identity or row count mismatch "
                        "during projection"
                    )
                projected_identity = {
                    "bytes": projected_size,
                    "sha256": projected_digest.hexdigest(),
                }

                loaded = evaluator.load_validation_data(
                    projected_path,
                    STRENGTH_FIRST_SELECTION_CP_CLAMP,
                )
                if type(loaded) is not tuple or len(loaded) != 8:
                    raise ValueError("fresh-selection metric loader result is invalid")
                projected_fingerprint = loaded[7]
                if (
                    type(projected_fingerprint) is not dict
                    or set(projected_fingerprint) != {"bytes", "sha256"}
                    or projected_fingerprint != projected_identity
                ):
                    raise ValueError(
                        "fresh-selection metric loader read a different projection"
                    )
                try:
                    path_after = os.lstat(data_path)
                except OSError as error:
                    raise ValueError(
                        "fresh-selection dataset path changed after projection"
                    ) from error
                if _stable_stat_identity(source_before) != _stable_stat_identity(
                    os.fstat(source.fileno())
                ) or _stable_stat_identity(path_before) != _stable_stat_identity(
                    path_after
                ):
                    raise ValueError(
                        "fresh-selection dataset path changed during metric load"
                    )
                return (*loaded[:7], original_identity)
    finally:
        if source_descriptor >= 0:
            os.close(source_descriptor)


def evaluate_strength_first_selection(
    *,
    data_path: str,
    dataset_identity: Mapping[str, Any],
    checkpoint_specs: Sequence[Mapping[str, Any]],
    expected_records: int,
    expected_parents: int,
    max_workers: int = STRENGTH_FIRST_SELECTION_MAX_WORKERS,
    eval_module: ModuleType | None = None,
) -> dict[str, Any]:
    """Evaluate stable plus seeds 42/43/44 once using the real metric core."""

    if type(max_workers) is not int or not 1 <= max_workers <= 2:
        raise ValueError("strength-first selection max_workers must be 1 or 2")
    if (
        type(data_path) is not str
        or not data_path
        or os.path.realpath(data_path) != os.path.abspath(data_path)
        or type(dataset_identity) is not dict
        or set(dataset_identity) != {"bytes", "sha256"}
        or type(dataset_identity["bytes"]) is not int
        or dataset_identity["bytes"] < 1
        or type(expected_records) is not int
        or expected_records < 2
        or type(expected_parents) is not int
        or expected_parents < 1
    ):
        raise ValueError("strength-first selection dataset contract is invalid")
    expected_dataset_sha256 = _sha256(
        dataset_identity["sha256"],
        "selection dataset SHA-256",
    )
    specs = _checkpoint_specs(checkpoint_specs)
    evaluator = eval_module if eval_module is not None else _load_real_eval_module()

    (
        board,
        hands,
        bucket,
        clamped_cp,
        raw_cp,
        metadata,
        groups,
        data_fingerprint,
    ) = _load_splitless_fresh_selection_as_validation(
        evaluator=evaluator,
        data_path=data_path,
        dataset_bytes=dataset_identity["bytes"],
        dataset_sha256=expected_dataset_sha256,
        expected_records=expected_records,
    )
    if (
        type(data_fingerprint) is not dict
        or data_fingerprint.get("bytes") != dataset_identity["bytes"]
        or data_fingerprint.get("sha256") != expected_dataset_sha256
        or len(metadata) != expected_records
        or len(groups) != expected_parents
    ):
        raise ValueError(
            "selection dataset identity or complete teacher accounting mismatch"
        )
    eligible_pairs = evaluator._eligible_pair_count(
        raw_cp,
        groups,
        STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
    )
    if type(eligible_pairs) is not int or eligible_pairs <= 0:
        raise ValueError("selection dataset has no eligible sibling pair")

    models = []
    for index, spec in enumerate(specs):
        model, checkpoint, k_sigmoid, checkpoint_fingerprint = evaluator.load_model(
            spec["path"]
        )
        if (
            type(checkpoint_fingerprint) is not dict
            or checkpoint_fingerprint.get("bytes") != spec["bytes"]
            or checkpoint_fingerprint.get("sha256") != spec["sha256"]
            or not isinstance(checkpoint, Mapping)
            or checkpoint.get("epoch") != spec["epoch"]
            or type(k_sigmoid) not in (int, float)
            or not math.isfinite(k_sigmoid)
            or float(k_sigmoid) != 600.0
        ):
            raise ValueError(
                f"selection checkpoint {spec['name']} identity or metadata drifted"
            )
        floating_predictions = evaluator.float_predictions(
            model,
            board,
            hands,
            bucket,
            float(k_sigmoid),
            STRENGTH_FIRST_SELECTION_BATCH_SIZE,
        )
        floating = _metric_set(
            evaluator.calculate_metrics(
                floating_predictions,
                clamped_cp,
                raw_cp,
                metadata,
                STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
            ),
            f"models[{index}].float",
        )
        integer_predictions = evaluator.quantized_predictions(
            model,
            board,
            hands,
            float(k_sigmoid),
        )
        quantized = _metric_set(
            evaluator.calculate_metrics(
                integer_predictions,
                clamped_cp,
                raw_cp,
                metadata,
                STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
            ),
            f"models[{index}].quantized_int16",
        )
        delta = {field: quantized[field] - floating[field] for field in _METRIC_FIELDS}
        if any(not math.isfinite(value) for value in delta.values()):
            raise ValueError(
                f"selection checkpoint {spec['name']} produced a non-finite delta"
            )
        models.append(
            {
                "name": spec["name"],
                "checkpoint": {
                    "bytes": spec["bytes"],
                    "sha256": spec["sha256"],
                    "epoch": spec["epoch"],
                },
                "k_sigmoid": 600.0,
                "production_k_int": 600,
                "float": floating,
                "quantized_int16": {
                    **quantized,
                    "delta_from_float": delta,
                },
            }
        )

    return {
        "schema": STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
        "status": STRENGTH_FIRST_SELECTION_EVALUATION_STATUS,
        "data": {
            "bytes": dataset_identity["bytes"],
            "sha256": expected_dataset_sha256,
            "records": expected_records,
            "parents": expected_parents,
            "eligible_pairs": eligible_pairs,
            "pair_min_cp": STRENGTH_FIRST_SELECTION_PAIR_MIN_CP,
            "value_cp_clamp": STRENGTH_FIRST_SELECTION_CP_CLAMP,
            "value_target": "clamped_child_cp",
            "ranking_target": ("unclamped_parent_cp_equals_negative_child_cp"),
        },
        "models": models,
        "execution": {
            "evaluation_count_per_model": 1,
            "requested_max_workers": max_workers,
            "actual_workers": 1,
            "network_requests": 0,
        },
    }


__all__ = [
    "STRENGTH_FIRST_SELECTION_BATCH_SIZE",
    "STRENGTH_FIRST_SELECTION_CP_CLAMP",
    "STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA",
    "STRENGTH_FIRST_SELECTION_EVALUATION_STATUS",
    "STRENGTH_FIRST_SELECTION_MAX_WORKERS",
    "STRENGTH_FIRST_SELECTION_MODEL_ORDER",
    "STRENGTH_FIRST_SELECTION_PAIR_MIN_CP",
    "evaluate_strength_first_selection",
]
