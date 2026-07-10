import copy
import os
import sys
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from sibling_selection_audit import (  # noqa: E402
    _verify_training_result_contract,
)
from sibling_selection_protocol import (  # noqa: E402
    RESULT_ARTIFACT_NAMES,
    SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA,
)


def digest(number):
    return f"{number:064x}"


def valid_plan_and_result():
    inputs = {
        "sibling_teacher_manifest": digest(1),
        "validation_partition_manifest": digest(2),
        "model_training": digest(3),
        "model_selection": digest(4),
        "replay": digest(5),
        "policy_exposure_receipt": digest(6),
        "policy_exposed_parent_ids": digest(7),
        "policy_exposed_semantic_position_ids": digest(8),
        "holdout_protected_position_ids": digest(9),
        "warm_initializer": digest(10),
    }
    runtime = {
        "platform": "test-platform",
        "system": "Darwin",
        "machine": "arm64",
        "processor": "arm",
        "cpu_model": "test-cpu",
        "logical_cpu_count": 14,
        "device": "cpu",
        "python_version": "3.13.0",
        "torch_version": "2.12.1",
        "torch_threads": 2,
        "torch_interop_threads": 1,
        "deterministic_algorithms": True,
        "deterministic_debug_mode": "error",
    }
    plan = {
        "schema": SIX_RUN_PLAN_SCHEMA,
        "common": {"input_sha256": inputs, "runtime": runtime},
        "slots": [],
        "selection_tie_break": list(SELECTION_TIE_BREAK),
    }
    slot = {
        "id": "warm-seed-42",
        "series": "warm",
        "seed": 42,
        "learning_rate": 0.0001,
        "epochs": 20,
        "initializer_required": True,
        "output": "ml/runs/wcsc36-six-run/warm-seed-42",
    }
    plan_path = "/tmp/wcsc36-six-run-plan.json"
    plan_receipt = {
        "path": "ml/protocols/wcsc36-six-run-plan.json",
        "bytes": 3057,
        "sha256": digest(11),
        "schema": SIX_RUN_PLAN_SCHEMA,
    }
    contract = {
        "schema": "shogi-sibling-training-experiment-v1",
        "series": "warm",
        "seed": 42,
        "loss": "sibling-ranking",
        "init_checkpoint_sha256": inputs["warm_initializer"],
        "replay_sha256": inputs["replay"],
        "learning_rate": 0.0001,
        "epochs": 20,
        "batch": 256,
        "k": 600.0,
        "cp_clamp": 3000,
        "rank_weight": 1.0,
        "rank_pair_min": 50.0,
        "rank_pair_max": 600.0,
        "rank_margin_cp": 50.0,
        "policy_weight": 0.25,
        "policy_temp_cp": 200.0,
        "select_metric": "sibling-pair",
        "features": "board",
        "device": "cpu",
        "torch_threads": 2,
        "replay_limit": 500000,
        "replay_ratio": 1.0,
        "primary_limit": 0,
        "allow_legacy_init": True,
    }
    result = {
        "schema": "shogi-sibling-training-result-v1",
        "status": "complete",
        "experiment_plan": {
            "path": plan_path,
            "bytes": plan_receipt["bytes"],
            "sha256": plan_receipt["sha256"],
            "schema": SIX_RUN_PLAN_SCHEMA,
            "slot_id": slot["id"],
            "slot_output": slot["output"],
            "selection_tie_break": list(SELECTION_TIE_BREAK),
        },
        "experiment_contract": contract,
        "training_pipeline": {
            "source_revision": "a" * 40,
            "tracked_tree_clean": True,
        },
        "training_runtime": {
            **runtime,
            "mps_built": True,
            "mps_available": True,
            "cuda_available": False,
        },
        "completed_epochs": 20,
        "selection_metric": "sibling-pair",
        "best_value_loss": 0.03,
        "best_sibling_key": [0.61, 0.27, -0.03],
        "artifacts": {
            name: {"bytes": 100 + index, "sha256": digest(20 + index)}
            for index, name in enumerate(RESULT_ARTIFACT_NAMES)
        },
    }
    return plan, slot, plan_path, plan_receipt, result


class SiblingSelectionAuditContractTest(unittest.TestCase):
    def verify(self, result):
        plan, slot, plan_path, plan_receipt, _unused = valid_plan_and_result()
        return _verify_training_result_contract(
            result,
            slot=slot,
            slot_id=slot["id"],
            series="warm",
            seed=42,
            plan=plan,
            plan_receipt=plan_receipt,
            run_plan_path=plan_path,
        )

    def test_accepts_exact_training_result_contract(self):
        _plan, _slot, _path, _receipt, result = valid_plan_and_result()
        pipeline, runtime = self.verify(result)
        self.assertEqual(pipeline["source_revision"], "a" * 40)
        self.assertEqual(runtime["torch_threads"], 2)

    def test_rejects_schedule_runtime_and_revision_mutations(self):
        _plan, _slot, _path, _receipt, result = valid_plan_and_result()
        cases = (
            ("completed epoch", lambda value: value.__setitem__("completed_epochs", 19)),
            (
                "learning rate",
                lambda value: value["experiment_contract"].__setitem__(
                    "learning_rate", 0.001
                ),
            ),
            (
                "runtime",
                lambda value: value["training_runtime"].__setitem__(
                    "torch_threads", 4
                ),
            ),
            (
                "revision",
                lambda value: value["training_pipeline"].__setitem__(
                    "source_revision", "not-a-revision"
                ),
            ),
        )
        for label, mutate in cases:
            with self.subTest(label=label):
                changed = copy.deepcopy(result)
                mutate(changed)
                with self.assertRaises(ValueError):
                    self.verify(changed)

    def test_rejects_artifact_schema_and_digest_mutations(self):
        _plan, _slot, _path, _receipt, result = valid_plan_and_result()
        extra = copy.deepcopy(result)
        extra["artifacts"]["unexpected.pt"] = {
            "bytes": 1,
            "sha256": digest(99),
        }
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            self.verify(extra)

        malformed = copy.deepcopy(result)
        malformed["artifacts"]["best.pt"]["sha256"] = "not-a-digest"
        with self.assertRaisesRegex(ValueError, "lowercase SHA-256"):
            self.verify(malformed)


if __name__ == "__main__":
    unittest.main()
