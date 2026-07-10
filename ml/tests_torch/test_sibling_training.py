import json
import math
import os
import random
import sys
import tempfile
import unittest
from types import SimpleNamespace

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from train import (  # noqa: E402
    load_replay_dataset,
    load_dataset_with_metadata,
    cp_sigmoid_target,
    dataset_provenance,
    mate_to_cp,
    mix_replay_value_loss,
    position_id_from_sfen,
    raw_sibling_cp,
    require_same_file_fingerprint,
    sibling_selection_key,
    sibling_metrics,
    sibling_policy_loss,
    sibling_ranking_loss,
    teacher_policy_targets,
    validate_disjoint_splits,
    validate_sibling_metadata,
    validate_training_hyperparameters,
)


PARENT_SFEN = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
CHILD_A = "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"
CHILD_B = "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2"


def sibling_row(
    move,
    rank,
    parent_cp,
    *,
    child_sfen=None,
    sources=None,
    score_kind="cp",
    mate=None,
    mate_sign=None,
    split="train",
):
    child = child_sfen or (CHILD_A if move == "7g7f" else CHILD_B)
    row = {
        "schema": "shogi-sibling-v1",
        "schema_version": 1,
        "game_id": "game",
        "parent_id": "parent",
        "position_id": position_id_from_sfen(PARENT_SFEN),
        "parent_sfen": PARENT_SFEN,
        "parent_ply": 0,
        "ply": 1,
        "move": move,
        "sources": sources if sources is not None else (["played", "teacher"] if rank == 1 else ["teacher"]),
        "sfen": child,
        "child_position_id": position_id_from_sfen(child),
        "cp": -parent_cp,
        "child_sfen": child,
        "teacher_child_cp": -parent_cp,
        "teacher_parent_cp": parent_cp,
        "teacher_rank": rank,
        "teacher_score_kind": score_kind,
        "split": split,
        "raw_cp": -parent_cp,
    }
    if score_kind == "mate":
        row["teacher_mate"] = mate
        row["teacher_mate_sign"] = mate_sign
    return row


def write_rows(path, rows):
    with open(path, "w", encoding="utf-8", newline="\n") as target:
        for row in rows:
            persisted = {key: value for key, value in row.items() if key != "raw_cp"}
            target.write(json.dumps(persisted, sort_keys=True) + "\n")


