import os
import sys
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from dataclasses import replace

import torch


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import capacity_policy_value as cpv  # noqa: E402
import capacity_policy_value_data as capacity_data  # noqa: E402
import listwise_policy_value as lpv  # noqa: E402
import train  # noqa: E402
import train_capacity_policy_value as capacity_runner  # noqa: E402


HIRATE = "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"


def synthetic_group(
    parent_id: str,
    *,
    teacher_scores=(300.0, 0.0, -200.0),
    base_scores=(0.0, 0.0, 0.0),
) -> lpv.ParentGroup:
    board, hands, _turn, _king = train.parse_sfen(HIRATE)
    parent_board = tuple(
        board[: train.MAX_PIECES]
        + [train.PAD_IDX] * (train.MAX_PIECES - len(board))
    )
    moves = ("7g7f", "2g2f", "6g6f")
    examples = tuple(
        lpv.MoveExample(
            move=move,
            teacher_cp=teacher_scores[index],
            teacher_rank=index + 1,
            child_position_id=f"sha256:{parent_id}-child-{index}",
            child_sfen=HIRATE,
            features=lpv.encode_explicit_move(HIRATE, move),
            base_parent_cp=base_scores[index],
        )
        for index, move in enumerate(moves)
    )
    return lpv.ParentGroup(
        parent_id=parent_id,
        game_id=f"game-{parent_id}",
        position_id=f"sha256:{parent_id}-parent",
        parent_sfen=HIRATE,
        parent_board=parent_board,
        parent_hands=tuple(hands),
        semantic_position_ids=frozenset(
            [f"sha256:{parent_id}-parent"]
            + [example.child_position_id for example in examples]
        ),
        examples=examples,
        source_role="synthetic",
    )


def with_derived_children(group: lpv.ParentGroup) -> lpv.ParentGroup:
    return replace(
        group,
        examples=tuple(
            replace(
                example,
                child_sfen=lpv.child_sfen_after_usi(
                    group.parent_sfen,
                    example.move,
                ),
            )
            for example in group.examples
        ),
    )


