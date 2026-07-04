#!/usr/bin/env python3
"""train.py — 蒸留学習: やねうら王(NNUE/Háo)の評価値を教師に小型NNを学習する。

依存: PyTorch のみ (numpy 不要)。

入力特徴 (手番側視点, 計2282次元):
  - 盤面: 28プレーン x 81マス = 2268 (one-hot)
      プレーン 0..13  = 手番側の駒 (FU,KY,KE,GI,KI,KA,HI,OU,TO,NY,NK,NG,UM,RY)
      プレーン 14..27 = 相手側の駒 (同順)
      マス index = (suji-1)*9 + (dan-1)   ※後手番のときは盤を180度回転して手番側視点に正規化
  - 持ち駒: 手番側 7種 + 相手側 7種 = 14 (枚数そのまま, float)

ネットワーク: 2282 -> 256 -> 32 -> 1 (全結合, 活性化 ClippedReLU = clamp(x,0,1))
ターゲット:   y = sigmoid(cp / K)  (cp は手番側視点, K=600, cp は ±3000 にクランプ)
損失:         MSE(sigmoid(out), y)   → 推論時は cp ≈ out * K

使い方:
  ml/venv/bin/python ml/train.py --data ml/data/teacher.jsonl --out ml/runs/smoke --epochs 20
"""

import argparse
import json
import math
import os
import random
import time

import torch
import torch.nn as nn
import torch.nn.functional as F

# ---------------------------------------------------------------------------
# SFEN パーサ → 特徴量
# ---------------------------------------------------------------------------

# SFEN 文字 → 駒種 index (0..13)。成駒は '+' プレフィクス。
PIECE_INDEX = {"P": 0, "L": 1, "N": 2, "S": 3, "G": 4, "B": 5, "R": 6, "K": 7}
PROMOTED_INDEX = {"P": 8, "L": 9, "N": 10, "S": 11, "G": 12, "B": 13, "R": 14}
# 成駒 index: TO=8, NY=9, NK=10, NG=11, UM=13(Bの成), RY=14(Rの成)
# → 14種に詰める: [FU,KY,KE,GI,KI,KA,HI,OU,TO,NY,NK,NG,UM,RY]
#    idx  0   1   2   3   4   5   6   7   8   9   10  11  12  13
PROMOTED_REMAP = {8: 8, 9: 9, 10: 10, 11: 11, 13: 12, 14: 13}  # UM->12, RY->13

HAND_ORDER = "PLNSGBR"  # 持ち駒 7 種

NUM_PLANES = 28
NUM_SQ = 81
BOARD_FEATS = NUM_PLANES * NUM_SQ  # 2268
HAND_FEATS = 14
INPUT_DIM = BOARD_FEATS + HAND_FEATS  # 2282
PAD_IDX = BOARD_FEATS  # EmbeddingBag の padding 用ダミー index
MAX_PIECES = 40  # 盤上の駒は最大 40


def parse_sfen(sfen: str):
    """SFEN → (board_indices: list[int], hands: list[float](14), stm_black: bool)

    board_indices は手番側視点に正規化済みの active feature index (0..2267)。
    """
    parts = sfen.split()
    board_s, turn_s, hand_s = parts[0], parts[1], parts[2]
    black_to_move = turn_s == "b"

    indices = []
    dan = 1
    for row in board_s.split("/"):
        suji = 9
        i = 0
        while i < len(row):
            c = row[i]
            if c.isdigit():
                suji -= int(c)
                i += 1
                continue
            promoted = False
            if c == "+":
                promoted = True
                i += 1
                c = row[i]
            upper = c.upper()
            is_black = c.isupper()
            if promoted:
                kind = PROMOTED_REMAP[PROMOTED_INDEX[upper]]
            else:
                kind = PIECE_INDEX[upper]
            # 手番側視点へ正規化: 後手番なら盤を 180 度回転し色を入れ替える
            if black_to_move:
                mine = is_black
                s, d = suji, dan
            else:
                mine = not is_black
                s, d = 10 - suji, 10 - dan
            plane = kind if mine else kind + 14
            sq = (s - 1) * 9 + (d - 1)
            indices.append(plane * NUM_SQ + sq)
            suji -= 1
            i += 1
        dan += 1

    hands = [0.0] * 14
    if hand_s != "-":
        i = 0
        count = 0
        while i < len(hand_s):
            c = hand_s[i]
            if c.isdigit():
                count = count * 10 + int(c)
                i += 1
                continue
            n = count if count > 0 else 1
            count = 0
            upper = c.upper()
            is_black = c.isupper()
            mine = is_black if black_to_move else not is_black
            k = HAND_ORDER.index(upper)
            hands[k if mine else k + 7] += n
            i += 1

    return indices, hands, black_to_move


# ---------------------------------------------------------------------------
# データセット
# ---------------------------------------------------------------------------


def load_dataset(path: str, k_sigmoid: float, cp_clamp: int, limit: int = 0):
    """JSONL → (board_idx (N,40) int32 padded, hands (N,14) float32, y (N,) float32)"""
    board_rows, hand_rows, targets = [], [], []
    n_skipped = 0
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                n_skipped += 1
                continue
            try:
                idx, hands, _ = parse_sfen(rec["sfen"])
            except (KeyError, IndexError, ValueError):
                n_skipped += 1
                continue
            cp = max(-cp_clamp, min(cp_clamp, int(rec["cp"])))
            y = 1.0 / (1.0 + math.exp(-cp / k_sigmoid))
            idx = idx[:MAX_PIECES] + [PAD_IDX] * (MAX_PIECES - len(idx))
            board_rows.append(idx)
            hand_rows.append(hands)
            targets.append(y)
            if limit and len(targets) >= limit:
                break
    board = torch.tensor(board_rows, dtype=torch.long)
    hands = torch.tensor(hand_rows, dtype=torch.float32)
    y = torch.tensor(targets, dtype=torch.float32)
    if n_skipped:
        print(f"[data] skipped {n_skipped} bad lines")
    return board, hands, y


