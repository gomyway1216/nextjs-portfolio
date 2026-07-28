from __future__ import annotations

import hashlib
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import torch

import child_board_root_policy_student as student
import listwise_policy_value as lpv
import train
import train_child_board_root_policy_student as runner


def synthetic_group(
    parent_id: str,
    parent_sfen: str,
    moves: tuple[str, ...],
) -> lpv.ParentGroup:
    board, hands, _turn, _king = train.parse_sfen(parent_sfen)
    padded = tuple(
        board[: train.MAX_PIECES]
        + [train.PAD_IDX] * (train.MAX_PIECES - len(board))
    )
    examples = []
    for index, move in enumerate(moves):
        child_sfen = lpv.child_sfen_after_usi(parent_sfen, move)
        examples.append(
            lpv.MoveExample(
                move=move,
                teacher_cp=float(300 - index * 100),
                teacher_rank=index + 1,
                child_position_id=f"child-{parent_id}-{move}",
                child_sfen=child_sfen,
                features=lpv.encode_explicit_move(parent_sfen, move),
                base_parent_cp=float(index * 25 - 50),
            )
        )
    return lpv.ParentGroup(
        parent_id=parent_id,
        game_id=f"game-{parent_id}",
        position_id=f"position-{parent_id}",
        parent_sfen=parent_sfen,
        parent_board=padded,
        parent_hands=tuple(hands),
        semantic_position_ids=frozenset(
            [f"position-{parent_id}"]
            + [example.child_position_id for example in examples]
        ),
        examples=tuple(examples),
        source_role="browser-all-legal",
    )


