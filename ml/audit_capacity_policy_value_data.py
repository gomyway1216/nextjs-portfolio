#!/usr/bin/env python3
"""Produce the pre-optimization data and live-baseline receipt."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path

import capacity_policy_value as cpv
import capacity_policy_value_data as data_contract
import listwise_policy_value as lpv


def _atomic_json(path: Path, value: dict[str, object]) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def run(args: argparse.Namespace) -> dict[str, object]:
    if args.split_seed < 0 or args.tune_modulus < 3:
        raise ValueError("invalid capacity split controls")
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
    known_eval_ids, known_eval_receipt = (
        data_contract.read_known_eval_position_ids(
            sibling_paths=args.known_eval_sibling,
            scalar_paths=args.known_eval_scalar,
        )
    )
    protected_sets.append(known_eval_ids)
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
    browser_sentinel, browser_sentinel_receipt = (
        data_contract.lowest_parent_subset(
            browser_fit, args.browser_sentinel_parents
        )
    )
    v9_sentinel, v9_sentinel_receipt = data_contract.lowest_parent_subset(
        v9_fit, args.v9_sentinel_parents
    )
    baseline = {
        "browser_tune": cpv.score_groups(
            None,
            browser_tune,
            device="cpu",
            parent_batch_size=64,
            pair_gap_cp=args.pair_gap_cp,
        ),
        "v9_tune": cpv.score_groups(
            None,
            v9_tune,
            device="cpu",
            parent_batch_size=256,
            pair_gap_cp=args.pair_gap_cp,
        ),
    }
    result: dict[str, object] = {
        "schema": "shogi-capacity-policy-value-data-audit-v1",
        "status": "complete-pre-optimization-audit",
        "model": {
            "schema": cpv.SCHEMA,
            "feature_version": cpv.FEATURE_VERSION,
            "parameters": cpv.OfflineCapacityPolicyValue.parameter_count(),
        },
        "sources": {
            "browser": browser_source,
            "v9": v9_source,
            "protected_position_ids": protected_receipts,
            "known_eval_position_ids": known_eval_receipt,
        },
        "partition": partition,
        "fit_tune": {
            "algorithm": "game-semantic-connected-components-sha256-v1",
            "split_seed": args.split_seed,
            "tune_modulus": args.tune_modulus,
            "browser": browser_split,
            "v9": v9_split,
        },
        "sentinel": {
            "browser": browser_sentinel_receipt,
            "v9": v9_sentinel_receipt,
            "semantic_overlap": len(
                lpv.semantic_union(browser_sentinel)
                & lpv.semantic_union(v9_sentinel)
            ),
        },
        "live_baseline": baseline,
        "optimizer_created": False,
        "model_forward_called": False,
        "teacher_generation_started": False,
        "sealed_labels_opened": False,
        "live_weights_changed": False,
    }
    _atomic_json(Path(args.out), result)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live-nnue", required=True)
    parser.add_argument("--browser-data", required=True)
    parser.add_argument("--v9-data", required=True)
    parser.add_argument(
        "--protected-ids", action="append", required=True
    )
    parser.add_argument(
        "--known-eval-sibling", action="append", required=True
    )
    parser.add_argument(
        "--known-eval-scalar", action="append", required=True
    )
    parser.add_argument("--out", required=True)
    parser.add_argument("--split-seed", type=int, default=42)
    parser.add_argument("--tune-modulus", type=int, default=5)
    parser.add_argument("--browser-sentinel-parents", type=int, default=256)
    parser.add_argument("--v9-sentinel-parents", type=int, default=1024)
    parser.add_argument("--pair-gap-cp", type=float, default=50.0)
    args = parser.parse_args()
    try:
        result = run(args)
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[capacity-data-audit] STOP: {error}", flush=True)
        return 1
    print(json.dumps({"status": result["status"]}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
