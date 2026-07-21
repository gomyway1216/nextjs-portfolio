from __future__ import annotations

import copy
import hashlib
import io
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_qat_constrained_alignment_v2_result_registry_candidate as BUILDER  # noqa: E402
import strength_first_qat_constrained_alignment_v2_protocol as ALIGNMENT  # noqa: E402
import strength_first_qat_constrained_alignment_v2_result_registry as REGISTRY  # noqa: E402


def canonical(value: object) -> bytes:
    return ALIGNMENT.canonical_json_bytes(value)  # type: ignore[arg-type]


class SyntheticHarness:
    def __init__(self, root: Path):
        self.root = root.resolve()
        source_plan = REPO_ROOT / ALIGNMENT.ALIGNMENT_PLAN_RELATIVE_PATH
        plan = ALIGNMENT.strict_json(source_plan.read_bytes(), "source alignment plan")
        for parent in plan["parents"]:
            seed = parent["seed"]
            parent_result_raw = f"parent-result-{seed}\n".encode()
            parent_checkpoint_raw = f"parent-checkpoint-{seed}\n".encode()
            for identity, raw in (
                (parent["result"], parent_result_raw),
                (parent["checkpoint"], parent_checkpoint_raw),
            ):
                path = self.root / identity["path"]
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(raw)
                identity["bytes"] = len(raw)
                identity["sha256"] = hashlib.sha256(raw).hexdigest()
        plan_path = self.root / ALIGNMENT.ALIGNMENT_PLAN_RELATIVE_PATH
        plan_path.parent.mkdir(parents=True)
        plan_raw = canonical(plan)
        plan_path.write_bytes(plan_raw)
        plan_sha = hashlib.sha256(plan_raw).hexdigest()
        pinned = REGISTRY.load_result_registry(repo_root=REPO_ROOT)
        self.results: dict[int, dict] = {}
        self.equalities: dict[int, dict] = {}
        for registered, slot in zip(pinned["runs"], ALIGNMENT.expected_slots()):
            seed = slot["seed"]
            output = self.root / slot["output"]
            output.mkdir(parents=True)
            checkpoint_raw = f"candidate-{seed}\n".encode()
            (output / "final.pt").write_bytes(checkpoint_raw)
            equality = copy.deepcopy(registered["quantized_equality"])
            result = {
                "training_pipeline": {
                    "source_revision": REGISTRY.RUN_SOURCE_REVISION,
                    "tracked_tree_clean": True,
                },
                "contract": {
                    "alignment_plan_sha256": plan_sha,
                    "alignment_plan_bytes": len(plan_raw),
                },
                "candidate_artifact": {
                    "name": "final.pt",
                    "bytes": len(checkpoint_raw),
                    "sha256": hashlib.sha256(checkpoint_raw).hexdigest(),
                },
                "parent": copy.deepcopy(
                    next(parent for parent in plan["parents"] if parent["seed"] == seed)
                ),
                "integer_target_cache": copy.deepcopy(
                    registered["integer_target_cache"]
                ),
                "training_history": copy.deepcopy(registered["training_history"]),
                "quantized_invariant": copy.deepcopy(equality["candidate"]),
            }
            self.results[seed] = result
            self.equalities[seed] = equality
            self.write_result(seed)

    def write_result(self, seed: int) -> None:
        path = self.root / f"{ALIGNMENT.ALIGNMENT_RUN_ROOT}/seed-{seed}/result.json"
        path.write_bytes(canonical(self.results[seed]))

    def result_validator(self, *, repo_root: Path, slot: dict) -> dict:
        del repo_root
        return copy.deepcopy(self.results[slot["seed"]])

    def quantized_verifier(
        self, parent_path: Path, candidate_path: Path, *, seed: int
    ) -> dict:
        self.assert_paths(parent_path, candidate_path, seed)
        return copy.deepcopy(self.equalities[seed])

    def assert_paths(self, parent_path: Path, candidate_path: Path, seed: int) -> None:
        assert parent_path == self.root / (
            f"{ALIGNMENT.BASE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}/final.pt"
        )
        assert candidate_path == self.root / (
            f"{ALIGNMENT.ALIGNMENT_RUN_ROOT}/seed-{seed}/final.pt"
        )


