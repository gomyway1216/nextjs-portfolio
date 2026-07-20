from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
TEST_DIR = Path(__file__).resolve().parent
for directory in (ML_DIR, TEST_DIR):
    if str(directory) not in sys.path:
        sys.path.insert(0, str(directory))

import run_strength_first_fresh_final_teacher_preflight as SUBJECT  # noqa: E402
import strength_first_qat_selection_evaluator as SELECTION  # noqa: E402
from test_strength_first_qat_selection_evaluator import (  # noqa: E402
    ReadyHarness,
    canonical,
    synthetic_blocked_registry,
)


def enroll_publication(harness: ReadyHarness, result: dict) -> None:
    publication_result = json.loads(harness.publications[2][1])
    harness.registry["status"] = (
        SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS
    )
    harness.registry["gates"] = copy.deepcopy(SELECTION._PUBLICATION_ENROLLED_GATES)
    harness.registry["nonclaims"] = copy.deepcopy(
        SELECTION._PUBLICATION_ENROLLED_NONCLAIMS
    )
    enrollments = harness.registry["enrollments"]
    enrollments["selection_evaluation_origin_registry"] = copy.deepcopy(
        publication_result["evaluation_origin_registry"]
    )
    enrollments["selection_evaluation_report"] = copy.deepcopy(
        result["evaluation_report"]
    )
    enrollments["selection_receipt"] = copy.deepcopy(result["publication"])
    enrollments["selection_publication_result"] = copy.deepcopy(result["completion"])
    harness.refresh_registry_bytes()


