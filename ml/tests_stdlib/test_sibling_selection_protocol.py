import copy
import os
import sys
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

from sibling_selection_protocol import (  # noqa: E402
    CANDIDATE_SELECTION_RECEIPT_SCHEMA,
    CANDIDATE_SELECTION_STRATEGY,
    MODEL_SELECTION_METRIC_ORDER,
    SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA,
    SIX_RUN_SLOT_ORDER,
    validate_candidate_selection_receipt,
)
from sibling_selection_audit import (  # noqa: E402
    PAIR_DEGRADATION_LIMIT,
    TOP1_DEGRADATION_LIMIT,
    evaluate_selection_gates,
)


def digest(number):
    return f"{number:064x}"


def valid_receipt():
    runs = []
    for index, (series, seed) in enumerate(SIX_RUN_SLOT_ORDER, start=1):
        runs.append(
            {
                "slot_id": f"{series}-seed-{seed}",
                "series": series,
                "seed": seed,
                "result_manifest": {
                    "path": f"ml/runs/wcsc36-six-run/{series}-seed-{seed}/result.json",
                    "bytes": 100 + index,
                    "sha256": digest(100 + index),
                },
                "checkpoint": {
                    "path": f"ml/runs/wcsc36-six-run/{series}-seed-{seed}/best-sibling.pt",
                    "bytes": 200 + index,
                    "sha256": digest(index),
                },
                "export": {
                    "path": f"ml/runs/wcsc36-six-run/{series}-seed-{seed}/eval.bin",
                    "bytes": 250 + index,
                    "sha256": digest(50 + index),
                    "bucket_count": 1,
                },
                "int16_selection_report": {
                    "path": f"ml/runs/wcsc36-six-run/{series}-seed-{seed}/selection.json",
                    "bytes": 300 + index,
                    "sha256": digest(200 + index),
                },
                "int16_pair_accuracy": 0.75,
                "int16_teacher_top1": 0.5,
                "int16_value_mae_cp": 100.0,
            }
        )
    winner = runs[1]
    return {
        "schema": CANDIDATE_SELECTION_RECEIPT_SCHEMA,
        "run_plan": {
            "path": "ml/protocols/wcsc36-six-run-plan.json",
            "bytes": 400,
            "sha256": digest(400),
            "schema": SIX_RUN_PLAN_SCHEMA,
        },
        "runs": runs,
        "selection_strategy": CANDIDATE_SELECTION_STRATEGY,
        "selection_metric_order": list(MODEL_SELECTION_METRIC_ORDER),
        "selection_tie_break": list(SELECTION_TIE_BREAK),
        "selected": {
            "slot_id": winner["slot_id"],
            "series": winner["series"],
            "seed": winner["seed"],
            "checkpoint_sha256": winner["checkpoint"]["sha256"],
            "export_sha256": winner["export"]["sha256"],
            "int16_selection_report_sha256": winner[
                "int16_selection_report"
            ]["sha256"],
        },
        "candidate_checkpoint": {
            "path": "ml/runs/wcsc36-selected/best-sibling.pt",
            "bytes": winner["checkpoint"]["bytes"],
            "sha256": winner["checkpoint"]["sha256"],
        },
        "candidate_export": {
            "path": "public/eval/wcsc36-candidate.bin",
            "bytes": winner["export"]["bytes"],
            "sha256": winner["export"]["sha256"],
            "bucket_count": winner["export"]["bucket_count"],
        },
        "int16_selection_report": {
            "path": "ml/runs/wcsc36-selected/selection-report.json",
            "bytes": winner["int16_selection_report"]["bytes"],
            "sha256": winner["int16_selection_report"]["sha256"],
        },
        "stable_checkpoint_sha256": digest(999),
    }


