#!/usr/bin/env python3
"""Reproduce sealed selection evidence without importing Torch in-process.

The caller supplies an absolute Python interpreter and SHA-256 pins from an
independent receipt.  This module then runs the repository's fixed exporter
and evaluator in a private temporary directory with an allowlisted
environment.  It never imports either tool, so their Torch state cannot leak
into the audit process.

``reproduce_selection_evidence`` deliberately has no "update expected"
mode.  The existing export and report are evidence to verify, not golden
files this helper is allowed to rewrite.
"""

from __future__ import annotations

from collections.abc import Mapping
import hashlib
import hmac
import json
import math
import os
import re
import stat
import subprocess
import tempfile
from typing import Any


EVIDENCE_REPRODUCTION_SCHEMA = "shogi-sibling-evidence-reproduction-v1"
SEALED_EVAL_REPORT_SCHEMA = "shogi-sibling-eval-v2"

TOOL_SOURCE_FILES = {
    "export_tool": "ml/export-weights.py",
    "eval_tool": "ml/eval-sibling.py",
    "train_source": "ml/train.py",
    "checkpoint_compat_source": "ml/checkpoint_compat.py",
    "sibling_manifest_source": "ml/sibling_manifest.py",
    "sibling_selection_protocol_source": "ml/sibling_selection_protocol.py",
}
INPUT_FILE_LABELS = (
    "checkpoint",
    "selection_data",
    "sibling_manifest",
    "validation_partition_manifest",
    "policy_exposure_receipt",
    "policy_exposed_parent_ids",
    "policy_exposed_semantic_position_ids",
    "holdout_protected_position_ids",
)
EXPECTED_EVIDENCE_LABELS = (
    "expected_weights",
    "expected_weights_meta",
    "expected_selection_report",
)
PINNED_FILE_LABELS = (
    "python_interpreter",
    *TOOL_SOURCE_FILES.keys(),
    *INPUT_FILE_LABELS,
    *EXPECTED_EVIDENCE_LABELS,
)

FLOAT_METRIC_FIELDS = frozenset(
    {
        "value_mae_cp",
        "value_mse_cp2",
        "within_parent_pair_accuracy",
        "teacher_top1_accuracy",
    }
)
DATA_FIELDS = frozenset(
    {
        "path",
        "sha256",
        "bytes",
        "sibling_manifest_sha256",
        "sibling_manifest_bytes",
        "pipeline_source_revision",
        "teacher_runtime_snapshot",
        "sibling_manifest",
        "data_role",
        "validation_partition_manifest",
        "records",
        "parents",
        "eligible_pairs",
        "pair_min_cp",
        "value_target",
        "value_cp_clamp",
        "ranking_target",
    }
)
MODEL_FIELDS = frozenset(
    {
        "name",
        "checkpoint",
        "checkpoint_sha256",
        "checkpoint_bytes",
        "checkpoint_epoch",
        "training_provenance",
        "k_sigmoid",
        "production_k_int",
        "float",
        "quantized_int16",
    }
)
RUNTIME_FIELDS = frozenset(
    {
        "python_implementation",
        "python_version",
        "python_executable",
        "platform",
        "machine",
        "torch_version",
        "torch_threads",
        "torch_interop_threads",
    }
)

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_MODEL_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_RUNTIME_PROBE = (
    "import json,platform,sys,torch;"
    "print(json.dumps({"
    "'python_implementation':platform.python_implementation(),"
    "'python_version':platform.python_version(),"
    "'python_executable':sys.executable,"
    "'platform':platform.platform(),"
    "'machine':platform.machine(),"
    "'torch_version':str(torch.__version__),"
    "'torch_threads':torch.get_num_threads(),"
    "'torch_interop_threads':torch.get_num_interop_threads()"
    "},sort_keys=True,allow_nan=False))"
)
_TOOL_RUNNER = (
    "import runpy,sys;"
    "module_dir,tool=sys.argv[1:3];"
    "sys.path.insert(0,module_dir);"
    "sys.argv=[tool,*sys.argv[3:]];"
    "runpy.run_path(tool,run_name='__main__')"
)


class EvidenceReproductionError(ValueError):
    """The pinned evidence could not be reproduced exactly."""


