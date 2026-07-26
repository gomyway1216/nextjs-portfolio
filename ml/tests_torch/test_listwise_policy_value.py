import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from dataclasses import replace
from types import SimpleNamespace
from unittest import mock

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import listwise_policy_value as lpv  # noqa: E402
import train  # noqa: E402
import train_listwise_policy_value as runner  # noqa: E402


HIRATE = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
CHILD_7G7F = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/2P6/PP1PPPPPP/1B5R1/LNSGKGSNL w - 2"
)
CHILD_2G2F = (
    "lnsgkgsnl/1r5b1/ppppppppp/9/9/7P1/PPPPPPP1P/1B5R1/LNSGKGSNL w - 2"
)


def synthetic_group(
    parent_id: str,
    *,
    semantic_suffix: str,
    base_scores=(0.0, 0.0),
    teacher_scores=(200.0, 0.0),
) -> lpv.ParentGroup:
    board, hands, _turn, _king = train.parse_sfen(HIRATE)
    parent_board = tuple(
        board[: train.MAX_PIECES]
        + [train.PAD_IDX] * (train.MAX_PIECES - len(board))
    )
    moves = ("7g7f", "2g2f")
    examples = tuple(
        lpv.MoveExample(
            move=move,
            teacher_cp=teacher_scores[index],
            teacher_rank=index + 1,
            child_position_id=f"sha256:{semantic_suffix}{index}",
            child_sfen=HIRATE,
            features=lpv.encode_explicit_move(HIRATE, move),
            base_parent_cp=base_scores[index],
        )
        for index, move in enumerate(moves)
    )
    return lpv.ParentGroup(
        parent_id=parent_id,
        game_id=f"game-{parent_id}",
        position_id=f"sha256:{semantic_suffix}p",
        parent_sfen=HIRATE,
        parent_board=parent_board,
        parent_hands=tuple(hands),
        semantic_position_ids=frozenset(
            [f"sha256:{semantic_suffix}p"]
            + [example.child_position_id for example in examples]
        ),
        examples=examples,
        source_role="synthetic",
    )


