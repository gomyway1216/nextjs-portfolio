"""Torch-independent schemas shared by training, selection, and match gates."""

from __future__ import annotations

from collections.abc import Mapping
import math
import re


SIX_RUN_PLAN_SCHEMA = "shogi-sibling-six-run-plan-v1"
TRAINING_RESULT_SCHEMA = "shogi-sibling-training-result-v1"
WCSC36_SIX_RUN_PLAN_SHA256 = (
    "0e34262f77555897d92b01a3737c71057d8b90cc98cdcb2fe63ad24ec4dde070"
)
CANDIDATE_SELECTION_RECEIPT_SCHEMA = (
    "shogi-sibling-candidate-selection-receipt-v1"
)
SELECTION_AUDIT_SCHEMA = "shogi-sibling-six-run-selection-audit-v1"
WCSC36_STABLE_RUNOP1_SHA256 = (
    "571ca3090cd0f41772514547ea5ac1d5bcd32f3f79820511645e298dbaa65ff8"
)
PAIR_DEGRADATION_LIMIT = 0.002
TOP1_DEGRADATION_LIMIT = 0.005

EXPERIMENT_SERIES = ("warm", "scratch")
EXPERIMENT_SEEDS = (42, 43, 44)
SIX_RUN_SLOT_ORDER = tuple(
    (series, seed) for series in EXPERIMENT_SERIES for seed in EXPERIMENT_SEEDS
)
SELECTION_TIE_BREAK = (
    "series:warm-before-scratch",
    "seed:ascending",
    "checkpoint_sha256:ascending",
)
MODEL_SELECTION_METRIC_ORDER = (
    "int16_pair_accuracy:max",
    "int16_teacher_top1:max",
    "int16_value_mae_cp:min",
)
CANDIDATE_SELECTION_STRATEGY = (
    "median-ranked-seed-per-series-then-best-representative"
)
RESULT_ARTIFACT_NAMES = (
    "best.pt",
    "best-value.pt",
    "best-sibling.pt",
    "last.pt",
    "curve.csv",
)

# The future final-holdout unlocker must strict-decode exactly these fields.
# ``runs`` has six entries in SIX_RUN_SLOT_ORDER and binds each result marker,
# checkpoint, int16 export, and int16 selection report used for ranking.
CANDIDATE_SELECTION_RECEIPT_FIELDS = frozenset(
    {
        "schema",
        "run_plan",
        "runs",
        "selection_strategy",
        "selection_metric_order",
        "selection_tie_break",
        "selected",
        "candidate_checkpoint",
        "candidate_export",
        "int16_selection_report",
        "selection_audit",
        "candidate_metrics",
        "stable",
        "selection_gates",
    }
)
CANDIDATE_SELECTION_RUN_FIELDS = frozenset(
    {
        "slot_id",
        "series",
        "seed",
        "result_manifest",
        "checkpoint",
        "export",
        "int16_selection_report",
        "int16_pair_accuracy",
        "int16_teacher_top1",
        "int16_value_mae_cp",
    }
)
CANDIDATE_SELECTION_SELECTED_FIELDS = frozenset(
    {
        "slot_id",
        "series",
        "seed",
        "checkpoint_sha256",
        "export_sha256",
        "int16_selection_report_sha256",
    }
)
CANDIDATE_RUN_PLAN_FIELDS = frozenset(
    {"path", "bytes", "sha256", "schema"}
)
CANDIDATE_RESULT_MANIFEST_FIELDS = frozenset({"path", "bytes", "sha256"})
CANDIDATE_CHECKPOINT_FIELDS = frozenset({"path", "bytes", "sha256"})
CANDIDATE_SELECTION_REPORT_FIELDS = frozenset({"path", "bytes", "sha256"})
CANDIDATE_EXPORT_FIELDS = frozenset(
    {"path", "bytes", "sha256", "bucket_count"}
)
CANDIDATE_SELECTION_AUDIT_FIELDS = frozenset(
    {"path", "bytes", "sha256", "schema"}
)
CANDIDATE_METRICS_FIELDS = frozenset({"float", "int16"})
SELECTION_METRIC_FIELDS = frozenset(
    {
        "within_parent_pair_accuracy",
        "teacher_top1_accuracy",
        "value_mae_cp",
    }
)
CANDIDATE_STABLE_FIELDS = frozenset(
    {"checkpoint_sha256", "int16_selection_report", "int16_metrics"}
)
SELECTION_GATES_FIELDS = frozenset({"checks", "passed"})
SELECTION_GATE_COMPARISON_FIELDS = frozenset(
    {"id", "candidate", "reference", "operator", "passed"}
)
SELECTION_GATE_DELTA_FIELDS = frozenset(
    {"id", "observed", "absolute_limit", "operator", "passed"}
)