def _reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise EvidenceReproductionError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _decode_json(raw: bytes | str, label: str) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8") if isinstance(raw, bytes) else raw
        value = json.loads(
            text,
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=lambda token: (_ for _ in ()).throw(
                EvidenceReproductionError(
                    f"{label} contains non-finite JSON number {token}"
                )
            ),
        )
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise EvidenceReproductionError(f"cannot decode {label}: {error}") from error
    if type(value) is not dict:
        raise EvidenceReproductionError(f"{label} root must be an object")
    return value


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        allow_nan=False,
    )


def _absolute_regular_file(
    path: str, label: str, *, allow_final_symlink: bool = False
) -> str:
    if not isinstance(path, str) or not path or not os.path.isabs(path):
        raise EvidenceReproductionError(f"{label} path must be absolute")
    if not allow_final_symlink and os.path.islink(path):
        raise EvidenceReproductionError(f"{label} must not be a symbolic link")
    real = os.path.realpath(path)
    try:
        mode = os.stat(real).st_mode
    except OSError as error:
        raise EvidenceReproductionError(f"cannot stat {label}: {error}") from error
    if not stat.S_ISREG(mode):
        raise EvidenceReproductionError(f"{label} is not a regular file")
    return real


def _file_receipt(path: str, label: str) -> dict[str, Any]:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    try:
        descriptor = os.open(path, flags)
        with os.fdopen(descriptor, "rb") as source:
            before = os.fstat(source.fileno())
            digest = hashlib.sha256()
            size = 0
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
                size += len(chunk)
            after = os.fstat(source.fileno())
    except OSError as error:
        raise EvidenceReproductionError(f"cannot read {label}: {error}") from error
    identity_before = (
        before.st_dev,
        before.st_ino,
        before.st_size,
        before.st_mtime_ns,
    )
    identity_after = (
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
    )
    if identity_before != identity_after or size != after.st_size:
        raise EvidenceReproductionError(f"{label} changed while it was hashed")
    return {"path": path, "bytes": size, "sha256": digest.hexdigest()}


def _read_file_bytes(path: str, label: str) -> bytes:
    try:
        with open(path, "rb") as source:
            return source.read()
    except OSError as error:
        raise EvidenceReproductionError(f"cannot read {label}: {error}") from error


def _require_exact_mapping(value: Any, fields: set[str] | frozenset[str], label: str):
    if not isinstance(value, Mapping) or set(value) != set(fields):
        raise EvidenceReproductionError(f"{label} fields are not exact")
    return value


def _require_positive_int(value: Any, label: str) -> int:
    if type(value) is not int or value <= 0:
        raise EvidenceReproductionError(f"{label} must be a positive integer")
    return value


def _validate_metrics(model: Mapping[str, Any], label: str) -> None:
    floating = _require_exact_mapping(
        model.get("float"), FLOAT_METRIC_FIELDS, f"{label}.float"
    )
    quantized = _require_exact_mapping(
        model.get("quantized_int16"),
        FLOAT_METRIC_FIELDS | {"delta_from_float"},
        f"{label}.quantized_int16",
    )
    delta = _require_exact_mapping(
        quantized.get("delta_from_float"),
        FLOAT_METRIC_FIELDS,
        f"{label}.quantized_int16.delta_from_float",
    )
    for field in FLOAT_METRIC_FIELDS:
        for metrics_name, metrics in (
            ("float", floating),
            ("quantized_int16", quantized),
            ("delta_from_float", delta),
        ):
            value = metrics[field]
            if type(value) is not float or not math.isfinite(value):
                raise EvidenceReproductionError(
                    f"{label}.{metrics_name}.{field} must be a finite float"
                )
        actual_delta = quantized[field] - floating[field]
        if float(delta[field]).hex() != float(actual_delta).hex():
            raise EvidenceReproductionError(
                f"{label}.quantized_int16.delta_from_float.{field} is inconsistent"
            )


