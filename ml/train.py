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
from collections import defaultdict
import hashlib
import json
import math
import os
import random
import tempfile
import time

import torch
import torch.nn as nn
import torch.nn.functional as F

from checkpoint_compat import expected_arch, sha256_file, validate_arch
from sibling_manifest import SiblingManifestError, verify_sibling_manifest

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
MATE_SCORE_CP = 1_000_000
MAX_NON_MATE_CP = 900_000
MAX_MATE_DISTANCE = MATE_SCORE_CP - MAX_NON_MATE_CP - 1
SIBLING_SCHEMA = "shogi-sibling-v1"
SIBLING_SCHEMA_VERSION = 1
SIBLING_SOURCE_PRIORITY = {"played": 0, "teacher": 1}


def mate_to_cp(mate: int, mate_sign: int) -> int:
    distance = min(abs(mate), MAX_MATE_DISTANCE)
    return mate_sign * (MATE_SCORE_CP - distance)


def cp_sigmoid_target(cp, k_sigmoid: float) -> float:
    """Numerically stable sigmoid for the full production CP range."""
    scaled = cp / k_sigmoid
    if scaled >= 0:
        return 1.0 / (1.0 + math.exp(-scaled))
    exp_scaled = math.exp(scaled)
    return exp_scaled / (1.0 + exp_scaled)


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


def position_id_from_sfen(sfen: str) -> str:
    """Match the TypeScript sibling schema's board/turn/hand position key."""
    parts = sfen.strip().split()
    if len(parts) < 3:
        raise ValueError(f"invalid SFEN: {sfen}")
    canonical = " ".join(parts[:3])
    digest = hashlib.sha256(f"sfen-v1\0{canonical}".encode()).hexdigest()
    return f"sha256:{digest}"


def identifier_set_sha256(values) -> str:
    """Stable digest for provenance sets (same newline-joined convention as manifests)."""
    return hashlib.sha256("\n".join(sorted(values)).encode()).hexdigest()


def _is_strict_int(value) -> bool:
    """JSON integer contract: bool and integral-looking floats are not integers."""
    return type(value) is int


