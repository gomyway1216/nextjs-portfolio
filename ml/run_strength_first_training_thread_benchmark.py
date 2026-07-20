#!/usr/bin/env python3
"""Argumentless, synthetic CPU-thread benchmark for three-seed QAT training."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import platform
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


def _runtime_snapshot(torch: Any, train: Any, threads: int) -> dict[str, Any]:
    actual_threads = torch.get_num_threads()
    interop_threads = torch.get_num_interop_threads()
    deterministic = torch.are_deterministic_algorithms_enabled()
    debug_mode = torch.get_deterministic_debug_mode()
    if (
        actual_threads != threads
        or interop_threads != 1
        or deterministic is not True
        or debug_mode != 2
    ):
        raise BenchmarkStop("verified Torch runtime settings drifted")
    system = platform.system()
    machine = platform.machine()
    processor = platform.processor()
    torch_module = Path(torch.__file__).resolve()
    torch_native_module = Path(torch._C.__file__).resolve()
    python_executable = Path(sys.executable).resolve()
    return {
        "platform": platform.platform(),
        "system": system,
        "machine": machine,
        "processor": processor,
        "cpu_model": train._runtime_cpu_model(system, processor, machine),
        "logical_cpu_count": os.cpu_count(),
        "python": {
            "implementation": platform.python_implementation(),
            "version": platform.python_version(),
            "executable": _sha256_file(python_executable),
        },
        "torch": {
            "version": str(torch.__version__),
            "module": _sha256_file(torch_module),
            "native_module": _sha256_file(torch_native_module),
        },
        "device": "cpu",
        "torch_threads": actual_threads,
        "torch_interop_threads": interop_threads,
        "deterministic_algorithms": deterministic,
        "deterministic_debug_mode": "error",
    }


def _validate_runtime(value: Any, threads: int) -> dict[str, Any]:
    if type(value) is not dict or set(value) != {
        "platform",
        "system",
        "machine",
        "processor",
        "cpu_model",
        "logical_cpu_count",
        "python",
        "torch",
        "device",
        "torch_threads",
        "torch_interop_threads",
        "deterministic_algorithms",
        "deterministic_debug_mode",
    }:
        raise BenchmarkStop("worker runtime shape drifted")
    python = value["python"]
    torch = value["torch"]
    identities = (
        python.get("executable") if type(python) is dict else None,
        torch.get("module") if type(torch) is dict else None,
        torch.get("native_module") if type(torch) is dict else None,
    )
    if (
        any(type(value[field]) is not str or not value[field] for field in (
            "platform",
            "system",
            "machine",
            "processor",
            "cpu_model",
        ))
        or type(value["logical_cpu_count"]) is not int
        or value["logical_cpu_count"] < 12
        or type(python) is not dict
        or set(python) != {"implementation", "version", "executable"}
        or type(python["implementation"]) is not str
        or not python["implementation"]
        or type(python["version"]) is not str
        or not python["version"]
        or type(torch) is not dict
        or set(torch) != {"version", "module", "native_module"}
        or type(torch["version"]) is not str
        or not torch["version"]
        or any(
            type(identity) is not dict
            or set(identity) != {"bytes", "sha256"}
            or type(identity["bytes"]) is not int
            or identity["bytes"] <= 0
            or type(identity["sha256"]) is not str
            or not SHA256_RE.fullmatch(identity["sha256"])
            for identity in identities
        )
        or value["device"] != "cpu"
        or value["torch_threads"] != threads
        or value["torch_interop_threads"] != 1
        or value["deterministic_algorithms"] is not True
        or value["deterministic_debug_mode"] != "error"
    ):
        raise BenchmarkStop("worker runtime contract drifted")
    return value


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
        "optimizer_state_sha256",
        "runtime_start",
        "runtime_end",
        "training_only",
        "selection_labels_read",
        "holdout_labels_read",
        "live_weights_changed",
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
        or type(value["optimizer_state_sha256"]) is not str
        or not SHA256_RE.fullmatch(value["optimizer_state_sha256"])
        or value["training_only"] is not True
        or value["selection_labels_read"] is not False
        or value["holdout_labels_read"] is not False
        or value["live_weights_changed"] is not False
    ):
        raise BenchmarkStop("private worker result contract drifted")
    runtime_start = _validate_runtime(value["runtime_start"], request["threads"])
    runtime_end = _validate_runtime(value["runtime_end"], request["threads"])
    if runtime_start != runtime_end:
        raise BenchmarkStop("private worker runtime changed during compute")
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
    worker_logs = []
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
            log_path = trial_root / f"worker-{request['seed']}.stderr.log"
            log_descriptor = os.open(
                log_path,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL,
                0o600,
            )
            worker_log = os.fdopen(log_descriptor, "wb")
            worker_logs.append(worker_log)
            processes.append(
                popen_factory(
                    [str(python), str(repo_root / SOURCE_FILES[0])],
                    cwd=repo_root,
                    env=environment,
                    stdout=subprocess.DEVNULL,
                    stderr=worker_log,
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
    finally:
        for worker_log in worker_logs:
            worker_log.close()
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
    return (
        elapsed_two * 1_000_000 + elapsed_four // 2
    ) // elapsed_four


def _canonical_outputs(
    trial: Mapping[str, Any],
) -> dict[int, tuple[str, str, str]]:
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
            worker.get("optimizer_state_sha256"),
        )
    if set(outputs) != set(SEEDS):
        raise BenchmarkStop("trial worker seed grid is incomplete")
    return outputs


def _validate_runtime_grid(trials: Sequence[Mapping[str, Any]]) -> None:
    baseline = None
    for trial in trials:
        threads = trial["threads_per_seed"]
        for worker in trial["workers"]:
            runtime_start = _validate_runtime(worker.get("runtime_start"), threads)
            runtime_end = _validate_runtime(worker.get("runtime_end"), threads)
            if runtime_start != runtime_end:
                raise BenchmarkStop("worker runtime changed during compute")
            normalized = dict(runtime_start)
            normalized["torch_threads"] = 0
            if baseline is None:
                baseline = normalized
            elif normalized != baseline:
                raise BenchmarkStop("worker runtime identity differs across ABBA")


def _select_threads(trials: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    if (
        len(trials) != len(ORDER)
        or tuple(trial.get("threads_per_seed") for trial in trials) != ORDER
        or tuple(trial.get("ordinal") for trial in trials) != (1, 2, 3, 4)
    ):
        raise BenchmarkStop("ABBA result grid drifted")
    _validate_runtime_grid(trials)
    outputs = [_canonical_outputs(trial) for trial in trials]
    for seed in SEEDS:
        if outputs[0][seed] != outputs[3][seed]:
            raise BenchmarkStop(f"same-setting determinism failed for seed {seed} at 2 threads")
        if outputs[1][seed] != outputs[2][seed]:
            raise BenchmarkStop(f"same-setting determinism failed for seed {seed} at 4 threads")
        if outputs[0][seed] != outputs[1][seed]:
            raise BenchmarkStop(f"cross-setting canonical parity failed for seed {seed}")
    elapsed_two_first = trials[0]["compute_ns"]
    elapsed_four_first = trials[1]["compute_ns"]
    elapsed_four_second = trials[2]["compute_ns"]
    elapsed_two_second = trials[3]["compute_ns"]
    pair_speedups = [
        _speedup_ppm(elapsed_two_first, elapsed_four_first),
        _speedup_ppm(elapsed_two_second, elapsed_four_second),
    ]
    median_numerator = (
        elapsed_two_first * elapsed_four_second
        + elapsed_two_second * elapsed_four_first
    )
    median_denominator = 2 * elapsed_four_first * elapsed_four_second
    median_speedup = (
        median_numerator * 1_000_000 + median_denominator // 2
    ) // median_denominator
    strict_pairs = [
        elapsed_two_first > elapsed_four_first,
        elapsed_two_second > elapsed_four_second,
    ]
    median_gate = (
        median_numerator * 1_000_000
        >= MINIMUM_SPEEDUP_PPM * median_denominator
    )
    selected = (
        4
        if all(strict_pairs) and median_gate
        else 2
    )
    return {
        "pair_speedups_ppm": pair_speedups,
        "pair_strictly_faster": strict_pairs,
        "median_speedup_ppm": median_speedup,
        "median_speedup_gate_passed": median_gate,
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
        raw = value.numpy().tobytes(order="C")
        digest.update(len(metadata).to_bytes(8, "big"))
        digest.update(metadata)
        digest.update(len(raw).to_bytes(8, "big"))
        digest.update(raw)
    return digest.hexdigest()


def _optimizer_digest(torch: Any, optimizer: Any) -> str:
    state_dict = optimizer.state_dict()
    tensor_values = []
    scalar_state = {}
    for parameter_id, values in sorted(state_dict["state"].items()):
        scalar_values = {}
        for name, value in sorted(values.items()):
            if isinstance(value, torch.Tensor):
                if value.is_floating_point() and not bool(
                    torch.isfinite(value).all().item()
                ):
                    raise BenchmarkStop("AdamW state contains a non-finite tensor")
                tensor_name = f"state/{parameter_id}/{name}"
                tensor_values.append((tensor_name, value))
                scalar_values[name] = {"tensor": tensor_name}
            else:
                scalar_values[name] = value
        scalar_state[str(parameter_id)] = scalar_values
    metadata = _canonical_json(
        {
            "state": scalar_state,
            "param_groups": state_dict["param_groups"],
        }
    ).encode("ascii")
    digest = hashlib.sha256()
    digest.update(len(metadata).to_bytes(8, "big"))
    digest.update(metadata)
    digest.update(bytes.fromhex(_tensor_digest(tensor_values)))
    return digest.hexdigest()


def _require_finite_values(torch: Any, values: Sequence[Any], label: str) -> None:
    if not all(
        bool(torch.isfinite(value).all().item())
        for value in values
    ):
        raise BenchmarkStop(f"{label} contains a non-finite value")


def _require_finite_model(train: Any, model: Any) -> None:
    try:
        train.require_finite_model_parameters(model, "thread benchmark final")
    except ValueError as error:
        raise BenchmarkStop("final model contains a non-finite parameter") from error


def _require_integer_probe(torch: Any, probe_q: Any) -> None:
    if probe_q.dtype != torch.int64 or probe_q.requires_grad:
        raise BenchmarkStop("fixed probe integer output drifted")


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
    runtime_start = _runtime_snapshot(torch, train, threads)

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
        loss, float_task, ste_task = train.int16_aware_dual_task_loss(
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
        _require_finite_values(
            torch,
            (loss, float_task, ste_task),
            "training task",
        )
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()
    compute_ns = time.perf_counter_ns() - started

    _require_finite_model(train, model)
    model.eval()
    with torch.no_grad():
        probe_float = model(board[:16], hands[:16], bucket[:16])
        probe_ste, probe_q = train.int16_forward_ste(
            model,
            board[:16],
            hands[:16],
            bucket[:16],
        )
    _require_finite_values(
        torch,
        (probe_float, probe_ste),
        "fixed probe output",
    )
    _require_integer_probe(torch, probe_q)
    optimizer_state_sha256 = _optimizer_digest(torch, optimizer)
    runtime_end = _runtime_snapshot(torch, train, threads)
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
        "optimizer_state_sha256": optimizer_state_sha256,
        "runtime_start": runtime_start,
        "runtime_end": runtime_end,
        "training_only": True,
        "selection_labels_read": False,
        "holdout_labels_read": False,
        "live_weights_changed": False,
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
