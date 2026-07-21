#!/usr/bin/env python3
"""Argumentless spent-selection representation bridge v3 runner."""

from __future__ import annotations

from collections.abc import Callable, Mapping
import copy
import ctypes
import errno
import hashlib
import os
from pathlib import Path
import shutil
import stat
import sys
import tempfile
from typing import Any

import strength_first_qat_constrained_alignment_v2_result_registry as ALIGNMENT
import strength_first_qat_selection_evaluator as SELECTION
import strength_first_representation_bridge_v3_eval_adapter as ADAPTER
import strength_first_representation_bridge_v3_protocol as PROTOCOL


class RepresentationBridgeGateFailed(RuntimeError):
    """The representation-only family gate did not pass."""


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


def _validate_public_inputs(registry: Mapping[str, Any], root: Path) -> None:
    for name, identity in registry["implementation"].items():
        _read_registered(root, identity, f"implementation {name}")
    closure = registry["dependencies"]["runtime_import_closure"]
    for name, identity in closure.items():
        _read_registered(root, identity, f"runtime import closure {name}")
    alignment_raw = _read_registered(
        root, registry["inputs"]["alignment_result_registry"], "alignment registry"
    )
    selection_raw = _read_registered(
        root,
        registry["inputs"]["selection_evaluator_registry"],
        "selection evaluator registry",
    )
    alignment = ALIGNMENT.validate_result_registry(
        PROTOCOL.strict_json(alignment_raw, "alignment registry")
    )
    selection = SELECTION.validate_strength_first_selection_evaluator_registry_data(
        PROTOCOL.strict_json(selection_raw, "selection evaluator registry")
    )
    selection_closure_names = {
        "evaluator": "selection_evaluator",
        "adapter": "selection_adapter",
        "preflight": "selection_preflight",
        "real_eval_core": "evaluation_core",
        "metric_gates": "metric_gates",
    }
    if any(
        selection["implementation"][enrolled]
        != closure[selection_closure_names[enrolled]]
        for enrolled in selection_closure_names
    ):
        raise ValueError("selection implementation import closure drifted")
    if (
        selection["status"] != SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_READY_STATUS
        or selection["enrollments"]["selection_dataset"]
        != registry["spent_selection"]["dataset"]
        or selection["enrollments"]["stable_checkpoint"]
        != registry["models"]["stable"]["checkpoint"]
    ):
        raise ValueError("representation bridge selection enrollment drifted")
    for source, enrolled, seed in zip(
        alignment["runs"], registry["models"]["seeds"], PROTOCOL.SEEDS
    ):
        if (
            source["seed"] != seed
            or source["parent"]["result"] != enrolled["parent_result"]
            or source["parent"]["checkpoint"] != enrolled["parent_checkpoint"]
            or source["result"] != enrolled["aligned_result"]
            or {**source["checkpoint"], "epoch": 24} != enrolled["aligned_checkpoint"]
            or source["quantized_equality"]["parent"] != enrolled["quantized_anchor"]
        ):
            raise ValueError(f"representation bridge seed {seed} enrollment drifted")


def _runtime_registry(root: Path) -> tuple[dict[str, Any], dict[str, Any]]:
    path = root / PROTOCOL.REGISTRY_RELATIVE_PATH
    raw = path.read_bytes()
    registry = PROTOCOL.validate_registry(
        PROTOCOL.strict_json(raw, "representation bridge registry")
    )
    if raw != PROTOCOL.canonical_json_bytes(registry):
        raise ValueError("representation bridge registry is not canonical")
    return registry, _artifact_identity(
        raw,
        path=PROTOCOL.REGISTRY_RELATIVE_PATH,
        schema=PROTOCOL.REGISTRY_SCHEMA,
    )


def _require_registry_unchanged(root: Path, expected: Mapping[str, Any]) -> None:
    _registry, observed = _runtime_registry(root)
    if observed != expected:
        raise ValueError("representation bridge origin registry changed")


