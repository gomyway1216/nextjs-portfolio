from __future__ import annotations

import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest


ML_DIR = Path(__file__).resolve().parents[1]
if str(ML_DIR) not in sys.path:
    sys.path.insert(0, str(ML_DIR))

import build_strength_first_qat_constrained_alignment_v2_plan_candidate as BUILDER  # noqa: E402
import run_strength_first_three_seed_constrained_alignment_v2 as RUNNER  # noqa: E402
import strength_first_qat_constrained_alignment_v2_protocol as PROTOCOL  # noqa: E402


REPO = ML_DIR.parent


def prepare_candidate_repo(root: Path) -> dict:
    for relative in (
        "ml/protocols/floodgate-q1-2026-strength-first-qat-training-plan.json",
        PROTOCOL.PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH,
    ):
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((REPO / relative).read_bytes())
    for relative in PROTOCOL.ALIGNMENT_SOURCE_PATHS.values():
        target = root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(f"# synthetic {relative}\n".encode("utf-8"))
    return BUILDER.build_alignment_plan_candidate(repo_root=root)


class AlignmentProtocolTests(unittest.TestCase):
    def test_real_candidate_enrolls_exact_parents_and_fixed_recipe(self):
        candidate = BUILDER.build_alignment_plan_candidate(repo_root=REPO)
        self.assertEqual(
            [parent["seed"] for parent in candidate["parents"]],
            [42, 43, 44],
        )
        self.assertEqual(
            [parent["checkpoint"]["epoch"] for parent in candidate["parents"]],
            [20, 20, 20],
        )
        self.assertEqual(candidate["training"], PROTOCOL.ALIGNMENT_TRAINING)
        self.assertEqual(candidate["boundary"], PROTOCOL.ALIGNMENT_BOUNDARY)
        self.assertEqual(candidate["training"]["local_epochs"], 4)
        self.assertEqual(candidate["training"]["final_epoch"], 24)
        self.assertEqual(candidate["training"]["replay_rows"], 0)
        self.assertFalse(
            candidate["development"]["spent_selection_received_by_training"]
        )
        self.assertEqual(
            PROTOCOL.validate_alignment_plan(candidate),
            candidate,
        )

    def test_builder_is_deterministic_and_refuses_tracked_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first = prepare_candidate_repo(root)
            second = BUILDER.build_alignment_plan_candidate(repo_root=root)
            self.assertEqual(first, second)
            plan_path = root / PROTOCOL.ALIGNMENT_PLAN_RELATIVE_PATH
            plan_path.parent.mkdir(parents=True, exist_ok=True)
            plan_path.write_bytes(PROTOCOL.canonical_json_bytes(first))
            self.assertEqual(
                BUILDER.build_alignment_plan_candidate(repo_root=root),
                first,
            )
            plan_path.write_bytes(b"{}\n")
            with self.assertRaisesRegex(
                BUILDER.AlignmentPlanCandidateError,
                "differs",
            ):
                BUILDER.build_alignment_plan_candidate(repo_root=root)

    def test_registered_source_mutation_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            candidate = prepare_candidate_repo(root)
            identity = candidate["implementation"]["alignment_core"]
            self.assertTrue(
                PROTOCOL.verify_registered_file(
                    root,
                    identity,
                    "alignment core",
                )
            )
            (root / identity["path"]).write_text(
                "# mutated after registration\n",
                encoding="utf-8",
            )
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                PROTOCOL.verify_registered_file(
                    root,
                    identity,
                    "alignment core",
                )

    def test_strict_json_rejects_overflow_to_nonfinite(self):
        with self.assertRaisesRegex(ValueError, "non-finite"):
            PROTOCOL.strict_json(b'{"value":1e999}\n', "fixture")

    def test_builder_rejects_parent_registry_drift(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            prepare_candidate_repo(root)
            registry_path = root / PROTOCOL.PARENT_PREFLIGHT_REGISTRY_RELATIVE_PATH
            registry = PROTOCOL.strict_json(registry_path.read_bytes(), "registry")
            registry["runs"][0]["slot_id"] = "wrong-parent-slot"
            registry_path.write_bytes(PROTOCOL.canonical_json_bytes(registry))
            with self.assertRaisesRegex(
                BUILDER.AlignmentPlanCandidateError,
                "registry entry drifted|base plan",
            ):
                BUILDER.build_alignment_plan_candidate(repo_root=root)

    def test_plan_rejects_recipe_parent_and_source_drift(self):
        candidate = BUILDER.build_alignment_plan_candidate(repo_root=REPO)
        mutations = []
        wrong_lr = copy.deepcopy(candidate)
        wrong_lr["training"]["learning_rate"] = 0.0001
        mutations.append(wrong_lr)
        wrong_epoch = copy.deepcopy(candidate)
        wrong_epoch["parents"][0]["checkpoint"]["epoch"] = 19
        mutations.append(wrong_epoch)
        wrong_seed = copy.deepcopy(candidate)
        wrong_seed["parents"][0]["seed"] = 43
        mutations.append(wrong_seed)
        wrong_source = copy.deepcopy(candidate)
        wrong_source["implementation"]["alignment_core"]["path"] = "ml/other.py"
        mutations.append(wrong_source)
        extra_authority = copy.deepcopy(candidate)
        extra_authority["boundary"]["selection_label_read_authorized"] = True
        mutations.append(extra_authority)
        for mutation in mutations:
            with self.subTest(mutation=mutation):
                with self.assertRaises(ValueError):
                    PROTOCOL.validate_alignment_plan(mutation)

    def test_contract_has_no_replay_selection_or_holdout_authority(self):
        plan = BUILDER.build_alignment_plan_candidate(repo_root=REPO)
        contract = PROTOCOL.alignment_contract(plan, 42)
        plan_raw = PROTOCOL.canonical_json_bytes(plan)
        self.assertEqual(contract["alignment_plan_bytes"], len(plan_raw))
        self.assertEqual(len(contract["alignment_plan_sha256"]), 64)
        self.assertEqual(contract["parent_epoch"], 20)
        self.assertEqual(contract["final_epoch"], 24)
        self.assertEqual(contract["training"]["replay_rows"], 0)
        self.assertFalse(contract["boundary"]["replay_read_authorized"])
        self.assertFalse(contract["boundary"]["selection_label_read_authorized"])
        self.assertFalse(contract["boundary"]["final_holdout_label_read_authorized"])
        expected = [
            0.00001,
            0.00001 * (2**0.5 + 2) / 4,
            0.000005,
            0.00001 * (2 - 2**0.5) / 4,
        ]
        for observed, wanted in zip(PROTOCOL.cosine_learning_rates(), expected):
            self.assertAlmostEqual(observed, wanted, places=16)


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


class AlignmentRunnerTests(unittest.TestCase):
    def prepare(self, root: Path):
        repo = root / "repo"
        home = root / "home"
        repo.mkdir()
        home.mkdir()
        trainer = repo / "ml/train_strength_first_qat_constrained_alignment_v2.py"
        trainer.parent.mkdir(parents=True)
        trainer.write_text("# synthetic\n", encoding="utf-8")
        python = home / RUNNER.TRAINING_PYTHON_RELATIVE_HOME
        python.parent.mkdir(parents=True)
        python.write_text("synthetic\n", encoding="utf-8")
        plan = BUILDER.build_alignment_plan_candidate(repo_root=REPO)
        return repo, home, plan

    def test_spawns_all_three_before_poll_with_fixed_environment(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, home, plan = self.prepare(Path(directory))
            created = []
            calls = []

            class PollAfterAllSpawned(FakeProcess):
                def poll(self):
                    if len(created) != 3:
                        raise AssertionError("polled before all seeds spawned")
                    return 0

            def factory(command, **kwargs):
                process = PollAfterAllSpawned()
                created.append(process)
                calls.append((command, kwargs))
                return process

            receipt = RUNNER.run_three_seed_alignment(
                repo_root=repo,
                home=home,
                plan_loader=lambda **_kwargs: copy.deepcopy(plan),
                popen_factory=factory,
                result_validator=lambda **_kwargs: {
                    "schema": PROTOCOL.ALIGNMENT_RESULT_SCHEMA
                },
                poll_interval_seconds=0,
            )
        self.assertEqual(receipt["seeds"], [42, 43, 44])
        self.assertEqual(len(calls), 3)
        self.assertEqual(
            [int(call[0][-1]) for call in calls],
            [42, 43, 44],
        )
        for _command, options in calls:
            for name, value in RUNNER.FIXED_PROCESS_ENVIRONMENT.items():
                self.assertEqual(options["env"][name], value)
        self.assertEqual(receipt["replay_rows_read"], 0)
        self.assertFalse(receipt["selection_labels_read"])
        self.assertFalse(receipt["final_holdout_labels_read"])

    def test_existing_output_stops_before_process_spawn(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, home, plan = self.prepare(Path(directory))
            (repo / plan["slots"][1]["output"]).mkdir(parents=True)
            called = []
            with self.assertRaisesRegex(ValueError, "already exists"):
                RUNNER.run_three_seed_alignment(
                    repo_root=repo,
                    home=home,
                    plan_loader=lambda **_kwargs: copy.deepcopy(plan),
                    popen_factory=lambda *args, **kwargs: called.append((args, kwargs)),
                )
            self.assertEqual(called, [])

    def test_result_validation_binds_boundary_and_checkpoint_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            slot = PROTOCOL.expected_slots()[0]
            output = root / slot["output"]
            output.mkdir(parents=True)
            checkpoint = b"exact final checkpoint"
            (output / "final.pt").write_bytes(checkpoint)
            result = {
                "schema": PROTOCOL.ALIGNMENT_RESULT_SCHEMA,
                "status": "complete",
                "contract": {"seed": 42},
                "completed_local_epochs": 4,
                "final_epoch": 24,
                "quantized_invariant": {
                    "schema": "shogi-strength-first-quantized-cell-anchor-v2",
                    "aggregate_sha256": "a" * 64,
                    "tensors": {"w1_board": {}},
                },
                "candidate_artifact": {
                    "name": "final.pt",
                    "bytes": len(checkpoint),
                    "sha256": hashlib.sha256(checkpoint).hexdigest(),
                },
                "replay_rows_read": 0,
                "selection_labels_read": False,
                "selection_evaluations": 0,
                "final_holdout_labels_read": False,
                "candidate_selected": False,
                "live_weights_changed": False,
            }
            (output / "result.json").write_text(
                json.dumps(result),
                encoding="utf-8",
            )
            self.assertEqual(
                RUNNER._validate_result(repo_root=root, slot=slot),
                result,
            )
            for field, bad in (
                ("selection_evaluations", 1),
                ("candidate_selected", True),
                ("live_weights_changed", True),
            ):
                with self.subTest(field=field):
                    mutation = copy.deepcopy(result)
                    mutation[field] = bad
                    (output / "result.json").write_text(
                        json.dumps(mutation),
                        encoding="utf-8",
                    )
                    with self.assertRaises(ValueError):
                        RUNNER._validate_result(repo_root=root, slot=slot)

            for field, bad in (
                ("aggregate_sha256", "A" * 64),
                ("aggregate_sha256", "g" * 64),
                ("sha256", "A" * 64),
                ("sha256", "g" * 64),
            ):
                with self.subTest(field=field, bad=bad[0]):
                    mutation = copy.deepcopy(result)
                    target = (
                        mutation["quantized_invariant"]
                        if field == "aggregate_sha256"
                        else mutation["candidate_artifact"]
                    )
                    target[field] = bad
                    (output / "result.json").write_text(
                        json.dumps(mutation),
                        encoding="utf-8",
                    )
                    with self.assertRaisesRegex(ValueError, "training-only"):
                        RUNNER._validate_result(repo_root=root, slot=slot)

            (output / "result.json").write_text(
                json.dumps(result),
                encoding="utf-8",
            )
            (output / "final.pt").write_bytes(b"tampered")
            with self.assertRaisesRegex(ValueError, "identity mismatch"):
                RUNNER._validate_result(repo_root=root, slot=slot)

    def test_one_failure_stops_pending_peers(self):
        with tempfile.TemporaryDirectory() as directory:
            repo, home, plan = self.prepare(Path(directory))
            processes = [FakeProcess(0), FakeProcess(7), FakeProcess(None)]
            pending = processes[2]
            queue = list(processes)
            with self.assertRaisesRegex(
                RUNNER.AlignmentProcessFailed,
                "seed 43",
            ):
                RUNNER.run_three_seed_alignment(
                    repo_root=repo,
                    home=home,
                    plan_loader=lambda **_kwargs: copy.deepcopy(plan),
                    popen_factory=lambda *_args, **_kwargs: queue.pop(0),
                    result_validator=lambda **_kwargs: {},
                    poll_interval_seconds=0,
                )
            self.assertTrue(pending.terminated)


if __name__ == "__main__":
    unittest.main()
