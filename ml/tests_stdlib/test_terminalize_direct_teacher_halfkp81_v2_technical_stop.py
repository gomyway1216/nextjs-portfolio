from __future__ import annotations

from contextlib import ExitStack
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = ML_DIR.parent
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import direct_teacher_halfkp81_v2_protocol as PROTOCOL  # noqa: E402
import terminalize_direct_teacher_halfkp81_v2_technical_stop as TERM  # noqa: E402


def _identity(path: Path, *, schema: str | None = None) -> dict:
    raw = path.read_bytes()
    value = {
        "path": str(path.resolve()),
        "bytes": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }
    if schema is not None:
        value["schema"] = schema
    return value


class AttemptFixture:
    def __init__(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.run_root = self.root / "spent-attempt"
        self.output_directory = self.run_root / "trainer-output"
        self.claim_root = self.root / "claims"
        self.terminal_path = self.root / "terminal" / "result.json"
        self.run_root.mkdir(mode=0o700)
        self.output_directory.mkdir(mode=0o700)
        self.claim_root.mkdir(mode=0o700)

        self.plan_path = self.run_root / "execution-plan.json"
        self.log_path = self.run_root / "trainer.log"
        self.initializer_path = self.output_directory / "initializer-weights.bin"
        self.live_path = self.root / "live-weights.bin"
        self.claim_path = self.claim_root / "claim.json"

        self.initializer_path.write_bytes(b"frozen-initializer-export")
        self.live_path.write_bytes(b"immutable-live")
        self.log_path.write_bytes(
            (
                "[direct-teacher-halfkp81-v2] STOP: The operator "
                "'aten::_embedding_bag' is not currently implemented for the "
                "MPS device. Set PYTORCH_ENABLE_MPS_FALLBACK=1 only as a "
                "temporary fallback.\n"
            ).encode()
        )
        self.plan = {
            "schema": TERM.EXECUTION_PLAN_SCHEMA,
            "status": "pilot-data-bound-training-not-started",
            "training": {
                "device": "mps",
                "candidate_count": 1,
                "epochs": 1,
                "seed": 42,
            },
            "inputs": {
                "live_weights": {
                    **_identity(self.live_path),
                    "role": "immutable-live-baseline-never-writable",
                }
            },
        }
        self.plan_path.write_bytes(PROTOCOL.canonical_json_bytes(self.plan))
        self.plan_identity = _identity(
            self.plan_path,
            schema=TERM.EXECUTION_PLAN_SCHEMA,
        )
        self.claim = {
            "schema": TERM.CLAIM_SCHEMA,
            "status": "exclusive-one-shot-claimed-no-retry",
            "owner": {
                "kind": "direct-teacher-halfkp81-v2-one-shot-trainer",
                "pid": 123,
                "pipeline_revision": TERM.PIPELINE_REVISION,
            },
            "execution_plan": self.plan_identity,
            "output_path": str(self.output_directory.resolve()),
            "live_weight_write_authorized": False,
        }
        self.claim_path.write_bytes(PROTOCOL.canonical_json_bytes(self.claim))

    def close(self) -> None:
        self.temporary.cleanup()

    def patches(self) -> ExitStack:
        stack = ExitStack()
        values = {
            "RUN_ROOT": self.run_root.resolve(),
            "CLAIM_PATH": self.claim_path.resolve(),
            "EXECUTION_PLAN_PATH": self.plan_path.resolve(),
            "FAILURE_LOG_PATH": self.log_path.resolve(),
            "OUTPUT_DIRECTORY": self.output_directory.resolve(),
            "INITIALIZER_EXPORT_PATH": self.initializer_path.resolve(),
            "LIVE_WEIGHTS_PATH": self.live_path.resolve(),
            "TERMINAL_RESULT_PATH": self.terminal_path.resolve(),
            "EXPECTED_CLAIM": _identity(
                self.claim_path,
                schema=TERM.CLAIM_SCHEMA,
            ),
            "EXPECTED_EXECUTION_PLAN": self.plan_identity,
            "EXPECTED_FAILURE_LOG": _identity(self.log_path),
            "EXPECTED_INITIALIZER_EXPORT": _identity(self.initializer_path),
            "EXPECTED_LIVE_WEIGHTS": _identity(self.live_path),
        }
        for name, value in values.items():
            stack.enter_context(mock.patch.object(TERM, name, value))
        return stack


class DirectTeacherHalfkp81V2TechnicalStopTests(unittest.TestCase):
    def setUp(self) -> None:
        self.attempt = AttemptFixture()
        self.addCleanup(self.attempt.close)

    def test_terminalizes_exact_spent_attempt_without_mutating_old_files(self) -> None:
        protected = {
            path: path.read_bytes()
            for path in (
                self.attempt.claim_path,
                self.attempt.plan_path,
                self.attempt.log_path,
                self.attempt.initializer_path,
                self.attempt.live_path,
            )
        }
        with self.attempt.patches():
            result = TERM.terminalize(out_path=self.attempt.terminal_path)
            raw = self.attempt.terminal_path.read_bytes()
            receipt = PROTOCOL.strict_json_bytes(raw, "test terminal receipt")
            validated = TERM.validate_terminal_receipt(receipt)

        self.assertEqual(result["status"], TERM.STATUS)
        self.assertEqual(validated["observed_state"]["optimizer_steps"], 0)
        self.assertFalse(validated["authority"]["candidate_created"])
        self.assertEqual(
            result["receipt"]["sha256"],
            hashlib.sha256(raw).hexdigest(),
        )
        self.assertEqual(
            {path: path.read_bytes() for path in protected},
            protected,
        )
        self.assertEqual(
            list(self.attempt.output_directory.iterdir()),
            [self.attempt.initializer_path],
        )

    def test_existing_terminal_receipt_is_never_overwritten(self) -> None:
        with self.attempt.patches():
            TERM.terminalize(out_path=self.attempt.terminal_path)
            original = self.attempt.terminal_path.read_bytes()
            with self.assertRaisesRegex(
                TERM.TechnicalStopError,
                "already exists",
            ):
                TERM.terminalize(out_path=self.attempt.terminal_path)
        self.assertEqual(self.attempt.terminal_path.read_bytes(), original)

    def test_tampered_failure_log_stops_before_publication(self) -> None:
        with self.attempt.patches():
            self.attempt.log_path.write_bytes(b"tampered\n")
            with self.assertRaisesRegex(
                TERM.TechnicalStopError,
                "log identity differs",
            ):
                TERM.terminalize(out_path=self.attempt.terminal_path)
        self.assertFalse(self.attempt.terminal_path.exists())

    def test_claim_must_bind_the_exact_execution_plan(self) -> None:
        changed = copy.deepcopy(self.attempt.claim)
        changed["execution_plan"]["sha256"] = "f" * 64
        self.attempt.claim_path.write_bytes(PROTOCOL.canonical_json_bytes(changed))
        with (
            self.attempt.patches(),
            mock.patch.object(
                TERM,
                "EXPECTED_CLAIM",
                _identity(self.attempt.claim_path, schema=TERM.CLAIM_SCHEMA),
            ),
            self.assertRaisesRegex(
                TERM.TechnicalStopError,
                "one-shot claim binding differs",
            ),
        ):
            TERM.terminalize(out_path=self.attempt.terminal_path)
        self.assertFalse(self.attempt.terminal_path.exists())

    def test_any_candidate_or_partial_output_refuses_terminalization(self) -> None:
        extra = self.attempt.output_directory / "candidate-weights.bin"
        extra.write_bytes(b"partial")
        with (
            self.attempt.patches(),
            self.assertRaisesRegex(
                TERM.TechnicalStopError,
                "output entries differ",
            ),
        ):
            TERM.terminalize(out_path=self.attempt.terminal_path)
        self.assertEqual(extra.read_bytes(), b"partial")
        self.assertFalse(self.attempt.terminal_path.exists())

    def test_receipt_validator_rejects_nonzero_training_counter(self) -> None:
        with self.attempt.patches():
            receipt = TERM._authenticate_attempt()
            receipt["observed_state"]["training_rows"] = 1
            with self.assertRaisesRegex(
                TERM.TechnicalStopError,
                "differs from fixed evidence",
            ):
                TERM.validate_terminal_receipt(receipt)

    def test_atomic_publication_cleans_temporary_after_link_failure(self) -> None:
        with (
            self.attempt.patches(),
            mock.patch.object(os, "link", side_effect=OSError("injected link failure")),
            self.assertRaisesRegex(OSError, "injected link failure"),
        ):
            TERM.terminalize(out_path=self.attempt.terminal_path)
        self.assertFalse(self.attempt.terminal_path.exists())
        self.assertEqual(
            list(self.attempt.terminal_path.parent.glob(".*.tmp")),
            [],
        )

    def test_arbitrary_terminal_path_is_rejected_before_any_write(self) -> None:
        arbitrary = self.attempt.root / "elsewhere" / "result.json"
        with (
            self.attempt.patches(),
            self.assertRaisesRegex(
                TERM.TechnicalStopError,
                "path differs",
            ),
        ):
            TERM.terminalize(out_path=arbitrary)
        self.assertFalse(arbitrary.exists())

    def test_tracked_data_memo_matches_the_authoritative_constants(self) -> None:
        memo_path = (
            REPO_ROOT
            / "docs"
            / "data"
            / "shogi-direct-teacher-halfkp81-v2-technical-stop-2026-07-29.json"
        )
        memo = json.loads(memo_path.read_text(encoding="utf-8"))
        self.assertEqual(
            memo["attempt"]["claim"]["bytes"], TERM.EXPECTED_CLAIM["bytes"]
        )
        self.assertEqual(
            memo["attempt"]["claim"]["sha256"],
            TERM.EXPECTED_CLAIM["sha256"],
        )
        self.assertEqual(
            memo["attempt"]["execution_plan"]["sha256"],
            TERM.EXPECTED_EXECUTION_PLAN["sha256"],
        )
        self.assertEqual(
            memo["failure"]["log"]["sha256"],
            TERM.EXPECTED_FAILURE_LOG["sha256"],
        )
        self.assertEqual(
            memo["artifacts"]["initializer_export"]["sha256"],
            TERM.EXPECTED_INITIALIZER_EXPORT["sha256"],
        )
        self.assertEqual(
            memo["artifacts"]["live_weights"]["sha256"],
            TERM.EXPECTED_LIVE_WEIGHTS["sha256"],
        )
        self.assertEqual(
            memo["terminalization"]["fixed_path"],
            str(TERM.TERMINAL_RESULT_PATH),
        )
        self.assertEqual(memo["status"], "published-technical-stop-before-optimizer")
        self.assertEqual(
            memo["terminalization"]["publication"],
            {
                "status": "published-create-only-and-read-only-verified",
                "terminalizer_revision": (
                    "3034d3616f6279643847771617e654e7c4bc2afe"
                ),
                "bytes": 2453,
                "sha256": (
                    "8474df3f8590f4bb537ff261c049c2a59e0b71157161b66c8a6f58662b1226c3"
                ),
                "mtime_ns": 1785381685324051497,
                "mtime_utc": "2026-07-30T03:21:25.324051+00:00",
                "mode": "0600",
                "fresh_reauthentication_equal": True,
                "protected_input_bytes_and_mtimes_unchanged": True,
            },
        )
        self.assertFalse(memo["decision"]["old_execution_plan_retry_authorized"])


if __name__ == "__main__":
    unittest.main()
