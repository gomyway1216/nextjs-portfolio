import os
import sys
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import formal_paired_ab_v2_worker_benchmark as benchmark  # noqa: E402


def digest(number):
    return f"{number:064x}"


def observations(elapsed_by_workers=None):
    timings = elapsed_by_workers or {
        2: (410, 390),
        4: (250, 230),
        8: (120, 100),
        12: (160, 140),
    }
    offsets = {workers: 0 for workers in benchmark.PAIR_WORKER_CANDIDATES}
    transcript_sha256s = [
        digest(index)
        for index in range(1, benchmark.BENCHMARK_GAMES_PER_ROUND + 1)
    ]
    rows = []
    for round_index, workers in enumerate(benchmark.BENCHMARK_SEQUENCE):
        offset = offsets[workers]
        offsets[workers] += 1
        rows.append(
            {
                "round_index": round_index,
                "pair_workers": workers,
                "elapsed_ns": timings[workers][offset],
                "pairs": benchmark.BENCHMARK_PAIRS_PER_ROUND,
                "games": benchmark.BENCHMARK_GAMES_PER_ROUND,
                "peak_pair_workers_observed": workers,
                "technical_fault_count": 0,
                "transcript_sha256s": transcript_sha256s,
            }
        )
    return rows


class FormalPairedAbV2WorkerBenchmarkTest(unittest.TestCase):
    def test_selects_lowest_two_sample_total_from_exact_schedule(self):
        receipt = benchmark.select_formal_ab_v2_pair_workers(observations())
        self.assertEqual(receipt["status"], "PASS")
        self.assertEqual(receipt["worker_candidates"], [2, 4, 8, 12])
        self.assertEqual(receipt["selected_pair_workers"], 8)
        self.assertEqual(receipt["transcript_hash_equality"], "exact-pass")
        self.assertEqual(len(receipt["rounds"]), 8)
        self.assertEqual(
            [row["total_elapsed_ns"] for row in receipt["timing_summary"]],
            [800, 480, 220, 300],
        )
        self.assertEqual(
            [
                (
                    row["mean_elapsed_ns_numerator"],
                    row["mean_elapsed_ns_denominator"],
                )
                for row in receipt["timing_summary"]
            ],
            [(800, 2), (480, 2), (220, 2), (300, 2)],
        )

    def test_any_transcript_drift_forbids_worker_selection(self):
        rows = observations()
        rows[4]["transcript_sha256s"] = list(rows[4]["transcript_sha256s"])
        rows[4]["transcript_sha256s"][1] = digest(999)
        with self.assertRaisesRegex(
            ValueError,
            "selection forbidden.*not exactly equal",
        ):
            benchmark.select_formal_ab_v2_pair_workers(rows)

    def test_missing_faulted_or_out_of_order_round_fails_closed(self):
        probes = []
        missing = observations()
        missing.pop()
        probes.append(missing)
        faulted = observations()
        faulted[0]["technical_fault_count"] = 1
        probes.append(faulted)
        reordered = observations()
        reordered[0]["pair_workers"] = 4
        probes.append(reordered)
        underutilized = observations()
        underutilized[0]["peak_pair_workers_observed"] = 1
        probes.append(underutilized)
        boolean_fault_count = observations()
        boolean_fault_count[0]["technical_fault_count"] = False
        probes.append(boolean_fault_count)
        for rows in probes:
            with self.subTest(rows=len(rows)), self.assertRaises(ValueError):
                benchmark.select_formal_ab_v2_pair_workers(rows)

    def test_exact_timing_tie_chooses_lower_worker_count(self):
        rows = observations(
            {
                2: (410, 390),
                4: (110, 90),
                8: (110, 90),
                12: (160, 140),
            }
        )
        receipt = benchmark.select_formal_ab_v2_pair_workers(rows)
        self.assertEqual(receipt["selected_pair_workers"], 4)

    def test_harness_runs_fixed_sequence_and_measures_outside_callbacks(self):
        clock_values = iter(
            round_index
            for round_index in range(len(benchmark.BENCHMARK_SEQUENCE))
            for _ in range(2)
        )
        calls = []
        peaks = []

        def execute_round(workers, round_index):
            calls.append((workers, round_index))
            barrier = threading.Barrier(workers)
            lock = threading.Lock()
            active = 0
            peak = 0

            def execute_pair(pair_index):
                nonlocal active, peak
                with lock:
                    active += 1
                    peak = max(peak, active)
                if pair_index < workers:
                    barrier.wait(timeout=5)
                with lock:
                    active -= 1
                return (
                    digest(pair_index * 2 + 1),
                    digest(pair_index * 2 + 2),
                )

            with ThreadPoolExecutor(max_workers=workers) as executor:
                pair_transcripts = list(
                    executor.map(
                        execute_pair,
                        range(benchmark.BENCHMARK_PAIRS_PER_ROUND),
                    )
                )
            peaks.append((workers, peak))
            return {
                "schema": benchmark.BENCHMARK_ROUND_RESULT_SCHEMA,
                "pairs": benchmark.BENCHMARK_PAIRS_PER_ROUND,
                "games": benchmark.BENCHMARK_GAMES_PER_ROUND,
                "peak_pair_workers_observed": peak,
                "technical_fault_count": 0,
                "transcript_sha256s": [
                    transcript
                    for pair in pair_transcripts
                    for transcript in pair
                ],
            }

        receipt = benchmark.run_formal_ab_v2_worker_benchmark_core_for_tests(
            execute_round,
            monotonic_ns=lambda: next(clock_values),
        )
        self.assertEqual(
            calls,
            [
                (workers, round_index)
                for round_index, workers in enumerate(
                    benchmark.BENCHMARK_SEQUENCE
                )
            ],
        )
        self.assertEqual(
            peaks,
            [
                (workers, workers)
                for workers in benchmark.BENCHMARK_SEQUENCE
            ],
        )
        self.assertEqual(receipt["pairs_per_round"], 12)
        self.assertEqual(receipt["games_per_round"], 24)
        self.assertTrue(
            all(row["elapsed_ns"] == 1 for row in receipt["rounds"])
        )
        self.assertEqual(receipt["selected_pair_workers"], 2)
        backwards_clock = iter((2, 1))
        with self.assertRaisesRegex(ValueError, "clock moved backwards"):
            benchmark.run_formal_ab_v2_worker_benchmark_core_for_tests(
                execute_round,
                monotonic_ns=lambda: next(backwards_clock),
            )


if __name__ == "__main__":
    unittest.main()
