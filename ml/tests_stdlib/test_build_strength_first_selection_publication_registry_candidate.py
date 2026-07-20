from __future__ import annotations

import copy
import hashlib
import io
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

import build_strength_first_selection_publication_registry_candidate as SUBJECT  # noqa: E402
import strength_first_qat_selection_evaluator as EVALUATOR  # noqa: E402
from test_strength_first_qat_selection_evaluator import (  # noqa: E402
    ReadyHarness,
    canonical,
)


def dependencies(
    harness: ReadyHarness,
    *,
    read_bytes=None,
    replay_evaluation=None,
) -> SUBJECT._Dependencies:
    return SUBJECT._Dependencies(
        read_bytes=harness.read_bytes if read_bytes is None else read_bytes,
        verify_tracked=harness.verify_tracked,
        read_private_artifact=harness.read_bytes,
        replay_evaluation=(
            harness.evaluate
            if replay_evaluation is None
            else replay_evaluation
        ),
    )


def build(
    harness: ReadyHarness,
    *,
    read_bytes=None,
    replay_evaluation=None,
) -> dict:
    return SUBJECT.build_strength_first_selection_publication_registry_candidate_core(
        repo_root=str(REPO_ROOT),
        home_root=str(harness.home_root),
        dependencies=dependencies(
            harness,
            read_bytes=read_bytes,
            replay_evaluation=replay_evaluation,
        ),
    )


