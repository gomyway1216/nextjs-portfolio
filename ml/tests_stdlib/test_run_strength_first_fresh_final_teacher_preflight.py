from __future__ import annotations

import copy
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
)


class FreshFinalTeacherSelectionPreflightTests(unittest.TestCase):
    def test_checked_in_closed_registry_stops_before_receipt_read(self):
        registry_path = (
            REPO_ROOT
            / SELECTION.STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
        )
        registry_raw = registry_path.read_bytes()
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
            read_private_receipt=lambda path: (
                private_reads.append(path),
                self.fail("blocked preflight read the private selection receipt"),
            )[1],
        )
        with self.assertRaisesRegex(
            SUBJECT.FreshFinalTeacherPreflightBlocked,
            "not enrolled and ready",
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
            receipt_raw = evaluator_result["publication"]["bytes"]
            self.assertGreater(receipt_raw, 0)
            published_raw = harness.publications[0][1]
            downstream_registry_path = str(
                REPO_ROOT
                / "ml/protocols/"
                "floodgate-q1-2026-strength-first-downstream-gates-registry.json"
            )
            reads = []

            def read_bytes(path: str) -> bytes:
                reads.append(path)
                if path == downstream_registry_path:
                    self.fail("fresh-final preflight read the downstream registry")
                return harness.read_bytes(path)

            summary = (
                SUBJECT.run_strength_first_fresh_final_teacher_preflight_core(
                    repo_root=str(REPO_ROOT),
                    home_root=temporary,
                    dependencies=SUBJECT._Dependencies(
                        read_bytes=read_bytes,
                        verify_tracked=harness.verify_tracked,
                        read_private_receipt=lambda _path: published_raw,
                    ),
                )
            )
            self.assertEqual(summary["status"], SUBJECT.SUMMARY_STATUS)
            self.assertEqual(summary["selected_seed"], 43)
            self.assertEqual(
                summary["selected_checkpoint"]["sha256"],
                evaluator_result["receipt"]["selected"]["checkpoint"]["sha256"],
            )
            self.assertEqual(summary["selection_receipt_reads"], 1)
            self.assertEqual(summary["selection_dataset_reads"], 0)
            self.assertFalse(summary["fresh_final_source_opened"])
            self.assertEqual(summary["fresh_final_label_reads"], 0)
            self.assertNotIn(downstream_registry_path, reads)

    def test_rejects_a_tampered_recomputed_run_gate(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            result = harness.run()
            receipt = copy.deepcopy(result["receipt"])
            receipt["runs"][0]["gates"]["passed"] = False
            raw = canonical(receipt)
            with self.assertRaisesRegex(ValueError, "gates are not recomputable"):
                SUBJECT.build_fresh_final_teacher_selection_preflight(
                    registry=harness.registry,
                    registry_raw=canonical(harness.registry),
                    receipt=receipt,
                    receipt_raw=raw,
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