class AlignmentV2ResultRegistryTests(unittest.TestCase):
    def test_pinned_registry_is_strict_and_canonical(self):
        registry = REGISTRY.load_result_registry(repo_root=REPO_ROOT)
        raw = (REPO_ROOT / REGISTRY.RESULT_REGISTRY_RELATIVE_PATH).read_bytes()
        self.assertEqual(canonical(registry), raw)
        self.assertEqual([run["seed"] for run in registry["runs"]], [42, 43, 44])
        self.assertTrue(
            all(run["quantized_equality"]["all_equal"] for run in registry["runs"])
        )
        self.assertFalse(registry["claims"]["playing_strength_improved"])
        self.assertFalse(registry["boundary"]["live_weights_changed"])

    def test_builder_is_deterministic_over_fixed_outputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = SyntheticHarness(Path(temporary))
            kwargs = {
                "repo_root": harness.root,
                "result_validator": harness.result_validator,
                "quantized_verifier": harness.quantized_verifier,
                "require_pinned_match": False,
            }
            first = BUILDER.build_alignment_result_registry_candidate(**kwargs)
            second = BUILDER.build_alignment_result_registry_candidate(**kwargs)
            self.assertEqual(
                BUILDER.serialize_alignment_result_registry_candidate(first),
                BUILDER.serialize_alignment_result_registry_candidate(second),
            )
            self.assertEqual(first["run_observation"], REGISTRY.RUN_OBSERVATION)
            self.assertEqual(len(first["runs"]), 3)

    def test_builder_rejects_result_parent_drift_from_plan(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = SyntheticHarness(Path(temporary))
            harness.results[43]["parent"]["checkpoint"]["sha256"] = "f" * 64
            harness.write_result(43)
            with self.assertRaisesRegex(
                ValueError, "parent differs from registered alignment plan"
            ):
                BUILDER.build_alignment_result_registry_candidate(
                    repo_root=harness.root,
                    result_validator=harness.result_validator,
                    quantized_verifier=harness.quantized_verifier,
                    require_pinned_match=False,
                )

    def test_builder_rejects_one_unequal_integer_tensor(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = SyntheticHarness(Path(temporary))

            def unequal(parent_path: Path, candidate_path: Path, *, seed: int):
                value = harness.quantized_verifier(
                    parent_path, candidate_path, seed=seed
                )
                if seed == 43:
                    value["tensors_equal"]["w2"] = False
                    value["equal_tensor_count"] = 6
                    value["all_equal"] = False
                return value

            with self.assertRaisesRegex(ValueError, "integer equality is incomplete"):
                BUILDER.build_alignment_result_registry_candidate(
                    repo_root=harness.root,
                    result_validator=harness.result_validator,
                    quantized_verifier=unequal,
                    require_pinned_match=False,
                )

    def test_protocol_rejects_strength_or_live_boundary_expansion(self):
        registry = REGISTRY.load_result_registry(repo_root=REPO_ROOT)
        for path, value in (
            (("claims", "playing_strength_improved"), True),
            (("boundary", "live_weights_changed"), True),
            (("boundary", "selection_evaluations"), 1),
        ):
            changed = copy.deepcopy(registry)
            changed[path[0]][path[1]] = value
            with self.assertRaisesRegex(ValueError, "fixed boundary drifted"):
                REGISTRY.validate_result_registry(changed)

    def test_protocol_rejects_duplicate_artifact_identity(self):
        registry = REGISTRY.load_result_registry(repo_root=REPO_ROOT)
        changed = copy.deepcopy(registry)
        changed["runs"][1]["checkpoint"]["sha256"] = changed["runs"][0]["checkpoint"][
            "sha256"
        ]
        with self.assertRaisesRegex(ValueError, "pairwise distinct"):
            REGISTRY.validate_result_registry(changed)

    def test_main_rejects_arguments_before_reading_outputs(self):
        stderr = io.StringIO()
        with mock.patch.object(sys, "stderr", stderr):
            self.assertEqual(BUILDER.main(["--output", "forbidden"]), 2)
        self.assertIn("arguments are forbidden", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
