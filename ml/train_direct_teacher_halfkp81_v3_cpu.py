#!/usr/bin/env python3
"""One-shot direct-teacher HalfKP81 v3 trainer on the fixed 14-core CPU."""

from __future__ import annotations

import argparse
import copy
import hashlib
import json
import math
import os
import platform
import random
import subprocess
import sys
import tempfile
import time
from typing import Any, Mapping, Sequence

import torch

import build_direct_teacher_halfkp81_v3_cpu_plan as PLAN
import direct_teacher_halfkp81_v2_protocol as V2_PROTOCOL
import direct_teacher_halfkp81_v3_cpu_protocol as PROTOCOL
import train
import train_direct_teacher_halfkp81_v2 as V2


TRAINER_RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-trainer-result-v1"
STATIC_RESULT_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-static-sanity-result-v1"
CHECKPOINT_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-final-checkpoint-v1"
PROBE_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-capability-probe-v1"
CLAIM_SCHEMA = "shogi-direct-teacher-halfkp81-v3-cpu-one-shot-claim-v1"
CLAIM_STATUS = "exclusive-v3-cpu-one-shot-claimed-no-retry"
CLAIM_DIRECTORY = ".direct-teacher-halfkp81-v3-cpu-one-shot-claims"
PROBE_DIRECTORY = ".direct-teacher-halfkp81-v3-cpu-capability-probes"
FEATURES = V2.FEATURES
BUCKETS = V2.BUCKETS
K_SIGMOID = V2.K_SIGMOID
SEED = V2.SEED
BATCH = V2.BATCH
LEARNING_RATE = V2.LEARNING_RATE
WEIGHT_DECAY = V2.WEIGHT_DECAY
RUNTIME_SCRIPT = V2.RUNTIME_SCRIPT
RUNTIME_WASM = V2.RUNTIME_WASM
EXPECTED_RUNTIME_WASM = V2.EXPECTED_RUNTIME_WASM


class DirectTeacherV3CpuTrainingError(ValueError):
    """The fixed v3 CPU training/static contract was violated."""


def _identity(path: str, label: str) -> dict[str, Any]:
    return V2._identity(path, label)


def _exact_identity(
    observed: Mapping[str, Any], expected: Mapping[str, Any], label: str
) -> None:
    for field in ("bytes", "sha256"):
        if observed.get(field) != expected.get(field):
            raise DirectTeacherV3CpuTrainingError(f"{label} {field} differs")


def _validate_public_identity(
    value: Any,
    *,
    label: str,
    schema: str | None = None,
    buckets: int | None = None,
) -> dict[str, Any]:
    try:
        return V2._validate_public_identity(
            value,
            label=label,
            schema=schema,
            buckets=buckets,
        )
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error


def _load_matching_json_identity(
    value: Any,
    *,
    label: str,
    schema: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    identity = _validate_public_identity(value, label=label, schema=schema)
    observed, observed_identity = PROTOCOL.load_strict_json_file(
        identity["path"], label
    )
    if any(
        observed_identity[field] != identity[field]
        for field in ("path", "bytes", "sha256")
    ):
        raise DirectTeacherV3CpuTrainingError(f"{label} bytes/binding changed")
    if type(observed) is not dict or observed.get("schema") != schema:
        raise DirectTeacherV3CpuTrainingError(f"{label} schema differs")
    return observed, observed_identity


def _reauthenticate_plain_file_identity(
    value: Any,
    *,
    label: str,
    buckets: int | None = None,
) -> dict[str, Any]:
    identity = _validate_public_identity(value, label=label, buckets=buckets)
    observed = _identity(identity["path"], label)
    if any(observed[field] != identity[field] for field in ("path", "bytes", "sha256")):
        raise DirectTeacherV3CpuTrainingError(f"{label} bytes/binding changed")
    return identity


def load_and_rebuild_execution_plan(
    execution_plan_path: str, *, repo_root: str
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, Any]]:
    plan_raw, plan_identity = PROTOCOL.load_strict_json_file(
        execution_plan_path, "v3 CPU execution plan"
    )
    plan = PROTOCOL.validate_execution_plan(plan_raw)
    protocol_raw, protocol_identity = PROTOCOL.load_strict_json_file(
        plan["protocol"]["path"], "v3 CPU protocol"
    )
    protocol = PROTOCOL.validate_protocol_document(protocol_raw)
    terminal_raw, terminal_identity = PROTOCOL.load_strict_json_file(
        plan["predecessor_terminal"]["path"], "v2 terminal result"
    )
    PROTOCOL.verify_terminal_evidence(terminal_raw, protocol=protocol)
    manifest_raw, manifest_identity = PROTOCOL.load_strict_json_file(
        plan["metadata_manifest"]["path"], "v3 metadata manifest"
    )
    manifest = PROTOCOL.validate_metadata_manifest(
        manifest_raw,
        protocol=protocol,
        protocol_identity=protocol_identity,
        terminal_identity=terminal_identity,
    )
    rebuilt = PLAN.build_execution_plan(
        protocol_path=plan["protocol"]["path"],
        metadata_manifest_path=plan["metadata_manifest"]["path"],
        repo_root=repo_root,
    )
    if rebuilt != plan:
        raise DirectTeacherV3CpuTrainingError(
            "v3 execution plan differs from strict reconstruction"
        )
    for observed, expected, label in (
        (protocol_identity, plan["protocol"], "protocol"),
        (terminal_identity, plan["predecessor_terminal"], "terminal"),
        (manifest_identity, plan["metadata_manifest"], "metadata manifest"),
    ):
        _exact_identity(observed, expected, label)
    return plan, plan_identity, protocol, manifest


def validate_fixed_contract(plan: Mapping[str, Any]) -> None:
    if plan["training"] != PROTOCOL.EXPECTED_TRAINING:
        raise DirectTeacherV3CpuTrainingError("v3 CPU training recipe differs")
    if {
        key
        for key in plan["training"]
        if plan["training"][key] != V2_PROTOCOL.EXPECTED_TRAINING[key]
    } != {"device"}:
        raise DirectTeacherV3CpuTrainingError(
            "v3 training differs from v2 beyond device"
        )
    if (
        plan["cpu_execution"] != PROTOCOL.EXPECTED_CPU_EXECUTION
        or plan["capability_probe"] != PROTOCOL.EXPECTED_CAPABILITY_PROBE
        or plan["static_sanity"] != PROTOCOL.EXPECTED_STATIC_SANITY
        or plan["paired_screen"] != V2_PROTOCOL.EXPECTED_PAIRED_SCREEN
    ):
        raise DirectTeacherV3CpuTrainingError("v3 runtime/probe/gate contract differs")


def configure_and_verify_cpu_runtime(
    *, allow_host_override_for_tests: bool = False
) -> dict[str, Any]:
    expected = PROTOCOL.EXPECTED_CPU_EXECUTION
    if not allow_host_override_for_tests:
        for name, value in expected["environment"].items():
            if os.environ.get(name) != value:
                raise DirectTeacherV3CpuTrainingError(
                    f"fixed CPU environment differs: {name}"
                )
        if (
            torch.__version__ != expected["torch_version"]
            or platform.python_version() != expected["python_version"]
            or platform.machine() != expected["machine"]
            or os.cpu_count() != expected["logical_cores"]
        ):
            raise DirectTeacherV3CpuTrainingError(
                "fixed CPU software or logical-core identity differs"
            )
        try:
            physical = int(
                subprocess.run(
                    ["/usr/sbin/sysctl", "-n", "hw.physicalcpu"],
                    check=True,
                    capture_output=True,
                    text=True,
                ).stdout.strip()
            )
        except (OSError, subprocess.CalledProcessError, ValueError) as error:
            raise DirectTeacherV3CpuTrainingError(
                "cannot verify physical CPU count"
            ) from error
        if physical != expected["physical_cores"]:
            raise DirectTeacherV3CpuTrainingError("physical CPU count differs")
    torch.set_num_threads(expected["torch_num_threads"])
    if torch.get_num_interop_threads() != expected["torch_num_interop_threads"]:
        try:
            torch.set_num_interop_threads(expected["torch_num_interop_threads"])
        except RuntimeError as error:
            raise DirectTeacherV3CpuTrainingError(
                "cannot fix CPU inter-op threads before parallel work"
            ) from error
    torch.use_deterministic_algorithms(
        expected["deterministic_algorithms"],
        warn_only=expected["deterministic_warn_only"],
    )
    if (
        torch.get_num_threads() != expected["torch_num_threads"]
        or torch.get_num_interop_threads() != expected["torch_num_interop_threads"]
        or not torch.are_deterministic_algorithms_enabled()
    ):
        raise DirectTeacherV3CpuTrainingError("CPU deterministic runtime differs")
    return {
        **copy.deepcopy(expected),
        "verified": True,
    }