_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def _require_exact_mapping(value, fields, label: str) -> Mapping:
    if not isinstance(value, Mapping) or set(value) != set(fields):
        raise ValueError(f"{label} fields are not exact")
    return value


def _require_sha256(value, label: str) -> str:
    if not isinstance(value, str) or _SHA256_RE.fullmatch(value) is None:
        raise ValueError(f"{label} is not a lowercase SHA-256")
    return value


def _require_file_receipt(value, fields, label: str) -> Mapping:
    receipt = _require_exact_mapping(value, fields, label)
    if not isinstance(receipt.get("path"), str) or not receipt["path"]:
        raise ValueError(f"{label}.path is invalid")
    if type(receipt.get("bytes")) is not int or receipt["bytes"] <= 0:
        raise ValueError(f"{label}.bytes is invalid")
    _require_sha256(receipt.get("sha256"), f"{label}.sha256")
    return receipt


def sealed_run_selection_key(run: Mapping) -> tuple:
    """Rank one complete run by sealed int16 metrics, then exact fallback."""
    series = run.get("series")
    if series not in EXPERIMENT_SERIES:
        raise ValueError("candidate run series is invalid")
    seed = run.get("seed")
    if type(seed) is not int or seed not in EXPERIMENT_SEEDS:
        raise ValueError("candidate run seed is invalid")
    checkpoint = _require_file_receipt(
        run.get("checkpoint"), CANDIDATE_CHECKPOINT_FIELDS, "candidate run checkpoint"
    )
    checkpoint_sha256 = checkpoint["sha256"]
    metrics = []
    for field in (
        "int16_pair_accuracy",
        "int16_teacher_top1",
        "int16_value_mae_cp",
    ):
        value = run.get(field)
        if type(value) not in (int, float) or not math.isfinite(value):
            raise ValueError(f"candidate run {field} is not finite")
        metrics.append(float(value))
    pair_accuracy, teacher_top1, value_mae_cp = metrics
    if (
        not 0.0 <= pair_accuracy <= 1.0
        or not 0.0 <= teacher_top1 <= 1.0
        or value_mae_cp < 0.0
    ):
        raise ValueError("candidate run selection metric is outside its domain")
    return (
        -pair_accuracy,
        -teacher_top1,
        value_mae_cp,
        EXPERIMENT_SERIES.index(series),
        seed,
        bytes.fromhex(checkpoint_sha256),
    )


def select_sealed_candidate(runs: list[Mapping]) -> Mapping:
    """Select the sealed representative without asserting promotion gates."""
    if type(runs) is not list or len(runs) != len(SIX_RUN_SLOT_ORDER):
        raise ValueError("candidate selection receipt requires exactly six runs")
    for index, (run, (series, seed)) in enumerate(zip(runs, SIX_RUN_SLOT_ORDER)):
        if not isinstance(run, Mapping):
            raise ValueError(f"runs[{index}] is not an object")
        if (
            run.get("slot_id") != f"{series}-seed-{seed}"
            or run.get("series") != series
            or run.get("seed") != seed
        ):
            raise ValueError(f"runs[{index}] is outside the exact six-slot order")
        sealed_run_selection_key(run)

    representatives = []
    for series in EXPERIMENT_SERIES:
        series_runs = [run for run in runs if run["series"] == series]
        representatives.append(sorted(series_runs, key=sealed_run_selection_key)[1])
    return min(representatives, key=sealed_run_selection_key)


