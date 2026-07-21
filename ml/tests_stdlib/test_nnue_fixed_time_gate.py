from __future__ import annotations

import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

from nnue_fixed_time_gate import (  # noqa: E402
    ChildResult,
    NnueFixedTimeGateError,
    PairResult,
    analyze_gate,
    build_manifest_template,
    execute_pair_subprocess,
    parse_pair_log,
    run_gate,
    validate_manifest,
)
import nnue_fixed_time_gate  # noqa: E402
import build_nnue_fixed_time_gate_manifest  # noqa: E402


def _asset(path: str, size: int, marker: str, buckets: int | None = None):
    value = {
        "path": path,
        "bytes": size,
        "sha256": hashlib.sha256(marker.encode()).hexdigest(),
    }
    if buckets is not None:
        value["buckets"] = buckets
    return value


def manifest(*, workers: int = 12):
    return build_manifest_template(
        experiment_id="sha256:" + "a" * 64,
        assets={
            "candidate_weights": _asset("candidate.bin", 94_675_268, "candidate", 82),
            "stable_weights": _asset("stable.bin", 1_185_988, "stable", 1),
            "research_wasm": _asset("research.wasm", 37_733, "wasm"),
            "match_harness": _asset(
                "wasm-spike/match-nnue-vs-v3.ts", 12_345, "harness"
            ),
        },
        milliseconds_per_move=500,
        seed_starts={
            "screen56": 10_000,
            "independent96": 20_000,
            "formal768": 30_000,
        },
        pair_workers={
            "screen56": workers,
            "independent96": workers,
            "formal768": workers,
        },
    )


def pair_log(seed: int, first: str = "win", second: str = "win", *, opening: str | None = None) -> bytes:
    fingerprint = opening or hashlib.sha256(f"opening-{seed}".encode()).hexdigest()

    def summary(result: str) -> str:
        if result == "win":
            return "WIN NNUE-A(buckets=82) (checkmate, SENTE)"
        if result == "loss":
            return "WIN NNUE-B(buckets=1) (checkmate, GOTE)"
        return "DRAW (repetition)"

    return (
        f"=== match: synthetic (seed base {seed}), fixed-time-ms=500, "
        "tt=clear-before-each-game-retain-within-game ===\n"
        f"game 1/2: NNUE=SENTE opening={fingerprint} => {summary(first)} "
        "plies=80 time=1.0s\n"
        f"game 2/2: NNUE=GOTE opening={fingerprint} => {summary(second)} "
        "plies=81 time=1.1s\n"
        "\nresult: NNUE-A(buckets=82) 2 wins / NNUE-B(buckets=1) 0 wins / "
        "0 draws (all 161 moves legal)\n"
    ).encode()


def pair_result(index: int, seed: int, first: str, second: str) -> PairResult:
    return parse_pair_log(pair_log(seed, first, second), index, seed)