def _validate_report(
    report: Mapping[str, Any],
    *,
    label: str,
    model_name: str,
    checkpoint_path: str,
    selection_data_path: str,
    receipts: Mapping[str, Mapping[str, Any]],
) -> tuple[Mapping[str, Any], Mapping[str, Any]]:
    _require_exact_mapping(report, {"schema", "data", "models"}, label)
    if report.get("schema") != SEALED_EVAL_REPORT_SCHEMA:
        raise EvidenceReproductionError(f"{label} schema mismatch")
    data = _require_exact_mapping(report.get("data"), DATA_FIELDS, f"{label}.data")
    if (
        not isinstance(data.get("path"), str)
        or os.path.realpath(data["path"]) != selection_data_path
    ):
        raise EvidenceReproductionError(f"{label} selection-data path mismatch")
    if (
        data.get("data_role") != "selection"
        or data.get("sha256") != receipts["selection_data"]["sha256"]
        or data.get("bytes") != receipts["selection_data"]["bytes"]
        or data.get("sibling_manifest_sha256")
        != receipts["sibling_manifest"]["sha256"]
        or data.get("sibling_manifest_bytes")
        != receipts["sibling_manifest"]["bytes"]
    ):
        raise EvidenceReproductionError(f"{label} sealed data identity mismatch")
    for field in ("records", "parents", "eligible_pairs", "value_cp_clamp"):
        _require_positive_int(data.get(field), f"{label}.data.{field}")
    if type(data.get("pair_min_cp")) is not float or not math.isfinite(
        data["pair_min_cp"]
    ):
        raise EvidenceReproductionError(f"{label}.data.pair_min_cp is invalid")
    manifest = data.get("sibling_manifest")
    partition = data.get("validation_partition_manifest")
    if not isinstance(manifest, Mapping) or not isinstance(partition, Mapping):
        raise EvidenceReproductionError(f"{label} manifest provenance is missing")
    if (
        manifest.get("sha256") != receipts["sibling_manifest"]["sha256"]
        or manifest.get("bytes") != receipts["sibling_manifest"]["bytes"]
        or partition.get("sha256")
        != receipts["validation_partition_manifest"]["sha256"]
        or partition.get("bytes")
        != receipts["validation_partition_manifest"]["bytes"]
    ):
        raise EvidenceReproductionError(f"{label} manifest provenance mismatch")

    models = report.get("models")
    if type(models) is not list or len(models) != 1:
        raise EvidenceReproductionError(f"{label} must contain exactly one model")
    model = _require_exact_mapping(models[0], MODEL_FIELDS, f"{label}.models[0]")
    if (
        model.get("name") != model_name
        or not isinstance(model.get("checkpoint"), str)
        or os.path.realpath(model["checkpoint"]) != checkpoint_path
        or model.get("checkpoint_sha256") != receipts["checkpoint"]["sha256"]
        or model.get("checkpoint_bytes") != receipts["checkpoint"]["bytes"]
        or not isinstance(model.get("training_provenance"), Mapping)
    ):
        raise EvidenceReproductionError(f"{label} checkpoint provenance mismatch")
    if (
        type(model.get("k_sigmoid")) is not float
        or not math.isfinite(model["k_sigmoid"])
        or type(model.get("production_k_int")) is not int
    ):
        raise EvidenceReproductionError(f"{label} model scale is invalid")
    _validate_metrics(model, f"{label}.models[0]")
    return data, model


def _assert_reports_match(
    expected: Mapping[str, Any], computed: Mapping[str, Any]
) -> None:
    expected_data, expected_model = expected["data"], expected["models"][0]
    computed_data, computed_model = computed["data"], computed["models"][0]
    expected_data_core = {
        key: value for key, value in expected_data.items() if key != "path"
    }
    computed_data_core = {
        key: value for key, value in computed_data.items() if key != "path"
    }
    if _canonical_json(expected_data_core) != _canonical_json(computed_data_core):
        raise EvidenceReproductionError(
            "computed selection report data/provenance differs from existing report"
        )
    model_core_fields = MODEL_FIELDS - {
        "checkpoint",
        "float",
        "quantized_int16",
    }
    expected_model_core = {key: expected_model[key] for key in model_core_fields}
    computed_model_core = {key: computed_model[key] for key in model_core_fields}
    if _canonical_json(expected_model_core) != _canonical_json(computed_model_core):
        raise EvidenceReproductionError(
            "computed selection report model provenance differs from existing report"
        )
    for field in ("float", "quantized_int16"):
        if _canonical_json(expected_model[field]) != _canonical_json(
            computed_model[field]
        ):
            raise EvidenceReproductionError(
                f"computed selection report {field} metrics differ from existing report"
            )


