#!/usr/bin/env python3
"""export-weights.py — 学習済みチェックポイントを自作エンジン用に int16 量子化してエクスポートする。

出力 (デフォルト: チェックポイントと同じディレクトリ):
  - weights.bin       : int16 リトルエンディアンのフラット配列 (下記レイアウト)
  - weights.meta.json : 次元・スケール・レイアウト情報
  - weights.json      : (--json 指定時) メタ情報 + フラット配列を含む単一 JSON

量子化スキーム (NNUE 風の固定小数点):
  - 活性値は 0..127 (= 実数 0..1 を 127 倍) の int で表現する。
  - 第1層: w1_q = round(w1 * 127), b1_q = round(b1 * 127)
      acc = Σ w1_q[active] + Σ w1_hand_q[i] * hand_count[i] + b1_q   (int32)
      h1  = clamp(acc, 0, 127)
  - 第2層: w2_q = round(w2 * 64), b2_q = round(b2 * 127 * 64)
      h2 = clamp((w2_q @ h1 + b2_q) >> 6, 0, 127)
  - 第3層: w3_q = round(w3 * 64), b3_q = round(b3 * 127 * 64)
      out_q = w3_q @ h2 + b3_q          (= 実数出力 * 127 * 64)
      cp    = out_q * K / (127 * 64)    (K は学習時の sigmoid スケール, メタに記録)

weights.bin のレイアウト (すべて int16 LE, ただし bias は int32 LE):
  [w1_board  int16 x (2268*256)]  (feature-major: w1_board[f*256 + j])
  [w1_hand   int16 x (14*256)]    (feature-major)
  [b1        int32 x 256]
  [w2        int16 x (32*256)]    (row-major: w2[i*256 + j], 出力 i)
  [b2        int32 x 32]
  [w3        int16 x 32]
  [b3        int32 x 1]

使い方:
  ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/smoke/best.pt [--json]
  ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/smoke/best.pt --verify ml/data/teacher.jsonl
"""

import argparse
import array
import json
import os
import sys

import torch

# train.py の定義を再利用
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "train", os.path.join(os.path.dirname(os.path.abspath(__file__)), "train.py")
)
_train = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_train)

DistillNet = _train.DistillNet
parse_sfen = _train.parse_sfen
BOARD_FEATS = _train.BOARD_FEATS
HAND_FEATS = _train.HAND_FEATS
PAD_IDX = _train.PAD_IDX

ACT_SCALE = 127  # 活性値 1.0 の固定小数点表現
W_SCALE = 64  # 第2層以降の重みスケール


def quantize(model: DistillNet, k_sigmoid: float):
    with torch.no_grad():
        w1_board = model.board.weight[:BOARD_FEATS]  # (2268, 256)
        w1_hand = model.hand.weight.t().contiguous()  # (14, 256)
        b1 = model.hand.bias  # (256,)
        w2, b2 = model.l2.weight, model.l2.bias  # (32,256), (32,)
        w3, b3 = model.l3.weight.squeeze(0), model.l3.bias  # (32,), (1,)

        q = {
            "w1_board": torch.round(w1_board * ACT_SCALE).clamp(-32768, 32767).to(torch.int16),
            "w1_hand": torch.round(w1_hand * ACT_SCALE).clamp(-32768, 32767).to(torch.int16),
            "b1": torch.round(b1 * ACT_SCALE).to(torch.int32),
            "w2": torch.round(w2 * W_SCALE).clamp(-32768, 32767).to(torch.int16),
            "b2": torch.round(b2 * ACT_SCALE * W_SCALE).to(torch.int32),
            "w3": torch.round(w3 * W_SCALE).clamp(-32768, 32767).to(torch.int16),
            "b3": torch.round(b3 * ACT_SCALE * W_SCALE).to(torch.int32),
        }
    meta = {
        "format": "shogi-distill-v1",
        "arch": "2282->256->32->1 ClippedReLU",
        "dims": {"board_feats": BOARD_FEATS, "hand_feats": HAND_FEATS, "h1": 256, "h2": 32},
        "scales": {"act": ACT_SCALE, "w2": W_SCALE, "w3": W_SCALE},
        "k_sigmoid": k_sigmoid,
        "cp_formula": f"cp = out_q * {k_sigmoid} / {ACT_SCALE * W_SCALE}",
        "layout": [
            "w1_board int16 x board_feats*256 (feature-major)",
            "w1_hand int16 x 14*256 (feature-major)",
            "b1 int32 x 256",
            "w2 int16 x 32*256 (row-major)",
            "b2 int32 x 32",
            "w3 int16 x 32",
            "b3 int32 x 1",
        ],
    }
    return q, meta


