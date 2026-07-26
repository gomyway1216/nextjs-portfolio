#!/usr/bin/env python3
"""Run the preregistered explicit listwise policy/value pilot.

The runner consumes only existing authenticated sibling data.  It never
generates teacher labels, edits the production NNUE, changes WASM, or launches
matches.  A passing result authorizes only a later research-WASM root ordering
gate; a failed static gate closes this exact feature/loss recipe.
"""

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

import listwise_policy_value as lpv


def _strict_json_file(path: str | Path) -> dict[str, object]:
    raw = Path(path).read_bytes()

    def reject_constant(value: str) -> None:
        raise ValueError(f"{path}: invalid JSON constant {value}")

    value = json.loads(raw, parse_constant=reject_constant)
    if type(value) is not dict:
        raise ValueError(f"{path}: expected a JSON object")
    return value


def _atomic_json(path: Path, value: Mapping[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _validate_args(args: argparse.Namespace) -> None:
    if (
        args.epochs < 1
        or args.batch_parents < 4
        or args.seed < 0
        or args.tune_modulus < 3
        or args.v9_per_browser < 1
    ):
        raise ValueError("invalid discrete training control")
    for name in (
        "lr",
        "temperature_cp",
        "pair_gap_cp",
        "value_weight",
        "pair_weight",
        "residual_l2_weight",
    ):
        value = getattr(args, name)
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"{name} must be finite and non-negative")
    if args.lr <= 0 or args.temperature_cp <= 0 or args.pair_gap_cp <= 0:
        raise ValueError("lr, temperature_cp, and pair_gap_cp must be positive")
    if args.batch_parents % (args.v9_per_browser + 1):
        raise ValueError(
            "batch_parents must be divisible by v9_per_browser + 1"
        )


def _protocol_receipt(args: argparse.Namespace) -> dict[str, object]:
    protocol_path = Path(args.protocol)
    raw = protocol_path.read_bytes()
    protocol = _strict_json_file(protocol_path)
    if protocol.get("schema") != lpv.PROTOCOL_SCHEMA:
        raise ValueError("listwise policy/value protocol schema mismatch")
    inputs = protocol.get("inputs")
    training = protocol.get("training")
    gates = protocol.get("static_gates")
    partition = protocol.get("semantic_partition")
    if not all(type(value) is dict for value in (inputs, training, gates, partition)):
        raise ValueError("protocol is missing inputs/training/gates/partition")

    bindings = {
        "live_nnue": args.live_nnue,
        "v9_training": args.v9_data,
        "browser_training": args.browser_data,
        "browser_reject": args.browser_reject_data,
        "v9_reject": args.v9_reject_data,
    }
    verified: dict[str, object] = {}
    for role, path in bindings.items():
        expected = inputs.get(role)
        if type(expected) is not dict:
            raise ValueError(f"protocol input {role} is absent")
        actual = lpv.file_fingerprint(path)
        if (
            actual["bytes"] != expected.get("bytes")
            or actual["sha256"] != expected.get("sha256")
        ):
            raise ValueError(f"protocol input {role} identity mismatch")
        verified[role] = actual

    exact = {
        "epochs": args.epochs,
        "batch_parents": args.batch_parents,
        "learning_rate": args.lr,
        "temperature_cp": args.temperature_cp,
        "pair_gap_cp": args.pair_gap_cp,
        "value_weight": args.value_weight,
        "pair_weight": args.pair_weight,
        "residual_l2_weight": args.residual_l2_weight,
        "v9_per_browser": args.v9_per_browser,
        "tune_modulus": args.tune_modulus,
        "seed": args.seed,
    }
    for key, actual in exact.items():
        expected = training.get(key)
        if type(actual) is not type(expected) or actual != expected:
            raise ValueError(
                f"protocol training mismatch {key}: "
                f"expected {expected!r}, got {actual!r}"
            )
    return {
        "protocol": {
            "path": str(protocol_path.resolve()),
            "bytes": len(raw),
            "sha256": hashlib.sha256(raw).hexdigest(),
        },
        "inputs": verified,
        "registered_inputs": inputs,
        "semantic_partition": partition,
        "static_gates": gates,
        "claim_boundary": protocol.get("claim_boundary"),
    }


def _verify_loaded_source(
    observed: Mapping[str, object],
    registered: Mapping[str, object],
    role: str,
) -> None:
    for key in ("bytes", "sha256", "rows", "parents", "games"):
        expected = registered.get(key)
        if expected is not None and observed.get(key) != expected:
            raise ValueError(
                f"{role} loaded {key} mismatch: "
                f"expected {expected!r}, got {observed.get(key)!r}"
            )


def _partition_sources(
    v9: Sequence[lpv.ParentGroup],
    browser: Sequence[lpv.ParentGroup],
    browser_reject: Sequence[lpv.ParentGroup],
    v9_reject: Sequence[lpv.ParentGroup],
    expected: Mapping[str, object],
) -> tuple[list[lpv.ParentGroup], list[lpv.ParentGroup], dict[str, object]]:
    protected = lpv.semantic_union(browser_reject) | lpv.semantic_union(v9_reject)
    browser_kept, browser_dropped = lpv.filter_semantic_conflicts(
        browser, protected
    )
    v9_protected = protected | lpv.semantic_union(browser_kept)
    v9_kept, v9_dropped = lpv.filter_semantic_conflicts(v9, v9_protected)
    overlap = lpv.semantic_union(browser_kept) & lpv.semantic_union(v9_kept)
    if overlap:
        raise ValueError("training domains retain semantic overlap")
    actual = {
        "browser_training_parents_kept": len(browser_kept),
        "browser_training_parents_dropped": len(browser_dropped),
        "v9_training_parents_kept": len(v9_kept),
        "v9_training_parents_dropped": len(v9_dropped),
        "training_domain_semantic_overlap": len(overlap),
        "browser_dropped_parent_ids_sha256": hashlib.sha256(
            "\n".join(sorted(browser_dropped)).encode()
        ).hexdigest(),
        "v9_dropped_parent_ids_sha256": hashlib.sha256(
            "\n".join(sorted(v9_dropped)).encode()
        ).hexdigest(),
    }
    for key, value in actual.items():
        wanted = expected.get(key)
        if wanted is not None and wanted != value:
            raise ValueError(
                f"semantic partition mismatch {key}: "
                f"expected {wanted!r}, got {value!r}"
            )
    return v9_kept, browser_kept, actual


def _mixed_epoch_batches(
    v9: Sequence[lpv.ParentGroup],
    browser: Sequence[lpv.ParentGroup],
    *,
    epoch: int,
    seed: int,
    batch_parents: int,
    v9_per_browser: int,
) -> list[list[lpv.ParentGroup]]:
    """Visit every browser parent once and a rotating V9 sample per epoch."""

    browser_per_batch = batch_parents // (v9_per_browser + 1)
    v9_per_batch = batch_parents - browser_per_batch
    browser_order = list(browser)
    random.Random(seed + epoch).shuffle(browser_order)
    required_v9 = (
        math.ceil(len(browser_order) / browser_per_batch) * v9_per_batch
    )
    if required_v9 > len(v9):
        raise ValueError("one mixed epoch requires more V9 parents than available")
    v9_order = list(v9)
    random.Random(seed + 10_000 + epoch).shuffle(v9_order)
    selected_v9 = v9_order[:required_v9]
    batches: list[list[lpv.ParentGroup]] = []
    cursor = 0
    for start in range(0, len(browser_order), browser_per_batch):
        browser_batch = browser_order[start : start + browser_per_batch]
        v9_count = min(v9_per_batch, len(selected_v9) - cursor)
        v9_batch = selected_v9[cursor : cursor + v9_count]
        cursor += v9_count
        combined = browser_batch + v9_batch
        random.Random(seed + epoch * 100_000 + start).shuffle(combined)
        batches.append(combined)
    return batches


def _full_epoch_batches(
    v9: Sequence[lpv.ParentGroup],
    browser: Sequence[lpv.ParentGroup],
    *,
    epoch: int,
    seed: int,
    batch_parents: int,
) -> list[list[lpv.ParentGroup]]:
    """Visit every retained parent exactly once in a deterministic epoch."""

    combined = list(v9) + list(browser)
    if not combined:
        raise ValueError("full refit cannot use zero parents")
    random.Random(seed + epoch).shuffle(combined)
    return [
        combined[start : start + batch_parents]
        for start in range(0, len(combined), batch_parents)
    ]


def _evaluate_domains(
    model: lpv.ExplicitResidualPolicy | None,
    domains: Mapping[str, Sequence[lpv.ParentGroup]],
    *,
    device: str,
    batch_size: int,
    pair_gap_cp: float,
) -> dict[str, dict[str, float | int]]:
    return {
        name: lpv.score_groups(
            model,
            groups,
            device=device,
            batch_size=batch_size,
            pair_gap_cp=pair_gap_cp,
        )
        for name, groups in domains.items()
    }


def _train_epochs(
    model: lpv.ExplicitResidualPolicy,
    v9: Sequence[lpv.ParentGroup],
    browser: Sequence[lpv.ParentGroup],
    tune_domains: Mapping[str, Sequence[lpv.ParentGroup]],
    base_tune: Mapping[str, Mapping[str, float | int]],
    args: argparse.Namespace,
    *,
    epochs: int,
    scheduler_t_max: int,
    record_selection: bool,
    use_all_parents: bool,
    seed_offset: int = 0,
) -> tuple[
    list[dict[str, object]],
    int | None,
    dict[str, torch.Tensor] | None,
]:
    if epochs < 1 or scheduler_t_max < epochs:
        raise ValueError("scheduler horizon must cover every trained epoch")
    model = model.to(args.device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-5)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=scheduler_t_max
    )
    curve: list[dict[str, object]] = []
    best_key = (float("-inf"), float("-inf"), float("-inf"))
    best_epoch: int | None = None
    best_state: dict[str, torch.Tensor] | None = None
    for epoch in range(1, epochs + 1):
        started = time.monotonic()
        model.train()
        total = 0.0
        batches = 0
        component_sums = {
            "policy": 0.0,
            "value": 0.0,
            "pair": 0.0,
            "residual_l2": 0.0,
        }
        epoch_batches = (
            _full_epoch_batches(
                v9,
                browser,
                epoch=epoch,
                seed=args.seed + seed_offset,
                batch_parents=args.batch_parents,
            )
            if use_all_parents
            else _mixed_epoch_batches(
                v9,
                browser,
                epoch=epoch,
                seed=args.seed + seed_offset,
                batch_parents=args.batch_parents,
                v9_per_browser=args.v9_per_browser,
            )
        )
        for groups in epoch_batches:
            batch = lpv.make_batch(groups, args.device)
            combined, residual = model(batch)
            loss, components = lpv.listwise_policy_value_loss(
                combined,
                residual,
                batch["teacher_cp"],
                batch["valid"],
                temperature_cp=args.temperature_cp,
                pair_gap_cp=args.pair_gap_cp,
                value_weight=args.value_weight,
                pair_weight=args.pair_weight,
                residual_l2_weight=args.residual_l2_weight,
            )
            if not bool(torch.isfinite(loss).item()):
                raise ValueError("training produced a non-finite loss")
            optimizer.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 10.0)
            optimizer.step()
            total += float(loss.detach().cpu().item())
            for name, value in components.items():
                component_sums[name] += float(value.detach().cpu().item())
            batches += 1
        scheduler.step()
        tune = (
            _evaluate_domains(
                model,
                tune_domains,
                device=args.device,
                batch_size=args.batch_parents,
                pair_gap_cp=args.pair_gap_cp,
            )
            if record_selection
            else {}
        )
        row: dict[str, object] = {
            "epoch": epoch,
            "loss": total / batches,
            "components": {
                name: value / batches for name, value in component_sums.items()
            },
            "learning_rate": scheduler.get_last_lr()[0],
            "tune": tune,
            "seconds": time.monotonic() - started,
        }
        curve.append(row)
        print(json.dumps(row, sort_keys=True), flush=True)
        if record_selection:
            key = lpv.selection_key(tune, base_tune)
            if key > best_key:
                best_key = key
                best_epoch = epoch
                best_state = {
                    name: tensor.detach().cpu().clone()
                    for name, tensor in model.state_dict().items()
                }
    return curve, best_epoch, best_state