def _run_checked(
    command: list[str], *, cwd: str, environment: Mapping[str, str], timeout: int
) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            cwd=cwd,
            env=dict(environment),
            stdin=subprocess.DEVNULL,
            capture_output=True,
            text=True,
            shell=False,
            timeout=timeout,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as error:
        stderr = getattr(error, "stderr", "") or ""
        detail = stderr[-2000:].strip()
        suffix = f": {detail}" if detail else ""
        raise EvidenceReproductionError(
            f"isolated command failed: {os.path.basename(command[-1])}{suffix}"
        ) from error


def _validate_runtime(raw: str, interpreter: str) -> dict[str, Any]:
    runtime = _decode_json(raw, "runtime probe")
    _require_exact_mapping(runtime, RUNTIME_FIELDS, "runtime probe")
    for field in (
        "python_implementation",
        "python_version",
        "python_executable",
        "platform",
        "machine",
        "torch_version",
    ):
        if not isinstance(runtime.get(field), str) or not runtime[field]:
            raise EvidenceReproductionError(f"runtime probe {field} is invalid")
    if os.path.realpath(runtime["python_executable"]) != interpreter:
        raise EvidenceReproductionError("runtime probe used a different interpreter")
    for field in ("torch_threads", "torch_interop_threads"):
        _require_positive_int(runtime.get(field), f"runtime probe {field}")
    return runtime


def _verify_pins(
    receipts: Mapping[str, Mapping[str, Any]], pinned_sha256: Mapping[str, str]
) -> None:
    if not isinstance(pinned_sha256, Mapping) or set(pinned_sha256) != set(
        PINNED_FILE_LABELS
    ):
        raise EvidenceReproductionError("pinned SHA-256 labels are not exact")
    for label in PINNED_FILE_LABELS:
        expected = pinned_sha256[label]
        if not isinstance(expected, str) or _SHA256_RE.fullmatch(expected) is None:
            raise EvidenceReproductionError(f"{label} pin is not a lowercase SHA-256")
        if not hmac.compare_digest(receipts[label]["sha256"], expected):
            raise EvidenceReproductionError(f"{label} differs from its SHA-256 pin")


def _assert_sources_unchanged(
    paths: Mapping[str, str], initial: Mapping[str, Mapping[str, Any]]
) -> None:
    for label in PINNED_FILE_LABELS:
        current = _file_receipt(paths[label], label)
        if current != initial[label]:
            raise EvidenceReproductionError(f"{label} changed during reproduction")