def _required_text(value, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value


def _validate_sfen_syntax(parts, field: str) -> None:
    board, turn, hand, _move_number = parts
    if turn not in ("b", "w"):
        raise ValueError(f"{field} turn must be 'b' or 'w'")
    rows = board.split("/")
    if len(rows) != 9:
        raise ValueError(f"{field} board must contain exactly 9 ranks")
    pieces = set("PLNSGBRKplnsgbrk")
    promotable = set("PLNSBRplnsbr")
    for rank_index, rank in enumerate(rows, start=1):
        squares = 0
        offset = 0
        while offset < len(rank):
            token = rank[offset]
            if token in "123456789":
                if offset + 1 < len(rank) and rank[offset + 1] in "0123456789":
                    raise ValueError(f"{field} rank {rank_index} has adjacent empty runs")
                squares += int(token)
                offset += 1
                continue
            if token == "+":
                offset += 1
                if offset >= len(rank) or rank[offset] not in promotable:
                    raise ValueError(f"{field} rank {rank_index} has invalid promotion syntax")
                squares += 1
                offset += 1
                continue
            if token not in pieces:
                raise ValueError(f"{field} rank {rank_index} contains an invalid piece")
            squares += 1
            offset += 1
        if squares != 9:
            raise ValueError(f"{field} rank {rank_index} expands to {squares}, not 9 squares")

    if hand == "-":
        return
    hand_pieces = set("RBGSNLPrbgsnlp")
    hand_order = {piece: index for index, piece in enumerate("RBGSNLPrbgsnlp")}
    seen = set()
    last_order = -1
    offset = 0
    while offset < len(hand):
        count_start = offset
        while offset < len(hand) and hand[offset] in "0123456789":
            offset += 1
        count_text = hand[count_start:offset]
        if count_text:
            if count_text.startswith("0") or int(count_text) < 2:
                raise ValueError(f"{field} hand has a non-canonical count")
        if offset >= len(hand) or hand[offset] not in hand_pieces:
            raise ValueError(f"{field} hand has invalid piece/count grammar")
        piece = hand[offset]
        if piece in seen:
            raise ValueError(f"{field} hand repeats piece {piece}")
        if hand_order[piece] <= last_order:
            raise ValueError(f"{field} hand pieces are not canonically ordered")
        seen.add(piece)
        last_order = hand_order[piece]
        offset += 1


def _normalized_sfen(value, field: str) -> str:
    text = _required_text(value, field)
    parts = text.split()
    if (
        len(parts) != 4
        or not parts[3]
        or any(character not in "0123456789" for character in parts[3])
        or int(parts[3]) <= 0
    ):
        raise ValueError(f"{field} must be a four-field SFEN with a positive move number")
    normalized = " ".join(parts)
    if text != normalized:
        raise ValueError(f"{field} must use canonical whitespace")
    _validate_sfen_syntax(parts, field)
    try:
        parse_sfen(text)
    except (AttributeError, IndexError, KeyError, TypeError, ValueError) as error:
        raise ValueError(f"{field} is invalid: {error}") from error
    return text


def _validate_strict_sibling_record(record, context: str) -> None:
    """Validate every row-level invariant in the shogi-sibling-v1 contract."""
    if not isinstance(record, dict):
        raise ValueError(f"{context}: row must be a JSON object")
    if record.get("schema") != SIBLING_SCHEMA:
        raise ValueError(f"{context}: unsupported schema {record.get('schema')!r}")
    schema_version = record.get("schema_version")
    if not _is_strict_int(schema_version) or schema_version != SIBLING_SCHEMA_VERSION:
        raise ValueError(f"{context}: unsupported schema_version {schema_version!r}")

    for field in ("game_id", "parent_id", "position_id", "move", "child_position_id"):
        _required_text(record.get(field), field)

    parent_sfen = _normalized_sfen(record.get("parent_sfen"), "parent_sfen")
    child_sfen = _normalized_sfen(record.get("sfen"), "sfen")
    child_alias = _normalized_sfen(record.get("child_sfen"), "child_sfen")
    if record["position_id"] != position_id_from_sfen(parent_sfen):
        raise ValueError(f"{context}: position_id does not match parent_sfen")
    if child_alias != child_sfen:
        raise ValueError(f"{context}: child_sfen does not match sfen")
    if record["child_position_id"] != position_id_from_sfen(child_sfen):
        raise ValueError(f"{context}: child_position_id does not match child_sfen")

    integer_fields = (
        "parent_ply",
        "ply",
        "cp",
        "teacher_child_cp",
        "teacher_parent_cp",
        "teacher_rank",
    )
    for field in integer_fields:
        if not _is_strict_int(record.get(field)):
            raise ValueError(f"{context}: {field} must be an integer")
    parent_ply = record["parent_ply"]
    ply = record["ply"]
    if parent_ply < 0 or ply != parent_ply + 1:
        raise ValueError(f"{context}: inconsistent parent_ply/ply")
    if int(parent_sfen.split()[3]) != parent_ply + 1:
        raise ValueError(f"{context}: parent_ply does not match parent_sfen move number")
    if int(child_sfen.split()[3]) != ply + 1:
        raise ValueError(f"{context}: ply does not match child_sfen move number")
    if record["teacher_rank"] <= 0:
        raise ValueError(f"{context}: teacher_rank must be positive")
    expected_child_cp = -record["teacher_parent_cp"]
    if record["cp"] != expected_child_cp or record["teacher_child_cp"] != expected_child_cp:
        raise ValueError(f"{context}: child/parent cp sign mismatch or inconsistent aliases")

    sources = record.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError(f"{context}: sources must be a non-empty array")
    if any(
        not isinstance(source, str) or not source.strip() or source != source.strip()
        for source in sources
    ):
        raise ValueError(f"{context}: every source must be a non-empty string")
    canonical_sources = sorted(
        set(sources), key=lambda source: (SIBLING_SOURCE_PRIORITY.get(source, 100), source)
    )
    if sources != canonical_sources:
        raise ValueError(f"{context}: sources must be unique and canonically ordered")

    split = record.get("split")
    if split not in ("train", "val"):
        raise ValueError(f"{context}: split must be 'train' or 'val'")
    score_kind = record.get("teacher_score_kind")
    parent_cp = record["teacher_parent_cp"]
    if score_kind == "mate":
        if "teacher_mate" not in record or "teacher_mate_sign" not in record:
            raise ValueError(f"{context}: mate score requires mate metadata")
        mate = record["teacher_mate"]
        mate_sign = record["teacher_mate_sign"]
        if not _is_strict_int(mate) or not _is_strict_int(mate_sign) or mate_sign not in (-1, 1):
            raise ValueError(f"{context}: invalid mate metadata")
        if (mate > 0 and mate_sign != 1) or (mate < 0 and mate_sign != -1):
            raise ValueError(f"{context}: contradictory mate sign")
        if parent_cp != mate_to_cp(mate, mate_sign):
            raise ValueError(f"{context}: inconsistent mate cp")
    elif score_kind == "cp":
        if "teacher_mate" in record or "teacher_mate_sign" in record:
            raise ValueError(f"{context}: cp score must not contain mate metadata")
        if abs(parent_cp) > MAX_NON_MATE_CP:
            raise ValueError(f"{context}: cp score is in the reserved mate band")
    else:
        raise ValueError(f"{context}: invalid teacher_score_kind")


# ---------------------------------------------------------------------------
# データセット
# ---------------------------------------------------------------------------


def _load_dataset(
    path: str,
    k_sigmoid: float,
    cp_clamp: int,
    limit: int = 0,
    features: str = "board",
    *,
    include_metadata: bool = False,
    uniform_sample_limit: int = 0,
    sample_seed: int = 0,
    exclude_position_ids=None,
    strict: bool = False,
    capture_source_fingerprint: bool = False,
):
    """JSONL → (board_idx (N,40) int64 padded, hands (N,14) float32, y (N,) float32,
                cp (N,) float32, bucket (N,) int64)

    cp はクランプ後の教師評価値 (手番側視点, cp 単位)。ランキング損失・順位一致率の計算に使う。
    features="kp" のときは board_idx にバケットオフセット (bucket*2268) を加算済み。
    bucket は kp 時のみ意味を持つ (board 時は全 0)。
    """
    kp = features in ("kp", "kp-factor")
    pad_idx = (KP_BUCKETS * BOARD_FEATS) if kp else PAD_IDX
    if not math.isfinite(k_sigmoid) or k_sigmoid <= 0:
        raise ValueError("k_sigmoid must be finite and positive")
    if type(cp_clamp) is not int or cp_clamp <= 0:
        raise ValueError("cp_clamp must be a positive integer")
    if uniform_sample_limit < 0:
        raise ValueError("uniform_sample_limit must be non-negative")
    if uniform_sample_limit and limit:
        raise ValueError("prefix limit and uniform sample limit are mutually exclusive")

    selected_ordinals = None
    total_nonempty_lines = None
    source_fingerprint = None
    if uniform_sample_limit:
        # runOp1-train is deliberately concatenated as 5.24M general positions
        # followed by 652k opening positions. A prefix limit would therefore
        # erase the opening component that distinguishes the production model.
        # Select line ordinals uniformly over the whole file in a cheap first
        # pass, then parse only those rows in source order.
        source_digest = hashlib.sha256()
        source_bytes = 0
        total_nonempty_lines = 0
        with open(path, "rb") as source:
            for line in source:
                source_bytes += len(line)
                source_digest.update(line)
                total_nonempty_lines += int(bool(line.strip()))
        source_fingerprint = {
            "bytes": source_bytes,
            "sha256": source_digest.hexdigest(),
        }
        if uniform_sample_limit < total_nonempty_lines:
            sample_rng = random.Random(sample_seed)
            selected_ordinals = set(
                sample_rng.sample(range(total_nonempty_lines), uniform_sample_limit)
            )
            print(
                f"[data] deterministic uniform sample: {uniform_sample_limit}/"
                f"{total_nonempty_lines} rows seed={sample_seed}"
            )
    elif capture_source_fingerprint:
        with open(path, "rb") as source:
            source_bytes, source_sha256 = _fingerprint_binary_stream(source)
        source_fingerprint = {"bytes": source_bytes, "sha256": source_sha256}

    board_rows, hand_rows, targets, cps, buckets = [], [], [], [], []
    # A production replay file has nearly six million rows. Constructing a
    # Python dict for every row when the five-tensor compatibility API is used
    # costs several extra gigabytes, even though that caller discards the
    # metadata immediately. Only sibling/pre-split training opts into it.
    metadata = [] if include_metadata else None
    n_skipped = 0
    n_excluded = 0
    strict_errors = []
    nonempty_ordinal = -1
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            nonempty_ordinal += 1
            if selected_ordinals is not None and nonempty_ordinal not in selected_ordinals:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError as error:
                n_skipped += 1
                if strict:
                    strict_errors.append(f"line {nonempty_ordinal + 1}: invalid JSON: {error.msg}")
                continue
            if strict:
                try:
                    _validate_strict_sibling_record(
                        rec, f"line {nonempty_ordinal + 1}"
                    )
                except ValueError as error:
                    n_skipped += 1
                    strict_errors.append(str(error))
                    continue
            try:
                sfen = rec["sfen"]
                idx, hands, _, king_sq = parse_sfen(sfen)
                raw_cp = rec["cp"] if strict else int(rec["cp"])
            except (AttributeError, KeyError, IndexError, ValueError, TypeError) as error:
                n_skipped += 1
                if strict:
                    strict_errors.append(
                        f"line {nonempty_ordinal + 1}: unusable SFEN/cp: {error}"
                    )
                continue
            if exclude_position_ids and position_id_from_sfen(sfen) in exclude_position_ids:
                n_excluded += 1
                continue
            bucket = 0
            if kp:
                if king_sq < 0:
                    n_skipped += 1
                    continue
                bucket = kp_bucket(king_sq // 9 + 1, king_sq % 9 + 1)
                idx = [bucket * BOARD_FEATS + f for f in idx]
            cp = max(-cp_clamp, min(cp_clamp, raw_cp))
            y = cp_sigmoid_target(cp, k_sigmoid)
            idx = idx[:MAX_PIECES] + [pad_idx] * (MAX_PIECES - len(idx))
            board_rows.append(idx)
            hand_rows.append(hands)
            targets.append(y)
            cps.append(float(cp))
            buckets.append(bucket)
            if metadata is not None:
                declared_child_position_id = rec.get("child_position_id")
                metadata_row = dict(rec) if isinstance(rec, dict) else {}
                metadata_row.update(
                    {
                        "child_position_id": position_id_from_sfen(sfen),
                        "declared_child_position_id": declared_child_position_id,
                        "raw_cp": raw_cp,
                    }
                )
                metadata.append(metadata_row)
            if limit and len(targets) >= limit:
                break
    board = torch.tensor(board_rows, dtype=torch.long)
    hands = torch.tensor(hand_rows, dtype=torch.float32)
    y = torch.tensor(targets, dtype=torch.float32)
    cp_t = torch.tensor(cps, dtype=torch.float32)
    bucket_t = torch.tensor(buckets, dtype=torch.long)
    if n_skipped:
        print(f"[data] skipped {n_skipped} bad lines")
        if strict:
            detail = strict_errors[0] if strict_errors else "unknown strict validation error"
            raise ValueError(
                f"strict dataset rejected {n_skipped} malformed/unusable row(s): "
                f"{path}; first error: {detail}"
            )
    if n_excluded:
        print(f"[data] excluded {n_excluded} rows overlapping validation child positions")
    return board, hands, y, cp_t, bucket_t, metadata, source_fingerprint


def load_dataset(path: str, k_sigmoid: float, cp_clamp: int, limit: int = 0, features: str = "board"):
    """Backward-compatible five-tensor loader used by export/evaluation tools."""
    return _load_dataset(path, k_sigmoid, cp_clamp, limit, features, include_metadata=False)[:5]


def load_dataset_with_metadata(
    path: str,
    k_sigmoid: float,
    cp_clamp: int,
    limit: int = 0,
    features: str = "board",
    *,
    strict: bool = False,
):
    """Load tensors plus provenance needed for leak-free sibling training."""
    return _load_dataset(
        path,
        k_sigmoid,
        cp_clamp,
        limit,
        features,
        include_metadata=True,
        strict=strict,
    )[:6]


def load_replay_dataset(
    path: str,
    k_sigmoid: float,
    cp_clamp: int,
    sample_limit: int,
    features: str,
    seed: int,
    exclude_position_ids=None,
    *,
    include_fingerprint: bool = False,
):
    """Load a deterministic whole-file sample without allocating provenance dicts."""
    loaded = _load_dataset(
        path,
        k_sigmoid,
        cp_clamp,
        features=features,
        include_metadata=False,
        uniform_sample_limit=sample_limit,
        sample_seed=seed,
        exclude_position_ids=exclude_position_ids,
        capture_source_fingerprint=True,
    )
    tensors = loaded[:5]
    return (*tensors, loaded[6]) if include_fingerprint else tensors


def reorder_metadata(metadata, order):
    return [metadata[int(i)] for i in order.tolist()]


def validate_sibling_metadata(metadata, label: str):
    """Validate one-candidate-per-row sibling records and return parent groups."""
    groups = defaultdict(list)
    parent_provenance = {}
    parent_moves = defaultdict(set)
    expected_split = {"train": "train", "val": "val", "validation": "val"}.get(label)
    for index, row in enumerate(metadata):
        try:
            _validate_strict_sibling_record(row, f"{label} row {index}")
        except ValueError as error:
            raise SystemExit(f"[train] {error}") from error
        raw_cp = row.get("raw_cp")
        if not _is_strict_int(raw_cp) or raw_cp != row["cp"]:
            raise SystemExit(f"[train] {label} row {index} has invalid raw child cp")
        if expected_split is not None and row["split"] != expected_split:
            raise SystemExit(
                f"[train] {label} row {index} has split={row['split']!r}; "
                f"expected {expected_split!r}"
            )
        declared_child_position_id = row.get("declared_child_position_id")
        if declared_child_position_id is not None:
            if (
                not isinstance(declared_child_position_id, str)
                or declared_child_position_id != row["child_position_id"]
            ):
                raise SystemExit(
                    f"[train] {label} row {index} child_position_id does not match child SFEN"
                )

        parent_id = row["parent_id"]
        provenance = (
            row["game_id"],
            row["position_id"],
            row["parent_sfen"],
            row["parent_ply"],
            row["ply"],
            row["split"],
        )
        if parent_id in parent_provenance and parent_provenance[parent_id] != provenance:
            raise SystemExit(f"[train] {label} parent_id {parent_id} has inconsistent group metadata")
        parent_provenance[parent_id] = provenance
        if row["move"] in parent_moves[parent_id]:
            raise SystemExit(f"[train] {label} parent_id {parent_id} repeats move {row['move']}")
        parent_moves[parent_id].add(row["move"])
        groups[parent_id].append(index)

    singleton = next((parent_id for parent_id, rows in groups.items() if len(rows) < 2), None)
    if singleton is not None:
        raise SystemExit(f"[train] {label} parent_id {singleton} has fewer than two siblings")
    for parent_id, rows in groups.items():
        played = [index for index in rows if "played" in metadata[index]["sources"]]
        if len(played) != 1:
            raise SystemExit(
                f"[train] {label} parent_id {parent_id} must have exactly one played source"
            )
        ranks = [metadata[index]["teacher_rank"] for index in rows]
        if sorted(ranks) != list(range(1, len(rows) + 1)):
            raise SystemExit(f"[train] {label} parent_id {parent_id} has non-contiguous teacher ranks")
        ranked = sorted(rows, key=lambda index: metadata[index]["teacher_rank"])
        parent_cps = [metadata[index]["teacher_parent_cp"] for index in ranked]
        if any(parent_cps[index - 1] < parent_cps[index] for index in range(1, len(parent_cps))):
            raise SystemExit(f"[train] {label} parent_id {parent_id} rank/cp contradiction")
    return list(groups.values())


def validate_disjoint_splits(train_meta, val_meta):
    for field in ("game_id", "parent_id", "position_id", "child_position_id"):
        train_ids = {row[field] for row in train_meta if isinstance(row.get(field), str) and row[field]}
        val_ids = {row[field] for row in val_meta if isinstance(row.get(field), str) and row[field]}
        overlap = train_ids & val_ids
        if overlap:
            example = sorted(overlap)[0]
            raise SystemExit(f"[train] train/val leakage: {field} {example} occurs in both splits")


def raw_sibling_cp(metadata):
    """Return unclamped child-view cp so high-score/mate sibling order is preserved."""
    return torch.tensor([row["raw_cp"] for row in metadata], dtype=torch.float32)


def grouped_batches(groups, batch_size: int, generator: torch.Generator):
    """Shuffle parents while keeping every sibling group in one batch."""
    order = torch.randperm(len(groups), generator=generator).tolist()
    batches, current = [], []
    for group_index in order:
        group = groups[group_index]
        if current and len(current) + len(group) > batch_size:
            batches.append(torch.tensor(current, dtype=torch.long))
            current = []
        if len(group) > batch_size:
            batches.append(torch.tensor(group, dtype=torch.long))
        else:
            current.extend(group)
    if current:
        batches.append(torch.tensor(current, dtype=torch.long))
    return batches


def sibling_ranking_loss(outputs, child_cp, parent_ids, margin_logit, pair_min, pair_max):
    """Equal-parent-weight ranking loss; predictions/labels are flipped to parent view once."""
    local_groups = defaultdict(list)
    for index, parent_id in enumerate(parent_ids):
        local_groups[parent_id].append(index)
    losses = []
    for indices in local_groups.values():
        idx = torch.tensor(indices, dtype=torch.long, device=outputs.device)
        teacher_parent = -child_cp[idx]
        predicted_parent = -outputs[idx]
        diff = teacher_parent.unsqueeze(1) - teacher_parent.unsqueeze(0)
        mask = (diff > 0) & (diff >= pair_min) & (diff <= pair_max)
        ia, ib = mask.nonzero(as_tuple=True)
        if ia.numel() > 0:
            losses.append(F.relu(margin_logit - (predicted_parent[ia] - predicted_parent[ib])).mean())
    if not losses:
        return outputs.sum() * 0.0
    return torch.stack(losses).mean()


def teacher_policy_targets(teacher_parent_cp, temperature_cp):
    if temperature_cp <= 0:
        raise ValueError("policy temperature must be positive")
    return torch.softmax(teacher_parent_cp / temperature_cp, dim=0)


def sibling_policy_loss(outputs, child_cp, parent_ids, k_sigmoid, temperature_cp):
    """Listwise teacher policy distillation, normalized independently per parent."""
    local_groups = defaultdict(list)
    for index, parent_id in enumerate(parent_ids):
        local_groups[parent_id].append(index)
    losses = []
    for indices in local_groups.values():
        idx = torch.tensor(indices, dtype=torch.long, device=outputs.device)
        teacher_parent_cp = -child_cp[idx]
        predicted_parent_cp = -outputs[idx] * k_sigmoid
        target = teacher_policy_targets(teacher_parent_cp, temperature_cp)
        log_policy = F.log_softmax(predicted_parent_cp / temperature_cp, dim=0)
        losses.append(-(target * log_policy).sum())
    if not losses:
        return outputs.sum() * 0.0
    return torch.stack(losses).mean()


def mix_replay_value_loss(sibling_loss, replay_loss, sibling_rows: int, replay_rows: int):
    """Per-row value mixture; ranking/policy regularizers stay sibling-local."""
    if sibling_rows <= 0 or replay_rows < 0:
        raise ValueError("invalid sibling/replay row counts")
    if replay_rows == 0:
        return sibling_loss
    replay_weight = replay_rows / sibling_rows
    return (sibling_loss + replay_weight * replay_loss) / (1.0 + replay_weight)


def dataset_provenance(path: str, usable_rows: int, selection: str, **details):
    """Pin exact source bytes and selection semantics in sibling checkpoints."""
    real_path = os.path.realpath(path)
    return {
        "path": os.path.abspath(path),
        "real_path": real_path,
        "sha256": sha256_file(real_path),
        "bytes": os.path.getsize(real_path),
        "usable_rows": int(usable_rows),
        "selection": selection,
        **details,
    }


def require_same_file_fingerprint(before, after, label: str) -> None:
    if (
        before.get("bytes") != after.get("bytes")
        or before.get("sha256") != after.get("sha256")
    ):
        raise ValueError(f"{label} changed while it was being loaded")


def atomic_torch_save(value, path: str) -> None:
    """Fsync a same-directory temporary checkpoint before atomic replacement."""
    target = os.path.abspath(path)
    directory = os.path.dirname(target)
    if not os.path.isdir(directory):
        raise ValueError(f"checkpoint output directory does not exist: {directory}")
    descriptor, temporary = tempfile.mkstemp(
        dir=directory,
        prefix=f".{os.path.basename(target)}.",
        suffix=".tmp",
    )
    descriptor_open = True
    try:
        with os.fdopen(descriptor, "wb") as checkpoint_file:
            descriptor_open = False
            torch.save(value, checkpoint_file)
            checkpoint_file.flush()
            os.fsync(checkpoint_file.fileno())
        os.replace(temporary, target)
        temporary = ""
        try:
            directory_fd = os.open(directory, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            # Atomic replacement is complete; directory fsync is unavailable
            # on some platforms/filesystems.
            pass
    finally:
        if descriptor_open:
            os.close(descriptor)
        if temporary:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass


def _fingerprint_binary_stream(source) -> tuple[int, str]:
    source.seek(0)
    digest = hashlib.sha256()
    byte_count = 0
    while True:
        block = source.read(1024 * 1024)
        if not block:
            break
        byte_count += len(block)
        digest.update(block)
    source.seek(0)
    return byte_count, digest.hexdigest()


def load_stable_torch_checkpoint(path: str, *, weights_only: bool):
    """Load and fingerprint one inode, rejecting a concurrently replaced path."""
    with open(path, "rb") as source:
        loaded_bytes, loaded_sha256 = _fingerprint_binary_stream(source)
        checkpoint = torch.load(
            source,
            map_location="cpu",
            weights_only=weights_only,
        )
    try:
        with open(path, "rb") as current:
            current_bytes, current_sha256 = _fingerprint_binary_stream(current)
    except OSError as error:
        raise ValueError(f"checkpoint changed while it was being loaded: {path}") from error
    if (current_bytes, current_sha256) != (loaded_bytes, loaded_sha256):
        raise ValueError(f"checkpoint changed while it was being loaded: {path}")
    return checkpoint, {"bytes": loaded_bytes, "sha256": loaded_sha256}


def sibling_selection_key(pair_acc: float, top1: float, val_loss: float):
    """Maximize sibling pair accuracy, then top-1, then minimize value loss."""
    pair_key = pair_acc if math.isfinite(pair_acc) else float("-inf")
    top1_key = top1 if math.isfinite(top1) else float("-inf")
    loss_key = -val_loss if math.isfinite(val_loss) else float("-inf")
    return pair_key, top1_key, loss_key


def sibling_metrics(outputs, child_cp, metadata, pair_min):
    if not torch.isfinite(outputs).all() or not torch.isfinite(child_cp).all():
        raise ValueError("sibling metrics require finite predictions and teacher scores")
    groups = defaultdict(list)
    for index, row in enumerate(metadata):
        parent_id = row.get("parent_id")
        if isinstance(parent_id, str) and parent_id:
            groups[parent_id].append(index)
    pair_correct = pair_total = top1_correct = top1_total = 0
    for indices in groups.values():
        if len(indices) < 2:
            continue
        idx = torch.tensor(indices, dtype=torch.long)
        teacher_parent = -child_cp[idx]
        predicted_parent = -outputs[idx]
        for a in range(len(indices)):
            for b in range(a + 1, len(indices)):
                teacher_delta = teacher_parent[a] - teacher_parent[b]
                if abs(float(teacher_delta)) < pair_min or float(teacher_delta) == 0.0:
                    continue
                predicted_delta = predicted_parent[a] - predicted_parent[b]
                pair_correct += int(float(teacher_delta * predicted_delta) > 0.0)
                pair_total += 1
        # Records are normally sorted by teacher_rank. Comparing argmax
        # indices would therefore award an all-tied predictor the first row and
        # report a fake top-1 hit. A prediction is correct only when every move
        # tied for its maximum is genuinely teacher-best; teacher-side ties are
        # allowed and input order is irrelevant.
        teacher_best = teacher_parent == teacher_parent.max()
        predicted_best = predicted_parent == predicted_parent.max()
        top1_correct += int(bool(torch.all(~predicted_best | teacher_best)))
        top1_total += 1
    pair_acc = pair_correct / pair_total if pair_total else float("nan")
    top1 = top1_correct / top1_total if top1_total else float("nan")
    return pair_acc, top1


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


def validate_training_hyperparameters(args) -> None:
    """Reject non-finite or ineffective CLI configurations before any data I/O."""
    if not math.isfinite(args.k) or not 1.0 <= args.k <= MATE_SCORE_CP:
        raise ValueError("--k must be finite and in [1, 1000000]")
    if not 1 <= args.cp_clamp <= MATE_SCORE_CP:
        raise ValueError("--cp-clamp must be in [1, 1000000]")
    if args.epochs < 0 or (args.epochs == 0 and not args.init_ckpt):
        raise ValueError("--epochs must be positive unless evaluating an --init-ckpt")
    if args.batch <= 0:
        raise ValueError("--batch must be positive")
    if not math.isfinite(args.lr) or args.lr <= 0:
        raise ValueError("--lr must be finite and positive")
    if not math.isfinite(args.val_ratio) or not 0 < args.val_ratio < 1:
        raise ValueError("--val-ratio must be finite and between 0 and 1")
    if args.limit < 0:
        raise ValueError("--limit must be non-negative")
    if not math.isfinite(args.replay_ratio) or args.replay_ratio < 0:
        raise ValueError("--replay-ratio must be finite and non-negative")
    if args.replay_limit < 0:
        raise ValueError("--replay-limit must be non-negative")
    for field, option in (
        ("rank_weight", "--rank-weight"),
        ("policy_weight", "--policy-weight"),
        ("rank_pair_min", "--rank-pair-min"),
        ("rank_pair_max", "--rank-pair-max"),
        ("rank_margin_cp", "--rank-margin-cp"),
    ):
        value = getattr(args, field)
        if not math.isfinite(value) or value < 0:
            raise ValueError(f"{option} must be finite and non-negative")
    if args.rank_pair_min > args.rank_pair_max:
        raise ValueError("--rank-pair-min must not exceed --rank-pair-max")
    if not math.isfinite(args.policy_temp_cp) or args.policy_temp_cp <= 0:
        raise ValueError("--policy-temp-cp must be finite and positive")
    if args.loss == "ranking" and args.rank_weight <= 0:
        raise ValueError("--loss ranking requires a positive --rank-weight")
    if args.loss == "sibling-ranking":
        if args.rank_weight == 0 and args.policy_weight == 0:
            raise ValueError(
                "--loss sibling-ranking requires a positive rank or policy weight"
            )
        if args.rank_weight > 0 and args.rank_pair_max <= 0:
            raise ValueError(
                "positive --rank-weight requires a positive --rank-pair-max"
            )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(os.path.dirname(__file__), "data", "teacher.jsonl"))
    ap.add_argument(
        "--val-data",
        default="",
        help="pre-split validation JSONL; required for sibling-ranking to prevent game leakage",
    )
    ap.add_argument(
        "--sibling-manifest",
        default="",
        help="v6-policy teacher manifest; required for sibling-ranking and bound to --data/--val-data",
    )
    ap.add_argument(
        "--replay-data",
        default="",
        help="legacy value-only train data interleaved during sibling fine-tuning (never validation)",
    )
    ap.add_argument(
        "--replay-limit",
        type=int,
        default=500_000,
        help="deterministic whole-file replay sample size (default 500000; 0=all)",
    )
    ap.add_argument("--replay-ratio", type=float, default=1.0, help="replay rows per sibling row")
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
    ap.add_argument("--loss", default="sigmoid", choices=["sigmoid", "ranking", "sibling-ranking"])
    ap.add_argument("--rank-weight", type=float, default=1.0, help="ranking loss の重み係数")
    ap.add_argument("--rank-pair-min", type=float, default=50.0, help="ペア対象の教師cp差 下限")
    ap.add_argument("--rank-pair-max", type=float, default=600.0, help="ペア対象の教師cp差 上限")
    ap.add_argument("--rank-margin-cp", type=float, default=50.0, help="margin (cp 単位, ロジット空間では /K)")
    ap.add_argument("--policy-weight", type=float, default=0.25, help="sibling listwise policy loss weight")
    ap.add_argument("--policy-temp-cp", type=float, default=200.0, help="teacher/student policy temperature in cp")
    ap.add_argument(
        "--select-metric",
        default="auto",
        choices=["auto", "value-loss", "sibling-pair"],
        help="best.pt selection (auto: sibling-pair for sibling loss, otherwise value-loss)",
    )
    ap.add_argument("--init-ckpt", default="", help="model-only warm start; optimizer/scheduler are always fresh")
    ap.add_argument(
        "--allow-legacy-init",
        action="store_true",
        help="allow an audited pre-schema checkpoint and only unambiguous legacy-field inference",
    )
    args = ap.parse_args()

    if args.loss == "sibling-ranking" and not args.val_data:
        raise SystemExit("[train] --loss sibling-ranking requires an explicit --val-data split")
    if args.loss == "sibling-ranking" and not args.sibling_manifest:
        raise SystemExit("[train] --loss sibling-ranking requires --sibling-manifest")
    if args.sibling_manifest and args.loss != "sibling-ranking":
        raise SystemExit("[train] --sibling-manifest is only supported with --loss sibling-ranking")
    if args.loss == "sibling-ranking" and args.limit:
        raise SystemExit(
            "[train] --limit is not supported with sibling-ranking because it can split a parent group"
        )
    if args.replay_data and args.loss != "sibling-ranking":
        raise SystemExit("[train] --replay-data is only supported with --loss sibling-ranking")
    if args.select_metric == "sibling-pair" and args.loss != "sibling-ranking":
        raise SystemExit("[train] --select-metric sibling-pair requires --loss sibling-ranking")
    try:
        validate_training_hyperparameters(args)
    except ValueError as error:
        raise SystemExit(f"[train] {error}") from error
    if args.select_metric == "auto":
        resolved_select_metric = (
            "sibling-pair" if args.loss == "sibling-ranking" else "value-loss"
        )
    else:
        resolved_select_metric = args.select_metric

    sibling_manifest_provenance = None
    if args.loss == "sibling-ranking":
        try:
            sibling_manifest_provenance = verify_sibling_manifest(
                args.sibling_manifest,
                train_path=args.data,
                val_path=args.val_data,
            )
        except SiblingManifestError as error:
            raise SystemExit(f"[train] sibling manifest rejected: {error}") from error

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

    need_metadata = args.loss == "sibling-ranking" or bool(args.val_data)
    if need_metadata:
        board, hands, y, cp, bucket, metadata = load_dataset_with_metadata(
            args.data,
            args.k,
            args.cp_clamp,
            args.limit,
            args.features,
            strict=args.loss == "sibling-ranking",
        )
    else:
        board, hands, y, cp, bucket = load_dataset(
            args.data, args.k, args.cp_clamp, args.limit, args.features
        )
        metadata = []
    n = y.shape[0]
    print(f"[train] dataset: {n} positions from {args.data} (features={args.features})")

    train_meta = []
    val_meta = []
    if args.val_data:
        if n < 1:
            raise SystemExit(f"[train] error: training dataset has only {n} usable positions")
        vb, vh, vy, vcp, vbk, val_meta = load_dataset_with_metadata(
            args.val_data,
            args.k,
            args.cp_clamp,
            args.limit,
            args.features,
            strict=args.loss == "sibling-ranking",
        )
        if vy.shape[0] < 1:
            raise SystemExit("[train] error: validation dataset has no usable positions")
        tb, th, ty, tcp, tbk, train_meta = board, hands, y, cp, bucket, metadata
        validate_disjoint_splits(train_meta, val_meta)
    else:
        if n < 2:
            raise SystemExit(
                f"[train] error: dataset has only {n} usable position(s); "
                "need at least 2 for a train/val split. "
                "Check --data path, --limit, and that the JSONL contains valid records."
            )
        perm = torch.randperm(n)
        board, hands, y, cp, bucket = board[perm], hands[perm], y[perm], cp[perm], bucket[perm]
        if metadata:
            metadata = reorder_metadata(metadata, perm)
        # Legacy datasets retain their historical row-level split. New strong-game
        # sibling data must use --val-data and can never enter this branch.
        n_val_split = max(1, min(int(n * args.val_ratio), n - 1))
        vb, vh, vy, vcp, vbk = (
            board[:n_val_split], hands[:n_val_split], y[:n_val_split], cp[:n_val_split], bucket[:n_val_split]
        )
        tb, th, ty, tcp, tbk = (
            board[n_val_split:], hands[n_val_split:], y[n_val_split:], cp[n_val_split:], bucket[n_val_split:]
        )
        val_meta = metadata[:n_val_split]
        train_meta = metadata[n_val_split:]

    n_val = vy.shape[0]
    train_groups = val_groups = []
    train_sibling_cp = val_sibling_cp = None
    if args.loss == "sibling-ranking":
        train_groups = validate_sibling_metadata(train_meta, "train")
        val_groups = validate_sibling_metadata(val_meta, "val")
        # The sigmoid value target remains clamped for compatibility with the
        # production network, but sibling ordering must not turn all mate/high
        # scores into an artificial ±3000 tie.
        train_sibling_cp = raw_sibling_cp(train_meta)
        val_sibling_cp = raw_sibling_cp(val_meta)
    print(
        f"[train] train={ty.shape[0]} val={vy.shape[0]} loss={args.loss}" +
        (f" parents={len(train_groups)}/{len(val_groups)}" if train_groups else "")
    )

    replay = None
    replay_source_fingerprint = None
    if args.replay_data:
        validation_child_ids = {
            row["child_position_id"] for row in val_meta if row.get("child_position_id")
        }
        replay_loaded = load_replay_dataset(
            args.replay_data,
            args.k,
            args.cp_clamp,
            args.replay_limit,
            args.features,
            args.seed + 2,
            validation_child_ids,
            include_fingerprint=True,
        )
        replay = replay_loaded[:5]
        replay_source_fingerprint = replay_loaded[5]
        if replay[2].shape[0] < 1:
            raise SystemExit("[train] replay dataset has no usable positions")
        print(
            f"[train] replay={replay[2].shape[0]} from {args.replay_data} "
            f"ratio={args.replay_ratio:g} (train-only)"
        )

    data_provenance = None
    if args.loss == "sibling-ranking":
        primary_selection = "prefix" if args.limit else "all"
        train_provenance = dataset_provenance(
            args.data,
            ty.shape[0],
            primary_selection,
            requested_limit=args.limit,
        )
        validation_provenance = dataset_provenance(
            args.val_data,
            vy.shape[0],
            primary_selection,
            requested_limit=args.limit,
        )
        expected_outputs = sibling_manifest_provenance["outputs"]
        for split, actual, expected_prefix in (
            ("train", train_provenance, "train"),
            ("validation", validation_provenance, "val"),
        ):
            if (
                actual["bytes"] != expected_outputs[f"{expected_prefix}_bytes"]
                or actual["sha256"] != expected_outputs[f"{expected_prefix}_sha256"]
            ):
                raise SystemExit(
                    f"[train] {split} dataset changed after sibling manifest verification"
                )
        data_provenance = {
            "sibling_manifest": sibling_manifest_provenance,
            "train": train_provenance,
            "validation": validation_provenance,
            "replay": None,
        }
        if replay is not None:
            replay_provenance = dataset_provenance(
                args.replay_data,
                replay[2].shape[0],
                "all" if args.replay_limit == 0 else "uniform_without_replacement_at_most",
                requested_limit=args.replay_limit,
                sample_seed=args.seed + 2,
                replay_ratio=args.replay_ratio,
                excluded_validation_child_position_ids=len(validation_child_ids),
                validation_child_position_ids_sha256=identifier_set_sha256(
                    validation_child_ids
                ),
            )
            try:
                require_same_file_fingerprint(
                    replay_source_fingerprint,
                    replay_provenance,
                    "replay dataset",
                )
            except ValueError as error:
                raise SystemExit(f"[train] {error}") from error
            data_provenance["replay"] = replay_provenance

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

    model = DistillNet(args.features)
    arch = expected_arch(
        features=args.features,
        input_dim=model.board_feats + model.hand_feats,
        h1=DistillNet.H1,
        h2=DistillNet.H2,
        k=args.k,
        kp_buckets=KP_BUCKETS if model.kp else 1,
    )
    init_metadata = None
    if args.init_ckpt:
        init_path = os.path.realpath(args.init_ckpt)
        if not os.path.isfile(init_path):
            raise SystemExit(f"[train] warm-start checkpoint not found: {args.init_ckpt}")
        if os.path.realpath(args.out) == os.path.dirname(init_path):
            raise SystemExit("[train] --out must not overwrite the initializer checkpoint directory")
        try:
            initializer, initializer_fingerprint = load_stable_torch_checkpoint(
                init_path,
                weights_only=False,
            )
        except Exception as error:
            raise SystemExit(f"[train] failed to load warm-start checkpoint: {error}") from error
        initializer_arch = initializer.get("arch") if isinstance(initializer, dict) else None
        inferred_legacy_fields = []
        if isinstance(initializer_arch, dict):
            initializer_arch = dict(initializer_arch)
            legacy_args = initializer.get("args") if isinstance(initializer.get("args"), dict) else {}
            missing_contract = [
                field for field in ("schema", "features", "kp_buckets") if field not in initializer_arch
            ]
            if missing_contract and not args.allow_legacy_init:
                raise SystemExit(
                    "[train] initializer predates the complete arch contract "
                    f"(missing {', '.join(missing_contract)}); rerun with --allow-legacy-init only after auditing it"
                )
            if "features" not in initializer_arch:
                inferred_features = legacy_args.get("features")
                if inferred_features is None and initializer_arch.get("input") == INPUT_DIM:
                    inferred_features = "board"
                if inferred_features is not None:
                    initializer_arch["features"] = inferred_features
                    inferred_legacy_fields.append("features")
            if "kp_buckets" not in initializer_arch and "features" in initializer_arch:
                initializer_arch["kp_buckets"] = (
                    KP_BUCKETS if initializer_arch["features"] in ("kp", "kp-factor") else 1
                )
                inferred_legacy_fields.append("kp_buckets")
            if "schema" not in initializer_arch:
                initializer_arch["schema"] = 1
                inferred_legacy_fields.append("schema")
        try:
            validate_arch(initializer_arch, arch)
            model.load_state_dict(initializer["model"], strict=True)
        except (KeyError, RuntimeError, ValueError) as error:
            raise SystemExit(f"[train] incompatible warm-start checkpoint: {error}") from error
        init_metadata = {
            "path": os.path.abspath(args.init_ckpt),
            "sha256": initializer_fingerprint["sha256"],
            "bytes": initializer_fingerprint["bytes"],
            "epoch": initializer.get("epoch"),
            "val_loss": initializer.get("val_loss"),
            "val_mae_cp": initializer.get("val_mae_cp"),
            "legacy_arch_inferred_fields": inferred_legacy_fields,
        }
        print(
            f"[train] warm start: {args.init_ckpt} sha256={init_metadata['sha256']} "
            f"epoch={init_metadata['epoch']} (fresh optimizer)"
        )
    model = model.to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=max(1, args.epochs))

    os.makedirs(args.out, exist_ok=True)
    curve_path = os.path.join(args.out, "curve.csv")
    with open(curve_path, "w") as f:
        f.write(
            "epoch,train_loss,val_loss,val_mae_cp,val_pair_acc,lr,sec,"
            "val_sibling_pair_acc,val_sibling_top1\n"
        )

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
                if not torch.isfinite(out).all():
                    raise SystemExit("[train] validation produced non-finite model output")
                pred = torch.sigmoid(out)
                total += F.mse_loss(pred, t, reduction="sum").item()
                # 参考: cp 空間での MAE (ロジット差 * K)
                t_logit = torch.logit(t.clamp(1e-6, 1 - 1e-6))
                mae_cp += (out - t_logit).abs().sum().item() * args.k
                cnt += t.shape[0]
                outs.append(out.cpu())
        # 順位一致率: 教師cp差>100 の固定ペアで予測の大小が一致する率
        pair_acc = float("nan")
        sibling_pair_acc = float("nan")
        sibling_top1 = float("nan")
        o = torch.cat(outs)
        if pi.shape[0] > 0:
            agree = ((o[pi] - o[pj]) * (vcp[pi] - vcp[pj])) > 0
            pair_acc = agree.float().mean().item()
        if args.loss == "sibling-ranking":
            sibling_pair_acc, sibling_top1 = sibling_metrics(
                o, val_sibling_cp, val_meta, args.rank_pair_min
            )
        metrics = (total / cnt, mae_cp / cnt, pair_acc, sibling_pair_acc, sibling_top1)
        required_finite = metrics[:2] + (metrics[3:] if args.loss == "sibling-ranking" else ())
        if not all(math.isfinite(value) for value in required_finite):
            raise SystemExit("[train] validation produced non-finite metrics")
        return metrics

    def make_checkpoint(epoch, val_loss, val_mae_cp, val_pair_acc, sibling_pair_acc, sibling_top1):
        return {
            "model": model.state_dict(),
            "epoch": epoch,
            "val_loss": val_loss,
            "val_mae_cp": val_mae_cp,
            "val_pair_acc": val_pair_acc,
            "val_sibling_pair_acc": sibling_pair_acc,
            "val_sibling_top1": sibling_top1,
            "args": vars(args),
            "arch": arch,
            "init_checkpoint": init_metadata,
            "data_provenance": data_provenance,
            "checkpoint_selection": {
                "requested": args.select_metric,
                "resolved": resolved_select_metric,
                "best_value": ["val_loss:min"],
                "best_sibling": [
                    "val_sibling_pair_acc:max",
                    "val_sibling_top1:max",
                    "val_loss:min",
                ],
            },
        }

    best_val = float("inf")
    best_sibling_key = (float("-inf"), float("-inf"), float("-inf"))
    if init_metadata is not None:
        init_val, init_mae, init_pair, init_sibling_pair, init_top1 = evaluate()
        best_val = init_val
        initial_checkpoint = make_checkpoint(
            0, init_val, init_mae, init_pair, init_sibling_pair, init_top1
        )
        if args.loss == "sibling-ranking":
            best_sibling_key = sibling_selection_key(init_sibling_pair, init_top1, init_val)
            atomic_torch_save(initial_checkpoint, os.path.join(args.out, "best-value.pt"))
            atomic_torch_save(initial_checkpoint, os.path.join(args.out, "best-sibling.pt"))
        atomic_torch_save(initial_checkpoint, os.path.join(args.out, "best.pt"))
        atomic_torch_save(initial_checkpoint, os.path.join(args.out, "last.pt"))
        with open(curve_path, "a") as f:
            f.write(
                f"0,nan,{init_val:.6f},{init_mae:.1f},{init_pair:.4f},{args.lr:.6e},0.0,"
                f"{init_sibling_pair:.4f},{init_top1:.4f}\n"
            )
        print(
            f"[train] epoch   0/{args.epochs} initializer val={init_val:.6f} "
            f"val_mae≈{init_mae:.0f}cp pair_acc={init_pair:.4f} "
            f"sibling_pair={init_sibling_pair:.4f} sibling_top1={init_top1:.4f}"
        )

    n_train = ty.shape[0]
    rank_margin_logit = args.rank_margin_cp / args.k  # margin をロジット空間へ
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        model.train()
        if args.loss == "sibling-ranking":
            epoch_generator = torch.Generator().manual_seed(args.seed + epoch)
            epoch_batches = grouped_batches(train_groups, args.batch, epoch_generator)
        else:
            ep_perm = torch.randperm(n_train)
            epoch_batches = [ep_perm[i : i + args.batch] for i in range(0, n_train, args.batch)]
        total, cnt = 0.0, 0
        for sel in epoch_batches:
            b = tb[sel].to(device)
            h = th[sel].to(device)
            t = ty[sel].to(device)
            bk = tbk[sel].to(device)
            out = model(b, h, bk)
            value_loss = F.mse_loss(torch.sigmoid(out), t)
            regularization_loss = None
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
                    regularization_loss = args.rank_weight * rank_loss
            elif args.loss == "sibling-ranking":
                c = train_sibling_cp[sel].to(device)
                parent_ids = [train_meta[int(index)]["parent_id"] for index in sel.tolist()]
                rank_loss = sibling_ranking_loss(
                    out,
                    c,
                    parent_ids,
                    rank_margin_logit,
                    args.rank_pair_min,
                    args.rank_pair_max,
                )
                policy_loss = sibling_policy_loss(
                    out,
                    c,
                    parent_ids,
                    args.k,
                    args.policy_temp_cp,
                )
                regularization_loss = (
                    args.rank_weight * rank_loss + args.policy_weight * policy_loss
                )

            replay_count = 0
            if replay is not None and args.replay_ratio > 0:
                rb, rh, ry, _rcp, rbk = replay
                replay_count = max(1, round(t.shape[0] * args.replay_ratio))
                replay_sel = torch.randint(
                    0,
                    ry.shape[0],
                    (replay_count,),
                    generator=epoch_generator,
                )
                replay_out = model(
                    rb[replay_sel].to(device),
                    rh[replay_sel].to(device),
                    rbk[replay_sel].to(device),
                )
                replay_target = ry[replay_sel].to(device)
                replay_loss = F.mse_loss(torch.sigmoid(replay_out), replay_target)
                value_loss = mix_replay_value_loss(
                    value_loss, replay_loss, t.shape[0], replay_count
                )

            loss = (
                value_loss
                if regularization_loss is None
                else value_loss + regularization_loss
            )
            if not torch.isfinite(loss):
                raise SystemExit("[train] training produced a non-finite loss")
            opt.zero_grad()
            loss.backward()
            opt.step()
            total += loss.item() * t.shape[0]
            cnt += t.shape[0]
        sched.step()
        train_loss = total / cnt
        if not math.isfinite(train_loss):
            raise SystemExit("[train] training produced a non-finite epoch loss")
        val_loss, val_mae_cp, val_pair_acc, val_sibling_pair_acc, val_sibling_top1 = evaluate()
        sec = time.time() - t0
        lr_now = sched.get_last_lr()[0]
        print(
            f"[train] epoch {epoch:3d}/{args.epochs} train={train_loss:.6f} "
            f"val={val_loss:.6f} val_mae≈{val_mae_cp:.0f}cp pair_acc={val_pair_acc:.4f} "
            f"sibling_pair={val_sibling_pair_acc:.4f} sibling_top1={val_sibling_top1:.4f} "
            f"lr={lr_now:.2e} ({sec:.1f}s)"
        )
        with open(curve_path, "a") as f:
            f.write(
                f"{epoch},{train_loss:.6f},{val_loss:.6f},{val_mae_cp:.1f},"
                f"{val_pair_acc:.4f},{lr_now:.6e},{sec:.1f},"
                f"{val_sibling_pair_acc:.4f},{val_sibling_top1:.4f}\n"
            )

        ckpt = make_checkpoint(
            epoch,
            val_loss,
            val_mae_cp,
            val_pair_acc,
            val_sibling_pair_acc,
            val_sibling_top1,
        )
        atomic_torch_save(ckpt, os.path.join(args.out, "last.pt"))
        value_improved = val_loss < best_val
        if value_improved:
            best_val = val_loss
            if args.loss == "sibling-ranking":
                atomic_torch_save(ckpt, os.path.join(args.out, "best-value.pt"))
            if resolved_select_metric == "value-loss":
                atomic_torch_save(ckpt, os.path.join(args.out, "best.pt"))

        if args.loss == "sibling-ranking":
            current_sibling_key = sibling_selection_key(
                val_sibling_pair_acc, val_sibling_top1, val_loss
            )
            if current_sibling_key > best_sibling_key:
                best_sibling_key = current_sibling_key
                atomic_torch_save(ckpt, os.path.join(args.out, "best-sibling.pt"))
                if resolved_select_metric == "sibling-pair":
                    atomic_torch_save(ckpt, os.path.join(args.out, "best.pt"))

    print(
        f"[train] done. best val={best_val:.6f} select={resolved_select_metric}. "
        f"checkpoints in {args.out}"
    )
    print(f"[train] loss curve: {curve_path}")


if __name__ == "__main__":
    main()
