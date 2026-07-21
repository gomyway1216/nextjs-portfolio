"""Argumentless launcher for three concurrent constrained-alignment seeds."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import Any

import strength_first_qat_constrained_alignment_v2_protocol as PROTOCOL


FIXED_PROCESS_ENVIRONMENT = {
    "PYTHONHASHSEED": "0",
    "OMP_NUM_THREADS": "2",
    "MKL_NUM_THREADS": "2",
    "OPENBLAS_NUM_THREADS": "2",
    "VECLIB_MAXIMUM_THREADS": "2",
    "OMP_DYNAMIC": "FALSE",
    "MKL_DYNAMIC": "FALSE",
}
TRAINING_PYTHON_RELATIVE_HOME = ".codex/shogi-data/floodgate-training-venv/bin/python3"


class AlignmentProcessFailed(RuntimeError):
    def __init__(self, seed: int, returncode: int):
        self.seed = seed
        self.returncode = returncode
        super().__init__(
            f"constrained-alignment seed {seed} failed with exit code {returncode}"
        )


def build_alignment_command(*, seed: int, repo_root: str, home: str) -> list[str]:
    if seed not in PROTOCOL.ALIGNMENT_SEEDS:
        raise ValueError("constrained-alignment seed is not registered")
    return [
        str(Path(home) / TRAINING_PYTHON_RELATIVE_HOME),
        str(
            Path(repo_root)
            / "ml"
            / "train_strength_first_qat_constrained_alignment_v2.py"
        ),
        "--seed",
        str(seed),
    ]


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


def _validate_result(*, repo_root: Path, slot: Mapping[str, Any]) -> dict[str, Any]:
    result_path = repo_root / slot["output"] / "result.json"
    try:
        value = PROTOCOL.strict_json(
            result_path.read_bytes(),
            f"alignment seed {slot['seed']} result",
        )
    except (OSError, ValueError) as error:
        raise ValueError(
            f"alignment seed {slot['seed']} result is absent or invalid"
        ) from error
    contract = value.get("contract")
    quantized_invariant = value.get("quantized_invariant")
    candidate = value.get("candidate_artifact")
    if (
        value.get("schema") != PROTOCOL.ALIGNMENT_RESULT_SCHEMA
        or value.get("status") != "complete"
        or value.get("completed_local_epochs") != 4
        or value.get("final_epoch") != 24
        or value.get("replay_rows_read") != 0
        or value.get("selection_labels_read") is not False
        or value.get("selection_evaluations") != 0
        or value.get("final_holdout_labels_read") is not False
        or value.get("candidate_selected") is not False
        or value.get("live_weights_changed") is not False
        or type(contract) is not dict
        or contract.get("seed") != slot["seed"]
        or type(quantized_invariant) is not dict
        or quantized_invariant.get("schema")
        != "shogi-strength-first-quantized-cell-anchor-v2"
        or type(quantized_invariant.get("aggregate_sha256")) is not str
        or len(quantized_invariant["aggregate_sha256"]) != 64
        or type(quantized_invariant.get("tensors")) is not dict
        or type(candidate) is not dict
        or set(candidate) != {"name", "bytes", "sha256"}
        or candidate.get("name") != "final.pt"
        or type(candidate.get("bytes")) is not int
        or candidate["bytes"] < 1
        or type(candidate.get("sha256")) is not str
        or len(candidate["sha256"]) != 64
    ):
        raise ValueError(
            f"alignment seed {slot['seed']} result did not close training-only"
        )
    checkpoint_path = repo_root / slot["output"] / "final.pt"
    try:
        checkpoint_raw = checkpoint_path.read_bytes()
    except OSError as error:
        raise ValueError(
            f"alignment seed {slot['seed']} checkpoint is absent"
        ) from error
    if (
        len(checkpoint_raw) != candidate["bytes"]
        or hashlib.sha256(checkpoint_raw).hexdigest() != candidate["sha256"]
    ):
        raise ValueError(f"alignment seed {slot['seed']} checkpoint identity mismatch")
    return value


def run_three_seed_alignment(
    *,
    repo_root: str | os.PathLike[str] | None = None,
    home: str | os.PathLike[str] | None = None,
    plan_loader: Callable[..., Mapping[str, Any]] = PROTOCOL.load_alignment_plan,
    command_builder: Callable[..., list[str]] = build_alignment_command,
    popen_factory: Callable[..., Any] = subprocess.Popen,
    result_validator: Callable[..., Mapping[str, Any]] = _validate_result,
    poll_interval_seconds: float = 0.05,
) -> dict[str, Any]:
    root = Path(repo_root or Path(__file__).resolve().parent.parent).resolve()
    home_root = Path(home or Path.home()).expanduser().resolve()
    plan = plan_loader(repo_root=root)
    PROTOCOL.validate_alignment_plan(plan)
    expected_slots = PROTOCOL.expected_slots()
    if plan["slots"] != expected_slots:
        raise ValueError("constrained-alignment runner received a non-exact grid")
    if plan["boundary"] != PROTOCOL.ALIGNMENT_BOUNDARY:
        raise ValueError("constrained-alignment runner received extra authority")
    python_path = home_root / TRAINING_PYTHON_RELATIVE_HOME
    trainer_path = root / "ml" / "train_strength_first_qat_constrained_alignment_v2.py"
    if not python_path.is_file() or not trainer_path.is_file():
        raise ValueError("constrained-alignment runtime is absent")
    for slot in expected_slots:
        if os.path.lexists(root / slot["output"]):
            raise ValueError(
                "constrained-alignment output slot already exists; preserve it"
            )

    inherited = dict(os.environ)
    processes: list[tuple[int, Any]] = []
    try:
        for slot in expected_slots:
            command = command_builder(
                seed=slot["seed"],
                repo_root=str(root),
                home=str(home_root),
            )
            process = popen_factory(
                command,
                cwd=str(root),
                env={**inherited, **FIXED_PROCESS_ENVIRONMENT},
            )
            processes.append((slot["seed"], process))
    except BaseException:
        _stop_processes(processes)
        raise

    completed: dict[int, int] = {}
    try:
        while len(completed) < len(processes):
            progressed = False
            for seed, process in processes:
                if seed in completed:
                    continue
                returncode = process.poll()
                if returncode is None:
                    continue
                progressed = True
                completed[seed] = returncode
                if returncode != 0:
                    _stop_processes(
                        [
                            (other_seed, other)
                            for other_seed, other in processes
                            if other_seed not in completed
                        ]
                    )
                    raise AlignmentProcessFailed(seed, returncode)
            if len(completed) < len(processes) and not progressed:
                time.sleep(poll_interval_seconds)
    except BaseException:
        _stop_processes(processes)
        raise

    results = [result_validator(repo_root=root, slot=slot) for slot in expected_slots]
    return {
        "schema": (
            "shogi-floodgate-strength-first-constrained-alignment-"
            "three-seed-launch-v1"
        ),
        "status": "complete-three-concurrent-alignment-processes",
        "seeds": list(PROTOCOL.ALIGNMENT_SEEDS),
        "returncodes": {
            str(seed): completed[seed] for seed in PROTOCOL.ALIGNMENT_SEEDS
        },
        "result_schemas": [result["schema"] for result in results],
        "training_only": True,
        "replay_rows_read": 0,
        "selection_labels_read": False,
        "final_holdout_labels_read": False,
        "candidate_selected": False,
        "live_weights_changed": False,
    }


def main() -> int:
    if len(sys.argv) != 1:
        print("constrained-alignment launcher is argumentless", file=sys.stderr)
        return 2
    try:
        receipt = run_three_seed_alignment()
    except (OSError, RuntimeError, ValueError) as error:
        print(f"[constrained-alignment] STOP: {error}", file=sys.stderr)
        return 1
    print(json.dumps(receipt, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = [
    "AlignmentProcessFailed",
    "build_alignment_command",
    "run_three_seed_alignment",
]