class CandidateSelectionProtocolTest(unittest.TestCase):
    def test_exact_six_run_receipt_selects_metric_then_fallback_winner(self):
        receipt = valid_receipt()
        winner = validate_candidate_selection_receipt(receipt)
        self.assertEqual(winner["slot_id"], "warm-seed-43")

        receipt["runs"][3]["int16_pair_accuracy"] = 0.76
        receipt["runs"][4]["int16_pair_accuracy"] = 0.77
        selected_run = receipt["runs"][3]
        receipt["selected"] = {
            "slot_id": selected_run["slot_id"],
            "series": selected_run["series"],
            "seed": selected_run["seed"],
            "checkpoint_sha256": selected_run["checkpoint"]["sha256"],
            "export_sha256": selected_run["export"]["sha256"],
            "int16_selection_report_sha256": selected_run[
                "int16_selection_report"
            ]["sha256"],
        }
        receipt["candidate_checkpoint"]["bytes"] = selected_run["checkpoint"][
            "bytes"
        ]
        receipt["candidate_checkpoint"]["sha256"] = selected_run["checkpoint"][
            "sha256"
        ]
        receipt["candidate_export"]["bytes"] = selected_run["export"]["bytes"]
        receipt["candidate_export"]["sha256"] = selected_run["export"]["sha256"]
        receipt["candidate_export"]["bucket_count"] = selected_run["export"][
            "bucket_count"
        ]
        receipt["int16_selection_report"]["bytes"] = selected_run[
            "int16_selection_report"
        ]["bytes"]
        receipt["int16_selection_report"]["sha256"] = selected_run[
            "int16_selection_report"
        ]["sha256"]
        winner = validate_candidate_selection_receipt(receipt)
        self.assertEqual(winner["slot_id"], "scratch-seed-42")

    def test_receipt_rejects_missing_run_and_extra_field(self):
        receipt = valid_receipt()
        receipt["runs"].pop()
        with self.assertRaisesRegex(ValueError, "exactly six runs"):
            validate_candidate_selection_receipt(receipt)

        receipt = valid_receipt()
        receipt["unexpected"] = True
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            validate_candidate_selection_receipt(receipt)

    def test_receipt_rejects_forged_winner_and_stable_alias(self):
        receipt = valid_receipt()
        forged = copy.deepcopy(receipt)
        forged["selected"]["seed"] = 42
        with self.assertRaisesRegex(ValueError, "winner"):
            validate_candidate_selection_receipt(forged)

        receipt["stable_checkpoint_sha256"] = receipt["candidate_checkpoint"][
            "sha256"
        ]
        with self.assertRaisesRegex(ValueError, "must differ"):
            validate_candidate_selection_receipt(receipt)

    def test_receipt_binds_every_run_export_and_int16_report_to_selected(self):
        receipt = valid_receipt()
        missing_run_export_field = copy.deepcopy(receipt)
        missing_run_export_field["runs"][0]["export"].pop("bucket_count")
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            validate_candidate_selection_receipt(missing_run_export_field)

        forged_selected_export = copy.deepcopy(receipt)
        forged_selected_export["selected"]["export_sha256"] = digest(777)
        with self.assertRaisesRegex(ValueError, "winner"):
            validate_candidate_selection_receipt(forged_selected_export)

        mismatched_report = copy.deepcopy(receipt)
        mismatched_report["int16_selection_report"]["sha256"] = digest(778)
        with self.assertRaisesRegex(ValueError, "selection report"):
            validate_candidate_selection_receipt(mismatched_report)

    def test_selection_gates_fail_closed_on_actual_pair_and_top1_failures(self):
        gates = evaluate_selection_gates(
            {
                "within_parent_pair_accuracy": 0.6099488308828293,
                "teacher_top1_accuracy": 0.26099706744868034,
                "value_mae_cp": 486.6910572304545,
            },
            {
                "within_parent_pair_accuracy": 0.6072284474383056,
                "teacher_top1_accuracy": 0.26392961876832843,
                "value_mae_cp": 491.98977505112475,
            },
            {
                "within_parent_pair_accuracy": 0.6048966902001425,
                "teacher_top1_accuracy": 0.2668621700879765,
                "value_mae_cp": 496.8903374233129,
            },
        )
        self.assertFalse(gates["passed"])
        checks = {check["id"]: check for check in gates["checks"]}
        self.assertTrue(checks["candidate_pair_strictly_above_stable"]["passed"])
        self.assertFalse(checks["candidate_top1_at_least_stable"]["passed"])
        self.assertFalse(checks["absolute_float_to_int16_pair_delta"]["passed"])
        self.assertTrue(checks["absolute_float_to_int16_top1_delta"]["passed"])
        self.assertGreater(
            abs(checks["absolute_float_to_int16_pair_delta"]["observed"]),
            PAIR_DEGRADATION_LIMIT,
        )

    def test_selection_gates_accept_all_boundary_conditions(self):
        candidate_float = {
            "within_parent_pair_accuracy": 0.612,
            "teacher_top1_accuracy": 0.272,
            "value_mae_cp": 490.0,
        }
        candidate_int16 = {
            "within_parent_pair_accuracy": 0.610,
            "teacher_top1_accuracy": 0.267,
            "value_mae_cp": 492.0,
        }
        stable_int16 = {
            "within_parent_pair_accuracy": 0.609,
            "teacher_top1_accuracy": 0.267,
            "value_mae_cp": 500.0,
        }
        gates = evaluate_selection_gates(
            candidate_float, candidate_int16, stable_int16
        )
        self.assertTrue(gates["passed"])
        self.assertAlmostEqual(
            abs(gates["checks"][2]["observed"]), PAIR_DEGRADATION_LIMIT
        )
        self.assertAlmostEqual(
            abs(gates["checks"][3]["observed"]), TOP1_DEGRADATION_LIMIT
        )


if __name__ == "__main__":
    unittest.main()