def _tensor_sha256(tensor: torch.Tensor) -> str:
    value = tensor.detach().cpu().contiguous()
    digest = hashlib.sha256()
    digest.update(str(value.dtype).encode("ascii"))
    digest.update(json.dumps(list(value.shape), separators=(",", ":")).encode("ascii"))
    digest.update(memoryview(value.numpy()))
    return digest.hexdigest()


def _model_parameter_sha256(model: torch.nn.Module) -> str:
    digest = hashlib.sha256()
    for name, parameter in model.named_parameters():
        digest.update(name.encode("utf-8"))
        digest.update(bytes.fromhex(_tensor_sha256(parameter)))
    return digest.hexdigest()


def _gradient_sha256(model: torch.nn.Module) -> str:
    digest = hashlib.sha256()
    for name, parameter in model.named_parameters():
        if parameter.grad is None or not bool(
            torch.isfinite(parameter.grad).all().item()
        ):
            raise DirectTeacherV3CpuTrainingError(
                f"capability probe gradient missing/non-finite: {name}"
            )
        digest.update(name.encode("utf-8"))
        digest.update(bytes.fromhex(_tensor_sha256(parameter.grad)))
    return digest.hexdigest()


def run_capability_probe(
    *,
    model: torch.nn.Module,
    training_tensors: tuple[torch.Tensor, ...],
    training_rows: Sequence[Mapping[str, Any]],
    execution_plan: Mapping[str, Any],
    terminal: Mapping[str, Any],
    metadata_manifest: Mapping[str, Any],
    cpu_runtime: Mapping[str, Any],
) -> dict[str, Any]:
    board, hands, targets, _cps, buckets = training_tensors
    generator = torch.Generator(device="cpu").manual_seed(SEED)
    selected = torch.randperm(int(targets.shape[0]), generator=generator)[:BATCH]
    selected_ids = [
        str(training_rows[int(index)]["child_position_id"])
        for index in selected.tolist()
    ]
    selected_digest = hashlib.sha256(
        ("\n".join(selected_ids) + "\n").encode("ascii")
    ).hexdigest()
    runs: list[dict[str, Any]] = []
    for _run_index in range(2):
        probe_model = copy.deepcopy(model).to("cpu")
        before = _model_parameter_sha256(probe_model)
        probe_model.train()
        outputs = probe_model(
            board[selected],
            hands[selected],
            buckets[selected],
        )
        if not bool(torch.isfinite(outputs).all().item()):
            raise DirectTeacherV3CpuTrainingError(
                "capability probe output is non-finite"
            )
        loss = V2.direct_scalar_bce(outputs, targets[selected])
        if not bool(torch.isfinite(loss).item()):
            raise DirectTeacherV3CpuTrainingError("capability probe loss is non-finite")
        loss.backward()
        gradient_sha256 = _gradient_sha256(probe_model)
        after = _model_parameter_sha256(probe_model)
        if after != before:
            raise DirectTeacherV3CpuTrainingError(
                "capability probe changed parameters without an optimizer"
            )
        runs.append(
            {
                "output_sha256": _tensor_sha256(outputs),
                "gradient_sha256": gradient_sha256,
                "parameter_sha256_before": before,
                "parameter_sha256_after": after,
                "finite_forward": True,
                "finite_loss": True,
                "finite_all_parameter_gradients": True,
            }
        )
        del probe_model, outputs, loss
    if (
        runs[0]["output_sha256"] != runs[1]["output_sha256"]
        or runs[0]["gradient_sha256"] != runs[1]["gradient_sha256"]
    ):
        raise DirectTeacherV3CpuTrainingError(
            "capability probe is not two-run deterministic"
        )
    return {
        "schema": PROBE_SCHEMA,
        "status": "passed-real-cpu-forward-backward-before-claim",
        "execution_plan": dict(execution_plan),
        "predecessor_terminal": dict(terminal),
        "metadata_manifest": dict(metadata_manifest),
        "cpu_execution": dict(cpu_runtime),
        "selection": {
            "seed": SEED,
            "rows": BATCH,
            "child_position_ids_sha256": selected_digest,
        },
        "runs": runs,
        "optimizer_created": False,
        "parameter_step": False,
        "strength_metric_observed": False,
        "live_weight_write_authorized": False,
    }


def validate_capability_probe(
    value: Any,
    *,
    execution_plan: Mapping[str, Any],
    terminal: Mapping[str, Any],
    metadata_manifest: Mapping[str, Any],
) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "execution_plan",
        "predecessor_terminal",
        "metadata_manifest",
        "cpu_execution",
        "selection",
        "runs",
        "optimizer_created",
        "parameter_step",
        "strength_metric_observed",
        "live_weight_write_authorized",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherV3CpuTrainingError("v3 capability probe fields differ")
    if (
        value["schema"] != PROBE_SCHEMA
        or value["status"] != "passed-real-cpu-forward-backward-before-claim"
        or value["execution_plan"] != dict(execution_plan)
        or value["predecessor_terminal"] != dict(terminal)
        or value["metadata_manifest"] != dict(metadata_manifest)
        or value["cpu_execution"]
        != {**copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION), "verified": True}
        or value["optimizer_created"] is not False
        or value["parameter_step"] is not False
        or value["strength_metric_observed"] is not False
        or value["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherV3CpuTrainingError(
            "v3 capability probe binding/authority differs"
        )
    selection = value["selection"]
    if (
        type(selection) is not dict
        or set(selection) != {"seed", "rows", "child_position_ids_sha256"}
        or selection["seed"] != SEED
        or selection["rows"] != BATCH
        or type(selection["child_position_ids_sha256"]) is not str
        or PROTOCOL.SHA256_RE.fullmatch(selection["child_position_ids_sha256"]) is None
    ):
        raise DirectTeacherV3CpuTrainingError("v3 capability probe selection differs")
    runs = value["runs"]
    run_keys = {
        "output_sha256",
        "gradient_sha256",
        "parameter_sha256_before",
        "parameter_sha256_after",
        "finite_forward",
        "finite_loss",
        "finite_all_parameter_gradients",
    }
    if type(runs) is not list or len(runs) != 2:
        raise DirectTeacherV3CpuTrainingError("v3 capability probe run count differs")
    for run in runs:
        if (
            type(run) is not dict
            or set(run) != run_keys
            or any(
                type(run[field]) is not str
                or PROTOCOL.SHA256_RE.fullmatch(run[field]) is None
                for field in (
                    "output_sha256",
                    "gradient_sha256",
                    "parameter_sha256_before",
                    "parameter_sha256_after",
                )
            )
            or run["parameter_sha256_before"] != run["parameter_sha256_after"]
            or run["finite_forward"] is not True
            or run["finite_loss"] is not True
            or run["finite_all_parameter_gradients"] is not True
        ):
            raise DirectTeacherV3CpuTrainingError("v3 capability probe run differs")
    if (
        runs[0]["output_sha256"] != runs[1]["output_sha256"]
        or runs[0]["gradient_sha256"] != runs[1]["gradient_sha256"]
        or runs[0]["parameter_sha256_before"] != runs[1]["parameter_sha256_before"]
    ):
        raise DirectTeacherV3CpuTrainingError(
            "v3 capability probe two-run hashes differ"
        )
    return copy.deepcopy(value)