def int_forward(q, board_idx, hands):
    """量子化整数演算のシミュレーション (エンジン実装の参照仕様)。"""
    acc = q["b1"].clone()  # int32 (256,)
    for f in board_idx:
        if f == PAD_IDX:
            continue
        acc += q["w1_board"][f].to(torch.int32)
    for i, c in enumerate(hands):
        if c:
            acc += q["w1_hand"][i].to(torch.int32) * int(c)
    h1 = acc.clamp(0, ACT_SCALE)  # (256,)

    a2 = (q["w2"].to(torch.int32) @ h1) + q["b2"]
    h2 = (a2 >> 6).clamp(0, ACT_SCALE)  # (32,)

    out_q = int((q["w3"].to(torch.int32) * h2).sum().item() + q["b3"].item())
    return out_q


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--out-dir", default=None)
    ap.add_argument("--json", action="store_true", help="weights.json (フラット配列入り) も出力")
    ap.add_argument("--verify", default=None, help="JSONL を与えると float vs int の cp 誤差を検証")
    ap.add_argument("--verify-n", type=int, default=200)
    args = ap.parse_args()

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    k_sigmoid = float(ckpt.get("arch", {}).get("k", 600.0))
    model = DistillNet()
    model.load_state_dict(ckpt["model"])
    model.eval()

    out_dir = args.out_dir or os.path.dirname(os.path.abspath(args.ckpt))
    os.makedirs(out_dir, exist_ok=True)

    q, meta = quantize(model, k_sigmoid)

    # --- weights.bin ---
    bin_path = os.path.join(out_dir, "weights.bin")
    with open(bin_path, "wb") as f:
        for name, dtype in [
            ("w1_board", "h"), ("w1_hand", "h"), ("b1", "i"),
            ("w2", "h"), ("b2", "i"), ("w3", "h"), ("b3", "i"),
        ]:
            # 巨大テンソルを struct.pack(*flat) で引数展開すると引数上限に達し得るため
            # array モジュールでまとめてバイト列化する(レイアウトは LE 固定)。
            arr = array.array(dtype, q[name].flatten().tolist())
            assert arr.itemsize == (2 if dtype == "h" else 4), (
                f"unexpected itemsize {arr.itemsize} for '{dtype}'"
            )
            if sys.byteorder == "big":
                arr.byteswap()
            f.write(arr.tobytes())
    meta_path = os.path.join(out_dir, "weights.meta.json")
    with open(meta_path, "w") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"[export] wrote {bin_path} ({os.path.getsize(bin_path)} bytes)")
    print(f"[export] wrote {meta_path}")

    # --- weights.json (任意) ---
    if args.json:
        payload = dict(meta)
        payload["weights"] = {k: v.flatten().tolist() for k, v in q.items()}
        json_path = os.path.join(out_dir, "weights.json")
        with open(json_path, "w") as f:
            json.dump(payload, f, ensure_ascii=False)
        print(f"[export] wrote {json_path} ({os.path.getsize(json_path)} bytes)")

    # --- 検証: float モデル vs 整数シミュレーション ---
    if args.verify:
        import math

        cp_unit = k_sigmoid / (ACT_SCALE * W_SCALE)
        diffs, n = [], 0
        with open(args.verify) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                idx, hands, _ = parse_sfen(rec["sfen"])
                pad = idx[:40] + [PAD_IDX] * (40 - len(idx))
                with torch.no_grad():
                    out_f = model(
                        torch.tensor([pad], dtype=torch.long),
                        torch.tensor([hands], dtype=torch.float32),
                    ).item()
                cp_float = out_f * k_sigmoid
                cp_int = int_forward(q, pad, hands) * cp_unit
                diffs.append(abs(cp_float - cp_int))
                n += 1
                if n >= args.verify_n:
                    break
        if diffs:
            mean_d = sum(diffs) / len(diffs)
            print(f"[export] verify n={n}: mean |cp_float - cp_int| = {mean_d:.2f}cp, max = {max(diffs):.2f}cp")
        else:
            print("[export] verify: no valid positions found in verify file — skipped")


if __name__ == "__main__":
    main()