def _require_selection_metrics(value, label: str) -> dict[str, float]:
    metrics = _require_exact_mapping(value, SELECTION_METRIC_FIELDS, label)
    normalized = {}
    for field in SELECTION_METRIC_FIELDS:
        metric = metrics.get(field)
        if type(metric) not in (int, float) or not math.isfinite(metric):
            raise ValueError(f"{label}.{field} is not finite")
        normalized[field] = float(metric)
    if (
        not 0.0 <= normalized["within_parent_pair_accuracy"] <= 1.0
        or not 0.0 <= normalized["teacher_top1_accuracy"] <= 1.0
        or normalized["value_mae_cp"] < 0.0
    ):
        raise ValueError(f"{label} metric is outside its domain")
    return normalized


def selection_gate_results(
    candidate_float: Mapping[str, float],
    candidate_int16: Mapping[str, float],
    stable_int16: Mapping[str, float],
) -> dict[str, object]:
    pair_delta = (
        candidate_int16["within_parent_pair_accuracy"]
        - candidate_float["within_parent_pair_accuracy"]
    )
    top1_delta = (
        candidate_int16["teacher_top1_accuracy"]
        - candidate_float["teacher_top1_accuracy"]
    )
    pair_within_limit = abs(pair_delta) <= PAIR_DEGRADATION_LIMIT or math.isclose(
        abs(pair_delta), PAIR_DEGRADATION_LIMIT, rel_tol=0.0, abs_tol=1e-12
    )
    top1_within_limit = abs(top1_delta) <= TOP1_DEGRADATION_LIMIT or math.isclose(
        abs(top1_delta), TOP1_DEGRADATION_LIMIT, rel_tol=0.0, abs_tol=1e-12
    )
    checks = [
        {
            "id": "candidate_pair_strictly_above_stable",
            "candidate": candidate_int16["within_parent_pair_accuracy"],
            "reference": stable_int16["within_parent_pair_accuracy"],
            "operator": ">",
            "passed": candidate_int16["within_parent_pair_accuracy"]
            > stable_int16["within_parent_pair_accuracy"],
        },
        {
            "id": "candidate_top1_at_least_stable",
            "candidate": candidate_int16["teacher_top1_accuracy"],
            "reference": stable_int16["teacher_top1_accuracy"],
            "operator": ">=",
            "passed": candidate_int16["teacher_top1_accuracy"]
            >= stable_int16["teacher_top1_accuracy"],
        },
        {
            "id": "absolute_float_to_int16_pair_delta",
            "observed": pair_delta,
            "absolute_limit": PAIR_DEGRADATION_LIMIT,
            "operator": "abs<=",
            "passed": pair_within_limit,
        },
        {
            "id": "absolute_float_to_int16_top1_delta",
            "observed": top1_delta,
            "absolute_limit": TOP1_DEGRADATION_LIMIT,
            "operator": "abs<=",
            "passed": top1_within_limit,
        },
    ]
    return {
        "checks": checks,
        "passed": all(check["passed"] for check in checks),
    }


def _require_passed_selection_gates(
    value,
    candidate_float: Mapping[str, float],
    candidate_int16: Mapping[str, float],
    stable_int16: Mapping[str, float],
) -> None:
    gates = _require_exact_mapping(value, SELECTION_GATES_FIELDS, "selection_gates")
    checks = gates.get("checks")
    expected_result = selection_gate_results(
        candidate_float, candidate_int16, stable_int16
    )
    expected_checks = expected_result["checks"]
    if type(checks) is not list or len(checks) != len(expected_checks):
        raise ValueError("selection_gates requires exactly four checks")
    for index, (check, expected) in enumerate(zip(checks, expected_checks)):
        fields = (
            SELECTION_GATE_COMPARISON_FIELDS
            if index < 2
            else SELECTION_GATE_DELTA_FIELDS
        )
        check = _require_exact_mapping(
            check, fields, f"selection_gates.checks[{index}]"
        )
        for field, expected_value in expected.items():
            actual = check.get(field)
            if type(expected_value) is bool:
                matches = type(actual) is bool and actual is expected_value
            elif type(expected_value) is float:
                matches = (
                    type(actual) in (int, float)
                    and math.isfinite(actual)
                    and float(actual) == expected_value
                )
            else:
                matches = actual == expected_value
            if not matches:
                raise ValueError(
                    f"selection_gates.checks[{index}].{field} is not recomputable"
                )
    if type(gates.get("passed")) is not bool or gates["passed"] is not True:
        raise ValueError("selection_gates.passed must be true")
    if expected_result["passed"] is not True:
        raise ValueError("selection gate metrics do not pass the fixed thresholds")


