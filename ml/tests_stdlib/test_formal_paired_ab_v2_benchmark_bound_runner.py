from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))
if str(Path(__file__).resolve().parent) not in sys.path:
    sys.path.insert(0, str(Path(__file__).resolve().parent))

import formal_paired_ab_local_launcher as legacy  # noqa: E402
import formal_paired_ab_v2_benchmark_bound_runner as runner  # noqa: E402
import formal_paired_ab_v2_worker_benchmark_bridge as bridge  # noqa: E402
from test_formal_paired_ab_local_launcher import ReadyFixture  # noqa: E402
from test_formal_paired_ab_v2_wasm_match_launcher import (  # noqa: E402
    passing_pair_receipt,
)


class FormalPairedAbV2BenchmarkBoundRunnerTest(unittest.TestCase):
    def _run_cli(self, arguments, run, analyze):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = runner._main_core_for_tests(arguments, run, analyze)
        return code, stdout.getvalue(), stderr.getvalue()

    def test_cli_rejects_arguments_before_the_fixed_runner(self):
        run = mock.Mock()
        analyze = mock.Mock()
        code, stdout, stderr = self._run_cli(
            ["--registry", "caller-selected.json"], run, analyze
        )
        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(
            json.loads(stderr),
            {
                "schema": runner.FORMAL_CLI_RECEIPT_SCHEMA,
                "status": "STOP",
                "reason": "arguments-forbidden",
                "public_analysis_emitted": False,
                "production_weight_write_authorized": False,
            },
        )
        run.assert_not_called()
        analyze.assert_not_called()

    def test_cli_reports_the_current_closed_pin_only_on_stderr(self):
        def blocked():
            raise bridge.FormalAbV2WorkerBenchmarkBlocked("closed")

        analyze = mock.Mock()
        code, stdout, stderr = self._run_cli([], blocked, analyze)
        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(json.loads(stderr)["reason"], "formal-ready-registry-blocked")
        analyze.assert_not_called()

    def test_cli_emits_only_the_validated_public_analysis(self):
        private_result = {"pairs": [{"private": "must-not-reach-stdout"}]}
        public_analysis = {
            "schema": "shogi-floodgate-formal-paired-ab-analysis-v2",
            "experiment_id": "sha256:" + "1" * 64,
            "run_id": "sha256:" + "2" * 64,
            "attempt_index": 0,
            "attempt_ledger_sha256": "3" * 64,
            "rerun_authorization_sha256": None,
            "candidate_weights_sha256": "4" * 64,
            "stable_weights_sha256": "5" * 64,
            "match_binding_sha256": "6" * 64,
            "technical_fault_count": 0,
            "protocol_amendment_sha256": "7" * 64,
            "counts": {"pairs": 384, "games": 768},
            "point_score_rate": {
                "numerator": 800,
                "denominator": 1536,
                "decimal": 800 / 1536,
            },
            "bootstrap": {"public": True},
            "gates": {"formal_ab_passed": True},
            "authority": {
                "promotion_authorized": False,
                "production_weight_write_authorized": False,
            },
            "nonclaims": {
                "strength_improved": False,
                "high_dan_calibrated": False,
            },
        }
        analyze = mock.Mock(return_value=public_analysis)
        code, stdout, stderr = self._run_cli([], lambda: private_result, analyze)
        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        self.assertEqual(json.loads(stdout), public_analysis)
        self.assertNotIn("must-not-reach-stdout", stdout)
        analyze.assert_called_once_with(private_result)

    def test_cli_fails_closed_when_analysis_is_not_aggregate_only(self):
        invalid = {
            "schema": "shogi-floodgate-formal-paired-ab-analysis-v2",
            "pairs": [],
        }
        code, stdout, stderr = self._run_cli(
            [], lambda: {"private": True}, lambda _result: invalid
        )
        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(json.loads(stderr)["reason"], "formal-run-failed-closed")

    def test_production_api_is_argumentless_and_current_pin_is_closed(self):
        alternate = Path("caller-selected-formal-output")
        with self.assertRaises(TypeError):
            runner.run_pinned_ready_wasm_pairs(ML_DIR.parent, alternate)
        self.assertFalse(alternate.exists())
        with self.assertRaisesRegex(
            bridge.FormalAbV2WorkerBenchmarkBlocked,
            "no code-pinned benchmark-bound formal READY registry",
        ):
            runner.run_pinned_ready_wasm_pairs()

    def test_faulted_run_tombstone_rejects_same_run_replay(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            captured = legacy.validate_ready_local_run_registry_core_for_tests(
                fixture.root, fixture.registry_path
            )
            captured["registry"]["pair_workers"] = 2
            captured["worker_benchmark_receipt_identity"] = {"sha256": "a" * 64}
            calls = 0

            def crash(_request):
                nonlocal calls
                calls += 1
                raise RuntimeError("synthetic formal pair crash")

            with self.assertRaises(legacy.FormalAbLocalLauncherError):
                runner._run_reserved_formal_core_for_tests(
                    fixture.root,
                    temporary,
                    captured,
                    crash,
                    lambda: captured,
                )
            self.assertGreater(calls, 0)
            calls_after_fault = calls
            run_root = (
                Path(temporary)
                / runner.FORMAL_RUN_OUTPUT_DIRECTORY
                / captured["registry"]["run_id"].removeprefix("sha256:")
            )
            self.assertTrue(run_root.is_dir())
            self.assertEqual(stat.S_IMODE(run_root.stat().st_mode), 0o700)
            ledger_path = run_root / runner.FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME
            events = [
                json.loads(line)
                for line in ledger_path.read_text(encoding="utf-8").splitlines()
            ]
            self.assertEqual(
                [event["event"] for event in events],
                ["run-reserved", "attempt-started", "attempt-faulted"],
            )
            self.assertIsNone(events[0]["previous_event_sha256"])
            self.assertEqual(
                events[1]["previous_event_sha256"], events[0]["event_sha256"]
            )
            self.assertEqual(
                events[2]["previous_event_sha256"], events[1]["event_sha256"]
            )
            self.assertFalse((run_root / runner.FORMAL_RESULT_NAME).exists())

            with self.assertRaisesRegex(
                bridge.FormalAbV2WorkerBenchmarkError,
                "already reserved; automatic rerun is forbidden",
            ):
                runner._run_reserved_formal_core_for_tests(
                    fixture.root,
                    temporary,
                    captured,
                    crash,
                    lambda: captured,
                )
            self.assertEqual(calls, calls_after_fault)

    def test_success_transitions_attempt_ledger_and_publishes_result_once(self):
        with tempfile.TemporaryDirectory() as temporary:
            fixture = ReadyFixture(temporary)
            captured = legacy.validate_ready_local_run_registry_core_for_tests(
                fixture.root, fixture.registry_path
            )
            captured["registry"]["pair_workers"] = 2
            captured["worker_benchmark_receipt_identity"] = {"sha256": "b" * 64}
            result = runner._run_reserved_formal_core_for_tests(
                fixture.root,
                temporary,
                captured,
                passing_pair_receipt,
                lambda: captured,
            )
            self.assertEqual(len(result["pairs"]), legacy.PAIR_COUNT)
            run_root = (
                Path(temporary)
                / runner.FORMAL_RUN_OUTPUT_DIRECTORY
                / captured["registry"]["run_id"].removeprefix("sha256:")
            )
            events = [
                json.loads(line)
                for line in (run_root / runner.FORMAL_RUNTIME_ATTEMPT_LEDGER_NAME)
                .read_text(encoding="utf-8")
                .splitlines()
            ]
            self.assertEqual(
                [event["event"] for event in events],
                ["run-reserved", "attempt-started", "attempt-completed"],
            )
            result_path = run_root / runner.FORMAL_RESULT_NAME
            self.assertTrue(result_path.is_file())
            self.assertEqual(stat.S_IMODE(result_path.stat().st_mode), 0o600)
            self.assertEqual(
                events[-1]["result_sha256"],
                legacy._sha256_bytes(result_path.read_bytes()),
            )


if __name__ == "__main__":
    unittest.main()
