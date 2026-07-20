import json
import os
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

import fresh_qat_protocol as FRESH  # noqa: E402
import run_strength_first_three_seed_training as RUNNER  # noqa: E402
import strength_first_qat_training_bridge as BRIDGE  # noqa: E402


BOUNDARY = {
    "training_only": True,
    "selection_label_read_authorized": False,
    "holdout_label_read_authorized": False,
    "candidate_selection_authorized": False,
    "production_weight_write_authorized": False,
}


def slots():
    return [
        {
            "id": f"floodgate-strength-first-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH.FRESH_QAT_SLOT_ORDER
    ]


def plan_loader(_path):
    return {"slots": slots(), "boundary": dict(BOUNDARY)}


def prepare_local_files(repo, home):
    paths = BRIDGE.default_strength_first_local_paths(
        repo_root=repo,
        home=home,
        teacher_generation="v9",
    )
    (repo / "ml").mkdir(parents=True, exist_ok=True)
    (repo / "ml" / "train.py").write_text("# injected smoke\n")
    for key in RUNNER._required_local_paths(paths):
        target = Path(paths[key])
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.write_bytes(f"{key}\n".encode("ascii"))
    return paths


def synthetic_result(seed):
    return {
        "schema": BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
        "status": "complete",
        "selection_labels_read": False,
        "selection_evaluations": 0,
        "experiment_contract": {"seed": seed},
    }


class FakeProcess:
    def __init__(self, returncode=0):
        self.returncode = returncode
        self.terminated = False
        self.killed = False

    def poll(self):
        return self.returncode

    def terminate(self):
        self.terminated = True
        self.returncode = -15

    def kill(self):
        self.killed = True
        self.returncode = -9

    def wait(self, timeout=None):
        del timeout
        return self.returncode


class PendingProcess(FakeProcess):
    def __init__(self):
        super().__init__(None)


class StrengthFirstThreeSeedRunnerTests(unittest.TestCase):
    def test_revision_reader_uses_fixed_git_configuration_and_environment(self):
        completed = SimpleNamespace(stdout=b"a" * 40 + b"\n")
        with (
            mock.patch.dict(
                os.environ,
                {
                    "PATH": "/attacker",
                    "GIT_DIR": "/attacker",
                    "GIT_WORK_TREE": "/attacker/worktree",
                    "GIT_CONFIG_COUNT": "1",
                    "GIT_CONFIG_KEY_0": "core.fsmonitor",
                    "GIT_CONFIG_VALUE_0": "/attacker/helper",
                    "DYLD_INSERT_LIBRARIES": "/attacker/library",
                    "LD_PRELOAD": "/attacker/library",
                },
            ),
            mock.patch.object(
                RUNNER.subprocess,
                "run",
                return_value=completed,
            ) as invoked,
        ):
            self.assertEqual(
                RUNNER._read_pipeline_revision("/fixed/repository"),
                "a" * 40,
            )

        command = invoked.call_args.args[0]
        options = invoked.call_args.kwargs
        self.assertEqual(command[0], "/usr/bin/git")
        self.assertEqual(
            command[1:],
            [
                *RUNNER.FIXED_GIT_COMMAND_PREFIX,
                "rev-parse",
                "--verify",
                "HEAD^{commit}",
            ],
        )
        self.assertEqual(options["cwd"], "/fixed/repository")
        self.assertEqual(options["env"], RUNNER.FIXED_GIT_ENVIRONMENT)
        self.assertNotIn("GIT_DIR", options["env"])
        self.assertNotIn("GIT_WORK_TREE", options["env"])
        self.assertNotIn("GIT_CONFIG_COUNT", options["env"])
        self.assertNotIn("DYLD_INSERT_LIBRARIES", options["env"])
        self.assertNotIn("LD_PRELOAD", options["env"])
        self.assertTrue(options["check"])
        self.assertTrue(options["capture_output"])
        self.assertFalse(options["text"])

        for malformed in (
            b"a" * 40,
            b"a" * 40 + b"\n\n",
            b"a" * 40 + b"\r\n",
            b"A" * 40 + b"\n",
            b"a" * 39 + b"\n",
            b"a" * 39 + b"\0\n",
            "a" * 40 + "\n",
        ):
            with self.subTest(malformed=malformed):
                with mock.patch.object(
                    RUNNER.subprocess,
                    "run",
                    return_value=SimpleNamespace(stdout=malformed),
                ):
                    with self.assertRaisesRegex(
                        ValueError,
                        "revision is invalid",
                    ):
                        RUNNER._read_pipeline_revision(
                            "/fixed/repository",
                        )

        for failure in (
            OSError("unavailable"),
            subprocess.CalledProcessError(1, ["/usr/bin/git"]),
        ):
            with self.subTest(failure=type(failure).__name__):
                with mock.patch.object(
                    RUNNER.subprocess,
                    "run",
                    side_effect=failure,
                ):
                    with self.assertRaisesRegex(
                        ValueError,
                        "cannot read",
                    ):
                        RUNNER._read_pipeline_revision(
                            "/fixed/repository",
                        )

    def test_completed_result_rejects_non_object_nested_contract(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            result_path = output / "result.json"
            malformed = (
                [],
                {
                    **synthetic_result(42),
                    "experiment_contract": None,
                },
                {
                    **synthetic_result(42),
                    "experiment_contract": [],
                },
            )
            for payload in malformed:
                with self.subTest(payload=payload):
                    result_path.write_text(
                        json.dumps(payload),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(
                        ValueError,
                        "did not close training-only",
                    ):
                        RUNNER._validate_completed_result(
                            str(output),
                            42,
                        )

    def test_absent_exact_plan_stops_before_revision_or_process_dispatch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            home = root / "home"
            repo.mkdir()
            revision_reader = mock.Mock()
            factory = mock.Mock()
            with self.assertRaisesRegex(ValueError, "data-only plan"):
                RUNNER.run_strength_first_three_seed_training(
                    repo_root=repo,
                    home=home,
                    revision_reader=revision_reader,
                    popen_factory=factory,
                )
            revision_reader.assert_not_called()
            factory.assert_not_called()

    def test_builds_frozen_training_only_commands_and_spawns_all_before_poll(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            home = root / "home"
            prepare_local_files(repo, home)
            created = []
            commands = []

            class PollAfterAllSpawned(FakeProcess):
                def poll(self):
                    if len(created) != 3:
                        raise AssertionError("process polled before all seeds spawned")
                    return 0

            def factory(command, **kwargs):
                commands.append((command, kwargs))
                process = PollAfterAllSpawned()
                created.append(process)
                return process

            receipt = RUNNER.run_strength_first_three_seed_training(
                repo_root=repo,
                home=home,
                plan_loader=plan_loader,
                revision_reader=lambda _root: "a" * 40,
                popen_factory=factory,
                result_validator=lambda _output, _seed: {
                    "schema": (
                        BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA
                    )
                },
                poll_interval_seconds=0,
            )

            self.assertEqual(len(created), 3)
            self.assertEqual(
                [
                    int(command[command.index("--seed") + 1])
                    for command, _kwargs in commands
                ],
                [42, 43, 44],
            )
            for command, kwargs in commands:
                self.assertNotIn("--val-data", command)
                self.assertEqual(command[command.index("--epochs") + 1], "20")
                self.assertEqual(command[command.index("--batch") + 1], "256")
                self.assertEqual(command[command.index("--lr") + 1], "0.0001")
                self.assertEqual(command[command.index("--device") + 1], "cpu")
                self.assertEqual(
                    command[command.index("--torch-threads") + 1],
                    "2",
                )
                self.assertIn("--allow-legacy-init", command)
                self.assertEqual(kwargs["env"]["OMP_NUM_THREADS"], "2")
                self.assertEqual(kwargs["env"]["MKL_NUM_THREADS"], "2")
            self.assertTrue(receipt["training_only"])
            self.assertFalse(receipt["selection_labels_read"])
            self.assertFalse(receipt["holdout_labels_read"])
            self.assertFalse(receipt["candidate_selected"])
            self.assertFalse(receipt["live_weights_changed"])

    def test_one_seed_failure_terminates_remaining_processes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            home = root / "home"
            prepare_local_files(repo, home)
            processes = [
                PendingProcess(),
                FakeProcess(7),
                PendingProcess(),
            ]
            created = []

            def factory(_command, **_kwargs):
                process = processes[len(created)]
                created.append(process)
                return process

            with self.assertRaises(
                RUNNER.StrengthFirstTrainingProcessFailed
            ) as raised:
                RUNNER.run_strength_first_three_seed_training(
                    repo_root=repo,
                    home=home,
                    plan_loader=plan_loader,
                    revision_reader=lambda _root: "b" * 40,
                    popen_factory=factory,
                    result_validator=mock.Mock(),
                    poll_interval_seconds=0,
                )
            self.assertEqual(raised.exception.seed, 43)
            self.assertEqual(raised.exception.returncode, 7)
            self.assertEqual(len(created), 3)
            self.assertTrue(processes[0].terminated)
            self.assertTrue(processes[2].terminated)

    def test_small_injected_real_subprocess_smoke(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            home = root / "home"
            prepare_local_files(repo, home)
            smoke = (
                "import json,pathlib,sys;"
                "out=pathlib.Path(sys.argv[1]);seed=int(sys.argv[2]);"
                "out.mkdir(parents=True);"
                "payload={'schema':sys.argv[3],'status':'complete',"
                "'selection_labels_read':False,'selection_evaluations':0,"
                "'experiment_contract':{'seed':seed}};"
                "(out/'result.json').write_text("
                "json.dumps(payload),encoding='utf-8')"
            )

            def command_builder(*, seed, output, **_kwargs):
                return [
                    sys.executable,
                    "-c",
                    smoke,
                    output,
                    str(seed),
                    BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA,
                ]

            receipt = RUNNER.run_strength_first_three_seed_training(
                repo_root=repo,
                home=home,
                plan_loader=plan_loader,
                revision_reader=lambda _root: "c" * 40,
                command_builder=command_builder,
                poll_interval_seconds=0.001,
            )
            self.assertEqual(receipt["status"], "complete-three-training-processes")
            self.assertEqual(receipt["returncodes"], {"42": 0, "43": 0, "44": 0})
            for seed in FRESH.FRESH_QAT_SLOT_ORDER:
                output = (
                    repo
                    / BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT
                    / f"seed-{seed}"
                )
                self.assertEqual(
                    json.loads((output / "result.json").read_text())[
                        "experiment_contract"
                    ]["seed"],
                    seed,
                )

    def test_existing_output_stops_before_any_process_is_spawned(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            repo = root / "repo"
            home = root / "home"
            prepare_local_files(repo, home)
            (
                repo
                / BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT
                / "seed-42"
            ).mkdir(parents=True)
            factory = mock.Mock()
            with self.assertRaisesRegex(ValueError, "already exists"):
                RUNNER.run_strength_first_three_seed_training(
                    repo_root=repo,
                    home=home,
                    plan_loader=plan_loader,
                    revision_reader=lambda _root: "d" * 40,
                    popen_factory=factory,
                )
            factory.assert_not_called()


if __name__ == "__main__":
    unittest.main()