def _report_model(
    value: Any, *, name: str, role: str, seed: int | None
) -> dict[str, Any]:
    if (
        type(value) is not dict
        or set(value)
        != {
            "name",
            "role",
            "seed",
            "checkpoint",
            "float",
            "int16",
            "int16_source",
        }
        or value["name"] != name
        or value["role"] != role
        or value["seed"] != seed
    ):
        raise ValueError(f"report model {name} is invalid")
    expected_int16_source = (
        "derived-from-seven-tensor-equivalent-parent"
        if role == "aligned-witness"
        else "evaluated-exact-int16-forward-batch"
    )
    if value["int16_source"] != expected_int16_source:
        raise ValueError(f"report model {name} int16 source is invalid")
    checkpoint = value["checkpoint"]
    expected_epoch = 27 if role == "stable" else (20 if role == "parent" else 24)
    PROTOCOL.checkpoint_identity(
        checkpoint, f"report model {name}", epoch=expected_epoch
    )
    return {
        **copy.deepcopy(value),
        "float": PROTOCOL.metric_set(value["float"], f"{name} float"),
        "int16": PROTOCOL.metric_set(value["int16"], f"{name} int16"),
    }


def build_parent_deployment_receipt(
    report: Mapping[str, Any],
    *,
    registry: Mapping[str, Any],
    origin_registry: Mapping[str, Any],
) -> dict[str, Any]:
    if (
        type(report) is not dict
        or set(report)
        != {
            "schema",
            "status",
            "origin_registry",
            "artifact_bindings",
            "data",
            "models",
            "quantized_proofs",
            "execution",
            "boundary",
        }
        or report["schema"] != PROTOCOL.REPORT_SCHEMA
        or report["status"] != PROTOCOL.REPORT_STATUS
        or report["origin_registry"] != origin_registry
        or report["boundary"] != PROTOCOL.BOUNDARY
        or report["data"]
        != {
            **registry["spent_selection"]["dataset"],
            "records": 28_518,
            "parents": 4_798,
            "eligible_pairs": report["data"].get("eligible_pairs"),
            "label_status": "already-spent-selection",
            "authorized_use": "representation-only-no-strength-claim",
        }
        or type(report["data"].get("eligible_pairs")) is not int
        or report["data"]["eligible_pairs"] < 1
        or type(report["execution"]) is not dict
        or set(report["execution"])
        != {
            "model_count",
            "model_loop_workers",
            "float_model_evaluations",
            "int16_model_evaluations",
            "q_equivalent_int16_derivations",
            "int16_reference",
            "int16_batch_rows",
            "torch_intraop_threads",
            "torch_original_intraop_threads",
            "torch_original_intraop_threads_restored",
            "torch_interop_threads",
            "torch_interop_threads_unchanged",
            "network_requests",
        }
        or {
            field: report["execution"].get(field)
            for field in (
                "model_loop_workers",
                "float_model_evaluations",
                "int16_model_evaluations",
                "q_equivalent_int16_derivations",
            )
        }
        != {
            "model_loop_workers": 1,
            "float_model_evaluations": 7,
            "int16_model_evaluations": 4,
            "q_equivalent_int16_derivations": 3,
        }
        or report["execution"].get("model_count") != 7
        or report["execution"].get("int16_reference") != "int16_forward_batch"
        or report["execution"].get("int16_batch_rows") != 4_096
        or report["execution"].get("torch_intraop_threads") != 10
        or type(report["execution"].get("torch_original_intraop_threads")) is not int
        or report["execution"]["torch_original_intraop_threads"] < 1
        or report["execution"].get("torch_original_intraop_threads_restored")
        is not True
        or type(report["execution"].get("torch_interop_threads")) is not int
        or report["execution"]["torch_interop_threads"] < 1
        or report["execution"].get("torch_interop_threads_unchanged") is not True
        or report["execution"].get("network_requests") != 0
    ):
        raise ValueError("representation evaluation report is partial")
    expected_bindings = [
        {
            "seed": spec["seed"],
            "parent_result": copy.deepcopy(spec["parent_result"]),
            "aligned_result": copy.deepcopy(spec["aligned_result"]),
        }
        for spec in registry["models"]["seeds"]
    ]
    if report["artifact_bindings"] != expected_bindings:
        raise ValueError("representation report result identities drifted")
    models = report["models"]
    if type(models) is not list or len(models) != 7:
        raise ValueError("representation report requires exactly seven models")
    stable = _report_model(models[0], name="stable", role="stable", seed=None)
    if stable["checkpoint"] != {
        **registry["models"]["stable"]["checkpoint"],
        "epoch": 27,
    }:
        raise ValueError("stable report checkpoint identity drifted")
    proofs = report["quantized_proofs"]
    if type(proofs) is not list or len(proofs) != 3:
        raise ValueError("representation report requires three q proofs")

    runs = []
    for index, seed in enumerate(PROTOCOL.SEEDS):
        parent = _report_model(
            models[1 + index * 2],
            name=f"seed-{seed}-parent-deployment",
            role="parent",
            seed=seed,
        )
        witness = _report_model(
            models[2 + index * 2],
            name=f"seed-{seed}-aligned-witness",
            role="aligned-witness",
            seed=seed,
        )
        enrolled = registry["models"]["seeds"][index]
        if parent["checkpoint"] != enrolled["parent_checkpoint"]:
            raise ValueError(f"seed {seed} parent report checkpoint identity drifted")
        if witness["checkpoint"] != enrolled["aligned_checkpoint"]:
            raise ValueError(f"seed {seed} witness report checkpoint identity drifted")
        proof = proofs[index]
        if (
            type(proof) is not dict
            or set(proof)
            != {
                "schema",
                "seed",
                "method",
                "tensor_names",
                "tensors_equal",
                "equal_tensor_count",
                "all_equal",
                "parent",
                "aligned_witness",
            }
            or proof.get("schema") != PROTOCOL.QUANTIZED_PROOF_SCHEMA
            or proof.get("seed") != seed
            or proof.get("method")
            != "independent-strict-load-quantize-model-torch-equal"
            or proof.get("tensor_names") != list(PROTOCOL.QUANTIZED_TENSOR_NAMES)
            or proof.get("tensors_equal")
            != {name: True for name in PROTOCOL.QUANTIZED_TENSOR_NAMES}
            or proof.get("equal_tensor_count") != 7
            or proof.get("all_equal") is not True
            or proof.get("parent") != proof.get("aligned_witness")
            or proof.get("parent")
            != registry["models"]["seeds"][index]["quantized_anchor"]
        ):
            raise ValueError(f"seed {seed} quantized proof is incomplete")
        if parent["int16"] != witness["int16"]:
            raise ValueError(f"seed {seed} parent/witness int16 metrics diverged")
        gates = PROTOCOL.representation_gates(
            aligned_float=witness["float"],
            parent_int16=parent["int16"],
            stable_int16=stable["int16"],
        )
        runs.append(
            {
                "seed": seed,
                "deployment_checkpoint": copy.deepcopy(parent["checkpoint"]),
                "alignment_witness": copy.deepcopy(witness["checkpoint"]),
                "parent_float": parent["float"],
                "aligned_float": witness["float"],
                "parent_int16": parent["int16"],
                "aligned_int16": witness["int16"],
                "quantized_proof": copy.deepcopy(proof),
                "gates": gates,
            }
        )

    ranked = sorted(runs, key=PROTOCOL.selection_key)
    representative = ranked[1]
    seeds_passing = sum(run["gates"]["passed"] for run in runs)
    all_delta_gates = all(
        run["gates"]["checks"][2]["passed"] and run["gates"]["checks"][3]["passed"]
        for run in runs
    )
    family_gate = {
        "representative_passed_all_four": representative["gates"]["passed"],
        "seeds_passing_all_four": seeds_passing,
        "minimum_seeds_passing_all_four": 2,
        "minimum_seed_count_passed": seeds_passing >= 2,
        "all_seeds_passed_both_representation_delta_gates": all_delta_gates,
        "passed": (
            representative["gates"]["passed"] and seeds_passing >= 2 and all_delta_gates
        ),
    }
    if family_gate["passed"] is not True:
        raise RepresentationBridgeGateFailed("representation family gate failed")
    return {
        "schema": PROTOCOL.RECEIPT_SCHEMA,
        "status": PROTOCOL.RECEIPT_STATUS,
        "origin_registry": copy.deepcopy(origin_registry),
        "artifact_bindings": copy.deepcopy(expected_bindings),
        "spent_selection": copy.deepcopy(registry["spent_selection"]),
        "stable": {
            "checkpoint": stable["checkpoint"],
            "float": stable["float"],
            "int16": stable["int16"],
        },
        "runs": runs,
        "metric_order": list(PROTOCOL.METRIC_ORDER),
        "ranked_seed_order": [run["seed"] for run in ranked],
        "representative_seed": representative["seed"],
        "selected_deployment": {
            "seed": representative["seed"],
            "checkpoint": copy.deepcopy(representative["deployment_checkpoint"]),
            "epoch": 20,
        },
        "alignment_witness": {
            "seed": representative["seed"],
            "checkpoint": copy.deepcopy(representative["alignment_witness"]),
            "epoch": 24,
            "deployment_authority": False,
        },
        "family_gate": family_gate,
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
        "nonclaims": copy.deepcopy(PROTOCOL.NONCLAIMS),
    }


