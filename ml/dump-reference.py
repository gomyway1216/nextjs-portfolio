#!/usr/bin/env python3
"""dump-reference.py — 学習済みチェックポイントから検証用の参照値 JSON を出力する。

エンジン (WASM) 側の NNUE 推論を実重みで検証するためのファイルを作る:
各検証局面について
  - float モデル出力 (logit) と cp_float = logit * K
  - int16 量子化シミュレーション out_q (export-weights.py int_forward と同一)
  - cp_int = trunc(out_q * K_int / (127*64))  (エンジンの nnueEvaluateCp と同一の
    整数切り捨て演算, K_int = round(K))
を JSON に吐く。out_q はエンジンの nnueEvaluate() と完全一致しなければならない。

使い方 (torch 必須):
  ml/venv/bin/python ml/dump-reference.py --ckpt ml/runs/smoke/best.pt \
      --data ml/data/teacher.jsonl --out ml/runs/smoke/reference.json [--n 200]

その後 (torch 不要):
  ml/venv/bin/python ml/export-weights.py --ckpt ml/runs/smoke/best.pt
  node -r tsx/cjs wasm-spike/nnue-verify-reference.ts \
      ml/runs/smoke/weights.bin ml/runs/smoke/reference.json
"""

import argparse
import importlib.util
import json
import os

import torch

_HERE = os.path.dirname(os.path.abspath(__file__))


def _load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_HERE, filename))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_train = _load_module("train", "train.py")
_export = _load_module("export_weights", "export-weights.py")

DistillNet = _train.DistillNet
parse_sfen = _train.parse_sfen
kp_bucket = _train.kp_bucket
BOARD_FEATS = _train.BOARD_FEATS
HAND_FEATS = _train.HAND_FEATS
PAD_IDX = _train.PAD_IDX
MAX_PIECES = _train.MAX_PIECES
quantize = _export.quantize
int_forward = _export.int_forward
ACT_SCALE = _export.ACT_SCALE
W_SCALE = _export.W_SCALE


def trunc_div(a: int, b: int) -> int:
    """C/i64-style integer division (truncation toward zero, b > 0)."""
    q = abs(a) // b
    return q if a >= 0 else -q


def iter_sfens(path: str):
    """Yield sfen strings from a teacher JSONL ({"sfen": ...}) or plain-text file."""
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            if line.startswith("{"):
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                sfen = rec.get("sfen")
                if sfen:
                    yield sfen
            else:
                yield line


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ckpt", required=True)
    ap.add_argument("--data", required=True, help="検証局面 (teacher.jsonl または sfen 行のテキスト)")
    ap.add_argument("--out", default=None, help="出力 JSON (デフォルト: ckpt と同じディレクトリの reference.json)")
    ap.add_argument("--n", type=int, default=200, help="検証局面数")
    args = ap.parse_args()

    ckpt = torch.load(args.ckpt, map_location="cpu", weights_only=True)
    k_sigmoid = float(ckpt.get("arch", {}).get("k", 600.0))
    k_int = int(round(k_sigmoid))
    features = ckpt.get("arch", {}).get("features", "board")
    model = DistillNet(features)
    model.load_state_dict(ckpt["model"])
    model.eval()

    q, _meta = quantize(model, k_sigmoid)

    positions = []
    for sfen in iter_sfens(args.data):
        idx, hands, _, king_sq = parse_sfen(sfen)
        bucket = 0
        if model.kp:
            if king_sq < 0:
                continue
            bucket = kp_bucket(king_sq // 9 + 1, king_sq % 9 + 1)
            idx = [bucket * BOARD_FEATS + f for f in idx]
        pad = idx[:MAX_PIECES] + [model.pad_idx] * (MAX_PIECES - len(idx))
        if model.kp:
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
        out_q = int_forward(q, pad, hands_x, model.pad_idx)
        positions.append(
            {
                "sfen": sfen,
                "float_logit": out_f,
                "cp_float": out_f * k_sigmoid,
                "out_q": int(out_q),
                "cp_int": trunc_div(int(out_q) * k_int, ACT_SCALE * W_SCALE),
            }
        )
        if len(positions) >= args.n:
            break

    out_path = args.out or os.path.join(os.path.dirname(os.path.abspath(args.ckpt)), "reference.json")
    payload = {
        "format": "shogi-distill-reference-v1",
        "features": features,
        "ckpt": os.path.abspath(args.ckpt),
        "k_sigmoid": k_sigmoid,
        "k_int": k_int,
        "cp_unit": k_sigmoid / (ACT_SCALE * W_SCALE),
        "n": len(positions),
        "positions": positions,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    print(f"[dump-reference] wrote {out_path} ({len(positions)} positions, K={k_sigmoid})")


if __name__ == "__main__":
    main()
