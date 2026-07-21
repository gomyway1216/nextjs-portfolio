import copy
from contextlib import redirect_stderr, redirect_stdout
import io
import json
from pathlib import Path
import sys
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import formal_paired_ab_v2_worker_benchmark_bridge as bridge  # noqa: E402
import run_formal_paired_ab_v2_fixed as cli  # noqa: E402


class RunFormalPairedAbV2FixedTest(unittest.TestCase):
    def _run_cli(self, arguments, run, analyze):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with redirect_stdout(stdout), redirect_stderr(stderr):
            code = cli._main_core_for_tests(arguments, run, analyze)
        return code, stdout.getvalue(), stderr.getvalue()

    def _public_analysis(self):
        denominator = cli.formal_protocol.SCORE_DENOMINATOR
        one_sided_lower = 800
        two_sided_lower = 780
        return {
            "schema": cli.formal_protocol.FORMAL_AB_V2_ANALYSIS_SCHEMA,
            "experiment_id": "sha256:" + "1" * 64,
            "run_id": "sha256:" + "2" * 64,
            "attempt_index": 0,
            "attempt_ledger_sha256": "3" * 64,
            "rerun_authorization_sha256": None,
            "candidate_weights_sha256": "4" * 64,
            "stable_weights_sha256": "5" * 64,
            "match_binding_sha256": "6" * 64,
            "technical_fault_count": 0,
            "protocol_amendment_sha256": (
                cli.formal_protocol.FORMAL_AB_V2_AMENDMENT_SHA256
            ),
            "counts": {
                "pairs": cli.formal_protocol.PAIR_COUNT,
                "games": cli.formal_protocol.GAME_COUNT,
            },
            "point_score_rate": {
                "numerator": 810,
                "denominator": denominator,
                "decimal": 810 / denominator,
            },
            "bootstrap": {
                "seed": cli.formal_protocol.BOOTSTRAP_SEED,
                "replicates": cli.formal_protocol.BOOTSTRAP_REPLICATES,
                "resampling_unit": "two-game-color-swapped-opening-pair",
                "one_sided_95_lower_rank": (
                    cli.formal_protocol.ONE_SIDED_95_LOWER_RANK
                ),
                "one_sided_95_lower": {
                    "numerator": one_sided_lower,
                    "denominator": denominator,
                    "decimal": one_sided_lower / denominator,
                },
                "two_sided_95_lower_rank": (
                    cli.formal_protocol.TWO_SIDED_95_LOWER_RANK
                ),
                "two_sided_95_lower": {
                    "numerator": two_sided_lower,
                    "denominator": denominator,
                    "decimal": two_sided_lower / denominator,
                },
            },
            "gates": {
                "complete_384_pairs_768_games": True,
                "technical_faults_exactly_zero": True,
                "safety_strictly_above_0_45": True,
                "stronger_claim_strictly_above_0_50": True,
                "formal_ab_passed": True,
            },
            "authority": {
                "promotion_authorized": False,
                "production_weight_write_authorized": False,
            },
            "nonclaims": {
                "strength_improved": False,
                "high_dan_calibrated": False,
            },
        }

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
                "schema": cli.FORMAL_CLI_RECEIPT_SCHEMA,
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
        public_analysis = self._public_analysis()
        run = mock.Mock(return_value=private_result)
        analyze = mock.Mock(return_value=public_analysis)
        code, stdout, stderr = self._run_cli([], run, analyze)
        self.assertEqual(code, 0)
        self.assertEqual(stderr, "")
        self.assertEqual(json.loads(stdout), public_analysis)
        self.assertNotIn("must-not-reach-stdout", stdout)
        run.assert_called_once_with()
        analyze.assert_called_once_with(private_result)

    def test_public_analysis_validator_rejects_nested_or_semantic_drift(self):
        def set_nested(value, path, replacement):
            target = value
            for field in path[:-1]:
                target = target[field]
            target[path[-1]] = replacement

        experiment_id = self._public_analysis()["experiment_id"]
        mutations = {
            "nested-pairs": lambda value: value["bootstrap"].__setitem__("pairs", []),
            "nested-private-path": lambda value: value["gates"].__setitem__(
                "private_path", "/private/formal-result.json"
            ),
            "bool-as-int": lambda value: set_nested(
                value, ("point_score_rate", "numerator"), True
            ),
            "bootstrap-constant": lambda value: set_nested(
                value,
                ("bootstrap", "seed"),
                cli.formal_protocol.BOOTSTRAP_SEED + 1,
            ),
            "ratio": lambda value: set_nested(
                value, ("point_score_rate", "decimal"), 0.5
            ),
            "hash": lambda value: value.__setitem__("attempt_ledger_sha256", "0" * 64),
            "semantic-id": lambda value: value.__setitem__(
                "experiment_id", "not-a-semantic-id"
            ),
            "id-relation": lambda value: value.__setitem__("run_id", experiment_id),
            "attempt-relation": lambda value: value.__setitem__("attempt_index", 1),
            "gate-relation": lambda value: set_nested(
                value, ("gates", "formal_ab_passed"), False
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                analysis = copy.deepcopy(self._public_analysis())
                mutate(analysis)
                with self.assertRaises(ValueError):
                    cli._validate_public_analysis(analysis)

        rerun = self._public_analysis()
        rerun["attempt_index"] = 1
        rerun["rerun_authorization_sha256"] = "7" * 64
        self.assertEqual(cli._validate_public_analysis(rerun), rerun)

    def test_cli_sanitizes_all_analysis_failures_without_traceback_or_path(self):
        private_path = "/private/formal-result.json"
        unsafe_values = {}
        nested_path = self._public_analysis()
        nested_path["bootstrap"]["private_path"] = private_path
        unsafe_values["nested-private-path"] = nested_path
        nonfinite = self._public_analysis()
        nonfinite["point_score_rate"]["decimal"] = float("nan")
        unsafe_values["nonfinite"] = nonfinite
        non_json = self._public_analysis()
        non_json["bootstrap"]["one_sided_95_lower"]["decimal"] = object()
        unsafe_values["non-json"] = non_json

        for label, unsafe in unsafe_values.items():
            with self.subTest(label=label):
                run = mock.Mock(return_value={"private": True})
                analyze = mock.Mock(return_value=unsafe)
                code, stdout, stderr = self._run_cli([], run, analyze)
                self.assertEqual(code, 2)
                self.assertEqual(stdout, "")
                self.assertEqual(
                    json.loads(stderr), cli._cli_stop("formal-run-failed-closed")
                )
                self.assertNotIn(private_path, stderr)
                self.assertNotIn("Traceback", stderr)
                run.assert_called_once_with()
                analyze.assert_called_once_with(run.return_value)

        run = mock.Mock(return_value={"private": True})
        analyze = mock.Mock(side_effect=KeyError(private_path))
        code, stdout, stderr = self._run_cli([], run, analyze)
        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(json.loads(stderr), cli._cli_stop("formal-run-failed-closed"))
        self.assertNotIn(private_path, stderr)
        self.assertNotIn("Traceback", stderr)
        run.assert_called_once_with()
        analyze.assert_called_once_with(run.return_value)

    def test_cli_catches_canonical_serialization_failure(self):
        private_path = "/private/formal-result.json"
        unsafe = {"private_path": private_path, "value": object()}
        with mock.patch.object(cli, "_validate_public_analysis", return_value=unsafe):
            code, stdout, stderr = self._run_cli(
                [], lambda: {"private": True}, lambda _result: self._public_analysis()
            )
        self.assertEqual(code, 2)
        self.assertEqual(stdout, "")
        self.assertEqual(json.loads(stderr), cli._cli_stop("formal-run-failed-closed"))
        self.assertNotIn(private_path, stderr)
        self.assertNotIn("Traceback", stderr)

    def test_main_wires_the_fixed_runner_and_analyzer_once(self):
        private_result = {"private": True}
        public_analysis = self._public_analysis()
        stdout = io.StringIO()
        stderr = io.StringIO()
        with (
            mock.patch.object(
                cli.bound_runner,
                "run_pinned_ready_wasm_pairs",
                return_value=private_result,
            ) as run,
            mock.patch.object(
                cli.formal_protocol,
                "analyze_formal_paired_ab_v2",
                return_value=public_analysis,
            ) as analyze,
            redirect_stdout(stdout),
            redirect_stderr(stderr),
        ):
            code = cli.main([])
        self.assertEqual(code, 0)
        self.assertEqual(stderr.getvalue(), "")
        self.assertEqual(json.loads(stdout.getvalue()), public_analysis)
        run.assert_called_once_with()
        analyze.assert_called_once_with(private_result)


if __name__ == "__main__":
    unittest.main()