def _artifact_identity(raw: bytes, *, path: str, schema: str) -> dict[str, Any]:
    return {
        "path": path,
        "schema": schema,
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _rename_directory_exclusive(
    source: Path,
    target: Path,
    *,
    _post_stat: Callable[..., os.stat_result] = os.stat,
    _fsync: Callable[[int], None] = os.fsync,
    _close: Callable[[int], None] = os.close,
) -> dict[str, Any]:
    """Atomically install one directory and report post-commit diagnostics.

    A zero return from the exclusive rename is the irreversible commit point.
    No diagnostic failure after that point is reported as a failed run: the
    target already contains the complete bundle and must not be retried over
    or deleted automatically.
    """

    if source.parent != target.parent or source.name == target.name:
        raise ValueError("exclusive publication paths must be sibling directories")
    flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) | getattr(os, "O_NOFOLLOW", 0)
    parent_fd = os.open(source.parent, flags)
    source_fd = -1
    committed = False
    diagnostic_errors: list[str] = []
    commit_receipt: dict[str, Any] | None = None
    try:
        source_fd = os.open(source.name, flags, dir_fd=parent_fd)
        parent_before = os.fstat(parent_fd)
        source_before = os.fstat(source_fd)
        source_at_parent = os.stat(source.name, dir_fd=parent_fd, follow_symlinks=False)
        if (
            stat.S_IMODE(parent_before.st_mode) != 0o700
            or parent_before.st_uid != os.geteuid()
            or stat.S_IMODE(source_before.st_mode) != 0o700
            or source_before.st_uid != os.geteuid()
            or (source_before.st_dev, source_before.st_ino)
            != (source_at_parent.st_dev, source_at_parent.st_ino)
        ):
            raise ValueError("exclusive publication descriptor identity is invalid")
        libc = ctypes.CDLL(None, use_errno=True)
        source_raw = os.fsencode(source.name)
        target_raw = os.fsencode(target.name)
        if sys.platform == "darwin" and hasattr(libc, "renameatx_np"):
            rename = libc.renameatx_np
            rename.argtypes = (
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_uint,
            )
            rename.restype = ctypes.c_int
            result = rename(
                parent_fd,
                source_raw,
                parent_fd,
                target_raw,
                0x00000004 | 0x00000010,  # RENAME_EXCL | RENAME_NOFOLLOW_ANY
            )
        elif hasattr(libc, "renameat2"):
            rename = libc.renameat2
            rename.argtypes = (
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_int,
                ctypes.c_char_p,
                ctypes.c_uint,
            )
            rename.restype = ctypes.c_int
            result = rename(
                parent_fd, source_raw, parent_fd, target_raw, 0x1
            )  # RENAME_NOREPLACE
        else:
            raise ValueError("exclusive directory publication is unavailable")
        if result != 0:
            error_number = ctypes.get_errno()
            if error_number in (errno.EEXIST, errno.ENOTEMPTY):
                raise ValueError("representation output root already exists")
            raise OSError(error_number, os.strerror(error_number), str(target))
        committed = True
        try:
            target_after = _post_stat(
                target.name, dir_fd=parent_fd, follow_symlinks=False
            )
            held_after = os.fstat(source_fd)
            if (target_after.st_dev, target_after.st_ino) != (
                source_before.st_dev,
                source_before.st_ino,
            ) or (held_after.st_dev, held_after.st_ino) != (
                source_before.st_dev,
                source_before.st_ino,
            ):
                diagnostic_errors.append("target-inode-verification-mismatch")
        except OSError:
            diagnostic_errors.append("target-inode-verification-indeterminate")
        try:
            _post_stat(source.name, dir_fd=parent_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        except OSError:
            diagnostic_errors.append("source-removal-verification-indeterminate")
        else:
            diagnostic_errors.append("source-path-still-present")
        try:
            _fsync(parent_fd)
        except OSError:
            diagnostic_errors.append("parent-directory-fsync-failed")
        commit_receipt = {
            "schema": "shogi-representation-bridge-v3-runtime-commit-receipt-v1",
            "committed": True,
            "commit_point": PROTOCOL.COMMIT_SEMANTICS["commit_point"],
            "post_commit_status": (
                "verified-and-parent-fsynced"
                if not diagnostic_errors
                else "committed-recovery-verification-required"
            ),
            "diagnostic_errors": diagnostic_errors,
            "recovery": (
                "none"
                if not diagnostic_errors
                else PROTOCOL.COMMIT_SEMANTICS["recovery"]
            ),
        }
        return commit_receipt
    finally:
        if source_fd >= 0:
            try:
                _close(source_fd)
            except OSError:
                if not committed:
                    raise
                diagnostic_errors.append("source-descriptor-close-failed")
        try:
            _close(parent_fd)
        except OSError:
            if not committed:
                raise
            diagnostic_errors.append("parent-descriptor-close-failed")
        if committed and diagnostic_errors and commit_receipt is not None:
            commit_receipt["post_commit_status"] = (
                "committed-recovery-verification-required"
            )
            commit_receipt["recovery"] = PROTOCOL.COMMIT_SEMANTICS["recovery"]


def publish_private_bundle(
    *,
    output_root: str,
    report: Mapping[str, Any],
    receipt: Mapping[str, Any],
    origin_registry: Mapping[str, Any],
    artifact_bindings: list[Mapping[str, Any]],
    _before_commit: Callable[[Path], None] | None = None,
    _post_stat: Callable[..., os.stat_result] = os.stat,
    _fsync: Callable[[int], None] = os.fsync,
    _close: Callable[[int], None] = os.close,
) -> dict[str, Any]:
    if (
        report.get("schema") != PROTOCOL.REPORT_SCHEMA
        or receipt.get("schema") != PROTOCOL.RECEIPT_SCHEMA
        or report.get("origin_registry") != origin_registry
        or receipt.get("origin_registry") != origin_registry
        or report.get("artifact_bindings") != artifact_bindings
        or receipt.get("artifact_bindings") != artifact_bindings
    ):
        raise ValueError("representation publication provenance is inconsistent")
    target = Path(output_root).absolute()
    if target.resolve() != target or target.exists():
        raise ValueError("representation output root is not new and canonical")
    parent = target.parent
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    parent_stat = parent.stat()
    if (
        not stat.S_ISDIR(parent_stat.st_mode)
        or parent_stat.st_uid != os.geteuid()
        or stat.S_IMODE(parent_stat.st_mode) & 0o022
    ):
        raise ValueError("representation output parent is not private")
    report_raw = PROTOCOL.canonical_json_bytes(report)
    receipt_raw = PROTOCOL.canonical_json_bytes(receipt)
    publication = {
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
        "atomic_private_bundle": True,
        "commit_semantics": copy.deepcopy(PROTOCOL.COMMIT_SEMANTICS),
        "boundary": copy.deepcopy(PROTOCOL.BOUNDARY),
        "nonclaims": copy.deepcopy(PROTOCOL.NONCLAIMS),
    }
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
                staging / name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            with os.fdopen(descriptor, "wb") as destination:
                destination.write(raw)
                destination.flush()
                _fsync(destination.fileno())
        directory_fd = os.open(staging, os.O_RDONLY)
        try:
            _fsync(directory_fd)
        finally:
            os.close(directory_fd)
        if _before_commit is not None:
            _before_commit(target)
        commit_receipt = _rename_directory_exclusive(
            staging,
            target,
            _post_stat=_post_stat,
            _fsync=_fsync,
            _close=_close,
        )
        staging = Path()
    finally:
        if staging != Path() and staging.exists():
            shutil.rmtree(staging)
    return {
        "publication": publication,
        "commit_receipt": commit_receipt,
    }


def run_representation_bridge(
    *,
    repo_root: str | Path | None = None,
    home_root: str | Path | None = None,
    prevalidate: Callable[..., Mapping[str, Any]] = ADAPTER.prevalidate_family,
    evaluate: Callable[..., Mapping[str, Any]] = ADAPTER.evaluate_spent_selection,
    publish: Callable[..., Mapping[str, Any]] = publish_private_bundle,
    fingerprint: Callable[[str], Mapping[str, Any]] = SELECTION._file_fingerprint,
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    home = Path(home_root or Path.home()).expanduser().resolve()
    registry, origin_registry = _runtime_registry(root)
    _validate_public_inputs(registry, root)

    prepared = dict(prevalidate(registry=registry, repo_root=root, home_root=home))
    if prepared.get("selection_labels_read") is not False:
        raise ValueError("model prevalidation crossed the spent-label boundary")
    spent = registry["spent_selection"]
    dataset_path = ADAPTER._resolved(home, spent["dataset"]["path"], "spent dataset")
    report = dict(
        evaluate(
            prepared=prepared,
            dataset_path=dataset_path,
            dataset_identity=spent["dataset"],
            expected_records=spent["records"],
            expected_parents=spent["parents"],
            origin_registry_identity=origin_registry,
            artifact_bindings=[
                {
                    "seed": spec["seed"],
                    "parent_result": copy.deepcopy(spec["parent_result"]),
                    "aligned_result": copy.deepcopy(spec["aligned_result"]),
                }
                for spec in registry["models"]["seeds"]
            ],
        )
    )
    receipt = build_parent_deployment_receipt(
        report, registry=registry, origin_registry=origin_registry
    )
    # Re-authenticate every executed source after the label read and before
    # publication so a concurrent replacement cannot bless different code.
    _validate_public_inputs(registry, root)
    _require_registry_unchanged(root, origin_registry)
    for path, identity, label in prepared["watched_artifacts"]:
        observed = fingerprint(path)
        if (
            observed.get("bytes") != identity["bytes"]
            or observed.get("sha256") != identity["sha256"]
        ):
            raise ValueError(f"{label} changed during representation evaluation")
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
            report=report,
            receipt=receipt,
            origin_registry=origin_registry,
            artifact_bindings=report["artifact_bindings"],
        )
    )
    if (
        set(published) != {"publication", "commit_receipt"}
        or published["publication"].get("schema") != PROTOCOL.PUBLICATION_SCHEMA
        or published["commit_receipt"].get("committed") is not True
    ):
        raise ValueError("representation publication result is incomplete")
    return {
        "report": report,
        "receipt": receipt,
        "publication": copy.deepcopy(published["publication"]),
        "commit_receipt": copy.deepcopy(published["commit_receipt"]),
    }


def main(argv: list[str] | None = None) -> int:
    if list(sys.argv[1:] if argv is None else argv):
        print("representation bridge accepts no arguments", file=sys.stderr)
        return 2
    try:
        result = run_representation_bridge()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"representation bridge STOP: {error}", file=sys.stderr)
        return 1
    selected = result["receipt"]["selected_deployment"]
    commit = result["commit_receipt"]
    if commit["post_commit_status"] != "verified-and-parent-fsynced":
        diagnostics = ",".join(commit["diagnostic_errors"])
        print(
            "representation bridge COMMITTED-RECOVERY: "
            f"status={commit['post_commit_status']}; "
            f"diagnostic_errors={diagnostics}; recovery={commit['recovery']}",
            file=sys.stderr,
        )
        return 0
    print(
        f"representation bridge PASS: parent seed {selected['seed']} epoch 20; "
        "aligned epoch 24 retained only as witness; "
        f"commit_status={commit['post_commit_status']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
