#!/usr/bin/env python3
"""eval-holdout.py — 共通ホールドアウトで複数チェックポイントを比較する。

各モデルについて以下を計測して表を出力する:
  - MAE / median (ロジット空間×K, 教師cpは±cp_clampクランプ)
  - pair_acc (固定シードのランダムペアのうち教師cp差>100のペアで
    予測ロジットの大小が教師と一致する率)
  - 互角圏MAE (0<=|cp|<300)
  - 決着圏pair_acc (両局面とも |cp|>1500 のペア。飽和が直ったかの直接指標。
    決着局面で手の優劣を区別できるか)
  - |cp|バケット別 MAE (0-300 / 300-1000 / 1000-3000 / 3000+)

使い方:
  ml/venv/bin/python ml/eval-holdout.py --data ml/data/holdout5m-4k.jsonl \
      --ckpt base5m=ml/runs/run5m-base/best.pt base1m=ml/runs/run1m-base/best.pt
"""

import argparse
import importlib.util
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
    ap.add_argument("--pairs", type=int, default=400000)
    ap.add_argument("--pair-seed", type=int, default=43)
    ap.add_argument("--decisive-cp", type=float, default=1500.0)
    ap.add_argument("--device", default="cpu")
    args = ap.parse_args()

    # データは全モデルで同一（1回だけロード）。cp_clamp は決着圏判定に影響するため
    # クランプ前の raw cp が必要 → clamp を十分大きくロードし、y/err 用には別途クランプ。
    board = hands = cp_raw = None
    results = {}
    pairs100 = None
    pairs_dec = None

    for spec in args.ckpt:
        name, path = spec.split("=", 1)
        ckpt = torch.load(path, map_location="cpu", weights_only=True)
        k = float(ckpt.get("arch", {}).get("k", args.k))
        model = DistillNet()
        model.load_state_dict(ckpt["model"])
        model.eval().to(args.device)

        if board is None:
            # raw cp を保持するため clamp を大きめ (10^9) でロード
            board, hands, _, cp_raw, _ = load_dataset(args.data, k, 10 ** 9)
        n = cp_raw.shape[0]
        # 各モデルの K でクランプ済み cp（誤差評価用）
        cp = cp_raw.clamp(-args.cp_clamp, args.cp_clamp)

        outs = []
        with torch.no_grad():
            for i in range(0, n, 4096):
                out = model(
                    board[i : i + 4096].to(args.device),
                    hands[i : i + 4096].to(args.device),
                )
                outs.append(out.cpu())
        out = torch.cat(outs)

        err = (out * k - cp).abs()

        if pairs100 is None:
            gen = torch.Generator().manual_seed(args.pair_seed)
            pi = torch.randint(0, n, (args.pairs,), generator=gen)
            pj = torch.randint(0, n, (args.pairs,), generator=gen)
            dcp = (cp_raw[pi] - cp_raw[pj]).abs()
            mask100 = dcp > 100.0
            pairs100 = (pi[mask100], pj[mask100])
            # 決着圏ペア: 両局面とも |cp|>decisive かつ 教師cp差>100
            # (符号込みで raw cp を使う。180度視点正規化済みの手番側cp)
            dec = (cp_raw[pi].abs() > args.decisive_cp) & (cp_raw[pj].abs() > args.decisive_cp) & (dcp > 100.0)
            pairs_dec = (pi[dec], pj[dec])
            print(
                f"[eval] n={n} pairs(|Δcp|>100)={pairs100[0].shape[0]} "
                f"decisive-pairs(both|cp|>{int(args.decisive_cp)},|Δcp|>100)={pairs_dec[0].shape[0]}"
            )

        pi, pj = pairs100
        pair_acc = (((out[pi] - out[pj]) * (cp_raw[pi] - cp_raw[pj])) > 0).float().mean().item()

        di, dj = pairs_dec
        if di.shape[0] > 0:
            dec_pair_acc = (((out[di] - out[dj]) * (cp_raw[di] - cp_raw[dj])) > 0).float().mean().item()
        else:
            dec_pair_acc = float("nan")

        # 互角圏MAE (raw |cp| < 300)
        even_m = cp_raw.abs() < 300.0
        even_mae = err[even_m].mean().item() if int(even_m.sum()) else float("nan")

        raw = cp_raw.abs()
        bucket_mae = []
        for lo, hi in BUCKET_EDGES:
            m = (raw >= lo) & (raw < hi)
            bucket_mae.append(err[m].mean().item() if int(m.sum()) else float("nan"))

        results[name] = {
            "k": k,
            "mae": err.mean().item(),
            "median": err.median().item(),
            "pair_acc": pair_acc,
            "even_mae": even_mae,
            "dec_pair_acc": dec_pair_acc,
            "buckets": bucket_mae,
        }

    hdr = (
        f"{'model':14s} {'K':>5s} {'MAE':>7s} {'median':>7s} {'pair_acc':>8s} "
        f"{'even<300MAE':>11s} {'dec>1500pacc':>12s}"
        + "".join(f" {lo}-{hi if hi < 10**9 else 'inf':>4}" for lo, hi in BUCKET_EDGES)
    )
    print(hdr)
    for name, r in results.items():
        print(
            f"{name:14s} {r['k']:5.0f} {r['mae']:7.1f} {r['median']:7.1f} {r['pair_acc']:8.4f} "
            f"{r['even_mae']:11.1f} {r['dec_pair_acc']:12.4f}"
            + "".join(f" {b:8.0f}" for b in r["buckets"])
        )


if __name__ == "__main__":
    main()