class CapacityPolicyValueTests(unittest.TestCase):
    def test_architecture_is_exactly_the_registered_large_model(self):
        model = cpv.OfflineCapacityPolicyValue()
        self.assertEqual(
            sum(parameter.numel() for parameter in model.parameters()),
            5_953_522,
        )
        self.assertEqual(model.stem.in_channels, 43)
        self.assertEqual(model.stem.out_channels, 64)
        self.assertEqual(len(model.spatial_blocks), 6)
        self.assertEqual(model.global_projection.in_features, 64 * 81)
        self.assertEqual(model.global_projection.out_features, 384)
        self.assertEqual(model.move_projection.in_features, 721)
        self.assertEqual(model.move_projection.out_features, 256)
        self.assertEqual(len(model.move_set.layers), 4)

    def test_child_board_architecture_is_exactly_registered_v3(self):
        model = cpv.OfflineChildBoardCapacityPolicyValue()
        self.assertEqual(
            sum(parameter.numel() for parameter in model.parameters()),
            6_168_130,
        )
        encoder = model.child_board_encoder
        self.assertEqual(encoder.stem.in_channels, 43)
        self.assertEqual(encoder.stem.out_channels, 16)
        self.assertIsNone(encoder.stem.bias)
        self.assertEqual(encoder.stem_norm.num_groups, 4)
        self.assertEqual(len(encoder.blocks), 2)
        self.assertTrue(
            all(block.norm1.num_groups == 4 for block in encoder.blocks)
        )
        self.assertTrue(
            all(
                block.conv1.bias is None and block.conv2.bias is None
                for block in encoder.blocks
            )
        )
        self.assertEqual(encoder.projection.in_features, 16 * 81)
        self.assertEqual(encoder.projection.out_features, 128)
        self.assertEqual(
            tuple(encoder.output_norm.normalized_shape), (128,)
        )
        self.assertEqual(model.move_projection.in_features, 849)
        self.assertEqual(model.move_projection.out_features, 256)

    def test_parent_planes_are_explicit_and_initial_policy_is_live_baseline(self):
        group = synthetic_group(
            "a",
            base_scores=(125.0, -40.0, 5.0),
        )
        batch = cpv.make_batch([group], "cpu")
        self.assertEqual(tuple(batch["parent_planes"].shape), (1, 43, 9, 9))
        self.assertEqual(
            int(batch["parent_planes"][0, :28].sum().item()),
            sum(feature != train.PAD_IDX for feature in group.parent_board),
        )
        model = cpv.OfflineCapacityPolicyValue().eval()
        combined, residual, parent_value = model(batch)
        self.assertTrue(torch.equal(residual, torch.zeros_like(residual)))
        self.assertTrue(torch.equal(combined, batch["base_cp"]))
        self.assertTrue(
            torch.equal(parent_value, torch.zeros_like(parent_value))
        )

    def test_legal_move_set_is_permutation_equivariant(self):
        group = synthetic_group("a")
        reversed_group = replace(group, examples=tuple(reversed(group.examples)))
        torch.manual_seed(42)
        model = cpv.OfflineCapacityPolicyValue().eval()
        forward = model(cpv.make_batch([group], "cpu"))[0]
        backward = model(cpv.make_batch([reversed_group], "cpu"))[0]
        self.assertTrue(torch.allclose(forward, backward.flip(1), atol=1e-5))

    def test_padding_mask_does_not_change_valid_candidate_scores(self):
        group = synthetic_group("a")
        torch.manual_seed(42)
        model = cpv.OfflineCapacityPolicyValue().eval()
        exact = model(cpv.make_batch([group], "cpu"))[0]
        padded = model(
            cpv.make_batch([group], "cpu", pad_moves_to=16)
        )[0]
        self.assertEqual(tuple(padded.shape), (1, 16))
        self.assertTrue(torch.allclose(exact, padded[:, :3], atol=1e-5))

    def test_child_planes_are_stm_normalized_and_v1_batch_is_unchanged(self):
        group = with_derived_children(synthetic_group("child"))
        parent_only = cpv.make_batch([group], "cpu")
        self.assertNotIn("child_planes", parent_only)

        batch = cpv.make_batch(
            [group],
            "cpu",
            pad_moves_to=16,
            include_child_planes=True,
        )
        self.assertEqual(
            tuple(batch["child_planes"].shape),
            (1, 16, 43, 9, 9),
        )
        self.assertTrue(
            torch.equal(
                batch["child_planes"][0, 3:],
                torch.zeros_like(batch["child_planes"][0, 3:]),
            )
        )
        child_sfen = group.examples[0].child_sfen
        self.assertEqual(child_sfen.split()[1], "w")
        board, _hands, _turn, _king = train.parse_sfen(child_sfen)
        observed = {
            int(plane) * 81 + int(file_index) * 9 + int(rank_index)
            for plane, file_index, rank_index in batch[
                "child_planes"
            ][0, 0, :28].nonzero().tolist()
        }
        self.assertEqual(observed, set(board))
        self.assertTrue(
            torch.allclose(
                batch["child_planes"][0, 0, -1],
                torch.full((9, 9), 1.0 / 255.0),
            )
        )

    def test_child_model_starts_at_live_baseline(self):
        group = with_derived_children(
            synthetic_group(
                "child-baseline",
                base_scores=(125.0, -40.0, 5.0),
            )
        )
        batch = cpv.make_batch(
            [group], "cpu", include_child_planes=True
        )
        model = cpv.OfflineChildBoardCapacityPolicyValue().eval()
        combined, residual, parent_value = model(batch)
        self.assertTrue(torch.equal(residual, torch.zeros_like(residual)))
        self.assertTrue(torch.equal(combined, batch["base_cp"]))
        self.assertTrue(
            torch.equal(parent_value, torch.zeros_like(parent_value))
        )

    def test_child_padding_is_never_encoded_and_cannot_change_valid_scores(self):
        group = with_derived_children(synthetic_group("child-padding"))
        batch = cpv.make_batch(
            [group],
            "cpu",
            pad_moves_to=16,
            include_child_planes=True,
        )
        torch.manual_seed(42)
        model = cpv.OfflineChildBoardCapacityPolicyValue().eval()
        with torch.no_grad():
            torch.nn.init.normal_(model.policy_output[-1].weight)
        expected = model(batch)[0][:, :3]
        tampered = {
            key: value.clone() for key, value in batch.items()
        }
        tampered["child_planes"][:, 3:] = float("nan")
        observed = model(tampered)[0][:, :3]
        self.assertTrue(torch.isfinite(observed).all())
        self.assertTrue(torch.equal(expected, observed))

    def test_child_model_move_set_remains_permutation_equivariant(self):
        group = with_derived_children(synthetic_group("child-order"))
        reversed_group = replace(
            group, examples=tuple(reversed(group.examples))
        )
        torch.manual_seed(42)
        model = cpv.OfflineChildBoardCapacityPolicyValue().eval()
        with torch.no_grad():
            torch.nn.init.normal_(model.policy_output[-1].weight)
        forward = model(
            cpv.make_batch(
                [group], "cpu", include_child_planes=True
            )
        )[0]
        backward = model(
            cpv.make_batch(
                [reversed_group],
                "cpu",
                include_child_planes=True,
            )
        )[0]
        self.assertTrue(torch.allclose(forward, backward.flip(1), atol=1e-5))

    def test_child_encoder_receives_policy_gradient(self):
        group = with_derived_children(synthetic_group("child-gradient"))
        batch = cpv.make_batch(
            [group], "cpu", include_child_planes=True
        )
        torch.manual_seed(42)
        model = cpv.OfflineChildBoardCapacityPolicyValue()
        with torch.no_grad():
            torch.nn.init.normal_(
                model.policy_output[-1].weight,
                std=0.01,
            )
        combined, residual, parent_value = model(batch)
        loss, _parts = cpv.policy_value_loss(
            combined,
            residual,
            parent_value,
            batch["teacher_cp"],
            batch["valid"],
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            best_margin_cp=50.0,
            objective=cpv.OBJECTIVE_V2,
        )
        loss.backward()
        gradient = model.child_board_encoder.stem.weight.grad
        self.assertIsNotNone(gradient)
        self.assertTrue(torch.isfinite(gradient).all())
        self.assertGreater(float(gradient.abs().sum()), 0.0)

    def test_loss_prefers_teacher_order_and_has_finite_gradients(self):
        valid = torch.tensor([[True, True, True]])
        teacher = torch.tensor([[300.0, 0.0, -200.0]])
        good = torch.tensor([[250.0, 10.0, -150.0]], requires_grad=True)
        bad = torch.tensor([[-150.0, 10.0, 250.0]], requires_grad=True)
        residual = torch.zeros_like(good)
        parent_value = torch.tensor([250.0], requires_grad=True)
        kwargs = {
            "temperature_cp": 100.0,
            "pair_gap_cp": 50.0,
            "best_margin_cp": 50.0,
        }
        good_loss, components = cpv.policy_value_loss(
            good,
            residual,
            parent_value,
            teacher,
            valid,
            **kwargs,
        )
        bad_loss, _ = cpv.policy_value_loss(
            bad,
            residual,
            parent_value,
            teacher,
            valid,
            **kwargs,
        )
        self.assertLess(float(good_loss.item()), float(bad_loss.item()))
        self.assertEqual(
            set(components),
            {"policy", "pair", "best_margin", "move_value", "state_value"},
        )
        good_loss.backward()
        self.assertTrue(torch.isfinite(good.grad).all())
        self.assertTrue(torch.isfinite(parent_value.grad).all())

    def test_default_loss_is_exactly_objective_v1(self):
        valid = torch.tensor(
            [[True, True, True], [True, True, False]]
        )
        teacher = torch.tensor(
            [[300.0, 0.0, -200.0], [100.0, -50.0, 0.0]]
        )
        prediction = torch.tensor(
            [[250.0, 10.0, -150.0], [80.0, -20.0, 0.0]]
        )
        residual = torch.zeros_like(prediction)
        parent_value = torch.tensor([250.0, 80.0])
        kwargs = {
            "temperature_cp": 100.0,
            "pair_gap_cp": 50.0,
            "best_margin_cp": 50.0,
        }
        default_total, default_parts = cpv.policy_value_loss(
            prediction,
            residual,
            parent_value,
            teacher,
            valid,
            **kwargs,
        )
        explicit_total, explicit_parts = cpv.policy_value_loss(
            prediction,
            residual,
            parent_value,
            teacher,
            valid,
            objective=cpv.OBJECTIVE_V1,
            **kwargs,
        )
        self.assertTrue(torch.equal(default_total, explicit_total))
        for name in default_parts:
            self.assertTrue(
                torch.equal(default_parts[name], explicit_parts[name])
            )

    def test_objective_v2_pair_loss_is_domain_batch_microaverage(self):
        valid = torch.tensor(
            [[True, True, True], [True, True, False]]
        )
        teacher = torch.tensor(
            [[300.0, 200.0, 100.0], [300.0, 0.0, 0.0]]
        )
        prediction = torch.tensor(
            [[300.0, 200.0, 100.0], [0.0, 300.0, 0.0]]
        )
        residual = torch.zeros_like(prediction)
        parent_value = torch.zeros(2)
        kwargs = {
            "temperature_cp": 100.0,
            "pair_gap_cp": 50.0,
            "best_margin_cp": 50.0,
        }
        _total, parts = cpv.policy_value_loss(
            prediction,
            residual,
            parent_value,
            teacher,
            valid,
            objective=cpv.OBJECTIVE_V2,
            **kwargs,
        )
        expected_pairs = torch.cat(
            (
                torch.nn.functional.softplus(
                    -torch.tensor([100.0, 200.0, 100.0]) / 100.0
                ),
                torch.nn.functional.softplus(
                    -torch.tensor([-300.0]) / 100.0
                ),
            )
        ).mean()
        self.assertTrue(torch.allclose(parts["pair"], expected_pairs))

        _v1_total, v1_parts = cpv.policy_value_loss(
            prediction,
            residual,
            parent_value,
            teacher,
            valid,
            objective=cpv.OBJECTIVE_V1,
            **kwargs,
        )
        self.assertFalse(torch.allclose(parts["pair"], v1_parts["pair"]))

    def test_objective_v2_margin_treats_all_teacher_best_ties_as_positive(self):
        valid = torch.tensor([[True, True, True]])
        teacher = torch.tensor([[300.0, 300.0, 0.0]])
        residual = torch.zeros_like(teacher)
        parent_value = torch.zeros(1)
        kwargs = {
            "temperature_cp": 100.0,
            "pair_gap_cp": 50.0,
            "best_margin_cp": 50.0,
            "objective": cpv.OBJECTIVE_V2,
        }
        _total, parts = cpv.policy_value_loss(
            torch.tensor([[0.0, 200.0, 180.0]]),
            residual,
            parent_value,
            teacher,
            valid,
            **kwargs,
        )
        _swapped_total, swapped_parts = cpv.policy_value_loss(
            torch.tensor([[200.0, 0.0, 180.0]]),
            residual,
            parent_value,
            teacher,
            valid,
            **kwargs,
        )
        self.assertAlmostEqual(float(parts["best_margin"]), 0.30, places=6)
        self.assertTrue(
            torch.equal(parts["best_margin"], swapped_parts["best_margin"])
        )

    def test_objective_v2_has_no_state_value_gradient(self):
        valid = torch.tensor([[True, True, True]])
        teacher = torch.tensor([[300.0, 0.0, -200.0]])
        prediction = torch.tensor(
            [[100.0, 0.0, -100.0]], requires_grad=True
        )
        parent_value = torch.tensor([0.0], requires_grad=True)
        total, parts = cpv.policy_value_loss(
            prediction,
            torch.zeros_like(prediction),
            parent_value,
            teacher,
            valid,
            temperature_cp=100.0,
            pair_gap_cp=50.0,
            best_margin_cp=50.0,
            objective=cpv.OBJECTIVE_V2,
        )
        expected = (
            parts["policy"]
            + parts["pair"]
            + parts["best_margin"]
            + 0.20 * parts["move_value"]
        )
        self.assertTrue(torch.equal(total, expected))
        total.backward()
        self.assertTrue(torch.isfinite(prediction.grad).all())
        self.assertIsNone(parent_value.grad)

    def test_score_groups_uses_teacher_worst_predicted_best_tie_for_regret(self):
        group = synthetic_group(
            "pessimistic-regret",
            teacher_scores=(300.0, 0.0, -200.0),
            base_scores=(10.0, 10.0, 0.0),
        )
        metrics = cpv.score_groups(
            None,
            [group],
            device="cpu",
            parent_batch_size=1,
            pair_gap_cp=50.0,
        )
        self.assertEqual(metrics["top1_correct"], 0)
        self.assertEqual(metrics["mean_regret_cp"], 300.0)
        self.assertEqual(metrics["pair_count"], 3)
        self.assertAlmostEqual(metrics["pair_accuracy"], 2 / 3)

    def test_full_model_can_fit_a_tiny_conflicting_policy_sample(self):
        torch.manual_seed(7)
        groups = [
            synthetic_group("a"),
            synthetic_group("b", teacher_scores=(0.0, 300.0, -200.0)),
        ]
        batch = cpv.make_batch(groups, "cpu")
        model = cpv.OfflineCapacityPolicyValue()
        optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4)
        losses = []
        for _step in range(8):
            model.train()
            combined, residual, parent_value = model(batch)
            loss, _components = cpv.policy_value_loss(
                combined,
                residual,
                parent_value,
                batch["teacher_cp"],
                batch["valid"],
                temperature_cp=100.0,
                pair_gap_cp=50.0,
                best_margin_cp=50.0,
            )
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            losses.append(float(loss.detach().item()))
        self.assertLess(losses[-1], losses[0] - 0.1)

    def test_malformed_parent_square_collision_is_rejected(self):
        group = synthetic_group("a")
        occupied = next(
            feature for feature in group.parent_board if feature != train.PAD_IDX
        )
        malformed = replace(
            group,
            parent_board=(occupied, occupied) + group.parent_board[2:],
        )
        with self.assertRaisesRegex(ValueError, "two pieces"):
            cpv.make_batch([malformed], "cpu")

    def test_protected_ids_and_known_eval_union_are_canonical(self):
        first = "sha256:" + "0" * 64
        second = "sha256:" + "1" * 64
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            protected = root / "protected.txt"
            protected.write_text(f"{first}\n{second}\n", encoding="ascii")
            identifiers, receipt = capacity_data.read_protected_position_ids(
                protected
            )
            self.assertEqual(identifiers, frozenset((first, second)))
            self.assertEqual(receipt["count"], 2)

            sibling = root / "sibling.jsonl"
            sibling.write_text(
                json.dumps(
                    {"position_id": first, "child_position_id": second}
                )
                + "\n",
                encoding="ascii",
            )
            scalar = root / "scalar.jsonl"
            scalar.write_text(
                json.dumps({"position_id": second}) + "\n",
                encoding="ascii",
            )
            union, union_receipt = (
                capacity_data.read_known_eval_position_ids(
                    sibling_paths=[sibling],
                    scalar_paths=[scalar],
                )
            )
            self.assertEqual(union, identifiers)
            self.assertEqual(union_receipt["count"], 2)

            protected.write_text(f"{second}\n{first}\n", encoding="ascii")
            with self.assertRaisesRegex(ValueError, "sorted and unique"):
                capacity_data.read_protected_position_ids(protected)

    def test_move_bucket_batches_are_bounded_and_deterministic(self):
        groups = [synthetic_group(f"p{index}") for index in range(10)]
        first = capacity_data.bucketed_batches(
            groups,
            epoch=1,
            seed=42,
            maximum_parents=3,
        )
        second = capacity_data.bucketed_batches(
            list(reversed(groups)),
            epoch=1,
            seed=42,
            maximum_parents=3,
        )
        self.assertTrue(all(boundary == 16 for boundary, _batch in first))
        self.assertTrue(all(len(batch) <= 3 for _boundary, batch in first))
        self.assertEqual(
            [[group.parent_id for group in batch] for _boundary, batch in first],
            [[group.parent_id for group in batch] for _boundary, batch in second],
        )

    def test_registered_protocol_binds_the_exact_model_and_runner_hash(self):
        raw = capacity_runner.TRACKED_PROTOCOL_PATH.read_bytes()
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            capacity_runner.TRACKED_PROTOCOL_SHA256,
        )
        protocol = json.loads(raw)
        self.assertEqual(protocol["architecture"]["parameters"], 5_953_522)
        self.assertEqual(
            protocol["architecture"]["feature_version"],
            cpv.FEATURE_VERSION,
        )
        self.assertEqual(protocol["training"]["seeds"], [42, 314159])

    def test_objective_v2_protocol_path_hash_and_loss_are_exact(self):
        raw = capacity_runner.TRACKED_PROTOCOL_V2_PATH.read_bytes()
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            capacity_runner.TRACKED_PROTOCOL_V2_SHA256,
        )
        protocol = json.loads(raw)
        self.assertEqual(
            protocol["schema"], capacity_runner.PROTOCOL_SCHEMA_V2
        )
        self.assertEqual(
            protocol["loss"]["id"], cpv.OBJECTIVE_V2
        )
        v1_protocol = json.loads(
            capacity_runner.TRACKED_PROTOCOL_PATH.read_bytes()
        )
        for field in (
            "inputs",
            "data_receipt",
            "architecture",
            "training",
            "sentinel",
            "live_baseline",
            "gates",
            "sealed_holdout",
        ):
            self.assertEqual(
                protocol[field],
                v1_protocol[field],
                f"objective v2 changed fixed protocol field {field}",
            )
        binding = capacity_runner._protocol_binding(
            capacity_runner.TRACKED_PROTOCOL_V2_PATH
        )
        self.assertEqual(binding["objective"], cpv.OBJECTIVE_V2)
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ValueError, "tracked protocol"):
                capacity_runner._protocol_binding(
                    Path(temporary) / "lookalike.json"
                )

    def test_child_board_v3_protocol_and_checkpoint_metadata_are_exact(self):
        raw = capacity_runner.TRACKED_PROTOCOL_V3_PATH.read_bytes()
        self.assertEqual(
            hashlib.sha256(raw).hexdigest(),
            capacity_runner.TRACKED_PROTOCOL_V3_SHA256,
        )
        protocol = json.loads(raw)
        self.assertEqual(
            protocol["schema"], capacity_runner.PROTOCOL_SCHEMA_V3
        )
        self.assertEqual(
            protocol["result_schema"],
            capacity_runner.RESULT_SCHEMA_V3,
        )
        self.assertEqual(protocol["loss"]["id"], cpv.OBJECTIVE_V2)
        self.assertEqual(
            protocol["architecture"]["model_variant"],
            cpv.CHILD_MODEL_VARIANT,
        )
        self.assertEqual(
            protocol["architecture"]["feature_version"],
            cpv.CHILD_FEATURE_VERSION,
        )
        self.assertEqual(protocol["architecture"]["parameters"], 6_168_130)
        self.assertEqual(
            protocol["architecture"]["fp32_weight_bytes"],
            24_672_520,
        )
        v2_protocol = json.loads(
            capacity_runner.TRACKED_PROTOCOL_V2_PATH.read_bytes()
        )
        for field in (
            "inputs",
            "data_receipt",
            "training",
            "sentinel",
            "live_baseline",
            "gates",
            "sealed_holdout",
            "loss",
        ):
            self.assertEqual(
                protocol[field],
                v2_protocol[field],
                f"child-board v3 changed fixed protocol field {field}",
            )

        binding = capacity_runner._protocol_binding(
            capacity_runner.TRACKED_PROTOCOL_V3_PATH
        )
        self.assertIs(
            binding["model_class"],
            cpv.OfflineChildBoardCapacityPolicyValue,
        )
        self.assertEqual(
            capacity_runner._checkpoint_model_metadata(
                binding, detailed=False
            ),
            {"schema": cpv.CHILD_SCHEMA},
        )
        self.assertEqual(
            capacity_runner._checkpoint_model_metadata(
                binding, detailed=True
            ),
            {
                "schema": cpv.CHILD_SCHEMA,
                "feature_version": cpv.CHILD_FEATURE_VERSION,
                "parameters": 6_168_130,
            },
        )
        self.assertEqual(
            capacity_runner._last_checkpoint_model_metadata(binding),
            {
                "schema": cpv.CHILD_SCHEMA,
                "feature_version": cpv.CHILD_FEATURE_VERSION,
                "parameters": 6_168_130,
            },
        )
        for legacy_path in (
            capacity_runner.TRACKED_PROTOCOL_PATH,
            capacity_runner.TRACKED_PROTOCOL_V2_PATH,
        ):
            legacy = capacity_runner._protocol_binding(legacy_path)
            self.assertEqual(
                capacity_runner._checkpoint_model_metadata(
                    legacy, detailed=True
                ),
                {
                    "schema": cpv.SCHEMA,
                    "feature_version": cpv.FEATURE_VERSION,
                    "parameters": 5_953_522,
                },
            )
            self.assertEqual(
                capacity_runner._last_checkpoint_model_metadata(legacy),
                {"schema": cpv.SCHEMA},
            )

    def test_capacity_gate_requires_every_registered_distribution(self):
        baseline = {
            "browser": {
                "top1_correct": 16,
                "top1_accuracy": 16 / 196,
                "pair_accuracy": 0.66,
                "mean_regret_cp": 100.0,
            },
            "v9": {
                "top1_accuracy": 0.24,
                "pair_accuracy": 0.60,
            },
        }
        candidate = {
            "browser": {
                "top1_correct": 26,
                "top1_accuracy": 26 / 196,
                "pair_accuracy": 0.67,
                "mean_regret_cp": 99.0,
            },
            "v9": {
                "top1_accuracy": 0.235,
                "pair_accuracy": 0.598,
            },
        }
        gates = {
            "browser_tune": {
                "minimum_top1_correct": 26,
                "minimum_pair_accuracy": 0.67,
            },
            "v9_tune": {
                "minimum_top1_accuracy": 0.235,
                "minimum_pair_accuracy": 0.598,
            },
        }
        passed = capacity_runner._capacity_gate(
            candidate, baseline, gates
        )
        self.assertTrue(passed["passed"])
        regressed = {
            **candidate,
            "browser": {**candidate["browser"], "top1_correct": 25},
        }
        self.assertFalse(
            capacity_runner._capacity_gate(
                regressed, baseline, gates
            )["passed"]
        )


if __name__ == "__main__":
    unittest.main()
