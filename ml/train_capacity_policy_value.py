#!/usr/bin/env python3
"""Run the preregistered large offline policy/value capacity diagnostic."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import random
import time
from typing import Mapping, Sequence

import torch

import capacity_policy_value as cpv
import capacity_policy_value_data as data_contract
import listwise_policy_value as lpv


PROTOCOL_SCHEMA = "shogi-capacity-policy-value-plan-v1"
PROTOCOL_SCHEMA_V2 = "shogi-capacity-policy-value-plan-v2"
PROTOCOL_SCHEMA_V3 = "shogi-capacity-policy-value-plan-v3"
STRENGTH_PROTOCOL_SCHEMA = "shogi-child-board-strength-candidate-plan-v1"
RESULT_SCHEMA = "shogi-capacity-policy-value-result-v1"
RESULT_SCHEMA_V2 = "shogi-capacity-policy-value-result-v2"
RESULT_SCHEMA_V3 = "shogi-capacity-policy-value-result-v3"
STRENGTH_RESULT_SCHEMA = "shogi-child-board-strength-candidate-result-v1"
STRENGTH_MODEL_SCHEMA = "shogi-child-board-strength-candidate-v1"
STRENGTH_MODEL_VARIANT = "child-board-strength-candidate-v1"
STRENGTH_CHECKPOINT_SCHEMA = (
    "shogi-child-board-strength-candidate-phase1-checkpoint-v1"
)
STRENGTH_FINAL_CHECKPOINT_SCHEMA = (
    "shogi-child-board-strength-candidate-final-checkpoint-v1"
)
STRENGTH_CHECKPOINT_RECEIPT_SCHEMA = (
    "shogi-child-board-strength-candidate-checkpoint-receipt-v1"
)
TRACKED_PROTOCOL_PATH = (
    Path(__file__).parent / "protocols" / "capacity-policy-value-v1-plan.json"
)
# Filled only after the prospective protocol bytes are committed.
TRACKED_PROTOCOL_SHA256 = (
    "30b4aab6689679a98a6f86fa835610a5f0fcfd3157d8fc44d4029152d1f7eaf3"
)
TRACKED_PROTOCOL_V2_PATH = (
    Path(__file__).parent / "protocols" / "capacity-policy-value-v2-plan.json"
)
# Filled by the prospective protocol commit before objective-v2 may execute.
TRACKED_PROTOCOL_V2_SHA256 = (
    "15e7c8ffee90a9ad2d6caad41267d9e788984ffd97627a4f1c734aa49954d3d8"
)
TRACKED_PROTOCOL_V3_PATH = (
    Path(__file__).parent / "protocols" / "capacity-policy-value-v3-plan.json"
)
TRACKED_PROTOCOL_V3_SHA256 = (
    "4cdda7ab438aef16332b545477eb7ac12047ef13c19432d621c03803fb67b2a6"
)
TRACKED_STRENGTH_PROTOCOL_PATH = (
    Path(__file__).parent
    / "protocols"
    / "child-board-strength-candidate-v1-plan.json"
)
TRACKED_STRENGTH_PROTOCOL_SHA256 = (
    "b9b8256433cec77da8d32a6d05018b9a5e405e5b57fdabe299490a5f9f90cfe2"
)

PROTOCOL_BINDINGS = (
    {
        "path": TRACKED_PROTOCOL_PATH,
        "sha256": TRACKED_PROTOCOL_SHA256,
        "schema": PROTOCOL_SCHEMA,
        "status": "prospective-capacity-diagnostic-only",
        "objective": cpv.OBJECTIVE_V1,
        "model_class": cpv.OfflineCapacityPolicyValue,
        "feature_version": cpv.FEATURE_VERSION,
        "result_schema": RESULT_SCHEMA,
    },
    {
        "path": TRACKED_PROTOCOL_V2_PATH,
        "sha256": TRACKED_PROTOCOL_V2_SHA256,
        "schema": PROTOCOL_SCHEMA_V2,
        "status": "prospective-objective-v2-capacity-diagnostic-only",
        "objective": cpv.OBJECTIVE_V2,
        "model_class": cpv.OfflineCapacityPolicyValue,
        "feature_version": cpv.FEATURE_VERSION,
        "result_schema": RESULT_SCHEMA_V2,
    },
    {
        "path": TRACKED_PROTOCOL_V3_PATH,
        "sha256": TRACKED_PROTOCOL_V3_SHA256,
        "schema": PROTOCOL_SCHEMA_V3,
        "status": "prospective-child-board-capacity-diagnostic-only",
        "objective": cpv.OBJECTIVE_V2,
        "model_class": cpv.OfflineChildBoardCapacityPolicyValue,
        "model_variant": cpv.CHILD_MODEL_VARIANT,
        "model_schema": cpv.CHILD_SCHEMA,
        "feature_version": cpv.CHILD_FEATURE_VERSION,
        "result_schema": RESULT_SCHEMA_V3,
    },
    {
        "path": TRACKED_STRENGTH_PROTOCOL_PATH,
        "sha256": TRACKED_STRENGTH_PROTOCOL_SHA256,
        "schema": STRENGTH_PROTOCOL_SCHEMA,
        "status": "prospective-scratch-strength-candidate-lane-only",
        "objective": cpv.OBJECTIVE_V2,
        "model_class": cpv.OfflineChildBoardCapacityPolicyValue,
        "model_variant": STRENGTH_MODEL_VARIANT,
        "model_schema": STRENGTH_MODEL_SCHEMA,
        "feature_version": cpv.CHILD_FEATURE_VERSION,
        "result_schema": STRENGTH_RESULT_SCHEMA,
        "execution_mode": "strength-phase1-two-scratch-tune-locked",
    },
)


def _strict_json(path: str | Path) -> dict[str, object]:
    raw = Path(path).read_bytes()

    def reject_constant(value: str) -> None:
        raise ValueError(f"{path}: invalid JSON constant {value}")

    result = json.loads(raw, parse_constant=reject_constant)
    if type(result) is not dict:
        raise ValueError(f"{path}: expected a JSON object")
    return result


def _atomic_json(path: Path, value: Mapping[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _atomic_torch_save(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    torch.save(value, temporary)
    os.replace(temporary, path)


def _fingerprint(path: str | Path) -> dict[str, object]:
    return lpv.file_fingerprint(path)


def _protocol_binding(path: str | Path) -> Mapping[str, object]:
    requested = Path(path).resolve()
    for binding in PROTOCOL_BINDINGS:
        tracked = binding["path"]
        if isinstance(tracked, Path) and requested == tracked.resolve():
            return binding
    raise ValueError("capacity runner accepts only a tracked protocol")


def _checkpoint_model_metadata(
    binding: Mapping[str, object],
    *,
    detailed: bool,
) -> dict[str, object]:
    model_class = binding.get("model_class")
    feature_version = binding.get("feature_version")
    checkpoint_schema = binding.get("model_schema", cpv.SCHEMA)
    if (
        not isinstance(model_class, type)
        or not issubclass(model_class, cpv.OfflineCapacityPolicyValue)
        or not isinstance(feature_version, str)
        or not isinstance(checkpoint_schema, str)
    ):
        raise ValueError("capacity checkpoint binding is malformed")
    metadata: dict[str, object] = {"schema": checkpoint_schema}
    if detailed:
        metadata["feature_version"] = feature_version
        metadata["parameters"] = model_class.parameter_count()
    return metadata


def _last_checkpoint_model_metadata(
    binding: Mapping[str, object],
) -> dict[str, object]:
    return _checkpoint_model_metadata(
        binding,
        detailed=binding.get("model_variant") is not None,
    )


def _is_strength_phase1(binding: Mapping[str, object]) -> bool:
    return (
        binding.get("execution_mode")
        == "strength-phase1-two-scratch-tune-locked"
    )


def _verified_protocol_identity(
    binding: Mapping[str, object],
) -> dict[str, object]:
    tracked_path = binding["path"]
    expected_sha = binding["sha256"]
    if not isinstance(tracked_path, Path) or not isinstance(expected_sha, str):
        raise ValueError("capacity protocol binding is malformed")
    if expected_sha == "PENDING":
        raise ValueError("tracked capacity protocol identity mismatch")
    raw = tracked_path.read_bytes()
    actual_protocol_sha = hashlib.sha256(raw).hexdigest()
    if actual_protocol_sha != expected_sha:
        raise ValueError("tracked capacity protocol identity mismatch")
    protocol = _strict_json(tracked_path)
    if protocol.get("schema") != binding["schema"]:
        raise ValueError("capacity protocol schema mismatch")
    if protocol.get("status") != binding["status"]:
        raise ValueError("capacity protocol is not prospective")
    return {
        "protocol": {
            "path": str(tracked_path.resolve()),
            "bytes": len(raw),
            "sha256": actual_protocol_sha,
        },
        "document": protocol,
    }


def _verify_protocol(args: argparse.Namespace) -> dict[str, object]:
    binding = _protocol_binding(args.protocol)
    verified_identity = _verified_protocol_identity(binding)
    protocol = verified_identity["document"]
    architecture = protocol.get("architecture")
    if type(architecture) is not dict:
        raise ValueError("capacity protocol architecture is absent")
    model_class = binding.get("model_class")
    feature_version = binding.get("feature_version")
    if (
        not isinstance(model_class, type)
        or not issubclass(model_class, cpv.OfflineCapacityPolicyValue)
        or not isinstance(feature_version, str)
    ):
        raise ValueError("capacity model binding is malformed")
    if (
        architecture.get("parameters")
        != model_class.parameter_count()
        or architecture.get("feature_version") != feature_version
    ):
        raise ValueError("capacity architecture drift")
    model_variant = binding.get("model_variant")
    if (
        model_variant is not None
        and architecture.get("model_variant") != model_variant
    ):
        raise ValueError("capacity model variant drift")
    model_schema = binding.get("model_schema")
    if model_schema is not None and architecture.get("schema") != model_schema:
        raise ValueError("capacity model schema drift")
    if (
        model_variant is not None
        and protocol.get("result_schema") != binding["result_schema"]
    ):
        raise ValueError("capacity result schema drift")

    input_bindings = {
        "live_nnue": args.live_nnue,
        "browser_training": args.browser_data,
        "v9_training": args.v9_data,
        "fresh_final_protected": args.protected_ids[0],
        "fresh_selection_protected": args.protected_ids[1],
    }
    registered_inputs = protocol.get("inputs")
    if type(registered_inputs) is not dict:
        raise ValueError("capacity protocol inputs are absent")
    verified_inputs: dict[str, object] = {}
    for role, path in input_bindings.items():
        expected = registered_inputs.get(role)
        if type(expected) is not dict:
            raise ValueError(f"capacity input {role} is unregistered")
        actual = _fingerprint(path)
        if (
            actual["bytes"] != expected.get("bytes")
            or actual["sha256"] != expected.get("sha256")
        ):
            raise ValueError(f"capacity input {role} identity mismatch")
        verified_inputs[role] = actual

    expected_known = registered_inputs.get("known_eval_sources")
    if type(expected_known) is not list:
        raise ValueError("known-eval capacity inputs are unregistered")
    known_paths = list(args.known_eval_sibling) + list(args.known_eval_scalar)
    if len(known_paths) != len(expected_known):
        raise ValueError("known-eval capacity input count mismatch")
    for index, (path, expected) in enumerate(
        zip(known_paths, expected_known, strict=True)
    ):
        if type(expected) is not dict:
            raise ValueError("known-eval capacity input is malformed")
        actual = _fingerprint(path)
        if (
            actual["bytes"] != expected.get("bytes")
            or actual["sha256"] != expected.get("sha256")
        ):
            raise ValueError(
                f"known-eval capacity input {index} identity mismatch"
            )

    strength_phase1 = _is_strength_phase1(binding)
    registered_training = protocol.get(
        "phase1_training" if strength_phase1 else "training"
    )
    if type(registered_training) is not dict:
        raise ValueError("capacity training controls are absent")
    objective = binding["objective"]
    if objective == cpv.OBJECTIVE_V2:
        registered_loss = protocol.get("loss")
        if (
            type(registered_loss) is not dict
            or registered_loss.get("id") != objective
        ):
            raise ValueError("capacity objective v2 identity mismatch")
    actual_training = {
        "v9_pretrain_epochs": args.v9_pretrain_epochs,
        "mixed_epochs": args.mixed_epochs,
        "browser_batch": args.browser_batch,
        "v9_batch": args.v9_batch,
        "learning_rate": args.lr,
        "weight_decay": args.weight_decay,
        "temperature_cp": args.temperature_cp,
        "pair_gap_cp": args.pair_gap_cp,
        "best_margin_cp": args.best_margin_cp,
        "gradient_clip": args.gradient_clip,
    }
    if not strength_phase1:
        actual_training = {
            "split_seed": args.split_seed,
            "tune_modulus": args.tune_modulus,
            "sentinel_seed": args.sentinel_seed,
            "sentinel_epochs": args.sentinel_epochs,
            "sentinel_browser_parents": args.sentinel_browser_parents,
            "sentinel_v9_parents": args.sentinel_v9_parents,
            **actual_training,
        }
    for key, value in actual_training.items():
        if registered_training.get(key) != value:
            raise ValueError(
                f"capacity training control {key} drift: "
                f"{registered_training.get(key)!r} != {value!r}"
            )
    seeds = registered_training.get("seeds")
    if (
        type(seeds) is not list
        or (
            seeds != [42, 314159]
            if strength_phase1
            else args.seed not in seeds
        )
    ):
        raise ValueError("capacity model seed is not registered")
    if strength_phase1:
        registered_split = protocol.get("data_receipt", {}).get("fit_tune")
        if (
            type(registered_split) is not dict
            or registered_split.get("split_seed") != args.split_seed
            or registered_split.get("tune_modulus") != args.tune_modulus
        ):
            raise ValueError("strength phase1 fit partition controls drift")
        if registered_training.get("execution_order") != [42, 314159]:
            raise ValueError("strength phase1 execution order drift")
        if registered_training.get("checkpoint_selection") != (
            "mixed epoch 12 final checkpoint only"
        ):
            raise ValueError("strength phase1 checkpoint selection drift")
        if any(
            registered_training.get(key) is not expected
            for key, expected in (
                ("best_checkpoint_selection", False),
                ("early_stopping", False),
                ("tune_monitoring", False),
                ("seed42_gate_before_seed314159", False),
                ("sequential_single_mps_process", True),
            )
        ):
            raise ValueError("strength phase1 selection controls drift")
        bypass = protocol.get("sentinel_bypass_authorization")
        if (
            type(bypass) is not dict
            or bypass.get("authorized") is not True
            or bypass.get("authority")
            != "new-scratch-strength-candidate-lane-not-v3-continuation"
            or bypass.get("sentinel_execution") != "forbidden"
            or bypass.get("sentinel_result_reuse") != "forbidden"
            or bypass.get("v3_checkpoint_or_optimizer_reuse") != "forbidden"
            or bypass.get("scratch_seeds") != [42, 314159]
            or bypass.get("both_checkpoints_must_freeze_before_tune")
            is not True
        ):
            raise ValueError("strength phase1 sentinel bypass drift")
    verified = {
        **verified_identity,
        "verified_inputs": verified_inputs,
    }
    if objective == cpv.OBJECTIVE_V2:
        verified["objective"] = objective
    return verified


def _load_and_partition(
    args: argparse.Namespace,
    protocol: Mapping[str, object],
) -> tuple[
    list[lpv.ParentGroup],
    list[lpv.ParentGroup],
    list[lpv.ParentGroup],
    list[lpv.ParentGroup],
    dict[str, object],
]:
    qweights = lpv.read_live_board_qweights(args.live_nnue)
    browser, browser_source = lpv.load_groups(
        args.browser_data,
        role="browser-all-legal",
        expected_split="train",
        qweights=qweights,
    )
    v9, v9_source = lpv.load_groups(
        args.v9_data,
        role="v9",
        expected_split="train",
        qweights=qweights,
    )
    protected_sets: list[frozenset[str]] = []
    protected_receipts: list[dict[str, object]] = []
    for path in args.protected_ids:
        identifiers, receipt = data_contract.read_protected_position_ids(path)
        protected_sets.append(identifiers)
        protected_receipts.append(receipt)
    known_ids, known_receipt = data_contract.read_known_eval_position_ids(
        sibling_paths=args.known_eval_sibling,
        scalar_paths=args.known_eval_scalar,
    )
    protected_sets.append(known_ids)
    browser_kept, v9_kept, partition = data_contract.partition_sources(
        browser=browser,
        v9=v9,
        spent_groups=[],
        protected_sets=protected_sets,
    )
    browser_fit, browser_tune, browser_split = (
        lpv.split_by_semantic_components(
            browser_kept,
            seed=args.split_seed,
            tune_modulus=args.tune_modulus,
        )
    )
    v9_fit, v9_tune, v9_split = lpv.split_by_semantic_components(
        v9_kept,
        seed=args.split_seed,
        tune_modulus=args.tune_modulus,
    )
    observed = {
        "sources": {
            "browser": browser_source,
            "v9": v9_source,
            "protected_position_ids": protected_receipts,
            "known_eval_position_ids": known_receipt,
        },
        "partition": partition,
        "fit_tune": {
            "algorithm": "game-semantic-connected-components-sha256-v1",
            "split_seed": args.split_seed,
            "tune_modulus": args.tune_modulus,
            "browser": browser_split,
            "v9": v9_split,
        },
    }
    expected = protocol["document"].get("data_receipt")
    if type(expected) is not dict:
        raise ValueError("capacity data receipt is absent")
    data_contract.require_exact_receipt(observed, expected, "capacity data")
    return browser_fit, browser_tune, v9_fit, v9_tune, observed


def _loss(
    model: cpv.OfflineCapacityPolicyValue,
    groups: Sequence[lpv.ParentGroup],
    *,
    device: str,
    pad_moves_to: int,
    objective: str,
    args: argparse.Namespace,
) -> tuple[torch.Tensor, dict[str, torch.Tensor]]:
    batch = cpv.make_batch(
        groups,
        device,
        pad_moves_to=pad_moves_to,
        include_child_planes=model.requires_child_planes,
    )
    combined, residual, parent_value = model(batch)
    return cpv.policy_value_loss(
        combined,
        residual,
        parent_value,
        batch["teacher_cp"],
        batch["valid"],
        temperature_cp=args.temperature_cp,
        pair_gap_cp=args.pair_gap_cp,
        best_margin_cp=args.best_margin_cp,
        objective=objective,
    )


def _balanced_v9_batches(
    groups: Sequence[lpv.ParentGroup],
    count: int,
) -> list[list[lpv.ParentGroup]]:
    if count <= 0 or not groups:
        raise ValueError("cannot balance zero capacity V9 groups")
    return [
        list(groups[start * len(groups) // count : (start + 1) * len(groups) // count])
        for start in range(count)
    ]


def _paired_epoch(
    model: cpv.OfflineCapacityPolicyValue,
    optimizer: torch.optim.Optimizer,
    browser: Sequence[lpv.ParentGroup],
    v9: Sequence[lpv.ParentGroup],
    *,
    epoch: int,
    seed: int,
    equal_domain_weight: bool,
    objective: str,
    args: argparse.Namespace,
) -> dict[str, object]:
    browser_batches = data_contract.bucketed_batches(
        browser,
        epoch=epoch,
        seed=seed,
        maximum_parents=args.browser_batch,
    )
    v9_order = sorted(v9, key=lambda group: group.parent_id)
    random.Random(seed + epoch * 104_729).shuffle(v9_order)
    v9_batches = _balanced_v9_batches(v9_order, len(browser_batches))
    model.train()
    started = time.monotonic()
    loss_sum = 0.0
    component_sums = {
        "policy": 0.0,
        "pair": 0.0,
        "best_margin": 0.0,
        "move_value": 0.0,
        "state_value": 0.0,
    }
    for (browser_bucket, browser_batch), v9_batch in zip(
        browser_batches, v9_batches, strict=True
    ):
        if not v9_batch:
            raise ValueError("capacity V9 paired batch is empty")
        optimizer.zero_grad()
        browser_loss, browser_parts = _loss(
            model,
            browser_batch,
            device=args.device,
            pad_moves_to=browser_bucket,
            objective=objective,
            args=args,
        )
        v9_loss, v9_parts = _loss(
            model,
            v9_batch,
            device=args.device,
            pad_moves_to=16,
            objective=objective,
            args=args,
        )
        if equal_domain_weight:
            browser_weight = v9_weight = 0.5
        else:
            denominator = len(browser_batch) + len(v9_batch)
            browser_weight = len(browser_batch) / denominator
            v9_weight = len(v9_batch) / denominator
        total = browser_weight * browser_loss + v9_weight * v9_loss
        total.backward()
        torch.nn.utils.clip_grad_norm_(
            model.parameters(), args.gradient_clip
        )
        optimizer.step()
        loss_sum += float(total.detach().cpu().item())
        for name in component_sums:
            component_sums[name] += float(
                (
                    browser_weight * browser_parts[name]
                    + v9_weight * v9_parts[name]
                )
                .detach()
                .cpu()
                .item()
            )
    batches = len(browser_batches)
    return {
        "epoch": epoch,
        "batches": batches,
        "browser_parents": len(browser),
        "v9_parents": len(v9),
        "loss": loss_sum / batches,
        "components": {
            name: value / batches for name, value in component_sums.items()
        },
        "seconds": time.monotonic() - started,
    }


def _v9_epoch(
    model: cpv.OfflineCapacityPolicyValue,
    optimizer: torch.optim.Optimizer,
    groups: Sequence[lpv.ParentGroup],
    *,
    epoch: int,
    seed: int,
    objective: str,
    args: argparse.Namespace,
) -> dict[str, object]:
    batches = data_contract.bucketed_batches(
        groups,
        epoch=epoch,
        seed=seed,
        maximum_parents=args.v9_batch,
    )
    model.train()
    started = time.monotonic()
    loss_sum = 0.0
    for boundary, batch in batches:
        optimizer.zero_grad()
        loss, _parts = _loss(
            model,
            batch,
            device=args.device,
            pad_moves_to=boundary,
            objective=objective,
            args=args,
        )
        loss.backward()
        torch.nn.utils.clip_grad_norm_(
            model.parameters(), args.gradient_clip
        )
        optimizer.step()
        loss_sum += float(loss.detach().cpu().item())
    return {
        "epoch": epoch,
        "batches": len(batches),
        "parents": len(groups),
        "loss": loss_sum / len(batches),
        "seconds": time.monotonic() - started,
    }


def _metrics(
    model: cpv.OfflineCapacityPolicyValue | None,
    browser: Sequence[lpv.ParentGroup],
    v9: Sequence[lpv.ParentGroup],
    args: argparse.Namespace,
    *,
    device: str | None = None,
) -> dict[str, dict[str, float | int]]:
    scoring_device = args.device if device is None else device
    return {
        "browser": cpv.score_groups(
            model,
            browser,
            device=scoring_device,
            parent_batch_size=args.browser_batch,
            pair_gap_cp=args.pair_gap_cp,
        ),
        "v9": cpv.score_groups(
            model,
            v9,
            device=scoring_device,
            parent_batch_size=args.v9_batch,
            pair_gap_cp=args.pair_gap_cp,
        ),
    }


def _capacity_gate(
    candidate: Mapping[str, Mapping[str, float | int]],
    baseline: Mapping[str, Mapping[str, float | int]],
    gates: Mapping[str, object],
) -> dict[str, object]:
    browser_gate = gates.get("browser_tune")
    v9_gate = gates.get("v9_tune")
    if type(browser_gate) is not dict or type(v9_gate) is not dict:
        raise ValueError("capacity tune gates are absent")
    checks = {
        "browser_top1": {
            "observed": candidate["browser"]["top1_correct"],
            "required_minimum": browser_gate["minimum_top1_correct"],
        },
        "browser_pair": {
            "observed": candidate["browser"]["pair_accuracy"],
            "required_minimum": browser_gate["minimum_pair_accuracy"],
        },
        "browser_regret": {
            "observed": candidate["browser"]["mean_regret_cp"],
            "allowed_maximum": baseline["browser"]["mean_regret_cp"],
        },
        "v9_top1": {
            "observed": candidate["v9"]["top1_accuracy"],
            "required_minimum": v9_gate["minimum_top1_accuracy"],
        },
        "v9_pair": {
            "observed": candidate["v9"]["pair_accuracy"],
            "required_minimum": v9_gate["minimum_pair_accuracy"],
        },
    }
    for check in checks.values():
        if "required_minimum" in check:
            check["passed"] = float(check["observed"]) >= float(
                check["required_minimum"]
            )
        else:
            check["passed"] = float(check["observed"]) <= float(
                check["allowed_maximum"]
            )
    return {
        "passed": all(bool(check["passed"]) for check in checks.values()),
        "checks": checks,
    }


def _sentinel_gate(
    metrics: Mapping[str, Mapping[str, float | int]],
    gates: Mapping[str, object],
) -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {}
    for domain in ("browser", "v9"):
        checks[f"{domain}_top1"] = {
            "observed": metrics[domain]["top1_accuracy"],
            "required_minimum": gates["minimum_top1_accuracy"],
        }
        checks[f"{domain}_pair"] = {
            "observed": metrics[domain]["pair_accuracy"],
            "required_minimum": gates["minimum_pair_accuracy"],
        }
    for check in checks.values():
        check["passed"] = float(check["observed"]) >= float(
            check["required_minimum"]
        )
    return {
        "passed": all(bool(check["passed"]) for check in checks.values()),
        "checks": checks,
    }


def _fit_only_data_receipt(
    receipt: Mapping[str, object],
) -> dict[str, object]:
    """Bind the authenticated fit partition without opening candidate scores."""
    sources = receipt.get("sources")
    partition = receipt.get("partition")
    fit_tune = receipt.get("fit_tune")
    if (
        type(sources) is not dict
        or type(partition) is not dict
        or type(fit_tune) is not dict
    ):
        raise ValueError("strength phase1 data receipt is malformed")
    return {
        "sources": sources,
        "partition": partition,
        "fit_partition": {
            "algorithm": fit_tune.get("algorithm"),
            "split_seed": fit_tune.get("split_seed"),
            "tune_modulus": fit_tune.get("tune_modulus"),
            "browser": {
                key: fit_tune.get("browser", {}).get(key)
                for key in (
                    "algorithm",
                    "seed",
                    "tune_modulus",
                    "components",
                    "fit_components",
                    "fit_parents",
                    "fit_games",
                    "component_assignments_sha256",
                )
            },
            "v9": {
                key: fit_tune.get("v9", {}).get(key)
                for key in (
                    "algorithm",
                    "seed",
                    "tune_modulus",
                    "components",
                    "fit_components",
                    "fit_parents",
                    "fit_games",
                    "component_assignments_sha256",
                )
            },
        },
    }


def _validate_spent_v3_result(
    protocol: Mapping[str, object],
    data_receipt: Mapping[str, object],
) -> dict[str, object]:
    document = protocol.get("document")
    if type(document) is not dict:
        raise ValueError("strength phase1 protocol document is absent")
    spent = document.get("spent_development_evidence")
    expected = (
        spent.get("v3_result") if type(spent) is dict else None
    )
    if type(expected) is not dict:
        raise ValueError("strength phase1 spent v3 receipt is absent")
    path = expected.get("path")
    if not isinstance(path, str):
        raise ValueError("strength phase1 spent v3 path is absent")
    actual_identity = _fingerprint(path)
    if (
        actual_identity.get("bytes") != expected.get("bytes")
        or actual_identity.get("sha256") != expected.get("sha256")
    ):
        raise ValueError("strength phase1 spent v3 identity mismatch")
    result = _strict_json(path)
    if (
        result.get("schema") != expected.get("schema")
        or result.get("status") != expected.get("status")
        or result.get("objective") != cpv.OBJECTIVE_V2
        or result.get("data_receipt") != data_receipt
    ):
        raise ValueError("strength phase1 spent v3 claims mismatch")
    expected_protocol = expected.get("protocol")
    result_protocol = result.get("protocol")
    if (
        type(expected_protocol) is not dict
        or type(result_protocol) is not dict
        or result_protocol.get("bytes") != expected_protocol.get("bytes")
        or result_protocol.get("sha256") != expected_protocol.get("sha256")
        or Path(str(result_protocol.get("path"))).resolve()
        != TRACKED_PROTOCOL_V3_PATH.resolve()
    ):
        raise ValueError("strength phase1 spent v3 protocol mismatch")
    expected_sentinel = expected.get("sentinel")
    sentinel = result.get("sentinel")
    if type(expected_sentinel) is not dict or type(sentinel) is not dict:
        raise ValueError("strength phase1 spent v3 sentinel receipt is absent")
    metrics = sentinel.get("metrics")
    gate = sentinel.get("gate")
    if type(metrics) is not dict or type(gate) is not dict:
        raise ValueError("strength phase1 spent v3 sentinel is malformed")
    for domain in ("browser", "v9"):
        registered = expected_sentinel.get(domain)
        observed = metrics.get(domain)
        if type(registered) is not dict or type(observed) is not dict:
            raise ValueError("strength phase1 spent v3 metric is malformed")
        if any(observed.get(key) != value for key, value in registered.items()):
            raise ValueError("strength phase1 spent v3 metric drift")
    if (
        gate.get("passed") is not expected_sentinel.get("gate_passed")
        or sentinel.get("weights_discarded")
        is not expected_sentinel.get("weights_discarded")
        or result.get("model_training_started") is not False
        or result.get("second_seed_authorized") is not False
        or result.get("sealed_teacher_authorized") is not False
        or result.get("live_weights_changed") is not False
        or result.get("wasm_changed") is not False
    ):
        raise ValueError("strength phase1 spent v3 boundary drift")
    return {
        "path": str(Path(path).resolve()),
        "bytes": actual_identity["bytes"],
        "sha256": actual_identity["sha256"],
        "schema": result["schema"],
        "status": result["status"],
        "weights_reused": False,
    }


def _strength_step_index(seed: int, phase: str, epoch: int) -> int:
    if seed not in (42, 314159):
        raise ValueError("strength phase1 checkpoint seed is invalid")
    if phase == "v9" and 1 <= epoch <= 4:
        local = epoch
    elif phase == "mixed" and 1 <= epoch <= 12:
        local = 4 + epoch
    else:
        raise ValueError("strength phase1 checkpoint position is invalid")
    return local + (16 if seed == 314159 else 0)


def _strength_step_from_index(index: int) -> tuple[int, str, int]:
    if not 1 <= index <= 32:
        raise ValueError("strength phase1 global epoch is invalid")
    seed = 42 if index <= 16 else 314159
    local = index if seed == 42 else index - 16
    return (
        (seed, "v9", local)
        if local <= 4
        else (seed, "mixed", local - 4)
    )


def _strength_next_step(
    checkpoint: Mapping[str, object] | None,
) -> tuple[int, str, int] | None:
    if checkpoint is None:
        return (42, "v9", 1)
    index = checkpoint.get("global_epoch")
    seed = checkpoint.get("seed")
    phase = checkpoint.get("phase")
    epoch = checkpoint.get("completed_epoch")
    if (
        type(index) is not int
        or type(seed) is not int
        or not isinstance(phase, str)
        or type(epoch) is not int
        or index != _strength_step_index(seed, phase, epoch)
    ):
        raise ValueError("strength phase1 checkpoint order mismatch")
    return None if index == 32 else _strength_step_from_index(index + 1)


def _strength_output_state(output: Path) -> str:
    if output.is_symlink() or (output.exists() and not output.is_dir()):
        raise ValueError("strength phase1 output is a file or symlink")
    if not output.exists():
        output.mkdir(parents=True)
        return "fresh"
    published_names = {
        "last.pt",
        "last-receipt.json",
        "seed-42-final.pt",
        "seed-42-final-receipt.json",
        "seed-314159-final.pt",
        "seed-314159-final-receipt.json",
        "result.json",
    }
    for entry in output.iterdir():
        if entry.name.endswith(".tmp") and entry.name[:-4] in published_names:
            if entry.is_symlink() or not entry.is_file():
                raise ValueError(
                    "strength phase1 unpublished temporary is malformed"
                )
            entry.unlink()
    names = {entry.name for entry in output.iterdir()}
    if "result.json" in names:
        raise ValueError("strength phase1 terminal result already exists")
    allowed = published_names - {"result.json"}
    if not names or not names <= allowed:
        raise ValueError("strength phase1 output is not the unique recovery run")
    if any(entry.is_symlink() for entry in output.iterdir()):
        raise ValueError("strength phase1 output contains a symlink")
    if "last.pt" not in names:
        raise ValueError("strength phase1 latest checkpoint is absent")
    for seed in (42, 314159):
        checkpoint = f"seed-{seed}-final.pt"
        receipt = f"seed-{seed}-final-receipt.json"
        if receipt in names and checkpoint not in names:
            raise ValueError("strength phase1 final checkpoint is incomplete")
    return "resume"


def _strength_output_path(
    requested: str | Path,
    registered: str | Path,
) -> Path:
    output = Path(requested).resolve()
    expected = Path(registered).resolve()
    if output != expected:
        raise ValueError("strength phase1 alternate output path is forbidden")
    return expected


def _mps_rng_state() -> torch.Tensor:
    if not hasattr(torch.mps, "get_rng_state"):
        raise ValueError("strength phase1 requires readable MPS RNG state")
    state = torch.mps.get_rng_state()
    if (
        not isinstance(state, torch.Tensor)
        or state.dtype != torch.uint8
        or state.numel() == 0
    ):
        raise ValueError("strength phase1 MPS RNG state is invalid")
    return state.detach().cpu().clone()


def _restore_rng_states(
    cpu_rng: object,
    mps_rng: object,
) -> None:
    if (
        not isinstance(cpu_rng, torch.Tensor)
        or cpu_rng.dtype != torch.uint8
        or cpu_rng.numel() == 0
        or not isinstance(mps_rng, torch.Tensor)
        or mps_rng.dtype != torch.uint8
        or mps_rng.numel() == 0
        or not hasattr(torch.mps, "set_rng_state")
    ):
        raise ValueError("strength phase1 checkpoint RNG state is invalid")
    torch.set_rng_state(cpu_rng.detach().cpu())
    torch.mps.set_rng_state(mps_rng.detach().cpu())


def _strength_checkpoint_receipt(
    checkpoint_path: Path,
    checkpoint: Mapping[str, object],
) -> dict[str, object]:
    identity = _fingerprint(checkpoint_path)
    return {
        "schema": STRENGTH_CHECKPOINT_RECEIPT_SCHEMA,
        "checkpoint": identity,
        "seed": checkpoint["seed"],
        "phase": checkpoint["phase"],
        "completed_epoch": checkpoint["completed_epoch"],
        "global_epoch": checkpoint["global_epoch"],
        "protocol": checkpoint["protocol"],
        "fit_data_receipt": checkpoint["fit_data_receipt"],
        "spent_development_evidence": checkpoint[
            "spent_development_evidence"
        ],
    }


def _save_strength_last_checkpoint(
    output: Path,
    *,
    binding: Mapping[str, object],
    protocol_receipt: Mapping[str, object],
    fit_data_receipt: Mapping[str, object],
    spent_development_evidence: Mapping[str, object],
    seed: int,
    phase: str,
    completed_epoch: int,
    model: cpv.OfflineCapacityPolicyValue,
    optimizer: torch.optim.Optimizer,
    training_curve: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    global_epoch = _strength_step_index(seed, phase, completed_epoch)
    checkpoint = {
        "checkpoint_schema": STRENGTH_CHECKPOINT_SCHEMA,
        **_checkpoint_model_metadata(binding, detailed=True),
        "model_variant": binding["model_variant"],
        "objective": binding["objective"],
        "optimizer_schema": "torch.optim.AdamW-v1",
        "seed": seed,
        "phase": phase,
        "completed_epoch": completed_epoch,
        "global_epoch": global_epoch,
        "protocol": dict(protocol_receipt),
        "fit_data_receipt": dict(fit_data_receipt),
        "spent_development_evidence": dict(spent_development_evidence),
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
        "cpu_rng": torch.get_rng_state().detach().cpu().clone(),
        "mps_rng": _mps_rng_state(),
        "training_curve": list(training_curve),
    }
    path = output / "last.pt"
    _atomic_torch_save(path, checkpoint)
    receipt = _strength_checkpoint_receipt(path, checkpoint)
    _atomic_json(output / "last-receipt.json", receipt)
    return receipt


def _validate_strength_model_state_structure(
    binding: Mapping[str, object],
    state: object,
) -> None:
    if not isinstance(state, Mapping):
        raise ValueError("strength phase1 model state is absent")
    reference_model = binding["model_class"]()
    reference = reference_model.state_dict()
    if list(state) != list(reference):
        raise ValueError("strength phase1 model state keys mismatch")
    for name, expected in reference.items():
        observed = state[name]
        if (
            not isinstance(observed, torch.Tensor)
            or observed.device.type != "cpu"
            or observed.shape != expected.shape
            or observed.dtype != expected.dtype
        ):
            raise ValueError(
                f"strength phase1 model tensor {name} mismatch"
            )
    try:
        reference_model.load_state_dict(state, strict=True)
    except RuntimeError as error:
        raise ValueError("strength phase1 model state mismatch") from error
    del reference_model


def _validate_strength_optimizer_state(
    state: object,
    *,
    model_state: Mapping[str, torch.Tensor],
    expected_steps: int,
) -> None:
    if not isinstance(state, Mapping) or set(state) != {
        "state",
        "param_groups",
    }:
        raise ValueError("strength phase1 optimizer state is absent")
    optimizer_state = state["state"]
    groups = state["param_groups"]
    if (
        not isinstance(optimizer_state, Mapping)
        or type(groups) is not list
        or len(groups) != 1
        or type(groups[0]) is not dict
        or type(groups[0].get("params")) is not list
        or len(groups[0]["params"]) != len(model_state)
    ):
        raise ValueError("strength phase1 optimizer schema mismatch")
    expected_hyperparameters = {
        "lr": 3e-4,
        "betas": (0.9, 0.999),
        "eps": 1e-8,
        "weight_decay": 1e-4,
        "amsgrad": False,
        "maximize": False,
        "foreach": None,
        "capturable": False,
        "differentiable": False,
        "fused": None,
        "decoupled_weight_decay": True,
    }
    if set(groups[0]) != set(expected_hyperparameters) | {"params"} or any(
        groups[0].get(key) != value
        for key, value in expected_hyperparameters.items()
    ):
        raise ValueError("strength phase1 optimizer controls mismatch")
    parameter_ids = groups[0]["params"]
    if (
        any(type(value) is not int for value in parameter_ids)
        or len(set(parameter_ids)) != len(parameter_ids)
        or parameter_ids != list(range(len(model_state)))
    ):
        raise ValueError("strength phase1 optimizer parameter mismatch")
    expected_state_ids = {
        index
        for index, name in enumerate(model_state)
        if not name.startswith("state_value.")
    }
    if set(optimizer_state) != expected_state_ids:
        raise ValueError("strength phase1 optimizer state coverage mismatch")
    for parameter_id, value in optimizer_state.items():
        if not isinstance(value, Mapping) or set(value) != {
            "step",
            "exp_avg",
            "exp_avg_sq",
        }:
            raise ValueError("strength phase1 optimizer entry is malformed")
        parameter = list(model_state.values())[parameter_id]
        step = value["step"]
        if (
            not isinstance(step, torch.Tensor)
            or step.device.type != "cpu"
            or step.shape != torch.Size([])
            or step.dtype != torch.float32
            or not torch.isfinite(step).item()
            or float(step.item()) != expected_steps
        ):
            raise ValueError("strength phase1 optimizer step is malformed")
        for tensor_name in ("exp_avg", "exp_avg_sq"):
            tensor = value[tensor_name]
            if (
                not isinstance(tensor, torch.Tensor)
                or tensor.device.type != "cpu"
                or tensor.shape != parameter.shape
                or tensor.dtype != parameter.dtype
                or not torch.isfinite(tensor).all().item()
            ):
                raise ValueError(
                    "strength phase1 optimizer tensor is malformed"
                )


def _validate_strength_training_curve(
    curve: object,
    *,
    global_epoch: int,
) -> None:
    if type(curve) is not list or len(curve) != global_epoch:
        raise ValueError("strength phase1 training curve is incomplete")
    for index, row in enumerate(curve, start=1):
        expected_seed, expected_phase, expected_epoch = (
            _strength_step_from_index(index)
        )
        if (
            type(row) is not dict
            or row.get("seed") != expected_seed
            or row.get("phase") != expected_phase
            or row.get("epoch") != expected_epoch
            or type(row.get("batches")) is not int
            or row["batches"] <= 0
        ):
            raise ValueError("strength phase1 training curve order mismatch")


def _validate_strength_rng_states(
    cpu_rng: object,
    mps_rng: object,
) -> None:
    expected_cpu = torch.get_rng_state()
    expected_mps = _mps_rng_state()
    if (
        not isinstance(cpu_rng, torch.Tensor)
        or cpu_rng.device.type != "cpu"
        or cpu_rng.dtype != expected_cpu.dtype
        or cpu_rng.shape != expected_cpu.shape
        or not isinstance(mps_rng, torch.Tensor)
        or mps_rng.device.type != "cpu"
        or mps_rng.dtype != expected_mps.dtype
        or mps_rng.shape != expected_mps.shape
    ):
        raise ValueError("strength phase1 checkpoint RNG state is invalid")


def _load_strength_last_checkpoint(
    output: Path,
    *,
    binding: Mapping[str, object],
    protocol_receipt: Mapping[str, object],
    fit_data_receipt: Mapping[str, object] | None,
) -> dict[str, object]:
    path = output / "last.pt"
    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    except (OSError, RuntimeError, ValueError) as error:
        raise ValueError("strength phase1 checkpoint is unreadable") from error
    if type(checkpoint) is not dict:
        raise ValueError("strength phase1 checkpoint is malformed")
    expected_metadata = _checkpoint_model_metadata(binding, detailed=True)
    if (
        checkpoint.get("checkpoint_schema") != STRENGTH_CHECKPOINT_SCHEMA
        or any(
            checkpoint.get(key) != value
            for key, value in expected_metadata.items()
        )
        or checkpoint.get("model_variant") != binding["model_variant"]
        or checkpoint.get("objective") != binding["objective"]
        or checkpoint.get("optimizer_schema") != "torch.optim.AdamW-v1"
        or checkpoint.get("protocol") != protocol_receipt
        or (
            fit_data_receipt is not None
            and checkpoint.get("fit_data_receipt") != fit_data_receipt
        )
        or type(checkpoint.get("fit_data_receipt")) is not dict
        or type(checkpoint.get("spent_development_evidence")) is not dict
    ):
        raise ValueError("strength phase1 checkpoint binding mismatch")
    _strength_next_step(checkpoint)
    _validate_strength_model_state_structure(
        binding, checkpoint.get("model")
    )
    _validate_strength_training_curve(
        checkpoint.get("training_curve"),
        global_epoch=checkpoint["global_epoch"],
    )
    _validate_strength_optimizer_state(
        checkpoint.get("optimizer"),
        model_state=checkpoint["model"],
        expected_steps=sum(
            row["batches"] for row in checkpoint["training_curve"]
        ),
    )
    cpu_rng = checkpoint.get("cpu_rng")
    mps_rng = checkpoint.get("mps_rng")
    _validate_strength_rng_states(cpu_rng, mps_rng)
    expected_receipt = _strength_checkpoint_receipt(path, checkpoint)
    receipt_path = output / "last-receipt.json"
    receipt = (
        _strict_json(receipt_path) if receipt_path.exists() else None
    )
    if receipt is not None:
        receipt_epoch = receipt.get("global_epoch")
        checkpoint_epoch = checkpoint["global_epoch"]
        if type(receipt_epoch) is not int:
            raise ValueError("strength phase1 checkpoint receipt is malformed")
        if receipt_epoch > checkpoint_epoch:
            raise ValueError("strength phase1 checkpoint was rolled back")
        if receipt_epoch == checkpoint_epoch and receipt != expected_receipt:
            raise ValueError("strength phase1 checkpoint identity drift")
        if receipt_epoch < checkpoint_epoch - 1:
            raise ValueError(
                "strength phase1 checkpoint receipt skipped an epoch"
            )
        if receipt_epoch == checkpoint_epoch - 1:
            previous_seed, previous_phase, previous_epoch = (
                _strength_step_from_index(receipt_epoch)
            )
            previous_identity = receipt.get("checkpoint")
            if (
                receipt.get("schema")
                != STRENGTH_CHECKPOINT_RECEIPT_SCHEMA
                or receipt.get("seed") != previous_seed
                or receipt.get("phase") != previous_phase
                or receipt.get("completed_epoch") != previous_epoch
                or receipt.get("protocol") != checkpoint["protocol"]
                or receipt.get("fit_data_receipt")
                != checkpoint["fit_data_receipt"]
                or receipt.get("spent_development_evidence")
                != checkpoint["spent_development_evidence"]
                or type(previous_identity) is not dict
                or set(previous_identity) != {"path", "bytes", "sha256"}
                or previous_identity.get("path")
                != expected_receipt["checkpoint"]["path"]
                or type(previous_identity.get("bytes")) is not int
                or previous_identity["bytes"] <= 0
                or not isinstance(previous_identity.get("sha256"), str)
                or len(previous_identity["sha256"]) != 64
            ):
                raise ValueError(
                    "strength phase1 stale checkpoint receipt is malformed"
                )
    if receipt != expected_receipt:
        _atomic_json(receipt_path, expected_receipt)
    return checkpoint


def _load_valid_frozen_strength_checkpoint(
    path: Path,
    *,
    binding: Mapping[str, object],
    protocol_receipt: Mapping[str, object],
    fit_data_receipt: Mapping[str, object],
    seed: int,
    source_last_checkpoint: Mapping[str, object] | None = None,
) -> dict[str, object]:
    try:
        checkpoint = torch.load(path, map_location="cpu", weights_only=True)
    except (OSError, RuntimeError, ValueError) as error:
        raise ValueError(
            "strength phase1 frozen checkpoint is unreadable"
        ) from error
    expected_metadata = _checkpoint_model_metadata(binding, detailed=True)
    if (
        type(checkpoint) is not dict
        or checkpoint.get("checkpoint_schema")
        != STRENGTH_FINAL_CHECKPOINT_SCHEMA
        or any(
            checkpoint.get(key) != value
            for key, value in expected_metadata.items()
        )
        or checkpoint.get("model_variant") != binding["model_variant"]
        or checkpoint.get("objective") != binding["objective"]
        or checkpoint.get("seed") != seed
        or checkpoint.get("completed_v9_epoch") != 4
        or checkpoint.get("completed_mixed_epoch") != 12
        or checkpoint.get("protocol") != protocol_receipt
        or checkpoint.get("fit_data_receipt") != fit_data_receipt
        or type(checkpoint.get("source_last_checkpoint")) is not dict
        or set(checkpoint["source_last_checkpoint"]) != {
            "path",
            "bytes",
            "sha256",
        }
        or (
            source_last_checkpoint is not None
            and checkpoint.get("source_last_checkpoint")
            != source_last_checkpoint
        )
    ):
        raise ValueError("strength phase1 frozen checkpoint binding mismatch")
    _validate_strength_model_state_structure(
        binding, checkpoint.get("model")
    )
    return checkpoint


def _frozen_strength_receipt(
    path: Path,
    *,
    binding: Mapping[str, object],
    protocol_receipt: Mapping[str, object],
    fit_data_receipt: Mapping[str, object],
    seed: int,
    source_last_checkpoint: Mapping[str, object],
) -> dict[str, object]:
    return {
        "schema": STRENGTH_CHECKPOINT_RECEIPT_SCHEMA,
        "seed": seed,
        "model_variant": binding["model_variant"],
        "parameters": binding["model_class"].parameter_count(),
        "objective": binding["objective"],
        "protocol": dict(protocol_receipt),
        "fit_data_receipt": dict(fit_data_receipt),
        "completed_v9_epoch": 4,
        "completed_mixed_epoch": 12,
        "source_last_checkpoint": dict(source_last_checkpoint),
        "checkpoint": _fingerprint(path),
    }


def _require_frozen_model_matches_last(
    last_path: Path,
    frozen: Mapping[str, object],
    *,
    seed: int,
) -> None:
    try:
        source = torch.load(
            last_path, map_location="cpu", weights_only=True
        )
    except (OSError, RuntimeError, ValueError) as error:
        raise ValueError(
            "strength phase1 source last checkpoint is unreadable"
        ) from error
    expected_global_epoch = 16 if seed == 42 else 32
    source_model = source.get("model") if type(source) is dict else None
    frozen_model = frozen.get("model")
    if (
        type(source) is not dict
        or source.get("checkpoint_schema") != STRENGTH_CHECKPOINT_SCHEMA
        or source.get("seed") != seed
        or source.get("phase") != "mixed"
        or source.get("completed_epoch") != 12
        or source.get("global_epoch") != expected_global_epoch
        or not isinstance(source_model, Mapping)
        or not isinstance(frozen_model, Mapping)
        or list(source_model) != list(frozen_model)
        or any(
            not torch.equal(source_model[name], frozen_model[name])
            for name in source_model
        )
    ):
        raise ValueError(
            "strength phase1 frozen model differs from source last checkpoint"
        )


def _freeze_strength_checkpoint(
    output: Path,
    *,
    binding: Mapping[str, object],
    protocol_receipt: Mapping[str, object],
    fit_data_receipt: Mapping[str, object],
    seed: int,
    model: cpv.OfflineCapacityPolicyValue,
) -> dict[str, object]:
    path = output / f"seed-{seed}-final.pt"
    receipt_path = output / f"seed-{seed}-final-receipt.json"
    source_last_checkpoint = _fingerprint(output / "last.pt")
    if path.exists() or receipt_path.exists():
        if not path.is_file():
            raise ValueError("strength phase1 frozen checkpoint is malformed")
        checkpoint = _load_valid_frozen_strength_checkpoint(
            path,
            binding=binding,
            protocol_receipt=protocol_receipt,
            fit_data_receipt=fit_data_receipt,
            seed=seed,
            source_last_checkpoint=source_last_checkpoint,
        )
        _require_frozen_model_matches_last(
            output / "last.pt", checkpoint, seed=seed
        )
        expected_receipt = _frozen_strength_receipt(
            path,
            binding=binding,
            protocol_receipt=protocol_receipt,
            fit_data_receipt=fit_data_receipt,
            seed=seed,
            source_last_checkpoint=source_last_checkpoint,
        )
        receipt = (
            _strict_json(receipt_path) if receipt_path.exists() else None
        )
        if receipt is not None and receipt != expected_receipt:
            raise ValueError(
                "strength phase1 frozen checkpoint receipt mismatch"
            )
        if receipt is None:
            _atomic_json(receipt_path, expected_receipt)
        return expected_receipt
    state = {
        "checkpoint_schema": STRENGTH_FINAL_CHECKPOINT_SCHEMA,
        **_checkpoint_model_metadata(binding, detailed=True),
        "model_variant": binding["model_variant"],
        "objective": binding["objective"],
        "seed": seed,
        "completed_v9_epoch": 4,
        "completed_mixed_epoch": 12,
        "protocol": dict(protocol_receipt),
        "fit_data_receipt": dict(fit_data_receipt),
        "source_last_checkpoint": source_last_checkpoint,
        "model": {
            name: value.detach().cpu().clone()
            for name, value in model.state_dict().items()
        },
    }
    _atomic_torch_save(path, state)
    receipt = _frozen_strength_receipt(
        path,
        binding=binding,
        protocol_receipt=protocol_receipt,
        fit_data_receipt=fit_data_receipt,
        seed=seed,
        source_last_checkpoint=source_last_checkpoint,
    )
    _atomic_json(receipt_path, receipt)
    return receipt


def _validate_frozen_strength_receipts(
    output: Path,
    *,
    binding: Mapping[str, object],
    protocol_receipt: Mapping[str, object],
    fit_data_receipt: Mapping[str, object],
    completed_global_epoch: int,
) -> list[dict[str, object]]:
    receipts: list[dict[str, object]] = []
    for seed, required_epoch in ((42, 16), (314159, 32)):
        path = output / f"seed-{seed}-final.pt"
        receipt_path = output / f"seed-{seed}-final-receipt.json"
        should_exist = completed_global_epoch >= required_epoch
        if not should_exist:
            if path.exists() or receipt_path.exists():
                raise ValueError("strength phase1 future frozen checkpoint exists")
            continue
        if not path.is_file():
            raise ValueError("strength phase1 frozen checkpoint is absent")
        source_last_checkpoint = (
            _fingerprint(output / "last.pt")
            if completed_global_epoch == required_epoch
            else None
        )
        checkpoint = _load_valid_frozen_strength_checkpoint(
            path,
            binding=binding,
            protocol_receipt=protocol_receipt,
            fit_data_receipt=fit_data_receipt,
            seed=seed,
            source_last_checkpoint=source_last_checkpoint,
        )
        if source_last_checkpoint is not None:
            _require_frozen_model_matches_last(
                output / "last.pt", checkpoint, seed=seed
            )
        expected_receipt = _frozen_strength_receipt(
            path,
            binding=binding,
            protocol_receipt=protocol_receipt,
            fit_data_receipt=fit_data_receipt,
            seed=seed,
            source_last_checkpoint=checkpoint["source_last_checkpoint"],
        )
        receipt = (
            _strict_json(receipt_path) if receipt_path.exists() else None
        )
        if receipt is not None and receipt != expected_receipt:
            raise ValueError(
                "strength phase1 frozen checkpoint receipt mismatch"
            )
        if receipt is None:
            if source_last_checkpoint is None:
                raise ValueError(
                    "strength phase1 frozen checkpoint receipt is absent "
                    "outside its atomic publication window"
                )
            _atomic_json(receipt_path, expected_receipt)
        receipts.append(expected_receipt)
    return receipts


def _new_strength_model_optimizer(
    binding: Mapping[str, object],
    args: argparse.Namespace,
    *,
    seed: int,
) -> tuple[cpv.OfflineCapacityPolicyValue, torch.optim.Optimizer]:
    model_class = binding["model_class"]
    torch.manual_seed(seed)
    random.seed(seed)
    if not hasattr(torch.mps, "manual_seed"):
        raise ValueError("strength phase1 requires seedable MPS RNG")
    torch.mps.manual_seed(seed)
    model = model_class().to(args.device)
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=args.lr,
        weight_decay=args.weight_decay,
    )
    return model, optimizer


def _resume_strength_model_optimizer(
    binding: Mapping[str, object],
    args: argparse.Namespace,
    checkpoint: Mapping[str, object],
) -> tuple[cpv.OfflineCapacityPolicyValue, torch.optim.Optimizer]:
    seed = checkpoint["seed"]
    model, optimizer = _new_strength_model_optimizer(
        binding, args, seed=seed
    )
    try:
        model.load_state_dict(checkpoint["model"], strict=True)
        optimizer.load_state_dict(checkpoint["optimizer"])
    except (KeyError, RuntimeError, ValueError) as error:
        raise ValueError(
            "strength phase1 model or optimizer state mismatch"
        ) from error
    _restore_rng_states(checkpoint["cpu_rng"], checkpoint["mps_rng"])
    return model, optimizer


def _strength_model_from_checkpoint(
    binding: Mapping[str, object],
    args: argparse.Namespace,
    checkpoint: Mapping[str, object],
) -> cpv.OfflineCapacityPolicyValue:
    seed = checkpoint["seed"]
    torch.manual_seed(seed)
    random.seed(seed)
    torch.mps.manual_seed(seed)
    model = binding["model_class"]().to(args.device)
    try:
        model.load_state_dict(checkpoint["model"], strict=True)
    except (KeyError, RuntimeError, ValueError) as error:
        raise ValueError("strength phase1 final model state mismatch") from error
    return model


def _strength_phase1_result(
    *,
    binding: Mapping[str, object],
    protocol: Mapping[str, object],
    fit_data_receipt: Mapping[str, object],
    spent_v3: Mapping[str, object],
    training_curve: Sequence[Mapping[str, object]],
    final_receipts: Sequence[Mapping[str, object]],
) -> dict[str, object]:
    training = protocol["document"]["phase1_training"]
    return {
        "schema": binding["result_schema"],
        "status": training["success_status"],
        "objective": binding["objective"],
        "protocol": protocol["protocol"],
        "fit_data_receipt": dict(fit_data_receipt),
        "spent_development_evidence": dict(spent_v3),
        "training": {
            "execution_order": [42, 314159],
            "v9_pretrain_epochs": 4,
            "mixed_epochs": 12,
            "checkpoint_selection": "mixed epoch 12 final checkpoint only",
            "best_checkpoint_selection": False,
            "early_stopping": False,
            "training_curve": list(training_curve),
            "final_checkpoints": list(final_receipts),
        },
        "sentinel_executed": False,
        "sentinel_bypass_authorization_verified": True,
        "v3_weights_reused": False,
        "inter_seed_state_reused": False,
        "tune_opened": False,
        "sealed_opened": False,
        "live_weights_changed": False,
        "wasm_changed": False,
        "matches_started": False,
        "claim_boundary": (
            "two-frozen-offline-teachers-only-tune-sealed-direct-play-rank-"
            "live-and-deployment-claims-forbidden"
        ),
    }


def _terminalize_strength_phase1(
    args: argparse.Namespace,
    output: Path,
    binding: Mapping[str, object],
    protocol: Mapping[str, object],
    checkpoint: Mapping[str, object],
) -> dict[str, object]:
    if checkpoint.get("global_epoch") != 32:
        raise ValueError("strength phase1 terminal checkpoint is incomplete")
    fit_data_receipt = checkpoint["fit_data_receipt"]
    registered_fit_data_receipt = _fit_only_data_receipt(
        protocol["document"]["data_receipt"]
    )
    if fit_data_receipt != registered_fit_data_receipt:
        raise ValueError("strength phase1 terminal fit receipt mismatch")
    spent_v3 = checkpoint["spent_development_evidence"]
    expected_spent = protocol["document"]["spent_development_evidence"][
        "v3_result"
    ]
    if (
        spent_v3.get("bytes") != expected_spent.get("bytes")
        or spent_v3.get("sha256") != expected_spent.get("sha256")
        or spent_v3.get("schema") != expected_spent.get("schema")
        or spent_v3.get("status") != expected_spent.get("status")
        or spent_v3.get("weights_reused") is not False
    ):
        raise ValueError("strength phase1 spent evidence checkpoint drift")
    seed2_path = output / "seed-314159-final.pt"
    if seed2_path.exists():
        _validate_frozen_strength_receipts(
            output,
            binding=binding,
            protocol_receipt=protocol["protocol"],
            fit_data_receipt=fit_data_receipt,
            completed_global_epoch=32,
        )
    else:
        _validate_frozen_strength_receipts(
            output,
            binding=binding,
            protocol_receipt=protocol["protocol"],
            fit_data_receipt=fit_data_receipt,
            completed_global_epoch=31,
        )
        model = _strength_model_from_checkpoint(
            binding, args, checkpoint
        )
        _freeze_strength_checkpoint(
            output,
            binding=binding,
            protocol_receipt=protocol["protocol"],
            fit_data_receipt=fit_data_receipt,
            seed=314159,
            model=model,
        )
        del model
        if hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()
    final_receipts = _validate_frozen_strength_receipts(
        output,
        binding=binding,
        protocol_receipt=protocol["protocol"],
        fit_data_receipt=fit_data_receipt,
        completed_global_epoch=32,
    )
    result = _strength_phase1_result(
        binding=binding,
        protocol=protocol,
        fit_data_receipt=fit_data_receipt,
        spent_v3=spent_v3,
        training_curve=checkpoint["training_curve"],
        final_receipts=final_receipts,
    )
    _atomic_json(output / "result.json", result)
    return result


def _run_strength_phase1(
    args: argparse.Namespace,
    binding: Mapping[str, object],
    protocol: Mapping[str, object],
    *,
    prepared_output_state: str | None = None,
    prepared_checkpoint: Mapping[str, object] | None = None,
) -> dict[str, object]:
    document = protocol["document"]
    training = document.get("phase1_training")
    if type(training) is not dict:
        raise ValueError("strength phase1 training contract is absent")
    registered_output = training.get("output_path")
    if not isinstance(registered_output, str):
        raise ValueError("strength phase1 output path is absent")
    if args.seed != 42 or args.seed42_result is not None:
        raise ValueError("strength phase1 accepts no seed or result override")
    if args.device != "mps" or not torch.backends.mps.is_available():
        raise ValueError("strength phase1 requires available MPS; no CPU fallback")
    if args.torch_threads:
        torch.set_num_threads(args.torch_threads)

    output = _strength_output_path(args.out, registered_output)
    output_state = (
        _strength_output_state(output)
        if prepared_output_state is None
        else prepared_output_state
    )
    preloaded_checkpoint = (
        None if prepared_checkpoint is None else dict(prepared_checkpoint)
    )
    if output_state == "resume" and preloaded_checkpoint is None:
        registered_fit_data_receipt = _fit_only_data_receipt(
            protocol["document"]["data_receipt"]
        )
        preloaded_checkpoint = _load_strength_last_checkpoint(
            output,
            binding=binding,
            protocol_receipt=protocol["protocol"],
            fit_data_receipt=registered_fit_data_receipt,
        )
    if (
        preloaded_checkpoint is not None
        and preloaded_checkpoint["global_epoch"] == 32
    ):
        return _terminalize_strength_phase1(
            args, output, binding, protocol, preloaded_checkpoint
        )
    browser_fit, _browser_tune, v9_fit, _v9_tune, data_receipt = (
        _load_and_partition(args, protocol)
    )
    fit_data_receipt = _fit_only_data_receipt(data_receipt)
    spent_v3 = _validate_spent_v3_result(protocol, data_receipt)

    checkpoint: dict[str, object] | None = None
    if output_state == "resume":
        checkpoint = preloaded_checkpoint
        if checkpoint is None or (
            checkpoint.get("fit_data_receipt") != fit_data_receipt
        ):
            raise ValueError("strength phase1 fit data receipt mismatch")
        boundary_seed = (
            checkpoint["seed"]
            if checkpoint["global_epoch"] in (16, 32)
            else None
        )
        boundary_path = (
            output / f"seed-{boundary_seed}-final.pt"
            if boundary_seed is not None
            else None
        )
        _validate_frozen_strength_receipts(
            output,
            binding=binding,
            protocol_receipt=protocol["protocol"],
            fit_data_receipt=fit_data_receipt,
            completed_global_epoch=(
                checkpoint["global_epoch"] - 1
                if boundary_path is not None and not boundary_path.exists()
                else checkpoint["global_epoch"]
            ),
        )
        if boundary_path is not None and not boundary_path.exists():
            recovery_model, recovery_optimizer = (
                _resume_strength_model_optimizer(binding, args, checkpoint)
            )
            _freeze_strength_checkpoint(
                output,
                binding=binding,
                protocol_receipt=protocol["protocol"],
                fit_data_receipt=fit_data_receipt,
                seed=boundary_seed,
                model=recovery_model,
            )
            del recovery_optimizer, recovery_model
            if hasattr(torch.mps, "empty_cache"):
                torch.mps.empty_cache()
            _validate_frozen_strength_receipts(
                output,
                binding=binding,
                protocol_receipt=protocol["protocol"],
                fit_data_receipt=fit_data_receipt,
                completed_global_epoch=checkpoint["global_epoch"],
            )
    next_step = _strength_next_step(checkpoint)
    training_curve: list[Mapping[str, object]] = (
        list(checkpoint["training_curve"]) if checkpoint is not None else []
    )

    model: cpv.OfflineCapacityPolicyValue | None = None
    optimizer: torch.optim.Optimizer | None = None
    active_seed: int | None = None
    if (
        checkpoint is not None
        and next_step is not None
        and next_step[0] == checkpoint["seed"]
    ):
        model, optimizer = _resume_strength_model_optimizer(
            binding, args, checkpoint
        )
        active_seed = checkpoint["seed"]

    while next_step is not None:
        seed, phase, epoch = next_step
        if seed != active_seed:
            if optimizer is not None or model is not None:
                del optimizer, model
                optimizer = None
                model = None
                if hasattr(torch.mps, "empty_cache"):
                    torch.mps.empty_cache()
            model, optimizer = _new_strength_model_optimizer(
                binding, args, seed=seed
            )
            active_seed = seed
        if model is None or optimizer is None:
            raise ValueError("strength phase1 optimizer state is absent")
        if phase == "v9":
            row = _v9_epoch(
                model,
                optimizer,
                v9_fit,
                epoch=epoch,
                seed=seed,
                objective=cpv.OBJECTIVE_V2,
                args=args,
            )
        else:
            v9_order = sorted(v9_fit, key=lambda group: group.parent_id)
            random.Random(seed + epoch * 65_537).shuffle(v9_order)
            selected_v9 = v9_order[: 3 * len(browser_fit)]
            row = _paired_epoch(
                model,
                optimizer,
                browser_fit,
                selected_v9,
                epoch=epoch,
                seed=seed,
                equal_domain_weight=False,
                objective=cpv.OBJECTIVE_V2,
                args=args,
            )
        curve_row = {"seed": seed, "phase": phase, **row}
        training_curve.append(curve_row)
        _save_strength_last_checkpoint(
            output,
            binding=binding,
            protocol_receipt=protocol["protocol"],
            fit_data_receipt=fit_data_receipt,
            spent_development_evidence=spent_v3,
            seed=seed,
            phase=phase,
            completed_epoch=epoch,
            model=model,
            optimizer=optimizer,
            training_curve=training_curve,
        )
        print(json.dumps(curve_row, sort_keys=True), flush=True)
        if phase == "mixed" and epoch == 12:
            _freeze_strength_checkpoint(
                output,
                binding=binding,
                protocol_receipt=protocol["protocol"],
                fit_data_receipt=fit_data_receipt,
                seed=seed,
                model=model,
            )
        next_step = _strength_step_from_index(
            _strength_step_index(seed, phase, epoch) + 1
        ) if _strength_step_index(seed, phase, epoch) < 32 else None

    if checkpoint is not None and checkpoint["global_epoch"] in (16, 32):
        final_seed = checkpoint["seed"]
        final_path = output / f"seed-{final_seed}-final.pt"
        if not final_path.exists():
            model, optimizer = _resume_strength_model_optimizer(
                binding, args, checkpoint
            )
            _freeze_strength_checkpoint(
                output,
                binding=binding,
                protocol_receipt=protocol["protocol"],
                fit_data_receipt=fit_data_receipt,
                seed=final_seed,
                model=model,
            )
            del optimizer, model
            if hasattr(torch.mps, "empty_cache"):
                torch.mps.empty_cache()

    final_receipts = _validate_frozen_strength_receipts(
        output,
        binding=binding,
        protocol_receipt=protocol["protocol"],
        fit_data_receipt=fit_data_receipt,
        completed_global_epoch=32,
    )
    if [receipt["seed"] for receipt in final_receipts] != [42, 314159]:
        raise ValueError("strength phase1 final seed order mismatch")
    result = _strength_phase1_result(
        binding=binding,
        protocol=protocol,
        fit_data_receipt=fit_data_receipt,
        spent_v3=spent_v3,
        training_curve=training_curve,
        final_receipts=final_receipts,
    )
    _atomic_json(output / "result.json", result)
    return result


def run(args: argparse.Namespace) -> dict[str, object]:
    binding = _protocol_binding(args.protocol)
    if _is_strength_phase1(binding):
        identity = _verified_protocol_identity(binding)
        training = identity["document"].get("phase1_training")
        if type(training) is not dict or not isinstance(
            training.get("output_path"), str
        ):
            raise ValueError("strength phase1 output path is absent")
        output = _strength_output_path(args.out, training["output_path"])
        if args.seed != 42 or args.seed42_result is not None:
            raise ValueError("strength phase1 accepts no seed or result override")
        if args.device != "mps" or not torch.backends.mps.is_available():
            raise ValueError(
                "strength phase1 requires available MPS; no CPU fallback"
            )
        if args.torch_threads:
            torch.set_num_threads(args.torch_threads)
        output_state = _strength_output_state(output)
        checkpoint = None
        if output_state == "resume":
            registered_fit_data_receipt = _fit_only_data_receipt(
                identity["document"]["data_receipt"]
            )
            checkpoint = _load_strength_last_checkpoint(
                output,
                binding=binding,
                protocol_receipt=identity["protocol"],
                fit_data_receipt=registered_fit_data_receipt,
            )
            if checkpoint["global_epoch"] == 32:
                return _terminalize_strength_phase1(
                    args, output, binding, identity, checkpoint
                )
        protocol = _verify_protocol(args)
        return _run_strength_phase1(
            args,
            binding,
            protocol,
            prepared_output_state=output_state,
            prepared_checkpoint=checkpoint,
        )
    protocol = _verify_protocol(args)
    objective = protocol.get("objective", cpv.OBJECTIVE_V1)
    if not isinstance(objective, str):
        raise ValueError("capacity objective binding is malformed")
    result_schema = binding.get("result_schema")
    model_class = binding.get("model_class")
    feature_version = binding.get("feature_version")
    if (
        not isinstance(result_schema, str)
        or not isinstance(model_class, type)
        or not issubclass(model_class, cpv.OfflineCapacityPolicyValue)
        or not isinstance(feature_version, str)
    ):
        raise ValueError("capacity execution binding is malformed")
    last_checkpoint_metadata = _last_checkpoint_model_metadata(binding)
    best_checkpoint_metadata = _checkpoint_model_metadata(
        binding, detailed=True
    )
    if args.seed not in (42, 314159):
        raise ValueError("capacity model seed is not registered")
    if args.seed == 314159 and not args.seed42_result:
        raise ValueError("second capacity seed requires the first result")
    if args.device != "mps" or not torch.backends.mps.is_available():
        raise ValueError("capacity diagnostic requires available MPS; no CPU fallback")
    if args.torch_threads:
        torch.set_num_threads(args.torch_threads)
    output = Path(args.out)
    if output.exists():
        raise ValueError("capacity output already exists; use a fresh run path")

    browser_fit, browser_tune, v9_fit, v9_tune, data_receipt = (
        _load_and_partition(args, protocol)
    )
    baseline = _metrics(
        None, browser_tune, v9_tune, args, device="cpu"
    )
    registered_baseline = protocol["document"].get("live_baseline")
    if baseline != registered_baseline:
        raise ValueError("capacity live baseline drift before optimizer")

    sentinel_browser, sentinel_browser_receipt = (
        data_contract.lowest_parent_subset(
            browser_fit, args.sentinel_browser_parents
        )
    )
    sentinel_v9, sentinel_v9_receipt = data_contract.lowest_parent_subset(
        v9_fit, args.sentinel_v9_parents
    )
    registered_sentinel = protocol["document"].get("sentinel")
    observed_sentinel = {
        "browser": sentinel_browser_receipt,
        "v9": sentinel_v9_receipt,
        "semantic_overlap": len(
            lpv.semantic_union(sentinel_browser)
            & lpv.semantic_union(sentinel_v9)
        ),
    }
    if type(registered_sentinel) is not dict or any(
        observed_sentinel.get(key) != registered_sentinel.get(key)
        for key in observed_sentinel
    ):
        raise ValueError("capacity sentinel receipt drift")

    gates = protocol["document"].get("gates")
    if type(gates) is not dict or type(gates.get("sentinel")) is not dict:
        raise ValueError("capacity gates are absent")
    if args.seed == 314159:
        first = _strict_json(args.seed42_result)
        if (
            first.get("status")
            != "complete-capacity-tune-admitted-second-seed"
            or first.get("seed") != 42
        ):
            raise ValueError("first capacity seed did not authorize replication")
        if objective == cpv.OBJECTIVE_V2 and (
            first.get("schema") != result_schema
            or first.get("objective") != objective
            or first.get("protocol") != protocol["protocol"]
        ):
            raise ValueError(
                "first capacity seed used a different objective or protocol"
            )
        first_sentinel = first.get("sentinel")
        if type(first_sentinel) is not dict:
            raise ValueError("first capacity seed lost its sentinel receipt")
        sentinel_curve = first_sentinel.get("curve")
        sentinel_metrics = first_sentinel.get("metrics")
        sentinel_gate = first_sentinel.get("gate")
        if (
            type(sentinel_curve) is not list
            or type(sentinel_metrics) is not dict
            or type(sentinel_gate) is not dict
            or sentinel_gate.get("passed") is not True
        ):
            raise ValueError("first capacity sentinel was not admitted")
    else:
        torch.manual_seed(args.sentinel_seed)
        random.seed(args.sentinel_seed)
        sentinel_model = model_class().to(args.device)
        sentinel_optimizer = torch.optim.AdamW(
            sentinel_model.parameters(),
            lr=args.lr,
            weight_decay=args.weight_decay,
        )
        sentinel_curve = []
        for epoch in range(1, args.sentinel_epochs + 1):
            row = _paired_epoch(
                sentinel_model,
                sentinel_optimizer,
                sentinel_browser,
                sentinel_v9,
                epoch=epoch,
                seed=args.sentinel_seed,
                equal_domain_weight=True,
                objective=objective,
                args=args,
            )
            sentinel_curve.append(row)
            print(
                json.dumps({"phase": "sentinel", **row}, sort_keys=True),
                flush=True,
            )
        sentinel_metrics = _metrics(
            sentinel_model, sentinel_browser, sentinel_v9, args
        )
        sentinel_gate = _sentinel_gate(
            sentinel_metrics, gates["sentinel"]
        )
        del sentinel_optimizer, sentinel_model
        if hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()
    output.mkdir(parents=True)
    if not sentinel_gate["passed"]:
        result = {
            "schema": result_schema,
            "status": "complete-sentinel-rejected",
            **(
                {"objective": objective}
                if objective == cpv.OBJECTIVE_V2
                else {}
            ),
            "protocol": protocol["protocol"],
            "data_receipt": data_receipt,
            "baseline": baseline,
            "sentinel": {
                "curve": sentinel_curve,
                "metrics": sentinel_metrics,
                "gate": sentinel_gate,
                "weights_discarded": True,
            },
            "model_training_started": False,
            "second_seed_authorized": False,
            "sealed_teacher_authorized": False,
            "live_weights_changed": False,
            "wasm_changed": False,
        }
        _atomic_json(output / "result.json", result)
        return result

    torch.manual_seed(args.seed)
    random.seed(args.seed)
    model = model_class().to(args.device)
    optimizer = torch.optim.AdamW(
        model.parameters(), lr=args.lr, weight_decay=args.weight_decay
    )
    v9_curve: list[dict[str, object]] = []
    for epoch in range(1, args.v9_pretrain_epochs + 1):
        row = _v9_epoch(
            model,
            optimizer,
            v9_fit,
            epoch=epoch,
            seed=args.seed,
            objective=objective,
            args=args,
        )
        v9_curve.append(row)
        print(json.dumps({"phase": "v9", **row}, sort_keys=True), flush=True)

    mixed_curve: list[dict[str, object]] = []
    best_key = (float("-inf"), float("-inf"), float("-inf"))
    best_epoch = 0
    best_state: dict[str, torch.Tensor] | None = None
    best_metrics: dict[str, dict[str, float | int]] | None = None
    for epoch in range(1, args.mixed_epochs + 1):
        v9_order = sorted(v9_fit, key=lambda group: group.parent_id)
        random.Random(args.seed + epoch * 65_537).shuffle(v9_order)
        selected_v9 = v9_order[: 3 * len(browser_fit)]
        row = _paired_epoch(
            model,
            optimizer,
            browser_fit,
            selected_v9,
            epoch=epoch,
            seed=args.seed,
            equal_domain_weight=False,
            objective=objective,
            args=args,
        )
        tune = _metrics(model, browser_tune, v9_tune, args)
        row["tune"] = tune
        mixed_curve.append(row)
        key = (
            float(tune["browser"]["top1_accuracy"])
            - float(baseline["browser"]["top1_accuracy"]),
            float(tune["browser"]["pair_accuracy"])
            - float(baseline["browser"]["pair_accuracy"]),
            float(tune["v9"]["top1_accuracy"])
            - float(baseline["v9"]["top1_accuracy"]),
        )
        if key > best_key:
            best_key = key
            best_epoch = epoch
            best_metrics = tune
            best_state = {
                name: value.detach().cpu().clone()
                for name, value in model.state_dict().items()
            }
        _atomic_torch_save(
            output / "last.pt",
            {
                **last_checkpoint_metadata,
                **(
                    {"objective": objective}
                    if objective == cpv.OBJECTIVE_V2
                    else {}
                ),
                "seed": args.seed,
                "phase": "mixed",
                "completed_epoch": epoch,
                "model": model.state_dict(),
                "optimizer": optimizer.state_dict(),
                "best_epoch": best_epoch,
                "best_state": best_state,
                "best_metrics": best_metrics,
                "protocol": protocol,
                "data_receipt": data_receipt,
                "cpu_rng": torch.get_rng_state(),
            },
        )
        print(json.dumps({"phase": "mixed", **row}, sort_keys=True), flush=True)
    if best_state is None or best_metrics is None:
        raise ValueError("capacity epoch selection produced no checkpoint")
    model.load_state_dict(best_state, strict=True)
    tune_gate = _capacity_gate(
        best_metrics,
        baseline,
        gates["capacity_tune"],
    )
    _atomic_torch_save(
        output / "best.pt",
        {
            **best_checkpoint_metadata,
            **(
                {"objective": objective}
                if objective == cpv.OBJECTIVE_V2
                else {}
            ),
            "seed": args.seed,
            "selected_epoch": best_epoch,
            "model": best_state,
            "metrics": best_metrics,
            "gate": tune_gate,
            "protocol": protocol,
            "data_receipt": data_receipt,
        },
    )
    best_identity = _fingerprint(output / "best.pt")
    first_seed_admitted = args.seed == 42 and bool(tune_gate["passed"])
    replication_admitted = args.seed == 314159 and bool(tune_gate["passed"])
    status = (
        "complete-capacity-tune-admitted-second-seed"
        if first_seed_admitted
        else "complete-capacity-replication-admitted-sealed-teacher"
        if replication_admitted
        else "complete-capacity-tune-rejected"
    )
    result = {
        "schema": result_schema,
        "status": status,
        **(
            {"objective": objective}
            if objective == cpv.OBJECTIVE_V2
            else {}
        ),
        "seed": args.seed,
        "protocol": protocol["protocol"],
        "data_receipt": data_receipt,
        "baseline": baseline,
        "sentinel": {
            "curve": sentinel_curve,
            "metrics": sentinel_metrics,
            "gate": sentinel_gate,
            "weights_discarded": True,
        },
        "training": {
            "v9_curve": v9_curve,
            "mixed_curve": mixed_curve,
            "selected_epoch": best_epoch,
        },
        "candidate": {
            "metrics": best_metrics,
            "gate": tune_gate,
            "checkpoint": best_identity,
        },
        "second_seed_authorized": first_seed_admitted,
        "sealed_teacher_authorized": replication_admitted,
        "claim_boundary": (
            "offline-known-tune-capacity-only-not-playing-strength-rank-"
            "runtime-distillation-or-deployment-evidence"
        ),
        "live_weights_changed": False,
        "wasm_changed": False,
        "matches_started": False,
    }
    _atomic_json(output / "result.json", result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--live-nnue", required=True)
    parser.add_argument("--browser-data", required=True)
    parser.add_argument("--v9-data", required=True)
    parser.add_argument("--protected-ids", action="append", required=True)
    parser.add_argument("--known-eval-sibling", action="append", required=True)
    parser.add_argument("--known-eval-scalar", action="append", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--seed42-result")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--split-seed", type=int, default=42)
    parser.add_argument("--tune-modulus", type=int, default=5)
    parser.add_argument("--sentinel-seed", type=int, default=20260726)
    parser.add_argument("--sentinel-epochs", type=int, default=40)
    parser.add_argument("--sentinel-browser-parents", type=int, default=256)
    parser.add_argument("--sentinel-v9-parents", type=int, default=1024)
    parser.add_argument("--v9-pretrain-epochs", type=int, default=4)
    parser.add_argument("--mixed-epochs", type=int, default=12)
    parser.add_argument("--browser-batch", type=int, default=32)
    parser.add_argument("--v9-batch", type=int, default=256)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--temperature-cp", type=float, default=100.0)
    parser.add_argument("--pair-gap-cp", type=float, default=50.0)
    parser.add_argument("--best-margin-cp", type=float, default=50.0)
    parser.add_argument("--gradient-clip", type=float, default=5.0)
    parser.add_argument("--device", choices=("mps",), default="mps")
    parser.add_argument("--torch-threads", type=int, default=4)
    args = parser.parse_args()
    if len(args.protected_ids) != 2:
        print("[capacity] STOP: exactly two protected-ID inputs are required")
        return 1
    for name in (
        "lr",
        "weight_decay",
        "temperature_cp",
        "pair_gap_cp",
        "best_margin_cp",
        "gradient_clip",
    ):
        value = getattr(args, name)
        if not math.isfinite(value) or value <= 0:
            print(f"[capacity] STOP: {name} must be finite and positive")
            return 1
    try:
        result = run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[capacity] STOP: {error}", flush=True)
        return 1
    print(
        json.dumps(
            {"status": result["status"], "seed": result.get("seed")},
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
