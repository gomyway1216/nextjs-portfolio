import os
import sys
import unittest


ML_DIR = os.path.dirname(os.path.dirname(__file__))
if ML_DIR not in sys.path:
    sys.path.insert(0, ML_DIR)

import formal_paired_ab_v2_worker_benchmark as benchmark  # noqa: E402


def digest(number):
    return f"{number:064x}"


def observations(elapsed_by_workers=None):
    timings = elapsed_by_workers or {
        2: (410, 400, 390),
        4: (250, 240, 230),
        8: (120, 110, 100),
        12: (160, 150, 140),
    }
    offsets = {workers: 0 for workers in benchmark.PAIR_WORKER_CANDIDATES}
    transcript_sha256s = [digest(index) for index in range(1, 5)]
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
                "technical_fault_count": 0,
                "transcript_sha256s": transcript_sha256s,
            }
        )
    return rows


class FormalPairedAbV2WorkerBenchmarkTest(unittest.TestCase):
    def test_selects_fastest_median_from_exact_2_4_8_12_schedule(self):
        receipt = benchmark.select_formal_ab_v2_pair_workers(observations())
        self.assertEqual(receipt["status"], "PASS")
        self.assertEqual(receipt["worker_candidates"], [2, 4, 8, 12])
        self.assertEqual(receipt["selected_pair_workers"], 8)
        self.assertEqual(receipt["transcript_hash_equality"], "exact-pass")
        self.assertEqual(len(receipt["rounds"]), 12)
        self.assertEqual(
            [row["median_elapsed_ns"] for row in receipt["timing_summary"]],
            [400, 240, 110, 150],
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
        for rows in probes:
            with self.subTest(rows=len(rows)), self.assertRaises(ValueError):
                benchmark.select_formal_ab_v2_pair_workers(rows)

    def test_exact_timing_tie_chooses_lower_worker_count(self):
        rows = observations(
            {
                2: (410, 400, 390),
                4: (110, 100, 90),
                8: (110, 100, 90),
                12: (160, 150, 140),
            }
        )
        receipt = benchmark.select_formal_ab_v2_pair_workers(rows)
        self.assertEqual(receipt["selected_pair_workers"], 4)

    def test_harness_runs_fixed_sequence_and_measures_outside_callbacks(self):
        clock_values = iter(
            value
            for round_index in range(len(benchmark.BENCHMARK_SEQUENCE))
            for value in (round_index * 1_000, round_index * 1_000 + 100)
        )
        calls = []

        def execute_round(workers, round_index):
            calls.append((workers, round_index))
            return {
                "schema": benchmark.BENCHMARK_ROUND_RESULT_SCHEMA,
                "pairs": benchmark.BENCHMARK_PAIRS_PER_ROUND,
                "games": benchmark.BENCHMARK_GAMES_PER_ROUND,
                "technical_fault_count": 0,
                "transcript_sha256s": [
                    digest(index) for index in range(1, 5)
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
        self.assertEqual(receipt["selected_pair_workers"], 2)


if __name__ == "__main__":
    unittest.main()
