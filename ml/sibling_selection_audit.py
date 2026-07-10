#!/usr/bin/env python3
"""Verify the sealed six-run outputs and record selection-gate results.

This command never accepts or reads the final-holdout JSONL.  A failed
model-selection gate produces an audit receipt, not a candidate-selection
receipt, so it cannot unlock later evaluation accidentally.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
from collections.abc import Mapping
from typing import Any

from sibling_selection_protocol import (
    CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    CANDIDATE_SELECTION_STRATEGY,
    MODEL_SELECTION_METRIC_ORDER,
    RESULT_ARTIFACT_NAMES,
    SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA,
    SIX_RUN_SLOT_ORDER,
    TRAINING_RESULT_SCHEMA,
    WCSC36_SIX_RUN_PLAN_SHA256,
    sealed_run_selection_key,
    validate_candidate_selection_receipt,
)


SELECTION_AUDIT_SCHEMA = "shogi-sibling-six-run-selection-audit-v1"
SEALED_EVAL_REPORT_SCHEMA = "shogi-sibling-eval-v2"
PAIR_DEGRADATION_LIMIT = 0.002
TOP1_DEGRADATION_LIMIT = 0.005
GIT_REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
METRIC_FIELDS = (
    "within_parent_pair_accuracy",
    "teacher_top1_accuracy",
    "value_mae_cp",
)
RESULT_FIELDS = {
    "schema",
    "status",
    "experiment_plan",
    "experiment_contract",
    "training_pipeline",
    "training_runtime",
    "completed_epochs",
    "selection_metric",
    "best_value_loss",
    "best_sibling_key",
    "artifacts",
}


def _reject_duplicate_keys(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key: {key}")
        result[key] = value
    return result


def _read_json(path: str, label: str) -> tuple[dict[str, Any], bytes]:
    try:
        with open(path, "rb") as source:
            raw = source.read()
        value = json.loads(
            raw.decode("utf-8"),
            object_pairs_hook=_reject_duplicate_keys,
            parse_constant=lambda token: (_ for _ in ()).throw(
                ValueError(f"{label} contains non-finite JSON number {token}")
            ),
        )
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError(f"cannot read {label}: {error}") from error
    if type(value) is not dict:
        raise ValueError(f"{label} root must be an object")
    return value, raw


def _sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def _sha256_file(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _display_path(path: str, repo_root: str) -> str:
    real = os.path.realpath(path)
    try:
        relative = os.path.relpath(real, repo_root)
    except ValueError:
        return real
    if relative != ".." and not relative.startswith(f"..{os.sep}"):
        return relative.replace(os.sep, "/")
    return real


def _file_receipt(path: str, repo_root: str) -> dict[str, Any]:
    real = os.path.realpath(path)
    if not os.path.isfile(real):
        raise ValueError(f"required artifact is missing: {path}")
    return {
        "path": _display_path(real, repo_root),
        "bytes": os.path.getsize(real),
        "sha256": _sha256_file(real),
    }


def _require_exact(value: Any, fields: set[str], label: str) -> Mapping:
    if not isinstance(value, Mapping) or set(value) != fields:
        raise ValueError(f"{label} fields are not exact")
    return value


def _finite_metric(value: Any, label: str) -> float:
    if type(value) not in (int, float) or not math.isfinite(value):
        raise ValueError(f"{label} is not finite")
    return float(value)


def _metrics_from_report(
    report_path: str,
    *,
    expected_name: str,
    checkpoint: Mapping[str, Any],
    expected_provenance_status: str,
    repo_root: str,
) -> tuple[dict[str, float], dict[str, float], dict[str, Any], dict[str, Any]]:
    report, raw = _read_json(report_path, f"{expected_name} selection report")
    if report.get("schema") != SEALED_EVAL_REPORT_SCHEMA:
        raise ValueError(f"{expected_name} selection report schema mismatch")
    data = report.get("data")
    if (
        not isinstance(data, Mapping)
        or data.get("data_role") != "selection"
        or type(data.get("records")) is not int
        or data["records"] <= 0
        or type(data.get("parents")) is not int
        or data["parents"] <= 0
    ):
        raise ValueError(f"{expected_name} report is not sealed model selection")
    models = report.get("models")
    if type(models) is not list or len(models) != 1:
        raise ValueError(f"{expected_name} report must contain exactly one model")
    model = models[0]
    if (
        not isinstance(model, Mapping)
        or model.get("name") != expected_name
        or model.get("checkpoint_sha256") != checkpoint["sha256"]
        or model.get("checkpoint_bytes") != checkpoint["bytes"]
        or model.get("training_provenance", {}).get("status")
        != expected_provenance_status
    ):
        raise ValueError(f"{expected_name} report/checkpoint identity mismatch")
    floating = model.get("float")
    quantized = model.get("quantized_int16")
    if not isinstance(floating, Mapping) or not isinstance(quantized, Mapping):
        raise ValueError(f"{expected_name} report lacks float/int16 metrics")
    float_metrics = {
        field: _finite_metric(floating.get(field), f"{expected_name}.float.{field}")
        for field in METRIC_FIELDS
    }
    int16_metrics = {
        field: _finite_metric(quantized.get(field), f"{expected_name}.int16.{field}")
        for field in METRIC_FIELDS
    }
    delta = quantized.get("delta_from_float")
    if not isinstance(delta, Mapping):
        raise ValueError(f"{expected_name} report lacks int16 delta")
    for field in METRIC_FIELDS:
        recorded = _finite_metric(delta.get(field), f"{expected_name}.delta.{field}")
        actual = int16_metrics[field] - float_metrics[field]
        if not math.isclose(recorded, actual, rel_tol=0.0, abs_tol=1e-12):
            raise ValueError(f"{expected_name} report int16 delta mismatch")
    report_receipt = {
        "path": _display_path(report_path, repo_root),
        "bytes": len(raw),
        "sha256": _sha256_bytes(raw),
    }
    data_identity = {
        "sha256": data.get("sha256"),
        "bytes": data.get("bytes"),
        "records": data["records"],
        "parents": data["parents"],
    }
    if (
        not isinstance(data_identity["sha256"], str)
        or len(data_identity["sha256"]) != 64
        or type(data_identity["bytes"]) is not int
        or data_identity["bytes"] <= 0
    ):
        raise ValueError(f"{expected_name} report data identity is invalid")
    return float_metrics, int16_metrics, report_receipt, data_identity


def evaluate_selection_gates(
    candidate_float: Mapping[str, float],
    candidate_int16: Mapping[str, float],
    stable_int16: Mapping[str, float],
) -> dict[str, Any]:
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


def verify_audit_pipeline_revision(
    expected_revision: str, repo_root: str
) -> dict[str, Any]:
    if GIT_REVISION_RE.fullmatch(expected_revision or "") is None:
        raise ValueError("--pipeline-revision must be a lowercase 40-digit Git commit")

    def git(*arguments: str) -> str:
        try:
            completed = subprocess.run(
                ["git", "-C", repo_root, *arguments],
                check=True,
                capture_output=True,
                text=True,
            )
        except (OSError, subprocess.CalledProcessError) as error:
            raise ValueError(f"cannot verify audit pipeline revision: {error}") from error
        return completed.stdout

    actual_revision = git("rev-parse", "HEAD").strip()
    if actual_revision != expected_revision:
        raise ValueError(
            f"--pipeline-revision {expected_revision} does not match HEAD {actual_revision}"
        )
    if git("status", "--porcelain=v1", "--untracked-files=normal"):
        raise ValueError("selection audit requires a clean Git worktree")
    return {
        "source_revision": actual_revision,
        "tracked_tree_clean": True,
    }


def build_selection_audit(
    *,
    run_root: str,
    run_plan_path: str,
    stable_checkpoint_path: str,
    stable_selection_report_path: str,
    repo_root: str,
    audit_pipeline: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    plan, plan_raw = _read_json(run_plan_path, "six-run plan")
    _require_exact(
        plan,
        {"schema", "common", "slots", "selection_tie_break"},
        "six-run plan",
    )
    if plan.get("schema") != SIX_RUN_PLAN_SCHEMA:
        raise ValueError("six-run plan schema mismatch")
    slots = plan.get("slots")
    if type(slots) is not list or len(slots) != len(SIX_RUN_SLOT_ORDER):
        raise ValueError("six-run plan does not contain exactly six slots")
    plan_pairs = tuple((slot.get("series"), slot.get("seed")) for slot in slots)
    if plan_pairs != SIX_RUN_SLOT_ORDER:
        raise ValueError("six-run plan slot order mismatch")
    plan_receipt = {
        "path": _display_path(run_plan_path, repo_root),
        "bytes": len(plan_raw),
        "sha256": _sha256_bytes(plan_raw),
        "schema": SIX_RUN_PLAN_SCHEMA,
    }
    if plan_receipt["sha256"] != WCSC36_SIX_RUN_PLAN_SHA256:
        raise ValueError("six-run plan SHA-256 differs from the production seal")
    stable_checkpoint = _file_receipt(stable_checkpoint_path, repo_root)
    planned_stable_sha = (
        plan.get("common", {})
        .get("input_sha256", {})
        .get("warm_initializer")
    )
    if stable_checkpoint["sha256"] != planned_stable_sha:
        raise ValueError("stable checkpoint differs from the sealed plan initializer")

    runs = []
    selection_data_identity = None
    for (series, seed), slot in zip(SIX_RUN_SLOT_ORDER, slots):
        slot_id = f"{series}-seed-{seed}"
        slot_dir = os.path.join(run_root, slot_id)
        result_path = os.path.join(slot_dir, "result.json")
        checkpoint_path = os.path.join(slot_dir, "best-sibling.pt")
        export_path = os.path.join(slot_dir, "int16", "weights.bin")
        export_meta_path = os.path.join(slot_dir, "int16", "weights.meta.json")
        report_path = os.path.join(slot_dir, "int16-selection.json")

        result, result_raw = _read_json(result_path, f"{slot_id} result")
        _require_exact(result, RESULT_FIELDS, f"{slot_id} result")
        if (
            result.get("schema") != TRAINING_RESULT_SCHEMA
            or result.get("status") != "complete"
            or result.get("selection_metric") != "sibling-pair"
            or result.get("experiment_plan", {}).get("sha256")
            != plan_receipt["sha256"]
            or result.get("experiment_plan", {}).get("slot_id") != slot_id
            or result.get("experiment_contract", {}).get("series") != series
            or result.get("experiment_contract", {}).get("seed") != seed
        ):
            raise ValueError(f"{slot_id} result contract mismatch")
        artifacts = result.get("artifacts")
        if not isinstance(artifacts, Mapping) or set(artifacts) != set(
            RESULT_ARTIFACT_NAMES
        ):
            raise ValueError(f"{slot_id} result artifact set mismatch")
        for artifact_name in RESULT_ARTIFACT_NAMES:
            actual = _file_receipt(os.path.join(slot_dir, artifact_name), repo_root)
            expected = artifacts[artifact_name]
            if (
                not isinstance(expected, Mapping)
                or expected.get("bytes") != actual["bytes"]
                or expected.get("sha256") != actual["sha256"]
            ):
                raise ValueError(f"{slot_id} artifact changed: {artifact_name}")

        checkpoint = _file_receipt(checkpoint_path, repo_root)
        export = _file_receipt(export_path, repo_root)
        export_meta, _meta_raw = _read_json(export_meta_path, f"{slot_id} export metadata")
        bucket_count = export_meta.get("kp_buckets")
        if type(bucket_count) is not int or bucket_count <= 0:
            raise ValueError(f"{slot_id} export bucket count is invalid")
        export["bucket_count"] = bucket_count
        float_metrics, int16_metrics, report_receipt, data_identity = (
            _metrics_from_report(
                report_path,
                expected_name=slot_id,
                checkpoint=checkpoint,
                expected_provenance_status=(
                    "verified_same_model_selection_partition"
                ),
                repo_root=repo_root,
            )
        )
        if selection_data_identity is None:
            selection_data_identity = data_identity
        elif selection_data_identity != data_identity:
            raise ValueError("six selection reports do not use one exact dataset")
        runs.append(
            {
                "slot_id": slot_id,
                "series": series,
                "seed": seed,
                "result_manifest": {
                    "path": _display_path(result_path, repo_root),
                    "bytes": len(result_raw),
                    "sha256": _sha256_bytes(result_raw),
                },
                "checkpoint": checkpoint,
                "export": export,
                "int16_selection_report": report_receipt,
                "int16_pair_accuracy": int16_metrics[
                    "within_parent_pair_accuracy"
                ],
                "int16_teacher_top1": int16_metrics["teacher_top1_accuracy"],
                "int16_value_mae_cp": int16_metrics["value_mae_cp"],
                "_float_metrics": float_metrics,
                "_int16_metrics": int16_metrics,
            }
        )

    stable_float, stable_int16, stable_report, stable_data_identity = (
        _metrics_from_report(
            stable_selection_report_path,
            expected_name="stable",
            checkpoint=stable_checkpoint,
            expected_provenance_status="legacy_unverified",
            repo_root=repo_root,
        )
    )
    if stable_data_identity != selection_data_identity:
        raise ValueError("stable and six-run reports use different selection data")

    public_runs = [
        {key: value for key, value in run.items() if not key.startswith("_")}
        for run in runs
    ]
    representatives = []
    for series in ("warm", "scratch"):
        ordered = sorted(
            [run for run in public_runs if run["series"] == series],
            key=sealed_run_selection_key,
        )
        representatives.append(ordered[1])
    provisional = min(representatives, key=sealed_run_selection_key)
    candidate_receipt = {
        "schema": CANDIDATE_SELECTION_RECEIPT_SCHEMA,
        "run_plan": plan_receipt,
        "runs": public_runs,
        "selection_strategy": CANDIDATE_SELECTION_STRATEGY,
        "selection_metric_order": list(MODEL_SELECTION_METRIC_ORDER),
        "selection_tie_break": list(SELECTION_TIE_BREAK),
        "selected": {
            "slot_id": provisional["slot_id"],
            "series": provisional["series"],
            "seed": provisional["seed"],
            "checkpoint_sha256": provisional["checkpoint"]["sha256"],
            "export_sha256": provisional["export"]["sha256"],
            "int16_selection_report_sha256": provisional[
                "int16_selection_report"
            ]["sha256"],
        },
        "candidate_checkpoint": dict(provisional["checkpoint"]),
        "candidate_export": dict(provisional["export"]),
        "int16_selection_report": dict(provisional["int16_selection_report"]),
        "stable_checkpoint_sha256": stable_checkpoint["sha256"],
    }
    winner = validate_candidate_selection_receipt(candidate_receipt)
    private_winner = next(run for run in runs if run["slot_id"] == winner["slot_id"])
    gates = evaluate_selection_gates(
        private_winner["_float_metrics"],
        private_winner["_int16_metrics"],
        stable_int16,
    )
    audit = {
        "schema": SELECTION_AUDIT_SCHEMA,
        "run_plan": plan_receipt,
        "runs": public_runs,
        "selection_data": selection_data_identity,
        "selection_strategy": CANDIDATE_SELECTION_STRATEGY,
        "selection_metric_order": list(MODEL_SELECTION_METRIC_ORDER),
        "selection_tie_break": list(SELECTION_TIE_BREAK),
        "representatives": [
            {
                "series": run["series"],
                "slot_id": run["slot_id"],
                "seed": run["seed"],
                "checkpoint_sha256": run["checkpoint"]["sha256"],
            }
            for run in representatives
        ],
        "provisional_candidate": candidate_receipt["selected"],
        "stable": {
            "checkpoint_sha256": stable_checkpoint["sha256"],
            "int16_selection_report": stable_report,
            "float_metrics": stable_float,
            "int16_metrics": stable_int16,
        },
        "candidate_metrics": {
            "float": private_winner["_float_metrics"],
            "int16": private_winner["_int16_metrics"],
        },
        "selection_gates": gates,
        "candidate_selection_receipt": {
            "status": (
                "eligible_not_emitted_by_audit"
                if gates["passed"]
                else "not_emitted_selection_gate_failed"
            )
        },
        "final_holdout": {
            "status": "sealed_not_opened",
            "labels_read": False,
        },
    }
    if audit_pipeline is not None:
        audit["audit_pipeline"] = dict(audit_pipeline)
    return audit


def _write_new_json(path: str, value: Mapping[str, Any]) -> None:
    target = os.path.abspath(path)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    serialized = (
        json.dumps(
            value,
            ensure_ascii=False,
            indent=2,
            sort_keys=True,
            allow_nan=False,
        )
        + "\n"
    )
    try:
        with open(target, "x", encoding="utf-8", newline="\n") as output:
            output.write(serialized)
            output.flush()
            os.fsync(output.fileno())
    except FileExistsError as error:
        raise ValueError(f"audit output already exists: {target}") from error


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-root", required=True)
    parser.add_argument("--run-plan", required=True)
    parser.add_argument("--stable-checkpoint", required=True)
    parser.add_argument("--stable-selection-report", required=True)
    parser.add_argument("--pipeline-revision", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args(argv)
    repo_root = os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
    try:
        audit_pipeline = verify_audit_pipeline_revision(
            args.pipeline_revision, repo_root
        )
        audit = build_selection_audit(
            run_root=args.run_root,
            run_plan_path=args.run_plan,
            stable_checkpoint_path=args.stable_checkpoint,
            stable_selection_report_path=args.stable_selection_report,
            repo_root=repo_root,
            audit_pipeline=audit_pipeline,
        )
        _write_new_json(args.out, audit)
    except (OSError, ValueError) as error:
        parser.error(str(error))
    print(
        f"[selection-audit] candidate={audit['provisional_candidate']['slot_id']} "
        f"passed={str(audit['selection_gates']['passed']).lower()} out={args.out}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