def _resolve_pinned_paths(
    *,
    repo_root: str,
    python_interpreter: str,
    checkpoint_path: str,
    selection_data_path: str,
    sibling_manifest_path: str,
    validation_partition_manifest_path: str,
    policy_exposure_receipt_path: str,
    policy_exposed_parent_ids_path: str,
    policy_exposed_semantic_position_ids_path: str,
    holdout_protected_position_ids_path: str,
    expected_weights_path: str,
    expected_weights_meta_path: str,
    expected_selection_report_path: str,
) -> tuple[str, dict[str, str]]:
    if not isinstance(repo_root, str) or not repo_root or not os.path.isabs(repo_root):
        raise EvidenceReproductionError("repo_root must be absolute")
    root = os.path.realpath(repo_root)
    if not os.path.isdir(root):
        raise EvidenceReproductionError("repo_root is not a directory")
    interpreter_launcher = os.path.abspath(python_interpreter)
    paths = {
        # Hash the resolved executable, but preserve the venv launcher for
        # execution: resolving venv/bin/python before launch loses pyvenv.cfg
        # discovery and therefore its site-packages.
        "python_launcher": interpreter_launcher,
        "python_interpreter": _absolute_regular_file(
            python_interpreter,
            "python_interpreter",
            allow_final_symlink=True,
        ),
        **{
            label: _absolute_regular_file(os.path.join(root, relative), label)
            for label, relative in TOOL_SOURCE_FILES.items()
        },
        "checkpoint": _absolute_regular_file(checkpoint_path, "checkpoint"),
        "selection_data": _absolute_regular_file(
            selection_data_path, "selection_data"
        ),
        "sibling_manifest": _absolute_regular_file(
            sibling_manifest_path, "sibling_manifest"
        ),
        "validation_partition_manifest": _absolute_regular_file(
            validation_partition_manifest_path, "validation_partition_manifest"
        ),
        "policy_exposure_receipt": _absolute_regular_file(
            policy_exposure_receipt_path, "policy_exposure_receipt"
        ),
        "policy_exposed_parent_ids": _absolute_regular_file(
            policy_exposed_parent_ids_path, "policy_exposed_parent_ids"
        ),
        "policy_exposed_semantic_position_ids": _absolute_regular_file(
            policy_exposed_semantic_position_ids_path,
            "policy_exposed_semantic_position_ids",
        ),
        "holdout_protected_position_ids": _absolute_regular_file(
            holdout_protected_position_ids_path,
            "holdout_protected_position_ids",
        ),
        "expected_weights": _absolute_regular_file(
            expected_weights_path, "expected_weights"
        ),
        "expected_weights_meta": _absolute_regular_file(
            expected_weights_meta_path, "expected_weights_meta"
        ),
        "expected_selection_report": _absolute_regular_file(
            expected_selection_report_path, "expected_selection_report"
        ),
    }
    if not os.access(paths["python_launcher"], os.X_OK):
        raise EvidenceReproductionError("python_interpreter is not executable")
    return root, paths


def collect_reproduction_pins(
    *,
    repo_root: str,
    python_interpreter: str,
    checkpoint_path: str,
    selection_data_path: str,
    sibling_manifest_path: str,
    validation_partition_manifest_path: str,
    policy_exposure_receipt_path: str,
    policy_exposed_parent_ids_path: str,
    policy_exposed_semantic_position_ids_path: str,
    holdout_protected_position_ids_path: str,
    expected_weights_path: str,
    expected_weights_meta_path: str,
    expected_selection_report_path: str,
) -> dict[str, Any]:
    """Snapshot exact pin labels and receipts without executing either tool.

    This is an inventory convenience, not an independent trust root.  A
    caller should replace plan-bound SHA-256 values with its sealed values
    before passing ``pinned_sha256`` to the reproduction function.
    """
    _root, paths = _resolve_pinned_paths(
        repo_root=repo_root,
        python_interpreter=python_interpreter,
        checkpoint_path=checkpoint_path,
        selection_data_path=selection_data_path,
        sibling_manifest_path=sibling_manifest_path,
        validation_partition_manifest_path=validation_partition_manifest_path,
        policy_exposure_receipt_path=policy_exposure_receipt_path,
        policy_exposed_parent_ids_path=policy_exposed_parent_ids_path,
        policy_exposed_semantic_position_ids_path=(
            policy_exposed_semantic_position_ids_path
        ),
        holdout_protected_position_ids_path=holdout_protected_position_ids_path,
        expected_weights_path=expected_weights_path,
        expected_weights_meta_path=expected_weights_meta_path,
        expected_selection_report_path=expected_selection_report_path,
    )
    receipts = {
        label: _file_receipt(paths[label], label) for label in PINNED_FILE_LABELS
    }
    return {
        "labels": list(PINNED_FILE_LABELS),
        "receipts": receipts,
        "pinned_sha256": {
            label: receipts[label]["sha256"] for label in PINNED_FILE_LABELS
        },
    }