def _secure_external_root(path: str) -> str:
    requested = os.path.abspath(path)
    if os.path.islink(requested):
        raise DirectTeacherV3CpuTrainingError("external root must not be a symlink")
    root = os.path.realpath(requested)
    created = False
    try:
        os.mkdir(root, 0o700)
        created = True
    except FileExistsError:
        pass
    info = os.lstat(root)
    if (
        not os.path.isdir(root)
        or os.path.islink(root)
        or info.st_uid != os.getuid()
        or info.st_mode & 0o777 != 0o700
    ):
        raise DirectTeacherV3CpuTrainingError(
            "external root must be an owned non-symlink 0700 directory"
        )
    if created:
        parent = os.open(os.path.dirname(root), os.O_RDONLY)
        try:
            os.fsync(parent)
        finally:
            os.close(parent)
    return root


def _publish_or_validate_probe(
    receipt: Mapping[str, Any], *, path: str
) -> dict[str, Any]:
    if os.path.lexists(path):
        observed, identity = PROTOCOL.load_strict_json_file(
            path, "existing v3 CPU capability probe"
        )
        if observed != receipt:
            raise DirectTeacherV3CpuTrainingError("existing capability probe differs")
        return {**identity, "schema": PROBE_SCHEMA}
    try:
        identity = V2._canonical_create_only(path, receipt)
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error
    return {**identity, "schema": PROBE_SCHEMA}


def _claim_document(
    *,
    execution_plan: Mapping[str, Any],
    terminal: Mapping[str, Any],
    metadata_manifest: Mapping[str, Any],
    capability_probe: Mapping[str, Any],
    cpu_runtime: Mapping[str, Any],
    implementation: Mapping[str, Any],
    output_path: str,
) -> dict[str, Any]:
    return {
        "schema": CLAIM_SCHEMA,
        "status": CLAIM_STATUS,
        "owner": {
            "kind": "direct-teacher-halfkp81-v3-cpu-one-shot-trainer",
            "pid": os.getpid(),
            "pipeline_revision": implementation["source_revision"],
        },
        "execution_plan": dict(execution_plan),
        "predecessor_terminal": dict(terminal),
        "metadata_manifest": dict(metadata_manifest),
        "capability_probe": dict(capability_probe),
        "cpu_execution": dict(cpu_runtime),
        "output_path": os.path.realpath(output_path),
        "optimizer_creation_authorized": True,
        "additional_run_authorized": False,
        "live_weight_write_authorized": False,
    }


def acquire_one_shot_claim(document: Mapping[str, Any], *, path: str) -> dict[str, Any]:
    if os.path.lexists(path):
        raise DirectTeacherV3CpuTrainingError(
            "v3 CPU execution plan already has a one-shot claim; rerun refused"
        )
    try:
        identity = V2._canonical_create_only(path, document)
    except V2.DirectTeacherTrainingError as error:
        if os.path.lexists(path):
            raise DirectTeacherV3CpuTrainingError(
                "v3 CPU execution plan already has a one-shot claim; rerun refused"
            ) from error
        raise DirectTeacherV3CpuTrainingError(str(error)) from error
    return {
        "identity": {**identity, "schema": CLAIM_SCHEMA},
        **{
            key: copy.deepcopy(value)
            for key, value in document.items()
            if key != "schema"
        },
    }