def _verify_registered_live_baselines(
    base: Mapping[str, Mapping[str, float | int]],
    gates: Mapping[str, object],
) -> None:
    """Fail closed on baseline drift before any optimizer is constructed."""

    registered_baselines = gates.get("registered_live_baselines")
    if type(registered_baselines) is not dict:
        raise ValueError("static gate has no registered live baselines")
    for domain in ("browser_reject", "v9_reject"):
        expected = registered_baselines.get(domain)
        if type(expected) is not dict:
            raise ValueError(f"missing registered live baseline {domain}")
        for metric in (
            "parents",
            "top1_correct",
            "top1_accuracy",
            "pair_count",
            "pair_accuracy",
            "mean_regret_cp",
        ):
            observed = base[domain][metric]
            wanted = expected.get(metric)
            tolerance = 1e-12 if isinstance(wanted, float) else 0
            if (
                not isinstance(wanted, (int, float))
                or abs(float(observed) - float(wanted)) > tolerance
            ):
                raise ValueError(
                    f"live baseline drift {domain}.{metric}: "
                    f"expected {wanted!r}, got {observed!r}"
                )


def _static_gate(
    base: Mapping[str, Mapping[str, float | int]],
    quantized: Mapping[str, Mapping[str, float | int]],
    floating: Mapping[str, Mapping[str, float | int]],
    export: Mapping[str, object],
    gates: Mapping[str, object],
) -> dict[str, object]:
    checks: dict[str, dict[str, object]] = {}
    _verify_registered_live_baselines(base, gates)
    thresholds = gates.get("thresholds")
    if type(thresholds) is not dict:
        raise ValueError("static gate has no thresholds")
    for domain in ("browser_reject", "v9_reject"):
        domain_gate = thresholds.get(domain)
        if type(domain_gate) is not dict:
            raise ValueError(f"static gate threshold missing {domain}")
        checks[f"{domain}_top1"] = {
            "observed": quantized[domain]["top1_correct"],
            "required_minimum": domain_gate["minimum_top1_correct"],
        }
        checks[f"{domain}_pair"] = {
            "observed": quantized[domain]["pair_accuracy"],
            "required_minimum": domain_gate["minimum_pair_accuracy"],
        }
        checks[f"{domain}_regret_non_regression"] = {
            "observed": quantized[domain]["mean_regret_cp"],
            "allowed_maximum": base[domain]["mean_regret_cp"],
        }
        checks[f"{domain}_quantized_top1_loss"] = {
            "observed": int(floating[domain]["top1_correct"])
            - int(quantized[domain]["top1_correct"]),
            "allowed_maximum": gates["maximum_quantized_top1_parent_loss"],
        }
        checks[f"{domain}_quantized_pair_drop"] = {
            "observed": float(floating[domain]["pair_accuracy"])
            - float(quantized[domain]["pair_accuracy"]),
            "allowed_maximum": gates["maximum_quantized_pair_drop"],
        }
    checks["artifact_bytes"] = {
        "observed": export["bytes"],
        "allowed_maximum": gates["maximum_artifact_bytes"],
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


def run(args: argparse.Namespace) -> dict[str, object]:
    _validate_args(args)
    output = Path(args.out)
    if output.exists():
        raise ValueError(f"output already exists: {output}")
    protocol = _protocol_receipt(args)
    device = args.device
    if device == "auto":
        device = (
            "cuda"
            if torch.cuda.is_available()
            else "mps" if torch.backends.mps.is_available() else "cpu"
        )
    if device == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS requested but unavailable")
    if device == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA requested but unavailable")
    args.device = device
    torch.manual_seed(args.seed)
    random.seed(args.seed)
    if args.torch_threads:
        torch.set_num_threads(args.torch_threads)

    qweights = lpv.read_live_board_qweights(args.live_nnue)
    source_specs = (
        ("v9_training", args.v9_data, "v9", "train"),
        (
            "browser_training",
            args.browser_data,
            "browser-all-legal",
            "train",
        ),
        (
            "browser_reject",
            args.browser_reject_data,
            "browser-all-legal",
            "val",
        ),
        ("v9_reject", args.v9_reject_data, "v9-selection", "val"),
    )
    groups: dict[str, list[lpv.ParentGroup]] = {}
    loaded_sources: dict[str, object] = {}
    for name, path, role, split in source_specs:
        loaded, source = lpv.load_groups(
            path,
            role=role,
            expected_split=split,
            qweights=qweights,
        )
        registered = protocol["registered_inputs"][name]
        if type(registered) is not dict:
            raise ValueError(f"registered input {name} disappeared")
        _verify_loaded_source(source, registered, name)
        groups[name] = loaded
        loaded_sources[name] = source

    reject_domains = {
        "browser_reject": groups["browser_reject"],
        "v9_reject": groups["v9_reject"],
    }
    base_reject = _evaluate_domains(
        None,
        reject_domains,
        device=device,
        batch_size=args.batch_parents,
        pair_gap_cp=args.pair_gap_cp,
    )
    gates = protocol["static_gates"]
    if type(gates) is not dict:
        raise AssertionError("protocol gates disappeared")
    _verify_registered_live_baselines(base_reject, gates)

    partition_expected = protocol["semantic_partition"]
    if type(partition_expected) is not dict:
        raise AssertionError("protocol partition disappeared")
    v9_train, browser_train, partition = _partition_sources(
        groups["v9_training"],
        groups["browser_training"],
        groups["browser_reject"],
        groups["v9_reject"],
        partition_expected,
    )
    v9_fit, v9_tune, v9_split = lpv.split_by_semantic_components(
        v9_train, seed=args.seed, tune_modulus=args.tune_modulus
    )
    browser_fit, browser_tune, browser_split = lpv.split_by_semantic_components(
        browser_train, seed=args.seed, tune_modulus=args.tune_modulus
    )
    registered_splits = partition_expected.get("fit_tune_registered_receipts")
    if type(registered_splits) is not dict:
        raise ValueError("registered fit/tune receipts are absent")
    for domain, actual in (("v9", v9_split), ("browser", browser_split)):
        if registered_splits.get(domain) != actual:
            raise ValueError(f"{domain} fit/tune component receipt drift")
    if {group.game_id for group in v9_fit} & {group.game_id for group in v9_tune}:
        raise ValueError("V9 fit/tune game leakage")
    if {group.game_id for group in browser_fit} & {
        group.game_id for group in browser_tune
    }:
        raise ValueError("browser fit/tune game leakage")
    if lpv.semantic_union(v9_fit) & lpv.semantic_union(v9_tune):
        raise ValueError("V9 fit/tune semantic leakage")
    if lpv.semantic_union(browser_fit) & lpv.semantic_union(browser_tune):
        raise ValueError("browser fit/tune semantic leakage")

    tune_domains = {"v9": v9_tune, "browser": browser_tune}
    base_tune = _evaluate_domains(
        None,
        tune_domains,
        device=device,
        batch_size=args.batch_parents,
        pair_gap_cp=args.pair_gap_cp,
    )
    selection_model = lpv.ExplicitResidualPolicy()
    curve, best_epoch, best_state = _train_epochs(
        selection_model,
        v9_fit,
        browser_fit,
        tune_domains,
        base_tune,
        args,
        epochs=args.epochs,
        scheduler_t_max=args.epochs,
        record_selection=True,
        use_all_parents=False,
    )
    if best_epoch is None or best_state is None:
        raise ValueError("epoch selection produced no checkpoint")

    torch.manual_seed(args.seed)
    refit_model = lpv.ExplicitResidualPolicy()
    refit_curve, _unused_epoch, _unused_state = _train_epochs(
        refit_model,
        v9_train,
        browser_train,
        {},
        {},
        args,
        epochs=best_epoch,
        scheduler_t_max=args.epochs,
        record_selection=False,
        use_all_parents=True,
    )
    output.mkdir(parents=True)
    torch.save(
        {
            "schema": lpv.SCHEMA,
            "feature_version": lpv.FEATURE_VERSION,
            "model": refit_model.state_dict(),
            "selected_epoch": best_epoch,
            "protocol": protocol,
            "sources": loaded_sources,
            "semantic_partition": partition,
        },
        output / "best.pt",
    )

    float_reject = _evaluate_domains(
        refit_model,
        reject_domains,
        device=device,
        batch_size=args.batch_parents,
        pair_gap_cp=args.pair_gap_cp,
    )
    quantized_model, export = lpv.quantize_export(
        refit_model, output / "quantized"
    )
    quantized_model = quantized_model.to(device)
    quantized_reject = _evaluate_domains(
        quantized_model,
        reject_domains,
        device=device,
        batch_size=args.batch_parents,
        pair_gap_cp=args.pair_gap_cp,
    )
    static_gate = _static_gate(
        base_reject, quantized_reject, float_reject, export, gates
    )
    result = {
        "schema": lpv.RESULT_SCHEMA,
        "status": (
            "complete-static-admitted-research-runtime-not-authorized"
            if static_gate["passed"]
            else "complete-static-rejected"
        ),
        "claim_boundary": (
            "static-policy-ordering-proxy-only-not-playing-strength-live-weight-"
            "runtime-integration-or-deployment-evidence"
        ),
        "device": device,
        "protocol": protocol,
        "sources": loaded_sources,
        "semantic_partition": partition,
        "fit_tune": {
            "v9_fit": len(v9_fit),
            "v9_tune": len(v9_tune),
            "browser_fit": len(browser_fit),
            "browser_tune": len(browser_tune),
            "v9_receipt": v9_split,
            "browser_receipt": browser_split,
        },
        "training": {
            "selection_curve": curve,
            "selected_epoch": best_epoch,
            "refit_curve": refit_curve,
        },
        "baseline": {"tune": base_tune, "reject": base_reject},
        "float": float_reject,
        "quantized": quantized_reject,
        "export": export,
        "static_gate": static_gate,
        "live_nnue_changed": False,
        "wasm_changed": False,
        "public_asset_changed": False,
        "teacher_generation_started": False,
        "matches_started": False,
        "required_next_gate": (
            "research-wasm-root-only-node-count-and-wall-time-gate"
            if static_gate["passed"]
            else None
        ),
        "stop_rule": (
            None
            if static_gate["passed"]
            else "close-this-explicit-feature-loss-recipe-without-runtime-integration-or-match"
        ),
    }
    _atomic_json(output / "result.json", result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--protocol", required=True)
    parser.add_argument("--live-nnue", required=True)
    parser.add_argument("--v9-data", required=True)
    parser.add_argument("--browser-data", required=True)
    parser.add_argument("--browser-reject-data", required=True)
    parser.add_argument("--v9-reject-data", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--epochs", type=int, default=8)
    parser.add_argument("--batch-parents", type=int, default=64)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--temperature-cp", type=float, default=100.0)
    parser.add_argument("--pair-gap-cp", type=float, default=50.0)
    parser.add_argument("--value-weight", type=float, default=0.25)
    parser.add_argument("--pair-weight", type=float, default=0.10)
    parser.add_argument("--residual-l2-weight", type=float, default=0.02)
    parser.add_argument("--v9-per-browser", type=int, default=3)
    parser.add_argument("--tune-modulus", type=int, default=5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--device", choices=("auto", "cpu", "mps", "cuda"), default="auto"
    )
    parser.add_argument("--torch-threads", type=int, default=4)
    args = parser.parse_args()
    try:
        result = run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[listwise-policy-value] STOP: {error}", flush=True)
        return 1
    print(
        json.dumps(
            {"status": result["status"], "static_gate": result["static_gate"]},
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
