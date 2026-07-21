#!/usr/bin/env python3
"""Argumentless runner for one adaptive exact-int16 candidate lock."""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
import hashlib
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
from typing import Any

import run_strength_first_representation_bridge_v3 as ATOMIC
import strength_first_int16_only_candidate_amendment as PROTOCOL
import strength_first_int16_only_candidate_eval_adapter as ADAPTER
import strength_first_qat_selection_evaluator as SELECTION
import strength_first_representation_bridge_v3_protocol as BRIDGE


class Int16OnlyCandidateLockFailed(RuntimeError):
    """The fixed int16-only lock could not be reproduced exactly."""


def _artifact_identity(raw: bytes, *, path: str, schema: str) -> dict[str, Any]:
    return {
        "path": path,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _validate_commit_receipt(value: Any) -> dict[str, Any]:
    fields = {
        "schema",
        "committed",
        "commit_point",
        "post_commit_status",
        "diagnostic_errors",
        "recovery",
    }
    if type(value) is not dict or set(value) != fields:
        raise ValueError("int16-only commit receipt fields are not exact")
    diagnostics = value["diagnostic_errors"]
    if (
        value["schema"] != PROTOCOL.COMMIT_RECEIPT_SCHEMA
        or value["committed"] is not True
        or value["commit_point"] != PROTOCOL.COMMIT_SEMANTICS["commit_point"]
        or type(diagnostics) is not list
        or any(type(item) is not str or not item for item in diagnostics)
        or len(diagnostics) != len(set(diagnostics))
    ):
        raise ValueError("int16-only commit receipt is invalid")
    if value["post_commit_status"] == "verified-and-parent-fsynced":
        if diagnostics or value["recovery"] != "none":
            raise ValueError("verified int16-only commit receipt has diagnostics")
    elif value["post_commit_status"] == "committed-recovery-verification-required":
        if (
            not diagnostics
            or value["recovery"] != PROTOCOL.COMMIT_SEMANTICS["recovery"]
        ):
            raise ValueError("int16-only recovery receipt is incomplete")
    else:
        raise ValueError("int16-only commit status is invalid")
    return copy.deepcopy(value)


def _normalize_atomic_commit_after_return(value: Any) -> dict[str, Any]:
    """Convert helper output after its commit point without ever reporting STOP."""

    try:
        if type(value) is not dict:
            raise ValueError("atomic helper receipt is not an object")
        return _validate_commit_receipt(
            {**copy.deepcopy(value), "schema": PROTOCOL.COMMIT_RECEIPT_SCHEMA}
        )
    except (TypeError, ValueError):
        # The pinned helper returns only after exclusive rename succeeds.  A
        # malformed result is therefore a recovery condition, not a failed run.
        return _committed_recovery_receipt("atomic-helper-receipt-invalid-after-commit")


def _committed_recovery_receipt(diagnostic: str) -> dict[str, Any]:
    if type(diagnostic) is not str or not diagnostic:
        raise ValueError("commit recovery diagnostic is invalid")
    return {
        "schema": PROTOCOL.COMMIT_RECEIPT_SCHEMA,
        "committed": True,
        "commit_point": PROTOCOL.COMMIT_SEMANTICS["commit_point"],
        "post_commit_status": "committed-recovery-verification-required",
        "diagnostic_errors": [diagnostic],
        "recovery": PROTOCOL.COMMIT_SEMANTICS["recovery"],
    }


def _expected_publication(
    *,
    report: Mapping[str, Any],
    receipt: Mapping[str, Any],
    origin_registry: Mapping[str, Any],
    artifact_bindings: list[Mapping[str, Any]],
) -> dict[str, Any]:
    report_raw = PROTOCOL.canonical_json_bytes(report)
    receipt_raw = PROTOCOL.canonical_json_bytes(receipt)
    return {
        "schema": PROTOCOL.PUBLICATION_SCHEMA,
        "status": PROTOCOL.PUBLICATION_STATUS,
        "origin_registry": copy.deepcopy(origin_registry),
        "artifact_bindings": copy.deepcopy(artifact_bindings),
        "report": _artifact_identity(
            report_raw,
            path=f"{PROTOCOL.OUTPUT_ROOT}/{PROTOCOL.OUTPUT_FILES['report']}",
            schema=PROTOCOL.REPORT_SCHEMA,
        ),
        "receipt": _artifact_identity(
            receipt_raw,
            path=f"{PROTOCOL.OUTPUT_ROOT}/{PROTOCOL.OUTPUT_FILES['receipt']}",
            schema=PROTOCOL.RECEIPT_SCHEMA,
        ),
        "candidate_lock": copy.deepcopy(receipt["candidate_lock"]),
        "atomic_private_bundle": True,
        "commit_semantics": copy.deepcopy(PROTOCOL.COMMIT_SEMANTICS),
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
        "nonclaims": copy.deepcopy(PROTOCOL.NONCLAIMS),
    }


def _validate_publication(value: Any, expected: Mapping[str, Any]) -> dict[str, Any]:
    fields = {
        "schema",
        "status",
        "origin_registry",
        "artifact_bindings",
        "report",
        "receipt",
        "candidate_lock",
        "atomic_private_bundle",
        "commit_semantics",
        "boundary",
        "nonclaims",
    }
    if type(value) is not dict or set(value) != fields or value != expected:
        raise ValueError("int16-only publication is not the exact expected value")
    if (
        value["schema"] != PROTOCOL.PUBLICATION_SCHEMA
        or value["status"] != PROTOCOL.PUBLICATION_STATUS
        or value["candidate_lock"].get("seed") != 42
        or value["candidate_lock"].get("epoch") != 20
        or value["candidate_lock"].get("candidate_strength_selected") is not False
        or value["candidate_lock"].get("deployment_authority") is not False
        or value["atomic_private_bundle"] is not True
        or value["boundary"] != PROTOCOL.BOUNDARY
        or value["nonclaims"] != PROTOCOL.NONCLAIMS
        or value["commit_semantics"] != PROTOCOL.COMMIT_SEMANTICS
    ):
        raise ValueError("int16-only publication authority boundary is invalid")
    return copy.deepcopy(value)


def _read_registered(root: Path, identity: Mapping[str, Any], label: str) -> bytes:
    path = (root / identity["path"]).absolute()
    if path.resolve() != path:
        raise ValueError(f"{label} path is not canonical")
    raw = path.read_bytes()
    if (
        len(raw) != identity["bytes"]
        or hashlib.sha256(raw).hexdigest() != identity["sha256"]
    ):
        raise ValueError(f"{label} identity mismatch")
    return raw


def _runtime_registry(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    path = root / PROTOCOL.REGISTRY_RELATIVE_PATH
    raw = path.read_bytes()
    registry = PROTOCOL.validate_registry(PROTOCOL.strict_json(raw, "registry"))
    if raw != PROTOCOL.canonical_json_bytes(registry):
        raise ValueError("int16-only amendment registry is not canonical")
    return registry, _artifact_identity(
        raw,
        path=PROTOCOL.REGISTRY_RELATIVE_PATH,
        schema=PROTOCOL.REGISTRY_SCHEMA,
    )


def _require_registry_unchanged(root: Path, expected: Mapping[str, Any]) -> None:
    _registry, observed = _runtime_registry(root)
    if observed != expected:
        raise ValueError("int16-only amendment origin registry changed")


def _validate_public_inputs(
    registry: Mapping[str, Any], root: Path, home: Path
) -> None:
    for name, identity in registry["implementation"].items():
        _read_registered(root, identity, f"implementation {name}")
    bridge_raw = _read_registered(
        root,
        registry["inputs"]["representation_bridge_registry"],
        "representation bridge registry",
    )
    bridge = BRIDGE.validate_registry(
        PROTOCOL.strict_json(bridge_raw, "representation bridge registry")
    )
    for name, identity in bridge["dependencies"]["runtime_import_closure"].items():
        _read_registered(root, identity, f"runtime import closure {name}")
    selection_raw = _read_registered(
        root,
        registry["inputs"]["selection_evaluator_registry"],
        "selection evaluator registry",
    )
    selection = SELECTION.validate_strength_first_selection_evaluator_registry_data(
        PROTOCOL.strict_json(selection_raw, "selection evaluator registry")
    )
    stop_raw = _read_registered(
        root,
        registry["inputs"]["bridge_stop_evidence"],
        "bridge STOP evidence",
    )
    stop = PROTOCOL.validate_bridge_stop_evidence(
        PROTOCOL.strict_json(stop_raw, "bridge STOP evidence")
    )
    if stop_raw != PROTOCOL.canonical_json_bytes(stop):
        raise ValueError("bridge STOP evidence is not canonical JSON")
    if (
        stop["outcome"]["status"] != "STOP"
        or stop["outcome"]["family_gate_passed"] is not False
        or stop["outcome"]["output_root_absent"] is not True
        or (home / BRIDGE.OUTPUT_ROOT).exists()
    ):
        raise ValueError("representation bridge STOP cannot be promoted to PASS")
    if (
        selection["status"] != SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        or selection["enrollments"]["selection_dataset"]
        != registry["spent_selection"]["dataset"]
        or selection["enrollments"]["stable_checkpoint"]
        != registry["models"]["stable"]["checkpoint"]
        or bridge["spent_selection"]["dataset"]
        != registry["spent_selection"]["dataset"]
        or bridge["models"]["stable"] != registry["models"]["stable"]
    ):
        raise ValueError("int16-only input enrollment drifted")
    for source, enrolled, seed in zip(
        bridge["models"]["seeds"], registry["models"]["seeds"], PROTOCOL.SEEDS
    ):
        if (
            source["seed"] != seed
            or enrolled["seed"] != seed
            or source["parent_result"] != enrolled["parent_result"]
            or source["parent_checkpoint"] != enrolled["parent_checkpoint"]
            or source["quantized_anchor"] != enrolled["quantized_anchor"]
        ):
            raise ValueError(f"int16-only seed {seed} enrollment drifted")


def _report_model(
    value: Any,
    *,
    name: str,
    role: str,
    seed: int | None,
    checkpoint: Mapping[str, Any],
    quantized_anchor: Mapping[str, Any] | None,
) -> dict[str, Any]:
    fields = {
        "name",
        "role",
        "seed",
        "checkpoint",
        "int16",
        "int16_source",
    }
    if seed is not None:
        fields.add("quantized_anchor")
    if (
        type(value) is not dict
        or set(value) != fields
        or value["name"] != name
        or value["role"] != role
        or value["seed"] != seed
        or value["checkpoint"] != checkpoint
        or value["int16_source"] != "evaluated-exact-int16-forward-batch"
        or (seed is not None and value["quantized_anchor"] != quantized_anchor)
    ):
        raise ValueError(f"int16-only report model {name} is invalid")
    return {
        **copy.deepcopy(value),
        "int16": PROTOCOL.metric_set(value["int16"], f"{name} int16 metrics"),
    }


def build_adaptive_candidate_lock_receipt(
    report: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    origin_registry: Mapping[str, Any],
) -> dict[str, Any]:
    """Require the fixed int16 order and lock seed 42 without a strength claim."""

    expected_report_fields = {
        "schema",
        "status",
        "origin_registry",
        "artifact_bindings",
        "data",
        "models",
        "execution",
        "boundary",
    }
    if (
        type(report) is not dict
        or set(report) != expected_report_fields
        or report["schema"] != PROTOCOL.REPORT_SCHEMA
        or report["status"] != PROTOCOL.REPORT_STATUS
        or report["origin_registry"] != origin_registry
        or report["boundary"] != PROTOCOL.BOUNDARY
    ):
        raise ValueError("int16-only evaluation report is partial")
    expected_bindings = [
        {
            "seed": spec["seed"],
            "parent_result": copy.deepcopy(spec["parent_result"]),
        }
        for spec in registry["models"]["seeds"]
    ]
    if report["artifact_bindings"] != expected_bindings:
        raise ValueError("int16-only report result identities drifted")
    expected_data = {
        **registry["spent_selection"]["dataset"],
        "records": 28_518,
        "parents": 4_798,
        "eligible_pairs": report.get("data", {}).get("eligible_pairs"),
        "label_status": "already-spent-selection",
        "authorized_use": (
            "adaptive-int16-candidate-lock-not-independent-strength-evidence"
        ),
    }
    if (
        report["data"] != expected_data
        or type(expected_data["eligible_pairs"]) is not int
        or expected_data["eligible_pairs"] < 1
    ):
        raise ValueError("int16-only report data identity drifted")
    expected_execution = {
        "model_count": 4,
        "model_loop_workers": 1,
        "int16_model_evaluations": 4,
        "float_model_evaluations": 0,
        "aligned_checkpoint_loads": 0,
        "int16_reference": "int16_forward_batch",
        "int16_batch_rows": 4_096,
        "torch_intraop_threads": 10,
        "torch_original_intraop_threads": report.get("execution", {}).get(
            "torch_original_intraop_threads"
        ),
        "torch_original_intraop_threads_restored": True,
        "torch_interop_threads": report.get("execution", {}).get(
            "torch_interop_threads"
        ),
        "torch_interop_threads_unchanged": True,
        "spent_selection_label_reads": 1,
        "fresh_selection_label_reads": 0,
        "fresh_final_label_reads": 0,
        "legacy_holdout_label_reads": 0,
        "network_requests": 0,
        "cloud_requests": 0,
    }
    if (
        report["execution"] != expected_execution
        or type(expected_execution["torch_original_intraop_threads"]) is not int
        or expected_execution["torch_original_intraop_threads"] < 1
        or type(expected_execution["torch_interop_threads"]) is not int
        or expected_execution["torch_interop_threads"] < 1
    ):
        raise ValueError("int16-only execution boundary drifted")

    models = report["models"]
    if type(models) is not list or len(models) != 4:
        raise ValueError("int16-only report requires exactly four models")
    stable_checkpoint = {
        **registry["models"]["stable"]["checkpoint"],
        "epoch": 27,
    }
    stable = _report_model(
        models[0],
        name="stable",
        role="stable",
        seed=None,
        checkpoint=stable_checkpoint,
        quantized_anchor=None,
    )
    if stable["int16"] != PROTOCOL.BRIDGE_STOP_EXACT_MODELS["stable_int16"]:
        raise Int16OnlyCandidateLockFailed(
            "stable int16 metrics did not exactly reproduce spent evidence"
        )
    runs = []
    for index, seed in enumerate(PROTOCOL.SEEDS, start=1):
        enrolled = registry["models"]["seeds"][index - 1]
        parent = _report_model(
            models[index],
            name=f"seed-{seed}",
            role="epoch-20-parent-deployment",
            seed=seed,
            checkpoint=enrolled["parent_checkpoint"],
            quantized_anchor=enrolled["quantized_anchor"],
        )
        if (
            parent["int16"]
            != PROTOCOL.BRIDGE_STOP_EXACT_MODELS[f"seed_{seed}"]["parent_int16"]
        ):
            raise Int16OnlyCandidateLockFailed(
                f"seed {seed} int16 metrics did not exactly reproduce spent evidence"
            )
        gate = PROTOCOL.int16_strength_gate(parent["int16"], stable["int16"])
        if gate["passed"] is not True:
            raise Int16OnlyCandidateLockFailed(
                f"seed {seed} failed the fixed parent-int16 strength gates"
            )
        runs.append(
            {
                "seed": seed,
                "checkpoint": copy.deepcopy(parent["checkpoint"]),
                "quantized_anchor": copy.deepcopy(parent["quantized_anchor"]),
                "int16": parent["int16"],
                "strength_gate": gate,
            }
        )
    ranked = sorted(runs, key=PROTOCOL.ranking_key)
    ranked_order = [run["seed"] for run in ranked]
    if ranked_order != list(PROTOCOL.EXPECTED_RANKED_SEED_ORDER):
        raise Int16OnlyCandidateLockFailed(
            "parent-int16 rank differs from the adaptively fixed 43,42,44 outcome"
        )
    representative = ranked[1]
    if (
        representative["seed"] != PROTOCOL.SELECTED_SEED
        or representative["checkpoint"]["epoch"] != 20
        or representative["checkpoint"]["sha256"] != PROTOCOL.SELECTED_CHECKPOINT_SHA256
    ):
        raise Int16OnlyCandidateLockFailed(
            "fixed median seed 42 epoch-20 identity was not reproduced"
        )
    return {
        "schema": PROTOCOL.RECEIPT_SCHEMA,
        "status": PROTOCOL.RECEIPT_STATUS,
        "origin_registry": copy.deepcopy(origin_registry),
        "artifact_bindings": copy.deepcopy(expected_bindings),
        "spent_selection": copy.deepcopy(registry["spent_selection"]),
        "stable": {
            "checkpoint": stable["checkpoint"],
            "int16": stable["int16"],
        },
        "runs": runs,
        "metric_order": list(PROTOCOL.METRIC_ORDER),
        "ranked_seed_order": ranked_order,
        "candidate_lock": {
            "seed": 42,
            "checkpoint": copy.deepcopy(representative["checkpoint"]),
            "quantized_anchor": copy.deepcopy(representative["quantized_anchor"]),
            "epoch": 20,
            "candidate_locked": True,
            "candidate_strength_selected": False,
            "deployment_authority": False,
        },
        "bridge_stop": copy.deepcopy(registry["bridge_stop"]),
        "prospective_confirmation": {
            "first_prospective_strength_gate": "sealed-fresh-final",
            "fresh_final_label_reads_so_far": 0,
            "seed_fallback_allowed": False,
            "on_seed_42_failure": "retrain-entire-three-seed-family",
            "formal_ab_policy_unchanged": "384-color-swapped-pairs-768-games",
        },
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
        "nonclaims": copy.deepcopy(PROTOCOL.NONCLAIMS),
    }


def publish_private_bundle(
    *,
    output_root: str,
    report: Mapping[str, Any],
    receipt: Mapping[str, Any],
    origin_registry: Mapping[str, Any],
    artifact_bindings: list[Mapping[str, Any]],
    _before_commit: Callable[[Path], None] | None = None,
) -> dict[str, Any]:
    if (
        report.get("schema") != PROTOCOL.REPORT_SCHEMA
        or receipt.get("schema") != PROTOCOL.RECEIPT_SCHEMA
        or report.get("origin_registry") != origin_registry
        or receipt.get("origin_registry") != origin_registry
        or report.get("artifact_bindings") != artifact_bindings
        or receipt.get("artifact_bindings") != artifact_bindings
    ):
        raise ValueError("int16-only publication provenance is inconsistent")
    target = Path(output_root).absolute()
    if target.resolve() != target or target.exists():
        raise ValueError("int16-only output root is not new and canonical")
    parent = target.parent
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent_stat = parent.stat()
    if (
        not stat.S_ISDIR(parent_stat.st_mode)
        or parent_stat.st_uid != os.geteuid()
        or stat.S_IMODE(parent_stat.st_mode) & 0o022
    ):
        raise ValueError("int16-only output parent is not private")
    report_snapshot = copy.deepcopy(report)
    receipt_snapshot = copy.deepcopy(receipt)
    bindings_snapshot = copy.deepcopy(artifact_bindings)
    report_raw = PROTOCOL.canonical_json_bytes(report_snapshot)
    receipt_raw = PROTOCOL.canonical_json_bytes(receipt_snapshot)
    publication = _validate_publication(
        _expected_publication(
            report=report_snapshot,
            receipt=receipt_snapshot,
            origin_registry=origin_registry,
            artifact_bindings=bindings_snapshot,
        ),
        _expected_publication(
            report=report_snapshot,
            receipt=receipt_snapshot,
            origin_registry=origin_registry,
            artifact_bindings=bindings_snapshot,
        ),
    )
    raw_files = {
        PROTOCOL.OUTPUT_FILES["report"]: report_raw,
        PROTOCOL.OUTPUT_FILES["receipt"]: receipt_raw,
        PROTOCOL.OUTPUT_FILES["publication"]: PROTOCOL.canonical_json_bytes(
            publication
        ),
    }
    staging = Path(tempfile.mkdtemp(prefix=f".{target.name}.", dir=parent))
    try:
        staging.chmod(0o700)
        for name, raw in raw_files.items():
            descriptor = os.open(
                staging / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600
            )
            with os.fdopen(descriptor, "wb") as destination:
                destination.write(raw)
                destination.flush()
                os.fsync(destination.fileno())
        directory_fd = os.open(staging, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
        if _before_commit is not None:
            _before_commit(target)
        if (
            report != report_snapshot
            or receipt != receipt_snapshot
            or artifact_bindings != bindings_snapshot
            or PROTOCOL.canonical_json_bytes(report) != report_raw
            or PROTOCOL.canonical_json_bytes(receipt) != receipt_raw
            or publication
            != _expected_publication(
                report=report_snapshot,
                receipt=receipt_snapshot,
                origin_registry=origin_registry,
                artifact_bindings=bindings_snapshot,
            )
        ):
            raise ValueError("int16-only publication inputs changed before commit")
        atomic_commit = ATOMIC._rename_directory_exclusive(staging, target)
        staging = Path()
        commit_receipt = _normalize_atomic_commit_after_return(atomic_commit)
    finally:
        if staging != Path() and staging.exists():
            shutil.rmtree(staging)
    return {"publication": publication, "commit_receipt": commit_receipt}


def run_int16_only_candidate_amendment(
    *,
    repo_root: str | Path | None = None,
    home_root: str | Path | None = None,
    prevalidate: Callable[..., Mapping[str, Any]] = (ADAPTER.prevalidate_parent_family),
    evaluate: Callable[..., Mapping[str, Any]] = (
        ADAPTER.evaluate_spent_selection_int16_only
    ),
    publish: Callable[..., Mapping[str, Any]] = publish_private_bundle,
    fingerprint: Callable[[str], Mapping[str, Any]] = SELECTION._file_fingerprint,
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    home = Path(home_root or Path.home()).expanduser().resolve()
    registry, origin_registry = _runtime_registry(root)
    _validate_public_inputs(registry, root, home)
    prepared = dict(
        prevalidate(
            registry=registry,
            repo_root=root,
            home_root=home,
            fingerprint=fingerprint,
        )
    )
    if (
        prepared.get("selection_labels_read") is not False
        or prepared.get("fresh_selection_labels_read") is not False
        or prepared.get("fresh_final_labels_read") is not False
        or prepared.get("legacy_holdout_labels_read") is not False
        or prepared.get("aligned_checkpoints_loaded") != 0
        or prepared.get("float_model_evaluations") != 0
    ):
        raise ValueError("parent-only prevalidation crossed a sealed boundary")
    spent = registry["spent_selection"]
    dataset_path = ADAPTER._resolved(home, spent["dataset"]["path"], "spent dataset")
    artifact_bindings = [
        {
            "seed": spec["seed"],
            "parent_result": copy.deepcopy(spec["parent_result"]),
        }
        for spec in registry["models"]["seeds"]
    ]
    report = dict(
        evaluate(
            prepared=prepared,
            dataset_path=dataset_path,
            dataset_identity=spent["dataset"],
            expected_records=spent["records"],
            expected_parents=spent["parents"],
            origin_registry_identity=origin_registry,
            artifact_bindings=artifact_bindings,
        )
    )
    receipt = build_adaptive_candidate_lock_receipt(
        report, registry=registry, origin_registry=origin_registry
    )
    report_snapshot = copy.deepcopy(report)
    receipt_snapshot = copy.deepcopy(receipt)
    bindings_snapshot = copy.deepcopy(artifact_bindings)
    expected_publication = _expected_publication(
        report=report_snapshot,
        receipt=receipt_snapshot,
        origin_registry=origin_registry,
        artifact_bindings=bindings_snapshot,
    )
    _validate_public_inputs(registry, root, home)
    _require_registry_unchanged(root, origin_registry)
    for path, identity, label in prepared["watched_artifacts"]:
        observed = fingerprint(path)
        if (
            observed.get("bytes") != identity["bytes"]
            or observed.get("sha256") != identity["sha256"]
        ):
            raise ValueError(f"{label} changed during int16-only evaluation")
    observed_dataset = fingerprint(dataset_path)
    if (
        observed_dataset.get("bytes") != spent["dataset"]["bytes"]
        or observed_dataset.get("sha256") != spent["dataset"]["sha256"]
    ):
        raise ValueError("spent selection dataset changed during evaluation")
    output_root = ADAPTER._resolved(home, PROTOCOL.OUTPUT_ROOT, "output root")
    published = dict(
        publish(
            output_root=output_root,
            report=copy.deepcopy(report_snapshot),
            receipt=copy.deepcopy(receipt_snapshot),
            origin_registry=origin_registry,
            artifact_bindings=copy.deepcopy(bindings_snapshot),
        )
    )
    committed_observed = (
        isinstance(published.get("commit_receipt"), Mapping)
        and published["commit_receipt"].get("committed") is True
    )
    try:
        if (
            set(published) != {"publication", "commit_receipt"}
            or report != report_snapshot
            or receipt != receipt_snapshot
            or artifact_bindings != bindings_snapshot
        ):
            raise ValueError("int16-only publication result is incomplete")
        publication = _validate_publication(
            published["publication"], expected_publication
        )
        commit_receipt = _validate_commit_receipt(published["commit_receipt"])
    except (TypeError, ValueError):
        if not committed_observed:
            raise
        # Once a publisher reports that its registered commit point happened,
        # never turn an uncertain durable target into a false STOP/retry signal.
        publication = copy.deepcopy(published.get("publication"))
        commit_receipt = _committed_recovery_receipt(
            "post-commit-publication-validation-failed"
        )
    return {
        "report": report,
        "receipt": receipt,
        "publication": publication,
        "commit_receipt": commit_receipt,
    }


def main(argv: list[str] | None = None) -> int:
    arguments = list(sys.argv[1:] if argv is None else argv)
    if arguments:
        print(
            "int16-only candidate amendment STOP: arguments forbidden", file=sys.stderr
        )
        return 2
    try:
        result = run_int16_only_candidate_amendment()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"int16-only candidate amendment STOP: {error}", file=sys.stderr)
        return 1
    candidate = result["receipt"]["candidate_lock"]
    commit = _validate_commit_receipt(result["commit_receipt"])
    if commit["post_commit_status"] != "verified-and-parent-fsynced":
        print(
            "int16-only candidate amendment COMMITTED-RECOVERY: "
            f"diagnostics={','.join(commit['diagnostic_errors'])}; "
            f"recovery={commit['recovery']}",
            file=sys.stderr,
        )
        return 0
    print(
        "int16-only candidate amendment COMMITTED: "
        f"seed={candidate['seed']} epoch={candidate['epoch']} "
        f"sha256={candidate['checkpoint']['sha256']}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "Int16OnlyCandidateLockFailed",
    "build_adaptive_candidate_lock_receipt",
    "main",
    "publish_private_bundle",
    "run_int16_only_candidate_amendment",
]
