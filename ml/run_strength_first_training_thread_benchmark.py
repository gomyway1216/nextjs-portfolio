#!/usr/bin/env python3
"""Argumentless, synthetic CPU-thread benchmark for three-seed QAT training."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import random
import re
import subprocess
import sys
import time
from typing import Any, Mapping, Sequence


SCHEMA = "shogi-strength-first-training-thread-benchmark-v1"
WORKER_SCHEMA = "shogi-strength-first-training-thread-benchmark-worker-v1"
STATUS = "complete-synthetic-training-only"
WORKER_STATUS = "complete-synthetic-compute-only"
ORDER = (2, 4, 4, 2)
SEEDS = (42, 43, 44)
BATCH_COUNT = 12
BATCH_ROWS = 256
MINIMUM_SPEEDUP_PPM = 1_050_000
PRIVATE_REQUEST_ENV = "SHOGI_STRENGTH_FIRST_THREAD_BENCHMARK_PRIVATE_REQUEST"
OUTPUT_DIRECTORY = "floodgate-q1-2026-strength-first-training-thread-benchmark-v1"
SOURCE_FILES = (
    "ml/run_strength_first_training_thread_benchmark.py",
    "ml/train.py",
    "ml/int16_forward.py",
)
REVISION_RE = re.compile(r"^[0-9a-f]{40}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
FIXED_GIT_ENV = {
    "PATH": "/usr/bin:/bin",
    "HOME": "/var/empty",
    "GIT_CONFIG_NOSYSTEM": "1",
    "GIT_CONFIG_GLOBAL": "/dev/null",
    "GIT_CONFIG_SYSTEM": "/dev/null",
    "GIT_OPTIONAL_LOCKS": "0",
    "GIT_TERMINAL_PROMPT": "0",
    "LC_ALL": "C",
    "LANG": "C",
}


class BenchmarkStop(RuntimeError):
    """The benchmark cannot safely publish a thread selection."""


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=True,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _sha256_file(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    return {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}


def _implementation_identities(repo_root: Path) -> dict[str, dict[str, Any]]:
    return {name: _sha256_file(repo_root / name) for name in SOURCE_FILES}


def _capture_clean_revision(
    repo_root: Path,
    runner: Any = subprocess.run,
) -> str:
    prefix = [
        "/usr/bin/git",
        "--no-replace-objects",
        "--no-optional-locks",
        "-c",
        "core.fsmonitor=false",
        "-c",
        "core.untrackedCache=false",
        "-c",
        "core.preloadIndex=false",
    ]
    try:
        status = runner(
            [*prefix, "status", "--porcelain=v1", "-z", "--untracked-files=all"],
            cwd=repo_root,
            env=dict(FIXED_GIT_ENV),
            check=True,
            capture_output=True,
        )
        revision = runner(
            [*prefix, "rev-parse", "--verify", "HEAD^{commit}"],
            cwd=repo_root,
            env=dict(FIXED_GIT_ENV),
            check=True,
            capture_output=True,
        )
    except (OSError, subprocess.CalledProcessError) as error:
        raise BenchmarkStop("cannot authenticate the clean Git revision") from error
    if status.stdout != b"":
        raise BenchmarkStop("repository is not exactly clean")
    raw = revision.stdout
    if (
        type(raw) is not bytes
        or len(raw) != 41
        or raw[-1:] != b"\n"
        or not REVISION_RE.fullmatch(raw[:40].decode("ascii", "ignore"))
    ):
        raise BenchmarkStop("Git revision is not canonical")
    return raw[:40].decode("ascii")


def _write_json_exclusive(path: Path, value: Mapping[str, Any]) -> None:
    data = (_canonical_json(value) + "\n").encode("ascii")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        try:
            os.close(descriptor)
        except OSError:
            pass
        raise


def _worker_paths(trial_root: Path, seed: int) -> dict[str, str]:
    return {
        "ready": str(trial_root / f"ready-{seed}"),
        "release": str(trial_root / "release"),
        "result": str(trial_root / f"result-{seed}.json"),
    }


def _worker_request(
    *,
    repo_root: Path,
    trial_root: Path,
    revision: str,
    implementations: Mapping[str, Mapping[str, Any]],
    ordinal: int,
    threads: int,
    seed: int,
) -> dict[str, Any]:
    return {
        "schema": WORKER_SCHEMA,
        "revision": revision,
        "implementations": implementations,
        "ordinal": ordinal,
        "threads": threads,
        "seed": seed,
        "repo_root": str(repo_root),
        **_worker_paths(trial_root, seed),
    }


def _stop_processes(processes: Sequence[Any]) -> None:
    for process in processes:
        try:
            if process.poll() is None:
                process.terminate()
        except (OSError, ProcessLookupError):
            pass
    for process in processes:
        try:
            process.wait(timeout=5)
        except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
            try:
                process.kill()
                process.wait(timeout=5)
            except (OSError, ProcessLookupError, subprocess.TimeoutExpired):
                pass


def _validate_worker_result(
    value: Any,
    request: Mapping[str, Any],
) -> dict[str, Any]:
    expected_keys = {
        "schema",
        "status",
        "revision",
        "implementations",
        "ordinal",
        "threads",
        "seed",
        "batch_count",
        "batch_rows",
        "compute_ns",
        "model_tensor_sha256",
        "probe_output_sha256",
        "training_only",
        "selection_labels_read",
        "holdout_labels_read",
        "live_weights_changed",
        "torch_version",
    }
    if type(value) is not dict or set(value) != expected_keys:
        raise BenchmarkStop("private worker result shape drifted")
    if (
        value["schema"] != WORKER_SCHEMA
        or value["status"] != WORKER_STATUS
        or value["revision"] != request["revision"]
        or value["implementations"] != request["implementations"]
        or value["ordinal"] != request["ordinal"]
        or value["threads"] != request["threads"]
        or value["seed"] != request["seed"]
        or value["batch_count"] != BATCH_COUNT
        or value["batch_rows"] != BATCH_ROWS
        or type(value["compute_ns"]) is not int
        or value["compute_ns"] <= 0
        or type(value["model_tensor_sha256"]) is not str
        or not SHA256_RE.fullmatch(value["model_tensor_sha256"])
        or type(value["probe_output_sha256"]) is not str
        or not SHA256_RE.fullmatch(value["probe_output_sha256"])
        or value["training_only"] is not True
        or value["selection_labels_read"] is not False
        or value["holdout_labels_read"] is not False
        or value["live_weights_changed"] is not False
        or type(value["torch_version"]) is not str
        or not value["torch_version"]
    ):
        raise BenchmarkStop("private worker result contract drifted")
    return value


def _run_trial(
    *,
    python: Path,
    repo_root: Path,
    run_root: Path,
    revision: str,
    implementations: Mapping[str, Mapping[str, Any]],
    ordinal: int,
    threads: int,
    popen_factory: Any = subprocess.Popen,
    timeout_seconds: float = 1800.0,
    poll_seconds: float = 0.01,
) -> dict[str, Any]:
    if ORDER[ordinal - 1] != threads:
        raise BenchmarkStop("ABBA trial order drifted")
    trial_root = run_root / f"trial-{ordinal}"
    trial_root.mkdir(mode=0o700)
    requests = [
        _worker_request(
            repo_root=repo_root,
            trial_root=trial_root,
            revision=revision,
            implementations=implementations,
            ordinal=ordinal,
            threads=threads,
            seed=seed,
        )
        for seed in SEEDS
    ]
    processes = []
    try:
        for request in requests:
            environment = dict(os.environ)
            environment.update(
                {
                    PRIVATE_REQUEST_ENV: _canonical_json(request),
                    "PYTHONHASHSEED": "0",
                    "OMP_NUM_THREADS": str(threads),
                    "MKL_NUM_THREADS": str(threads),
                    "OPENBLAS_NUM_THREADS": str(threads),
                    "VECLIB_MAXIMUM_THREADS": str(threads),
                    "OMP_DYNAMIC": "FALSE",
                    "MKL_DYNAMIC": "FALSE",
                }
            )
            processes.append(
                popen_factory(
                    [str(python), str(repo_root / SOURCE_FILES[0])],
                    cwd=repo_root,
                    env=environment,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.PIPE,
                )
            )
        deadline = time.monotonic() + timeout_seconds
        ready = [Path(request["ready"]) for request in requests]
        while not all(path.is_file() for path in ready):
            for process in processes:
                if process.poll() is not None:
                    raise BenchmarkStop("worker stopped before the shared barrier")
            if time.monotonic() >= deadline:
                raise BenchmarkStop("workers did not reach the shared barrier")
            time.sleep(poll_seconds)
        (trial_root / "release").touch(mode=0o600, exist_ok=False)
        while any(process.poll() is None for process in processes):
            if time.monotonic() >= deadline:
                raise BenchmarkStop("worker compute timed out")
            time.sleep(poll_seconds)
        if any(process.poll() != 0 for process in processes):
            raise BenchmarkStop("worker compute failed")
        workers = []
        for request in requests:
            try:
                raw = json.loads(Path(request["result"]).read_text("ascii"))
            except (OSError, UnicodeError, json.JSONDecodeError) as error:
                raise BenchmarkStop("private worker result is absent") from error
            workers.append(_validate_worker_result(raw, request))
    except BaseException:
        _stop_processes(processes)
        raise
    return {
        "ordinal": ordinal,
        "threads_per_seed": threads,
        "concurrent_seeds": list(SEEDS),
        "compute_ns": max(worker["compute_ns"] for worker in workers),
        "workers": workers,
    }


def _speedup_ppm(elapsed_two: int, elapsed_four: int) -> int:
    if (
        type(elapsed_two) is not int
        or type(elapsed_four) is not int
        or elapsed_two <= 0
        or elapsed_four <= 0
    ):
        raise BenchmarkStop("trial compute time is invalid")
    return round(elapsed_two * 1_000_000 / elapsed_four)


def _canonical_outputs(trial: Mapping[str, Any]) -> dict[int, tuple[str, str]]:
    workers = trial.get("workers")
    if type(workers) is not list or len(workers) != len(SEEDS):
        raise BenchmarkStop("trial worker grid drifted")
    outputs = {}
    for worker in workers:
        if type(worker) is not dict or worker.get("seed") not in SEEDS:
            raise BenchmarkStop("trial worker seed drifted")
        seed = worker["seed"]
        if seed in outputs:
            raise BenchmarkStop("trial worker seed was duplicated")
        outputs[seed] = (
            worker.get("model_tensor_sha256"),
            worker.get("probe_output_sha256"),
        )
    if set(outputs) != set(SEEDS):
        raise BenchmarkStop("trial worker seed grid is incomplete")
    return outputs


def _select_threads(trials: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    if (
        len(trials) != len(ORDER)
        or tuple(trial.get("threads_per_seed") for trial in trials) != ORDER
        or tuple(trial.get("ordinal") for trial in trials) != (1, 2, 3, 4)
    ):
        raise BenchmarkStop("ABBA result grid drifted")
    outputs = [_canonical_outputs(trial) for trial in trials]
    for seed in SEEDS:
        if outputs[0][seed] != outputs[3][seed]:
            raise BenchmarkStop(f"same-setting determinism failed for seed {seed} at 2 threads")
        if outputs[1][seed] != outputs[2][seed]:
            raise BenchmarkStop(f"same-setting determinism failed for seed {seed} at 4 threads")
        if outputs[0][seed] != outputs[1][seed]:
            raise BenchmarkStop(f"cross-setting canonical parity failed for seed {seed}")
    pair_speedups = [
        _speedup_ppm(trials[0]["compute_ns"], trials[1]["compute_ns"]),
        _speedup_ppm(trials[3]["compute_ns"], trials[2]["compute_ns"]),
    ]
    median_speedup = round(sum(pair_speedups) / 2)
    selected = (
        4
        if all(speedup > 1_000_000 for speedup in pair_speedups)
        and median_speedup >= MINIMUM_SPEEDUP_PPM
        else 2
    )
    return {
        "pair_speedups_ppm": pair_speedups,
        "median_speedup_ppm": median_speedup,
        "minimum_speedup_ppm": MINIMUM_SPEEDUP_PPM,
        "selected_threads_per_seed": selected,
    }


def _tensor_digest(named_tensors: Sequence[tuple[str, Any]]) -> str:
    digest = hashlib.sha256()
    for name, tensor in sorted(named_tensors, key=lambda item: item[0]):
        value = tensor.detach().cpu().contiguous().clone()
        metadata = _canonical_json(
            {"name": name, "dtype": str(value.dtype), "shape": list(value.shape)}
        ).encode("ascii")
        raw = bytes(value.untyped_storage())
        digest.update(len(metadata).to_bytes(8, "big"))
        digest.update(metadata)
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
    return digest.hexdigest()


def _run_private_worker(request: Mapping[str, Any]) -> None:
    repo_root = Path(__file__).resolve().parents[1]
    expected_keys = {
        "schema",
        "revision",
        "implementations",
        "ordinal",
        "threads",
        "seed",
        "repo_root",
        "ready",
        "release",
        "result",
    }
    if (
        type(request) is not dict
        or set(request) != expected_keys
        or request.get("schema") != WORKER_SCHEMA
        or request.get("repo_root") != str(repo_root)
        or request.get("threads") not in (2, 4)
        or request.get("seed") not in SEEDS
        or type(request.get("ordinal")) is not int
        or not 1 <= request["ordinal"] <= len(ORDER)
        or ORDER[request["ordinal"] - 1] != request["threads"]
        or not REVISION_RE.fullmatch(str(request.get("revision", "")))
    ):
        raise BenchmarkStop("private worker request drifted")
    if _capture_clean_revision(repo_root) != request["revision"]:
        raise BenchmarkStop("private worker revision drifted")
    if _implementation_identities(repo_root) != request["implementations"]:
        raise BenchmarkStop("private worker implementation drifted")

    import torch
    import train

    threads = request["threads"]
    seed = request["seed"]
    torch.set_num_threads(threads)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    torch.set_deterministic_debug_mode("error")

    row = torch.arange(BATCH_ROWS, dtype=torch.int64).unsqueeze(1)
    slot = torch.arange(train.MAX_PIECES, dtype=torch.int64).unsqueeze(0)
    board = (row * 41 + slot * 97 + 17) % train.BOARD_FEATS
    replay_board = (board * 13 + 29) % train.BOARD_FEATS
    hand_slot = torch.arange(train.HAND_FEATS, dtype=torch.int64).unsqueeze(0)
    hands = ((row + hand_slot * 3) % 5).to(torch.float32)
    replay_hands = ((row * 2 + hand_slot) % 5).to(torch.float32)
    bucket = torch.zeros(BATCH_ROWS, dtype=torch.int64)
    child_cp = torch.tensor((-300.0, -100.0, 100.0, 300.0)).repeat(
        BATCH_ROWS // 4
    )
    targets = torch.sigmoid(child_cp / 600.0)
    replay_targets = torch.sigmoid(-child_cp / 600.0)
    group_sizes = (4,) * (BATCH_ROWS // 4)

    random.seed(seed)
    torch.manual_seed(seed)
    model = train.DistillNet(features="board").to("cpu")
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.0001)
    _write_json_exclusive(Path(request["ready"]), {"seed": seed})
    release = Path(request["release"])
    deadline = time.monotonic() + 300.0
    while not release.is_file():
        if time.monotonic() >= deadline:
            raise BenchmarkStop("private worker barrier timed out")
        time.sleep(0.005)

    started = time.perf_counter_ns()
    for _ in range(BATCH_COUNT):
        loss, _float_task, _ste_task = train.int16_aware_dual_task_loss(
            model,
            board,
            hands,
            bucket,
            targets,
            child_cp,
            group_sizes,
            k_sigmoid=600.0,
            rank_weight=1.0,
            rank_pair_min=50.0,
            rank_pair_max=600.0,
            rank_margin_cp=50.0,
            policy_weight=0.25,
            policy_temp_cp=200.0,
            replay_batch=(replay_board, replay_hands, bucket, replay_targets),
        )
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    compute_ns = time.perf_counter_ns() - started

    model.eval()
    with torch.no_grad():
        probe_float = model(board[:16], hands[:16], bucket[:16])
        probe_ste, probe_q = train.int16_forward_ste(
            model,
            board[:16],
            hands[:16],
            bucket[:16],
        )
    result = {
        "schema": WORKER_SCHEMA,
        "status": WORKER_STATUS,
        "revision": request["revision"],
        "implementations": request["implementations"],
        "ordinal": request["ordinal"],
        "threads": threads,
        "seed": seed,
        "batch_count": BATCH_COUNT,
        "batch_rows": BATCH_ROWS,
        "compute_ns": compute_ns,
        "model_tensor_sha256": _tensor_digest(list(model.state_dict().items())),
        "probe_output_sha256": _tensor_digest(
            [
                ("float", probe_float),
                ("ste", probe_ste),
                ("out_q", probe_q),
            ]
        ),
        "training_only": True,
        "selection_labels_read": False,
        "holdout_labels_read": False,
        "live_weights_changed": False,
        "torch_version": torch.__version__,
    }
    if (
        _capture_clean_revision(repo_root) != request["revision"]
        or _implementation_identities(repo_root) != request["implementations"]
    ):
        raise BenchmarkStop("private worker source changed during compute")
    _write_json_exclusive(Path(request["result"]), result)


def run_benchmark(
    *,
    repo_root: Path | None = None,
    home: Path | None = None,
    popen_factory: Any = subprocess.Popen,
) -> dict[str, Any]:
    repository = (
        Path(__file__).resolve().parents[1]
        if repo_root is None
        else Path(repo_root).resolve()
    )
    home_root = Path.home().resolve() if home is None else Path(home).resolve()
    python = (
        home_root
        / ".codex"
        / "shogi-data"
        / "floodgate-training-venv"
        / "bin"
        / "python3"
    )
    if not python.is_file() or not os.access(python, os.X_OK):
        raise BenchmarkStop("fixed training Python is unavailable")
    revision = _capture_clean_revision(repository)
    implementations = _implementation_identities(repository)
    parent = home_root / ".codex" / "shogi-runs"
    parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    run_root = parent / OUTPUT_DIRECTORY
    run_root.mkdir(mode=0o700)
    trials = [
        _run_trial(
            python=python,
            repo_root=repository,
            run_root=run_root,
            revision=revision,
            implementations=implementations,
            ordinal=ordinal,
            threads=threads,
            popen_factory=popen_factory,
        )
        for ordinal, threads in enumerate(ORDER, 1)
    ]
    decision = _select_threads(trials)
    if (
        _capture_clean_revision(repository) != revision
        or _implementation_identities(repository) != implementations
    ):
        raise BenchmarkStop("benchmark source changed during ABBA")
    receipt = {
        "schema": SCHEMA,
        "status": STATUS,
        "revision": revision,
        "implementations": implementations,
        "order": list(ORDER),
        "seeds": list(SEEDS),
        "batch_count": BATCH_COUNT,
        "batch_rows": BATCH_ROWS,
        "timing_scope": "loss-forward-backward-adamw-step-only",
        "trials": trials,
        "decision": decision,
        "synthetic_training_only": True,
        "teacher_or_plan_data_read": False,
        "selection_labels_read": False,
        "holdout_labels_read": False,
        "candidate_selected": False,
        "live_weights_changed": False,
    }
    _write_json_exclusive(run_root / "receipt.json", receipt)
    return receipt


def main() -> int:
    if len(sys.argv) != 1:
        print("[training-thread-benchmark] STOP: argumentless entry only", file=sys.stderr)
        return 2
    private = os.environ.get(PRIVATE_REQUEST_ENV)
    try:
        if private is not None:
            _run_private_worker(json.loads(private))
            return 0
        print(_canonical_json(run_benchmark()))
        return 0
    except (BenchmarkStop, OSError, UnicodeError, ValueError, json.JSONDecodeError) as error:
        print(f"[training-thread-benchmark] STOP: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())


__all__ = ["BenchmarkStop", "run_benchmark"]
