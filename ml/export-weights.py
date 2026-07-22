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
  [w1_board  int16 x (BF*256)]    (feature-major: w1_board[f*256 + j])
  [w1_hand   int16 x (HF*256)]    (feature-major)
  [b1        int32 x 256]
  [w2        int16 x (32*256)]    (row-major: w2[i*256 + j], 出力 i)
  [b2        int32 x 32]
  [w3        int16 x 32]
  [b3        int32 x 1]
  BF/HF = 2268/14 (--features board), 6*2268/6*14 (--features kp),
  または 81*2268/81*14 (--features halfkp, 正規化自玉升順)。
  KP でもレイアウト構造は同一で、サイズだけがバケット数倍になる (ヘッダなし)。

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

from int16_forward import (
    ACT_SCALE,
    W_SCALE,
    int16_forward as _shared_int16_forward,
    quantize_model,
)

# train.py の定義を再利用
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "train", os.path.join(os.path.dirname(os.path.abspath(__file__)), "train.py")
)
_train = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_train)

DistillNet = _train.DistillNet
parse_sfen = _train.parse_sfen
kp_bucket = _train.kp_bucket
BOARD_FEATS = _train.BOARD_FEATS
HAND_FEATS = _train.HAND_FEATS
KP_BUCKETS = _train.KP_BUCKETS
HALFKP_BUCKETS = _train.HALFKP_BUCKETS
feature_bucket = _train.feature_bucket
PAD_IDX = _train.PAD_IDX


def write_tensor_little_endian(
    target,
    tensor: torch.Tensor,
    typecode: str,
    *,
    chunk_elements: int = 262_144,
) -> None:
    """Write one flat integer tensor without constructing a full Python list.

    HalfKP's first table has about 47 million int16 values.  Keeping conversion
    bounded to small chunks avoids a multi-gigabyte temporary list while
    preserving the historical array-module byte encoding exactly.
    """
    if type(chunk_elements) is not int or chunk_elements <= 0:
        raise ValueError("chunk_elements must be a positive integer")
    flat = tensor.detach().cpu().contiguous().view(-1)
    expected_itemsize = (
        2 if typecode == "h" else 4 if typecode == "i" else None
    )
    if expected_itemsize is None:
        raise ValueError(f"unsupported export typecode: {typecode!r}")
    for start in range(0, flat.numel(), chunk_elements):
        values = array.array(typecode, flat[start : start + chunk_elements].tolist())
        if values.itemsize != expected_itemsize:
            raise RuntimeError(
                f"unexpected itemsize {values.itemsize} for {typecode!r}"
            )
        if sys.byteorder == "big":
            values.byteswap()
        target.write(values.tobytes())


def quantize(model: DistillNet, k_sigmoid: float):
    board_feats = model.board_feats
    hand_feats = model.hand_feats
    # Export and QAT share this exact quantizer; this wrapper preserves the
    # public exporter API and all historical bytes/metadata.
    q = quantize_model(model)
    kp = getattr(model, "kp", False)
    dual = bool(getattr(model, "dual", False))
    bucket_count = int(
        getattr(model, "bucket_count", KP_BUCKETS if kp else 1)
    )
    meta = {
        "format": (
            "shogi-distill-v3-dual-halfkp"
            if dual
            else "shogi-distill-v2"
            if kp
            else "shogi-distill-v1"
        ),
        "features": model.features,
        "kp_buckets": bucket_count,
        "arch": (
            "shared(184842->256)x2->32->32->1 ClippedReLU"
            if dual
            else f"{board_feats + hand_feats}->256->32->1 ClippedReLU"
        ),
        "dims": {
            "board_feats": board_feats,
            "hand_feats": hand_feats,
            "h1": 256,
            "h2": 32,
            **({"perspectives": 2, "h3": 32} if dual else {}),
        },
        "scales": {
            "act": ACT_SCALE,
            "w2": W_SCALE,
            "w3": W_SCALE,
            **({"w4": W_SCALE} if dual else {}),
        },
        "k_sigmoid": k_sigmoid,
        "cp_formula": f"cp = out_q * {k_sigmoid} / {ACT_SCALE * W_SCALE}",
        "layout": [
            f"w1_board int16 x {board_feats}*256 (feature-major)",
            f"w1_hand int16 x {hand_feats}*256 (feature-major)",
            "b1 int32 x 256",
            f"w2 int16 x 32*{512 if dual else 256} (row-major)",
            "b2 int32 x 32",
            *(
                [
                    "w3 int16 x 32*32 (row-major)",
                    "b3 int32 x 32",
                    "w4 int16 x 32",
                    "b4 int32 x 1",
                ]
                if dual
                else ["w3 int16 x 32", "b3 int32 x 1"]
            ),
        ],
    }
    return q, meta