def reproduce_selection_evidence(
    *,
    repo_root: str,
    python_interpreter: str,
    checkpoint_path: str,
    selection_data_path: str,
    sibling_manifest_path: str,
    validation_partition_manifest_path: str,
    policy_exposure_receipt_path: str,
    policy_exposed_parent_ids_path: str,
    policy_exposed_semantic_position_ids_path: str,
    holdout_protected_position_ids_path: str,
    expected_weights_path: str,
    expected_weights_meta_path: str,
    expected_selection_report_path: str,
    model_name: str,
    pinned_sha256: Mapping[str, str],
) -> dict[str, Any]:
    """Re-run export/evaluation and return receipts only after exact agreement.

    Every path must be absolute.  ``python_interpreter`` may itself be a
    symlink (as virtual-environment launchers commonly are). Its resolved
    executable is hashed while the checked launcher path is invoked so Python
    can discover the venv. All other final path components must be regular
    non-symlink files.
    """
    if not isinstance(model_name, str) or _MODEL_NAME_RE.fullmatch(model_name) is None:
        raise EvidenceReproductionError("model_name is invalid")
    _root, paths = _resolve_pinned_paths(
        repo_root=repo_root,
        python_interpreter=python_interpreter,
        checkpoint_path=checkpoint_path,
        selection_data_path=selection_data_path,
        sibling_manifest_path=sibling_manifest_path,
        validation_partition_manifest_path=validation_partition_manifest_path,
        policy_exposure_receipt_path=policy_exposure_receipt_path,
        policy_exposed_parent_ids_path=policy_exposed_parent_ids_path,
        policy_exposed_semantic_position_ids_path=(
            policy_exposed_semantic_position_ids_path
        ),
        holdout_protected_position_ids_path=holdout_protected_position_ids_path,
        expected_weights_path=expected_weights_path,
        expected_weights_meta_path=expected_weights_meta_path,
        expected_selection_report_path=expected_selection_report_path,
    )
    initial = {
        label: _file_receipt(paths[label], label) for label in PINNED_FILE_LABELS
    }
    _verify_pins(initial, pinned_sha256)

    expected_report = _decode_json(
        _read_file_bytes(paths["expected_selection_report"], "expected report"),
        "expected selection report",
    )
    _validate_report(
        expected_report,
        label="expected selection report",
        model_name=model_name,
        checkpoint_path=paths["checkpoint"],
        selection_data_path=paths["selection_data"],
        receipts=initial,
    )

    with tempfile.TemporaryDirectory(prefix="shogi-evidence-reproduction-") as temporary:
        home = os.path.join(temporary, "home")
        export_dir = os.path.join(temporary, "export")
        pycache = os.path.join(temporary, "pycache")
        os.mkdir(home, 0o700)
        os.mkdir(export_dir, 0o700)
        os.mkdir(pycache, 0o700)
        report_path = os.path.join(temporary, "selection-report.json")
        environment = {
            "HOME": home,
            "LANG": "C",
            "LC_ALL": "C",
            "PATH": "/usr/bin:/bin",
            "TMPDIR": temporary,
            "TZ": "UTC",
            "OMP_NUM_THREADS": "2",
            "MKL_NUM_THREADS": "2",
            "OPENBLAS_NUM_THREADS": "1",
            "VECLIB_MAXIMUM_THREADS": "2",
            "NUMEXPR_NUM_THREADS": "2",
        }
        python_prefix = [
            paths["python_launcher"],
            "-I",
            "-B",
            "-X",
            f"pycache_prefix={pycache}",
        ]
        runtime_result = _run_checked(
            [*python_prefix, "-c", _RUNTIME_PROBE],
            cwd=temporary,
            environment=environment,
            timeout=120,
        )
        runtime = _validate_runtime(
            runtime_result.stdout, paths["python_interpreter"]
        )

        _run_checked(
            [
                *python_prefix,
                "-c",
                _TOOL_RUNNER,
                os.path.dirname(paths["export_tool"]),
                paths["export_tool"],
                "--ckpt",
                paths["checkpoint"],
                "--out-dir",
                export_dir,
            ],
            cwd=temporary,
            environment=environment,
            timeout=900,
        )
        if set(os.listdir(export_dir)) != {"weights.bin", "weights.meta.json"}:
            raise EvidenceReproductionError(
                "isolated export did not produce exactly weights.bin and weights.meta.json"
            )
        reproduced_weights_path = _absolute_regular_file(
            os.path.join(export_dir, "weights.bin"), "reproduced_weights"
        )
        reproduced_meta_path = _absolute_regular_file(
            os.path.join(export_dir, "weights.meta.json"),
            "reproduced_weights_meta",
        )
        if not hmac.compare_digest(
            _read_file_bytes(reproduced_weights_path, "reproduced weights"),
            _read_file_bytes(paths["expected_weights"], "expected weights"),
        ):
            raise EvidenceReproductionError(
                "reproduced weights.bin differs byte-for-byte from existing export"
            )
        if not hmac.compare_digest(
            _read_file_bytes(reproduced_meta_path, "reproduced metadata"),
            _read_file_bytes(paths["expected_weights_meta"], "expected metadata"),
        ):
            raise EvidenceReproductionError(
                "reproduced weights.meta.json differs byte-for-byte from existing export"
            )
        reproduced_weights = _file_receipt(
            reproduced_weights_path, "reproduced_weights"
        )
        reproduced_meta = _file_receipt(
            reproduced_meta_path, "reproduced_weights_meta"
        )

        _run_checked(
            [
                *python_prefix,
                "-c",
                _TOOL_RUNNER,
                os.path.dirname(paths["eval_tool"]),
                paths["eval_tool"],
                "--data",
                paths["selection_data"],
                "--sibling-manifest",
                paths["sibling_manifest"],
                "--validation-partition-manifest",
                paths["validation_partition_manifest"],
                "--data-role",
                "selection",
                "--policy-exposure-receipt",
                paths["policy_exposure_receipt"],
                "--policy-exposed-parent-ids",
                paths["policy_exposed_parent_ids"],
                "--policy-exposed-semantic-position-ids",
                paths["policy_exposed_semantic_position_ids"],
                "--holdout-protected-position-ids",
                paths["holdout_protected_position_ids"],
                "--checkpoint",
                f"{model_name}={paths['checkpoint']}",
                "--pair-min-cp",
                "50",
                "--cp-clamp",
                "3000",
                "--batch-size",
                "4096",
                "--json-out",
                report_path,
            ],
            cwd=temporary,
            environment=environment,
            timeout=3600,
        )
        reproduced_report_path = _absolute_regular_file(
            report_path, "reproduced_selection_report"
        )
        reproduced_report = _decode_json(
            _read_file_bytes(reproduced_report_path, "reproduced report"),
            "reproduced selection report",
        )
        _validate_report(
            reproduced_report,
            label="reproduced selection report",
            model_name=model_name,
            checkpoint_path=paths["checkpoint"],
            selection_data_path=paths["selection_data"],
            receipts=initial,
        )
        _assert_reports_match(expected_report, reproduced_report)
        reproduced_report_receipt = _file_receipt(
            reproduced_report_path, "reproduced_selection_report"
        )

        _assert_sources_unchanged(paths, initial)
        if os.path.realpath(paths["python_launcher"]) != paths["python_interpreter"]:
            raise EvidenceReproductionError(
                "python_interpreter launcher target changed during reproduction"
            )
        result = {
            "schema": EVIDENCE_REPRODUCTION_SCHEMA,
            "status": "reproduced_exactly",
            "interpreter": {
                "launcher": paths["python_launcher"],
                "file": dict(initial["python_interpreter"]),
                "runtime": runtime,
            },
            "tools": {
                label: dict(initial[label]) for label in TOOL_SOURCE_FILES
            },
            "sources": {label: dict(initial[label]) for label in INPUT_FILE_LABELS},
            "evidence": {
                "export": {
                    "weights_byte_exact": True,
                    "metadata_byte_exact": True,
                    "existing_weights": dict(initial["expected_weights"]),
                    "existing_weights_meta": dict(
                        initial["expected_weights_meta"]
                    ),
                    "reproduced_weights": reproduced_weights,
                    "reproduced_weights_meta": reproduced_meta,
                },
                "selection_report": {
                    "float_metrics_exact": True,
                    "int16_metrics_exact": True,
                    "core_data_provenance_exact": True,
                    "existing": dict(initial["expected_selection_report"]),
                    "reproduced": reproduced_report_receipt,
                    "metrics": {
                        "float": dict(reproduced_report["models"][0]["float"]),
                        "quantized_int16": dict(
                            reproduced_report["models"][0]["quantized_int16"]
                        ),
                    },
                },
            },
            "execution": {
                "isolated_python": True,
                "shell": False,
                "environment_keys": sorted(environment),
                "torch_intraop_threads_requested": 2,
            },
        }
    return result
