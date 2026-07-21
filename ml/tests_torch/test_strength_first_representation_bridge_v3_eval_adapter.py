from __future__ import annotations

import copy
from pathlib import Path
import sys
import unittest
from unittest import mock

import torch


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_representation_bridge_v3_registry_candidate as BUILDER  # noqa: E402
import strength_first_representation_bridge_v3_eval_adapter as ADAPTER  # noqa: E402
from int16_forward import int16_forward, quantize_model  # noqa: E402
from strength_first_quantized_cell_alignment import (  # noqa: E402
    anchor_identity,
    capture_quantized_anchor,
)
from train import DistillNet  # noqa: E402


class FakeEvaluator:
    def __init__(self, entries: dict[str, tuple]):
        self.entries = entries
        self.loads: list[str] = []

    def load_model(self, path: str):
        self.loads.append(path)
        return self.entries[path]


def fixture(*, mismatch_seed: int | None = None):
    candidate = BUILDER.build_registry_candidate()
    root = ML_DIR.parent.resolve()
    home = Path.home().resolve()
    entries = {}
    result_fingerprints = {}

    stable = DistillNet("board")
    stable_spec = candidate["models"]["stable"]["checkpoint"]
    stable_path = str((home / stable_spec["path"]).absolute())
    entries[stable_path] = (
        stable,
        {"epoch": 27, "model": stable.state_dict()},
        600.0,
        {"bytes": stable_spec["bytes"], "sha256": stable_spec["sha256"]},
    )

    for spec in candidate["models"]["seeds"]:
        seed = spec["seed"]
        parent = DistillNet("board")
        aligned = copy.deepcopy(parent)
        if mismatch_seed == seed:
            aligned.l3.bias.data.add_(10.0)
        parent_anchor = anchor_identity(capture_quantized_anchor(parent))
        spec["quantized_anchor"] = copy.deepcopy(parent_anchor)
        for role, model, checkpoint_spec, schema, epoch in (
            (
                "parent",
                parent,
                spec["parent_checkpoint"],
                "shogi-floodgate-strength-first-qat-final-checkpoint-v2",
                20,
            ),
            (
                "aligned",
                aligned,
                spec["aligned_checkpoint"],
                "shogi-floodgate-strength-first-qat-constrained-alignment-v2-checkpoint-v1",
                24,
            ),
        ):
            path = str((root / checkpoint_spec["path"]).absolute())
            entries[path] = (
                model,
                {"schema": schema, "epoch": epoch, "model": model.state_dict()},
                600.0,
                {
                    "bytes": checkpoint_spec["bytes"],
                    "sha256": checkpoint_spec["sha256"],
                },
            )
        for result_name in ("parent_result", "aligned_result"):
            result = spec[result_name]
            path = str((root / result["path"]).absolute())
            result_fingerprints[path] = {
                "bytes": result["bytes"],
                "sha256": result["sha256"],
            }
    return candidate, root, home, FakeEvaluator(entries), result_fingerprints


