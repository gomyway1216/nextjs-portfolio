"""Argumentless local launcher for three concurrent strength-first QAT seeds."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

import fresh_qat_protocol as FRESH
import strength_first_qat_training_bridge as BRIDGE


FIXED_GIT_EXECUTABLE = "/usr/bin/git"
FIXED_GIT_ENVIRONMENT = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/var/empty",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_SYSTEM": "/dev/null",
    "GIT_GRAFT_FILE": "/dev/null",
    "GIT_OPTIONAL_LOCKS": "0",
    "GIT_TERMINAL_PROMPT": "0",
    "LC_ALL": "C",
    "LANG": "C",
}
FIXED_GIT_COMMAND_PREFIX = (
    "--no-replace-objects",
    "--no-optional-locks",
    "-c",
    "core.fsmonitor=false",
    "-c",
    "core.untrackedCache=false",
    "-c",
    "core.preloadIndex=false",
    "-c",
    "core.ignoreStat=false",
    "-c",
    "core.trustctime=true",
    "-c",
    "core.checkStat=default",
)


class StrengthFirstTrainingProcessFailed(RuntimeError):
    """One seed failed after all three local processes had been launched."""

    def __init__(self, seed: int, returncode: int):
        self.seed = seed
        self.returncode = returncode
        super().__init__(
            f"strength-first seed {seed} failed with exit code {returncode}"
        )


def _read_pipeline_revision(repo_root: str) -> str:
    try:
        completed = subprocess.run(
            [
                FIXED_GIT_EXECUTABLE,
                *FIXED_GIT_COMMAND_PREFIX,
                "rev-parse",
                "--verify",
                "HEAD^{commit}",
            ],
            cwd=repo_root,
            env=dict(FIXED_GIT_ENVIRONMENT),
            check=True,
            capture_output=True,
            text=False,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise ValueError("cannot read the strength-first pipeline revision") from error
    raw_revision = completed.stdout
    if (
        type(raw_revision) is not bytes
        or len(raw_revision) != 41
        or raw_revision[-1:] != b"\n"
        or any(
            byte not in b"0123456789abcdef"
            for byte in raw_revision[:40]
        )
    ):
        raise ValueError("strength-first pipeline revision is invalid")
    return raw_revision[:40].decode("ascii")


def build_strength_first_training_command(
    *,
    seed: int,
    output: str,
    paths: Mapping[str, str],
    pipeline_revision: str,
) -> list[str]:
    """Build one frozen warm-start command; there is no selection input."""

    return [
        paths["python"],
        str(Path(paths["repo_root"]) / "ml" / "train.py"),
        "--data",
        paths["model_training"],
        "--sibling-manifest",
        paths["teacher_manifest"],
        "--validation-partition-manifest",
        paths["role_bundle_manifest"],
        "--experiment-plan",
        paths["experiment_plan"],
        "--holdout-protected-position-ids",
        paths["holdout_protected_position_ids"],
        "--policy-exposure-receipt",
        paths["policy_exposure_receipt"],
        "--policy-exposed-parent-ids",
        paths["policy_exposed_parent_ids"],
        "--policy-exposed-semantic-position-ids",
        paths["policy_exposed_semantic_position_ids"],
        "--pipeline-revision",
        pipeline_revision,
        "--replay-data",
        paths["replay"],
        "--replay-excluded-position-ids",
        paths["replay_exclusion"],
        "--replay-limit",
        str(FRESH.FRESH_QAT_REPLAY_ROWS),
        "--replay-ratio",
        "1.0",
        "--out",
        output,
        "--epochs",
        "20",
        "--batch",
        "256",
        "--lr",
        "0.0001",
        "--k",
        "600.0",
        "--cp-clamp",
        "3000",
        "--limit",
        "0",
        "--device",
        "cpu",
        "--torch-threads",
        "2",
        "--seed",
        str(seed),
        "--experiment-family",
        "int16-aware",
        "--features",
        "board",
        "--loss",
        "sibling-ranking",
        "--rank-weight",
        "1.0",
        "--rank-pair-min",
        "50.0",
        "--rank-pair-max",
        "600.0",
        "--rank-margin-cp",
        "50.0",
        "--policy-weight",
        "0.25",
        "--policy-temp-cp",
        "200.0",
        "--select-metric",
        "auto",
        "--init-ckpt",
        paths["warm_initializer"],
        "--allow-legacy-init",
    ]


def _required_local_paths(paths: Mapping[str, str]) -> tuple[str, ...]:
    return (
        "experiment_plan",
        "teacher_manifest",
        "teacher_result",
        "teacher_work",
        "teacher_staged_result",
        "teacher_milestone_100",
        "teacher_milestone_500",
        "parent_completion",
        "model_training",
        "role_bundle_manifest",
        "input_training",
        "holdout_protected_position_ids",
        "policy_exposure_receipt",
        "policy_exposed_parent_ids",
        "policy_exposed_semantic_position_ids",
        "replay_exclusion",
        "replay",
        "warm_initializer",
        "python",
    )


def _stop_processes(processes: Sequence[tuple[int, Any]]) -> None:
    for _seed, process in processes:
        try:
            if process.poll() is None:
                process.terminate()
        except (OSError, ProcessLookupError):
            pass
    for _seed, process in processes:
        try:
            if process.poll() is None:
                process.wait(timeout=5)
        except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
            try:
                process.kill()
                process.wait(timeout=5)
            except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
                pass


def _validate_completed_result(output: str, seed: int) -> dict[str, Any]:
    result_path = Path(output) / "result.json"
    try:
        payload = json.loads(result_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError, json.JSONDecodeError) as error:
        raise ValueError(
            f"strength-first seed {seed} result is absent or invalid"
        ) from error
    contract = (
        payload.get("experiment_contract")
        if type(payload) is dict
        else None
    )
    if (
        type(payload) is not dict
        or payload.get("schema")
        != BRIDGE.STRENGTH_FIRST_QAT_TRAINING_RESULT_SCHEMA
        or payload.get("status") != "complete"
        or payload.get("selection_labels_read") is not False
        or payload.get("selection_evaluations") != 0
        or type(contract) is not dict
        or contract.get("seed") != seed
    ):
        raise ValueError(
            f"strength-first seed {seed} result did not close training-only"
        )
    return payload


def run_strength_first_three_seed_training(
    *,
    repo_root: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
    plan_loader: Callable[[str], Mapping[str, Any]] = (
        BRIDGE.load_strength_first_qat_training_plan
    ),
    revision_reader: Callable[[str], str] = _read_pipeline_revision,
    command_builder: Callable[..., list[str]] = (
        build_strength_first_training_command
    ),
    popen_factory: Callable[..., Any] = subprocess.Popen,
    result_validator: Callable[[str, int], Mapping[str, Any]] = (
        _validate_completed_result
    ),
    poll_interval_seconds: float = 0.05,
) -> dict[str, Any]:
    """Launch all seeds before waiting; fail one means stop the remaining two."""

    paths = BRIDGE.default_strength_first_local_paths(
        repo_root=repo_root,
        home=home,
    )
    plan = plan_loader(paths["experiment_plan"])
    expected_slots = [
        {
            "id": f"floodgate-strength-first-int16-aware-seed-{seed}",
            "seed": seed,
            "output": f"{BRIDGE.STRENGTH_FIRST_QAT_RUN_ROOT}/seed-{seed}",
        }
        for seed in FRESH.FRESH_QAT_SLOT_ORDER
    ]
    if type(plan) is not dict or plan.get("slots") != expected_slots:
        raise ValueError("strength-first runner received a non-exact slot grid")
    if plan.get("boundary") != {
        "training_only": True,
        "selection_label_read_authorized": False,
        "holdout_label_read_authorized": False,
        "candidate_selection_authorized": False,
        "production_weight_write_authorized": False,
    }:
        raise ValueError("strength-first runner received non-training authority")

    for key in _required_local_paths(paths):
        if not Path(paths[key]).is_file():
            raise ValueError(f"strength-first required local input is absent: {key}")
    revision = revision_reader(paths["repo_root"])
    slot_outputs = [
        (
            slot["seed"],
            str(Path(paths["repo_root"]) / slot["output"]),
        )
        for slot in plan["slots"]
    ]
    existing = [output for _seed, output in slot_outputs if Path(output).exists()]
    if existing:
        raise ValueError(
            "strength-first output slot already exists; preserve and inspect "
            "the prior attempt before starting another"
        )

    environment = dict(os.environ)
    environment.update(
        {
            "OMP_NUM_THREADS": "2",
            "MKL_NUM_THREADS": "2",
            "OPENBLAS_NUM_THREADS": "2",
            "VECLIB_MAXIMUM_THREADS": "2",
        }
    )
    processes: list[tuple[int, Any]] = []
    try:
        for seed, output in slot_outputs:
            command = command_builder(
                seed=seed,
                output=output,
                paths=paths,
                pipeline_revision=revision,
            )
            process = popen_factory(
                command,
                cwd=paths["repo_root"],
                env=environment,
            )
            processes.append((seed, process))
    except BaseException:
        _stop_processes(processes)
        raise

    completed: dict[int, int] = {}
    try:
        while len(completed) < len(processes):
            made_progress = False
            for seed, process in processes:
                if seed in completed:
                    continue
                returncode = process.poll()
                if returncode is None:
                    continue
                made_progress = True
                completed[seed] = returncode
                if returncode != 0:
                    _stop_processes(
                        [
                            (other_seed, other)
                            for other_seed, other in processes
                            if other_seed not in completed
                        ]
                    )
                    raise StrengthFirstTrainingProcessFailed(
                        seed,
                        returncode,
                    )
            if len(completed) < len(processes) and not made_progress:
                time.sleep(poll_interval_seconds)
    except BaseException:
        _stop_processes(processes)
        raise

    results = [
        result_validator(output, seed)
        for seed, output in slot_outputs
    ]
    return {
        "schema": (
            "shogi-floodgate-strength-first-three-seed-training-launch-v1"
        ),
        "status": "complete-three-training-processes",
        "seeds": list(FRESH.FRESH_QAT_SLOT_ORDER),
        "returncodes": {
            str(seed): completed[seed] for seed in FRESH.FRESH_QAT_SLOT_ORDER
        },
        "training_only": True,
        "selection_labels_read": False,
        "holdout_labels_read": False,
        "candidate_selected": False,
        "live_weights_changed": False,
        "result_schemas": [result["schema"] for result in results],
    }


def main() -> int:
    if len(sys.argv) != 1:
        print(
            "strength-first three-seed training is argumentless",
            file=sys.stderr,
        )
        return 2
    try:
        receipt = run_strength_first_three_seed_training()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[strength-first-training] STOP: {error}", file=sys.stderr)
        return 1
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "StrengthFirstTrainingProcessFailed",
    "build_strength_first_training_command",
    "run_strength_first_three_seed_training",
]
