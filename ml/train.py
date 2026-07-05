#!/usr/bin/env python3
"""train.py — 蒸留学習: やねうら王(NNUE/Háo)の評価値を教師に小型NNを学習する。

依存: PyTorch のみ (numpy 不要)。

入力特徴 (手番側視点, --features board で計2282次元):
  - 盤面: 28プレーン x 81マス = 2268 (one-hot)
      プレーン 0..13  = 手番側の駒 (FU,KY,KE,GI,KI,KA,HI,OU,TO,NY,NK,NG,UM,RY)
      プレーン 14..27 = 相手側の駒 (同順)
      マス index = (suji-1)*9 + (dan-1)   ※後手番のときは盤を180度回転して手番側視点に正規化
  - 持ち駒: 手番側 7種 + 相手側 7種 = 14 (枚数そのまま, float)

KP風特徴 (--features kp): 自玉(手番側の玉)位置を KP_BUCKETS=6 バケットに量子化し、
盤面/持ち駒の全特徴をバケット毎に別テーブル化する (縮約 King-Piece)。
  - 盤面: 6バケット x 2268 = 13608 (active は常に≦40)
  - 持ち駒: 6バケット x 14 = 84 (自玉バケットのセグメントのみ非ゼロ)
  バケット定義 (手番側視点の自玉 (suji s, dan d)):
      d<=7: 5 / d==8: s<=4 → 3, s>=5 → 4 / d==9: s==5 → 0, s<=4 → 1, s>=6 → 2
  (教師データ実測: b0=47.8% b1=6.0% b2=9.7% b3=11.7% b4=18.5% b5=6.1%)

factorized KP (--features kp-factor): 同じ KP 特徴だが、第1層を
  w1[b][f] = w_shared[f] (通常init) + w_delta[b][f] (ゼロinit)
に分解して学習する (本家 NNUE 学習器の factorizer と同じ発想)。共通構造は
全データが押す共有テーブルに載り、バケット別デルタは偏差だけを学ぶので
テーブル6倍化による過学習を抑える。推論・エクスポート形式は kp と同一
(エクスポート時に w_shared + w_delta を合成して量子化する)。

ネットワーク: 2282 -> 256 -> 32 -> 1 (全結合, 活性化 ClippedReLU = clamp(x,0,1))
ターゲット:   y = sigmoid(cp / K)  (cp は手番側視点, K=600, cp は ±3000 にクランプ)
損失:         MSE(sigmoid(out), y)   → 推論時は cp ≈ out * K

使い方:
  ml/venv/bin/python ml/train.py --data ml/data/teacher.jsonl --out ml/runs/smoke --epochs 20

ランキング指向学習 (--loss ranking):
  シグモイド回帰損失に加え、同一ミニバッチ内で教師cp差が [--rank-pair-min, --rank-pair-max]
  (既定 [50,600]cp) のペアへ pairwise margin ranking loss (margin=--rank-margin-cp, 重み
  --rank-weight) を加算する。探索で効く「局面の相対順位」の一致を直接最適化する狙い。
  順位一致率 (val の教師cp差>100 の固定ペアで予測大小が一致する率) は損失モードに依らず
  毎 epoch curve.csv の val_pair_acc 列に記録される。
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

# --- KP (King-Piece) 縮約バケット -------------------------------------------
KP_BUCKETS = 6


def kp_bucket(s: int, d: int) -> int:
    """手番側視点の自玉位置 (suji s, dan d) → バケット 0..5。

    実測分布 (teacher-1m 20万局面) でマスを粗く等分:
      b0 = (5,9) 玉未移動 47.8% / b1 = d9 s1-4 6.0% / b2 = d9 s6-9 9.7%
      b3 = d8 s1-4 11.7% / b4 = d8 s5-9 18.5% / b5 = d<=7 6.1%
    """
    if d <= 7:
        return 5
    if d == 8:
        return 3 if s <= 4 else 4
    if s == 5:
        return 0
    return 1 if s <= 4 else 2


def parse_sfen(sfen: str):
    """SFEN → (board_indices: list[int], hands: list[float](14), stm_black: bool, king_sq: int)

    board_indices は手番側視点に正規化済みの active feature index (0..2267)。
    king_sq は手番側の自玉の正規化済みマス index (s-1)*9+(d-1) (0..80)。玉なしは -1。
    """
    parts = sfen.split()
    board_s, turn_s, hand_s = parts[0], parts[1], parts[2]
    black_to_move = turn_s == "b"

    indices = []
    king_sq = -1
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
            if mine and kind == 7:  # 手番側の玉
                king_sq = sq
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

    return indices, hands, black_to_move, king_sq


# ---------------------------------------------------------------------------
# データセット
# ---------------------------------------------------------------------------


def load_dataset(path: str, k_sigmoid: float, cp_clamp: int, limit: int = 0, features: str = "board"):
    """JSONL → (board_idx (N,40) int64 padded, hands (N,14) float32, y (N,) float32,
                cp (N,) float32, bucket (N,) int64)

    cp はクランプ後の教師評価値 (手番側視点, cp 単位)。ランキング損失・順位一致率の計算に使う。
    features="kp" のときは board_idx にバケットオフセット (bucket*2268) を加算済み。
    bucket は kp 時のみ意味を持つ (board 時は全 0)。
    """
    kp = features in ("kp", "kp-factor")
    pad_idx = (KP_BUCKETS * BOARD_FEATS) if kp else PAD_IDX
    board_rows, hand_rows, targets, cps, buckets = [], [], [], [], []
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
                idx, hands, _, king_sq = parse_sfen(rec["sfen"])
                cp = int(rec["cp"])
            except (KeyError, IndexError, ValueError, TypeError):
                n_skipped += 1
                continue
            bucket = 0
            if kp:
                if king_sq < 0:
                    n_skipped += 1
                    continue
                bucket = kp_bucket(king_sq // 9 + 1, king_sq % 9 + 1)
                idx = [bucket * BOARD_FEATS + f for f in idx]
            cp = max(-cp_clamp, min(cp_clamp, cp))
            y = 1.0 / (1.0 + math.exp(-cp / k_sigmoid))
            idx = idx[:MAX_PIECES] + [pad_idx] * (MAX_PIECES - len(idx))
            board_rows.append(idx)
            hand_rows.append(hands)
            targets.append(y)
            cps.append(float(cp))
            buckets.append(bucket)
            if limit and len(targets) >= limit:
                break
    board = torch.tensor(board_rows, dtype=torch.long)
    hands = torch.tensor(hand_rows, dtype=torch.float32)
    y = torch.tensor(targets, dtype=torch.float32)
    cp_t = torch.tensor(cps, dtype=torch.float32)
    bucket_t = torch.tensor(buckets, dtype=torch.long)
    if n_skipped:
        print(f"[data] skipped {n_skipped} bad lines")
    return board, hands, y, cp_t, bucket_t


# ---------------------------------------------------------------------------
# モデル
# ---------------------------------------------------------------------------


class DistillNet(nn.Module):
    """(2282 | KP:13692) -> 256 -> 32 -> 1, ClippedReLU。

    第1層は NNUE 風に EmbeddingBag(盤面 one-hot の和) + Linear(持ち駒) で表現する。
    数学的には Linear(入力次元, 256) と等価で、エクスポート時に結合する。
    features="kp" では盤面/持ち駒とも自玉バケット (KP_BUCKETS=6) 毎の別テーブル。
    """

    H1 = 256
    H2 = 32

    def __init__(self, features: str = "board"):
        super().__init__()
        self.features = features
        self.kp = features in ("kp", "kp-factor")
        self.factored = features == "kp-factor"
        nb = KP_BUCKETS if self.kp else 1
        self.board_feats = nb * BOARD_FEATS
        self.hand_feats = nb * HAND_FEATS
        self.pad_idx = self.board_feats
        self.board = nn.EmbeddingBag(self.board_feats + 1, self.H1, mode="sum", padding_idx=self.pad_idx)
        self.hand = nn.Linear(self.hand_feats, self.H1)  # bias が第1層の bias を兼ねる
        self.l2 = nn.Linear(self.H1, self.H2)
        self.l3 = nn.Linear(self.H2, 1)
        if self.factored:
            # 分解学習: board/hand はゼロ初期化のバケット別デルタになり、
            # 共通構造は共有テーブル board_shared/hand_shared が学ぶ。
            self.board_shared = nn.EmbeddingBag(BOARD_FEATS + 1, self.H1, mode="sum", padding_idx=BOARD_FEATS)
            self.hand_shared = nn.Linear(HAND_FEATS, self.H1, bias=False)
            nn.init.normal_(self.board_shared.weight, std=0.01)
            with torch.no_grad():
                self.board_shared.weight[BOARD_FEATS].zero_()
                self.board.weight.zero_()
                self.hand.weight.zero_()
        else:
            nn.init.normal_(self.board.weight, std=0.01)
            with torch.no_grad():
                self.board.weight[self.pad_idx].zero_()

    def expand_hands(self, hands, bucket):
        """(B,14) + bucket (B,) → (B, KP_BUCKETS*14): 自玉バケットのセグメントのみ非ゼロ。"""
        b = hands.shape[0]
        out = hands.new_zeros(b, KP_BUCKETS, HAND_FEATS)
        out[torch.arange(b, device=hands.device), bucket] = hands
        return out.view(b, -1)

    def forward(self, board_idx, hands, bucket=None):
        hands14 = hands
        if self.kp:
            hands = self.expand_hands(hands, bucket)
        a1 = self.board(board_idx) + self.hand(hands)
        if self.factored:
            # 共有テーブル: バケットオフセットを剥がした素の特徴 index で引く
            raw_idx = torch.where(
                board_idx == self.pad_idx,
                torch.full_like(board_idx, BOARD_FEATS),
                board_idx % BOARD_FEATS,
            )
            a1 = a1 + self.board_shared(raw_idx) + self.hand_shared(hands14)
        h1 = torch.clamp(a1, 0.0, 1.0)
        h2 = torch.clamp(self.l2(h1), 0.0, 1.0)
        return self.l3(h2).squeeze(-1)  # ロジット (≈ cp / K)

    def materialized_w1(self):
        """第1層の実効テーブル (w1_board (BF,H1), w1_hand (HF,H1), b1 (H1,)) を返す。

        factored のときは shared + delta を合成する (エクスポート形式は kp と同一)。
        """
        with torch.no_grad():
            w1_board = self.board.weight[: self.board_feats]
            w1_hand = self.hand.weight.t().contiguous()  # (HF, H1)
            b1 = self.hand.bias
            if self.factored:
                nb = KP_BUCKETS
                w1_board = w1_board + self.board_shared.weight[:BOARD_FEATS].repeat(nb, 1)
                w1_hand = w1_hand + self.hand_shared.weight.t().repeat(nb, 1)
            return w1_board, w1_hand, b1


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
    ap.add_argument("--device", default="auto", choices=["auto", "cuda", "mps", "cpu"])
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument(
        "--features",
        default="board",
        choices=["board", "kp", "kp-factor"],
        help="board=現行one-hot(2282), kp=自玉バケット×盤面/持ち駒 (KP縮約, 13692), "
        "kp-factor=同特徴の分解学習 (共有+バケットデルタ, エクスポート形式はkpと同一)",
    )
    # ランキング指向の学習: --loss ranking で同一ミニバッチ内の教師cp差 [rank-pair-min, rank-pair-max]
    # のペアに pairwise margin ranking loss を加算する (シグモイド回帰損失は常に併用)。
    ap.add_argument("--loss", default="sigmoid", choices=["sigmoid", "ranking"])
    ap.add_argument("--rank-weight", type=float, default=1.0, help="ranking loss の重み係数")
    ap.add_argument("--rank-pair-min", type=float, default=50.0, help="ペア対象の教師cp差 下限")
    ap.add_argument("--rank-pair-max", type=float, default=600.0, help="ペア対象の教師cp差 上限")
    ap.add_argument("--rank-margin-cp", type=float, default=50.0, help="margin (cp 単位, ロジット空間では /K)")
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    random.seed(args.seed)

    if args.device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
    else:
        device = args.device
    print(f"[train] device={device}")

    board, hands, y, cp, bucket = load_dataset(args.data, args.k, args.cp_clamp, args.limit, args.features)
    n = y.shape[0]
    print(f"[train] dataset: {n} positions from {args.data} (features={args.features})")

    if n < 2:
        raise SystemExit(
            f"[train] error: dataset has only {n} usable position(s); "
            "need at least 2 for a train/val split. "
            "Check --data path, --limit, and that the JSONL contains valid records."
        )

    perm = torch.randperm(n)
    board, hands, y, cp, bucket = board[perm], hands[perm], y[perm], cp[perm], bucket[perm]
    # val は最低1件、かつ train にも最低1件残るようにクランプする
    n_val = max(1, min(int(n * args.val_ratio), n - 1))
    vb, vh, vy, vcp, vbk = board[:n_val], hands[:n_val], y[:n_val], cp[:n_val], bucket[:n_val]
    tb, th, ty, tcp, tbk = board[n_val:], hands[n_val:], y[n_val:], cp[n_val:], bucket[n_val:]
    print(f"[train] train={ty.shape[0]} val={vy.shape[0]} loss={args.loss}")

    # --- 順位一致率 (pairwise ranking accuracy) 用の固定 val ペア ---
    # 教師cp差 > 100 のランダムペアについて、予測ロジットの大小関係が教師と一致する率。
    # 損失モードに依らず毎 epoch 報告する。seed 固定で run 間比較可能。
    pair_gen = torch.Generator().manual_seed(args.seed + 1)
    n_pairs_raw = min(200000, n_val * 20)
    pi = torch.randint(0, n_val, (n_pairs_raw,), generator=pair_gen)
    pj = torch.randint(0, n_val, (n_pairs_raw,), generator=pair_gen)
    pair_mask = (vcp[pi] - vcp[pj]).abs() > 100.0
    pi, pj = pi[pair_mask], pj[pair_mask]
    print(f"[train] val ranking pairs (|Δcp|>100): {pi.shape[0]}")

    model = DistillNet(args.features).to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    os.makedirs(args.out, exist_ok=True)
    curve_path = os.path.join(args.out, "curve.csv")
    with open(curve_path, "w") as f:
        f.write("epoch,train_loss,val_loss,val_mae_cp,val_pair_acc,lr,sec\n")

    def evaluate():
        model.eval()
        total, mae_cp, cnt = 0.0, 0.0, 0
        outs = []
        with torch.no_grad():
            for i in range(0, vy.shape[0], 4096):
                b = vb[i : i + 4096].to(device)
                h = vh[i : i + 4096].to(device)
                t = vy[i : i + 4096].to(device)
                bk = vbk[i : i + 4096].to(device)
                out = model(b, h, bk)
                pred = torch.sigmoid(out)
                total += F.mse_loss(pred, t, reduction="sum").item()
                # 参考: cp 空間での MAE (ロジット差 * K)
                t_logit = torch.logit(t.clamp(1e-6, 1 - 1e-6))
                mae_cp += (out - t_logit).abs().sum().item() * args.k
                cnt += t.shape[0]
                outs.append(out.cpu())
        # 順位一致率: 教師cp差>100 の固定ペアで予測の大小が一致する率
        pair_acc = float("nan")
        if pi.shape[0] > 0:
            o = torch.cat(outs)
            agree = ((o[pi] - o[pj]) * (vcp[pi] - vcp[pj])) > 0
            pair_acc = agree.float().mean().item()
        return total / cnt, mae_cp / cnt, pair_acc

    best_val = float("inf")
    n_train = ty.shape[0]
    rank_margin_logit = args.rank_margin_cp / args.k  # margin をロジット空間へ
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
            bk = tbk[sel].to(device)
            out = model(b, h, bk)
            loss = F.mse_loss(torch.sigmoid(out), t)
            if args.loss == "ranking":
                # 同一ミニバッチ内で教師cp差が [rank-pair-min, rank-pair-max] のペアを全列挙し、
                # margin ranking loss (ロジット空間) を加算する。
                # diff[a,b] = cp_a - cp_b > 0 となる向きで取るので各非順序ペアは一度だけ現れる。
                c = tcp[sel].to(device)
                diff = c.unsqueeze(1) - c.unsqueeze(0)
                mask = (diff >= args.rank_pair_min) & (diff <= args.rank_pair_max)
                ia, ib = mask.nonzero(as_tuple=True)
                if ia.numel() > 0:
                    rank_loss = F.relu(rank_margin_logit - (out[ia] - out[ib])).mean()
                    loss = loss + args.rank_weight * rank_loss
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * t.shape[0]
            cnt += t.shape[0]
        sched.step()
        train_loss = total / cnt
        val_loss, val_mae_cp, val_pair_acc = evaluate()
        sec = time.time() - t0
        lr_now = sched.get_last_lr()[0]
        print(
            f"[train] epoch {epoch:3d}/{args.epochs} train={train_loss:.6f} "
            f"val={val_loss:.6f} val_mae≈{val_mae_cp:.0f}cp pair_acc={val_pair_acc:.4f} "
            f"lr={lr_now:.2e} ({sec:.1f}s)"
        )
        with open(curve_path, "a") as f:
            f.write(
                f"{epoch},{train_loss:.6f},{val_loss:.6f},{val_mae_cp:.1f},"
                f"{val_pair_acc:.4f},{lr_now:.6e},{sec:.1f}\n"
            )

        ckpt = {
            "model": model.state_dict(),
            "epoch": epoch,
            "val_loss": val_loss,
            "val_mae_cp": val_mae_cp,
            "val_pair_acc": val_pair_acc,
            "args": vars(args),
            "arch": {
                "input": model.board_feats + model.hand_feats,
                "h1": DistillNet.H1,
                "h2": DistillNet.H2,
                "k": args.k,
                "features": args.features,
                "kp_buckets": KP_BUCKETS if model.kp else 1,
            },
        }
        torch.save(ckpt, os.path.join(args.out, "last.pt"))
        if val_loss < best_val:
            best_val = val_loss
            torch.save(ckpt, os.path.join(args.out, "best.pt"))

    print(f"[train] done. best val={best_val:.6f}. checkpoints in {args.out}")
    print(f"[train] loss curve: {curve_path}")


if __name__ == "__main__":
    main()
