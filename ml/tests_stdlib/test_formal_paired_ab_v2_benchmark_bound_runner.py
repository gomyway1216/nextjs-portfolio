import json
from pathlib import Path
import stat
import sys
import tempfile
import unittest


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
