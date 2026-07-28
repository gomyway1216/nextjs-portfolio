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
RESULT_SCHEMA = "shogi-capacity-policy-value-result-v1"
RESULT_SCHEMA_V2 = "shogi-capacity-policy-value-result-v2"
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
    "de420c4d5fbd9b8b9571971afd53af8371b0ce93728d34a499bb65a329fc3a21"
)

PROTOCOL_BINDINGS = (
    {
        "path": TRACKED_PROTOCOL_PATH,
        "sha256": TRACKED_PROTOCOL_SHA256,
        "schema": PROTOCOL_SCHEMA,
        "status": "prospective-capacity-diagnostic-only",
        "objective": cpv.OBJECTIVE_V1,
    },
    {
        "path": TRACKED_PROTOCOL_V2_PATH,
        "sha256": TRACKED_PROTOCOL_V2_SHA256,
        "schema": PROTOCOL_SCHEMA_V2,
        "status": "prospective-objective-v2-capacity-diagnostic-only",
        "objective": cpv.OBJECTIVE_V2,
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


def _verify_protocol(args: argparse.Namespace) -> dict[str, object]:
    binding = _protocol_binding(args.protocol)
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
    architecture = protocol.get("architecture")
    if type(architecture) is not dict:
        raise ValueError("capacity protocol architecture is absent")
    if (
        architecture.get("parameters")
        != cpv.OfflineCapacityPolicyValue.parameter_count()
        or architecture.get("feature_version") != cpv.FEATURE_VERSION
    ):
        raise ValueError("capacity architecture drift")

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

    registered_training = protocol.get("training")
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
        "split_seed": args.split_seed,
        "tune_modulus": args.tune_modulus,
        "sentinel_seed": args.sentinel_seed,
        "sentinel_epochs": args.sentinel_epochs,
        "sentinel_browser_parents": args.sentinel_browser_parents,
        "sentinel_v9_parents": args.sentinel_v9_parents,
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
    for key, value in actual_training.items():
        if registered_training.get(key) != value:
            raise ValueError(
                f"capacity training control {key} drift: "
                f"{registered_training.get(key)!r} != {value!r}"
            )
    seeds = registered_training.get("seeds")
    if type(seeds) is not list or args.seed not in seeds:
        raise ValueError("capacity model seed is not registered")
    verified = {
        "protocol": {
            "path": str(tracked_path.resolve()),
            "bytes": len(raw),
            "sha256": actual_protocol_sha,
        },
        "document": protocol,
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
        groups, device, pad_moves_to=pad_moves_to
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


def run(args: argparse.Namespace) -> dict[str, object]:
    protocol = _verify_protocol(args)
    objective = protocol.get("objective", cpv.OBJECTIVE_V1)
    if not isinstance(objective, str):
        raise ValueError("capacity objective binding is malformed")
    result_schema = (
        RESULT_SCHEMA_V2
        if objective == cpv.OBJECTIVE_V2
        else RESULT_SCHEMA
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
            first.get("schema") != RESULT_SCHEMA_V2
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
        sentinel_model = cpv.OfflineCapacityPolicyValue().to(args.device)
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
    model = cpv.OfflineCapacityPolicyValue().to(args.device)
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
                "schema": cpv.SCHEMA,
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
            "schema": cpv.SCHEMA,
            "feature_version": cpv.FEATURE_VERSION,
            "parameters": cpv.OfflineCapacityPolicyValue.parameter_count(),
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