class SetAwareTeacher(torch.nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.observed_move_counts: list[int] = []

    def forward(self, batch):
        valid = batch["valid"]
        counts = valid.sum(dim=1, keepdim=True).to(torch.float32)
        self.observed_move_counts.extend(
            int(value) for value in counts.flatten().tolist()
        )
        combined = batch["base_cp"] + counts * 10.0
        combined = combined.masked_fill(~valid, 0.0)
        return combined, combined * 0.0, counts.squeeze(1)


class ChildBoardRootPolicyStudentTests(unittest.TestCase):
    START_SFEN = (
        "lnsgkgsnl/1r5b1/ppppppppp/9/9/9/"
        "PPPPPPPPP/1B5R1/LNSGKGSNL b - 1"
    )
    START_PRODUCTION_MOVES = (
        "1g1f",
        "1i1h",
        "2g2f",
        "2h1h",
        "2h3h",
        "2h4h",
        "2h5h",
        "2h6h",
        "2h7h",
        "3g3f",
        "3i3h",
        "3i4h",
        "4g4f",
        "4i3h",
        "4i4h",
        "4i5h",
        "5g5f",
        "5i4h",
        "5i5h",
        "5i6h",
        "6g6f",
        "6i5h",
        "6i6h",
        "6i7h",
        "7g7f",
        "7i6h",
        "7i7h",
        "8g8f",
        "9g9f",
        "9i9h",
    )

    def test_parameter_payload_and_zero_residual_initialization(self):
        torch.manual_seed(student.INITIALIZATION_SEED)
        model = student.ChildBoardRootPolicyStudent()
        self.assertEqual(model.parameter_count(), 877_633)
        self.assertEqual(
            sum(
                parameter.numel() * parameter.element_size()
                for parameter in model.parameters()
            ),
            3_510_532,
        )
        group = synthetic_group(
            "model",
            "4k4/9/9/4B4/9/9/9/9/4K4 b - 1",
            ("5d4c+", "5d6e"),
        )
        batch = student.make_student_batch([group], "cpu", pad_moves_to=16)
        combined, residual = model(batch)
        self.assertTrue(
            torch.equal(
                combined[batch["valid"]],
                batch["base_cp"][batch["valid"]],
            )
        )
        self.assertTrue(
            torch.equal(
                residual[batch["valid"]],
                torch.zeros_like(residual[batch["valid"]]),
            )
        )

    def test_fixed_gelu_is_the_registered_explicit_tanh_formula(self):
        value = torch.tensor([-3.0, -0.5, 0.0, 0.5, 3.0])
        expected = (
            0.5
            * value
            * (
                1.0
                + torch.tanh(
                    student.math.sqrt(2.0 / student.math.pi)
                    * (
                        value
                        + 0.044715 * value * value * value
                    )
                )
            )
        )
        self.assertTrue(torch.equal(student.fixed_gelu(value), expected))

    def test_sente_bishop_and_rook_nonpromotion_projection(self):
        bishop = synthetic_group(
            "bishop-b",
            "4k4/9/9/4B4/9/9/9/9/4K4 b - 1",
            ("5d4c", "5d4c+", "5d6e"),
        )
        rook = synthetic_group(
            "rook-b",
            "4k4/9/9/4R4/9/9/9/9/4K4 b - 1",
            ("5d5c", "5d5c+", "5d5e"),
        )
        projected_bishop = student.project_group_to_production(bishop)
        projected_rook = student.project_group_to_production(rook)
        self.assertEqual(
            projected_bishop.production_moves,
            ("5d4c+", "5d6e"),
        )
        self.assertEqual(
            tuple(row.move for row in projected_bishop.removals),
            ("5d4c",),
        )
        self.assertEqual(
            projected_rook.production_moves,
            ("5d5c+", "5d5e"),
        )
        self.assertEqual(
            tuple(row.move for row in projected_rook.removals),
            ("5d5c",),
        )

    def test_gote_bishop_nonpromotion_projection(self):
        group = synthetic_group(
            "bishop-w",
            "4k4/9/9/9/9/4b4/9/9/4K4 w - 1",
            ("5f4g", "5f4g+", "5f6e"),
        )
        projected = student.project_group_to_production(group)
        self.assertEqual(projected.production_moves, ("5f4g+", "5f6e"))
        self.assertEqual(
            tuple(row.move for row in projected.removals),
            ("5f4g",),
        )

    def test_teacher_is_reforwarded_on_projected_set_not_filtered(self):
        group = synthetic_group(
            "reforward",
            "4k4/9/9/4B4/9/9/9/9/4K4 b - 1",
            ("5d4c", "5d4c+", "5d6e"),
        )
        projected = student.project_group_to_production(group)
        teacher = SetAwareTeacher()
        records = runner._teacher_records(
            [("browser", projected)],
            teacher,
            device="cpu",
        )
        self.assertEqual(teacher.observed_move_counts, [2])
        observed = [
            float(move["teacher_combined_parent_cp"])
            for move in records[0]["moves"]
        ]
        expected = [
            example.base_parent_cp + 20.0
            for example in projected.group.examples
        ]
        filtered_full_forward = [
            example.base_parent_cp + 30.0
            for example in projected.group.examples
        ]
        self.assertEqual(observed, expected)
        self.assertNotEqual(observed, filtered_full_forward)

    def test_distillation_objective_is_finite_and_backpropagates(self):
        prediction = torch.tensor(
            [[200.0, 100.0, -100.0], [25.0, 25.0, 0.0]],
            requires_grad=True,
        )
        teacher = torch.tensor(
            [[300.0, 100.0, -200.0], [50.0, 50.0, 0.0]]
        )
        valid = torch.tensor(
            [[True, True, True], [True, True, False]]
        )
        loss, parts = student.distillation_loss(
            prediction,
            teacher,
            valid,
        )
        self.assertTrue(torch.isfinite(loss))
        self.assertEqual(
            set(parts),
            {"listwise", "pair", "best_margin", "move_value"},
        )
        loss.backward()
        self.assertTrue(torch.isfinite(prediction.grad).all())
        self.assertEqual(float(prediction.grad[1, 2]), 0.0)

    def test_64_shard_resume_and_global_merge(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = runner.DistillationShardStore(
                root,
                protocol_identity={
                    "path": "protocol.json",
                    "bytes": 1,
                    "sha256": "a" * 64,
                },
                teacher_identity={
                    "path": "teacher.pt",
                    "bytes": 2,
                    "sha256": "b" * 64,
                },
                fit_sources={"sha256": "c" * 64},
                feature_sources=[{"sha256": "d" * 64}],
                move_universe_receipt={
                    "schema": runner.MOVE_UNIVERSE_RECEIPT_SCHEMA,
                    "artifact": {
                        "path": "move-universe.jsonl",
                        "bytes": 3,
                        "sha256": "e" * 64,
                    },
                },
            )
            target_shard = runner.shard_for_parent("browser", "parent")
            keys_by_shard = {
                shard: (
                    [("browser", "parent")]
                    if shard == target_shard
                    else []
                )
                for shard in range(runner.SHARDS)
            }
            for shard, keys in keys_by_shard.items():
                records = (
                    [
                        {
                            "schema": runner.DISTILLATION_SCHEMA,
                            "domain": "browser",
                            "parent_id": "parent",
                            "production_usi": ["5d4c+"],
                            "projection_removals": [
                                {
                                    "move": "5d4c",
                                    "reason": "force-promote",
                                }
                            ],
                        }
                    ]
                    if keys
                    else []
                )
                receipt = store.publish(shard, keys, records)
                self.assertEqual(receipt["parents"], len(keys))
                self.assertIsNotNone(store.validate(shard, keys))
            final = root / "final.jsonl"
            final_receipt = root / "final.receipt.json"
            first = store.finalize(
                keys_by_shard,
                output_path=final,
                receipt_path=final_receipt,
            )
            second = store.finalize(
                keys_by_shard,
                output_path=final,
                receipt_path=final_receipt,
            )
            self.assertEqual(first, second)
            self.assertEqual(first["parents"], 1)
            self.assertEqual(first["production_moves"], 1)
            self.assertEqual(
                first["removed_nonpromoting_bishop_rook_moves"],
                1,
            )
            original_receipt = final_receipt.read_bytes()
            mutations = (
                ("role", ("replication_teacher_parents",), 1),
                ("teacher", ("teacher", "sha256"), "e" * 64),
                ("protocol", ("protocol", "sha256"), "f" * 64),
                ("derived_count", ("production_moves",), 2),
            )
            for label, key_path, replacement in mutations:
                with self.subTest(final_receipt_mutation=label):
                    changed = runner._strict_json(final_receipt)
                    target = changed
                    for key in key_path[:-1]:
                        target = target[key]
                    target[key_path[-1]] = replacement
                    final_receipt.write_bytes(
                        runner._canonical_json(changed)
                    )
                    with self.assertRaisesRegex(
                        ValueError,
                        "final distillation receipt mismatch",
                    ):
                        store.finalize(
                            keys_by_shard,
                            output_path=final,
                            receipt_path=final_receipt,
                        )
                    final_receipt.write_bytes(original_receipt)

    def test_actual_js_wasm_bridge_publishes_and_revalidates_exact_receipt(self):
        browser_group = synthetic_group(
            "start-browser",
            self.START_SFEN,
            self.START_PRODUCTION_MOVES,
        )
        v9_group = synthetic_group(
            "start-v9",
            self.START_SFEN,
            self.START_PRODUCTION_MOVES,
        )
        projected = runner._project_fit_groups(
            {"browser": [browser_group], "v9": [v9_group]}
        )
        protocol = {
            "production_move_universe": {
                "source_receipts": [
                    {"path": f"source-{index}", "sha256": str(index) * 64}
                    for index in range(4)
                ]
            }
        }
        protocol_identity = {
            "path": "protocol.json",
            "bytes": 1,
            "sha256": "a" * 64,
        }
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            artifact = root / "move-universe.jsonl"
            receipt_path = root / "move-universe.receipt.json"
            first = runner.verify_production_move_universe(
                projected,
                protocol=protocol,
                protocol_identity=protocol_identity,
                output_path=artifact,
                receipt_path=receipt_path,
            )
            second = runner.verify_production_move_universe(
                projected,
                protocol=protocol,
                protocol_identity=protocol_identity,
                output_path=artifact,
                receipt_path=receipt_path,
            )
            self.assertEqual(first, second)
            self.assertEqual(first["parents"], 2)
            self.assertEqual(first["domain_parents"], {"browser": 1, "v9": 1})
            self.assertEqual(
                first["production_moves"],
                len(self.START_PRODUCTION_MOVES) * 2,
            )
            rows = [
                runner._strict_json_line(
                    raw,
                    "test move universe artifact",
                )
                for raw in artifact.read_text(encoding="utf-8").splitlines(
                    keepends=True
                )
            ]
            self.assertEqual(
                [(row["domain"], row["parent_id"]) for row in rows],
                [
                    ("browser", "start-browser"),
                    ("v9", "start-v9"),
                ],
            )
            for row in rows:
                self.assertEqual(
                    row["projected_usi"],
                    list(self.START_PRODUCTION_MOVES),
                )
                self.assertEqual(
                    row["production_js_usi"],
                    row["projected_usi"],
                )
                self.assertEqual(
                    row["production_wasm_usi"],
                    row["projected_usi"],
                )

            changed = dict(first)
            changed["parents"] = 3
            receipt_path.write_bytes(runner._canonical_json(changed))
            with self.assertRaisesRegex(
                ValueError,
                "immutable artifact mismatch",
            ):
                runner.verify_production_move_universe(
                    projected,
                    protocol=protocol,
                    protocol_identity=protocol_identity,
                    output_path=artifact,
                    receipt_path=receipt_path,
                )

    def test_membership_mismatch_stops_before_teacher_checkpoint_load(self):
        group = synthetic_group(
            "start",
            self.START_SFEN,
            self.START_PRODUCTION_MOVES[1:],
        )
        projected = runner._project_fit_groups(
            {"browser": [group], "v9": []}
        )
        protocol = {
            "teacher_checkpoint_bindings": {},
            "production_move_universe": {
                "source_receipts": [
                    {"path": f"source-{index}", "sha256": str(index) * 64}
                    for index in range(4)
                ]
            },
        }
        protocol_identity = {
            "path": "protocol.json",
            "bytes": 1,
            "sha256": "a" * 64,
        }
        finals = {42: {"checkpoint": {"sha256": "b" * 64}}}
        with tempfile.TemporaryDirectory() as directory, mock.patch.object(
            runner,
            "OUTPUT",
            Path(directory),
        ), mock.patch.object(
            runner,
            "_verified_protocol",
            return_value=(protocol, protocol_identity),
        ), mock.patch.object(
            runner,
            "_verified_phase1",
            return_value=({}, finals),
        ), mock.patch.object(
            runner,
            "_validate_pinned_sources",
        ), mock.patch.object(
            runner,
            "_identities",
            return_value=(
                {"seed42": "b" * 64, "seed314159": "c" * 64},
                [],
                {
                    "fit_sources": {},
                    "teacher_identity": {"sha256": "b" * 64},
                },
            ),
        ), mock.patch.object(
            runner.torch.backends.mps,
            "is_available",
            return_value=True,
        ), mock.patch.object(
            runner,
            "_load_fit_groups_from_phase1",
            return_value={"browser": [group], "v9": []},
        ), mock.patch.object(
            runner,
            "_project_fit_groups",
            return_value=projected,
        ), mock.patch.object(
            runner,
            "load_teacher",
        ) as load:
            with self.assertRaisesRegex(
                ValueError,
                "membership mismatch",
            ):
                runner.run("prepare")
            load.assert_not_called()

    def test_downstream_checkpoint_and_missing_shard_stop_before_teacher(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            protocol = {"teacher_checkpoint_bindings": {}}
            protocol_identity = {
                "path": "protocol.json",
                "bytes": 1,
                "sha256": "a" * 64,
            }
            finals = {42: {"checkpoint": {"sha256": "b" * 64}}}
            teacher_identity = {
                "path": "teacher.pt",
                "bytes": 2,
                "sha256": "b" * 64,
            }
            move_universe_receipt = {
                "schema": runner.MOVE_UNIVERSE_RECEIPT_SCHEMA,
                "artifact": {
                    "path": "move-universe.jsonl",
                    "bytes": 3,
                    "sha256": "e" * 64,
                },
            }
            store = runner.DistillationShardStore(
                root,
                protocol_identity=protocol_identity,
                teacher_identity=teacher_identity,
                fit_sources={},
                feature_sources=[],
                move_universe_receipt=move_universe_receipt,
            )
            keys_by_shard = {
                shard: [] for shard in range(runner.SHARDS)
            }
            for shard, keys in keys_by_shard.items():
                store.publish(shard, keys, [])
            distillation_path = (
                root / runner.DISTILLATION_PATH.name
            )
            distillation_receipt_path = (
                root / runner.DISTILLATION_RECEIPT_PATH.name
            )
            store.finalize(
                keys_by_shard,
                output_path=distillation_path,
                receipt_path=distillation_receipt_path,
            )
            missing_shard = 17
            missing_path, _receipt_path, _address = store.paths(
                missing_shard,
                [],
            )
            missing_path.unlink()
            parity_path = root / runner.PARITY_PATH.name
            parity_receipt_path = (
                root / runner.PARITY_RECEIPT_PATH.name
            )
            parity_path.write_bytes(b"{}\n")
            parity_receipt_path.write_bytes(b"{}\n")
            (root / runner.LAST_CHECKPOINT_PATH.name).touch()

            with mock.patch.object(
                runner,
                "OUTPUT",
                root,
            ), mock.patch.object(
                runner,
                "DISTILLATION_PATH",
                distillation_path,
            ), mock.patch.object(
                runner,
                "DISTILLATION_RECEIPT_PATH",
                distillation_receipt_path,
            ), mock.patch.object(
                runner,
                "PARITY_PATH",
                parity_path,
            ), mock.patch.object(
                runner,
                "PARITY_RECEIPT_PATH",
                parity_receipt_path,
            ), mock.patch.object(
                runner,
                "_verified_protocol",
                return_value=(protocol, protocol_identity),
            ), mock.patch.object(
                runner,
                "_verified_phase1",
                return_value=({}, finals),
            ), mock.patch.object(
                runner,
                "_validate_pinned_sources",
            ), mock.patch.object(
                runner,
                "_identities",
                return_value=(
                    {"seed42": "b" * 64, "seed314159": "c" * 64},
                    [],
                    {
                        "fit_sources": {},
                        "teacher_identity": teacher_identity,
                    },
                ),
            ), mock.patch.object(
                runner,
                "_load_fit_groups_from_phase1",
                return_value={"browser": [], "v9": []},
            ), mock.patch.object(
                runner,
                "_project_fit_groups",
                return_value={"browser": [], "v9": []},
            ), mock.patch.object(
                runner,
                "validate_existing_production_move_universe",
                return_value=move_universe_receipt,
            ), mock.patch.object(
                runner,
                "verify_production_move_universe",
            ) as verify, mock.patch.object(
                runner.torch.backends.mps,
                "is_available",
            ) as mps_available, mock.patch.object(
                runner,
                "load_teacher",
            ) as load:
                with self.assertRaisesRegex(
                    ValueError,
                    f"incomplete immutable distillation shard {missing_shard}",
                ):
                    runner.run("prepare")
                verify.assert_not_called()
                mps_available.assert_not_called()
                load.assert_not_called()

    def test_shard_receipt_requires_full_expected_value(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = runner.DistillationShardStore(
                root,
                protocol_identity={
                    "path": "protocol.json",
                    "bytes": 1,
                    "sha256": "a" * 64,
                },
                teacher_identity={
                    "path": "teacher.pt",
                    "bytes": 2,
                    "sha256": "b" * 64,
                },
                fit_sources={"sha256": "c" * 64},
                feature_sources=[{"sha256": "d" * 64}],
                move_universe_receipt={
                    "schema": runner.MOVE_UNIVERSE_RECEIPT_SCHEMA,
                    "artifact": {
                        "path": "move-universe.jsonl",
                        "bytes": 3,
                        "sha256": "e" * 64,
                    },
                },
            )
            shard = runner.shard_for_parent("browser", "parent")
            keys = [("browser", "parent")]
            store.publish(
                shard,
                keys,
                [
                    {
                        "schema": runner.DISTILLATION_SCHEMA,
                        "domain": "browser",
                        "parent_id": "parent",
                        "production_usi": ["5d4c+"],
                        "projection_removals": [],
                    }
                ],
            )
            _path, receipt_path, _address = store.paths(shard, keys)
            receipt = runner._strict_json(receipt_path)
            receipt["status"] = "complete-but-unbound"
            receipt_path.write_bytes(runner._canonical_json(receipt))
            with self.assertRaisesRegex(
                ValueError,
                "distillation shard receipt mismatch",
            ):
                store.validate(shard, keys)

    def test_exact_resume_takes_next_epoch_and_matches_uninterrupted(self):
        group = synthetic_group(
            "resume",
            "4k4/9/9/4B4/9/9/9/9/4K4 b - 1",
            ("5d4c+", "5d6e"),
        )
        groups = {"browser": [group], "v9": [group]}
        protocol = {
            "path": "protocol.json",
            "bytes": 1,
            "sha256": "a" * 64,
        }
        distillation = {
            "path": "distillation.jsonl",
            "bytes": 2,
            "sha256": "b" * 64,
        }
        teachers = {
            "seed42": "c" * 64,
            "seed314159": "d" * 64,
        }
        with tempfile.TemporaryDirectory() as resumed_dir, (
            tempfile.TemporaryDirectory()
        ) as uninterrupted_dir:
            resumed = Path(resumed_dir)
            uninterrupted = Path(uninterrupted_dir)
            first = runner.train_student(
                groups,
                output=resumed,
                device="cpu",
                protocol_identity=protocol,
                distillation_identity=distillation,
                teacher_hashes=teachers,
                stop_after=("v9-pretrain", 1),
            )
            self.assertEqual(first["completed_epoch"], 1)
            second = runner.train_student(
                groups,
                output=resumed,
                device="cpu",
                protocol_identity=protocol,
                distillation_identity=distillation,
                teacher_hashes=teachers,
                stop_after=("v9-pretrain", 2),
            )
            direct = runner.train_student(
                groups,
                output=uninterrupted,
                device="cpu",
                protocol_identity=protocol,
                distillation_identity=distillation,
                teacher_hashes=teachers,
                stop_after=("v9-pretrain", 2),
            )
            self.assertEqual(second["completed_epoch"], 2)
            self.assertEqual(direct["completed_epoch"], 2)
            resumed_checkpoint = torch.load(
                resumed / runner.LAST_CHECKPOINT_PATH.name,
                map_location="cpu",
                weights_only=False,
            )
            direct_checkpoint = torch.load(
                uninterrupted / runner.LAST_CHECKPOINT_PATH.name,
                map_location="cpu",
                weights_only=False,
            )
            self.assertEqual(
                resumed_checkpoint["phase"],
                direct_checkpoint["phase"],
            )
            self.assertEqual(
                resumed_checkpoint["completed_epoch"],
                direct_checkpoint["completed_epoch"],
            )
            for name in resumed_checkpoint["model"]:
                self.assertTrue(
                    torch.equal(
                        resumed_checkpoint["model"][name],
                        direct_checkpoint["model"][name],
                    ),
                    name,
                )

    def test_terminalize_only_exports_exact_payload_and_result_last(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            torch.manual_seed(student.INITIALIZATION_SEED)
            model = student.ChildBoardRootPolicyStudent()
            optimizer = torch.optim.AdamW(
                model.parameters(),
                lr=runner.LEARNING_RATE,
                weight_decay=runner.WEIGHT_DECAY,
            )
            protocol = {
                "path": "protocol.json",
                "bytes": 1,
                "sha256": "a" * 64,
            }
            distillation_artifact = {
                "path": "fit.jsonl",
                "bytes": 2,
                "sha256": "b" * 64,
            }
            teachers = {
                "seed42": "c" * 64,
                "seed314159": "d" * 64,
            }
            checkpoint = runner._checkpoint_value(
                model,
                optimizer,
                phase="mixed",
                completed_epoch=runner.MIXED_EPOCHS,
                curve=[],
                protocol_identity=protocol,
                distillation_identity=distillation_artifact,
                teacher_hashes=teachers,
                device="cpu",
            )
            runner._atomic_replace_torch(
                root / runner.LAST_CHECKPOINT_PATH.name,
                checkpoint,
            )
            distillation_receipt = {
                "schema": runner.DISTILLATION_RECEIPT_SCHEMA,
                "artifact": distillation_artifact,
            }
            parity_artifact = {
                "path": "parity.jsonl",
                "bytes": 3,
                "sha256": hashlib.sha256(b"parity").hexdigest(),
            }
            parity_receipt = {
                "schema": runner.PARITY_RECEIPT_SCHEMA,
                "artifact": parity_artifact,
            }
            runner._atomic_publish_bytes(
                root / runner.PARITY_RECEIPT_PATH.name,
                runner._canonical_json(parity_receipt),
            )
            result = runner.terminalize_only(
                output=root,
                protocol_identity=protocol,
                distillation_receipt=distillation_receipt,
                parity_receipt=parity_receipt,
                teacher_hashes=teachers,
            )
            self.assertEqual(result["status"], runner.RESULT_STATUS)
            tensor = root / runner.TENSOR_PATH.name
            self.assertEqual(tensor.stat().st_size, 3_510_532)
            manifest = runner._strict_json(
                root / runner.MANIFEST_PATH.name
            )
            self.assertEqual(manifest["payload"]["bytes"], 3_510_532)
            self.assertEqual(
                manifest["payload"]["sha256"],
                hashlib.sha256(tensor.read_bytes()).hexdigest(),
            )
            final = torch.load(
                root / runner.FINAL_CHECKPOINT_PATH.name,
                map_location="cpu",
                weights_only=False,
            )
            self.assertNotIn("optimizer", final)
            self.assertTrue((root / runner.RESULT_PATH.name).is_file())
            self.assertEqual(
                runner.terminalize_only(
                    output=root,
                    protocol_identity=protocol,
                    distillation_receipt=distillation_receipt,
                    parity_receipt=parity_receipt,
                    teacher_hashes=teachers,
                ),
                result,
            )
            tampered_final = dict(final)
            tampered_final["protocol"] = {"tampered": True}
            runner._atomic_replace_torch(
                root / runner.FINAL_CHECKPOINT_PATH.name,
                tampered_final,
            )
            (root / runner.RESULT_PATH.name).unlink()
            with self.assertRaisesRegex(
                ValueError,
                "final checkpoint semantic drift",
            ):
                runner.terminalize_only(
                    output=root,
                    protocol_identity=protocol,
                    distillation_receipt=distillation_receipt,
                    parity_receipt=parity_receipt,
                    teacher_hashes=teachers,
                )

    def test_mixed12_checkpoint_never_recreates_model_or_optimizer(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            torch.manual_seed(student.INITIALIZATION_SEED)
            model = student.ChildBoardRootPolicyStudent()
            optimizer = torch.optim.AdamW(
                model.parameters(),
                lr=runner.LEARNING_RATE,
                weight_decay=runner.WEIGHT_DECAY,
            )
            protocol = {
                "path": "protocol.json",
                "bytes": 1,
                "sha256": "a" * 64,
            }
            distillation = {
                "path": "distillation.jsonl",
                "bytes": 2,
                "sha256": "b" * 64,
            }
            teachers = {
                "seed42": "c" * 64,
                "seed314159": "d" * 64,
            }
            checkpoint = runner._checkpoint_value(
                model,
                optimizer,
                phase="mixed",
                completed_epoch=runner.MIXED_EPOCHS,
                curve=[],
                protocol_identity=protocol,
                distillation_identity=distillation,
                teacher_hashes=teachers,
                device="cpu",
            )
            runner._atomic_replace_torch(
                root / runner.LAST_CHECKPOINT_PATH.name,
                checkpoint,
            )
            with mock.patch.object(
                runner.student,
                "ChildBoardRootPolicyStudent",
                side_effect=AssertionError("model recreated"),
            ), mock.patch.object(
                runner.torch.optim,
                "AdamW",
                side_effect=AssertionError("optimizer recreated"),
            ):
                result = runner.train_student(
                    {"browser": [], "v9": []},
                    output=root,
                    device="cpu",
                    protocol_identity=protocol,
                    distillation_identity=distillation,
                    teacher_hashes=teachers,
                )
            self.assertTrue(result["training_complete_terminalize_only"])


if __name__ == "__main__":
    unittest.main()