class FreshFinalTeacherSelectionPreflightTests(unittest.TestCase):
    def test_non_enrolled_registry_stops_before_receipt_read(self):
        registry_path = (
            REPO_ROOT
            / SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
        )
        registry_raw = canonical(synthetic_blocked_registry())
        reads = []
        private_reads = []
        tracked = []

        def read_bytes(path: str) -> bytes:
            reads.append(path)
            if Path(path) != registry_path:
                self.fail(f"blocked preflight read unexpected path: {path}")
            return registry_raw

        dependencies = SUBJECT._Dependencies(
            read_bytes=read_bytes,
            verify_tracked=lambda path, _raw: tracked.append(path),
            read_private_artifact=lambda path: (
                private_reads.append(path),
                self.fail("blocked preflight read a private selection publication"),
            )[1],
            replay_evaluation=lambda **_kwargs: self.fail(
                "blocked preflight replayed the evaluator"
            ),
        )
        with self.assertRaisesRegex(
            SUBJECT.FreshFinalTeacherPreflightBlocked,
            "not enrolled and replay-ready",
        ):
            SUBJECT.run_strength_first_fresh_final_teacher_preflight_core(
                repo_root=str(REPO_ROOT),
                home_root="/must-not-be-used",
                dependencies=dependencies,
            )
        self.assertEqual(reads, [str(registry_path)])
        self.assertEqual(tracked, [str(registry_path)])
        self.assertEqual(private_reads, [])

    def test_ready_registry_recomputes_receipt_without_downstream_registry(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            evaluator_result = harness.run()
            enroll_publication(harness, evaluator_result)
            receipt_raw = evaluator_result["publication"]["bytes"]
            self.assertGreater(receipt_raw, 0)
            downstream_registry_path = str(
                REPO_ROOT / "ml/protocols/"
                "floodgate-q1-2026-strength-first-downstream-gates-registry.json"
            )
            reads = []

            def read_bytes(path: str) -> bytes:
                reads.append(path)
                if path == downstream_registry_path:
                    self.fail("fresh-final preflight read the downstream registry")
                return harness.read_bytes(path)

            summary = SUBJECT.run_strength_first_fresh_final_teacher_preflight_core(
                repo_root=str(REPO_ROOT),
                home_root=temporary,
                dependencies=SUBJECT._Dependencies(
                    read_bytes=read_bytes,
                    verify_tracked=harness.verify_tracked,
                    read_private_artifact=harness.read_bytes,
                    replay_evaluation=harness.evaluate,
                ),
            )
            self.assertEqual(summary["status"], SUBJECT.SUMMARY_STATUS)
            self.assertEqual(summary["selected_seed"], 43)
            self.assertEqual(
                summary["selected_checkpoint"]["sha256"],
                evaluator_result["receipt"]["selected"]["checkpoint"]["sha256"],
            )
            self.assertEqual(summary["selection_receipt_reads"], 1)
            self.assertEqual(summary["selection_evaluation_report_reads"], 1)
            self.assertEqual(summary["selection_publication_result_reads"], 1)
            self.assertEqual(summary["selection_dataset_reads"], 1)
            self.assertEqual(summary["selection_checkpoint_evaluations"], 4)
            self.assertFalse(summary["fresh_final_source_opened"])
            self.assertEqual(summary["fresh_final_label_reads"], 0)
            self.assertNotIn(downstream_registry_path, reads)

    def test_rejects_a_tampered_receipt_before_recomputed_run_gate(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            result = harness.run()
            enroll_publication(harness, result)
            receipt = copy.deepcopy(result["receipt"])
            receipt["runs"][0]["gates"]["passed"] = False
            raw = canonical(receipt)
            with self.assertRaisesRegex(ValueError, "identity is not enrolled"):
                SUBJECT.build_fresh_final_teacher_selection_preflight(
                    registry=harness.registry,
                    registry_raw=canonical(harness.registry),
                    evaluation_report=harness.report,
                    evaluation_report_raw=canonical(harness.report),
                    receipt=receipt,
                    receipt_raw=raw,
                    publication_result=json.loads(harness.publications[2][1]),
                    publication_result_raw=harness.publications[2][1],
                    replayed_evaluation_report=harness.report,
                )

    def test_self_consistent_forged_metric_bundle_fails_deterministic_replay(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            result = harness.run()
            enroll_publication(harness, result)
            original_receipt = result["receipt"]
            forged_report = copy.deepcopy(harness.report)
            for field in ("float", "quantized_int16"):
                left = copy.deepcopy(forged_report["models"][1][field])
                forged_report["models"][1][field] = copy.deepcopy(
                    forged_report["models"][2][field]
                )
                forged_report["models"][2][field] = left
            preflight_projection = {
                "schema": SELECTION.PREFLIGHT.STRENGTH_FIRST_QAT_SELECTION_PREFLIGHT_SCHEMA,
                "training_plan": copy.deepcopy(original_receipt["training_plan"]),
                "training_pipeline": copy.deepcopy(
                    original_receipt["checkpoint_preflight"]["training_pipeline"]
                ),
                "runs": [
                    {
                        "slot_id": run["slot_id"],
                        "seed": run["seed"],
                        "output": (
                            f"{SELECTION.BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/"
                            f"seed-{run['seed']}"
                        ),
                        "result": copy.deepcopy(run["result"]),
                        "checkpoint": copy.deepcopy(run["checkpoint"]),
                        "checkpoint_metadata": {
                            "schema": (
                                SELECTION.BRIDGE.STRENGTH_FIRST_QAT_FINAL_CHECKPOINT_SCHEMA
                            ),
                            "epoch": 20,
                        },
                    }
                    for run in original_receipt["runs"]
                ],
            }
            forged_receipt = SELECTION._validate_report_and_build_receipt(
                forged_report,
                registry=harness.registry,
                preflight_projection=preflight_projection,
                completion=original_receipt["selection_teacher"]["completion"],
            )
            self.assertEqual(forged_receipt["selected"]["seed"], 42)

            def identity(path: str, raw: bytes, schema: str) -> dict:
                return {
                    "path": path,
                    "bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "schema": schema,
                }

            report_raw = canonical(forged_report)
            report_identity = identity(
                SELECTION.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH,
                report_raw,
                SELECTION.ADAPTER.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_SCHEMA,
            )
            receipt_raw = canonical(forged_receipt)
            receipt_identity = identity(
                SELECTION.STRENGTH_FIRST_SELECTION_RECEIPT_PATH,
                receipt_raw,
                SELECTION.STRENGTH_FIRST_CANDIDATE_SELECTION_RECEIPT_SCHEMA,
            )
            publication_result = {
                "schema": SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
                "status": (
                    SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_STATUS
                ),
                "evaluation_origin_registry": copy.deepcopy(
                    harness.registry["enrollments"][
                        "selection_evaluation_origin_registry"
                    ]
                ),
                "evaluation_report": report_identity,
                "selection_receipt": receipt_identity,
                "selected_seed": 42,
                "selected_checkpoint": copy.deepcopy(
                    forged_receipt["selected"]["checkpoint"]
                ),
                "boundary": copy.deepcopy(SELECTION._PUBLICATION_RESULT_BOUNDARY),
            }
            publication_result_raw = canonical(publication_result)
            publication_result_identity = identity(
                SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_PATH,
                publication_result_raw,
                SELECTION.STRENGTH_FIRST_SELECTION_PUBLICATION_RESULT_SCHEMA,
            )
            harness.registry["enrollments"][
                "selection_evaluation_report"
            ] = report_identity
            harness.registry["enrollments"]["selection_receipt"] = receipt_identity
            harness.registry["enrollments"][
                "selection_publication_result"
            ] = publication_result_identity
            with self.assertRaisesRegex(ValueError, "deterministic replay"):
                SUBJECT.build_fresh_final_teacher_selection_preflight(
                    registry=harness.registry,
                    registry_raw=canonical(harness.registry),
                    evaluation_report=forged_report,
                    evaluation_report_raw=report_raw,
                    receipt=forged_receipt,
                    receipt_raw=receipt_raw,
                    publication_result=publication_result,
                    publication_result_raw=publication_result_raw,
                    replayed_evaluation_report=harness.report,
                )

    def test_terminal_registry_rejects_an_arbitrary_ready_origin_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            result = harness.run()
            enroll_publication(harness, result)
            forged = copy.deepcopy(harness.registry)
            forged["enrollments"]["selection_evaluation_origin_registry"]["sha256"] = (
                hashlib.sha256(b"arbitrary-ready-origin").hexdigest()
            )
            with self.assertRaisesRegex(ValueError, "exact READY preimage"):
                SELECTION.validate_strength_first_selection_evaluator_registry_data(
                    forged
                )

    def test_cli_arguments_stop_without_running_preflight(self):
        output = []
        original = sys.stdout

        class _Stdout:
            class _Buffer:
                def write(self, value):
                    output.append(value)

            buffer = _Buffer()

        try:
            sys.stdout = _Stdout()
            self.assertEqual(SUBJECT.main(["--receipt", "/tmp/other"]), 2)
        finally:
            sys.stdout = original
        value = json.loads(b"".join(output))
        self.assertEqual(value["status"], "STOP")
        self.assertEqual(value["reason"], "arguments-forbidden")
        self.assertEqual(value["selection_evaluator_registry_reads"], 0)
        self.assertEqual(value["selection_receipt_reads"], 0)
        self.assertEqual(value["fresh_final_source_reads"], 0)

        output.clear()
        try:
            sys.stdout = _Stdout()
            with mock.patch.object(
                SUBJECT,
                "run_strength_first_fresh_final_teacher_preflight",
                side_effect=SUBJECT.FreshFinalTeacherPreflightBlocked("closed"),
            ):
                self.assertEqual(SUBJECT.main([]), 2)
        finally:
            sys.stdout = original
        value = json.loads(b"".join(output))
        self.assertEqual(value["reason"], "selected-candidate-receipt-not-ready")
        self.assertEqual(value["selection_evaluator_registry_reads"], 1)
        self.assertEqual(value["selection_receipt_reads"], 0)


if __name__ == "__main__":
    unittest.main()
