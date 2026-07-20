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
HASH_C = "c" * 64
FILE_IDENTITY = {"bytes": 1, "sha256": HASH_A}


def runtime(threads, cpu_model="test-cpu"):
    return {
        "platform": "test-platform",
        "system": "Darwin",
        "machine": "arm64",
        "processor": "arm",
        "cpu_model": cpu_model,
        "logical_cpu_count": 14,
        "python": {
            "implementation": "CPython",
            "version": "3.13.0",
            "executable": dict(FILE_IDENTITY),
        },
        "torch": {
            "version": "2.12.1",
            "module": dict(FILE_IDENTITY),
            "native_module": dict(FILE_IDENTITY),
        },
        "device": "cpu",
        "torch_threads": threads,
        "torch_interop_threads": 1,
        "deterministic_algorithms": True,
        "deterministic_debug_mode": "error",
    }


def worker(
    seed,
    threads,
    model=HASH_A,
    probe=HASH_B,
    optimizer=HASH_C,
    cpu_model="test-cpu",
):
    observed_runtime = runtime(threads, cpu_model)
    return {
        "seed": seed,
        "model_tensor_sha256": model,
        "probe_output_sha256": probe,
        "optimizer_state_sha256": optimizer,
        "runtime_start": observed_runtime,
        "runtime_end": dict(observed_runtime),
    }


def trial(ordinal, threads, compute_ns, overrides=None):
    workers = [worker(seed, threads) for seed in BENCHMARK.SEEDS]
    for seed, values in (overrides or {}).items():
        workers[BENCHMARK.SEEDS.index(seed)].update(values)
    return {
        "ordinal": ordinal,
        "threads_per_seed": threads,
        "compute_ns": compute_ns,
        "workers": workers,
    }


class FakeArray:
    def __init__(self, raw):
        self.raw = raw

    def tobytes(self, order):
        if order != "C":
            raise AssertionError("tensor digest must use logical C-order bytes")
        return self.raw


class FakeTensor:
    def __init__(self, raw=b"\0\0\0\0", finite=True, storage_suffix=b""):
        self.raw = raw
        self.storage_suffix = storage_suffix
        self.finite = finite
        self.dtype = "torch.float32"
        self.shape = (len(raw),)
        self.requires_grad = False

    def is_floating_point(self):
        return True

    def detach(self):
        return self

    def cpu(self):
        return self

    def contiguous(self):
        return self

    def clone(self):
        return FakeTensor(self.raw, self.finite, self.storage_suffix)

    def untyped_storage(self):
        return self.raw + self.storage_suffix

    def numpy(self):
        return FakeArray(self.raw)

    def all(self):
        return self

    def item(self):
        return self.finite


class FakeTorch:
    Tensor = FakeTensor
    int64 = "torch.int64"

    @staticmethod
    def isfinite(value):
        return value