class NnueFixedTimeGateTest(unittest.TestCase):
    def test_manifest_builder_can_write_an_explicit_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate = root / "candidate.bin"
            stable = root / "stable.bin"
            wasm = root / "research.wasm"
            output = root / "nested" / "manifest.json"
            candidate.write_bytes(b"candidate")
            stable.write_bytes(b"stable")
            wasm.write_bytes(b"wasm")
            argv = [
                "build_nnue_fixed_time_gate_manifest.py",
                str(candidate),
                str(stable),
                str(wasm),
                "--candidate-buckets",
                "81",
                "--stable-buckets",
                "1",
                "--screen-seed-start",
                "10000",
                "--independent-seed-start",
                "20000",
                "--formal-seed-start",
                "30000",
                "--output",
                str(output),
            ]
            with mock.patch.object(sys, "argv", argv):
                self.assertEqual(build_nnue_fixed_time_gate_manifest.main(), 0)

            value = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(value["assets"]["candidate_weights"]["buckets"], 81)
            self.assertEqual(value["assets"]["candidate_weights"]["bytes"], 9)
            self.assertEqual(value["gates"][0]["pair_seeds"][0], 10000)

    def test_manifest_binds_arbitrary_sizes_and_disjoint_exact_gate_sets(self):
        value = manifest()
        self.assertEqual(value["assets"]["candidate_weights"]["bytes"], 94_675_268)
        self.assertEqual([gate["pairs"] for gate in value["gates"]], [28, 48, 384])
        self.assertEqual([gate["games"] for gate in value["gates"]], [56, 96, 768])

        repeated = copy.deepcopy(value)
        repeated["gates"][1]["pair_seeds"][0] = repeated["gates"][0]["pair_seeds"][0]
        with self.assertRaisesRegex(NnueFixedTimeGateError, "unique within and across"):
            validate_manifest(repeated)

        wrong_count = copy.deepcopy(value)
        wrong_count["gates"][2]["games"] = 767
        with self.assertRaisesRegex(NnueFixedTimeGateError, "games differs"):
            validate_manifest(wrong_count)

    def test_pair_subprocess_command_is_exact_and_has_one_bucket_value_per_flag(self):
        value = manifest()
        root = Path(".").resolve()
        completed = mock.Mock(returncode=0, stdout=b"stdout", stderr=b"")
        with mock.patch.dict(
            os.environ,
            {"NODE": "/fixed/node", "PATH": "/fixed/path"},
            clear=True,
        ), mock.patch(
            "nnue_fixed_time_gate.subprocess.run", return_value=completed
        ) as run:
            result = execute_pair_subprocess(root, value, 0, 12_345)

        expected = [
            "/fixed/node",
            "-r",
            "tsx/cjs",
            str(root / "wasm-spike/match-nnue-vs-v3.ts"),
            str(root / "candidate.bin"),
            "--vs",
            str(root / "stable.bin"),
            "--games",
            "2",
            "--ms",
            "500",
            "--seed",
            "12345",
            "--k",
            "600",
            "--scale-numer",
            "1",
            "--scale-denom",
            "1",
            "--wasm-path",
            str(root / "research.wasm"),
            "--buckets-a",
            "82",
            "--buckets-b",
            "1",
            "--sha-a",
            value["assets"]["candidate_weights"]["sha256"],
            "--sha-b",
            value["assets"]["stable_weights"]["sha256"],
            "--wasm-sha",
            value["assets"]["research_wasm"]["sha256"],
        ]
        self.assertEqual(run.call_args.args, (expected,))
        self.assertEqual(run.call_args.kwargs["env"], {"PATH": "/fixed/path"})
        self.assertEqual(result, ChildResult(0, b"stdout", b""))

    def test_pair_parser_requires_fixed_time_tt_retention_color_swap_and_legality(self):
        parsed = parse_pair_log(pair_log(42, "win", "draw"), 3, 42)
        self.assertEqual(parsed.candidate_sente, "win")
        self.assertEqual(parsed.candidate_gote, "draw")
        self.assertEqual(parsed.halfpoints, 3)
        self.assertEqual(parsed.legal_moves, 161)

        missing_contract = pair_log(42).replace(b"fixed-time-ms=500", b"clock=none")
        with self.assertRaisesRegex(NnueFixedTimeGateError, "fixed-time TT"):
            parse_pair_log(missing_contract, 0, 42)

        wrong_color = pair_log(42).replace(b"game 2/2: NNUE=GOTE", b"game 2/2: NNUE=SENTE")
        with self.assertRaisesRegex(NnueFixedTimeGateError, "candidate-sente then candidate-gote"):
            parse_pair_log(wrong_color, 0, 42)

        no_legal_seal = pair_log(42).replace(b"(all 161 moves legal)", b"(moves unchecked)")
        with self.assertRaisesRegex(NnueFixedTimeGateError, "all-moves-legal"):
            parse_pair_log(no_legal_seal, 0, 42)

    def test_screen_futility_is_the_only_partial_decision_and_resume_runs_no_pair(self):
        value = manifest(workers=1)
        calls: list[int] = []

        def executor(_root, _manifest, pair_index, seed):
            calls.append(pair_index)
            return ChildResult(0, pair_log(seed, "loss", "loss"))

        with tempfile.TemporaryDirectory() as directory:
            report = run_gate(
                ".", value, "b" * 64, "screen56", directory, executor=executor
            )
            self.assertEqual(report["decision"], "rejected-futility")
            self.assertFalse(report["passed"])
            self.assertEqual(report["completed_pairs"], 13)
            self.assertEqual(len(calls), 13)

            no_more = mock.Mock(side_effect=AssertionError("resume launched a pair"))
            resumed = run_gate(
                ".", value, "b" * 64, "screen56", directory, executor=no_more
            )
            self.assertEqual(resumed["decision"], "rejected-futility")
            no_more.assert_not_called()

    def test_sliding_window_refills_while_an_earlier_pair_is_still_running(self):
        value = manifest(workers=2)
        first_started = threading.Event()
        third_started = threading.Event()
        release_first = threading.Event()
        lock = threading.Lock()
        active = 0
        maximum_active = 0
        first_finished = False
        third_started_before_first_finished = False

        def executor(_root, _manifest, pair_index, seed):
            nonlocal active, maximum_active, first_finished
            nonlocal third_started_before_first_finished
            with lock:
                active += 1
                maximum_active = max(maximum_active, active)
                if pair_index == 2:
                    third_started_before_first_finished = not first_finished
            try:
                if pair_index == 0:
                    first_started.set()
                    self.assertTrue(release_first.wait(5))
                    with lock:
                        first_finished = True
                elif pair_index == 1:
                    self.assertTrue(first_started.wait(5))
                elif pair_index == 2:
                    third_started.set()
                return ChildResult(0, pair_log(seed, "win", "win"))
            finally:
                with lock:
                    active -= 1

        with tempfile.TemporaryDirectory() as directory:
            with ThreadPoolExecutor(max_workers=1) as caller:
                future = caller.submit(
                    run_gate,
                    ".",
                    value,
                    "7" * 64,
                    "screen56",
                    directory,
                    executor=executor,
                )
                self.assertTrue(first_started.wait(5))
                self.assertTrue(third_started.wait(5))
                release_first.set()
                report = future.result(timeout=10)

        self.assertTrue(report["passed"])
        self.assertTrue(third_started_before_first_finished)
        self.assertEqual(maximum_active, 2)

    def test_fault_stops_refill_but_durably_finishes_the_running_pair(self):
        value = manifest(workers=2)
        second_started = threading.Event()
        release_second = threading.Event()
        fault_durable = threading.Event()
        calls: list[int] = []
        calls_lock = threading.Lock()

        def executor(_root, _manifest, pair_index, seed):
            with calls_lock:
                calls.append(pair_index)
            if pair_index == 0:
                self.assertTrue(second_started.wait(5))
                return ChildResult(1, b"", b"synthetic fault")
            if pair_index == 1:
                second_started.set()
                self.assertTrue(release_second.wait(5))
                return ChildResult(0, pair_log(seed, "win", "win"))
            raise AssertionError("a new pair was submitted after the fault")

        original_atomic_write = nnue_fixed_time_gate._atomic_write

        def observed_atomic_write(path, payload):
            original_atomic_write(path, payload)
            if Path(path).name == "pair-0000.fault.json":
                fault_durable.set()

        with tempfile.TemporaryDirectory() as directory, mock.patch(
            "nnue_fixed_time_gate._atomic_write",
            side_effect=observed_atomic_write,
        ):
            with ThreadPoolExecutor(max_workers=1) as caller:
                future = caller.submit(
                    run_gate,
                    ".",
                    value,
                    "8" * 64,
                    "screen56",
                    directory,
                    executor=executor,
                )
                self.assertTrue(second_started.wait(5))
                self.assertTrue(fault_durable.wait(5))
                release_second.set()
                report = future.result(timeout=10)

            stage = Path(directory) / "screen56"
            self.assertTrue((stage / "pair-0001.log").is_file())
            self.assertTrue((stage / "pair-0001.json").is_file())

        self.assertEqual(sorted(calls), [0, 1])
        self.assertEqual(report["decision"], "rejected-technical-fault")
        self.assertEqual(report["technical_fault_count"], 1)
        self.assertEqual(report["completed_pairs"], 1)

    def test_futility_stops_refill_but_durably_finishes_the_running_pair(self):
        value = manifest(workers=2)
        pair_thirteen_started = threading.Event()
        release_pair_thirteen = threading.Event()
        futility_pair_durable = threading.Event()
        calls: list[int] = []
        calls_lock = threading.Lock()

        def executor(_root, _manifest, pair_index, seed):
            with calls_lock:
                calls.append(pair_index)
            if pair_index == 12:
                self.assertTrue(pair_thirteen_started.wait(5))
            elif pair_index == 13:
                pair_thirteen_started.set()
                self.assertTrue(release_pair_thirteen.wait(5))
            elif pair_index > 13:
                raise AssertionError("a new pair was submitted after futility")
            return ChildResult(0, pair_log(seed, "loss", "loss"))

        original_atomic_write = nnue_fixed_time_gate._atomic_write

        def observed_atomic_write(path, payload):
            original_atomic_write(path, payload)
            if Path(path).name == "pair-0012.json":
                futility_pair_durable.set()

        with tempfile.TemporaryDirectory() as directory, mock.patch(
            "nnue_fixed_time_gate._atomic_write",
            side_effect=observed_atomic_write,
        ):
            with ThreadPoolExecutor(max_workers=1) as caller:
                future = caller.submit(
                    run_gate,
                    ".",
                    value,
                    "6" * 64,
                    "screen56",
                    directory,
                    executor=executor,
                )
                self.assertTrue(pair_thirteen_started.wait(5))
                self.assertTrue(futility_pair_durable.wait(5))
                release_pair_thirteen.set()
                report = future.result(timeout=10)

            stage = Path(directory) / "screen56"
            self.assertTrue((stage / "pair-0013.log").is_file())
            self.assertTrue((stage / "pair-0013.json").is_file())

        self.assertEqual(sorted(calls), list(range(14)))
        self.assertEqual(report["decision"], "rejected-futility")
        self.assertEqual(report["completed_pairs"], 14)

    def test_complete_screen_pass_and_independent_and_formal_statistics(self):
        value = manifest()
        screen = [
            pair_result(index, seed, "win", "win")
            for index, seed in enumerate(value["gates"][0]["pair_seeds"])
        ]
        screen_report = analyze_gate(value, "screen56", screen)
        self.assertTrue(screen_report["passed"])
        self.assertEqual(screen_report["candidate_halfpoints"], 112)

        independent_wins = [
            pair_result(index, seed, "win", "win")
            for index, seed in enumerate(value["gates"][1]["pair_seeds"])
        ]
        independent_report = analyze_gate(value, "independent96", independent_wins)
        self.assertTrue(independent_report["passed"])
        self.assertGreater(
            independent_report["bootstrap"]["one_sided_95_lower_numerator"],
            independent_report["bootstrap"]["denominator"] // 2,
        )

        independent_even = [
            pair_result(index, seed, "win", "loss")
            for index, seed in enumerate(value["gates"][1]["pair_seeds"])
        ]
        self.assertFalse(analyze_gate(value, "independent96", independent_even)["passed"])

        formal_wins = [
            pair_result(index, seed, "win", "win")
            for index, seed in enumerate(value["gates"][2]["pair_seeds"])
        ]
        formal_report = analyze_gate(value, "formal768", formal_wins)
        self.assertTrue(formal_report["passed"])
        self.assertTrue(formal_report["stronger_claim_strictly_above_0_50"])

        formal_even = [
            pair_result(index, seed, "win", "loss")
            for index, seed in enumerate(value["gates"][2]["pair_seeds"])
        ]
        even_report = analyze_gate(value, "formal768", formal_even)
        self.assertFalse(even_report["passed"])
        self.assertFalse(even_report["stronger_claim_strictly_above_0_50"])

    def test_independent_partial_never_decides_and_fault_is_durable(self):
        value = manifest(workers=1)
        seeds = value["gates"][1]["pair_seeds"]
        partial = [pair_result(0, seeds[0], "win", "win")]
        partial_report = analyze_gate(value, "independent96", partial)
        self.assertEqual(partial_report["decision"], "pending")
        self.assertFalse(partial_report["passed"])

        calls = 0

        def broken(_root, _manifest, _pair_index, seed):
            nonlocal calls
            calls += 1
            return ChildResult(1, pair_log(seed), b"sanitized failure")

        with tempfile.TemporaryDirectory() as directory:
            run_gate(
                ".",
                value,
                "c" * 64,
                "screen56",
                directory,
                executor=lambda _root, _manifest, _pair_index, seed: ChildResult(
                    0, pair_log(seed, "win", "win")
                ),
            )
            failed = run_gate(
                ".", value, "c" * 64, "independent96", directory, executor=broken
            )
            self.assertEqual(failed["decision"], "rejected-technical-fault")
            self.assertEqual(failed["technical_fault_count"], 1)
            self.assertEqual(calls, 1)

            never = mock.Mock(side_effect=AssertionError("faulted run resumed"))
            repeated = run_gate(
                ".", value, "c" * 64, "independent96", directory, executor=never
            )
            self.assertEqual(repeated["decision"], "rejected-technical-fault")
            never.assert_not_called()

    def test_synthetic_formal_runner_completes_all_384_pairs_and_resumes(self):
        value = manifest()
        calls = 0

        def executor(_root, _manifest, _pair_index, seed):
            nonlocal calls
            calls += 1
            return ChildResult(0, pair_log(seed, "win", "win"))

        with tempfile.TemporaryDirectory() as directory:
            for prerequisite in ("screen56", "independent96"):
                run_gate(
                    ".",
                    value,
                    "f" * 64,
                    prerequisite,
                    directory,
                    executor=lambda _root, _manifest, _pair_index, seed: ChildResult(
                        0, pair_log(seed, "win", "win")
                    ),
                )
            calls = 0
            report = run_gate(
                ".", value, "f" * 64, "formal768", directory, executor=executor
            )
            self.assertTrue(report["passed"])
            self.assertTrue(report["all_pairs_complete"])
            self.assertEqual(report["completed_pairs"], 384)
            self.assertEqual(report["completed_games"], 768)
            self.assertEqual(calls, 384)
            self.assertFalse(report["promotion_authorized"])
            self.assertFalse(report["live_weight_write_authorized"])

            never = mock.Mock(side_effect=AssertionError("complete formal reran"))
            resumed = run_gate(
                ".", value, "f" * 64, "formal768", directory, executor=never
            )
            self.assertTrue(resumed["passed"])
            never.assert_not_called()

    def test_observed_openings_must_not_repeat_across_gates(self):
        value = manifest(workers=1)
        first_screen_seed = value["gates"][0]["pair_seeds"][0]
        shared = hashlib.sha256(f"opening-{first_screen_seed}".encode()).hexdigest()

        def screen_executor(_root, _manifest, _pair_index, seed):
            return ChildResult(0, pair_log(seed, "win", "win"))

        def independent_executor(_root, _manifest, _pair_index, seed):
            return ChildResult(0, pair_log(seed, "win", "win", opening=shared))

        with tempfile.TemporaryDirectory() as directory:
            run_gate(
                ".", value, "e" * 64, "screen56", directory, executor=screen_executor
            )
            report = run_gate(
                ".",
                value,
                "e" * 64,
                "independent96",
                directory,
                executor=independent_executor,
            )
            self.assertEqual(report["decision"], "rejected-technical-fault")

    def test_later_gates_require_reparsed_complete_passing_prior_evidence(self):
        value = manifest(workers=12)
        never = mock.Mock(side_effect=AssertionError("blocked gate launched a pair"))

        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(
                NnueFixedTimeGateError,
                "prerequisite screen56 does not have every durable pair",
            ):
                run_gate(
                    ".",
                    value,
                    "d" * 64,
                    "independent96",
                    directory,
                    executor=never,
                )
            never.assert_not_called()

            run_gate(
                ".",
                value,
                "d" * 64,
                "screen56",
                directory,
                executor=lambda _root, _manifest, _pair_index, seed: ChildResult(
                    0, pair_log(seed, "win", "win")
                ),
            )
            with self.assertRaisesRegex(
                NnueFixedTimeGateError, "pair receipt binding differs"
            ):
                run_gate(
                    ".",
                    value,
                    "e" * 64,
                    "independent96",
                    directory,
                    executor=never,
                )

            with self.assertRaisesRegex(
                NnueFixedTimeGateError,
                "prerequisite independent96 does not have every durable pair",
            ):
                run_gate(
                    ".",
                    value,
                    "d" * 64,
                    "formal768",
                    directory,
                    executor=never,
                )
            never.assert_not_called()

    def test_forged_passing_report_cannot_override_complete_failing_receipts(self):
        value = manifest(workers=1)
        manifest_sha256 = "9" * 64

        def failing_screen(_root, _manifest, pair_index, seed):
            if pair_index < 15:
                results = ("win", "win")
            elif pair_index == 15:
                results = ("draw", "loss")
            else:
                results = ("loss", "loss")
            return ChildResult(0, pair_log(seed, *results))

        with tempfile.TemporaryDirectory() as directory:
            rejected = run_gate(
                ".",
                value,
                manifest_sha256,
                "screen56",
                directory,
                executor=failing_screen,
            )
            self.assertEqual(rejected["decision"], "rejected-complete")
            self.assertTrue(rejected["all_pairs_complete"])
            self.assertEqual(rejected["candidate_halfpoints"], 61)

            forged_results = [
                pair_result(index, seed, "win", "win")
                for index, seed in enumerate(value["gates"][0]["pair_seeds"])
            ]
            forged = {
                **analyze_gate(value, "screen56", forged_results),
                "manifest_sha256": manifest_sha256,
            }
            report_path = Path(directory) / "screen56" / "report.json"
            report_path.write_text(
                json.dumps(
                    forged,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n",
                encoding="utf-8",
            )

            never = mock.Mock(side_effect=AssertionError("forged report launched a pair"))
            with self.assertRaisesRegex(
                NnueFixedTimeGateError,
                "prerequisite screen56 did not pass",
            ):
                run_gate(
                    ".",
                    value,
                    manifest_sha256,
                    "independent96",
                    directory,
                    executor=never,
                )
            never.assert_not_called()


if __name__ == "__main__":
    unittest.main()
