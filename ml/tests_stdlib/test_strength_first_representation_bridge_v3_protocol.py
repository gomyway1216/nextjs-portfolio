from __future__ import annotations

import ast
import copy
from pathlib import Path
import sys
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_representation_bridge_v3_registry_candidate as BUILDER  # noqa: E402
import strength_first_representation_bridge_v3_protocol as PROTOCOL  # noqa: E402


def metrics(*, pair: float, top1: float, mae: float = 100.0) -> dict[str, float]:
    return {
        "value_mae_cp": mae,
        "value_mse_cp2": mae * mae,
        "within_parent_pair_accuracy": pair,
        "teacher_top1_accuracy": top1,
    }


class RepresentationBridgeV3ProtocolTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.candidate = BUILDER.build_registry_candidate()

    def test_builder_emits_one_valid_ready_registry(self):
        validated = PROTOCOL.validate_registry(self.candidate)
        self.assertEqual(validated["status"], PROTOCOL.REGISTRY_STATUS)
        self.assertTrue(validated["boundary"]["selection_labels_previously_spent"])
        self.assertFalse(validated["boundary"]["strength_claim_authorized"])
        self.assertFalse(validated["boundary"]["live_weights_changed"])

    def test_pinned_ready_registry_is_byte_identical_to_builder(self):
        self.assertEqual(
            BUILDER.build_registry_candidate(require_pinned_match=True),
            self.candidate,
        )

    def test_runtime_local_import_closure_is_complete_and_exact(self):
        modules = {
            path.stem: path
            for path in ML_DIR.glob("*.py")
            if path.name != "__init__.py"
        }
        dynamic_edges = {
            "strength_first_qat_selection_eval_adapter.py": ["eval-sibling.py"],
            "eval-sibling.py": ["export-weights.py"],
            "export-weights.py": ["train.py"],
        }
        pending = [ML_DIR / "run_strength_first_representation_bridge_v3.py"]
        observed: set[Path] = set()
        while pending:
            path = pending.pop()
            if path in observed:
                continue
            observed.add(path)
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for node in ast.walk(tree):
                imported = []
                if isinstance(node, ast.Import):
                    imported = [alias.name.split(".")[0] for alias in node.names]
                elif (
                    isinstance(node, ast.ImportFrom) and node.level == 0 and node.module
                ):
                    imported = [node.module.split(".")[0]]
                for name in imported:
                    dependency = modules.get(name)
                    if dependency is not None and dependency not in observed:
                        pending.append(dependency)
            for name in dynamic_edges.get(path.name, []):
                dependency = ML_DIR / name
                if dependency not in observed:
                    pending.append(dependency)

        expected = {
            ML_DIR.parent / relative
            for relative in PROTOCOL.RUNTIME_IMPORT_CLOSURE_PATHS.values()
        }
        self.assertEqual(observed, expected)
        enrolled = self.candidate["dependencies"]["runtime_import_closure"]
        self.assertEqual(
            {identity["path"] for identity in enrolled.values()},
            set(PROTOCOL.RUNTIME_IMPORT_CLOSURE_PATHS.values()),
        )
        self.assertEqual(len(enrolled), 23)

    def test_parent_epoch_is_exactly_bound(self):
        mutated = copy.deepcopy(self.candidate)
        mutated["models"]["seeds"][0]["parent_checkpoint"]["epoch"] = 24
        with self.assertRaisesRegex(ValueError, "epoch must be 20"):
            PROTOCOL.validate_registry(mutated)

    def test_aligned_epoch_is_exactly_bound(self):
        mutated = copy.deepcopy(self.candidate)
        mutated["models"]["seeds"][0]["aligned_checkpoint"]["epoch"] = 20
        with self.assertRaisesRegex(ValueError, "epoch must be 24"):
            PROTOCOL.validate_registry(mutated)

    def test_gate_tolerance_accepts_half_picounit_over_boundary(self):
        parent = metrics(pair=0.7, top1=0.6)
        aligned = metrics(pair=0.7020000000005, top1=0.6050000000005)
        stable = metrics(pair=0.6, top1=0.5)
        result = PROTOCOL.representation_gates(
            aligned_float=aligned,
            parent_int16=parent,
            stable_int16=stable,
        )
        self.assertTrue(result["passed"])
        self.assertTrue(result["checks"][2]["passed"])
        self.assertTrue(result["checks"][3]["passed"])

    def test_gate_tolerance_rejects_two_picounits_over_boundary(self):
        parent = metrics(pair=0.7, top1=0.6)
        aligned = metrics(pair=0.702000000002, top1=0.605000000002)
        stable = metrics(pair=0.6, top1=0.5)
        result = PROTOCOL.representation_gates(
            aligned_float=aligned,
            parent_int16=parent,
            stable_int16=stable,
        )
        self.assertFalse(result["passed"])
        self.assertFalse(result["checks"][2]["passed"])
        self.assertFalse(result["checks"][3]["passed"])

    def test_ranking_uses_parent_int16_then_seed(self):
        checkpoint = self.candidate["models"]["seeds"][0]["parent_checkpoint"]
        left = {
            "seed": 42,
            "parent_int16": metrics(pair=0.7, top1=0.6),
            "deployment_checkpoint": checkpoint,
        }
        right = {
            "seed": 43,
            "parent_int16": metrics(pair=0.69, top1=0.99),
            "deployment_checkpoint": {
                **checkpoint,
                "sha256": "f" * 64,
            },
        }
        self.assertLess(PROTOCOL.selection_key(left), PROTOCOL.selection_key(right))


if __name__ == "__main__":
    unittest.main()
