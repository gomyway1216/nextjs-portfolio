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
    SELECTION_AUDIT_SCHEMA,
    SELECTION_TIE_BREAK,
    SIX_RUN_PLAN_SCHEMA,
    SIX_RUN_SLOT_ORDER,
    WCSC36_SIX_RUN_PLAN_SHA256,
    WCSC36_STABLE_RUNOP1_SHA256,
    _decode_candidate_selection_receipt_untrusted,
    select_sealed_candidate,
    validate_candidate_selection_receipt,
)
from sibling_selection_audit import (  # noqa: E402
    PAIR_DEGRADATION_LIMIT,
    TOP1_DEGRADATION_LIMIT,
    evaluate_selection_gates,
    verify_audit_pipeline_revision,
)


def digest(number):
    return f"{number:064x}"


def gate_proof(candidate_float, candidate_int16, stable_int16):
    pair_delta = (
        candidate_int16["within_parent_pair_accuracy"]
        - candidate_float["within_parent_pair_accuracy"]
    )
    top1_delta = (
        candidate_int16["teacher_top1_accuracy"]
        - candidate_float["teacher_top1_accuracy"]
    )
    checks = [
        {
            "id": "candidate_pair_strictly_above_stable",
            "candidate": candidate_int16["within_parent_pair_accuracy"],
            "reference": stable_int16["within_parent_pair_accuracy"],
            "operator": ">",
            "passed": candidate_int16["within_parent_pair_accuracy"]
            > stable_int16["within_parent_pair_accuracy"],
        },
        {
            "id": "candidate_top1_at_least_stable",
            "candidate": candidate_int16["teacher_top1_accuracy"],
            "reference": stable_int16["teacher_top1_accuracy"],
            "operator": ">=",
            "passed": candidate_int16["teacher_top1_accuracy"]
            >= stable_int16["teacher_top1_accuracy"],
        },
        {
            "id": "absolute_float_to_int16_pair_delta",
            "observed": pair_delta,
            "absolute_limit": PAIR_DEGRADATION_LIMIT,
            "operator": "abs<=",
            "passed": abs(pair_delta) <= PAIR_DEGRADATION_LIMIT,
        },
        {
            "id": "absolute_float_to_int16_top1_delta",
            "observed": top1_delta,
            "absolute_limit": TOP1_DEGRADATION_LIMIT,
            "operator": "abs<=",
            "passed": abs(top1_delta) <= TOP1_DEGRADATION_LIMIT,
        },
    ]
    return {"checks": checks, "passed": all(check["passed"] for check in checks)}


def bind_candidate(receipt, winner):
    receipt["selected"] = {
        "slot_id": winner["slot_id"],
        "series": winner["series"],
        "seed": winner["seed"],
        "checkpoint_sha256": winner["checkpoint"]["sha256"],
        "export_sha256": winner["export"]["sha256"],
        "int16_selection_report_sha256": winner["int16_selection_report"][
            "sha256"
        ],
    }
    receipt["candidate_checkpoint"] = {
        "path": "ml/runs/wcsc36-selected/best-sibling.pt",
        "bytes": winner["checkpoint"]["bytes"],
        "sha256": winner["checkpoint"]["sha256"],
    }
    receipt["candidate_export"] = {
        "path": "public/eval/wcsc36-candidate.bin",
        "bytes": winner["export"]["bytes"],
        "sha256": winner["export"]["sha256"],
        "bucket_count": winner["export"]["bucket_count"],
    }
    receipt["int16_selection_report"] = {
        "path": "ml/runs/wcsc36-selected/selection-report.json",
        "bytes": winner["int16_selection_report"]["bytes"],
        "sha256": winner["int16_selection_report"]["sha256"],
    }
    candidate_int16 = {
        "within_parent_pair_accuracy": winner["int16_pair_accuracy"],
        "teacher_top1_accuracy": winner["int16_teacher_top1"],
        "value_mae_cp": winner["int16_value_mae_cp"],
    }
    candidate_float = {
        "within_parent_pair_accuracy": candidate_int16[
            "within_parent_pair_accuracy"
        ]
        + 0.001,
        "teacher_top1_accuracy": candidate_int16["teacher_top1_accuracy"]
        + 0.004,
        "value_mae_cp": max(0.0, candidate_int16["value_mae_cp"] - 1.0),
    }
    receipt["candidate_metrics"] = {
        "float": candidate_float,
        "int16": candidate_int16,
    }
    receipt["selection_gates"] = gate_proof(
        candidate_float, candidate_int16, receipt["stable"]["int16_metrics"]
    )


