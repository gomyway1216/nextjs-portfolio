#!/usr/bin/env python3
"""eval-holdout.py — 共通ホールドアウトで複数チェックポイントを比較する。

各モデルについて以下を計測して表を出力する (training-report-2.md と同じ指標):
  - MAE / median (ロジット空間×K, 教師cpは±3000クランプ)
  - pair_acc (固定シードの200,000ランダムペアのうち教師cp差>100のペアで
    予測ロジットの大小が教師と一致する率)
  - |cp|バケット別 MAE (0-300 / 300-1000 / 1000-3000 / 3000+)

使い方:
  ml/venv/bin/python ml/eval-holdout.py --data ml/data/holdout-1m-4k.jsonl \
      --ckpt base=ml/runs/run1m-base/best.pt kp6=ml/runs/run1m-kp6/best.pt
"""

import argparse
import importlib.util
import json
import os

import torch

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("train", os.path.join(_HERE, "train.py"))
_train = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_train)

DistillNet = _train.DistillNet
load_dataset = _train.load_dataset

BUCKET_EDGES = [(0, 300), (300, 1000), (1000, 3000), (3000, 10 ** 9)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--ckpt", nargs="+", required=True, help="name=path 形式で複数指定")
    ap.add_argument("--k", type=float, default=600.0)
    ap.add_argument("--cp-clamp", type=int, default=3000)
    ap.add_argument("--pairs", type=int, default=200000)
    ap.add_argument("--pair-seed", type=int, default=43)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    # 生 |cp| (バケット分類用, クランプ前) を読む
    raw_cp = []
    with open(args.data) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                raw_cp.append(abs(int(json.loads(line)["cp"])))
            except (json.JSONDecodeError, KeyError, ValueError, TypeError):
                continue

    results = {}
    pairs = None
    for spec in args.ckpt:
        name, path = spec.split("=", 1)
        ckpt = torch.load(path, map_location="cpu", weights_only=True)
        features = ckpt.get("arch", {}).get("features", "board")
        k = float(ckpt.get("arch", {}).get("k", args.k))
        model = DistillNet(features)
        model.load_state_dict(ckpt["model"])
        model.eval().to(args.device)

        board, hands, y, cp, bucket = load_dataset(args.data, k, args.cp_clamp, 0, features)
        n = y.shape[0]
        assert n == len(raw_cp), f"{name}: dataset rows {n} != raw rows {len(raw_cp)} (kpで玉なし局面がskipされた?)"

        outs = []
        with torch.no_grad():
            for i in range(0, n, 4096):
                out = model(
                    board[i : i + 4096].to(args.device),
                    hands[i : i + 4096].to(args.device),
                    bucket[i : i + 4096].to(args.device),
                )
                outs.append(out.cpu())
        out = torch.cat(outs)

        err = (out * k - cp).abs()  # 教師cpはクランプ済み → ロジット×K と直接比較
        if pairs is None:
            gen = torch.Generator().manual_seed(args.pair_seed)
            pi = torch.randint(0, n, (args.pairs,), generator=gen)
            pj = torch.randint(0, n, (args.pairs,), generator=gen)
            mask = (cp[pi] - cp[pj]).abs() > 100.0
            pairs = (pi[mask], pj[mask])
            print(f"[eval] n={n} pairs(|Δcp|>100)={pairs[0].shape[0]}")
        pi, pj = pairs
        pair_acc = (((out[pi] - out[pj]) * (cp[pi] - cp[pj])) > 0).float().mean().item()

        raw = torch.tensor(raw_cp, dtype=torch.float32)
        bucket_mae = []
        for lo, hi in BUCKET_EDGES:
            m = (raw >= lo) & (raw < hi)
            bucket_mae.append(err[m].mean().item() if int(m.sum()) else float("nan"))

        results[name] = {
            "features": features,
            "mae": err.mean().item(),
            "median": err.median().item(),
            "pair_acc": pair_acc,
            "buckets": bucket_mae,
        }

    hdr = f"{'model':14s} {'feat':6s} {'MAE':>7s} {'median':>7s} {'pair_acc':>8s}" + "".join(
        f" {lo}-{hi if hi < 10**9 else '+':>4}" for lo, hi in BUCKET_EDGES
    )
    print(hdr)
    for name, r in results.items():
        print(
            f"{name:14s} {r['features']:6s} {r['mae']:7.1f} {r['median']:7.1f} {r['pair_acc']:8.4f}"
            + "".join(f" {b:8.0f}" for b in r["buckets"])
        )


if __name__ == "__main__":
    main()