class SelectionPublicationRegistryCandidateTests(unittest.TestCase):
    def test_public_evidence_matches_source_and_keeps_real_counts_zero(self):
        evidence = json.loads(
            (
                REPO_ROOT
                / "docs/data/"
                "floodgate-strength-first-selection-publication-registry-"
                "candidate-2026-07-20.json"
            ).read_text(encoding="utf-8")
        )
        source = evidence["implementation"]["source"]
        raw = (REPO_ROOT / source["path"]).read_bytes()
        self.assertEqual(source["bytes"], len(raw))
        self.assertEqual(source["sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(
            evidence["binding_contract"]["deterministic_replay_models"],
            ["stable", "seed-42", "seed-43", "seed-44"],
        )
        self.assertEqual(evidence["boundary"]["fresh_final_source_reads"], 0)
        self.assertEqual(evidence["boundary"]["downstream_registry_reads"], 0)
        self.assertEqual(evidence["boundary"]["live_weight_writes"], 0)
        self.assertTrue(
            all(
                value == 0
                for value in evidence[
                    "observed_real_counts_at_publication"
                ].values()
            )
        )
        for article in evidence["articles"].values():
            article_path = (
                REPO_ROOT / "docs/data" / article
            ).resolve()
            text = article_path.read_text(encoding="utf-8")
            self.assertNotIn("/Users/", text)
            self.assertNotIn("high-dan achieved", text)
            self.assertNotIn("高段になった", text)

    def test_ready_publication_builds_exact_terminal_candidate_without_downstream_read(
        self,
    ):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            result = harness.run()
            reads = []
            forbidden = (
                "strength-first-downstream-gates-registry",
                "fresh-final-holdout",
                "fresh-final-teacher",
            )

            def read_bytes(path: str) -> bytes:
                reads.append(path)
                if any(item in path for item in forbidden):
                    self.fail(f"terminal builder read downstream path: {path}")
                return harness.read_bytes(path)

            candidate = build(harness, read_bytes=read_bytes)
            self.assertEqual(
                candidate["status"],
                EVALUATOR.STRENGTH_FIRST_SELECTION_PUBLICATION_ENROLLED_STATUS,
            )
            enrollments = candidate["enrollments"]
            ready_raw = canonical(harness.registry)
            self.assertEqual(
                enrollments["selection_evaluation_origin_registry"],
                {
                    "path": (
                        EVALUATOR
                        .STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_RELATIVE_PATH
                    ),
                    "bytes": len(ready_raw),
                    "sha256": hashlib.sha256(ready_raw).hexdigest(),
                    "schema": (
                        EVALUATOR
                        .STRENGTH_FIRST_SELECTION_EVALUATOR_REGISTRY_SCHEMA
                    ),
                },
            )
            self.assertEqual(
                enrollments["selection_evaluation_report"],
                result["evaluation_report"],
            )
            self.assertEqual(
                enrollments["selection_receipt"],
                result["publication"],
            )
            self.assertEqual(
                enrollments["selection_publication_result"],
                result["completion"],
            )
            self.assertEqual(len(harness.evaluations), 2)
            self.assertEqual(
                len(harness.evaluations[-1]["checkpoint_specs"]),
                4,
            )
            self.assertEqual(len(harness.publications), 3)
            self.assertFalse(any(any(item in path for item in forbidden) for path in reads))
            serialized = (
                SUBJECT
                .serialize_strength_first_selection_publication_registry_candidate(
                    candidate
                )
            )
            self.assertTrue(serialized.endswith(b"\n"))
            self.assertEqual(json.loads(serialized), candidate)

    def test_tampered_or_swapped_publication_fails_closed(self):
        for mutation in ("tampered-report", "swapped-report-receipt"):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as temporary:
                harness = ReadyHarness(temporary)
                harness.run()
                report_path = harness.home_root / (
                    EVALUATOR.STRENGTH_FIRST_SELECTION_EVALUATION_REPORT_PATH
                )
                receipt_path = harness.home_root / (
                    EVALUATOR.STRENGTH_FIRST_SELECTION_RECEIPT_PATH
                )
                report_raw = harness.files[harness._key(report_path)]
                receipt_raw = harness.files[harness._key(receipt_path)]
                if mutation == "tampered-report":
                    report = json.loads(report_raw)
                    report["models"][1]["float"]["value_mae_cp"] += 1.0
                    harness._put(report_path, canonical(report))
                else:
                    harness._put(report_path, receipt_raw)
                    harness._put(receipt_path, report_raw)
                with self.assertRaises(ValueError):
                    build(harness)
                self.assertEqual(len(harness.publications), 3)

    def test_deterministic_four_model_replay_mismatch_fails(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            harness.run()

            def mismatched_replay(**_kwargs):
                report = copy.deepcopy(harness.report)
                left = copy.deepcopy(report["models"][1])
                report["models"][1] = copy.deepcopy(report["models"][2])
                report["models"][2] = left
                return report

            with self.assertRaisesRegex(ValueError, "deterministic replay"):
                build(harness, replay_evaluation=mismatched_replay)
            self.assertEqual(len(harness.publications), 3)

    def test_terminal_input_is_an_exact_idempotent_recomputation(self):
        with tempfile.TemporaryDirectory() as temporary:
            harness = ReadyHarness(temporary)
            harness.run()
            first = build(harness)
            harness.registry = copy.deepcopy(first)
            harness.refresh_registry_bytes()
            second = build(harness)
            self.assertEqual(second, first)
            self.assertEqual(len(harness.publications), 3)

            harness.registry["enrollments"]["selection_receipt"][
                "sha256"
            ] = hashlib.sha256(b"replayed-terminal").hexdigest()
            harness.refresh_registry_bytes()
            with self.assertRaises(ValueError):
                build(harness)

    def test_cli_emits_only_the_candidate_to_stdout(self):
        class Stdout:
            def __init__(self):
                self.buffer = io.BytesIO()

        stdout = Stdout()

        def fake_build(*, _candidate_consumer):
            candidate = {"terminal": True}
            _candidate_consumer(candidate)
            return candidate

        with mock.patch.object(sys, "stdout", stdout), mock.patch.object(
            SUBJECT,
            "build_strength_first_selection_publication_registry_candidate",
            side_effect=fake_build,
        ), mock.patch.object(
            SUBJECT,
            "serialize_strength_first_selection_publication_registry_candidate",
            return_value=b'{"terminal":true}\n',
        ):
            self.assertEqual(SUBJECT.main([]), 0)
        self.assertEqual(stdout.buffer.getvalue(), b'{"terminal":true}\n')

        with mock.patch.object(
            SUBJECT,
            "build_strength_first_selection_publication_registry_candidate",
        ) as blocked_build:
            self.assertEqual(SUBJECT.main(["--write"]), 2)
            blocked_build.assert_not_called()


if __name__ == "__main__":
    unittest.main()
