import hashlib
import json
import unittest

import run_strength_first_selection_teacher_preflight as SUBJECT
import strength_first_qat_selection_preflight as PREFLIGHT
import strength_first_qat_training_bridge as BRIDGE


class StrengthFirstSelectionTeacherPreflightSummaryTests(unittest.TestCase):
    def _preflight(self):
        runs = []
        for index, seed in enumerate((42, 43, 44), start=1):
            output = f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}"
            runs.append(
                {
                    "slot_id": f"floodgate-strength-first-int16-aware-seed-{seed}",
                    "seed": seed,
                    "output": output,
                    "result": {
                        "path": f"/repo/{output}/result.json",
                        "bytes": 100 + seed,
                        "sha256": f"{index:x}" * 64,
                    },
                    "checkpoint": {
                        "path": f"/repo/{output}/final.pt",
                        "bytes": 200 + seed,
                        "sha256": f"{index + 3:x}" * 64,
                    },
                    "checkpoint_metadata": {
                        "schema": BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA,
                        "epoch": 20,
                    },
                }
            )
        return {
            "schema": PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
            "all_three_complete_before_selection_read": True,
            "selection_labels_read": False,
            "training_plan": {
                "path": "/repo/"
                + BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_RELATIVE_PATH,
                "bytes": 321,
                "sha256": "a" * 64,
                "schema": BRIDGE.STRENGTH_FIRST_QAT_EXECUTION_PLAN_SCHEMA,
            },
            "training_pipeline": {
                "source_revision": "b" * 40,
                "tracked_tree_clean": True,
            },
            "runs": runs,
            "production_promotion_authorized": False,
        }

    def test_builds_portable_exact_three_checkpoint_projection(self):
        registry_raw = b'{"status":"ready"}\n'
        summary = (
            SUBJECT.build_strength_first_selection_teacher_preflight_summary(
                self._preflight(),
                registry_raw=registry_raw,
            )
        )
        self.assertEqual(summary["schema"], SUBJECT.SUMMARY_SCHEMA)
        self.assertEqual(summary["strict_loaded_seeds"], [42, 43, 44])
        self.assertEqual(summary["strict_loaded_checkpoints"], 3)
        self.assertFalse(summary["selection_source_opened"])
        self.assertEqual(summary["network_requests"], 0)
        self.assertEqual(summary["live_weight_writes"], 0)
        self.assertEqual(
            summary["selection_preflight_registry"]["sha256"],
            hashlib.sha256(registry_raw).hexdigest(),
        )
        self.assertNotIn("/repo/", json.dumps(summary))

    def test_rejects_duplicate_or_out_of_order_checkpoint_evidence(self):
        value = self._preflight()
        value["runs"][1]["seed"] = 42
        with self.assertRaisesRegex(ValueError, "order drifted"):
            SUBJECT.build_strength_first_selection_teacher_preflight_summary(
                value,
                registry_raw=b"{}\n",
            )

        value = self._preflight()
        value["runs"][1]["checkpoint"]["sha256"] = value["runs"][0]["checkpoint"][
            "sha256"
        ]
        with self.assertRaisesRegex(ValueError, "not distinct"):
            SUBJECT.build_strength_first_selection_teacher_preflight_summary(
                value,
                registry_raw=b"{}\n",
            )

    def test_cli_rejects_every_argument_before_preflight(self):
        with self.assertRaisesRegex(ValueError, "accepts no arguments"):
            SUBJECT.main(["--checkpoint", "/tmp/other.pt"])


if __name__ == "__main__":
    unittest.main()