class ListwisePolicyValueTests(unittest.TestCase):
    def test_move_child_transition_is_bound_and_wrong_mapping_is_rejected(self):
        self.assertEqual(lpv.child_sfen_after_usi(HIRATE, "7g7f"), CHILD_7G7F)
        lpv.validate_child_transition(HIRATE, "7g7f", CHILD_7G7F)
        with self.assertRaisesRegex(ValueError, "transition mismatch"):
            lpv.validate_child_transition(HIRATE, "7g7f", CHILD_2G2F)

    def test_explicit_encoder_has_bounded_collision_free_categories(self):
        pawn = lpv.encode_explicit_move(HIRATE, "7g7f")
        rook_pawn = lpv.encode_explicit_move(HIRATE, "2g2f")
        self.assertNotEqual(pawn.from_square, rook_pawn.from_square)
        self.assertNotEqual(pawn.to_square, rook_pawn.to_square)
        self.assertEqual(len(pawn.neighborhood), 16)
        self.assertTrue(all(0 <= value < 30 for value in pawn.neighborhood))
        self.assertTrue(0 <= pawn.self_king_relation < 17 * 17)
        self.assertTrue(0 <= pawn.enemy_king_relation < 17 * 17)
        self.assertNotIn("hash", lpv.FEATURE_VERSION)

        model = lpv.ExplicitResidualPolicy()
        self.assertEqual(model.parent_board.num_embeddings, 2269)
        self.assertEqual(model.from_square.num_embeddings, 82)
        self.assertEqual(model.to_square.num_embeddings, 81)
        self.assertEqual(model.hidden.in_features, 73)
        self.assertLess(
            2 * sum(parameter.numel() for parameter in model.parameters()),
            lpv.MAX_HEAD_BYTES,
        )

    def test_frozen_live_nnue_layout_is_exact_and_scores_without_mutation(self):
        repository = Path(ML_DIR).parent
        weights = repository / "public" / "shogi-nnue-weights.bin"
        before = weights.read_bytes()
        self.assertEqual(len(before), lpv.LIVE_NNUE_BYTES)
        self.assertEqual(hashlib.sha256(before).hexdigest(), lpv.LIVE_NNUE_SHA256)
        qweights = lpv.read_live_board_qweights(weights)
        self.assertEqual(tuple(qweights["w1_board"].shape), (2268, 256))
        self.assertEqual(tuple(qweights["w2"].shape), (32, 256))
        score = lpv.score_child_sfens_with_live_nnue(
            qweights, [HIRATE], batch_size=1
        )
        self.assertEqual(len(score), 1)
        self.assertTrue(torch.isfinite(torch.tensor(score)).all())
        self.assertEqual(weights.read_bytes(), before)

        with tempfile.TemporaryDirectory() as temporary:
            malformed = Path(temporary) / "weights.bin"
            malformed.write_bytes(before[:-1])
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                lpv.read_live_board_qweights(malformed)

    def test_live_nnue_cp_conversion_matches_production_truncation(self):
        qweights = {"unused": torch.tensor(0)}
        out_q = torch.tensor([14, -14, 13, -13], dtype=torch.int64)
        with mock.patch.object(lpv, "int16_forward_batch", return_value=out_q):
            scores = lpv.score_child_sfens_with_live_nnue(
                qweights, [HIRATE] * 4, batch_size=4
            )
        self.assertEqual(scores, [1.0, -1.0, 0.0, 0.0])

    def test_listwise_value_and_pair_loss_prefers_teacher_order(self):
        teacher = torch.tensor([[200.0, 0.0, -100.0]])
        valid = torch.tensor([[True, True, True]])
        good = torch.tensor([[180.0, 10.0, -80.0]], requires_grad=True)
        bad = torch.tensor([[-80.0, 10.0, 180.0]], requires_grad=True)
        residual = torch.zeros_like(good)
        kwargs = {
            "temperature_cp": 100.0,
            "pair_gap_cp": 50.0,
            "value_weight": 0.25,
            "pair_weight": 0.1,
            "residual_l2_weight": 0.02,
        }
        good_loss, good_parts = lpv.listwise_policy_value_loss(
            good, residual, teacher, valid, **kwargs
        )
        bad_loss, _ = lpv.listwise_policy_value_loss(
            bad, residual, teacher, valid, **kwargs
        )
        self.assertLess(
            float(good_loss.detach().item()), float(bad_loss.detach().item())
        )
        self.assertEqual(set(good_parts), {"policy", "value", "pair", "residual_l2"})
        good_loss.backward()
        self.assertTrue(torch.isfinite(good.grad).all())

    def test_batch_forward_and_quantized_export_are_bounded(self):
        groups = [
            synthetic_group("a", semantic_suffix="a"),
            synthetic_group("b", semantic_suffix="b", base_scores=(20.0, -10.0)),
        ]
        batch = lpv.make_batch(groups, "cpu")
        model = lpv.ExplicitResidualPolicy()
        combined, residual = model(batch)
        self.assertEqual(tuple(combined.shape), (2, 2))
        self.assertTrue(torch.equal(combined, batch["base_cp"]))
        self.assertTrue(torch.equal(residual, torch.zeros_like(residual)))

        with tempfile.TemporaryDirectory() as temporary:
            restored, metadata = lpv.quantize_export(model, temporary)
            self.assertLessEqual(metadata["bytes"], lpv.MAX_HEAD_BYTES)
            self.assertEqual(
                metadata["bytes"],
                (Path(temporary) / "weights.bin").stat().st_size,
            )
            restored_combined, _ = restored(batch)
            self.assertTrue(torch.equal(restored_combined, combined))

    def test_semantic_conflicts_drop_whole_parent(self):
        first = synthetic_group("a", semantic_suffix="shared")
        second = synthetic_group("b", semantic_suffix="other")
        protected = {next(iter(first.semantic_position_ids))}
        kept, dropped = lpv.filter_semantic_conflicts(
            [first, second], protected
        )
        self.assertEqual([group.parent_id for group in kept], ["b"])
        self.assertEqual(dropped, ["a"])
        self.assertFalse(
            lpv.semantic_union(kept) & protected,
            "no row from a conflicting parent may survive",
        )

    def test_component_split_is_semantic_game_disjoint_and_order_deterministic(self):
        groups = [
            synthetic_group(f"p{index}", semantic_suffix=f"component-{index}")
            for index in range(24)
        ]
        shared_semantic = "sha256:shared-across-games"
        groups[0] = replace(
            groups[0],
            semantic_position_ids=groups[0].semantic_position_ids
            | {shared_semantic},
        )
        groups[1] = replace(
            groups[1],
            semantic_position_ids=groups[1].semantic_position_ids
            | {shared_semantic},
        )
        groups[2] = replace(groups[2], game_id="shared-game")
        groups[3] = replace(groups[3], game_id="shared-game")

        fit, tune, receipt = lpv.split_by_semantic_components(
            groups, seed=42, tune_modulus=5
        )
        reversed_fit, reversed_tune, reversed_receipt = (
            lpv.split_by_semantic_components(
                list(reversed(groups)), seed=42, tune_modulus=5
            )
        )
        fit_ids = {group.parent_id for group in fit}
        tune_ids = {group.parent_id for group in tune}
        self.assertEqual(
            fit_ids, {group.parent_id for group in reversed_fit}
        )
        self.assertEqual(
            tune_ids, {group.parent_id for group in reversed_tune}
        )
        self.assertEqual(
            receipt["component_assignments_sha256"],
            reversed_receipt["component_assignments_sha256"],
        )
        self.assertTrue({"p0", "p1"} <= fit_ids or {"p0", "p1"} <= tune_ids)
        self.assertTrue({"p2", "p3"} <= fit_ids or {"p2", "p3"} <= tune_ids)
        self.assertFalse(
            {group.game_id for group in fit}
            & {group.game_id for group in tune}
        )
        self.assertFalse(lpv.semantic_union(fit) & lpv.semantic_union(tune))
        self.assertEqual(receipt["game_overlap"], 0)
        self.assertEqual(receipt["semantic_position_overlap"], 0)

    def test_component_split_fails_if_a_side_would_be_empty(self):
        with self.assertRaisesRegex(ValueError, "split is empty"):
            lpv.split_by_semantic_components(
                [synthetic_group("only", semantic_suffix="only")],
                seed=42,
                tune_modulus=5,
            )

    def test_full_refit_batches_visit_every_parent_once(self):
        v9 = [
            synthetic_group(f"v{index}", semantic_suffix=f"v{index}")
            for index in range(5)
        ]
        browser = [
            synthetic_group(f"b{index}", semantic_suffix=f"b{index}")
            for index in range(3)
        ]
        batches = runner._full_epoch_batches(
            v9, browser, epoch=1, seed=42, batch_parents=3
        )
        observed = [group.parent_id for batch in batches for group in batch]
        self.assertEqual(len(observed), 8)
        self.assertEqual(len(set(observed)), 8)
        self.assertEqual(
            set(observed),
            {group.parent_id for group in v9 + browser},
        )

    def test_refit_scheduler_keeps_original_planned_horizon(self):
        args = SimpleNamespace(
            device="cpu",
            lr=3e-4,
            seed=42,
            batch_parents=4,
            v9_per_browser=3,
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            value_weight=0.25,
            pair_weight=0.1,
            residual_l2_weight=0.02,
        )
        v9 = [
            synthetic_group(f"v{index}", semantic_suffix=f"sv{index}")
            for index in range(3)
        ]
        browser = [synthetic_group("b", semantic_suffix="sb")]
        torch.manual_seed(42)
        with mock.patch("builtins.print"):
            selection_curve, _, _ = runner._train_epochs(
                lpv.ExplicitResidualPolicy(),
                v9,
                browser,
                {},
                {},
                args,
                epochs=8,
                scheduler_t_max=8,
                record_selection=False,
                use_all_parents=False,
            )
        torch.manual_seed(42)
        with mock.patch("builtins.print"):
            refit_curve, _, _ = runner._train_epochs(
                lpv.ExplicitResidualPolicy(),
                v9,
                browser,
                {},
                {},
                args,
                epochs=3,
                scheduler_t_max=8,
                record_selection=False,
                use_all_parents=True,
            )
        self.assertEqual(
            [row["learning_rate"] for row in refit_curve],
            [row["learning_rate"] for row in selection_curve[:3]],
        )

    def test_registered_baseline_drift_fails_preflight(self):
        metrics = {
            "parents": 2,
            "top1_correct": 1,
            "top1_accuracy": 0.5,
            "pair_count": 4,
            "pair_accuracy": 0.75,
            "mean_regret_cp": 25.0,
        }
        base = {
            "browser_reject": dict(metrics),
            "v9_reject": dict(metrics),
        }
        gates = {
            "registered_live_baselines": {
                "browser_reject": dict(metrics),
                "v9_reject": dict(metrics),
            }
        }
        runner._verify_registered_live_baselines(base, gates)
        base["browser_reject"]["top1_correct"] = 0
        with self.assertRaisesRegex(ValueError, "live baseline drift"):
            runner._verify_registered_live_baselines(base, gates)

    def test_run_stops_on_baseline_drift_before_optimizer_creation(self):
        metrics = {
            "parents": 2,
            "top1_correct": 0,
            "top1_accuracy": 0.0,
            "pair_count": 2,
            "pair_accuracy": 0.5,
            "mean_regret_cp": 20.0,
        }
        registered = {
            **metrics,
            "top1_correct": 1,
            "top1_accuracy": 0.5,
        }
        receipt = {
            "protocol": {},
            "inputs": {},
            "registered_inputs": {
                name: {}
                for name in (
                    "v9_training",
                    "browser_training",
                    "browser_reject",
                    "v9_reject",
                )
            },
            "semantic_partition": {},
            "static_gates": {
                "registered_live_baselines": {
                    "browser_reject": registered,
                    "v9_reject": registered,
                }
            },
            "claim_boundary": "test",
        }
        args = SimpleNamespace(
            protocol="protocol.json",
            live_nnue="weights.bin",
            v9_data="v9.jsonl",
            browser_data="browser.jsonl",
            browser_reject_data="browser-val.jsonl",
            v9_reject_data="v9-val.jsonl",
            epochs=8,
            batch_parents=4,
            lr=3e-4,
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            value_weight=0.25,
            pair_weight=0.1,
            residual_l2_weight=0.02,
            v9_per_browser=3,
            tune_modulus=5,
            seed=42,
            device="cpu",
            torch_threads=1,
        )
        group = synthetic_group("preflight", semantic_suffix="preflight")
        source = {
            "bytes": 1,
            "sha256": "0" * 64,
            "rows": 2,
            "parents": 1,
            "games": 1,
        }
        with tempfile.TemporaryDirectory() as temporary:
            args.out = str(Path(temporary) / "run")
            with (
                mock.patch.object(runner, "_protocol_receipt", return_value=receipt),
                mock.patch.object(lpv, "read_live_board_qweights", return_value={}),
                mock.patch.object(
                    lpv, "load_groups", return_value=([group], source)
                ),
                mock.patch.object(
                    runner,
                    "_evaluate_domains",
                    return_value={
                        "browser_reject": dict(metrics),
                        "v9_reject": dict(metrics),
                    },
                ),
                mock.patch.object(torch.optim, "AdamW") as optimizer,
            ):
                with self.assertRaisesRegex(ValueError, "live baseline drift"):
                    runner.run(args)
                optimizer.assert_not_called()

    def test_protocol_preregisters_identity_gate_and_stop_boundary(self):
        protocol_path = (
            Path(ML_DIR) / "protocols" / "listwise-policy-value-v1-plan.json"
        )
        protocol = json.loads(protocol_path.read_text(encoding="utf-8"))
        self.assertEqual(protocol["schema"], lpv.PROTOCOL_SCHEMA)
        self.assertEqual(
            protocol["inputs"]["live_nnue"]["sha256"], lpv.LIVE_NNUE_SHA256
        )
        self.assertEqual(protocol["architecture"]["hash_functions"], 0)
        self.assertEqual(protocol["architecture"]["hash_buckets"], 0)
        self.assertEqual(
            protocol["static_gates"]["maximum_artifact_bytes"],
            lpv.MAX_HEAD_BYTES,
        )
        self.assertFalse(
            protocol["semantic_partition"]["reject_sets_used_for_epoch_selection"]
        )
        self.assertIn(
            "connected component",
            protocol["semantic_partition"]["fit_tune"],
        )
        receipts = protocol["semantic_partition"][
            "fit_tune_registered_receipts"
        ]
        self.assertEqual(receipts["v9"]["fit_parents"], 19_459)
        self.assertEqual(receipts["v9"]["tune_parents"], 4_348)
        self.assertEqual(receipts["browser"]["fit_parents"], 922)
        self.assertEqual(receipts["browser"]["tune_parents"], 298)
        self.assertEqual(receipts["browser"]["semantic_position_overlap"], 0)
        self.assertEqual(
            protocol["training"]["refit_parent_coverage"],
            "all retained V9 and browser parents exactly once per epoch",
        )
        browser = protocol["static_gates"]["registered_live_baselines"][
            "browser_reject"
        ]
        v9 = protocol["static_gates"]["registered_live_baselines"]["v9_reject"]
        self.assertEqual(browser["top1_correct"], 63)
        self.assertEqual(browser["pair_count"], 2_889_565)
        self.assertAlmostEqual(browser["pair_accuracy"], 0.6675554971076961)
        self.assertEqual(v9["top1_correct"], 1456)
        self.assertEqual(v9["pair_count"], 49_692)
        self.assertAlmostEqual(v9["pair_accuracy"], 0.5915841584158416)
        self.assertTrue(
            any(
                "Do not add seeds" in condition
                for condition in protocol["failure_conditions"]
            )
        )


if __name__ == "__main__":
    unittest.main()