def reauthenticate_claim(
    value: Mapping[str, Any],
    *,
    execution_plan: Mapping[str, Any] | None = None,
    terminal: Mapping[str, Any] | None = None,
    metadata_manifest: Mapping[str, Any] | None = None,
    capability_probe: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    expected_keys = {
        "identity",
        "status",
        "owner",
        "execution_plan",
        "predecessor_terminal",
        "metadata_manifest",
        "capability_probe",
        "cpu_execution",
        "output_path",
        "optimizer_creation_authorized",
        "additional_run_authorized",
        "live_weight_write_authorized",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherV3CpuTrainingError("v3 claim receipt fields differ")
    identity = _validate_public_identity(
        value["identity"], label="v3 CPU one-shot claim", schema=CLAIM_SCHEMA
    )
    _validate_public_identity(
        value["execution_plan"],
        label="claimed v3 execution plan",
        schema=PROTOCOL.EXECUTION_PLAN_SCHEMA,
    )
    _validate_public_identity(
        value["predecessor_terminal"],
        label="claimed v2 terminal",
        schema=PROTOCOL.TERMINAL_SCHEMA,
    )
    _validate_public_identity(
        value["metadata_manifest"],
        label="claimed v3 metadata manifest",
        schema=PROTOCOL.MANIFEST_SCHEMA,
    )
    _validate_public_identity(
        value["capability_probe"],
        label="claimed v3 capability probe",
        schema=PROBE_SCHEMA,
    )
    observed, observed_identity = PROTOCOL.load_strict_json_file(
        identity["path"], "v3 CPU one-shot claim"
    )
    expected_document = {
        "schema": CLAIM_SCHEMA,
        **{key: value[key] for key in value if key != "identity"},
    }
    if (
        observed != expected_document
        or any(
            observed_identity[field] != identity[field]
            for field in ("path", "bytes", "sha256")
        )
        or value["status"] != CLAIM_STATUS
        or value["optimizer_creation_authorized"] is not True
        or value["additional_run_authorized"] is not False
        or value["live_weight_write_authorized"] is not False
        or value["cpu_execution"]
        != {**copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION), "verified": True}
    ):
        raise DirectTeacherV3CpuTrainingError("v3 one-shot claim changed")
    owner = value["owner"]
    if (
        type(owner) is not dict
        or set(owner) != {"kind", "pid", "pipeline_revision"}
        or owner["kind"] != "direct-teacher-halfkp81-v3-cpu-one-shot-trainer"
        or type(owner["pid"]) is not int
        or owner["pid"] <= 0
        or type(owner["pipeline_revision"]) is not str
        or PROTOCOL.REVISION_RE.fullmatch(owner["pipeline_revision"]) is None
        or type(value["output_path"]) is not str
        or not os.path.isabs(value["output_path"])
    ):
        raise DirectTeacherV3CpuTrainingError("v3 one-shot claim owner/output differs")
    for observed_binding, expected_binding, label in (
        (value["execution_plan"], execution_plan, "execution plan"),
        (value["predecessor_terminal"], terminal, "terminal"),
        (value["metadata_manifest"], metadata_manifest, "metadata manifest"),
        (value["capability_probe"], capability_probe, "capability probe"),
    ):
        if expected_binding is not None and observed_binding != dict(expected_binding):
            raise DirectTeacherV3CpuTrainingError(f"v3 claim {label} binding differs")
    return copy.deepcopy(value)


def train_exactly_one_epoch(
    model: torch.nn.Module,
    tensors: tuple[torch.Tensor, ...],
    *,
    claim: Mapping[str, Any],
) -> dict[str, Any]:
    reauthenticate_claim(claim)
    parameters = tuple(model.parameters())
    if any(not parameter.requires_grad for parameter in parameters):
        raise DirectTeacherV3CpuTrainingError("all parameters must be trainable")
    optimizer = torch.optim.AdamW(
        parameters, lr=LEARNING_RATE, weight_decay=WEIGHT_DECAY
    )
    if {
        id(parameter)
        for group in optimizer.param_groups
        for parameter in group["params"]
    } != {id(parameter) for parameter in parameters}:
        raise DirectTeacherV3CpuTrainingError("optimizer parameter scope differs")
    board, hands, targets, _cps, buckets = tensors
    order = torch.randperm(
        int(targets.shape[0]),
        generator=torch.Generator(device="cpu").manual_seed(SEED),
    )
    model.train()
    consumed = 0
    loss_sum = 0.0
    started = time.monotonic()
    for start in range(0, int(targets.shape[0]), BATCH):
        selected = order[start : start + BATCH]
        logits = model(board[selected], hands[selected], buckets[selected])
        loss = V2.direct_scalar_bce(logits, targets[selected])
        if not bool(torch.isfinite(loss).item()):
            raise DirectTeacherV3CpuTrainingError("training loss is non-finite")
        optimizer.zero_grad(set_to_none=True)
        loss.backward()
        for name, parameter in model.named_parameters():
            if parameter.grad is None or not bool(
                torch.isfinite(parameter.grad).all().item()
            ):
                raise DirectTeacherV3CpuTrainingError(
                    f"training gradient missing/non-finite: {name}"
                )
        optimizer.step()
        rows = int(selected.shape[0])
        consumed += rows
        loss_sum += float(loss.item()) * rows
    if consumed != int(targets.shape[0]):
        raise DirectTeacherV3CpuTrainingError("epoch row consumption differs")
    train.require_finite_model_parameters(model, "v3 CPU epoch 1 final")
    return {
        "epoch": 1,
        "rows": consumed,
        "direct_scalar_bce": loss_sum / consumed,
        "seconds": time.monotonic() - started,
        "optimizer": "AdamW",
        "scheduler": "constant-none",
        "learning_rate": LEARNING_RATE,
        "weight_decay": WEIGHT_DECAY,
        "batch": BATCH,
        "seed": SEED,
        "parameter_scope": "all",
        "device": "cpu",
    }


def build_static_result(
    *,
    protocol: Mapping[str, Any],
    execution_plan: Mapping[str, Any],
    terminal: Mapping[str, Any],
    metadata_manifest: Mapping[str, Any],
    capability_probe: Mapping[str, Any],
    claim: Mapping[str, Any],
    initializer: Mapping[str, Any],
    live_weights: Mapping[str, Any],
    trainer_result: Mapping[str, Any],
    candidate_weights: Mapping[str, Any],
    runtime_sanity: Mapping[str, Any],
    baseline_metrics: Mapping[str, Any],
    candidate_metrics: Mapping[str, Any],
    initializer_quantization: Mapping[str, float],
    candidate_quantization: Mapping[str, float],
    runtime_receipt: Mapping[str, Any],
    export_roundtrip_mismatches: int,
) -> dict[str, Any]:
    contract = V2_PROTOCOL.EXPECTED_STATIC_SANITY["checks"]
    mae_improvement = float(baseline_metrics["teacher_mae_cp"]) - float(
        candidate_metrics["teacher_mae_cp"]
    )
    pair_delta = float(candidate_metrics["pair_accuracy"]) - float(
        baseline_metrics["pair_accuracy"]
    )
    mean_ratio = V2.safe_ratio(
        candidate_quantization["mean_abs_cp_delta"],
        initializer_quantization["mean_abs_cp_delta"],
    )
    max_ratio = V2.safe_ratio(
        candidate_quantization["max_abs_cp_delta"],
        initializer_quantization["max_abs_cp_delta"],
    )
    runtime_slowdown = max(
        float(runtime_receipt["throughput"]["median_slowdown_percent"]),
        float(runtime_receipt["throughput"]["aggregate_slowdown_percent"]),
    )
    observed = {
        "finite_training_and_inference": True,
        "technical_faults_maximum": int(runtime_receipt["technical_faults"]),
        "float_export_roundtrip_mismatches_maximum": export_roundtrip_mismatches,
        "wasm_parity_mismatches_maximum": int(runtime_receipt["parity"]["mismatches"]),
        "teacher_mae_cp_improvement_minimum": mae_improvement,
        "pair_accuracy_delta_minimum": pair_delta,
        "quantized_mean_abs_cp_delta_ratio_maximum": mean_ratio,
        "quantized_max_abs_cp_delta_ratio_maximum": max_ratio,
        "research_runtime_search_slowdown_percent_maximum": runtime_slowdown,
    }
    checks: dict[str, Any] = {}
    for name, requirement in contract.items():
        value = observed[name]
        passed = (
            value is True
            if name == "finite_training_and_inference"
            else value >= requirement
            if name
            in {
                "teacher_mae_cp_improvement_minimum",
                "pair_accuracy_delta_minimum",
            }
            else value <= requirement
        )
        checks[name] = {
            "observed": value,
            "requirement": requirement,
            "passed": bool(passed),
        }
    all_passed = all(item["passed"] for item in checks.values())
    return {
        "schema": STATIC_RESULT_SCHEMA,
        "status": (
            "passed-all-checks-paired56-authorized"
            if all_passed
            else "failed-one-or-more-checks-v3-cpu-family-closed"
        ),
        "protocol": dict(protocol),
        "execution_plan": dict(execution_plan),
        "predecessor_terminal": dict(terminal),
        "metadata_manifest": dict(metadata_manifest),
        "capability_probe": dict(capability_probe),
        "one_shot_claim": copy.deepcopy(claim),
        "initializer": dict(initializer),
        "live_weights": dict(live_weights),
        "trainer_result": dict(trainer_result),
        "candidate_weights": dict(candidate_weights),
        "runtime_sanity": dict(runtime_sanity),
        "checks": checks,
        "all_checks_passed": all_passed,
        "technical_faults": int(runtime_receipt["technical_faults"]),
        "paired56_authorized": all_passed,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }


def validate_static_result(
    value: Any, *, repo_root: str | None = None
) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "protocol",
        "execution_plan",
        "predecessor_terminal",
        "metadata_manifest",
        "capability_probe",
        "one_shot_claim",
        "initializer",
        "live_weights",
        "trainer_result",
        "candidate_weights",
        "runtime_sanity",
        "checks",
        "all_checks_passed",
        "technical_faults",
        "paired56_authorized",
        "expanded_stage_authorized",
        "live_weight_write_authorized",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise DirectTeacherV3CpuTrainingError("v3 static result fields differ")
    if value["schema"] != STATIC_RESULT_SCHEMA:
        raise DirectTeacherV3CpuTrainingError("v3 static result schema differs")

    protocol_raw, protocol_identity = _load_matching_json_identity(
        value["protocol"],
        label="v3 static protocol",
        schema=PROTOCOL.PROTOCOL_SCHEMA,
    )
    protocol = PROTOCOL.validate_protocol_document(protocol_raw)
    terminal_raw, terminal_identity = _load_matching_json_identity(
        value["predecessor_terminal"],
        label="v3 static predecessor terminal",
        schema=PROTOCOL.TERMINAL_SCHEMA,
    )
    PROTOCOL.verify_terminal_evidence(terminal_raw, protocol=protocol)
    manifest_raw, manifest_identity = _load_matching_json_identity(
        value["metadata_manifest"],
        label="v3 static metadata manifest",
        schema=PROTOCOL.MANIFEST_SCHEMA,
    )
    PROTOCOL.validate_metadata_manifest(
        manifest_raw,
        protocol=protocol,
        protocol_identity=protocol_identity,
        terminal_identity=terminal_identity,
    )
    plan_raw, plan_identity = _load_matching_json_identity(
        value["execution_plan"],
        label="v3 static execution plan",
        schema=PROTOCOL.EXECUTION_PLAN_SCHEMA,
    )
    plan = PROTOCOL.validate_execution_plan(plan_raw)
    rebuilt_plan = PLAN.build_execution_plan(
        protocol_path=value["protocol"]["path"],
        metadata_manifest_path=value["metadata_manifest"]["path"],
        repo_root=(
            os.path.realpath(repo_root)
            if repo_root is not None
            else os.path.realpath(os.path.join(os.path.dirname(__file__), ".."))
        ),
    )
    if rebuilt_plan != plan:
        raise DirectTeacherV3CpuTrainingError(
            "v3 static execution plan differs from reconstruction"
        )
    for observed, expected, label in (
        (plan["protocol"], value["protocol"], "protocol"),
        (
            plan["predecessor_terminal"],
            value["predecessor_terminal"],
            "terminal",
        ),
        (
            plan["metadata_manifest"],
            value["metadata_manifest"],
            "metadata manifest",
        ),
    ):
        if observed != expected:
            raise DirectTeacherV3CpuTrainingError(
                f"v3 static {label} plan binding differs"
            )

    probe_raw, _probe_file_identity = _load_matching_json_identity(
        value["capability_probe"],
        label="v3 static capability probe",
        schema=PROBE_SCHEMA,
    )
    validate_capability_probe(
        probe_raw,
        execution_plan=value["execution_plan"],
        terminal=value["predecessor_terminal"],
        metadata_manifest=value["metadata_manifest"],
    )
    claim = reauthenticate_claim(
        value["one_shot_claim"],
        execution_plan=value["execution_plan"],
        terminal=value["predecessor_terminal"],
        metadata_manifest=value["metadata_manifest"],
        capability_probe=value["capability_probe"],
    )

    initializer = _reauthenticate_plain_file_identity(
        value["initializer"], label="v3 static initializer"
    )
    live_weights = _reauthenticate_plain_file_identity(
        value["live_weights"], label="v3 static live weights"
    )
    for observed, expected, label in (
        (initializer, plan["inputs"]["initializer"], "initializer"),
        (live_weights, plan["inputs"]["live_weights"], "live weights"),
    ):
        _exact_identity(observed, expected, label)
        if observed["path"] != expected["path"]:
            raise DirectTeacherV3CpuTrainingError(f"{label} path differs")

    trainer_raw, _trainer_file_identity = _load_matching_json_identity(
        value["trainer_result"],
        label="v3 static trainer result",
        schema=TRAINER_RESULT_SCHEMA,
    )
    trainer_keys = {
        "schema",
        "status",
        "implementation",
        "execution_plan",
        "predecessor_terminal",
        "metadata_manifest",
        "capability_probe",
        "one_shot_claim",
        "cpu_execution",
        "training",
        "epochs_completed",
        "candidate_count",
        "checkpoint_selection",
        "best_checkpoint_selection",
        "additional_epoch_or_seed",
        "metrics",
        "artifacts",
        "export_roundtrip_mismatches",
        "live_weights",
        "paired56_authorized",
        "expanded_stage_authorized",
        "live_weight_write_authorized",
    }
    if type(trainer_raw) is not dict or set(trainer_raw) != trainer_keys:
        raise DirectTeacherV3CpuTrainingError("v3 trainer result fields differ")
    if (
        trainer_raw["status"] != "complete-final-epoch-frozen-static-pending"
        or trainer_raw["execution_plan"] != value["execution_plan"]
        or trainer_raw["predecessor_terminal"] != value["predecessor_terminal"]
        or trainer_raw["metadata_manifest"] != value["metadata_manifest"]
        or trainer_raw["capability_probe"] != value["capability_probe"]
        or trainer_raw["one_shot_claim"] != claim
        or trainer_raw["cpu_execution"]
        != {**copy.deepcopy(PROTOCOL.EXPECTED_CPU_EXECUTION), "verified": True}
        or trainer_raw["epochs_completed"] != 1
        or trainer_raw["candidate_count"] != 1
        or trainer_raw["checkpoint_selection"] != "final-epoch-1-only"
        or trainer_raw["best_checkpoint_selection"] is not False
        or trainer_raw["additional_epoch_or_seed"] is not False
        or trainer_raw["paired56_authorized"] is not False
        or trainer_raw["expanded_stage_authorized"] is not False
        or trainer_raw["live_weight_write_authorized"] is not False
    ):
        raise DirectTeacherV3CpuTrainingError(
            "v3 trainer result binding/authority differs"
        )
    implementation = trainer_raw["implementation"]
    if (
        type(implementation) is not dict
        or implementation.get("tracked_tree_clean") is not True
        or type(implementation.get("source_revision")) is not str
        or PROTOCOL.REVISION_RE.fullmatch(implementation["source_revision"]) is None
        or implementation["source_revision"] != claim["owner"]["pipeline_revision"]
    ):
        raise DirectTeacherV3CpuTrainingError(
            "v3 trainer implementation binding differs"
        )
    training = trainer_raw["training"]
    expected_training_keys = {
        "epoch",
        "rows",
        "direct_scalar_bce",
        "seconds",
        "optimizer",
        "scheduler",
        "learning_rate",
        "weight_decay",
        "batch",
        "seed",
        "parameter_scope",
        "device",
    }
    if (
        type(training) is not dict
        or set(training) != expected_training_keys
        or training["epoch"] != 1
        or training["rows"] != plan["inputs"]["training_dataset"]["rows"]
        or type(training["direct_scalar_bce"]) not in (int, float)
        or not math.isfinite(float(training["direct_scalar_bce"]))
        or type(training["seconds"]) not in (int, float)
        or not math.isfinite(float(training["seconds"]))
        or float(training["seconds"]) <= 0
        or training["optimizer"] != "AdamW"
        or training["scheduler"] != "constant-none"
        or training["learning_rate"] != LEARNING_RATE
        or training["weight_decay"] != WEIGHT_DECAY
        or training["batch"] != BATCH
        or training["seed"] != SEED
        or training["parameter_scope"] != "all"
        or training["device"] != "cpu"
    ):
        raise DirectTeacherV3CpuTrainingError("v3 training receipt differs")
    metrics = trainer_raw["metrics"]
    if type(metrics) is not dict or set(metrics) != {
        "initializer",
        "candidate",
        "initializer_quantization",
        "candidate_quantization",
    }:
        raise DirectTeacherV3CpuTrainingError("v3 trainer metrics differ")
    for role in ("initializer", "candidate"):
        metric = metrics[role]
        if (
            type(metric) is not dict
            or metric.get("rows") != plan["inputs"]["validation_dataset"]["rows"]
            or any(
                type(metric.get(field)) not in (int, float)
                or not math.isfinite(float(metric[field]))
                for field in (
                    "direct_scalar_bce",
                    "teacher_mae_cp",
                    "pair_accuracy",
                )
            )
        ):
            raise DirectTeacherV3CpuTrainingError(f"v3 {role} metrics differ")
    for role in ("initializer_quantization", "candidate_quantization"):
        metric = metrics[role]
        if (
            type(metric) is not dict
            or set(metric) != {"mean_abs_cp_delta", "max_abs_cp_delta"}
            or any(
                type(metric[field]) not in (int, float)
                or not math.isfinite(float(metric[field]))
                or float(metric[field]) < 0
                for field in metric
            )
        ):
            raise DirectTeacherV3CpuTrainingError(f"v3 {role} metrics differ")
    mismatches = trainer_raw["export_roundtrip_mismatches"]
    if type(mismatches) is not int or mismatches < 0:
        raise DirectTeacherV3CpuTrainingError(
            "v3 export roundtrip mismatch count differs"
        )

    artifacts = trainer_raw["artifacts"]
    if type(artifacts) is not dict or set(artifacts) != {
        "final_checkpoint",
        "initializer_weights",
        "candidate_weights",
        "candidate_reference",
    }:
        raise DirectTeacherV3CpuTrainingError("v3 trainer artifacts differ")
    final_checkpoint = _validate_public_identity(
        artifacts["final_checkpoint"],
        label="v3 final checkpoint",
        schema=CHECKPOINT_SCHEMA,
    )
    _exact_identity(
        _identity(final_checkpoint["path"], "v3 final checkpoint"),
        final_checkpoint,
        "v3 final checkpoint",
    )
    initializer_weights = _reauthenticate_plain_file_identity(
        artifacts["initializer_weights"],
        label="v3 exported initializer weights",
        buckets=BUCKETS,
    )
    candidate_weights = _reauthenticate_plain_file_identity(
        artifacts["candidate_weights"],
        label="v3 candidate weights",
        buckets=BUCKETS,
    )
    if candidate_weights != value["candidate_weights"]:
        raise DirectTeacherV3CpuTrainingError(
            "v3 static candidate/trainer binding differs"
        )
    candidate_reference = artifacts["candidate_reference"]
    if (
        type(candidate_reference) is not dict
        or set(candidate_reference)
        != {"path", "bytes", "sha256", "schema", "positions"}
        or candidate_reference["schema"] != V2.REFERENCE_SCHEMA
        or type(candidate_reference["positions"]) is not int
        or candidate_reference["positions"] < 1
    ):
        raise DirectTeacherV3CpuTrainingError("v3 candidate reference identity differs")
    reference_raw, reference_identity = PROTOCOL.load_strict_json_file(
        candidate_reference["path"], "v3 candidate reference"
    )
    if (
        type(reference_raw) is not dict
        or any(
            reference_identity[field] != candidate_reference[field]
            for field in ("path", "bytes", "sha256")
        )
        or reference_raw.get("schema") != V2.REFERENCE_SCHEMA
    ):
        raise DirectTeacherV3CpuTrainingError("v3 candidate reference bytes differ")
    if reference_raw.get("n") != candidate_reference["positions"]:
        raise DirectTeacherV3CpuTrainingError("v3 candidate reference count differs")

    trainer_live = trainer_raw["live_weights"]
    if (
        type(trainer_live) is not dict
        or set(trainer_live) != {"before", "after", "byte_exact_unchanged"}
        or trainer_live["before"] != live_weights
        or trainer_live["after"] != live_weights
        or trainer_live["byte_exact_unchanged"] is not True
    ):
        raise DirectTeacherV3CpuTrainingError("v3 trainer live-weight binding differs")

    runtime_raw, runtime_identity = _load_matching_json_identity(
        value["runtime_sanity"],
        label="v3 static runtime sanity",
        schema=V2.RUNTIME_SCHEMA,
    )
    wasm_identity = _identity(plan["inputs"]["runtime_wasm"]["path"], "v3 runtime WASM")
    _exact_identity(wasm_identity, plan["inputs"]["runtime_wasm"], "v3 runtime WASM")
    try:
        runtime_receipt = V2.validate_runtime_receipt(
            runtime_raw,
            initializer_weights=initializer_weights,
            candidate_weights=candidate_weights,
            reference=reference_raw,
            reference_identity=reference_identity,
            wasm_identity=wasm_identity,
        )
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error

    contract = V2_PROTOCOL.EXPECTED_STATIC_SANITY["checks"]
    checks = value["checks"]
    if type(checks) is not dict or set(checks) != set(contract):
        raise DirectTeacherV3CpuTrainingError("v3 static check set differs")
    for name, requirement in contract.items():
        item = checks[name]
        if (
            type(item) is not dict
            or set(item) != {"observed", "requirement", "passed"}
            or item["requirement"] != requirement
            or type(item["passed"]) is not bool
        ):
            raise DirectTeacherV3CpuTrainingError(
                f"v3 static check fields differ: {name}"
            )
        observed = item["observed"]
        if name == "finite_training_and_inference":
            expected_pass = observed is True
        else:
            if (
                type(observed) not in (int, float)
                or type(observed) is bool
                or not math.isfinite(float(observed))
            ):
                raise DirectTeacherV3CpuTrainingError(
                    f"v3 static observation is invalid: {name}"
                )
            expected_pass = (
                observed >= requirement
                if name
                in {
                    "teacher_mae_cp_improvement_minimum",
                    "pair_accuracy_delta_minimum",
                }
                else observed <= requirement
            )
        if item["passed"] is not expected_pass:
            raise DirectTeacherV3CpuTrainingError(
                f"v3 static pass flag contradicts observation: {name}"
            )
    all_passed = all(item["passed"] for item in checks.values())
    if (
        value["all_checks_passed"] is not all_passed
        or value["paired56_authorized"] is not all_passed
        or value["expanded_stage_authorized"] is not False
        or value["live_weight_write_authorized"] is not False
        or value["technical_faults"] != checks["technical_faults_maximum"]["observed"]
    ):
        raise DirectTeacherV3CpuTrainingError("v3 static authority contradicts checks")
    expected_status = (
        "passed-all-checks-paired56-authorized"
        if all_passed
        else "failed-one-or-more-checks-v3-cpu-family-closed"
    )
    if value["status"] != expected_status:
        raise DirectTeacherV3CpuTrainingError("v3 static status contradicts checks")
    rebuilt_static = build_static_result(
        protocol=value["protocol"],
        execution_plan=value["execution_plan"],
        terminal=value["predecessor_terminal"],
        metadata_manifest=value["metadata_manifest"],
        capability_probe=value["capability_probe"],
        claim=claim,
        initializer=initializer,
        live_weights=live_weights,
        trainer_result=value["trainer_result"],
        candidate_weights=candidate_weights,
        runtime_sanity={
            **runtime_identity,
            "schema": V2.RUNTIME_SCHEMA,
        },
        baseline_metrics=metrics["initializer"],
        candidate_metrics=metrics["candidate"],
        initializer_quantization=metrics["initializer_quantization"],
        candidate_quantization=metrics["candidate_quantization"],
        runtime_receipt=runtime_receipt,
        export_roundtrip_mismatches=mismatches,
    )
    if rebuilt_static != value:
        raise DirectTeacherV3CpuTrainingError(
            "v3 static result differs from authenticated reconstruction"
        )
    return copy.deepcopy(value)


def _external_run_root(metadata_manifest_path: str) -> str:
    return os.path.dirname(os.path.dirname(os.path.realpath(metadata_manifest_path)))


def preflight_output_slot(path: str) -> str:
    requested = os.path.abspath(path)
    if os.path.lexists(requested):
        raise DirectTeacherV3CpuTrainingError("v3 output slot already exists")
    requested_parent = os.path.dirname(requested)
    if os.path.islink(requested_parent):
        raise DirectTeacherV3CpuTrainingError("v3 output parent must not be a symlink")
    parent = os.path.realpath(requested_parent)
    try:
        info = os.lstat(parent)
    except FileNotFoundError as error:
        raise DirectTeacherV3CpuTrainingError(
            "v3 output parent does not exist"
        ) from error
    if (
        not os.path.isdir(parent)
        or os.path.islink(parent)
        or info.st_uid != os.getuid()
        or not os.access(parent, os.W_OK | os.X_OK)
    ):
        raise DirectTeacherV3CpuTrainingError(
            "v3 output parent must be an owned writable non-symlink directory"
        )
    temporary = tempfile.mkdtemp(
        dir=parent, prefix=".direct-teacher-halfkp81-v3-cpu-output-preflight-"
    )
    try:
        temporary_info = os.lstat(temporary)
        if (
            not os.path.isdir(temporary)
            or os.path.islink(temporary)
            or temporary_info.st_uid != os.getuid()
            or temporary_info.st_mode & 0o777 != 0o700
        ):
            raise DirectTeacherV3CpuTrainingError(
                "v3 output parent cannot create a private directory"
            )
        parent_descriptor = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(parent_descriptor)
        finally:
            os.close(parent_descriptor)
    finally:
        os.rmdir(temporary)
        parent_descriptor = os.open(parent, os.O_RDONLY)
        try:
            os.fsync(parent_descriptor)
        finally:
            os.close(parent_descriptor)
    if os.path.lexists(requested):
        raise DirectTeacherV3CpuTrainingError(
            "v3 output slot appeared during parent preflight"
        )
    return os.path.realpath(requested)


def run(
    args: argparse.Namespace,
    *,
    allow_host_override_for_tests: bool = False,
    runtime_runner=subprocess.run,
) -> dict[str, Any]:
    repo_root = os.path.realpath(args.repo_root)
    plan, plan_identity, protocol, manifest = load_and_rebuild_execution_plan(
        args.execution_plan, repo_root=repo_root
    )
    validate_fixed_contract(plan)
    implementation = train.verify_training_pipeline_revision(args.pipeline_revision)
    cpu_runtime = configure_and_verify_cpu_runtime(
        allow_host_override_for_tests=allow_host_override_for_tests
    )

    execution_plan_receipt = {
        **plan_identity,
        "schema": PROTOCOL.EXECUTION_PLAN_SCHEMA,
    }
    terminal_raw, terminal_identity = PROTOCOL.load_strict_json_file(
        plan["predecessor_terminal"]["path"], "v2 terminal result"
    )
    terminal = PROTOCOL.verify_terminal_evidence(terminal_raw, protocol=protocol)
    terminal_receipt = {
        **terminal_identity,
        "schema": PROTOCOL.TERMINAL_SCHEMA,
    }
    if terminal_receipt != plan["predecessor_terminal"]:
        raise DirectTeacherV3CpuTrainingError(
            "v2 terminal identity differs from v3 execution plan"
        )
    manifest_receipt = {
        **_identity(plan["metadata_manifest"]["path"], "v3 metadata manifest"),
        "schema": PROTOCOL.MANIFEST_SCHEMA,
    }
    if manifest_receipt != plan["metadata_manifest"]:
        raise DirectTeacherV3CpuTrainingError(
            "v3 metadata manifest identity differs from execution plan"
        )
    initializer_path = str(plan["inputs"]["initializer"]["path"])
    live_path = str(plan["inputs"]["live_weights"]["path"])
    training_path = str(plan["inputs"]["training_dataset"]["path"])
    validation_path = str(plan["inputs"]["validation_dataset"]["path"])
    wasm_path = os.path.join(repo_root, RUNTIME_WASM)
    runtime_script = os.path.join(repo_root, RUNTIME_SCRIPT)
    input_paths = (
        args.execution_plan,
        str(plan["protocol"]["path"]),
        str(plan["predecessor_terminal"]["path"]),
        str(plan["metadata_manifest"]["path"]),
        initializer_path,
        live_path,
        training_path,
        validation_path,
        wasm_path,
        runtime_script,
    )
    out_path = preflight_output_slot(args.out)
    try:
        V2._assert_path_isolation(out_path, input_paths, live_path)
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error

    live_before = _identity(live_path, "immutable live weights before v3")
    _exact_identity(live_before, plan["inputs"]["live_weights"], "live weights")
    wasm_identity = _identity(wasm_path, "HalfKP81 research WASM")
    _exact_identity(wasm_identity, EXPECTED_RUNTIME_WASM, "runtime WASM")
    _identity(runtime_script, "direct-teacher runtime sanity script")

    try:
        training_tensors, training_rows, training_identity = V2.load_bound_dataset(
            training_path, plan["inputs"]["training_dataset"], role="training"
        )
        validation_tensors, validation_rows, validation_identity = (
            V2.load_bound_dataset(
                validation_path,
                plan["inputs"]["validation_dataset"],
                role="validation",
            )
        )
        dataset_disjointness = V2.require_zero_cross_role_overlap(
            training_rows, validation_rows
        )
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error
    if int(training_tensors[2].shape[0]) < BATCH:
        raise DirectTeacherV3CpuTrainingError(
            "training dataset is smaller than the fixed capability-probe batch"
        )

    torch.manual_seed(SEED)
    random.seed(SEED)
    model = train.DistillNet(FEATURES)
    expected_arch = train.expected_arch(
        features=FEATURES,
        input_dim=model.arch_input_dim,
        h1=train.DistillNet.H1,
        h2=train.DistillNet.H2,
        k=K_SIGMOID,
        kp_buckets=BUCKETS,
    )
    checkpoint, initializer_identity = train.load_stable_torch_checkpoint(
        initializer_path,
        weights_only=True,
        expected_sha256=plan["inputs"]["initializer"]["sha256"],
    )
    _exact_identity(initializer_identity, plan["inputs"]["initializer"], "initializer")
    try:
        train.validate_arch(checkpoint["arch"], expected_arch)
        model.load_state_dict(checkpoint["model"], strict=True)
    except (KeyError, RuntimeError, TypeError, ValueError) as error:
        raise DirectTeacherV3CpuTrainingError(
            "v3 initializer architecture/model mismatch"
        ) from error
    train.require_finite_model_parameters(model, "exact v3 CPU initializer")
    if any(not parameter.requires_grad for parameter in model.parameters()):
        raise DirectTeacherV3CpuTrainingError(
            "v3 initializer is not all-parameter trainable"
        )

    external_root = _external_run_root(plan["metadata_manifest"]["path"])
    probe_root = _secure_external_root(os.path.join(external_root, PROBE_DIRECTORY))
    claim_root = _secure_external_root(os.path.join(external_root, CLAIM_DIRECTORY))
    probe_path = os.path.join(probe_root, f"{plan_identity['sha256']}.json")
    claim_path = os.path.join(claim_root, f"{plan_identity['sha256']}.json")
    capability_probe = run_capability_probe(
        model=model,
        training_tensors=training_tensors,
        training_rows=training_rows,
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
        cpu_runtime=cpu_runtime,
    )
    validate_capability_probe(
        capability_probe,
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
    )
    capability_probe_identity = _publish_or_validate_probe(
        capability_probe, path=probe_path
    )
    observed_probe, _observed_probe_identity = _load_matching_json_identity(
        capability_probe_identity,
        label="published v3 CPU capability probe",
        schema=PROBE_SCHEMA,
    )
    validate_capability_probe(
        observed_probe,
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
    )

    (
        preclaim_plan,
        preclaim_plan_identity,
        preclaim_protocol,
        preclaim_manifest,
    ) = load_and_rebuild_execution_plan(args.execution_plan, repo_root=repo_root)
    if (
        preclaim_plan != plan
        or preclaim_plan_identity != plan_identity
        or preclaim_protocol != protocol
        or preclaim_manifest != manifest
    ):
        raise DirectTeacherV3CpuTrainingError(
            "v3 plan/terminal/manifest tuple changed before claim"
        )
    if preflight_output_slot(out_path) != out_path:
        raise DirectTeacherV3CpuTrainingError(
            "v3 output slot identity changed before claim"
        )

    claim_document = _claim_document(
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
        capability_probe=capability_probe_identity,
        cpu_runtime=cpu_runtime,
        implementation=implementation,
        output_path=out_path,
    )
    claim = acquire_one_shot_claim(claim_document, path=claim_path)
    reauthenticate_claim(
        claim,
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
        capability_probe=capability_probe_identity,
    )
    if terminal["decision"]["old_execution_plan_retry_authorized"] is not False:
        raise DirectTeacherV3CpuTrainingError("old v2 retry boundary changed")

    os.mkdir(out_path, 0o700)
    initializer_weights_path = os.path.join(out_path, "initializer-weights.bin")
    candidate_weights_path = os.path.join(out_path, "candidate-weights.bin")
    checkpoint_path = os.path.join(out_path, "final-epoch-001.pt")
    reference_path = os.path.join(out_path, "candidate-reference.json")
    runtime_path = os.path.join(out_path, "runtime-sanity.json")
    trainer_result_path = os.path.join(out_path, "trainer-result.json")
    static_result_path = os.path.join(out_path, "static-sanity-result.json")

    try:
        initializer_q, initializer_weights = V2.export_quantized_weights(
            model, initializer_weights_path
        )
        baseline_outputs = V2._model_outputs(
            model, validation_tensors, device=torch.device("cpu")
        )
        baseline_metrics = V2.validation_metrics(
            baseline_outputs, validation_tensors, validation_rows
        )
        initializer_out_q, initializer_int_cp = V2.int16_outputs(
            initializer_q, validation_tensors
        )
        initializer_quantization = V2.quantization_metrics(
            baseline_outputs, initializer_int_cp
        )
        del initializer_q, initializer_out_q
        training_receipt = train_exactly_one_epoch(model, training_tensors, claim=claim)
        candidate_outputs = V2._model_outputs(
            model, validation_tensors, device=torch.device("cpu")
        )
        candidate_metrics = V2.validation_metrics(
            candidate_outputs, validation_tensors, validation_rows
        )
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error
    train.require_finite_model_parameters(model, "frozen v3 CPU final epoch")

    final_checkpoint = {
        "schema": CHECKPOINT_SCHEMA,
        "epoch": 1,
        "model": model.state_dict(),
        "arch": expected_arch,
        "training": copy.deepcopy(PROTOCOL.EXPECTED_TRAINING),
        "cpu_execution": copy.deepcopy(cpu_runtime),
        "execution_plan": execution_plan_receipt,
        "predecessor_terminal": terminal_receipt,
        "metadata_manifest": manifest_receipt,
        "capability_probe": capability_probe_identity,
        "one_shot_claim": claim,
        "initializer": {
            **initializer_identity,
            "path": os.path.realpath(initializer_path),
        },
        "datasets": {
            "training": training_identity,
            "validation": validation_identity,
            "cross_role_disjointness": dataset_disjointness,
        },
        "selection": "final-epoch-1-only-no-best-selection",
        "live_weight_write_authorized": False,
    }
    train.atomic_torch_save(final_checkpoint, checkpoint_path)
    final_checkpoint_identity = V2._identity_with_schema(
        checkpoint_path, "v3 final epoch checkpoint", CHECKPOINT_SCHEMA
    )

    try:
        candidate_q, candidate_weights = V2.export_quantized_weights(
            model, candidate_weights_path
        )
        roundtrip_q = V2.read_quantized_weights(candidate_weights_path, model)
        export_roundtrip_mismatches = sum(
            int((candidate_q[name] != roundtrip_q[name]).sum().item())
            for name, _typecode in V2.EXPORT_LAYOUT
        )
        candidate_out_q, candidate_int_cp = V2.int16_outputs(
            roundtrip_q, validation_tensors
        )
        candidate_quantization = V2.quantization_metrics(
            candidate_outputs, candidate_int_cp
        )
        in_memory_out_q = V2.int16_outputs(candidate_q, validation_tensors)[0]
        export_roundtrip_mismatches += int(
            (candidate_out_q != in_memory_out_q).sum().item()
        )
        reference = V2.build_reference(
            rows=validation_rows,
            float_outputs=candidate_outputs,
            out_q=candidate_out_q,
            int_cp=candidate_int_cp,
            candidate_weights=candidate_weights,
        )
        reference_identity = V2._canonical_create_only(reference_path, reference)
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error

    live_after_training = _identity(
        live_path, "immutable live weights after v3 training/export"
    )
    if live_after_training != live_before:
        raise DirectTeacherV3CpuTrainingError(
            "live weights changed during v3 training/export"
        )
    claim = reauthenticate_claim(
        claim,
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
        capability_probe=capability_probe_identity,
    )
    trainer_result = {
        "schema": TRAINER_RESULT_SCHEMA,
        "status": "complete-final-epoch-frozen-static-pending",
        "implementation": implementation,
        "execution_plan": execution_plan_receipt,
        "predecessor_terminal": terminal_receipt,
        "metadata_manifest": manifest_receipt,
        "capability_probe": capability_probe_identity,
        "one_shot_claim": claim,
        "cpu_execution": cpu_runtime,
        "training": training_receipt,
        "epochs_completed": 1,
        "candidate_count": 1,
        "checkpoint_selection": "final-epoch-1-only",
        "best_checkpoint_selection": False,
        "additional_epoch_or_seed": False,
        "metrics": {
            "initializer": baseline_metrics,
            "candidate": candidate_metrics,
            "initializer_quantization": initializer_quantization,
            "candidate_quantization": candidate_quantization,
        },
        "artifacts": {
            "final_checkpoint": final_checkpoint_identity,
            "initializer_weights": initializer_weights,
            "candidate_weights": candidate_weights,
            "candidate_reference": {
                **reference_identity,
                "schema": V2.REFERENCE_SCHEMA,
                "positions": reference["n"],
            },
        },
        "export_roundtrip_mismatches": export_roundtrip_mismatches,
        "live_weights": {
            "before": live_before,
            "after": live_after_training,
            "byte_exact_unchanged": True,
        },
        "paired56_authorized": False,
        "expanded_stage_authorized": False,
        "live_weight_write_authorized": False,
    }
    trainer_result_identity = {
        **V2._canonical_create_only(trainer_result_path, trainer_result),
        "schema": TRAINER_RESULT_SCHEMA,
    }

    command = [
        "node",
        "-r",
        "tsx/cjs",
        runtime_script,
        "--wasm",
        wasm_path,
        "--initializer",
        initializer_weights_path,
        "--candidate",
        candidate_weights_path,
        "--reference",
        reference_path,
        "--out",
        runtime_path,
    ]
    completed = runtime_runner(
        command,
        cwd=repo_root,
        check=False,
        capture_output=True,
        text=True,
    )
    if completed.returncode not in (0, 1) or not os.path.exists(runtime_path):
        raise DirectTeacherV3CpuTrainingError(
            "runtime sanity did not produce a complete pass/fail receipt"
        )
    runtime_raw, runtime_identity = PROTOCOL.load_strict_json_file(
        runtime_path, "v3 runtime sanity receipt"
    )
    try:
        runtime_receipt = V2.validate_runtime_receipt(
            runtime_raw,
            initializer_weights=initializer_weights,
            candidate_weights=candidate_weights,
            reference=reference,
            reference_identity=reference_identity,
            wasm_identity=wasm_identity,
        )
    except V2.DirectTeacherTrainingError as error:
        raise DirectTeacherV3CpuTrainingError(str(error)) from error
    if (completed.returncode == 0) is not (
        runtime_receipt["status"] == "complete-pass"
    ):
        raise DirectTeacherV3CpuTrainingError(
            "runtime exit status contradicts its receipt"
        )

    claim = reauthenticate_claim(
        claim,
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
        capability_probe=capability_probe_identity,
    )
    static_result = build_static_result(
        protocol=dict(plan["protocol"]),
        execution_plan=execution_plan_receipt,
        terminal=terminal_receipt,
        metadata_manifest=manifest_receipt,
        capability_probe=capability_probe_identity,
        claim=claim,
        initializer={
            **initializer_identity,
            "path": os.path.realpath(initializer_path),
        },
        live_weights=live_before,
        trainer_result=trainer_result_identity,
        candidate_weights=candidate_weights,
        runtime_sanity={
            **runtime_identity,
            "schema": V2.RUNTIME_SCHEMA,
        },
        baseline_metrics=baseline_metrics,
        candidate_metrics=candidate_metrics,
        initializer_quantization=initializer_quantization,
        candidate_quantization=candidate_quantization,
        runtime_receipt=runtime_receipt,
        export_roundtrip_mismatches=export_roundtrip_mismatches,
    )
    validate_static_result(static_result, repo_root=repo_root)
    V2._canonical_create_only(static_result_path, static_result)
    live_final = _identity(live_path, "immutable live weights after v3 static")
    if live_final != live_before:
        raise DirectTeacherV3CpuTrainingError(
            "live weights changed during v3 static sanity"
        )
    return static_result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execution-plan", required=True)
    parser.add_argument("--pipeline-revision", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--repo-root", default=".")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        result = run(args)
    except (
        DirectTeacherV3CpuTrainingError,
        PROTOCOL.DirectTeacherHalfkpV3CpuError,
        V2.DirectTeacherTrainingError,
        OSError,
        RuntimeError,
        ValueError,
    ) as error:
        print(f"[direct-teacher-halfkp81-v3-cpu] STOP: {error}", file=sys.stderr)
        return 1
    print(
        json.dumps(
            {
                "schema": STATIC_RESULT_SCHEMA,
                "status": result["status"],
                "paired56_authorized": result["paired56_authorized"],
                "live_weight_write_authorized": False,
            },
            sort_keys=True,
            separators=(",", ":"),
        )
    )
    return 0 if result["paired56_authorized"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