def int_forward(q, board_idx, hands, pad_idx=PAD_IDX):
    """量子化整数演算のシミュレーション (エンジン実装の参照仕様)。

    KP モデルでは board_idx はバケットオフセット込み、hands は拡張済み (len=84,
    自玉バケットのセグメントのみ非ゼロ)、pad_idx=バケット数*2268 を渡す。
    """
    return _shared_int16_forward(q, board_idx, hands, pad_idx)


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
    features = ckpt.get("arch", {}).get("features", "board")
    model = DistillNet(features)
    model.load_state_dict(ckpt["model"])
    model.eval()

    out_dir = args.out_dir or os.path.dirname(os.path.abspath(args.ckpt))
    os.makedirs(out_dir, exist_ok=True)

    q, meta = quantize(model, k_sigmoid)

    # --- weights.bin ---
    bin_path = os.path.join(out_dir, "weights.bin")
    with open(bin_path, "wb") as f:
        layout = [
            ("w1_board", "h"), ("w1_hand", "h"), ("b1", "i"),
            ("w2", "h"), ("b2", "i"), ("w3", "h"), ("b3", "i"),
        ]
        if model.dual:
            layout.extend((("w4", "h"), ("b4", "i")))
        for name, dtype in layout:
            write_tensor_little_endian(f, q[name], dtype)
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
        cp_unit = k_sigmoid / (ACT_SCALE * W_SCALE)
        diffs, n = [], 0
        with open(args.verify) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                # train.py と同様、壊れ行(書き込み中断の末尾行など)はスキップして継続する
                try:
                    rec = json.loads(line)
                    if model.dual:
                        idx, hands, _, king_sq = _train.parse_sfen_dual(rec["sfen"])
                    else:
                        idx, hands, _, king_sq = parse_sfen(rec["sfen"])
                except (json.JSONDecodeError, KeyError, TypeError, ValueError):
                    continue
                bucket = [0, 0] if model.dual else 0
                if model.kp:
                    if model.dual and any(king < 0 for king in king_sq):
                        continue
                    if not model.dual and king_sq < 0:
                        continue
                    if model.dual:
                        bucket = [
                            feature_bucket(model.features, view_king)
                            for view_king in king_sq
                        ]
                        idx = [
                            [bucket[view] * BOARD_FEATS + feature for feature in idx[view]]
                            for view in range(2)
                        ]
                    else:
                        bucket = feature_bucket(model.features, king_sq)
                        idx = [bucket * BOARD_FEATS + f for f in idx]
                if model.dual:
                    pad = [
                        view[:40] + [model.pad_idx] * (40 - len(view)) for view in idx
                    ]
                else:
                    pad = idx[:40] + [model.pad_idx] * (40 - len(idx))
                if model.dual:
                    hands_x = [[0.0] * model.hand_feats for _ in range(2)]
                    for view in range(2):
                        start = bucket[view] * HAND_FEATS
                        hands_x[view][start : start + HAND_FEATS] = hands[view]
                elif model.kp:
                    hands_x = [0.0] * model.hand_feats
                    hands_x[bucket * HAND_FEATS : (bucket + 1) * HAND_FEATS] = hands
                else:
                    hands_x = hands
                with torch.no_grad():
                    out_f = model(
                        torch.tensor([pad], dtype=torch.long),
                        torch.tensor([hands], dtype=torch.float32),
                        torch.tensor([bucket], dtype=torch.long),
                    ).item()
                cp_float = out_f * k_sigmoid
                cp_int = int_forward(q, pad, hands_x, model.pad_idx) * cp_unit
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