def valid_receipt():
    """Build self-asserted claims; this fixture is not evidence or authority."""
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
    receipt = {
        "schema": CANDIDATE_SELECTION_RECEIPT_SCHEMA,
        "run_plan": {
            "path": "ml/protocols/wcsc36-six-run-plan.json",
            "bytes": 400,
            "sha256": WCSC36_SIX_RUN_PLAN_SHA256,
            "schema": SIX_RUN_PLAN_SCHEMA,
        },
        "runs": runs,
        "selection_strategy": CANDIDATE_SELECTION_STRATEGY,
        "selection_metric_order": list(MODEL_SELECTION_METRIC_ORDER),
        "selection_tie_break": list(SELECTION_TIE_BREAK),
        "selection_audit": {
            "path": "ml/protocols/wcsc36-six-run-selection-audit.json",
            "bytes": 12345,
            "sha256": digest(500),
            "schema": SELECTION_AUDIT_SCHEMA,
        },
        "stable": {
            "checkpoint_sha256": WCSC36_STABLE_RUNOP1_SHA256,
            "int16_selection_report": {
                "path": "ml/runs/wcsc36-six-run/stable-int16-selection.json",
                "bytes": 999,
                "sha256": digest(999),
            },
            "int16_metrics": {
                "within_parent_pair_accuracy": 0.74,
                "teacher_top1_accuracy": 0.49,
                "value_mae_cp": 110.0,
            },
        },
    }
    bind_candidate(receipt, runs[1])
    return receipt