class RepresentationBridgeV3AdapterTest(unittest.TestCase):
    def test_spent_evaluation_runs_four_int_forwards_and_derives_three_witnesses(self):
        class MetricEvaluator:
            def __init__(self):
                self.float_calls = 0

            def _eligible_pair_count(self, *_args):
                return 1

            def float_predictions(self, model, *_args):
                self.float_calls += 1
                return ("float", model)

            def calculate_metrics(self, predictions, *_args):
                role, model = predictions
                seed_offset = 0.001 * (model if isinstance(model, int) else 0)
                return {
                    "value_mae_cp": 400.0,
                    "value_mse_cp2": 160_000.0,
                    "within_parent_pair_accuracy": 0.7 + seed_offset,
                    "teacher_top1_accuracy": 0.6 + (0.0 if role == "int16" else 0.001),
                }

        def item(name, role, seed, epoch):
            return {
                "name": name,
                "role": role,
                "seed": seed,
                "model": 0 if seed is None else seed,
                "identity": {
                    "path": f"{name}.pt",
                    "schema": "test-checkpoint",
                    "bytes": 1,
                    "sha256": f"{epoch:064x}",
                },
                "epoch": epoch,
                "k_sigmoid": 600.0,
            }

        prepared = {
            "stable": item("stable", "stable", None, 27),
            "models": [
                value
                for seed in (42, 43, 44)
                for value in (
                    item(f"seed-{seed}-parent-deployment", "parent", seed, 20),
                    item(
                        f"seed-{seed}-aligned-witness",
                        "aligned-witness",
                        seed,
                        24,
                    ),
                )
            ],
            "quantized_proofs": [{"seed": seed} for seed in (42, 43, 44)],
        }
        dataset = {"bytes": 10, "sha256": "a" * 64}
        evaluator = MetricEvaluator()
        int16_calls = []

        def exact_predictions(model, *_args, **_kwargs):
            int16_calls.append(model)
            return ("int16", model)

        loaded = (
            object(),
            object(),
            object(),
            object(),
            object(),
            [0, 1],
            [[0, 1]],
            dataset,
        )
        original_threads = torch.get_num_threads()
        original_interop_threads = torch.get_num_interop_threads()
        with (
            mock.patch.object(
                ADAPTER.BASE,
                "_load_splitless_fresh_selection_as_validation",
                return_value=loaded,
            ),
            mock.patch.object(
                ADAPTER, "exact_int16_predictions", side_effect=exact_predictions
            ),
        ):
            report = ADAPTER.evaluate_spent_selection(
                prepared=prepared,
                dataset_path="/private/spent-selection.jsonl",
                dataset_identity=dataset,
                expected_records=2,
                expected_parents=1,
                origin_registry_identity={"sha256": "b" * 64},
                artifact_bindings=[],
                evaluator=evaluator,
            )

        self.assertEqual(evaluator.float_calls, 7)
        self.assertEqual(len(int16_calls), 4)
        self.assertEqual(report["execution"]["float_model_evaluations"], 7)
        self.assertEqual(report["execution"]["int16_model_evaluations"], 4)
        self.assertEqual(report["execution"]["q_equivalent_int16_derivations"], 3)
        self.assertEqual(report["execution"]["int16_reference"], "int16_forward_batch")
        self.assertEqual(report["execution"]["int16_batch_rows"], 4_096)
        self.assertEqual(report["execution"]["torch_intraop_threads"], 10)
        self.assertEqual(
            report["execution"]["torch_original_intraop_threads"], original_threads
        )
        self.assertTrue(report["execution"]["torch_original_intraop_threads_restored"])
        self.assertEqual(
            report["execution"]["torch_interop_threads"], original_interop_threads
        )
        self.assertTrue(report["execution"]["torch_interop_threads_unchanged"])
        self.assertEqual(torch.get_num_threads(), original_threads)
        self.assertEqual(torch.get_num_interop_threads(), original_interop_threads)
        self.assertTrue(
            all(
                model["int16_source"] == "evaluated-exact-int16-forward-batch"
                for model in report["models"]
                if model["role"] != "aligned-witness"
            )
        )
        self.assertTrue(
            all(
                model["int16_source"] == "derived-from-seven-tensor-equivalent-parent"
                for model in report["models"]
                if model["role"] == "aligned-witness"
            )
        )

    def test_batched_integer_predictions_exactly_match_scalar_production_fixture(self):
        torch.manual_seed(73)
        model = DistillNet("board")
        generator = torch.Generator().manual_seed(8_671)
        board = torch.randint(
            0,
            model.pad_idx + 1,
            (257, 40),
            generator=generator,
            dtype=torch.int64,
        )
        hands = torch.randint(
            0,
            6,
            (257, 14),
            generator=generator,
            dtype=torch.int64,
        )
        actual = ADAPTER.exact_int16_predictions(
            model,
            board,
            hands,
            600.0,
            batch_rows=31,
        )
        qweights = quantize_model(model)
        evaluator = ADAPTER.BASE._load_real_eval_module()
        expected = torch.tensor(
            [
                evaluator.production_cp_from_out_q(
                    int16_forward(qweights, board[index], hands[index], model.pad_idx),
                    600.0,
                )
                for index in range(board.shape[0])
            ],
            dtype=torch.float64,
        )
        self.assertTrue(torch.equal(actual, expected))

    def test_torch_intraop_threads_restore_when_evaluation_fails(self):
        class FailingEvaluator:
            def _eligible_pair_count(self, *_args):
                return 1

            def float_predictions(self, *_args):
                raise RuntimeError("injected evaluation failure")

        def item(name, role, seed, epoch):
            return {
                "name": name,
                "role": role,
                "seed": seed,
                "model": object(),
                "identity": {
                    "path": f"{name}.pt",
                    "schema": "test-checkpoint",
                    "bytes": 1,
                    "sha256": f"{epoch:064x}",
                },
                "epoch": epoch,
                "k_sigmoid": 600.0,
            }

        prepared = {
            "stable": item("stable", "stable", None, 27),
            "models": [
                value
                for seed in (42, 43, 44)
                for value in (
                    item(f"seed-{seed}-parent-deployment", "parent", seed, 20),
                    item(
                        f"seed-{seed}-aligned-witness",
                        "aligned-witness",
                        seed,
                        24,
                    ),
                )
            ],
            "quantized_proofs": [{"seed": seed} for seed in (42, 43, 44)],
        }
        dataset = {"bytes": 10, "sha256": "a" * 64}
        loaded = (
            object(),
            object(),
            object(),
            object(),
            object(),
            [0, 1],
            [[0, 1]],
            dataset,
        )
        original_threads = torch.get_num_threads()
        original_interop_threads = torch.get_num_interop_threads()
        with (
            mock.patch.object(
                ADAPTER.BASE,
                "_load_splitless_fresh_selection_as_validation",
                return_value=loaded,
            ),
            self.assertRaisesRegex(RuntimeError, "injected evaluation failure"),
        ):
            ADAPTER.evaluate_spent_selection(
                prepared=prepared,
                dataset_path="/private/spent-selection.jsonl",
                dataset_identity=dataset,
                expected_records=2,
                expected_parents=1,
                origin_registry_identity={"sha256": "b" * 64},
                artifact_bindings=[],
                evaluator=FailingEvaluator(),
            )
        self.assertEqual(torch.get_num_threads(), original_threads)
        self.assertEqual(torch.get_num_interop_threads(), original_interop_threads)

    def test_all_six_checkpoints_and_q_tensors_validate_before_any_label_read(self):
        candidate, root, home, evaluator, fingerprints = fixture()

        def fingerprint(path: str):
            return fingerprints[path]

        with mock.patch.object(
            ADAPTER.BASE,
            "_load_splitless_fresh_selection_as_validation",
            side_effect=AssertionError("prevalidation must not read selection labels"),
        ) as label_loader:
            prepared = ADAPTER.prevalidate_family(
                registry=candidate,
                repo_root=root,
                home_root=home,
                evaluator=evaluator,
                fingerprint=fingerprint,
            )
        self.assertFalse(prepared["selection_labels_read"])
        label_loader.assert_not_called()
        self.assertEqual(len(evaluator.loads), 7)
        self.assertEqual(len(prepared["quantized_proofs"]), 3)
        self.assertTrue(
            all(proof["all_equal"] for proof in prepared["quantized_proofs"])
        )

    def test_one_changed_quantized_tensor_stops_before_label_read(self):
        candidate, root, home, evaluator, fingerprints = fixture(mismatch_seed=43)
        with (
            mock.patch.object(
                ADAPTER.BASE,
                "_load_splitless_fresh_selection_as_validation",
                side_effect=AssertionError(
                    "q-equivalence failure must stop before selection labels"
                ),
            ) as label_loader,
            self.assertRaisesRegex(ValueError, "seven-tensor equivalence failed"),
        ):
            ADAPTER.prevalidate_family(
                registry=candidate,
                repo_root=root,
                home_root=home,
                evaluator=evaluator,
                fingerprint=lambda path: fingerprints[path],
            )
        label_loader.assert_not_called()

    def test_result_identity_mismatch_stops_before_checkpoint_or_label_read(self):
        candidate, root, home, evaluator, fingerprints = fixture()
        first = candidate["models"]["seeds"][0]["parent_result"]
        path = str((root / first["path"]).absolute())
        fingerprints[path] = {**fingerprints[path], "bytes": first["bytes"] + 1}
        with self.assertRaisesRegex(ValueError, "parent result identity mismatch"):
            ADAPTER.prevalidate_family(
                registry=candidate,
                repo_root=root,
                home_root=home,
                evaluator=evaluator,
                fingerprint=lambda item: fingerprints[item],
            )
        # Stable is allowed to strict-load first, but no parent/aligned checkpoint
        # and no spent-label artifact has been opened.
        self.assertEqual(len(evaluator.loads), 1)


if __name__ == "__main__":
    unittest.main()