class FakeOptimizer:
    def __init__(self, moment):
        self.moment = moment

    def state_dict(self):
        return {
            "state": {
                0: {
                    "step": FakeTensor(b"\x01"),
                    "exp_avg": self.moment,
                    "exp_avg_sq": FakeTensor(b"\x02"),
                }
            },
            "param_groups": [
                {
                    "lr": 0.0001,
                    "betas": (0.9, 0.999),
                    "params": [0],
                }
            ],
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

    def test_display_ppm_rounding_cannot_open_the_exact_speed_gate(self):
        decision = BENCHMARK._select_threads(
            [
                trial(1, 2, 2_099_999),
                trial(2, 4, 2_000_000),
                trial(3, 4, 2_000_000),
                trial(4, 2, 2_099_999),
            ]
        )
        self.assertEqual(decision["median_speedup_ppm"], 1_050_000)
        self.assertFalse(decision["median_speedup_gate_passed"])
        self.assertEqual(decision["selected_threads_per_seed"], 2)

    def test_same_setting_model_or_probe_mismatch_stops(self):
        cases = (
            {42: {"model_tensor_sha256": "d" * 64}},
            {42: {"probe_output_sha256": "d" * 64}},
            {42: {"optimizer_state_sha256": "d" * 64}},
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
            worker(
                seed,
                4,
                model=("d" * 64 if seed == 43 else HASH_A),
            )
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

    def test_runtime_must_be_stable_and_identical_across_all_workers(self):
        changed_during_compute = [
            trial(1, 2, 110),
            trial(2, 4, 100),
            trial(3, 4, 100),
            trial(4, 2, 110),
        ]
        changed_during_compute[0]["workers"][0]["runtime_end"] = runtime(
            2,
            "replacement-cpu",
        )
        with self.assertRaisesRegex(
            BENCHMARK.BenchmarkStop,
            "runtime changed during compute",
        ):
            BENCHMARK._select_threads(changed_during_compute)

        different_worker = [
            trial(1, 2, 110),
            trial(2, 4, 100),
            trial(3, 4, 100),
            trial(4, 2, 110),
        ]
        different_worker[2]["workers"][1]["runtime_start"] = runtime(
            4,
            "replacement-cpu",
        )
        different_worker[2]["workers"][1]["runtime_end"] = runtime(
            4,
            "replacement-cpu",
        )
        with self.assertRaisesRegex(
            BENCHMARK.BenchmarkStop,
            "runtime identity differs across ABBA",
        ):
            BENCHMARK._select_threads(different_worker)

    def test_nonfinite_tasks_and_optimizer_state_stop_before_hash_parity(self):
        BENCHMARK._require_finite_values(
            FakeTorch,
            (FakeTensor(), FakeTensor()),
            "test task",
        )
        with self.assertRaisesRegex(
            BENCHMARK.BenchmarkStop,
            "test task contains a non-finite value",
        ):
            BENCHMARK._require_finite_values(
                FakeTorch,
                (FakeTensor(), FakeTensor(finite=False)),
                "test task",
            )

        first = BENCHMARK._optimizer_digest(
            FakeTorch,
            FakeOptimizer(FakeTensor(b"\x03")),
        )
        repeated = BENCHMARK._optimizer_digest(
            FakeTorch,
            FakeOptimizer(FakeTensor(b"\x03")),
        )
        different = BENCHMARK._optimizer_digest(
            FakeTorch,
            FakeOptimizer(FakeTensor(b"\x04")),
        )
        self.assertEqual(first, repeated)
        self.assertNotEqual(first, different)
        with self.assertRaisesRegex(
            BENCHMARK.BenchmarkStop,
            "AdamW state contains a non-finite tensor",
        ):
            BENCHMARK._optimizer_digest(
                FakeTorch,
                FakeOptimizer(FakeTensor(finite=False)),
            )

    def test_final_model_and_integer_probe_checks_are_fail_closed(self):
        train = SimpleNamespace(require_finite_model_parameters=mock.Mock())
        model = object()
        BENCHMARK._require_finite_model(train, model)
        train.require_finite_model_parameters.assert_called_once_with(
            model,
            "thread benchmark final",
        )
        train.require_finite_model_parameters.side_effect = ValueError("nan")
        with self.assertRaisesRegex(
            BENCHMARK.BenchmarkStop,
            "final model contains a non-finite parameter",
        ):
            BENCHMARK._require_finite_model(train, model)

        BENCHMARK._require_integer_probe(
            FakeTorch,
            SimpleNamespace(dtype=FakeTorch.int64, requires_grad=False),
        )
        for probe in (
            SimpleNamespace(dtype="torch.float32", requires_grad=False),
            SimpleNamespace(dtype=FakeTorch.int64, requires_grad=True),
        ):
            with self.assertRaisesRegex(
                BENCHMARK.BenchmarkStop,
                "fixed probe integer output drifted",
            ):
                BENCHMARK._require_integer_probe(FakeTorch, probe)

    def test_tensor_digest_excludes_unused_backing_storage_bytes(self):
        first = BENCHMARK._tensor_digest(
            [("view", FakeTensor(b"\x01\x02", storage_suffix=b"\xaa"))]
        )
        same_logical = BENCHMARK._tensor_digest(
            [("view", FakeTensor(b"\x01\x02", storage_suffix=b"\xbb\xcc"))]
        )
        different_logical = BENCHMARK._tensor_digest(
            [("view", FakeTensor(b"\x01\x03", storage_suffix=b"\xaa"))]
        )
        self.assertEqual(first, same_logical)
        self.assertNotEqual(first, different_logical)

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
                            "optimizer_state_sha256": HASH_C,
                            "runtime_start": runtime(2),
                            "runtime_end": runtime(2),
                            "training_only": True,
                            "selection_labels_read": False,
                            "holdout_labels_read": False,
                            "live_weights_changed": False,
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
                self.assertNotEqual(kwargs["stderr"], subprocess.PIPE)
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
            "optimizer_state_sha256": HASH_C,
            "runtime_start": runtime(2),
            "runtime_end": runtime(2),
            "training_only": True,
            "selection_labels_read": False,
            "holdout_labels_read": False,
            "live_weights_changed": False,
        }
        self.assertEqual(BENCHMARK._validate_worker_result(valid, request), valid)
        for field in (
            "training_only",
            "selection_labels_read",
            "holdout_labels_read",
            "live_weights_changed",
            "model_tensor_sha256",
            "optimizer_state_sha256",
        ):
            with self.subTest(field=field):
                forged = dict(valid)
                forged[field] = (
                    None
                    if field in {
                        "model_tensor_sha256",
                        "optimizer_state_sha256",
                    }
                    else not forged[field]
                )
                with self.assertRaisesRegex(
                    BENCHMARK.BenchmarkStop,
                    "contract drifted",
                ):
                    BENCHMARK._validate_worker_result(forged, request)


if __name__ == "__main__":
    unittest.main()