class CandidateSelectionProtocolTest(unittest.TestCase):
    def test_exact_six_run_receipt_selects_metric_then_fallback_winner(self):
        receipt = valid_receipt()
        winner = _decode_candidate_selection_receipt_untrusted(receipt).winner
        self.assertEqual(winner["slot_id"], "warm-seed-43")

        receipt["runs"][3]["int16_pair_accuracy"] = 0.76
        receipt["runs"][4]["int16_pair_accuracy"] = 0.77
        selected_run = receipt["runs"][3]
        bind_candidate(receipt, selected_run)
        winner = _decode_candidate_selection_receipt_untrusted(receipt).winner
        self.assertEqual(winner["slot_id"], "scratch-seed-42")

    def test_public_receipt_validator_never_unlocks_self_asserted_claims(self):
        with self.assertRaisesRegex(
            ValueError, "authorization is not implemented.*remains sealed"
        ):
            validate_candidate_selection_receipt(valid_receipt())

    def test_receipt_rejects_missing_run_and_extra_field(self):
        receipt = valid_receipt()
        receipt["runs"].pop()
        with self.assertRaisesRegex(ValueError, "exactly six runs"):
            _decode_candidate_selection_receipt_untrusted(receipt)

        receipt = valid_receipt()
        receipt["unexpected"] = True
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            _decode_candidate_selection_receipt_untrusted(receipt)

    def test_pure_selection_can_rank_runs_before_promotion_gates(self):
        receipt = valid_receipt()
        receipt["runs"][0]["int16_pair_accuracy"] = 0.61
        receipt["runs"][1]["int16_pair_accuracy"] = 0.60
        receipt["runs"][2]["int16_pair_accuracy"] = 0.59
        receipt["runs"][3]["int16_pair_accuracy"] = 0.58
        receipt["runs"][4]["int16_pair_accuracy"] = 0.57
        receipt["runs"][5]["int16_pair_accuracy"] = 0.56
        winner = select_sealed_candidate(receipt["runs"])
        self.assertEqual(winner["slot_id"], "warm-seed-43")

    def test_receipt_rejects_forged_winner_and_unsealed_stable(self):
        receipt = valid_receipt()
        forged = copy.deepcopy(receipt)
        forged["selected"]["seed"] = 42
        with self.assertRaisesRegex(ValueError, "winner"):
            _decode_candidate_selection_receipt_untrusted(forged)

        receipt["stable"]["checkpoint_sha256"] = receipt["candidate_checkpoint"][
            "sha256"
        ]
        with self.assertRaisesRegex(ValueError, "sealed runOp1"):
            _decode_candidate_selection_receipt_untrusted(receipt)

    def test_receipt_pins_plan_audit_schema_and_stable_report_identity(self):
        receipt = valid_receipt()
        receipt["run_plan"]["sha256"] = digest(400)
        with self.assertRaisesRegex(ValueError, "run-plan SHA-256"):
            _decode_candidate_selection_receipt_untrusted(receipt)

        receipt = valid_receipt()
        receipt["selection_audit"]["schema"] = "wrong-audit-schema"
        with self.assertRaisesRegex(ValueError, "audit schema"):
            _decode_candidate_selection_receipt_untrusted(receipt)

        receipt = valid_receipt()
        receipt["stable"]["int16_selection_report"]["sha256"] = receipt[
            "int16_selection_report"
        ]["sha256"]
        with self.assertRaisesRegex(ValueError, "report identities must differ"):
            _decode_candidate_selection_receipt_untrusted(receipt)

    def test_receipt_binds_every_run_export_and_int16_report_to_selected(self):
        receipt = valid_receipt()
        missing_run_export_field = copy.deepcopy(receipt)
        missing_run_export_field["runs"][0]["export"].pop("bucket_count")
        with self.assertRaisesRegex(ValueError, "fields are not exact"):
            _decode_candidate_selection_receipt_untrusted(missing_run_export_field)

        forged_selected_export = copy.deepcopy(receipt)
        forged_selected_export["selected"]["export_sha256"] = digest(777)
        with self.assertRaisesRegex(ValueError, "winner"):
            _decode_candidate_selection_receipt_untrusted(forged_selected_export)

        mismatched_report = copy.deepcopy(receipt)
        mismatched_report["int16_selection_report"]["sha256"] = digest(778)
        with self.assertRaisesRegex(ValueError, "selection report"):
            _decode_candidate_selection_receipt_untrusted(mismatched_report)

    def test_receipt_recomputes_exact_gate_checks_and_fixed_limits(self):
        receipt = valid_receipt()
        receipt["selection_gates"]["checks"][2]["absolute_limit"] = 0.003
        with self.assertRaisesRegex(ValueError, "not recomputable"):
            _decode_candidate_selection_receipt_untrusted(receipt)

        receipt = valid_receipt()
        receipt["selection_gates"]["checks"][0]["candidate"] += 0.001
        with self.assertRaisesRegex(ValueError, "not recomputable"):
            _decode_candidate_selection_receipt_untrusted(receipt)

        receipt = valid_receipt()
        receipt["selection_gates"]["passed"] = 1
        with self.assertRaisesRegex(ValueError, "passed must be true"):
            _decode_candidate_selection_receipt_untrusted(receipt)

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

        receipt = valid_receipt()
        candidate_float = {
            "within_parent_pair_accuracy": 0.6099488308828293,
            "teacher_top1_accuracy": 0.26099706744868034,
            "value_mae_cp": 486.6910572304545,
        }
        candidate_int16 = {
            "within_parent_pair_accuracy": 0.6072284474383056,
            "teacher_top1_accuracy": 0.26392961876832843,
            "value_mae_cp": 491.98977505112475,
        }
        stable_int16 = {
            "within_parent_pair_accuracy": 0.6048966902001425,
            "teacher_top1_accuracy": 0.2668621700879765,
            "value_mae_cp": 496.8903374233129,
        }
        for run in receipt["runs"]:
            run["int16_pair_accuracy"] = candidate_int16[
                "within_parent_pair_accuracy"
            ]
            run["int16_teacher_top1"] = candidate_int16[
                "teacher_top1_accuracy"
            ]
            run["int16_value_mae_cp"] = candidate_int16["value_mae_cp"]
        bind_candidate(receipt, receipt["runs"][1])
        receipt["candidate_metrics"] = {
            "float": candidate_float,
            "int16": candidate_int16,
        }
        receipt["stable"]["int16_metrics"] = stable_int16
        receipt["selection_gates"] = gate_proof(
            candidate_float, candidate_int16, stable_int16
        )
        with self.assertRaisesRegex(ValueError, "passed must be true"):
            _decode_candidate_selection_receipt_untrusted(receipt)

        forged = copy.deepcopy(receipt)
        forged["selection_gates"]["passed"] = True
        for check in forged["selection_gates"]["checks"]:
            check["passed"] = True
        with self.assertRaisesRegex(ValueError, "not recomputable"):
            _decode_candidate_selection_receipt_untrusted(forged)

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

    def test_selection_audit_requires_an_exact_pipeline_revision(self):
        with self.assertRaisesRegex(ValueError, "40-digit Git commit"):
            verify_audit_pipeline_revision("not-a-revision", "/unused")


if __name__ == "__main__":
    unittest.main()
