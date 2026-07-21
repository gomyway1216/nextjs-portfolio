#!/usr/bin/env python3
"""Create Python/Torch int16 reference values for dual HalfKP WASM parity."""

import argparse
import importlib.util
import json
import os
import sys
from pathlib import Path

import torch


ROOT = Path(__file__).resolve().parents[1]
ML = ROOT / "ml"
sys.path.insert(0, str(ML))


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


train = load_module("dual_reference_train", ML / "train.py")
export = load_module("dual_reference_export", ML / "export-weights.py")


def trunc_div(value: int, denominator: int) -> int:
    quotient = abs(value) // denominator
    return quotient if value >= 0 else -quotient


def iter_sfens(path: str):
    with open(path, encoding="utf-8") as source:
        for raw in source:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("{"):
                try:
                    record = json.loads(line)
                except json.JSONDecodeError:
                    continue
                sfen = record.get("sfen")
                if sfen:
                    yield sfen
            else:
                yield line


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ckpt", required=True)
    parser.add_argument("--data", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--n", type=int, default=64)
    args = parser.parse_args()

    checkpoint = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    features = checkpoint.get("arch", {}).get("features", "")
    model = train.DistillNet(features)
    if not model.dual:
        raise ValueError(f"checkpoint is not dual-perspective: {features}")
    model.load_state_dict(checkpoint["model"])
    model.eval()
    k_sigmoid = float(checkpoint.get("arch", {}).get("k", 600.0))
    k_int = int(round(k_sigmoid))
    quantized, _ = export.quantize(model, k_sigmoid)

    positions = []
    with torch.no_grad():
        for sfen in iter_sfens(args.data):
            try:
                indices, hands, _, king_squares = train.parse_sfen_dual(sfen)
                buckets = [
                    train.feature_bucket(features, king_square)
                    for king_square in king_squares
                ]
            except (TypeError, ValueError):
                continue
            bucketed_indices = [
                [bucket * train.BOARD_FEATS + feature for feature in indices[view]]
                for view, bucket in enumerate(buckets)
            ]
            padded = [
                view[: train.MAX_PIECES]
                + [model.pad_idx] * (train.MAX_PIECES - len(view))
                for view in bucketed_indices
            ]
            expanded_hands = [[0.0] * model.hand_feats for _ in range(2)]
            for view, bucket in enumerate(buckets):
                start = bucket * train.HAND_FEATS
                expanded_hands[view][start : start + train.HAND_FEATS] = hands[view]

            float_logit = model(
                torch.tensor([padded], dtype=torch.long),
                torch.tensor([hands], dtype=torch.float32),
                torch.tensor([buckets], dtype=torch.long),
            ).item()
            out_q = int(export.int_forward(quantized, padded, expanded_hands, model.pad_idx))
            positions.append(
                {
                    "sfen": sfen,
                    "float_logit": float_logit,
                    "cp_float": float_logit * k_sigmoid,
                    "out_q": out_q,
                    "cp_int": trunc_div(out_q * k_int, export.ACT_SCALE * export.W_SCALE),
                    "buckets": buckets,
                }
            )
            if len(positions) >= args.n:
                break

    payload = {
        "format": "shogi-distill-dual-reference-v1",
        "features": features,
        "checkpoint": os.path.abspath(args.ckpt),
        "k_sigmoid": k_sigmoid,
        "k_int": k_int,
        "n": len(positions),
        "positions": positions,
    }
    if not positions:
        raise RuntimeError("no valid dual reference positions were produced")
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[dual-reference] wrote {output} ({len(positions)} positions)")


if __name__ == "__main__":
    main()