# ---------------------------------------------------------------------------
# モデル
# ---------------------------------------------------------------------------


class DistillNet(nn.Module):
    """2282 -> 256 -> 32 -> 1, ClippedReLU。

    第1層は NNUE 風に EmbeddingBag(盤面 one-hot の和) + Linear(持ち駒) で表現する。
    数学的には Linear(2282, 256) と等価で、エクスポート時に結合する。
    """

    H1 = 256
    H2 = 32

    def __init__(self):
        super().__init__()
        self.board = nn.EmbeddingBag(BOARD_FEATS + 1, self.H1, mode="sum", padding_idx=PAD_IDX)
        self.hand = nn.Linear(HAND_FEATS, self.H1)  # bias が第1層の bias を兼ねる
        self.l2 = nn.Linear(self.H1, self.H2)
        self.l3 = nn.Linear(self.H2, 1)
        nn.init.normal_(self.board.weight, std=0.01)
        with torch.no_grad():
            self.board.weight[PAD_IDX].zero_()

    def forward(self, board_idx, hands):
        a1 = self.board(board_idx) + self.hand(hands)
        h1 = torch.clamp(a1, 0.0, 1.0)
        h2 = torch.clamp(self.l2(h1), 0.0, 1.0)
        return self.l3(h2).squeeze(-1)  # ロジット (≈ cp / K)


# ---------------------------------------------------------------------------
# 学習ループ
# ---------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "data", "teacher.jsonl"))
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "runs", "run1"))
    ap.add_argument("--epochs", type=int, default=20)
    ap.add_argument("--batch", type=int, default=256)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--k", type=float, default=600.0, help="sigmoid スケール K")
    ap.add_argument("--cp-clamp", type=int, default=3000)
    ap.add_argument("--val-ratio", type=float, default=0.1)
    ap.add_argument("--limit", type=int, default=0, help="先頭 N 件のみ使用 (0=全件)")
    ap.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)

    device = ("mps" if torch.backends.mps.is_available() else "cpu") if args.device == "auto" else args.device
    print(f"[train] device={device}")

    board, hands, y = load_dataset(args.data, args.k, args.cp_clamp, args.limit)
    n = y.shape[0]
    print(f"[train] dataset: {n} positions from {args.data}")

    perm = torch.randperm(n)
    board, hands, y = board[perm], hands[perm], y[perm]
    n_val = max(1, int(n * args.val_ratio))
    vb, vh, vy = board[:n_val], hands[:n_val], y[:n_val]
    tb, th, ty = board[n_val:], hands[n_val:], y[n_val:]
    print(f"[train] train={ty.shape[0]} val={vy.shape[0]}")

    model = DistillNet().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    os.makedirs(args.out, exist_ok=True)
    curve_path = os.path.join(args.out, "curve.csv")
    with open(curve_path, "w") as f:
        f.write("epoch,train_loss,val_loss,val_mae_cp,lr,sec\n")

    def evaluate():
        model.eval()
        total, mae_cp, cnt = 0.0, 0.0, 0
        with torch.no_grad():
            for i in range(0, vy.shape[0], 4096):
                b = vb[i : i + 4096].to(device)
                h = vh[i : i + 4096].to(device)
                t = vy[i : i + 4096].to(device)
                out = model(b, h)
                pred = torch.sigmoid(out)
                total += F.mse_loss(pred, t, reduction="sum").item()
                # 参考: cp 空間での MAE (ロジット差 * K)
                t_logit = torch.logit(t.clamp(1e-6, 1 - 1e-6))
                mae_cp += (out - t_logit).abs().sum().item() * args.k
                cnt += t.shape[0]
        return total / cnt, mae_cp / cnt

    best_val = float("inf")
    n_train = ty.shape[0]
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        model.train()
        ep_perm = torch.randperm(n_train)
        total, cnt = 0.0, 0
        for i in range(0, n_train, args.batch):
            sel = ep_perm[i : i + args.batch]
            b = tb[sel].to(device)
            h = th[sel].to(device)
            t = ty[sel].to(device)
            out = model(b, h)
            loss = F.mse_loss(torch.sigmoid(out), t)
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * t.shape[0]
            cnt += t.shape[0]
        sched.step()
        train_loss = total / cnt
        val_loss, val_mae_cp = evaluate()
        sec = time.time() - t0
        lr_now = sched.get_last_lr()[0]
        print(
            f"[train] epoch {epoch:3d}/{args.epochs} train={train_loss:.6f} "
            f"val={val_loss:.6f} val_mae≈{val_mae_cp:.0f}cp lr={lr_now:.2e} ({sec:.1f}s)"
        )
        with open(curve_path, "a") as f:
            f.write(f"{epoch},{train_loss:.6f},{val_loss:.6f},{val_mae_cp:.1f},{lr_now:.6e},{sec:.1f}\n")

        ckpt = {
            "model": model.state_dict(),
            "epoch": epoch,
            "val_loss": val_loss,
            "args": vars(args),
            "arch": {"input": INPUT_DIM, "h1": DistillNet.H1, "h2": DistillNet.H2, "k": args.k},
        }
        torch.save(ckpt, os.path.join(args.out, "last.pt"))
        if val_loss < best_val:
            best_val = val_loss
            torch.save(ckpt, os.path.join(args.out, "best.pt"))

    print(f"[train] done. best val={best_val:.6f}. checkpoints in {args.out}")
    print(f"[train] loss curve: {curve_path}")


if __name__ == "__main__":
    main()
