#!/usr/bin/env python3
"""mix-opening-data.py — 序盤追い焚き用の教師データ混合スクリプト

既存の教師データ (teacher5m-train) に序盤特化データ (generate-opening-teacher.ts /
generate-teacher.ts --max-ply 32 の出力) を重複排除しつつ混ぜ、
序盤専用ホールドアウトを切り出す。

- 重複排除キー: SFEN の盤面+手番+持ち駒 (手数は無視) — 既存データ優先
- --exclude で既存ホールドアウト (holdout5m-4k) の局面をリークしないよう除外
- 序盤プールから --holdout-n 局面をシャッフルで確保し、残りを train に追記

usage:
  ml/venv/bin/python ml/mix-opening-data.py \
    --base <teacher5m-train.jsonl> --opening ml/data/opening-*.jsonl \
    --exclude <holdout5m-4k.jsonl> \
    --train-out ml/data/runOp1-train.jsonl \
    --holdout-out ml/data/opening-holdout-4k.jsonl --holdout-n 4000
"""

import argparse
import json
import random
import sys
from collections import Counter


def sfen_key(sfen: str) -> str:
    return " ".join(sfen.split(" ")[:3])


def stats(rows, label):
    n = len(rows)
    if n == 0:
        print(f"[mix] {label}: empty")
        return
    plies = [r[1] for r in rows]
    cps = [r[2] for r in rows]
    dec12 = sum(1 for c in cps if abs(c) > 1200) / n
    dec15 = sum(1 for c in cps if abs(c) > 1500) / n
    hist = Counter(p // 8 * 8 for p in plies)
    hist_s = " ".join(f"{k}-{k+7}:{v}" for k, v in sorted(hist.items()))
    print(
        f"[mix] {label}: n={n} ply(mean={sum(plies)/n:.1f}) "
        f"|cp|>1200={dec12*100:.1f}% |cp|>1500={dec15*100:.1f}%"
    )
    print(f"[mix]   ply hist(8刻み): {hist_s}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", required=True)
    ap.add_argument("--opening", nargs="+", required=True)
    ap.add_argument("--exclude", nargs="*", default=[])
    ap.add_argument("--train-out", required=True)
    ap.add_argument("--holdout-out", required=True)
    ap.add_argument("--holdout-n", type=int, default=4000)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    excl = set()
    for p in args.exclude:
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                excl.add(sfen_key(json.loads(line)["sfen"]))
    print(f"[mix] exclude keys: {len(excl)}")

    seen = set()
    n_base = 0
    n_base_cp = [0, 0]  # |cp|>1200, |cp|>1500
    base_ply_sum = 0
    with open(args.train_out, "w", encoding="utf-8") as out:
        with open(args.base, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                seen.add(sfen_key(rec["sfen"]))
                out.write(line + "\n")
                n_base += 1
                base_ply_sum += rec["ply"]
                if abs(rec["cp"]) > 1200:
                    n_base_cp[0] += 1
                if abs(rec["cp"]) > 1500:
                    n_base_cp[1] += 1
        print(
            f"[mix] base: n={n_base} ply(mean={base_ply_sum/max(n_base,1):.1f}) "
            f"|cp|>1200={n_base_cp[0]/max(n_base,1)*100:.1f}% "
            f"|cp|>1500={n_base_cp[1]/max(n_base,1)*100:.1f}%"
        )

        # 序盤プール (line, ply, cp) — 既存/exclude と重複しないもののみ
        pool = []
        n_dup = 0
        n_excl = 0
        for p in args.opening:
            with open(p, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        rec = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    key = sfen_key(rec["sfen"])
                    if key in excl:
                        n_excl += 1
                        continue
                    if key in seen:
                        n_dup += 1
                        continue
                    seen.add(key)
                    pool.append((line, rec["ply"], rec["cp"]))
        print(f"[mix] opening pool: unique={len(pool)} dup-dropped={n_dup} excluded={n_excl}")
        stats(pool, "opening pool")

        if len(pool) <= args.holdout_n:
            print("[mix] ERROR: pool smaller than holdout-n", file=sys.stderr)
            sys.exit(1)
        rng = random.Random(args.seed)
        rng.shuffle(pool)
        holdout = pool[: args.holdout_n]
        train_add = pool[args.holdout_n :]

        with open(args.holdout_out, "w", encoding="utf-8") as hf:
            for line, _, _ in holdout:
                hf.write(line + "\n")
        for line, _, _ in train_add:
            out.write(line + "\n")

    stats(holdout, "opening holdout")
    stats(train_add, "opening train-add")
    n_total = n_base + len(train_add)
    dec12 = (n_base_cp[0] + sum(1 for _, _, c in train_add if abs(c) > 1200)) / n_total
    dec15 = (n_base_cp[1] + sum(1 for _, _, c in train_add if abs(c) > 1500)) / n_total
    print(
        f"[mix] final train: n={n_total} (base {n_base} + opening {len(train_add)}, "
        f"opening share {len(train_add)/n_total*100:.1f}%) "
        f"|cp|>1200={dec12*100:.1f}% |cp|>1500={dec15*100:.1f}%"
    )


if __name__ == "__main__":
    main()