class SiblingTrainingLossTest(unittest.TestCase):
    def test_training_hyperparameters_reject_nonfinite_or_ineffective_values(self):
        valid = {
            "k": 600.0,
            "cp_clamp": 3000,
            "epochs": 1,
            "init_ckpt": "",
            "batch": 256,
            "lr": 1e-3,
            "val_ratio": 0.1,
            "limit": 0,
            "replay_ratio": 1.0,
            "replay_limit": 500_000,
            "rank_weight": 1.0,
            "policy_weight": 0.25,
            "rank_pair_min": 50.0,
            "rank_pair_max": 600.0,
            "rank_margin_cp": 50.0,
            "policy_temp_cp": 200.0,
            "loss": "sibling-ranking",
        }
        mutations = [
            ("nan k", {"k": float("nan")}),
            ("sub-production k", {"k": 0.5}),
            ("oversized k", {"k": 1_000_001.0}),
            ("zero clamp", {"cp_clamp": 0}),
            ("oversized clamp", {"cp_clamp": 1_000_001}),
            ("negative epochs", {"epochs": -1}),
            ("zero scratch epochs", {"epochs": 0}),
            ("zero batch", {"batch": 0}),
            ("nan lr", {"lr": float("nan")}),
            ("zero lr", {"lr": 0.0}),
            ("nan val ratio", {"val_ratio": float("nan")}),
            ("full val ratio", {"val_ratio": 1.0}),
            ("negative limit", {"limit": -1}),
            ("nan replay ratio", {"replay_ratio": float("nan")}),
            ("negative replay ratio", {"replay_ratio": -1.0}),
            ("negative replay limit", {"replay_limit": -1}),
            ("nan rank weight", {"rank_weight": float("nan")}),
            ("negative policy weight", {"policy_weight": -0.1}),
            ("negative pair min", {"rank_pair_min": -1.0}),
            ("infinite pair max", {"rank_pair_max": float("inf")}),
            ("reversed pair range", {"rank_pair_min": 601.0}),
            ("negative margin", {"rank_margin_cp": -1.0}),
            ("nan policy temperature", {"policy_temp_cp": float("nan")}),
            ("zero policy temperature", {"policy_temp_cp": 0.0}),
            ("ranking disabled", {"loss": "ranking", "rank_weight": 0.0}),
            (
                "all sibling objectives disabled",
                {"rank_weight": 0.0, "policy_weight": 0.0},
            ),
            (
                "positive rank weight with empty range",
                {"rank_pair_min": 0.0, "rank_pair_max": 0.0},
            ),
        ]
        for label, mutation in mutations:
            with self.subTest(label=label):
                candidate = {**valid, **mutation}
                with self.assertRaises(ValueError):
                    validate_training_hyperparameters(SimpleNamespace(**candidate))

        # Epoch zero remains an intentional initializer-evaluation mode.
        initializer_only = {**valid, "epochs": 0, "init_ckpt": "initializer.pt"}
        validate_training_hyperparameters(SimpleNamespace(**initializer_only))

        self.assertEqual(cp_sigmoid_target(-1_000_000, 1.0), 0.0)
        self.assertEqual(cp_sigmoid_target(1_000_000, 1.0), 1.0)

    def test_mate_band_rank_contract_is_revalidated_before_training(self):
        valid = [
            sibling_row("7g7f", 1, -35_281),
            sibling_row(
                "2g2f",
                2,
                mate_to_cp(-4, -1),
                score_kind="mate",
                mate=-4,
                mate_sign=-1,
            ),
        ]
        self.assertEqual(len(validate_sibling_metadata(valid, "test")), 1)
        self.assertEqual(mate_to_cp(0, -1), -1_000_000)

        bad_sign = [valid[0], {**valid[1], "teacher_mate": 4}]
        with self.assertRaisesRegex(SystemExit, "mate metadata|mate sign"):
            validate_sibling_metadata(bad_sign, "test")

        bad_order = [
            sibling_row("7g7f", 1, 10),
            sibling_row("2g2f", 2, 20),
        ]
        with self.assertRaisesRegex(SystemExit, "rank/cp contradiction"):
            validate_sibling_metadata(bad_order, "test")

    def test_sibling_metrics_reject_nonfinite_values(self):
        metadata = [{"parent_id": "A"}, {"parent_id": "A"}]
        with self.assertRaisesRegex(ValueError, "finite"):
            sibling_metrics(
                torch.tensor([float("nan"), 0.0]),
                torch.tensor([-100.0, 0.0]),
                metadata,
                pair_min=50.0,
            )

    def test_primary_sibling_loader_fails_closed_on_any_bad_row(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "partially-corrupt.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 0}) + "\n")
                target.write("{broken-json\n")

            permissive = load_dataset_with_metadata(path, 600.0, 3000)
            self.assertEqual(permissive[2].shape[0], 1)
            with self.assertRaisesRegex(ValueError, "strict dataset rejected 2"):
                load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_strict_loader_accepts_formal_schema_and_forward_compatible_sources(self):
        rows = [
            sibling_row(
                "7g7f",
                1,
                200,
                sources=["played", "teacher", "candidate-z"],
            ),
            sibling_row("2g2f", 2, -100),
        ]
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "valid.jsonl")
            write_rows(path, rows)
            loaded = load_dataset_with_metadata(path, 600.0, 3000, strict=True)
            self.assertEqual(loaded[2].shape[0], 2)
            self.assertEqual(len(validate_sibling_metadata(loaded[5], "train")), 1)

    def test_strict_loader_rejects_row_contract_mutations(self):
        base = [sibling_row("7g7f", 1, 200), sibling_row("2g2f", 2, -100)]

        def forged_turn(row):
            changed = dict(row)
            changed["parent_sfen"] = PARENT_SFEN.replace(" b - 1", " x - 1")
            changed["position_id"] = position_id_from_sfen(changed["parent_sfen"])
            return changed

        mutations = {
            "schema": lambda row: {**row, "schema": "other"},
            "schema-version-bool": lambda row: {**row, "schema_version": True},
            "schema-version-float": lambda row: {**row, "schema_version": 1.0},
            "self-consistent-invalid-turn": forged_turn,
            "parent-position-id": lambda row: {**row, "position_id": "sha256:wrong"},
            "parent-ply-bool": lambda row: {**row, "parent_ply": False},
            "parent-ply-float": lambda row: {**row, "parent_ply": 0.0},
            "child-ply": lambda row: {**row, "ply": 2},
            "child-alias": lambda row: {**row, "child_sfen": CHILD_B},
            "child-position-id": lambda row: {**row, "child_position_id": "sha256:wrong"},
            "cp-bool": lambda row: {**row, "cp": True},
            "cp-float": lambda row: {**row, "cp": float(row["cp"])},
            "teacher-child-alias": lambda row: {**row, "teacher_child_cp": row["cp"] + 1},
            "teacher-parent-float": lambda row: {
                **row,
                "teacher_parent_cp": float(row["teacher_parent_cp"]),
            },
            "rank-bool": lambda row: {**row, "teacher_rank": True},
            "rank-float": lambda row: {**row, "teacher_rank": 1.0},
            "sources-empty": lambda row: {**row, "sources": []},
            "sources-duplicate": lambda row: {**row, "sources": ["played", "played"]},
            "sources-order": lambda row: {**row, "sources": ["candidate-z", "teacher"]},
            "sources-whitespace": lambda row: {**row, "sources": ["played", " x "]},
            "score-kind": lambda row: {**row, "teacher_score_kind": "unknown"},
            "cp-with-mate-field": lambda row: {**row, "teacher_mate": None},
            "split": lambda row: {**row, "split": "validation"},
        }
        with tempfile.TemporaryDirectory() as tmp:
            for name, mutate in mutations.items():
                with self.subTest(name=name):
                    rows = [mutate(base[0]), base[1]]
                    path = os.path.join(tmp, f"{name}.jsonl")
                    write_rows(path, rows)
                    with self.assertRaisesRegex(ValueError, "strict dataset rejected 1"):
                        load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_strict_loader_rejects_malformed_board_and_hand_grammar(self):
        malformed = {
            "eight-ranks": "9/9/9/9/9/9/9/9 b - 1",
            "short-rank": "8/9/9/9/9/9/9/9/9 b - 1",
            "zero-run": "90/9/9/9/9/9/9/9/9 b - 1",
            "bad-promotion": "+G8/9/9/9/9/9/9/9/9 b - 1",
            "bad-hand-piece": "9/9/9/9/9/9/9/9/9 b K 1",
            "bad-hand-count": "9/9/9/9/9/9/9/9/9 b 1P 1",
            "duplicate-hand-piece": "9/9/9/9/9/9/9/9/9 b P2P 1",
            "unordered-hand": "9/9/9/9/9/9/9/9/9 b PR 1",
        }
        base = [sibling_row("7g7f", 1, 200), sibling_row("2g2f", 2, -100)]
        with tempfile.TemporaryDirectory() as tmp:
            for name, bad_sfen in malformed.items():
                with self.subTest(name=name):
                    row = dict(base[0])
                    row["parent_sfen"] = bad_sfen
                    row["position_id"] = position_id_from_sfen(bad_sfen)
                    path = os.path.join(tmp, f"{name}.jsonl")
                    write_rows(path, [row, base[1]])
                    with self.assertRaisesRegex(ValueError, "strict dataset rejected 1"):
                        load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_strict_loader_rejects_non_integer_or_incomplete_mate_metadata(self):
        mate_cp = mate_to_cp(-4, -1)
        valid_mate = sibling_row(
            "2g2f",
            2,
            mate_cp,
            score_kind="mate",
            mate=-4,
            mate_sign=-1,
        )
        first = sibling_row("7g7f", 1, -35_281)
        mutations = {
            "mate-bool": {**valid_mate, "teacher_mate": True},
            "mate-float": {**valid_mate, "teacher_mate": -4.0},
            "sign-bool": {**valid_mate, "teacher_mate_sign": True},
            "sign-float": {**valid_mate, "teacher_mate_sign": -1.0},
            "missing-mate": {
                key: value for key, value in valid_mate.items() if key != "teacher_mate"
            },
        }
        with tempfile.TemporaryDirectory() as tmp:
            for name, row in mutations.items():
                with self.subTest(name=name):
                    path = os.path.join(tmp, f"{name}.jsonl")
                    write_rows(path, [first, row])
                    with self.assertRaisesRegex(ValueError, "strict dataset rejected 1"):
                        load_dataset_with_metadata(path, 600.0, 3000, strict=True)

    def test_group_contract_rejects_missing_played_and_inconsistent_parent_metadata(self):
        rows = [sibling_row("7g7f", 1, 200), sibling_row("2g2f", 2, -100)]
        no_played = [{**row, "sources": ["teacher"]} for row in rows]
        with self.assertRaisesRegex(SystemExit, "exactly one played"):
            validate_sibling_metadata(no_played, "train")

        inconsistent = [rows[0], {**rows[1], "parent_ply": 1, "ply": 2}]
        inconsistent[1]["parent_sfen"] = PARENT_SFEN.replace(" 1", " 2")
        inconsistent[1]["position_id"] = position_id_from_sfen(inconsistent[1]["parent_sfen"])
        inconsistent[1]["sfen"] = CHILD_B.replace(" 2", " 3")
        inconsistent[1]["child_sfen"] = inconsistent[1]["sfen"]
        inconsistent[1]["child_position_id"] = position_id_from_sfen(inconsistent[1]["sfen"])
        with self.assertRaisesRegex(SystemExit, "inconsistent group metadata"):
            validate_sibling_metadata(inconsistent, "train")

    def test_ranking_loss_is_parent_local_and_equal_parent_weighted(self):
        # Values are expressed from the parent side here; train.py receives
        # their negatives because every model row is the child position.
        teacher_parent = torch.tensor([300.0, 100.0, -200.0, 400.0, -50.0])
        student_parent = torch.tensor([0.0, 0.2, -0.1, 1.0, 0.0], requires_grad=True)
        parent_ids = ["A", "A", "A", "B", "B"]

        loss = sibling_ranking_loss(
            -student_parent,
            -teacher_parent,
            parent_ids,
            margin_logit=0.1,
            pair_min=0.0,
            pair_max=10_000.0,
        )
        self.assertAlmostEqual(float(loss.detach()), 0.05, places=6)
        loss.backward()
        self.assertTrue(torch.isfinite(student_parent.grad).all())

        shifted = student_parent.detach().clone()
        shifted[3:] += 123.0
        shifted_loss = sibling_ranking_loss(
            -shifted,
            -teacher_parent,
            parent_ids,
            margin_logit=0.1,
            pair_min=0.0,
            pair_max=10_000.0,
        )
        self.assertAlmostEqual(float(shifted_loss), 0.05, places=6)

    def test_metrics_rank_only_within_each_parent(self):
        metadata = [
            {"parent_id": "A"},
            {"parent_id": "A"},
            {"parent_id": "B"},
            {"parent_id": "B"},
        ]
        child_cp = torch.tensor([-300.0, 100.0, -400.0, 50.0])
        perfect_child_prediction = child_cp / 600.0
        pair_acc, top1 = sibling_metrics(
            perfect_child_prediction,
            child_cp,
            metadata,
            pair_min=50.0,
        )
        self.assertEqual(pair_acc, 1.0)
        self.assertEqual(top1, 1.0)

    def test_top1_is_tie_safe_and_independent_of_teacher_rank_order(self):
        metadata = [{"parent_id": "A"}] * 3
        child_cp = torch.tensor([-300.0, -100.0, 50.0])
        all_tied_child_prediction = torch.zeros(3)
        _pair_acc, top1 = sibling_metrics(
            all_tied_child_prediction,
            child_cp,
            metadata,
            pair_min=50.0,
        )
        self.assertEqual(top1, 0.0)

        order = torch.tensor([2, 0, 1])
        _pair_acc, reordered_top1 = sibling_metrics(
            all_tied_child_prediction[order],
            child_cp[order],
            [metadata[int(index)] for index in order],
            pair_min=50.0,
        )
        self.assertEqual(reordered_top1, 0.0)

        # Teacher-side co-best moves are allowed when the predictor ties only
        # those moves, rather than tying them with a known-worse candidate.
        tied_teacher = torch.tensor([-300.0, -300.0, -100.0])
        predicted_child = torch.tensor([-1.0, -1.0, 0.0])
        _pair_acc, teacher_tie_top1 = sibling_metrics(
            predicted_child,
            tied_teacher,
            metadata,
            pair_min=50.0,
        )
        self.assertEqual(teacher_tie_top1, 1.0)

    def test_policy_targets_are_normalized_per_parent(self):
        teacher = torch.tensor([100.0 * math.log(4), 100.0 * math.log(2), 0.0])
        target = teacher_policy_targets(teacher, 100.0)
        expected = torch.tensor([4 / 7, 2 / 7, 1 / 7])
        self.assertTrue(torch.allclose(target, expected, atol=1e-7))

        child_cp = torch.tensor([-teacher[0], -teacher[1], -teacher[2], -400.0, 50.0])
        child_outputs = torch.tensor([0.0, 0.1, -0.2, -1.0, 0.0], requires_grad=True)
        parent_ids = ["A", "A", "A", "B", "B"]
        loss = sibling_policy_loss(
            child_outputs,
            child_cp,
            parent_ids,
            k_sigmoid=600.0,
            temperature_cp=100.0,
        )
        shifted = child_outputs.detach().clone()
        # A constant shift within one parent cannot change its policy.
        shifted[3:] += 50.0
        shifted_loss = sibling_policy_loss(
            shifted,
            child_cp,
            parent_ids,
            k_sigmoid=600.0,
            temperature_cp=100.0,
        )
        self.assertAlmostEqual(float(loss.detach()), float(shifted_loss), places=5)
        loss.backward()
        self.assertTrue(torch.isfinite(child_outputs.grad).all())

    def test_unclamped_teacher_scores_preserve_high_score_order(self):
        metadata = [{"raw_cp": -29_500}, {"raw_cp": -29_000}]
        child_cp = raw_sibling_cp(metadata)
        self.assertTrue(torch.equal(child_cp, torch.tensor([-29_500.0, -29_000.0])))

        # Both value targets clamp to -3000, but the sibling objective still
        # sees that the shorter mate/high-score line is better for the parent.
        student_parent = torch.tensor([0.0, 0.0], requires_grad=True)
        loss = sibling_ranking_loss(
            -student_parent,
            child_cp,
            ["A", "A"],
            margin_logit=0.1,
            pair_min=50.0,
            pair_max=600.0,
        )
        self.assertAlmostEqual(float(loss.detach()), 0.1, places=6)
        loss.backward()
        self.assertLess(float(student_parent.grad[0]), 0.0)
        self.assertGreater(float(student_parent.grad[1]), 0.0)

    def test_replay_rows_change_the_value_mixture_weight(self):
        sibling = torch.tensor(2.0)
        replay = torch.tensor(10.0)
        quarter = mix_replay_value_loss(sibling, replay, sibling_rows=4, replay_rows=1)
        equal = mix_replay_value_loss(sibling, replay, sibling_rows=4, replay_rows=4)
        self.assertAlmostEqual(float(quarter), 3.6, places=6)
        self.assertAlmostEqual(float(equal), 6.0, places=6)
        self.assertNotEqual(float(quarter), float(equal))

    def test_sibling_checkpoint_key_uses_documented_tie_breaks(self):
        baseline = sibling_selection_key(0.8, 0.6, 0.02)
        self.assertGreater(sibling_selection_key(0.81, 0.1, 1.0), baseline)
        self.assertGreater(sibling_selection_key(0.8, 0.7, 1.0), baseline)
        self.assertGreater(sibling_selection_key(0.8, 0.6, 0.01), baseline)
        self.assertGreater(
            sibling_selection_key(float("nan"), 0.7, 0.02),
            (-math.inf, -math.inf, -math.inf),
        )

    def test_replay_limit_samples_the_whole_file_deterministically(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "ordered.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                for cp in range(20):
                    target.write(json.dumps({"sfen": start, "cp": cp}) + "\n")

            first = load_replay_dataset(path, 600.0, 3000, 5, "board", 44)
            second = load_replay_dataset(path, 600.0, 3000, 5, "board", 44)
            expected = sorted(random.Random(44).sample(range(20), 5))
            self.assertEqual(first[3].tolist(), [float(value) for value in expected])
            self.assertTrue(torch.equal(first[3], second[3]))
            self.assertNotEqual(first[3].tolist(), [0.0, 1.0, 2.0, 3.0, 4.0])

    def test_replay_fingerprint_detects_a_generation_change_during_load(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "replay.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 10}) + "\n")
                target.write(json.dumps({"sfen": start, "cp": 20}) + "\n")
            loaded = load_replay_dataset(
                path,
                600.0,
                3000,
                1,
                "board",
                44,
                include_fingerprint=True,
            )
            before = loaded[5]
            current = dataset_provenance(path, 1, "test")
            require_same_file_fingerprint(before, current, "replay dataset")

            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 30}) + "\n")
                target.write(json.dumps({"sfen": start, "cp": 40}) + "\n")
            self.assertEqual(before["bytes"], os.path.getsize(path))
            changed = dataset_provenance(path, 1, "test")
            with self.assertRaisesRegex(ValueError, "changed while it was being loaded"):
                require_same_file_fingerprint(before, changed, "replay dataset")

    def test_replay_excludes_validation_child_transpositions(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
        distinct = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b P 1"
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "replay.jsonl")
            with open(path, "w", encoding="utf-8", newline="\n") as target:
                target.write(json.dumps({"sfen": start, "cp": 100}) + "\n")
                target.write(json.dumps({"sfen": distinct, "cp": 200}) + "\n")
            replay = load_replay_dataset(
                path,
                600.0,
                3000,
                0,
                "board",
                44,
                {position_id_from_sfen(start)},
            )
            self.assertEqual(replay[3].tolist(), [200.0])

    def test_child_position_identity_matches_schema_and_blocks_transposition_leakage(self):
        start = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 99"
        child_id = position_id_from_sfen(start)
        self.assertEqual(
            child_id,
            "sha256:8b7a6db5e99a9d4cbcbdd8c3d0ea78e0ba5ff73cf561276d5e1d133a86c412a8",
        )
        train = [{
            "game_id": "train-game",
            "parent_id": "train-parent",
            "position_id": "train-position",
            "child_position_id": child_id,
        }]
        val = [{
            "game_id": "val-game",
            "parent_id": "val-parent",
            "position_id": "val-position",
            "child_position_id": child_id,
        }]
        with self.assertRaisesRegex(SystemExit, "child_position_id"):
            validate_disjoint_splits(train, val)


if __name__ == "__main__":
    unittest.main()
