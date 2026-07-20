import json
from pathlib import Path
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import run_strength_first_training_thread_benchmark as BENCHMARK  # noqa: E402


HASH_A = "a" * 64
HASH_B = "b" * 64


def worker(seed, model=HASH_A, probe=HASH_B):
    return {
        "seed": seed,
        "model_tensor_sha256": model,
        "probe_output_sha256": probe,
    }


def trial(ordinal, threads, compute_ns, overrides=None):
    workers = [worker(seed) for seed in BENCHMARK.SEEDS]
    for seed, values in (overrides or {}).items():
        workers[BENCHMARK.SEEDS.index(seed)].update(values)
    return {
        "ordinal": ordinal,
        "threads_per_seed": threads,
        "compute_ns": compute_ns,
        "workers": workers,
    }


class StrengthFirstTrainingThreadBenchmarkTests(unittest.TestCase):
    def test_selects_four_only_when_both_pairs_and_median_clear_gate(self):
        decision = BENCHMARK._select_threads(
            [
                trial(1, 2, 110),
                trial(2, 4, 100),
                trial(3, 4, 100),
                trial(4, 2, 110),
            ]
        )
        self.assertEqual(decision["pair_speedups_ppm"], [1_100_000, 1_100_000])
        self.assertEqual(decision["median_speedup_ppm"], 1_100_000)
        self.assertEqual(decision["selected_threads_per_seed"], 4)

        decision = BENCHMARK._select_threads(
            [
                trial(1, 2, 99),
                trial(2, 4, 100),
                trial(3, 4, 90),
                trial(4, 2, 120),
            ]
        )
        self.assertGreater(decision["median_speedup_ppm"], 1_050_000)
        self.assertEqual(decision["selected_threads_per_seed"], 2)

    def test_exact_five_percent_median_is_inclusive_but_pairs_are_strict(self):
        decision = BENCHMARK._select_threads(
            [
                trial(1, 2, 105),
                trial(2, 4, 100),
                trial(3, 4, 100),
                trial(4, 2, 105),
            ]
        )
        self.assertEqual(decision["median_speedup_ppm"], 1_050_000)
        self.assertEqual(decision["selected_threads_per_seed"], 4)

        decision = BENCHMARK._select_threads(
            [
                trial(1, 2, 100),
                trial(2, 4, 100),
                trial(3, 4, 80),
                trial(4, 2, 120),
            ]
        )
        self.assertEqual(decision["selected_threads_per_seed"], 2)

    def test_same_setting_model_or_probe_mismatch_stops(self):
        cases = (
            {42: {"model_tensor_sha256": "c" * 64}},
            {42: {"probe_output_sha256": "d" * 64}},
        )
        for mismatch in cases:
            with self.subTest(mismatch=mismatch):
                trials = [
                    trial(1, 2, 110),
                    trial(2, 4, 100),
                    trial(3, 4, 100),
                    trial(4, 2, 110, mismatch),
                ]
                with self.assertRaisesRegex(
                    BENCHMARK.BenchmarkStop,
                    "same-setting determinism failed",
                ):
                    BENCHMARK._select_threads(trials)

    def test_cross_setting_model_or_probe_mismatch_stops_without_selection(self):
        four_thread_workers = [
            worker(seed, model=("c" * 64 if seed == 43 else HASH_A))
            for seed in BENCHMARK.SEEDS
        ]
        trials = [
            trial(1, 2, 110),
            {
                **trial(2, 4, 100),
                "workers": four_thread_workers,
            },
            {
                **trial(3, 4, 100),
                "workers": four_thread_workers,
            },
            trial(4, 2, 110),
        ]
        with self.assertRaisesRegex(
            BENCHMARK.BenchmarkStop,
            "cross-setting canonical parity failed for seed 43",
        ):
            BENCHMARK._select_threads(trials)

    def test_clean_revision_reader_rejects_dirty_or_noncanonical_git(self):
        clean_runner = mock.Mock(
            side_effect=[
                SimpleNamespace(stdout=b""),
                SimpleNamespace(stdout=b"1" * 40 + b"\n"),
            ]
        )
        self.assertEqual(
            BENCHMARK._capture_clean_revision(Path("/repo"), clean_runner),
            "1" * 40,
        )
        self.assertEqual(clean_runner.call_count, 2)
        for call in clean_runner.call_args_list:
            self.assertEqual(call.kwargs["env"], BENCHMARK.FIXED_GIT_ENV)
            self.assertEqual(call.kwargs["cwd"], Path("/repo"))

        dirty_runner = mock.Mock(
            side_effect=[
                SimpleNamespace(stdout=b"?? untracked\0"),
                SimpleNamespace(stdout=b"1" * 40 + b"\n"),
            ]
        )
        with self.assertRaisesRegex(BENCHMARK.BenchmarkStop, "not exactly clean"):
            BENCHMARK._capture_clean_revision(Path("/repo"), dirty_runner)

        for malformed in (b"1" * 40, b"A" * 40 + b"\n", b"1" * 39 + b"\n"):
            with self.subTest(malformed=malformed):
                runner = mock.Mock(
                    side_effect=[
                        SimpleNamespace(stdout=b""),
                        SimpleNamespace(stdout=malformed),
                    ]
                )
                with self.assertRaisesRegex(
                    BENCHMARK.BenchmarkStop,
                    "not canonical",
                ):
                    BENCHMARK._capture_clean_revision(Path("/repo"), runner)

        for failure in (
            OSError("missing"),
            subprocess.CalledProcessError(1, ["/usr/bin/git"]),
        ):
            with self.subTest(failure=type(failure).__name__):
                with self.assertRaisesRegex(
                    BENCHMARK.BenchmarkStop,
                    "cannot authenticate",
                ):
                    BENCHMARK._capture_clean_revision(
                        Path("/repo"),
                        mock.Mock(side_effect=failure),
                    )

    def test_trial_launches_all_three_argumentless_workers_before_release(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            run_root = root / "run"
            repo.mkdir()
            run_root.mkdir()
            python = root / "python3"
            implementations = {
                name: {"bytes": 1, "sha256": HASH_A}
                for name in BENCHMARK.SOURCE_FILES
            }
            launched = []

            class FakeProcess:
                def __init__(self, request):
                    self.request = request
                    self.done = False

                def poll(self):
                    release = Path(self.request["release"])
                    if not release.exists():
                        return None
                    self.assert_all_launched()
                    if not self.done:
                        result = {
                            "schema": BENCHMARK.WORKER_SCHEMA,
                            "status": BENCHMARK.WORKER_STATUS,
                            "revision": "1" * 40,
                            "implementations": implementations,
                            "ordinal": 1,
                            "threads": 2,
                            "seed": self.request["seed"],
                            "batch_count": BENCHMARK.BATCH_COUNT,
                            "batch_rows": BENCHMARK.BATCH_ROWS,
                            "compute_ns": 100 + self.request["seed"],
                            "model_tensor_sha256": HASH_A,
                            "probe_output_sha256": HASH_B,
                            "training_only": True,
                            "selection_labels_read": False,
                            "holdout_labels_read": False,
                            "live_weights_changed": False,
                            "torch_version": "test",
                        }
                        Path(self.request["result"]).write_text(
                            json.dumps(result),
                            encoding="ascii",
                        )
                        self.done = True
                    return 0

                def assert_all_launched(self):
                    if len(launched) != 3:
                        raise AssertionError("barrier released before all workers")

                def wait(self, timeout=None):
                    del timeout
                    return self.poll()

                def terminate(self):
                    self.done = True

                def kill(self):
                    self.done = True

            def factory(command, **kwargs):
                request = json.loads(kwargs["env"][BENCHMARK.PRIVATE_REQUEST_ENV])
                self.assertEqual(command, [str(python), str(repo / BENCHMARK.SOURCE_FILES[0])])
                self.assertFalse(Path(request["release"]).exists())
                self.assertEqual(kwargs["env"]["OMP_NUM_THREADS"], "2")
                self.assertEqual(kwargs["env"]["MKL_NUM_THREADS"], "2")
                Path(request["ready"]).touch()
                process = FakeProcess(request)
                launched.append((request, process))
                return process

            result = BENCHMARK._run_trial(
                python=python,
                repo_root=repo,
                run_root=run_root,
                revision="1" * 40,
                implementations=implementations,
                ordinal=1,
                threads=2,
                popen_factory=factory,
                poll_seconds=0,
            )
            self.assertEqual([entry[0]["seed"] for entry in launched], [42, 43, 44])
            self.assertEqual(result["concurrent_seeds"], [42, 43, 44])
            self.assertEqual(result["compute_ns"], 144)

    def test_worker_result_cannot_claim_data_or_live_access(self):
        request = {
            "revision": "1" * 40,
            "implementations": {},
            "ordinal": 1,
            "threads": 2,
            "seed": 42,
        }
        valid = {
            "schema": BENCHMARK.WORKER_SCHEMA,
            "status": BENCHMARK.WORKER_STATUS,
            **request,
            "batch_count": BENCHMARK.BATCH_COUNT,
            "batch_rows": BENCHMARK.BATCH_ROWS,
            "compute_ns": 1,
            "model_tensor_sha256": HASH_A,
            "probe_output_sha256": HASH_B,
            "training_only": True,
            "selection_labels_read": False,
            "holdout_labels_read": False,
            "live_weights_changed": False,
            "torch_version": "test",
        }
        self.assertEqual(BENCHMARK._validate_worker_result(valid, request), valid)
        for field in (
            "training_only",
            "selection_labels_read",
            "holdout_labels_read",
            "live_weights_changed",
            "model_tensor_sha256",
        ):
            with self.subTest(field=field):
                forged = dict(valid)
                forged[field] = (
                    None
                    if field == "model_tensor_sha256"
                    else not forged[field]
                )
                with self.assertRaisesRegex(
                    BENCHMARK.BenchmarkStop,
                    "contract drifted",
                ):
                    BENCHMARK._validate_worker_result(forged, request)


if __name__ == "__main__":
    unittest.main()