def validate_candidate_selection_receipt(receipt: Mapping) -> Mapping:
    """Strict-decode the future six-run candidate-selection handoff."""
    root = _require_exact_mapping(
        receipt, CANDIDATE_SELECTION_RECEIPT_FIELDS, "candidate selection receipt"
    )
    if root.get("schema") != CANDIDATE_SELECTION_RECEIPT_SCHEMA:
        raise ValueError("candidate selection receipt schema mismatch")

    run_plan = _require_file_receipt(
        root.get("run_plan"), CANDIDATE_RUN_PLAN_FIELDS, "run_plan"
    )
    if run_plan.get("schema") != SIX_RUN_PLAN_SCHEMA:
        raise ValueError("candidate selection run-plan schema mismatch")
    if run_plan["sha256"] != WCSC36_SIX_RUN_PLAN_SHA256:
        raise ValueError("candidate selection run-plan SHA-256 mismatch")
    if (
        type(root.get("selection_metric_order")) is not list
        or tuple(root["selection_metric_order"]) != MODEL_SELECTION_METRIC_ORDER
    ):
        raise ValueError("candidate selection metric order mismatch")
    if (
        type(root.get("selection_tie_break")) is not list
        or tuple(root["selection_tie_break"]) != SELECTION_TIE_BREAK
    ):
        raise ValueError("candidate selection tie-break mismatch")

    runs = root.get("runs")
    if type(runs) is not list or len(runs) != len(SIX_RUN_SLOT_ORDER):
        raise ValueError("candidate selection receipt requires exactly six runs")
    for index, (run, (series, seed)) in enumerate(zip(runs, SIX_RUN_SLOT_ORDER)):
        run = _require_exact_mapping(
            run, CANDIDATE_SELECTION_RUN_FIELDS, f"runs[{index}]"
        )
        if (
            run.get("slot_id") != f"{series}-seed-{seed}"
            or run.get("series") != series
            or run.get("seed") != seed
        ):
            raise ValueError(f"runs[{index}] is outside the exact six-slot order")
        _require_file_receipt(
            run.get("result_manifest"),
            CANDIDATE_RESULT_MANIFEST_FIELDS,
            f"runs[{index}].result_manifest",
        )
        _require_file_receipt(
            run.get("checkpoint"),
            CANDIDATE_CHECKPOINT_FIELDS,
            f"runs[{index}].checkpoint",
        )
        run_export = _require_file_receipt(
            run.get("export"), CANDIDATE_EXPORT_FIELDS, f"runs[{index}].export"
        )
        if (
            type(run_export.get("bucket_count")) is not int
            or run_export["bucket_count"] <= 0
        ):
            raise ValueError(f"runs[{index}].export.bucket_count is invalid")
        _require_file_receipt(
            run.get("int16_selection_report"),
            CANDIDATE_SELECTION_REPORT_FIELDS,
            f"runs[{index}].int16_selection_report",
        )
        sealed_run_selection_key(run)

    if root.get("selection_strategy") != CANDIDATE_SELECTION_STRATEGY:
        raise ValueError("candidate selection strategy mismatch")
    winner = select_sealed_candidate(runs)
    selected = _require_exact_mapping(
        root.get("selected"),
        CANDIDATE_SELECTION_SELECTED_FIELDS,
        "candidate selection selected",
    )
    expected_selected = {
        "slot_id": winner["slot_id"],
        "series": winner["series"],
        "seed": winner["seed"],
        "checkpoint_sha256": winner["checkpoint"]["sha256"],
        "export_sha256": winner["export"]["sha256"],
        "int16_selection_report_sha256": winner["int16_selection_report"][
            "sha256"
        ],
    }
    if dict(selected) != expected_selected:
        raise ValueError("candidate selection winner does not match sealed ordering")

    candidate_checkpoint = _require_file_receipt(
        root.get("candidate_checkpoint"),
        CANDIDATE_CHECKPOINT_FIELDS,
        "candidate_checkpoint",
    )
    if (
        candidate_checkpoint["bytes"] != winner["checkpoint"]["bytes"]
        or candidate_checkpoint["sha256"] != winner["checkpoint"]["sha256"]
    ):
        raise ValueError("candidate checkpoint does not match the selected run")
    candidate_export = _require_file_receipt(
        root.get("candidate_export"), CANDIDATE_EXPORT_FIELDS, "candidate_export"
    )
    if (
        type(candidate_export.get("bucket_count")) is not int
        or candidate_export["bucket_count"] <= 0
    ):
        raise ValueError("candidate export bucket_count is invalid")
    if (
        candidate_export["bytes"] != winner["export"]["bytes"]
        or candidate_export["sha256"] != winner["export"]["sha256"]
        or candidate_export["bucket_count"] != winner["export"]["bucket_count"]
    ):
        raise ValueError("candidate export does not match the selected run")
    selection_report = _require_file_receipt(
        root.get("int16_selection_report"),
        CANDIDATE_SELECTION_REPORT_FIELDS,
        "int16_selection_report",
    )
    if (
        selection_report["bytes"] != winner["int16_selection_report"]["bytes"]
        or selection_report["sha256"]
        != winner["int16_selection_report"]["sha256"]
    ):
        raise ValueError("int16 selection report does not match the selected run")

    selection_audit = _require_file_receipt(
        root.get("selection_audit"),
        CANDIDATE_SELECTION_AUDIT_FIELDS,
        "selection_audit",
    )
    if selection_audit.get("schema") != SELECTION_AUDIT_SCHEMA:
        raise ValueError("selection audit schema mismatch")

    candidate_metrics = _require_exact_mapping(
        root.get("candidate_metrics"),
        CANDIDATE_METRICS_FIELDS,
        "candidate_metrics",
    )
    candidate_float = _require_selection_metrics(
        candidate_metrics.get("float"), "candidate_metrics.float"
    )
    candidate_int16 = _require_selection_metrics(
        candidate_metrics.get("int16"), "candidate_metrics.int16"
    )
    expected_candidate_int16 = {
        "within_parent_pair_accuracy": float(winner["int16_pair_accuracy"]),
        "teacher_top1_accuracy": float(winner["int16_teacher_top1"]),
        "value_mae_cp": float(winner["int16_value_mae_cp"]),
    }
    if candidate_int16 != expected_candidate_int16:
        raise ValueError("candidate int16 metrics do not match the selected run")

    stable = _require_exact_mapping(
        root.get("stable"), CANDIDATE_STABLE_FIELDS, "stable"
    )
    stable_sha256 = _require_sha256(
        stable.get("checkpoint_sha256"), "stable.checkpoint_sha256"
    )
    if stable_sha256 != WCSC36_STABLE_RUNOP1_SHA256:
        raise ValueError("stable checkpoint is not the sealed runOp1 checkpoint")
    if stable_sha256 == candidate_checkpoint["sha256"]:
        raise ValueError("candidate and stable checkpoint identities must differ")
    stable_report = _require_file_receipt(
        stable.get("int16_selection_report"),
        CANDIDATE_SELECTION_REPORT_FIELDS,
        "stable.int16_selection_report",
    )
    if stable_report["sha256"] == selection_report["sha256"]:
        raise ValueError("candidate and stable selection report identities must differ")
    stable_int16 = _require_selection_metrics(
        stable.get("int16_metrics"), "stable.int16_metrics"
    )
    _require_passed_selection_gates(
        root.get("selection_gates"),
        candidate_float,
        candidate_int16,
        stable_int16,
    )
    return winner
